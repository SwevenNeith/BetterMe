-- Horodatage de complétion pour les étapes « une fois » (purge après 1 mois).
ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS done_at timestamptz;

ALTER TABLE public.project_substeps
  ADD COLUMN IF NOT EXISTS done_at timestamptz;

-- Approximation pour les éléments déjà cochés avant la migration.
UPDATE public.project_steps
SET done_at = created_at
WHERE is_done = true
  AND done_at IS NULL
  AND COALESCE(quantite_cible, 0) < 1;

UPDATE public.project_substeps
SET done_at = created_at
WHERE is_done = true
  AND done_at IS NULL
  AND COALESCE(quantite_cible, 0) < 1;

CREATE INDEX IF NOT EXISTS project_steps_stale_done_idx
  ON public.project_steps (user_id, done_at)
  WHERE is_done = true AND COALESCE(quantite_cible, 0) < 1;

CREATE INDEX IF NOT EXISTS project_substeps_stale_done_idx
  ON public.project_substeps (user_id, done_at)
  WHERE is_done = true AND COALESCE(quantite_cible, 0) < 1;
