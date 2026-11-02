/**
 * Coach de pool / tilt climb : WR + volume, rôles perso faibles, pause session.
 */

import { markChamp, markRole } from './poroMarkup.js'
import { fitsDraftRole } from './poroDraftPick.js'
import { inferRoleFromChampionTags, PORO_ROLES } from './poroRoles.js'
import {
  getPoroMemoryProfile,
  memoryCoachingHints,
  normalizeMemoryText,
} from './poroMemoryProfile.js'

const MIN_GAMES_PLAY = 4
const MIN_GAMES_AVOID = 5
const LOSS_STREAK_PAUSE = 3

/**
 * @param {string} raw
 */
export function isPoolCoachQuery(raw) {
  const n = normalizeMemoryText(raw)
  if (!n) return false

  // Ne pas voler le draft « quel champion contre… »
  if (
    (n.includes('contre') || n.includes('vs') || n.includes('avec') || n.includes('draft')) &&
    (n.includes('quel champion') || n.includes('qui jouer') || n.includes('pick'))
  ) {
    return false
  }

  return (
    /\bstagne\b/.test(n) ||
    /\bje stagne\b/.test(n) ||
    /\btilt\b/.test(n) ||
    /\btilte\b/.test(n) ||
    /\bcoach\b/.test(n) ||
    /\bclimb\b/.test(n) ||
    /\bgrinder?\b/.test(n) ||
    /\bsession (perdue|nul+e|catastrophe)\b/.test(n) ||
    /\bpartie(s)? (perdue|perdues)\b/.test(n) ||
    /\bje (perds|perd)\b/.test(n) ||
    /\bje rage\b/.test(n) ||
    (/\bpause\b/.test(n) &&
      (n.includes('jouer') || n.includes('ranked') || n.includes('session'))) ||
    /\bquoi (one[- ]?trick|otp|jouer)\b/.test(n) ||
    /\bsur quel(s)? champion/.test(n) ||
    /\bconseil (de )?pool\b/.test(n) ||
    /\bpool coach\b/.test(n) ||
    /\bmental\b/.test(n) ||
    /\bbien[- ]?etre\b/.test(n) ||
    /\bbienetre\b/.test(n) ||
    (n.includes('debloquer') && (n.includes('elo') || n.includes('lp') || n.includes('rank')))
  )
}

/**
 * Score confort climb : WR + volume (log).
 * @param {{ games?: number, winRate?: number|null }} row
 */
export function scoreClimbComfort(row) {
  const games = Number(row?.games) || 0
  const wr = Number(row?.winRate)
  if (!Number.isFinite(wr) || games <= 0) return -Infinity
  return wr * Math.log10(games + 1) + games * 0.12
}

/**
 * @param {object[]} recentMatches
 * @returns {number} défaites d’affilée (depuis le plus récent)
 */
export function detectLossStreak(recentMatches = []) {
  const list = Array.isArray(recentMatches) ? recentMatches : []
  let streak = 0
  for (const m of list) {
    const win = m?.participant?.win
    if (win === false) streak += 1
    else break
  }
  return streak
}

/**
 * Agrège WR / games par poste inféré depuis les tags.
 * @param {{ champions?: object[] }} player
 */
export function aggregateRolePerformance(player) {
  /** @type {Record<string, { games: number, wins: number }>} */
  const bag = {}
  for (const role of PORO_ROLES) bag[role.id] = { games: 0, wins: 0 }

  for (const row of player?.champions || []) {
    const games = Number(row.games) || 0
    if (games <= 0) continue
    const wr = Number(row.winRate)
    const wins = Number.isFinite(wr) ? (wr / 100) * games : games * 0.5
    const inferred = inferRoleFromChampionTags(row.championTags || [])
    const id = inferred?.id || 'mid'
    if (!bag[id]) bag[id] = { games: 0, wins: 0 }
    bag[id].games += games
    bag[id].wins += wins
  }

  return PORO_ROLES.map((role) => {
    const b = bag[role.id]
    const games = b.games
    const winRate = games > 0 ? (b.wins / games) * 100 : null
    return { id: role.id, label: role.label, games, winRate }
  }).filter((r) => r.games > 0)
}

/**
 * @param {object} row
 * @param {string | null | undefined} roleId
 * @param {object[]} champions catalogue
 */
function rowFitsRole(row, roleId, champions) {
  if (!roleId) return true
  const cat =
    champions?.find(
      (c) =>
        Number(c.key) === Number(row.championId) ||
        String(c.name || '').toLowerCase() === String(row.championName || '').toLowerCase(),
    ) || { tags: row.championTags || [] }
  return fitsDraftRole(cat, roleId)
}

/**
 * @param {object} opts
 * @param {object | null} [opts.player]
 * @param {{ id: string, label: string } | null} [opts.role]
 * @param {object[]} [opts.memories]
 * @param {object[]} [opts.recentMatches]
 * @param {object[]} [opts.champions]
 */
