-- Autorise quantite_cible = 0 (mode checkbox, objectif unique)
-- À exécuter si migrate-project-steps-quantity.sql a déjà été lancé avec quantite >= 1

ALTER TABLE public.project_steps
  ALTER COLUMN quantite_cible SET DEFAULT 0;

ALTER TABLE public.project_substeps
  ALTER COLUMN quantite_cible SET DEFAULT 0;

ALTER TABLE public.project_steps DROP CONSTRAINT IF EXISTS project_steps_quantite_check;
ALTER TABLE public.project_steps
  ADD CONSTRAINT project_steps_quantite_check CHECK (quantite_cible >= 0 AND quantite_cible <= 999);

ALTER TABLE public.project_substeps DROP CONSTRAINT IF EXISTS project_substeps_quantite_check;
ALTER TABLE public.project_substeps
  ADD CONSTRAINT project_substeps_quantite_check CHECK (quantite_cible >= 0 AND quantite_cible <= 999);

COMMENT ON COLUMN public.project_steps.quantite_cible IS '0 = une fois (checkbox) ; >= 1 = objectif par période';
COMMENT ON COLUMN public.project_substeps.quantite_cible IS '0 = une fois (checkbox) ; >= 1 = objectif par période';
