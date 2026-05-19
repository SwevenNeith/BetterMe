-- Type de notification planifiée (évite un marqueur dans body)
alter table public.scheduled_notifications
  add column if not exists kind text default 'ponctuel';

-- Anciens timers créés avec le marqueur dans body
update public.scheduled_notifications
set
  kind = 'timer',
  body = nullif(
    trim(
      regexp_replace(
        coalesce(body, ''),
        '^__betterme_kind:timer__\n?',
        '',
        'g'
      )
    ),
    ''
  )
where coalesce(body, '') like '__betterme_kind:timer__%'
  and (kind is null or kind = 'ponctuel');
