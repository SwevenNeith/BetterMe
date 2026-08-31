import { READING_COLLECTION_EN_COURS } from '../services/readingCollections.js'

const READING_HABIT_KEYWORDS = [
  'lecture',
  'lectures',
  'lire',
  'livre',
  'livres',
  'reading',
  'read',
  'book',
  'books',
  'bouquin',
  'bouquins',
  'roman',
  'romans',
]

const READING_META_PREFIX = '<!-- betterme-reading-meta:'
const READING_META_SUFFIX = ' -->'
const READING_LINE_RE = /^(.+?)\s*:\s*(\d+)\s*-\s*(\d+)\s*$/
const READING_ENTRY_GLOBAL_RE = /(.+?)\s*:\s*(\d+)\s*-\s*(\d+)/g

/**
 * @param {string} text
 */
function normalizeReadingDetailText(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/(\d+)(?=[A-Za-zÀ-ÿ"«(])/g, '$1\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * @param {string} text
 * @returns {Array<{ title: string, startPage: number, endPage: number }>}
 */
function parseReadingEntriesFromText(text) {
  const normalized = normalizeReadingDetailText(text)
  if (!normalized) return []

  /** @type {Array<{ title: string, startPage: number, endPage: number }>} */
  const entries = []
  const re = new RegExp(READING_ENTRY_GLOBAL_RE.source, 'g')

  for (const match of normalized.matchAll(re)) {
    const title = match[1]?.trim()
    const startPage = Number.parseInt(match[2], 10)
    const endPage = Number.parseInt(match[3], 10)
    if (!title || !Number.isFinite(startPage) || !Number.isFinite(endPage)) continue
    if (endPage < startPage) continue
    entries.push({ title, startPage, endPage })
  }

  return entries
}

/**
 * @param {string} value
 */
export function normalizeReadingTitleKey(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/**
 * @param {{ nom?: string }|null|undefined} habit
 */
export function isReadingHabit(habit) {
  const name = normalizeReadingTitleKey(habit?.nom)
  if (!name) return false
  return READING_HABIT_KEYWORDS.some((keyword) => name.includes(keyword))
}

/**
 * @param {{ collection?: string|null }} book
 */
export function isBookInProgress(book) {
  return String(book?.collection ?? '').trim().toLowerCase() === READING_COLLECTION_EN_COURS.toLowerCase()
}

/**
 * @param {string} html
 */
export function htmlToPlainText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
}

/**
 * @param {string} html
 * @returns {Array<{ bookId?: string|null, title: string, startPage: number, endPage: number }>}
 */
export function decodeReadingMeta(html) {
  const raw = String(html ?? '')
  const start = raw.indexOf(READING_META_PREFIX)
  if (start < 0) return []
  const end = raw.indexOf(READING_META_SUFFIX, start)
  if (end < 0) return []
  const json = raw.slice(start + READING_META_PREFIX.length, end)
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => ({
        bookId: entry?.bookId ?? null,
        title: String(entry?.title ?? '').trim(),
        startPage: Number(entry?.startPage),
        endPage: Number(entry?.endPage),
      }))
      .filter((entry) => entry.title && Number.isFinite(entry.startPage) && Number.isFinite(entry.endPage))
  } catch {
    return []
  }
}

/**
 * @param {Array<{ bookId?: string|null, title: string, startPage: number, endPage: number }>} entries
 */
export function encodeReadingMeta(entries) {
  if (!entries?.length) return ''
  return `${READING_META_PREFIX}${JSON.stringify(entries)}${READING_META_SUFFIX}`
}

/**
 * @param {string} html
 * @returns {Array<{ title: string, startPage: number, endPage: number }>}
 */
export function parseReadingDetailLines(html) {
  const text = htmlToPlainText(html)
  return parseReadingEntriesFromText(text)
}

/**
 * @param {string} html
 */
export function splitReadingDetails(html) {
  const meta = decodeReadingMeta(html)
  const parsedLines = parseReadingDetailLines(html)
  const readingEntries = meta.length
    ? meta
    : parsedLines.map((entry) => ({ ...entry, bookId: null }))

  const readingLineSet = new Set(
    readingEntries.map((entry) => formatReadingLogLine(entry.title, entry.startPage, entry.endPage)),
  )

  const freeLines = htmlToPlainText(html)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (READING_LINE_RE.test(line)) return false
      return !parseReadingEntriesFromText(line).length
    })

  let freeHtml = String(html ?? '')
  const metaEnd = freeHtml.indexOf(READING_META_SUFFIX)
  if (metaEnd >= 0) {
    freeHtml = freeHtml.slice(metaEnd + READING_META_SUFFIX.length)
  }
  freeHtml = freeHtml.replace(/<p>\s*[^<]*:\s*\d+\s*-\s*\d+[^<]*<\/p>/gi, '')
  freeHtml = freeHtml.trim()

  if (!freeHtml && freeLines.length) {
    freeHtml = freeLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
  }

  return {
    readingEntries,
    freeHtml,
    readingLineSet,
  }
}

