-- Fuseau IANA de l’appareil pour les rappels quotidiens / cron serveur.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notification_timezone text;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notification_utc_offset_minutes integer;

COMMENT ON COLUMN public.settings.notification_timezone IS
  'Fuseau IANA de l’appareil (ex. Europe/Paris, America/Montreal) pour les notifications horaires.';

COMMENT ON COLUMN public.settings.notification_utc_offset_minutes IS
  'Décalage UTC de l’appareil en minutes (ex. 120 pour UTC+2). Préféré au fuseau IANA côté cron Deno.';

COMMIT;
