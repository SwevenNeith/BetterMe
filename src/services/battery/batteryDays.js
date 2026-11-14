import {
  BATTERY_DEFAULT_PRIORITY,
  BATTERY_ENTRY_KINDS,
  BATTERY_SKIP_REASON_IDS,
  BATTERY_SOURCE_TYPES,
  normalizeBatteryPriority,
} from '../../constants/battery/battery.js'
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
  durationFieldsFromSource,
  durationFromTimetableEvent,
  durationOverridePayload,
  normalizeDurationMinutes,
  numericDurationUsagesForLearning,
  resolveBatteryDuration,
  stampDurationFromResolved,
} from '../../utils/battery/batteryDuration.js'
import { sumPlannedCostsWithoutDoubleCount } from '../../utils/battery/batteryImplications.js'
import {
  minutesBetweenHhMm,
  normalizeHhMm,
  validatePlannedSlot,
} from '../../utils/battery/batteryTime.js'
import {
  getBatteryActivity,
  listRecentActivityUsages,
  updateBatteryActivity,
} from './batteryActivities.js'
import {
  createEdtEventForBatteryPlan,
  isHobbiesCategory,
  isTimeOptionalCategory,
  resolveActivityCategory,
} from './batteryPlanToEdt.js'
import { getBatterySettings, updateBatterySettings } from './batterySettings.js'
import { loadUserCategories } from '../timetable/timetableCategories.js'
import { ensureTimetableCategory } from '../timetable/timetableEvents.js'

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
  'id, user_id, day_date, morning_energy, sleep_quality, sleep_bedtime, sleep_wake_time, sleep_out_of_bed_time, sleep_hours, evening_feeling, plan_review_at, base_snapshot, carryover, computed_budget, calibration_signal, notes, created_at, updated_at'

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
  'id, user_id, day_id, activity_id, label, cost, kind, sort_order, source_type, source_id, completed_actual_id, skip_reason, duration_minutes, duration_all_day, has_duration_override, planned_start, planned_end, priority, implied_by_entry_id, created_at'

const ENTRY_COLUMNS_LEGACY =
  'id, user_id, day_id, activity_id, label, cost, kind, sort_order, source_type, source_id, completed_actual_id, skip_reason, duration_minutes, duration_all_day, has_duration_override, created_at'

