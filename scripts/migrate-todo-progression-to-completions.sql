-- Si migrate-todo-quantite.sql a été appliqué avec progression sur todo_items,
-- ce script reporte ces données dans todo_item_completions puis supprime les colonnes obsolètes.

ALTER TABLE public.todo_item_completions
  ADD COLUMN IF NOT EXISTS quantite_actuelle smallint NOT NULL DEFAULT 0;

ALTER TABLE public.todo_item_completions
  DROP CONSTRAINT IF EXISTS todo_item_completions_quantite_actuelle_check;

ALTER TABLE public.todo_item_completions
  ADD CONSTRAINT todo_item_completions_quantite_actuelle_check CHECK (
    quantite_actuelle >= 0 AND quantite_actuelle <= 9999
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'todo_items'
      AND column_name = 'progression'
  ) THEN
    INSERT INTO public.todo_item_completions (user_id, todo_item_id, completion_date, quantite_actuelle)
    SELECT
      t.user_id,
      t.id,
      t.progression_date,
      t.progression
    FROM public.todo_items t
    WHERE t.quantite_cible IS NOT NULL
      AND t.progression_date IS NOT NULL
      AND t.progression IS NOT NULL
      AND t.progression > 0
    ON CONFLICT (todo_item_id, completion_date)
    DO UPDATE SET quantite_actuelle = EXCLUDED.quantite_actuelle;

    ALTER TABLE public.todo_items DROP COLUMN IF EXISTS progression;
    ALTER TABLE public.todo_items DROP COLUMN IF EXISTS progression_date;
    ALTER TABLE public.todo_items DROP CONSTRAINT IF EXISTS todo_items_progression_check;
  END IF;
END $$;

DROP POLICY IF EXISTS "todo_item_completions_update_own" ON public.todo_item_completions;
CREATE POLICY "todo_item_completions_update_own"
  ON public.todo_item_completions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON public.todo_item_completions TO authenticated;

COMMENT ON COLUMN public.todo_item_completions.quantite_actuelle IS
  'Progression du jour : 0 = non commencé ; 1..n-1 = partiel ; n = objectif atteint (TODO avec quantite_cible).';
