/**
 * Données pour la vue EDT de l’historique Batterie (prévu vs réel).
 */

import { BATTERY_ENTRY_KINDS, BATTERY_SOURCE_TYPES } from '../../constants/battery/battery.js'
import {
  normalizeHhMm,
  shiftHhMm,
  sliceEventTimeForDay,
  batterySlotToEdtDateRange,
} from '../../utils/battery/batteryTime.js'
import { shiftDayIso } from '../../utils/battery/batteryMath.js'
import { normalizeDurationMinutes } from '../../utils/battery/batteryDuration.js'
import { formatDateToLocalISO } from '../../utils/timetable/weekGridLayout.js'
import { listBatteryHistory } from './batteryDays.js'
import {
  loadUserCategories,
  isUnscheduledHobbyEvent,
  eventMatchesHobbiesCategory,
} from '../timetable/timetableCategories.js'
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
  const ctx = await loadActualEdtEventsForRange(supabase, userId, from, to)
  // Le coucher saisi le lundi suivant (23:00) se dessine le dimanche de cette semaine.
  const nextIso = shiftDayIso(to, 1)
  let nextDays = []
  try {
    nextDays = await listBatteryHistory(supabase, userId, {
      from: nextIso,
      to: nextIso,
      includeEmptyDays: true,
    })
  } catch (err) {
    console.warn('Repère coucher du lendemain :', err)
  }
  return {
    ...ctx,
    sleepByDay: sleepMarkersByDay([...(ctx.history ?? []), ...nextDays]),
  }
}

/**
 * EDT réel Batterie sur une plage. Le prévu (timetable_events) n’est pas réécrit.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} from
 * @param {string} to
 * @param {{ categories?: object[], plannedEvents?: object[] }} [extras]
 */
