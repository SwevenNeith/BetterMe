const TABLE = 'battery_activities'

import {
  BATTERY_DEFAULT_PRIORITY,
  normalizeBatteryPriority,
} from '../../constants/battery/battery.js'
import { normalizeBatteryCost } from '../../utils/battery/batteryMath.js'
import { normalizeDurationMinutes } from '../../utils/battery/batteryDuration.js'

const COLUMNS =
  'id, user_id, name, default_cost, default_duration_minutes, default_all_day, category_id, priority, created_at, updated_at'

const LEGACY_COLUMNS =
  'id, user_id, name, default_cost, default_duration_minutes, default_all_day, created_at, updated_at'

function withActivityDefaults(row) {
  if (!row) return row
  return {
    ...row,
    category_id: row.category_id ?? null,
    priority: normalizeBatteryPriority(row.priority || BATTERY_DEFAULT_PRIORITY),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listBatteryActivities(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('category_id') ||
      String(error.message || '').includes('priority')
    ) {
      const legacy = await supabase
        .from(TABLE)
        .select(LEGACY_COLUMNS)
        .eq('user_id', userId)
        .order('name', { ascending: true })
      if (legacy.error) throw legacy.error
      return (legacy.data ?? []).map(withActivityDefaults)
    }
    throw error
  }
  return (data ?? []).map(withActivityDefaults)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} query
 */
export async function searchBatteryActivities(supabase, userId, query) {
  const q = String(query ?? '').trim()
  if (!q) return listBatteryActivities(supabase, userId)

  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(40)

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('category_id') ||
      String(error.message || '').includes('priority')
    ) {
      const legacy = await supabase
        .from(TABLE)
        .select(LEGACY_COLUMNS)
        .eq('user_id', userId)
        .ilike('name', `%${q}%`)
        .order('name', { ascending: true })
        .limit(40)
      if (legacy.error) throw legacy.error
      return (legacy.data ?? []).map(withActivityDefaults)
    }
    throw error
  }
  return (data ?? []).map(withActivityDefaults)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} activityId
 */
export async function getBatteryActivity(supabase, userId, activityId) {
  if (!activityId) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('id', activityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('category_id') ||
      String(error.message || '').includes('priority')
    ) {
      const legacy = await supabase
        .from(TABLE)
        .select(LEGACY_COLUMNS)
        .eq('id', activityId)
        .eq('user_id', userId)
        .maybeSingle()
      if (legacy.error) throw legacy.error
      return withActivityDefaults(legacy.data)
    }
    throw error
  }
  return withActivityDefaults(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   name: string,
 *   default_cost?: number,
 *   default_duration_minutes?: number | null,
 *   default_all_day?: boolean,
 *   category_id?: string | null,
 *   priority?: string,
 * }} payload
 */
export async function createBatteryActivity(supabase, userId, payload) {
  const name = String(payload.name ?? '').trim()
  if (!name) throw new Error('Indique un nom d’activité.')

  const default_cost = Number.isFinite(Number(payload.default_cost))
    ? normalizeBatteryCost(payload.default_cost)
    : 1

  const default_all_day = Boolean(payload.default_all_day)
  const default_duration_minutes = default_all_day
    ? null
    : normalizeDurationMinutes(payload.default_duration_minutes)

  const category_id = payload.category_id || null
  if (!category_id) {
    throw new Error('Choisis une catégorie EDT pour cette activité.')
  }

  const priority = normalizeBatteryPriority(payload.priority)

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name,
      default_cost,
      default_duration_minutes,
      default_all_day,
      category_id,
      priority,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Cette activité existe déjà dans le catalogue.')
    }
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('default_duration') ||
      String(error.message || '').includes('category_id') ||
      String(error.message || '').includes('priority')
    ) {
      const fallbackPayload = { user_id: userId, name, default_cost }
      const fallback = await supabase
        .from(TABLE)
        .insert(fallbackPayload)
        .select('id, user_id, name, default_cost, created_at, updated_at')
        .single()
      if (fallback.error) {
        if (fallback.error.code === '23505') {
          throw new Error('Cette activité existe déjà dans le catalogue.')
        }
        throw fallback.error
      }
      return withActivityDefaults({
        ...fallback.data,
        default_duration_minutes: null,
        default_all_day: false,
        category_id,
        priority,
      })
    }
    throw error
  }
  return withActivityDefaults(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} activityId
 * @param {{
 *   name?: string,
 *   default_cost?: number,
 *   default_duration_minutes?: number | null,
 *   default_all_day?: boolean,
 *   category_id?: string | null,
 *   priority?: string,
 * }} patch
 */
