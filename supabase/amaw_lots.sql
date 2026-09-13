-- amaw_lots + amaw_lot_records + amaw_lot_events: PlantBook storage, RLS,
-- and the department-side write path.
--
-- *** NOT APPLIED. This file is FOR ANDREW TO APPLY, or not. ***
--
-- Unlike supabase/designs.sql and supabase/plants.sql, nothing here has ever
-- run against the live project. It is one half of an undecided question -
-- see docs/plantbook-storage.md, which lays out the file model and this one
-- side by side. Jake, 2026-09-13: "let's build it both ways for now until I
-- talk with Tate and Andrew." The page switches between the two with one
-- CONFIG flag (scripts/amaw/storage.mjs), so this can sit unapplied
-- indefinitely without blocking PlantBook.
--
-- Read docs/plantbook-storage.md before applying. Three of its open
-- questions are load-bearing on the policies below, and question 2 (district
-- scoping) is unanswerable with today's schema - see the DEPARTMENT block.
--
-- Run it in the SQL Editor as one transaction, then run the database linter
-- (get_advisors) as CLAUDE.md requires after any DDL change - not just once.
--
-- ---------------------------------------------------------------------
-- Why PlantBook needs storage at all when DesignBook deliberately does not
-- ---------------------------------------------------------------------
-- A mix design is filled in one sitting by one person. An AMAW lot is 4,000
-- tons as four 1,000-ton sublots and the two real lots on file ran 2026-07-26
-- to 07-31 and 08-03 to 08-06. Seven test records (VI01, QC01-QC04, QA01,
-- IQ01, ~210 fields each - docs/amaw-map.md) are filled at different times by
-- different people, and QA01/IQ01 are filled by KYTC district personnel who
-- are not the contractor and never hold the contractor's file.
--
-- The 2026-09-04 rule still holds for the deliverable: what KYTC loads into
-- MEDL is the generated AMAW .xlsm, exactly as it is the MixPack for
-- DesignBook. This is the workbench for the week the lot is accruing, not a
-- replacement for that file.
--
-- ---------------------------------------------------------------------
-- Design decisions
-- ---------------------------------------------------------------------
--   * A lot is identified by contract + plant + mix + lot number. Those four
--     are real columns because they are what gets filtered, listed and joined
--     on; everything else is jsonb, the same split designs.sql made.
--   * ONE ROW PER TEST RECORD, not seven blocks inside one jsonb. This is
--     the shape decision that matters: a contractor QC tech saving sublot 3
--     and a district tech saving QA01 must write different rows, days apart,
--     without clobbering each other. Put all seven in one document and the
--     merge problem the file model has is rebuilt inside Postgres. It is
--     also what lets the two populations carry different policies.
--   * Plant access is resolved through technician_effective_plant_access and
--     the plantbook gate through technician_capabilities. Neither rule is
--     re-derived here - CLAUDE.md: join or reuse. That is also why a lapsed
--     cert loses access without anything here changing.
--   * Optimistic concurrency per record (`revision`, bumped by the trigger).
--     A week-long lot means stale tabs are normal, not exceptional. The page
--     writes `... .eq('revision', seen)`; 0 rows means somebody else saved
--     first. Note that reads back as PGRST116 through PostgREST's .single(),
--     same as the RLS-filtered UPDATE gotcha in CLAUDE.md - the page must say
--     "reload, a colleague saved" rather than showing a database error.
--   * No stage trigger like designs_guard(). designs.sql could enforce its
--     ladder because the ladder was decided; the lot lifecycle is not (open
--     question 3 - is a lot ever re-opened after acceptance?). `status` is a
--     check constraint and nothing more until somebody answers that. Better
--     an honest gap than a guessed rule nobody can override.

begin;

