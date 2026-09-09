import { supabase } from '../lib/supabase.js'
import { TODO_FREQUENCY } from '../constants/todoOptions.js'
import {
  notificationsActives,
  planifierNotificationActivite,
  planifierNotificationDebutEvenement,
  planifierNotificationFinTimer,
  formatDelaiAvantEvenement,
  decomposerDelaiEnMinutes,
  supprimerRappelsEvenement,
} from './notifications.js'
import { getLocalTodayISO, SCHEDULED_KIND } from './scheduledReminders.js'
import {
  isDateWithinRollingReminderWindow,
  shouldRefillRollingReminderWindow,
} from './rollingReminderWindow.js'

function parseEventStartTime(timeRange) {
  if (!timeRange) return ''
  const match = String(timeRange).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
}

async function listPendingActiviteEventIds(client, userId) {
  const { data, error } = await client
    .from('scheduled_notifications')
    .select('event_id')
    .eq('user_id', userId)
    .eq('sent', false)
    .eq('kind', SCHEDULED_KIND.ACTIVITE)
    .not('event_id', 'is', null)

  if (error) {
    console.error('listPendingActiviteEventIds:', error)
    return new Set()
  }

  return new Set((data ?? []).map((row) => row.event_id).filter(Boolean))
}

async function scheduleEventReminders(userId, event, pendingEventIds) {
  const startTime = parseEventStartTime(event.time)
  if (!startTime) return

  const title = String(event.title ?? '').trim() || 'Activité'
  const dateStart = String(event.date_start).slice(0, 10)

  if (event.reminder && event.reminder_time != null && !pendingEventIds.has(event.id)) {
    const minutesAvant = Math.max(0, Number(event.reminder_time) || 0)
    const { heures, minutes } = decomposerDelaiEnMinutes(minutesAvant)
    const delaiLabel = formatDelaiAvantEvenement(heures, minutes)
    const ok = await planifierNotificationActivite(userId, {
      nom: title,
      dateStart,
      timeStart: startTime,
      minutesAvant,
      delaiLabel,
      eventId: event.id,
      todoItemId: event.todo_item_id || null,
    })
    if (ok) pendingEventIds.add(event.id)
  }

  if (event.timer && Number(event.timer_duration) > 0) {
    const durationMinutes = Math.max(0, Number(event.timer_duration) || 0)
    if (durationMinutes > 0) {
      await planifierNotificationDebutEvenement(userId, {
        label: title,
        dateStart,
        timeStart: startTime,
        durationMinutes,
        eventId: event.id,
      })
      await planifierNotificationFinTimer(userId, {
        label: title,
        dateStart,
        timeStart: startTime,
        durationMinutes,
        eventId: event.id,
        body: `${title} : le timer est terminé !`,
      })
    }
  }
}

function buildLastCoverageByTodo(seriesEvents, pendingEventIds) {
  const lastCoverageByTodo = new Map()
  for (const event of seriesEvents) {
    if (!event.todo_item_id || !pendingEventIds.has(event.id)) continue
    const day = String(event.date_start || '').slice(0, 10)
    if (!day) continue
    const prev = lastCoverageByTodo.get(event.todo_item_id)
    if (!prev || day > prev) lastCoverageByTodo.set(event.todo_item_id, day)
  }
  return lastCoverageByTodo
}

/**
 * Fenêtre glissante 15j pour rappels EDT liés à des TODO récurrentes :
 * à la création on ne planifie que +15j ; quand il reste ≤ 2 jours de couverture,
 * on recomplète jusqu’à +15j (~13 jours ajoutés).
 */
export async function maintainRollingTimetableReminders(supabaseClient, userId) {
  if (!userId || !notificationsActives()) return

  const client = supabaseClient ?? supabase
  const today = getLocalTodayISO()

  const { data: recurringTodos, error: todosError } = await client
    .from('todo_items')
    .select('id')
    .eq('user_id', userId)
    .in('frequence', [
      TODO_FREQUENCY.DAILY,
      TODO_FREQUENCY.WEEKLY,
      TODO_FREQUENCY.WEEK_GOAL,
    ])

  if (todosError) {
    console.error('maintainRollingTimetableReminders todos:', todosError)
    return
  }

  const recurringTodoIds = (recurringTodos ?? []).map((todo) => todo.id).filter(Boolean)
  if (!recurringTodoIds.length) return

  const { data: events, error } = await client
    .from('timetable_events')
    .select(
      'id, title, date_start, time, all_day, reminder, reminder_time, timer, timer_duration, todo_item_id',
    )
    .eq('user_id', userId)
    .eq('all_day', false)
    .gte('date_start', today)
    .or('reminder.eq.true,timer.eq.true')
    .in('todo_item_id', recurringTodoIds)

  if (error) {
    console.error('maintainRollingTimetableReminders events:', error)
    return
  }

  const seriesEvents = events ?? []
  if (!seriesEvents.length) return

  const pendingEventIds = await listPendingActiviteEventIds(client, userId)

  // 1) Hors fenêtre : retirer les pending (max ~15 jours de rappels stockés)
  for (const event of seriesEvents) {
    if (isDateWithinRollingReminderWindow(event.date_start, today)) continue
    if (!pendingEventIds.has(event.id)) continue
    try {
      await supprimerRappelsEvenement(event.id)
      pendingEventIds.delete(event.id)
    } catch (err) {
      console.error('maintainRollingTimetableReminders cancel:', err)
    }
  }

  // 2) Couverture réelle après nettoyage
  const lastCoverageByTodo = buildLastCoverageByTodo(seriesEvents, pendingEventIds)

  // 3) Recompléter / réparer dans [aujourd’hui, +15j]
  for (const event of seriesEvents) {
    if (!event?.id || !event.todo_item_id) continue
    if (!isDateWithinRollingReminderWindow(event.date_start, today)) continue
    if (pendingEventIds.has(event.id)) continue

    const coverage = lastCoverageByTodo.get(event.todo_item_id)
    const refill = shouldRefillRollingReminderWindow(coverage, today)
    const day = String(event.date_start).slice(0, 10)

    // Tant qu’il reste > 2 jours de couverture, ne pas avancer au-delà
    if (!refill && coverage && day > coverage) continue

    await scheduleEventReminders(userId, event, pendingEventIds)

    const nextCoverage = lastCoverageByTodo.get(event.todo_item_id)
    if (!nextCoverage || day > nextCoverage) {
      lastCoverageByTodo.set(event.todo_item_id, day)
    }
  }
}
