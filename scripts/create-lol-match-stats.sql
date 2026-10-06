-- =============================================================================
-- Stats champions (files whitelist) depuis le reset — tables légères + RPC
-- =============================================================================
-- Appliquer dans le SQL Editor Supabase (rôle postgres / service).
-- Multi-comptes : une ligne lol_settings par (user_id, puuid).
-- Écritures matchs/maîtrise : service_role (Edge Function) uniquement.
-- Files comptées (garder sync avec COUNTED_QUEUE_IDS dans sync-lol-matches) :
--   420 ranked solo/duo, 440 flex, 400 normal draft, 480 swiftplay, 700 clash
-- Vérifier : https://static.developer.riotgames.com/docs/lol/queues.json
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lol_matches (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  puuid text NOT NULL CHECK (char_length(trim(puuid)) > 0),
  match_id text NOT NULL CHECK (char_length(trim(match_id)) > 0),
  champion_id integer NOT NULL CHECK (champion_id > 0),
  win boolean NOT NULL,
  game_duration integer NOT NULL CHECK (game_duration >= 0),
  early_surrender boolean NOT NULL DEFAULT false,
  game_creation timestamptz NOT NULL,
  queue_id integer NOT NULL,
  PRIMARY KEY (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS lol_matches_user_puuid_creation_idx
  ON public.lol_matches (user_id, puuid, game_creation DESC);

CREATE INDEX IF NOT EXISTS lol_matches_user_puuid_champion_idx
  ON public.lol_matches (user_id, puuid, champion_id);

COMMENT ON TABLE public.lol_matches IS
  'Résumés légers de parties LoL valides (files whitelist, durée >= 300 s, pas early surrender).';

CREATE TABLE IF NOT EXISTS public.lol_settings (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  puuid text NOT NULL CHECK (char_length(trim(puuid)) > 0),
  platform text NOT NULL DEFAULT 'euw1',
  routing text NOT NULL DEFAULT 'europe',
  ranked_reset_date date NOT NULL DEFAULT '2026-01-08',
  sync_complete boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz NULL,
  sync_running_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, puuid)
);

COMMENT ON TABLE public.lol_settings IS
  'Réglages de synchro ranked par compte Riot (date de reset, verrou, état).';
COMMENT ON COLUMN public.lol_settings.ranked_reset_date IS
  'Reset ranked (YYYY-MM-DD). Fenêtre = game_creation >= minuit UTC de ce jour.';

CREATE TABLE IF NOT EXISTS public.lol_champion_mastery (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  puuid text NOT NULL CHECK (char_length(trim(puuid)) > 0),
  champion_id integer NOT NULL CHECK (champion_id > 0),
  level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, puuid, champion_id)
);

COMMENT ON TABLE public.lol_champion_mastery IS
  'Maîtrise champion (vie du compte), rafraîchie à chaque synchro.';

-- RLS -----------------------------------------------------------------------
ALTER TABLE public.lol_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lol_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lol_champion_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lol_matches_select_own ON public.lol_matches;
CREATE POLICY lol_matches_select_own
  ON public.lol_matches FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_settings_select_own ON public.lol_settings;
CREATE POLICY lol_settings_select_own
  ON public.lol_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_settings_insert_own ON public.lol_settings;
CREATE POLICY lol_settings_insert_own
  ON public.lol_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_settings_update_own ON public.lol_settings;
CREATE POLICY lol_settings_update_own
  ON public.lol_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_champion_mastery_select_own ON public.lol_champion_mastery;
CREATE POLICY lol_champion_mastery_select_own
  ON public.lol_champion_mastery FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.lol_matches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lol_settings TO authenticated;
GRANT SELECT ON public.lol_champion_mastery TO authenticated;

GRANT ALL ON public.lol_matches TO service_role;
GRANT ALL ON public.lol_settings TO service_role;
GRANT ALL ON public.lol_champion_mastery TO service_role;