-- ---------------------------------------------------------------------
-- amaw_lots - one row per lot
-- ---------------------------------------------------------------------
create table if not exists amaw_lots (
  id              uuid primary key default gen_random_uuid(),
  contract_id     text not null,
  amp_number      text not null references plants(amp_number),
  -- 'Pay Values'!D9 is "00385 CL3 ASPH SURF 0.38A PG64-22" - the approved
  -- design's MIX ID followed by its signature. That cell is the join between
  -- the two books (docs/amaw-map.md), so both halves are kept: mix_id to key
  -- on, mix_signature because it is what a human reads.
  mix_id          text not null,
  mix_signature   text,
  lot_number      integer not null check (lot_number > 0),

  sm_id           text not null references technicians(sm_id),
  author_user_id  uuid not null default auth.uid(),
  -- Denormalised for the same reason designs.author_name is: a contractor
  -- cannot read another technician's technicians row, so there is nothing to
  -- join to for a display name.
  author_name     text not null,

  -- Placeholder lifecycle, deliberately unenforced - see the note above.
  status          text not null default 'Open'
                  check (status in ('Open', 'Closed', 'Submitted', 'Accepted')),

  -- Lot-level values: the blend (five components, identical across both real
  -- lots), the Pay Values header, recycle figures. Everything the seven test
  -- records read the SAME cell for.
  values          jsonb not null default '{}'::jsonb,
  -- Repeating tables that belong to the lot rather than to one record:
  -- {cores:[...], gradation:[...]}. Core count is NOT fixed - lot 1 has six,
  -- lot 2 has ten - so this is an array, never four slots.
  rows            jsonb not null default '{}'::jsonb,
  -- field -> source cell / lookup, same provisional-values contract as
  -- designs.extracted_from. An imported value is a starting point, never an
  -- authority (CLAUDE.md).
  extracted_from  jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The natural key. A second row for the same lot is a bug, not a revision.
create unique index if not exists amaw_lots_identity_idx
  on amaw_lots (contract_id, amp_number, mix_id, lot_number);
create index if not exists amaw_lots_plant_status_idx on amaw_lots (amp_number, status);
create index if not exists amaw_lots_author_idx       on amaw_lots (author_user_id);

comment on table amaw_lots is
  'One AMAW acceptance lot (4,000 tons as four sublots). The generated AMAW .xlsm is still what KYTC loads; this is the durable workbench for the days the lot is accruing. See docs/plantbook-storage.md.';

-- ---------------------------------------------------------------------
-- amaw_lot_records - seven per lot, one per t_tst_rslt_dtl block
-- ---------------------------------------------------------------------
create table if not exists amaw_lot_records (
  id            uuid primary key default gen_random_uuid(),
  lot_id        uuid not null references amaw_lots(id) on delete cascade,
  -- The block ids are t_tst_rslt_dtl's own, not names we chose
  -- (docs/amaw-map.md): VI01 verification, QC01-QC04 the four sublots,
  -- QA01 Department acceptance, IQ01 independent assurance.
  block         text not null check (block in ('VI01','QC01','QC02','QC03','QC04','QA01','IQ01')),
  -- Who is expected to fill it. Derived from `block`, stored so a policy and
  -- an index can read it without a case expression in five places.
  --   'contractor' - the plant's own QC technicians
  --   'department' - KYTC district personnel visiting the job
  -- VI01 sits with the contractor: it is the verification the plant runs at
  -- the start of the lot. Confirm that with Tate before applying.
  party         text not null generated always as (
                  case when block in ('QA01','IQ01') then 'department' else 'contractor' end
                ) stored,

  values        jsonb not null default '{}'::jsonb,   -- ~210 fields
  rows          jsonb not null default '{}'::jsonb,   -- that record's repeating tables (KYCT, gradation)

  sm_id         text references technicians(sm_id),
  entered_by    uuid,
  entered_name  text,
  -- Optimistic concurrency. The page sends the revision it last read; a save
  -- that matches nothing means a colleague got there first.
  revision      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (lot_id, block)
);
create index if not exists amaw_lot_records_lot_idx   on amaw_lot_records (lot_id, block);
create index if not exists amaw_lot_records_party_idx on amaw_lot_records (party);

comment on column amaw_lot_records.party is
  'Which population fills this record. QA01/IQ01 are KYTC district personnel; everything else is the plant. Generated from block - do not set it.';

-- ---------------------------------------------------------------------
-- amaw_lot_events - append-only audit, written by a trigger
-- ---------------------------------------------------------------------
-- Same shape and same reasoning as design_events. It matters more here: a
-- lot is data KYTC accepts tonnage on, assembled by three or more people over
-- a week, and "who entered sublot 3, and when" has no other answer.
create table if not exists amaw_lot_events (
  id          bigserial primary key,
  lot_id      uuid not null references amaw_lots(id) on delete cascade,
  at          timestamptz not null default now(),
  user_id     uuid not null,
  sm_id       text,
  kind        text not null check (kind in ('created', 'saved', 'record', 'status', 'note')),
  block       text,
  from_status text,
  to_status   text,
  note        text
);
create index if not exists amaw_lot_events_lot_idx on amaw_lot_events (lot_id, at);

-- ---------------------------------------------------------------------
-- RLS ON before any grant.
-- ---------------------------------------------------------------------
-- A table with RLS enabled and no policy denies everything, which is the safe
-- starting point: turn it on first, then add policies. With RLS off, the anon
-- key that ships in every page's CONFIG hands anyone who views source full
-- read/write on these tables (CLAUDE.md).
alter table amaw_lots        enable row level security;
alter table amaw_lot_records enable row level security;
alter table amaw_lot_events  enable row level security;

revoke all on amaw_lots, amaw_lot_records, amaw_lot_events from anon, authenticated;
grant select, insert, update         on amaw_lots        to authenticated;
grant select, insert, update, delete on amaw_lot_records to authenticated;
grant select                         on amaw_lot_events  to authenticated;  -- written only by the audit trigger

-- A lot is deletable only while it is Open, and only by its author - same
-- shape as "designs: author deletes own draft". Granted separately so the
-- intent is visible.
grant delete on amaw_lots to authenticated;

-- ---------------------------------------------------------------------
-- Helper: does the current user hold PlantBook, at this plant?
-- ---------------------------------------------------------------------
-- Both halves already exist and neither is re-derived here. The expiry rule
-- lives in technician_capabilities and the all_plants rule in
-- technician_effective_plant_access; this only ANDs them.
--
-- security invoker, so the caller's own RLS on technicians /
-- technician_certifications / technician_plant_access still applies and a
-- user can only ever resolve their own rows. It is a convenience for the
-- policies below, not a privilege boundary.
create or replace function plantbook_at_plant(p_amp_number text)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select exists (
    select 1
      from technician_capabilities c
      join technician_effective_plant_access e on e.sm_id = c.sm_id
     where c.user_id = auth.uid()
       and c.can_access_plantbook
       and e.amp_number = p_amp_number
  )
$$;

revoke all on function plantbook_at_plant(text) from public, anon;
grant execute on function plantbook_at_plant(text) to authenticated;

-- ---------------------------------------------------------------------
-- Policies: amaw_lots
-- ---------------------------------------------------------------------
-- Read is plant-scoped, not author-scoped, and that is the point: the night
-- shift must open the lot the day shift started. Note what this means through
-- all_plants - the 12 Central Office people read every contractor's
-- in-progress QC data before the lot is closed. That is open question 1 in
-- docs/plantbook-storage.md and it is a policy question for Tate, not a
-- technical one. If the answer is no, this policy is where it changes.
create policy "amaw_lots: read at an accessible plant"
  on amaw_lots for select to authenticated
  using (plantbook_at_plant(amp_number));

create policy "amaw_lots: insert as yourself at an accessible plant"
  on amaw_lots for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and sm_id = (select sm_id from technicians where user_id = auth.uid())
    and plantbook_at_plant(amp_number)
  );

