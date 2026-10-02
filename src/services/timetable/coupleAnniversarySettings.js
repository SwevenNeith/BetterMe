import { supabase } from '../../lib/supabase.js'
import { ensureUserSettings } from '../menstruation/menstruationNotifications.js'

const SETTINGS_TABLE = 'settings'

export function createDefaultCoupleAnniversarySettings() {
  return {
    couple_anniversary_enabled: false,
    couple_anniversary_start_date: '',
  }
}

function isMissingColumnError(error) {
  const msg = String(error?.message ?? '')
  return (
    error?.code === 'PGRST204' &&
    (msg.includes('couple_anniversary_enabled') ||
      msg.includes('couple_anniversary_start_date'))
  )
}

function normalizeDate(value) {
  const raw = String(value ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  return raw
}

export async function loadCoupleAnniversarySettings(userId) {
  const defaults = createDefaultCoupleAnniversarySettings()
  if (!userId) return defaults

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('couple_anniversary_enabled, couple_anniversary_start_date')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return defaults
    throw error
  }

  return {
    couple_anniversary_enabled: Boolean(data?.couple_anniversary_enabled),
    couple_anniversary_start_date: normalizeDate(data?.couple_anniversary_start_date),
  }
}

export async function saveCoupleAnniversarySettings(userId, settings) {
  if (!userId) throw new Error('Utilisateur requis.')

  await ensureUserSettings(userId)

  const enabled = Boolean(settings?.couple_anniversary_enabled)
  const start = normalizeDate(settings?.couple_anniversary_start_date)

  if (enabled && !start) {
    throw new Error('Indique la date de début de la relation.')
  }

  const payload = {
    couple_anniversary_enabled: enabled,
    couple_anniversary_start_date: enabled ? start : null,
  }

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update(payload)
    .eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        'Colonnes anniversaire couple absentes. Exécute scripts/migrate-settings-couple-anniversary.sql dans Supabase.',
      )
    }
    throw error
  }

  return {
    couple_anniversary_enabled: enabled,
    couple_anniversary_start_date: enabled ? start : '',
  }
}
