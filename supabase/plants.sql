-- plants — AMP number to human plant name.
--
-- Why this exists: technician_plant_access stores only (sm_id, amp_number).
-- There was no plant name anywhere in the schema, so the Portal's plant
-- dropdown could only show a bare AMP number like "AMP070301". This table is
-- the join target for that name.
--
-- Reference data, not per-technician data: every authenticated technician
-- reads the whole table. A plant name is not sensitive, and scoping reads to
-- a technician's own plants would mean their dropdown could not label a plant
-- they are about to be assigned. Nothing here is writable from the browser —
-- there is no insert/update/delete policy, so seeding is an admin action
-- through the SQL Editor or the Table Editor.
--
-- Run this in the Supabase SQL Editor, then run the database linter
-- (get_advisors) as CLAUDE.md requires after any DDL change.

create table if not exists plants (
  amp_number  text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- RLS on FIRST, before any grant. With RLS off this table would be fully
-- readable and writable by anyone holding the anon key, which ships in the
-- page source by design. See the anon-key gotcha in CLAUDE.md.
alter table plants enable row level security;

revoke all on plants from anon, authenticated;
grant select on plants to authenticated;

create policy "plants: read all"
  on plants for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Seed. Replace with the real roster — one row per AMP number that appears
-- in technician_plant_access. Re-running is safe: an existing amp_number has
-- its name refreshed rather than erroring.
--
-- Confirmed against the Allen JMF records (contractor_producer_no ->
-- plant_name). Every other AMP number still needs its real name.
-- ---------------------------------------------------------------------

insert into plants (amp_number, name) values
  ('AMP070302', 'The Allen Company @ Boonesboro')
  -- ('AMP070301', '...'),
  -- ('AMP0000000', '...')
on conflict (amp_number) do update set name = excluded.name;

-- Which AMP numbers still need a name:
--
--   select distinct a.amp_number
--   from technician_plant_access a
--   left join plants p on p.amp_number = a.amp_number
--   where p.amp_number is null
--   order by 1;
