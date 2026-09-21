-- Re-regardages par média (BetterMe — page Télévision)
-- Exécute dans le SQL Editor Supabase après create-television-media.sql

CREATE TABLE IF NOT EXISTS public.television_rewatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.television_media (id) ON DELETE CASCADE,
  date_start date,
  date_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT television_rewatches_dates_order CHECK (
    date_start IS NULL
    OR date_end IS NULL
    OR date_end >= date_start
  )
);

CREATE INDEX IF NOT EXISTS television_rewatches_user_media_idx
  ON public.television_rewatches (user_id, media_id, created_at ASC);

COMMENT ON TABLE public.television_rewatches IS 'Historique des passages visionnés (dates début/fin archivées)';
COMMENT ON COLUMN public.television_rewatches.date_start IS 'Date de début de ce passage';
COMMENT ON COLUMN public.television_rewatches.date_end IS 'Date de fin de ce passage';

ALTER TABLE public.television_rewatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "television_rewatches_select_own" ON public.television_rewatches;
CREATE POLICY "television_rewatches_select_own"
  ON public.television_rewatches FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_rewatches_insert_own" ON public.television_rewatches;
CREATE POLICY "television_rewatches_insert_own"
  ON public.television_rewatches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_rewatches_update_own" ON public.television_rewatches;
CREATE POLICY "television_rewatches_update_own"
  ON public.television_rewatches FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "television_rewatches_delete_own" ON public.television_rewatches;
CREATE POLICY "television_rewatches_delete_own"
  ON public.television_rewatches FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.television_rewatches TO authenticated;
GRANT ALL ON public.television_rewatches TO service_role;
