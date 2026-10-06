-- =============================================================================
-- Nettoyage lol_matches (files whitelist + remakes) + RPC get_top_champions
-- =============================================================================
-- À exécuter UNE FOIS dans le SQL Editor Supabase après déploiement de
-- sync-lol-matches avec COUNTED_QUEUE_IDS.
--
-- Garder cette liste synchronisée avec COUNTED_QUEUE_IDS dans
-- supabase/functions/sync-lol-matches/index.ts :
--   420 ranked solo/duo, 440 ranked flex, 400 normal draft,
--   480 swiftplay, 700 clash
-- Vérifier : https://static.developer.riotgames.com/docs/lol/queues.json
-- =============================================================================

BEGIN;

-- 1) Supprimer remakes / parties trop courtes / early surrender
DELETE FROM public.lol_matches
WHERE game_duration < 300
   OR early_surrender = true;

-- 2) Supprimer les files hors liste blanche
DELETE FROM public.lol_matches
WHERE queue_id NOT IN (420, 440, 400, 480, 700);

-- 3) Forcer un re-listing complet depuis la date de reset
--    (récupère flex / normales / swiftplay / clash manquants)
UPDATE public.lol_settings
SET
  sync_complete = false,
  sync_running_until = null,
  updated_at = timezone('utc', now());

-- 4) RPC : filtre sur la whitelist (plus de file unique 420, pas de fenêtre 90 j)
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

  -- Files whitelist : sync avec COUNTED_QUEUE_IDS (Edge Function)
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

COMMIT;

-- Contrôle rapide (optionnel) :
-- SELECT count(*) FROM public.lol_matches WHERE game_duration < 300 OR early_surrender;
-- SELECT count(*) FROM public.lol_matches WHERE queue_id NOT IN (420, 440, 400, 480, 700);
-- SELECT puuid, sync_complete FROM public.lol_settings;
