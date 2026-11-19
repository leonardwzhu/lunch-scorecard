-- Logs who clicks "Help pay Leonard's rent". The page can add a click but can never read them back;
-- only the project owner sees them, in Table Editor → rent_clicks (or the rent_clicks_by_person view).
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.rent_clicks (
  id         bigint generated always as identity primary key,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text not null default '' check (char_length(voter_name) <= 40),
  clicked_at timestamptz not null default now()
);
create index if not exists rent_clicks_voter_time on public.rent_clicks (voter_id, clicked_at);

-- Keep the log readable: at most 30 clicks per person per day, and the time is always the server's.
create or replace function public.rent_clicks_check() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.rent_clicks c
      where c.voter_id = new.voter_id and c.clicked_at > now() - interval '1 day') >= 30 then
    return null; -- quietly skip extra clicks
  end if;
  new.clicked_at := now();
  return new;
end $$;

drop trigger if exists rent_clicks_check on public.rent_clicks;
create trigger rent_clicks_check before insert on public.rent_clicks
  for each row execute function public.rent_clicks_check();

alter table public.rent_clicks enable row level security;

-- The page may only add clicks: no reading, changing or deleting.
revoke all on public.rent_clicks from anon, authenticated;
grant insert on public.rent_clicks to anon, authenticated;
drop policy if exists "log rent clicks" on public.rent_clicks;
create policy "log rent clicks" on public.rent_clicks for insert with check (true);

-- A summary for you: one row per person, most clicks first. Hidden from the page as well.
create or replace view public.rent_clicks_by_person with (security_invoker = true) as
  select coalesce(nullif(max(voter_name), ''), '(no name)') as name,
         count(*)                                         as clicks,
         min(clicked_at)                                  as first_click,
         max(clicked_at)                                  as last_click
  from public.rent_clicks
  group by voter_id
  order by clicks desc;
revoke all on public.rent_clicks_by_person from anon, authenticated;
