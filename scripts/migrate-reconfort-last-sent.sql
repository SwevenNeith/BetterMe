-- Ajoute la date du dernier envoi pour chaque message de réconfort.
-- Permet d'éviter de renvoyer le même message avant 3 jours.
-- À exécuter dans le SQL Editor Supabase.

ALTER TABLE public.reconfort
  ADD COLUMN IF NOT EXISTS last_sent date;

COMMENT ON COLUMN public.reconfort.last_sent IS
  'Date du dernier envoi effectif du message (notification push). NULL si jamais envoyé.';

CREATE INDEX IF NOT EXISTS reconfort_user_id_last_sent_idx
  ON public.reconfort (user_id, last_sent DESC NULLS LAST);

-- Remplissage initial depuis les notifications réconfort déjà envoyées (optionnel)
UPDATE public.reconfort r
SET last_sent = sub.last_sent
FROM (
  SELECT
    sn.user_id,
    sn.title AS qui,
    trim(sn.body) AS message,
    MAX(sn.scheduled_at::date) AS last_sent
  FROM public.scheduled_notifications sn
  WHERE sn.kind = 'reconfort'
    AND sn.sent = true
    AND sn.user_id IS NOT NULL
  GROUP BY sn.user_id, sn.title, trim(sn.body)
) sub
WHERE r.user_id = sub.user_id
  AND r.qui = sub.qui
  AND r.message = sub.message
  AND (r.last_sent IS NULL OR r.last_sent < sub.last_sent);