-- Any PlantBook technician at the plant may update, not just the author. A
-- lot spans shifts and the author may be off that week; author-only here
-- would reproduce the file model's single-holder assumption in the database.
create policy "amaw_lots: update at an accessible plant"
  on amaw_lots for update to authenticated
  using      (plantbook_at_plant(amp_number))
  with check (plantbook_at_plant(amp_number));

create policy "amaw_lots: author deletes own open lot"
  on amaw_lots for delete to authenticated
  using (author_user_id = auth.uid() and status = 'Open');

-- ---------------------------------------------------------------------
-- Policies: amaw_lot_records
-- ---------------------------------------------------------------------
-- Reading a record follows reading its lot. `exists (select 1 from amaw_lots
-- ...)` re-runs that table's own SELECT policy, so there is one definition of
-- who can see a lot rather than two that can drift - same construction as
-- "design_events: read for visible designs".
create policy "amaw_lot_records: read for visible lots"
  on amaw_lot_records for select to authenticated
  using (exists (select 1 from amaw_lots l where l.id = amaw_lot_records.lot_id));

-- The contractor side writes the contractor blocks. These spell the two
-- department blocks out rather than reading the generated `party` column: a
-- policy that depended on when a STORED generated column is computed relative
-- to WITH CHECK would be correct-by-accident. `party` stays for the index and
-- for queries; `block` is the authority, and it is immutable after insert
-- (amaw_lot_records_guard pins it), so neither can be dodged.
create policy "amaw_lot_records: plant writes contractor blocks"
  on amaw_lot_records for insert to authenticated
  with check (
    block not in ('QA01', 'IQ01')
    and exists (select 1 from amaw_lots l where l.id = amaw_lot_records.lot_id and plantbook_at_plant(l.amp_number))
  );

