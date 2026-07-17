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

/**
 * Livres éligibles pour « Choisir ma lecture ».
 * @param {object[]} books
 * @param {{
 *   excludeIds?: Iterable<string>,
 *   excludeTags?: Iterable<string>,
 * }} [opts]
 */
export function getEligiblePickBooks(books, opts = {}) {
  const excludeIds = new Set(opts.excludeIds ?? [])
  const excludeTags = new Set(
    [...(opts.excludeTags ?? [])].map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
  )

  return (books ?? []).filter((book) => {
    if (!book?.id || excludeIds.has(book.id)) return false
    if (isBlockedReadingCollection(book.collection)) return false

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

  let eligible = getEligiblePickBooks(books, {
    excludeIds: shownIds,
    excludeTags: seenTags,
  })

  // Si trop restrictif, on réessaie sans filtre tags mais toujours sans ids / collections bloquées
  if (!eligible.length && seenTags.length) {
    eligible = getEligiblePickBooks(books, { excludeIds: shownIds })
  }

  return pickRandomBook(eligible)
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
