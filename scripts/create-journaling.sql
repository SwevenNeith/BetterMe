CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.journal_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  prompt_text text NOT NULL CHECK (char_length(trim(prompt_text)) > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, prompt_text)
);

COMMENT ON TABLE public.journal_prompts IS 'Prompts de journaling disponibles pour chaque utilisateur.';
COMMENT ON COLUMN public.journal_prompts.prompt_text IS 'Texte de la prompt affiché dans le picker journaling.';

CREATE INDEX IF NOT EXISTS journal_prompts_user_created_idx
  ON public.journal_prompts (user_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  prompt_id uuid NULL REFERENCES public.journal_prompts (id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  content_html text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.journal_entries IS 'Entrées du journal personnel.';
COMMENT ON COLUMN public.journal_entries.content_html IS 'Contenu HTML enrichi saisi dans l’éditeur type Word.';

CREATE INDEX IF NOT EXISTS journal_entries_user_created_idx
  ON public.journal_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS journal_entries_user_prompt_idx
  ON public.journal_entries (user_id, prompt_id);

ALTER TABLE public.journal_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_prompts_select_own ON public.journal_prompts;
CREATE POLICY journal_prompts_select_own
  ON public.journal_prompts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS journal_prompts_insert_own ON public.journal_prompts;
CREATE POLICY journal_prompts_insert_own
  ON public.journal_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS journal_prompts_update_own ON public.journal_prompts;
CREATE POLICY journal_prompts_update_own
  ON public.journal_prompts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS journal_prompts_delete_own ON public.journal_prompts;
CREATE POLICY journal_prompts_delete_own
  ON public.journal_prompts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS journal_entries_select_own ON public.journal_entries;
CREATE POLICY journal_entries_select_own
  ON public.journal_entries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS journal_entries_insert_own ON public.journal_entries;
CREATE POLICY journal_entries_insert_own
  ON public.journal_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS journal_entries_update_own ON public.journal_entries;
CREATE POLICY journal_entries_update_own
  ON public.journal_entries
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS journal_entries_delete_own ON public.journal_entries;
CREATE POLICY journal_entries_delete_own
  ON public.journal_entries
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.journal_prompts TO authenticated;
GRANT ALL ON TABLE public.journal_entries TO authenticated;
GRANT ALL ON TABLE public.journal_prompts TO service_role;
GRANT ALL ON TABLE public.journal_entries TO service_role;