function withEntryDefaults(row) {
  if (!row) return row
  return {
    ...row,
    planned_start: row.planned_start != null ? String(row.planned_start).slice(0, 5) : null,
    planned_end: row.planned_end != null ? String(row.planned_end).slice(0, 5) : null,
    priority: row.priority ? normalizeBatteryPriority(row.priority) : null,
    implied_by_entry_id: row.implied_by_entry_id ?? null,
  }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeBatterySkipReason(value) {
  if (value == null || value === '') return null
  const id = String(value)
  return BATTERY_SKIP_REASON_IDS.includes(id) ? id : null
}

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

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('planned_start') ||
      String(error.message || '').includes('implied_by') ||
      String(error.message || '').includes('priority')
    ) {
      const legacy = await supabase
        .from(ENTRIES_TABLE)
        .select(ENTRY_COLUMNS_LEGACY)
        .eq('day_id', dayId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (legacy.error) throw legacy.error
      return (legacy.data ?? []).map(withEntryDefaults)
    }
    throw error
  }
  return (data ?? []).map(withEntryDefaults)
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
 *   duration_minutes?: number | null,
 *   duration_all_day?: boolean,
 *   has_duration_override?: boolean,
 *   planned_start?: string | null,
 *   planned_end?: string | null,
 *   priority?: string | null,
 *   category_id?: string | null,
 *   category_name?: string | null,
 *   sync_to_edt?: boolean,
 *   skip_implications?: boolean,
 *   implied_by_entry_id?: string | null,
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
  let sort_order = entries.filter((e) => e.kind === kind).length

  const activity = payload.activity_id
    ? await getBatteryActivity(supabase, userId, payload.activity_id)
    : null

  let durationFields = durationFieldsFromSource(payload)
  if (!durationFields.has_duration_override && activity) {
    if (activity.default_all_day) {
      durationFields = durationOverridePayload('all_day')
    } else if (normalizeDurationMinutes(activity.default_duration_minutes) != null) {
      durationFields = durationOverridePayload(activity.default_duration_minutes)
    }
  }

  const priority = normalizeBatteryPriority(
    payload.priority || activity?.priority || BATTERY_DEFAULT_PRIORITY,
  )

  let plannedStart = normalizeHhMm(payload.planned_start) || null
  let plannedEnd = normalizeHhMm(payload.planned_end) || null
  let categories = []
  let category = null
  let timeOptional = false

  const needsCategoryAndSlot =
    !payload.implied_by_entry_id &&
    (kind === BATTERY_ENTRY_KINDS.PLANNED || kind === BATTERY_ENTRY_KINDS.ACTUAL) &&
    !payload.source_type

  if (
    (kind === BATTERY_ENTRY_KINDS.PLANNED || kind === BATTERY_ENTRY_KINDS.ACTUAL) &&
    !payload.implied_by_entry_id
  ) {
    categories = await loadUserCategories(supabase, userId)
    if (activity?.category_id) {
      const resolved = await resolveActivityCategory(
        supabase,
        userId,
        activity.category_id,
        categories,
      )
      category = resolved.category
      categories = resolved.categories
    } else if (payload.category_id) {
      const resolved = await resolveActivityCategory(
        supabase,
        userId,
        payload.category_id,
        categories,
      )
      category = resolved.category
      categories = resolved.categories
    } else if (payload.category_name) {
      const ensured = await ensureTimetableCategory(
        supabase,
        userId,
        payload.category_name,
        categories,
      )
      category = ensured.category
      categories = ensured.categories
    }

    if (needsCategoryAndSlot && !category) {
      throw new Error('Indique une catégorie EDT.')
    }

    timeOptional = isTimeOptionalCategory(category, categories)

    // Horaires facultatifs : si les deux bornes manquent → pas de créneau.
    // Si une seule est renseignée → validation (début + fin cohérents).
    if (needsCategoryAndSlot && (plannedStart || plannedEnd)) {
      const slotError = validatePlannedSlot(plannedStart, plannedEnd)
      if (slotError) throw new Error(slotError)
    }
    if (timeOptional && !plannedStart && !plannedEnd) {
      plannedStart = null
      plannedEnd = null
    }
  }

  // Durée dérivée des horaires quand un créneau complet est fourni
  if (plannedStart && plannedEnd) {
    const fromSlot = minutesBetweenHhMm(plannedStart, plannedEnd)
    if (fromSlot != null) {
      durationFields = {
        has_duration_override: true,
        duration_minutes: fromSlot,
        duration_all_day: false,
      }
    }
  }

  const insertRow = {
    user_id: userId,
    day_id: day.id,
    activity_id: payload.activity_id || null,
    label,
    cost,
    kind,
    sort_order,
    source_type: payload.source_type || null,
    source_id: payload.source_id || null,
    planned_start: plannedStart ? `${plannedStart}:00` : null,
    planned_end: plannedEnd ? `${plannedEnd}:00` : null,
    priority,
    implied_by_entry_id: payload.implied_by_entry_id || null,
    ...durationFields,
  }

  let { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .insert(insertRow)
    .select(ENTRY_COLUMNS)
    .single()

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('planned_start') ||
      String(error.message || '').includes('priority') ||
      String(error.message || '').includes('implied_by')
    ) {
      const {
        planned_start,
        planned_end,
        priority: _p,
        implied_by_entry_id,
        ...legacyRow
      } = insertRow
      const fallback = await supabase
        .from(ENTRIES_TABLE)
        .insert(legacyRow)
        .select(ENTRY_COLUMNS_LEGACY)
        .single()
      if (fallback.error) throw fallback.error
      data = withEntryDefaults(fallback.data)
      error = null
    } else {
      throw error
    }
  } else {
    data = withEntryDefaults(data)
  }

  // Avec créneau → EDT daté. Journée entière / Hobbies sans créneau → all_day.
  // Autres catégories sans créneau ni journée entière → Batterie seule.
  // Seul le prévu synchronise l’EDT de base (le réel ne doit pas fausser le prévu).
  const hasTimedSlot = Boolean(plannedStart && plannedEnd)
  const isAllDayDuration = Boolean(durationFields?.duration_all_day)
  const hobbyPool =
    !hasTimedSlot &&
    kind === BATTERY_ENTRY_KINDS.PLANNED &&
    isHobbiesCategory(category, categories)
  const syncToEdt =
    kind === BATTERY_ENTRY_KINDS.PLANNED &&
    payload.sync_to_edt !== false &&
    !payload.source_type &&
    !payload.implied_by_entry_id &&
    (hasTimedSlot || hobbyPool || isAllDayDuration)

  if (syncToEdt) {
    try {
      data = await linkBatteryEntryToNewEdtEvent(supabase, userId, data, {
        dayIso,
        plannedStart,
        plannedEnd,
        allDay: !hasTimedSlot && (hobbyPool || isAllDayDuration),
        categoryId: activity?.category_id || category?.id || null,
        categoryName: category?.name || null,
        batteryActivityId: activity?.id || null,
        categories,
      })
    } catch (edtErr) {
      console.error('createEdtEventForBatteryPlan:', edtErr)
    }
  }

  // Les liaisons se font sur Prévu/Réel (icône lien), plus via le catalogue.

  if (kind === BATTERY_ENTRY_KINDS.ACTUAL && data.activity_id) {
    await maybeLearnDefaultCost(supabase, userId, data.activity_id, cost, data.id)
    await maybeLearnDefaultDuration(supabase, userId, data.activity_id, data, data.id)
  }

  const result = await recomputeAndPersistDay(supabase, userId, day)
  if (kind === BATTERY_ENTRY_KINDS.PLANNED) {
    await refreshBatteryPlanningReminder(userId)
  }
  return result
}

