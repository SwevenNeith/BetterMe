-- =============================================================================
-- Purge quotidienne des scheduled_notifications envoyées (> 30 jours)
-- =============================================================================
-- Critère : sent = true ET scheduled_at < now() - 30 jours
-- (pas de colonne sent_at : on s’appuie sur l’heure planifiée / d’envoi)
--
-- Remplace la purge qui tournait à chaque tick du cron minute
-- (Edge Function send-notification type=cron).
--
-- Prérequis Supabase : extension pg_cron activée
--   Dashboard → Database → Extensions → pg_cron
--   ou : CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
--
-- Appliquer une fois dans le SQL Editor (rôle postgres / service).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_old_sent_scheduled_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.scheduled_notifications
  WHERE sent = true
    AND scheduled_at < (now() - interval '30 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.purge_old_sent_scheduled_notifications() IS
  'Supprime les scheduled_notifications avec sent=true et scheduled_at < now-30j. Appelée par pg_cron quotidien.';

REVOKE ALL ON FUNCTION public.purge_old_sent_scheduled_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_sent_scheduled_notifications() TO postgres;

-- Index utile pour la purge (sent=true + scheduled_at)
-- Pour le cron dues (sent=false) : voir scripts/index-scheduled-notifications-due.sql
CREATE INDEX IF NOT EXISTS scheduled_notifications_sent_scheduled_at_idx
  ON public.scheduled_notifications (sent, scheduled_at);

-- Planification : 03:00 UTC chaque jour
-- Si le job existe déjà, on le retire puis on le recrée (idempotent).
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'purge-sent-scheduled-notifications-daily';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Extension pg_cron absente : crée la fonction, puis active pg_cron et relance le SELECT cron.schedule ci-dessous.';
  WHEN undefined_function THEN
    RAISE NOTICE 'cron.unschedule indisponible : active pg_cron puis exécute le SELECT cron.schedule ci-dessous.';
END $$;

SELECT cron.schedule(
  'purge-sent-scheduled-notifications-daily',
  '0 3 * * *',
  $$SELECT public.purge_old_sent_scheduled_notifications();$$
);

-- Vérification (optionnel)
-- SELECT jobid, jobname, schedule, command, active
-- FROM cron.job
-- WHERE jobname = 'purge-sent-scheduled-notifications-daily';
--
-- Test manuel :
-- SELECT public.purge_old_sent_scheduled_notifications();
