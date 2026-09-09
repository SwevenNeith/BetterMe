-- =============================================================================
-- Cohérence todo_items ↔ todo_item_completions
-- =============================================================================
-- Règles (alignées sur l’app) :
--   • Clé d’occurrence :
--       ponctuel / semaine  → date_echeance (lundi pour « Cette semaine »)
--       quotidien          → CURRENT_DATE
--       hebdomadaire       → dernier jour_semaine ≤ aujourd’hui (ISO 1=lun…7=dim)
--   • Sans quantité     : fait ⇔ une ligne de completion sur la clé
--   • Avec quantité     : fait ⇔ quantite_actuelle >= quantite_cible (atteint/dépassé)
--   • is_done           : drapeau dénormalisé de l’occurrence courante
--
-- CURRENT_DATE = fuseau du serveur Supabase (souvent UTC).
-- Relancer le script le matin (heure locale) si besoin.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Nettoyage completions
-- ---------------------------------------------------------------------------

-- Lignes à quantité nulle / invalide (l’app les supprime)
DELETE FROM public.todo_item_completions
WHERE coalesce(quantite_actuelle, 0) <= 0;

-- Orphelines (todo supprimé)
DELETE FROM public.todo_item_completions AS c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.todo_items AS t
  WHERE t.id = c.todo_item_id
    AND t.user_id = c.user_id
);

-- ---------------------------------------------------------------------------
-- 2) « Cette semaine » : fusionner les completions hors lundi d’échéance
--    vers date_echeance (clé attendue), en gardant le max de quantité
-- ---------------------------------------------------------------------------

-- Remonter la meilleure quantité sur la bonne date si elle manque ou est plus basse
INSERT INTO public.todo_item_completions AS c (
  user_id,
  todo_item_id,
  completion_date,
  quantite_actuelle
)
SELECT
  t.user_id,
  t.id,
  (left(t.date_echeance::text, 10))::date AS completion_date,
  max(c2.quantite_actuelle)::smallint AS quantite_actuelle
FROM public.todo_items AS t
JOIN public.todo_item_completions AS c2
  ON c2.todo_item_id = t.id
 AND c2.user_id = t.user_id
WHERE t.frequence = 'semaine'
  AND t.date_echeance IS NOT NULL
  AND c2.completion_date IS DISTINCT FROM (left(t.date_echeance::text, 10))::date
GROUP BY t.user_id, t.id, (left(t.date_echeance::text, 10))::date
ON CONFLICT (todo_item_id, completion_date) DO UPDATE
SET quantite_actuelle = GREATEST(
  c.quantite_actuelle,
  EXCLUDED.quantite_actuelle
);

-- Supprimer les anciennes dates hors clé pour les objectifs semaine
DELETE FROM public.todo_item_completions AS c
USING public.todo_items AS t
WHERE c.todo_item_id = t.id
  AND c.user_id = t.user_id
  AND t.frequence = 'semaine'
  AND t.date_echeance IS NOT NULL
  AND c.completion_date IS DISTINCT FROM (left(t.date_echeance::text, 10))::date;

-- ---------------------------------------------------------------------------
-- 3) Créer les completions manquantes quand is_done = true
--    (anciens parcours qui ne remplissaient que is_done)
-- ---------------------------------------------------------------------------

-- Ponctuel / semaine — sans quantité
INSERT INTO public.todo_item_completions (
  user_id,
  todo_item_id,
  completion_date,
  quantite_actuelle
)
SELECT
  t.user_id,
  t.id,
  (left(t.date_echeance::text, 10))::date,
  1
FROM public.todo_items AS t
WHERE t.frequence IN ('ponctuel', 'semaine')
  AND t.is_done = true
  AND t.date_echeance IS NOT NULL
  AND (t.quantite_cible IS NULL OR t.quantite_cible < 1)
  AND NOT EXISTS (
    SELECT 1
    FROM public.todo_item_completions AS c
    WHERE c.todo_item_id = t.id
      AND c.user_id = t.user_id
      AND c.completion_date = (left(t.date_echeance::text, 10))::date
  )
ON CONFLICT (todo_item_id, completion_date) DO NOTHING;

-- Ponctuel / semaine — avec quantité : au moins la cible
INSERT INTO public.todo_item_completions AS c (
  user_id,
  todo_item_id,
  completion_date,
  quantite_actuelle
)
SELECT
  t.user_id,
  t.id,
  (left(t.date_echeance::text, 10))::date,
  t.quantite_cible
