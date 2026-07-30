import { createTimetableEvent } from './timetableEvents.js'
import { supprimerRappelsEvenement } from './notifications.js'
import { getLocalTodayISO } from './scheduledReminders.js'
import { normalizeDateISO } from '../utils/habitCalendar.js'
import { getTodoPlanningOccurrenceDates, isRecurringTodoFrequency } from '../utils/todoPlanningDates.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} todoItemId
 */
export async function listTimetableEventsForTodo(supabase, userId, todoItemId) {
  if (!userId || !todoItemId) return []

  const { data, error } = await supabase
    .from('timetable_events')
    .select('id, date_start, title')
    .eq('user_id', userId)
    .eq('todo_item_id', todoItemId)
    .order('date_start', { ascending: true })

  if (error) throw error
  return data ?? []
}

function partitionPlanningEventsByDate(events, today = getLocalTodayISO()) {
  const upcoming = []
  const past = []

  for (const event of events) {
    const date = normalizeDateISO(event.date_start)
    if (date && date >= today) {
      upcoming.push(event)
    } else {
      past.push(event)
    }
  }

  upcoming.sort((left, right) =>
    String(left.date_start).localeCompare(String(right.date_start)),
  )

  return { upcoming, past }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} todoItemId
 * @param {string|null} referencedEventId
 */
async function collectTodoPlanningEvents(supabase, userId, todoItemId, referencedEventId = null) {
  let events = await listTimetableEventsForTodo(supabase, userId, todoItemId)

  if (!referencedEventId) {
    return events
  }

  const alreadyListed = events.some((event) => event.id === referencedEventId)
  if (alreadyListed) {
    return events
  }

  const { data: referencedEvent, error: refError } = await supabase
    .from('timetable_events')
    .select('id, date_start, title, todo_item_id')
    .eq('id', referencedEventId)
    .eq('user_id', userId)
    .maybeSingle()

  if (refError) throw refError

  if (
    referencedEvent &&
    (!referencedEvent.todo_item_id || referencedEvent.todo_item_id === todoItemId)
  ) {
    return [referencedEvent, ...events]
  }

  return events
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} todoItemId
 */
export async function hasTodoTimetableLink(supabase, userId, todoItemId) {
  const { linked } = await syncTodoTimetableLink(supabase, userId, todoItemId)
  return linked
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} todoItemId
 * @param {string} eventId
 */
export async function linkTodoAndTimetable(supabase, userId, todoItemId, eventId) {
  if (!userId || !todoItemId || !eventId) return

  const { error: todoError } = await supabase
    .from('todo_items')
    .update({ timetable_event_id: eventId })
    .eq('id', todoItemId)
    .eq('user_id', userId)

  if (todoError) throw todoError

  const { error: eventError } = await supabase
    .from('timetable_events')
    .update({ todo_item_id: todoItemId })
    .eq('id', eventId)
    .eq('user_id', userId)

  if (eventError) throw eventError
}

/**
 * Réconcilie timetable_event_id sur le TODO avec les événements planning réellement présents.
 * Nettoie les références obsolètes et les séries récurrentes entièrement passées.
 * @returns {Promise<{ linked: boolean, eventId: string | null, eventCount: number, nextOccurrenceDate: string | null }>}
 */
