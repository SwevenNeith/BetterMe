-- Catégories de ressources (BetterMe — page Ressources)
-- Exécute dans le SQL Editor Supabase (avant create-resource-items.sql)

CREATE TABLE IF NOT EXISTS public.resource_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_categories_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_categories_user_id_lower_name_uidx
  ON public.resource_categories (user_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS resource_categories_user_id_sort_idx
  ON public.resource_categories (user_id, sort_order, name);

COMMENT ON TABLE public.resource_categories IS 'Catégories de la page Ressources';
COMMENT ON COLUMN public.resource_categories.name IS 'Nom affiché (ex. Restaurants, Outils, Idées…)';

ALTER TABLE public.resource_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_categories_select_own" ON public.resource_categories;
CREATE POLICY "resource_categories_select_own"
  ON public.resource_categories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "resource_categories_insert_own" ON public.resource_categories;
CREATE POLICY "resource_categories_insert_own"
  ON public.resource_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resource_categories_update_own" ON public.resource_categories;
CREATE POLICY "resource_categories_update_own"
  ON public.resource_categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resource_categories_delete_own" ON public.resource_categories;
CREATE POLICY "resource_categories_delete_own"
  ON public.resource_categories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_categories TO authenticated;
GRANT ALL ON public.resource_categories TO service_role;
