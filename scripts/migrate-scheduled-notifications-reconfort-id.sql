-- Lie les notifications réconfort planifiées au message source (mise à jour fiable de last_sent).
-- À exécuter dans le SQL Editor Supabase.

ALTER TABLE public.scheduled_notifications
  ADD COLUMN IF NOT EXISTS reconfort_id uuid;

CREATE INDEX IF NOT EXISTS scheduled_notifications_reconfort_id_idx
  ON public.scheduled_notifications (reconfort_id)
  WHERE reconfort_id IS NOT NULL;

COMMENT ON COLUMN public.scheduled_notifications.reconfort_id IS
  'Message réconfort associé (kind = reconfort), pour mettre à jour last_sent à l''envoi.';
