import { supabase } from '../../lib/supabase.js'
import {
  birthdayOccursOn,
  computeAgeMonths,
  computeAgeYears,
  coupleMonthlyOccursOn,
  formatAgeMonthsLabel,
  formatAgeYearsLabel,
  isFullYearFromMonths,
  TIMETABLE_EVENT_KIND,
} from '../../utils/timetable/anniversaryMath.js'
import { addDaysISO } from '../../utils/habit/habitCalendar.js'
import { loadCoupleAnniversarySettings } from './coupleAnniversarySettings.js'
import { notificationsActives } from '../common/notifications.js'
import {
  getRollingReminderWindowEndISO,
} from '../common/rollingReminderWindow.js'
import {
  dateTimeLocalToDate,
  deletePendingByKindPrefix,
  getLocalTodayISO,
  insertPendingNotifications,
} from '../common/scheduledReminders.js'

/** Prefixe kind — id événement + jour dans le kind (event_id = template birthday). */
export const BIRTHDAY_REMINDER_PREFIX = 'birthday_reminder:'
/** Prefixe kind — jour ISO dans le kind (pas de ligne EDT couple). */
export const COUPLE_ANNIVERSARY_REMINDER_PREFIX = 'couple_anniversary_reminder:'

export const ANNIVERSARY_NOTIFICATION_TIME = '09:00'

function birthdayReminderKind(eventId, dayISO) {
  return `${BIRTHDAY_REMINDER_PREFIX}${eventId}:${dayISO}`
}

function coupleAnniversaryReminderKind(dayISO) {
  return `${COUPLE_ANNIVERSARY_REMINDER_PREFIX}${dayISO}`
}

/**
 * @param {string} userId
 * @param {{
 *   kind: string,
 *   title: string,
 *   body: string,
 *   dateKey: string,
 *   eventId?: string|null,
 *   nowMs: number,
 *   today: string,
 * }} opts
 */
