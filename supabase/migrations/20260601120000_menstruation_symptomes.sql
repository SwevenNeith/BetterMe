-- Symptômes menstruels (pilule + naturel, une ligne par jour et par utilisatrice)

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.menstruation_symptomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_id uuid not null,
  type_cycle text not null check (type_cycle in ('naturel', 'pilule')),
  date_jour date not null,
  phase text not null,

  flux integer check (flux between 1 and 4),
  couleur_flux text check (couleur_flux in ('rouge_vif', 'bordeaux', 'brun', 'rosé')),
  caillots boolean,

  douleurs_crampes integer check (douleurs_crampes between 0 and 5),
  douleurs_dos integer check (douleurs_dos between 0 and 5),
  "maux_de_tête" integer check ("maux_de_tête" between 0 and 5),
  douleur_ovulation boolean,
  "côté_ovulation" text check ("côté_ovulation" in ('gauche', 'droit')),

  humeur integer check (humeur between 1 and 5),
  irritabilité integer check (irritabilité between 0 and 5),
  anxiété integer check (anxiété between 0 and 5),
  tristesse integer check (tristesse between 0 and 5),
  pleurs boolean,
  brain_fog integer check (brain_fog between 0 and 5),

  fatigue integer check (fatigue between 0 and 5),
  énergie integer check (énergie between 0 and 5),
  nausées integer check (nausées between 0 and 5),
  ballonnements integer check (ballonnements between 0 and 5),
  "sensibilité_seins" integer check ("sensibilité_seins" between 0 and 5),
  "rétention_eau" integer check ("rétention_eau" between 0 and 5),
  sommeil integer check (sommeil between 0 and 5),

  libido integer check (libido between 0 and 3),
  acné integer check (acné between 0 and 3),
  peau text check (peau in ('terne', 'normale', 'lumineuse')),
  fringales boolean,
  pertes_vaginales text check (
    pertes_vaginales in ('absentes', 'blanches', 'crémeuses', 'filantes', 'transparentes')
  ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

);

create index if not exists idx_symptomes_user_id on public.menstruation_symptomes (user_id);
create index if not exists idx_symptomes_cycle_id on public.menstruation_symptomes (cycle_id);
create index if not exists idx_symptomes_date on public.menstruation_symptomes (user_id, date_jour);

drop trigger if exists trigger_updated_at_symptomes on public.menstruation_symptomes;
create trigger trigger_updated_at_symptomes
  before update on public.menstruation_symptomes
  for each row
  execute function public.update_updated_at();

alter table public.menstruation_symptomes enable row level security;

drop policy if exists "utilisatrice voit ses symptômes" on public.menstruation_symptomes;
create policy "utilisatrice voit ses symptômes"
  on public.menstruation_symptomes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