/**
 * Crée un événement EDT et le lie à l’entrée Batterie.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} entry
 * @param {{
 *   dayIso: string,
 *   plannedStart?: string | null,
 *   plannedEnd?: string | null,
 *   allDay?: boolean,
 *   categoryId?: string | null,
 *   categoryName?: string | null,
 *   batteryActivityId?: string | null,
 *   categories?: object[],
 * }} opts
 */
async function linkBatteryEntryToNewEdtEvent(supabase, userId, entry, opts) {
  const { event, categories: nextCats } = await createEdtEventForBatteryPlan(
    supabase,
    userId,
    {
      title: entry.label,
      dayIso: opts.dayIso,
      categoryId: opts.categoryId || null,
      categoryName: opts.categoryName || null,
      plannedStart: opts.plannedStart || null,
      plannedEnd: opts.plannedEnd || null,
      allDay: Boolean(opts.allDay),
      batteryActivityId: opts.batteryActivityId || entry.activity_id || null,
      priority: entry.priority || null,
    },
    opts.categories || [],
  )
  void nextCats
  const eventId = event?.id || null
  if (!eventId) return withEntryDefaults(entry)

  const { data: linked, error: linkError } = await supabase
    .from(ENTRIES_TABLE)
    .update({
      source_type: BATTERY_SOURCE_TYPES.TIMETABLE,
      source_id: eventId,
    })
    .eq('id', entry.id)
    .eq('user_id', userId)
    .select(ENTRY_COLUMNS)
    .single()

  if (linkError) throw linkError
  return withEntryDefaults(linked)
}

/**
 * Après update d’une entrée prévue : crée ou met à jour l’EDT de base.
 * Le réel n’est jamais synchronisé ici (évite de fausser le prévu).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} entry
 * @param {object} patch
 */