create policy "amaw_lot_records: plant updates contractor blocks"
  on amaw_lot_records for update to authenticated
  using (
    block not in ('QA01', 'IQ01')
    and exists (select 1 from amaw_lots l where l.id = amaw_lot_records.lot_id and plantbook_at_plant(l.amp_number))
  )
  with check (
    block not in ('QA01', 'IQ01')
    and exists (select 1 from amaw_lots l where l.id = amaw_lot_records.lot_id and plantbook_at_plant(l.amp_number))
  );

-- A blank record typed into by mistake can be removed by the plant while the
-- lot is Open. There is deliberately no delete for a department block from
-- the browser at all.
create policy "amaw_lot_records: plant deletes a contractor block on an open lot"
  on amaw_lot_records for delete to authenticated
  using (
    block not in ('QA01', 'IQ01')
    and exists (
      select 1 from amaw_lots l
       where l.id = amaw_lot_records.lot_id and l.status = 'Open' and plantbook_at_plant(l.amp_number)
    )
  );

create policy "amaw_lot_events: read for visible lots"
  on amaw_lot_events for select to authenticated
  using (exists (select 1 from amaw_lots l where l.id = amaw_lot_events.lot_id));

-- =====================================================================
-- DEPARTMENT (QA01 / IQ01) - and the column that does not exist
-- =====================================================================
--
-- *** FLAG FOR ANDREW. District-level scoping has nowhere to live yet. ***
--
-- QA01 is Department acceptance and IQ01 is independent assurance. Both are
-- filled by KYTC DISTRICT personnel who visit jobs - 12 districts, each with
-- its own technicians. `technicians` today is:
--
--     sm_id, first_name, last_name, company, certifications,
--     user_id, onboarded, all_plants, can_review
--
-- There is no district column on technicians, and no district column on
-- plants either, so there is NO WAY to express "this technician may write QA
-- results for jobs in their own district" with the schema as it stands.
-- No column has been invented here - that is Andrew's call and CLAUDE.md
-- reserves reference-data and schema changes to him.
--
-- What this file uses instead, as an EXPLICIT STAND-IN: technicians.can_review.
-- That flag is WRONG-GRAINED and should not be mistaken for the real answer:
--   * can_review is the 12 KYTC Central Office Materials reviewers, set by
--     company in scripts/build_technician_seed.py. District field technicians
--     are a different, larger population that is not marked at all today.
--   * It is statewide. It cannot say "District 7 only", which is the entire
--     point of district scoping.
-- So today this grants the department write path to Central Office and to
-- nobody else - too narrow for the real workflow, and not narrow enough in
-- kind. It is deliberately conservative: it lets the flow be built and tested
-- without handing QA writes to anyone who should not have them.
--
-- Andrew needs to decide the real shape. Three candidates:
--   (a) technicians.district text  + plants.district text, matched;
--   (b) a technician_district_access table, mirroring
--       technician_plant_access, with an effective view for statewide staff;
--   (c) district personnel simply get technician_plant_access rows for the
--       plants in their district, and no new concept is needed at all.
-- (c) is the cheapest and would let every policy above serve unchanged; it
-- depends on whether "which plants" and "which district" are really the same
-- question. Worth asking before building (a) or (b).
--
-- ---------------------------------------------------------------------
-- Why these are SECURITY DEFINER functions and not policies
-- ---------------------------------------------------------------------
-- CLAUDE.md, the hard way: an UPDATE (or INSERT) policy alone cannot reach a
-- row the user does not already pass the SELECT policy for. Postgres resolves
-- the UPDATE's target through the SELECT policy first, so the statement
-- silently touches 0 rows - no error, no exception, and it looks exactly like
-- a bug in the page.
--
-- That trap is live here. A district technician visiting a job has no
-- technician_plant_access row for that plant, so plantbook_at_plant() is
-- false, so "amaw_lots: read at an accessible plant" hides the lot, so they
-- cannot find it and any write against it would touch nothing. Loosening the
-- lot SELECT policy to fix that would expose every contractor's in-progress
-- QC data to every authenticated technician in the state - exactly the
-- overreach the claim_technician() note warns against.
--
-- So the department path is two SECURITY DEFINER functions, which bypass RLS
-- internally and authorise explicitly. Each is narrow: find one lot by its
-- natural key, write one department block. Neither can list, browse or read a
-- contractor block.
-- ---------------------------------------------------------------------

