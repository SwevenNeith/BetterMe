import { getBookExtraTags } from './readingBookForm.js'
import {
  READING_COLLECTION_EN_COURS,
  READING_COLLECTION_TERMINE,
} from '../services/readingCollections.js'

const BLOCKED_COLLECTIONS = new Set([
  READING_COLLECTION_EN_COURS.toLowerCase(),
  READING_COLLECTION_TERMINE.toLowerCase(),
])

export function isBlockedReadingCollection(collection) {
  const name = String(collection ?? '').trim().toLowerCase()
  return BLOCKED_COLLECTIONS.has(name)
}

/** Tags hors genre (1er tag), normalisés. */
export function getComparableReadingTags(book) {
  return getBookExtraTags(book).map((tag) => tag.trim().toLowerCase()).filter(Boolean)
}

function normalizeSeriesKey(book) {
  const title = String(book?.title ?? '').trim().toLowerCase()
  const author = String(book?.author ?? '').trim().toLowerCase()
  return `${title}\0${author}`
}

function getSagaVolume(book) {
  if (!book?.is_saga) return null
  const volume = Number(book.saga_volume)
  return Number.isFinite(volume) && volume >= 1 ? Math.floor(volume) : 1
}

/**
 * Retrouve le tome 1 d'une série (même titre + auteur).
 * @param {object} book
 * @param {object[]} books
 */
export function findSeriesVolumeOne(book, books) {
  if (!book?.is_saga) return null
  const seriesKey = normalizeSeriesKey(book)

  return (
    (books ?? []).find((candidate) => {
      if (!candidate?.is_saga) return false
      if (normalizeSeriesKey(candidate) !== seriesKey) return false
      return getSagaVolume(candidate) === 1
    }) ?? null
  )
}

/**
 * Si le livre tiré appartient à une série, privilégie le tome 1
 * lorsqu'il est encore disponible (hors « En cours » / « Terminé »).
 * @param {object | null} pickedBook
 * @param {object[]} books
 * @param {{ excludeIds?: Iterable<string> }} [opts]
 */
export function resolveSagaPickBook(pickedBook, books, opts = {}) {
  if (!pickedBook?.is_saga) return pickedBook

  const volumeOne = findSeriesVolumeOne(pickedBook, books)
  if (!volumeOne || volumeOne.id === pickedBook.id) return pickedBook
  if (isBlockedReadingCollection(volumeOne.collection)) return pickedBook

  const excludeIds = new Set(opts.excludeIds ?? [])
  if (excludeIds.has(volumeOne.id)) return pickedBook

  return volumeOne
}

/**
 * Livres éligibles pour « Choisir ma lecture ».
 * @param {object[]} books
 * @param {{
 *   excludeIds?: Iterable<string>,
 *   excludeTags?: Iterable<string>,
 *   allowSaga?: boolean,
 * }} [opts]
 */
export function getEligiblePickBooks(books, opts = {}) {
  const excludeIds = new Set(opts.excludeIds ?? [])
  const excludeTags = new Set(
    [...(opts.excludeTags ?? [])].map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
  )
  const allowSaga = opts.allowSaga !== false

  return (books ?? []).filter((book) => {
    if (!book?.id || excludeIds.has(book.id)) return false
    if (isBlockedReadingCollection(book.collection)) return false
    if (!allowSaga && Boolean(book.is_saga)) return false

    if (excludeTags.size) {
      const tags = getComparableReadingTags(book)
      if (tags.some((tag) => excludeTags.has(tag))) return false
    }
    return true
  })
}

export function pickRandomBook(books) {
  if (!books?.length) return null
  const index = Math.floor(Math.random() * books.length)
  return books[index] ?? null
}

/**
 * Propose un livre aléatoire en évitant collections bloquées, ids déjà vus,
 * et tags (hors genre) déjà rencontrés dans la session.
 */
export function pickNextReadingSuggestion(books, session = {}) {
  const shownIds = session.shownIds ?? []
  const seenTags = session.seenTags ?? []
  const allowSaga = session.allowSaga !== false

  let eligible = getEligiblePickBooks(books, {
    excludeIds: shownIds,
    excludeTags: seenTags,
    allowSaga,
  })

  // Si trop restrictif, on réessaie sans filtre tags mais toujours sans ids / collections bloquées
  if (!eligible.length && seenTags.length) {
    eligible = getEligiblePickBooks(books, { excludeIds: shownIds, allowSaga })
  }

  const picked = pickRandomBook(eligible)
  if (!picked) return null

  return resolveSagaPickBook(picked, books, { excludeIds: shownIds })
}

export function accumulateSeenTags(seenTags, book) {
  const next = new Set(
    [...(seenTags ?? [])].map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
  )
  for (const tag of getComparableReadingTags(book)) {
    next.add(tag)
  }
  return [...next]
}
