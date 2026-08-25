-- Rappel optionnel sur les TODO (BetterMe)
-- Exécute dans le SQL Editor Supabase.
--
-- reminder        : active le rappel
-- reminder_time   : minutes avant l’horaire (heure) — même convention que timetable_events

ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS reminder boolean NOT NULL DEFAULT false;

ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS reminder_time integer;

COMMENT ON COLUMN public.todo_items.reminder IS 'Rappel push avant l’horaire de la tâche';
COMMENT ON COLUMN public.todo_items.reminder_time IS 'Délai du rappel en minutes avant heure (0 = à l’heure exacte)';

-- Un rappel n’a de sens qu’avec un horaire
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'todo_items_reminder_requires_heure'
  ) THEN
    ALTER TABLE public.todo_items
      ADD CONSTRAINT todo_items_reminder_requires_heure
      CHECK (
        reminder = false
        OR (heure IS NOT NULL AND reminder_time IS NOT NULL AND reminder_time >= 0)
      );
  END IF;
END $$;
