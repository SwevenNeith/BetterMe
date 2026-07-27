import { supprimerRappelsEvenement } from './notifications.js'

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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} eventId
 */
export async function deleteTimetableEvent(supabase, userId, eventId) {
  if (!userId || !eventId) return

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
