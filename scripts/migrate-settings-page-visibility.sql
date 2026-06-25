-- Visibilité et libellés personnalisés des pages principales (sidebar).
-- À exécuter dans l'éditeur SQL Supabase.

alter table public.settings
  add column if not exists page_visibility jsonb not null default '{}'::jsonb;

comment on column public.settings.page_visibility is
  'Par page (clé = id stable) : { "visible": bool, "label": string|null }. Vide = tout visible, libellé par défaut.';
