-- Rappel quotidien : aucune promesse prévue pour le lendemain.
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS todo_promesse_reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS todo_promesse_reminder_time time NOT NULL DEFAULT '21:30:00';

COMMENT ON COLUMN public.settings.todo_promesse_reminder_enabled IS
  'Notification si aucune promesse TODO n''est prévue pour le lendemain.';

COMMENT ON COLUMN public.settings.todo_promesse_reminder_time IS
  'Heure d''envoi du rappel promesses (fuseau Europe/Paris). L''envoi passe par scheduled_notifications (kind todo_promesse_reminder).';

-- Si la colonne last_sent existait d''une version antérieure :
ALTER TABLE public.settings
  DROP COLUMN IF EXISTS todo_promesse_reminder_last_sent;