-- Authorisation for the department path, in ONE place so the stand-in above
-- can be replaced by editing this function alone once Andrew answers.
-- search_path pinned: standard SECURITY DEFINER hardening, so it cannot be
-- tricked by a same-named object in another schema.
create or replace function amaw_is_department_tech()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select t.can_review          -- STAND-IN. See the block above.
      from technicians t
      join technician_capabilities c on c.user_id = t.user_id
     where t.user_id = auth.uid()
       and c.can_access_plantbook
     limit 1
  ), false)
$$;

-- Locate one lot by its natural key, without being able to browse.
-- Returns at most one row and only the identity, never the values.
create or replace function amaw_find_lot(
  p_contract_id text,
  p_amp_number  text,
  p_mix_id      text,
  p_lot_number  integer
) returns table (id uuid, contract_id text, amp_number text, mix_id text,
                 mix_signature text, lot_number integer, status text)
language plpgsql stable security definer set search_path = public
as $$
begin
  -- auth.uid() is null guard, belt and braces on top of the explicit revoke
  -- below: a SECURITY DEFINER function is executable by PUBLIC (which
  -- includes anon) the moment it is created, and get_advisors flags exactly
  -- that if the revoke is skipped.
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not amaw_is_department_tech() then
    raise exception 'not authorised for Department acceptance records';
  end if;
  return query
    select l.id, l.contract_id, l.amp_number, l.mix_id, l.mix_signature, l.lot_number, l.status
      from amaw_lots l
     where l.contract_id = p_contract_id
       and l.amp_number  = p_amp_number
       and l.mix_id      = p_mix_id
       and l.lot_number  = p_lot_number;
end $$;

