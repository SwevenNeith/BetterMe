import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import { addDaysISO, isTodoDueOnDate, normalizeDateISO } from '../utils/todoCalendar.js'
import { getDurationMinutes } from './durationUtils.js'
import {
  dateTimeParisToUtc,
  decomposerDelaiEnMinutes,
  formatDelaiDepuisMinutes,
  formatRappelNotificationBody,
  notificationsActives,
} from './notifications.js'
import { SCHEDULED_KIND, deletePendingScheduledDuplicate, getLocalTodayISO } from './scheduledReminders.js'
import { supabase } from '../lib/supabase.js'

const KIND = SCHEDULED_KIND.TODO_ITEM_REMINDER
const LOOKAHEAD_DAYS = 400

function isMissingReminderColumnError(error) {
  const msg = String(error?.message ?? '')
  return (
    error?.code === 'PGRST204' ||
    msg.includes("'reminder'") ||
    msg.includes('reminder_time') ||
    msg.includes('todo_items_reminder')
  )
}

function normalizeHeure(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** @returns {string|null} */
export function findNextTodoDueDate(item, fromISO = getLocalTodayISO(), maxDays = LOOKAHEAD_DAYS) {
  const start = normalizeDateISO(item?.date_echeance)
  if (!start) return null

  let date = fromISO < start ? start : fromISO
  for (let i = 0; i < maxDays; i += 1) {
    if (isTodoDueOnDate(item, date)) return date
    date = addDaysISO(date, 1)
  }
  return null
}

/**
 * Prochain créneau de rappel (date + heure de la tâche, délai en minutes).
 * @returns {{ dateStart: string, timeStart: string, minutesAvant: number }|null}
 */
export function getNextTodoReminderSlot(item, now = new Date()) {
  if (!item?.reminder) return null
  if (item.frequence === TODO_FREQUENCY.ONE_OFF && item.is_done) return null

  const timeStart = normalizeHeure(item.heure)
  const minutesAvant = Math.max(0, Number(item.reminder_time) || 0)
  if (!timeStart || minutesAvant < 0) return null

  let fromISO = getLocalTodayISO()
  for (let attempt = 0; attempt < LOOKAHEAD_DAYS; attempt += 1) {
    const dateStart = findNextTodoDueDate(item, fromISO)
    if (!dateStart) return null

    const dueAt = dateTimeParisToUtc(dateStart, timeStart)
    const fireAt = new Date(dueAt.getTime() - minutesAvant * 60 * 1000)
    if (fireAt.getTime() > now.getTime()) {
      return { dateStart, timeStart, minutesAvant }
    }
    fromISO = addDaysISO(dateStart, 1)
  }
  return null
}

export function validateTodoReminderInput(input) {
  if (!input?.reminderEnabled) return null

  const heure = normalizeHeure(input.heure)
  if (!heure) {
    return 'Indique un horaire pour activer le rappel, ou désactive le rappel.'
  }

  const minutes = getDurationMinutes(input.reminderHours, input.reminderMinutes)
  if (minutes < 0) {
    return 'Indique un délai de rappel valide ou désactive le rappel.'
  }

  return null
}

export function reminderFieldsFromForm(input) {
  if (!input?.reminderEnabled) {
    return { reminder: false, reminder_time: null }
  }
  const minutes = getDurationMinutes(input.reminderHours, input.reminderMinutes)
  if (minutes < 0 || !normalizeHeure(input.heure)) {
    return { reminder: false, reminder_time: null }
  }
  return { reminder: true, reminder_time: minutes }
}

export function reminderFormFromItem(item) {
  if (!item?.reminder || item.reminder_time == null) {
    return { reminderEnabled: false, reminderHours: 0, reminderMinutes: 15 }
  }
  const { heures, minutes } = decomposerDelaiEnMinutes(item.reminder_time)
  return {
    reminderEnabled: true,
    reminderHours: heures,
    reminderMinutes: minutes,
  }
}

export async function deletePendingTodoItemReminders(supabaseClient, todoItemId) {
  if (!todoItemId) return
  const client = supabaseClient ?? supabase
  await client
    .from('scheduled_notifications')
    .delete()
    .eq('event_id', todoItemId)
    .eq('sent', false)
    .eq('kind', KIND)
}

/**
 * Planifie (ou annule) le prochain rappel pour une tâche.
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 */
export async function rescheduleTodoItemReminder(userId, item, supabaseClient = supabase) {
  if (!userId || !item?.id) return

  try {
    await deletePendingTodoItemReminders(supabaseClient, item.id)

    if (!item.reminder || !notificationsActives()) return

    const slot = getNextTodoReminderSlot(item)
    if (!slot) return

    const dueAt = dateTimeParisToUtc(slot.dateStart, slot.timeStart)
    const fireAt = new Date(dueAt.getTime() - slot.minutesAvant * 60 * 1000)
    if (slot.minutesAvant > 0 && fireAt.getTime() >= dueAt.getTime()) return

    const delaiLabel = formatDelaiDepuisMinutes(slot.minutesAvant)
    const scheduledAtIso = fireAt.toISOString()
    const title = 'BetterMe - TODO'
    const body = formatRappelNotificationBody(item.nom, slot.minutesAvant, delaiLabel)

    await deletePendingScheduledDuplicate(supabaseClient, userId, {
      scheduledAt: scheduledAtIso,
      kind: KIND,
      eventId: item.id,
    })

    const { error } = await supabaseClient.from('scheduled_notifications').insert({
      user_id: userId,
      event_id: item.id,
      title,
      body,
      scheduled_at: scheduledAtIso,
      kind: KIND,
      sent: false,
    })

    if (error) {
      if (isMissingReminderColumnError(error)) return
      throw error
    }
  } catch (err) {
    if (isMissingReminderColumnError(err)) return
    console.error('rescheduleTodoItemReminder:', err)
  }
}

/**
 * Replanifie les rappels de toutes les tâches actives de l’utilisateur.
 */
export async function rescheduleAllTodoItemReminders(userId, supabaseClient = supabase) {
  if (!userId) return

  try {
    const { data, error } = await supabaseClient
      .from('todo_items')
      .select('id, nom, frequence, jour_semaine, heure, date_echeance, is_done, reminder, reminder_time')
      .eq('user_id', userId)
      .eq('reminder', true)

    if (error) {
      if (isMissingReminderColumnError(error)) return
      throw error
    }

    for (const item of data ?? []) {
      await rescheduleTodoItemReminder(userId, item, supabaseClient)
    }
  } catch (err) {
    if (isMissingReminderColumnError(err)) return
    console.error('rescheduleAllTodoItemReminders:', err)
  }
}

export { decomposerDelaiEnMinutes }
