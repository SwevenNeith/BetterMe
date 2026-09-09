-- =============================================================================
-- Nettoyage one-shot : scheduled_notifications envoyées il y a > 30 jours
-- =============================================================================
-- Critère : sent = true ET scheduled_at < now() - 30 jours
-- (pas de colonne sent_at : on s’appuie sur l’heure planifiée / d’envoi)
--
-- La purge automatique est aussi faite par le cron send-notification (chaque minute).
-- Exécute ce script une fois pour rattraper l’existant.
-- =============================================================================

-- Aperçu (optionnel)
-- SELECT count(*) AS a_supprimer
-- FROM public.scheduled_notifications
-- WHERE sent = true
--   AND scheduled_at < (now() AT TIME ZONE 'utc') - interval '30 days';

DELETE FROM public.scheduled_notifications
WHERE sent = true
  AND scheduled_at < (now() AT TIME ZONE 'utc') - interval '30 days';
