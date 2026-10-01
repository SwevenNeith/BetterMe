-- =============================================================================
-- Index pour le cron minute : notifications dues (sent = false)
-- =============================================================================
-- Requête Edge Function (chaque minute) :
--   SELECT … FROM scheduled_notifications
--   WHERE sent = false AND scheduled_at <= now()
--
-- Index partiel : ne contient que les lignes pending (petit volume),
-- scan efficace sur scheduled_at. Complète (sans le remplacer) :
--   scheduled_notifications_sent_scheduled_at_idx  (sent, scheduled_at)
--   → utile pour la purge sent=true (scripts/schedule-purge-…-daily.sql)
--
-- Appliquer une fois dans le SQL Editor Supabase.
-- =============================================================================

CREATE INDEX IF NOT EXISTS scheduled_notifications_due_pending_idx
  ON public.scheduled_notifications (scheduled_at)
  WHERE sent = false;

COMMENT ON INDEX public.scheduled_notifications_due_pending_idx IS
  'Cron send-notification : pending dues (sent=false, scheduled_at <= now).';

-- Vérification (optionnel) :
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id FROM public.scheduled_notifications
-- WHERE sent = false AND scheduled_at <= now();
