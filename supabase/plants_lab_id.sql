-- plants.ps_lab_id — the producer/supplier lab that tests a plant's output.
--
-- Why this exists (Jake, 2026-09-13): "The producer lab id should be
-- somewhere in supabase, given the approval is tied to this plant this should
-- be in there somewhere and auto populated."
--
-- He is right about where it belongs. An AMAW's 'Pay Values'!I6 (P/S Lab ID)
-- names the lab that ran the contractor's acceptance tests, and that is a
-- property of the PLANT, not of the lot — every lot a plant produces has the
-- same one. It is the same rule this project already applies to plant names:
-- a value that belongs to a plant goes in `plants`, where a correction
-- reaches every page on its next load, and never into a page's CONFIG.
--
-- Two things a seeder needs to know before running this:
--
--   1. BOTH of the real AMAWs on file leave I5 and I6 blank, so there is no
--      worked example of the value's shape anywhere in this repo. Seed it
--      from what KYTC actually holds, not from a pattern inferred here.
--
--   2. The Department's own lab (I5, KYTC Lab ID) is a DIFFERENT column and
--      is deliberately not added here. KYTC's lab-unit list is in the MixPack
--      template at `Chart Data`!AV2:AV14 — LU00642 (Central) and LU01210 …
--      LU12210 — and which of those an AMAW wants has not been established.
--      A design's MixPack uses LU00642, but a design is approved centrally
--      and a lot is accepted in its district, so the two need not match.
--      Do not derive one from the other on the strength of that list alone.
--
-- Reference data, same footing as the rest of `plants`: read-all to
-- authenticated, no write policy, seeding is an admin action. Adding a
-- nullable column needs no policy change — the existing "plants: read all"
-- policy covers every column of the row.
--
-- Run this in the Supabase SQL Editor, then run the database linter
-- (get_advisors) as CLAUDE.md requires after any DDL change.

alter table plants add column if not exists ps_lab_id text;

comment on column plants.ps_lab_id is
  'Producer/supplier lab id for this plant. Written to the AMAW''s '
  '''Pay Values''!I6 by PlantBook. Null means "not recorded", which PlantBook '
  'shows as an empty, typeable field rather than as an error.';

-- ---------------------------------------------------------------------
-- Seed. One row per plant that has a lab id; leave the rest null.
-- Re-running is safe — it only touches the column named.
-- ---------------------------------------------------------------------

-- update plants set ps_lab_id = '...' where amp_number = 'AMP070301';   -- Berea
-- update plants set ps_lab_id = '...' where amp_number = 'AMP070302';   -- Boonesboro

-- Which plants still need one:
--
--   select amp_number, name from plants where ps_lab_id is null order by name;
