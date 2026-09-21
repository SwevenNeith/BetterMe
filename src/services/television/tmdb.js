import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase.js'

const TMDB_FUNCTION_URL = `${supabaseUrl}/functions/v1/tmdb`
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

async function getTmdbHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? supabaseAnonKey
  return {
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  }
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

/**
 * @param {string} query
 * @param {number} [page]
 * @param {'movie' | 'tv' | 'multi'} [type]
 */
export async function searchTmdb(query, page = 1, type = 'multi') {
  const q = String(query ?? '').trim()
  if (!q) {
    throw new Error('Requête de recherche vide.')
  }

  const pageNum = Math.max(1, Number(page) || 1)
  const mediaType = type === 'movie' || type === 'tv' ? type : 'multi'
  const url =
    `${TMDB_FUNCTION_URL}/search` +
    `?query=${encodeURIComponent(q)}` +
    `&page=${encodeURIComponent(String(pageNum))}` +
    `&type=${encodeURIComponent(mediaType)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: await getTmdbHeaders(),
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
 * Agrège toutes les pages pour un type donné (movie / tv / multi).
 * @param {string} query
 * @param {'movie' | 'tv' | 'multi'} type
 * @param {{ onProgress?: (info: { loadedPages: number, totalPages: number, type: string }) => void }} [options]
 */
async function searchTmdbAllPagesForType(query, type, options = {}) {
  const first = await searchTmdb(query, 1, type)
  const totalPages = Math.max(1, Number(first?.total_pages) || 1)
  const pageResults = Array.isArray(first?.results) ? [...first.results] : []

  options.onProgress?.({ loadedPages: 1, totalPages, type })

  if (totalPages > 1) {
    const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
    const settled = await Promise.all(
      remaining.map(async (page) => {
        const data = await searchTmdb(query, page, type)
        options.onProgress?.({ loadedPages: page, totalPages, type })
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

/**
 * Recherche films + séries (toutes les pages), sans les personnes du multi-search.
 * @param {string} query
 * @param {{ onProgress?: (info: { phase: string, loadedPages: number, totalPages: number }) => void }} [options]
 */
export async function searchTmdbAllPages(query, options = {}) {
  let movieProgress = { loadedPages: 0, totalPages: 1 }
  let tvProgress = { loadedPages: 0, totalPages: 1 }

  function emitProgress() {
    const loaded = movieProgress.loadedPages + tvProgress.loadedPages
    const total = movieProgress.totalPages + tvProgress.totalPages
    options.onProgress?.({
      phase: 'movie+tv',
      loadedPages: loaded,
      totalPages: total,
    })
  }

  const [movies, shows] = await Promise.all([
    searchTmdbAllPagesForType(query, 'movie', {
      onProgress: (info) => {
        movieProgress = info
        emitProgress()
      },
    }),
    searchTmdbAllPagesForType(query, 'tv', {
      onProgress: (info) => {
        tvProgress = info
        emitProgress()
      },
    }),
  ])

  const merged = [...movies.results, ...shows.results]
  const seen = new Set()
  const unique = []
  for (const item of merged) {
    const key = `${item?.media_type ?? 'unknown'}:${item?.id}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }

  unique.sort((a, b) => Number(b?.popularity || 0) - Number(a?.popularity || 0))

  return {
    results: unique,
    total_results: unique.length,
    total_pages: movies.total_pages + shows.total_pages,
    pages_loaded: movies.pages_loaded + shows.pages_loaded,
    movie_total_results: movies.total_results,
    tv_total_results: shows.total_results,
  }
}

export function isMovieOrTvResult(item) {
  const type = String(item?.media_type ?? '')
  return type === 'movie' || type === 'tv'
}