async function syncBatteryEntryEdtOnUpdate(supabase, userId, entry, patch) {
  if (entry.kind !== BATTERY_ENTRY_KINDS.PLANNED) return entry

  const timesTouched = 'planned_start' in patch || 'planned_end' in patch
  const durationTouched =
    patch.durationChoice != null ||
    'duration_all_day' in patch ||
    'duration_minutes' in patch ||
    'has_duration_override' in patch
  const s = normalizeHhMm(entry.planned_start)
  const e = normalizeHhMm(entry.planned_end)
  const hasTimedSlot = Boolean(s && e)
  const isAllDayDuration = Boolean(entry.duration_all_day)

  const dayRow = await supabase
    .from(DAYS_TABLE)
    .select('day_date')
    .eq('id', entry.day_id)
    .maybeSingle()
  if (dayRow.error) throw dayRow.error
  const dayIso = String(dayRow.data?.day_date || '').slice(0, 10)
  if (!dayIso) return entry

  let categories = await loadUserCategories(supabase, userId)
  let category = null
  let activity = null
  if (entry.activity_id) {
    activity = await getBatteryActivity(supabase, userId, entry.activity_id)
    if (activity?.category_id) {
      const resolved = await resolveActivityCategory(
        supabase,
        userId,
        activity.category_id,
        categories,
      )
      category = resolved.category
      categories = resolved.categories
    }
  }

  const eventId =
    entry.source_type === BATTERY_SOURCE_TYPES.TIMETABLE && entry.source_id
      ? entry.source_id
      : null

  const linkOpts = {
    dayIso,
    plannedStart: s,
    plannedEnd: e,
    categoryId: activity?.category_id || category?.id || null,
    categoryName: category?.name || null,
    batteryActivityId: activity?.id || null,
    categories,
  }

  // Créneau complet sans événement EDT → créer un EDT daté
  if (timesTouched && hasTimedSlot && !eventId) {
    return linkBatteryEntryToNewEdtEvent(supabase, userId, entry, {
      ...linkOpts,
      allDay: false,
    })
  }

  // Journée entière (ou Hobbies à placer) sans EDT → créer un all_day
  if (
    !eventId &&
    !hasTimedSlot &&
    (isAllDayDuration || isHobbiesCategory(category, categories)) &&
    (timesTouched || durationTouched || 'label' in patch || 'priority' in patch)
  ) {
    return linkBatteryEntryToNewEdtEvent(supabase, userId, entry, {
      ...linkOpts,
      allDay: true,
    })
  }

  if (!eventId) return entry

  const edtPatch = {}
  if ('label' in patch) edtPatch.title = entry.label
  if ('priority' in patch) edtPatch.priority = entry.priority

  if (timesTouched || durationTouched) {
    if (hasTimedSlot) {
      // Horaires explicites sur le prévu → créneau daté (pas journée entière)
      edtPatch.all_day = false
      edtPatch.time = `${s} - ${e}`
      edtPatch.date_start = dayIso
    } else if (!s && !e) {
      // Sans créneau : conserver / forcer journée entière (ne jamais supprimer l’EDT)
      edtPatch.all_day = true
      edtPatch.time = null
      edtPatch.date_start = dayIso
    }
  }

  if (Object.keys(edtPatch).length) {
    await supabase
      .from('timetable_events')
      .update(edtPatch)
      .eq('id', eventId)
      .eq('user_id', userId)
  }

  return entry
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 * @param {{
 *   label?: string,
 *   cost?: number,
 *   duration_minutes?: number | null,
 *   duration_all_day?: boolean,
 *   has_duration_override?: boolean,
 *   durationChoice?: 'reset' | 'all_day' | number,
 *   planned_start?: string | null,
 *   planned_end?: string | null,
 *   priority?: string | null,
 * }} patch
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
  if (patch.durationChoice != null) {
    Object.assign(payload, durationOverridePayload(patch.durationChoice))
  } else if (
    'has_duration_override' in patch ||
    'duration_minutes' in patch ||
    'duration_all_day' in patch
  ) {
    Object.assign(payload, durationFieldsFromSource(patch))
  }
  if ('planned_start' in patch) {
    const start = normalizeHhMm(patch.planned_start)
    payload.planned_start = start ? `${start}:00` : null
  }
  if ('planned_end' in patch) {
    const end = normalizeHhMm(patch.planned_end)
    payload.planned_end = end ? `${end}:00` : null
  }
  if ('priority' in patch) {
    payload.priority = patch.priority
      ? normalizeBatteryPriority(patch.priority)
      : null
  }
  if ('implied_by_entry_id' in patch) {
    payload.implied_by_entry_id = patch.implied_by_entry_id || null
  }

  // Si les deux bornes horaires sont connues après patch → durée dérivée
  const nextStart =
    'planned_start' in patch
      ? normalizeHhMm(patch.planned_start)
      : existing.planned_start
        ? String(existing.planned_start).slice(0, 5)
        : null
  const nextEnd =
    'planned_end' in patch
      ? normalizeHhMm(patch.planned_end)
      : existing.planned_end
        ? String(existing.planned_end).slice(0, 5)
        : null
  if (
    ('planned_start' in patch || 'planned_end' in patch) &&
    nextStart &&
    nextEnd &&
    !('durationChoice' in patch) &&
    !('duration_minutes' in patch)
  ) {
    const fromSlot = minutesBetweenHhMm(nextStart, nextEnd)
    if (fromSlot != null) {
      payload.has_duration_override = true
      payload.duration_minutes = fromSlot
      payload.duration_all_day = false
    }
  }

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .update(payload)
    .eq('id', entryId)
    .eq('user_id', userId)
    .select(ENTRY_COLUMNS)
    .single()

  if (error) throw error
  const normalized = withEntryDefaults(data)

  const durationPatched =
    patch.durationChoice != null ||
    'has_duration_override' in patch ||
    'duration_minutes' in patch ||
    'duration_all_day' in patch ||
    Boolean(payload.duration_minutes != null && ('planned_start' in patch || 'planned_end' in patch))

  // Ne pas répercuter sur le prévu une durée dérivée des horaires du réel
  // (sinon modifier le réel fausse le prévu).
  const skipLinkedDurationFromActualTimes =
    normalized.kind === BATTERY_ENTRY_KINDS.ACTUAL &&
    ('planned_start' in patch || 'planned_end' in patch) &&
    patch.durationChoice == null &&
    !('duration_minutes' in patch) &&
    !('duration_all_day' in patch) &&
    !('has_duration_override' in patch)

  if (durationPatched && !skipLinkedDurationFromActualTimes) {
    await syncLinkedEntryDuration(supabase, userId, normalized)
  }

  // Aligner / créer l’événement EDT de base — prévu uniquement (le réel reste indépendant)
  if (
    normalized.kind === BATTERY_ENTRY_KINDS.PLANNED &&
    !normalized.implied_by_entry_id &&
    ('planned_start' in patch ||
      'planned_end' in patch ||
      'label' in patch ||
      'priority' in patch ||
      patch.durationChoice != null ||
      'duration_all_day' in patch ||
      'duration_minutes' in patch ||
      'has_duration_override' in patch)
  ) {
    try {
      const synced = await syncBatteryEntryEdtOnUpdate(supabase, userId, normalized, patch)
      if (synced) Object.assign(normalized, synced)
    } catch (edtErr) {
      console.error('sync EDT depuis updateBatteryEntry:', edtErr)
    }
  }

  if (
    normalized.kind === BATTERY_ENTRY_KINDS.ACTUAL &&
    normalized.activity_id &&
    patch.cost != null
  ) {
    await maybeLearnDefaultCost(
      supabase,
      userId,
      normalized.activity_id,
      normalized.cost,
      normalized.id,
    )
  }
  if (
    normalized.kind === BATTERY_ENTRY_KINDS.ACTUAL &&
    normalized.activity_id &&
    durationPatched
  ) {
    await maybeLearnDefaultDuration(
      supabase,
      userId,
      normalized.activity_id,
      normalized,
      normalized.id,
    )
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
 * Aligne la durée entre une entrée prévue et son réel lié (dans les deux sens).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} entry
 */
async function syncLinkedEntryDuration(supabase, userId, entry) {
  const durationPayload = {
    has_duration_override: Boolean(entry.has_duration_override),
    duration_minutes: entry.duration_all_day
      ? null
      : entry.duration_minutes == null
        ? null
        : Number(entry.duration_minutes),
    duration_all_day: Boolean(entry.duration_all_day),
  }

  if (entry.kind === BATTERY_ENTRY_KINDS.PLANNED && entry.completed_actual_id) {
    await supabase
      .from(ENTRIES_TABLE)
      .update(durationPayload)
      .eq('id', entry.completed_actual_id)
      .eq('user_id', userId)
    return
  }

  if (entry.kind === BATTERY_ENTRY_KINDS.ACTUAL) {
    const { data: planned } = await supabase
      .from(ENTRIES_TABLE)
      .select('id')
      .eq('user_id', userId)
      .eq('kind', BATTERY_ENTRY_KINDS.PLANNED)
      .eq('completed_actual_id', entry.id)
      .maybeSingle()
    if (planned?.id) {
      await supabase
        .from(ENTRIES_TABLE)
        .update(durationPayload)
        .eq('id', planned.id)
        .eq('user_id', userId)
    }
  }
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
        .update({
          sort_order:
            entry.sort_order != null && Number.isFinite(Number(entry.sort_order))
              ? Number(entry.sort_order)
              : index,
        })
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

/** @param {{ completed_actual_id?: string | null, kind?: string } | null | undefined} entry */
export function isPlannedEntryPending(entry) {
  return entry?.kind === BATTERY_ENTRY_KINDS.PLANNED && !entry?.completed_actual_id
}

/**
 * Assigne / efface la raison de non-réalisation d’une activité prévue.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} entryId
 * @param {string | null | undefined} skipReason
 */
export async function updatePlannedSkipReason(supabase, userId, entryId, skipReason) {
  const reason = normalizeBatterySkipReason(skipReason)

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

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .update({ skip_reason: reason })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select(ENTRY_COLUMNS)
    .single()

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('skip_reason')
    ) {
      throw new Error(
        'Colonne skip_reason absente. Exécute scripts/migrate-battery-skip-reason.sql dans Supabase.',
      )
    }
    throw error
  }

  notifyBatteryUpdated()
  return data
}