/**
 * @param {string} title
 * @param {number} startPage
 * @param {number} endPage
 */
export function formatReadingLogLine(title, startPage, endPage) {
  return `${String(title).trim()} : ${startPage} - ${endPage}`
}

/**
 * @param {Array<{ alias: string, book_id?: string, bookId?: string }>} aliases
 * @returns {Map<string, string>}
 */
export function buildReadingAliasIndex(aliases) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const row of aliases ?? []) {
    const key = normalizeReadingTitleKey(row.alias)
    const bookId = row.book_id ?? row.bookId
    if (key && bookId) map.set(key, bookId)
  }
  return map
}

/**
 * @param {string} title
 * @param {Array<{ id: string, title: string, author?: string }>} books
 * @param {Map<string, string>|null} [aliasIndex]
 */
export function matchBookByTitleExact(title, books, aliasIndex = null) {
  const key = normalizeReadingTitleKey(title)
  if (!key) return null

  const exact = books.find((book) => normalizeReadingTitleKey(book.title) === key) ?? null
  if (exact) return exact

  const bookId = aliasIndex?.get(key)
  if (!bookId) return null
  return books.find((book) => book.id === bookId) ?? null
}

/**
 * @param {string} title
 * @param {Array<{ id: string, title: string, author?: string }>} books
 * @param {Map<string, string>|null} [aliasIndex]
 */
export function matchBookByTitle(title, books, aliasIndex = null) {
  const exact = matchBookByTitleExact(title, books, aliasIndex)
  if (exact) return exact

  const key = normalizeReadingTitleKey(title)
  if (!key) return null

  return (
    books.find((book) => {
      const bookKey = normalizeReadingTitleKey(book.title)
      return bookKey && (key.includes(bookKey) || bookKey.includes(key))
    }) ?? null
  )
}

/**
 * @param {string|null|undefined} bookId
 * @param {string} title
 * @param {{ bookId?: string|null, title: string, startPage: number, endPage: number }} entry
 * @param {Map<string, string>|null} [aliasIndex]
 */
function entryMatchesBook(bookId, title, entry, aliasIndex = null) {
  if (bookId && entry.bookId) return entry.bookId === bookId

  const entryKey = normalizeReadingTitleKey(entry.title)
  const titleKey = normalizeReadingTitleKey(title)
  if (entryKey === titleKey) return true
  if (bookId && aliasIndex?.get(entryKey) === bookId) return true
  return false
}

/**
 * Dernière page connue pour un livre avant une date donnée (exclut ce jour et les suivants).
 * @param {Record<string, { details?: string|null, date_jour?: string }>} logsByDate
 * @param {string|null} bookId
 * @param {string} title
 * @param {string|null} [asOfDate] Date du jour édité (YYYY-MM-DD) : seuls les logs antérieurs comptent
 * @param {Map<string, string>|null} [aliasIndex]
 */
