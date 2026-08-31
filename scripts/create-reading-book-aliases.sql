-- Alias de titres pour la liaison Habit Tracker ↔ Lectures (BetterMe)
-- Exécute dans le SQL Editor Supabase après create-reading-books.sql

CREATE TABLE IF NOT EXISTS public.reading_book_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.reading_books (id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_book_aliases_alias_not_blank CHECK (char_length(trim(alias)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS reading_book_aliases_user_alias_unique
  ON public.reading_book_aliases (user_id, lower(trim(alias)));

CREATE INDEX IF NOT EXISTS reading_book_aliases_user_book_idx
  ON public.reading_book_aliases (user_id, book_id);

COMMENT ON TABLE public.reading_book_aliases IS 'Titres alternatifs (ex. abréviations) pointant vers un livre de la bibliothèque';
COMMENT ON COLUMN public.reading_book_aliases.alias IS 'Titre tel qu''il apparaît dans les détails d''habitude (ex. « PNL »)';

ALTER TABLE public.reading_book_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reading_book_aliases_select_own" ON public.reading_book_aliases;
CREATE POLICY "reading_book_aliases_select_own"
  ON public.reading_book_aliases FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_book_aliases_insert_own" ON public.reading_book_aliases;
CREATE POLICY "reading_book_aliases_insert_own"
  ON public.reading_book_aliases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_book_aliases_update_own" ON public.reading_book_aliases;
CREATE POLICY "reading_book_aliases_update_own"
  ON public.reading_book_aliases FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_book_aliases_delete_own" ON public.reading_book_aliases;
CREATE POLICY "reading_book_aliases_delete_own"
  ON public.reading_book_aliases FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_book_aliases TO authenticated;
GRANT ALL ON public.reading_book_aliases TO service_role;
