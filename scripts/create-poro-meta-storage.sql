-- Meta builds Poro (JSON en Storage) — lecture publique, écriture service_role.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('poro-meta', 'poro-meta', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "poro_meta_storage_select" ON storage.objects;
CREATE POLICY "poro_meta_storage_select"
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'poro-meta');

-- Pas de policy INSERT/UPDATE pour authenticated :
-- l’Edge Function sync-poro-meta-mid écrit avec la service_role key.

COMMIT;
