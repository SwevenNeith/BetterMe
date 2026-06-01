alter table public.menstruation_symptomes
  add column if not exists jour_relatif integer;

create index if not exists idx_symptomes_jour_relatif
  on public.menstruation_symptomes (user_id, cycle_id, jour_relatif);
