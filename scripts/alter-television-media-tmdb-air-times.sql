-- Heures de sortie / diffusion TMDB (si fournies) — BetterMe
-- Safe : colonnes nullable uniquement.
-- Exécute dans le SQL Editor Supabase (après alter-television-media-tmdb-air-dates.sql).

ALTER TABLE public.television_media
  ADD COLUMN IF NOT EXISTS tmdb_release_at timestamptz,
  ADD COLUMN IF NOT EXISTS tmdb_next_air_at timestamptz;

COMMENT ON COLUMN public.television_media.tmdb_release_at IS
  'Instant de sortie film si TMDB fournit une heure (sinon NULL → notif à 09:00 locale).';
COMMENT ON COLUMN public.television_media.tmdb_next_air_at IS
  'Instant de diffusion épisode si TMDB fournit une heure (sinon NULL → notif à 09:00 locale).';
