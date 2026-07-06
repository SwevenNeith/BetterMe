import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const MODE_COLUMN = 'menstruation_cycle_mode'

/** @typedef {'pilule'|'naturel'} MenstruationCycleMode */

function isMissingColumnError(error, column) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${column}'`)
  )
}

function normalizeMode(value) {
  return value === 'pilule' || value === 'naturel' ? value : null
}

function inferMenstruationCycleMode(countPilule, countNaturel) {
  if (countPilule > 0) return 'pilule'
  if (countNaturel > 0) return 'naturel'
  return null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<MenstruationCycleMode|null>}
 */
export async function loadMenstruationCycleModePreference(supabase, userId) {
  if (!userId) return null

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(MODE_COLUMN)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error, MODE_COLUMN)) return null
    throw error
  }

  return normalizeMode(data?.[MODE_COLUMN])
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {MenstruationCycleMode} mode
 */
export async function saveMenstruationCycleModePreference(supabase, userId, mode) {
  if (!userId || !normalizeMode(mode)) return

  await ensureUserSettings(userId)

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ [MODE_COLUMN]: mode })
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error, MODE_COLUMN)) {
      throw new Error(
        'Colonne menstruation_cycle_mode absente. Exécute scripts/migrate-settings-menstruation-cycle-mode.sql dans Supabase.',
      )
    }
    throw error
  }

  if (mode === 'naturel') {
    const { clearPiluleMenstruationNotifications } = await import('./menstruationNotifications.js')
    await clearPiluleMenstruationNotifications(userId)
  } else if (mode === 'pilule') {
    const { clearNaturalMenstruationNotifications } = await import('./menstruationNotifications.js')
    await clearNaturalMenstruationNotifications(userId)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {number} countPilule
 * @param {number} countNaturel
 * @returns {Promise<MenstruationCycleMode|null>}
 */
export async function resolveMenstruationCycleMode(supabase, userId, countPilule, countNaturel) {
  const saved = await loadMenstruationCycleModePreference(supabase, userId)
  if (saved === 'naturel') return 'naturel'
  if (saved === 'pilule') return 'pilule'

  const inferred = inferMenstruationCycleMode(countPilule, countNaturel)
  if (inferred && !saved) {
    try {
      await saveMenstruationCycleModePreference(supabase, userId, inferred)
    } catch (err) {
      console.warn('resolveMenstruationCycleMode: impossible de persister le mode inféré', err)
    }
  }

  return inferred
}
