-- Fréquence « Cette semaine » : objectif unique pour une semaine (pas chaque jour).
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE public.todo_items
  DROP CONSTRAINT IF EXISTS todo_items_frequence_check;

ALTER TABLE public.todo_items
  ADD CONSTRAINT todo_items_frequence_check CHECK (
    frequence IN ('quotidien', 'ponctuel', 'hebdomadaire', 'semaine')
  );

COMMENT ON COLUMN public.todo_items.date_echeance IS
  'Ponctuel = jour unique ; quotidien/hebdomadaire = à partir de ce jour ; semaine = lundi de la semaine cible.';
