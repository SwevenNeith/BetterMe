-- Fix RLS policies for emotion_logs (insert/update need WITH CHECK)

alter table public.emotion_logs enable row level security;

drop policy if exists "utilisatrice voit ses logs émotions" on public.emotion_logs;

drop policy if exists "emotion_logs_select_own" on public.emotion_logs;
create policy "emotion_logs_select_own"
  on public.emotion_logs
  for select
  using (auth.uid() = user_id);

drop policy if exists "emotion_logs_insert_own" on public.emotion_logs;
create policy "emotion_logs_insert_own"
  on public.emotion_logs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "emotion_logs_update_own" on public.emotion_logs;
create policy "emotion_logs_update_own"
  on public.emotion_logs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "emotion_logs_delete_own" on public.emotion_logs;
create policy "emotion_logs_delete_own"
  on public.emotion_logs
  for delete
  using (auth.uid() = user_id);

