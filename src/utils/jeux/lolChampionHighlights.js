/**
 * Critères et agrégation des stats champions (pick / WR / maîtrise)
 * depuis le reset ranked.
 *
 * Liste blanche des files : garder sync avec COUNTED_QUEUE_IDS
 * (supabase/functions/sync-lol-matches/index.ts) et
 * scripts/cleanup-lol-matches-queues.sql.
 * Vérifier : https://static.developer.riotgames.com/docs/lol/queues.json
 */

/** Durée minimale d’une partie valide (secondes). */
export const MIN_VALID_GAME_DURATION_SEC = 300

/**
 * Files comptées (champion choisi).
 * 420 ranked solo/duo, 440 ranked flex, 400 normal draft,
 * 480 swiftplay, 700 clash.
 */
export const COUNTED_QUEUE_IDS = [420, 440, 400, 480, 700]

const COUNTED_QUEUE_SET = new Set(COUNTED_QUEUE_IDS)

/**
 * Partie valide pour les stats : file whitelist, durée >= 300 s, pas early surrender.
 * Accepte le format résumé client ou le détail Match-v5 (`info`).
 * @param {object | null | undefined} match
 * @param {string} puuid
 * @returns {boolean}
 */
export function isValidGame(match, puuid) {
  if (!match || !puuid) return false

  const info = match.info && typeof match.info === 'object' ? match.info : match
  const queueId = Number(info.queueId ?? match.queueId)
  if (!COUNTED_QUEUE_SET.has(queueId)) return false

  const duration = Number(info.gameDuration ?? match.gameDuration)
  if (!Number.isFinite(duration) || duration < MIN_VALID_GAME_DURATION_SEC) {
    return false
  }

  const participants = info.participants ?? match.participants ?? []
  let me = match.participant ?? null
  if (!me || String(me.puuid ?? '') !== puuid) {
    me = participants.find((p) => String(p?.puuid ?? '') === puuid) ?? null
  }
  if (!me) return false
  if (me.gameEndedInEarlySurrender === true) return false

  return true
}

/**
 * Plus récente partie d’une file comptée dans l’historique client (ms).
 * @param {Array<{ queueId?: number, gameCreation?: number }> | null | undefined} matches
 * @returns {number | null}
 */
export function newestCountedHistoryMatchMs(matches) {
  let max = null
  for (const match of matches ?? []) {
    if (!COUNTED_QUEUE_SET.has(Number(match?.queueId))) continue
    const ms = Number(match?.gameCreation)
    if (!Number.isFinite(ms)) continue
    if (max == null || ms > max) max = ms
  }
  return max
}

/**
 * Faut-il appeler l’Edge sync ? Table à jour + historique pas plus récent → non.
 * @param {{
 *   syncComplete: boolean,
 *   historyNewestMs: number | null,
 *   storedNewestMs: number | null,
 * }} input
 */
export function needsLolMatchSync({ syncComplete, historyNewestMs, storedNewestMs }) {
  if (!syncComplete) return true
  if (historyNewestMs == null) return false
  if (storedNewestMs == null) return true
  return historyNewestMs > storedNewestMs
}

/**
 * IDs de parties comptées potentiellement nouvelles (plus récentes que la dernière en base).
 * @param {Array<{ matchId?: string, queueId?: number, gameCreation?: number }> | null | undefined} matches
 * @param {number | null} storedNewestMs
 * @returns {string[]}
 */
