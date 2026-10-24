/**
 * Secours Google Books quand openlibrary.org / covers.* sont injoignables.
 */

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes'
const GOOGLE_VIEWAPI_URL = 'https://books.google.com/books'
const THUMB_CACHE_KEY = 'betterme-gbooks-isbn-thumbs-v1'
const THUMB_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30

/** @type {Map<string, string|null>} */
const coverByQueryCache = new Map()

/** @type {Map<string, string|null>} */
const isbnThumbMemory = new Map()

/** File d’attente pour limiter les appels API (évite quota / Failed to fetch). */
let coverQueue = Promise.resolve()
let coverInFlight = 0
const COVER_MAX_CONCURRENT = 2

/** File View API (JSONP) — 1 lot à la fois. */
let viewApiChain = Promise.resolve()

/**
 * @param {string|null|undefined} raw
 */
function cleanText(raw) {
  return String(raw ?? '').trim()
}

/**
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
function normalizeIsbnListLocal(value) {
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
 * @param {string|null|undefined} url
 */
export function upgradeGoogleBooksImageUrl(url, zoom = 1) {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  let next = raw.replace(/^http:/i, 'https:')
  next = next.replace(/&edge=curl/gi, '')
  if (zoom >= 2 && !/[?&]zoom=/i.test(next)) {
    next += (next.includes('?') ? '&' : '?') + 'zoom=2'
  } else if (zoom >= 2) {
    next = next.replace(/([?&]zoom=)\d+/i, `$1${zoom}`)
  }
  return next
}

/**
 * @param {object} item
 */
function normalizeGoogleBooksVolume(item) {
  const info = item?.volumeInfo || {}
  const title = cleanText(info.title) || 'Sans titre'
  const authors = Array.isArray(info.authors) ? info.authors.filter(Boolean) : []
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : []
  const isbns = identifiers
    .filter((row) => /isbn/i.test(String(row?.type || '')))
    .map((row) => String(row?.identifier || '').replace(/[^0-9Xx]/g, ''))
    .filter((isbn) => isbn.length >= 10)

  const imageLinks = info.imageLinks || {}
  // Uniquement les imageLinks (id volume) — pas content?vid=ISBN… (404 fréquent).
  const coverUrl = upgradeGoogleBooksImageUrl(
    imageLinks.thumbnail || imageLinks.smallThumbnail,
    1,
  )

  const coverUrlLarge =
    upgradeGoogleBooksImageUrl(
      imageLinks.large || imageLinks.medium || imageLinks.thumbnail || imageLinks.smallThumbnail,
      2,
    ) || coverUrl
  const yearMatch = String(info.publishedDate || '').match(/(\d{4})/)
  const volumeId = String(item?.id || '')

  return {
    key: volumeId ? `/google/${volumeId}` : `/google/${encodeURIComponent(title)}`,
    title,
    subtitle: cleanText(info.subtitle),
    authors,
    authorLabel: authors.length ? authors.join(', ') : 'Auteur inconnu',
    firstPublishYear: yearMatch ? Number(yearMatch[1]) : null,
    coverId: null,
    coverUrl,
    coverUrlLarge,
    coverCandidates: [coverUrlLarge, coverUrl].filter(Boolean),
    editionCount: 0,
    languages: info.language ? [info.language] : [],
    isbn: isbns[0] || null,
    isbns,
    publisher: cleanText(info.publisher) || null,
    pageCount: Number(info.pageCount) || null,
    subjects: Array.isArray(info.categories) ? info.categories.filter(Boolean) : [],
    openLibraryUrl: null,
    googleBooksId: volumeId || null,
    source: 'google',
  }
}

/**
 * Recherche Google Books (fallback catalogue).
 * @param {string} query
 * @param {{
 *   page?: number,
 *   limit?: number,
 *   signal?: AbortSignal,
 *   title?: string|null,
 *   author?: string|null,
 *   language?: string|null,
 * }} [options]
 */
