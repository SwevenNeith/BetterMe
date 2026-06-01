-- Si la table a été créée sans type_cycle / direction (script manuel)

alter table public.menstruation_patterns
  add column if not exists type_cycle text not null default 'naturel';

alter table public.menstruation_patterns
  drop constraint if exists menstruation_patterns_type_cycle_check;

alter table public.menstruation_patterns
  add constraint menstruation_patterns_type_cycle_check
  check (type_cycle in ('naturel', 'pilule'));

alter table public.menstruation_patterns
  add column if not exists direction text;

alter table public.menstruation_patterns
  drop constraint if exists menstruation_patterns_direction_check;

alter table public.menstruation_patterns
  add constraint menstruation_patterns_direction_check
  check (direction is null or direction in ('hausse', 'baisse'));
