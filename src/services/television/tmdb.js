import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase.js'

const TMDB_FUNCTION_URL = `${supabaseUrl}/functions/v1/tmdb`
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
const SEARCH_LANGUAGES = ['en-US', 'fr-FR']

async function getTmdbHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? supabaseAnonKey
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  }
}

async function callTmdbFunction(payload) {
  const response = await fetch(TMDB_FUNCTION_URL, {
    method: 'POST',
    headers: await getTmdbHeaders(),
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const message = data?.error || data?.status_message || `Erreur TMDB (${response.status})`
    throw new Error(message)
  }

  return data
}

/**
 * URL d’affiche TMDB (pas besoin d’API key côté image).
 * @param {string | null | undefined} path
 * @param {'w185' | 'w342' | 'w500' | 'original'} [size]
 */
export function tmdbPosterUrl(path, size = 'w342') {
  const value = String(path ?? '').trim()
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `${TMDB_IMAGE_BASE}/${size}${value.startsWith('/') ? value : `/${value}`}`
}

export function tmdbBackdropUrl(path, size = 'w780') {
  const value = String(path ?? '').trim()
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `${TMDB_IMAGE_BASE}/${size}${value.startsWith('/') ? value : `/${value}`}`
}

/**
 * @param {string} query
 * @param {number} [page]
 * @param {'movie' | 'tv' | 'multi'} [type]
 * @param {string} [language]
 */
export async function searchTmdb(query, page = 1, type = 'multi', language = 'en-US') {
  const q = String(query ?? '').trim()
  if (!q) {
    throw new Error('Requête de recherche vide.')
  }

  const pageNum = Math.max(1, Number(page) || 1)
  const mediaType = type === 'movie' || type === 'tv' ? type : 'multi'
  const lang = SEARCH_LANGUAGES.includes(language) ? language : 'en-US'

  return callTmdbFunction({
    action: 'search',
    query: q,
    page: pageNum,
    mediaType,
    language: lang,
  })
}

/**
 * Détails film ou série (crédits + vidéos inclus).
 * @param {'movie' | 'tv'} type
 * @param {number|string} id
 * @param {string} [language]
 */
export async function getTmdbDetails(type, id, language = 'fr-FR') {
  const mediaType = type === 'tv' ? 'tv' : 'movie'
  const mediaId = Number.parseInt(String(id), 10)
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    throw new Error('Identifiant TMDB invalide.')
  }

  const lang = SEARCH_LANGUAGES.includes(language) ? language : 'fr-FR'
  const data = await callTmdbFunction({
    action: 'details',
    mediaType,
    id: mediaId,
    language: lang,
    append_to_response: 'credits,videos,watch/providers',
  })

  return {
    ...data,
    media_type: mediaType,
  }
}

/**
 * Charge la fiche en FR puis complète les champs vides avec la version EN.
 * @param {'movie' | 'tv'} type
 * @param {number|string} id
 */
export async function getTmdbDetailsBilingual(type, id) {
  const [fr, en] = await Promise.all([
    getTmdbDetails(type, id, 'fr-FR'),
    getTmdbDetails(type, id, 'en-US'),
  ])

  const pick = (frVal, enVal) => {
    const a = typeof frVal === 'string' ? frVal.trim() : frVal
    if (a) return frVal
    return enVal
  }

  return {
    ...en,
    ...fr,
    media_type: fr.media_type || en.media_type || type,
    title: pick(fr.title, en.title),
    name: pick(fr.name, en.name),
    overview: pick(fr.overview, en.overview),
    tagline: pick(fr.tagline, en.tagline),
    genres: Array.isArray(fr.genres) && fr.genres.length ? fr.genres : en.genres,
    credits: fr.credits?.cast?.length ? fr.credits : en.credits,
    videos: fr.videos?.results?.length ? fr.videos : en.videos,
    'watch/providers':
      fr['watch/providers']?.results || en['watch/providers']?.results
        ? fr['watch/providers'] || en['watch/providers']
        : fr['watch/providers'] || en['watch/providers'],
    _languages: { fr, en },
  }
}

/**
 * Agrège toutes les pages pour un type + langue.
 * @param {string} query
 * @param {'movie' | 'tv' | 'multi'} type
 * @param {string} language
 * @param {{ onProgress?: (info: { loadedPages: number, totalPages: number, type: string, language: string }) => void }} [options]
 */
