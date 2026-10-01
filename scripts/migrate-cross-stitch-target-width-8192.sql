-- Autorise les largeurs de motif jusqu’à 8192 (alignement pixel art 1:1 sur grandes images).
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.cross_stitch_patterns
  DROP CONSTRAINT IF EXISTS cross_stitch_patterns_target_width_check;

ALTER TABLE public.cross_stitch_patterns
  ADD CONSTRAINT cross_stitch_patterns_target_width_check
  CHECK (target_width >= 1 AND target_width <= 8192);

COMMIT;
