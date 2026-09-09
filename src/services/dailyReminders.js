import {
  dateTimeLocalToDate,
  deletePendingByKindPrefix,
  getLocalTodayISO,
  insertPendingNotifications,
} from './scheduledReminders.js'
import { addDaysISO } from '../utils/todoCalendar.js'

/** Prefixe kind — l’id du rappel est dans kind, pas dans event_id (FK vers events EDT). */
export const DAILY_REMINDER_KIND_PREFIX = 'daily_reminder:'

export function dailyReminderScheduledKind(reminderId) {
  return `${DAILY_REMINDER_KIND_PREFIX}${reminderId}`
}

export function parseDailyReminderIdFromKind(kind) {
  const raw = String(kind || '')
  if (!raw.startsWith(DAILY_REMINDER_KIND_PREFIX)) return null
  const id = raw.slice(DAILY_REMINDER_KIND_PREFIX.length).trim()
  return id || null
}

export function isDailyReminderKind(kind) {
  const raw = String(kind || '')
  return raw === 'daily_reminder' || raw.startsWith(DAILY_REMINDER_KIND_PREFIX)
}

export function normalizeReminderTime(time) {
  if (!time) return '09:00'
  const part = String(time).trim().slice(0, 5)
  const [hRaw, mRaw] = part.split(':')
  const h = String(Math.min(23, Math.max(0, parseInt(hRaw, 10) || 0))).padStart(2, '0')
  const m = String(Math.min(59, Math.max(0, parseInt(mRaw, 10) || 0))).padStart(2, '0')
  return `${h}:${m}`
}

function localHHmmNow(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export async function listDailyReminders(supabase, userId) {
  let query = supabase
    .from('daily_reminders')
    .select('id, reminder_time, title, body, last_sent_on')
    .eq('user_id', userId)
    .order('reminder_time', { ascending: true })

  let { data, error } = await query

  if (error && String(error.message || '').includes('last_sent_on')) {
    ;({ data, error } = await supabase
      .from('daily_reminders')
      .select('id, reminder_time, title, body')
      .eq('user_id', userId)
      .order('reminder_time', { ascending: true }))
  }

  if (error) throw error
  return data ?? []
}

async function deletePendingDailyReminderPushes(supabase, userId, reminderId = null) {
  if (reminderId) {
    const { error } = await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('sent', false)
      .eq('kind', dailyReminderScheduledKind(reminderId))
    if (error) throw error
    // Ancien format
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('sent', false)
      .eq('kind', 'daily_reminder')
      .eq('event_id', reminderId)
    return
  }
  await deletePendingByKindPrefix(supabase, userId, DAILY_REMINDER_KIND_PREFIX)
  await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', userId)
    .eq('sent', false)
    .eq('kind', 'daily_reminder')
}

/**
 * Verrouille l’envoi du jour (anti-doublon). Retourne true si on a gagné le verrou.
 */
export async function claimDailyReminderSendForToday(supabase, userId, reminderId, todayISO) {
  const day = String(todayISO || getLocalTodayISO()).slice(0, 10)

  const { data: current, error: readError } = await supabase
    .from('daily_reminders')
    .select('id, last_sent_on')
    .eq('id', reminderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) {
    if (String(readError.message || '').includes('last_sent_on')) {
      // Colonne absente : pas de verrou durable
      return true
    }
    throw readError
  }
  if (!current) return false

  const already = String(current.last_sent_on ?? '').slice(0, 10)
  if (already === day) return false

  const prev = current.last_sent_on
  let query = supabase
    .from('daily_reminders')
    .update({ last_sent_on: day })
    .eq('id', reminderId)
    .eq('user_id', userId)

  if (prev == null || prev === '') {
    query = query.is('last_sent_on', null)
  } else {
    query = query.eq('last_sent_on', prev)
  }

  const { data: updated, error: updateError } = await query.select('id').maybeSingle()
  if (updateError) throw updateError
  return Boolean(updated?.id)
}

/** Supprime un rappel en base (immédiat). */
export async function deleteDailyReminder(supabase, userId, reminderId) {
  const { error } = await supabase
    .from('daily_reminders')
    .delete()
    .eq('id', reminderId)
    .eq('user_id', userId)

  if (error) throw error

  try {
    await deletePendingDailyReminderPushes(supabase, userId, reminderId)
    await rescheduleDailyReminderPushes(supabase, userId)
  } catch (err) {
    console.error('reschedule after deleteDailyReminder:', err)
  }
}

/**
 * Enregistre la liste complète des rappels (ajouts, modifications, suppressions).
 * Une liste vide supprime tous les rappels de l'utilisateur.
 */
export async function saveDailyReminders(supabase, userId, reminders) {
  const normalized = reminders.map((r) => ({
    id: r.id,
    reminder_time: normalizeReminderTime(r.reminder_time),
    title: (r.title || 'BetterMe').trim(),
    body: (r.body || '').trim(),
  }))

  if (normalized.length > 0) {
    const times = normalized.map((r) => r.reminder_time)
    if (new Set(times).size !== times.length) {
      throw new Error('Deux rappels ne peuvent pas avoir la même heure.')
    }
  }

  const existing = await listDailyReminders(supabase, userId)
  const existingIds = new Set(existing.map((e) => e.id))
  const keptIds = new Set(normalized.filter((r) => r.id).map((r) => r.id))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    const { error } = await supabase.from('daily_reminders').delete().in('id', toDelete)
    if (error) throw error
  }

  for (const r of normalized) {
    if (r.id && existingIds.has(r.id)) {
      const { error } = await supabase
        .from('daily_reminders')
        .update({
          reminder_time: r.reminder_time,
          title: r.title,
          body: r.body,
        })
        .eq('id', r.id)
        .eq('user_id', userId)
      if (error) throw error
    } else {
      const { error } = await supabase.from('daily_reminders').insert({
        user_id: userId,
        reminder_time: r.reminder_time,
        title: r.title,
        body: r.body,
      })
      if (error) throw error
    }
  }

  const saved = await listDailyReminders(supabase, userId)
  await rescheduleDailyReminderPushes(supabase, userId, saved)
  return saved
}

