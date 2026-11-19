-- Adds "I wasn't in the office" and up/down votes on people's ratings.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

-- People who were out of the office for a lunch: they can see results but not rate it.
create table if not exists public.absences (
  day        date not null,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text not null default '' check (char_length(voter_name) <= 40),
  created_at timestamptz not null default now(),
  primary key (day, voter_id)
);

-- Up (1) or down (-1) votes on someone's rating; 0 means the vote was taken back.
create table if not exists public.rating_votes (
  day            date not null,
  rated_voter_id text not null,
  voter_id       text not null check (char_length(voter_id) between 8 and 64),
  value          smallint not null check (value in (-1, 0, 1)),
  updated_at     timestamptz not null default now(),
  primary key (day, rated_voter_id, voter_id),
  foreign key (day, rated_voter_id) references public.votes (day, voter_id) on delete cascade,
  check (rated_voter_id <> voter_id)
);

-- A rating is refused if that person already said they were out of the office.
create or replace function public.votes_recent_day() returns trigger
language plpgsql as $$
begin
  if new.day > current_date + 1 or new.day < current_date - 8 then
    raise exception 'Voting is closed for %', new.day;
  end if;
  if exists (select 1 from public.absences a where a.day = new.day and a.voter_id = new.voter_id) then
    raise exception 'You marked yourself out of the office for %', new.day;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Saying you were out is refused if you already rated that lunch.
create or replace function public.absences_check() returns trigger
language plpgsql as $$
begin
  if new.day > current_date + 1 or new.day < current_date - 8 then
    raise exception 'Voting is closed for %', new.day;
  end if;
  if exists (select 1 from public.votes v where v.day = new.day and v.voter_id = new.voter_id) then
    raise exception 'You already rated the lunch on %', new.day;
  end if;
  return new;
end $$;

drop trigger if exists absences_check on public.absences;
create trigger absences_check before insert on public.absences
  for each row execute function public.absences_check();

create or replace function public.rating_votes_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rating_votes_touch on public.rating_votes;
create trigger rating_votes_touch before insert or update on public.rating_votes
  for each row execute function public.rating_votes_touch();

alter table public.absences     enable row level security;
alter table public.rating_votes enable row level security;

grant select, insert         on public.absences     to anon, authenticated;
grant select, insert, update on public.rating_votes to anon, authenticated;

drop policy if exists "read absences"     on public.absences;
drop policy if exists "write absences"    on public.absences;
drop policy if exists "read rating votes" on public.rating_votes;
drop policy if exists "write rating votes" on public.rating_votes;
drop policy if exists "edit rating votes" on public.rating_votes;

create policy "read absences"      on public.absences     for select using (true);
create policy "write absences"     on public.absences     for insert with check (true);
create policy "read rating votes"  on public.rating_votes for select using (true);
create policy "write rating votes" on public.rating_votes for insert with check (true);
create policy "edit rating votes"  on public.rating_votes for update using (true) with check (true);
-- No update on absences: once you say you were out, that's final (the owner can delete it in Table Editor).

do $$ begin
  alter publication supabase_realtime add table public.absences, public.rating_votes;
exception when duplicate_object then null; end $$;
