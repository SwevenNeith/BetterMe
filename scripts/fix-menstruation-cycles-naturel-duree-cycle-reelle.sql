-- Corrige durée_cycle_réelle : doit être la durée DU cycle N
-- (entre date_début_règles_réelle du cycle N et celle du cycle N+1),
-- et non celle du cycle N+1 comme avant.
--
-- À exécuter dans l'éditeur SQL Supabase (tous les utilisateurs) ou en filtrant par user_id.

BEGIN;

-- 1. Réinitialiser toutes les durées réelles
UPDATE public.menstruation_cycles_naturel
SET "durée_cycle_réelle" = NULL;

-- 2. Recalculer : durée du cycle N = jours entre début réel N et début réel N+1
UPDATE public.menstruation_cycles_naturel AS c1
SET "durée_cycle_réelle" = sub.diff
FROM (
  SELECT
    c1_inner.id,
    (c2."date_début_règles_réelle"::date - c1_inner."date_début_règles_réelle"::date) AS diff
  FROM public.menstruation_cycles_naturel AS c1_inner
  INNER JOIN public.menstruation_cycles_naturel AS c2
    ON c2.user_id = c1_inner.user_id
   AND c2."numéro_cycle" = c1_inner."numéro_cycle" + 1
  WHERE c1_inner."date_début_règles_réelle" IS NOT NULL
    AND c2."date_début_règles_réelle" IS NOT NULL
) AS sub
WHERE c1.id = sub.id
  AND sub.diff BETWEEN 15 AND 60;

COMMIT;

-- Vérification (optionnel) :
-- SELECT user_id, "numéro_cycle", "date_début_règles_réelle", "durée_cycle_réelle"
-- FROM public.menstruation_cycles_naturel
-- ORDER BY user_id, "numéro_cycle";
