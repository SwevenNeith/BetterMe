-- =============================================================================
-- CRON : appelle send-notification chaque minute (rappels quotidiens + planifiés)
--
-- PRÉREQUIS (Supabase Dashboard → Database → Extensions) :
--   - pg_cron
--   - pg_net
--
-- Puis exécute ce script dans SQL Editor en remplaçant :
--   YOUR_PROJECT_REF  → ex: idnfbtgevosjcevnrnvu
--   YOUR_SERVICE_ROLE_KEY → clé service_role (Settings → API)
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  job_exists integer;
begin
  select count(*) into job_exists from cron.job where jobname = 'betterme-send-notification-cron';
  if job_exists > 0 then
    perform cron.unschedule(job_id := (select jobid from cron.job where jobname = 'betterme-send-notification-cron' limit 1));
  end if;
end $$;

select cron.schedule(
  'betterme-send-notification-cron',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{"type":"cron"}'::jsonb
  ) as request_id;
  $$
);
