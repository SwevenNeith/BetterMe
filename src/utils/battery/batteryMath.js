/** Calculs purs du module Batterie. */

export const BATTERY_BASE_DEFAULT = 10
export const BATTERY_CARRYOVER_CAP = -3

/** @type {Record<number, number>} */
export const MORNING_ENERGY_DELTA = {
  1: -3,
  2: -1,
  3: 0,
  4: 1,
  5: 2,
}

/** @type {Record<string, number>} */
export const SLEEP_QUALITY_DELTA = {
  bad: -2,
  ok: 0,
  good: 1,
}

/**
 * @param {number | null | undefined} morningEnergy 1–5
 */
export function morningDelta(morningEnergy) {
  const n = Number(morningEnergy)
  if (!Number.isFinite(n)) return 0
  return MORNING_ENERGY_DELTA[n] ?? 0
}

/**
 * @param {string | null | undefined} sleepQuality bad|ok|good
 */
export function sleepDelta(sleepQuality) {
  const key = String(sleepQuality ?? '')
  return SLEEP_QUALITY_DELTA[key] ?? 0
}

/**
 * Report de la veille : −⌊dépassement / 2⌋, plafond −3. Pas de bonus si réserve.
 * @param {number} previousBudget
 * @param {number} previousSpent sum of costs (positif = dépense)
 */
export function carryoverFromPreviousDay(previousBudget, previousSpent) {
  const budget = Number(previousBudget) || 0
  const spent = Number(previousSpent) || 0
  const overrun = spent - budget
  if (overrun <= 0) return 0
  const raw = -Math.round(overrun / 2)
  return Math.max(BATTERY_CARRYOVER_CAP, raw)
}

/**
 * Budget du jour = base + matin + sommeil + report.
 * @param {{
 *   base?: number,
 *   morningEnergy?: number | null,
 *   sleepQuality?: string | null,
 *   carryover?: number,
 * }} input
 */
export function computeDayBudget(input = {}) {
  const base = Number.isFinite(Number(input.base))
    ? Number(input.base)
    : BATTERY_BASE_DEFAULT
  const carry = Number.isFinite(Number(input.carryover)) ? Number(input.carryover) : 0
  const total =
    base + morningDelta(input.morningEnergy) + sleepDelta(input.sleepQuality) + carry
  return Math.max(1, total)
}

/**
 * Normalise un coût Batterie à 1 décimale (ex. 0.5).
 * @param {unknown} value
 */
export function normalizeBatteryCost(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10) / 10
}

/**
 * Somme des coûts (positif = dépense d’énergie).
 * @param {{ cost?: number }[]} entries
 */
export function sumEntryCosts(entries) {
  if (!Array.isArray(entries)) return 0
  return normalizeBatteryCost(
    entries.reduce((sum, entry) => sum + (Number(entry?.cost) || 0), 0),
  )
}

/**
 * Coût « batterie » d’une entrée pour les taux (dépenses positives uniquement).
 * @param {{ cost?: number } | null | undefined} entry
 */
export function entryDrainCost(entry) {
  const n = Number(entry?.cost) || 0
  return n > 0 ? normalizeBatteryCost(n) : 0
}

/**
 * @param {{ cost?: number }[]} entries
 */
export function sumEntryDrainCosts(entries) {
  if (!Array.isArray(entries)) return 0
  return normalizeBatteryCost(entries.reduce((sum, entry) => sum + entryDrainCost(entry), 0))
}

/**
 * Taux de réalisation = coût des prévues faites ÷ coût de toutes les prévues (dépenses).
 * @param {{ kind?: string, cost?: number, completed_actual_id?: string|null }[]} entries
 * @returns {number | null} pourcentage 0–100, ou null si rien de planifié
 */
export function completionRatePercent(entries) {
  const planned = (Array.isArray(entries) ? entries : []).filter((e) => e?.kind === 'planned')
  const plannedCost = sumEntryDrainCosts(planned)
  if (plannedCost <= 0) return null
  const doneCost = sumEntryDrainCosts(
    planned.filter((e) => Boolean(e?.completed_actual_id)),
  )
  return Math.round((doneCost / plannedCost) * 1000) / 10
}

/**
 * Tranche de batterie de départ (budget du jour).
 * @param {number | null | undefined} budget
 * @returns {'low'|'mid'|'high'|null}
 */
