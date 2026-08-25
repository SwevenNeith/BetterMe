import { ensureUserSettings } from './menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'
const COLUMN = 'visibility_onboarding_completed'

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
 * @returns {Promise<boolean>} true = onboarding déjà fait (ou colonne absente)
 */
export async function hasCompletedVisibilityOnboarding(supabase, userId) {
  if (!userId) return true

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(COLUMN)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return true
    throw error
  }

  return Boolean(data?.[COLUMN])
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function markVisibilityOnboardingCompleted(supabase, userId) {
  if (!userId) return

  await ensureUserSettings(userId)

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ [COLUMN]: true })
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `Colonne ${COLUMN} absente. Exécute scripts/migrate-settings-visibility-onboarding.sql dans Supabase.`,
      )
    }
    throw error
  }
}
