-- Biscuit Bets: a daily over/under game played with pretend biscuits. No real money.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
-- Needs schema.sql and 002_out_of_office_and_rating_votes.sql to have been run first.

create table if not exists public.bets (
  day        date not null,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text not null default '' check (char_length(voter_name) <= 40),
  side       text not null check (side in ('over', 'under')),
  amount     int  not null check (amount between 5 and 100),
  line       numeric(2,1) not null check (line between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (day, voter_id)
);

-- Bets close for you once you've seen the results (rated it or marked yourself out),
-- and only lunches from the past week can be bet on.
create or replace function public.bets_check() returns trigger
language plpgsql as $$
begin
  if new.day > current_date + 1 or new.day < current_date - 8 then
    raise exception 'Betting is closed for %', new.day;
  end if;
  if exists (select 1 from public.votes v where v.day = new.day and v.voter_id = new.voter_id)
     or exists (select 1 from public.absences a where a.day = new.day and a.voter_id = new.voter_id) then
    raise exception 'Bets close once you have rated or marked yourself out';
  end if;
  new.created_at := now();
  return new;
end $$;

drop trigger if exists bets_check on public.bets;
create trigger bets_check before insert or update on public.bets
  for each row execute function public.bets_check();

alter table public.bets enable row level security;
grant select, insert, update on public.bets to anon, authenticated;
drop policy if exists "read bets"  on public.bets;
drop policy if exists "place bets" on public.bets;
drop policy if exists "change bets" on public.bets;
create policy "read bets"   on public.bets for select using (true);
create policy "place bets"  on public.bets for insert with check (true);
create policy "change bets" on public.bets for update using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.bets;
exception when duplicate_object then null; end $$;
