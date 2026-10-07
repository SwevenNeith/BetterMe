-- Autorise 1–40 couleurs (au lieu de 8–40) pour les motifs 1–2 teintes.
-- Exécuter une fois dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.cross_stitch_patterns
  DROP CONSTRAINT IF EXISTS cross_stitch_patterns_color_count_check;

ALTER TABLE public.cross_stitch_patterns
  ADD CONSTRAINT cross_stitch_patterns_color_count_check
  CHECK (color_count >= 1 AND color_count <= 40);

COMMIT;
