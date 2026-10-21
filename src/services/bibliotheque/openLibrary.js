import {
  enrichSeriesWithTitleHints,
  parseOpenLibrarySeries,
} from '../../utils/bibliotheque/openLibrarySeries.js'
import { normalizeOpenLibrarySubjects } from '../../utils/bibliotheque/openLibrarySubjects.js'

const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json'
const OPEN_LIBRARY_COVER_BASE = 'https://covers.openlibrary.org/b/id'

/** Seuil à partir duquel Open Library sert les couvertures via archive.org (items m_covers_*). */
const ARCHIVE_MODERN_COVER_MIN_ID = 8_000_000
const ARCHIVE_ITEM_SIZE = 1_000_000
const ARCHIVE_BATCH_SIZE = 10_000

const DEFAULT_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_name',
  'author_key',
  'first_publish_year',
  'cover_i',
  'edition_count',
  'language',
  'isbn',
  'publisher',
  'number_of_pages_median',
  'subject',
].join(',')

/**
 * @param {'S'|'M'|'L'|string|null|undefined} size
 * @returns {'S'|'M'|'L'}
 */
function normalizeCoverSize(size) {
  return size === 'S' || size === 'L' ? size : 'M'
}

/**
 * Couverture via archive.org (format moderne, id ≥ 8M).
 * @param {number} coverId
 * @param {'S'|'M'|'L'} size
 */
export function archiveOrgModernCoverUrl(coverId, size = 'M') {
  const id = Number(coverId)
  if (!Number.isFinite(id) || id < ARCHIVE_MODERN_COVER_MIN_ID) return null
  const safeSize = normalizeCoverSize(size)
  const sizeLower = safeSize.toLowerCase()
  const millions = Math.floor(id / ARCHIVE_ITEM_SIZE)
  const itemId = String(millions).padStart(4, '0')
  const rem = id - ARCHIVE_ITEM_SIZE * millions
  const batchId = String(Math.floor(rem / ARCHIVE_BATCH_SIZE)).padStart(2, '0')
  const padded = String(id).padStart(10, '0')
  const folder = `${sizeLower}_covers_${itemId}`
  const zip = `${folder}_${batchId}.zip`
  return `https://archive.org/download/${folder}/${zip}/${padded}-${safeSize}.jpg`
}

/**
 * Couverture via archive.org (lots olcovers*, historique Open Library).
 * @param {number} coverId
 * @param {'S'|'M'|'L'} size
 */
export function archiveOrgLegacyCoverUrl(coverId, size = 'M') {
  const id = Number(coverId)
  if (!Number.isFinite(id) || id <= 0) return null
  const safeSize = normalizeCoverSize(size)
  const itemIndex = Math.floor(id / 10_000)
  const itemId = `olcovers${itemIndex}`
  return `https://archive.org/download/${itemId}/${itemId}-${safeSize}.zip/${id}-${safeSize}.jpg`
}

/**
 * URL classique covers.openlibrary.org (souvent flaky / timeouts).
 * @param {number} coverId
 * @param {'S'|'M'|'L'} size
 */
export function classicOpenLibraryCoverUrl(coverId, size = 'M') {
  const id = Number(coverId)
  if (!Number.isFinite(id) || id <= 0) return null
  const safeSize = normalizeCoverSize(size)
  return `${OPEN_LIBRARY_COVER_BASE}/${id}-${safeSize}.jpg?default=false`
}

/**
 * Normalise une liste d’ISBN (chaîne ou tableau).
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
export function normalizeIsbnList(value) {
  const raw = Array.isArray(value) ? value : [value]
  /** @type {string[]} */
  const out = []
  for (const item of raw) {
    const clean = String(item ?? '').replace(/[^0-9Xx]/g, '')
    if (clean.length >= 10 && !out.includes(clean)) out.push(clean)
  }
  return out
}

/**
 * Couverture Google Books par ISBN (souvent la seule source joignable).
 * @param {string|null|undefined} isbn
 * @param {1|2} [zoom]
 */
