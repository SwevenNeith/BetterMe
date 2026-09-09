-- Corrige les doublons de rappels TODO + EDT (souvent à 1 minute d’écart).
-- Ne s’appuie PAS sur le body (apostrophes du type « s'en » cassent les filtres).
-- Exécuter une fois dans le SQL Editor Supabase.

-- 1) Aperçu : rappels TODO alors que la tâche est liée au planning
SELECT sn.id, sn.kind, sn.title, sn.body, sn.scheduled_at, sn.event_id
FROM public.scheduled_notifications sn
JOIN public.todo_items ti ON ti.id = sn.event_id
WHERE sn.sent = false
  AND sn.kind = 'todo_item_reminder'
  AND ti.timetable_event_id IS NOT NULL;

-- 2) Supprimer ces rappels TODO (l’EDT porte déjà le rappel)
DELETE FROM public.scheduled_notifications sn
USING public.todo_items ti
WHERE sn.event_id = ti.id
  AND sn.sent = false
  AND sn.kind = 'todo_item_reminder'
  AND ti.timetable_event_id IS NOT NULL;

-- 3) Désactiver le flag reminder sur les TODO liées
UPDATE public.todo_items
SET reminder = false,
    reminder_time = null
WHERE timetable_event_id IS NOT NULL
  AND reminder = true;

-- 4) Doublons activite pour le MÊME event_id : garder le plus récent
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

-- 5) Index d’unicité : 1 seul rappel activite pending par événement
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
