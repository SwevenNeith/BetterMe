import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS, APP_MAIN_PAGES } from '../constants/appPages.js'
import { ensureUserSettings } from './menstruationNotifications.js'
import { getPageDisplayLabel, loadPageVisibility } from './pageVisibility.js'
import { normalizeReminderTime } from './dailyReminders.js'
import { dateTimeParisToUtc } from './notifications.js'
import { listTodoItems } from './todoItems.js'
import {
  SCHEDULED_KIND,
  deletePendingByKinds,
  insertPendingNotifications,
} from './scheduledReminders.js'
import { addDaysISO, countDayScopedPromessesForDate } from '../utils/todoCalendar.js'

const SETTINGS_TABLE = 'settings'
const APP_TIMEZONE = 'Europe/Paris'
const TODO_PROMESSE_BODY =
  'Tu n’as pas encore de promesse pour demain. Penses à en ajouter une 💜'

const TODO_DEFAULT_LABEL =
  APP_MAIN_PAGES.find((p) => p.id === APP_PAGE_IDS.TODO)?.defaultLabel ?? 'TODO'

export function createDefaultTodoPromesseReminderSettings() {
  return {
    todo_promesse_reminder_enabled: true,
    todo_promesse_reminder_time: '21:30',
  }
}

function isMissingColumnError(error) {
  const msg = String(error?.message ?? '')
  return (
    error?.code === 'PGRST204' &&
    (msg.includes('todo_promesse_reminder_enabled') ||
      msg.includes('todo_promesse_reminder_time'))
  )
}

function getParisTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date())
}

function getParisDayBoundsUtc(todayParis) {
  return {
    dayStart: dateTimeParisToUtc(todayParis, '00:00').toISOString(),
    dayEnd: dateTimeParisToUtc(todayParis, '23:59').toISOString(),
  }
}

async function hasTodoPromesseReminderSentToday(userId, todayParis) {
  const { dayStart, dayEnd } = getParisDayBoundsUtc(todayParis)
  const { data, error } = await supabase
    .from('scheduled_notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', SCHEDULED_KIND.TODO_PROMESSE_REMINDER)
    .eq('sent', true)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)
    .limit(1)

  if (error) {
    if (String(error.message || '').includes('kind')) return false
    throw error
  }

  return Boolean(data?.length)
}

export async function loadTodoPromesseReminderSettings(userId) {
  if (!userId) return createDefaultTodoPromesseReminderSettings()

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('todo_promesse_reminder_enabled, todo_promesse_reminder_time')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return createDefaultTodoPromesseReminderSettings()
    throw error
  }

  const defaults = createDefaultTodoPromesseReminderSettings()
  return {
    todo_promesse_reminder_enabled:
      data?.todo_promesse_reminder_enabled ?? defaults.todo_promesse_reminder_enabled,
    todo_promesse_reminder_time: normalizeReminderTime(
      data?.todo_promesse_reminder_time ?? defaults.todo_promesse_reminder_time,
    ),
  }
}

export async function saveTodoPromesseReminderSettings(userId, settings) {
  if (!userId) return

  await ensureUserSettings(userId)

  const payload = {
    todo_promesse_reminder_enabled: Boolean(settings.todo_promesse_reminder_enabled),
    todo_promesse_reminder_time: normalizeReminderTime(
      settings.todo_promesse_reminder_time ?? '21:30',
    ),
  }

  const { error } = await supabase.from(SETTINGS_TABLE).update(payload).eq('user_id', userId)

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        'Colonnes rappel promesses absentes. Exécute scripts/migrate-settings-todo-promesse-reminder.sql dans Supabase.',
      )
    }
    throw error
  }
}

/** Libellé de la page TODO (nom personnalisé ou défaut). */
export async function getTodoPageLabelForUser(supabaseClient, userId) {
  if (!userId) return TODO_DEFAULT_LABEL
  try {
    const visibility = await loadPageVisibility(supabaseClient, userId)
    return getPageDisplayLabel(APP_PAGE_IDS.TODO, visibility, TODO_DEFAULT_LABEL)
  } catch {
    return TODO_DEFAULT_LABEL
  }
}

/**
 * Planifie (ou annule) le rappel du jour via scheduled_notifications.
 * Appelé à l’ouverture de l’app, après modification des TODO ou des réglages.
 */
export async function rescheduleTodoPromesseReminder(userId, options = {}) {
  if (!userId) return

  const kind = SCHEDULED_KIND.TODO_PROMESSE_REMINDER
  await deletePendingByKinds(supabase, userId, [kind])

  const settings = options.settings ?? (await loadTodoPromesseReminderSettings(userId))
  if (!settings.todo_promesse_reminder_enabled) return

  const todayParis = getParisTodayISO()
  if (await hasTodoPromesseReminderSentToday(userId, todayParis)) return

  const items = options.items ?? (await listTodoItems(supabase, userId))
  const tomorrowParis = addDaysISO(todayParis, 1)
  if (countDayScopedPromessesForDate(items, tomorrowParis) > 0) return

  const hhmm = settings.todo_promesse_reminder_time
  const scheduledAt = dateTimeParisToUtc(todayParis, hhmm)
  if (scheduledAt.getTime() <= Date.now()) return

  const title = await getTodoPageLabelForUser(supabase, userId)

  await insertPendingNotifications(supabase, userId, [
    {
      user_id: userId,
      event_id: null,
      kind,
      title,
      body: TODO_PROMESSE_BODY,
      scheduled_at: scheduledAt.toISOString(),
    },
  ])
}
