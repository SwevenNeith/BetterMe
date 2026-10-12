-- =============================================================================
-- Notifications League of Legends (suivi de partie / cooldowns)
-- =============================================================================
-- Kill-switch au niveau du compte. Les appareils restent filtrés via
-- push_subscriptions.notification_prefs.lol_match (Réglages → Appareils).
--
-- Exécute dans le SQL Editor Supabase (une fois).
-- =============================================================================

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS lol_match_notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.settings.lol_match_notifications_enabled IS
  'Si false, aucune push de fin de cooldown LoL (partie) n’est envoyée, '
  'même si la catégorie appareil lol_match est activée.';

COMMIT;

-- Vérif :
-- SELECT user_id, lol_match_notifications_enabled FROM public.settings LIMIT 20;
