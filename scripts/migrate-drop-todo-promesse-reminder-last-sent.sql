-- Supprime la colonne anti-doublon devenue inutile (scheduled_notifications gère l’envoi).
-- À exécuter dans l'éditeur SQL Supabase après migrate-settings-todo-promesse-reminder.sql.

ALTER TABLE public.settings
  DROP COLUMN IF EXISTS todo_promesse_reminder_last_sent;
