-- Profil / cycles menstruels (pilule)

create table if not exists public.menstruation_cycles_pilule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  "numéro_cycle" integer,
  "date_début_plaquette" date,
  "date_fin_comprimés_actifs" date,
  "date_prochaine_plaquette" date,
  "date_début_règles_réelle" date,
  "date_début_règles_estimée" date,
  "date_fin_règles_réelle" date,
  "date_fin_règles_estimée" date,
  "date_début_spm_estimée" date,
  "date_fin_spm_estimée" date,
  "durée_cycle" integer,
  "durée_règles_estimée" integer,
  "durée_règles_réelle" integer,
  "délai_règles" integer,
  "durée_spm_estimée" integer,
  "durée_spm_réelle" integer,
  created_at timestamptz not null default now()
);

alter table public.menstruation_cycles_pilule
  add column if not exists "numéro_cycle" integer;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_début_plaquette" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_fin_comprimés_actifs" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_prochaine_plaquette" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_début_règles_réelle" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_début_règles_estimée" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_fin_règles_réelle" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_fin_règles_estimée" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_début_spm_estimée" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "date_fin_spm_estimée" date;
alter table public.menstruation_cycles_pilule
  add column if not exists "durée_cycle" integer;
alter table public.menstruation_cycles_pilule
  add column if not exists "durée_règles_estimée" integer;
alter table public.menstruation_cycles_pilule
  add column if not exists "durée_règles_réelle" integer;
alter table public.menstruation_cycles_pilule
  add column if not exists "délai_règles" integer;
alter table public.menstruation_cycles_pilule
  add column if not exists "durée_spm_estimée" integer;
alter table public.menstruation_cycles_pilule
  add column if not exists "durée_spm_réelle" integer;

create index if not exists menstruation_cycles_pilule_user_id_idx
  on public.menstruation_cycles_pilule (user_id);

create unique index if not exists menstruation_cycles_pilule_user_cycle_unique
  on public.menstruation_cycles_pilule (user_id, "numéro_cycle");

alter table public.menstruation_cycles_pilule enable row level security;

drop policy if exists "menstruation_cycles_pilule_select_own" on public.menstruation_cycles_pilule;
drop policy if exists "menstruation_cycles_pilule_insert_own" on public.menstruation_cycles_pilule;
drop policy if exists "menstruation_cycles_pilule_update_own" on public.menstruation_cycles_pilule;
drop policy if exists "menstruation_cycles_pilule_delete_own" on public.menstruation_cycles_pilule;

create policy "menstruation_cycles_pilule_select_own"
  on public.menstruation_cycles_pilule for select
  to authenticated
  using (auth.uid() = user_id);

create policy "menstruation_cycles_pilule_insert_own"
  on public.menstruation_cycles_pilule for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "menstruation_cycles_pilule_update_own"
  on public.menstruation_cycles_pilule for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "menstruation_cycles_pilule_delete_own"
  on public.menstruation_cycles_pilule for delete
  to authenticated
  using (auth.uid() = user_id);