export function candidateNewMatchIds(matches, storedNewestMs) {
  const floor = storedNewestMs == null ? null : Number(storedNewestMs)
  const ids = []
  const seen = new Set()
  for (const match of matches ?? []) {
    if (!COUNTED_QUEUE_SET.has(Number(match?.queueId))) continue
    const ms = Number(match?.gameCreation)
    if (!Number.isFinite(ms)) continue
    if (floor != null && ms <= floor) continue
    const id = String(match?.matchId ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/**
 * Fusionne et dédoublonne des listes d’IDs de matchs (plusieurs files).
 * @param {...(string[] | null | undefined)} lists
 * @returns {string[]}
 */
export function mergeMatchIds(...lists) {
  const merged = new Set()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const id of list) {
      if (id != null && id !== '') merged.add(String(id))
    }
  }
  return [...merged]
}

/**
 * Progression de synchro : done quand tous les IDs listés ont été examinés
 * (déjà en base, insérés, ou ignorés comme invalides), pas seulement « en base ».
 * @param {{
 *   listedIds: string[],
 *   existingIds: Iterable<string>,
 *   examinedThisRun: number,
 *   listingComplete?: boolean,
 * }} input
 */
export function computeSyncProgress({
  listedIds,
  existingIds,
  examinedThisRun,
  listingComplete = true,
}) {
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds ?? [])
  const toExamine = (listedIds ?? []).filter((id) => !existing.has(String(id)))
  let remaining = Math.max(0, toExamine.length - Number(examinedThisRun || 0))
  if (!listingComplete && remaining === 0) remaining = 1
  const done = listingComplete !== false && remaining === 0
  return { toExamine, remaining, done }
}

/**
 * @param {number | null | undefined} gameCreationMs
 * @param {number} rankedResetSec epoch secondes
 */
export function isMatchInRankedWindow(gameCreationMs, rankedResetSec) {
  const created = Number(gameCreationMs)
  const startSec = Number(rankedResetSec)
  if (!Number.isFinite(created) || !Number.isFinite(startSec)) return false
  return created >= startSec * 1000
}

/**
 * Pourcentage à 1 décimale, ou null.
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number | null}
 */
export function ratePercent1(numerator, denominator) {
  const den = Number(denominator)
  const num = Number(numerator)
  if (!Number.isFinite(den) || den <= 0 || !Number.isFinite(num)) return null
  return Math.round((num / den) * 1000) / 10
}

/**
 * Agrège pick rate / win rate par championId (fenêtre + parties valides).
 * @param {object[]} matches
 * @param {{
 *   puuid: string,
 *   rankedResetSec: number,
 *   masteryByChampionId?: Map<number, number> | Record<number, number>,
 *   limit?: number,
 * }} options
 */
export function computeChampionHighlights(matches, options) {
  const puuid = String(options?.puuid ?? '').trim()
  const rankedResetSec = Number(options?.rankedResetSec)
  const limit = Math.max(1, Number(options?.limit) || 3)

  /** @type {Map<number, number>} */
  let masteryById = new Map()
  const masteryInput = options?.masteryByChampionId
  if (masteryInput instanceof Map) {
    masteryById = masteryInput
  } else if (masteryInput && typeof masteryInput === 'object') {
    for (const [k, v] of Object.entries(masteryInput)) {
      const id = Number(k)
      if (id) masteryById.set(id, Number(v) || 0)
    }
  }

  /** @type {Map<number, { championId: number, championName: string, games: number, wins: number }>} */
  const byId = new Map()
  let totalGames = 0

  for (const match of matches ?? []) {
    if (!isMatchInRankedWindow(match?.gameCreation, rankedResetSec)) continue
    if (!isValidGame(match, puuid)) continue

    const me =
      match.participant && String(match.participant.puuid ?? '') === puuid
        ? match.participant
        : (match.participants ?? []).find((p) => String(p?.puuid ?? '') === puuid)

    const championId = Number(me?.championId) || 0
    if (!championId) continue

    totalGames += 1
    const cur = byId.get(championId) || {
      championId,
      championName: String(me?.championName ?? '').trim() || `Champion ${championId}`,
      games: 0,
      wins: 0,
    }
    cur.games += 1
    if (me?.win === true) cur.wins += 1
    if (me?.championName) cur.championName = String(me.championName).trim()
    byId.set(championId, cur)
  }

  const champions = [...byId.values()]
    .sort(
      (a, b) =>
        b.games - a.games || b.wins - a.wins || a.championId - b.championId,
    )
    .slice(0, limit)
    .map((row) => ({
      championId: row.championId,
      championName: row.championName,
      games: row.games,
      wins: row.wins,
      winRate: ratePercent1(row.wins, row.games),
      playShare: ratePercent1(row.games, totalGames),
      masteryPoints: masteryById.get(row.championId) ?? null,
    }))

  return {
    totalGames,
    champions,
  }
}
