import { BATTERY_ENTRY_KINDS } from '../../constants/battery/battery.js'
import {
  BATTERY_BASE_DEFAULT,
  calibrationSignalForDay,
  carryoverFromPreviousDay,
  computeDayBudget,
  hoursBetweenTimes,
  shiftDayIso,
  learnedDefaultFromTwoWeeks,
  normalizeBatteryCost,
  sumEntryCosts,
  toDayDateIso,
  toTimeInputValue,
  weeklyBaseAdjustment,
} from '../../utils/battery/batteryMath.js'
import {
  listRecentActivityUsages,
  updateBatteryActivity,
} from './batteryActivities.js'
import { getBatterySettings, updateBatterySettings } from './batterySettings.js'

async function refreshBatteryPlanningReminder(userId) {
  if (!userId) return
  try {
    const { rescheduleBatteryPlanningReminder } = await import('./batteryPlanningNotifications.js')
    await rescheduleBatteryPlanningReminder(userId)
  } catch (err) {
    console.error('refreshBatteryPlanningReminder:', err)
  }
}

const DAYS_TABLE = 'battery_days'
const ENTRIES_TABLE = 'battery_day_entries'

const DAY_COLUMNS =
  'id, user_id, day_date, morning_energy, sleep_quality, sleep_bedtime, sleep_wake_time, sleep_out_of_bed_time, sleep_hours, evening_feeling, base_snapshot, carryover, computed_budget, calibration_signal, notes, created_at, updated_at'

/**
 * @param {unknown} value
 * @returns {string | null} HH:MM:SS pour Postgres time, ou null
 */
function normalizeTimeValue(value) {
  if (value == null || value === '') return null
  const hhmm = toTimeInputValue(value)
  if (!hhmm) return null
  return `${hhmm}:00`
}

const ENTRY_COLUMNS =
  'id, user_id, day_id, activity_id, label, cost, kind, sort_order, source_type, source_id, completed_actual_id, created_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dayIso
 */
