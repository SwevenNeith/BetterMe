-- Visibilité / layout Dashboard (BetterMe)
-- Exécute dans le SQL Editor Supabase si la colonne n’existe pas encore.
--
-- dashboard_visibility : jsonb
-- Contient notamment :
--   - un objet par widget (id → { visible: boolean, ... })
--   - layout : { desktop, mobile, mobileGroups }
--   - pins : { "pinned-note:<uuid>": { noteId, vaultId, noteTitle, partTitle, contentMd, createdAt }, ... }
--
-- Les notes épinglées (« Mettre sur le Dashboard ») sont stockées dans pins ;
-- aucun script SQL supplémentaire n’est requis pour cette fonctionnalité
-- une fois cette colonne présente.

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS dashboard_visibility jsonb;

COMMENT ON COLUMN public.settings.dashboard_visibility IS
  'Visibilité, ordre des widgets Dashboard (desktop/mobile) et notes épinglées (pins).';

-- Comptes existants : NULL = défauts côté app (pas de backfill obligatoire)

COMMIT;
