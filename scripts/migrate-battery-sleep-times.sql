-- Migration Batterie : horaires de sommeil / réveil / sortie du lit
-- Exécute dans le SQL Editor Supabase (après create-battery.sql).

BEGIN;

ALTER TABLE public.battery_days
  ADD COLUMN IF NOT EXISTS sleep_bedtime time NULL,
  ADD COLUMN IF NOT EXISTS sleep_wake_time time NULL,
  ADD COLUMN IF NOT EXISTS sleep_out_of_bed_time time NULL;

COMMENT ON COLUMN public.battery_days.sleep_bedtime IS
  'Heure du coucher (veille). La durée de sommeil = écart jusqu’à sleep_wake_time.';
COMMENT ON COLUMN public.battery_days.sleep_wake_time IS
  'Heure du réveil.';
COMMENT ON COLUMN public.battery_days.sleep_out_of_bed_time IS
  'Heure de sortie du lit. L’écart avec le réveil mesure le « temps au lit après réveil ».';
COMMENT ON COLUMN public.battery_days.sleep_hours IS
  'Durée de sommeil calculée (h), dérivée de sleep_bedtime → sleep_wake_time. Conservée pour historique.';

COMMIT;
