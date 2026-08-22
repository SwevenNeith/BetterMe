-- Ressources (BetterMe — page Ressources)
-- Exécute create-resource-categories.sql avant ce script

CREATE TABLE IF NOT EXISTS public.resource_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  link text,
  address text,
  brand text,
  comments text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_items_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT resource_items_link_not_blank CHECK (
    link IS NULL OR char_length(trim(link)) > 0
  ),
  CONSTRAINT resource_items_address_not_blank CHECK (
    address IS NULL OR char_length(trim(address)) > 0
  ),
  CONSTRAINT resource_items_brand_not_blank CHECK (
    brand IS NULL OR char_length(trim(brand)) > 0
  )
);

CREATE INDEX IF NOT EXISTS resource_items_user_id_idx ON public.resource_items (user_id);
CREATE INDEX IF NOT EXISTS resource_items_user_id_created_at_idx
  ON public.resource_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS resource_items_user_id_category_idx
  ON public.resource_items (user_id, category);

COMMENT ON TABLE public.resource_items IS 'Ressources à conserver ou consulter plus tard';
COMMENT ON COLUMN public.resource_items.name IS 'Nom de la ressource';
COMMENT ON COLUMN public.resource_items.category IS 'Catégorie (nom dénormalisé, voir resource_categories)';
COMMENT ON COLUMN public.resource_items.tags IS 'Tags descriptifs (séparés par virgule à la saisie)';
COMMENT ON COLUMN public.resource_items.link IS 'Lien web facultatif';
COMMENT ON COLUMN public.resource_items.address IS 'Adresse facultative';
COMMENT ON COLUMN public.resource_items.brand IS 'Marque facultative';
COMMENT ON COLUMN public.resource_items.comments IS 'Commentaire / avis personnel';

ALTER TABLE public.resource_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_items_select_own" ON public.resource_items;
CREATE POLICY "resource_items_select_own"
  ON public.resource_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "resource_items_insert_own" ON public.resource_items;
CREATE POLICY "resource_items_insert_own"
  ON public.resource_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resource_items_update_own" ON public.resource_items;
CREATE POLICY "resource_items_update_own"
  ON public.resource_items FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resource_items_delete_own" ON public.resource_items;
CREATE POLICY "resource_items_delete_own"
  ON public.resource_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_items TO authenticated;
GRANT ALL ON public.resource_items TO service_role;
