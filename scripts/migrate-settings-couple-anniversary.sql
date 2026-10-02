-- Anniversaire de couple (réglages) : marqueurs mensuels sur l’EDT.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS couple_anniversary_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS couple_anniversary_start_date date;

COMMENT ON COLUMN public.settings.couple_anniversary_enabled IS
  'Si true, affiche chaque mois sur l’EDT l’anniversaire de couple (âge au mois).';

COMMENT ON COLUMN public.settings.couple_anniversary_start_date IS
  'Date de début de la relation (YYYY-MM-DD) pour les marqueurs mensuels.';

COMMIT;