export function batteryStartBucket(budget) {
  const n = Number(budget)
  if (!Number.isFinite(n)) return null
  if (n <= 6) return 'low'
  if (n <= 9) return 'mid'
  return 'high'
}

/**
 * @param {number} budget
 * @param {number} spent
 */
export function remainingEnergy(budget, spent) {
  return normalizeBatteryCost((Number(budget) || 0) - (Number(spent) || 0))
}

/**
 * Ratio restant 0–1 (peut être < 0 si dépassement).
 * @param {number} budget
 * @param {number} spent
 */
export function remainingRatio(budget, spent) {
  const b = Number(budget) || 0
  if (b <= 0) return 0
  return remainingEnergy(b, spent) / b
}

/**
 * Couleur jauge selon le restant.
 * @param {number} budget
 * @param {number} spent
 * @returns {'green'|'orange'|'red'}
 */
export function gaugeColor(budget, spent) {
  const ratio = remainingRatio(budget, spent)
  if (ratio > 0.4) return 'green'
  if (ratio > 0.15) return 'orange'
  return 'red'
}

/**
 * Signal de recalibrage du soir (−1 / 0 / +1).
 * @param {number} budget
 * @param {number} spent
 * @param {'empty'|'just'|'left'|null|undefined} eveningFeeling
 */
export function calibrationSignalForDay(budget, spent, eveningFeeling) {
  const feeling = String(eveningFeeling ?? '')
  if (!feeling || !['empty', 'just', 'left'].includes(feeling)) return 0

  const b = Math.max(1, Number(budget) || 1)
  const s = Number(spent) || 0
  const ratioSpent = s / b
  const nearOrOver = ratioSpent >= 0.8
  const underBudget = s < b
  const littleSpent = ratioSpent < 0.8
  const overrun = s > b

  // Presque tout (≥80 %) ou plus + « il m’en restait » → base trop basse
  if (nearOrOver && feeling === 'left') return 1
  // Presque tout ou plus + « juste » → OK
  if (nearOrOver && feeling === 'just') return 0
  // Dans le budget (<100 %) + « à sec » → base trop haute
  if (underBudget && feeling === 'empty') return -1
  // Peu dépensé (<80 %) + « il m’en restait » → aucun signal
  if (littleSpent && feeling === 'left') return 0
  // Dépassement + « à sec » → attendu
  if (overrun && feeling === 'empty') return 0

  return 0
}

/**
 * Ajustement de base hebdomadaire à partir des signaux journaliers.
 * @param {number[]} signals liste de −1/0/+1 (ex. 7 derniers jours avec ressenti)
 * @returns {-1|0|1}
 */
export function weeklyBaseAdjustment(signals) {
  const list = (Array.isArray(signals) ? signals : [])
    .map((n) => Number(n) || 0)
    .filter((n) => n === -1 || n === 0 || n === 1)
  const plus = list.filter((n) => n === 1).length
  const minus = list.filter((n) => n === -1).length
  if (plus >= 3 && minus === 0) return 1
  if (minus >= 3 && plus === 0) return -1
  return 0
}

/**
 * Lundi de la semaine ISO locale pour une date YYYY-MM-DD.
 * @param {string} dayIso
 */
export function weekStartIso(dayIso) {
  const [y, m, d] = String(dayIso).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = (date.getDay() + 6) % 7 // lun=0
  date.setDate(date.getDate() - weekday)
  return toDayDateIso(date)
}

/**
 * Intensité 0–5 selon |coût| (0 si nul).
 * @param {number} cost
 */
export function costIntensity(cost) {
  const v = Number(cost) || 0
  if (v === 0) return 0
  return Math.min(5, Math.max(1, Math.abs(Math.round(v))))
}

/**
 * Classe UI : neutral | drain-1…5 | restore-1…5
 * @param {number} cost
 */
export function costStyleClass(cost) {
  const v = Number(cost) || 0
  if (v === 0) return 'neutral'
  const dir = v > 0 ? 'drain' : 'restore'
  return `${dir}-${costIntensity(v)}`
}

/**
 * Nouveau défaut si le même coût réel C (≠ défaut) a été utilisé
 * pendant 2 semaines consécutives (coûts unanimes chaque semaine).
 *
 * @param {{ day_date: string, cost: number }[]} usages
 *   utilisations réelles (inclure la courante), ordre libre
 * @param {number} defaultCost
 * @returns {number | null} nouveau défaut, ou null
 */
