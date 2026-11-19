-- Sign-in with work email: every rating belongs to a real account, so it follows people to any laptop or phone.
-- After this runs:
--   * only signed-in people can rate, name lunches, mark themselves out or up/down vote
--   * nobody can change anyone else's rating
--   * other people's ratings for a day stay hidden until you've rated it or said you were out
--     (once a lunch's week-long voting window closes, anyone can see it)
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
-- Needs schema.sql and 002_out_of_office_and_rating_votes.sql to have been run first.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Has the signed-in person rated this day or said they were out?
create or replace function public.has_acted(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.votes    v where v.day = d and v.voter_id = auth.uid()::text) or
    exists (select 1 from public.absences a where a.day = d and a.voter_id = auth.uid()::text));
$$;

-- Can the signed-in person see everyone's ratings for this day?
create or replace function public.results_visible(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select d < current_date - 7 or public.has_acted(d);
$$;

-- How many people rated / were out each day. Lets the page say "5 coworkers have rated this"
-- without revealing the ratings themselves.
create or replace function public.vote_counts(since date) returns table (day date, ratings int, outs int)
language sql stable security definer set search_path = public as $$
  select x.day, sum(x.r)::int, sum(x.o)::int from (
    select v.day, 1 as r, 0 as o from public.votes v where v.day >= since
    union all
    select a.day, 0, 1 from public.absences a where a.day >= since
  ) x group by x.day;
$$;

revoke all on function public.has_acted(date), public.results_visible(date), public.vote_counts(date) from public;
grant execute on function public.has_acted(date), public.results_visible(date), public.vote_counts(date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------

-- Moving old ratings into an account changes voter_id, so let that pass through the
-- voting-window check and carry over to up/down votes.
create or replace function public.votes_recent_day() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.day = old.day and new.stars = old.stars and new.comment = old.comment
     and new.voter_name = old.voter_name then
    return new; -- only the owner changed (an account claiming its old ratings)
  end if;
  if new.day > current_date + 1 or new.day < current_date - 8 then
    raise exception 'Voting is closed for %', new.day;
  end if;
  if exists (select 1 from public.absences a where a.day = new.day and a.voter_id = new.voter_id) then
    raise exception 'You marked yourself out of the office for %', new.day;
  end if;
  new.updated_at := now();
  return new;
end $$;

alter table public.rating_votes drop constraint if exists rating_votes_day_rated_voter_id_fkey;
alter table public.rating_votes add constraint rating_votes_day_rated_voter_id_fkey
  foreign key (day, rated_voter_id) references public.votes (day, voter_id) on delete cascade on update cascade;

revoke all on public.votes from anon, authenticated;
grant select on public.votes to anon, authenticated;
grant insert, update on public.votes to authenticated;
drop policy if exists "read votes"      on public.votes;
drop policy if exists "write votes"     on public.votes;
drop policy if exists "edit votes"      on public.votes;
drop policy if exists "write own vote"  on public.votes;
drop policy if exists "edit own vote"   on public.votes;
create policy "read votes"     on public.votes for select using (voter_id = auth.uid()::text or public.results_visible(day));
create policy "write own vote" on public.votes for insert to authenticated with check (voter_id = auth.uid()::text);
create policy "edit own vote"  on public.votes for update to authenticated
  using (voter_id = auth.uid()::text) with check (voter_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Out of office
-- ---------------------------------------------------------------------------
revoke all on public.absences from anon, authenticated;
grant select on public.absences to anon, authenticated;
grant insert on public.absences to authenticated;
drop policy if exists "read absences"     on public.absences;
drop policy if exists "write absences"    on public.absences;
drop policy if exists "write own absence" on public.absences;
create policy "read absences"     on public.absences for select using (true);
create policy "write own absence" on public.absences for insert to authenticated with check (voter_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Up/down votes on ratings
-- ---------------------------------------------------------------------------
revoke all on public.rating_votes from anon, authenticated;
grant select on public.rating_votes to anon, authenticated;
grant insert, update on public.rating_votes to authenticated;
drop policy if exists "read rating votes"      on public.rating_votes;
drop policy if exists "write rating votes"     on public.rating_votes;
drop policy if exists "edit rating votes"      on public.rating_votes;
drop policy if exists "write own rating vote"  on public.rating_votes;
drop policy if exists "edit own rating vote"   on public.rating_votes;
create policy "read rating votes"     on public.rating_votes for select using (public.results_visible(day));
create policy "write own rating vote" on public.rating_votes for insert to authenticated
  with check (voter_id = auth.uid()::text and public.results_visible(day));
create policy "edit own rating vote"  on public.rating_votes for update to authenticated
  using (voter_id = auth.uid()::text) with check (voter_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Lunch names: anyone can read, signed-in people can set them
-- ---------------------------------------------------------------------------
revoke all on public.days from anon, authenticated;
grant select on public.days to anon, authenticated;
grant insert, update on public.days to authenticated;
drop policy if exists "read days"  on public.days;
drop policy if exists "write days" on public.days;
drop policy if exists "edit days"  on public.days;
create policy "read days"  on public.days for select using (true);
create policy "write days" on public.days for insert to authenticated with check (true);
create policy "edit days"  on public.days for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Rent button clicks (only if 003_rent_clicks.sql was run)
-- ---------------------------------------------------------------------------
do $$ begin
  if to_regclass('public.rent_clicks') is not null then
    revoke all on public.rent_clicks from anon, authenticated;
    grant insert on public.rent_clicks to authenticated;
    drop policy if exists "log rent clicks" on public.rent_clicks;
    create policy "log rent clicks" on public.rent_clicks for insert to authenticated with check (voter_id = auth.uid()::text);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Moving a browser's old ratings into an account
-- ---------------------------------------------------------------------------
-- Before sign-in existed, each browser had its own random id. The first time someone signs in on
-- a laptop, the page hands over that laptop's old id and everything it did moves into the account.
-- Each old id can only be claimed once.
create table if not exists public.claimed_voter_ids (
  old_id     text primary key,
  user_id    uuid not null,
  claimed_at timestamptz not null default now()
);
alter table public.claimed_voter_ids enable row level security;
revoke all on public.claimed_voter_ids from anon, authenticated;

create or replace function public.claim_voter_id(old_id text) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid   text := auth.uid()::text;
  moved int  := 0;
  n     int;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if old_id is null or old_id = uid or char_length(old_id) not between 8 and 64 then return 0; end if;
  if exists (select 1 from public.claimed_voter_ids c where c.old_id = claim_voter_id.old_id) then return 0; end if;
  if exists (select 1 from auth.users u where u.id::text = claim_voter_id.old_id) then return 0; end if;
  insert into public.claimed_voter_ids (old_id, user_id) values (claim_voter_id.old_id, auth.uid());

  -- Up/down votes: drop ones that would collide or become votes on your own rating.
  delete from public.rating_votes r where r.voter_id = uid and r.rated_voter_id = claim_voter_id.old_id;
  delete from public.rating_votes r where r.voter_id = claim_voter_id.old_id
    and (r.rated_voter_id = uid or exists (select 1 from public.rating_votes m
         where m.voter_id = uid and m.day = r.day and m.rated_voter_id = r.rated_voter_id));

  -- Ratings: if both ids rated the same day, keep the newer one.
  delete from public.votes o using public.votes m
    where o.voter_id = claim_voter_id.old_id and m.voter_id = uid and m.day = o.day and m.updated_at >= o.updated_at;
  delete from public.votes m using public.votes o
    where m.voter_id = uid and o.voter_id = claim_voter_id.old_id and m.day = o.day and o.updated_at > m.updated_at;
  delete from public.absences a where a.voter_id = uid
    and exists (select 1 from public.votes o where o.voter_id = claim_voter_id.old_id and o.day = a.day);
  update public.votes set voter_id = uid where voter_id = claim_voter_id.old_id;
  get diagnostics n = row_count; moved := moved + n;

  -- Out of office
  delete from public.absences o where o.voter_id = claim_voter_id.old_id
    and (exists (select 1 from public.absences m where m.voter_id = uid and m.day = o.day)
      or exists (select 1 from public.votes v where v.voter_id = uid and v.day = o.day));
  update public.absences set voter_id = uid where voter_id = claim_voter_id.old_id;
  get diagnostics n = row_count; moved := moved + n;

  update public.rating_votes set voter_id = uid where voter_id = claim_voter_id.old_id;

  if to_regclass('public.rent_clicks') is not null then
    execute 'delete from public.rent_clicks o where o.voter_id = $1 and exists
               (select 1 from public.rent_clicks m where m.voter_id = $2 and m.click_day = o.click_day)'
      using claim_voter_id.old_id, uid;
    execute 'update public.rent_clicks set voter_id = $2 where voter_id = $1' using claim_voter_id.old_id, uid;
  end if;

  return moved;
end $$;
revoke all on function public.claim_voter_id(text) from public, anon;
grant execute on function public.claim_voter_id(text) to authenticated;
