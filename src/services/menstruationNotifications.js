import { supabase } from '../lib/supabase.js'
import { COL } from './menstruationCycles.js'
import { dateTimeLocalToDate } from './scheduledReminders.js'

export const MENSTRUATION_KIND = {
  SPM_ESTIMEE: 'menstruation_spm_estimee',
  REGLES_ESTIMEES: 'menstruation_regles_estimees',
}

const SETTINGS_TABLE = 'settings'

export function createDefaultMenstruationNotifSettings() {
  return {
    menstruation_notify_spm_estimee: true,
    menstruation_notify_regles_estimees: true,
    menstruation_notification_time: '09:00',
  }
}

export async function loadMenstruationNotifSettings(userId) {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(
      'menstruation_notify_spm_estimee, menstruation_notify_regles_estimees, menstruation_notification_time',
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data || createDefaultMenstruationNotifSettings()
}

export async function saveMenstruationNotifSettings(userId, settings) {
  const payload = {
    user_id: userId,
    menstruation_notify_spm_estimee: Boolean(settings.menstruation_notify_spm_estimee),
    menstruation_notify_regles_estimees: Boolean(settings.menstruation_notify_regles_estimees),
    menstruation_notification_time: String(
      settings.menstruation_notification_time || '09:00',
    ).slice(0, 5),
  }

  const { error } = await supabase.from(SETTINGS_TABLE).upsert(payload, { onConflict: 'user_id' })
  if (error) throw error
}

export async function rescheduleMenstruationEstimatedNotifications(userId, cycles, settings) {
  const kinds = [MENSTRUATION_KIND.SPM_ESTIMEE, MENSTRUATION_KIND.REGLES_ESTIMEES]

  const { error: delError } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', userId)
    .in('kind', kinds)
    .eq('sent', false)
  if (delError) throw delError

  const rows = []
  const now = Date.now()
  const hhmm = String(settings.menstruation_notification_time || '09:00').slice(0, 5)

  for (const cycle of cycles || []) {
    if (settings.menstruation_notify_spm_estimee && cycle[COL.dateDebutSpmEstimee]) {
      const when = dateTimeLocalToDate(cycle[COL.dateDebutSpmEstimee], hhmm)
      if (when.getTime() > now) {
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.SPM_ESTIMEE,
          title: 'BetterMe - SPM',
          body: '⚠️ Tu devrais entrer en période SPM aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
    }

    if (settings.menstruation_notify_regles_estimees && cycle[COL.dateDebutReglesEstimee]) {
      const when = dateTimeLocalToDate(cycle[COL.dateDebutReglesEstimee], hhmm)
      if (when.getTime() > now) {
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.REGLES_ESTIMEES,
          title: 'BetterMe - Règles',
          body: '🩸 Tes règles devraient commencer aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
    }
  }

  if (!rows.length) return
  const { error } = await supabase.from('scheduled_notifications').insert(rows)
  if (error) throw error
}
