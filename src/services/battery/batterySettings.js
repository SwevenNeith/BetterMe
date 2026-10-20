import { BATTERY_BASE_DEFAULT } from '../../utils/battery/batteryMath.js'

const TABLE = 'battery_settings'

const COLUMNS = 'user_id, base_energy, last_base_adjust_date, updated_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function getBatterySettings(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  if (data) {
    return {
      user_id: data.user_id,
      base_energy: Number(data.base_energy) || BATTERY_BASE_DEFAULT,
      last_base_adjust_date: data.last_base_adjust_date ?? null,
      updated_at: data.updated_at,
    }
  }

  const { data: created, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      base_energy: BATTERY_BASE_DEFAULT,
    })
    .select(COLUMNS)
    .single()

  if (insertError) {
    if (insertError.code === '23505') return getBatterySettings(supabase, userId)
    throw insertError
  }

  return {
    user_id: created.user_id,
    base_energy: Number(created.base_energy) || BATTERY_BASE_DEFAULT,
    last_base_adjust_date: created.last_base_adjust_date ?? null,
    updated_at: created.updated_at,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ base_energy?: number, last_base_adjust_date?: string | null }} patch
 */
export async function updateBatterySettings(supabase, userId, patch) {
  const payload = {
    updated_at: new Date().toISOString(),
  }
  if (patch.base_energy != null) {
    const n = Math.round(Number(patch.base_energy))
    payload.base_energy = Math.max(1, Math.min(40, n))
  }
  if ('last_base_adjust_date' in patch) {
    payload.last_base_adjust_date = patch.last_base_adjust_date
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, ...payload }, { onConflict: 'user_id' })
    .select(COLUMNS)
    .single()

  if (error) throw error
  return data
}
