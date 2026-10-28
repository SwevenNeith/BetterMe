/**
 * Agrégats historique / corrélations pour la page Batterie.
 */

import {
  BATTERY_SKIP_REASONS,
  BATTERY_START_BUCKETS,
} from '../../constants/battery/battery.js'
import {
  batteryStartBucket,
  completionRatePercent,
  entryDrainCost,
  hoursBetweenTimes,
  lieInBucket,
  lieInMinutes,
  sumEntryDrainCosts,
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
 * @param {number | null} r
 * @returns {'none'|'weak'|'moderate'|'strong'}
 */
function correlationStrength(r) {
  if (r == null || !Number.isFinite(r)) return 'none'
  const abs = Math.abs(r)
  if (abs < 0.2) return 'weak'
  if (abs < 0.5) return 'moderate'
  return 'strong'
}

/**
 * Interprétation d’un coefficient Pearson en phrase naturelle.
 * @param {number | null} r
 * @param {{
 *   subject?: string,
 *   positive?: string,
 *   negative?: string,
 *   weak?: string,
 * }} [opts]
 */
export function describeCorrelation(r, opts = {}) {
  if (r == null) {
    return 'Pas encore assez de jours renseignés (il en faut au moins 5) pour voir un lien.'
  }
  const strength = correlationStrength(r)
  const subject = opts.subject || 'ces deux mesures'
  if (strength === 'weak') {
    return opts.weak || `Pour l’instant, peu de lien clair entre ${subject}.`
  }
  const intensity = strength === 'strong' ? 'assez clair' : 'modéré'
  if (r > 0) {
    return (
      opts.positive ||
      `Lien ${intensity} : quand l’une monte, l’autre tend aussi à monter (${subject}).`
    )
  }
  return (
    opts.negative ||
    `Lien ${intensity} : quand l’une monte, l’autre tend à baisser (${subject}).`
  )
}

/** @param {number | null} r */
export function describeMoodCorrelation(r) {
  return describeCorrelation(r, {
    subject: 'tes dépenses d’énergie et ton humeur',
    weak: 'Tes jours coûteux ne semblent pas liés de façon nette à ton humeur.',
    positive:
      'Les jours où tu dépenses plus d’énergie, ton humeur tend aussi à être meilleure.',
    negative:
      'Les jours où tu dépenses plus d’énergie, ton humeur tend à être plus basse.',
  })
}

/** @param {number | null} r */
export function describeEmotionalEnergyCorrelation(r) {
  return describeCorrelation(r, {
    subject: 'tes dépenses d’énergie et ton énergie émotionnelle',
    weak: 'Peu de lien apparent entre ce que tu dépenses et ton énergie émotionnelle.',
    positive:
      'Quand tu dépenses plus d’énergie, ton énergie émotionnelle tend aussi à être plus haute.',
    negative:
      'Quand tu dépenses plus d’énergie, ton énergie émotionnelle tend à être plus basse.',
  })
}

/** @param {number | null} r */
export function describeSleepHoursCorrelation(r) {
  return describeCorrelation(r, {
    subject: 'tes dépenses et ta durée de sommeil',
    weak: 'La durée de sommeil ne semble pas liée clairement à tes dépenses du jour.',
    positive:
      'Les jours où tu as dormi plus longtemps, tu as tendu à dépenser plus d’énergie.',
    negative:
      'Les jours où tu as dormi plus longtemps, tu as tendu à dépenser moins d’énergie.',
  })
}

/**
 * Interprétation dédiée écart réveil → sortie du lit.
 * @param {number | null} r
 */
export function describeLieInCorrelation(r) {
  if (r == null) {
    return 'Pas encore assez de jours avec réveil et sortie du lit pour conclure.'
  }
  const strength = correlationStrength(r)
  if (strength === 'weak') {
    return 'Le temps passé au lit après le réveil ne semble pas lié clairement à tes dépenses.'
  }
  if (r > 0) {
    return strength === 'strong'
      ? 'Plus tu restes longtemps au lit après le réveil, plus tes journées tendent à être coûteuses en énergie.'
      : 'Les jours où tu restes un peu plus longtemps au lit après le réveil tendent à être un peu plus coûteux.'
  }
  return strength === 'strong'
    ? 'Plus tu sors vite du lit après le réveil, plus tes journées tendent à être coûteuses (ou l’inverse).'
    : 'Les jours où tu sors plus vite du lit tendent parfois à être un peu plus coûteux.'
}

/**
 * Phrase sur les moyennes de dépenses selon la qualité du sommeil.
 * @param {{ bad?: number|null, ok?: number|null, good?: number|null }} averages
 */
export function describeAvgSpentBySleep(averages) {
  const parts = []
  if (averages?.bad != null) parts.push(`mauvaise nuit ≈ ${averages.bad} pts`)
  if (averages?.ok != null) parts.push(`nuit moyenne ≈ ${averages.ok} pts`)
  if (averages?.good != null) parts.push(`bonne nuit ≈ ${averages.good} pts`)
  if (!parts.length) {
    return 'Pas encore de journées avec une qualité de sommeil renseignée.'
  }

  const values = [
    ['mauvaise', averages.bad],
    ['moyenne', averages.ok],
    ['bonne', averages.good],
  ].filter(([, v]) => v != null)
  values.sort((a, b) => Number(b[1]) - Number(a[1]))

  if (values.length >= 2 && values[0][1] !== values[values.length - 1][1]) {
    return `En moyenne tu dépenses le plus après une nuit ${values[0][0]} (${values[0][1]} pts) et le moins après une nuit ${values[values.length - 1][0]} (${values[values.length - 1][1]} pts).`
  }
  return `Moyenne dépensée selon le sommeil : ${parts.join(', ')}.`
}

/**
 * Phrase sur les moyennes selon l’écart réveil → sortie.
 * @param {{ short?: number|null, medium?: number|null, long?: number|null, very_long?: number|null }} averages
 */
export function describeAvgSpentByLieIn(averages) {
  const labels = {
    short: 'moins de 20 min au lit après réveil',
    medium: '20–45 min',
    long: '45–90 min',
    very_long: 'plus de 90 min',
  }
  const values = Object.entries(labels)
    .map(([key, label]) => ({ key, label, value: averages?.[key] }))
    .filter((row) => row.value != null)

  if (!values.length) {
    return 'Pas encore de journées avec réveil et sortie du lit renseignés.'
  }

  values.sort((a, b) => Number(b.value) - Number(a.value))
  if (values.length === 1) {
    return `Quand tu restes ${values[0].label}, tu dépenses en moyenne ${values[0].value} pts.`
  }
  return `Tu dépenses le plus les jours où tu restes ${values[0].label} (≈ ${values[0].value} pts) et le moins quand c’est ${values[values.length - 1].label} (≈ ${values[values.length - 1].value} pts).`
}

/**
 * @param {number | null} minutes
 */
export function describeAvgLieIn(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) {
    return 'Pas encore d’écart moyen réveil → sortie du lit calculable.'
  }
  const total = Math.max(0, Math.round(Number(minutes)))
  const h = Math.floor(total / 60)
  const m = total % 60
  const label = h <= 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
  return `En moyenne, tu restes ${label} au lit après ton réveil.`
}

