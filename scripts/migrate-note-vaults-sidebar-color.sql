-- Couleur sidebar / contour des coffres Notes — BetterMe
-- Exécute dans le SQL Editor Supabase (après create-note-vaults.sql).

BEGIN;

ALTER TABLE public.note_vaults
  ADD COLUMN IF NOT EXISTS sidebar_color text NULL;

COMMENT ON COLUMN public.note_vaults.sidebar_color IS
  'Couleur de la sidebar et du contour du coffre (hex).';

COMMIT;
