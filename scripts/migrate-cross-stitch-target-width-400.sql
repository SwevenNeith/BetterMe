-- Autorise les largeurs de motif jusqu’à 400 (aligné sur WIDTH_MAX de PointsDeCroixView).
-- Exécute dans le SQL Editor Supabase si besoin.

BEGIN;

ALTER TABLE public.cross_stitch_patterns
  DROP CONSTRAINT IF EXISTS cross_stitch_patterns_target_width_check;

ALTER TABLE public.cross_stitch_patterns
  ADD CONSTRAINT cross_stitch_patterns_target_width_check
  CHECK (target_width >= 20 AND target_width <= 400);

COMMIT;