async function searchTmdbAllPagesForType(query, type, language, options = {}) {
  const first = await searchTmdb(query, 1, type, language)
  const totalPages = Math.max(1, Number(first?.total_pages) || 1)
  const pageResults = Array.isArray(first?.results) ? [...first.results] : []

  options.onProgress?.({ loadedPages: 1, totalPages, type, language })

  if (totalPages > 1) {
    const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
    const settled = await Promise.all(
      remaining.map(async (page) => {
        const data = await searchTmdb(query, page, type, language)
        options.onProgress?.({ loadedPages: page, totalPages, type, language })
        return data
      }),
    )
    for (const pageData of settled) {
      if (Array.isArray(pageData?.results)) pageResults.push(...pageData.results)
    }
  }

  const withType = pageResults.map((item) => ({
    ...item,
    media_type: item?.media_type || type,
  }))

  return {
    total_pages: totalPages,
    total_results: Number(first?.total_results) || withType.length,
    results: withType,
    pages_loaded: totalPages,
  }
}

function mergeSearchItems(items) {
  const map = new Map()

  for (const item of items) {
    const key = `${item?.media_type ?? 'unknown'}:${item?.id}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...item })
      continue
    }

    const prefer = (a, b) => {
      const aStr = typeof a === 'string' ? a.trim() : a
      return aStr ? a : b
    }

    map.set(key, {
      ...existing,
      ...item,
      title: prefer(item.title, existing.title),
      name: prefer(item.name, existing.name),
      overview: prefer(item.overview, existing.overview),
      poster_path: prefer(item.poster_path, existing.poster_path),
      backdrop_path: prefer(item.backdrop_path, existing.backdrop_path),
      popularity: Math.max(Number(existing.popularity) || 0, Number(item.popularity) || 0),
      media_type: existing.media_type || item.media_type,
    })
  }

  return [...map.values()].sort(
    (a, b) => Number(b?.popularity || 0) - Number(a?.popularity || 0),
  )
}

/**
 * Recherche films + séries en anglais et français (toutes les pages).
 * @param {string} query
 * @param {{ onProgress?: (info: { phase: string, loadedPages: number, totalPages: number }) => void }} [options]
 */
export async function searchTmdbAllPages(query, options = {}) {
  const trackers = {
    'movie:en-US': { loadedPages: 0, totalPages: 1 },
    'movie:fr-FR': { loadedPages: 0, totalPages: 1 },
    'tv:en-US': { loadedPages: 0, totalPages: 1 },
    'tv:fr-FR': { loadedPages: 0, totalPages: 1 },
  }

  function emitProgress() {
    const values = Object.values(trackers)
    const loaded = values.reduce((sum, item) => sum + item.loadedPages, 0)
    const total = values.reduce((sum, item) => sum + item.totalPages, 0)
    options.onProgress?.({
      phase: 'movie+tv·en+fr',
      loadedPages: loaded,
      totalPages: total,
    })
  }

  const [moviesEn, moviesFr, showsEn, showsFr] = await Promise.all([
    searchTmdbAllPagesForType(query, 'movie', 'en-US', {
      onProgress: (info) => {
        trackers['movie:en-US'] = info
        emitProgress()
      },
    }),
    searchTmdbAllPagesForType(query, 'movie', 'fr-FR', {
      onProgress: (info) => {
        trackers['movie:fr-FR'] = info
        emitProgress()
      },
    }),
    searchTmdbAllPagesForType(query, 'tv', 'en-US', {
      onProgress: (info) => {
        trackers['tv:en-US'] = info
        emitProgress()
      },
    }),
    searchTmdbAllPagesForType(query, 'tv', 'fr-FR', {
      onProgress: (info) => {
        trackers['tv:fr-FR'] = info
        emitProgress()
      },
    }),
  ])

  // EN d’abord, puis FR pour préférer les titres/synopses FR au merge
  const unique = mergeSearchItems([
    ...moviesEn.results,
    ...showsEn.results,
    ...moviesFr.results,
    ...showsFr.results,
  ])

  const movieIds = new Set(
    unique.filter((item) => item.media_type === 'movie').map((item) => item.id),
  )
  const tvIds = new Set(unique.filter((item) => item.media_type === 'tv').map((item) => item.id))

  return {
    results: unique,
    total_results: unique.length,
    total_pages:
      moviesEn.total_pages + moviesFr.total_pages + showsEn.total_pages + showsFr.total_pages,
    pages_loaded:
      moviesEn.pages_loaded + moviesFr.pages_loaded + showsEn.pages_loaded + showsFr.pages_loaded,
    movie_total_results: movieIds.size,
    tv_total_results: tvIds.size,
  }
}

export function isMovieOrTvResult(item) {
  const type = String(item?.media_type ?? '')
  return type === 'movie' || type === 'tv'
}
