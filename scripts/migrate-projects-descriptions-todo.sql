-- Migration : descriptions + statut terminé (étapes / sous-étapes)
-- À exécuter dans le SQL Editor Supabase si les tables existent déjà

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false;

ALTER TABLE public.project_substeps
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE public.project_substeps
  ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.description IS 'Description optionnelle du projet';
COMMENT ON COLUMN public.project_steps.description IS 'Description optionnelle de l''étape';
COMMENT ON COLUMN public.project_steps.is_done IS 'Étape marquée comme terminée';
COMMENT ON COLUMN public.project_substeps.description IS 'Description optionnelle de la sous-étape';
COMMENT ON COLUMN public.project_substeps.is_done IS 'Sous-étape marquée comme terminée';
