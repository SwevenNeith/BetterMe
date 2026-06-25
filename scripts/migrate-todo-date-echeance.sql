-- Date d'échéance + complétions par jour (TODO récurrents).
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS date_echeance date NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.todo_items.date_echeance IS
  'Date de début / échéance : ponctuel = jour unique ; récurrent = à partir de ce jour.';

CREATE TABLE IF NOT EXISTS public.todo_item_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  todo_item_id uuid NOT NULL REFERENCES public.todo_items (id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT todo_item_completions_unique_day UNIQUE (todo_item_id, completion_date)
);

CREATE INDEX IF NOT EXISTS todo_item_completions_user_date_idx
  ON public.todo_item_completions (user_id, completion_date);

CREATE INDEX IF NOT EXISTS todo_item_completions_item_idx
  ON public.todo_item_completions (todo_item_id);

COMMENT ON TABLE public.todo_item_completions IS
  'Complétion d''un TODO pour une date donnée (quotidien / hebdomadaire).';

ALTER TABLE public.todo_item_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todo_item_completions_select_own" ON public.todo_item_completions;
CREATE POLICY "todo_item_completions_select_own"
  ON public.todo_item_completions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "todo_item_completions_insert_own" ON public.todo_item_completions;
CREATE POLICY "todo_item_completions_insert_own"
  ON public.todo_item_completions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "todo_item_completions_delete_own" ON public.todo_item_completions;
CREATE POLICY "todo_item_completions_delete_own"
  ON public.todo_item_completions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.todo_item_completions TO authenticated;
GRANT ALL ON public.todo_item_completions TO service_role;
