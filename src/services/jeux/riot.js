import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase.js'
import { fetchWithTimeout } from '../../utils/common/fetchWithTimeout.js'

const RIOT_FUNCTION_URL = `${supabaseUrl}/functions/v1/riot`

export const LOL_PLATFORM_OPTIONS = [
  { id: 'euw1', label: 'EU West (euw1)', routing: 'europe' },
  { id: 'eun1', label: 'EU Nordic & East (eun1)', routing: 'europe' },
  { id: 'na1', label: 'North America (na1)', routing: 'americas' },
  { id: 'kr', label: 'Korea (kr)', routing: 'asia' },
  { id: 'br1', label: 'Brazil (br1)', routing: 'americas' },
  { id: 'la1', label: 'LAN (la1)', routing: 'americas' },
  { id: 'la2', label: 'LAS (la2)', routing: 'americas' },
  { id: 'jp1', label: 'Japan (jp1)', routing: 'asia' },
  { id: 'oc1', label: 'Oceania (oc1)', routing: 'sea' },
  { id: 'tr1', label: 'Turkey (tr1)', routing: 'europe' },
  { id: 'ru', label: 'Russia (ru)', routing: 'europe' },
]

async function getRiotHeaders() {
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

/**
 * @param {Record<string, unknown>} payload
 */
export async function callRiotFunction(payload) {
  const response = await fetchWithTimeout(
    RIOT_FUNCTION_URL,
    {
      method: 'POST',
      headers: await getRiotHeaders(),
      body: JSON.stringify(payload),
    },
    25_000,
  )

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const message = data?.error || `Erreur Riot (${response.status})`
    throw new Error(message)
  }

  return data
}

/**
 * Parse "Pseudo#TAG" ou champs séparés.
 * @param {string} riotId
 */
export function parseRiotId(riotId) {
  const raw = String(riotId ?? '').trim()
  if (!raw) return { gameName: '', tagLine: '' }
  const hash = raw.indexOf('#')
  if (hash < 0) return { gameName: raw, tagLine: '' }
  return {
    gameName: raw.slice(0, hash).trim(),
    tagLine: raw.slice(hash + 1).trim(),
  }
}

/**
 * @param {string} gameName
 * @param {string} tagLine
 * @param {string} [platform]
 */
export async function resolveRiotAccount(gameName, tagLine, platform = 'euw1') {
  return callRiotFunction({
    action: 'resolve-account',
    gameName,
    tagLine,
    platform,
  })
}

/**
 * @param {string} puuid
 * @param {{ platform?: string, days?: number, count?: number }} [options]
 */
export async function fetchRecentMatches(puuid, options = {}) {
  return callRiotFunction({
    action: 'recent-matches',
    puuid,
    platform: options.platform ?? 'euw1',
    days: options.days ?? 7,
    count: options.count ?? 10,
  })
}

/**
 * Icône de profil Data Dragon (CDN public, sans clé).
 * @param {number | null | undefined} profileIconId
 * @param {string} [version]
 */
export function lolProfileIconUrl(profileIconId, version = '14.22.1') {
  const id = Number(profileIconId)
  if (!Number.isFinite(id) || id < 0) return null
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${id}.png`
}

/**
 * @param {number | null | undefined} championId
 * @param {string} [version]
 */
export function lolChampionSquareUrl(championId, version = '14.22.1') {
  // Data Dragon utilise le nom de champion, pas l’id — on expose un helper générique
  // pour les skins/icônes ; l’UI s’appuie surtout sur championName du match.
  void championId
  void version
  return null
}

/**
 * @param {string | null | undefined} championName
 * @param {string} [version]
 */
export function lolChampionIconByName(championName, version = '14.22.1') {
  const name = String(championName ?? '').trim()
  if (!name) return null
  // Data Dragon : espaces retirés (ex. LeeSin, MissFortune)
  const key = name.replace(/['.\s]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`
}

/**
 * @param {number | null | undefined} ms
 */
export function formatMatchDate(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/**
 * @param {number | null | undefined} seconds
 */
export function formatMatchDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