FROM public.todo_items AS t
WHERE t.frequence IN ('ponctuel', 'semaine')
  AND t.is_done = true
  AND t.date_echeance IS NOT NULL
  AND t.quantite_cible IS NOT NULL
  AND t.quantite_cible >= 1
ON CONFLICT (todo_item_id, completion_date) DO UPDATE
SET quantite_actuelle = GREATEST(c.quantite_actuelle, EXCLUDED.quantite_actuelle);

-- Quotidien — sans quantité (aujourd’hui)
INSERT INTO public.todo_item_completions (
  user_id,
  todo_item_id,
  completion_date,
  quantite_actuelle
)
SELECT
  t.user_id,
  t.id,
  CURRENT_DATE,
  1
FROM public.todo_items AS t
WHERE t.frequence = 'quotidien'
  AND t.is_done = true
  AND (t.quantite_cible IS NULL OR t.quantite_cible < 1)
  AND NOT EXISTS (
    SELECT 1
    FROM public.todo_item_completions AS c
    WHERE c.todo_item_id = t.id
      AND c.user_id = t.user_id
      AND c.completion_date = CURRENT_DATE
  )
ON CONFLICT (todo_item_id, completion_date) DO NOTHING;

-- Quotidien — avec quantité
INSERT INTO public.todo_item_completions AS c (
  user_id,
  todo_item_id,
  completion_date,
  quantite_actuelle
)
SELECT
  t.user_id,
  t.id,
  CURRENT_DATE,
  t.quantite_cible
FROM public.todo_items AS t
WHERE t.frequence = 'quotidien'
  AND t.is_done = true
  AND t.quantite_cible IS NOT NULL
  AND t.quantite_cible >= 1
ON CONFLICT (todo_item_id, completion_date) DO UPDATE
SET quantite_actuelle = GREATEST(c.quantite_actuelle, EXCLUDED.quantite_actuelle);

-- Hebdomadaire — sans quantité (dernier jour prévu ≤ aujourd’hui)
INSERT INTO public.todo_item_completions (
  user_id,
  todo_item_id,
  completion_date,
  quantite_actuelle
)
SELECT
  t.user_id,
  t.id,
  (
    CURRENT_DATE
    - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - t.jour_semaine + 7) % 7)
  )::date,
  1
FROM public.todo_items AS t
WHERE t.frequence = 'hebdomadaire'
  AND t.is_done = true
  AND t.jour_semaine BETWEEN 1 AND 7
  AND (t.quantite_cible IS NULL OR t.quantite_cible < 1)
  AND NOT EXISTS (
    SELECT 1
    FROM public.todo_item_completions AS c
    WHERE c.todo_item_id = t.id
      AND c.user_id = t.user_id
      AND c.completion_date = (
        CURRENT_DATE
        - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - t.jour_semaine + 7) % 7)
      )::date
  )
ON CONFLICT (todo_item_id, completion_date) DO NOTHING;

-- Hebdomadaire — avec quantité
INSERT INTO public.todo_item_completions AS c (
  user_id,
  todo_item_id,
  completion_date,
  quantite_actuelle
)
SELECT
  t.user_id,
  t.id,
  (
    CURRENT_DATE
    - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - t.jour_semaine + 7) % 7)
  )::date,
  t.quantite_cible
FROM public.todo_items AS t
WHERE t.frequence = 'hebdomadaire'
  AND t.is_done = true
  AND t.jour_semaine BETWEEN 1 AND 7
  AND t.quantite_cible IS NOT NULL
  AND t.quantite_cible >= 1
ON CONFLICT (todo_item_id, completion_date) DO UPDATE
SET quantite_actuelle = GREATEST(c.quantite_actuelle, EXCLUDED.quantite_actuelle);

-- ---------------------------------------------------------------------------
-- 4) is_done = true quand l’occurrence courante est faite
-- ---------------------------------------------------------------------------

-- Ponctuel
UPDATE public.todo_items AS t
SET is_done = true
FROM public.todo_item_completions AS c
WHERE t.id = c.todo_item_id
  AND t.user_id = c.user_id
  AND t.frequence = 'ponctuel'
  AND t.date_echeance IS NOT NULL
  AND c.completion_date = (left(t.date_echeance::text, 10))::date
  AND (
    t.quantite_cible IS NULL
    OR t.quantite_cible < 1
    OR coalesce(c.quantite_actuelle, 0) >= t.quantite_cible
  );

