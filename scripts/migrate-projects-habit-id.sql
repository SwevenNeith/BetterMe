-- Lien optionnel d'un projet vers une habitude active.
-- La quantité cible des étapes / sous-étapes devient alors dynamique :
-- 80 % de la progression de l'habitude sur la période de réinitialisation (jour / semaine / mois).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS habit_id uuid REFERENCES public.habits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_habit_id_idx
  ON public.projects (habit_id)
  WHERE habit_id IS NOT NULL;

COMMENT ON COLUMN public.projects.habit_id IS
  'Habitude liée : la quantité des étapes = 80 % de la progression habit selon reset_periode';
