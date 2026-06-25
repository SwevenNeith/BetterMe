import {
  TODO_FREQUENCY,
  MAX_TODO_PROMESSES_PER_DAY,
  TODO_PROMESSE_LIMIT_MESSAGE,
} from '../constants/todoOptions.js'
import {
  addDaysISO,
  getIsoWeekdayFromDate,
  getMonthLabelFr,
  iterateISODateRange,
  normalizeDateISO,
  parseISODate,
  toISODate,
} from './habitCalendar.js'

export const TODO_VIEW_MODE = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
}

export { normalizeDateISO, addDaysISO, iterateISODateRange, parseISODate }

/** Lundi = début de semaine (ISO). */
export function getWeekStartISO(anchorISO) {
  const { year, month, day } = parseISODate(anchorISO)
  const weekday = getIsoWeekdayFromDate(year, month, day)
  return addDaysISO(anchorISO, -(weekday - 1))
}

export function getWeekEndISO(anchorISO) {
  return addDaysISO(getWeekStartISO(anchorISO), 6)
}

export function getWeekDates(anchorISO) {
  const start = getWeekStartISO(anchorISO)
  return iterateISODateRange(start, addDaysISO(start, 6))
}

export function getMonthStartISO(anchorISO) {
  const { year, month } = parseISODate(anchorISO)
  return toISODate(year, month, 1)
}

export function getMonthEndISO(anchorISO) {
  const { year, month } = parseISODate(anchorISO)
  const lastDay = new Date(year, month, 0).getDate()
  return toISODate(year, month, lastDay)
}

export function getMonthGridDates(anchorISO) {
  const monthStart = getMonthStartISO(anchorISO)
  const monthEnd = getMonthEndISO(anchorISO)
  const gridStart = getWeekStartISO(monthStart)
  const gridEnd = getWeekEndISO(monthEnd)
  return iterateISODateRange(gridStart, gridEnd)
}

export function shiftAnchorISO(anchorISO, viewMode, delta) {
  const { year, month, day } = parseISODate(anchorISO)
  if (viewMode === TODO_VIEW_MODE.MONTH) {
    const date = new Date(year, month - 1 + delta, 1)
    return toISODate(date.getFullYear(), date.getMonth() + 1, 1)
  }
  if (viewMode === TODO_VIEW_MODE.WEEK) {
    return addDaysISO(anchorISO, delta * 7)
  }
  return addDaysISO(anchorISO, delta)
}

export function formatDayLabelFr(dateISO, style = 'long') {
  const { year, month, day } = parseISODate(dateISO)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('fr-FR', {
    weekday: style === 'short' ? 'short' : 'long',
    day: 'numeric',
    month: style === 'short' ? 'short' : 'long',
    year: 'numeric',
  })
}

export function formatWeekRangeLabelFr(anchorISO) {
  const start = getWeekStartISO(anchorISO)
  const end = getWeekEndISO(anchorISO)
  const startLabel = formatDayLabelFr(start, 'short')
  const endLabel = formatDayLabelFr(end, 'short')
  return `${startLabel} – ${endLabel}`
}

export function formatMonthLabelFr(anchorISO) {
  const { year, month } = parseISODate(anchorISO)
  return `${getMonthLabelFr(month, 'long')} ${year}`
}

export function getIsoWeekdayFromISO(dateISO) {
  const { year, month, day } = parseISODate(dateISO)
  return getIsoWeekdayFromDate(year, month, day)
}

/**
 * @param {{ frequence?: string, date_echeance?: string, jour_semaine?: number|null }} item
 * @param {string} dateISO
 */
export function isTodoDueOnDate(item, dateISO) {
  const target = normalizeDateISO(dateISO)
  const start = normalizeDateISO(item.date_echeance)
  if (!target || !start || target < start) return false

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    return target === start
  }

  if (item.frequence === TODO_FREQUENCY.DAILY) {
    return true
  }

  if (item.frequence === TODO_FREQUENCY.WEEKLY) {
    return getIsoWeekdayFromISO(target) === Number(item.jour_semaine)
  }

  return false
}

