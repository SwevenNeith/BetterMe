-- Progression broderie des motifs points de croix
-- Exécute dans le SQL Editor Supabase (après create-cross-stitch-patterns.sql).

BEGIN;

ALTER TABLE public.cross_stitch_patterns
  ADD COLUMN IF NOT EXISTS stitch_progress jsonb NOT NULL DEFAULT '{"done":[]}'::jsonb;

COMMENT ON COLUMN public.cross_stitch_patterns.stitch_progress IS
  'Progression broderie : { "done": [indices linéaires y*width+x, …] }.';

COMMIT;
