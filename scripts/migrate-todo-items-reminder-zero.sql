-- Autorise reminder_time = 0 (rappel à l’heure exacte de la tâche)
-- Exécute dans le SQL Editor Supabase si migrate-todo-items-reminder.sql a déjà été appliqué.

ALTER TABLE public.todo_items
  DROP CONSTRAINT IF EXISTS todo_items_reminder_requires_heure;

ALTER TABLE public.todo_items
  ADD CONSTRAINT todo_items_reminder_requires_heure
  CHECK (
    reminder = false
    OR (heure IS NOT NULL AND reminder_time IS NOT NULL AND reminder_time >= 0)
  );

COMMENT ON COLUMN public.todo_items.reminder_time IS 'Délai du rappel en minutes avant heure (0 = à l’heure exacte)';
