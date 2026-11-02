-- Assistant LoL « Poro » : conversations, messages et mémoire utilisateur.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lol_poro_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Discussion avec Poro'
    CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 120),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS lol_poro_conversations_user_updated_idx
  ON public.lol_poro_conversations (user_id, updated_at DESC);

COMMENT ON TABLE public.lol_poro_conversations IS
  'Fils de discussion avec l’assistant Poro (League of Legends).';

CREATE TABLE IF NOT EXISTS public.lol_poro_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.lol_poro_conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 8000),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS lol_poro_messages_conversation_created_idx
  ON public.lol_poro_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS lol_poro_messages_user_created_idx
  ON public.lol_poro_messages (user_id, created_at DESC);

COMMENT ON TABLE public.lol_poro_messages IS
  'Messages du chat Poro (utilisateur / assistant).';
COMMENT ON COLUMN public.lol_poro_messages.meta IS
  'Métadonnées optionnelles (intent, quiz, etc.).';

CREATE TABLE IF NOT EXISTS public.lol_poro_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note', 'main', 'preference', 'avoid', 'rank', 'fact')),
  label text NOT NULL CHECK (char_length(trim(label)) > 0 AND char_length(label) <= 80),
  value text NOT NULL CHECK (char_length(trim(value)) > 0 AND char_length(value) <= 500),
  source_message_id uuid NULL REFERENCES public.lol_poro_messages (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT lol_poro_memories_user_label_uidx UNIQUE (user_id, label)
);

CREATE INDEX IF NOT EXISTS lol_poro_memories_user_kind_idx
  ON public.lol_poro_memories (user_id, kind);

COMMENT ON TABLE public.lol_poro_memories IS
  'Faits mémorisés par Poro (main, préférences, notes libres).';
COMMENT ON COLUMN public.lol_poro_memories.label IS
  'Clé courte normalisée (ex. main_mid, prefer_tank).';
COMMENT ON COLUMN public.lol_poro_memories.value IS
  'Contenu mémorisé affiché / réutilisé dans les réponses.';

ALTER TABLE public.lol_poro_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lol_poro_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lol_poro_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lol_poro_conversations_select_own ON public.lol_poro_conversations;
CREATE POLICY lol_poro_conversations_select_own
  ON public.lol_poro_conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_conversations_insert_own ON public.lol_poro_conversations;
CREATE POLICY lol_poro_conversations_insert_own
  ON public.lol_poro_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_conversations_update_own ON public.lol_poro_conversations;
CREATE POLICY lol_poro_conversations_update_own
  ON public.lol_poro_conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_conversations_delete_own ON public.lol_poro_conversations;
CREATE POLICY lol_poro_conversations_delete_own
  ON public.lol_poro_conversations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_messages_select_own ON public.lol_poro_messages;
CREATE POLICY lol_poro_messages_select_own
  ON public.lol_poro_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_messages_insert_own ON public.lol_poro_messages;
CREATE POLICY lol_poro_messages_insert_own
  ON public.lol_poro_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_messages_delete_own ON public.lol_poro_messages;
CREATE POLICY lol_poro_messages_delete_own
  ON public.lol_poro_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_memories_select_own ON public.lol_poro_memories;
CREATE POLICY lol_poro_memories_select_own
  ON public.lol_poro_memories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_memories_insert_own ON public.lol_poro_memories;
CREATE POLICY lol_poro_memories_insert_own
  ON public.lol_poro_memories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_memories_update_own ON public.lol_poro_memories;
CREATE POLICY lol_poro_memories_update_own
  ON public.lol_poro_memories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_poro_memories_delete_own ON public.lol_poro_memories;
CREATE POLICY lol_poro_memories_delete_own
  ON public.lol_poro_memories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMIT;
