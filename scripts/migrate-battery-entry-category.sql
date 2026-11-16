-- Catégorie EDT mémorisée sur l’entrée Batterie (hobby hors catalogue, réel sans événement EDT).
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.battery_day_entries
  ADD COLUMN IF NOT EXISTS edt_category_id uuid NULL
  REFERENCES public.timetable_categories (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.battery_day_entries.edt_category_id IS
  'Catégorie EDT choisie à la saisie. Le réel hors catalogue n’a pas d’événement EDT : la couleur Hobbies (et les autres) en dépend.';

COMMIT;
