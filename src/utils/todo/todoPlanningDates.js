import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import {
  addDaysISO,
  iterateISODateRange,
  normalizeDateISO,
} from './habitCalendar.js'
import { getWeekStartISO, isTodoDueOnDate } from './todoCalendar.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'

export const DEFAULT_PLANNING_HORIZON_DAYS = 366
export const MAX_PLANNING_OCCURRENCES = 400

export function clampPlanningStartDate(startDate, anchorDate, today = getLocalTodayISO()) {
  const candidates = [startDate, anchorDate, today]
    .map((value) => normalizeDateISO(value))
    .filter(Boolean)

  if (!candidates.length) return normalizeDateISO(today) || ''

  return candidates.reduce((latest, date) => (date > latest ? date : latest), candidates[0])
}

export function isRecurringTodoFrequency(frequence) {
  return (
    frequence === TODO_FREQUENCY.DAILY ||
    frequence === TODO_FREQUENCY.WEEKLY ||
    frequence === TODO_FREQUENCY.WEEK_GOAL
  )
}

/**
 * Dates où un événement planning doit exister pour une tâche TODO.
 * @param {{ frequence?: string, date_echeance?: string, jour_semaine?: number|null }} todo
 * @param {{ startDate?: string, endDate?: string|null, maxDays?: number }} [options]
 */
export function getTodoPlanningOccurrenceDates(todo, options = {}) {
  const frequence = todo?.frequence ?? TODO_FREQUENCY.ONE_OFF
  const start = normalizeDateISO(options.startDate ?? todo?.date_echeance)
  if (!start) return []

  let end = options.endDate ? normalizeDateISO(options.endDate) : ''
  if (!end) {
    const horizon = Math.max(1, Number(options.maxDays) || DEFAULT_PLANNING_HORIZON_DAYS)
    end = addDaysISO(start, horizon - 1)
  }

  if (end < start) return []

  if (frequence === TODO_FREQUENCY.ONE_OFF) {
    return [start]
  }

  if (frequence === TODO_FREQUENCY.WEEK_GOAL) {
    const weekStart = getWeekStartISO(start)
    const weekEnd = addDaysISO(weekStart, 6)
    const rangeEnd = weekEnd < end ? weekEnd : end
    return iterateISODateRange(weekStart, rangeEnd).filter((date) => date >= start)
  }

  const dates = []
  for (const date of iterateISODateRange(start, end)) {
    if (isTodoDueOnDate(todo, date)) {
      dates.push(date)
      if (dates.length >= MAX_PLANNING_OCCURRENCES) break
    }
  }

  return dates
}