export function getLastReadingPosition(logsByDate, bookId, title, asOfDate = null, aliasIndex = null) {
  let lastEndPage = 0
  let lastDate = null

  const dates = Object.keys(logsByDate ?? {}).sort()
  for (const date of dates) {
    if (asOfDate && date >= asOfDate) continue
    const log = logsByDate[date]
    if (!log?.details) continue

    const { readingEntries } = splitReadingDetails(log.details)
    for (const entry of readingEntries) {
      if (!entryMatchesBook(bookId, title, entry, aliasIndex)) continue
      if (entry.endPage >= lastEndPage) {
        lastEndPage = entry.endPage
        lastDate = date
      }
    }
  }

  return { lastEndPage, lastDate }
}

/**
 * @param {number} lastEndPage
 * @param {number|null|undefined} endPage
 */
export function computePagesReadFromEndPage(lastEndPage, endPage) {
  const end = Number(endPage)
  if (!Number.isFinite(end) || end <= 0) return 0
  const start = Math.max(0, Number(lastEndPage) || 0)
  return Math.max(0, end - start)
}

/**
 * @param {number} lastEndPage
 * @param {number|null|undefined} pagesRead
 */
export function computeEndPageFromPagesRead(lastEndPage, pagesRead) {
  const pages = Number(pagesRead)
  if (!Number.isFinite(pages) || pages <= 0) return Math.max(0, Number(lastEndPage) || 0)
  const start = Math.max(0, Number(lastEndPage) || 0)
  return start + pages
}

/**
 * @param {Array<{ bookId?: string|null, title: string, startPage: number, endPage: number }>} entries
 */
export function sumPagesReadFromEntries(entries) {
  if (!entries?.length) return 0
  return entries.reduce((sum, entry) => {
    const pages = computePagesReadFromEndPage(entry.startPage, entry.endPage)
    return sum + Math.max(0, pages)
  }, 0)
}

/**
 * @param {{
 *   entries?: Array<{ bookId?: string|null, title: string, startPage: number, endPage: number }>,
 *   bookId?: string|null,
 *   title?: string,
 *   startPage?: number,
 *   endPage?: number,
 *   freeHtml?: string|null,
 * }} payload
 */
export function buildReadingDetailsHtml(payload) {
  const entries = Array.isArray(payload.entries)
    ? payload.entries
    : payload.title
      ? [
          {
            bookId: payload.bookId ?? null,
            title: String(payload.title).trim(),
            startPage: Number(payload.startPage),
            endPage: Number(payload.endPage),
          },
        ]
      : []

  const validEntries = entries.filter(
    (entry) =>
      entry.title &&
      Number.isFinite(entry.startPage) &&
      Number.isFinite(entry.endPage) &&
      entry.endPage > entry.startPage,
  )

  const free = String(payload.freeHtml ?? '').trim()
  if (!validEntries.length) return free || null

  const meta = encodeReadingMeta(validEntries)
  const lines = validEntries
    .map((entry) => {
      const line = formatReadingLogLine(entry.title, entry.startPage, entry.endPage)
      return `<p>${escapeHtml(line)}</p>`
    })
    .join('')

  if (free) return `${meta}${lines}${free}`
  return `${meta}${lines}`
}

/**
 * @param {Record<string, { details?: string|null }>} logsByDate
 * @param {Array<{ id: string, title: string, author?: string }>} books
 * @param {Map<string, string>|null} [aliasIndex]
 */
export function collectUnmatchedReadingTitles(logsByDate, books, aliasIndex = null) {
  const seen = new Set()
  /** @type {string[]} */
  const unmatched = []

  for (const log of Object.values(logsByDate ?? {})) {
    if (!log?.details) continue
    const { readingEntries } = splitReadingDetails(log.details)
    for (const entry of readingEntries) {
      const title = entry.title.trim()
      if (!title) continue
      const key = normalizeReadingTitleKey(title)
      if (seen.has(key)) continue
      seen.add(key)

      const matched =
        (entry.bookId && books.some((book) => book.id === entry.bookId)) ||
        Boolean(matchBookByTitleExact(title, books, aliasIndex))
      if (!matched) unmatched.push(title)
    }
  }

  return unmatched.sort((a, b) => a.localeCompare(b, 'fr'))
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
