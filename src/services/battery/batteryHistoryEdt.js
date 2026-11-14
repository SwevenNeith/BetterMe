/**
 * Données pour la vue EDT de l’historique Batterie (prévu vs réel).
 */

import { BATTERY_ENTRY_KINDS, BATTERY_SOURCE_TYPES } from '../../constants/battery/battery.js'
import { normalizeHhMm, shiftHhMm, formatEdtTimeRange } from '../../utils/battery/batteryTime.js'
import { normalizeDurationMinutes } from '../../utils/battery/batteryDuration.js'
import { formatDateToLocalISO } from '../../utils/timetable/weekGridLayout.js'
import { listBatteryHistory } from './batteryDays.js'
import { loadUserCategories, isUnscheduledHobbyEvent } from '../timetable/timetableCategories.js'
import { listBatteryActivities } from './batteryActivities.js'

const TIMETABLE_EVENT_KIND_BIRTHDAY = 'birthday'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Date} weekAnchor
 */
export async function loadHistoryEdtWeekContext(supabase, userId, weekAnchor) {
  const monday = startOfWeekMonday(weekAnchor)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const from = formatDateToLocalISO(monday)
  const to = formatDateToLocalISO(sunday)

  const [categories, activities, plannedEvents, history] = await Promise.all([
    loadUserCategories(supabase, userId),
    listBatteryActivities(supabase, userId).catch(() => []),
    fetchPlannedTimetableEvents(supabase, userId, from, to),
    listBatteryHistory(supabase, userId, { from, to }),
  ])

  const activityById = new Map((activities ?? []).map((a) => [a.id, a]))
  const categoryByActualId = await resolveActualCategoryMap(
    supabase,
    userId,
    history,
    activityById,
  )
  const actualEvents = buildActualWeekEvents(history, activityById, categoryByActualId)

  return {
    from,
    to,
    categories,
    plannedEvents: plannedEvents.filter(
      (e) => !isUnscheduledHobbyEvent(e, categories),
    ),
    actualEvents,
  }
}

/**
 * @param {Date} anchor
 */
function startOfWeekMonday(anchor) {
  const date = new Date(anchor)
  const currentDay = date.getDay()
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay
  const monday = new Date(date)
  monday.setDate(date.getDate() + distanceToMonday)
  monday.setHours(12, 0, 0, 0)
  return monday
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} mondayStr
 * @param {string} sundayStr
 */
async function fetchPlannedTimetableEvents(supabase, userId, mondayStr, sundayStr) {
  const { data, error } = await supabase
    .from('timetable_events')
    .select('*')
    .eq('user_id', userId)
    .lte('date_start', sundayStr)
    .or(`date_start.gte.${mondayStr},date_end.gte.${mondayStr}`)

  if (error) throw error

  return (data || []).filter((e) => e.event_kind !== TIMETABLE_EVENT_KIND_BIRTHDAY)
}

/**
 * Catégorie pour chaque entrée réelle : priorité à la catégorie EDT du prévu lié,
 * sinon activité catalogue (réel puis prévu).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} history
 * @param {Map<string, object>} activityById
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveActualCategoryMap(
  supabase,
  userId,
  history,
  activityById = new Map(),
) {
  /** @type {Map<string, string>} actualId → category id/name */
  const map = new Map()
  /** @type {Map<string, string>} actualId → timetable event id */
  const actualToEventId = new Map()

  for (const day of history ?? []) {
    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.PLANNED || !entry.completed_actual_id) continue
      const actualId = String(entry.completed_actual_id)

      const plannedActivity = entry.activity_id ? activityById.get(entry.activity_id) : null
      if (plannedActivity?.category_id) {
        map.set(actualId, plannedActivity.category_id)
      }

      if (
        entry.source_type === BATTERY_SOURCE_TYPES.TIMETABLE &&
        entry.source_id
      ) {
        actualToEventId.set(actualId, String(entry.source_id))
      }
    }
  }

  const eventIds = [...new Set(actualToEventId.values())]
  if (eventIds.length) {
    const { data, error } = await supabase
      .from('timetable_events')
      .select('id, category')
      .eq('user_id', userId)
      .in('id', eventIds)

    if (error) {
      console.warn('resolveActualCategoryMap:', error)
    } else {
      const eventCategory = new Map(
        (data ?? []).map((row) => [String(row.id), row.category || null]),
      )
      for (const [actualId, eventId] of actualToEventId) {
        const category = eventCategory.get(eventId)
        if (category) map.set(actualId, category)
      }
    }
  }

  return map
}

/**
 * Transforme les entrées Batterie « actual » en événements grille.
 * @param {object[]} history
 * @param {Map<string, object>} activityById
 * @param {Map<string, string>} [categoryByActualId]
 */
