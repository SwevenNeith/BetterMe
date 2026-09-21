-- Médias Télévision (films / séries) — BetterMe
-- Exécute dans le SQL Editor Supabase après create-television-collections.sql

CREATE TABLE IF NOT EXISTS public.television_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  media_type text NOT NULL,
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  original_title text,
  poster_path text,
  overview text,
  collection text,
  date_start date,
  date_end date,
  rating numeric(3, 1),
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT television_media_type_check CHECK (media_type IN ('movie', 'tv')),
  CONSTRAINT television_media_title_not_blank CHECK (char_length(trim(title)) > 0),
  CONSTRAINT television_media_tmdb_id_positive CHECK (tmdb_id > 0),
  CONSTRAINT television_media_dates_order CHECK (
    date_start IS NULL
    OR date_end IS NULL
    OR date_end >= date_start
  ),
  CONSTRAINT television_media_rating_range CHECK (
    rating IS NULL
    OR (rating >= 0 AND rating <= 10)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS television_media_user_type_tmdb_uidx
  ON public.television_media (user_id, media_type, tmdb_id);

CREATE INDEX IF NOT EXISTS television_media_user_id_idx
  ON public.television_media (user_id);

CREATE INDEX IF NOT EXISTS television_media_user_collection_idx
  ON public.television_media (user_id, collection);

CREATE INDEX IF NOT EXISTS television_media_user_created_at_idx
  ON public.television_media (user_id, created_at DESC);

COMMENT ON TABLE public.television_media IS 'Films et séries suivis par l''utilisateur (clé TMDB)';
COMMENT ON COLUMN public.television_media.media_type IS 'movie ou tv';
COMMENT ON COLUMN public.television_media.tmdb_id IS 'Identifiant TMDB';
COMMENT ON COLUMN public.television_media.collection IS 'Nom de collection (À regarder / En cours / Terminé…)';
COMMENT ON COLUMN public.television_media.poster_path IS 'Chemin affiche TMDB (ex. /abc.jpg)';

ALTER TABLE public.television_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "television_media_select_own" ON public.television_media;
CREATE POLICY "television_media_select_own"
  ON public.television_media FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_media_insert_own" ON public.television_media;
CREATE POLICY "television_media_insert_own"
  ON public.television_media FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_media_update_own" ON public.television_media;
CREATE POLICY "television_media_update_own"
  ON public.television_media FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_media_delete_own" ON public.television_media;
CREATE POLICY "television_media_delete_own"
  ON public.television_media FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.television_media TO authenticated;
GRANT ALL ON public.television_media TO service_role;
