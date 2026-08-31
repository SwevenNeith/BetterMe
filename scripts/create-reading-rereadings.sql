-- Relectures par livre (BetterMe — page Lecture)
-- Exécute dans le SQL Editor Supabase après create-reading-books.sql

CREATE TABLE IF NOT EXISTS public.reading_rereadings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.reading_books (id) ON DELETE CASCADE,
  date_start date,
  date_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_rereadings_dates_order CHECK (
    date_start IS NULL
    OR date_end IS NULL
    OR date_end >= date_start
  )
);

CREATE INDEX IF NOT EXISTS reading_rereadings_user_book_idx
  ON public.reading_rereadings (user_id, book_id, created_at ASC);

COMMENT ON TABLE public.reading_rereadings IS 'Historique des relectures d''un livre (dates de début/fin par passage)';
COMMENT ON COLUMN public.reading_rereadings.date_start IS 'Date de début de cette relecture';
COMMENT ON COLUMN public.reading_rereadings.date_end IS 'Date de fin de cette relecture';

ALTER TABLE public.reading_rereadings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reading_rereadings_select_own" ON public.reading_rereadings;
CREATE POLICY "reading_rereadings_select_own"
  ON public.reading_rereadings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_rereadings_insert_own" ON public.reading_rereadings;
CREATE POLICY "reading_rereadings_insert_own"
  ON public.reading_rereadings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_rereadings_update_own" ON public.reading_rereadings;
CREATE POLICY "reading_rereadings_update_own"
  ON public.reading_rereadings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_rereadings_delete_own" ON public.reading_rereadings;
CREATE POLICY "reading_rereadings_delete_own"
  ON public.reading_rereadings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_rereadings TO authenticated;
GRANT ALL ON public.reading_rereadings TO service_role;
