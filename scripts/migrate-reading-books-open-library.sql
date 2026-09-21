-- Liaison Lecture ↔ Open Library (BetterMe)
-- Safe : colonnes nullable uniquement, aucune suppression.
-- Exécute dans le SQL Editor Supabase.

ALTER TABLE public.reading_books
  ADD COLUMN IF NOT EXISTS open_library_work_key text;

COMMENT ON COLUMN public.reading_books.open_library_work_key IS
  'Clé Open Library du work (ex. /works/OL82563W). Préserve l’id BetterMe et toutes les données perso.';

CREATE UNIQUE INDEX IF NOT EXISTS reading_books_user_ol_work_unique
  ON public.reading_books (user_id, open_library_work_key)
  WHERE open_library_work_key IS NOT NULL AND char_length(trim(open_library_work_key)) > 0;
