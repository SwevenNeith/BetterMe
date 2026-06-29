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
 * @typedef {{ quantite_actuelle?: number, binaryDone?: boolean }} TodoCompletionEntry
 */

function completionMapKey(todoItemId, dateISO) {
  const date = normalizeDateISO(dateISO)
  return date ? `${todoItemId}:${date}` : null
}

export function hasTodoQuantiteCible(item) {
  const n = Number(item?.quantite_cible)
  return Number.isInteger(n) && n >= 1
}

/**
 * @param {Array<{ todo_item_id: string, completion_date: string, quantite_actuelle?: number }>} completions
 * @returns {Map<string, TodoCompletionEntry>}
 */
export function buildCompletionProgressMap(completions) {
  const map = new Map()
  for (const row of completions ?? []) {
    const date = normalizeDateISO(row.completion_date)
    if (!row.todo_item_id || !date) continue
    const qty = Number(row.quantite_actuelle)
    map.set(`${row.todo_item_id}:${date}`, {
      quantite_actuelle: Number.isFinite(qty) && qty > 0 ? qty : 0,
      binaryDone: true,
    })
  }
  return map
}

/** @deprecated Utiliser buildCompletionProgressMap */
export function buildCompletionKeyMap(completions) {
  return buildCompletionProgressMap(completions)
}

/**
 * @param {object} item
 * @param {string} dateISO
 * @param {Map<string, TodoCompletionEntry>} progressMap
 */
export function getOccurrenceQuantiteActuelle(item, dateISO, progressMap) {
  const key = completionMapKey(item.id, dateISO)
  if (!key) return 0

  const entry = progressMap.get(key)
  if (hasTodoQuantiteCible(item)) {
    return entry?.quantite_actuelle ?? 0
  }

  return entry?.binaryDone ? 1 : 0
}

/**
 * @param {object} item
 * @param {string} dateISO
 * @param {Map<string, TodoCompletionEntry>} progressMap
 */
export function isTodoCompletedOnDate(item, dateISO, progressMap) {
  const target = normalizeDateISO(dateISO)
  if (!target) return false

  if (hasTodoQuantiteCible(item)) {
    if (!isTodoDueOnDate(item, target)) return false
    return getOccurrenceQuantiteActuelle(item, target, progressMap) >= Number(item.quantite_cible)
  }

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    if (target !== normalizeDateISO(item.date_echeance)) return false
    return Boolean(item.is_done)
  }

  const key = completionMapKey(item.id, target)
  return Boolean(key && progressMap.get(key)?.binaryDone)
}

/**
 * Fraction de complétion d'une occurrence (0–1) pour les barres de progression.
 * Sans quantité : 0 ou 1. Avec quantité : actuelle / cible (ex. 3/10 → 0,3).
 */
export function getOccurrenceProgressFraction(item, dateISO, progressMap) {
  if (!isTodoDueOnDate(item, dateISO)) return 0

  if (hasTodoQuantiteCible(item)) {
    const cible = Number(item.quantite_cible)
    if (!cible) return 0
    const actuelle = getOccurrenceQuantiteActuelle(item, dateISO, progressMap)
    return Math.min(1, actuelle / cible)
  }

  return isTodoCompletedOnDate(item, dateISO, progressMap) ? 1 : 0
}

/**
 * @param {object[]} items
 * @param {string} dateISO
 * @param {Map<string, TodoCompletionEntry>} progressMap
 */
export function getTodosForDate(items, dateISO, progressMap) {
  return items
    .filter((item) => isTodoDueOnDate(item, dateISO))
    .map((item) => {
      const occurrenceQuantiteCible = hasTodoQuantiteCible(item) ? Number(item.quantite_cible) : null
      const occurrenceQuantiteActuelle = occurrenceQuantiteCible
        ? getOccurrenceQuantiteActuelle(item, dateISO, progressMap)
        : null

      return {
        ...item,
        occurrenceDate: normalizeDateISO(dateISO),
        occurrenceQuantiteCible,
        occurrenceQuantiteActuelle,
        occurrenceDone: isTodoCompletedOnDate(item, dateISO, progressMap),
      }
    })
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
 * @param {Map<string, { quantite_actuelle?: number, binaryDone?: boolean }>} progressMap
 */
/**
 * Statistiques de progression pour une ou plusieurs dates.
 * Chaque occurrence compte pour 1/n (ex. 4 tâches → 25 % chacune).
 * Avec quantité : la part de l’occurrence est répartie sur la cible (3/10 → 7,5 % sur 4 tâches).
 */
export function getTodoProgressStats(items, dates, progressMap) {
  let total = 0
  let fullyDone = 0
  let weightedDone = 0
  let hasPartialProgress = false

  for (const dateISO of dates) {
    const occurrences = getTodosForDate(items, dateISO, progressMap)
    for (const item of occurrences) {
      total += 1
      const fraction = getOccurrenceProgressFraction(item, dateISO, progressMap)
      weightedDone += fraction
      if (item.occurrenceDone) {
        fullyDone += 1
      } else if (fraction > 0) {
        hasPartialProgress = true
      }
    }
  }

  const percent = total === 0 ? 0 : Math.round((weightedDone / total) * 100)
  return { total, fullyDone, weightedDone, percent, hasPartialProgress }
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