export function googleBooksCoverByIsbn(isbn, zoom = 1) {
  const [clean] = normalizeIsbnList(isbn)
  if (!clean) return null
  const z = zoom === 2 ? 2 : 1
  return `https://books.google.com/books/content?vid=ISBN${clean}&printsec=frontcover&img=1&zoom=${z}`
}

/**
 * @param {string|string[]|null|undefined} isbns
 * @param {1|2} [zoom]
 * @returns {string[]}
 */
export function googleBooksCoverCandidates(isbns, zoom = 1) {
  return normalizeIsbnList(isbns)
    .slice(0, 6)
    .map((isbn) => googleBooksCoverByIsbn(isbn, zoom))
    .filter(Boolean)
}

/** Cache mémoire des ISBN résolus depuis un work Open Library. */
const workIsbnCache = new Map()

/**
 * Récupère des ISBN via l’API search Open Library (joignable même si covers.* timeout).
 * @param {string|null|undefined} workKey
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string[]>}
 */
export async function fetchOpenLibraryIsbnsForWork(workKey, opts = {}) {
  const raw = String(workKey ?? '').trim()
  if (!raw) return []
  const key = raw.startsWith('/works/') ? raw : `/works/${raw.replace(/^\/+/, '')}`
  if (workIsbnCache.has(key)) return workIsbnCache.get(key)

  try {
    const params = new URLSearchParams({
      q: `key:"${key}"`,
      fields: 'key,isbn',
      limit: '1',
    })
    const response = await fetch(`${OPEN_LIBRARY_SEARCH_URL}?${params}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    })
    if (!response.ok) {
      workIsbnCache.set(key, [])
      return []
    }
    const data = await response.json()
    const isbns = normalizeIsbnList(data?.docs?.[0]?.isbn)
    workIsbnCache.set(key, isbns)
    return isbns
  } catch {
    return []
  }
}

/**
 * Candidats de couverture.
 * Priorité : Google Books (ISBN) — archive.org / covers.openlibrary.org timeout souvent.
 * @param {number|string|null|undefined} coverId
 * @param {'S'|'M'|'L'} [size]
 * @param {{ isbn?: string|null, isbns?: string[]|null, includeFlakyHosts?: boolean }} [opts]
 * @returns {string[]}
 */
export function openLibraryCoverCandidates(coverId, size = 'M', opts = {}) {
  const id = Number(coverId)
  const safeSize = normalizeCoverSize(size)
  const zoom = safeSize === 'L' ? 2 : 1
  const includeFlaky = opts.includeFlakyHosts === true
  /** @type {string[]} */
  const urls = []
  const push = (url) => {
    if (url && !urls.includes(url)) urls.push(url)
  }

  const isbnList = [
    ...normalizeIsbnList(opts.isbns),
    ...normalizeIsbnList(opts.isbn),
  ]

  for (const url of googleBooksCoverCandidates(isbnList, zoom)) push(url)

  // Hôtes OL/IA souvent injoignables : seulement en secours explicite.
  if (includeFlaky && Number.isFinite(id) && id > 0) {
    push(archiveOrgModernCoverUrl(id, safeSize))
    push(archiveOrgLegacyCoverUrl(id, safeSize))
    push(classicOpenLibraryCoverUrl(id, safeSize))
  }

  return urls
}

/**
 * URL de couverture préférée (1er candidat fiable).
 * @param {number|string|null|undefined} coverId
 * @param {'S'|'M'|'L'} [size]
 * @param {{ isbn?: string|null, isbns?: string[]|null, includeFlakyHosts?: boolean }} [opts]
 */
export function openLibraryCoverUrl(coverId, size = 'M', opts = {}) {
  const candidates = openLibraryCoverCandidates(coverId, size, opts)
  if (candidates[0]) return candidates[0]
  // Dernier recours si aucun ISBN : URL OL classique (peut timeout côté client).
  return classicOpenLibraryCoverUrl(coverId, size)
}

/**
 * Construit les candidats d’affichage pour un livre Lecture déjà en base.
 * @param {{
 *   coverUrl?: string|null,
 *   cover_image_url?: string|null,
 *   open_library_cover_url?: string|null,
 *   cover_storage_path?: string|null,
 * }} book
 * @param {{ isbns?: string[] }} [opts]
 */
export function readingBookCoverCandidates(book, opts = {}) {
  /** @type {string[]} */
  const urls = []
  const push = (url) => {
    const value = String(url ?? '').trim()
    if (value && !urls.includes(value)) urls.push(value)
  }

  for (const url of googleBooksCoverCandidates(opts.isbns, 1)) push(url)

  const primary = String(book?.coverUrl ?? '').trim()
  const custom = String(book?.cover_image_url ?? '').trim()
  const ol = String(book?.open_library_cover_url ?? '').trim()

  // Couverture perso / signed URL d’abord si ce n’est pas un hôte OL/IA flaky
  const isFlakyHost = (url) =>
    /covers\.openlibrary\.org/i.test(url) || /archive\.org\/download\//i.test(url)

  if (primary && !isFlakyHost(primary)) push(primary)
  if (custom && !isFlakyHost(custom)) push(custom)

  for (const url of googleBooksCoverCandidates(opts.isbns, 1)) push(url)

  // OL/IA en dernier (timeout fréquent)
  if (primary) push(primary)
  if (ol) push(ol)
  if (custom) push(custom)

  return urls
}

/**
 * @param {object} doc
 */
export function normalizeOpenLibraryDoc(doc) {
  const authors = Array.isArray(doc?.author_name)
    ? doc.author_name.filter(Boolean)
    : []
  const languages = Array.isArray(doc?.language) ? doc.language.filter(Boolean) : []
  const isbns = Array.isArray(doc?.isbn) ? doc.isbn.filter(Boolean) : []
  const publishers = Array.isArray(doc?.publisher) ? doc.publisher.filter(Boolean) : []
  const subjects = Array.isArray(doc?.subject)
    ? normalizeOpenLibrarySubjects(doc.subject)
    : []

  const coverId = doc?.cover_i ?? null
  const isbn = isbns[0] || null
  const coverCandidates = openLibraryCoverCandidates(coverId, 'M', {
    isbn,
    isbns,
    includeFlakyHosts: true,
  })

  return {
    key: String(doc?.key || ''),
    title: String(doc?.title || '').trim() || 'Sans titre',
    subtitle: String(doc?.subtitle || '').trim(),
    authors,
    authorLabel: authors.length ? authors.join(', ') : 'Auteur inconnu',
    firstPublishYear: doc?.first_publish_year || null,
    coverId,
    coverUrl: coverCandidates[0] || openLibraryCoverUrl(coverId, 'M', { isbn, isbns }),
    coverCandidates,
    editionCount: Number(doc?.edition_count) || 0,
    languages,
    isbn,
    isbns,
    publisher: publishers[0] || null,
    pageCount: doc?.number_of_pages_median ?? null,
    subjects,
    openLibraryUrl: doc?.key ? `https://openlibrary.org${doc.key}` : null,
  }
}

/**
 * Recherche de livres via Open Library Search API.
 * Titre et auteur passent en paramètres dédiés (`title`, `author`) — pas collés dans `q`.
 * @see https://openlibrary.org/dev/docs/api/search
 * @param {string} query Requête libre (catalogue) ; laisser vide si title/author seuls.
 * @param {{
 *   page?: number,
 *   limit?: number,
 *   signal?: AbortSignal,
 *   title?: string|null,
 *   language?: string|null,
 *   sort?: string|null,
 *   yearFrom?: number|string|null,
 *   yearTo?: number|string|null,
 *   subject?: string|null,
 *   author?: string|null,
 *   hasFulltext?: boolean,
 *   ebookAccess?: string|null,
 * }} [options]
 */
export async function searchOpenLibrary(query, options = {}) {
  const qParts = []
  const base = String(query ?? '').trim()
  if (base) qParts.push(base)

  const subject = String(options.subject ?? '').trim()
  if (subject) qParts.push(`subject:(${subject})`)

  const yearFrom = Number.parseInt(String(options.yearFrom ?? ''), 10)
  const yearTo = Number.parseInt(String(options.yearTo ?? ''), 10)
  const hasYearFrom = Number.isFinite(yearFrom) && yearFrom > 0
  const hasYearTo = Number.isFinite(yearTo) && yearTo > 0
  if (hasYearFrom && hasYearTo) {
    qParts.push(`first_publish_year:[${Math.min(yearFrom, yearTo)} TO ${Math.max(yearFrom, yearTo)}]`)
  } else if (hasYearFrom) {
    qParts.push(`first_publish_year:[${yearFrom} TO *]`)
  } else if (hasYearTo) {
    qParts.push(`first_publish_year:[* TO ${yearTo}]`)
  }

  const title = String(options.title ?? '').trim()
  const author = String(options.author ?? '').trim()
  const language = String(options.language ?? '').trim()

  // FR+EN en une seule requête (évite un double fetch eng puis fre)
  if (language === 'eng_fre') {
    qParts.push('language:(eng OR fre)')
  }

  const q = qParts.join(' ').trim()

  if (!q && !title && !author && !subject) {
    throw new Error('Requête de recherche vide.')
  }

  const page = Math.max(1, Number(options.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 24))
  const sort = String(options.sort ?? '').trim()
  const ebookAccess = String(options.ebookAccess ?? '').trim()

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    fields: DEFAULT_FIELDS,
  })
  if (q) params.set('q', q)
  if (title) params.set('title', title)
  if (author) params.set('author', author)

  // Langue unique via paramètre dédié (hors eng_fre déjà injecté dans q)
  if (language && language !== 'any' && language !== 'eng_fre') {
    params.set('language', language)
  }

  if (sort) params.set('sort', sort)
  if (options.hasFulltext === true) params.set('has_fulltext', 'true')
  if (ebookAccess) params.set('ebook_access', ebookAccess)

  const url = `${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal: options.signal,
  })

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(`Open Library a renvoyé une erreur (${response.status}).`)
  }

  const docs = Array.isArray(data?.docs) ? data.docs.map(normalizeOpenLibraryDoc) : []
  const numFound = Number(data?.numFound ?? data?.num_found) || docs.length

  return {
    docs,
    numFound,
    page,
    limit,
    start: Number(data?.start) || (page - 1) * limit,
  }
}

function readDescription(raw) {
  if (!raw) return ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw?.value === 'string') return raw.value.trim()
  return ''
}

/**
 * Détails d’un work Open Library.
 * @param {string} workKey ex. /works/OL82563W ou OL82563W
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function getOpenLibraryWork(workKey, options = {}) {
  const raw = String(workKey ?? '').trim()
  if (!raw) throw new Error('Identifiant Open Library manquant.')

  const key = raw.startsWith('/works/') ? raw : `/works/${raw.replace(/^\/+/, '')}`
  const response = await fetch(`https://openlibrary.org${key}.json`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  })

  if (!response.ok) {
    throw new Error(`Impossible de charger la fiche Open Library (${response.status}).`)
  }

  const data = await response.json()
  const covers = Array.isArray(data?.covers) ? data.covers : []
  const coverId = covers.find((id) => Number(id) > 0) ?? null

  // Enrichit via search pour auteurs / pages / année plus fiables
  let searchDoc = null
  try {
    const search = await searchOpenLibrary(`key:"${key}"`, {
      page: 1,
      limit: 1,
      signal: options.signal,
    })
    searchDoc = search.docs[0] || null
  } catch {
    searchDoc = null
  }

  const authors = searchDoc?.authors?.length
    ? searchDoc.authors
    : []

  const series = enrichSeriesWithTitleHints(parseOpenLibrarySeries(data?.series), {
    title: data?.title || searchDoc?.title,
    subtitle: data?.subtitle || searchDoc?.subtitle,
  })

  return {
    key,
    title: String(data?.title || searchDoc?.title || '').trim() || 'Sans titre',
    subtitle: String(data?.subtitle || searchDoc?.subtitle || '').trim(),
    authors,
    authorLabel: authors.length
      ? authors.join(', ')
      : searchDoc?.authorLabel || 'Auteur inconnu',
    description: readDescription(data?.description) || 'Aucun résumé disponible.',
    subjects: normalizeOpenLibrarySubjects(
      Array.isArray(data?.subjects) && data.subjects.length
        ? data.subjects
        : Array.isArray(searchDoc?.subjects)
          ? searchDoc.subjects
          : [],
    ),
    firstPublishYear: searchDoc?.firstPublishYear || null,
    coverId: coverId || searchDoc?.coverId || null,
    coverUrl: openLibraryCoverUrl(coverId || searchDoc?.coverId, 'L', {
      isbn: searchDoc?.isbn || null,
      isbns: searchDoc?.isbns || null,
      includeFlakyHosts: true,
    }),
    coverCandidates: openLibraryCoverCandidates(coverId || searchDoc?.coverId, 'L', {
      isbn: searchDoc?.isbn || null,
      isbns: searchDoc?.isbns || null,
      includeFlakyHosts: true,
    }),
    coverIds: covers.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
    editionCount: searchDoc?.editionCount || 0,
    pageCount: searchDoc?.pageCount || null,
    isbn: searchDoc?.isbn || null,
    isbns: searchDoc?.isbns || (searchDoc?.isbn ? [searchDoc.isbn] : []),
    publisher: searchDoc?.publisher || null,
    isSaga: series.isSaga,
    sagaVolume: series.sagaVolume,
    seriesKey: series.seriesKey,
    seriesLabel: series.seriesLabel,
    openLibraryUrl: `https://openlibrary.org${key}`,
  }
}

