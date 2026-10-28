-- Module Batterie (énergie du jour)
-- Exécute dans le SQL Editor Supabase.

BEGIN;

CREATE TABLE IF NOT EXISTS public.battery_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  base_energy integer NOT NULL DEFAULT 10,
  last_base_adjust_date date NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT battery_settings_base_chk CHECK (base_energy BETWEEN 1 AND 40)
);

COMMENT ON TABLE public.battery_settings IS 'Réglages Batterie : base d’énergie recalibrée.';
COMMENT ON COLUMN public.battery_settings.base_energy IS 'Budget de base (départ 10), recalibré selon le ressenti du soir.';

CREATE TABLE IF NOT EXISTS public.battery_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  default_cost numeric(8, 1) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.battery_activities IS 'Catalogue d’activités énergivores / restauratrices.';
COMMENT ON COLUMN public.battery_activities.default_cost IS
  'Coût par défaut signé (positif = dépense, négatif = regain), précision 0.1.';

CREATE UNIQUE INDEX IF NOT EXISTS battery_activities_user_name_uidx
  ON public.battery_activities (user_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS battery_activities_user_idx
  ON public.battery_activities (user_id, name);

CREATE TABLE IF NOT EXISTS public.battery_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day_date date NOT NULL,
  morning_energy smallint NULL CHECK (morning_energy IS NULL OR morning_energy BETWEEN 1 AND 5),
  sleep_quality text NULL CHECK (sleep_quality IS NULL OR sleep_quality IN ('bad', 'ok', 'good')),
  sleep_bedtime time NULL,
  sleep_wake_time time NULL,
  sleep_out_of_bed_time time NULL,
  sleep_hours numeric(4, 1) NULL CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  evening_feeling text NULL CHECK (
    evening_feeling IS NULL OR evening_feeling IN ('empty', 'just', 'left')
  ),
  plan_review_at timestamptz NULL,
  base_snapshot integer NOT NULL DEFAULT 10,
  carryover integer NOT NULL DEFAULT 0,
  computed_budget integer NOT NULL DEFAULT 10,
  calibration_signal smallint NOT NULL DEFAULT 0 CHECK (calibration_signal IN (-1, 0, 1)),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, day_date)
);

COMMENT ON TABLE public.battery_days IS 'État journalier de la batterie (réveil, sommeil, ressenti du soir).';
COMMENT ON COLUMN public.battery_days.sleep_bedtime IS
  'Heure du coucher (veille). Durée de sommeil = écart jusqu’à sleep_wake_time.';
COMMENT ON COLUMN public.battery_days.sleep_wake_time IS 'Heure du réveil.';
COMMENT ON COLUMN public.battery_days.sleep_out_of_bed_time IS
  'Heure de sortie du lit (écart avec le réveil = temps au lit après réveil).';
COMMENT ON COLUMN public.battery_days.sleep_hours IS
  'Durée de sommeil calculée (h), dérivée de sleep_bedtime → sleep_wake_time.';
COMMENT ON COLUMN public.battery_days.evening_feeling IS
  'Ressenti du soir : empty = à sec, just = juste, left = il m’en restait.';
COMMENT ON COLUMN public.battery_days.plan_review_at IS
  'Horodatage de la revue du plan non fait (popup ≥ 23h). Null = revue encore attendue s’il reste du prévu non fait.';
COMMENT ON COLUMN public.battery_days.carryover IS
  'Report négatif de la veille (moitié du dépassement, plafond −3).';

CREATE INDEX IF NOT EXISTS battery_days_user_date_idx
  ON public.battery_days (user_id, day_date DESC);

CREATE TABLE IF NOT EXISTS public.battery_day_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES public.battery_days (id) ON DELETE CASCADE,
  activity_id uuid NULL REFERENCES public.battery_activities (id) ON DELETE SET NULL,
  label text NOT NULL CHECK (char_length(trim(label)) > 0),
  cost numeric(8, 1) NOT NULL DEFAULT 0, -- précision 0.1 (ex. 0.5)
  kind text NOT NULL CHECK (kind IN ('planned', 'actual')),
  sort_order integer NOT NULL DEFAULT 0,
  source_type text NULL CHECK (source_type IS NULL OR source_type IN ('todo', 'timetable')),
  source_id uuid NULL,
  completed_actual_id uuid NULL REFERENCES public.battery_day_entries (id) ON DELETE SET NULL,
  skip_reason text NULL CHECK (
    skip_reason IS NULL
    OR skip_reason IN ('no_energy', 'no_desire', 'unexpected', 'no_time', 'other')
  ),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.battery_day_entries IS
  'Entrées planifiées ou réelles d’une journée Batterie.';
