-- =============================================================================
-- Historique des saisons ranked LoL (snapshot avant chaque reset)
-- =============================================================================
-- Appliquer dans le SQL Editor Supabase après create-lol-match-stats.sql.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lol_season_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  puuid text NOT NULL CHECK (char_length(trim(puuid)) > 0),
  season_start date NOT NULL,
  season_end date NOT NULL,
  CHECK (season_end >= season_start),
  total_games integer NOT NULL DEFAULT 0 CHECK (total_games >= 0),
  total_wins integer NOT NULL DEFAULT 0 CHECK (total_wins >= 0),
  overall_win_rate numeric NULL,
  top_champions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rank_solo jsonb NULL,
  rank_flex jsonb NULL,
  label text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, puuid, season_start, season_end)
);

CREATE INDEX IF NOT EXISTS lol_season_history_user_puuid_end_idx
  ON public.lol_season_history (user_id, puuid, season_end DESC);

COMMENT ON TABLE public.lol_season_history IS
  'Snapshots de saison LoL (stats + rangs) archivés avant un reset ranked.';
COMMENT ON COLUMN public.lol_season_history.top_champions IS
  'JSON : [{ champion_id, champion_name, games, wins, win_rate, play_share }]';
COMMENT ON COLUMN public.lol_season_history.rank_solo IS
  'JSON league entry Solo/Duo au moment du snapshot (tier, rank, LP, W/L).';
COMMENT ON COLUMN public.lol_season_history.rank_flex IS
  'JSON league entry Flex au moment du snapshot.';

ALTER TABLE public.lol_season_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lol_season_history_select_own ON public.lol_season_history;
CREATE POLICY lol_season_history_select_own
  ON public.lol_season_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS lol_season_history_insert_own ON public.lol_season_history;
CREATE POLICY lol_season_history_insert_own
  ON public.lol_season_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS lol_season_history_delete_own ON public.lol_season_history;
CREATE POLICY lol_season_history_delete_own
  ON public.lol_season_history FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.lol_season_history TO authenticated;
GRANT ALL ON public.lol_season_history TO service_role;

-- archive_lol_season --------------------------------------------------------
-- Archive la saison courante (depuis ranked_reset_date jusqu’à p_season_end)
-- avant un reset. Ne fait rien si 0 partie valide.
CREATE OR REPLACE FUNCTION public.archive_lol_season(
  p_puuid text,
  p_season_end date,
  p_rank_solo jsonb DEFAULT NULL,
  p_rank_flex jsonb DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_top_champions jsonb DEFAULT NULL
)
RETURNS public.lol_season_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  season_start date;
  reset_ts timestamptz;
  end_ts timestamptz;
  tot integer := 0;
  wins integer := 0;
  wr numeric := NULL;
  champs jsonb := '[]'::jsonb;
  row public.lol_season_history;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_puuid IS NULL OR length(trim(p_puuid)) = 0 THEN
    RAISE EXCEPTION 'puuid requis';
  END IF;
  IF p_season_end IS NULL THEN
    RAISE EXCEPTION 'Date de fin de saison requise';
  END IF;

  SELECT s.ranked_reset_date INTO season_start
  FROM public.lol_settings s
  WHERE s.user_id = uid AND s.puuid = trim(p_puuid);

  IF season_start IS NULL THEN
    season_start := '2026-01-08'::date;
  END IF;

  IF p_season_end < season_start THEN
    RAISE EXCEPTION 'La fin de saison ne peut pas être avant le début.';
  END IF;

  -- Déjà archivé pour cette fenêtre
  SELECT * INTO row
  FROM public.lol_season_history h
  WHERE h.user_id = uid
    AND h.puuid = trim(p_puuid)
    AND h.season_start = season_start
    AND h.season_end = p_season_end;
  IF FOUND THEN
    RETURN row;
  END IF;

  reset_ts := (season_start::timestamp AT TIME ZONE 'UTC');
  end_ts := ((p_season_end + 1)::timestamp AT TIME ZONE 'UTC');

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE m.win)::integer
  INTO tot, wins
  FROM public.lol_matches m
  WHERE m.user_id = uid
    AND m.puuid = trim(p_puuid)
    AND m.queue_id IN (420, 440, 400, 480, 700)
    AND m.game_creation >= reset_ts
    AND m.game_creation < end_ts
    AND m.game_duration >= 300
    AND m.early_surrender = false;

  IF tot = 0 THEN
    RETURN NULL;
  END IF;

  wr := round((wins::numeric / tot::numeric) * 1000) / 10;

  IF p_top_champions IS NOT NULL AND jsonb_typeof(p_top_champions) = 'array' THEN
    champs := p_top_champions;
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.games DESC, t.wins DESC), '[]'::jsonb)
    INTO champs
    FROM (
      SELECT
        m.champion_id,
        count(*)::integer AS games,
        count(*) FILTER (WHERE m.win)::integer AS wins,
        CASE
          WHEN count(*) > 0
          THEN round((count(*) FILTER (WHERE m.win)::numeric / count(*)::numeric) * 1000) / 10
          ELSE NULL
        END AS win_rate,
        CASE
          WHEN tot > 0
          THEN round((count(*)::numeric / tot::numeric) * 1000) / 10
          ELSE NULL
        END AS play_share
      FROM public.lol_matches m
      WHERE m.user_id = uid
        AND m.puuid = trim(p_puuid)
        AND m.queue_id IN (420, 440, 400, 480, 700)
        AND m.game_creation >= reset_ts
        AND m.game_creation < end_ts
        AND m.game_duration >= 300
        AND m.early_surrender = false
      GROUP BY m.champion_id
      ORDER BY games DESC, wins DESC, m.champion_id ASC
      LIMIT 3
    ) t;
  END IF;

  INSERT INTO public.lol_season_history (
    user_id,
    puuid,
    season_start,
    season_end,
    total_games,
    total_wins,
    overall_win_rate,
    top_champions,
    rank_solo,
    rank_flex,
    label
  )
  VALUES (
    uid,
    trim(p_puuid),
    season_start,
    p_season_end,
    tot,
    wins,
    wr,
    champs,
    p_rank_solo,
    p_rank_flex,
    nullif(trim(coalesce(p_label, '')), '')
  )
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_lol_season(text, date, jsonb, jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_lol_season(text, date, jsonb, jsonb, text, jsonb) TO authenticated;

COMMIT;