/**
 * Premier jour éligible à la revue du plan (≥ 23h → aujourd’hui, sinon → veille).
 * @param {Date} [now]
 */
export function resolvePlanReviewDayIso(now = new Date()) {
  const date = now instanceof Date ? now : new Date()
  const hour = date.getHours()
  const today = toDayDateIso(date)
  if (hour >= 23) return today
  return shiftDayIso(today, -1)
}

/**
 * Charge le payload de revue si nécessaire (prévu non fait + revue non validée).
 * Avant 23h : revue de la veille (ou d’un jour antérieur encore en attente).
 * À partir de 23h : revue d’aujourd’hui en priorité.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Date} [now]
 * @returns {Promise<{
 *   shouldShow: boolean,
 *   dayIso: string,
 *   day: object | null,
 *   pending: object[],
 * }>}
 */
export async function prepareBatteryPlanReview(supabase, userId, now = new Date()) {
  const date = now instanceof Date ? now : new Date()
  const today = toDayDateIso(date)
  const startOffset = date.getHours() >= 23 ? 0 : 1

  for (let offset = startOffset; offset <= 7; offset += 1) {
    const dayIso = shiftDayIso(today, -offset)
    const day = await fetchDayRow(supabase, userId, dayIso)
    if (!day || day.plan_review_at) continue

    const entries = await listDayEntries(supabase, day.id)
    const pending = entries.filter((e) => isPlannedEntryPending(e))
    if (!pending.length) continue

    return { shouldShow: true, dayIso, day, pending }
  }

  return {
    shouldShow: false,
    dayIso: resolvePlanReviewDayIso(date),
    day: null,
    pending: [],
  }
}

