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
