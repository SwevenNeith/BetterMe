-- Icône emoji par coffre — BetterMe
-- Exécute dans le SQL Editor Supabase (après create-note-vaults.sql).

BEGIN;

ALTER TABLE public.note_vaults
  ADD COLUMN IF NOT EXISTS icon text NULL;

COMMENT ON COLUMN public.note_vaults.icon IS
  'Emoji affiché comme icône du coffre.';

UPDATE public.note_vaults
SET icon = COALESCE(NULLIF(trim(icon), ''), '🗄️')
WHERE icon IS NULL OR trim(icon) = '';

COMMIT;
