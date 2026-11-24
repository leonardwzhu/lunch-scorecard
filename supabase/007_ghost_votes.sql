-- Ghost votes: people who were out of the office can say how much they like that restaurant (1-5 biscuits).
-- Shown separately and never counted in the real score.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
-- Needs 002_out_of_office_and_rating_votes.sql and 005_out_of_office_lunch.sql to have been run first.

alter table public.absences
  add column if not exists ghost smallint check (ghost between 1 and 5);  -- empty = no ghost vote

-- Like "what I had", the page may change only this field on an out-of-office entry.
grant update (ghost) on public.absences to anon, authenticated;
