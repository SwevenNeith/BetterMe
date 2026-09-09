-- Nettoie les rappels TODO encore pending alors que la tâche est déjà liée au planning.
-- Exécuter une fois dans le SQL Editor Supabase (après cleanup-duplicate-todo-edt-reminders.sql).

DELETE FROM public.scheduled_notifications sn
USING public.todo_items ti
WHERE sn.event_id = ti.id
  AND sn.sent = false
  AND sn.kind = 'todo_item_reminder'
  AND ti.timetable_event_id IS NOT NULL;

UPDATE public.todo_items
SET reminder = false,
    reminder_time = null
WHERE timetable_event_id IS NOT NULL
  AND reminder = true;
