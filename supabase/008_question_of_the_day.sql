-- "Question of the day": a one-off question (set in config.js → questions) that everyone can answer.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.answers (
  day        date not null,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text not null default '' check (char_length(voter_name) <= 40),
  answer     text not null check (char_length(answer) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (day, voter_id)
);

create or replace function public.answers_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists answers_touch on public.answers;
create trigger answers_touch before insert or update on public.answers
  for each row execute function public.answers_touch();

alter table public.answers enable row level security;
grant select, insert, update on public.answers to anon, authenticated;
drop policy if exists "read answers"   on public.answers;
drop policy if exists "add answers"    on public.answers;
drop policy if exists "change answers" on public.answers;
create policy "read answers"   on public.answers for select using (true);
create policy "add answers"    on public.answers for insert with check (true);
create policy "change answers" on public.answers for update using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.answers;
exception when duplicate_object then null; end $$;