function buildAnniversaryNotifRow(userId, opts) {
  const day = String(opts.dateKey ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  if (day < opts.today) return null

  let when = dateTimeLocalToDate(day, ANNIVERSARY_NOTIFICATION_TIME)
  let ms = when.getTime()
  if (!Number.isFinite(ms)) return null

  // Jour J déjà passé 9h → envoi quasi immédiat (cron / client)
  if (day === opts.today && ms <= opts.nowMs) {
    when = new Date(opts.nowMs + 20_000)
    ms = when.getTime()
  } else if (ms <= opts.nowMs) {
    return null
  }

  return {
    user_id: userId,
    event_id: opts.eventId || null,
    kind: opts.kind,
    title: opts.title,
    body: opts.body,
    scheduled_at: when.toISOString(),
    sent: false,
  }
}

/**
 * Kinds déjà envoyés aujourd’hui (évite un 2e push après re-sync / rattrapage).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {string} todayISO
 * @returns {Promise<Set<string>>}
 */
async function listAnniversaryKindsSentToday(client, userId, todayISO) {
  const dayStart = dateTimeLocalToDate(todayISO, '00:00')
  const dayEndExclusive = dateTimeLocalToDate(todayISO, '00:00')
  dayEndExclusive.setDate(dayEndExclusive.getDate() + 1)

  const startIso = dayStart.toISOString()
  const endIso = dayEndExclusive.toISOString()
  /** @type {Set<string>} */
  const kinds = new Set()

  for (const prefix of [BIRTHDAY_REMINDER_PREFIX, COUPLE_ANNIVERSARY_REMINDER_PREFIX]) {
    const { data, error } = await client
      .from('scheduled_notifications')
      .select('kind')
      .eq('user_id', userId)
      .eq('sent', true)
      .like('kind', `${prefix}%`)
      .gte('scheduled_at', startIso)
      .lt('scheduled_at', endIso)

    if (error) {
      console.warn('listAnniversaryKindsSentToday:', error.message)
      continue
    }
    for (const row of data ?? []) {
      if (row?.kind) kinds.add(row.kind)
    }
  }

  return kinds
}

function eachDayInclusive(fromISO, toISO) {
  /** @type {string[]} */
  const days = []
  let cursor = fromISO
  while (cursor <= toISO) {
    days.push(cursor)
    cursor = addDaysISO(cursor, 1)
  }
  return days
}

/**
 * Planifie les rappels anniversaire (naissance + couple) à 9h le jour J,
 * sur une fenêtre glissante (+15 j), comme les rappels TV / EDT récurrents.
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 * @param {string} userId
 */
export async function maintainAnniversaryReminders(supabaseClient, userId) {
  if (!userId || !notificationsActives()) return

  const client = supabaseClient ?? supabase
  const today = getLocalTodayISO()
  const windowEnd = getRollingReminderWindowEndISO(today)
  const nowMs = Date.now()
  const days = eachDayInclusive(today, windowEnd)

  await deletePendingByKindPrefix(client, userId, BIRTHDAY_REMINDER_PREFIX)
  await deletePendingByKindPrefix(client, userId, COUPLE_ANNIVERSARY_REMINDER_PREFIX)

  const sentToday = await listAnniversaryKindsSentToday(client, userId, today)
  /** @type {Array<Record<string, unknown>>} */
  const pendingRows = []

  const { data: birthdayRows, error: birthdayError } = await client
    .from('timetable_events')
    .select('id, title, origin_date, date_start, event_kind')
    .eq('user_id', userId)
    .eq('event_kind', TIMETABLE_EVENT_KIND.BIRTHDAY)

  if (birthdayError) {
    if (
      String(birthdayError.message || '').includes('event_kind') ||
      birthdayError.code === 'PGRST204'
    ) {
      // Migration pas encore appliquée : on continue pour le couple.
    } else {
      console.error('maintainAnniversaryReminders birthdays:', birthdayError)
      return
    }
  }

  for (const event of birthdayRows ?? []) {
    const origin = String(event.origin_date || event.date_start || '').slice(0, 10)
    if (!origin) continue
    const name = String(event.title ?? '').trim() || 'Anniversaire'

    for (const day of days) {
      if (!birthdayOccursOn(origin, day)) continue
      const kind = birthdayReminderKind(event.id, day)
      if (sentToday.has(kind)) continue

      const years = computeAgeYears(origin, day)
      const ageLabel = formatAgeYearsLabel(years)
      const row = buildAnniversaryNotifRow(userId, {
        kind,
        title: `🎂 ${name}`,
        body: `Aujourd’hui — ${ageLabel}`,
        dateKey: day,
        eventId: event.id,
        nowMs,
        today,
      })
      if (row) pendingRows.push(row)
    }
  }

  try {
    const couple = await loadCoupleAnniversarySettings(userId)
    if (couple.couple_anniversary_enabled && couple.couple_anniversary_start_date) {
      const start = couple.couple_anniversary_start_date
      for (const day of days) {
        if (!coupleMonthlyOccursOn(start, day)) continue
        const kind = coupleAnniversaryReminderKind(day)
        if (sentToday.has(kind)) continue

        const months = computeAgeMonths(start, day)
        const ageLabel = formatAgeMonthsLabel(months)
        const fullYear = isFullYearFromMonths(months)
        const row = buildAnniversaryNotifRow(userId, {
          kind,
          title: fullYear ? `💕 Couple — ${ageLabel}` : `Couple — ${ageLabel}`,
          body: fullYear ? 'Anniversaire pile !' : 'Anniversaire de couple aujourd’hui',
          dateKey: day,
          eventId: null,
          nowMs,
          today,
        })
        if (row) pendingRows.push(row)
      }
    }
  } catch (err) {
    console.error('maintainAnniversaryReminders couple:', err)
  }

  if (!pendingRows.length) return

  await insertPendingNotifications(client, userId, pendingRows, {
    skipPerRowDedupe: true,
  })
}

/** Alias explicite pour les appels après changement de settings couple. */
export async function rescheduleAnniversaryReminders(supabaseClient, userId) {
  return maintainAnniversaryReminders(supabaseClient, userId)
}
