-- Lunch Scorecard database setup.
-- Run this once in Supabase: SQL Editor → New query → paste → Run.

create table if not exists public.days (
  day        date primary key,
  lunch      text not null check (char_length(lunch) between 1 and 80),
  updated_at timestamptz not null default now()
);

create table if not exists public.votes (
  day        date not null,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text not null default '' check (char_length(voter_name) <= 40),
  stars      smallint not null check (stars between 1 and 5),
  comment    text not null default '' check (char_length(comment) <= 200),
  updated_at timestamptz not null default now(),
  primary key (day, voter_id)
);

-- Votes are only accepted for the last 7 days (no future days).
-- The extra day of slack covers time zones ahead of the database's UTC clock.
create or replace function public.votes_recent_day() returns trigger
language plpgsql as $$
begin
  if new.day > current_date + 1 or new.day < current_date - 8 then
    raise exception 'Voting is closed for %', new.day;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists votes_recent_day on public.votes;
create trigger votes_recent_day before insert or update on public.votes
  for each row execute function public.votes_recent_day();

alter table public.days  enable row level security;
alter table public.votes enable row level security;

-- Let the page's public key use the tables (newer projects don't grant this by default).
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.days, public.votes to anon, authenticated;

-- Anyone with the link can read results, name a lunch and rate it.
-- There's no login: each browser gets a random voter id that the page keeps.
drop policy if exists "read days"   on public.days;
drop policy if exists "write days"  on public.days;
drop policy if exists "edit days"   on public.days;
drop policy if exists "read votes"  on public.votes;
drop policy if exists "write votes" on public.votes;
drop policy if exists "edit votes"  on public.votes;

create policy "read days"   on public.days  for select using (true);
create policy "write days"  on public.days  for insert with check (true);
create policy "edit days"   on public.days  for update using (true) with check (true);
create policy "read votes"  on public.votes for select using (true);
create policy "write votes" on public.votes for insert with check (true);
create policy "edit votes"  on public.votes for update using (true) with check (true);
-- No delete policy: to remove a vote, use the Supabase Table Editor.

-- Live updates, so results refresh while the page is open.
do $$ begin
  alter publication supabase_realtime add table public.days, public.votes;
exception when duplicate_object then null; end $$;