export async function searchGoogleBooks(query, options = {}) {
  const title = cleanText(options.title)
  const author = cleanText(options.author)
  const base = cleanText(query)

  const qParts = []
  if (title) qParts.push(`intitle:${title}`)
  if (author) qParts.push(`inauthor:${author}`)
  if (base && !title && !author) qParts.push(base)
  else if (base && (title || author)) qParts.push(base)

  const q = qParts.join(' ').trim()
  if (!q) throw new Error('Requête de recherche vide.')

  const page = Math.max(1, Number(options.page) || 1)
  const limit = Math.min(40, Math.max(1, Number(options.limit) || 24))
  const startIndex = (page - 1) * limit

  const params = new URLSearchParams({
    q,
    startIndex: String(startIndex),
    maxResults: String(limit),
    printType: 'books',
    orderBy: 'relevance',
  })

  const language = cleanText(options.language)
  if (language && language !== 'any' && language !== 'eng_fre') {
    params.set('langRestrict', language === 'fre' ? 'fr' : language === 'eng' ? 'en' : language)
  }

  const response = await fetch(`${GOOGLE_BOOKS_API}?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  })

  if (!response.ok) {
    throw new Error(`Google Books a renvoyé une erreur (${response.status}).`)
  }

  const data = await response.json()
  const docs = Array.isArray(data?.items) ? data.items.map(normalizeGoogleBooksVolume) : []
  const numFound = Number(data?.totalItems) || docs.length

  return {
    docs,
    numFound,
    page,
    limit,
    start: startIndex,
    source: 'google',
  }
}

function enqueueCoverJob(job) {
  const run = async () => {
    while (coverInFlight >= COVER_MAX_CONCURRENT) {
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
    coverInFlight += 1
    try {
      return await job()
    } finally {
      coverInFlight -= 1
    }
  }
  const next = coverQueue.then(run, run)
  coverQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/**
 * Résout une URL de couverture Google Books par titre/auteur (avec cache + file limitée).
 * @param {{ title?: string|null, author?: string|null, signal?: AbortSignal }} input
 * @returns {Promise<string|null>}
 */
export async function resolveGoogleBooksCoverByTitle(input = {}) {
  const title = cleanText(input.title)
  const author = cleanText(input.author)
  if (title.length < 2) return null

  const cacheKey = `${title.toLowerCase()}::${author.toLowerCase()}`
  if (coverByQueryCache.has(cacheKey)) return coverByQueryCache.get(cacheKey)

  return enqueueCoverJob(async () => {
    if (coverByQueryCache.has(cacheKey)) return coverByQueryCache.get(cacheKey)

    const qParts = [`intitle:${title}`]
    if (author) qParts.push(`inauthor:${author}`)
    const params = new URLSearchParams({
      q: qParts.join(' '),
      maxResults: '1',
      printType: 'books',
      fields: 'items(id,volumeInfo/imageLinks,volumeInfo/industryIdentifiers)',
    })

    try {
      const response = await fetch(`${GOOGLE_BOOKS_API}?${params}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: input.signal,
      })
      if (!response.ok) {
        coverByQueryCache.set(cacheKey, null)
        return null
      }
      const data = await response.json()
      const item = data?.items?.[0]
      if (!item) {
        coverByQueryCache.set(cacheKey, null)
        return null
      }
      const normalized = normalizeGoogleBooksVolume(item)
      const url = normalized.coverUrl || null
      coverByQueryCache.set(cacheKey, url)
      return url
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      coverByQueryCache.set(cacheKey, null)
      return null
    }
  })
}

function readThumbCache() {
  try {
    const raw = localStorage.getItem(THUMB_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeThumbCache(map) {
  try {
    localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

function getCachedIsbnThumb(isbn) {
  if (isbnThumbMemory.has(isbn)) return isbnThumbMemory.get(isbn)
  const map = readThumbCache()
  const entry = map[isbn]
  if (!entry || typeof entry !== 'object') return undefined
  if (Date.now() - Number(entry.at || 0) > THUMB_CACHE_TTL_MS) return undefined
  const url = entry.url == null ? null : String(entry.url)
  isbnThumbMemory.set(isbn, url)
  return url
}

function setCachedIsbnThumb(isbn, url) {
  isbnThumbMemory.set(isbn, url)
  const map = readThumbCache()
  map[isbn] = { url, at: Date.now() }
  writeThumbCache(map)
}

/**
 * Dynamic Links View API (JSONP) — renvoie thumbnail_url seulement si Google a une couverture.
 * Évite les GET img ISBN → 404 dans la console.
 * @param {string[]} isbns
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string[]>} URLs https uniques
 */
export async function resolveGoogleBooksThumbnailsByIsbns(isbns, opts = {}) {
  const list = normalizeIsbnListLocal(isbns).slice(0, 8)
  if (!list.length) return []

  /** @type {string[]} */
  const found = []
  /** @type {string[]} */
  const missing = []

  for (const isbn of list) {
    const cached = getCachedIsbnThumb(isbn)
    if (cached === undefined) {
      missing.push(isbn)
    } else if (cached) {
      if (!found.includes(cached)) found.push(cached)
    }
  }

  if (!missing.length) return found
  if (opts.signal?.aborted) {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    throw err
  }

  const batchResult = await new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
    }

    if (opts.signal?.aborted) {
      onAbort()
      return
    }

    const cbName = `__gbsThumb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const script = document.createElement('script')
    let settled = false

    function cleanup() {
      opts.signal?.removeEventListener('abort', onAbort)
      try {
        delete window[cbName]
      } catch {
        window[cbName] = undefined
      }
      script.remove()
    }

    function finish(data) {
      if (settled) return
      settled = true
      cleanup()
      resolve(data && typeof data === 'object' ? data : {})
    }

    window[cbName] = finish
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    script.async = true
    script.src = `${GOOGLE_VIEWAPI_URL}?jscmd=viewapi&bibkeys=${encodeURIComponent(
      missing.map((isbn) => `ISBN:${isbn}`).join(','),
    )}&callback=${encodeURIComponent(cbName)}`
    script.onerror = () => finish({})

    // Timeout de secours si callback jamais appelé
    window.setTimeout(() => finish({}), 6000)
    document.head.appendChild(script)
  })

  for (const isbn of missing) {
    const row = batchResult[`ISBN:${isbn}`] || batchResult[isbn] || null
    const rawThumb = row?.thumbnail_url ? String(row.thumbnail_url).trim() : ''
    const thumb = rawThumb ? upgradeGoogleBooksImageUrl(rawThumb, 1) : null
    setCachedIsbnThumb(isbn, thumb)
    if (thumb && !found.includes(thumb)) found.push(thumb)
  }

  return found
}

/**
 * Version sérialisée (évite trop de scripts JSONP en parallèle sur une grille).
 * @param {string[]} isbns
 * @param {{ signal?: AbortSignal }} [opts]
 */
export function resolveGoogleBooksThumbnailsByIsbnsQueued(isbns, opts = {}) {
  const job = viewApiChain.then(() => resolveGoogleBooksThumbnailsByIsbns(isbns, opts))
  viewApiChain = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}
