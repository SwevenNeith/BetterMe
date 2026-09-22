import {
  listReadingBooks,
  linkReadingBookToOpenLibrary,
} from '../lecture/readingBooks.js'
import { getOpenLibraryWork, searchOpenLibrary } from './openLibrary.js'
import {
  isExactOpenLibraryMatch,
  stripLeadingArticles,
} from '../../utils/bibliotheque/openLibraryMatch.js'
import { readingTagsNeedOpenLibrarySubjects } from '../../utils/bibliotheque/openLibrarySubjects.js'

/**
 * Sujets d’un work : d’abord ceux du doc search, sinon fiche work.
 * @param {string} workKey
 * @param {string[]|null|undefined} subjectsFromDoc
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function resolveSubjectsForWork(workKey, subjectsFromDoc, options = {}) {
  if (Array.isArray(subjectsFromDoc) && subjectsFromDoc.length) return subjectsFromDoc
  try {
    const work = await getOpenLibraryWork(workKey, { signal: options.signal })
    return Array.isArray(work?.subjects) ? work.subjects : []
  } catch {
    return []
  }
}

/**
 * Trouve le doc Open Library exact pour un livre Lecture (titre + auteur séparés).
 * Essaie d’abord title+author, puis titre sans article, puis titre seul (auteur validé côté client).
 * @param {{ title?: string, author?: string }} book
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function findExactOpenLibraryMatchForBook(book, options = {}) {
  const title = String(book?.title ?? '').trim()
  const author = String(book?.author ?? '').trim()
  if (!title) return null

  const bareTitle = stripLeadingArticles(title)
  /** @type {Array<{ title: string, author?: string }>} */
  const attempts = []

  if (author) {
    attempts.push({ title, author })
    if (bareTitle && bareTitle !== title) attempts.push({ title: bareTitle, author })
  }
  attempts.push({ title })
  if (bareTitle && bareTitle !== title) attempts.push({ title: bareTitle })

  const seen = new Set()
  for (const attempt of attempts) {
    const key = `${attempt.title}\0${attempt.author || ''}`
    if (seen.has(key)) continue
    seen.add(key)

    const payload = await searchOpenLibrary('', {
      title: attempt.title,
      author: attempt.author || undefined,
      page: 1,
      limit: 20,
      signal: options.signal,
    })

    const match = payload.docs.find((doc) => isExactOpenLibraryMatch(book, doc))
    if (match) return match
  }

  return null
}

/**
 * Lie les livres Lecture non encore associés à Open Library,
 * et complète les sujets (genre / mots clés) des livres déjà liés s’ils sont vides.
 * Ne recrée aucun livre : UPDATE in-place uniquement (dates, spoils, collections inchangés).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   onProgress?: (info: { done: number, total: number, linked: number, skipped: number, subjectsUpdated?: number, currentTitle: string }) => void,
 *   signal?: AbortSignal,
 *   concurrency?: number,
 * }} [options]
 */
export async function syncLectureBooksWithOpenLibrary(supabase, userId, options = {}) {
  const books = await listReadingBooks(supabase, userId)
  const alreadyLinked = books.filter((book) => String(book.open_library_work_key || '').trim())
  const pending = books.filter((book) => !String(book.open_library_work_key || '').trim())
  const concurrency = Math.max(1, Math.min(4, Number(options.concurrency) || 3))

  let processed = 0
  let linked = 0
  let unmatched = 0
  let subjectsUpdated = 0
  let cursor = 0

  const totalWork = books.length

  function emit(currentTitle = '', doneOverride = null) {
    options.onProgress?.({
      done: doneOverride ?? alreadyLinked.length + processed,
      total: totalWork,
      linked: alreadyLinked.length + linked,
      skipped: unmatched,
      pending: pending.length,
      subjectsUpdated,
      currentTitle,
    })
  }

  emit('', 0)

  // 1) Complète les sujets manquants pour les livres déjà liés
  let subjectCursor = 0
  async function subjectsWorker() {
    while (subjectCursor < alreadyLinked.length) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const index = subjectCursor
      subjectCursor += 1
      const book = alreadyLinked[index]
      emit(book.title, index)

      try {
        const workKey = String(book.open_library_work_key || '').trim()
        if (!workKey) continue
        const subjects = await resolveSubjectsForWork(workKey, null, { signal: options.signal })
        if (!readingTagsNeedOpenLibrarySubjects(book.tags, subjects)) continue
        await linkReadingBookToOpenLibrary(supabase, userId, book.id, {
          workKey,
          subjects,
        })
        subjectsUpdated += 1
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        console.warn('Open Library subjects sync skipped for', book.title, err)
      }
    }
  }

  if (alreadyLinked.length) {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, alreadyLinked.length) }, () => subjectsWorker()),
    )
  }

  emit()

  // 2) Lie les livres encore sans work key
  async function worker() {
    while (cursor < pending.length) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const index = cursor
      cursor += 1
      const book = pending[index]
      emit(book.title, alreadyLinked.length + processed)

      try {
        const match = await findExactOpenLibraryMatchForBook(book, { signal: options.signal })
        if (match?.key) {
          const subjects = await resolveSubjectsForWork(match.key, match.subjects, {
            signal: options.signal,
          })
          await linkReadingBookToOpenLibrary(supabase, userId, book.id, {
            workKey: match.key,
            // Ne pas pousser la couverture OL : l’utilisateur choisit l’édition ensuite
            pages: match.pageCount,
            publicationYear: match.firstPublishYear,
            subjects,
          })
          linked += 1
        } else {
          unmatched += 1
        }
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        console.warn('Open Library sync skipped for', book.title, err)
        unmatched += 1
      } finally {
        processed += 1
        emit(book.title, alreadyLinked.length + processed)
      }
    }
  }

  if (pending.length) {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()),
    )
  }

  emit('', totalWork)

  return {
    total: books.length,
    pending: pending.length,
    linked,
    alreadyLinked: alreadyLinked.length,
    unmatched,
    subjectsUpdated,
  }
}

/**
 * Retrouve un livre Lecture déjà lié / correspondant à un doc Open Library.
 * @param {Array<object>} lectureBooks
 * @param {{ key?: string, title?: string, authors?: string[], authorLabel?: string }} olDoc
 */
export function findLectureBookForOpenLibraryDoc(lectureBooks, olDoc) {
  const list = Array.isArray(lectureBooks) ? lectureBooks : []
  const workKey = String(olDoc?.key || '').trim()

  if (workKey) {
    const byKey = list.find((book) => String(book.open_library_work_key || '').trim() === workKey)
    if (byKey) return byKey
  }

  return list.find((book) => isExactOpenLibraryMatch(book, olDoc)) || null
}
