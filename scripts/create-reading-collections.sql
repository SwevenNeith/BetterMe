-- Collections de lecture (BetterMe)
-- Exécute dans le SQL Editor Supabase

CREATE TABLE IF NOT EXISTS public.reading_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_collections_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS reading_collections_user_id_lower_name_uidx
  ON public.reading_collections (user_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS reading_collections_user_id_sort_idx
  ON public.reading_collections (user_id, sort_order, name);

COMMENT ON TABLE public.reading_collections IS 'Collections / listes de livres par utilisateur';
COMMENT ON COLUMN public.reading_collections.name IS 'Nom affiché dans le dropdown Collection';
COMMENT ON COLUMN public.reading_collections.sort_order IS 'Ordre d''affichage (WishList / En cours en premier)';

ALTER TABLE public.reading_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reading_collections_select_own" ON public.reading_collections;
CREATE POLICY "reading_collections_select_own"
  ON public.reading_collections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_collections_insert_own" ON public.reading_collections;
CREATE POLICY "reading_collections_insert_own"
  ON public.reading_collections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_collections_update_own" ON public.reading_collections;
CREATE POLICY "reading_collections_update_own"
  ON public.reading_collections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_collections_delete_own" ON public.reading_collections;
CREATE POLICY "reading_collections_delete_own"
  ON public.reading_collections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_collections TO authenticated;
GRANT ALL ON public.reading_collections TO service_role;
