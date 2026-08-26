-- Mix / PlantBook access-control schema
--
-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL Editor
-- -> New query -> paste -> Run). Safe to re-run: every statement is
-- idempotent (create ... if not exists / drop policy if exists / create or
-- replace function).
--
-- What this sets up:
--   technicians              - one row per person in the roster spreadsheet,
--                              keyed by their KYTC "SM ID" (e.g. 'jcavanah').
--   technician_plant_access  - one row per (technician, AMP plant) pair the
--                              technician is certified to see data for.
--   claim_technician(sm_id)  - the only way a session can ever write to
--                              technicians.user_id. See "Why a function,
--                              not a policy" below - a plain UPDATE policy
--                              cannot do this safely.
--
-- Login flow this supports (see login.html):
--   1. A technician signs up with email + password + their SM ID.
--   2. Once a session exists, the app calls
--      supabase.rpc('claim_technician', { p_sm_id }) which links this
--      account to the matching technicians row - but only while that row's
--      user_id is still null. First person to claim an SM ID gets it;
--      nobody can claim someone else's, and nobody can re-claim an
--      already-linked one.
--   3. From then on, RLS lets that user read their own technicians row and
--      their own technician_plant_access rows - and nothing else's.
--
-- Any table that holds actual DesignBook/PlantBook data should scope its own
-- RLS policy the same way technician_plant_access does here: filter on
-- amp_number in (select amp_number from technician_plant_access where
-- sm_id = (select sm_id from technicians where user_id = auth.uid())).
--
-- Why a function, not a policy (found the hard way - see CLAUDE.md Gotchas):
-- Postgres requires a row to pass the table's SELECT policy before an
-- UPDATE can even see it to modify it - that's not optional, it's how RLS
-- resolves UPDATE targets. The SELECT policy here is "user_id = auth.uid()",
-- which is never true for an unclaimed row (user_id is null doesn't equal
-- anyone's uid). So a plain "UPDATE ... WHERE user_id IS NULL" policy can
-- never actually fire - it silently updates 0 rows, every time, for every
-- user. The fix is NOT to loosen the SELECT policy (that would let any
-- authenticated user browse the entire unclaimed roster - every technician's
-- name, company, and certs - until each row gets claimed). Instead,
-- claim_technician() is SECURITY DEFINER: it runs with the privileges of
-- its owner, bypassing RLS internally, so it can see and update an
-- unclaimed row without that row ever needing to be exposed through a
-- general-purpose SELECT policy.

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

-- No column-level UPDATE grant here on purpose: the only way user_id ever
-- gets written is through claim_technician() below, never a direct UPDATE.
revoke all on technicians from anon, authenticated;
revoke all on technician_plant_access from anon, authenticated;
grant select on technicians to authenticated;
grant select on technician_plant_access to authenticated;

drop policy if exists "technicians: read own row" on technicians;
create policy "technicians: read own row"
  on technicians for select
  to authenticated
  using (user_id = auth.uid());

-- No UPDATE policy on technicians for anon/authenticated - see
-- claim_technician() instead.

drop policy if exists "technician_plant_access: read own access" on technician_plant_access;
create policy "technician_plant_access: read own access"
  on technician_plant_access for select
  to authenticated
  using (
    sm_id in (
      select sm_id from technicians where user_id = auth.uid()
    )
  );

-- search_path is pinned so this can't be tricked by a same-named object in
-- another schema (the standard SECURITY DEFINER hardening).
create or replace function claim_technician(p_sm_id text)
returns table (sm_id text, first_name text, last_name text, company text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update technicians t
  set user_id = auth.uid()
  where t.sm_id = p_sm_id
    and t.user_id is null
  returning t.sm_id, t.first_name, t.last_name, t.company;
end;
$$;

revoke all on function claim_technician(text) from public;
grant execute on function claim_technician(text) to authenticated;

-- No insert/update/delete policies exist for anon/authenticated on either
-- table beyond claim_technician() above -- bulk seeding and roster updates
-- are an admin operation, done with the service_role key (which bypasses
-- RLS entirely), never from the browser. See
-- scripts/build_technician_seed.py for turning the roster spreadsheet into
-- importable seed files.
