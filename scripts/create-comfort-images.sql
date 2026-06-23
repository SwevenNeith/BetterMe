-- Table + bucket comfort-images (BetterMe)
-- 1. Crée le bucket « comfort-images » (privé) dans Storage si besoin
-- 2. Exécute ce script dans le SQL Editor Supabase

INSERT INTO storage.buckets (id, name, public)
VALUES ('comfort-images', 'comfort-images', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.comfort_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nom text NOT NULL,
  storage_path text NOT NULL,
  type text NOT NULL DEFAULT 'réconfort',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comfort_images_nom_not_blank CHECK (char_length(trim(nom)) > 0),
  CONSTRAINT comfort_images_storage_path_not_blank CHECK (char_length(trim(storage_path)) > 0)
);

CREATE INDEX IF NOT EXISTS comfort_images_user_id_idx ON public.comfort_images (user_id);
CREATE INDEX IF NOT EXISTS comfort_images_user_id_created_at_idx
  ON public.comfort_images (user_id, created_at DESC);

COMMENT ON TABLE public.comfort_images IS 'Images de réconfort affichées sur le tableau de bord';
COMMENT ON COLUMN public.comfort_images.nom IS 'Nom du fichier original';
COMMENT ON COLUMN public.comfort_images.storage_path IS 'Chemin dans le bucket comfort-images';
COMMENT ON COLUMN public.comfort_images.type IS 'Catégorie (ex. réconfort)';

ALTER TABLE public.comfort_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comfort_images_select_own" ON public.comfort_images;
CREATE POLICY "comfort_images_select_own"
  ON public.comfort_images FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "comfort_images_insert_own" ON public.comfort_images;
CREATE POLICY "comfort_images_insert_own"
  ON public.comfort_images FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comfort_images_update_own" ON public.comfort_images;
CREATE POLICY "comfort_images_update_own"
  ON public.comfort_images FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comfort_images_delete_own" ON public.comfort_images;
CREATE POLICY "comfort_images_delete_own"
  ON public.comfort_images FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comfort_images TO authenticated;
GRANT ALL ON public.comfort_images TO service_role;

-- Storage : accès limité au dossier {user_id}/...
DROP POLICY IF EXISTS "comfort_images_storage_select_own" ON storage.objects;
CREATE POLICY "comfort_images_storage_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comfort-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "comfort_images_storage_insert_own" ON storage.objects;
CREATE POLICY "comfort_images_storage_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comfort-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "comfort_images_storage_update_own" ON storage.objects;
CREATE POLICY "comfort_images_storage_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comfort-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "comfort_images_storage_delete_own" ON storage.objects;
CREATE POLICY "comfort_images_storage_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comfort-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
