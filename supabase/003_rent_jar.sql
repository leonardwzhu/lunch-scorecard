-- The joke rent jar: each row is one cookie someone chipped in. No real money involved.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.rent_tips (
  id         bigint generated always as identity primary key,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text not null default '' check (char_length(voter_name) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists rent_tips_voter_day on public.rent_tips (voter_id, created_at);

-- At most 20 cookies per person per day, so nobody can fill the jar with a script.
create or replace function public.rent_tips_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.rent_tips t
      where t.voter_id = new.voter_id and t.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Daily cookie limit reached';
  end if;
  new.created_at := now();
  return new;
end $$;

drop trigger if exists rent_tips_limit on public.rent_tips;
create trigger rent_tips_limit before insert on public.rent_tips
  for each row execute function public.rent_tips_limit();

alter table public.rent_tips enable row level security;
grant select, insert on public.rent_tips to anon, authenticated;

drop policy if exists "read rent tips"  on public.rent_tips;
drop policy if exists "write rent tips" on public.rent_tips;
create policy "read rent tips"  on public.rent_tips for select using (true);
create policy "write rent tips" on public.rent_tips for insert with check (true);

do $$ begin
  alter publication supabase_realtime add table public.rent_tips;
exception when duplicate_object then null; end $$;
