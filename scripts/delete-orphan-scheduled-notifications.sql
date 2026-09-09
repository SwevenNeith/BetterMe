-- =============================================================================
-- SUPPRESSION des scheduled_notifications orphelines (EDT / TODO)
-- Script DELETE uniquement — pas de simple SELECT.
-- Exécuter tel quel dans le SQL Editor Supabase.
-- =============================================================================

-- 1) EDT / timers : event_id pointe vers un événement inexistant
DELETE FROM public.scheduled_notifications sn
WHERE sn.event_id IS NOT NULL
  AND sn.kind IN ('activite', 'timer', 'timer_start')
  AND NOT EXISTS (
    SELECT 1 FROM public.timetable_events te WHERE te.id = sn.event_id
  );

-- 2) Rappels TODO : event_id pointe vers une tâche inexistante
DELETE FROM public.scheduled_notifications sn
WHERE sn.kind = 'todo_item_reminder'
  AND (
    sn.event_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.todo_items ti WHERE ti.id = sn.event_id
    )
  );

-- 3) Orphelins après ON DELETE SET NULL (event_id devenu NULL)
DELETE FROM public.scheduled_notifications sn
WHERE sn.event_id IS NULL
  AND sn.kind IN ('activite', 'timer_start', 'todo_item_reminder');

-- 4) Doublons TODO alors que la tâche est encore liée au planning
DELETE FROM public.scheduled_notifications sn
USING public.todo_items ti
WHERE sn.event_id = ti.id
  AND sn.kind = 'todo_item_reminder'
  AND ti.timetable_event_id IS NOT NULL;

-- 5) Sécurité : tout rappel « BetterMe - Rappel » / « BetterMe - TODO » pending
--    sans événement EDT valide (couvre aussi d’anciennes lignes mal typées)
DELETE FROM public.scheduled_notifications sn
WHERE sn.sent = false
  AND (
    sn.title ILIKE 'BetterMe - Rappel%'
    OR sn.title ILIKE 'BetterMe - TODO%'
  )
  AND (
    sn.event_id IS NULL
    OR (
      sn.kind IN ('activite', 'timer', 'timer_start')
      AND NOT EXISTS (
        SELECT 1 FROM public.timetable_events te WHERE te.id = sn.event_id
      )
    )
    OR (
      sn.kind = 'todo_item_reminder'
      AND NOT EXISTS (
        SELECT 1 FROM public.todo_items ti WHERE ti.id = sn.event_id
      )
    )
  );

-- Compteur restant (doit être 0 pour activite / todo_item_reminder / timer_start orphelins)
SELECT kind, sent, count(*) AS n
FROM public.scheduled_notifications
WHERE kind IN ('activite', 'todo_item_reminder', 'timer', 'timer_start')
   OR title ILIKE 'BetterMe - Rappel%'
   OR title ILIKE 'BetterMe - TODO%'
GROUP BY kind, sent
ORDER BY kind, sent;
