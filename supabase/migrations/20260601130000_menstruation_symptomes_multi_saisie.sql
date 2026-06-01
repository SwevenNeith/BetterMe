-- Plusieurs saisies par jour ; douleurs_tête → maux_de_tête

drop index if exists public.idx_symptomes_user_date_unique;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menstruation_symptomes'
      and column_name = 'douleurs_tête'
  ) then
    alter table public.menstruation_symptomes
      rename column "douleurs_tête" to "maux_de_tête";
  end if;
end $$;

alter table public.menstruation_symptomes
  add column if not exists "maux_de_tête" integer check ("maux_de_tête" between 0 and 5);

alter table public.menstruation_symptomes
  drop constraint if exists menstruation_symptomes_douleurs_tête_check;

alter table public.menstruation_symptomes
  drop constraint if exists menstruation_symptomes_maux_de_tête_check;

alter table public.menstruation_symptomes
  add constraint menstruation_symptomes_maux_de_tête_check
  check ("maux_de_tête" between 0 and 5);
