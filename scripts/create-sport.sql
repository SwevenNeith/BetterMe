-- Module Sport (Wger catalogue + séances / performances perso)
-- Exécute dans le SQL Editor Supabase.

BEGIN;

-- ---------------------------------------------------------------------------
-- Profil sportif
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sport_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  goals text NULL,
  weekly_sessions_goal integer NOT NULL DEFAULT 3
    CHECK (weekly_sessions_goal BETWEEN 0 AND 14),
  typical_duration_min integer NOT NULL DEFAULT 45
    CHECK (typical_duration_min BETWEEN 5 AND 300),
  weight_unit text NOT NULL DEFAULT 'kg'
    CHECK (weight_unit IN ('kg', 'lb')),
  priority_muscle_ids integer[] NOT NULL DEFAULT '{}',
  home_equipment_ids integer[] NOT NULL DEFAULT '{}',
  gym_equipment_ids integer[] NOT NULL DEFAULT '{}',
  unavailable_equipment_ids integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.sport_profiles IS
  'Préférences Sport : objectifs, matériel maison/salle, fréquence hebdo.';
COMMENT ON COLUMN public.sport_profiles.home_equipment_ids IS
  'IDs matériel Wger disponibles à la maison (equipment.id).';
COMMENT ON COLUMN public.sport_profiles.gym_equipment_ids IS
  'IDs matériel Wger disponibles en salle.';
COMMENT ON COLUMN public.sport_profiles.unavailable_equipment_ids IS
  'IDs matériel Wger auxquels l’utilisateur n’a pas accès.';

-- ---------------------------------------------------------------------------
-- Exercices (favoris Wger + exercices personnalisés)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sport_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('wger', 'custom')),
  wger_id integer NULL,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  description text NULL,
  instructions text NULL,
  category_name text NULL,
  muscle_ids integer[] NOT NULL DEFAULT '{}',
  secondary_muscle_ids integer[] NOT NULL DEFAULT '{}',
  equipment_ids integer[] NOT NULL DEFAULT '{}',
  image_url text NULL,
  language_code text NULL,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT sport_exercises_wger_id_chk CHECK (
    (source = 'wger' AND wger_id IS NOT NULL)
    OR (source = 'custom' AND wger_id IS NULL)
  )
);

COMMENT ON TABLE public.sport_exercises IS
  'Exercices perso : cache favoris Wger + exercices custom. Pas le catalogue entier.';

CREATE UNIQUE INDEX IF NOT EXISTS sport_exercises_user_wger_uidx
  ON public.sport_exercises (user_id, wger_id)
  WHERE wger_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sport_exercises_user_fav_idx
  ON public.sport_exercises (user_id, is_favorite, name)
  WHERE is_favorite = true;

CREATE INDEX IF NOT EXISTS sport_exercises_user_source_idx
  ON public.sport_exercises (user_id, source, name);

