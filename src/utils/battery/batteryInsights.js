/**
 * Agrégats historique / corrélations pour la page Batterie.
 */

import {
  hoursBetweenTimes,
  lieInBucket,
  lieInMinutes,
} from './batteryMath.js'

/**
 * @param {{ day_date: string, spent: number, computed_budget: number, remaining: number, entries?: object[] }[]} history
 */
export function topCostliestDays(history, limit = 5) {
  return [...(history ?? [])]
    .filter((d) => Number.isFinite(Number(d.spent)))
    .sort((a, b) => Number(b.spent) - Number(a.spent))
    .slice(0, limit)
}

/**
 * @param {{ entries?: { kind?: string, label?: string, cost?: number, activity_id?: string|null }[] }[]} history
 */
export function topGreedyActivities(history, limit = 8) {
  /** @type {Map<string, { label: string, total: number, count: number, activity_id: string|null }>} */
  const map = new Map()

  for (const day of history ?? []) {
    for (const entry of day.entries ?? []) {
      if (entry.kind !== 'actual') continue
      const cost = Number(entry.cost) || 0
      if (cost <= 0) continue
      const key = entry.activity_id || `label:${String(entry.label || '').toLowerCase()}`
      const prev = map.get(key) || {
        label: entry.label || 'Sans nom',
        total: 0,
        count: 0,
        activity_id: entry.activity_id || null,
      }
      prev.total += cost
      prev.count += 1
      if (entry.label) prev.label = entry.label
      map.set(key, prev)
    }
  }

  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

/**
 * Points pour courbe (spent / budget / remaining).
 * @param {{ day_date: string, spent: number, computed_budget: number, remaining: number }[]} history
 */
export function seriesForChart(history) {
  return (history ?? []).map((d) => ({
    date: d.day_date,
    spent: Number(d.spent) || 0,
    budget: Number(d.computed_budget) || 0,
    remaining: Number(d.remaining) || 0,
  }))
}

/**
 * Enrichit un jour historique avec durée de sommeil et écart réveil → sortie du lit.
 * @param {object} day
 */
export function enrichSleepMetrics(day) {
  const sleepHours =
    day?.sleep_hours != null && Number.isFinite(Number(day.sleep_hours))
      ? Number(day.sleep_hours)
      : hoursBetweenTimes(day?.sleep_bedtime, day?.sleep_wake_time)
  const lieIn = lieInMinutes(day?.sleep_wake_time, day?.sleep_out_of_bed_time)
  return {
    ...day,
    sleepHoursComputed: sleepHours,
    lieInMinutes: lieIn,
    lieInBucket: lieInBucket(lieIn),
  }
}

/**
 * Corrélation simple Pearson entre dépenses batterie et score humeur / énergie émotionnelle / sommeil.
 * @param {{ day_date: string, spent: number, sleep_quality?: string|null, sleep_hours?: number|null, sleep_bedtime?: string|null, sleep_wake_time?: string|null, sleep_out_of_bed_time?: string|null }[]} history
 * @param {{ date_jour: string, score_global?: number, 'énergie_émotionnelle'?: number }[]} emotionLogs
 */
export function correlateWithMood(history, emotionLogs) {
  /** @type {Map<string, object>} */
  const moodByDate = new Map()
  for (const log of emotionLogs ?? []) {
    if (log?.date_jour) moodByDate.set(log.date_jour, log)
  }

  const pairsSpentMood = []
  const pairsSpentEnergy = []
  const pairsSpentLieIn = []
  const pairsSpentSleepHours = []
  const bySleep = { bad: [], ok: [], good: [] }
  const byLieIn = { short: [], medium: [], long: [], very_long: [] }

  for (const raw of history ?? []) {
    const day = enrichSleepMetrics(raw)
    const mood = moodByDate.get(day.day_date)
    const spent = Number(day.spent) || 0
    if (mood) {
      const score = Number(mood.score_global)
      const energy = Number(mood['énergie_émotionnelle'])
      if (Number.isFinite(score)) pairsSpentMood.push([spent, score])
      if (Number.isFinite(energy)) pairsSpentEnergy.push([spent, energy])
    }
    const sq = day.sleep_quality
    if (sq && bySleep[sq]) bySleep[sq].push(spent)

    if (day.lieInMinutes != null) {
      pairsSpentLieIn.push([spent, day.lieInMinutes])
      const bucket = day.lieInBucket
      if (bucket && byLieIn[bucket]) byLieIn[bucket].push(spent)
    }
    if (day.sleepHoursComputed != null) {
      pairsSpentSleepHours.push([spent, day.sleepHoursComputed])
    }
  }

  return {
    spentVsMood: pearson(pairsSpentMood),
    spentVsEmotionalEnergy: pearson(pairsSpentEnergy),
    spentVsLieIn: pearson(pairsSpentLieIn),
    spentVsSleepHours: pearson(pairsSpentSleepHours),
    avgSpentBySleep: {
      bad: avg(bySleep.bad),
      ok: avg(bySleep.ok),
      good: avg(bySleep.good),
    },
    avgSpentByLieIn: {
      short: avg(byLieIn.short),
      medium: avg(byLieIn.medium),
      long: avg(byLieIn.long),
      very_long: avg(byLieIn.very_long),
    },
    avgLieInMinutes: avg(
      (history ?? [])
        .map((d) => enrichSleepMetrics(d).lieInMinutes)
        .filter((n) => n != null),
    ),
    sampleMood: pairsSpentMood.length,
    sampleEnergy: pairsSpentEnergy.length,
    sampleLieIn: pairsSpentLieIn.length,
  }
}

/**
 * @param {number[][]} pairs
 */
function pearson(pairs) {
  const n = pairs.length
  if (n < 5) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [x, y] of pairs) {
    sx += x
    sy += y
    sxx += x * x
    syy += y * y
    sxy += x * y
  }
  const num = n * sxy - sx * sy
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  if (!den) return null
  const r = num / den
  if (!Number.isFinite(r)) return null
  return Math.round(r * 100) / 100
}

function avg(arr) {
  if (!arr?.length) return null
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
}

/**
 * Interprétation courte d’un coefficient.
 * @param {number | null} r
 */
export function describeCorrelation(r) {
  if (r == null) return 'Pas assez de données (5 jours min.).'
  const abs = Math.abs(r)
  if (abs < 0.2) return 'Peu de lien apparent.'
  if (r > 0) {
    if (abs < 0.5) return 'Lien positif modéré : plus tu dépenses, plus le score tend à monter.'
    return 'Lien positif notable.'
  }
  if (abs < 0.5) return 'Lien négatif modéré : jours coûteux associés à un score plus bas.'
  return 'Lien négatif notable : jours coûteux souvent liés à un score plus bas.'
}

/**
 * Interprétation dédiée écart réveil → sortie du lit.
 * @param {number | null} r
 */
export function describeLieInCorrelation(r) {
  if (r == null) return 'Pas assez de données (5 jours min.).'
  const abs = Math.abs(r)
  if (abs < 0.2) return 'Peu de lien entre temps au lit après réveil et dépenses.'
  if (r > 0) {
    return 'Les jours où tu restes longtemps au lit après le réveil tendent à être plus coûteux.'
  }
  return 'Les jours où tu sors vite du lit tendent à être plus coûteux (ou l’inverse).'
}
