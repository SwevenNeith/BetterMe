import { addDaysISO, normalizeDateISO } from '../utils/habitCalendar.js'
import { getLocalTodayISO } from './scheduledReminders.js'
import { isRecurringTodoFrequency } from '../utils/todoPlanningDates.js'

/** Fenêtre de planification des rappels récurrents (jours). */
export const ROLLING_REMINDER_WINDOW_DAYS = 15

/**
 * Quand il reste ≤ ce nombre de jours avant la fin de couverture,
 * on recomplète jusqu’à WINDOW_DAYS (donc ~ WINDOW - LEAD jours ajoutés).
 */
export const ROLLING_REMINDER_REFILL_LEAD_DAYS = 2

export function getRollingReminderWindowEndISO(today = getLocalTodayISO()) {
  // Couverture jusqu’à +15j : à J-2 on ajoute ~13 j (15 − 2)
  return addDaysISO(today, ROLLING_REMINDER_WINDOW_DAYS)
}

export function getRollingReminderRefillThresholdISO(today = getLocalTodayISO()) {
  return addDaysISO(today, ROLLING_REMINDER_REFILL_LEAD_DAYS)
}

/** Date d’événement / échéance dans la fenêtre [aujourd’hui, +15j] (inclus). */
export function isDateWithinRollingReminderWindow(dateISO, today = getLocalTodayISO()) {
  const day = normalizeDateISO(dateISO)
  if (!day) return false
  return day >= today && day <= getRollingReminderWindowEndISO(today)
}

/**
 * true si la couverture actuelle s’arrête dans ≤ 2 jours (il faut recompléter).
 * @param {string|null|undefined} lastCoverageDateISO dernière date couverte
 */
export function shouldRefillRollingReminderWindow(lastCoverageDateISO, today = getLocalTodayISO()) {
  if (!lastCoverageDateISO) return true
  const last = normalizeDateISO(lastCoverageDateISO)
  if (!last) return true
  return last <= getRollingReminderRefillThresholdISO(today)
}

export function usesRollingReminderWindow(frequenceOrFlag) {
  if (frequenceOrFlag === true) return true
  return isRecurringTodoFrequency(frequenceOrFlag)
}