-- Write one department block (QA01 or IQ01) into a lot the caller cannot see
-- through RLS. p_revision is the revision last read, or null for a first
-- write; a mismatch raises rather than silently overwriting.
create or replace function amaw_save_department_record(
  p_lot_id   uuid,
  p_block    text,
  p_values   jsonb,
  p_rows     jsonb default '{}'::jsonb,
  p_revision integer default null
) returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  me   technicians;
  cur  integer;
  nxt  integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_block not in ('QA01', 'IQ01') then
    raise exception 'amaw_save_department_record handles QA01 and IQ01 only, not %', p_block;
  end if;
  if not amaw_is_department_tech() then
    raise exception 'not authorised for Department acceptance records';
  end if;

  select * into me from technicians where user_id = auth.uid();
  if me.sm_id is null then raise exception 'no technician row for this user'; end if;
  if not exists (select 1 from amaw_lots where id = p_lot_id) then
    raise exception 'no such lot';
  end if;

  select revision into cur from amaw_lot_records where lot_id = p_lot_id and block = p_block;
  if cur is not null and p_revision is not null and cur <> p_revision then
    raise exception 'stale revision: this % record is at % and you last read %', p_block, cur, p_revision;
  end if;
  nxt := coalesce(cur, 0) + 1;

  insert into amaw_lot_records (lot_id, block, values, rows, sm_id, entered_by, entered_name, revision, updated_at)
       values (p_lot_id, p_block, coalesce(p_values, '{}'::jsonb), coalesce(p_rows, '{}'::jsonb),
               me.sm_id, auth.uid(), me.first_name || ' ' || me.last_name, nxt, now())
  on conflict (lot_id, block) do update
      set values = excluded.values, rows = excluded.rows, sm_id = excluded.sm_id,
          entered_by = excluded.entered_by, entered_name = excluded.entered_name,
          revision = excluded.revision, updated_at = now();

  -- No event is written here on purpose: amaw_lot_records_audit_trg already
  -- writes one for this row, and two rows per save would make the trail read
  -- as two people saving.
  return nxt;
end $$;

