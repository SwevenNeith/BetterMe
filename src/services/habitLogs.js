import { HABIT_VALUE_TYPE } from '../constants/habitOptions.js'

const TABLE = 'habit_logs'

const LOG_SELECT = 'id, habit_id, date_jour, valeur, fait'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} habitId
 * @param {string} startDate ISO YYYY-MM-DD
 * @param {string} endDate ISO YYYY-MM-DD
 */
export async function listHabitLogsForRange(supabase, userId, habitId, startDate, endDate) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(LOG_SELECT)
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .gte('date_jour', startDate)
    .lte('date_jour', endDate)
    .order('date_jour', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Indique si une entrée compte comme renseignée pour l’affichage.
 * @param {{ fait?: boolean, valeur?: number|null }|null|undefined} log
 * @param {string} typeValeur
 */
export function isHabitLogFilled(log, typeValeur) {
  if (!log) return false
  if (typeValeur === HABIT_VALUE_TYPE.BOOLEAN) {
    return log.fait === true
  }
  return Number(log.valeur ?? 0) > 0
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} habitId
 * @param {string} dateJour ISO YYYY-MM-DD
 * @param {{ fait?: boolean, valeur?: number|null }} payload
 */
export async function upsertHabitLog(supabase, userId, habitId, dateJour, payload) {
  const fait = payload.fait ?? false
  const valeur = fait ? (payload.valeur ?? 0) : 0

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        habit_id: habitId,
        date_jour: dateJour,
        fait,
        valeur,
      },
      { onConflict: 'habit_id,date_jour' },
    )
    .select(LOG_SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} habitId
 * @param {string} dateJour ISO YYYY-MM-DD
 */
export async function deleteHabitLog(supabase, userId, habitId, dateJour) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('date_jour', dateJour)

  if (error) throw error
}
