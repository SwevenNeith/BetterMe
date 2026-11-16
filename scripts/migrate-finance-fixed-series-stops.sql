-- Arrêts de séries de dépenses fixes (suppression à partir d’un mois, sans re-report).
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS fixed_series_stops jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.finance_settings.fixed_series_stops IS
  'Séries de dépenses fixes stoppées : [{ "key": "cc|catégorie|détail", "from": "YYYY-MM" }]. '
  'Le report mensuel ne recrée pas la série à partir de ce mois.';

COMMIT;
