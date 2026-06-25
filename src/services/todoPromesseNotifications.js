import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS, APP_MAIN_PAGES } from '../constants/appPages.js'
import { ensureUserSettings } from './menstruationNotifications.js'
import { getPageDisplayLabel, loadPageVisibility } from './pageVisibility.js'
import { normalizeReminderTime } from './dailyReminders.js'

const SETTINGS_TABLE = 'settings'

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
      msg.includes('todo_promesse_reminder_time') ||
      msg.includes('todo_promesse_reminder_last_sent'))
  )
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
