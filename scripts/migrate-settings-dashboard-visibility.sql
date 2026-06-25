-- Visibilité des blocs du Dashboard (Réglages → Visibilité → Dashboard).
-- À exécuter dans l'éditeur SQL Supabase.

alter table public.settings
  add column if not exists dashboard_visibility jsonb not null default '{}'::jsonb;

comment on column public.settings.dashboard_visibility is
  'Par bloc dashboard (clé = id stable) : { "visible": bool }. Vide = tout visible.';