/**
 * Enregistre les raisons / marques « fait », puis valide la revue du plan.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dayIso
 * @param {{ entryId: string, done?: boolean, skipReason?: string | null }[]} assignments
 */
export async function submitBatteryPlanReview(supabase, userId, dayIso, assignments = []) {
  const day = await fetchDayRow(supabase, userId, dayIso)
  if (!day) throw new Error('Journée Batterie introuvable.')

  for (const row of assignments) {
    if (!row?.entryId) continue
    if (row.done) {
      try {
        await completePlannedBatteryEntry(supabase, userId, row.entryId)
      } catch (err) {
        // Déjà faite entre-temps : on ignore
        if (!String(err?.message || '').includes('déjà marquée')) throw err
      }
      continue
    }
    await updatePlannedSkipReason(supabase, userId, row.entryId, row.skipReason ?? null)
  }

  const { data, error } = await supabase
    .from(DAYS_TABLE)
    .update({
      plan_review_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', day.id)
    .eq('user_id', userId)
    .select(DAY_COLUMNS)
    .single()

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('plan_review_at')
    ) {
      throw new Error(
        'Colonne plan_review_at absente. Exécute scripts/migrate-battery-skip-reason.sql dans Supabase.',
      )
    }
    throw error
  }

  notifyBatteryUpdated()
  return data
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

  const durationStamp = await resolveDurationStampForEntry(supabase, userId, existing)

  // Si le parent prévu est déjà « Fait », reprendre sa liaison dans le Réel
  let actualImpliedBy = null
  if (existing.implied_by_entry_id) {
    const { data: plannedParent, error: parentError } = await supabase
      .from(ENTRIES_TABLE)
      .select('id, completed_actual_id')
      .eq('id', existing.implied_by_entry_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (parentError) throw parentError
    if (plannedParent?.completed_actual_id) {
      actualImpliedBy = plannedParent.completed_actual_id
    }
  }

  // Ne pas recopier source_type/source_id : l’index unique
  // battery_day_entries_source_day_uidx n’autorise qu’une entrée par source/jour
  // (le prévu garde le lien EDT/TODO ; la durée est figée via durationStamp).
  const insertPayload = {
    user_id: userId,
    day_id: existing.day_id,
    activity_id: existing.activity_id || null,
    label: existing.label,
    cost,
    kind: BATTERY_ENTRY_KINDS.ACTUAL,
    sort_order: (actualRows ?? []).length,
    planned_start: existing.planned_start || null,
    planned_end: existing.planned_end || null,
    priority: existing.priority || null,
    implied_by_entry_id: actualImpliedBy,
    ...durationStamp,
  }

  let { data: actual, error: insertError } = await supabase
    .from(ENTRIES_TABLE)
    .insert(insertPayload)
    .select(ENTRY_COLUMNS)
    .single()

  if (insertError) {
    // Colonnes absentes (migration) → insert minimal
    if (
      insertError.code === 'PGRST204' ||
      String(insertError.message || '').includes('implied_by') ||
      String(insertError.message || '').includes('planned_start') ||
      String(insertError.message || '').includes('priority')
    ) {
      const {
        planned_start,
        planned_end,
        priority,
        implied_by_entry_id,
        ...legacyInsert
      } = insertPayload
      const fallback = await supabase
        .from(ENTRIES_TABLE)
        .insert(legacyInsert)
        .select(ENTRY_COLUMNS_LEGACY)
        .single()
      if (fallback.error) throw fallback.error
      actual = withEntryDefaults(fallback.data)
      insertError = null
    } else {
      throw insertError
    }
  }

  const { error: linkError } = await supabase
    .from(ENTRIES_TABLE)
    .update({ completed_actual_id: actual.id, skip_reason: null })
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
          ...durationStamp,
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
        await maybeLearnDefaultDuration(
          supabase,
          userId,
          converted.activity_id,
          converted,
          converted.id,
        )
      }
    } else {
      await supabase.from(ENTRIES_TABLE).delete().eq('id', actual.id).eq('user_id', userId)
      throw linkError
    }
  } else {
    // Enfants déjà faits → les rattacher au parent réel nouvellement créé
    await linkCompletedChildrenActualsToParent(
      supabase,
      userId,
      existing.id,
      actual.id,
    )
    if (actual.activity_id) {
      await maybeLearnDefaultCost(supabase, userId, actual.activity_id, actual.cost, actual.id)
      await maybeLearnDefaultDuration(supabase, userId, actual.activity_id, actual, actual.id)
    }
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
 * Figé la durée effective (override / EDT / catalogue) pour une entrée réelle.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} entry
 */
