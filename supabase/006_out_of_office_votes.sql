-- Up/down votes on what out-of-office people had for lunch (the same ▲ ▼ used on ratings).
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
-- Needs 002_out_of_office_and_rating_votes.sql and 005_out_of_office_lunch.sql to have been run first.

create table if not exists public.ooo_votes (
  day          date not null,
  ooo_voter_id text not null,                      -- whose out-of-office meal this is
  voter_id     text not null check (char_length(voter_id) between 8 and 64),  -- who voted
  voter_name   text not null default '' check (char_length(voter_name) <= 40),
  value        smallint not null check (value in (-1, 0, 1)),  -- 0 = vote taken back
  updated_at   timestamptz not null default now(),
  primary key (day, ooo_voter_id, voter_id),
  foreign key (day, ooo_voter_id) references public.absences (day, voter_id) on delete cascade,
  check (ooo_voter_id <> voter_id)                  -- no voting on your own meal
);

create or replace function public.ooo_votes_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ooo_votes_touch on public.ooo_votes;
create trigger ooo_votes_touch before insert or update on public.ooo_votes
  for each row execute function public.ooo_votes_touch();

alter table public.ooo_votes enable row level security;
grant select, insert, update on public.ooo_votes to anon, authenticated;
drop policy if exists "read ooo votes"   on public.ooo_votes;
drop policy if exists "add ooo votes"    on public.ooo_votes;
drop policy if exists "change ooo votes" on public.ooo_votes;
create policy "read ooo votes"   on public.ooo_votes for select using (true);
create policy "add ooo votes"    on public.ooo_votes for insert with check (true);
create policy "change ooo votes" on public.ooo_votes for update using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.ooo_votes;
exception when duplicate_object then null; end $$;