export async function syncTodoTimetableLink(supabase, userId, todoItemId) {
  if (!userId || !todoItemId) {
    return { linked: false, eventId: null, eventCount: 0, nextOccurrenceDate: null }
  }

  const { data: todoRow, error: todoError } = await supabase
    .from('todo_items')
    .select('timetable_event_id, frequence')
    .eq('id', todoItemId)
    .eq('user_id', userId)
    .maybeSingle()

  if (todoError) throw todoError

  const referencedEventId = todoRow?.timetable_event_id ?? null
  let events = await collectTodoPlanningEvents(
    supabase,
    userId,
    todoItemId,
    referencedEventId,
  )

  if (referencedEventId && !events.some((event) => event.id === referencedEventId)) {
    await clearTodoTimetableLink(supabase, userId, todoItemId)
  }

  const today = getLocalTodayISO()
  const isRecurring = isRecurringTodoFrequency(todoRow?.frequence)
  let { upcoming, past } = partitionPlanningEventsByDate(events, today)

  if (events.length > 0 && upcoming.length === 0 && isRecurring) {
    for (const event of events) {
      await deleteTimetableEventRow(supabase, userId, event.id)
    }
    await clearTodoTimetableLink(supabase, userId, todoItemId)
    return { linked: false, eventId: null, eventCount: 0, nextOccurrenceDate: null }
  }

  if (!events.length) {
    await clearTodoTimetableLink(supabase, userId, todoItemId)
    return { linked: false, eventId: null, eventCount: 0, nextOccurrenceDate: null }
  }

  if (isRecurring && past.length > 0 && upcoming.length > 0) {
    for (const event of past) {
      await deleteTimetableEventRow(supabase, userId, event.id)
    }
    events = upcoming
  } else {
    events = upcoming.length > 0 ? upcoming : events
  }

  const primaryId = events[0].id
  await linkTodoAndTimetable(supabase, userId, todoItemId, primaryId)

  const remainingIds = events.slice(1).map((event) => event.id)
  if (remainingIds.length) {
    const { error } = await supabase
      .from('timetable_events')
      .update({ todo_item_id: todoItemId })
      .eq('user_id', userId)
      .in('id', remainingIds)

    if (error) throw error
  }

  const activeEvents = upcoming.length > 0 ? upcoming : events
  const nextOccurrenceDate = normalizeDateISO(activeEvents[0]?.date_start) || null

  return {
    linked: true,
    eventId: primaryId,
    eventCount: activeEvents.length,
    nextOccurrenceDate,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} eventId
 */
async function deleteTimetableEventRow(supabase, userId, eventId) {
  await supprimerRappelsEvenement(eventId)

  const { error } = await supabase
    .from('timetable_events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} eventId
 */
export async function deleteTimetableEvent(supabase, userId, eventId) {
  if (!userId || !eventId) return

  const { data: eventRow, error: fetchError } = await supabase
    .from('timetable_events')
    .select('todo_item_id')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchError) throw fetchError

  const todoItemId = eventRow?.todo_item_id ?? null

  await deleteTimetableEventRow(supabase, userId, eventId)

  if (todoItemId) {
    await syncTodoTimetableLink(supabase, userId, todoItemId)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} todoItemId
 */
export async function deleteAllTimetableEventsForTodo(supabase, userId, todoItemId) {
  if (!userId || !todoItemId) return

  const events = await listTimetableEventsForTodo(supabase, userId, todoItemId)
  for (const event of events) {
    await deleteTimetableEventRow(supabase, userId, event.id)
  }
  await clearTodoTimetableLink(supabase, userId, todoItemId)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} todoItemId
 */
export async function clearTodoTimetableLink(supabase, userId, todoItemId) {
  if (!userId || !todoItemId) return

  const { error } = await supabase
    .from('todo_items')
    .update({ timetable_event_id: null })
    .eq('id', todoItemId)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * Crée un événement planning pour chaque occurrence d'une tâche TODO récurrente.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} todoItem
 * @param {object} planningInput
 * @param {Array} userCategories
 */
export async function createTimetableEventsForTodo(
  supabase,
  userId,
  todoItem,
  planningInput,
  userCategories = [],
) {
  if (!userId || !todoItem?.id) {
    throw new Error('Tâche TODO introuvable pour le planning.')
  }

  const existingLink = await syncTodoTimetableLink(supabase, userId, todoItem.id)
  if (existingLink.linked) {
    throw new Error('Cette tâche est déjà liée au planning.')
  }

  const dates = getTodoPlanningOccurrenceDates(todoItem, {
    startDate: planningInput.dateStart,
    endDate: planningInput.dateEnd || null,
  })

  if (!dates.length) {
    throw new Error('Aucune date de planning trouvée pour cette tâche.')
  }

  const events = []
  let categories = userCategories

  for (const dateStart of dates) {
    const { event, categories: nextCategories } = await createTimetableEvent(
      supabase,
      userId,
      {
        ...planningInput,
        dateStart,
        dateEnd: '',
        todoItemId: todoItem.id,
      },
      categories,
    )
    categories = nextCategories
    if (event) events.push(event)
  }

  if (events.length) {
    await linkTodoAndTimetable(supabase, userId, todoItem.id, events[0].id)

    const remainingIds = events.slice(1).map((event) => event.id)
    if (remainingIds.length) {
      const { error } = await supabase
        .from('timetable_events')
        .update({ todo_item_id: todoItem.id })
        .eq('user_id', userId)
        .in('id', remainingIds)

      if (error) throw error
    }
  }

  return { events, categories }
}
