-- Migration : un livre unique par couple titre + auteur (BetterMe — page Lecture)
-- Exécute dans le SQL Editor Supabase.
--
-- Si CREATE UNIQUE INDEX échoue, tu as déjà des doublons.
-- Liste-les avec :
--
-- SELECT user_id, lower(trim(title)) AS title_key, lower(trim(author)) AS author_key, count(*)
-- FROM public.reading_books
-- GROUP BY 1, 2, 3
-- HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS reading_books_user_title_author_unique
  ON public.reading_books (user_id, lower(trim(title)), lower(trim(author)));

COMMENT ON INDEX public.reading_books_user_title_author_unique IS
  'Un même utilisateur ne peut pas avoir deux livres avec le même titre et le même auteur';
