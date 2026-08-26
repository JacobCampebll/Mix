-- Mix / PlantBook access-control schema
--
-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL Editor
-- -> New query -> paste -> Run). Safe to re-run: every statement is
-- idempotent (create ... if not exists / drop policy if exists).
--
-- What this sets up:
--   technicians              - one row per person in the roster spreadsheet,
--                              keyed by their KYTC "SM ID" (e.g. 'jcavanah').
--   technician_plant_access  - one row per (technician, AMP plant) pair the
--                              technician is certified to see data for.
--
-- Login flow this supports (see login.html):
--   1. A technician signs up with email + password + their SM ID.
--   2. After Supabase Auth creates their account, the app runs an UPDATE
--      that "claims" the matching technicians row by setting user_id to
--      their new auth.uid() -- but only if that row hasn't been claimed
--      yet (user_id is null). First person to claim an SM ID gets it;
--      nobody can claim someone else's.
--   3. From then on, RLS lets that user read their own technicians row and
--      their own technician_plant_access rows -- and nothing else's.
--
-- Any table that holds actual DesignBook/PlantBook data should scope its own
-- RLS policy the same way technician_plant_access does here: filter on
-- amp_number in (select amp_number from technician_plant_access where
-- sm_id = (select sm_id from technicians where user_id = auth.uid())).

create table if not exists technicians (
  sm_id          text primary key,
  first_name     text not null,
  last_name      text not null,
  company        text not null,
  certifications text,
  user_id        uuid unique references auth.users(id),
  created_at     timestamptz not null default now()
);

create table if not exists technician_plant_access (
  sm_id       text not null references technicians(sm_id) on delete cascade,
  amp_number  text not null,
  primary key (sm_id, amp_number)
);

-- --- Row Level Security -----------------------------------------------
-- RLS on with no policy denies everything by default -- that's the safe
-- starting point. Every access path below is added explicitly.

alter table technicians enable row level security;
alter table technician_plant_access enable row level security;

-- Lock down column-level write access first: authenticated users may only
-- ever change their own user_id (the "claim" step), never their name,
-- company, certifications, or someone else's row contents.
revoke all on technicians from anon, authenticated;
revoke all on technician_plant_access from anon, authenticated;
grant select on technicians to authenticated;
grant update (user_id) on technicians to authenticated;
grant select on technician_plant_access to authenticated;

drop policy if exists "technicians: read own row" on technicians;
create policy "technicians: read own row"
  on technicians for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "technicians: claim unclaimed row" on technicians;
create policy "technicians: claim unclaimed row"
  on technicians for update
  to authenticated
  using (user_id is null)
  with check (user_id = auth.uid());

drop policy if exists "technician_plant_access: read own access" on technician_plant_access;
create policy "technician_plant_access: read own access"
  on technician_plant_access for select
  to authenticated
  using (
    sm_id in (
      select sm_id from technicians where user_id = auth.uid()
    )
  );

-- No insert/update/delete policies exist for anon/authenticated on either
-- table beyond the single claim-your-own-row case above -- bulk seeding and
-- roster updates are an admin operation, done with the service_role key
-- (which bypasses RLS entirely), never from the browser. See
-- scripts/build_technician_seed.py for turning the roster spreadsheet into
-- importable CSVs.
