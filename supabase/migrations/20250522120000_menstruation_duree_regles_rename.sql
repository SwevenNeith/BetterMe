-- durée_règles → durée_règles_estimée + durée_règles_réelle

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menstruation_cycles_pilule'
      and column_name = 'durée_règles'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menstruation_cycles_pilule'
      and column_name = 'durée_règles_estimée'
  ) then
    alter table public.menstruation_cycles_pilule
      rename column "durée_règles" to "durée_règles_estimée";
  end if;
end $$;

alter table public.menstruation_cycles_pilule
  add column if not exists "durée_règles_réelle" integer;