-- A newly created function is callable by PUBLIC - which includes anon -
-- until this is run. Not optional, and get_advisors will say so.
revoke all on function amaw_is_department_tech()                              from public, anon;
revoke all on function amaw_find_lot(text, text, text, integer)               from public, anon;
revoke all on function amaw_save_department_record(uuid, text, jsonb, jsonb, integer) from public, anon;
grant execute on function amaw_is_department_tech()                              to authenticated;
grant execute on function amaw_find_lot(text, text, text, integer)               to authenticated;
grant execute on function amaw_save_department_record(uuid, text, jsonb, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Triggers: stamp identity, bump revisions, write the audit trail
-- ---------------------------------------------------------------------
-- Server-side so no page can skip it - the same reasoning as designs_guard().
create or replace function amaw_lots_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare me technicians;
begin
  select * into me from technicians where user_id = auth.uid();
  if me.sm_id is null then raise exception 'no technician row for this user'; end if;
  if tg_op = 'INSERT' then
    new.author_user_id := auth.uid();
    new.sm_id          := me.sm_id;
    new.author_name    := coalesce(nullif(new.author_name, ''), me.first_name || ' ' || me.last_name);
    new.status         := 'Open';
    new.created_at     := now();
    new.updated_at     := now();
    return new;
  end if;
  -- Identity is immutable. A lot that changes contract or plant is a
  -- different lot, and re-keying one would silently move a week of test data
  -- to another job.
  new.id             := old.id;
  new.contract_id    := old.contract_id;
  new.amp_number     := old.amp_number;
  new.mix_id         := old.mix_id;
  new.lot_number     := old.lot_number;
  new.author_user_id := old.author_user_id;
  new.sm_id          := old.sm_id;
  new.created_at     := old.created_at;
  new.updated_at     := now();
  return new;
end $$;

create or replace function amaw_lots_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare me technicians;
begin
  select * into me from technicians where user_id = auth.uid();
  if tg_op = 'INSERT' then
    insert into amaw_lot_events (lot_id, user_id, sm_id, kind, to_status, note)
      values (new.id, auth.uid(), me.sm_id, 'created', new.status,
              'Lot ' || new.lot_number || ' started at ' || new.amp_number);
  elsif new.status is distinct from old.status then
    insert into amaw_lot_events (lot_id, user_id, sm_id, kind, from_status, to_status)
      values (new.id, auth.uid(), me.sm_id, 'status', old.status, new.status);
  else
    insert into amaw_lot_events (lot_id, user_id, sm_id, kind)
      values (new.id, auth.uid(), me.sm_id, 'saved');
  end if;
  return new;
end $$;

-- Records: stamp who entered it and bump `revision` here rather than in the
-- page, so the number cannot be forged or forgotten. A client that sends a
-- stale revision is caught by its own `.eq('revision', seen)` matching no row.
create or replace function amaw_lot_records_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare me technicians;
begin
  select * into me from technicians where user_id = auth.uid();
  if me.sm_id is null then raise exception 'no technician row for this user'; end if;
  new.sm_id        := me.sm_id;
  new.entered_by   := auth.uid();
  new.entered_name := me.first_name || ' ' || me.last_name;
  new.updated_at   := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.revision   := 1;
  else
    new.lot_id     := old.lot_id;
    new.block      := old.block;
    new.created_at := old.created_at;
    new.revision   := old.revision + 1;
  end if;
  return new;
end $$;

create or replace function amaw_lot_records_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into amaw_lot_events (lot_id, user_id, sm_id, kind, block)
    values (new.lot_id, auth.uid(), new.sm_id, 'record', new.block);
  return new;
end $$;

drop trigger if exists amaw_lots_guard_trg on amaw_lots;
create trigger amaw_lots_guard_trg before insert or update on amaw_lots
  for each row execute function amaw_lots_guard();
drop trigger if exists amaw_lots_audit_trg on amaw_lots;
create trigger amaw_lots_audit_trg after insert or update on amaw_lots
  for each row execute function amaw_lots_audit();

drop trigger if exists amaw_lot_records_guard_trg on amaw_lot_records;
create trigger amaw_lot_records_guard_trg before insert or update on amaw_lot_records
  for each row execute function amaw_lot_records_guard();
drop trigger if exists amaw_lot_records_audit_trg on amaw_lot_records;
create trigger amaw_lot_records_audit_trg after insert or update on amaw_lot_records
  for each row execute function amaw_lot_records_audit();

-- SECURITY DEFINER trigger functions must not be callable directly.
revoke all on function amaw_lots_guard()         from public, anon, authenticated;
revoke all on function amaw_lots_audit()         from public, anon, authenticated;
revoke all on function amaw_lot_records_guard()  from public, anon, authenticated;
revoke all on function amaw_lot_records_audit()  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- What PlantBook lists. security_invoker: the caller's amaw_lots RLS applies.
-- ---------------------------------------------------------------------
-- This is the screen the Portal lost on 2026-09-04 - with nothing stored
-- there was no queue to render. Under this model there is one for PlantBook:
-- open lots at your plants, and how many of the seven records are in.
create or replace view amaw_lot_summaries
with (security_invoker = true) as
  select l.id, l.contract_id, l.amp_number, p.name as plant_name,
         l.mix_id, l.mix_signature, l.lot_number, l.status,
         l.sm_id, l.author_name, l.author_user_id,
         (select count(*) from amaw_lot_records r where r.lot_id = l.id)                          as records_entered,
         (select count(*) from amaw_lot_records r where r.lot_id = l.id and r.block like 'QC%')   as sublots_entered,
         (select max(r.updated_at) from amaw_lot_records r where r.lot_id = l.id)                 as last_record_at,
         l.created_at, l.updated_at
    from amaw_lots l
    left join plants p on p.amp_number = l.amp_number;

grant select on amaw_lot_summaries to authenticated;

commit;

-- ---------------------------------------------------------------------
-- After applying
-- ---------------------------------------------------------------------
--   1. Run the database linter (get_advisors). Expect it to be clean; if it
--      flags a SECURITY DEFINER function as callable by anon, a revoke above
--      did not run.
--   2. Test the policies the way designs.sql was tested: a rolled-back
--      transaction impersonating a contractor tech at one plant, a second
--      contractor tech at the SAME plant (must be able to open the first
--      one's lot - that is the whole point), an unrelated technician (must
--      see nothing), and a Central Office account. execute_sql runs
--      read-only, so a write test goes through apply_migration and ends in
--      `raise exception` so nothing is recorded.
--   3. Check the case this file cannot currently serve: a district
--      technician with no plant access writing QA01. Today that works only
--      if they happen to hold can_review. That is the stand-in, not the
--      answer - see the DEPARTMENT block.
--
-- To back it out:  drop view amaw_lot_summaries; drop table amaw_lot_events,
-- amaw_lot_records, amaw_lots; and drop the six functions. Nothing else in
-- the schema references them.
