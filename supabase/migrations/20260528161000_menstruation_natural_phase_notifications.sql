-- Ajout des réglages de notifications pour les phases du cycle naturel

alter table public.settings
  add column if not exists menstruation_notify_phase_folliculaire boolean not null default true,
  add column if not exists menstruation_notify_phase_ovulatoire boolean not null default true,
  add column if not exists menstruation_notify_phase_luteale boolean not null default true;

