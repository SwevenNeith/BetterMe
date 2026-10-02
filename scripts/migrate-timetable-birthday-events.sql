-- Anniversaires EDT : kind + date d’origine (naissance / début).
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.timetable_events
  ADD COLUMN IF NOT EXISTS event_kind text;

ALTER TABLE public.timetable_events
  ADD COLUMN IF NOT EXISTS origin_date date;

ALTER TABLE public.timetable_events
  DROP CONSTRAINT IF EXISTS timetable_events_event_kind_check;

ALTER TABLE public.timetable_events
  ADD CONSTRAINT timetable_events_event_kind_check
  CHECK (event_kind IS NULL OR event_kind IN ('birthday'));

COMMENT ON COLUMN public.timetable_events.event_kind IS
  'Type spécial : birthday = anniversaire annuel (expansion à l’affichage). NULL = événement normal.';

COMMENT ON COLUMN public.timetable_events.origin_date IS
  'Date d’origine (naissance) pour calculer l’âge sur les anniversaires.';

CREATE INDEX IF NOT EXISTS timetable_events_user_kind_idx
  ON public.timetable_events (user_id, event_kind)
  WHERE event_kind IS NOT NULL;

COMMIT;
