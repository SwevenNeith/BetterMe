/**
 * Rappel de planification Batterie : si demain n’a aucune entrée « prévu ».
 * Réutilise les colonnes settings historiques todo_promesse_reminder_* (heure / activé).
 */

import { supabase } from '../../lib/supabase.js'
import { APP_PAGE_IDS, APP_MAIN_PAGES } from '../../constants/common/appPages.js'
import { BATTERY_ENTRY_KINDS } from '../../constants/battery/battery.js'
import { ensureUserSettings } from '../menstruation/menstruationNotifications.js'
import { getPageDisplayLabel, loadPageVisibility } from '../settings/pageVisibility.js'
import { normalizeReminderTime } from '../common/dailyReminders.js'
import {
  SCHEDULED_KIND,
  dateTimeLocalToDate,
  deletePendingByKinds,
  getLocalTodayISO,
  insertPendingNotifications,
} from '../common/scheduledReminders.js'
import { addDaysISO } from '../../utils/habit/habitCalendar.js'

const SETTINGS_TABLE = 'settings'
const DAYS_TABLE = 'battery_days'
const ENTRIES_TABLE = 'battery_day_entries'

const BATTERY_PLANNING_TITLE = 'Planning'

const BATTERY_PLANNING_BODY =
  'Vous n’avez encore rien planifié pour demain. Faites-le maintenant pour découvrir ce que votre énergie vous permet de faire ✨'

const BATTERY_DEFAULT_LABEL =
  APP_MAIN_PAGES.find((p) => p.id === APP_PAGE_IDS.BATTERY)?.defaultLabel ?? 'Batterie'

const REMINDER_KINDS = [
  SCHEDULED_KIND.BATTERY_PLANNING_REMINDER,
  SCHEDULED_KIND.TODO_PROMESSE_REMINDER, // ancien kind, nettoyé au passage
]

export function createDefaultBatteryPlanningReminderSettings() {
  return {
    todo_promesse_reminder_enabled: true,
    todo_promesse_reminder_time: '21:30',
  }
}

/** @deprecated Alias historique */
export const createDefaultTodoPromesseReminderSettings =
  createDefaultBatteryPlanningReminderSettings

function isMissingColumnError(error) {
  const msg = String(error?.message ?? '')
  return (
    error?.code === 'PGRST204' &&
    (msg.includes('todo_promesse_reminder_enabled') ||
      msg.includes('todo_promesse_reminder_time'))
  )
}

function getLocalDayBoundsIso(todayISO) {
  return {
    dayStart: dateTimeLocalToDate(todayISO, '00:00').toISOString(),
    dayEnd: dateTimeLocalToDate(todayISO, '23:59').toISOString(),
  }
}

async function hasBatteryPlanningReminderSentToday(userId, todayISO) {
  const { dayStart, dayEnd } = getLocalDayBoundsIso(todayISO)
  const { data, error } = await supabase
    .from('scheduled_notifications')
    .select('id')
    .eq('user_id', userId)
    .in('kind', REMINDER_KINDS)
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

function getPlanningScheduledAt(todayISO, hhmm) {
  const scheduledAt = dateTimeLocalToDate(todayISO, hhmm)
  if (scheduledAt.getTime() <= Date.now()) {
    return dateTimeLocalToDate(addDaysISO(todayISO, 1), hhmm)
  }
  return scheduledAt
}

/**
 * @param {string} userId
 * @param {string} dayIso
 */
export async function hasBatteryPlannedForDay(userId, dayIso) {
  if (!userId || !dayIso) return false

  const { data: day, error: dayError } = await supabase
    .from(DAYS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('day_date', dayIso)
    .maybeSingle()

  if (dayError) {
    if (String(dayError.message || '').includes('battery_days')) return false
    throw dayError
  }
  if (!day?.id) return false

  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select('id')
    .eq('day_id', day.id)
    .eq('kind', BATTERY_ENTRY_KINDS.PLANNED)
    .limit(1)

  if (error) {
    if (String(error.message || '').includes('battery_day_entries')) return false
    throw error
  }

  return Boolean(data?.length)
}

export async function loadBatteryPlanningReminderSettings(userId) {
  if (!userId) return createDefaultBatteryPlanningReminderSettings()

  await ensureUserSettings(userId)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('todo_promesse_reminder_enabled, todo_promesse_reminder_time')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return createDefaultBatteryPlanningReminderSettings()
    throw error
  }

  const defaults = createDefaultBatteryPlanningReminderSettings()
  return {
    todo_promesse_reminder_enabled:
      data?.todo_promesse_reminder_enabled ?? defaults.todo_promesse_reminder_enabled,
    todo_promesse_reminder_time: normalizeReminderTime(
      data?.todo_promesse_reminder_time ?? defaults.todo_promesse_reminder_time,
    ),
  }
}

/** @deprecated Alias historique */
export const loadTodoPromesseReminderSettings = loadBatteryPlanningReminderSettings

export async function saveBatteryPlanningReminderSettings(userId, settings) {
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
        'Colonnes rappel planification absentes. Exécute scripts/migrate-settings-todo-promesse-reminder.sql dans Supabase.',
      )
    }
    throw error
  }
}

/** @deprecated Alias historique */
export const saveTodoPromesseReminderSettings = saveBatteryPlanningReminderSettings

export async function getBatteryPageLabelForUser(supabaseClient, userId) {
  if (!userId) return BATTERY_DEFAULT_LABEL
  try {
    const visibility = await loadPageVisibility(supabaseClient, userId)
    return getPageDisplayLabel(APP_PAGE_IDS.BATTERY, visibility, BATTERY_DEFAULT_LABEL)
  } catch {
    return BATTERY_DEFAULT_LABEL
  }
}

/**
 * Planifie (ou annule) le rappel si demain n’a pas d’activités prévues Batterie.
 */
export async function rescheduleBatteryPlanningReminder(userId, options = {}) {
  if (!userId) return

  await deletePendingByKinds(supabase, userId, REMINDER_KINDS)

  const settings = options.settings ?? (await loadBatteryPlanningReminderSettings(userId))
  if (!settings.todo_promesse_reminder_enabled) return

  const todayISO = getLocalTodayISO()
  if (await hasBatteryPlanningReminderSentToday(userId, todayISO)) return

  const tomorrowISO = addDaysISO(todayISO, 1)
  if (await hasBatteryPlannedForDay(userId, tomorrowISO)) return

  const hhmm = settings.todo_promesse_reminder_time
  const scheduledAt = getPlanningScheduledAt(todayISO, hhmm)

  await insertPendingNotifications(supabase, userId, [
    {
      user_id: userId,
      event_id: null,
      kind: SCHEDULED_KIND.BATTERY_PLANNING_REMINDER,
      title: BATTERY_PLANNING_TITLE,
      body: BATTERY_PLANNING_BODY,
      scheduled_at: scheduledAt.toISOString(),
    },
  ])
}

/** @deprecated Alias — pointe vers la planification Batterie. */
export async function rescheduleTodoPromesseReminder(userId, options = {}) {
  return rescheduleBatteryPlanningReminder(userId, options)
}
