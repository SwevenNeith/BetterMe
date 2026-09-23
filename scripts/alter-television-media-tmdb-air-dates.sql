-- Dates de sortie / diffusion TMDB pour notifications Télévision (BetterMe)
-- Safe : colonnes nullable uniquement.
-- Exécute dans le SQL Editor Supabase.

ALTER TABLE public.television_media
  ADD COLUMN IF NOT EXISTS tmdb_release_date date,
  ADD COLUMN IF NOT EXISTS tmdb_next_air_date date,
  ADD COLUMN IF NOT EXISTS tmdb_next_season integer,
  ADD COLUMN IF NOT EXISTS tmdb_next_episode integer,
  ADD COLUMN IF NOT EXISTS tmdb_next_episode_name text,
  ADD COLUMN IF NOT EXISTS tmdb_air_dates_synced_at timestamptz;

COMMENT ON COLUMN public.television_media.tmdb_release_date IS
  'Date de sortie film (TMDB release_date). Pour les séries : first_air_date en secours.';
COMMENT ON COLUMN public.television_media.tmdb_next_air_date IS
  'Prochaine diffusion épisode (TMDB next_episode_to_air.air_date).';
COMMENT ON COLUMN public.television_media.tmdb_next_season IS
  'Saison du prochain épisode à diffuser.';
COMMENT ON COLUMN public.television_media.tmdb_next_episode IS
  'Numéro du prochain épisode à diffuser.';
COMMENT ON COLUMN public.television_media.tmdb_next_episode_name IS
  'Titre du prochain épisode (TMDB).';
COMMENT ON COLUMN public.television_media.tmdb_air_dates_synced_at IS
  'Dernière synchronisation des dates TMDB pour les notifications.';

CREATE INDEX IF NOT EXISTS television_media_user_release_date_idx
  ON public.television_media (user_id, tmdb_release_date)
  WHERE tmdb_release_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS television_media_user_next_air_date_idx
  ON public.television_media (user_id, tmdb_next_air_date)
  WHERE tmdb_next_air_date IS NOT NULL;

ALTER TABLE public.television_media
  ADD COLUMN IF NOT EXISTS tmdb_release_at timestamptz,
  ADD COLUMN IF NOT EXISTS tmdb_next_air_at timestamptz;

COMMENT ON COLUMN public.television_media.tmdb_release_at IS
  'Instant de sortie film si TMDB fournit une heure (sinon NULL → notif à 09:00 locale).';
COMMENT ON COLUMN public.television_media.tmdb_next_air_at IS
  'Instant de diffusion épisode si TMDB fournit une heure (sinon NULL → notif à 09:00 locale).';

