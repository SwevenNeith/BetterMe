-- Numéro de tome pour les livres en série (BetterMe — Lecture)
-- Exécute dans le SQL Editor Supabase.

ALTER TABLE public.reading_books
  ADD COLUMN IF NOT EXISTS saga_volume integer;

-- Livres déjà marqués « Série » → tome 1 par défaut
UPDATE public.reading_books
SET saga_volume = 1
WHERE is_saga = true
  AND saga_volume IS NULL;

COMMENT ON COLUMN public.reading_books.saga_volume IS 'Numéro de tome lorsque is_saga est true';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reading_books_saga_volume_positive'
  ) THEN
    ALTER TABLE public.reading_books
      ADD CONSTRAINT reading_books_saga_volume_positive
      CHECK (saga_volume IS NULL OR saga_volume >= 1);
  END IF;
END $$;
