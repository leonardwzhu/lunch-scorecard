-- Everyone's personal link, for sending to coworkers who want to use another laptop or phone.
-- Run any time in Supabase: SQL Editor → New query → paste → Run. It only reads data.
--
-- People are grouped by the name they typed, so someone who already voted from two laptops gets ONE link
-- that combines both (the most recently used device comes first). Two different people who typed the
-- same name would be combined too, so check the devices column before sending.

with ids as (
  select voter_id,
         max(voter_name) filter (where voter_name <> '') as name,
         max(day)                                        as last_day,
         count(*)                                        as entries
  from (
    select voter_id, voter_name, day from public.votes
    union all
    select voter_id, voter_name, day from public.absences
  ) x
  group by voter_id
)
select min(coalesce(name, '(no name)'))                                   as name,
       count(*)                                                           as devices,
       sum(entries)                                                       as ratings_and_outs,
       max(last_day)                                                      as last_active,
       'https://leonardwzhu.github.io/lunch-scorecard/#device='
         || string_agg(voter_id, '.' order by last_day desc)              as personal_link
from ids
group by coalesce(lower(name), voter_id)
order by name;
