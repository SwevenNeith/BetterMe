import { getEffectiveValeur } from './habitStats.js'
import { addDaysISO, iterateISODateRange, normalizeDateISO, toISODate } from './habitCalendar.js'
import { getPeriodBoundsForDate } from './projectProgressPeriods.js'

/** Objectif projet = 80 % de l’habitude sur la période. */
export const HABIT_PROJECT_TARGET_RATIO = 0.8

function toLocalDateKey(date) {
  if (typeof date === 'string') return normalizeDateISO(date)
  const d = date instanceof Date ? date : new Date(date)
  return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/**
 * Somme des valeurs effectives d’habitude entre deux bornes inclusives.
 * @param {Record<string, object>} logsByDate
 * @param {{ start: Date, end: Date }|{ start: string, end: string }} bounds
 */
export function sumHabitLogsInBounds(logsByDate, bounds) {
  if (!logsByDate || !bounds?.start || !bounds?.end) return 0
  const startIso = toLocalDateKey(bounds.start)
  const endIso = toLocalDateKey(bounds.end)
  let total = 0
  for (const date of iterateISODateRange(startIso, endIso)) {
    total += getEffectiveValeur(logsByDate[date])
  }
  return total
}

/**
 * Quantité cible projet à partir du total habit de la période.
 * 0 si aucune activité habit ; sinon au moins 1 (arrondi 80 %).
 */
export function computeHabitLinkedCible(habitPeriodTotal) {
  const total = Number(habitPeriodTotal) || 0
  if (total <= 0) return 0
  return Math.max(1, Math.round(total * HABIT_PROJECT_TARGET_RATIO))
}

/**
 * Cible 80 % pour une période de reset (jour / semaine / mois) à une date donnée.
 */
export function getHabitLinkedCibleForPeriode(logsByDate, resetPeriode, atDate = new Date()) {
  const bounds = getPeriodBoundsForDate(atDate, resetPeriode)
  return computeHabitLinkedCible(sumHabitLogsInBounds(logsByDate, bounds))
}

/**
 * Cible 80 % pour une plage ISO explicite (historique).
 */
export function getHabitLinkedCibleForRange(logsByDate, startIso, endIso) {
  if (!startIso || !endIso) return 0
  return computeHabitLinkedCible(
    sumHabitLogsInBounds(logsByDate, { start: startIso, end: endIso }),
  )
}

/** Plage de logs habit à charger pour couvrir jour/semaine/mois + historique récent. */
export function getHabitLogsFetchRangeForProject(atDate = new Date()) {
  const d = atDate instanceof Date ? atDate : new Date(atDate)
  const end = toLocalDateKey(d)
  // ~14 mois en arrière pour l’historique projet
  const startDate = new Date(d.getFullYear(), d.getMonth() - 14, 1)
  const start = toLocalDateKey(startDate)
  return { start, end: addDaysISO(end, 0) }
}

export function buildHabitLogsByDate(logs) {
  const map = {}
  for (const log of logs ?? []) {
    const date = normalizeDateISO(log.date_jour)
    if (!date) continue
    map[date] = log
  }
  return map
}

export function formatHabitLinkedCountLabel(count, cible) {
  const c = Number(count) || 0
  const t = Number(cible) || 0
  if (t <= 0) return `${c} fois`
  return `${c} réussites sur ${t}`
}
