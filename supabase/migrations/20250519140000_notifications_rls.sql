-- Politiques RLS pour les notifications push (à exécuter dans Supabase si les INSERT échouent encore)

-- push_subscriptions : colonne subscription (jsonb) uniquement
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_authenticated" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_authenticated" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_authenticated" on public.push_subscriptions;

create policy "push_subscriptions_select_authenticated"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_authenticated"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions_update_authenticated"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_authenticated"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

-- scheduled_notifications
alter table public.scheduled_notifications enable row level security;

drop policy if exists "scheduled_notifications_insert_authenticated" on public.scheduled_notifications;

create policy "scheduled_notifications_insert_authenticated"
  on public.scheduled_notifications for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "scheduled_notifications_select_authenticated"
  on public.scheduled_notifications for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "scheduled_notifications_delete_authenticated" on public.scheduled_notifications;

create policy "scheduled_notifications_delete_authenticated"
  on public.scheduled_notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- daily_reminders
alter table public.daily_reminders enable row level security;

drop policy if exists "daily_reminders_insert_authenticated" on public.daily_reminders;

create policy "daily_reminders_insert_authenticated"
  on public.daily_reminders for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "daily_reminders_select_authenticated"
  on public.daily_reminders for select
  to authenticated
  using (auth.uid() = user_id);

create policy "daily_reminders_update_authenticated"
  on public.daily_reminders for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "daily_reminders_delete_authenticated" on public.daily_reminders;

create policy "daily_reminders_delete_authenticated"
  on public.daily_reminders for delete
  to authenticated
  using (auth.uid() = user_id);
