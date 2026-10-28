-- Durée des activités Batterie (catalogue + entrées du jour).
-- Lecture EDT possible pour proposer une durée ; jamais d’écriture vers l’EDT.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

-- Catalogue : durée par défaut (comme default_cost)
ALTER TABLE public.battery_activities
  ADD COLUMN IF NOT EXISTS default_duration_minutes integer NULL;

ALTER TABLE public.battery_activities
  ADD COLUMN IF NOT EXISTS default_all_day boolean NOT NULL DEFAULT false;

ALTER TABLE public.battery_activities
  DROP CONSTRAINT IF EXISTS battery_activities_default_duration_chk;

ALTER TABLE public.battery_activities
  ADD CONSTRAINT battery_activities_default_duration_chk
  CHECK (
    default_duration_minutes IS NULL
    OR default_duration_minutes > 0
  );

COMMENT ON COLUMN public.battery_activities.default_duration_minutes IS
  'Durée par défaut en minutes (null = non renseignée). Ignorée si default_all_day.';
COMMENT ON COLUMN public.battery_activities.default_all_day IS
  'Si true, la durée par défaut est « journée entière ».';

-- Entrées du jour : surcharge optionnelle (sinon EDT / défaut / vide)
ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS duration_minutes integer NULL;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS duration_all_day boolean NOT NULL DEFAULT false;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS has_duration_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.battery_day_entries
  DROP CONSTRAINT IF EXISTS battery_day_entries_duration_minutes_chk;

ALTER TABLE public.battery_day_entries
  ADD CONSTRAINT battery_day_entries_duration_minutes_chk
  CHECK (
    duration_minutes IS NULL
    OR duration_minutes > 0
  );

COMMENT ON COLUMN public.battery_day_entries.duration_minutes IS
  'Durée saisie côté Batterie (minutes). Utilisée seulement si has_duration_override.';
COMMENT ON COLUMN public.battery_day_entries.duration_all_day IS
  'Journée entière saisie côté Batterie. Utilisée seulement si has_duration_override.';
COMMENT ON COLUMN public.battery_day_entries.has_duration_override IS
  'true = durée choisie sur Batterie ; false = suivre EDT (si lié) sinon vide / défaut catalogue à la création.';

COMMIT;
