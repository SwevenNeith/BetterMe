-- Liaison Batterie ↔ TODO / EDT (entrées prévues synchronisées)
-- Exécute dans le SQL Editor Supabase (après create-battery.sql).

BEGIN;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS source_type text NULL,
  ADD COLUMN IF NOT EXISTS source_id uuid NULL;

ALTER TABLE public.battery_day_entries
  DROP CONSTRAINT IF EXISTS battery_day_entries_source_type_chk;

ALTER TABLE public.battery_day_entries
  ADD CONSTRAINT battery_day_entries_source_type_chk
  CHECK (
    source_type IS NULL
    OR source_type IN ('todo', 'timetable')
  );

COMMENT ON COLUMN public.battery_day_entries.source_type IS
  'Origine de l’entrée : todo | timetable (null = saisie manuelle Batterie).';
COMMENT ON COLUMN public.battery_day_entries.source_id IS
  'Id de la tâche TODO ou de l’événement EDT source.';

CREATE UNIQUE INDEX IF NOT EXISTS battery_day_entries_source_day_uidx
  ON public.battery_day_entries (user_id, source_type, source_id, day_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS battery_day_entries_source_idx
  ON public.battery_day_entries (user_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

COMMIT;