/**
 * Récupère uniquement les infos série/tome d’un work (requête légère).
 * @param {string} workKey
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function getOpenLibraryWorkSeriesInfo(workKey, options = {}) {
  const raw = String(workKey ?? '').trim()
  if (!raw) {
    return enrichSeriesWithTitleHints(parseOpenLibrarySeries(null))
  }

  const key = raw.startsWith('/works/') ? raw : `/works/${raw.replace(/^\/+/, '')}`
  try {
    const response = await fetch(`https://openlibrary.org${key}.json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    })
    if (!response.ok) {
      return enrichSeriesWithTitleHints(parseOpenLibrarySeries(null))
    }
    const data = await response.json()
    return enrichSeriesWithTitleHints(parseOpenLibrarySeries(data?.series), {
      title: data?.title,
      subtitle: data?.subtitle,
    })
  } catch {
    return enrichSeriesWithTitleHints(parseOpenLibrarySeries(null))
  }
}

function languageLabel(raw) {
  if (!raw) return ''
  if (typeof raw === 'string') {
    const key = raw.replace(/^\/languages\//, '')
    return key || ''
  }
  if (typeof raw?.key === 'string') return raw.key.replace(/^\/languages\//, '')
  return ''
}

/**
 * @param {object} entry
 */
export function normalizeOpenLibraryEdition(entry) {
  const covers = Array.isArray(entry?.covers) ? entry.covers : []
  const coverId = covers.find((id) => Number(id) > 0) ?? null
  const publishers = Array.isArray(entry?.publishers) ? entry.publishers.filter(Boolean) : []
  const isbn13 = Array.isArray(entry?.isbn_13) ? entry.isbn_13.filter(Boolean) : []
  const isbn10 = Array.isArray(entry?.isbn_10) ? entry.isbn_10.filter(Boolean) : []
  const languages = Array.isArray(entry?.languages)
    ? entry.languages.map(languageLabel).filter(Boolean)
    : []

  return {
    key: String(entry?.key || ''),
    title: String(entry?.title || '').trim() || 'Sans titre',
    publishDate: String(entry?.publish_date || '').trim() || null,
    publishers,
    publisherLabel: publishers[0] || null,
    languages,
    languageLabel: languages[0] || null,
    pageCount: entry?.number_of_pages ?? null,
    isbn: isbn13[0] || isbn10[0] || null,
    isbns: [...isbn13, ...isbn10],
    coverId,
    coverUrl: openLibraryCoverUrl(coverId, 'M', {
      isbns: [...isbn13, ...isbn10],
      includeFlakyHosts: true,
    }),
    coverUrlLarge: openLibraryCoverUrl(coverId, 'L', {
      isbns: [...isbn13, ...isbn10],
      includeFlakyHosts: true,
    }),
    coverCandidates: openLibraryCoverCandidates(coverId, 'M', {
      isbns: [...isbn13, ...isbn10],
      includeFlakyHosts: true,
    }),
    openLibraryUrl: entry?.key ? `https://openlibrary.org${entry.key}` : null,
  }
}

