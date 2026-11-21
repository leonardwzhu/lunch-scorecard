-- Lets people who were out of the office share what they had for lunch instead.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
-- Needs 002_out_of_office_and_rating_votes.sql to have been run first.

alter table public.absences
  add column if not exists ate text not null default '' check (char_length(ate) <= 120);

-- The page may change only this one field on an out-of-office entry, nothing else.
grant update (ate) on public.absences to anon, authenticated;
drop policy if exists "edit what I ate" on public.absences;
create policy "edit what I ate" on public.absences for update using (true) with check (true);
