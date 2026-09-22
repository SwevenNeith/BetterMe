-- Couverture Open Library dédiée (BetterMe)
-- La couverture perso (upload / URL) reste dans cover_storage_path / cover_image_url
-- et prime toujours sur open_library_cover_url à l'affichage.
-- Safe : colonnes nullable uniquement, aucune suppression.
-- Exécute dans le SQL Editor Supabase.

ALTER TABLE public.reading_books
  ADD COLUMN IF NOT EXISTS open_library_cover_url text;

COMMENT ON COLUMN public.reading_books.open_library_cover_url IS
  'URL de couverture Open Library (édition / work). Fallback si aucune couverture perso.';

-- Backfill : les URL OL déjà stockées comme couverture « perso » deviennent le fallback OL.
UPDATE public.reading_books
SET
  open_library_cover_url = cover_image_url,
  cover_image_url = NULL
WHERE cover_image_url IS NOT NULL
  AND (open_library_cover_url IS NULL OR char_length(trim(open_library_cover_url)) = 0)
  AND cover_image_url ILIKE '%covers.openlibrary.org%';
