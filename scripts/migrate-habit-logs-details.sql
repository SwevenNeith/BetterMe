-- Notes détaillées (HTML) par jour d'habitude
ALTER TABLE public.habit_logs
  ADD COLUMN IF NOT EXISTS details text;

COMMENT ON COLUMN public.habit_logs.details IS 'Note formatée du jour (HTML)';
