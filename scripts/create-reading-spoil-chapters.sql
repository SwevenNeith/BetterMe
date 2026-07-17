-- Chapitres Spoil (BetterMe — fiche de lecture)
-- Exécute dans le SQL Editor Supabase

CREATE TABLE IF NOT EXISTS public.reading_spoil_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.reading_books (id) ON DELETE CASCADE,
  chapter_number text NOT NULL,
  characters_met text NOT NULL DEFAULT '',
  world_building text NOT NULL DEFAULT '',
  scene text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_spoil_chapters_number_not_blank CHECK (char_length(trim(chapter_number)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS reading_spoil_chapters_book_number_uidx
  ON public.reading_spoil_chapters (book_id, lower(trim(chapter_number)));

CREATE INDEX IF NOT EXISTS reading_spoil_chapters_book_id_idx
  ON public.reading_spoil_chapters (book_id);

CREATE INDEX IF NOT EXISTS reading_spoil_chapters_user_id_idx
  ON public.reading_spoil_chapters (user_id);

COMMENT ON TABLE public.reading_spoil_chapters IS 'Notes spoil par chapitre pour un livre';
COMMENT ON COLUMN public.reading_spoil_chapters.chapter_number IS 'Numéro / libellé du chapitre';
COMMENT ON COLUMN public.reading_spoil_chapters.characters_met IS 'Personnages rencontrés';
COMMENT ON COLUMN public.reading_spoil_chapters.world_building IS 'World building';
COMMENT ON COLUMN public.reading_spoil_chapters.scene IS 'Scène / résumé de scène';

ALTER TABLE public.reading_spoil_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reading_spoil_chapters_select_own" ON public.reading_spoil_chapters;
CREATE POLICY "reading_spoil_chapters_select_own"
  ON public.reading_spoil_chapters FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_spoil_chapters_insert_own" ON public.reading_spoil_chapters;
CREATE POLICY "reading_spoil_chapters_insert_own"
  ON public.reading_spoil_chapters FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_spoil_chapters_update_own" ON public.reading_spoil_chapters;
CREATE POLICY "reading_spoil_chapters_update_own"
  ON public.reading_spoil_chapters FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_spoil_chapters_delete_own" ON public.reading_spoil_chapters;
CREATE POLICY "reading_spoil_chapters_delete_own"
  ON public.reading_spoil_chapters FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_spoil_chapters TO authenticated;
GRANT ALL ON public.reading_spoil_chapters TO service_role;
