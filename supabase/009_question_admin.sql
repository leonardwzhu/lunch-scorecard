-- Private "Add a question" tools for the owner.
-- Questions live in a table everyone can read; only someone holding the secret key can add, change or
-- delete them. Running this shows your private link at the bottom of the results.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again (the key stays the same).
-- Needs 008_question_of_the_day.sql for people to answer.

create table if not exists public.questions (
  day        date primary key,
  question   text not null check (char_length(question) between 3 and 200),
  updated_at timestamptz not null default now()
);
alter table public.questions enable row level security;
revoke all on public.questions from anon, authenticated;
grant select on public.questions to anon, authenticated;
drop policy if exists "read questions" on public.questions;
create policy "read questions" on public.questions for select using (true);

-- The secret key. Nobody can read this table through the site; only the functions below use it.
create table if not exists public.admin_secret (
  id    int primary key check (id = 1),
  token text not null
);
alter table public.admin_secret enable row level security;
revoke all on public.admin_secret from anon, authenticated;
insert into public.admin_secret (id, token)
  values (1, md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
  on conflict (id) do nothing;

create or replace function public.is_admin(token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_secret s where s.token = is_admin.token);
$$;

create or replace function public.set_question(token text, d date, q text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(token) then raise exception 'Not allowed'; end if;
  insert into public.questions (day, question, updated_at) values (d, btrim(q), now())
    on conflict (day) do update set question = excluded.question, updated_at = now();
end $$;

create or replace function public.delete_question(token text, d date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(token) then raise exception 'Not allowed'; end if;
  delete from public.questions where day = d;
end $$;

revoke all on function public.is_admin(text), public.set_question(text, date, text), public.delete_question(text, date) from public;
grant execute on function public.is_admin(text), public.set_question(text, date, text), public.delete_question(text, date) to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.questions;
exception when duplicate_object then null; end $$;

-- Your private link. Open it once on your laptop; keep it to yourself.
select 'https://leonardwzhu.github.io/lunch-scorecard/#admin=' || token as your_private_link from public.admin_secret;
