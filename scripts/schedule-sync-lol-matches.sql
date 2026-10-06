-- =============================================================================
-- Synchro LoL : manuelle uniquement (bouton Actualiser dans l’app)
-- =============================================================================
-- Plus de cron automatique. Ce script sert à désactiver un éventuel job
-- « sync-lol-matches-every-15m » s’il avait été créé auparavant.
--
-- La synchro est déclenchée côté client via l’Edge Function sync-lol-matches
-- (JWT utilisateur) quand on clique sur « Actualiser ».
-- =============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'sync-lol-matches-every-15m';
  RAISE NOTICE 'Job sync-lol-matches-every-15m retiré (s’il existait).';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron absent : rien à désactiver.';
  WHEN undefined_function THEN
    RAISE NOTICE 'cron.unschedule indisponible : rien à désactiver.';
END $$;
