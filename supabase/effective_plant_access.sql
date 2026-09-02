-- all_plants flag + technician_effective_plant_access view
--
-- APPLIED to the live project 2026-09-02 (migration
-- all_plants_flag_and_effective_plant_access_view). Kept here so the repo
-- describes the database.
--
-- Why: KYTC Central Office Materials reviewers (12 people) hold both certs
-- but have no technician_plant_access rows - correct, they review rather
-- than produce - so the Portal blocked them at "No plants are assigned to
-- your SM ID". They need every plant. A flag on the technician, not 1,560
-- hand-inserted access rows: those would be lost on the next roster
-- re-seed and would miss any plant added to `plants` later.
--
-- The view is the ONE place to ask "which plants can this technician see?"
-- Pages query it instead of technician_plant_access, and future DesignBook
-- RLS should reuse it rather than re-deriving the rule (CLAUDE.md).
-- security_invoker means the caller's own RLS on the underlying tables
-- applies, so a user only ever resolves their own rows.

alter table technicians
  add column if not exists all_plants boolean not null default false;

comment on column technicians.all_plants is
  'When true this technician sees every plant in plants, regardless of technician_plant_access. Set for KYTC Central Office Materials reviewers. Admin-controlled; the seed script sets it by company.';

update technicians
   set all_plants = true
 where company = 'Central Office Materials'
   and not all_plants;

create or replace view technician_effective_plant_access
with (security_invoker = true) as
  select a.sm_id, a.amp_number
    from technician_plant_access a
  union
  select t.sm_id, p.amp_number
    from technicians t
    cross join plants p
   where t.all_plants;

grant select on technician_effective_plant_access to authenticated;

-- Sanity check after applying:
--   select sm_id, count(*) from technician_effective_plant_access
--   where sm_id in ('adenmark','jcampbe2') group by 1;
--   -> adenmark = every plant, jcampbe2 = their own rows only.
