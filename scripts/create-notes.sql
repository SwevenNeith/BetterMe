-- Notes type Obsidian (BetterMe)
-- Exécute dans le SQL Editor Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Dossiers (arborescence imbriquée)
CREATE TABLE IF NOT EXISTS public.note_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.note_folders (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.note_folders IS 'Dossiers de notes (arborescence par parent_id).';

CREATE INDEX IF NOT EXISTS note_folders_user_parent_idx
  ON public.note_folders (user_id, parent_id);

CREATE INDEX IF NOT EXISTS note_folders_user_name_idx
  ON public.note_folders (user_id, lower(name));

-- Notes Markdown
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  folder_id uuid NULL REFERENCES public.note_folders (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  content_md text NOT NULL DEFAULT '',
  system_key text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Une seule note système par clé (les system_key NULL restent libres)
CREATE UNIQUE INDEX IF NOT EXISTS notes_user_system_key_uidx
  ON public.notes (user_id, system_key)
  WHERE system_key IS NOT NULL;

COMMENT ON TABLE public.notes IS 'Notes Markdown personnelles (style Obsidian).';
COMMENT ON COLUMN public.notes.content_md IS 'Contenu Markdown brut.';
COMMENT ON COLUMN public.notes.system_key IS
  'Clé système (ex. markdown-tutorial). Unique par utilisateur ; NULL pour les notes normales.';

CREATE INDEX IF NOT EXISTS notes_user_folder_idx
  ON public.notes (user_id, folder_id);

CREATE INDEX IF NOT EXISTS notes_user_title_idx
  ON public.notes (user_id, lower(title));

CREATE INDEX IF NOT EXISTS notes_user_updated_idx
  ON public.notes (user_id, updated_at DESC);

-- État des seeds (tutoriel non ressemé après suppression)
CREATE TABLE IF NOT EXISTS public.notes_seed_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  markdown_tutorial_removed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.notes_seed_state IS
  'Flags de seed Notes : si markdown_tutorial_removed, ne pas recréer le tutoriel.';

ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes_seed_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS note_folders_select_own ON public.note_folders;
CREATE POLICY note_folders_select_own
  ON public.note_folders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS note_folders_insert_own ON public.note_folders;
CREATE POLICY note_folders_insert_own
  ON public.note_folders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS note_folders_update_own ON public.note_folders;
CREATE POLICY note_folders_update_own
  ON public.note_folders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS note_folders_delete_own ON public.note_folders;
CREATE POLICY note_folders_delete_own
  ON public.note_folders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_select_own ON public.notes;
CREATE POLICY notes_select_own
  ON public.notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_insert_own ON public.notes;
CREATE POLICY notes_insert_own
  ON public.notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_update_own ON public.notes;
CREATE POLICY notes_update_own
  ON public.notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_delete_own ON public.notes;
CREATE POLICY notes_delete_own
  ON public.notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_seed_state_select_own ON public.notes_seed_state;
CREATE POLICY notes_seed_state_select_own
  ON public.notes_seed_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_seed_state_insert_own ON public.notes_seed_state;
CREATE POLICY notes_seed_state_insert_own
  ON public.notes_seed_state FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_seed_state_update_own ON public.notes_seed_state;
CREATE POLICY notes_seed_state_update_own
  ON public.notes_seed_state FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notes_seed_state_delete_own ON public.notes_seed_state;
CREATE POLICY notes_seed_state_delete_own
  ON public.notes_seed_state FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.note_folders TO authenticated;
GRANT ALL ON TABLE public.notes TO authenticated;
GRANT ALL ON TABLE public.notes_seed_state TO authenticated;
GRANT ALL ON TABLE public.note_folders TO service_role;
GRANT ALL ON TABLE public.notes TO service_role;
GRANT ALL ON TABLE public.notes_seed_state TO service_role;