async function fetchDayRow(supabase, userId, dayIso) {
  const { data, error } = await supabase
    .from(DAYS_TABLE)
    .select(DAY_COLUMNS)
    .eq('user_id', userId)
    .eq('day_date', dayIso)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dayId
 */
export async function listDayEntries(supabase, dayId) {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select(ENTRY_COLUMNS)
    .eq('day_id', dayId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dayIso
 */
async function computeCarryoverForDay(supabase, userId, dayIso) {
  const prevIso = shiftDayIso(dayIso, -1)
  const prev = await fetchDayRow(supabase, userId, prevIso)
  if (!prev) return 0

  const entries = await listDayEntries(supabase, prev.id)
  const actual = entries.filter((e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL)
  const spent = sumEntryCosts(actual)
  return carryoverFromPreviousDay(prev.computed_budget, spent)
}

/**
 * Recalcule et persiste budget + signal pour un jour existant.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} dayRow
 * @param {{ base?: number, entries?: object[] }} [opts]
 */
async function recomputeAndPersistDay(supabase, userId, dayRow, opts = {}) {
  const settings = opts.base != null ? null : await getBatterySettings(supabase, userId)
  const base =
    opts.base != null
      ? Number(opts.base)
      : Number(settings?.base_energy) || BATTERY_BASE_DEFAULT

  const carryover = await computeCarryoverForDay(supabase, userId, dayRow.day_date)

  const computed_budget = computeDayBudget({
    base,
    morningEnergy: dayRow.morning_energy,
    sleepQuality: dayRow.sleep_quality,
    carryover,
  })

  const entries = opts.entries ?? (await listDayEntries(supabase, dayRow.id))
  const spent = sumEntryCosts(entries.filter((e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL))
  const calibration_signal = calibrationSignalForDay(
    computed_budget,
    spent,
    dayRow.evening_feeling,
  )

  const { data, error } = await supabase
    .from(DAYS_TABLE)
    .update({
      base_snapshot: base,
      carryover,
      computed_budget,
      calibration_signal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dayRow.id)
    .eq('user_id', userId)
    .select(DAY_COLUMNS)
    .single()

  if (error) throw error
  return { day: data, entries }
}

/**
 * Assure l’existence du jour et retourne jour + entrées.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | Date} [date]
 */
export async function ensureBatteryDay(supabase, userId, date = new Date()) {
  const dayIso = toDayDateIso(date)
  let day = await fetchDayRow(supabase, userId, dayIso)

  if (!day) {
    const settings = await getBatterySettings(supabase, userId)
    const carryover = await computeCarryoverForDay(supabase, userId, dayIso)
    const computed_budget = computeDayBudget({
      base: settings.base_energy,
      morningEnergy: null,
      sleepQuality: null,
      carryover,
    })

    const { data, error } = await supabase
      .from(DAYS_TABLE)
      .insert({
        user_id: userId,
        day_date: dayIso,
        base_snapshot: settings.base_energy,
        carryover,
        computed_budget,
        calibration_signal: 0,
      })
      .select(DAY_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        day = await fetchDayRow(supabase, userId, dayIso)
      } else {
        throw error
      }
    } else {
      day = data
    }
  }

  const refreshed = await recomputeAndPersistDay(supabase, userId, day)
  return refreshed
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dayIso
 * @param {{
 *   morning_energy?: number | null,
 *   sleep_quality?: string | null,
 *   sleep_bedtime?: string | null,
 *   sleep_wake_time?: string | null,
 *   sleep_out_of_bed_time?: string | null,
 *   evening_feeling?: string | null,
 *   notes?: string | null,
 * }} patch
 */
export async function updateBatteryDay(supabase, userId, dayIso, patch) {
  const ensured = await ensureBatteryDay(supabase, userId, dayIso)
  const payload = { updated_at: new Date().toISOString() }

  if ('morning_energy' in patch) {
    const n = patch.morning_energy == null ? null : Number(patch.morning_energy)
    payload.morning_energy = n == null || !Number.isFinite(n) ? null : Math.min(5, Math.max(1, Math.round(n)))
  }
  if ('sleep_quality' in patch) {
    const q = patch.sleep_quality
    payload.sleep_quality = q && ['bad', 'ok', 'good'].includes(q) ? q : null
  }
  if ('sleep_bedtime' in patch) {
    payload.sleep_bedtime = normalizeTimeValue(patch.sleep_bedtime)
  }
  if ('sleep_wake_time' in patch) {
    payload.sleep_wake_time = normalizeTimeValue(patch.sleep_wake_time)
  }
  if ('sleep_out_of_bed_time' in patch) {
    payload.sleep_out_of_bed_time = normalizeTimeValue(patch.sleep_out_of_bed_time)
  }
  if ('evening_feeling' in patch) {
    const f = patch.evening_feeling
    payload.evening_feeling = f && ['empty', 'just', 'left'].includes(f) ? f : null
  }
  if ('notes' in patch) {
    payload.notes = patch.notes == null ? null : String(patch.notes)
  }

  // Recalcule sleep_hours à partir de coucher → réveil (après merge avec l’existant)
  const nextBed =
    'sleep_bedtime' in payload ? payload.sleep_bedtime : ensured.day.sleep_bedtime
  const nextWake =
    'sleep_wake_time' in payload ? payload.sleep_wake_time : ensured.day.sleep_wake_time
  const computedHours = hoursBetweenTimes(nextBed, nextWake)
  payload.sleep_hours = computedHours

  const { data, error } = await supabase
    .from(DAYS_TABLE)
    .update(payload)
    .eq('id', ensured.day.id)
    .eq('user_id', userId)
    .select(DAY_COLUMNS)
    .single()

  if (error) throw error

  const result = await recomputeAndPersistDay(supabase, userId, data, {
    entries: ensured.entries,
  })

  if (payload.evening_feeling) {
    await maybeApplyWeeklyBaseAdjustment(supabase, userId, dayIso)
    const again = await recomputeAndPersistDay(supabase, userId, result.day, {
      entries: result.entries,
    })
    return again
  }

  return result
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dayIso
 */
async function maybeApplyWeeklyBaseAdjustment(supabase, userId, dayIso) {
  const settings = await getBatterySettings(supabase, userId)
  if (settings.last_base_adjust_date) {
    const last = settings.last_base_adjust_date
    const daysSince =
      (new Date(`${dayIso}T00:00:00`).getTime() -
        new Date(`${last}T00:00:00`).getTime()) /
      (24 * 60 * 60 * 1000)
    if (daysSince < 7) return
  }

  const from = shiftDayIso(dayIso, -6)
  const { data, error } = await supabase
    .from(DAYS_TABLE)
    .select('calibration_signal, evening_feeling, day_date')
    .eq('user_id', userId)
    .gte('day_date', from)
    .lte('day_date', dayIso)
    .order('day_date', { ascending: true })

  if (error) throw error

  const signals = (data ?? [])
    .filter((row) => row.evening_feeling)
    .map((row) => Number(row.calibration_signal) || 0)

  const adj = weeklyBaseAdjustment(signals)
  if (adj === 0) return

  await updateBatterySettings(supabase, userId, {
    base_energy: settings.base_energy + adj,
    last_base_adjust_date: dayIso,
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dayIso
 * @param {{
 *   label: string,
 *   cost: number,
 *   kind?: 'planned'|'actual',
 *   activity_id?: string | null,
 *   source_type?: string | null,
 *   source_id?: string | null,
 * }} payload
 */
export async function addBatteryEntry(supabase, userId, dayIso, payload) {
  const { day, entries } = await ensureBatteryDay(supabase, userId, dayIso)
  const label = String(payload.label ?? '').trim()
  if (!label) throw new Error('Indique un libellé.')

  const kind =
    payload.kind === BATTERY_ENTRY_KINDS.PLANNED
      ? BATTERY_ENTRY_KINDS.PLANNED
      : BATTERY_ENTRY_KINDS.ACTUAL
  const cost = normalizeBatteryCost(payload.cost)
  const sort_order = entries.filter((e) => e.kind === kind).length

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .insert({
      user_id: userId,
      day_id: day.id,
      activity_id: payload.activity_id || null,
      label,
      cost,
      kind,
      sort_order,
      source_type: payload.source_type || null,
      source_id: payload.source_id || null,
    })
    .select(ENTRY_COLUMNS)
    .single()

  if (error) throw error

  if (kind === BATTERY_ENTRY_KINDS.ACTUAL && data.activity_id) {
    await maybeLearnDefaultCost(supabase, userId, data.activity_id, cost, data.id)
  }

  const result = await recomputeAndPersistDay(supabase, userId, day)
  if (kind === BATTERY_ENTRY_KINDS.PLANNED) {
    await refreshBatteryPlanningReminder(userId)
  }
  return result
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 * @param {{ label?: string, cost?: number }} patch
 */
export async function updateBatteryEntry(supabase, userId, entryId, patch) {
  const { data: existing, error: fetchError } = await supabase
    .from(ENTRIES_TABLE)
    .select(ENTRY_COLUMNS)
    .eq('id', entryId)
    .eq('user_id', userId)
    .single()

  if (fetchError) throw fetchError

  const payload = {}
  if (typeof patch.label === 'string') {
    const label = patch.label.trim()
    if (!label) throw new Error('Indique un libellé.')
    payload.label = label
  }
  if (patch.cost != null) {
    payload.cost = normalizeBatteryCost(patch.cost)
  }

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .update(payload)
    .eq('id', entryId)
    .eq('user_id', userId)
    .select(ENTRY_COLUMNS)
    .single()

  if (error) throw error

  if (
    data.kind === BATTERY_ENTRY_KINDS.ACTUAL &&
    data.activity_id &&
    patch.cost != null
  ) {
    await maybeLearnDefaultCost(supabase, userId, data.activity_id, data.cost, data.id)
  }

  const day = await supabase
    .from(DAYS_TABLE)
    .select(DAY_COLUMNS)
    .eq('id', existing.day_id)
    .single()

  if (day.error) throw day.error
  return recomputeAndPersistDay(supabase, userId, day.data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 */
export async function deleteBatteryEntry(supabase, userId, entryId) {
  const { data: existing, error: fetchError } = await supabase
    .from(ENTRIES_TABLE)
    .select(`${ENTRY_COLUMNS}, day_id`)
    .eq('id', entryId)
    .eq('user_id', userId)
    .single()

  if (fetchError) throw fetchError

  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)

  if (error) throw error

  const { data: day, error: dayError } = await supabase
    .from(DAYS_TABLE)
    .select(DAY_COLUMNS)
    .eq('id', existing.day_id)
    .single()

  if (dayError) throw dayError
  const result = await recomputeAndPersistDay(supabase, userId, day)
  if (existing.kind === BATTERY_ENTRY_KINDS.PLANNED) {
    await refreshBatteryPlanningReminder(userId)
  }
  return { ...result, deletedEntry: existing }
}

/**
 * Charge une entrée Batterie (pour suppression liée).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 */
export async function getBatteryEntry(supabase, userId, entryId) {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select(ENTRY_COLUMNS)
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export const BATTERY_UPDATED_EVENT = 'betterme-battery-updated'

export function notifyBatteryUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BATTERY_UPDATED_EVENT))
}

/**
 * Persiste l’ordre d’une liste d’entrées (sort_order = index).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Array<{ id: string }>} orderedEntries
 */
export async function persistBatteryEntryOrders(supabase, userId, orderedEntries) {
  if (!userId || !orderedEntries?.length) return

  const results = await Promise.all(
    orderedEntries.map((entry, index) =>
      supabase
        .from(ENTRIES_TABLE)
        .update({ sort_order: index })
        .eq('id', entry.id)
        .eq('user_id', userId),
    ),
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error

  notifyBatteryUpdated()
}

/** @param {{ completed_actual_id?: string | null, kind?: string } | null | undefined} entry */
export function isPlannedEntryDone(entry) {
  return (
    entry?.kind === BATTERY_ENTRY_KINDS.PLANNED && Boolean(entry?.completed_actual_id)
  )
}

/**
 * Crée l’entrée réelle correspondante en laissant le prévu en place (lié via completed_actual_id).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 * @param {{ cost?: number | null }} [opts]
 */
export async function completePlannedBatteryEntry(supabase, userId, entryId, opts = {}) {
  const { data: existing, error: fetchError } = await supabase
    .from(ENTRIES_TABLE)
    .select(ENTRY_COLUMNS)
    .eq('id', entryId)
    .eq('user_id', userId)
    .single()

  if (fetchError) throw fetchError
  if (!existing || existing.kind !== BATTERY_ENTRY_KINDS.PLANNED) {
    throw new Error('Cette activité prévue est introuvable.')
  }
  if (existing.completed_actual_id) {
    throw new Error('Cette activité est déjà marquée comme faite.')
  }

  const cost =
    opts.cost == null
      ? normalizeBatteryCost(existing.cost)
      : normalizeBatteryCost(opts.cost)

  const { data: actualRows, error: countError } = await supabase
    .from(ENTRIES_TABLE)
    .select('id')
    .eq('day_id', existing.day_id)
    .eq('kind', BATTERY_ENTRY_KINDS.ACTUAL)

  if (countError) throw countError

  const { data: actual, error: insertError } = await supabase
    .from(ENTRIES_TABLE)
    .insert({
      user_id: userId,
      day_id: existing.day_id,
      activity_id: existing.activity_id || null,
      label: existing.label,
      cost,
      kind: BATTERY_ENTRY_KINDS.ACTUAL,
      sort_order: (actualRows ?? []).length,
    })
    .select(ENTRY_COLUMNS)
    .single()

  if (insertError) throw insertError

  const { error: linkError } = await supabase
    .from(ENTRIES_TABLE)
    .update({ completed_actual_id: actual.id })
    .eq('id', existing.id)
    .eq('user_id', userId)

  if (linkError) {
    // Colonne absente → bascule ancienne logique (convertir le prévu en réel).
    if (
      linkError.code === 'PGRST204' ||
      String(linkError.message || '').includes('completed_actual_id')
    ) {
      await supabase.from(ENTRIES_TABLE).delete().eq('id', actual.id).eq('user_id', userId)
      const { data: converted, error: convertError } = await supabase
        .from(ENTRIES_TABLE)
        .update({
          kind: BATTERY_ENTRY_KINDS.ACTUAL,
          cost,
          sort_order: (actualRows ?? []).length,
        })
        .eq('id', entryId)
        .eq('user_id', userId)
        .select(ENTRY_COLUMNS)
        .single()
      if (convertError) throw convertError
      if (converted.activity_id) {
        await maybeLearnDefaultCost(
          supabase,
          userId,
          converted.activity_id,
          converted.cost,
          converted.id,
        )
      }
    } else {
      await supabase.from(ENTRIES_TABLE).delete().eq('id', actual.id).eq('user_id', userId)
      throw linkError
    }
  } else if (actual.activity_id) {
    await maybeLearnDefaultCost(supabase, userId, actual.activity_id, actual.cost, actual.id)
  }

  const { data: day, error: dayError } = await supabase
    .from(DAYS_TABLE)
    .select(DAY_COLUMNS)
    .eq('id', existing.day_id)
    .single()

  if (dayError) throw dayError
  const result = await recomputeAndPersistDay(supabase, userId, day)
  await refreshBatteryPlanningReminder(userId)
  notifyBatteryUpdated()
  return result
}

/**
 * Copie les entrées planifiées vers le réel (si le réel est vide).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dayIso
 */
export async function copyPlannedToActual(supabase, userId, dayIso) {
  const { day, entries } = await ensureBatteryDay(supabase, userId, dayIso)
  const planned = entries.filter((e) => e.kind === BATTERY_ENTRY_KINDS.PLANNED)
  const actual = entries.filter((e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL)
  if (!planned.length || actual.length) return { day, entries }

  const rows = planned.map((e, i) => ({
    user_id: userId,
    day_id: day.id,
    activity_id: e.activity_id,
    label: e.label,
    cost: e.cost,
    kind: BATTERY_ENTRY_KINDS.ACTUAL,
    sort_order: i,
  }))

  const { error } = await supabase.from(ENTRIES_TABLE).insert(rows)
  if (error) throw error
  return recomputeAndPersistDay(supabase, userId, day)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} activityId
 * @param {number} cost
 * @param {string} entryId
 */
async function maybeLearnDefaultCost(supabase, userId, activityId, cost, entryId) {
  const { data: activity, error: activityError } = await supabase
    .from('battery_activities')
    .select('default_cost')
    .eq('id', activityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (activityError) throw activityError
  const defaultCost = Number(activity?.default_cost) || 0

  const recent = await listRecentActivityUsages(supabase, userId, activityId, {
    excludeEntryId: entryId,
    limit: 40,
  })

  // Inclure l’entrée courante (avec sa date de jour)
  const { data: current, error: currentError } = await supabase
    .from('battery_day_entries')
    .select('id, cost, day:battery_days!inner(day_date)')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle()

  if (currentError) throw currentError

  const usages = [
    {
      id: entryId,
      cost: Number(cost) || 0,
      day_date: current?.day?.day_date || toDayDateIso(new Date()),
    },
    ...recent,
  ]

  const learned = learnedDefaultFromTwoWeeks(usages, defaultCost)
  if (learned == null) return
  await updateBatteryActivity(supabase, userId, activityId, { default_cost: learned })
}

/**
 * Historique des jours avec dépenses.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ days?: number, from?: string, to?: string }} [opts]
 */
export async function listBatteryHistory(supabase, userId, opts = {}) {
  const today = toDayDateIso(new Date())
  let to = opts.to ? toDayDateIso(opts.to) : today
  let from = opts.from ? toDayDateIso(opts.from) : ''

  if (!from) {
    const days = Math.max(1, Number(opts.days) || 30)
    from = shiftDayIso(to, -(days - 1))
  }

  if (from > to) {
    const swap = from
    from = to
    to = swap
  }

  const { data: dayRows, error } = await supabase
    .from(DAYS_TABLE)
    .select(DAY_COLUMNS)
    .eq('user_id', userId)
    .gte('day_date', from)
    .lte('day_date', to)
    .order('day_date', { ascending: true })

  if (error) throw error

  const ids = (dayRows ?? []).map((d) => d.id)
  /** @type {Record<string, object[]>} */
  const entriesByDay = {}
  if (ids.length) {
    const { data: entries, error: entriesError } = await supabase
      .from(ENTRIES_TABLE)
      .select(ENTRY_COLUMNS)
      .eq('user_id', userId)
      .in('day_id', ids)

    if (entriesError) throw entriesError
    for (const entry of entries ?? []) {
      if (!entriesByDay[entry.day_id]) entriesByDay[entry.day_id] = []
      entriesByDay[entry.day_id].push(entry)
    }
  }

  return (dayRows ?? [])
    .map((day) => {
      const entries = entriesByDay[day.id] ?? []
      const actual = entries.filter((e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL)
      const planned = entries.filter((e) => e.kind === BATTERY_ENTRY_KINDS.PLANNED)
      const spent = sumEntryCosts(actual)
      const plannedSpent = sumEntryCosts(planned)
      return {
        ...day,
        entries,
        spent,
        plannedSpent,
        remaining: Number(day.computed_budget) - spent,
      }
    })
    // Pas de jour « vide » (0 dépensé sans activité réelle) dans l’historique.
    .filter((day) => (day.entries ?? []).some((e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL))
}

/**
 * Entrées prévues du jour (lecture seule si le jour existe déjà).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | Date} [date]
 */
export async function listBatteryPlannedForDay(supabase, userId, date = new Date()) {
  const dayIso = toDayDateIso(date)
  let day = await fetchDayRow(supabase, userId, dayIso)
  let entries

  if (day) {
    entries = await listDayEntries(supabase, day.id)
  } else {
    const ensured = await ensureBatteryDay(supabase, userId, dayIso)
    day = ensured.day
    entries = ensured.entries
  }

  return {
    day,
    planned: (entries ?? []).filter((e) => e.kind === BATTERY_ENTRY_KINDS.PLANNED),
  }
}

/**
 * Snapshot compact pour le widget Dashboard (lecture seule si le jour existe).
 * Évite un recompute+UPDATE à chaque affichage du dashboard.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string | Date} [date]
 */
export async function getBatteryDashboardSnapshot(supabase, userId, date = new Date()) {
  const dayIso = toDayDateIso(date)
  let day = await fetchDayRow(supabase, userId, dayIso)
  let entries

  if (day) {
    entries = await listDayEntries(supabase, day.id)
  } else {
    const ensured = await ensureBatteryDay(supabase, userId, dayIso)
    day = ensured.day
    entries = ensured.entries
  }

  const actual = (entries ?? []).filter((e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL)
  const planned = (entries ?? []).filter((e) => e.kind === BATTERY_ENTRY_KINDS.PLANNED)
  const spent = sumEntryCosts(actual)
  const plannedSpent = sumEntryCosts(planned)
  const budget = Number(day.computed_budget) || 0
  return {
    day,
    budget,
    spent,
    plannedSpent,
    planOverBudget: planned.length > 0 && plannedSpent > budget,
    remaining: budget - spent,
  }
}
