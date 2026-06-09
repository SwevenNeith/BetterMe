-- Logs journaliers du Habit Tracker (BetterMe)
-- À exécuter dans le SQL Editor Supabase après create-habits-table.sql

CREATE TABLE IF NOT EXISTS public.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.habits (id) ON DELETE CASCADE,
  date_jour date NOT NULL,
  valeur numeric,
  fait boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT habit_logs_unique_par_jour UNIQUE (habit_id, date_jour)
);

CREATE INDEX IF NOT EXISTS habit_logs_user_id_idx ON public.habit_logs (user_id);

CREATE INDEX IF NOT EXISTS habit_logs_habit_id_date_idx
  ON public.habit_logs (habit_id, date_jour DESC);

CREATE INDEX IF NOT EXISTS habit_logs_user_date_idx
  ON public.habit_logs (user_id, date_jour DESC);

COMMENT ON TABLE public.habit_logs IS 'Suivi journalier des habitudes';
COMMENT ON COLUMN public.habit_logs.fait IS 'Habitudes Fait/Pas fait : true = jour complété';
COMMENT ON COLUMN public.habit_logs.valeur IS 'Habitudes numériques : valeur saisie';

CREATE OR REPLACE FUNCTION public.habit_logs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS habit_logs_set_updated_at ON public.habit_logs;

CREATE TRIGGER habit_logs_set_updated_at
  BEFORE UPDATE ON public.habit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.habit_logs_set_updated_at();

ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habit_logs_select_own" ON public.habit_logs;
CREATE POLICY "habit_logs_select_own"
  ON public.habit_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "habit_logs_insert_own" ON public.habit_logs;
CREATE POLICY "habit_logs_insert_own"
  ON public.habit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habit_logs_update_own" ON public.habit_logs;
CREATE POLICY "habit_logs_update_own"
  ON public.habit_logs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habit_logs_delete_own" ON public.habit_logs;
CREATE POLICY "habit_logs_delete_own"
  ON public.habit_logs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;
GRANT ALL ON public.habit_logs TO service_role;
