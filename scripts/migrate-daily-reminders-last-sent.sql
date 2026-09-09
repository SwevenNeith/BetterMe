-- Date du dernier envoi d’un rappel quotidien (YYYY-MM-DD, fuseau appareil).
-- Exécute seulement si la colonne n’existe pas encore.

BEGIN;

ALTER TABLE public.daily_reminders
  ADD COLUMN IF NOT EXISTS last_sent_on text;

COMMENT ON COLUMN public.daily_reminders.last_sent_on IS
  'Date locale (YYYY-MM-DD) du dernier envoi de ce rappel quotidien.';

COMMIT;
