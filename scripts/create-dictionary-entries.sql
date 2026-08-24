-- Dictionnaire personnel (BetterMe — page Dictionnaire)
-- À exécuter dans l’éditeur SQL Supabase (une fois).

CREATE TABLE IF NOT EXISTS public.dictionary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  word text NOT NULL,
  definition text NOT NULL,
  word_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dictionary_entries_word_not_blank CHECK (char_length(trim(word)) > 0),
  CONSTRAINT dictionary_entries_definition_not_blank CHECK (char_length(trim(definition)) > 0),
  CONSTRAINT dictionary_entries_word_type_valid CHECK (
    word_type IN (
      'nom_commun_masculin',
      'nom_commun_feminin',
      'nom_propre',
      'verbe',
      'adjectif',
      'adverbe',
      'pronom',
      'determinant',
      'preposition',
      'conjonction',
      'interjection',
      'locution',
      'autre'
    )
  )
);

CREATE INDEX IF NOT EXISTS dictionary_entries_user_id_idx
  ON public.dictionary_entries (user_id);

CREATE INDEX IF NOT EXISTS dictionary_entries_user_word_idx
  ON public.dictionary_entries (user_id, word);

CREATE UNIQUE INDEX IF NOT EXISTS dictionary_entries_user_word_type_unique
  ON public.dictionary_entries (user_id, lower(trim(word)), word_type);

COMMENT ON TABLE public.dictionary_entries IS 'Entrées du dictionnaire personnel (mot, type, définition)';
COMMENT ON COLUMN public.dictionary_entries.word IS 'Mot saisi';
COMMENT ON COLUMN public.dictionary_entries.definition IS 'Définition personnelle';
COMMENT ON COLUMN public.dictionary_entries.word_type IS 'Catégorie grammaticale (n.m., verbe, etc.)';

ALTER TABLE public.dictionary_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dictionary_entries_select_own" ON public.dictionary_entries;
CREATE POLICY "dictionary_entries_select_own"
  ON public.dictionary_entries FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "dictionary_entries_insert_own" ON public.dictionary_entries;
CREATE POLICY "dictionary_entries_insert_own"
  ON public.dictionary_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dictionary_entries_update_own" ON public.dictionary_entries;
CREATE POLICY "dictionary_entries_update_own"
  ON public.dictionary_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dictionary_entries_delete_own" ON public.dictionary_entries;
CREATE POLICY "dictionary_entries_delete_own"
  ON public.dictionary_entries FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dictionary_entries TO authenticated;
GRANT ALL ON public.dictionary_entries TO service_role;
