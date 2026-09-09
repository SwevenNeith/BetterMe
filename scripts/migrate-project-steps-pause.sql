-- Pause d’étape / sous-étape (dates + motif) + catalogue de motifs utilisateur.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS pause_from date,
  ADD COLUMN IF NOT EXISTS pause_to date,
  ADD COLUMN IF NOT EXISTS pause_reason text;

ALTER TABLE public.project_substeps
  ADD COLUMN IF NOT EXISTS pause_from date,
  ADD COLUMN IF NOT EXISTS pause_to date,
  ADD COLUMN IF NOT EXISTS pause_reason text;

ALTER TABLE public.project_steps
  DROP CONSTRAINT IF EXISTS project_steps_pause_range_check;
ALTER TABLE public.project_steps
  ADD CONSTRAINT project_steps_pause_range_check
  CHECK (
    pause_from IS NULL
    OR pause_to IS NULL
    OR pause_to >= pause_from
  );

ALTER TABLE public.project_substeps
  DROP CONSTRAINT IF EXISTS project_substeps_pause_range_check;
ALTER TABLE public.project_substeps
  ADD CONSTRAINT project_substeps_pause_range_check
  CHECK (
    pause_from IS NULL
    OR pause_to IS NULL
    OR pause_to >= pause_from
  );

COMMENT ON COLUMN public.project_steps.pause_from IS
  'Début de pause (inclus, date locale YYYY-MM-DD).';
COMMENT ON COLUMN public.project_steps.pause_to IS
  'Fin de pause (inclus).';
COMMENT ON COLUMN public.project_steps.pause_reason IS
  'Motif libre (ex. Vacances, Malade) — aussi stocké dans settings.project_pause_reasons.';

COMMENT ON COLUMN public.project_substeps.pause_from IS
  'Début de pause (inclus).';
COMMENT ON COLUMN public.project_substeps.pause_to IS
  'Fin de pause (inclus).';
COMMENT ON COLUMN public.project_substeps.pause_reason IS
  'Motif de pause.';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS project_pause_reasons jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.settings.project_pause_reasons IS
  'Motifs de pause personnalisés (tableau de chaînes), fusionnés avec les défauts app.';

COMMIT;
