-- Logs who clicks "Help pay Leonard's rent": at most one click per person per day.
-- The page can add a click but can never read them back; only the project owner sees them,
-- in Table Editor → rent_clicks, or with:  select * from rent_clicks_by_person;
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.rent_clicks (
  id         bigint generated always as identity primary key,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text not null default '' check (char_length(voter_name) <= 40),
  click_day  date not null default current_date,  -- the clicker's own calendar day
  clicked_at timestamptz not null default now()
);
alter table public.rent_clicks add column if not exists click_day date not null default current_date;
drop index if exists public.rent_clicks_voter_time;
create unique index if not exists rent_clicks_one_per_day on public.rent_clicks (voter_id, click_day);

-- One click per person per day: later clicks that day are quietly skipped.
-- SECURITY DEFINER so this check can look at earlier clicks even though the page itself can't read the table.
create or replace function public.rent_clicks_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.click_day is null or new.click_day > current_date + 1 or new.click_day < current_date - 1 then
    new.click_day := current_date;
  end if;
  if exists (select 1 from public.rent_clicks c where c.voter_id = new.voter_id and c.click_day = new.click_day) then
    return null;
  end if;
  new.clicked_at := now();
  return new;
end $$;
revoke all on function public.rent_clicks_check() from public, anon, authenticated;

drop trigger if exists rent_clicks_check on public.rent_clicks;
create trigger rent_clicks_check before insert on public.rent_clicks
  for each row execute function public.rent_clicks_check();

alter table public.rent_clicks enable row level security;

-- The page may only add clicks: no reading, changing or deleting.
revoke all on public.rent_clicks from anon, authenticated;
grant insert on public.rent_clicks to anon, authenticated;
drop policy if exists "log rent clicks" on public.rent_clicks;
create policy "log rent clicks" on public.rent_clicks for insert with check (true);

-- A summary for you: one row per person, most days clicked first. Hidden from the page as well.
drop view if exists public.rent_clicks_by_person;
create view public.rent_clicks_by_person with (security_invoker = true) as
  select coalesce(nullif(max(voter_name), ''), '(no name)') as name,
         count(*)                                         as days_clicked,
         min(click_day)                                   as first_day,
         max(click_day)                                   as last_day
  from public.rent_clicks
  group by voter_id
  order by days_clicked desc, last_day desc;
revoke all on public.rent_clicks_by_person from anon, authenticated;
