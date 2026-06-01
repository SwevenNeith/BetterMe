-- Patterns de symptômes détectés

create table if not exists public.menstruation_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type_cycle text not null default 'naturel' check (type_cycle in ('naturel', 'pilule')),
  type_pattern text not null check (type_pattern in ('simple', 'intensité', 'durée', 'combiné')),
  symptôme text,
  cluster text,
  jour_relatif_début integer,
  jour_relatif_fin integer,
  intensité_moyenne double precision,
  durée_moyenne double precision,
  direction text check (direction in ('hausse', 'baisse')),
  cycles_détectés integer not null,
  cycles_total integer not null,
  ratio_répétition double precision not null,
  actif boolean not null default true,
  dernière_maj date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patterns_user_id on public.menstruation_patterns (user_id);
create index if not exists idx_patterns_user_type on public.menstruation_patterns (user_id, type_cycle);

alter table public.menstruation_patterns enable row level security;

drop policy if exists "utilisatrice voit ses patterns" on public.menstruation_patterns;
create policy "utilisatrice voit ses patterns"
  on public.menstruation_patterns
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trigger_updated_at_patterns on public.menstruation_patterns;
create trigger trigger_updated_at_patterns
  before update on public.menstruation_patterns
  for each row
  execute function public.update_updated_at();