-- ---------------------------------------------------------------------------
-- Modèles de séances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sport_workout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  description text NULL,
  estimated_duration_min integer NULL
    CHECK (estimated_duration_min IS NULL OR estimated_duration_min BETWEEN 1 AND 600),
  muscle_focus integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS sport_workout_templates_user_idx
  ON public.sport_workout_templates (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.sport_workout_template_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.sport_workout_templates (id) ON DELETE CASCADE,
  exercise_id uuid NULL REFERENCES public.sport_exercises (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  target_sets integer NOT NULL DEFAULT 3 CHECK (target_sets BETWEEN 1 AND 50),
  target_reps integer NULL CHECK (target_reps IS NULL OR target_reps BETWEEN 1 AND 500),
  target_weight numeric(8, 2) NULL,
  weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
  rest_seconds integer NOT NULL DEFAULT 90 CHECK (rest_seconds BETWEEN 0 AND 3600),
  notes text NULL,
  -- Snapshot pour stabilité si l’exercice source change / Wger indispo
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS sport_template_ex_template_idx
  ON public.sport_workout_template_exercises (template_id, sort_order);

CREATE INDEX IF NOT EXISTS sport_template_ex_user_idx
  ON public.sport_workout_template_exercises (user_id, template_id);

-- ---------------------------------------------------------------------------
-- Séances exécutées
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sport_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  template_id uuid NULL REFERENCES public.sport_workout_templates (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'paused', 'completed', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ended_at timestamptz NULL,
  paused_at timestamptz NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  active_elapsed_ms bigint NOT NULL DEFAULT 0 CHECK (active_elapsed_ms >= 0),
  current_exercise_index integer NOT NULL DEFAULT 0 CHECK (current_exercise_index >= 0),
  notes text NULL,
  planned_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON COLUMN public.sport_sessions.active_elapsed_ms IS
  'Temps actif côté client (hors pause), persisté pour reprise.';
COMMENT ON COLUMN public.sport_sessions.planned_at IS
  'Date/heure planifiée (prochaine séance), optionnel.';

CREATE INDEX IF NOT EXISTS sport_sessions_user_started_idx
  ON public.sport_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS sport_sessions_user_status_idx
  ON public.sport_sessions (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sport_sessions_user_planned_idx
  ON public.sport_sessions (user_id, planned_at)
  WHERE planned_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sport_session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sport_sessions (id) ON DELETE CASCADE,
  exercise_id uuid NULL REFERENCES public.sport_exercises (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  target_sets integer NOT NULL DEFAULT 3 CHECK (target_sets BETWEEN 1 AND 50),
  target_reps integer NULL,
  target_weight numeric(8, 2) NULL,
  weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
  rest_seconds integer NOT NULL DEFAULT 90 CHECK (rest_seconds BETWEEN 0 AND 3600),
  notes text NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS sport_session_ex_session_idx
  ON public.sport_session_exercises (session_id, sort_order);

CREATE TABLE IF NOT EXISTS public.sport_session_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sport_sessions (id) ON DELETE CASCADE,
  session_exercise_id uuid NOT NULL REFERENCES public.sport_session_exercises (id) ON DELETE CASCADE,
  set_number integer NOT NULL CHECK (set_number BETWEEN 1 AND 100),
  reps integer NULL CHECK (reps IS NULL OR reps BETWEEN 0 AND 1000),
  weight numeric(8, 2) NULL,
  weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
  duration_seconds integer NULL CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  distance_m numeric(10, 2) NULL CHECK (distance_m IS NULL OR distance_m >= 0),
  difficulty smallint NULL CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
  notes text NULL,
  completed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (session_exercise_id, set_number)
);

CREATE INDEX IF NOT EXISTS sport_session_sets_session_idx
  ON public.sport_session_sets (session_id, completed_at);

CREATE INDEX IF NOT EXISTS sport_session_sets_user_ex_idx
  ON public.sport_session_sets (user_id, session_exercise_id, set_number);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.sport_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_workout_template_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_session_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sport_profiles_select_own ON public.sport_profiles;
CREATE POLICY sport_profiles_select_own ON public.sport_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_profiles_insert_own ON public.sport_profiles;
CREATE POLICY sport_profiles_insert_own ON public.sport_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_profiles_update_own ON public.sport_profiles;
CREATE POLICY sport_profiles_update_own ON public.sport_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_profiles_delete_own ON public.sport_profiles;
CREATE POLICY sport_profiles_delete_own ON public.sport_profiles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sport_exercises_select_own ON public.sport_exercises;
CREATE POLICY sport_exercises_select_own ON public.sport_exercises
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_exercises_insert_own ON public.sport_exercises;
CREATE POLICY sport_exercises_insert_own ON public.sport_exercises
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_exercises_update_own ON public.sport_exercises;
CREATE POLICY sport_exercises_update_own ON public.sport_exercises
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_exercises_delete_own ON public.sport_exercises;
CREATE POLICY sport_exercises_delete_own ON public.sport_exercises
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sport_workout_templates_select_own ON public.sport_workout_templates;
CREATE POLICY sport_workout_templates_select_own ON public.sport_workout_templates
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_workout_templates_insert_own ON public.sport_workout_templates;
CREATE POLICY sport_workout_templates_insert_own ON public.sport_workout_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_workout_templates_update_own ON public.sport_workout_templates;
CREATE POLICY sport_workout_templates_update_own ON public.sport_workout_templates
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_workout_templates_delete_own ON public.sport_workout_templates;
CREATE POLICY sport_workout_templates_delete_own ON public.sport_workout_templates
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sport_template_ex_select_own ON public.sport_workout_template_exercises;
CREATE POLICY sport_template_ex_select_own ON public.sport_workout_template_exercises
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_template_ex_insert_own ON public.sport_workout_template_exercises;
CREATE POLICY sport_template_ex_insert_own ON public.sport_workout_template_exercises
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_template_ex_update_own ON public.sport_workout_template_exercises;
CREATE POLICY sport_template_ex_update_own ON public.sport_workout_template_exercises
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_template_ex_delete_own ON public.sport_workout_template_exercises;
CREATE POLICY sport_template_ex_delete_own ON public.sport_workout_template_exercises
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sport_sessions_select_own ON public.sport_sessions;
CREATE POLICY sport_sessions_select_own ON public.sport_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_sessions_insert_own ON public.sport_sessions;
CREATE POLICY sport_sessions_insert_own ON public.sport_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_sessions_update_own ON public.sport_sessions;
CREATE POLICY sport_sessions_update_own ON public.sport_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_sessions_delete_own ON public.sport_sessions;
CREATE POLICY sport_sessions_delete_own ON public.sport_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sport_session_ex_select_own ON public.sport_session_exercises;
CREATE POLICY sport_session_ex_select_own ON public.sport_session_exercises
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_session_ex_insert_own ON public.sport_session_exercises;
CREATE POLICY sport_session_ex_insert_own ON public.sport_session_exercises
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_session_ex_update_own ON public.sport_session_exercises;
CREATE POLICY sport_session_ex_update_own ON public.sport_session_exercises
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_session_ex_delete_own ON public.sport_session_exercises;
CREATE POLICY sport_session_ex_delete_own ON public.sport_session_exercises
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sport_session_sets_select_own ON public.sport_session_sets;
CREATE POLICY sport_session_sets_select_own ON public.sport_session_sets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_session_sets_insert_own ON public.sport_session_sets;
CREATE POLICY sport_session_sets_insert_own ON public.sport_session_sets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_session_sets_update_own ON public.sport_session_sets;
CREATE POLICY sport_session_sets_update_own ON public.sport_session_sets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sport_session_sets_delete_own ON public.sport_session_sets;
CREATE POLICY sport_session_sets_delete_own ON public.sport_session_sets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.sport_profiles TO authenticated;
GRANT ALL ON TABLE public.sport_exercises TO authenticated;
GRANT ALL ON TABLE public.sport_workout_templates TO authenticated;
GRANT ALL ON TABLE public.sport_workout_template_exercises TO authenticated;
GRANT ALL ON TABLE public.sport_sessions TO authenticated;
GRANT ALL ON TABLE public.sport_session_exercises TO authenticated;
GRANT ALL ON TABLE public.sport_session_sets TO authenticated;

GRANT ALL ON TABLE public.sport_profiles TO service_role;
GRANT ALL ON TABLE public.sport_exercises TO service_role;
GRANT ALL ON TABLE public.sport_workout_templates TO service_role;
GRANT ALL ON TABLE public.sport_workout_template_exercises TO service_role;
GRANT ALL ON TABLE public.sport_sessions TO service_role;
GRANT ALL ON TABLE public.sport_session_exercises TO service_role;
GRANT ALL ON TABLE public.sport_session_sets TO service_role;

COMMIT;
