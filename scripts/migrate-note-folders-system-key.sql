-- Daily Notes : clé système sur les dossiers (survie au renommage)
-- Exécute dans le SQL Editor Supabase.

ALTER TABLE public.note_folders
  ADD COLUMN IF NOT EXISTS system_key text NULL;

COMMENT ON COLUMN public.note_folders.system_key IS
  'Clé système (ex. daily_notes). Unique par utilisateur ; NULL pour les dossiers normaux.';

CREATE UNIQUE INDEX IF NOT EXISTS note_folders_user_system_key_uidx
  ON public.note_folders (user_id, system_key)
  WHERE system_key IS NOT NULL;
