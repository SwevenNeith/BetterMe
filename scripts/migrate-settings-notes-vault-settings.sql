-- Paramètres par coffre (extensions + templates) — page Notes
-- Exécute après create-note-vaults.sql

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notes_vault_settings jsonb;

COMMENT ON COLUMN public.settings.notes_vault_settings IS
  'Paramètres Notes par contexte : clé "root" (hors coffre) ou uuid coffre → { extensions, templatePrefs }.';

COMMIT;