/**
 * @param {Map<string, true>} completionKeys keys: `${todoId}:${dateISO}`
 */
export function isTodoCompletedOnDate(item, dateISO, completionKeys) {
  const target = normalizeDateISO(dateISO)
  if (!target) return false

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    if (target !== normalizeDateISO(item.date_echeance)) return false
    return Boolean(item.is_done)
  }

  return completionKeys.has(`${item.id}:${target}`)
}

export function buildCompletionKeyMap(completions) {
  const map = new Map()
  for (const row of completions ?? []) {
    const date = normalizeDateISO(row.completion_date)
    if (row.todo_item_id && date) {
      map.set(`${row.todo_item_id}:${date}`, true)
    }
  }
  return map
}

/**
 * @param {object[]} items
 * @param {string} dateISO
 * @param {Map<string, true>} completionKeys
 */
export function getTodosForDate(items, dateISO, completionKeys) {
  return items
    .filter((item) => isTodoDueOnDate(item, dateISO))
    .map((item) => ({
      ...item,
      occurrenceDate: normalizeDateISO(dateISO),
      occurrenceDone: isTodoCompletedOnDate(item, dateISO, completionKeys),
    }))
    .sort((a, b) => {
      if (Boolean(a.is_promesse) !== Boolean(b.is_promesse)) {
        return a.is_promesse ? -1 : 1
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
}

/**
 * @param {object[]} items
 * @param {string} dateISO
 * @param {string|null} [excludeItemId]
 */
export function countPromessesForDate(items, dateISO, excludeItemId = null) {
  const target = normalizeDateISO(dateISO)
  if (!target) return 0

  return items.filter(
    (item) =>
      Boolean(item.is_promesse) &&
      item.id !== excludeItemId &&
      isTodoDueOnDate(item, target),
  ).length
}

/**
 * @param {object[]} items
 * @param {string} dateISO
 * @param {string|null} [excludeItemId]
 */
export function assertPromesseLimitForDate(items, dateISO, excludeItemId = null) {
  if (countPromessesForDate(items, dateISO, excludeItemId) >= MAX_TODO_PROMESSES_PER_DAY) {
    throw new Error(TODO_PROMESSE_LIMIT_MESSAGE)
  }
}

/**
 * Plage de complétions à charger pour la vue courante et les barres jour / semaine / mois.
 * @param {string} anchorISO
 * @param {string} viewMode
 */
export function getTodoCompletionsFetchRange(anchorISO, viewMode) {
  const view = getDateRangeForView(viewMode, anchorISO)
  const anchor = normalizeDateISO(anchorISO)
  const candidates = [
    view.start,
    view.end,
    anchor,
    getWeekStartISO(anchorISO),
    getWeekEndISO(anchorISO),
    getMonthStartISO(anchorISO),
    getMonthEndISO(anchorISO),
  ].filter(Boolean)

  return {
    start: candidates.reduce((min, date) => (date < min ? date : min)),
    end: candidates.reduce((max, date) => (date > max ? date : max)),
  }
}

/**
 * @param {object[]} items
 * @param {string[]} dates
 * @param {Map<string, true>} completionKeys
 */
export function getTodoProgressStats(items, dates, completionKeys) {
  let total = 0
  let done = 0

  for (const dateISO of dates) {
    const occurrences = getTodosForDate(items, dateISO, completionKeys)
    total += occurrences.length
    done += occurrences.filter((item) => item.occurrenceDone).length
  }

  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { total, done, percent }
}

export function getDateRangeForView(viewMode, anchorISO) {
  if (viewMode === TODO_VIEW_MODE.MONTH) {
    const dates = getMonthGridDates(anchorISO)
    return { start: dates[0], end: dates.at(-1), dates }
  }
  if (viewMode === TODO_VIEW_MODE.WEEK) {
    const dates = getWeekDates(anchorISO)
    return { start: dates[0], end: dates.at(-1), dates }
  }
  const day = normalizeDateISO(anchorISO)
  return { start: day, end: day, dates: [day] }
}
