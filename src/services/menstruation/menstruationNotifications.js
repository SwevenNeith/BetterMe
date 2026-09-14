import { supabase } from '../lib/supabase.js'
import { COL } from './menstruationCycles.js'
import {
  dateTimeLocalToDate,
  deletePendingByKinds,
  insertPendingNotifications,
} from './scheduledReminders.js'
import {
  COL_NATUREL,
  computeNaturalPhaseStartDates,
} from './menstruationCyclesNaturel.js'

export const MENSTRUATION_KIND = {
  SPM_ESTIMEE: 'menstruation_spm_estimee',
  REGLES_ESTIMEES: 'menstruation_regles_estimees',
  PHASE_FOLLICULAIRE: 'menstruation_phase_folliculaire',
  PHASE_OVULATOIRE: 'menstruation_phase_ovulatoire',
  PHASE_LUTEALE: 'menstruation_phase_luteale',
}

const SETTINGS_TABLE = 'settings'

/** Normalise une date cycle (date / timestamptz) → YYYY-MM-DD */
function toDateKey(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const key = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null
}

/**
 * Fusionne les réglages en ignorant les `null`/`undefined` de la DB
 * (sinon un NULL écrase le défaut `true` et aucune notif n’est replanifiée).
 */
function resolveNotifSettings(settings) {
  const defaults = createDefaultMenstruationNotifSettings()
  const raw = settings && typeof settings === 'object' ? settings : {}
  const resolved = { ...defaults }

  for (const key of Object.keys(defaults)) {
    const value = raw[key]
    if (value == null) continue
    if (typeof defaults[key] === 'boolean') {
      resolved[key] = Boolean(value)
    } else {
      resolved[key] = value
    }
  }

  resolved.menstruation_notification_time = String(
    resolved.menstruation_notification_time || defaults.menstruation_notification_time,
  ).slice(0, 5)
  resolved.menstruation_pattern_notification_time = String(
    resolved.menstruation_pattern_notification_time ||
      defaults.menstruation_pattern_notification_time,
  ).slice(0, 5)

  return resolved
}

function buildFutureNotifRow(userId, { kind, title, body, dateKey, hhmm, nowMs }) {
  const day = toDateKey(dateKey)
  if (!day) return null
  const when = dateTimeLocalToDate(day, hhmm)
  const ms = when.getTime()
  if (!Number.isFinite(ms) || ms <= nowMs) return null
  return {
    user_id: userId,
    event_id: null,
    kind,
    title,
    body,
    scheduled_at: when.toISOString(),
    sent: false,
  }
}

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
    todo_promesse_reminder_enabled: true,
    todo_promesse_reminder_time: '21:30:00',
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
  return resolveNotifSettings(data || {})
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
  const rows = buildRows()
  if (!rows.length) {
    console.warn(
      `menstruationNotifications: aucune date future pour ${kind} (cycles/dates manquants ou déjà passés)`,
    )
    return
  }
  await insertPendingNotifications(supabase, userId, rows, { skipPerRowDedupe: true })
}

export const PILULE_MENSTRUATION_KINDS = [
  MENSTRUATION_KIND.SPM_ESTIMEE,
  MENSTRUATION_KIND.REGLES_ESTIMEES,
]

/** SPM uniquement — le kind règles estimées est partagé avec le cycle naturel. */
export const PILULE_SPM_KINDS = [MENSTRUATION_KIND.SPM_ESTIMEE]

export const NATURAL_MENSTRUATION_KINDS = [
  MENSTRUATION_KIND.PHASE_FOLLICULAIRE,
  MENSTRUATION_KIND.PHASE_OVULATOIRE,
  MENSTRUATION_KIND.PHASE_LUTEALE,
]

export async function clearPiluleMenstruationNotifications(userId) {
  await deletePendingByKinds(supabase, userId, PILULE_MENSTRUATION_KINDS)
}

export async function clearPiluleSpmNotifications(userId) {
  await deletePendingByKinds(supabase, userId, PILULE_SPM_KINDS)
}

export async function clearNaturalMenstruationNotifications(userId) {
  await deletePendingByKinds(supabase, userId, NATURAL_MENSTRUATION_KINDS)
}

/**
 * Planifie les notifications selon le mode cycle actif (pilule vs naturel).
 * @param {'pilule'|'naturel'|null} cycleMode
 */
export async function rescheduleMenstruationNotificationsByMode(
  userId,
  cycleMode,
  { cyclesPilule = [], cyclesNaturel = [], settings } = {},
) {
  const resolvedSettings = resolveNotifSettings(settings)

  if (cycleMode === 'naturel') {
    // Ne pas effacer REGLES_ESTIMEES ici : replanifié juste après pour le mode naturel
    await clearPiluleSpmNotifications(userId)
    await rescheduleMenstruationNaturalPhaseNotifications(userId, cyclesNaturel, resolvedSettings)
    return
  }

  if (cycleMode === 'pilule') {
    await clearNaturalMenstruationNotifications(userId)
    await rescheduleMenstruationEstimatedNotifications(userId, cyclesPilule, resolvedSettings)
    return
  }

  await clearPiluleMenstruationNotifications(userId)
  await clearNaturalMenstruationNotifications(userId)
}