export async function loadActualEdtEventsForRange(supabase, userId, from, to, extras = {}) {
  const [categories, activities, plannedEvents, history] = await Promise.all([
    extras.categories != null
      ? Promise.resolve(extras.categories)
      : loadUserCategories(supabase, userId),
    listBatteryActivities(supabase, userId).catch(() => []),
    extras.plannedEvents != null
      ? Promise.resolve(extras.plannedEvents)
      : fetchPlannedTimetableEvents(supabase, userId, from, to),
    listBatteryHistory(supabase, userId, {
      from: shiftDayIso(from, -1),
      to,
      includeEmptyDays: true,
    }),
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
    categories,
  )
  const actualEvents = buildActualWeekEvents(history, activityById, actualMetaById)

  return {
    from,
    to,
    categories,
    plannedEvents: filteredPlanned,
    actualEvents,
    history,
    sleepByDay: sleepMarkersByDay(history),
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
  // La veille du lundi : un 23:00–00:15 du dimanche continue le lundi, autre semaine.
  const prevStr = shiftDayIso(mondayStr, -1)
  const { data, error } = await supabase
    .from('timetable_events')
    .select('*')
    .eq('user_id', userId)
    .lte('date_start', sundayStr)
    .or(`date_start.gte.${prevStr},date_end.gte.${mondayStr}`)

  if (error) throw error

  return (data || []).filter((e) => e.event_kind !== TIMETABLE_EVENT_KIND_BIRTHDAY)
}

/**
 * @typedef {{ category: string | null, allDay: boolean }} ActualEdtMeta
 */

/**
 * Métadonnées EDT pour chaque entrée réelle : catégorie + vraie journée entière liée.
 * Les hobbies « à placer » (all_day Hobbies sans créneau) ne comptent pas comme journée entière.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} history
 * @param {Map<string, object>} activityById
 * @param {object[]} [plannedEvents]
 * @param {object[]} [categories]
 * @returns {Promise<Map<string, ActualEdtMeta>>}
 */
export async function resolveActualMetaMap(
  supabase,
  userId,
  history,
  activityById = new Map(),
  plannedEvents = [],
  categories = [],
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

  /** true = journée entière réelle (pas un hobby à placer) */
  function isExplicitAllDayEvent(event) {
    if (!event?.all_day) return false
    return !isUnscheduledHobbyEvent(event, categories)
  }

  for (const day of history ?? []) {
    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.PLANNED || !entry.completed_actual_id) continue
      const actualId = String(entry.completed_actual_id)
      const meta = ensureMeta(actualId)

      // Durée « Journée entière » sur le prévu Batterie
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
        if (plannedEvt?.category) meta.category = plannedEvt.category
        if (isExplicitAllDayEvent(plannedEvt)) meta.allDay = true
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
          if (isExplicitAllDayEvent(row)) meta.allDay = true
        }
      }
    }
  }

  // Repli : activité réelle sans lien → catégorie catalogue / journée entière explicite
  for (const day of history ?? []) {
    const dayIso = String(day.day_date || '').slice(0, 10)
    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.ACTUAL || !entry.id) continue
      const actualId = String(entry.id)
      const meta = ensureMeta(actualId)
      if (!meta.category) {
        const activity = entry.activity_id ? activityById.get(entry.activity_id) : null
        if (activity?.category_id) meta.category = activity.category_id
        else if (entry.edt_category_id) meta.category = entry.edt_category_id
      }
      const hasSlot = Boolean(
        normalizeHhMm(entry.planned_start) && normalizeHhMm(entry.planned_end),
      )
      // Un créneau réel annule toute notion de journée entière (prévu / hobby lié).
      if (hasSlot) {
        meta.allDay = false
        continue
      }
      if (entry.duration_all_day) meta.allDay = true
      // Hobby hors catalogue, sans créneau : visible en journée entière, pas dans Mes Hobbies.
      if (
        !entry.activity_id &&
        !meta.allDay &&
        eventMatchesHobbiesCategory({ category: meta.category || entry.edt_category_id }, categories)
      ) {
        meta.category = meta.category || entry.edt_category_id
        meta.allDay = true
      }
      if (!meta.category || !meta.allDay) {
        const title = String(entry.label || '').trim().toLowerCase()
        if (!title || !dayIso) continue
        for (const evt of plannedEvents ?? []) {
          if (!isExplicitAllDayEvent(evt)) continue
          if (String(evt.title || '').trim().toLowerCase() !== title) continue
          if (!eventCoversDay(evt, dayIso)) continue
          if (!meta.category && evt.category) meta.category = evt.category
          meta.allDay = true
          break
        }
      }
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
    const wakeHhmm = day.sleep_wake_time || day.sleep_out_of_bed_time || null

    for (const entry of day.entries ?? []) {
      if (entry?.kind !== BATTERY_ENTRY_KINDS.ACTUAL) continue
      const built = batteryEntryToWeekEvents(
        entry,
        dayIso,
        activityById,
        actualMetaById,
        wakeHhmm,
      )
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
 * EDT réel :
 * - créneau horaire → bloc daté
 * - durée « Journée entière » (ou prévu/EDT all-day hors hobbies à placer) → bande journée
 * - hobby / activité sans horaire et sans journée entière → rien
 * @param {object} entry
 * @param {string} dayIso
 * @param {Map<string, object>} activityById
 * @param {Map<string, ActualEdtMeta|string>} [actualMetaById]
 * @param {string | null | undefined} [wakeHhmm]
 * @returns {object[]}
 */
export function batteryEntryToWeekEvents(
  entry,
  dayIso,
  activityById = new Map(),
  actualMetaById = new Map(),
  wakeHhmm = null,
) {
  const title = String(entry?.label || '').trim() || 'Activité'
  const activity = entry?.activity_id ? activityById.get(entry.activity_id) : null
  const linked = metaForActual(actualMetaById, entry?.id)
  const category = linked.category || activity?.category_id || entry?.edt_category_id || null
  const cost = Number(entry?.cost)
  const costValue = Number.isFinite(cost) ? cost : null

  let start = normalizeHhMm(entry?.planned_start)
  let end = normalizeHhMm(entry?.planned_end)
  const duration = normalizeDurationMinutes(entry?.duration_minutes)

  if (start && !end && duration != null) {
    end = shiftHhMm(start, duration) || ''
  }

  const hasTimedSlot = Boolean(start && end)
  // Horaires réels prioritaires : plus de bande « journée entière » si un créneau existe
  // (même si le prévu / hobby lié était journée entière).
  const isAllDay =
    !hasTimedSlot && (Boolean(entry?.duration_all_day) || linked.allDay)

  /** @type {object[]} */
  const events = []

  if (hasTimedSlot) {
    // Après minuit (avant réveil) → jour calendaire suivant ; 11h reste le même jour.
    const edt = batterySlotToEdtDateRange(dayIso, start, end, wakeHhmm)
    events.push({
      id: `actual-${entry.id}`,
      title,
      date_start: edt.date_start,
      date_end: edt.date_end,
      all_day: false,
      time: edt.time,
      category,
      detail: '',
      priority: entry?.priority || null,
      cost: costValue,
      _source: 'actual',
      _batteryDay: dayIso,
      _entryId: entry.id,
    })
    return events
  }

  if (isAllDay) {
    events.push({
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
    })
  }

  return events
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
  const matched = []

  for (const event of events ?? []) {
    const slicedTime = sliceEventTimeForDay(event, dayIso)
    if (!slicedTime) continue
    const startDay = String(event.date_start || '').slice(0, 10)
    const isContinuation = Boolean(startDay && dayIso > startDay && slicedTime.startsWith('00:00'))
    matched.push({
      ...event,
      // Clé d’affichage par jour : le même événement peut occuper 2 colonnes.
      _gridKey: `${event.id}__${dayIso}`,
      _overnightContinuation: isContinuation,
      time: slicedTime,
    })
  }

  return matched
}

/**
 * @param {object[]} events
 * @param {string} dayIso
 */
export function allDayEventsForDay(events, dayIso) {
  const targetTime = new Date(`${dayIso}T00:00:00`).getTime()
  /** @type {Set<string>} */
  const timedEntryIds = new Set()
  /** @type {Set<string>} */
  const timedTitles = new Set()

  for (const event of events ?? []) {
    if (event?.all_day) continue
    if (!sliceEventTimeForDay(event, dayIso)) continue
    if (event._entryId) timedEntryIds.add(String(event._entryId))
    const title = String(event.title || '').trim().toLowerCase()
    if (title) timedTitles.add(title)
  }

  return (events ?? []).filter((e) => {
    if (!e.all_day) return false
    const startStr = e.date_start
    if (!startStr) return false
    const startTime = new Date(`${startStr}T00:00:00`).getTime()
    const endStr = e.date_end || e.date_start
    const endTime = new Date(`${endStr}T23:59:59`).getTime()
    if (targetTime < startTime || targetTime > endTime) return false
    // Si un créneau horaire existe déjà pour la même entrée / le même titre ce jour-là,
    // ne pas garder la bande « journée entière ».
    if (e._entryId && timedEntryIds.has(String(e._entryId))) return false
    const title = String(e.title || '').trim().toLowerCase()
    if (title && timedTitles.has(title)) return false
    return true
  })
}

/** Repères sommeil affichés sur la grille (hors catégories EDT). */
const SLEEP_MARKER_SPECS = [
  { field: 'sleep_bedtime', kind: 'bed', label: 'couché' },
  { field: 'sleep_wake_time', kind: 'wake', label: 'réveil' },
  { field: 'sleep_out_of_bed_time', kind: 'out', label: 'sortie' },
]

/**
 * Traits couché / réveil / sortie pour un jour Batterie.
 * @param {object | null | undefined} day
 */
export function sleepMarkersFromDay(day) {
  const dayIso = String(day?.day_date || '').slice(0, 10)
  /** @type {{ id: string, kind: string, label: string, time: string }[]} */
  const markers = []
  for (const spec of SLEEP_MARKER_SPECS) {
    const time = normalizeHhMm(day?.[spec.field])
    if (!time) continue
    markers.push({
      id: `${dayIso || 'day'}-${spec.kind}`,
      kind: spec.kind,
      label: spec.label,
      time,
    })
  }
  return markers
}

/**
 * Un coucher de soirée (12:00–23:59) saisi sur un jour se dessine la veille.
 * 23:00 sur le 25 → trait à 23:00 le 24. Après minuit (00:00–11:59), le trait reste ce jour-là.
 * @param {string} dayIso
 * @param {string | null | undefined} bedtime
 */
export function bedtimeMarkerDayIso(dayIso, bedtime) {
  const iso = String(dayIso || '').slice(0, 10)
  const time = normalizeHhMm(bedtime)
  if (!iso || !time) return iso
  const [h, m] = time.split(':').map(Number)
  if (h * 60 + m >= 12 * 60) return shiftDayIso(iso, -1)
  return iso
}

/**
 * @param {object[]} history
 * @returns {Record<string, { id: string, kind: string, label: string, time: string }[]>}
 */
export function sleepMarkersByDay(history) {
  /** @type {Record<string, { id: string, kind: string, label: string, time: string }[]>} */
  const map = {}
  const push = (iso, marker) => {
    if (!iso) return
    if (!map[iso]) map[iso] = []
    map[iso].push(marker)
  }
  for (const day of history ?? []) {
    const iso = String(day?.day_date || '').slice(0, 10)
    if (!iso) continue
    for (const marker of sleepMarkersFromDay(day)) {
      const target = marker.kind === 'bed' ? bedtimeMarkerDayIso(iso, marker.time) : iso
      push(target, marker)
    }
  }
  return map
}

/**
 * Anniversaires et marqueur couple restent visibles quand le jour passé
 * affiche le réel à la place du prévu.
 * @param {object | null | undefined} event
 */
function isPersistentCalendarMarker(event) {
  return Boolean(
    event?._coupleMarker || event?._birthdayOccurrence || event?.event_kind === 'birthday',
  )
}

/**
 * Page EDT uniquement : à minuit, un jour passé affiche l’EDT réel Batterie.
 * Aujourd’hui et le futur restent le prévu. Le prévu stocké n’est pas modifié.
 * @param {{
 *   dayIso: string,
 *   todayIso: string,
 *   plannedTimed?: object[],
 *   plannedAllDay?: object[],
 *   actualEvents?: object[],
 * }} input
 */
export function selectEdtPageEventsForDay(input) {
  const dayIso = String(input?.dayIso || '').slice(0, 10)
  const todayIso = String(input?.todayIso || '').slice(0, 10)
  const plannedTimed = input?.plannedTimed ?? []
  const plannedAllDay = input?.plannedAllDay ?? []
  const locked = Boolean(dayIso && todayIso && dayIso < todayIso)
  if (!locked) {
    return { locked: false, timed: plannedTimed, allDay: plannedAllDay }
  }
  const markers = plannedAllDay.filter((event) => isPersistentCalendarMarker(event))
  return {
    locked: true,
    timed: timedEventsForDay(input?.actualEvents ?? [], dayIso),
    allDay: [...allDayEventsForDay(input?.actualEvents ?? [], dayIso), ...markers],
  }
}
