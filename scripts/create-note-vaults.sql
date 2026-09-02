-- Coffres Notes (style Obsidian Vaults) — BetterMe
-- Exécute dans le SQL Editor Supabase.
-- Idempotent : crée la table OU complète une installation existante (colonnes manquantes).

BEGIN;

-- Schéma de base (compatible avec les anciennes versions déjà déployées)
CREATE TABLE IF NOT EXISTS public.note_vaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  color text NOT NULL DEFAULT '#AD81BE',
  accent_color text NOT NULL DEFAULT '#D5B5EA',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Colonnes ajoutées après coup (thème 4 couleurs, icône)
ALTER TABLE public.note_vaults
  ADD COLUMN IF NOT EXISTS surface_color text NOT NULL DEFAULT '#F4F0FA';

ALTER TABLE public.note_vaults
  ADD COLUMN IF NOT EXISTS gradient_color text NOT NULL DEFAULT '#95D1AA';

ALTER TABLE public.note_vaults
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '🗄️';

-- Valeurs par défaut pour les lignes créées avant ces colonnes (migrations partielles)
UPDATE public.note_vaults
SET
  accent_color = COALESCE(accent_color, '#D5B5EA'),
  surface_color = COALESCE(surface_color, '#F4F0FA'),
  gradient_color = COALESCE(gradient_color, '#95D1AA'),
  icon = COALESCE(NULLIF(trim(icon), ''), '🗄️')
WHERE
  accent_color IS NULL
  OR surface_color IS NULL
  OR gradient_color IS NULL
  OR icon IS NULL
  OR trim(icon) = '';

COMMENT ON TABLE public.note_vaults IS
  'Coffres Notes : espaces isolés (dossiers, notes, extensions par coffre).';
COMMENT ON COLUMN public.note_vaults.color IS 'Couleur principale du coffre (hex).';
COMMENT ON COLUMN public.note_vaults.accent_color IS 'Couleur d’accent / fond léger (hex).';
COMMENT ON COLUMN public.note_vaults.surface_color IS 'Couleur de surface / fond principal (hex).';
COMMENT ON COLUMN public.note_vaults.gradient_color IS 'Couleur secondaire pour dégradés (hex).';
COMMENT ON COLUMN public.note_vaults.icon IS 'Emoji affiché comme icône du coffre.';

CREATE INDEX IF NOT EXISTS note_vaults_user_sort_idx
  ON public.note_vaults (user_id, sort_order, lower(name));

ALTER TABLE public.note_folders
  ADD COLUMN IF NOT EXISTS vault_id uuid NULL REFERENCES public.note_vaults (id) ON DELETE CASCADE;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS vault_id uuid NULL REFERENCES public.note_vaults (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS note_folders_user_vault_parent_idx
  ON public.note_folders (user_id, vault_id, parent_id);

CREATE INDEX IF NOT EXISTS notes_user_vault_folder_idx
  ON public.notes (user_id, vault_id, folder_id);

-- system_key unique par utilisateur ET coffre (NULL = racine globale)
DROP INDEX IF EXISTS public.note_folders_user_system_key_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS note_folders_user_vault_system_key_uidx
  ON public.note_folders (user_id, vault_id, system_key)
  WHERE system_key IS NOT NULL;

DROP INDEX IF EXISTS public.notes_user_system_key_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS notes_user_vault_system_key_uidx
  ON public.notes (user_id, vault_id, system_key)
  WHERE system_key IS NOT NULL;

ALTER TABLE public.note_vaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS note_vaults_select_own ON public.note_vaults;
CREATE POLICY note_vaults_select_own
  ON public.note_vaults FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS note_vaults_insert_own ON public.note_vaults;
CREATE POLICY note_vaults_insert_own
  ON public.note_vaults FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS note_vaults_update_own ON public.note_vaults;
CREATE POLICY note_vaults_update_own
  ON public.note_vaults FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS note_vaults_delete_own ON public.note_vaults;
CREATE POLICY note_vaults_delete_own
  ON public.note_vaults FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.note_vaults TO authenticated;
GRANT ALL ON TABLE public.note_vaults TO service_role;

COMMIT;
