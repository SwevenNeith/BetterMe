/**
 * Helpers affichage / courbes pour l’historique des saisons LoL.
 */

const TIER_ORDER = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
]

const DIV_ORDER = ['IV', 'III', 'II', 'I']

/**
 * Score numérique de rang pour les courbes (plus haut = mieux).
 * @param {object|null|undefined} entry
 * @returns {number|null}
 */
export function lolRankScore(entry) {
  if (!entry?.tier) return null
  const tier = String(entry.tier).toUpperCase()
  const tierIdx = TIER_ORDER.indexOf(tier)
  if (tierIdx < 0) return null
  const lp = Math.max(0, Math.min(1000, Number(entry.leaguePoints) || 0))
  if (tierIdx >= 7) {
    // Master+ : pas de division
    return tierIdx * 400 + lp
  }
  const div = String(entry.rank || 'IV').toUpperCase()
  const divIdx = Math.max(0, DIV_ORDER.indexOf(div))
  return tierIdx * 400 + divIdx * 100 + Math.min(99, lp)
}

/**
 * @param {object|null|undefined} entry
 */
export function formatSeasonRankShort(entry) {
  if (!entry?.tier) return '—'
  const tier = String(entry.tier)
  const pretty = tier.charAt(0) + tier.slice(1).toLowerCase()
  const rank = entry.rank ? String(entry.rank) : ''
  const lp = entry.leaguePoints != null ? `${entry.leaguePoints} LP` : ''
  return [pretty, rank, lp].filter(Boolean).join(' ')
}

/**
 * Points chronologiques (anciennes → actuelles) pour les graphes.
 * @param {object[]} historyRows rows DB (season_end desc éventuel)
 * @param {{
 *   totalGames: number,
 *   overallWinRate: number|null,
 *   rankSolo: object|null,
 *   seasonStart: string,
 *   label?: string,
 * }|null} current
 */
export function buildSeasonTimeline(historyRows, current = null) {
  const past = [...(historyRows || [])].sort((a, b) =>
    String(a.season_end).localeCompare(String(b.season_end)),
  )

  /** @type {Array<{
   *   id: string,
   *   label: string,
   *   isCurrent: boolean,
   *   seasonStart: string,
   *   seasonEnd: string|null,
   *   totalGames: number,
   *   winRate: number|null,
   *   rankSolo: object|null,
   *   rankFlex: object|null,
   *   rankSoloScore: number|null,
   *   topChampions: object[],
   *   raw: object|null,
   * }>} */
  const points = past.map((row) => ({
    id: row.id,
    label: row.label || formatSeasonWindow(row.season_start, row.season_end),
    isCurrent: false,
    seasonStart: row.season_start,
    seasonEnd: row.season_end,
    totalGames: Number(row.total_games) || 0,
    winRate: row.overall_win_rate == null ? null : Number(row.overall_win_rate),
    rankSolo: row.rank_solo || null,
    rankFlex: row.rank_flex || null,
    rankSoloScore: lolRankScore(row.rank_solo),
    topChampions: Array.isArray(row.top_champions) ? row.top_champions : [],
    raw: row,
  }))

  if (current) {
    points.push({
      id: 'current',
      label: current.label || 'Saison en cours',
      isCurrent: true,
      seasonStart: current.seasonStart,
      seasonEnd: null,
      totalGames: Number(current.totalGames) || 0,
      winRate: current.overallWinRate == null ? null : Number(current.overallWinRate),
      rankSolo: current.rankSolo || null,
      rankFlex: current.rankFlex || null,
      rankSoloScore: lolRankScore(current.rankSolo),
      topChampions: Array.isArray(current.topChampions) ? current.topChampions : [],
      raw: null,
    })
  }

  return points
}

/**
 * @param {string} start
 * @param {string} end
 */
export function formatSeasonWindow(start, end) {
  const a = String(start || '').slice(0, 10)
  const b = String(end || '').slice(0, 10)
  if (!a && !b) return 'Saison'
  if (!b) return `Depuis ${a}`
  return `${a} → ${b}`
}

/**
 * Géométrie SVG simple pour une série de valeurs.
 * @param {(number|null)[]} values
 * @param {{ width?: number, height?: number, pad?: number }} [opts]
 */
export function buildSparklineGeometry(values, opts = {}) {
  const width = opts.width ?? 280
  const height = opts.height ?? 72
  const pad = opts.pad ?? 8
  const nums = values.map((v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v)))
  const finite = nums.filter((v) => v != null)
  if (!finite.length) {
    return { width, height, path: '', area: '', points: [], min: 0, max: 0 }
  }
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min || 1
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const n = Math.max(1, nums.length - 1)

  const points = nums.map((v, i) => {
    const x = pad + (i / n) * innerW
    if (v == null) return { x, y: null, value: null }
    const y = pad + innerH - ((v - min) / range) * innerH
    return { x, y, value: v }
  })

  const drawable = points.filter((p) => p.y != null)
  const path = drawable
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  let area = ''
  if (drawable.length) {
    const first = drawable[0]
    const last = drawable[drawable.length - 1]
    area = `${path} L ${last.x.toFixed(1)} ${(pad + innerH).toFixed(1)} L ${first.x.toFixed(1)} ${(pad + innerH).toFixed(1)} Z`
  }

  return { width, height, path, area, points, min, max }
}