export function buildActualWeekEvents(
  history,
  activityById = new Map(),
  categoryByActualId = new Map(),
) {
  /** @type {object[]} */
  const events = []

  for (const day of history ?? []) {
    const dayIso = String(day.day_date || '').slice(0, 10)
    if (!dayIso) continue

    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.ACTUAL) continue
      const event = batteryEntryToWeekEvent(entry, dayIso, activityById, categoryByActualId)
      if (event) events.push(event)
    }
  }

  return events
}

/**
 * EDT réel :
 * - créneau horaire → bloc daté (horaires réellement faits)
 * - journée entière sans horaire → bande « Journée » (catégorie / priorité conservées)
 * - sans horaire et sans journée entière → null
 * @param {object} entry
 * @param {string} dayIso
 * @param {Map<string, object>} activityById
 * @param {Map<string, string>} [categoryByActualId]
 */
export function batteryEntryToWeekEvent(
  entry,
  dayIso,
  activityById = new Map(),
  categoryByActualId = new Map(),
) {
  const title = String(entry?.label || '').trim() || 'Activité'
  const activity = entry?.activity_id ? activityById.get(entry.activity_id) : null
  const category =
    (entry?.id && categoryByActualId.get(String(entry.id))) ||
    activity?.category_id ||
    null
  const cost = Number(entry?.cost)
  const costValue = Number.isFinite(cost) ? cost : null

  let start = normalizeHhMm(entry?.planned_start)
  let end = normalizeHhMm(entry?.planned_end)
  const duration = normalizeDurationMinutes(entry?.duration_minutes)
  const isAllDay = Boolean(entry?.duration_all_day)

  if (start && !end && duration != null) {
    end = shiftHhMm(start, duration) || ''
  }

  // Horaires réels renseignés → créneau (même si le prévu est journée entière)
  if (start && end) {
    return {
      id: `actual-${entry.id}`,
      title,
      date_start: dayIso,
      date_end: dayIso,
      all_day: false,
      time: formatEdtTimeRange(start, end),
      category,
      detail: '',
      priority: entry?.priority || null,
      cost: costValue,
      _source: 'actual',
      _batteryDay: dayIso,
      _entryId: entry.id,
    }
  }

  // Journée entière sans horaire précis → visible en bande journée
  if (isAllDay) {
    return {
      id: `actual-${entry.id}`,
      title,
      date_start: dayIso,
      date_end: dayIso,
      all_day: true,
      time: null,
      category,
      detail: '',
      priority: entry?.priority || null,
      cost: costValue,
      _source: 'actual',
      _batteryDay: dayIso,
      _entryId: entry.id,
    }
  }

  return null
}

/**
 * Événements d’un jour (créneaux horaires, hors all-day).
 * @param {object[]} events
 * @param {string} dayIso
 */
export function timedEventsForDay(events, dayIso) {
  const targetTime = new Date(`${dayIso}T00:00:00`).getTime()
  const matched = []

  for (const event of events ?? []) {
    if (event.all_day) continue
    const startStr = event.date_start
    if (!startStr) continue
    const endStr = event.date_end || event.date_start
    const startTime = new Date(`${startStr}T00:00:00`).getTime()
    const endTime = new Date(`${endStr}T00:00:00`).getTime()
    if (targetTime < startTime || targetTime > endTime) continue

    const timeParts = String(event.time || '12:00 - 13:00').split(/\s*[-–—]\s*/)
    const startHourStr = timeParts[0] || '12:00'
    const endHourStr = timeParts[1] || '13:00'

    let slicedTime = ''
    if (targetTime === startTime && targetTime === endTime) {
      slicedTime = `${startHourStr} - ${endHourStr}`
    } else if (targetTime === startTime) {
      slicedTime = `${startHourStr} - 24:00`
    } else if (targetTime === endTime) {
      slicedTime = `00:00 - ${endHourStr}`
    } else {
      slicedTime = `00:00 - 24:00`
    }

    matched.push({ ...event, time: slicedTime })
  }

  return matched
}

/**
 * @param {object[]} events
 * @param {string} dayIso
 */
export function allDayEventsForDay(events, dayIso) {
  const targetTime = new Date(`${dayIso}T00:00:00`).getTime()
  return (events ?? []).filter((e) => {
    if (!e.all_day) return false
    const startStr = e.date_start
    if (!startStr) return false
    const startTime = new Date(`${startStr}T00:00:00`).getTime()
    const endStr = e.date_end || e.date_start
    const endTime = new Date(`${endStr}T23:59:59`).getTime()
    return targetTime >= startTime && targetTime <= endTime
  })
}
