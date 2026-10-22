import {
  COL,
  daysBetweenISO,
} from '../../services/menstruation/menstruationCycles.js'
import {
  COL_NATUREL,
  computeDureeCycleReelleForCycle,
  computeDureeReglesFromDates,
} from '../../services/menstruation/menstruationCyclesNaturel.js'

function averageRounded(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

/**
 * Durées de cycle entre débuts réels successifs (pilule),
 * sinon durée_cycle renseignée sur les cycles déjà commencés.
 * @param {object[]} cycles
 * @returns {number[]}
 */
function piluleCycleLengths(cycles) {
  const sorted = [...(cycles || [])].sort(
    (a, b) => (a[COL.numeroCycle] ?? 0) - (b[COL.numeroCycle] ?? 0),
  )
  /** @type {number[]} */
  const fromStarts = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cur = sorted[i][COL.dateDebutReglesReelle]
    const next = sorted[i + 1][COL.dateDebutReglesReelle]
    if (!cur || !next) continue
    const diff = daysBetweenISO(cur, next)
    if (diff != null && diff >= 15 && diff <= 60) fromStarts.push(diff)
  }
  if (fromStarts.length) return fromStarts

  return sorted
    .map((c) => c[COL.dureeCycle])
    .filter((v) => typeof v === 'number' && v >= 15 && v <= 60)
}

/**
 * @param {object[]} cycles
 * @returns {number[]}
 */
function pilulePeriodLengths(cycles) {
  return (cycles || [])
    .map((c) => {
      if (typeof c[COL.dureeReglesReelle] === 'number' && c[COL.dureeReglesReelle] > 0) {
        return c[COL.dureeReglesReelle]
      }
      const debut = c[COL.dateDebutReglesReelle]
      const fin = c[COL.dateFinReglesReelle]
      const fromDates = computeDureeReglesFromDates(debut, fin)
      if (fromDates != null) return fromDates
      const estimee = c[COL.dureeReglesEstimee]
      return typeof estimee === 'number' && estimee > 0 ? estimee : null
    })
    .filter((v) => typeof v === 'number' && v > 0 && v <= 20)
}

/**
 * @param {object[]} cycles
 * @returns {number[]}
 */
function naturelCycleLengths(cycles) {
  const sorted = [...(cycles || [])].sort(
    (a, b) => (a[COL_NATUREL.numeroCycle] ?? 0) - (b[COL_NATUREL.numeroCycle] ?? 0),
  )
  /** @type {number[]} */
  const lens = []
  for (let i = 0; i < sorted.length; i += 1) {
    const stored = sorted[i][COL_NATUREL.dureeCycleReelle]
    if (typeof stored === 'number' && stored >= 15 && stored <= 60) {
      lens.push(stored)
      continue
    }
    const computed = computeDureeCycleReelleForCycle(sorted, i)
    if (computed != null) lens.push(computed)
  }
  return lens
}

/**
 * @param {object[]} cycles
 * @returns {number[]}
 */
function naturelPeriodLengths(cycles) {
  return (cycles || [])
    .map((c) => {
      const debut = c[COL_NATUREL.dateDebutReglesReelle]
      const fin = c[COL_NATUREL.dateFinReglesReelle]
      if (debut && fin) return computeDureeReglesFromDates(debut, fin)
      const configured = c[COL_NATUREL.dureeRegles]
      return typeof configured === 'number' && configured > 0 ? configured : null
    })
    .filter((v) => typeof v === 'number' && v > 0 && v <= 20)
}

/**
 * Moyennes affichables pour le mode actif.
 * @param {{
 *   mode: 'pilule'|'naturel'|null,
 *   cyclesPilule?: object[],
 *   cyclesNaturel?: object[],
 * }} input
 */
export function computeMenstruationDurationAverages(input) {
  const mode = input?.mode
  if (mode === 'pilule') {
    const cycleLens = piluleCycleLengths(input.cyclesPilule)
    const periodLens = pilulePeriodLengths(input.cyclesPilule)
    return {
      avgCycleDays: averageRounded(cycleLens),
      avgPeriodDays: averageRounded(periodLens),
      cycleSampleSize: cycleLens.length,
      periodSampleSize: periodLens.length,
    }
  }
  if (mode === 'naturel') {
    const cycleLens = naturelCycleLengths(input.cyclesNaturel)
    const periodLens = naturelPeriodLengths(input.cyclesNaturel)
    return {
      avgCycleDays: averageRounded(cycleLens),
      avgPeriodDays: averageRounded(periodLens),
      cycleSampleSize: cycleLens.length,
      periodSampleSize: periodLens.length,
    }
  }
  return {
    avgCycleDays: null,
    avgPeriodDays: null,
    cycleSampleSize: 0,
    periodSampleSize: 0,
  }
}

/**
 * @param {number|null} days
 * @param {number} sampleSize
 */
export function formatAverageDaysLabel(days, sampleSize) {
  if (days == null || !sampleSize) return null
  const unit = days === 1 ? 'jour' : 'jours'
  return `${days} ${unit}`
}
