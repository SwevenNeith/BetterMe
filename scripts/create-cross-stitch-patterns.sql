-- Motifs points de croix (BetterMe — Création)
-- Image source dans Storage (bucket privé), résultat dans Postgres.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('cross-stitch-sources', 'cross-stitch-sources', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

CREATE TABLE IF NOT EXISTS public.cross_stitch_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Sans titre'
    CHECK (char_length(trim(title)) > 0),
  source_storage_path text NOT NULL
    CHECK (char_length(trim(source_storage_path)) > 0),
  source_file_name text NOT NULL DEFAULT '',
  target_width integer NOT NULL DEFAULT 80
    CHECK (target_width >= 1 AND target_width <= 8192),
  color_count integer NOT NULL DEFAULT 16
    CHECK (color_count >= 1 AND color_count <= 40),
  aida_count integer NOT NULL DEFAULT 14
    CHECK (aida_count IN (11, 14, 16, 18)),
  strand_count integer NOT NULL DEFAULT 2
    CHECK (strand_count >= 1 AND strand_count <= 6),
  grid_width integer NOT NULL CHECK (grid_width > 0),
  grid_height integer NOT NULL CHECK (grid_height > 0),
  -- Grille compacte : lignes de codes DMC (string) ou null (transparent)
  grid jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Palette / légende : [{ dmcCode, dmcName, hex, rgb, symbol, count }, …]
  palette jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Métadonnées libres (dims source, mode rendu, etc.)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Progression broderie : indices linéaires des cases faites
  stitch_progress jsonb NOT NULL DEFAULT '{"done":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS cross_stitch_patterns_user_id_idx
  ON public.cross_stitch_patterns (user_id);

CREATE INDEX IF NOT EXISTS cross_stitch_patterns_user_updated_idx
  ON public.cross_stitch_patterns (user_id, updated_at DESC);

COMMENT ON TABLE public.cross_stitch_patterns IS
  'Motifs points de croix : grille + palette + métadonnées, image source en Storage.';
COMMENT ON COLUMN public.cross_stitch_patterns.source_storage_path IS
  'Chemin dans le bucket cross-stitch-sources ({user_id}/…).';
COMMENT ON COLUMN public.cross_stitch_patterns.grid IS
  'Tableau 2D de codes DMC (string) ou null.';
COMMENT ON COLUMN public.cross_stitch_patterns.palette IS
  'Légende DMC utilisée (symbole, code, nom, rgb, count).';
COMMENT ON COLUMN public.cross_stitch_patterns.stitch_progress IS
  'Progression broderie : { "done": [indices linéaires y*width+x, …] }.';

ALTER TABLE public.cross_stitch_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cross_stitch_patterns_select_own" ON public.cross_stitch_patterns;
CREATE POLICY "cross_stitch_patterns_select_own"
  ON public.cross_stitch_patterns FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cross_stitch_patterns_insert_own" ON public.cross_stitch_patterns;
CREATE POLICY "cross_stitch_patterns_insert_own"
  ON public.cross_stitch_patterns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cross_stitch_patterns_update_own" ON public.cross_stitch_patterns;
CREATE POLICY "cross_stitch_patterns_update_own"
  ON public.cross_stitch_patterns FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cross_stitch_patterns_delete_own" ON public.cross_stitch_patterns;
CREATE POLICY "cross_stitch_patterns_delete_own"
  ON public.cross_stitch_patterns FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_stitch_patterns TO authenticated;
GRANT ALL ON public.cross_stitch_patterns TO service_role;

-- Storage : dossier {user_id}/…
DROP POLICY IF EXISTS "cross_stitch_sources_storage_select_own" ON storage.objects;
CREATE POLICY "cross_stitch_sources_storage_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cross-stitch-sources'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "cross_stitch_sources_storage_insert_own" ON storage.objects;
CREATE POLICY "cross_stitch_sources_storage_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cross-stitch-sources'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "cross_stitch_sources_storage_update_own" ON storage.objects;
CREATE POLICY "cross_stitch_sources_storage_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cross-stitch-sources'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "cross_stitch_sources_storage_delete_own" ON storage.objects;
CREATE POLICY "cross_stitch_sources_storage_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cross-stitch-sources'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
