-- Évite d'envoyer deux fois le même rappel quotidien si le cron tourne plusieurs fois la même minute
alter table public.daily_reminders
  add column if not exists last_sent_on date;
