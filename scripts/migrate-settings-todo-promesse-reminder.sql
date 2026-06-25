-- Rappel quotidien : aucune promesse prévue pour le lendemain.
-- À exécuter dans l'éditeur SQL Supabase.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS todo_promesse_reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS todo_promesse_reminder_time time NOT NULL DEFAULT '21:30:00',
  ADD COLUMN IF NOT EXISTS todo_promesse_reminder_last_sent date;

COMMENT ON COLUMN public.settings.todo_promesse_reminder_enabled IS
  'Notification si aucune promesse TODO n''est prévue pour le lendemain.';

COMMENT ON COLUMN public.settings.todo_promesse_reminder_time IS
  'Heure d''envoi du rappel promesses (fuseau Europe/Paris, côté cron).';

COMMENT ON COLUMN public.settings.todo_promesse_reminder_last_sent IS
  'Dernière date (Paris) d''envoi du rappel promesses, pour éviter les doublons.';
