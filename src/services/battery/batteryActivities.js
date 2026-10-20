const TABLE = 'battery_activities'

const COLUMNS = 'id, user_id, name, default_cost, created_at, updated_at'

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

  if (error) throw error
  return data ?? []
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

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ name: string, default_cost?: number }} payload
 */
export async function createBatteryActivity(supabase, userId, payload) {
  const name = String(payload.name ?? '').trim()
  if (!name) throw new Error('Indique un nom d’activité.')

  const default_cost = Number.isFinite(Number(payload.default_cost))
    ? Math.round(Number(payload.default_cost))
    : 1

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name,
      default_cost,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Cette activité existe déjà dans le catalogue.')
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} activityId
 * @param {{ name?: string, default_cost?: number }} patch
 */
export async function updateBatteryActivity(supabase, userId, activityId, patch) {
  const payload = { updated_at: new Date().toISOString() }
  if (typeof patch.name === 'string') {
    const name = patch.name.trim()
    if (!name) throw new Error('Indique un nom d’activité.')
    payload.name = name
  }
  if (patch.default_cost != null) {
    payload.default_cost = Math.round(Number(patch.default_cost))
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
  return data
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
 * @returns {Promise<{ id: string, cost: number, day_date: string }[]>}
 */
export async function listRecentActivityUsages(supabase, userId, activityId, opts = {}) {
  const limit = Math.max(8, Number(opts.limit) || 40)
  const { data, error } = await supabase
    .from('battery_day_entries')
    .select('id, cost, created_at, day:battery_days!inner(day_date)')
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .eq('kind', 'actual')
    .order('created_at', { ascending: false })
    .limit(limit + 4)

  if (error) throw error

  return (data ?? [])
    .filter((row) => !opts.excludeEntryId || row.id !== opts.excludeEntryId)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      cost: Number(row.cost) || 0,
      day_date: row.day?.day_date || '',
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
