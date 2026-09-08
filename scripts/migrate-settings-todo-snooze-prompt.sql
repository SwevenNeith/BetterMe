-- Formulaire « report TODO du matin » : 1×/jour/compte + tâches ignorées.
-- Exécute dans le SQL Editor Supabase.

BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS todo_snooze_prompt_date text;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS todo_snooze_dismissed jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.settings.todo_snooze_prompt_date IS
  'Date locale (YYYY-MM-DD) du dernier affichage du formulaire de report TODO (partagé multi-appareils).';

COMMENT ON COLUMN public.settings.todo_snooze_dismissed IS
  'Candidats ignorés du formulaire matin : [{ "id": "<todo_id>", "source": "YYYY-MM-DD" }, ...].';

COMMIT;
