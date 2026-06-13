import { HABIT_VALUE_TYPE } from '../constants/habitOptions.js'
import { addDaysISO, iterateISODateRange } from './habitCalendar.js'

/** Jour compté comme fait : booléen coché ou valeur numérique strictement > 0. */
export function isHabitDayDone(log) {
  if (!log) return false
  const valeur = Number(log.valeur ?? 0)
  if (valeur > 0) return true
  return log.fait === true
}

export function getEffectiveValeur(log) {
  if (!isHabitDayDone(log)) return 0
  const raw = Number(log.valeur ?? 0)
  if (raw > 0) return raw
  return 1
}

/** Max valeur sur les 30 jours se terminant à endDate (inclus). */
export function getRollingMaxValeur(logsByDate, endDate) {
  let max = 0
  for (let offset = 0; offset < 30; offset += 1) {
    const date = addDaysISO(endDate, -offset)
    const value = getEffectiveValeur(logsByDate[date])
    if (value > max) max = value
  }
  return max
}

/** Intensité normalisée 0–1 pour l’affichage du quadrillage. */
export function getDayIntensity(log, date, logsByDate) {
  if (!isHabitDayDone(log)) return 0
  const valeur = getEffectiveValeur(log)
  if (valeur <= 0) return 0
  const max = getRollingMaxValeur(logsByDate, date)
  if (max <= 0) return 0
  return Math.min(1, valeur / max)
}

/** Palier visuel : 0, 25, 50, 75 ou 100. */
export function getIntensityTier(intensity, fait) {
  if (fait === false || intensity <= 0) return 0
  if (intensity <= 0.25) return 25
  if (intensity <= 0.50) return 50
  if (intensity <= 0.75) return 75
  return 100
}

export function computeHabitStats(logsByDate, todayIso, referenceDate = todayIso) {
  const weekStart = addDaysISO(todayIso, -7)
  const monthStart = addDaysISO(todayIso, -30)

  const weekDates = iterateISODateRange(weekStart, todayIso)
  const monthDates = iterateISODateRange(monthStart, todayIso)

  const weekValues = []
  const monthValues = []

  for (const date of weekDates) {
    const log = logsByDate[date]
    if (isHabitDayDone(log)) {
      weekValues.push(getEffectiveValeur(log))
    }
  }

  for (const date of monthDates) {
    const log = logsByDate[date]
    if (isHabitDayDone(log)) {
      monthValues.push(getEffectiveValeur(log))
    }
  }

  const weekTotal = weekValues.reduce((sum, value) => sum + value, 0)
  const weekAverage = weekValues.length > 0 ? weekTotal / weekValues.length : 0
  const monthAverage =
    monthValues.length > 0
      ? monthValues.reduce((sum, value) => sum + value, 0) / monthValues.length
      : 0
  const rate30Days = getDayIntensity(
    logsByDate[referenceDate],
    referenceDate,
    logsByDate,
  )

  return {
    weekTotal,
    weekAverage,
    monthAverage,
    streak: computeStreak(logsByDate, todayIso),
    rate30Days,
  }
}

export function computeStreak(logsByDate, todayIso) {
  let streak = 0
  let current = todayIso

  if (!isHabitDayDone(logsByDate[current])) {
    current = addDaysISO(current, -1)
  }

  while (true) {
    const log = logsByDate[current]
    if (!isHabitDayDone(log)) break
    streak += 1
    current = addDaysISO(current, -1)
  }

  return streak
}

export function buildLogPayload(valeur, typeValeur) {
  const numeric = Math.max(0, Number(valeur) || 0)

  if (typeValeur === HABIT_VALUE_TYPE.BOOLEAN) {
    const fait = numeric > 0
    return { fait, valeur: fait ? 1 : 0 }
  }

  const fait = numeric > 0
  return { fait, valeur: fait ? numeric : 0 }
}

export function formatStatNumber(value, decimals = 1) {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals)
}
