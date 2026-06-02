-- Ajoute une contrainte d'unicité compatible upsert (on_conflict=user_id,date_jour)
-- et déduplique proprement les doublons existants.

-- 1) Déduplication robuste (garde la ligne la plus récente, sinon arbitrairement la plus grande id)
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, date_jour
      order by coalesce(updated_at, created_at) desc, id desc
    ) as rn
  from public.emotion_logs
)
delete from public.emotion_logs e
using ranked r
where e.id = r.id
  and r.rn > 1;

-- 2) Unicité (unique index suffit pour ON CONFLICT sur colonnes)
create unique index if not exists emotion_logs_user_id_date_jour_uq
  on public.emotion_logs (user_id, date_jour);