COMMENT ON COLUMN public.battery_day_entries.kind IS
  'planned = planification (veille) ; actual = réalisé (journée / soir).';
COMMENT ON COLUMN public.battery_day_entries.source_type IS
  'Origine de l’entrée : todo | timetable (null = saisie manuelle Batterie).';
COMMENT ON COLUMN public.battery_day_entries.source_id IS
  'Id de la tâche TODO ou de l’événement EDT source.';
COMMENT ON COLUMN public.battery_day_entries.completed_actual_id IS
  'Pour kind=planned : id de l’entrée réelle correspondante une fois faite (null = encore à faire).';
COMMENT ON COLUMN public.battery_day_entries.skip_reason IS
  'Pour kind=planned non fait : pas la force / pas envie / imprévu / plus le temps / autre (null = non renseigné).';

CREATE INDEX IF NOT EXISTS battery_day_entries_day_kind_idx
  ON public.battery_day_entries (day_id, kind, sort_order);

CREATE INDEX IF NOT EXISTS battery_day_entries_completed_actual_idx
  ON public.battery_day_entries (completed_actual_id)
  WHERE completed_actual_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS battery_day_entries_skip_reason_idx
  ON public.battery_day_entries (user_id, skip_reason)
  WHERE skip_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS battery_day_entries_user_activity_idx
  ON public.battery_day_entries (user_id, activity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS battery_day_entries_source_day_uidx
  ON public.battery_day_entries (user_id, source_type, source_id, day_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS battery_day_entries_source_idx
  ON public.battery_day_entries (user_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

ALTER TABLE public.battery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_day_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS battery_settings_select_own ON public.battery_settings;
CREATE POLICY battery_settings_select_own ON public.battery_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_settings_insert_own ON public.battery_settings;
CREATE POLICY battery_settings_insert_own ON public.battery_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_settings_update_own ON public.battery_settings;
CREATE POLICY battery_settings_update_own ON public.battery_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_settings_delete_own ON public.battery_settings;
CREATE POLICY battery_settings_delete_own ON public.battery_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS battery_activities_select_own ON public.battery_activities;
CREATE POLICY battery_activities_select_own ON public.battery_activities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_activities_insert_own ON public.battery_activities;
CREATE POLICY battery_activities_insert_own ON public.battery_activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_activities_update_own ON public.battery_activities;
CREATE POLICY battery_activities_update_own ON public.battery_activities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_activities_delete_own ON public.battery_activities;
CREATE POLICY battery_activities_delete_own ON public.battery_activities
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS battery_days_select_own ON public.battery_days;
CREATE POLICY battery_days_select_own ON public.battery_days
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_days_insert_own ON public.battery_days;
CREATE POLICY battery_days_insert_own ON public.battery_days
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_days_update_own ON public.battery_days;
CREATE POLICY battery_days_update_own ON public.battery_days
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_days_delete_own ON public.battery_days;
CREATE POLICY battery_days_delete_own ON public.battery_days
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS battery_day_entries_select_own ON public.battery_day_entries;
CREATE POLICY battery_day_entries_select_own ON public.battery_day_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_day_entries_insert_own ON public.battery_day_entries;
CREATE POLICY battery_day_entries_insert_own ON public.battery_day_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_day_entries_update_own ON public.battery_day_entries;
CREATE POLICY battery_day_entries_update_own ON public.battery_day_entries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS battery_day_entries_delete_own ON public.battery_day_entries;
CREATE POLICY battery_day_entries_delete_own ON public.battery_day_entries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.battery_settings TO authenticated;
GRANT ALL ON TABLE public.battery_activities TO authenticated;
GRANT ALL ON TABLE public.battery_days TO authenticated;
GRANT ALL ON TABLE public.battery_day_entries TO authenticated;
GRANT ALL ON TABLE public.battery_settings TO service_role;
GRANT ALL ON TABLE public.battery_activities TO service_role;
GRANT ALL ON TABLE public.battery_days TO service_role;
GRANT ALL ON TABLE public.battery_day_entries TO service_role;

COMMIT;
