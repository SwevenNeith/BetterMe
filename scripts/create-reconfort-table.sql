-- Table des messages de réconfort (BetterMe)
-- À exécuter dans le SQL Editor Supabase (Dashboard → SQL → New query)
-- ou via : psql / supabase db execute

CREATE TABLE IF NOT EXISTS public.reconfort (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  qui text NOT NULL,
  message text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconfort_qui_not_blank CHECK (char_length(trim(qui)) > 0),
  CONSTRAINT reconfort_message_not_blank CHECK (char_length(trim(message)) > 0),
  CONSTRAINT reconfort_conditions_is_array CHECK (jsonb_typeof(conditions) = 'array'),
  CONSTRAINT reconfort_conditions_min_one CHECK (jsonb_array_length(conditions) >= 1)
);

CREATE INDEX IF NOT EXISTS reconfort_user_id_idx ON public.reconfort (user_id);

CREATE INDEX IF NOT EXISTS reconfort_user_id_created_at_idx
  ON public.reconfort (user_id, created_at DESC);

COMMENT ON TABLE public.reconfort IS 'Messages de réconfort personnalisés par utilisateur';
COMMENT ON COLUMN public.reconfort.qui IS 'Identité de l''auteur du message (ex. Maman, Toi-même)';
COMMENT ON COLUMN public.reconfort.message IS 'Texte du message de réconfort';
COMMENT ON COLUMN public.reconfort.conditions IS 'Liste des identifiants de conditions (ex. symptom:fatigue:high)';

CREATE OR REPLACE FUNCTION public.reconfort_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reconfort_set_updated_at ON public.reconfort;

CREATE TRIGGER reconfort_set_updated_at
  BEFORE UPDATE ON public.reconfort
  FOR EACH ROW
  EXECUTE FUNCTION public.reconfort_set_updated_at();

ALTER TABLE public.reconfort ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconfort_select_own" ON public.reconfort;
CREATE POLICY "reconfort_select_own"
  ON public.reconfort
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reconfort_insert_own" ON public.reconfort;
CREATE POLICY "reconfort_insert_own"
  ON public.reconfort
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reconfort_update_own" ON public.reconfort;
CREATE POLICY "reconfort_update_own"
  ON public.reconfort
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reconfort_delete_own" ON public.reconfort;
CREATE POLICY "reconfort_delete_own"
  ON public.reconfort
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconfort TO authenticated;
GRANT ALL ON public.reconfort TO service_role;