-- Cette semaine
UPDATE public.todo_items AS t
SET is_done = true
FROM public.todo_item_completions AS c
WHERE t.id = c.todo_item_id
  AND t.user_id = c.user_id
  AND t.frequence = 'semaine'
  AND t.date_echeance IS NOT NULL
  AND c.completion_date = (left(t.date_echeance::text, 10))::date
  AND (
    t.quantite_cible IS NULL
    OR t.quantite_cible < 1
    OR coalesce(c.quantite_actuelle, 0) >= t.quantite_cible
  );

-- Quotidien (aujourd’hui)
UPDATE public.todo_items AS t
SET is_done = true
FROM public.todo_item_completions AS c
WHERE t.id = c.todo_item_id
  AND t.user_id = c.user_id
  AND t.frequence = 'quotidien'
  AND c.completion_date = CURRENT_DATE
  AND (
    t.quantite_cible IS NULL
    OR t.quantite_cible < 1
    OR coalesce(c.quantite_actuelle, 0) >= t.quantite_cible
  );

-- Hebdomadaire (dernière occurrence)
UPDATE public.todo_items AS t
SET is_done = true
FROM public.todo_item_completions AS c
WHERE t.id = c.todo_item_id
  AND t.user_id = c.user_id
  AND t.frequence = 'hebdomadaire'
  AND t.jour_semaine BETWEEN 1 AND 7
  AND c.completion_date = (
    CURRENT_DATE
    - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - t.jour_semaine + 7) % 7)
  )::date
  AND (
    t.quantite_cible IS NULL
    OR t.quantite_cible < 1
    OR coalesce(c.quantite_actuelle, 0) >= t.quantite_cible
  );

-- ---------------------------------------------------------------------------
-- 5) is_done = false quand l’occurrence courante n’est PAS faite
--    (y compris quantité partielle < cible)
-- ---------------------------------------------------------------------------

UPDATE public.todo_items AS t
SET is_done = false
WHERE t.frequence IN ('ponctuel', 'semaine')
  AND t.is_done = true
  AND (
    t.date_echeance IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.todo_item_completions AS c
      WHERE c.todo_item_id = t.id
        AND c.user_id = t.user_id
        AND c.completion_date = (left(t.date_echeance::text, 10))::date
        AND (
          t.quantite_cible IS NULL
          OR t.quantite_cible < 1
          OR coalesce(c.quantite_actuelle, 0) >= t.quantite_cible
        )
    )
  );

UPDATE public.todo_items AS t
SET is_done = false
WHERE t.frequence = 'quotidien'
  AND t.is_done = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.todo_item_completions AS c
    WHERE c.todo_item_id = t.id
      AND c.user_id = t.user_id
      AND c.completion_date = CURRENT_DATE
      AND (
        t.quantite_cible IS NULL
        OR t.quantite_cible < 1
        OR coalesce(c.quantite_actuelle, 0) >= t.quantite_cible
      )
  );

UPDATE public.todo_items AS t
SET is_done = false
WHERE t.frequence = 'hebdomadaire'
  AND t.is_done = true
  AND (
    t.jour_semaine IS NULL
    OR t.jour_semaine NOT BETWEEN 1 AND 7
    OR NOT EXISTS (
      SELECT 1
      FROM public.todo_item_completions AS c
      WHERE c.todo_item_id = t.id
        AND c.user_id = t.user_id
        AND c.completion_date = (
          CURRENT_DATE
          - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int - t.jour_semaine + 7) % 7)
        )::date
        AND (
          t.quantite_cible IS NULL
          OR t.quantite_cible < 1
          OR coalesce(c.quantite_actuelle, 0) >= t.quantite_cible
        )
    )
  );

COMMIT;

-- =============================================================================
-- Vérifications optionnelles (à lancer après, hors transaction)
-- =============================================================================
-- -- Tâches « faites » sans completion cohérente (doit être vide)
-- SELECT t.id, t.nom, t.frequence, t.is_done, t.quantite_cible, t.date_echeance
-- FROM public.todo_items t
-- WHERE t.is_done = true
--   AND NOT EXISTS (
--     SELECT 1 FROM public.todo_item_completions c
--     WHERE c.todo_item_id = t.id AND c.user_id = t.user_id
--       AND c.quantite_actuelle > 0
--       AND (
--         t.quantite_cible IS NULL OR t.quantite_cible < 1
--         OR c.quantite_actuelle >= t.quantite_cible
--       )
--   );
--
-- -- Completions orphelines (doit être vide)
-- SELECT c.*
-- FROM public.todo_item_completions c
-- LEFT JOIN public.todo_items t ON t.id = c.todo_item_id
-- WHERE t.id IS NULL;
