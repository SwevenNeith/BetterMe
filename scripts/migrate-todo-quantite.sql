-- Objectif en quantité pour les TODO (ex. « Faire 10 pages » → compteur 2/10 par jour).
-- Progression par jour dans todo_item_completions (barres jour / semaine / mois).
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS quantite_cible smallint;

ALTER TABLE public.todo_items
  DROP CONSTRAINT IF EXISTS todo_items_quantite_cible_check;

ALTER TABLE public.todo_items
  ADD CONSTRAINT todo_items_quantite_cible_check CHECK (
    quantite_cible IS NULL OR (quantite_cible >= 1 AND quantite_cible <= 9999)
  );

COMMENT ON COLUMN public.todo_items.quantite_cible IS
  'Objectif numérique optionnel (ex. 10 pages). NULL = case à cocher classique.';

ALTER TABLE public.todo_item_completions
  ADD COLUMN IF NOT EXISTS quantite_actuelle smallint NOT NULL DEFAULT 0;

ALTER TABLE public.todo_item_completions
  DROP CONSTRAINT IF EXISTS todo_item_completions_quantite_actuelle_check;

ALTER TABLE public.todo_item_completions
  ADD CONSTRAINT todo_item_completions_quantite_actuelle_check CHECK (
    quantite_actuelle >= 0 AND quantite_actuelle <= 9999
  );

COMMENT ON COLUMN public.todo_item_completions.quantite_actuelle IS
  'Progression du jour : 0 = non commencé ; 1..n-1 = partiel ; n = objectif atteint (TODO avec quantite_cible).';

COMMENT ON TABLE public.todo_item_completions IS
  'Complétion par jour : case cochée (récurrent sans quantité) ou progression quantitative.';

-- Upsert (ON CONFLICT UPDATE) nécessite UPDATE
DROP POLICY IF EXISTS "todo_item_completions_update_own" ON public.todo_item_completions;
CREATE POLICY "todo_item_completions_update_own"
  ON public.todo_item_completions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON public.todo_item_completions TO authenticated;
