-- Progression épisodes (séries) — BetterMe
-- Exécute dans le SQL Editor Supabase après create-television-media.sql

CREATE TABLE IF NOT EXISTS public.television_episode_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.television_media (id) ON DELETE CASCADE,
  season_number integer NOT NULL,
  episode_number integer NOT NULL,
  watched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT television_episode_progress_season_nonneg CHECK (season_number >= 0),
  CONSTRAINT television_episode_progress_episode_positive CHECK (episode_number > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS television_episode_progress_unique
  ON public.television_episode_progress (media_id, season_number, episode_number);

CREATE INDEX IF NOT EXISTS television_episode_progress_user_media_idx
  ON public.television_episode_progress (user_id, media_id);

COMMENT ON TABLE public.television_episode_progress IS 'Épisodes vus pour le passage courant d''une série';
COMMENT ON COLUMN public.television_episode_progress.season_number IS 'Numéro de saison TMDB (0 = spéciales)';
COMMENT ON COLUMN public.television_episode_progress.episode_number IS 'Numéro d''épisode dans la saison';

ALTER TABLE public.television_episode_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "television_episode_progress_select_own" ON public.television_episode_progress;
CREATE POLICY "television_episode_progress_select_own"
  ON public.television_episode_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_episode_progress_insert_own" ON public.television_episode_progress;
CREATE POLICY "television_episode_progress_insert_own"
  ON public.television_episode_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_episode_progress_update_own" ON public.television_episode_progress;
CREATE POLICY "television_episode_progress_update_own"
  ON public.television_episode_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_episode_progress_delete_own" ON public.television_episode_progress;
CREATE POLICY "television_episode_progress_delete_own"
  ON public.television_episode_progress FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.television_episode_progress TO authenticated;
GRANT ALL ON public.television_episode_progress TO service_role;
