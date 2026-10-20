/**
 * Synchronisation Batterie ↔ TODO / EDT.
 * Entrées prévues liées (source_type / source_id).
 */

import {
  BATTERY_ENTRY_KINDS,
  BATTERY_SOURCE_TYPES,
} from '../../constants/battery/battery.js'
import { TODO_FREQUENCY } from '../../constants/todo/todoOptions.js'
import { TIMETABLE_EVENT_KIND } from '../../utils/timetable/anniversaryMath.js'
import {
  iterateISODateRange,
  normalizeDateISO,
} from '../../utils/habit/habitCalendar.js'
import { ensureBatteryDay } from './batteryDays.js'

const ENTRIES_TABLE = 'battery_day_entries'
const ENTRY_COLUMNS =
  'id, user_id, day_id, activity_id, label, cost, kind, sort_order, source_type, source_id, created_at'

/**
 * TODO synchronisable : ponctuel uniquement (hors « Cette semaine »).
 * @param {{ frequence?: string } | null | undefined} todo
 */
export function shouldSyncTodoToBattery(todo) {
  return todo?.frequence === TODO_FREQUENCY.ONE_OFF
}

/**
 * EDT synchronisable : hors anniversaire ; hors objectifs « Cette semaine ».
 * @param {{ event_kind?: string|null } | null | undefined} event
 * @param {string | null | undefined} linkedTodoFrequence
 */
export function shouldSyncTimetableToBattery(event, linkedTodoFrequence = null) {
  if (!event) return false
  if (event.event_kind === TIMETABLE_EVENT_KIND.BIRTHDAY) return false
  if (linkedTodoFrequence === TODO_FREQUENCY.WEEK_GOAL) return false
  return true
}

/**
 * Jours couverts par un événement EDT (multi-jours inclus).
 * @param {{ date_start?: string, date_end?: string|null }} event
 */
export function enumerateTimetableEventDays(event) {
  const start = normalizeDateISO(event?.date_start)
  if (!start) return []
  const end = normalizeDateISO(event?.date_end) || start
  return iterateISODateRange(start, end < start ? start : end)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} sourceType
 * @param {string} sourceId
 */
export async function listBatteryEntriesForSource(supabase, userId, sourceType, sourceId) {
  if (!userId || !sourceType || !sourceId) return []
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select(ENTRY_COLUMNS)
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Array<{ sourceType: string, sourceId: string }>} sources
 */
