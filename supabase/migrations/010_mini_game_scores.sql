create table if not exists public.mini_game_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  max_level integer not null default 1 check (max_level >= 1),
  snack_count integer not null default 0 check (snack_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.mini_game_scores enable row level security;

drop policy if exists "mini_game_scores_select_authenticated" on public.mini_game_scores;
create policy "mini_game_scores_select_authenticated" on public.mini_game_scores
  for select to authenticated using (true);

drop policy if exists "mini_game_scores_insert_self" on public.mini_game_scores;
create policy "mini_game_scores_insert_self" on public.mini_game_scores
  for insert to authenticated with check (user_id = auth.uid());

create index if not exists idx_mini_game_scores_score
  on public.mini_game_scores (score desc, duration_seconds desc, created_at asc);

create index if not exists idx_mini_game_scores_user_created
  on public.mini_game_scores (user_id, created_at desc);
