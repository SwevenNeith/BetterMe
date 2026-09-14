import {
  DEFAULT_PROJECT_PAUSE_REASONS,
  normalizePauseReasonList,
} from '../constants/projectPause.js'
import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'project_pause_reasons'

function isMissingColumnError(error) {
  return (
    error?.code === 'PGRST204' &&
    typeof error.message === 'string' &&
    error.message.includes(`'${COLUMN}'`)
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function loadProjectPauseReasons(supabase, userId) {
  if (!userId) return [...DEFAULT_PROJECT_PAUSE_REASONS]

  try {
    await ensureUserSettings(userId)
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select(COLUMN)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      if (isMissingColumnError(error)) {
        console.warn(
          `Colonne ${COLUMN} absente. Exécute scripts/migrate-project-steps-pause.sql dans Supabase.`,
        )
        return [...DEFAULT_PROJECT_PAUSE_REASONS]
      }
      throw error
    }

    return normalizePauseReasonList(data?.[COLUMN])
  } catch (err) {
    console.error('loadProjectPauseReasons:', err)
    return [...DEFAULT_PROJECT_PAUSE_REASONS]
  }
}

/**
 * Ajoute un motif custom (s’il n’existe pas déjà) et persiste la liste utilisateur
 * (sans réécrire les défauts — seuls les motifs hors défauts sont stockés).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} reason
 * @returns {Promise<string[]>} liste fusionnée à jour
 */
export async function rememberProjectPauseReason(supabase, userId, reason) {
  const label = String(reason ?? '').trim().slice(0, 80)
  if (!userId || !label) {
    return loadProjectPauseReasons(supabase, userId)
  }

  const current = await loadProjectPauseReasons(supabase, userId)
  const merged = normalizePauseReasonList([...current, label])

  const defaultsLower = new Set(DEFAULT_PROJECT_PAUSE_REASONS.map((r) => r.toLowerCase()))
  const customOnly = merged.filter((r) => !defaultsLower.has(r.toLowerCase()))

  try {
    await ensureUserSettings(userId)
    const { error } = await supabase
      .from(SETTINGS_TABLE)
      .update({ [COLUMN]: customOnly })
      .eq('user_id', userId)

    if (error) {
      if (isMissingColumnError(error)) {
        console.warn(
          `Colonne ${COLUMN} absente. Exécute scripts/migrate-project-steps-pause.sql dans Supabase.`,
        )
        return merged
      }
      throw error
    }
  } catch (err) {
    console.error('rememberProjectPauseReason:', err)
  }

  return merged
}
