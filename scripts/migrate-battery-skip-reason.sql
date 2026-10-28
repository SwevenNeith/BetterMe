-- Raisons de non-réalisation des activités prévues + revue du plan en fin de journée.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS skip_reason text NULL;

ALTER TABLE public.battery_day_entries
  DROP CONSTRAINT IF EXISTS battery_day_entries_skip_reason_chk;

ALTER TABLE public.battery_day_entries
  ADD CONSTRAINT battery_day_entries_skip_reason_chk
  CHECK (
    skip_reason IS NULL
    OR skip_reason IN ('no_energy', 'no_desire', 'unexpected', 'no_time', 'other')
  );

COMMENT ON COLUMN public.battery_day_entries.skip_reason IS
  'Pour kind=planned non fait : pas la force / pas envie / imprévu / plus le temps / autre (null = non renseigné).';

CREATE INDEX IF NOT EXISTS battery_day_entries_skip_reason_idx
  ON public.battery_day_entries (user_id, skip_reason)
  WHERE skip_reason IS NOT NULL;

ALTER TABLE public.battery_days
  ADD COLUMN IF NOT EXISTS plan_review_at timestamptz NULL;

COMMENT ON COLUMN public.battery_days.plan_review_at IS
  'Horodatage de la revue du plan non fait (popup ≥ 23h). Null = revue encore attendue s’il reste du prévu non fait.';

COMMIT;
