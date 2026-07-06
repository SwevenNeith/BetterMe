-- Migration ponctuelle : quantité 1 → 0 (mode checkbox)
-- + conserver / renforcer is_done pour les étapes déjà réalisées
-- À exécuter une seule fois dans le SQL Editor Supabase

-- Marquer comme fait si des logs de progression existent (au cas où is_done n'était pas synchro)
UPDATE public.project_steps s
SET is_done = true
WHERE s.quantite_cible = 1
  AND s.is_done = false
  AND EXISTS (
    SELECT 1
    FROM public.project_progress_logs l
    WHERE l.step_id = s.id
      AND l.user_id = s.user_id
  );

UPDATE public.project_substeps ss
SET is_done = true
WHERE ss.quantite_cible = 1
  AND ss.is_done = false
  AND EXISTS (
    SELECT 1
    FROM public.project_progress_logs l
    WHERE l.substep_id = ss.id
      AND l.user_id = ss.user_id
  );

-- Passer en mode checkbox (quantité 0)
UPDATE public.project_steps
SET quantite_cible = 0
WHERE quantite_cible = 1;

UPDATE public.project_substeps
SET quantite_cible = 0
WHERE quantite_cible = 1;
