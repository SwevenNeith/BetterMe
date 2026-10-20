-- Lie une entrée prévue à l’entrée réelle créée au « Fait »
-- (le prévu reste visible pour comparer plan / réel).
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS completed_actual_id uuid NULL
    REFERENCES public.battery_day_entries (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.battery_day_entries.completed_actual_id IS
  'Pour kind=planned : id de l’entrée réelle correspondante une fois faite (null = encore à faire).';

CREATE INDEX IF NOT EXISTS battery_day_entries_completed_actual_idx
  ON public.battery_day_entries (completed_actual_id)
  WHERE completed_actual_id IS NOT NULL;

COMMIT;
