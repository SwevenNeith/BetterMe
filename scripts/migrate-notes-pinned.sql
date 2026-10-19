-- Notes épinglées (apparaissent en haut de l’arborescence)
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notes.is_pinned IS
  'Note épinglée : affichée en priorité en haut de son dossier / de la liste.';

CREATE INDEX IF NOT EXISTS notes_user_pinned_idx
  ON public.notes (user_id, is_pinned)
  WHERE is_pinned = true;

COMMIT;
