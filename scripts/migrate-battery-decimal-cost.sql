-- Autorise les coûts / regains décimaux (ex. 0.5)
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.battery_activities
  ALTER COLUMN default_cost TYPE numeric(8, 1)
  USING round(default_cost::numeric, 1);

ALTER TABLE public.battery_day_entries
  ALTER COLUMN cost TYPE numeric(8, 1)
  USING round(cost::numeric, 1);

COMMENT ON COLUMN public.battery_activities.default_cost IS
  'Coût par défaut signé (positif = dépense, négatif = regain), précision 0.1.';
COMMENT ON COLUMN public.battery_day_entries.cost IS
  'Coût signé de l’entrée (positif = dépense, négatif = regain), précision 0.1.';

COMMIT;
