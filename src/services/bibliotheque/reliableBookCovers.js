/**
 * Couvertures « sûres » pour la bibliothèque :
 * - jamais d’appel Google Books API (429)
 * - jamais covers.openlibrary.org / archive.org (timeouts)
 * - ISBN → URL image Google Books (CDN, sans quota API)
 * - ISBN résolus via Open Library search (1 à la fois, cache local)
 */

import {
  fetchOpenLibraryIsbnsForWork,
  normalizeIsbnList,
} from './openLibrary.js'

const ISBN_CACHE_KEY = 'betterme-ol-work-isbns-v1'
const ISBN_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 jours

/** @type {Map<string, Promise<string[]>>} */
const inflightIsbn = new Map()

let isbnChain = Promise.resolve()

function isFlakyCoverHost(url) {
  const value = String(url ?? '')
  return (
    /covers\.openlibrary\.org/i.test(value) ||
    /archive\.org\/download\//i.test(value) ||
    // ISBN CDN aveugle → 404 fréquents (préférer View API / imageLinks).
    /books\.google\.com\/books\/content\?[^#]*vid=ISBN/i.test(value)
  )
}

function readIsbnCache() {
  try {
    const raw = localStorage.getItem(ISBN_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeIsbnCache(map) {
  try {
    localStorage.setItem(ISBN_CACHE_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

function normalizeWorkKey(workKey) {
  const raw = String(workKey ?? '').trim()
  if (!raw || raw.startsWith('/google/')) return ''
  return raw.startsWith('/works/') ? raw : `/works/${raw.replace(/^\/+/, '')}`
}

/**
 * @param {string|null|undefined} workKey
 * @returns {string[]}
 */
export function getCachedIsbnsForWork(workKey) {
  const key = normalizeWorkKey(workKey)
  if (!key) return []
  const map = readIsbnCache()
  const entry = map[key]
  if (!entry || !Array.isArray(entry.isbns)) return []
  if (Date.now() - Number(entry.at || 0) > ISBN_CACHE_TTL_MS) return []
  return normalizeIsbnList(entry.isbns)
}

/**
 * Résout des ISBN pour un work OL (file globale = 1 requête à la fois).
 * @param {string|null|undefined} workKey
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string[]>}
 */
export async function resolveIsbnsForWorkCached(workKey, opts = {}) {
  const key = normalizeWorkKey(workKey)
  if (!key) return []

  const cached = getCachedIsbnsForWork(key)
  if (cached.length) return cached

  if (inflightIsbn.has(key)) return inflightIsbn.get(key)

  const job = isbnChain.then(async () => {
    const again = getCachedIsbnsForWork(key)
    if (again.length) return again

    const isbns = await fetchOpenLibraryIsbnsForWork(key, { signal: opts.signal })
    const map = readIsbnCache()
    map[key] = { isbns, at: Date.now() }
    writeIsbnCache(map)
    return isbns
  })

  inflightIsbn.set(key, job)
  isbnChain = job.then(
    () => undefined,
    () => undefined,
  )

  try {
    return await job
  } finally {
    inflightIsbn.delete(key)
  }
}

/**
 * Liste d’URL de couverture fiables (pas d’hôtes qui timeout / pas d’API Google).
 * @param {{
 *   src?: string|null,
 *   candidates?: string[]|null,
 *   isbns?: string[]|null,
 *   isbn?: string|null,
 *   size?: 'S'|'M'|'L',
 * }} input
 * @returns {string[]}
 */
export function buildReliableCoverCandidates(input = {}) {
  void input.size
  /** @type {string[]} */
  const urls = []
  const push = (url) => {
    const value = String(url ?? '').trim()
    if (!value || isFlakyCoverHost(value)) return
    if (!urls.includes(value)) urls.push(value)
  }

  // Les ISBN ne génèrent plus d’URL content?vid=ISBN… ici (404).
  // OpenLibraryCoverImg résout via Google Books Dynamic Links.
  void input.isbns
  void input.isbn

  for (const url of input.candidates || []) push(url)
  push(input.src)

  return urls
}

/**
 * @param {string|null|undefined} url
 */
export function isReliableCoverUrl(url) {
  const value = String(url ?? '').trim()
  return Boolean(value) && !isFlakyCoverHost(value)
}

/**
 * @deprecated Les URL ISBN aveugles provoquent des 404 — utiliser resolveGoogleBooksThumbnailsByIsbns.
 * @param {string[]} _isbns
 * @param {'S'|'M'|'L'} [_size]
 */
export function googleCoverUrlsFromIsbns(_isbns, _size = 'M') {
  return []
}

export { isFlakyCoverHost }
