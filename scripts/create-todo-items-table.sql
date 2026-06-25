-- Éléments TODO (BetterMe)
-- À exécuter dans le SQL Editor Supabase (Dashboard → SQL → New query)

CREATE TABLE IF NOT EXISTS public.todo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nom text NOT NULL,
  description text NOT NULL DEFAULT '',
  frequence text NOT NULL,
  jour_semaine smallint,
  heure time,
  date_echeance date NOT NULL DEFAULT CURRENT_DATE,
  is_promesse boolean NOT NULL DEFAULT false,
  is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT todo_items_nom_not_blank CHECK (char_length(trim(nom)) > 0),
  CONSTRAINT todo_items_frequence_check CHECK (
    frequence IN ('quotidien', 'ponctuel', 'hebdomadaire')
  ),
  CONSTRAINT todo_items_sort_order_positive CHECK (sort_order >= 1),
  CONSTRAINT todo_items_jour_semaine_check CHECK (
    jour_semaine IS NULL OR (jour_semaine >= 1 AND jour_semaine <= 7)
  ),
  CONSTRAINT todo_items_hebdomadaire_jour_check CHECK (
    (frequence = 'hebdomadaire' AND jour_semaine IS NOT NULL)
    OR (frequence <> 'hebdomadaire' AND jour_semaine IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS todo_items_user_id_idx ON public.todo_items (user_id);
CREATE INDEX IF NOT EXISTS todo_items_user_sort_idx ON public.todo_items (user_id, sort_order ASC);

COMMENT ON TABLE public.todo_items IS 'Éléments de la page TODO';
COMMENT ON COLUMN public.todo_items.jour_semaine IS 'Jour ISO 1=lundi … 7=dimanche (obligatoire si frequence = hebdomadaire)';
COMMENT ON COLUMN public.todo_items.heure IS 'Heure optionnelle de rappel ou d''échéance';
COMMENT ON COLUMN public.todo_items.is_promesse IS 'Engagement prioritaire (affiché en tête par défaut, style distinct)';

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

CREATE OR REPLACE FUNCTION public.todo_items_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todo_items_set_updated_at ON public.todo_items;
CREATE TRIGGER todo_items_set_updated_at
  BEFORE UPDATE ON public.todo_items
  FOR EACH ROW
  EXECUTE FUNCTION public.todo_items_set_updated_at();

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

ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todo_items_select_own" ON public.todo_items;
CREATE POLICY "todo_items_select_own"
  ON public.todo_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "todo_items_insert_own" ON public.todo_items;
CREATE POLICY "todo_items_insert_own"
  ON public.todo_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "todo_items_update_own" ON public.todo_items;
CREATE POLICY "todo_items_update_own"
  ON public.todo_items FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "todo_items_delete_own" ON public.todo_items;
CREATE POLICY "todo_items_delete_own"
  ON public.todo_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.todo_items TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.todo_item_completions TO authenticated;
GRANT ALL ON public.todo_items TO service_role;
GRANT ALL ON public.todo_item_completions TO service_role;