export function formatPoolCoachReply(opts = {}) {
  const {
    player = null,
    role = null,
    memories = [],
    recentMatches = [],
    champions = [],
  } = opts

  const profile = getPoroMemoryProfile(memories, champions)
  const focusRole = role || profile.role
  const pool = Array.isArray(player?.champions) ? player.champions : []
  const lossStreak = detectLossStreak(recentMatches)

  if (!pool.length) {
    return (
      '## Coach de pool\n' +
      'Je n’ai pas encore ton historique synchronisé.\n' +
      'Lance une **synchro** sur la page League of Legends, puis redis « je stagne mid » ou « coach pool ».'
    )
  }

  const scoped = focusRole
    ? pool.filter((row) => rowFitsRole(row, focusRole.id, champions))
    : pool.slice()

  const playable = scoped
    .filter((r) => (Number(r.games) || 0) >= MIN_GAMES_PLAY && Number.isFinite(Number(r.winRate)))
    .map((r) => ({ ...r, _score: scoreClimbComfort(r) }))
    .sort((a, b) => b._score - a._score)

  const toPlay = playable.slice(0, 3)

  const toAvoid = scoped
    .filter((r) => (Number(r.games) || 0) >= MIN_GAMES_AVOID && Number.isFinite(Number(r.winRate)))
    .filter((r) => Number(r.winRate) < 48)
    .sort((a, b) => Number(a.winRate) - Number(b.winRate))
    .slice(0, 2)

  // Fallback : si filtre rôle trop strict, élargir au pool global
  const usePlay = toPlay.length ? toPlay : playable.length ? playable : null
  let finalPlay = usePlay
  if (!finalPlay?.length) {
    finalPlay = pool
      .filter((r) => (Number(r.games) || 0) >= MIN_GAMES_PLAY)
      .map((r) => ({ ...r, _score: scoreClimbComfort(r) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 3)
  }

  const rolePerf = aggregateRolePerformance(player)
  const weakRoles = rolePerf
    .filter((r) => r.games >= 8 && r.winRate != null && r.winRate < 48)
    .sort((a, b) => Number(a.winRate) - Number(b.winRate))
    .slice(0, 2)

  const strongRoles = rolePerf
    .filter((r) => r.games >= 8 && r.winRate != null)
    .sort((a, b) => Number(b.winRate) - Number(a.winRate))
    .slice(0, 1)

  /** @type {string[]} */
  const lines = ['## Coach de pool / climb']

  if (focusRole) {
    lines.push(`**Focus :** ${markRole(focusRole.label)}`)
  }
  if (profile.goal) lines.push(`**Objectif mémorisé :** ${profile.goal}`)
  if (profile.playstyleLabel) lines.push(`**Style mémorisé :** ${profile.playstyleLabel}`)

  lines.push('')
  lines.push('### À prioriser _(WR + volume)_')
  if (finalPlay?.length) {
    finalPlay.forEach((r, i) => {
      const wr =
        r.winRate == null ? '—' : `${Math.round(Number(r.winRate) * 10) / 10} %`
      lines.push(
        `${i + 1}. ${markChamp(r.championName, r.championId)} — **${r.games}** games · WR **${wr}**`,
      )
    })
  } else {
    lines.push('_Pas assez de volume (≥ 4 games) pour recommander un confort climb._')
  }

  if (toAvoid.length) {
    lines.push('')
    lines.push('### À freiner (pour l’instant)')
    toAvoid.forEach((r) => {
      const wr = `${Math.round(Number(r.winRate) * 10) / 10} %`
      lines.push(
        `• ${markChamp(r.championName, r.championId)} — WR **${wr}** sur ${r.games} games`,
      )
    })
  }

  if (weakRoles.length || strongRoles.length) {
    lines.push('')
    lines.push('### Postes _(d’après ton historique, pas la méta patch)_')
    if (strongRoles[0]) {
      lines.push(
        `• Plus confort : ${markRole(strongRoles[0].label)} (~${Math.round(strongRoles[0].winRate)} % WR)`,
      )
    }
    for (const w of weakRoles) {
      lines.push(
        `• À éviter en grind : ${markRole(w.label)} (~${Math.round(w.winRate)} % WR sur ${Math.round(w.games)} games estimées)`,
      )
    }
  }

  const wantsPause =
    lossStreak >= LOSS_STREAK_PAUSE ||
    /\b(tilt|pause|session (perdue|nul)|je rage|mental)\b/.test(
      normalizeMemoryText(String(opts.raw || '')),
    )

  if (lossStreak >= LOSS_STREAK_PAUSE || wantsPause) {
    lines.push('')
    lines.push('### Session / mental')
    if (lossStreak >= LOSS_STREAK_PAUSE) {
      lines.push(
        `Tu enchaînes **${lossStreak}** défaites sur les matchs chargés → **pause ranked** recommandée.`,
      )
    } else {
      lines.push('Si la session est lourde : **stop ranked**, une norms ou une vraie pause.')
    }
    lines.push(
      'Côté BetterMe : ouvre **Batterie**, **Mood** ou le **Journal** pour noter l’état — remonter LP à froid marche mieux.',
    )
  }

  const memTips = memoryCoachingHints(profile)
  if (memTips.length) {
    lines.push('')
    lines.push('### D’après ta mémoire')
    for (const t of memTips) lines.push(`• ${t}`)
  }

  lines.push('')
  lines.push(
    '_Heuristique BetterMe (ton sync), pas un scrap méta. Dis « souviens-toi que… » pour ancrer style / objectif / mains._',
  )

  return lines.join('\n')
}