export function learnedDefaultFromTwoWeeks(usages, defaultCost) {
  const currentDefault = Number(defaultCost)
  /** @type {Map<string, number[]>} */
  const byWeek = new Map()

  for (const row of usages ?? []) {
    const day = String(row?.day_date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    const cost = Number(row.cost)
    if (!Number.isFinite(cost)) continue
    const week = weekStartIso(day)
    if (!byWeek.has(week)) byWeek.set(week, [])
    byWeek.get(week).push(cost)
  }

  const weeks = [...byWeek.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  if (weeks.length < 2) return null

  const w0 = weeks[0]
  const w1 = weeks[1]
  if (shiftDayIso(w0, -7) !== w1) return null

  const costs0 = byWeek.get(w0) || []
  const costs1 = byWeek.get(w1) || []
  if (!costs0.length || !costs1.length) return null

  const unanimous = (arr) => arr.every((c) => c === arr[0])
  if (!unanimous(costs0) || !unanimous(costs1)) return null
  if (costs0[0] !== costs1[0]) return null

  const candidate = costs0[0]
  if (candidate === currentDefault) return null
  return candidate
}

/**
 * @deprecated Préférer learnedDefaultFromTwoWeeks.
 * Conservé pour compat : 3 mêmes coûts récents.
 * @param {number[]} recentCosts
 * @param {number} candidateCost
 * @param {{ window?: number, minSame?: number }} [opts]
 */
export function shouldUpdateDefaultCost(recentCosts, candidateCost, opts = {}) {
  const window = Math.max(3, Number(opts.window) || 5)
  const minSame = Math.max(2, Number(opts.minSame) || 3)
  const cost = Number(candidateCost)
  if (!Number.isFinite(cost)) return false
  const recent = (Array.isArray(recentCosts) ? recentCosts : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .slice(0, window)
  const withCandidate = [cost, ...recent].slice(0, window)
  const same = withCandidate.filter((n) => n === cost).length
  return same >= minSame
}

/**
 * @param {string | Date} date
 */
export function toDayDateIso(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * @param {string} dayIso YYYY-MM-DD
 * @param {number} deltaDays
 */
export function shiftDayIso(dayIso, deltaDays) {
  const [y, m, d] = String(dayIso).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + deltaDays)
  return toDayDateIso(date)
}

/**
 * Parse "HH:MM" ou "HH:MM:SS" → minutes depuis minuit, ou null.
 * @param {string | null | undefined} time
 */
export function parseTimeToMinutes(time) {
  const raw = String(time ?? '').trim()
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Normalise une valeur time (DB / input) en "HH:MM" pour <input type="time">.
 * @param {string | null | undefined} time
 */
export function toTimeInputValue(time) {
  const mins = parseTimeToMinutes(time)
  if (mins == null) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Écart en heures entre deux horaires (gère le passage de minuit).
 * Ex. coucher 23:00 → réveil 07:00 = 8.
 * @param {string | null | undefined} fromTime
 * @param {string | null | undefined} toTime
 * @returns {number | null}
 */
export function hoursBetweenTimes(fromTime, toTime) {
  const from = parseTimeToMinutes(fromTime)
  const to = parseTimeToMinutes(toTime)
  if (from == null || to == null) return null
  let diff = to - from
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 10) / 10
}

/**
 * Minutes entre réveil et sortie du lit (même matinée, pas de wrap > 12h).
 * @param {string | null | undefined} wakeTime
 * @param {string | null | undefined} outOfBedTime
 * @returns {number | null}
 */
export function lieInMinutes(wakeTime, outOfBedTime) {
  const wake = parseTimeToMinutes(wakeTime)
  const out = parseTimeToMinutes(outOfBedTime)
  if (wake == null || out == null) return null
  let diff = out - wake
  if (diff < 0) diff += 24 * 60
  // Écart aberrant (> 12 h) → probablement une saisie incohérente
  if (diff > 12 * 60) return null
  return diff
}

/**
 * @param {number | null | undefined} minutes
 */
export function formatMinutesAsHm(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return '—'
  const total = Math.max(0, Math.round(Number(minutes)))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h <= 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/**
 * Bucket pour l’historique : écart réveil → sortie du lit.
 * @param {number | null | undefined} minutes
 * @returns {'none'|'short'|'medium'|'long'|'very_long'}
 */
export function lieInBucket(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return 'none'
  const m = Number(minutes)
  if (m < 20) return 'short'
  if (m < 45) return 'medium'
  if (m < 90) return 'long'
  return 'very_long'
}