-- ensure_lol_settings -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_lol_settings(
  p_puuid text,
  p_platform text DEFAULT 'euw1',
  p_routing text DEFAULT 'europe'
)
RETURNS public.lol_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.lol_settings;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_puuid IS NULL OR length(trim(p_puuid)) = 0 THEN
    RAISE EXCEPTION 'puuid requis';
  END IF;

  INSERT INTO public.lol_settings (user_id, puuid, platform, routing)
  VALUES (
    uid,
    trim(p_puuid),
    coalesce(nullif(trim(p_platform), ''), 'euw1'),
    coalesce(nullif(trim(p_routing), ''), 'europe')
  )
  ON CONFLICT (user_id, puuid) DO UPDATE
  SET
    platform = excluded.platform,
    routing = excluded.routing,
    updated_at = timezone('utc', now())
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_lol_settings(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_lol_settings(text, text, text) TO authenticated;

-- get_top_champions ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_top_champions(
  p_puuid text,
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  champion_id integer,
  games bigint,
  wins bigint,
  win_rate numeric,
  pick_rate numeric,
  mastery_level integer,
  mastery_points integer,
  total_games bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  reset_d date;
  reset_ts timestamptz;
  lim integer;
  tot bigint;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_puuid IS NULL OR length(trim(p_puuid)) = 0 THEN
    RAISE EXCEPTION 'puuid requis';
  END IF;

  lim := greatest(1, least(coalesce(p_limit, 3), 20));

  SELECT s.ranked_reset_date INTO reset_d
  FROM public.lol_settings s
  WHERE s.user_id = uid AND s.puuid = trim(p_puuid);

  IF reset_d IS NULL THEN
    reset_d := '2026-01-08'::date;
  END IF;

  reset_ts := (reset_d::timestamp AT TIME ZONE 'UTC');

  -- Files whitelist : synchroniser avec COUNTED_QUEUE_IDS (Edge) et cleanup SQL
  SELECT count(*)::bigint INTO tot
  FROM public.lol_matches m
  WHERE m.user_id = uid
    AND m.puuid = trim(p_puuid)
    AND m.queue_id IN (420, 440, 400, 480, 700)
    AND m.game_creation >= reset_ts
    AND m.game_duration >= 300
    AND m.early_surrender = false;

  RETURN QUERY
  WITH valid AS (
    SELECT
      m.champion_id AS cid,
      count(*)::bigint AS g,
      count(*) FILTER (WHERE m.win)::bigint AS w
    FROM public.lol_matches m
    WHERE m.user_id = uid
      AND m.puuid = trim(p_puuid)
      AND m.queue_id IN (420, 440, 400, 480, 700)
      AND m.game_creation >= reset_ts
      AND m.game_duration >= 300
      AND m.early_surrender = false
    GROUP BY m.champion_id
  ),
  ranked AS (
    SELECT
      v.cid,
      v.g,
      v.w,
      CASE WHEN v.g > 0 THEN round((v.w::numeric / v.g::numeric) * 1000) / 10 ELSE NULL END AS wr,
      CASE WHEN tot > 0 THEN round((v.g::numeric / tot::numeric) * 1000) / 10 ELSE NULL END AS pr
    FROM valid v
    ORDER BY v.g DESC, v.w DESC, v.cid ASC
    LIMIT lim
  )
  SELECT
    r.cid,
    r.g,
    r.w,
    r.wr,
    r.pr,
    coalesce(cm.level, 0),
    coalesce(cm.points, 0),
    tot
  FROM ranked r
  LEFT JOIN public.lol_champion_mastery cm
    ON cm.user_id = uid
    AND cm.puuid = trim(p_puuid)
    AND cm.champion_id = r.cid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_top_champions(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_champions(text, integer) TO authenticated;

-- set_ranked_reset_date -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ranked_reset_date(
  p_puuid text,
  p_date date
)
RETURNS public.lol_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.lol_settings;
  reset_ts timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_puuid IS NULL OR length(trim(p_puuid)) = 0 THEN
    RAISE EXCEPTION 'puuid requis';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Date de reset invalide (null).';
  END IF;
  IF p_date > (timezone('utc', now()))::date THEN
    RAISE EXCEPTION 'La date de reset ne peut pas être dans le futur.';
  END IF;
  IF p_date < '2020-01-01'::date THEN
    RAISE EXCEPTION 'La date de reset ne peut pas être antérieure au 01/01/2020.';
  END IF;

  -- Garantit une ligne settings
  INSERT INTO public.lol_settings (user_id, puuid)
  VALUES (uid, trim(p_puuid))
  ON CONFLICT (user_id, puuid) DO NOTHING;

  reset_ts := (p_date::timestamp AT TIME ZONE 'UTC');

  DELETE FROM public.lol_matches m
  WHERE m.user_id = uid
    AND m.puuid = trim(p_puuid)
    AND m.game_creation < reset_ts;

  UPDATE public.lol_settings s
  SET
    ranked_reset_date = p_date,
    sync_complete = false,
    updated_at = timezone('utc', now())
  WHERE s.user_id = uid AND s.puuid = trim(p_puuid)
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ranked_reset_date(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_ranked_reset_date(text, date) TO authenticated;

COMMIT;
