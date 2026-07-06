-- Quantité cible + période de réinitialisation pour étapes / sous-étapes
-- + journal des complétions pour statistiques et historique
-- À exécuter dans le SQL Editor Supabase

ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS quantite_cible integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reset_periode text NOT NULL DEFAULT 'jour';

ALTER TABLE public.project_steps DROP CONSTRAINT IF EXISTS project_steps_quantite_check;
ALTER TABLE public.project_steps DROP CONSTRAINT IF EXISTS project_steps_reset_periode_check;

ALTER TABLE public.project_steps
  ADD CONSTRAINT project_steps_quantite_check CHECK (quantite_cible >= 1 AND quantite_cible <= 999),
  ADD CONSTRAINT project_steps_reset_periode_check CHECK (reset_periode IN ('jour', 'semaine', 'mois'));

ALTER TABLE public.project_substeps
  ADD COLUMN IF NOT EXISTS quantite_cible integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reset_periode text NOT NULL DEFAULT 'jour';

ALTER TABLE public.project_substeps DROP CONSTRAINT IF EXISTS project_substeps_quantite_check;
ALTER TABLE public.project_substeps DROP CONSTRAINT IF EXISTS project_substeps_reset_periode_check;

ALTER TABLE public.project_substeps
  ADD CONSTRAINT project_substeps_quantite_check CHECK (quantite_cible >= 1 AND quantite_cible <= 999),
  ADD CONSTRAINT project_substeps_reset_periode_check CHECK (reset_periode IN ('jour', 'semaine', 'mois'));

COMMENT ON COLUMN public.project_steps.quantite_cible IS 'Objectif de réalisations par période (dépassement autorisé)';
COMMENT ON COLUMN public.project_steps.reset_periode IS 'jour | semaine | mois — réinitialisation en fin de période';
COMMENT ON COLUMN public.project_substeps.quantite_cible IS 'Objectif de réalisations par période (dépassement autorisé)';
COMMENT ON COLUMN public.project_substeps.reset_periode IS 'jour | semaine | mois — réinitialisation en fin de période';

CREATE TABLE IF NOT EXISTS public.project_progress_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.project_steps (id) ON DELETE CASCADE,
  substep_id uuid REFERENCES public.project_substeps (id) ON DELETE CASCADE,
  logged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_progress_logs_one_target CHECK (
    (step_id IS NOT NULL AND substep_id IS NULL)
    OR (step_id IS NULL AND substep_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS project_progress_logs_user_step_idx
  ON public.project_progress_logs (user_id, step_id, logged_at DESC)
  WHERE step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_progress_logs_user_substep_idx
  ON public.project_progress_logs (user_id, substep_id, logged_at DESC)
  WHERE substep_id IS NOT NULL;

COMMENT ON TABLE public.project_progress_logs IS 'Une ligne = une réalisation (+1) d''étape ou sous-étape';

ALTER TABLE public.project_progress_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_progress_logs_select_own" ON public.project_progress_logs;
CREATE POLICY "project_progress_logs_select_own"
  ON public.project_progress_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_progress_logs_insert_own" ON public.project_progress_logs;
CREATE POLICY "project_progress_logs_insert_own"
  ON public.project_progress_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_progress_logs_delete_own" ON public.project_progress_logs;
CREATE POLICY "project_progress_logs_delete_own"
  ON public.project_progress_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.project_progress_logs TO authenticated;
GRANT ALL ON public.project_progress_logs TO service_role;
