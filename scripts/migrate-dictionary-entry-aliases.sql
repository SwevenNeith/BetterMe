-- Alias / formes liées pour le dictionnaire (pluriel, conjugaison, variante…)
-- À exécuter dans l’éditeur SQL Supabase (une fois).

CREATE TABLE IF NOT EXISTS public.dictionary_entry_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.dictionary_entries (id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dictionary_entry_aliases_alias_not_blank CHECK (char_length(trim(alias)) > 0)
);

CREATE INDEX IF NOT EXISTS dictionary_entry_aliases_user_id_idx
  ON public.dictionary_entry_aliases (user_id);

CREATE INDEX IF NOT EXISTS dictionary_entry_aliases_entry_id_idx
  ON public.dictionary_entry_aliases (entry_id);

CREATE UNIQUE INDEX IF NOT EXISTS dictionary_entry_aliases_user_alias_unique
  ON public.dictionary_entry_aliases (user_id, lower(trim(alias)));

COMMENT ON TABLE public.dictionary_entry_aliases IS 'Formes textuelles liées à une entrée du dictionnaire (ex. pluriel → singulier)';
COMMENT ON COLUMN public.dictionary_entry_aliases.alias IS 'Forme telle qu’elle apparaît dans les notes';

ALTER TABLE public.dictionary_entry_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dictionary_entry_aliases_select_own" ON public.dictionary_entry_aliases;
CREATE POLICY "dictionary_entry_aliases_select_own"
  ON public.dictionary_entry_aliases FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "dictionary_entry_aliases_insert_own" ON public.dictionary_entry_aliases;
CREATE POLICY "dictionary_entry_aliases_insert_own"
  ON public.dictionary_entry_aliases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dictionary_entry_aliases_update_own" ON public.dictionary_entry_aliases;
CREATE POLICY "dictionary_entry_aliases_update_own"
  ON public.dictionary_entry_aliases FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dictionary_entry_aliases_delete_own" ON public.dictionary_entry_aliases;
CREATE POLICY "dictionary_entry_aliases_delete_own"
  ON public.dictionary_entry_aliases FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dictionary_entry_aliases TO authenticated;
GRANT ALL ON public.dictionary_entry_aliases TO service_role;
