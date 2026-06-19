-- Sépare début de règles estimé / réel sur menstruation_cycles_naturel (comme le mode pilule).
-- À exécuter dans l'éditeur SQL Supabase.

alter table public.menstruation_cycles_naturel
  add column if not exists date_début_règles_réelle date;

-- Les lignes avec une fin réelle ont un début saisi comme date réelle.
update public.menstruation_cycles_naturel
set date_début_règles_réelle = date_début_règles
where date_fin_règles_réelle is not null
  and date_début_règles is not null
  and date_début_règles_réelle is null;

alter table public.menstruation_cycles_naturel
  rename column date_début_règles to date_début_règles_estimée;

comment on column public.menstruation_cycles_naturel.date_début_règles_estimée is
  'Date estimée de début des règles (prévisions, chaînage des cycles).';
comment on column public.menstruation_cycles_naturel.date_début_règles_réelle is
  'Date réelle de début des règles (saisie utilisateur). Les calculs utilisent la réelle si présente, sinon l''estimée.';