export async function rescheduleMenstruationEstimatedNotifications(userId, cycles, settings) {
  const resolved = resolveNotifSettings(settings)
  const nowMs = Date.now()
  const hhmm = String(resolved.menstruation_notification_time || '09:00').slice(0, 5)

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.SPM_ESTIMEE,
    resolved.menstruation_notify_spm_estimee,
    () => {
      const rows = []
      for (const cycle of cycles || []) {
        const row = buildFutureNotifRow(userId, {
          kind: MENSTRUATION_KIND.SPM_ESTIMEE,
          title: 'BetterMe - SPM',
          body: '⚠️ Tu devrais entrer en période SPM aujourd’hui.',
          dateKey: cycle[COL.dateDebutSpmEstimee],
          hhmm,
          nowMs,
        })
        if (row) rows.push(row)
      }
      return rows
    },
  )

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.REGLES_ESTIMEES,
    resolved.menstruation_notify_regles_estimees,
    () => {
      const rows = []
      for (const cycle of cycles || []) {
        const row = buildFutureNotifRow(userId, {
          kind: MENSTRUATION_KIND.REGLES_ESTIMEES,
          title: 'BetterMe - Règles',
          body: '🩸 Tes règles devraient commencer aujourd’hui.',
          dateKey: cycle[COL.dateDebutReglesEstimee],
          hhmm,
          nowMs,
        })
        if (row) rows.push(row)
      }
      return rows
    },
  )
}

export async function rescheduleMenstruationNaturalPhaseNotifications(userId, naturalCycles, settings) {
  const resolved = resolveNotifSettings(settings)
  const nowMs = Date.now()
  const hhmm = String(resolved.menstruation_notification_time || '09:00').slice(0, 5)

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.PHASE_FOLLICULAIRE,
    resolved.menstruation_notify_phase_folliculaire,
    () => {
      const rows = []
      for (const cycle of naturalCycles || []) {
        const starts = computeNaturalPhaseStartDates(cycle)
        const row = buildFutureNotifRow(userId, {
          kind: MENSTRUATION_KIND.PHASE_FOLLICULAIRE,
          title: 'BetterMe - Phase folliculaire',
          body: '🌿 Tu entres en phase folliculaire aujourd’hui.',
          dateKey: starts.folliculaire,
          hhmm,
          nowMs,
        })
        if (row) rows.push(row)
      }
      return rows
    },
  )

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.PHASE_OVULATOIRE,
    resolved.menstruation_notify_phase_ovulatoire,
    () => {
      const rows = []
      for (const cycle of naturalCycles || []) {
        const starts = computeNaturalPhaseStartDates(cycle)
        const row = buildFutureNotifRow(userId, {
          kind: MENSTRUATION_KIND.PHASE_OVULATOIRE,
          title: 'BetterMe - Phase ovulatoire',
          body: '🥚 Tu entres en phase ovulatoire aujourd’hui.',
          dateKey: starts.ovulatoire,
          hhmm,
          nowMs,
        })
        if (row) rows.push(row)
      }
      return rows
    },
  )

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.PHASE_LUTEALE,
    resolved.menstruation_notify_phase_luteale,
    () => {
      const rows = []
      for (const cycle of naturalCycles || []) {
        const starts = computeNaturalPhaseStartDates(cycle)
        const row = buildFutureNotifRow(userId, {
          kind: MENSTRUATION_KIND.PHASE_LUTEALE,
          title: 'BetterMe - Phase lutéale',
          body: '🌙 Tu entres en phase lutéale aujourd’hui.',
          dateKey: starts.luteale,
          hhmm,
          nowMs,
        })
        if (row) rows.push(row)
      }
      return rows
    },
  )

  await syncMenstruationKindNotifications(
    userId,
    MENSTRUATION_KIND.REGLES_ESTIMEES,
    resolved.menstruation_notify_regles_estimees,
    () => {
      const rows = []
      const seenDates = new Set()
      for (const cycle of naturalCycles || []) {
        const dateEstimee =
          cycle[COL_NATUREL.dateDebutReglesEstimee] ||
          cycle[COL_NATUREL.dateProchainesReglesEstimee]
        const dateKey = toDateKey(dateEstimee)
        if (!dateKey || seenDates.has(dateKey)) continue
        seenDates.add(dateKey)
        const row = buildFutureNotifRow(userId, {
          kind: MENSTRUATION_KIND.REGLES_ESTIMEES,
          title: 'BetterMe - Règles',
          body: '🩸 Tes règles devraient commencer aujourd’hui.',
          dateKey,
          hhmm,
          nowMs,
        })
        if (row) rows.push(row)
      }
      return rows
    },
  )
}
