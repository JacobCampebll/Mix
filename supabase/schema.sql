-- Mix / PlantBook access-control schema
--
-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL Editor
-- -> New query -> paste -> Run). Safe to re-run: every statement is
-- idempotent (create ... if not exists / drop policy if exists / create or
-- replace function).
--
-- What this sets up:
--   technicians               - one row per person in the roster
--                               spreadsheet, keyed by their KYTC "SM ID"
--                               (e.g. 'jcavanah').
--   technician_plant_access   - one row per (technician, AMP plant) pair
--                               the technician is certified to see data for.
--   technician_certifications - one row per (technician, cert type) the
--                               technician currently holds, with its
--                               expiration date. Two cert types exist:
--                               'plant_tech' and 'mix_design_tech'. Every
--                               technician in the roster holds plant_tech
--                               (it's earned first); mix_design_tech is
--                               earned later and implies plant_tech-level
--                               competency too - see technician_capabilities
--                               below for what that means for access.
--   technician_capabilities   - a view, not a table: per technician, whether
--                               each cert is CURRENTLY valid (not expired)
--                               and which book(s) that grants access to.
--                               This is what login.html and any future
--                               DesignBook/PlantBook table's RLS should
--                               query - never hand-roll the expiry logic
--                               again elsewhere.
--   claim_technician(sm_id)      - links a technicians row to an auth
--                                  account by SM ID. Was the self-serve
--                                  sign-up path; not used by the current
--                                  bootstrap flow (all 376 accounts were
--                                  bulk-provisioned already-linked - see
--                                  below), but kept for onboarding any
--                                  technician added to the roster later.
--   mark_technician_onboarded()  - the only way a session can ever set
--                                  technicians.onboarded to true. Same
--                                  SECURITY DEFINER reasoning as
--                                  claim_technician() - see that note.
--
-- Login flow this supports (see login.html) - NOT self-serve sign-up:
--   1. All 376 technician accounts were bulk-provisioned directly (an
--      admin action, done once against this database - not exposed to the
--      browser) with a fabricated email (`${sm_id}@technicians.mix.local`,
--      since the roster has no real emails) and a shared temporary
--      password. Each account's technicians.user_id was set at the same
--      time, so no self-serve claim step is needed for this population.
--   2. A technician's first sign-in uses SM ID + the temp password.
--      login.html checks technicians.onboarded - false means: prompt for
--      a real email, wait for them to confirm it (supabase.auth.updateUser
--      email flow), then prompt for a real password
--      (supabase.auth.updateUser password flow), then call
--      mark_technician_onboarded(). Onboarding restarts from wherever it
--      left off if they abandon it partway (checked by whether their
--      Auth email still ends in the fake domain, not by a separate step
--      counter).
--   3. Once onboarded, they sign in with their real email + their own
--      password going forward, and Supabase's normal "forgot password"
--      email flow works, since the account now has a real, confirmed
--      address on file.
--   4. From then on, RLS lets that user read their own technicians,
--      technician_plant_access, and technician_capabilities rows - and
--      nothing else's.
--
-- Required Supabase Auth settings for the onboarding email step to ever
-- complete: Authentication -> Providers -> Email -> turn OFF "Secure email
-- change". That setting, when on, requires confirming an email change from
-- BOTH the old and new address - and technicians' old address is the fake
-- one, which can never confirm anything. With it off, only the new address
-- needs to confirm, which is exactly the onboarding step above.
--
-- Access rule (as specified): plant_tech alone -> PlantBook only.
-- mix_design_tech (which nobody holds without plant_tech, but is checked
-- independently anyway - see technician_capabilities) -> PlantBook AND
-- DesignBook. Both gate on the certification being CURRENTLY unexpired -
-- a lapsed cert loses that access until the roster is updated and
-- scripts/build_technician_seed.py is re-run with the renewed date.
--
-- Any table that holds actual DesignBook/PlantBook data should scope its
-- own RLS policy off technician_capabilities (for the plantbook/designbook
-- yes-or-no gate) and technician_plant_access (for which AMP numbers) -
-- both already resolve from auth.uid() the same way, so join or reuse
-- rather than re-deriving.
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
  onboarded      boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists technician_plant_access (
  sm_id       text not null references technicians(sm_id) on delete cascade,
  amp_number  text not null,
  primary key (sm_id, amp_number)
);

create table if not exists technician_certifications (
  sm_id       text not null references technicians(sm_id) on delete cascade,
  cert_type   text not null check (cert_type in ('plant_tech', 'mix_design_tech')),
  expires_on  date not null,
  primary key (sm_id, cert_type)
);

-- --- Row Level Security -----------------------------------------------
-- RLS on with no policy denies everything by default -- that's the safe
-- starting point. Every access path below is added explicitly.

alter table technicians enable row level security;
alter table technician_plant_access enable row level security;
alter table technician_certifications enable row level security;

-- No column-level UPDATE grant here on purpose: the only way user_id ever
-- gets written is through claim_technician() below, never a direct UPDATE.
revoke all on technicians from anon, authenticated;
revoke all on technician_plant_access from anon, authenticated;
revoke all on technician_certifications from anon, authenticated;
grant select on technicians to authenticated;
grant select on technician_plant_access to authenticated;
grant select on technician_certifications to authenticated;

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

drop policy if exists "technician_certifications: read own certs" on technician_certifications;
create policy "technician_certifications: read own certs"
  on technician_certifications for select
  to authenticated
  using (
    sm_id in (
      select sm_id from technicians where user_id = auth.uid()
    )
  );

-- security_invoker so this view enforces RLS as the *querying* user, not
-- the view's owner - without it, a view silently runs with the owner's
-- (usually superuser-ish) privileges and would leak every technician's
-- capabilities to anyone who can query it. Requires Postgres 15+ (this
-- project is on 17).
create or replace view technician_capabilities
with (security_invoker = true) as
select
  t.sm_id,
  t.user_id,
  exists (
    select 1 from technician_certifications c
    where c.sm_id = t.sm_id and c.cert_type = 'plant_tech' and c.expires_on >= current_date
  ) as has_plant_tech,
  exists (
    select 1 from technician_certifications c
    where c.sm_id = t.sm_id and c.cert_type = 'mix_design_tech' and c.expires_on >= current_date
  ) as has_mix_design_tech,
  -- Checked independently per cert, not "has_mix_design_tech implies
  -- has_plant_tech" - the two rows can have different expiration dates
  -- (they do, for some technicians in the real roster), so a still-valid
  -- mix_design_tech should grant PlantBook access even if this person's
  -- separate plant_tech row happens to have lapsed.
  (
    exists (select 1 from technician_certifications c where c.sm_id = t.sm_id and c.cert_type = 'plant_tech' and c.expires_on >= current_date)
    or exists (select 1 from technician_certifications c where c.sm_id = t.sm_id and c.cert_type = 'mix_design_tech' and c.expires_on >= current_date)
  ) as can_access_plantbook,
  exists (
    select 1 from technician_certifications c
    where c.sm_id = t.sm_id and c.cert_type = 'mix_design_tech' and c.expires_on >= current_date
  ) as can_access_designbook
from technicians t;

grant select on technician_capabilities to authenticated;

-- search_path is pinned so this can't be tricked by a same-named object in
-- another schema (the standard SECURITY DEFINER hardening). The
-- auth.uid() is null guard is belt-and-suspenders on top of the explicit
-- anon revoke below - a SECURITY DEFINER function is executable by PUBLIC
-- (which includes anon) by default the moment it's created, and Supabase's
-- database linter (get_advisors) will flag exactly that if you skip the
-- revoke. Without either, an unauthenticated caller could invoke this with
-- any sm_id and get that technician's name/company back for free: auth.uid()
-- would be null, "set user_id = null" is a no-op against a row that's
-- already null, so the WHERE still matches and RETURNING still leaks it.
create or replace function claim_technician(p_sm_id text)
returns table (sm_id text, first_name text, last_name text, company text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  -- trim/lowercase here too, not just in login.html - every sm_id in the
  -- seeded data is already lowercase, so this is the same normalization
  -- the client does before calling, applied again server-side in case some
  -- other caller doesn't bother.
  return query
  update technicians t
  set user_id = auth.uid()
  where t.sm_id = lower(trim(p_sm_id))
    and t.user_id is null
  returning t.sm_id, t.first_name, t.last_name, t.company;
end;
$$;

revoke all on function claim_technician(text) from public;
revoke execute on function claim_technician(text) from anon;
grant execute on function claim_technician(text) to authenticated;

-- Marks the caller's own technicians row as onboarded, once they've set a
-- real email and a real password (see login.html). No arguments and no
-- target other than "whoever is calling this" - there's nothing here for a
-- caller to point at someone else's row with, unlike claim_technician().
create or replace function mark_technician_onboarded()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  update technicians
  set onboarded = true
  where user_id = auth.uid();

  return found;
end;
$$;

revoke all on function mark_technician_onboarded() from public;
revoke execute on function mark_technician_onboarded() from anon;
grant execute on function mark_technician_onboarded() to authenticated;

-- No insert/update/delete policies exist for anon/authenticated on any of
-- the three tables beyond claim_technician() above -- bulk seeding and
-- roster updates are an admin operation, done with the service_role key
-- (which bypasses RLS entirely), never from the browser. See
-- scripts/build_technician_seed.py for turning the two roster spreadsheets
-- into importable seed files.
