-- Comptes League of Legends liés à un utilisateur BetterMe
-- Exécute dans le SQL Editor Supabase.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lol_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  game_name text NOT NULL CHECK (char_length(trim(game_name)) > 0 AND char_length(game_name) <= 64),
  tag_line text NOT NULL CHECK (char_length(trim(tag_line)) > 0 AND char_length(tag_line) <= 16),
  puuid text NOT NULL CHECK (char_length(trim(puuid)) > 0),
  platform text NOT NULL DEFAULT 'euw1'
    CHECK (platform IN (
      'euw1', 'eun1', 'na1', 'kr', 'br1', 'la1', 'la2',
      'jp1', 'oc1', 'tr1', 'ru', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'
    )),
  routing text NOT NULL DEFAULT 'europe'
    CHECK (routing IN ('europe', 'americas', 'asia', 'sea')),
  summoner_id text NULL,
  summoner_level integer NULL,
  profile_icon_id integer NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT lol_accounts_user_puuid_uidx UNIQUE (user_id, puuid)
);

CREATE INDEX IF NOT EXISTS lol_accounts_user_id_idx
  ON public.lol_accounts (user_id);

CREATE INDEX IF NOT EXISTS lol_accounts_user_updated_idx
  ON public.lol_accounts (user_id, updated_at DESC);

COMMENT ON TABLE public.lol_accounts IS
  'Comptes Riot / League of Legends enregistrés par utilisateur.';
COMMENT ON COLUMN public.lol_accounts.game_name IS 'Nom Riot (avant le #).';
COMMENT ON COLUMN public.lol_accounts.tag_line IS 'Tag Riot (après le #).';
COMMENT ON COLUMN public.lol_accounts.platform IS 'Région plateforme LoL (ex. euw1).';
COMMENT ON COLUMN public.lol_accounts.routing IS 'Région de routage Riot (europe, americas, asia, sea).';

ALTER TABLE public.lol_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lol_accounts_select_own ON public.lol_accounts;
CREATE POLICY lol_accounts_select_own
  ON public.lol_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_accounts_insert_own ON public.lol_accounts;
CREATE POLICY lol_accounts_insert_own
  ON public.lol_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_accounts_update_own ON public.lol_accounts;
CREATE POLICY lol_accounts_update_own
  ON public.lol_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lol_accounts_delete_own ON public.lol_accounts;
CREATE POLICY lol_accounts_delete_own
  ON public.lol_accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMIT;
