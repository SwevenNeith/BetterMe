-- Renomme durée_spm → durée_spm_estimée et ajoute durée_spm_réelle + colonnes de projection

alter table public.menstruation_cycles_pilule
  rename column "durée_spm" to "durée_spm_estimée";

alter table public.menstruation_cycles_pilule
  add column if not exists "durée_spm_réelle" integer;

alter table public.menstruation_cycles_pilule
  add column if not exists "délai_règles" integer;

alter table public.menstruation_cycles_pilule
  add column if not exists "date_début_règles_estimée" date;
