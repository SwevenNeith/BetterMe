/**
 * Meta builds Poro (Storage `poro-meta`) — mid / adc / support / top / jungle.
 */

import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase.js'
import { fetchWithTimeout } from '../../utils/common/fetchWithTimeout.js'

const BUCKET = 'poro-meta'
const CACHE_TTL_MS = 30 * 60_000

/** @typedef {'mid'|'adc'|'support'|'top'|'jungle'} PoroMetaRoleId */

export const PORO_META_ROLE_IDS = /** @type {const} */ ([
  'mid',
  'adc',
  'support',
  'top',
  'jungle',
])

export const PORO_META_ROLES = /** @type {const} */ ({
  mid: {
    id: 'mid',
    label: 'Mid',
    path: 'mid/latest.json',
    functionName: 'sync-poro-meta-mid',
  },
  adc: {
    id: 'adc',
    label: 'ADC',
    path: 'adc/latest.json',
    functionName: 'sync-poro-meta-adc',
  },
  support: {
    id: 'support',
    label: 'Support',
    path: 'support/latest.json',
    functionName: 'sync-poro-meta-support',
  },
  top: {
    id: 'top',
    label: 'Top',
    path: 'top/latest.json',
    functionName: 'sync-poro-meta-top',
  },
  jungle: {
    id: 'jungle',
    label: 'Jungle',
    path: 'jungle/latest.json',
    functionName: 'sync-poro-meta-jungle',
  },
})

/** @type {Record<string, { at: number, data: object|null }>} */
const caches = {
  mid: { at: 0, data: null },
  adc: { at: 0, data: null },
  support: { at: 0, data: null },
  top: { at: 0, data: null },
  jungle: { at: 0, data: null },
}

/**
 * @param {string} roleId
 * @returns {PoroMetaRoleId|null}
 */
export function normalizePoroMetaRole(roleId) {
  const id = String(roleId || '')
    .toLowerCase()
    .trim()
  if (id === 'mid' || id === 'middle' || id === 'milieu') return 'mid'
  if (id === 'adc' || id === 'bot' || id === 'bottom' || id === 'carry') return 'adc'
  if (id === 'support' || id === 'supp' || id === 'sup' || id === 'utility') return 'support'
  if (id === 'top' || id === 'haut' || id === 'toplane') return 'top'
  if (id === 'jungle' || id === 'jgl' || id === 'jg' || id === 'jungler') return 'jungle'
  return null
}

/**
 * Détecte un rôle meta dans une phrase normalisée.
 * @param {string} n
 * @returns {PoroMetaRoleId|null}
 */
export function detectPoroMetaRoleInNormalizedText(n) {
  const text = String(n || '')
  if (/\b(support|supp|utility)\b/.test(text)) return 'support'
  if (/\b(adc|bot|bottom)\b/.test(text)) return 'adc'
  if (/\b(jungle|jgl|jungler)\b/.test(text) || /(^|\s)jg(\s|$)/.test(text)) return 'jungle'
  if (/\b(top|toplane|haut)\b/.test(text)) return 'top'
  if (/\b(mid|middle|milieu)\b/.test(text)) return 'mid'
  return null
}

/**
 * @param {PoroMetaRoleId} roleId
 * @param {boolean} [force]
 * @returns {Promise<object|null>}
 */
export async function fetchPoroMetaRole(roleId, force = false) {
  const role = normalizePoroMetaRole(roleId)
  if (!role) return null
  const conf = PORO_META_ROLES[role]
  const cached = caches[role]
  if (!force && cached.data && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(conf.path)
    if (error) {
      if (
        error.statusCode === '404' ||
        error.status === 404 ||
        /not found|404/i.test(error.message || '')
      ) {
        caches[role] = { at: Date.now(), data: null }
        return null
      }
      console.warn(`Poro meta ${role} download:`, error)
      return cached.data
    }
    const text = await data.text()
    const json = JSON.parse(text)
    caches[role] = { at: Date.now(), data: json }
    return json
  } catch (err) {
    console.warn(`Poro meta ${role}:`, err)
    return cached.data
  }
}

/** @deprecated alias */
export function fetchPoroMetaMid(force = false) {
  return fetchPoroMetaRole('mid', force)
}

/**
 * @param {object|null} meta
 * @param {number|string} championId
 */
export function getMetaForChampion(meta, championId) {
  if (!meta?.champions) return null
  return meta.champions[String(championId)] || null
}

/** @deprecated alias */
export function getMidMetaForChampion(meta, championId) {
  return getMetaForChampion(meta, championId)
}

/**
 * @param {PoroMetaRoleId|string} roleId
 */
export async function invokeSyncPoroMetaRole(roleId) {
  const role = normalizePoroMetaRole(roleId)
  if (!role) throw new Error('Rôle meta invalide (mid / adc / support / top / jungle).')
  const conf = PORO_META_ROLES[role]

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error(`Session requise pour synchroniser la meta ${conf.label}.`)

  const response = await fetchWithTimeout(
    `${supabaseUrl}/functions/v1/${conf.functionName}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
    180_000,
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `Sync meta ${conf.label} échouée (${response.status})`)
  }
  caches[role] = { at: 0, data: null }
  return payload
}

/** @deprecated alias */
export function invokeSyncPoroMetaMid() {
  return invokeSyncPoroMetaRole('mid')
}

/**
 * Charge tous les rôles meta (best effort).
 * @returns {Promise<Record<PoroMetaRoleId, object|null>>}
 */
export async function fetchAllPoroMetaRoles(force = false) {
  const entries = await Promise.all(
    PORO_META_ROLE_IDS.map(async (id) => [id, await fetchPoroMetaRole(id, force)]),
  )
  return Object.fromEntries(entries)
}

/**
 * Applique une meta fraîche sur le runtime Poro.
 * @param {object} runtime
 * @param {PoroMetaRoleId} roleId
 * @param {object|null} data
 */
export function applyMetaToRuntime(runtime, roleId, data) {
  if (!runtime) return
  if (!runtime.metaByRole) runtime.metaByRole = {}
  runtime.metaByRole[roleId] = data
  if (roleId === 'mid') runtime.metaMid = data
  if (roleId === 'adc') runtime.metaAdc = data
  if (roleId === 'support') runtime.metaSupport = data
  if (roleId === 'top') runtime.metaTop = data
  if (roleId === 'jungle') runtime.metaJungle = data
}

/**
 * @param {object|null|undefined} runtime
 * @param {string} roleId
 */
export function getRuntimeMetaForRole(runtime, roleId) {
  const role = normalizePoroMetaRole(roleId)
  if (!role || !runtime) return null
  if (runtime.metaByRole?.[role]) return runtime.metaByRole[role]
  if (role === 'mid') return runtime.metaMid || null
  if (role === 'adc') return runtime.metaAdc || null
  if (role === 'support') return runtime.metaSupport || null
  if (role === 'top') return runtime.metaTop || null
  if (role === 'jungle') return runtime.metaJungle || null
  return null
}
