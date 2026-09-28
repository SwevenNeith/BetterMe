-- Catégories finances — BetterMe
-- Exécute après create-finance-settings.sql

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT finance_categories_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_user_name_uidx
  ON public.finance_categories (user_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS finance_categories_user_sort_idx
  ON public.finance_categories (user_id, sort_order, name);

COMMENT ON TABLE public.finance_categories IS 'Catégories de montants (Salaire, Courses, Loyer…).';

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_categories_select_own" ON public.finance_categories;
CREATE POLICY "finance_categories_select_own"
  ON public.finance_categories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_categories_insert_own" ON public.finance_categories;
CREATE POLICY "finance_categories_insert_own"
  ON public.finance_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_categories_update_own" ON public.finance_categories;
CREATE POLICY "finance_categories_update_own"
  ON public.finance_categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "finance_categories_delete_own" ON public.finance_categories;
CREATE POLICY "finance_categories_delete_own"
  ON public.finance_categories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT ALL ON public.finance_categories TO service_role;