/**
 * Prochaine occurrence d’un rappel quotidien en heure locale appareil.
 */
export function getNextDailyReminderFireAt(
  reminder,
  todayISO = getLocalTodayISO(),
  nowMs = Date.now(),
) {
  const hhmm = normalizeReminderTime(reminder?.reminder_time)
  const lastSent = String(reminder?.last_sent_on ?? '').slice(0, 10)

  let dateISO = lastSent === todayISO ? addDaysISO(todayISO, 1) : todayISO
  let when = dateTimeLocalToDate(dateISO, hhmm)
  while (when.getTime() <= nowMs) {
    dateISO = addDaysISO(dateISO, 1)
    when = dateTimeLocalToDate(dateISO, hhmm)
  }
  return when
}

function buildDailyReminderRow(userId, reminder, scheduledAtIso) {
  return {
    user_id: userId,
    event_id: null,
    kind: dailyReminderScheduledKind(reminder.id),
    title: (reminder.title || 'BetterMe').trim() || 'BetterMe',
    body: (reminder.body || '').trim() || null,
    scheduled_at: scheduledAtIso,
    sent: false,
  }
}

/**
 * Matérialise les rappels quotidiens en scheduled_notifications (UTC absolu).
 */
export async function rescheduleDailyReminderPushes(supabase, userId, reminders = null) {
  if (!userId) return

  await deletePendingDailyReminderPushes(supabase, userId)

  const rows = reminders ?? (await listDailyReminders(supabase, userId))
  if (!rows.length) return

  const todayISO = getLocalTodayISO()
  const nowMs = Date.now()
  const pending = []

  for (const reminder of rows) {
    if (!reminder?.id) continue
    const fireAt = getNextDailyReminderFireAt(reminder, todayISO, nowMs)
    pending.push(buildDailyReminderRow(userId, reminder, fireAt.toISOString()))
  }

  if (pending.length) {
    await insertPendingNotifications(supabase, userId, pending)
  }
}

/**
 * Envoie les rappels dus selon l’horloge locale appareil (1 seule fois / jour).
 * Retire aussi les scheduled_notifications du jour pour éviter un 2e envoi par le cron.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {(payload: object) => Promise<boolean>} sendPush
 */
export async function sendDueDailyRemindersLocally(supabase, userId, sendPush) {
  if (!userId || typeof sendPush !== 'function') return { sent: 0 }

  const rows = await listDailyReminders(supabase, userId)
  if (!rows.length) return { sent: 0 }

  const now = new Date()
  const hhmm = localHHmmNow(now)
  const todayISO = getLocalTodayISO()
  let sent = 0

  for (const reminder of rows) {
    if (!reminder?.id) continue
    if (normalizeReminderTime(reminder.reminder_time) !== hhmm) continue

    const won = await claimDailyReminderSendForToday(supabase, userId, reminder.id, todayISO)
    if (!won) continue

    // Empêche le cron edge de renvoyer le même rappel (scheduled + éventuel fallback)
    await deletePendingDailyReminderPushes(supabase, userId, reminder.id)

    const title = (reminder.title || 'BetterMe').trim() || 'BetterMe'
    const body = (reminder.body || '').trim()
    const tag = `betterme-daily_reminder-${reminder.id}-${todayISO}`

    await sendPush({
      type: 'manuel',
      userId,
      title,
      body,
      tag,
    })

    // Prochaine occurrence demain uniquement
    const tomorrow = getNextDailyReminderFireAt(
      { ...reminder, last_sent_on: todayISO },
      todayISO,
      now.getTime(),
    )
    await insertPendingNotifications(supabase, userId, [
      buildDailyReminderRow(userId, reminder, tomorrow.toISOString()),
    ])

    sent += 1
  }

  return { sent }
}
