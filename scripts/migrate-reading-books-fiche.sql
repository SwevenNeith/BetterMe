-- Migration fiche de lecture (BetterMe)
-- Exécute dans le SQL Editor Supabase après create-reading-books.sql

ALTER TABLE public.reading_books
  ADD COLUMN IF NOT EXISTS collection text,
  ADD COLUMN IF NOT EXISTS date_start date,
  ADD COLUMN IF NOT EXISTS date_end date,
  ADD COLUMN IF NOT EXISTS rating numeric(2, 1),
  ADD COLUMN IF NOT EXISTS pages integer,
  ADD COLUMN IF NOT EXISTS publication_year integer,
  ADD COLUMN IF NOT EXISTS comments text,
  ADD COLUMN IF NOT EXISTS quote text,
  ADD COLUMN IF NOT EXISTS spoil text;

ALTER TABLE public.reading_books
  DROP CONSTRAINT IF EXISTS reading_books_rating_range;

ALTER TABLE public.reading_books
  ADD CONSTRAINT reading_books_rating_range
  CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5 AND (rating * 2) = floor(rating * 2)));

ALTER TABLE public.reading_books
  DROP CONSTRAINT IF EXISTS reading_books_pages_positive;

ALTER TABLE public.reading_books
  ADD CONSTRAINT reading_books_pages_positive
  CHECK (pages IS NULL OR pages > 0);

ALTER TABLE public.reading_books
  DROP CONSTRAINT IF EXISTS reading_books_publication_year_range;

ALTER TABLE public.reading_books
  ADD CONSTRAINT reading_books_publication_year_range
  CHECK (publication_year IS NULL OR (publication_year >= 0 AND publication_year <= 2100));

COMMENT ON COLUMN public.reading_books.collection IS 'Collection / série du livre';
COMMENT ON COLUMN public.reading_books.date_start IS 'Date de début de lecture';
COMMENT ON COLUMN public.reading_books.date_end IS 'Date de fin de lecture';
COMMENT ON COLUMN public.reading_books.rating IS 'Note sur 5 (incréments de 0,5)';
COMMENT ON COLUMN public.reading_books.pages IS 'Nombre de pages';
COMMENT ON COLUMN public.reading_books.publication_year IS 'Année de publication';
COMMENT ON COLUMN public.reading_books.comments IS 'Commentaires de lecture';
COMMENT ON COLUMN public.reading_books.quote IS 'Citation marquante';
COMMENT ON COLUMN public.reading_books.spoil IS 'Notes spoil (à venir)';
