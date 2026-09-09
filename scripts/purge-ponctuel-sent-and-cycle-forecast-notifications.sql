-- =============================================================================
-- Purge : ponctuels envoyés + notifs de prévision de cycle obsolètes
-- =============================================================================
-- Les notifs menstruation_* (SPM / règles / phases) sont reconstruites par l’app
-- à partir des cycles actuels (n → n+3). On les vide toutes ici, puis tu rouvres
-- la page Menstruation (ou Relancer dans Réglages) pour replanifier proprement.
--
-- Ne touche PAS aux :
--   • daily_reminder:*
--   • todo_promesse_reminder
--   • ponctuel pending (sent = false)
--   • menstruation_pattern* (patterns de symptômes)
-- =============================================================================

-- 1) Ponctuels déjà envoyés
DELETE FROM public.scheduled_notifications
WHERE kind = 'ponctuel'
  AND sent = true;

-- 2) Toutes les notifs de prévision de cycle (pilule + naturel)
--    → plus de 450× par kind = ancien horizon de forecast illimité
DELETE FROM public.scheduled_notifications
WHERE kind IN (
  'menstruation_spm_estimee',
  'menstruation_regles_estimees',
  'menstruation_phase_folliculaire',
  'menstruation_phase_ovulatoire',
  'menstruation_phase_luteale'
);

-- 3) Contrôle : ces kinds doivent être à 0
SELECT kind, sent, count(*) AS n
FROM public.scheduled_notifications
WHERE kind = 'ponctuel'
   OR kind LIKE 'menstruation_%'
GROUP BY kind, sent
ORDER BY kind, sent;
