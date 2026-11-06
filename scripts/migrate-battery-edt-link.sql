-- Liaison Batterie ↔ EDT : catégories, priorités, horaires prévus, implications.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

-- Priorité catalogue
ALTER TABLE public.battery_activities
  ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES public.timetable_categories (id) ON DELETE SET NULL;

ALTER TABLE public.battery_activities
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'p3';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'battery_activities_priority_chk'
  ) THEN
    ALTER TABLE public.battery_activities
      ADD CONSTRAINT battery_activities_priority_chk
      CHECK (priority IN ('obligatoire', 'p1', 'p2', 'p3', 'p4'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS battery_activities_category_idx
  ON public.battery_activities (user_id, category_id);

CREATE INDEX IF NOT EXISTS battery_activities_priority_idx
  ON public.battery_activities (user_id, priority);

COMMENT ON COLUMN public.battery_activities.category_id IS
  'Catégorie EDT (timetable_categories). Hobbies = seule catégorie sans horaire obligatoire.';
COMMENT ON COLUMN public.battery_activities.priority IS
  'Priorité : obligatoire > p1 > p2 > p3 > p4.';

-- Implications parent → enfants
CREATE TABLE IF NOT EXISTS public.battery_activity_implications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_activity_id uuid NOT NULL REFERENCES public.battery_activities (id) ON DELETE CASCADE,
  child_activity_id uuid NOT NULL REFERENCES public.battery_activities (id) ON DELETE CASCADE,
  offset_minutes integer NOT NULL DEFAULT -30,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT battery_activity_implications_distinct_chk
    CHECK (parent_activity_id <> child_activity_id),
  CONSTRAINT battery_activity_implications_unique
    UNIQUE (user_id, parent_activity_id, child_activity_id)
);

CREATE INDEX IF NOT EXISTS battery_activity_implications_parent_idx
  ON public.battery_activity_implications (user_id, parent_activity_id);

CREATE INDEX IF NOT EXISTS battery_activity_implications_child_idx
  ON public.battery_activity_implications (user_id, child_activity_id);

COMMENT ON TABLE public.battery_activity_implications IS
  'Activités catalogue impliquées par une autre (ex. RDV → transports).';
COMMENT ON COLUMN public.battery_activity_implications.offset_minutes IS
  'Décalage du début enfant vs début parent (négatif = avant).';

ALTER TABLE public.battery_activity_implications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS battery_activity_implications_select ON public.battery_activity_implications;
CREATE POLICY battery_activity_implications_select
  ON public.battery_activity_implications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS battery_activity_implications_insert ON public.battery_activity_implications;
CREATE POLICY battery_activity_implications_insert
  ON public.battery_activity_implications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS battery_activity_implications_update ON public.battery_activity_implications;
CREATE POLICY battery_activity_implications_update
  ON public.battery_activity_implications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS battery_activity_implications_delete ON public.battery_activity_implications;
CREATE POLICY battery_activity_implications_delete
  ON public.battery_activity_implications FOR DELETE
  USING (auth.uid() = user_id);

-- Entrées jour : horaires, priorité, implication
ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS planned_start time NULL;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS planned_end time NULL;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS priority text NULL;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS implied_by_entry_id uuid NULL
    REFERENCES public.battery_day_entries (id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'battery_day_entries_priority_chk'
  ) THEN
    ALTER TABLE public.battery_day_entries
      ADD CONSTRAINT battery_day_entries_priority_chk
      CHECK (priority IS NULL OR priority IN ('obligatoire', 'p1', 'p2', 'p3', 'p4'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS battery_day_entries_implied_idx
  ON public.battery_day_entries (implied_by_entry_id)
  WHERE implied_by_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS battery_day_entries_planned_start_idx
  ON public.battery_day_entries (day_id, planned_start);

COMMENT ON COLUMN public.battery_day_entries.planned_start IS
  'Heure de début prévue (obligatoire hors Hobbies).';
COMMENT ON COLUMN public.battery_day_entries.planned_end IS
  'Heure de fin prévue.';
COMMENT ON COLUMN public.battery_day_entries.implied_by_entry_id IS
  'Entrée parente si cette ligne est une implication (coût non double-compté dans l’agrégat parent).';
COMMENT ON COLUMN public.battery_day_entries.priority IS
  'Priorité de l’entrée (copie catalogue à la planification).';

-- EDT : lien activité + implication + priorité
ALTER TABLE public.timetable_events
  ADD COLUMN IF NOT EXISTS battery_activity_id uuid NULL
    REFERENCES public.battery_activities (id) ON DELETE SET NULL;

ALTER TABLE public.timetable_events
  ADD COLUMN IF NOT EXISTS implied_by_event_id uuid NULL
    REFERENCES public.timetable_events (id) ON DELETE CASCADE;

ALTER TABLE public.timetable_events
  ADD COLUMN IF NOT EXISTS priority text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_events_priority_chk'
  ) THEN
    ALTER TABLE public.timetable_events
      ADD CONSTRAINT timetable_events_priority_chk
      CHECK (priority IS NULL OR priority IN ('obligatoire', 'p1', 'p2', 'p3', 'p4'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS timetable_events_battery_activity_idx
  ON public.timetable_events (user_id, battery_activity_id)
  WHERE battery_activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS timetable_events_implied_idx
  ON public.timetable_events (implied_by_event_id)
  WHERE implied_by_event_id IS NOT NULL;

COMMENT ON COLUMN public.timetable_events.battery_activity_id IS
  'Activité catalogue Batterie liée à cet événement.';
COMMENT ON COLUMN public.timetable_events.implied_by_event_id IS
  'Événement parent si celui-ci est une implication (toujours affiché chronologiquement).';
COMMENT ON COLUMN public.timetable_events.priority IS
  'Priorité affichée sur l’EDT.';

COMMIT;
