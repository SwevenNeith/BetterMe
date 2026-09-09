-- =============================================================================
-- Nettoyage des scheduled_notifications orphelines
-- (événement EDT / TODO déjà supprimés, ou event_id remis à NULL par la FK)
-- =============================================================================
-- Exécuter dans le SQL Editor Supabase.
-- 1) Lance d’abord les SELECT « Aperçu »
-- 2) Puis les DELETE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- APERÇU
-- -----------------------------------------------------------------------------

-- A) Rappels EDT / timers encore liés à un event_id… qui n’existe plus
SELECT sn.id, sn.user_id, sn.kind, sn.title, sn.body, sn.scheduled_at, sn.sent, sn.event_id
FROM public.scheduled_notifications sn
WHERE sn.event_id IS NOT NULL
  AND sn.kind IN ('activite', 'timer', 'timer_start')
  AND NOT EXISTS (
    SELECT 1 FROM public.timetable_events te WHERE te.id = sn.event_id
  )
ORDER BY sn.scheduled_at DESC;

-- B) Rappels TODO dont la tâche n’existe plus
SELECT sn.id, sn.user_id, sn.kind, sn.title, sn.body, sn.scheduled_at, sn.sent, sn.event_id
FROM public.scheduled_notifications sn
WHERE sn.kind = 'todo_item_reminder'
  AND sn.event_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.todo_items ti WHERE ti.id = sn.event_id
  )
ORDER BY sn.scheduled_at DESC;

-- C) Rappels EDT orphelins (FK ON DELETE SET NULL → event_id devenu NULL)
--    Les rappels ponctuels / timers seuls / daily / etc. restent intacts.
SELECT sn.id, sn.user_id, sn.kind, sn.title, sn.body, sn.scheduled_at, sn.sent
FROM public.scheduled_notifications sn
WHERE sn.sent = false
  AND sn.event_id IS NULL
  AND (
    sn.kind = 'activite'
    OR sn.kind = 'timer_start'
    OR sn.kind = 'todo_item_reminder'
  )
ORDER BY sn.scheduled_at DESC;

-- D) Rappels TODO encore présents alors que la tâche est liée au planning
--    (doublon TODO + EDT)
SELECT sn.id, sn.kind, sn.title, sn.body, sn.scheduled_at, sn.event_id AS todo_item_id
FROM public.scheduled_notifications sn
JOIN public.todo_items ti ON ti.id = sn.event_id
WHERE sn.sent = false
  AND sn.kind = 'todo_item_reminder'
  AND ti.timetable_event_id IS NOT NULL
ORDER BY sn.scheduled_at DESC;

-- E) Doublons activite pour le même event_id (pending)
SELECT event_id, count(*) AS n, array_agg(id ORDER BY scheduled_at DESC) AS ids
FROM public.scheduled_notifications
WHERE sent = false
  AND kind = 'activite'
  AND event_id IS NOT NULL
GROUP BY event_id
HAVING count(*) > 1;


-- -----------------------------------------------------------------------------
-- SUPPRESSION
-- -----------------------------------------------------------------------------

-- 1) EDT / timers dont l’événement n’existe plus
DELETE FROM public.scheduled_notifications sn
WHERE sn.event_id IS NOT NULL
  AND sn.kind IN ('activite', 'timer', 'timer_start')
  AND NOT EXISTS (
    SELECT 1 FROM public.timetable_events te WHERE te.id = sn.event_id
  );

-- 2) Rappels TODO dont la tâche n’existe plus
DELETE FROM public.scheduled_notifications sn
WHERE sn.kind = 'todo_item_reminder'
  AND sn.event_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.todo_items ti WHERE ti.id = sn.event_id
  );

-- 3) Orphelins après SET NULL (pending uniquement, kinds EDT / TODO)
DELETE FROM public.scheduled_notifications sn
WHERE sn.sent = false
  AND sn.event_id IS NULL
  AND sn.kind IN ('activite', 'timer_start', 'todo_item_reminder');

-- 4) Doublons TODO alors que lié au planning
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

-- 5) Doublons activite : 1 seule ligne pending par event_id (garde la plus récente)
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY event_id
      ORDER BY scheduled_at DESC, id DESC
    ) AS rn
  FROM public.scheduled_notifications
  WHERE sent = false
    AND kind = 'activite'
    AND event_id IS NOT NULL
)
DELETE FROM public.scheduled_notifications sn
USING ranked r
WHERE sn.id = r.id
  AND r.rn > 1;

-- 6) (Optionnel) Index anti-doublon — ignorer si déjà créés
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_notifications_one_activite_per_event
  ON public.scheduled_notifications (event_id)
  WHERE sent = false
    AND kind = 'activite'
    AND event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_notifications_one_todo_reminder_per_item
  ON public.scheduled_notifications (event_id)
  WHERE sent = false
    AND kind = 'todo_item_reminder'
    AND event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- VÉRIFICATION FINALE
-- -----------------------------------------------------------------------------
SELECT kind, sent, count(*) AS n
FROM public.scheduled_notifications
GROUP BY kind, sent
ORDER BY kind, sent;
