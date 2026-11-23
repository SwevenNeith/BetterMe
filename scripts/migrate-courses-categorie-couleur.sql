-- Rayons Courses : couleur personnalisable (bandeau vitrine / mode magasin).

ALTER TABLE public.courses_categories
  ADD COLUMN IF NOT EXISTS couleur text NOT NULL DEFAULT '#8FA2D4';

COMMENT ON COLUMN public.courses_categories.couleur IS
  'Couleur d’accent du rayon (bandeau), hex.';
