-- Migration Courses : URL d’image facultative (à la place de l’emoji sur la carte)
-- À lancer dans l’éditeur SQL Supabase.

ALTER TABLE public.courses_articles
  ADD COLUMN IF NOT EXISTS lien_image text;

ALTER TABLE public.courses_articles
  DROP CONSTRAINT IF EXISTS courses_articles_lien_image_not_blank;

ALTER TABLE public.courses_articles
  ADD CONSTRAINT courses_articles_lien_image_not_blank
  CHECK (lien_image IS NULL OR char_length(trim(lien_image)) > 0);

COMMENT ON COLUMN public.courses_articles.lien_image IS
  'URL d’image facultative ; si renseignée, remplace l’emoji sur la carte. Pas d’upload.';
