-- Mode menstruation actif (pilule / naturel), synchronisé entre appareils.
-- À exécuter dans l'éditeur SQL Supabase.

alter table public.settings
  add column if not exists menstruation_cycle_mode text
  check (menstruation_cycle_mode in ('pilule', 'naturel'));

comment on column public.settings.menstruation_cycle_mode is
  'Mode de suivi menstruation actif pour l''utilisateur (pilule ou naturel).';
