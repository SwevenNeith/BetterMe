-- Préférences d’activation des extensions Notes (BetterMe)
-- Exécute dans le SQL Editor Supabase.
--
-- notes_extensions : jsonb { "<extension_id>": true|false, ... }
-- Exemple :
--   { "wikilinks": true, "sync-scroll": false, "auto-save": true }

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notes_extensions jsonb;

COMMENT ON COLUMN public.settings.notes_extensions IS
  'Préférences d’activation des extensions de la page Notes (id → boolean).';

-- Compte existants : NULL = utiliser les défauts côté app
-- (pas de backfill obligatoire)

COMMIT;
