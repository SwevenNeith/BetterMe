-- Images collées dans les notes (bucket Storage public, dossier {user_id}/…).
-- Exécute dans le SQL Editor Supabase.
-- Si le bucket existe déjà côté Dashboard, la ligne INSERT est ignorée (ON CONFLICT).

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('note-images', 'note-images', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "note_images_storage_select" ON storage.objects;
CREATE POLICY "note_images_storage_select"
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'note-images');

DROP POLICY IF EXISTS "note_images_storage_insert_own" ON storage.objects;
CREATE POLICY "note_images_storage_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "note_images_storage_update_own" ON storage.objects;
CREATE POLICY "note_images_storage_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "note_images_storage_delete_own" ON storage.objects;
CREATE POLICY "note_images_storage_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'note-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
