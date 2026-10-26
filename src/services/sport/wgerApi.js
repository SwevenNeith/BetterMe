/**
 * Client Wger API publique (pas d’auth requise pour le catalogue).
 * https://wger.readthedocs.io/en/latest/api/api.html
 */
import {
  DEFAULT_PAGE_SIZE,
  REF_CACHE_TTL_MS,
  SEARCH_CACHE_TTL_MS,
  WGER_BASE_URL,
  WGER_LANG_EN,
  WGER_LANG_FR,
  categoryLabelFr,
  equipmentLabelFr,
  muscleLabelFr,
} from '../../constants/sport/wger.js'
import { fetchWithTimeout } from '../../utils/common/fetchWithTimeout.js'
import { normalizeWgerExercise } from '../../utils/sport/wgerExercise.js'

const memoryCache = new Map()
/** @type {Map<string, Promise<unknown>>} */
const inflight = new Map()

function cacheGet(key) {
  const hit = memoryCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key)
    return null
  }
  return hit.value
}

function cacheSet(key, value, ttlMs) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

function sessionGet(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

function sessionSet(key, value, ttlMs) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ value, expiresAt: Date.now() + ttlMs }),
    )
  } catch {
    /* quota / private mode */
  }
}

async function wgerFetch(path, params = {}, { signal, bypassCache = false } = {}) {
  const url = new URL(`${WGER_BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    url.searchParams.set(k, String(v))
  }
  const cacheKey = `wger:${url.pathname}?${url.searchParams.toString()}`

  if (!bypassCache) {
    const mem = cacheGet(cacheKey)
    if (mem != null) return mem
    const sess = sessionGet(cacheKey)
    if (sess != null) {
      cacheSet(cacheKey, sess, SEARCH_CACHE_TTL_MS)
      return sess
    }
  }

  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey)
  }

  const promise = (async () => {
    const res = await fetchWithTimeout(
      url.toString(),
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      },
      25_000,
    )
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After')
      throw new Error(
        retry
          ? `Wger limite le débit. Réessaie dans ${retry}s.`
          : 'Wger limite le débit. Réessaie plus tard.',
      )
    }
    if (!res.ok) {
      throw new Error(`Wger indisponible (HTTP ${res.status}).`)
    }
    const data = await res.json()
    const ttl = path.includes('exerciseinfo') ? SEARCH_CACHE_TTL_MS : REF_CACHE_TTL_MS
    cacheSet(cacheKey, data, ttl)
    sessionSet(cacheKey, data, ttl)
    return data
  })().finally(() => {
    inflight.delete(cacheKey)
  })

  inflight.set(cacheKey, promise)
  return promise
}

async function fetchAllPages(path, params = {}, opts = {}) {
  const limit = Number(params.limit) || 100
  let offset = 0
  const results = []
  let guard = 0
  while (guard < 30) {
    guard += 1
    const page = await wgerFetch(path, { ...params, limit, offset }, opts)
    const batch = Array.isArray(page?.results) ? page.results : []
    results.push(...batch)
    if (!page?.next || batch.length === 0) break
    offset += limit
  }
  return results
}

export function clearWgerCache() {
  memoryCache.clear()
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)
      if (k?.startsWith('wger:')) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

function sortByFrName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr', {
    sensitivity: 'base',
  })
}

export async function listWgerMuscles(opts = {}) {
  const rows = await fetchAllPages('/muscle/', { limit: 100 }, opts)
  return rows
    .map((m) => ({
      id: Number(m.id),
      name: muscleLabelFr(m),
      nameFull: m.name || '',
      nameEn: m.name_en || '',
      isFront: Boolean(m.is_front),
      imageUrlMain: m.image_url_main || null,
    }))
    .sort(sortByFrName)
}

/**
 * Catalogue matériel Wger complet (`/equipment/`).
 * Wger n’en expose actuellement que ~12 — on paginer pour tout récupérer.
 */
export async function listWgerEquipment(opts = {}) {
  const rows = await fetchAllPages('/equipment/', { limit: 100 }, opts)
  const mapped = rows.map((e) => ({
    id: Number(e.id),
    name: equipmentLabelFr(e),
    nameEn: e.name || '',
  }))
  // Poids du corps (id 7) en premier, puis tri alpha FR
  return mapped.sort((a, b) => {
    if (a.id === 7) return -1
    if (b.id === 7) return 1
    return sortByFrName(a, b)
  })
}

export async function listWgerCategories(opts = {}) {
  const rows = await fetchAllPages('/exercisecategory/', { limit: 100 }, opts)
  return rows
    .map((c) => ({
      id: Number(c.id),
      name: categoryLabelFr(c),
      nameEn: c.name || '',
    }))
    .sort(sortByFrName)
}

/**
 * Liste paginée d’exercices (un résultat = un exercice, pas une traduction).
 * @param {{
 *   page?: number,
 *   pageSize?: number,
 *   muscleId?: number|null,
 *   equipmentId?: number|null,
 *   categoryId?: number|null,
 *   search?: string,
 *   signal?: AbortSignal,
 *   bypassCache?: boolean,
 * }} filters
 */
export async function searchWgerExercises(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || DEFAULT_PAGE_SIZE))
  const offset = (page - 1) * pageSize
  const params = {
    limit: pageSize,
    offset,
  }
  if (filters.muscleId) params.muscles = Number(filters.muscleId)
  if (filters.equipmentId) params.equipment = Number(filters.equipmentId)
  if (filters.categoryId) params.category = Number(filters.categoryId)

  // L’API filtre language sur les traductions ; on récupère sans forcer
  // et on choisit FR/EN côté client pour éviter les doublons.
  const data = await wgerFetch('/exerciseinfo/', params, {
    signal: filters.signal,
    bypassCache: filters.bypassCache,
  })

  let results = (Array.isArray(data?.results) ? data.results : []).map(normalizeWgerExercise)

  const q = String(filters.search || '')
    .trim()
    .toLowerCase()
  if (q) {
    results = results.filter((ex) => {
      const hay = `${ex.name} ${ex.description} ${ex.categoryName || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }

  // Déduplication stricte par id (sécurité)
  const seen = new Set()
  results = results.filter((ex) => {
    if (seen.has(ex.id)) return false
    seen.add(ex.id)
    return true
  })

  return {
    count: Number(data?.count) || results.length,
    page,
    pageSize,
    results,
    hasMore: Boolean(data?.next),
  }
}

/**
 * Recherche multi-pages légère pour le générateur (borne pour limiter les appels).
 */
export async function collectWgerExercisesForGenerator(filters = {}, opts = {}) {
  const maxPages = opts.maxPages ?? 4
  const pageSize = opts.pageSize ?? 40
  const all = []
  const seen = new Set()
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await searchWgerExercises({
      ...filters,
      page,
      pageSize,
      signal: opts.signal,
    })
    for (const ex of res.results) {
      if (seen.has(ex.id)) continue
      seen.add(ex.id)
      all.push(ex)
    }
    if (!res.hasMore) break
  }
  return all
}

export async function getWgerExercise(id, opts = {}) {
  const data = await wgerFetch(`/exerciseinfo/${Number(id)}/`, {}, opts)
  if (!data?.id) throw new Error('Exercice introuvable sur Wger.')
  return normalizeWgerExercise(data)
}

export { WGER_LANG_FR, WGER_LANG_EN }
