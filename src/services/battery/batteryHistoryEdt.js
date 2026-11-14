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
  const filteredPlanned = (plannedEvents ?? []).filter(
    (e) => !isUnscheduledHobbyEvent(e, categories),
  )
  const actualMetaById = await resolveActualMetaMap(
    supabase,
    userId,
    history,
    activityById,
    filteredPlanned,
  )
  const actualEvents = buildActualWeekEvents(history, activityById, actualMetaById)

  return {
    from,
    to,
    categories,
    plannedEvents: filteredPlanned,
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
 * @typedef {{ category: string | null, allDay: boolean }} ActualEdtMeta
 */

/**
 * Métadonnées EDT pour chaque entrée réelle : catégorie + journée entière du prévu lié.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} history
 * @param {Map<string, object>} activityById
 * @param {object[]} [plannedEvents]
 * @returns {Promise<Map<string, ActualEdtMeta>>}
 */
export async function resolveActualMetaMap(
  supabase,
  userId,
  history,
  activityById = new Map(),
  plannedEvents = [],
) {
  /** @type {Map<string, ActualEdtMeta>} */
  const map = new Map()
  /** @type {Map<string, string>} actualId → timetable event id */
  const actualToEventId = new Map()
  const plannedByEventId = new Map(
    (plannedEvents ?? []).map((e) => [String(e.id), e]),
  )

  function ensureMeta(actualId) {
    if (!map.has(actualId)) map.set(actualId, { category: null, allDay: false })
    return map.get(actualId)
  }

  for (const day of history ?? []) {
    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.PLANNED || !entry.completed_actual_id) continue
      const actualId = String(entry.completed_actual_id)
      const meta = ensureMeta(actualId)

      if (entry.duration_all_day) meta.allDay = true

      const plannedActivity = entry.activity_id ? activityById.get(entry.activity_id) : null
      if (plannedActivity?.category_id && !meta.category) {
        meta.category = plannedActivity.category_id
      }

      if (
        entry.source_type === BATTERY_SOURCE_TYPES.TIMETABLE &&
        entry.source_id
      ) {
        const eventId = String(entry.source_id)
        actualToEventId.set(actualId, eventId)
        const plannedEvt = plannedByEventId.get(eventId)
        if (plannedEvt?.all_day) meta.allDay = true
        if (plannedEvt?.category) meta.category = plannedEvt.category
      }
    }
  }

  const eventIds = [...new Set(actualToEventId.values())]
  if (eventIds.length) {
    const { data, error } = await supabase
      .from('timetable_events')
      .select('id, category, all_day')
      .eq('user_id', userId)
      .in('id', eventIds)

    if (error) {
      console.warn('resolveActualMetaMap:', error)
    } else {
      for (const row of data ?? []) {
        for (const [actualId, eventId] of actualToEventId) {
          if (eventId !== String(row.id)) continue
          const meta = ensureMeta(actualId)
          if (row.category) meta.category = row.category
          if (row.all_day) meta.allDay = true
        }
      }
    }
  }

  // Repli : activité réelle sans lien → catégorie catalogue
  for (const day of history ?? []) {
    const dayIso = String(day.day_date || '').slice(0, 10)
    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.ACTUAL || !entry.id) continue
      const actualId = String(entry.id)
      const meta = ensureMeta(actualId)
      if (!meta.category) {
        const activity = entry.activity_id ? activityById.get(entry.activity_id) : null
        if (activity?.category_id) meta.category = activity.category_id
      }
      if (!meta.category || !meta.allDay) {
        const title = String(entry.label || '').trim().toLowerCase()
        if (!title || !dayIso) continue
        for (const evt of plannedEvents ?? []) {
          if (!evt?.all_day) continue
          if (String(evt.title || '').trim().toLowerCase() !== title) continue
          if (!eventCoversDay(evt, dayIso)) continue
          if (!meta.category && evt.category) meta.category = evt.category
          meta.allDay = true
          break
        }
      }
      if (entry.duration_all_day) meta.allDay = true
    }
  }

  return map
}

