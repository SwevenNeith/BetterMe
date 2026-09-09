-- =============================================================================
-- BetterMe — Fuseau appareil + colonnes rappels (à exécuter UNE fois dans
-- le SQL Editor Supabase). Ne modifie PAS tes heures affichées (10:05 reste 10:05).
-- L’app recalcule ensuite scheduled_at en UTC absolu au prochain chargement.
-- =============================================================================

BEGIN;

-- 1) Settings : fuseau IANA + offset minutes (ex. 120 = UTC+2)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notification_timezone text;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notification_utc_offset_minutes integer;

COMMENT ON COLUMN public.settings.notification_timezone IS
  'Fuseau IANA de l’appareil (ex. Europe/Paris).';

COMMENT ON COLUMN public.settings.notification_utc_offset_minutes IS
  'Minutes à ajouter à UTC pour obtenir l’heure locale appareil (ex. 120 en CEST).';

-- 2) Anti-doublon rappels quotidiens
ALTER TABLE public.daily_reminders
  ADD COLUMN IF NOT EXISTS last_sent_on text;

COMMENT ON COLUMN public.daily_reminders.last_sent_on IS
  'Date locale YYYY-MM-DD du dernier envoi de ce rappel.';

-- 3) Purge des anciennes files « daily » pour forcer un recalcul client
--    (tes reminder_time dans daily_reminders sont conservés tels quels).
--    kind = daily_reminder:<uuid> (event_id reste NULL — FK vers events EDT).
DELETE FROM public.scheduled_notifications
WHERE sent = false
  AND (
    kind = 'daily_reminder'
    OR kind LIKE 'daily_reminder:%'
  );

COMMIT;

-- Vérification rapide (optionnel) :
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'settings'
--   AND column_name IN ('notification_timezone', 'notification_utc_offset_minutes');