export async function updateBatteryActivity(supabase, userId, activityId, patch) {
  const payload = { updated_at: new Date().toISOString() }
  if (typeof patch.name === 'string') {
    const name = patch.name.trim()
    if (!name) throw new Error('Indique un nom d’activité.')
    payload.name = name
  }
  if (patch.default_cost != null) {
    payload.default_cost = normalizeBatteryCost(patch.default_cost)
  }
  if ('default_all_day' in patch || 'default_duration_minutes' in patch) {
    const allDay = 'default_all_day' in patch ? Boolean(patch.default_all_day) : undefined
    if (allDay === true) {
      payload.default_all_day = true
      payload.default_duration_minutes = null
    } else if (allDay === false || 'default_duration_minutes' in patch) {
      payload.default_all_day = false
      payload.default_duration_minutes = normalizeDurationMinutes(patch.default_duration_minutes)
    }
  }
  if ('category_id' in patch) {
    const category_id = patch.category_id || null
    if (!category_id) throw new Error('Choisis une catégorie EDT pour cette activité.')
    payload.category_id = category_id
  }
  if ('priority' in patch) {
    payload.priority = normalizeBatteryPriority(patch.priority)
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', activityId)
    .eq('user_id', userId)
    .select(COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Cette activité existe déjà dans le catalogue.')
    }
    throw error
  }
  return withActivityDefaults(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} activityId
 */
export async function deleteBatteryActivity(supabase, userId, activityId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', activityId)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * Utilisations réelles récentes d’une activité (avec date du jour), plus récent en premier.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} activityId
 * @param {{ excludeEntryId?: string|null, limit?: number }} [opts]
 * @returns {Promise<{
 *   id: string,
 *   cost: number,
 *   day_date: string,
 *   duration_minutes: number | null,
 *   duration_all_day: boolean,
 *   has_duration_override: boolean,
 * }[]>}
 */
export async function listRecentActivityUsages(supabase, userId, activityId, opts = {}) {
  const limit = Math.max(8, Number(opts.limit) || 40)
  const { data, error } = await supabase
    .from('battery_day_entries')
    .select(
      'id, cost, duration_minutes, duration_all_day, has_duration_override, created_at, day:battery_days!inner(day_date)',
    )
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .eq('kind', 'actual')
    .order('created_at', { ascending: false })
    .limit(limit + 4)

  if (error) {
    if (
      error.code === 'PGRST204' ||
      String(error.message || '').includes('duration_')
    ) {
      const legacy = await supabase
        .from('battery_day_entries')
        .select('id, cost, created_at, day:battery_days!inner(day_date)')
        .eq('user_id', userId)
        .eq('activity_id', activityId)
        .eq('kind', 'actual')
        .order('created_at', { ascending: false })
        .limit(limit + 4)
      if (legacy.error) throw legacy.error
      return (legacy.data ?? [])
        .filter((row) => !opts.excludeEntryId || row.id !== opts.excludeEntryId)
        .slice(0, limit)
        .map((row) => ({
          id: row.id,
          cost: Number(row.cost) || 0,
          day_date: row.day?.day_date || '',
          duration_minutes: null,
          duration_all_day: false,
          has_duration_override: false,
        }))
        .filter((row) => row.day_date)
    }
    throw error
  }

  return (data ?? [])
    .filter((row) => !opts.excludeEntryId || row.id !== opts.excludeEntryId)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      cost: Number(row.cost) || 0,
      day_date: row.day?.day_date || '',
      duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
      duration_all_day: Boolean(row.duration_all_day),
      has_duration_override: Boolean(row.has_duration_override),
    }))
    .filter((row) => row.day_date)
}

/**
 * @deprecated Préférer listRecentActivityUsages.
 */
export async function listRecentActivityCosts(supabase, userId, activityId, opts = {}) {
  const usages = await listRecentActivityUsages(supabase, userId, activityId, opts)
  return usages.map((u) => u.cost)
}
