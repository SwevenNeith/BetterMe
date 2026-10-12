-- =============================================================================
-- Active le kill-switch LoL partie pour ton compte (si tu l’avais désactivé)
-- =============================================================================
-- Remplace USER_UUID par ton auth.users.id (Réglages / JWT / Dashboard Auth).
-- =============================================================================

-- UPDATE public.settings
-- SET lol_match_notifications_enabled = true
-- WHERE user_id = 'USER_UUID';

-- Optionnel : forcer la catégorie appareil sur toutes tes subscriptions
-- (ne touche pas aux autres prefs) :
-- UPDATE public.push_subscriptions
-- SET notification_prefs =
--   COALESCE(notification_prefs, '{}'::jsonb) || '{"lol_match": true}'::jsonb
-- WHERE user_id = 'USER_UUID';
