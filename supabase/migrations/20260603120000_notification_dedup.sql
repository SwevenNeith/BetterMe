-- Anti-doublons notifications : abonnements push + planifications en attente + claim atomique

-- 1) Dédupliquer push_subscriptions (garde la ligne la plus récente par user + endpoint)
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, (subscription->>'endpoint')
      order by id desc
    ) as rn
  from public.push_subscriptions
  where coalesce(subscription->>'endpoint', '') <> ''
)
delete from public.push_subscriptions p
using ranked r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists push_subscriptions_user_endpoint_uq
  on public.push_subscriptions (user_id, ((subscription->>'endpoint')))
  where coalesce(subscription->>'endpoint', '') <> '';

-- 2) Dédupliquer les planifications non envoyées (même user, kind, event, heure)
with ranked as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        coalesce(kind, ''),
        coalesce(event_id::text, ''),
        scheduled_at
      order by id desc
    ) as rn
  from public.scheduled_notifications
  where sent = false
)
delete from public.scheduled_notifications s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists scheduled_notifications_pending_uq
  on public.scheduled_notifications (
    user_id,
    coalesce(kind, ''),
    coalesce(event_id::text, ''),
    scheduled_at
  )
  where sent = false;

-- 3) Verrou global cron (évite 2 exécutions parallèles app + pg_cron)
create or replace function public.try_notification_cron_lock()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return pg_try_advisory_lock(9876543210);
end;
$$;

create or replace function public.release_notification_cron_lock()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return pg_advisory_unlock(9876543210);
end;
$$;

-- 4) Claim atomique des notifications dues (FOR UPDATE SKIP LOCKED)
create or replace function public.claim_due_scheduled_notifications(p_now timestamptz)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  kind text,
  event_id uuid,
  scheduled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select sn.id
    from public.scheduled_notifications sn
    where sn.sent = false
      and sn.scheduled_at <= p_now
    order by sn.scheduled_at asc
    for update skip locked
  ),
  claimed as (
    update public.scheduled_notifications sn
    set sent = true
    from due
    where sn.id = due.id
      and sn.sent = false
    returning sn.id, sn.user_id, sn.title, sn.body, sn.kind, sn.event_id, sn.scheduled_at
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.title,
    claimed.body,
    claimed.kind,
    claimed.event_id,
    claimed.scheduled_at
  from claimed;
end;
$$;

grant execute on function public.try_notification_cron_lock() to service_role;
grant execute on function public.release_notification_cron_lock() to service_role;
grant execute on function public.claim_due_scheduled_notifications(timestamptz) to service_role;
