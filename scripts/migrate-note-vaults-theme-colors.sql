-- Thème 4 couleurs pour les coffres Notes — BetterMe
-- Exécute dans le SQL Editor Supabase (après create-note-vaults.sql).

BEGIN;

ALTER TABLE public.note_vaults
  ADD COLUMN IF NOT EXISTS surface_color text NULL,
  ADD COLUMN IF NOT EXISTS gradient_color text NULL;

COMMENT ON COLUMN public.note_vaults.surface_color IS
  'Couleur de surface / fond principal du coffre (hex).';
COMMENT ON COLUMN public.note_vaults.gradient_color IS
  'Couleur secondaire pour dégradés (vue globale, cartes) (hex).';

-- Valeurs par défaut pour les coffres existants (dérivées de color / accent_color).
UPDATE public.note_vaults
SET
  surface_color = COALESCE(surface_color, '#f4f0fa'),
  gradient_color = COALESCE(gradient_color, '#95d1aa')
WHERE surface_color IS NULL OR gradient_color IS NULL;

COMMIT;
