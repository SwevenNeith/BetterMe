-- Collections Télévision (BetterMe)
-- Exécute dans le SQL Editor Supabase

CREATE TABLE IF NOT EXISTS public.television_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT television_collections_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS television_collections_user_id_lower_name_uidx
  ON public.television_collections (user_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS television_collections_user_id_sort_idx
  ON public.television_collections (user_id, sort_order, name);

COMMENT ON TABLE public.television_collections IS 'Collections / listes TV-films par utilisateur';
COMMENT ON COLUMN public.television_collections.name IS 'Nom affiché (À regarder / En cours / Terminé…)';
COMMENT ON COLUMN public.television_collections.sort_order IS 'Ordre d''affichage';

ALTER TABLE public.television_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "television_collections_select_own" ON public.television_collections;
CREATE POLICY "television_collections_select_own"
  ON public.television_collections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_collections_insert_own" ON public.television_collections;
CREATE POLICY "television_collections_insert_own"
  ON public.television_collections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_collections_update_own" ON public.television_collections;
CREATE POLICY "television_collections_update_own"
  ON public.television_collections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_collections_delete_own" ON public.television_collections;
CREATE POLICY "television_collections_delete_own"
  ON public.television_collections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.television_collections TO authenticated;
GRANT ALL ON public.television_collections TO service_role;