async function resolveDurationStampForEntry(supabase, userId, entry) {
  if (entry?.has_duration_override) {
    return durationFieldsFromSource(entry)
  }

  let edtDuration = null
  if (entry?.source_type === BATTERY_SOURCE_TYPES.TIMETABLE && entry?.source_id) {
    const map = await fetchTimetableDurationMap(supabase, userId, [entry.source_id])
    edtDuration = map.get(String(entry.source_id)) || null
  }

  let catalog = null
  if (entry?.activity_id) {
    const { data } = await supabase
      .from('battery_activities')
      .select('default_duration_minutes, default_all_day')
      .eq('id', entry.activity_id)
      .eq('user_id', userId)
      .maybeSingle()
    catalog = data
  }

  return stampDurationFromResolved(resolveBatteryDuration(entry, edtDuration, catalog))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} eventIds
 * @returns {Promise<Map<string, { minutes: number | null, allDay: boolean }>>}
 */
export async function fetchTimetableDurationMap(supabase, userId, eventIds) {
  /** @type {Map<string, { minutes: number | null, allDay: boolean }>} */
  const map = new Map()
  const ids = [...new Set((eventIds ?? []).map(String).filter(Boolean))]
  if (!ids.length) return map

  const { data, error } = await supabase
    .from('timetable_events')
    .select('id, all_day, time')
    .eq('user_id', userId)
    .in('id', ids)

  if (error) {
    console.warn('fetchTimetableDurationMap:', error)
    return map
  }

  for (const event of data ?? []) {
    const resolved = durationFromTimetableEvent(event)
    if (resolved) map.set(String(event.id), resolved)
  }
  return map
}

/**
 * Enrichit les entrées avec la durée EDT (lecture seule) pour l’affichage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object[]} entries
 */
export async function attachEdtDurationsToEntries(supabase, userId, entries) {
  const list = Array.isArray(entries) ? entries : []
  const timetableIds = list
    .filter((e) => e?.source_type === BATTERY_SOURCE_TYPES.TIMETABLE && e?.source_id)
    .map((e) => String(e.source_id))
  const edtMap = await fetchTimetableDurationMap(supabase, userId, timetableIds)
  return list.map((entry) => ({
    ...entry,
    edt_duration:
      entry?.source_type === BATTERY_SOURCE_TYPES.TIMETABLE && entry?.source_id
        ? edtMap.get(String(entry.source_id)) || null
        : null,
  }))
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

  /** @type {Map<string, string>} plannedId → actualId */
  const plannedToActual = new Map()

  for (let i = 0; i < planned.length; i += 1) {
    const e = planned[i]
    const durationStamp = await resolveDurationStampForEntry(supabase, userId, e)
    const parentPlannedId = e.implied_by_entry_id || null
    const insertRow = {
      user_id: userId,
      day_id: day.id,
      activity_id: e.activity_id,
      label: e.label,
      cost: e.cost,
      kind: BATTERY_ENTRY_KINDS.ACTUAL,
      sort_order: i,
      planned_start: e.planned_start || null,
      planned_end: e.planned_end || null,
      priority: e.priority || null,
      // Parent réel si déjà créé dans cette passe ; sinon null puis 2ᵉ passe
      implied_by_entry_id: parentPlannedId
        ? plannedToActual.get(parentPlannedId) || null
        : null,
      // Pas de source_* : contrainte unique source/jour (lien reste sur le prévu).
      ...durationStamp,
    }

    let { data: created, error } = await supabase
      .from(ENTRIES_TABLE)
      .insert(insertRow)
      .select(ENTRY_COLUMNS)
      .single()

    if (error) {
      if (
        error.code === 'PGRST204' ||
        String(error.message || '').includes('implied_by') ||
        String(error.message || '').includes('planned_start')
      ) {
        const {
          planned_start,
          planned_end,
          priority,
          implied_by_entry_id,
          ...legacy
        } = insertRow
        const fallback = await supabase
          .from(ENTRIES_TABLE)
          .insert(legacy)
          .select(ENTRY_COLUMNS_LEGACY)
          .single()
        if (fallback.error) throw fallback.error
        created = withEntryDefaults(fallback.data)
        error = null
      } else {
        throw error
      }
    }

    plannedToActual.set(e.id, created.id)
    await supabase
      .from(ENTRIES_TABLE)
      .update({ completed_actual_id: created.id, skip_reason: null })
      .eq('id', e.id)
      .eq('user_id', userId)
  }

  // 2ᵉ passe : rattacher les enfants dont le parent a été créé après (ordre plat)
  for (const e of planned) {
    const parentPlannedId = e.implied_by_entry_id || null
    if (!parentPlannedId) continue
    const childActualId = plannedToActual.get(e.id)
    const parentActualId = plannedToActual.get(parentPlannedId)
    if (!childActualId || !parentActualId) continue
    await supabase
      .from(ENTRIES_TABLE)
      .update({ implied_by_entry_id: parentActualId })
      .eq('id', childActualId)
      .eq('user_id', userId)
  }

  return recomputeAndPersistDay(supabase, userId, day)
}