/** @deprecated Utiliser resolveActualMetaMap */
export async function resolveActualCategoryMap(
  supabase,
  userId,
  history,
  activityById = new Map(),
) {
  const meta = await resolveActualMetaMap(supabase, userId, history, activityById, [])
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const [id, value] of meta) {
    if (value?.category) map.set(id, value.category)
  }
  return map
}

/**
 * @param {object} event
 * @param {string} dayIso
 */
function eventCoversDay(event, dayIso) {
  const targetTime = new Date(`${dayIso}T00:00:00`).getTime()
  const startStr = event?.date_start
  if (!startStr) return false
  const startTime = new Date(`${startStr}T00:00:00`).getTime()
  const endStr = event.date_end || event.date_start
  const endTime = new Date(`${endStr}T23:59:59`).getTime()
  return targetTime >= startTime && targetTime <= endTime
}

/**
 * Transforme les entrées Batterie « actual » en événements grille.
 * @param {object[]} history
 * @param {Map<string, object>} activityById
 * @param {Map<string, ActualEdtMeta|string>} [actualMetaById]
 */
export function buildActualWeekEvents(
  history,
  activityById = new Map(),
  actualMetaById = new Map(),
) {
  /** @type {object[]} */
  const events = []

  for (const day of history ?? []) {
    const dayIso = String(day.day_date || '').slice(0, 10)
    if (!dayIso) continue

    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.ACTUAL) continue
      const built = batteryEntryToWeekEvents(entry, dayIso, activityById, actualMetaById)
      events.push(...built)
    }
  }

  return events
}

/**
 * @param {Map<string, ActualEdtMeta|string>} actualMetaById
 * @param {string | null | undefined} entryId
 * @returns {ActualEdtMeta}
 */
function metaForActual(actualMetaById, entryId) {
  if (!entryId) return { category: null, allDay: false }
  const raw = actualMetaById.get(String(entryId))
  if (!raw) return { category: null, allDay: false }
  if (typeof raw === 'string') return { category: raw, allDay: false }
  return {
    category: raw.category || null,
    allDay: Boolean(raw.allDay),
  }
}

/**
 * EDT réel : uniquement les activités avec horaires réels.
 * Sans créneau (journée entière, hobbies sans horaire, etc.) → rien.
 * @param {object} entry
 * @param {string} dayIso
 * @param {Map<string, object>} activityById
 * @param {Map<string, ActualEdtMeta|string>} [actualMetaById]
 * @returns {object[]}
 */
export function batteryEntryToWeekEvents(
  entry,
  dayIso,
  activityById = new Map(),
  actualMetaById = new Map(),
) {
  const title = String(entry?.label || '').trim() || 'Activité'
  const activity = entry?.activity_id ? activityById.get(entry.activity_id) : null
  const linked = metaForActual(actualMetaById, entry?.id)
  const category = linked.category || activity?.category_id || null
  const cost = Number(entry?.cost)
  const costValue = Number.isFinite(cost) ? cost : null

  let start = normalizeHhMm(entry?.planned_start)
  let end = normalizeHhMm(entry?.planned_end)
  const duration = normalizeDurationMinutes(entry?.duration_minutes)

  if (start && !end && duration != null) {
    end = shiftHhMm(start, duration) || ''
  }

  // Pas d’horaires → pas d’affichage sur l’EDT réel (journée entière / hobbies inclus)
  if (!start || !end) return []

  return [
    {
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
    },
  ]
}

/**
 * Compat : premier événement (créneau prioritaire, sinon journée entière).
 * @param {object} entry
 * @param {string} dayIso
 * @param {Map<string, object>} activityById
 * @param {Map<string, ActualEdtMeta|string>} [actualMetaById]
 */
export function batteryEntryToWeekEvent(
  entry,
  dayIso,
  activityById = new Map(),
  actualMetaById = new Map(),
) {
  const events = batteryEntryToWeekEvents(entry, dayIso, activityById, actualMetaById)
  return events[0] || null
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
