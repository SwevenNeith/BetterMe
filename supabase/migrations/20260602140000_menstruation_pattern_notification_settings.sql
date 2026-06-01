-- Réglages notifications des patterns menstruels

alter table public.settings
  add column if not exists menstruation_notify_patterns_simple boolean not null default true;

alter table public.settings
  add column if not exists menstruation_notify_patterns_intensite boolean not null default true;

alter table public.settings
  add column if not exists menstruation_notify_patterns_duree boolean not null default true;

alter table public.settings
  add column if not exists menstruation_notify_patterns_combine boolean not null default true;

alter table public.settings
  add column if not exists menstruation_pattern_notification_time text not null default '20:00';