/**
 * Rattache les réels déjà créés des enfants prévus au parent réel.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} plannedParentId
 * @param {string} actualParentId
 */
async function linkCompletedChildrenActualsToParent(
  supabase,
  userId,
  plannedParentId,
  actualParentId,
) {
  if (!plannedParentId || !actualParentId) return

  const { data: plannedChildren, error } = await supabase
    .from(ENTRIES_TABLE)
    .select('id, completed_actual_id')
    .eq('user_id', userId)
    .eq('kind', BATTERY_ENTRY_KINDS.PLANNED)
    .eq('implied_by_entry_id', plannedParentId)

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('implied_by')
    ) {
      return
    }
    throw error
  }

  const childActualIds = (plannedChildren ?? [])
    .map((row) => row.completed_actual_id)
    .filter(Boolean)

  if (!childActualIds.length) return

  const { error: updateError } = await supabase
    .from(ENTRIES_TABLE)
    .update({ implied_by_entry_id: actualParentId })
    .in('id', childActualIds)
    .eq('user_id', userId)
    .eq('kind', BATTERY_ENTRY_KINDS.ACTUAL)

  if (
    updateError &&
    updateError.code !== 'PGRST204' &&
    !String(updateError.message || '').includes('implied_by')
  ) {
    throw updateError
  }
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} activityId
 * @param {{ duration_minutes?: number | null, duration_all_day?: boolean, has_duration_override?: boolean }} entry
 * @param {string} entryId
 */
async function maybeLearnDefaultDuration(supabase, userId, activityId, entry, entryId) {
  if (!entry?.has_duration_override || entry.duration_all_day) return
  const minutes = normalizeDurationMinutes(entry.duration_minutes)
  if (minutes == null) return

  const { data: activity, error: activityError } = await supabase
    .from('battery_activities')
    .select('default_duration_minutes, default_all_day')
    .eq('id', activityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (activityError) throw activityError

  const recent = await listRecentActivityUsages(supabase, userId, activityId, {
    excludeEntryId: entryId,
    limit: 40,
  })

  const { data: current, error: currentError } = await supabase
    .from('battery_day_entries')
    .select('id, duration_minutes, duration_all_day, day:battery_days!inner(day_date)')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle()

  if (currentError) {
    if (
      currentError.code === 'PGRST204' ||
      String(currentError.message || '').includes('duration_')
    ) {
      return
    }
    throw currentError
  }

  const usages = numericDurationUsagesForLearning([
    {
      day_date: current?.day?.day_date || toDayDateIso(new Date()),
      duration_minutes: minutes,
      duration_all_day: false,
    },
    ...recent,
  ])

  const currentDefault = activity?.default_all_day
    ? 0
    : Number(activity?.default_duration_minutes) || 0
  const learned = learnedDefaultFromTwoWeeks(usages, currentDefault)
  if (learned == null || learned <= 0) return
  await updateBatteryActivity(supabase, userId, activityId, {
    default_duration_minutes: learned,
    default_all_day: false,
  })
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
      const plannedSpent = sumPlannedCostsWithoutDoubleCount(planned)
      return {
        ...day,
        entries,
        spent,
        plannedSpent,
        remaining: Number(day.computed_budget) - spent,
      }
    })
    // Garde les jours avec réel ou prévu (nécessaire pour les taux de réalisation).
    .filter((day) =>
      (day.entries ?? []).some(
        (e) => e.kind === BATTERY_ENTRY_KINDS.ACTUAL || e.kind === BATTERY_ENTRY_KINDS.PLANNED,
      ),
    )
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
  const plannedSpent = sumPlannedCostsWithoutDoubleCount(planned)
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
