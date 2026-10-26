const TABLE = 'sport_profiles'

const COLUMNS =
  'user_id, goals, weekly_sessions_goal, typical_duration_min, weight_unit, priority_muscle_ids, home_equipment_ids, gym_equipment_ids, unavailable_equipment_ids, created_at, updated_at'

function isMissingTableError(error) {
  const msg = String(error?.message || '')
  const code = error?.code
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('sport_profiles') ||
    msg.includes('Could not find the table') ||
    msg.includes('schema cache')
  )
}

export function sportMissingSchemaMessage() {
  return 'Tables Sport absentes. Exécute scripts/create-sport.sql dans le SQL Editor Supabase.'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function ensureSportProfile(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      const err = new Error(sportMissingSchemaMessage())
      err.code = 'SPORT_SCHEMA_MISSING'
      throw err
    }
    throw error
  }
  if (data) return data

  const { data: created, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      weekly_sessions_goal: 3,
      typical_duration_min: 45,
      weight_unit: 'kg',
    })
    .select(COLUMNS)
    .single()

  if (insertError) {
    if (isMissingTableError(insertError)) {
      const err = new Error(sportMissingSchemaMessage())
      err.code = 'SPORT_SCHEMA_MISSING'
      throw err
    }
    throw insertError
  }
  return created
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 */
export async function updateSportProfile(supabase, userId, patch) {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  delete payload.user_id
  delete payload.created_at

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('user_id', userId)
    .select(COLUMNS)
    .single()

  if (error) throw error
  return data
}
