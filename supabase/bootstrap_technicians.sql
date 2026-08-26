-- Bulk-provision technician auth accounts.
--
-- Run this in the Supabase SQL Editor whenever technicians exist in the
-- `technicians` table (imported via scripts/build_technician_seed.py) that
-- don't have a linked auth account yet (user_id is null) - the very first
-- rollout, and again any time new technicians are added to the roster
-- later. Safe to re-run: only touches rows where user_id is still null.
--
-- Every account gets:
--   - a fabricated email: `${sm_id}@technicians.mix.local` (the roster has
--     no real emails - see the ACCESS MODEL note in login.html)
--   - the shared temporary password 'password' (technicians replace this
--     with their own during the forced onboarding flow - see login.html)
--   - already linked via technicians.user_id, no separate claim step
--
-- Getting these bulk-created rows right on the first try, found the hard
-- way (see CLAUDE.md Gotchas), took two follow-up fixes that are already
-- baked into this version - if you're re-deriving this from scratch
-- instead of running this file, keep both:
--   1. instance_id must be the zero UUID, not null. GoTrue's user lookup
--      apparently filters on it; a null row is invisible to sign-in and
--      the failure surfaces as a generic "invalid_credentials" - which
--      looks exactly like a wrong password, not a malformed row.
--   2. confirmation_token, recovery_token, email_change_token_new,
--      email_change, email_change_token_current, phone_change,
--      phone_change_token, and reauthentication_token must be '' (empty
--      string), not null. GoTrue's Go code scans these into plain
--      strings; a null value crashes that scan with "sql: Scan error ...
--      converting NULL to string is unsupported" - a 500, not a login
--      rejection, and only surfaces once (1) is already fixed and the
--      user row is actually found.
--
-- Neither bug is visible from a raw SQL check of the row itself - both
-- passed `encrypted_password = crypt('password', encrypted_password)`
-- and looked like well-formed rows. They only show up when something
-- actually calls Supabase Auth's real /token endpoint - which is exactly
-- why this got missed until a real browser sign-in was tried. If you
-- change this script, re-test with a real sign-in, not just a SQL check.

with new_users as (
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    t.sm_id || '@technicians.mix.local',
    extensions.crypt('password', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false,
    false,
    '', '', '', '', '', '', '', ''
  from technicians t
  where t.user_id is null
  returning id, email
)
update technicians t
set user_id = nu.id
from new_users nu
where nu.email = t.sm_id || '@technicians.mix.local';

-- GoTrue expects at least one identities row per user for the "email"
-- provider - see the schema.sql comment on claim_technician() for the same
-- SECURITY DEFINER reasoning that applies to why this is done here rather
-- than left to a client-side call.
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email',
  now(), now()
from auth.users u
join technicians t on t.user_id = u.id
where u.email like '%@technicians.mix.local'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');