/**
 * Jours avec au moins une activité planifiée (drain > 0).
 * @param {{ entries?: object[], computed_budget?: number }[]} history
 */
function daysWithPlanned(history) {
  return (history ?? []).filter((day) => {
    const planned = (day.entries ?? []).filter((e) => e?.kind === 'planned')
    return sumEntryDrainCosts(planned) > 0
  })
}

/**
 * Indicateurs de réalisation / non-réalisation sur une période.
 * Ignore les jours sans activité planifiée (dépense).
 *
 * @param {{
 *   day_date?: string,
 *   computed_budget?: number,
 *   entries?: {
 *     kind?: string,
 *     cost?: number,
 *     completed_actual_id?: string|null,
 *     skip_reason?: string|null,
 *   }[],
 * }[]} history
 */
export function buildRealizationInsights(history) {
  const days = daysWithPlanned(history)
  if (!days.length) {
    return {
      sampleDays: 0,
      avgCompletionRate: null,
      desireDeferralRate: null,
      reasonShares: BATTERY_SKIP_REASONS.map((r) => ({
        id: r.id,
        label: r.label,
        cost: 0,
        share: null,
      })),
      completionByStartBucket: BATTERY_START_BUCKETS.map((b) => ({
        id: b.id,
        label: b.label,
        avgRate: null,
        sampleDays: 0,
      })),
    }
  }

  /** @type {number[]} */
  const rates = []
  let plannedTotal = 0
  let desireCost = 0
  /** @type {Record<string, number>} */
  const reasonCost = Object.fromEntries(BATTERY_SKIP_REASONS.map((r) => [r.id, 0]))
  /** @type {Record<string, number[]>} */
  const ratesByBucket = { low: [], mid: [], high: [] }

  for (const day of days) {
    const planned = (day.entries ?? []).filter((e) => e?.kind === 'planned')
    const dayPlannedCost = sumEntryDrainCosts(planned)
    if (dayPlannedCost <= 0) continue

    plannedTotal += dayPlannedCost
    const rate = completionRatePercent(day.entries)
    if (rate != null) rates.push(rate)

    const bucket = batteryStartBucket(day.computed_budget)
    if (bucket && rate != null) ratesByBucket[bucket].push(rate)

    for (const entry of planned) {
      if (entry?.completed_actual_id) continue
      const cost = entryDrainCost(entry)
      if (cost <= 0) continue
      const reason = String(entry.skip_reason || '')
      if (reason === 'no_desire') desireCost += cost
      if (reason && reason in reasonCost) reasonCost[reason] += cost
    }
  }

  const unfinishedReasonTotal = Object.values(reasonCost).reduce((a, b) => a + b, 0)

  return {
    sampleDays: days.length,
    avgCompletionRate:
      rates.length > 0
        ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
        : null,
    desireDeferralRate:
      plannedTotal > 0
        ? Math.round((desireCost / plannedTotal) * 1000) / 10
        : null,
    reasonShares: BATTERY_SKIP_REASONS.map((r) => {
      const cost = reasonCost[r.id] || 0
      return {
        id: r.id,
        label: r.label,
        cost: Math.round(cost * 10) / 10,
        share:
          unfinishedReasonTotal > 0
            ? Math.round((cost / unfinishedReasonTotal) * 1000) / 10
            : null,
      }
    }),
    completionByStartBucket: BATTERY_START_BUCKETS.map((b) => {
      const list = ratesByBucket[b.id] || []
      return {
        id: b.id,
        label: b.label,
        sampleDays: list.length,
        avgRate:
          list.length > 0
            ? Math.round((list.reduce((a, c) => a + c, 0) / list.length) * 10) / 10
            : null,
      }
    }),
  }
}

/**
 * @param {number | null | undefined} rate
 */
export function formatCompletionRate(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return '—'
  const n = Number(rate)
  return `${Number.isInteger(n) ? String(n) : n.toFixed(1)} %`
}
