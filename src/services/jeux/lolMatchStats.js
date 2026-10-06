import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase.js'
import { DEFAULT_RANKED_RESET_DATE } from '../../constants/jeux/lolRankedReset.js'
import {
  candidateNewMatchIds,
  needsLolMatchSync,
  newestCountedHistoryMatchMs,
} from '../../utils/jeux/lolChampionHighlights.js'
import { fetchWithTimeout } from '../../utils/common/fetchWithTimeout.js'

export {
  candidateNewMatchIds,
  needsLolMatchSync,
  newestCountedHistoryMatchMs,
}

/**
 * Garantit une ligne lol_settings pour le compte.
 * @param {string} puuid
 * @param {string} [platform]
 * @param {string} [routing]
 */
export async function ensureLolSettings(puuid, platform = 'euw1', routing = 'europe') {
  const { data, error } = await supabase.rpc('ensure_lol_settings', {
    p_puuid: puuid,
    p_platform: platform,
    p_routing: routing,
  })
  if (error) throw error
  return data
}

/**
 * @param {string} puuid
 */
export async function fetchLolSettings(puuid) {
  const { data, error } = await supabase
    .from('lol_settings')
    .select('*')
    .eq('puuid', puuid)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Date (ms) de la dernière partie stockée dans lol_matches.
 * @param {string} puuid
 * @returns {Promise<number | null>}
 */
export async function fetchNewestStoredMatchMs(puuid) {
  const { data, error } = await supabase
    .from('lol_matches')
    .select('game_creation')
    .eq('puuid', puuid)
    .order('game_creation', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.game_creation) return null
  const ms = Date.parse(data.game_creation)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Parmi les IDs donnés, ceux absents de lol_matches.
 * @param {string} puuid
 * @param {string[]} matchIds
 * @returns {Promise<string[]>}
 */
export async function filterMissingMatchIds(puuid, matchIds) {
  const ids = [...new Set((matchIds ?? []).map((id) => String(id).trim()).filter(Boolean))]
  if (!ids.length) return []

  const present = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { data, error } = await supabase
      .from('lol_matches')
      .select('match_id')
      .eq('puuid', puuid)
      .in('match_id', chunk)
    if (error) throw error
    for (const row of data ?? []) present.add(String(row.match_id))
  }
  return ids.filter((id) => !present.has(id))
}

/**
 * Top champions depuis la RPC (parties valides >= reset, files whitelist).
 * @param {string} puuid
 * @param {number} [limit]
 */
export async function fetchTopChampionsFromDb(puuid, limit = 3) {
  const { data, error } = await supabase.rpc('get_top_champions', {
    p_puuid: puuid,
    p_limit: limit,
  })
  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  const totalGames = Number(rows[0]?.total_games) || 0

  return {
    totalGames,
    champions: rows.map((row) => ({
      championId: Number(row.champion_id) || 0,
      games: Number(row.games) || 0,
      wins: Number(row.wins) || 0,
      winRate: row.win_rate == null ? null : Number(row.win_rate),
      playShare: row.pick_rate == null ? null : Number(row.pick_rate),
      masteryLevel: Number(row.mastery_level) || 0,
      masteryPoints: Number(row.mastery_points) || 0,
    })),
  }
}

/**
 * @param {string} puuid
 * @param {string} dateYmd
 */
export async function setRankedResetDateRemote(puuid, dateYmd) {
  const { data, error } = await supabase.rpc('set_ranked_reset_date', {
    p_puuid: puuid,
    p_date: dateYmd,
  })
  if (error) throw error
  return data
}

/**
 * Déclenche l’Edge Function de synchro (JWT utilisateur).
 * @param {string} [puuid]
 * @param {{ matchIds?: string[], full?: boolean }} [options]
 * @returns {Promise<{ done: boolean, inserted: number, remaining: number, error?: string }>}
 */
export async function invokeSyncLolMatches(puuid, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Session requise pour synchroniser.')

  const body = {}
  if (puuid) body.puuid = puuid
  if (options.full === true) body.full = true
  if (Array.isArray(options.matchIds) && options.matchIds.length) {
    body.matchIds = options.matchIds
  }

  const response = await fetchWithTimeout(
    `${supabaseUrl}/functions/v1/sync-lol-matches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    120_000,
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `Sync échouée (${response.status})`)
  }
  return {
    done: Boolean(payload.done),
    inserted: Number(payload.inserted) || 0,
    remaining: Number(payload.remaining) || 0,
    message: payload.message,
  }
}

/**
 * Boucle de synchro jusqu’à done (ou max itérations).
 * @param {string} puuid
 * @param {{
 *   onProgress?: (info: { inserted: number, remaining: number, pass: number }) => void,
 *   maxPasses?: number,
 *   matchIds?: string[],
 *   full?: boolean,
 * }} [options]
 */
export async function syncLolMatchesUntilDone(puuid, options = {}) {
  const maxPasses = Math.max(1, Number(options.maxPasses) || 40)
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const invokeOpts = {
    full: options.full === true,
    matchIds: Array.isArray(options.matchIds) ? options.matchIds : undefined,
  }
  // Sync ciblée = une seule passe suffit en général
  const passes =
    invokeOpts.matchIds?.length && !invokeOpts.full
      ? Math.min(maxPasses, 3)
      : maxPasses
  let totalInserted = 0

  for (let pass = 1; pass <= passes; pass += 1) {
    const result = await invokeSyncLolMatches(puuid, invokeOpts)
    if (result.remaining === -1) {
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    totalInserted += result.inserted
    onProgress({
      inserted: totalInserted,
      remaining: result.remaining,
      pass,
    })
    if (result.done || result.remaining === 0) {
      return { done: true, inserted: totalInserted }
    }
  }
  return { done: false, inserted: totalInserted }
}

export { DEFAULT_RANKED_RESET_DATE }
