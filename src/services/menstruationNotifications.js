import { supabase } from '../lib/supabase.js'
import { COL } from './menstruationCycles.js'
import { dateTimeLocalToDate } from './scheduledReminders.js'
import { computeNaturalPhaseStartDates } from './menstruationCyclesNaturel.js'

export const MENSTRUATION_KIND = {
  SPM_ESTIMEE: 'menstruation_spm_estimee',
  REGLES_ESTIMEES: 'menstruation_regles_estimees',
  PHASE_FOLLICULAIRE: 'menstruation_phase_folliculaire',
  PHASE_OVULATOIRE: 'menstruation_phase_ovulatoire',
  PHASE_LUTEALE: 'menstruation_phase_luteale',
}

const SETTINGS_TABLE = 'settings'

export function createDefaultMenstruationNotifSettings() {
  return {
    menstruation_notify_spm_estimee: true,
    menstruation_notify_regles_estimees: true,
    menstruation_notify_phase_folliculaire: true,
    menstruation_notify_phase_ovulatoire: true,
    menstruation_notify_phase_luteale: true,
    menstruation_notification_time: '09:00',
    menstruation_notify_patterns_simple: true,
    menstruation_notify_patterns_intensite: true,
    menstruation_notify_patterns_duree: true,
    menstruation_notify_patterns_combine: true,
    menstruation_pattern_notification_time: '20:00',
  }
}

export async function loadMenstruationNotifSettings(userId) {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select(
      [
        'menstruation_notify_spm_estimee',
        'menstruation_notify_regles_estimees',
        'menstruation_notify_phase_folliculaire',
        'menstruation_notify_phase_ovulatoire',
        'menstruation_notify_phase_luteale',
        'menstruation_notification_time',
        'menstruation_notify_patterns_simple',
        'menstruation_notify_patterns_intensite',
        'menstruation_notify_patterns_duree',
        'menstruation_notify_patterns_combine',
        'menstruation_pattern_notification_time',
      ].join(', '),
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return { ...createDefaultMenstruationNotifSettings(), ...(data || {}) }
}

export async function saveMenstruationNotifSettings(userId, settings) {
  const payload = {
    user_id: userId,
    menstruation_notify_spm_estimee: Boolean(settings.menstruation_notify_spm_estimee),
    menstruation_notify_regles_estimees: Boolean(settings.menstruation_notify_regles_estimees),
    menstruation_notify_phase_folliculaire: Boolean(settings.menstruation_notify_phase_folliculaire),
    menstruation_notify_phase_ovulatoire: Boolean(settings.menstruation_notify_phase_ovulatoire),
    menstruation_notify_phase_luteale: Boolean(settings.menstruation_notify_phase_luteale),
    menstruation_notification_time: String(
      settings.menstruation_notification_time || '09:00',
    ).slice(0, 5),
    menstruation_notify_patterns_simple: Boolean(settings.menstruation_notify_patterns_simple),
    menstruation_notify_patterns_intensite: Boolean(settings.menstruation_notify_patterns_intensite),
    menstruation_notify_patterns_duree: Boolean(settings.menstruation_notify_patterns_duree),
    menstruation_notify_patterns_combine: Boolean(settings.menstruation_notify_patterns_combine),
    menstruation_pattern_notification_time: String(
      settings.menstruation_pattern_notification_time || '20:00',
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

export async function rescheduleMenstruationNaturalPhaseNotifications(userId, naturalCycles, settings) {
  const kinds = [
    MENSTRUATION_KIND.PHASE_FOLLICULAIRE,
    MENSTRUATION_KIND.PHASE_OVULATOIRE,
    MENSTRUATION_KIND.PHASE_LUTEALE,
  ]

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

  for (const cycle of naturalCycles || []) {
    const starts = computeNaturalPhaseStartDates(cycle)

    if (settings.menstruation_notify_phase_folliculaire && starts.folliculaire) {
      const when = dateTimeLocalToDate(starts.folliculaire, hhmm)
      if (when.getTime() > now) {
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.PHASE_FOLLICULAIRE,
          title: 'BetterMe - Phase folliculaire',
          body: '🌿 Tu entres en phase folliculaire aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
    }

    if (settings.menstruation_notify_phase_ovulatoire && starts.ovulatoire) {
      const when = dateTimeLocalToDate(starts.ovulatoire, hhmm)
      if (when.getTime() > now) {
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.PHASE_OVULATOIRE,
          title: 'BetterMe - Phase ovulatoire',
          body: '🥚 Tu entres en phase ovulatoire aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
    }

    if (settings.menstruation_notify_phase_luteale && starts.luteale) {
      const when = dateTimeLocalToDate(starts.luteale, hhmm)
      if (when.getTime() > now) {
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.PHASE_LUTEALE,
          title: 'BetterMe - Phase lutéale',
          body: '🌙 Tu entres en phase lutéale aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
    }
  }

  if (!rows.length) return
  const { error } = await supabase.from('scheduled_notifications').insert(rows)
  if (error) throw error
}
