-- producer_supplier_labs — one row per contractor lab code (SiteManager's
-- `t_qualf_lab`, code prefix `C`), tied to the AMP plant it tests for.
--
-- Supersedes supabase/plants_lab_id.sql's plants.ps_lab_id column, which was
-- written 2026-09-13 and never applied. That plan assumed one clean lab id
-- per plant; the real KYTC export (`PlantBook Lab IDs.xlsx`, supplied by
-- Andrew 2026-09-17, sourced from `tsm.t_qualf_lab` per the file's own SQL
-- tab) does not hold that shape — some AMP numbers carry two or three lab
-- codes on file, some lab codes carry no AMP at all, and a single column on
-- `plants` cannot represent either honestly. A separate table can.
--
-- Why a per-lab table rather than a second column: the AMAW's
-- 'Pay Values'!I6 (producer/supplier lab) is a property of the LAB, and
-- KYTC's own SiteManager table keys it that way (`LAB_ID` is the primary
-- key, `LAB_NM` embeds the company and AMP as free text). Following that
-- shape rather than collapsing it onto `plants` is what makes the
-- reconciliation in docs/plantbook-lab-id-reconciliation.md possible to
-- redo the next time the export is refreshed.
--
-- amp_number is nullable and has NO foreign key to plants on purpose during
-- this rollout: only the 92 rows where the export's embedded AMP matches a
-- live plants.amp_number exactly are seeded here (see the reconciliation
-- doc for the 8 duplicate-code AMPs and 26 unmatched-AMP rows left OUT of
-- this seed rather than guessed at). A future correction may add amp-less
-- company-wide codes with amp_number left null; those are excluded from
-- this table's RLS scope entirely (see below) since there is nothing to
-- scope them to.
--
-- RLS: NOT read-all, unlike plants/aggregates/binder_terminals. Jake's ask
-- (2026-09-13 thread, PlantBook Lab IDs follow-up 2026-09-17): a plantbook
-- user should only see their own company's lab codes in the dropdown, same
-- theme as the rest of this project's access control. Reuses
-- technician_effective_plant_access (CLAUDE.md: "future DesignBook/PlantBook
-- RLS should reuse it rather than re-deriving the rule") instead of adding a
-- new company-name-matching layer — technicians.company is free text and
-- disagrees with this export's company spelling often enough
-- ("Hinkle Contracting" vs "Hinkle Contracting Corp.") that matching on it
-- would need its own normalization problem solved first. Scoping by AMP
-- access sidesteps that: a technician sees exactly the lab codes for the
-- plants they can already see, which is every plant they produce at and
-- nothing else — and Central Office reviewers (all_plants) see all of them,
-- correctly, for free.
--
-- Run this in the Supabase SQL Editor (or via the Supabase MCP
-- apply_migration), then run the database linter (get_advisors) as
-- CLAUDE.md requires after any DDL change.

create table if not exists producer_supplier_labs (
  lab_id        text primary key,
  amp_number    text,
  company_name  text not null,
  lab_name      text not null,
  created_at    timestamptz not null default now()
);

comment on table producer_supplier_labs is
  'Contractor lab codes (SiteManager t_qualf_lab, prefix C) written to the '
  'AMAW''s ''Pay Values''!I6. Scoped per-company by RLS, unlike the other '
  'reference tables in this project — see the comment on this file.';
comment on column producer_supplier_labs.lab_id is
  'SiteManager''s own primary key for the lab, e.g. C199.';
comment on column producer_supplier_labs.amp_number is
  'The plant this lab tests for. Nullable; a null row is invisible under '
  'this table''s RLS policy (nothing to scope it to) until it is resolved.';
comment on column producer_supplier_labs.company_name is
  'Parsed from the export''s "Company - AMPxxxxxx" label; not a foreign key '
  'to any company table (none exists) — display only.';
comment on column producer_supplier_labs.lab_name is
  'The export''s raw LAB_NM, kept verbatim for audit against the next '
  'refresh of the source spreadsheet.';

alter table producer_supplier_labs enable row level security;

revoke all on producer_supplier_labs from anon, authenticated;
grant select on producer_supplier_labs to authenticated;

create policy "producer_supplier_labs: read own company's plants"
  on producer_supplier_labs for select
  to authenticated
  using (
    amp_number is not null
    and exists (
      select 1
        from technician_effective_plant_access e
        join technicians t on t.sm_id = e.sm_id
       where t.user_id = auth.uid()
         and e.amp_number = producer_supplier_labs.amp_number
    )
  );

-- ---------------------------------------------------------------------
-- Seed: the 92 rows where the export's embedded AMP number matches a
-- live plants.amp_number exactly, and that AMP has exactly one lab code
-- on file. Re-running is safe (upsert on lab_id).
--
-- LEFT OUT on purpose — see docs/plantbook-lab-id-reconciliation.md:
--   - 8 AMP numbers with two or three lab codes on file (which is current?)
--   - 26 lab codes whose embedded AMP doesn't match any row in plants
--     (typo in the export, or a plant already retired from plants)
--   - 25 lab codes with no AMP in the name at all (company-wide codes,
--     outside testing consultants, or dead/superseded entries)
-- ---------------------------------------------------------------------

insert into producer_supplier_labs (lab_id, amp_number, company_name, lab_name) values
  ('C554', 'AMP010102', 'Murray Paving', 'Murray Paving - AMP010102'),
  ('C513', 'AMP010201', 'Purchase Asphalt LLC', 'Purchase Asphalt LLC - AMP010201'),
  ('C514', 'AMP010301', 'Jim Smith Contracting', 'Jim Smith Contracting - AMP010301'),
  ('C516', 'AMP010302', 'Jim Smith Contracting', 'Jim Smith Contracting - AMP010302'),
  ('C515', 'AMP010303', 'Jim Smith Contracting Co.', 'Jim Smith Contracting Co. - AMP010303'),
  ('C533', 'AMP010305', 'Rogers Group', 'Rogers Group - AMP010305'),
  ('C787', 'AMP010307', 'Murray Paving', 'Murray Paving AMP010307'),
  ('C294', 'AMP020105', 'Rogers Group', 'Rogers Group - AMP020105'),
  ('C297', 'AMP020301', 'E & B Paving, Inc.', 'E & B Paving, Inc. - AMP020301'),
  ('C407', 'AMP020302', 'J. H. Rudolph, Inc.', 'J. H. Rudolph, Inc. - AMP020302'),
  ('C278', 'AMP020303', 'Owensboro Paving', 'Owensboro Paving - AMP020303'),
  ('C295', 'AMP020309', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP020309'),
  ('C788', 'AMP020311', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP020311'),
  ('C315', 'AMP030301', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030301'),
  ('C224', 'AMP030303', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030303'),
  ('C236', 'AMP030304', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030304'),
  ('C238', 'AMP030305', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030305'),
  ('C237', 'AMP030306', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030306'),
  ('C235', 'AMP030307', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030307'),
  ('C288', 'AMP030309', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030309'),
  ('C783', 'AMP030311', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP030311'),
  ('C173', 'AMP040102', 'Mago Construction', 'Mago Construction - AMP040102'),
  ('C172', 'AMP040103', 'Mago Construction', 'Mago Construction - AMP040103'),
  ('C226', 'AMP040301', 'Irving Materials Inc.', 'Irving Materials Inc. - AMP040301'),
  ('C274', 'AMP040302', 'Haydon Materials', 'Haydon Materials - AMP040302'),
  ('C225', 'AMP040303', 'Haydon Materials', 'Haydon Materials - AMP040303'),
  ('C239', 'AMP040304', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP040304'),
  ('C737', 'AMP040308', 'Scotty''s Contracting', 'Scotty''s Contracting - AMP040308'),
  ('C792', 'AMP040310', 'Mago - Airport Rd.', 'Mago - Airport Rd. AMP040310'),
  ('C799', 'AMP040312', 'C & R Construction', 'C & R Construction - AMP040312'),
  ('C383', 'AMP050101', 'MAC Construction', 'MAC Construction - AMP050101'),
  ('C261', 'AMP050301', 'Louisville Paving', 'Louisville Paving - AMP050301'),
  ('C260', 'AMP050302', 'Flynn Brothers Contracting', 'Flynn Brothers Contracting - AMP050302'),
  ('C262', 'AMP050303', 'H. G. Mays Corp', 'H. G. Mays Corp - AMP050303'),
  ('C268', 'AMP050304', 'Sellersburg Stone (Gohman)', 'Sellersburg Stone (Gohman) - AMP050304'),
  ('C263', 'AMP050306', 'Mago Construction', 'Mago Construction - AMP050306'),
  ('C265', 'AMP050307', 'Mago Construction', 'Mago Construction - AMP050307'),
  ('C790', 'AMP050308', 'Louisville Paving', 'Louisville Paving - AMP050308'),
  ('C739', 'AMP050309', 'Flynn Brothers Contracting', 'Flynn Brothers Contracting - AMP050309'),
  ('C802', 'AMP050313', 'Windham Paving', 'Windham Paving - AMP050313'),
  ('C273', 'AMP050401', 'Louisville Paving', 'Louisville Paving - AMP050401'),
  ('C541', 'AMP060104', 'Mago Construction', 'Mago Construction - AMP060104'),
  ('C177', 'AMP060302', 'Eaton Asphalt Paving Company', 'Eaton Asphalt Paving Company - AMP060302'),
  ('C176', 'AMP060303', 'Mago Construction', 'Mago Construction - AMP060303'),
  ('C180', 'AMP060304', 'Hinkle Contracting', 'Hinkle Contracting - AMP060304'),
  ('C757', 'AMP060306', 'Riegler Blacktop', 'Riegler Blacktop - AMP060306'),
  ('C183', 'AMP060308', 'Eaton Asphalt Paving Company', 'Eaton Asphalt Paving Company - AMP060308'),
  ('C766', 'AMP060309', 'Eaton Asphalt Paving Company', 'Eaton Asphalt Paving Company - AMP060309'),
  ('C779', 'AMP060311', 'Valley Asphalt Corporation', 'Valley Asphalt Corporation - AMP060311'),
  ('C809', 'AMP060312', 'Riegler Blacktop', 'Riegler Blacktop - AMP060312'),
  ('C182', 'AMP060402', 'Barrett Paving Materials', 'Barrett Paving Materials - AMP060402'),
  ('C192', 'AMP070101', 'ATS Construction #14', 'ATS Construction #14 - AMP070101'),
  ('C187', 'AMP070102', 'Mago Construction', 'Mago Construction - AMP070102'),
  ('C188', 'AMP070103', 'Mago Construction', 'Mago Construction - AMP070103'),
  ('C197', 'AMP070302', 'The Allen Company', 'The Allen Company - AMP070302'),
  ('C190', 'AMP070303', 'ATS Construction #16', 'ATS Construction #16 - AMP070303'),
  ('C189', 'AMP070305', 'Hamilton & Hinkle Paving', 'Hamilton & Hinkle Paving - AMP070305'),
  ('C194', 'AMP070306', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP070306'),
  ('C195', 'AMP070307', 'The Allen Company', 'The Allen Company - AMP070307'),
  ('C200', 'AMP070308', 'The Walker Co.', 'The Walker Co. - AMP070308'),
  ('C193', 'AMP070309', 'ATS Construction #17', 'ATS Construction #17 - AMP070309'),
  ('C201', 'AMP080101', 'Gaddie Shamrock Co.', 'Gaddie Shamrock Co. - AMP080101'),
  ('C314', 'AMP080301', 'Gaddie Shamrock', 'Gaddie Shamrock - AMP080301'),
  ('C204', 'AMP080303', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP080303'),
  ('C208', 'AMP090102', 'Flemingsburg Materials', 'Flemingsburg Materials - AMP090102'),
  ('C210', 'AMP090103', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP090103'),
  ('C211', 'AMP090104', 'Maysville Materials', 'Maysville Materials - AMP090104'),
  ('C209', 'AMP090105', 'Mountain Enterprises', 'Mountain Enterprises - AMP090105'),
  ('C207', 'AMP090106', 'Mountain Enterprises', 'Mountain Enterprises - AMP090106'),
  ('C213', 'AMP090107', 'Mountain Enterprises', 'Mountain Enterprises - AMP090107'),
  ('C400', 'AMP090108', 'American Asphalt', 'American Asphalt - AMP090108'),
  ('C212', 'AMP090302', 'Mountain Enterprises', 'Mountain Enterprises - AMP090302'),
  ('C535', 'AMP090303', 'Eaton Asphalt Paving Company', 'Eaton Asphalt Paving Company - AMP090303'),
  ('C247', 'AMP100201', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP100201'),
  ('C361', 'AMP100302', 'Walker Construction', 'Walker Construction - AMP100302'),
  ('C255', 'AMP100303', 'Mountain Enterprises', 'Mountain Enterprises - AMP100303'),
  ('C246', 'AMP100304', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP100304'),
  ('C249', 'AMP100401', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP100401'),
  ('C301', 'AMP100402', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP100402'),
  ('C221', 'AMP110101', 'Mountain Enterprises', 'Mountain Enterprises - AMP110101'),
  ('C217', 'AMP110201', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMP110201'),
  ('C220', 'AMP110302', 'L-G Materials LLC', 'L-G Materials LLC - AMP110302'),
  ('C216', 'AMP110305', 'L-G Materials LLC', 'L-G Materials LLC - AMP110305'),
  ('C784', 'AMP110306', 'The Allen Company', 'The Allen Company - AMP110306'),
  ('C805', 'AMP110308', 'Mountain Enterprises', 'Mountain Enterprises - AMP110308'),
  ('C325', 'AMP120102', 'Mountain Enterprises', 'Mountain Enterprises - AMP120102'),
  ('C251', 'AMP120301', 'Mountain Enterprises', 'Mountain Enterprises - AMP120301'),
  ('C227', 'AMP120302', 'Mountain Enterprises', 'Mountain Enterprises - AMP120302'),
  ('C230', 'AMP120304', 'Mountain Enterprises', 'Mountain Enterprises - AMP120304'),
  ('C291', 'AMP120305', 'Mountain Enterprises', 'Mountain Enterprises - AMP120305'),
  ('C285', 'AMP120306', 'Mountain Enterprises', 'Mountain Enterprises - AMP120306'),
  ('C205', 'AMPMP0301', 'Hinkle Contracting Corp.', 'Hinkle Contracting Corp. - AMPMP0301')
on conflict (lab_id) do update set
  amp_number = excluded.amp_number,
  company_name = excluded.company_name,
  lab_name = excluded.lab_name;

-- Which currently-tracked plants still have no producer/supplier lab code:
--
--   select p.amp_number, p.name from plants p
--   left join producer_supplier_labs l on l.amp_number = p.amp_number
--   where l.lab_id is null order by p.amp_number;

-- ---------------------------------------------------------------------
-- producer_supplier_labs_view — added 2026-09-17 (Andrew: "reconciled
-- against the plants table... name that reads exactly like the name
-- column from plants table"). A plain join, not a stored/denormalized
-- name column, so plant_name can never drift from plants.name - it always
-- reads it. security_invoker means both tables' own RLS still applies to
-- the querying user (same pattern as technician_effective_plant_access in
-- supabase/effective_plant_access.sql) - this view grants no new
-- visibility, it only reshapes what was already visible.
--
-- CONFIG.REFERENCE.TABLES.producer_supplier_labs (designbook.html) reads
-- this view rather than the bare table. Joining in SQL rather than inside
-- the page's `label` function matters for a reason specific to this
-- codebase: label/value/aliases are called directly with fixture rows by
-- scripts/amaw/check_page_plantbook.mjs in a Node vm context with no
-- `state` global, so a cross-table lookup inside the function (e.g.
-- reaching into state.ref.plants) would throw there. Every entry in
-- REFERENCE.TABLES stays a pure function of its own row; this view is
-- what lets producer_supplier_labs keep that property while still
-- showing the plant name.
--
-- Joining this against plants surfaced 7 rows where the export's company
-- name and the plant's current operator are genuinely different
-- companies (not spelling variants) — see
-- docs/plantbook-lab-id-reconciliation.md section 5. Left in pending
-- Andrew's review; not a reason to drop the view.
-- ---------------------------------------------------------------------

create or replace view producer_supplier_labs_view
with (security_invoker = true) as
select l.lab_id, l.amp_number, l.company_name, l.lab_name, p.name as plant_name
  from producer_supplier_labs l
  left join plants p on p.amp_number = l.amp_number;

comment on view producer_supplier_labs_view is
  'producer_supplier_labs joined to plants.name for display - see the '
  'CONFIG.REFERENCE.TABLES.producer_supplier_labs comment in designbook.html.';

grant select on producer_supplier_labs_view to authenticated;

-- ---------------------------------------------------------------------
-- flagged_mismatch / flag_note — added 2026-09-17. Joining against plants
-- above surfaced 7 rows where the export's company_name and plants.name
-- disagree for the same amp_number (docs/plantbook-lab-id-
-- reconciliation.md section 5). Andrew: keep them rather than drop them,
-- with "an obvious indicator... that they might be old" - though see the
-- same conversation for why the wording below says "unverified" rather
-- than "old": H. G. Mays Corp is one of the 7 and is a very active
-- company, so the flag can only honestly say the AMP mapping is
-- unconfirmed, not that the row itself is stale.
-- ---------------------------------------------------------------------

alter table producer_supplier_labs
  add column if not exists flagged_mismatch boolean not null default false,
  add column if not exists flag_note text;

comment on column producer_supplier_labs.flagged_mismatch is
  'True when company_name disagrees with plants.name for this row''s amp_number. Surfaced in the PlantBook dropdown label and as a non-blocking rail warning - see CONFIG.REFERENCE.TABLES.producer_supplier_labs in designbook.html.';
comment on column producer_supplier_labs.flag_note is
  'Why this row is flagged - printed nowhere in the UI yet, kept for the next person auditing this table.';

update producer_supplier_labs set
  flagged_mismatch = true,
  flag_note = 'company_name disagrees with plants.name for this amp_number - see docs/plantbook-lab-id-reconciliation.md section 5 (2026-09-17)'
where lab_id in ('C513', 'C278', 'C226', 'C262', 'C268', 'C802', 'C180');

-- CREATE OR REPLACE VIEW can only append columns at the end, not insert
-- them before an existing one, so flagged_mismatch/flag_note come after
-- plant_name rather than beside company_name/lab_name where they logically
-- belong.
create or replace view producer_supplier_labs_view
with (security_invoker = true) as
select l.lab_id, l.amp_number, l.company_name, l.lab_name,
       p.name as plant_name,
       l.flagged_mismatch, l.flag_note
  from producer_supplier_labs l
  left join plants p on p.amp_number = l.amp_number;

-- ---------------------------------------------------------------------
-- SUPERSEDES THE VIEW ABOVE, 2026-09-17b (Andrew: "make the producer
-- supplier labs table simpler, with lab id, amp number, lab name column
-- (with plant location and without AMP number redundancy)"). The view's
-- whole reason to exist was avoiding a stored copy of plants.name; a
-- trigger is the same guarantee (lab_name can never silently drift) by a
-- different mechanism, traded for a table that reads "Company @ Site"
-- directly in Studio with no view to remember. `company_name` is dropped
-- - it was fully superseded once lab_name became the plant's own name
-- rather than the export's raw label.
--
-- lab_name's CONTENT changes here too: it used to be the export's raw
-- "Company - AMPxxxxxx" string (kept for audit); it becomes plants.name
-- verbatim, so the audit trail for the original 92 rows now lives only in
-- docs/plantbook-lab-id-reconciliation.md and the original export, not in
-- this column.
-- ---------------------------------------------------------------------

create or replace function sync_producer_supplier_lab_name()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  select name into new.lab_name from plants where amp_number = new.amp_number;
  return new;
end;
$$;

drop trigger if exists trg_sync_producer_supplier_lab_name on producer_supplier_labs;
create trigger trg_sync_producer_supplier_lab_name
  before insert or update of amp_number on producer_supplier_labs
  for each row execute function sync_producer_supplier_lab_name();

-- If a plant's name is corrected later (the Gaddie Shamrock LLC fix, for
-- instance), every lab row tied to that AMP updates with it - the same
-- "one row, every page" rule this project already applies to `plants`
-- itself, now automated rather than manual.
create or replace function cascade_plant_name_to_labs()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.name is distinct from old.name then
    update producer_supplier_labs set lab_name = new.name where amp_number = new.amp_number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cascade_plant_name_to_labs on plants;
create trigger trg_cascade_plant_name_to_labs
  after update of name on plants
  for each row execute function cascade_plant_name_to_labs();

-- Backfill the 92 existing rows, then drop what the trigger and the
-- dropped view made redundant.
update producer_supplier_labs l
   set lab_name = p.name
  from plants p
 where p.amp_number = l.amp_number;

drop view if exists producer_supplier_labs_view;
alter table producer_supplier_labs drop column if exists company_name;

comment on column producer_supplier_labs.lab_name is
  'plants.name for this row''s amp_number, kept in sync by '
  'trg_sync_producer_supplier_lab_name / trg_cascade_plant_name_to_labs - '
  'never hand-edit this column, it will be overwritten on the next sync.';

-- ---------------------------------------------------------------------
-- The 8 duplicate-AMP rows left out of the original seed (section 1 of
-- the reconciliation doc). Comparing each code's ORIGINAL export company
-- (recorded here, not in the table - company_name is gone) against
-- plants.name - the same test that produced the 7 rows flagged above -
-- resolves 6 of the 8 AMPs cleanly: both codes agree with plants, so
-- neither is flagged. The other 2 turn out not to be a true tie at all:
-- one code already matches plants, the other doesn't.
--   AMP020101: plants says "Scottys Contracting" - C298 matches, clean;
--              C384 was "Road Builders Paving & Const" - flagged.
--   AMP050312: plants says "Asphalt Supply Co" - C798 matches, clean;
--              C800 was "Hall Contracting" - flagged.
-- lab_name is left null in the VALUES below - the insert trigger fills it
-- from plants.name before the row is written.
-- ---------------------------------------------------------------------

insert into producer_supplier_labs (lab_id, amp_number, lab_name, flagged_mismatch, flag_note) values
  ('C384', 'AMP020101', null, true,  'company_name was "Road Builders Paving & Const", plants has this AMP as Scotty''s Contracting - see docs/plantbook-lab-id-reconciliation.md section 1 (2026-09-17b)'),
  ('C298', 'AMP020101', null, false, null),
  ('C169', 'AMP020304', null, false, null),
  ('C786', 'AMP020304', null, false, null),
  ('C240', 'AMP040311', null, false, null),
  ('C171', 'AMP040311', null, false, null),
  ('C798', 'AMP050312', null, false, null),
  ('C800', 'AMP050312', null, true,  'company_name was "Hall Contracting", plants has this AMP as Asphalt Supply Co - see docs/plantbook-lab-id-reconciliation.md section 1 (2026-09-17b)'),
  ('C199', 'AMP070301', null, false, null),
  ('C518', 'AMP070301', null, false, null),
  ('C215', 'AMP080302', null, false, null),
  ('C222', 'AMP080302', null, false, null),
  ('C785', 'AMP080302', null, false, null),
  ('C245', 'AMP100301', null, false, null),
  ('C250', 'AMP100301', null, false, null),
  ('C218', 'AMP110204', null, false, null),
  ('C219', 'AMP110204', null, false, null)
on conflict (lab_id) do update set
  amp_number = excluded.amp_number,
  flagged_mismatch = excluded.flagged_mismatch,
  flag_note = excluded.flag_note;