/**
 * Liste les éditions d’un work Open Library (avec couvertures quand dispo).
 * @param {string} workKey
 * @param {{ signal?: AbortSignal, limit?: number }} [options]
 */
export async function listOpenLibraryEditions(workKey, options = {}) {
  const raw = String(workKey ?? '').trim()
  if (!raw) throw new Error('Identifiant Open Library manquant.')

  const key = raw.startsWith('/works/') ? raw : `/works/${raw.replace(/^\/+/, '')}`
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 40))

  const response = await fetch(
    `https://openlibrary.org${key}/editions.json?limit=${encodeURIComponent(String(limit))}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    },
  )

  if (!response.ok) {
    throw new Error(`Impossible de charger les éditions Open Library (${response.status}).`)
  }

  const data = await response.json()
  const entries = Array.isArray(data?.entries) ? data.entries : []
  return entries.map(normalizeOpenLibraryEdition)
}

/**
 * Options de couverture pour un work : couvertures du work + éditions distinctes.
 * @param {string} workKey
 * @param {{ signal?: AbortSignal, limit?: number }} [options]
 * @returns {Promise<Array<{
 *   id: string,
 *   coverId: number,
 *   coverUrl: string,
 *   coverUrlLarge: string,
 *   label: string,
 *   source: 'work'|'edition',
 *   editionKey?: string,
 * }>>}
 */
export async function listOpenLibraryCoverOptions(workKey, options = {}) {
  const raw = String(workKey ?? '').trim()
  if (!raw) throw new Error('Identifiant Open Library manquant.')

  const key = raw.startsWith('/works/') ? raw : `/works/${raw.replace(/^\/+/, '')}`
  const seen = new Set()
  /** @type {Array<{ id: string, coverId: number, coverUrl: string, coverUrlLarge: string, label: string, source: 'work'|'edition', editionKey?: string }>} */
  const optionsList = []

  function pushCover(coverId, label, source, editionKey, isbn = null) {
    const id = Number(coverId)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return
    const coverOpts = { isbn, includeFlakyHosts: true }
    const coverUrl = openLibraryCoverUrl(id, 'M', coverOpts)
    const coverUrlLarge = openLibraryCoverUrl(id, 'L', coverOpts)
    if (!coverUrl || !coverUrlLarge) return
    seen.add(id)
    optionsList.push({
      id: `${source}-${id}`,
      coverId: id,
      coverUrl,
      coverUrlLarge,
      coverCandidates: openLibraryCoverCandidates(id, 'M', coverOpts),
      label,
      source,
      editionKey,
    })
  }

  const [workRes, editions] = await Promise.all([
    fetch(`https://openlibrary.org${key}.json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }),
    listOpenLibraryEditions(key, options),
  ])

  if (workRes.ok) {
    const workData = await workRes.json()
    const covers = Array.isArray(workData?.covers) ? workData.covers : []
    covers.forEach((coverId, index) => {
      pushCover(coverId, index === 0 ? 'Couverture principale' : `Variante work #${index + 1}`, 'work')
    })
  }

  for (const edition of editions) {
    if (!edition.coverId) continue
    const bits = [
      edition.publisherLabel,
      edition.publishDate,
      edition.languageLabel ? String(edition.languageLabel).toUpperCase() : null,
    ].filter(Boolean)
    pushCover(
      edition.coverId,
      bits.length ? bits.join(' · ') : edition.title,
      'edition',
      edition.key,
      edition.isbn,
    )
  }

  return optionsList
}
