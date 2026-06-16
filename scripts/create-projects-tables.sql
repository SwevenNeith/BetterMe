-- Projets + étapes + sous-étapes (BetterMe)
-- À exécuter dans le SQL Editor Supabase

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icone text,
  couleur text NOT NULL DEFAULT '#ad81be',
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_title_not_blank CHECK (char_length(trim(title)) > 0),
  CONSTRAINT projects_sort_order_positive CHECK (sort_order >= 1)
);

CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects (user_id);
CREATE INDEX IF NOT EXISTS projects_user_sort_idx ON public.projects (user_id, sort_order ASC);

COMMENT ON TABLE public.projects IS 'Projets / objectifs personnels';

CREATE TABLE IF NOT EXISTS public.project_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  step_order integer NOT NULL DEFAULT 1,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_steps_title_not_blank CHECK (char_length(trim(title)) > 0),
  CONSTRAINT project_steps_step_order_positive CHECK (step_order >= 1)
);

CREATE INDEX IF NOT EXISTS project_steps_user_id_idx ON public.project_steps (user_id);
CREATE INDEX IF NOT EXISTS project_steps_project_order_idx
  ON public.project_steps (project_id, step_order ASC);

COMMENT ON TABLE public.project_steps IS 'Étapes d''un projet';

CREATE TABLE IF NOT EXISTS public.project_substeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.project_steps (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  substep_order integer NOT NULL DEFAULT 1,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_substeps_title_not_blank CHECK (char_length(trim(title)) > 0),
  CONSTRAINT project_substeps_substep_order_positive CHECK (substep_order >= 1)
);

CREATE INDEX IF NOT EXISTS project_substeps_user_id_idx ON public.project_substeps (user_id);
CREATE INDEX IF NOT EXISTS project_substeps_step_order_idx
  ON public.project_substeps (step_id, substep_order ASC);

COMMENT ON TABLE public.project_substeps IS 'Sous-étapes d''une étape de projet';

-- Migration si tables déjà créées :
-- Voir scripts/migrate-projects-descriptions-todo.sql
-- ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.projects_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_set_updated_at();

CREATE OR REPLACE FUNCTION public.project_steps_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_steps_set_updated_at ON public.project_steps;
CREATE TRIGGER project_steps_set_updated_at
  BEFORE UPDATE ON public.project_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.project_steps_set_updated_at();

CREATE OR REPLACE FUNCTION public.project_substeps_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_substeps_set_updated_at ON public.project_substeps;
CREATE TRIGGER project_substeps_set_updated_at
  BEFORE UPDATE ON public.project_substeps
  FOR EACH ROW
  EXECUTE FUNCTION public.project_substeps_set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_substeps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own"
  ON public.projects FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_insert_own" ON public.projects;
CREATE POLICY "projects_insert_own"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
CREATE POLICY "projects_update_own"
  ON public.projects FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_delete_own" ON public.projects;
CREATE POLICY "projects_delete_own"
  ON public.projects FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_steps_select_own" ON public.project_steps;
CREATE POLICY "project_steps_select_own"
  ON public.project_steps FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_steps_insert_own" ON public.project_steps;
CREATE POLICY "project_steps_insert_own"
  ON public.project_steps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_steps_update_own" ON public.project_steps;
CREATE POLICY "project_steps_update_own"
  ON public.project_steps FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_steps_delete_own" ON public.project_steps;
CREATE POLICY "project_steps_delete_own"
  ON public.project_steps FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_substeps_select_own" ON public.project_substeps;
CREATE POLICY "project_substeps_select_own"
  ON public.project_substeps FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_substeps_insert_own" ON public.project_substeps;
CREATE POLICY "project_substeps_insert_own"
  ON public.project_substeps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_substeps_update_own" ON public.project_substeps;
CREATE POLICY "project_substeps_update_own"
  ON public.project_substeps FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_substeps_delete_own" ON public.project_substeps;
CREATE POLICY "project_substeps_delete_own"
  ON public.project_substeps FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_substeps TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.project_steps TO service_role;
GRANT ALL ON public.project_substeps TO service_role;
