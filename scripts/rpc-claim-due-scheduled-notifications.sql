-- =============================================================================
-- RPC : claim atomique des scheduled_notifications dues
-- =============================================================================
-- Remplace (Edge Function send-notification, type=cron) :
--   1) SELECT … WHERE sent=false AND scheduled_at <= now
--   2) N × UPDATE sent=true WHERE id=? AND sent=false  (claim unitaire)
--
-- Gain :
--   • 1 round-trip PostgREST au lieu de 1+N
--   • anti-doublon plus fort : FOR UPDATE SKIP LOCKED (pg_cron + cron client)
--   • même sémantique : les lignes dues (y compris hors grâce) passent sent=true ;
--     l’Edge décide ensuite d’envoyer ou non (SCHEDULED_SEND_GRACE_MS)
--
-- Idle (0 due) : 1 appel qui retourne 0 lignes — pas plus cher qu’un SELECT.
--
-- Ne regroupe PAS subscriptions / settings / daily / todo : peu de gain une fois
-- les dues connues, et ça complexifierait inutilement (push reste dans l’Edge).
--
-- Sécurité :
--   SECURITY DEFINER + search_path fixe
--   EXECUTE réservé à service_role (Edge avec SUPABASE_SERVICE_ROLE_KEY)
--   Ne PAS grant à anon / authenticated — jamais appeler depuis le frontend
--
-- Prérequis recommandé : scripts/index-scheduled-notifications-due.sql
-- Appliquer dans le SQL Editor Supabase (rôle postgres).
-- =============================================================================

-- DROP obligatoire si une ancienne version existait avec un autre type de retour
-- (CREATE OR REPLACE ne peut pas changer RETURNS …).
DROP FUNCTION IF EXISTS public.claim_due_scheduled_notifications(timestamptz);

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_notifications(
  p_now timestamptz DEFAULT now()
)
RETURNS SETOF public.scheduled_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT sn.id
    FROM public.scheduled_notifications AS sn
    WHERE sn.sent = false
      AND sn.scheduled_at <= p_now
    ORDER BY sn.scheduled_at ASC
    FOR UPDATE OF sn SKIP LOCKED
  )
  UPDATE public.scheduled_notifications AS sn
  SET sent = true
  FROM due
  WHERE sn.id = due.id
  RETURNING sn.*;
END;
$$;

COMMENT ON FUNCTION public.claim_due_scheduled_notifications(timestamptz) IS
  'Claim atomique des notifications dues (sent=false, scheduled_at<=p_now). '
  'Réservé service_role / Edge send-notification. Anti-doublon via SKIP LOCKED.';

REVOKE ALL ON FUNCTION public.claim_due_scheduled_notifications(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_scheduled_notifications(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.claim_due_scheduled_notifications(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_notifications(timestamptz) TO service_role;

-- Index dues (idempotent) — utile au SELECT FOR UPDATE
CREATE INDEX IF NOT EXISTS scheduled_notifications_due_pending_idx
  ON public.scheduled_notifications (scheduled_at)
  WHERE sent = false;

-- Test manuel (service role / SQL editor) :
-- SELECT id, kind, scheduled_at, sent
-- FROM public.claim_due_scheduled_notifications(now());
-- (attention : marque réellement sent=true)
