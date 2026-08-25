-- Onboarding visibilité (BetterMe)
-- Exécute dans le SQL Editor Supabase.
--
-- visibility_onboarding_completed :
--   false → formulaire d’accueil au premier accès
--   true  → déjà validé
-- Les comptes déjà présents sont marqués true (une seule fois via NULL).

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS visibility_onboarding_completed boolean;

-- Comptes existants (colonne encore NULL) : ne pas réafficher le formulaire
UPDATE public.settings
SET visibility_onboarding_completed = true
WHERE visibility_onboarding_completed IS NULL;

ALTER TABLE public.settings
  ALTER COLUMN visibility_onboarding_completed SET DEFAULT false;

ALTER TABLE public.settings
  ALTER COLUMN visibility_onboarding_completed SET NOT NULL;

COMMENT ON COLUMN public.settings.visibility_onboarding_completed IS
  'true si l’utilisateur a validé le formulaire de visibilité au premier accès';

COMMIT;
