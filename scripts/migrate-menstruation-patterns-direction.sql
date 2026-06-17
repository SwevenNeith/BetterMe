-- Ajoute la colonne direction pour les patterns d'intensité / durée.
-- À exécuter dans l'éditeur SQL Supabase si l'app signale PGRST204 sur direction.

alter table public.menstruation_patterns
  add column if not exists direction text check (direction in ('hausse', 'baisse'));