export async function countBatteryEntriesForSources(supabase, userId, sources) {
  const unique = []
  const seen = new Set()
  for (const source of sources ?? []) {
    if (!source?.sourceType || !source?.sourceId) continue
    const key = `${source.sourceType}:${source.sourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(source)
  }
  if (!userId || !unique.length) return 0

  // Une requête par type de source (todo / timetable) plutôt qu’une par id.
  let total = 0
  const byType = new Map()
  for (const source of unique) {
    const list = byType.get(source.sourceType) || []
    list.push(source.sourceId)
    byType.set(source.sourceType, list)
  }

  for (const [sourceType, ids] of byType) {
    const { data, error } = await supabase
      .from(ENTRIES_TABLE)
      .select('id')
      .eq('user_id', userId)
      .eq('source_type', sourceType)
      .in('source_id', ids)

    if (error) throw error
    total += data?.length ?? 0
  }
  return total
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} sourceType
 * @param {string} sourceId
 */
export async function deleteBatteryEntriesForSource(supabase, userId, sourceType, sourceId) {
  if (!userId || !sourceType || !sourceId) return 0
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .select('id')

  if (error) throw error
  if (data?.length) {
    try {
      const { rescheduleBatteryPlanningReminder } = await import(
        './batteryPlanningNotifications.js'
      )
      await rescheduleBatteryPlanningReminder(userId)
    } catch (err) {
      console.error('rescheduleBatteryPlanningReminder after source delete:', err)
    }
  }
  return data?.length ?? 0
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Array<{ sourceType: string, sourceId: string }>} sources
 */
export async function deleteBatteryEntriesForSources(supabase, userId, sources) {
  let deleted = 0
  const seen = new Set()
  for (const source of sources ?? []) {
    if (!source?.sourceType || !source?.sourceId) continue
    const key = `${source.sourceType}:${source.sourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    deleted += await deleteBatteryEntriesForSource(
      supabase,
      userId,
      source.sourceType,
      source.sourceId,
    )
  }
  return deleted
}

/**
 * Upsert d’entrées prévues pour une source sur une liste de jours.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   sourceType: string,
 *   sourceId: string,
 *   label: string,
 *   cost?: number,
 *   dayIsos: string[],
 *   preserveExistingCost?: boolean,
 * }} input
 */
export async function syncPlannedEntriesForSource(supabase, userId, input) {
  const sourceType = input.sourceType
  const sourceId = input.sourceId
  const label = String(input.label ?? '').trim()
  if (!userId || !sourceType || !sourceId || !label) return []

  const dayIsos = [...new Set((input.dayIsos ?? []).map(normalizeDateISO).filter(Boolean))].sort()
  const cost = Math.round(Number(input.cost) || 0)
  const preserveCost = input.preserveExistingCost !== false

  const existing = await listBatteryEntriesForSource(supabase, userId, sourceType, sourceId)
  const existingByDayId = new Map(existing.map((row) => [row.day_id, row]))

  /** @type {Map<string, string>} dayIso → day.id */
  const dayIdByIso = new Map()
  for (const dayIso of dayIsos) {
    const { day } = await ensureBatteryDay(supabase, userId, dayIso)
    dayIdByIso.set(dayIso, day.id)
  }

  const keepDayIds = new Set([...dayIdByIso.values()])
  for (const row of existing) {
    if (!keepDayIds.has(row.day_id)) {
      const { error } = await supabase
        .from(ENTRIES_TABLE)
        .delete()
        .eq('id', row.id)
        .eq('user_id', userId)
      if (error) throw error
    }
  }

  const results = []
  for (const dayIso of dayIsos) {
    const dayId = dayIdByIso.get(dayIso)
    const prev = existing.find((row) => row.day_id === dayId)
    if (prev) {
      const nextCost = preserveCost ? prev.cost : cost
      const { data, error } = await supabase
        .from(ENTRIES_TABLE)
        .update({
          label,
          cost: nextCost,
          kind: BATTERY_ENTRY_KINDS.PLANNED,
        })
        .eq('id', prev.id)
        .eq('user_id', userId)
        .select(ENTRY_COLUMNS)
        .single()
      if (error) throw error
      results.push(data)
      existingByDayId.delete(dayId)
      continue
    }

    const { data: siblings, error: siblingsError } = await supabase
      .from(ENTRIES_TABLE)
      .select('id')
      .eq('day_id', dayId)
      .eq('kind', BATTERY_ENTRY_KINDS.PLANNED)

    if (siblingsError) throw siblingsError

    const { data, error } = await supabase
      .from(ENTRIES_TABLE)
      .insert({
        user_id: userId,
        day_id: dayId,
        activity_id: null,
        label,
        cost,
        kind: BATTERY_ENTRY_KINDS.PLANNED,
        sort_order: siblings?.length ?? 0,
        source_type: sourceType,
        source_id: sourceId,
      })
      .select(ENTRY_COLUMNS)
      .single()

    if (error) throw error
    results.push(data)
  }

  try {
    const { rescheduleBatteryPlanningReminder } = await import(
      './batteryPlanningNotifications.js'
    )
    await rescheduleBatteryPlanningReminder(userId)
  } catch (err) {
    console.error('rescheduleBatteryPlanningReminder after planned sync:', err)
  }

  return results
}

/**
 * Sync depuis une tâche TODO ponctuelle (sans EDT, sinon préférer l’EDT).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} todo
 * @param {{ cost?: number, preserveExistingCost?: boolean }} [options]
 */
export async function syncBatteryFromTodo(supabase, userId, todo, options = {}) {
  if (!shouldSyncTodoToBattery(todo) || !todo?.id) {
    await deleteBatteryEntriesForSource(supabase, userId, BATTERY_SOURCE_TYPES.TODO, todo?.id)
    return []
  }

  const dayIso = normalizeDateISO(todo.date_echeance)
  if (!dayIso) {
    await deleteBatteryEntriesForSource(supabase, userId, BATTERY_SOURCE_TYPES.TODO, todo.id)
    return []
  }

  return syncPlannedEntriesForSource(supabase, userId, {
    sourceType: BATTERY_SOURCE_TYPES.TODO,
    sourceId: todo.id,
    label: todo.nom || 'Tâche',
    cost: options.cost,
    dayIsos: [dayIso],
    preserveExistingCost: options.preserveExistingCost,
  })
}

/**
 * Sync depuis un événement EDT (multi-jours = une entrée par jour).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} event
 * @param {{ cost?: number, preserveExistingCost?: boolean, linkedTodoFrequence?: string|null }} [options]
 */
export async function syncBatteryFromTimetableEvent(supabase, userId, event, options = {}) {
  if (!event?.id) return []

  if (!shouldSyncTimetableToBattery(event, options.linkedTodoFrequence)) {
    await deleteBatteryEntriesForSource(
      supabase,
      userId,
      BATTERY_SOURCE_TYPES.TIMETABLE,
      event.id,
    )
    return []
  }

  const dayIsos = enumerateTimetableEventDays(event)
  if (!dayIsos.length) {
    await deleteBatteryEntriesForSource(
      supabase,
      userId,
      BATTERY_SOURCE_TYPES.TIMETABLE,
      event.id,
    )
    return []
  }

  return syncPlannedEntriesForSource(supabase, userId, {
    sourceType: BATTERY_SOURCE_TYPES.TIMETABLE,
    sourceId: event.id,
    label: event.title || 'Activité',
    cost: options.cost,
    dayIsos,
    preserveExistingCost: options.preserveExistingCost,
  })
}

/**
 * Quand un TODO est aussi sur l’EDT, on privilégie les sources timetable
 * et on retire l’éventuelle entrée « todo » pour éviter les doublons.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} todoId
 */
export async function clearTodoBatteryWhenTimetableLinked(supabase, userId, todoId) {
  if (!todoId) return
  await deleteBatteryEntriesForSource(supabase, userId, BATTERY_SOURCE_TYPES.TODO, todoId)
}

/**
 * Coût Batterie déjà lié (première entrée trouvée), sinon null.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Array<{ sourceType: string, sourceId: string }>} sources
 */
export async function getLinkedBatteryCost(supabase, userId, sources) {
  for (const source of sources ?? []) {
    if (!source?.sourceType || !source?.sourceId) continue
    const rows = await listBatteryEntriesForSource(
      supabase,
      userId,
      source.sourceType,
      source.sourceId,
    )
    if (rows.length) return Number(rows[0].cost) || 0
  }
  return null
}
