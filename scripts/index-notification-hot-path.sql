-- =============================================================================
-- Index minimaux — hot path notifications (cron + clients)
-- =============================================================================
-- À appliquer une fois dans le SQL Editor Supabase.
--
-- Déjà couverts ailleurs (ne pas recréer inutilement — IF NOT EXISTS ok) :
--   • scheduled_notifications (scheduled_at) WHERE sent=false
--       → scripts/index-scheduled-notifications-due.sql
--       → scripts/rpc-claim-due-scheduled-notifications.sql
--   • scheduled_notifications (sent, scheduled_at)
--       → scripts/schedule-purge-sent-scheduled-notifications-daily.sql
--   • UNIQUE partiels event_id pour activite / todo_item_reminder
--       → scripts/cleanup-duplicate-todo-edt-reminders.sql
--
-- PK / UNIQUE attendus côté live (non versionnés ici) :
--   scheduled_notifications(id), push_subscriptions(id), daily_reminders(id),
--   todo_items(id), settings(user_id) — lookups par id / settings.user_id OK.
--
-- Non créés volontairement :
--   • settings(todo_promesse_reminder_enabled) — 1 ligne / user, scan trivial
--   • index composites redondants avec les partiels ci-dessous
-- =============================================================================

BEGIN;

-- 1) Deletes / listes pending par user + kind
--    Edge ensureTodoPromesse, replanif daily, scheduledReminders, etc.
CREATE INDEX IF NOT EXISTS scheduled_notifications_user_pending_kind_idx
  ON public.scheduled_notifications (user_id, kind)
  WHERE sent = false;

-- 2) Deletes par event_id (tous kinds) — timers / EDT / TODO
--    Complète les UNIQUE partiels limités à 2 kinds.
CREATE INDEX IF NOT EXISTS scheduled_notifications_pending_event_id_idx
  ON public.scheduled_notifications (event_id)
  WHERE sent = false AND event_id IS NOT NULL;

-- 3) Cron : loadPushSubscriptions(userIds) + appareils UI
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

-- 4) listDailyReminders / ownership / batch .in('id') déjà couvert par PK
CREATE INDEX IF NOT EXISTS daily_reminders_user_id_idx
  ON public.daily_reminders (user_id);

-- 5) Filet promesse (toutes les 15 min) : user_id IN + is_promesse = true
CREATE INDEX IF NOT EXISTS todo_items_user_promesse_idx
  ON public.todo_items (user_id)
  WHERE is_promesse = true;

COMMIT;

-- Vérification :
-- SELECT tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'scheduled_notifications', 'push_subscriptions',
--     'settings', 'todo_items', 'daily_reminders'
--   )
-- ORDER BY 1, 2;
