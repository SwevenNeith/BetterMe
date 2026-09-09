-- =============================================================================
-- Nettoyage des prédictions de cycles
-- =============================================================================
-- • Mode actif (settings.menstruation_cycle_mode) : garde ≤ n+3
-- • Mode inactif : garde seulement ≤ n (aucune prédiction)
-- n = max(numéro_cycle) avec date_début_règles_réelle (sinon 1)
-- Exécute dans le SQL Editor Supabase.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PILULE
-- ---------------------------------------------------------------------------

-- Symptômes des cycles pilule à supprimer
WITH mode_n AS (
  SELECT
    c.user_id,
    COALESCE(
      MAX(c."numéro_cycle") FILTER (WHERE c."date_début_règles_réelle" IS NOT NULL),
      1
    ) AS n,
    COALESCE(s.menstruation_cycle_mode, 'pilule') AS mode
  FROM public.menstruation_cycles_pilule AS c
  LEFT JOIN public.settings AS s ON s.user_id = c.user_id
  GROUP BY c.user_id, s.menstruation_cycle_mode
),
keep_until AS (
  SELECT
    user_id,
    n,
    CASE WHEN mode = 'pilule' THEN n + 3 ELSE n END AS max_keep
  FROM mode_n
),
to_drop AS (
  SELECT c.id, c.user_id
  FROM public.menstruation_cycles_pilule AS c
  JOIN keep_until AS k ON k.user_id = c.user_id
  WHERE c."numéro_cycle" > k.max_keep
)
DELETE FROM public.menstruation_symptomes AS s
USING to_drop AS d
WHERE s.cycle_id = d.id
  AND s.user_id = d.user_id
  AND s.type_cycle = 'pilule';

WITH mode_n AS (
  SELECT
    c.user_id,
    COALESCE(
      MAX(c."numéro_cycle") FILTER (WHERE c."date_début_règles_réelle" IS NOT NULL),
      1
    ) AS n,
    COALESCE(s.menstruation_cycle_mode, 'pilule') AS mode
  FROM public.menstruation_cycles_pilule AS c
  LEFT JOIN public.settings AS s ON s.user_id = c.user_id
  GROUP BY c.user_id, s.menstruation_cycle_mode
),
keep_until AS (
  SELECT
    user_id,
    CASE WHEN mode = 'pilule' THEN n + 3 ELSE n END AS max_keep
  FROM mode_n
)
DELETE FROM public.menstruation_cycles_pilule AS c
USING keep_until AS k
WHERE c.user_id = k.user_id
  AND c."numéro_cycle" > k.max_keep;

-- ---------------------------------------------------------------------------
-- NATUREL
-- ---------------------------------------------------------------------------

WITH mode_n AS (
  SELECT
    c.user_id,
    COALESCE(
      MAX(c."numéro_cycle") FILTER (WHERE c."date_début_règles_réelle" IS NOT NULL),
      1
    ) AS n,
    COALESCE(s.menstruation_cycle_mode, 'naturel') AS mode
  FROM public.menstruation_cycles_naturel AS c
  LEFT JOIN public.settings AS s ON s.user_id = c.user_id
  GROUP BY c.user_id, s.menstruation_cycle_mode
),
keep_until AS (
  SELECT
    user_id,
    CASE WHEN mode = 'naturel' THEN n + 3 ELSE n END AS max_keep
  FROM mode_n
),
to_drop AS (
  SELECT c.id, c.user_id
  FROM public.menstruation_cycles_naturel AS c
  JOIN keep_until AS k ON k.user_id = c.user_id
  WHERE c."numéro_cycle" > k.max_keep
)
DELETE FROM public.menstruation_symptomes AS s
USING to_drop AS d
WHERE s.cycle_id = d.id
  AND s.user_id = d.user_id
  AND s.type_cycle = 'naturel';

WITH mode_n AS (
  SELECT
    c.user_id,
    COALESCE(
      MAX(c."numéro_cycle") FILTER (WHERE c."date_début_règles_réelle" IS NOT NULL),
      1
    ) AS n,
    COALESCE(s.menstruation_cycle_mode, 'naturel') AS mode
  FROM public.menstruation_cycles_naturel AS c
  LEFT JOIN public.settings AS s ON s.user_id = c.user_id
  GROUP BY c.user_id, s.menstruation_cycle_mode
),
keep_until AS (
  SELECT
    user_id,
    CASE WHEN mode = 'naturel' THEN n + 3 ELSE n END AS max_keep
  FROM mode_n
)
DELETE FROM public.menstruation_cycles_naturel AS c
USING keep_until AS k
WHERE c.user_id = k.user_id
  AND c."numéro_cycle" > k.max_keep;

COMMIT;

-- Puis ouvrir la page Menstruation : le mode actif recrée n+1…n+3.
