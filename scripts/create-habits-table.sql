-- Table des habitudes (BetterMe — Habit Tracker)
-- À exécuter dans le SQL Editor Supabase (Dashboard → SQL → New query)

CREATE TABLE IF NOT EXISTS public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nom text NOT NULL,
  description text,
  icone text,
  couleur text NOT NULL DEFAULT '#ad81be',
  type_valeur text NOT NULL,
  unite text,
  frequence text NOT NULL,
  jours_actifs jsonb NOT NULL DEFAULT '[]'::jsonb,
  date_debut date NOT NULL,
  status text NOT NULL DEFAULT 'actif',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT habits_nom_not_blank CHECK (char_length(trim(nom)) > 0),
  CONSTRAINT habits_type_valeur_check CHECK (
    type_valeur IN ('float', 'boolean', 'integer', 'decimal')
  ),
  CONSTRAINT habits_frequence_check CHECK (
    frequence IN ('quotidien', 'hebdomadaire', 'mensuel')
  ),
  CONSTRAINT habits_jours_actifs_is_array CHECK (jsonb_typeof(jours_actifs) = 'array'),
  CONSTRAINT habits_status_check CHECK (status IN ('actif', 'archive'))
);

CREATE INDEX IF NOT EXISTS habits_user_id_idx ON public.habits (user_id);

CREATE INDEX IF NOT EXISTS habits_user_id_created_at_idx
  ON public.habits (user_id, created_at DESC);

COMMENT ON TABLE public.habits IS 'Habitudes suivies par l''utilisateur (Habit Tracker)';
COMMENT ON COLUMN public.habits.jours_actifs IS 'Jours ISO 1-7 (hebdo/quotidien) ou jours du mois 1-31 (mensuel)';
COMMENT ON COLUMN public.habits.status IS 'actif = visible dans le suivi ; archive = mise en pause (logs conservés)';

CREATE OR REPLACE FUNCTION public.habits_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS habits_set_updated_at ON public.habits;

CREATE TRIGGER habits_set_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW
  EXECUTE FUNCTION public.habits_set_updated_at();

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habits_select_own" ON public.habits;
CREATE POLICY "habits_select_own"
  ON public.habits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "habits_insert_own" ON public.habits;
CREATE POLICY "habits_insert_own"
  ON public.habits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habits_update_own" ON public.habits;
CREATE POLICY "habits_update_own"
  ON public.habits
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habits_delete_own" ON public.habits;
CREATE POLICY "habits_delete_own"
  ON public.habits
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;

-- Migration si la table existe déjà (integer/decimal → float, icône nullable) :
-- ALTER TABLE public.habits ALTER COLUMN icone DROP NOT NULL;
-- ALTER TABLE public.habits ALTER COLUMN icone DROP DEFAULT;
-- UPDATE public.habits SET type_valeur = 'float' WHERE type_valeur IN ('integer', 'decimal');
-- ALTER TABLE public.habits DROP CONSTRAINT IF EXISTS habits_type_valeur_check;
-- ALTER TABLE public.habits ADD CONSTRAINT habits_type_valeur_check
--   CHECK (type_valeur IN ('float', 'boolean', 'integer', 'decimal'));
