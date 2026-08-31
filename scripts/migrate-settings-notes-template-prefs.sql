-- Préférences de l’extension Templates (page Notes — BetterMe)
-- Exécute dans le SQL Editor Supabase après migrate-settings-notes-extensions.sql
--
-- notes_template_prefs : jsonb
-- Exemple :
-- {
--   "folderName": "Templates",
--   "folderId": "uuid-du-dossier",
--   "rules": [
--     { "id": "...", "type": "folder", "folderId": "...", "templateNoteId": "..." },
--     { "id": "...", "type": "title-exact", "pattern": "Réunion", "templateNoteId": "..." },
--     { "id": "...", "type": "title-contains", "pattern": "journal", "templateNoteId": "..." },
--     { "id": "...", "type": "default", "templateNoteId": "..." }
--   ]
-- }

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notes_template_prefs jsonb;

COMMENT ON COLUMN public.settings.notes_template_prefs IS
  'Configuration de l’extension Templates de la page Notes (dossier modèles + règles).';

COMMIT;
