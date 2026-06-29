-- Limites de promesses TODO (par jour et par semaine « Cette semaine »).
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS todo_promesse_limit_per_day integer NOT NULL DEFAULT 3
    CHECK (todo_promesse_limit_per_day >= 1 AND todo_promesse_limit_per_day <= 99),
  ADD COLUMN IF NOT EXISTS todo_promesse_limit_per_week integer NOT NULL DEFAULT 3
    CHECK (todo_promesse_limit_per_week >= 1 AND todo_promesse_limit_per_week <= 99);

COMMENT ON COLUMN public.settings.todo_promesse_limit_per_day IS
  'Nombre max de promesses par jour (ponctuel, quotidien, hebdomadaire).';

COMMENT ON COLUMN public.settings.todo_promesse_limit_per_week IS
  'Nombre max de promesses « Cette semaine » par semaine calendaire (lundi–dimanche).';
