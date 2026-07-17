-- Migration : booléen saga sur reading_books (BetterMe)
-- Exécute dans le SQL Editor Supabase après migrate-reading-books-fiche.sql

ALTER TABLE public.reading_books
  ADD COLUMN IF NOT EXISTS is_saga boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reading_books.is_saga IS 'Indique si le livre fait partie d''une saga';
