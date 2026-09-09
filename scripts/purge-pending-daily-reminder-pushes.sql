-- Purge immédiate des files daily (au cas où d’anciens doublons trainent).
-- À coller dans le SQL Editor si tu reçois encore 8h + 10h après redeploy.

DELETE FROM public.scheduled_notifications
WHERE sent = false
  AND (
    kind = 'daily_reminder'
    OR kind LIKE 'daily_reminder:%'
  );
