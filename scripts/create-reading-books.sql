-- Table + bucket reading-covers (BetterMe — page Lecture)
-- 1. Crée le bucket « reading-covers » (privé) dans Storage si besoin
-- 2. Exécute ce script dans le SQL Editor Supabase

INSERT INTO storage.buckets (id, name, public)
VALUES ('reading-covers', 'reading-covers', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.reading_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL DEFAULT '',
  cover_storage_path text,
  cover_image_url text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_books_title_not_blank CHECK (char_length(trim(title)) > 0),
  CONSTRAINT reading_books_cover_source CHECK (
    cover_storage_path IS NULL
    OR char_length(trim(cover_storage_path)) > 0
  ),
  CONSTRAINT reading_books_cover_url CHECK (
    cover_image_url IS NULL
    OR char_length(trim(cover_image_url)) > 0
  )
);

CREATE INDEX IF NOT EXISTS reading_books_user_id_idx ON public.reading_books (user_id);
CREATE INDEX IF NOT EXISTS reading_books_user_id_created_at_idx
  ON public.reading_books (user_id, created_at DESC);

COMMENT ON TABLE public.reading_books IS 'Livres de la page Lecture';
COMMENT ON COLUMN public.reading_books.cover_storage_path IS 'Couverture uploadée dans le bucket reading-covers';
COMMENT ON COLUMN public.reading_books.cover_image_url IS 'URL externe de la couverture (si pas d''upload)';
COMMENT ON COLUMN public.reading_books.tags IS 'Mots-clés (un tag = un mot ou segment entre virgules/point-virgules)';

ALTER TABLE public.reading_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reading_books_select_own" ON public.reading_books;
CREATE POLICY "reading_books_select_own"
  ON public.reading_books FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_books_insert_own" ON public.reading_books;
CREATE POLICY "reading_books_insert_own"
  ON public.reading_books FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_books_update_own" ON public.reading_books;
CREATE POLICY "reading_books_update_own"
  ON public.reading_books FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_books_delete_own" ON public.reading_books;
CREATE POLICY "reading_books_delete_own"
  ON public.reading_books FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_books TO authenticated;
GRANT ALL ON public.reading_books TO service_role;

-- Storage : accès limité au dossier {user_id}/...
DROP POLICY IF EXISTS "reading_covers_storage_select_own" ON storage.objects;
CREATE POLICY "reading_covers_storage_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'reading-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "reading_covers_storage_insert_own" ON storage.objects;
CREATE POLICY "reading_covers_storage_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reading-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "reading_covers_storage_update_own" ON storage.objects;
CREATE POLICY "reading_covers_storage_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'reading-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "reading_covers_storage_delete_own" ON storage.objects;
CREATE POLICY "reading_covers_storage_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'reading-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
