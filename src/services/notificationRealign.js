import { syncNotificationTimezone } from './scheduledReminders.js'
import { rescheduleDailyReminderPushes } from './dailyReminders.js'
import { rescheduleTodoPromesseReminder } from './todoPromesseNotifications.js'
import { rescheduleAllTodoItemReminders } from './todoItemReminders.js'

/**
 * Réaligne toutes les notifications horaires sur l’heure locale de l’appareil
 * (offset UTC + prochaines occurrences). À appeler au démarrage / après changement TZ.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function realignAllDeviceLocalNotifications(supabase, userId) {
  if (!userId) return

  await syncNotificationTimezone(supabase, userId)

  const results = await Promise.allSettled([
    rescheduleDailyReminderPushes(supabase, userId),
    rescheduleTodoPromesseReminder(userId),
    rescheduleAllTodoItemReminders(userId),
  ])

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('realignAllDeviceLocalNotifications:', result.reason)
    }
  }
}
