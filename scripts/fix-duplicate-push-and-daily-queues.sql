-- Nettoie les abonnements push en double (même endpoint) → cause fréquente de notifs x2.
-- Puis vide les files daily en attente pour forcer un recalcul côté app.

BEGIN;

DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.user_id = b.user_id
  AND a.id > b.id
  AND coalesce(a.subscription->>'endpoint', '') <> ''
  AND a.subscription->>'endpoint' = b.subscription->>'endpoint';

DELETE FROM public.scheduled_notifications
WHERE sent = false
  AND (
    kind = 'daily_reminder'
    OR kind LIKE 'daily_reminder:%'
  );

COMMIT;
