import { getDeviceTimeZone, syncNotificationTimezone } from './scheduledReminders.js'
import { rescheduleDailyReminderPushes } from './dailyReminders.js'
import { rescheduleBatteryPlanningReminder } from '../battery/batteryPlanningNotifications.js'
import { rescheduleAllTodoItemReminders } from '../todo/todoItemReminders.js'
import { maintainRollingTimetableReminders } from './rollingTimetableReminders.js'
import { maintainAnniversaryReminders } from '../timetable/anniversaryReminders.js'

const REALIGN_SKIP_KEY = 'betterme_notif_realign_fingerprint'

function currentTimezoneFingerprint() {
  const utcOffsetMinutes = -new Date().getTimezoneOffset()
  const timeZone = getDeviceTimeZone() || ''
  return `${utcOffsetMinutes}|${timeZone}`
}

function readLastRealignFingerprint() {
  try {
    return localStorage.getItem(REALIGN_SKIP_KEY) || ''
  } catch {
    return ''
  }
}

function writeLastRealignFingerprint(value) {
  try {
    localStorage.setItem(REALIGN_SKIP_KEY, value)
  } catch {
    /* ignore */
  }
}

/**
 * Réaligne toutes les notifications horaires sur l’heure locale de l’appareil
 * (offset UTC + prochaines occurrences). À appeler au démarrage / après changement TZ.
 *
 * Si l’offset / timezone appareil est inchangé depuis le dernier realign réussi,
 * on skip le gros reschedule (sauf si `force`).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   force?: boolean,
 *   knownUtcOffsetMinutes?: number | null,
 *   knownTimezone?: string | null,
 * }} [opts]
 */
export async function realignAllDeviceLocalNotifications(supabase, userId, opts = {}) {
  if (!userId) return

  const fingerprint = currentTimezoneFingerprint()
  const [offsetStr, tz] = fingerprint.split('|')
  const deviceOffset = Number(offsetStr)
  const deviceTz = tz || ''

  const storedOffset = opts.knownUtcOffsetMinutes
  const storedTz = opts.knownTimezone || ''
  const settingsMatchDevice =
    typeof storedOffset === 'number' &&
    storedOffset === deviceOffset &&
    (!deviceTz || !storedTz || storedTz === deviceTz)

  const lastLocal = readLastRealignFingerprint()
  if (!opts.force && settingsMatchDevice && lastLocal === fingerprint) {
    return
  }

  await syncNotificationTimezone(supabase, userId)

  const results = await Promise.allSettled([
    rescheduleDailyReminderPushes(supabase, userId),
    rescheduleBatteryPlanningReminder(userId),
    rescheduleAllTodoItemReminders(userId),
    maintainRollingTimetableReminders(supabase, userId),
    maintainAnniversaryReminders(supabase, userId),
  ])

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('realignAllDeviceLocalNotifications:', result.reason)
    }
  }

  writeLastRealignFingerprint(fingerprint)
}
