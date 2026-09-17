-- kytc_district_labs — KYTC's own lab sections (Central Office + all 12
-- districts + a handful of design-build project crews), for the AMAW's
-- 'Pay Values'!I5 (KYTC Lab ID). Sourced from `PlantBook Lab IDs.xlsx`
-- (Andrew, 2026-09-17; SiteManager's `tsm.t_qualf_lab` per the file's own
-- SQL tab).
--
-- Closes the OPEN item this project has carried since 2026-09-13: only
-- district 07's lab was known (CONFIG.MIXPACK.DISTRICTS: { "07": { lab:
-- "LU00642", ... } }), and that entry is now known to be WRONG in a subtle
-- way — LU00642 is "CO Materials - Asphalt Mixtures Section", a Central
-- Office code, not a per-district one. It is the code district 07's real
-- approved MixPack used because a design is approved centrally, not
-- because it belongs to district 7. This table carries the real
-- district-by-district codes for the first time.
--
-- *** OPEN QUESTION, DO NOT FORGET (Andrew, 2026-09-17) ***
-- Every one of KYTC's 71 shared district/section labs has TWO codes on
-- file — an `LU#####` one and a `DL#####` one — naming the exact same lab
-- (e.g. "D-01 Materials Section" is both LU01210 and DL01210). Nothing in
-- this repo proves which series the AMAW's 'Pay Values'!I5 actually wants:
-- both real completed AMAWs on file (Jake's, 2026-09-13) leave I5 blank.
-- DesignBook's MixPack template DOES use the LU series on a real approved
-- design (Chart Data!AV2:AV14 / LU00642), which is why this table defaults
-- the dropdown to lu_lab_id — but that is evidence for the MixPack, not
-- proof for the AMAW. Check this against a real filled-in AMAW (or ask
-- KYTC) before trusting the default for PlantBook specifically. Tracked
-- again in CLAUDE.md so it isn't lost.
--
-- Read-all reference data, same footing as plants/aggregates/binder_*: not
-- scoped, unlike producer_supplier_labs — a KYTC lab section isn't tied to
-- one company, every technician may need to pick any district.
--
-- Includes eight "D-99 Crew ..." rows for named design-build megaprojects
-- (ORX, IMOVE, i65 CC, KY8, etc.) — real current codes, not dead ones, just
-- narrow in scope. Left in rather than trimmed as "superfluous": unlike the
-- contractor side, a read-all KYTC list costs nothing to leave a little
-- long, and dropping a real code silently is worse than an extra dropdown
-- row. Revisit if they turn out to clutter the dropdown in practice.
--
-- Run this in the Supabase SQL Editor (or via the Supabase MCP
-- apply_migration), then run the database linter (get_advisors) as
-- CLAUDE.md requires after any DDL change.

create table if not exists kytc_district_labs (
  lab_name    text primary key,
  lu_lab_id   text,
  dl_lab_id   text,
  created_at  timestamptz not null default now()
);

comment on table kytc_district_labs is
  'KYTC''s own lab sections (Central Office + 12 districts + design-build '
  'crews), written to the AMAW''s ''Pay Values''!I5. See the LU-vs-DL open '
  'question in this file''s header and in CLAUDE.md before trusting the '
  'lu_lab_id default for PlantBook specifically.';
comment on column kytc_district_labs.lu_lab_id is
  'SiteManager''s LU-prefixed code for this lab. Confirmed correct for '
  'DesignBook''s MixPack (Chart Data!AV2:AV14); NOT confirmed for the AMAW.';
comment on column kytc_district_labs.dl_lab_id is
  'SiteManager''s DL-prefixed code for the same lab. Carried as an alias so '
  'a lot already typed with a DL code still resolves against this row '
  'without a mismatch warning — see designbook.html''s kytc_district_labs '
  'CONFIG.REFERENCE.TABLES entry.';

alter table kytc_district_labs enable row level security;

revoke all on kytc_district_labs from anon, authenticated;
grant select on kytc_district_labs to authenticated;

create policy "kytc_district_labs: read all"
  on kytc_district_labs for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Seed: all 80 rows from the export — 71 shared LU/DL pairs (70 exact
-- name matches plus "D-07 Georgetown Section", which the two series spell
-- with different capitalization and which this seed merges into one row),
-- 7 Central Office section codes that exist only as LU (Aggregate,
-- Asphalt Mixtures, Chemistry, Concrete/Cement, Geotechnical, Liquid
-- Asphalt, Physical), and 2 that exist only as DL ("Asphalt Mixtures
-- Contractors", "Central Office Materials"). Re-running is safe (upsert on
-- lab_name).
-- ---------------------------------------------------------------------

insert into kytc_district_labs (lab_name, lu_lab_id, dl_lab_id) values
  ('Asphalt Mixtures Contractors', null, 'DLAMCONT'),
  ('Central Office Materials', null, 'DL00640'),
  ('CO Materials - Aggregate Section', 'LU00641', null),
  ('CO Materials - Asphalt Mixtures Section', 'LU00642', null),
  ('CO Materials - Chemistry Section', 'LU00643', null),
  ('CO Materials - Concrete/Cement Section', 'LU00644', null),
  ('CO Materials - Geotechnical Section', 'LU00645', null),
  ('CO Materials - Liquid Asphalt Section', 'LU00646', null),
  ('CO Materials - Physical Section', 'LU00647', null),
  ('D-01 Materials Section', 'LU01210', 'DL01210'),
  ('D-01 Mayfield Section', 'LU01340', 'DL01340'),
  ('D-01 Murray Section', 'LU01360', 'DL01360'),
  ('D-01 Paducah Section', 'LU01300', 'DL01300'),
  ('D-01 Smithland Section', 'LU01320', 'DL01320'),
  ('D-02 Henderson Section', 'LU02320', 'DL02320'),
  ('D-02 Hopkinsville Section', 'LU02340', 'DL02340'),
  ('D-02 Madisonville Section', 'LU02300', 'DL02300'),
  ('D-02 Materials Section', 'LU02210', 'DL02210'),
  ('D-02 Owensboro Section', 'LU02360', 'DL02360'),
  ('D-03 Bowling Green Section', 'LU03300', 'DL03300'),
  ('D-03 Glasgow Section', 'LU03320', 'DL03320'),
  ('D-03 Materials Section', 'LU03210', 'DL03210'),
  ('D-03 Russellville Section', 'LU03340', 'DL03340'),
  ('D-03 Scottsville Section', 'LU03360', 'DL03360'),
  ('D-04 Bardstown Section', 'LU04360', 'DL04360'),
  ('D-04 Cambellsville Section', 'LU04320', 'DL04320'),
  ('D-04 Elizabethtown Section', 'LU04300', 'DL04300'),
  ('D-04 Hardinsburg Section', 'LU04340', 'DL04340'),
  ('D-04 Materials Section', 'LU04210', 'DL04210'),
  ('D-05 Frankfort Section', 'LU05380', 'DL05380'),
  ('D-05 Louisville Section', 'LU05300', 'DL05300'),
  ('D-05 Materials Section', 'LU05210', 'DL05210'),
  ('D-05 New Castle Section', 'LU05360', 'DL05360'),
  ('D-05 Shelbyville Section', 'LU05320', 'DL05320'),
  ('D-05 Shepherdsville Section', 'LU05340', 'DL05340'),
  ('D-06 Burlington Section', 'LU06340', 'DL06340'),
  ('D-06 Covington Section', 'LU06300', 'DL06300'),
  ('D-06 Falmouth Section', 'LU06360', 'DL06360'),
  ('D-06 Materials Section', 'LU06210', 'DL06210'),
  ('D-06 Owenton Section', 'LU06380', 'DL06380'),
  ('D-06 Williamstown Section', 'LU06320', 'DL06320'),
  ('D-07 Danville Section', 'LU07360', 'DL07360'),
  ('D-07 Georgetown Section', 'LU07340', 'DL07340'),
  ('D-07 Lexington Section', 'LU07300', 'DL07300'),
  ('D-07 Materials Section', 'LU07210', 'DL07210'),
  ('D-07 Richmond Section', 'LU07320', 'DL07320'),
  ('D-07 Winchester Section', 'LU07380', 'DL07380'),
  ('D-08 Materials Section', 'LU08210', 'DL08210'),
  ('D-08 Monticello Section', 'LU08360', 'DL08360'),
  ('D-08 Russell Springs Section', 'LU08320', 'DL08320'),
  ('D-08 Somerset Section', 'LU08300', 'DL08300'),
  ('D-08 Stanford Section', 'LU08340', 'DL08340'),
  ('D-09 Catlettsburg Section', 'LU09360', 'DL09360'),
  ('D-09 Flemingsburg Section', 'LU09300', 'DL09300'),
  ('D-09 Grayson Section', 'LU09320', 'DL09320'),
  ('D-09 Materials Section', 'LU09210', 'DL09210'),
  ('D-09 Morehead Section', 'LU09340', 'DL09340'),
  ('D-10 Hazard Section', 'LU10340', 'DL10340'),
  ('D-10 Jackson Section', 'LU10300', 'DL10300'),
  ('D-10 Materials Section', 'LU10210', 'DL10210'),
  ('D-10 Stanton Section', 'LU10320', 'DL10320'),
  ('D-10 West Liberty Section', 'LU10360', 'DL10360'),
  ('D-11 London Section', 'LU11340', 'DL11340'),
  ('D-11 Manchester Section', 'LU11300', 'DL11300'),
  ('D-11 Materials Section', 'LU11210', 'DL11210'),
  ('D-11 Pineville Section', 'LU11320', 'DL11320'),
  ('D-11 Williamsburg Section', 'LU11360', 'DL11360'),
  ('D-12 Materials Section', 'LU12210', 'DL12210'),
  ('D-12 Paintsville Section', 'LU12360', 'DL12360'),
  ('D-12 Pikeville Section', 'LU12300', 'DL12300'),
  ('D-12 Prestonsburg Section', 'LU12320', 'DL12320'),
  ('D-12 Whitesburg Section', 'LU12340', 'DL12340'),
  ('D-99 Crew 300-Graves Rd DB', 'LU99300', 'DL99300'),
  ('D-99 Crew 320-Richwood Rd DB', 'LU99320', 'DL99320'),
  ('D-99 Crew 340-IMOVE', 'LU99340', 'DL99340'),
  ('D-99 Crew 360-Bridging KY D/B-London', 'LU99360', 'DL99360'),
  ('D-99 Crew 380-ORX Phase 1', 'LU99380', 'DL99380'),
  ('D-99 Crew 400 Market Street LPA', 'LU99400', 'DL99400'),
  ('D-99 Crew 420 KY8', 'LU99420', 'DL99420'),
  ('D-99 Crew 440 i65 CC Project', 'LU99440', 'DL99440')
on conflict (lab_name) do update set lu_lab_id = excluded.lu_lab_id, dl_lab_id = excluded.dl_lab_id;
