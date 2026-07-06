-- Statut des habitudes : actif (suivi) ou archive (en pause, données conservées)
-- À exécuter dans le SQL Editor Supabase après create-habits-table.sql

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'actif';

ALTER TABLE public.habits DROP CONSTRAINT IF EXISTS habits_status_check;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_status_check CHECK (status IN ('actif', 'archive'));

CREATE INDEX IF NOT EXISTS habits_user_id_status_idx
  ON public.habits (user_id, status);

COMMENT ON COLUMN public.habits.status IS 'actif = visible dans le suivi ; archive = mise en pause (logs conservés)';

UPDATE public.habits SET status = 'actif' WHERE status IS NULL OR status = '';
