-- KYTC reference tables for the DesignBook dropdowns — aggregates (AGP
-- producers), aggregate_types (material type -> MAT code / polish class),
-- binder_terminals (LAP suppliers) and binder_grades (PG grade -> SiteManager
-- code).
--
-- These are Andrew's tables. APPLIED and SEEDED on the live project
-- (aggregates and aggregate_types 2026-09-02, both binder tables
-- 2026-09-03). This file was reconstructed 2026-09-03 from a read-only
-- inspection of the live schema (information_schema, pg_class, pg_constraint,
-- pg_policies, pg_class.relacl) so the repo carries the structure. It does
-- NOT hold the seed rows — those are the live project's data, maintained by
-- Andrew through the SQL Editor / Table Editor. Live row counts at the time
-- of writing: aggregates 178, aggregate_types 115, binder_terminals 26,
-- binder_grades 12.
--
-- Reference data, not per-technician data — the same pattern as plants.sql:
-- every authenticated technician reads the whole table, and nothing is
-- writable from the browser because no insert/update/delete policy exists.
-- Each table has exactly one PERMISSIVE SELECT policy, `to authenticated
-- using (true)`. Policy names below are the live names verbatim (the two
-- pairs were named in different styles; keep them as they are so a
-- `drop policy` in a later migration finds them).
--
-- Every statement is idempotent (`if not exists`) so this can be re-run
-- against the live project without touching the data. Run it in the Supabase
-- SQL Editor, then run the database linter (get_advisors) as CLAUDE.md
-- requires after any DDL change.

-- ---------------------------------------------------------------------
-- aggregates — AGP number to producer, with the KYTC aggregate category.
-- Live: 178 rows, producer_name unique across all 178 (one producer per AGP
-- row), category split 122 crushed_stone / 42 sand_gravel / 10 sandstone /
-- 4 slag.
-- ---------------------------------------------------------------------

create table if not exists aggregates (
  agp_number     text primary key,
  category       text not null
                 check (category in ('crushed_stone', 'sand_gravel', 'slag', 'sandstone')),
  producer_name  text not null,
  created_at     timestamptz not null default now()
);

-- RLS on FIRST, before anything else. With RLS off this table would be fully
-- readable and writable by anyone holding the anon key, which ships in the
-- page source by design. See the anon-key gotcha in CLAUDE.md.
alter table aggregates enable row level security;

create policy "aggregates_select_authenticated"
  on aggregates for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- aggregate_types — material type name to polish-resistant class and the
-- five-digit SiteManager MAT code.
-- Live: 115 rows. polish_resistant_class is null on 65, A on 30, B on 20;
-- A+ is allowed by the check but unused. Every row has a mat_code, but the
-- 115 type names resolve to only 42 distinct codes — 30 codes are shared,
-- the busiest (10400, 10415) by eight type names each — so mat_code is a
-- lookup from the chosen type, never a key, and a bare code cannot be
-- reverse-resolved to one type_name. type_name is the key.
-- mat_code was added after the table was created (it sits at ordinal
-- position 4, after created_at), so it is added with `alter table` here to
-- reproduce the live column order exactly.
-- ---------------------------------------------------------------------

create table if not exists aggregate_types (
  type_name               text primary key,
  polish_resistant_class  text
                          check (polish_resistant_class in ('A+', 'A', 'B')),
  created_at              timestamptz not null default now()
);

alter table aggregate_types
  add column if not exists mat_code text
  check (mat_code ~ '^[0-9]{5}$');

alter table aggregate_types enable row level security;

create policy "aggregate_types_select_authenticated"
  on aggregate_types for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- binder_terminals — LAP number to asphalt binder terminal name.
-- Live: 26 rows, terminal_name unique across all 26.
-- ---------------------------------------------------------------------

create table if not exists binder_terminals (
  lap_number     text primary key,
  terminal_name  text not null,
  created_at     timestamptz not null default now()
);

alter table binder_terminals enable row level security;

create policy "authenticated can read binder_terminals"
  on binder_terminals for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- binder_grades — PG grade (plus CRS-2P) to five-digit SiteManager code.
-- Live: 12 rows — PG58-22 .. PG82-28 (11 grades, codes 60025..60275 in
-- steps of 25) and CRS-2P 61075. Sorted by primary key CRS-2P comes first;
-- a dropdown wants the PG grades in numeric order with CRS-2P last, so sort
-- explicitly for display.
-- ---------------------------------------------------------------------

create table if not exists binder_grades (
  grade             text primary key,
  sitemanager_code  text not null
                    check (sitemanager_code ~ '^[0-9]{5}$'),
  created_at        timestamptz not null default now()
);

alter table binder_grades enable row level security;

create policy "authenticated can read binder_grades"
  on binder_grades for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Grants. These are EXPLICIT as of 2026-09-24, and they are a deliberate
-- divergence from what is live rather than a description of it.
--
-- What is LIVE: none of these four tables had the plants.sql
-- `revoke all ... / grant select ... to authenticated` step run. They carry
-- Supabase's default privileges (relacl: anon, authenticated and
-- service_role all = arwdDxtm, i.e. full DML), which a plain `create table`
-- in public has always reproduced. RLS with a select-only policy makes the
-- effective access read-only for authenticated and nothing at all for anon
-- either way, so the difference only bites if RLS is ever switched off.
--
-- Why they are written out now: from 2026-10-30 Supabase stops granting
-- Data API access to NEW tables in public automatically, and a migration
-- that creates a table without grants leaves it unreachable through
-- PostgREST. Applied tables keep the privileges they already hold, so the
-- live project is unaffected -- but this file is also what a new project, a
-- preview branch or a `supabase db reset` would run, and there it would
-- silently produce four tables the page cannot read. `loadReferenceData()`
-- degrades rather than breaking (each dropdown falls back to a free-text
-- input, with the failure named on the Status step), which is exactly the
-- kind of failure that reads as a data problem instead of a grant one.
--
-- Nothing is granted to `anon` on purpose: the app reads as an authenticated
-- technician, never as anon, the same as plants.sql. So once this has been
-- run, an anon PostgREST probe of these four answers 42501 ("exists,
-- refusing this role") where today it answers with an empty array. CLAUDE.md
-- records that 42501-vs-PGRST205 distinction and the false accusation that
-- came of reading one as the other; this is one more table set moving onto
-- the 42501 side of it.
--
-- Running it against the live project is Andrew's call and is safe either
-- way, since nothing in the app reads these as anon.
-- ---------------------------------------------------------------------

revoke all on aggregates, aggregate_types, binder_terminals, binder_grades
  from anon, authenticated;
grant select on aggregates, aggregate_types, binder_terminals, binder_grades
  to authenticated;

-- No table or column comments exist on any of the four tables. Only the
-- primary-key index exists on each.
