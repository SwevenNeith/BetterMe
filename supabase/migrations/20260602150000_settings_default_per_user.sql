-- Ligne settings par utilisatrice (notifications activées par défaut)

create or replace function public.create_default_settings_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_settings on auth.users;
create trigger on_auth_user_created_settings
  after insert on auth.users
  for each row
  execute function public.create_default_settings_for_user();

-- Comptes déjà existants sans réglages
insert into public.settings (user_id)
select u.id
from auth.users u
where not exists (
  select 1 from public.settings s where s.user_id = u.id
);
