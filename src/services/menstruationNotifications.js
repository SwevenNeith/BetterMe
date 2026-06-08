import { supabase } from '../lib/supabase.js'
import { COL } from './menstruationCycles.js'
import {
  dateTimeLocalToDate,
  deletePendingByKinds,
  insertPendingNotifications,
} from './scheduledReminders.js'
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

function buildSettingsInsertPayload(userId) {
  const d = createDefaultMenstruationNotifSettings()
  return {
    user_id: userId,
    menstruation_notify_spm_estimee: d.menstruation_notify_spm_estimee,
    menstruation_notify_regles_estimees: d.menstruation_notify_regles_estimees,
    menstruation_notify_phase_folliculaire: d.menstruation_notify_phase_folliculaire,
    menstruation_notify_phase_ovulatoire: d.menstruation_notify_phase_ovulatoire,
    menstruation_notify_phase_luteale: d.menstruation_notify_phase_luteale,
    menstruation_notification_time: d.menstruation_notification_time,
    menstruation_notify_patterns_simple: d.menstruation_notify_patterns_simple,
    menstruation_notify_patterns_intensite: d.menstruation_notify_patterns_intensite,
    menstruation_notify_patterns_duree: d.menstruation_notify_patterns_duree,
    menstruation_notify_patterns_combine: d.menstruation_notify_patterns_combine,
    menstruation_pattern_notification_time: d.menstruation_pattern_notification_time,
  }
}

/**
 * Crée la ligne settings si absente (toutes les notifs activées par défaut).
 */
export async function ensureUserSettings(userId) {
  if (!userId) return

  const { data: existing, error: readError } = await supabase
    .from(SETTINGS_TABLE)
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) throw readError
  if (existing?.user_id) return

  const { error: insertError } = await supabase
    .from(SETTINGS_TABLE)
    .insert(buildSettingsInsertPayload(userId))

  if (insertError && insertError.code !== '23505') throw insertError
}

export async function loadMenstruationNotifSettings(userId) {
  if (!userId) return createDefaultMenstruationNotifSettings()

  await ensureUserSettings(userId)

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

async function syncMenstruationKindNotifications(userId, kind, enabled, buildRows) {
  await deletePendingByKinds(supabase, userId, [kind])
  if (!enabled) return
  await insertPendingNotifications(supabase, userId, buildRows())
}

export async function rescheduleMenstruationEstimatedNotifications(userId, cycles, settings) {
  const now = Date.now()
  const hhmm = String(settings.menstruation_notification_time || '09:00').slice(0, 5)

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.SPM_ESTIMEE,
    settings.menstruation_notify_spm_estimee,
    () => {
      const rows = []
      for (const cycle of cycles || []) {
        if (!cycle[COL.dateDebutSpmEstimee]) continue
        const when = dateTimeLocalToDate(cycle[COL.dateDebutSpmEstimee], hhmm)
        if (when.getTime() <= now) continue
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.SPM_ESTIMEE,
          title: 'BetterMe - SPM',
          body: '⚠️ Tu devrais entrer en période SPM aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
      return rows
    },
  )

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.REGLES_ESTIMEES,
    settings.menstruation_notify_regles_estimees,
    () => {
      const rows = []
      for (const cycle of cycles || []) {
        if (!cycle[COL.dateDebutReglesEstimee]) continue
        const when = dateTimeLocalToDate(cycle[COL.dateDebutReglesEstimee], hhmm)
        if (when.getTime() <= now) continue
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.REGLES_ESTIMEES,
          title: 'BetterMe - Règles',
          body: '🩸 Tes règles devraient commencer aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
      return rows
    },
  )
}

export async function rescheduleMenstruationNaturalPhaseNotifications(userId, naturalCycles, settings) {
  const now = Date.now()
  const hhmm = String(settings.menstruation_notification_time || '09:00').slice(0, 5)

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.PHASE_FOLLICULAIRE,
    settings.menstruation_notify_phase_folliculaire,
    () => {
      const rows = []
      for (const cycle of naturalCycles || []) {
        const starts = computeNaturalPhaseStartDates(cycle)
        if (!starts.folliculaire) continue
        const when = dateTimeLocalToDate(starts.folliculaire, hhmm)
        if (when.getTime() <= now) continue
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.PHASE_FOLLICULAIRE,
          title: 'BetterMe - Phase folliculaire',
          body: '🌿 Tu entres en phase folliculaire aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
      return rows
    },
  )

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.PHASE_OVULATOIRE,
    settings.menstruation_notify_phase_ovulatoire,
    () => {
      const rows = []
      for (const cycle of naturalCycles || []) {
        const starts = computeNaturalPhaseStartDates(cycle)
        if (!starts.ovulatoire) continue
        const when = dateTimeLocalToDate(starts.ovulatoire, hhmm)
        if (when.getTime() <= now) continue
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.PHASE_OVULATOIRE,
          title: 'BetterMe - Phase ovulatoire',
          body: '🥚 Tu entres en phase ovulatoire aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
      return rows
    },
  )

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.PHASE_LUTEALE,
    settings.menstruation_notify_phase_luteale,
    () => {
      const rows = []
      for (const cycle of naturalCycles || []) {
        const starts = computeNaturalPhaseStartDates(cycle)
        if (!starts.luteale) continue
        const when = dateTimeLocalToDate(starts.luteale, hhmm)
        if (when.getTime() <= now) continue
        rows.push({
          user_id: userId,
          event_id: null,
          kind: MENSTRUATION_KIND.PHASE_LUTEALE,
          title: 'BetterMe - Phase lutéale',
          body: '🌙 Tu entres en phase lutéale aujourd’hui.',
          scheduled_at: when.toISOString(),
        })
      }
      return rows
    },
  )
}
