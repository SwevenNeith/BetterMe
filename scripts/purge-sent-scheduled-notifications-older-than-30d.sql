-- =============================================================================
-- Nettoyage one-shot : scheduled_notifications envoyées il y a > 30 jours
-- =============================================================================
-- Critère : sent = true ET scheduled_at < now() - 30 jours
-- (pas de colonne sent_at : on s’appuie sur l’heure planifiée / d’envoi)
--
-- Purge automatique : pg_cron quotidien
--   → scripts/schedule-purge-sent-scheduled-notifications-daily.sql
-- Secours client (à l’ouverture de l’app, scoped user) :
--   → purgeOldSentScheduledNotifications dans scheduledReminders.js
--
-- Exécute ce script une fois pour rattraper l’existant si besoin.
-- =============================================================================

-- Aperçu (optionnel)
-- SELECT count(*) AS a_supprimer
-- FROM public.scheduled_notifications
-- WHERE sent = true
--   AND scheduled_at < now() - interval '30 days';

DELETE FROM public.scheduled_notifications
WHERE sent = true
  AND scheduled_at < now() - interval '30 days';
