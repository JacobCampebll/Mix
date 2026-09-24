-- amaw_lots + amaw_lot_data + amaw_lot_events: PlantBook storage.
--
-- *** APPLIED 2026-09-24 to iwysxhcmvhkcjxmjarkd (issue #28), as migrations
-- `amaw_lots` and `amaw_lot_summaries_grants`. ***
-- The second is the view revoke now in section 10: this file originally
-- granted select on amaw_lot_summaries without first revoking Supabase's
-- automatic grants, so anon and authenticated held full privileges on the
-- view. That exposed nothing (security_invoker, and a join view is not
-- updatable), but it was not the intent. Undo: supabase/amaw_lots_undo.sql.
--
-- To apply to another project: run it in the SQL Editor as one transaction,
-- then run the database linter (get_advisors) as CLAUDE.md requires after
-- any DDL change - not just once. The verification block at the foot of
-- this file is what to run afterwards.
--
-- ---------------------------------------------------------------------
-- The decision this file implements
-- ---------------------------------------------------------------------
-- Jake, 2026-09-22: "I think the idea of the information of the plantbook
-- data is deleted once the project is over or a week after is the best way to
-- do this. Along the way contractors will still be downloading the pdf as a
-- back up. Storage has to be the way."
--
-- That REVERSES the ledger-only decision taken the day before, and it settles
-- the question docs/plantbook-storage.md has carried since 2026-09-13. Three
-- things follow from it, and every table below is one of them:
--
--   1. A lot's full working data lives here while the lot is being produced,
--      so a week-long lot assembled across shifts and devices is not one
--      laptop's localStorage away from being lost, and so KYTC can see that a
--      lot exists and where it stands.
--   2. It is DELETED on a retention rule - a week after submission, or the
--      moment the contract is closed out, whichever comes first. This is not
--      a cost measure (a filled lot is 32 KB, and 200 of them are 1% of the
--      free tier); it is a custody measure. Test data that no longer has to
--      be here is not here.
--   3. The LEDGER ROW SURVIVES THE PURGE. Identity, status, who and when, and
--      the submittal hash are permanent and small. That is what answers "how
--      many lots are on this mix on this contract, and which were submitted",
--      and it is what a contractor cannot quietly rewrite afterwards.
--
-- The generated AMAW .xlsm is still what KYTC loads into MEDL, and the lot
-- PDF is still the contractor's own permanent copy. Neither changes. This is
-- the workbench for the days the lot is accruing, plus a permanent receipt.
--
-- ---------------------------------------------------------------------
-- Why PlantBook needs storage when DesignBook deliberately does not
-- ---------------------------------------------------------------------
-- A mix design is filled in one sitting by one person. An AMAW lot is 4,000
-- tons as four 1,000-ton sublots and the two real lots on file ran 2026-07-26
-- to 07-31 and 08-03 to 08-06. Seven test records (VI01, QC01-QC04, QA01,
-- IQ01, ~210 fields each - docs/amaw-map.md) are filled at different times by
-- different people. The file model's single-holder assumption is the thing
-- that does not survive contact with a real lot.
--
-- ---------------------------------------------------------------------
-- Three shapes, three lifetimes
-- ---------------------------------------------------------------------
--   amaw_lots       the ledger.  One small row per lot.  PERMANENT.
--   amaw_lot_data   the envelope. One jsonb row per lot.  PURGED on retention.
--   amaw_lot_events the audit.    A handful of rows per lot. PERMANENT.
--
-- Splitting the envelope out of the ledger is what makes the purge a DELETE
-- rather than a blanking. A ledger row physically cannot carry stale test
-- data, and a purged lot is distinguishable from a lot nobody has typed into
-- yet - which a `values = '{}'` row would not be.
--
-- ---------------------------------------------------------------------
-- What is deliberately NOT here
-- ---------------------------------------------------------------------
-- There is no amaw_lot_records table, and its absence is a decision rather
-- than an omission. One row per MEDL block (VI01, QC01-QC04, QA01, IQ01)
-- exists to let a KYTC district technician write QA01 without touching the
-- contractor's four sublots. Nothing can do that today: district scoping -
-- which district a technician belongs to, and which contracts that reaches -
-- has no representation in this schema at all, and CLAUDE.md records it as
-- Andrew's open question. A table nothing writes is a table that rots.
--
-- The envelope's `records` map is stored inside amaw_lot_data.records for
-- when that question is answered; moving it out to its own table then is an
-- additive migration, not a re-interpretation.
--
-- Until then a reviewer (Central Office, all_plants) updates the lot the same
-- way the plant does. That is the crude version of the department path and it
-- is honest about being crude.

-- =====================================================================
-- 1. amaw_lots - the ledger. One row per lot. Never purged.
-- =====================================================================
create table if not exists amaw_lots (
  -- CLIENT-SUPPLIED, not gen_random_uuid(). A lot is started at a plant that
  -- may have no signal, so it needs an identity before it has ever reached a
  -- server - that is what makes the offline queue an upsert rather than a
  -- reconciliation. PlantBook mints it once, in blankLot(), and it rides in
  -- the .json and in the lot PDF from then on.
  id              uuid primary key,

  -- ---- the six-part identity (CLAUDE.md, settled 2026-09-17) ----------
  -- The lot number restarts per contract + LINE ITEM + design + plant, and
  -- KYTC's district can switch a job from compaction Option A to Option B
  -- mid-project, which changes what is measured and how the lot is paid. So
  -- two lots identical in the first five parts can still be different
  -- records.
  --
  -- These are COLUMNS WITH A UNIQUE INDEX, not the primary key, and that is
  -- the whole reason the key above is a uid. Correcting a mistyped density
  -- option on an open lot has to UPDATE this row; if the option were part of
  -- the key it would fork the lot into two rows instead, with the week's work
  -- stranded on the old one.
  contract_id     text not null,
  -- The contract line the lot is produced under. '' when the contract's own
  -- items have not been looked up yet, or when two lines could be this mix -
  -- which expectedLots() already refuses to guess between. NOT NULL with a ''
  -- default rather than nullable: Postgres treats NULLs as distinct in a
  -- unique index, so a nullable column here would silently stop guarding.
  line_item       text not null default '',
  amp_number      text not null references plants(amp_number),
  -- 'Pay Values'!D9 is "00385 CL3 ASPH SURF 0.38A PG64-22" - the approved
  -- design's MIX ID followed by its signature. Both halves are kept: mix_id
  -- to key on, mix_signature because it is what a human reads.
  mix_id          text not null,
  mix_signature   text,
  lot_number      integer not null check (lot_number > 0),
  density_option  text not null default '' check (density_option in ('', 'A', 'B')),

  -- ---- who ----------------------------------------------------------
  sm_id           text not null references technicians(sm_id),
  author_user_id  uuid not null default auth.uid(),
  -- Denormalised for the same reason designs.author_name is: a contractor
  -- cannot read another technician's technicians row, so there is nothing to
  -- join to for a display name.
  author_name     text not null,

  -- ---- the chain ----------------------------------------------------
  -- Open -> Submitted -> Accepted, one way. Jake, 2026-09-22: "A lot is never
  -- opened by a contractor or kytc after it has been submitted to the state."
  -- Enforced by amaw_lots_guard() below, and only ever advanced through
  -- amaw_seal_lot() - a client cannot write any column in this block.
  status          text not null default 'Open'
                  check (status in ('Open', 'Submitted', 'Accepted')),
  submitted_at    timestamptz,
  submitted_by    uuid,
  submitted_name  text,
  accepted_at     timestamptz,
  accepted_by     uuid,
  accepted_name   text,
  -- SHA-256 of the frozen submittal payload the lot PDF carries, hex. This is
  -- what lets KYTC check that the PDF in their inbox is the lot that was
  -- sealed here, the same way verify.html checks a DesignBook approval.
  submittal_sha256 text check (submittal_sha256 ~ '^[0-9a-f]{64}$'),
  -- The previous lot's submittal_sha256, carried forward by
  -- PB_LOT.rollForwardLot(). Lot 8 provably followed the lot 7 that was
  -- submitted, so a lot cannot be quietly inserted into or removed from a
  -- contract's sequence after the fact.
  prev_sha256      text check (prev_sha256 ~ '^[0-9a-f]{64}$'),

  -- ---- retention ----------------------------------------------------
  -- Null while the lot is Open: live work is never purged, however long it
  -- takes. Stamped by amaw_seal_lot() at submission.
  purge_after     timestamptz,
  purged_at       timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The natural key. A second row for the same lot is a bug, not a revision.
create unique index if not exists amaw_lots_identity_idx
  on amaw_lots (contract_id, line_item, amp_number, mix_id, lot_number, density_option);
create index if not exists amaw_lots_plant_status_idx on amaw_lots (amp_number, status);
create index if not exists amaw_lots_contract_idx     on amaw_lots (contract_id, mix_id, lot_number);
create index if not exists amaw_lots_author_idx       on amaw_lots (author_user_id);
-- Partial, because the purge sweep asks only this question.
create index if not exists amaw_lots_purge_idx        on amaw_lots (purge_after)
  where purge_after is not null and purged_at is null;

comment on table amaw_lots is
  'The permanent ledger: one small row per AMAW acceptance lot (4,000 tons as four sublots). Identity, status, who, when, and the submittal hash. Survives the retention purge - amaw_lot_data does not. See docs/plantbook-storage.md.';

-- =====================================================================
-- 2. amaw_lot_data - the working envelope. Purged on retention.
-- =====================================================================
-- One row, one lot, and the body is PlantBook's own envelope rather than a
-- second shape: `values`, `rows`, `records`, `extracted_from`, `history` are
-- exactly what lotSnapshot() produces and what openLotEnvelope() reads back.
-- The page and this table therefore cannot disagree about what a lot is,
-- which is the seam that has failed silently three times already in this
-- codebase (LOT_FIELD_ALIASES, LOT_TABLE_ROUTES, DESIGN_LIFTS).
create table if not exists amaw_lot_data (
  lot_id          uuid primary key references amaw_lots(id) on delete cascade,

  -- Lot-level scalars: the Contract & Mix step, the binder block, the
  -- approval's own `design` block.
  values          jsonb not null default '{}'::jsonb,
  -- Every repeating table, flat, keyed as the form keys them. Core count is
  -- NOT fixed - lot 1 of the two real AMAWs has six mat cores, lot 2 has ten.
  rows            jsonb not null default '{}'::jsonb,
  -- block -> {values, rows, ...}. Unused by today's page; see the note at the
  -- head of this file about amaw_lot_records.
  records         jsonb not null default '{}'::jsonb,
  -- field -> source cell / lookup. The provisional-values contract: an
  -- imported value is a starting point, never an authority (CLAUDE.md).
  extracted_from  jsonb not null default '{}'::jsonb,
  history         jsonb not null default '[]'::jsonb,

  -- Optimistic concurrency. The client sends the revision it last read; a
  -- save that matches nothing means somebody else got there first. A
  -- week-long lot across two shifts makes a stale tab ordinary, not
  -- exceptional, so this needs its own sentence on screen rather than a
  -- generic failure.
  revision        integer not null default 0,
  saved_by        uuid,
  saved_name      text,
  -- The client's own clock when the save was MADE, which is not when it
  -- ARRIVED: an offline queue flushes an hour later. Both are kept.
  client_saved_at timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table amaw_lot_data is
  'A lot''s working data, in PlantBook''s own envelope shape. DELETED by amaw_purge_expired() a week after submission, or by amaw_purge_contract() when a job closes out. The lot PDF the contractor downloaded is the permanent copy.';

-- =====================================================================
-- 3. amaw_lot_events - append-only audit. Permanent, and small.
-- =====================================================================
-- Same shape and reasoning as design_events. It matters more here: a lot is
-- data KYTC accepts tonnage on, assembled by several people over a week, and
-- "who submitted this, and when" has no other answer once the data is gone.
--
-- NOTE WHAT IS NOT LOGGED: an ordinary save. PlantBook autosaves, so a
-- per-save event would be thousands of rows a lot and would bury the four
-- that matter. The lot's own `history` array carries the fine grain while the
-- data lives; this table carries what has to outlive it.
create table if not exists amaw_lot_events (
  id          bigserial primary key,
  lot_id      uuid not null references amaw_lots(id) on delete cascade,
  at          timestamptz not null default now(),
  user_id     uuid,
  sm_id       text,
  kind        text not null check (kind in ('created', 'status', 'purged', 'note')),
  from_status text,
  to_status   text,
  note        text
);
create index if not exists amaw_lot_events_lot_idx on amaw_lot_events (lot_id, at);

-- =====================================================================
-- 4. RLS ON before any grant.
-- =====================================================================
-- A table with RLS enabled and no policy denies everything, which is the safe
-- starting point: turn it on first, then add policies. With RLS off, the anon
-- key that ships in every page's CONFIG hands anyone who views source full
-- read/write on these tables (CLAUDE.md).
alter table amaw_lots      enable row level security;
alter table amaw_lot_data  enable row level security;
alter table amaw_lot_events enable row level security;

revoke all on amaw_lots, amaw_lot_data, amaw_lot_events from anon, authenticated;
grant select, insert, update, delete on amaw_lots     to authenticated;
grant select, insert, update, delete on amaw_lot_data to authenticated;
grant select                         on amaw_lot_events to authenticated;  -- written by trigger and by the sealing function only

-- =====================================================================
-- 5. Helpers
-- =====================================================================
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
language sql stable security invoker set search_path = public, pg_temp
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

-- May this account act for KYTC? Same column designs.sql already uses, and
-- deliberately separate from all_plants: "sees every plant" and "may approve"
-- are different powers even though the same 12 Central Office people hold
-- both (CLAUDE.md).
create or replace function plantbook_reviewer()
returns boolean
language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce((select can_review from technicians where user_id = auth.uid()), false)
$$;

-- How long a submitted lot's data stays. Jake, 2026-09-22: "deleted once the
-- project is over or a week after". One place to change it.
create or replace function amaw_retention_days()
returns integer
language sql immutable set search_path = public, pg_temp
as $$ select 7 $$;

revoke all on function plantbook_at_plant(text) from public, anon;
revoke all on function plantbook_reviewer()     from public, anon;
revoke all on function amaw_retention_days()    from public, anon;
grant execute on function plantbook_at_plant(text) to authenticated;
grant execute on function plantbook_reviewer()     to authenticated;
grant execute on function amaw_retention_days()    to authenticated;

-- =====================================================================
-- 6. Policies
-- =====================================================================
-- Read is plant-scoped, not author-scoped, and that is the point: the night
-- shift must open the lot the day shift started. Through all_plants it also
-- means the 12 Central Office people can read a contractor's in-progress QC
-- data before the lot is submitted - which Jake answered directly
-- (2026-09-22): "technically its the contractors until it gets submitted but
-- its not a bad idea to let kytc into the file."
create policy "amaw_lots: read at an accessible plant"
  on amaw_lots for select to authenticated
  using (plantbook_at_plant(amp_number));

create policy "amaw_lots: insert as yourself at an accessible plant"
  on amaw_lots for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and sm_id = (select sm_id from technicians where user_id = auth.uid())
    and plantbook_at_plant(amp_number)
    -- A lot is born Open and unsealed. Everything in the chain block is the
    -- sealing function's to write; a client that sends them is refused here
    -- rather than quietly having them ignored.
    and status = 'Open'
    and submitted_at is null and accepted_at is null
    and submittal_sha256 is null and purge_after is null and purged_at is null
  );

-- Any PlantBook technician at the plant may update, not just the author. A
-- lot spans shifts and the author may be off that week; author-only here
-- would reproduce the file model's single-holder assumption in the database.
-- WHAT they may change is narrowed by amaw_lots_guard(), not by this policy:
-- a policy can say who, but it cannot say "every column except these seven".
create policy "amaw_lots: update at an accessible plant"
  on amaw_lots for update to authenticated
  using      (plantbook_at_plant(amp_number) and status = 'Open')
  with check (plantbook_at_plant(amp_number));

create policy "amaw_lots: author deletes own open lot"
  on amaw_lots for delete to authenticated
  using (author_user_id = auth.uid() and status = 'Open');

-- Reading a lot's data follows reading its lot. `exists (select 1 from
-- amaw_lots ...)` re-runs that table's own SELECT policy, so there is one
-- definition of who can see a lot rather than two that can drift - the same
-- construction as "design_events: read for visible designs".
create policy "amaw_lot_data: read for visible lots"
  on amaw_lot_data for select to authenticated
  using (exists (select 1 from amaw_lots l where l.id = amaw_lot_data.lot_id));

-- Writes only while the lot is Open. After submission the lot is the state's
-- and the data is waiting to be purged; an edit then would change what was
-- submitted without changing the hash that says what was submitted.
create policy "amaw_lot_data: write for open visible lots"
  on amaw_lot_data for insert to authenticated
  with check (exists (
    select 1 from amaw_lots l
     where l.id = amaw_lot_data.lot_id and l.status = 'Open' and plantbook_at_plant(l.amp_number)
  ));

create policy "amaw_lot_data: update for open visible lots"
  on amaw_lot_data for update to authenticated
  using (exists (
    select 1 from amaw_lots l
     where l.id = amaw_lot_data.lot_id and l.status = 'Open' and plantbook_at_plant(l.amp_number)
  ))
  with check (exists (
    select 1 from amaw_lots l
     where l.id = amaw_lot_data.lot_id and l.status = 'Open' and plantbook_at_plant(l.amp_number)
  ));

create policy "amaw_lot_data: author deletes own open lot's data"
  on amaw_lot_data for delete to authenticated
  using (exists (
    select 1 from amaw_lots l
     where l.id = amaw_lot_data.lot_id and l.status = 'Open' and l.author_user_id = auth.uid()
  ));

create policy "amaw_lot_events: read for visible lots"
  on amaw_lot_events for select to authenticated
  using (exists (select 1 from amaw_lots l where l.id = amaw_lot_events.lot_id));

-- =====================================================================
-- 7. Sealing - the one-way door
-- =====================================================================
-- Everything in the chain block (status, submitted_*, accepted_*, the two
-- hashes, purge_after) is written HERE and nowhere else. The guard trigger
-- below refuses a client-side change to any of them, and this function is the
-- only thing that lifts that refusal - by setting a transaction-local GUC the
-- trigger reads. A contractor holding the anon key therefore cannot mark
-- their own lot Accepted, cannot back it out of Submitted, and cannot restamp
-- a hash over one KYTC already holds.
--
-- SECURITY DEFINER because it writes columns its caller cannot, and because a
-- reviewer accepting a lot has plant access through all_plants but should not
-- need UPDATE on the chain to do it. It re-checks authority itself rather
-- than inheriting any.
create or replace function amaw_seal_lot(
  p_lot_id   uuid,
  p_status   text,
  p_sha256   text default null,
  p_prev     text default null
)
returns amaw_lots
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_lot   amaw_lots;
  v_me    uuid := auth.uid();
  v_sm    text;
  v_name  text;
  v_days  integer := amaw_retention_days();
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_status not in ('Submitted', 'Accepted') then
    raise exception 'amaw_seal_lot only seals to Submitted or Accepted, not %', p_status
      using errcode = '22023';
  end if;

  -- technicians carries first_name / last_name, not a full_name column.
  select t.sm_id, btrim(coalesce(t.first_name,'') || ' ' || coalesce(t.last_name,''))
    into v_sm, v_name
    from technicians t where t.user_id = v_me;
  if v_name = '' then v_name := null; end if;

  -- Lift the guard for this transaction only. amaw_lots_guard() reads this
  -- GUC and is the reason a client holding the anon key cannot write a single
  -- column of the chain block itself. `true` is is_local: it dies with the
  -- transaction, so it cannot leak into the next statement on this
  -- connection.
  perform set_config('amaw.sealing', 'on', true);

  select * into v_lot from amaw_lots where id = p_lot_id for update;
  if not found then
    raise exception 'no such lot' using errcode = 'P0002';
  end if;

  -- Authority. Submitting is the plant's act; accepting is KYTC's.
  if p_status = 'Submitted' then
    if not plantbook_at_plant(v_lot.amp_number) then
      raise exception 'this lot is not at a plant you hold PlantBook for' using errcode = '42501';
    end if;
    if v_lot.status <> 'Open' then
      raise exception 'lot % is already %, and a lot is never reopened once submitted',
        v_lot.lot_number, v_lot.status using errcode = '22023';
    end if;
    if p_sha256 is null then
      raise exception 'a submitted lot needs the submittal hash' using errcode = '22023';
    end if;
    update amaw_lots set
        status           = 'Submitted',
        submitted_at     = now(),
        submitted_by     = v_me,
        submitted_name   = coalesce(v_name, v_sm, 'unknown'),
        submittal_sha256 = p_sha256,
        -- Only ever set, never overwritten: the chain back to lot n-1 is
        -- established when the lot is sealed and is not re-openable.
        prev_sha256      = coalesce(v_lot.prev_sha256, p_prev),
        purge_after      = now() + make_interval(days => v_days),
        updated_at       = now()
      where id = p_lot_id
      returning * into v_lot;
  else
    if not plantbook_reviewer() then
      raise exception 'only KYTC accepts a lot' using errcode = '42501';
    end if;
    if v_lot.status <> 'Submitted' then
      raise exception 'lot % is %, and only a submitted lot can be accepted',
        v_lot.lot_number, v_lot.status using errcode = '22023';
    end if;
    update amaw_lots set
        status        = 'Accepted',
        accepted_at   = now(),
        accepted_by   = v_me,
        accepted_name = coalesce(v_name, v_sm, 'unknown'),
        updated_at    = now()
      where id = p_lot_id
      returning * into v_lot;
  end if;

  insert into amaw_lot_events (lot_id, user_id, sm_id, kind, from_status, to_status)
    values (p_lot_id, v_me, v_sm, 'status', 'Open', p_status);
  return v_lot;
end;
$$;

revoke all on function amaw_seal_lot(uuid, text, text, text) from public, anon;
grant execute on function amaw_seal_lot(uuid, text, text, text) to authenticated;

-- =====================================================================
-- 8. Retention - the purge
-- =====================================================================
-- Two ways a lot's data goes away, both of them deletes of amaw_lot_data
-- alone. The ledger row and its events stay.
--
--   amaw_purge_expired()  the clock. Everything past purge_after.
--   amaw_purge_contract() the job closed out. Everything on one contract.
--
-- Neither touches an Open lot, ever. Live work has no purge_after, and the
-- contract sweep skips it explicitly - a contractor still producing under a
-- contract KYTC considers finished is a conversation, not a deletion.
create or replace function amaw_purge_expired()
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from amaw_lots
   where status <> 'Open'
     and purge_after is not null
     and purged_at is null
     and purge_after <= now();

  if v_ids is null then return 0; end if;

  perform set_config('amaw.sealing', 'on', true);   -- purged_at is a chain column
  delete from amaw_lot_data where lot_id = any(v_ids);
  update amaw_lots set purged_at = now(), updated_at = now() where id = any(v_ids);
  insert into amaw_lot_events (lot_id, kind, note)
    select unnest(v_ids), 'purged',
           'retention: ' || amaw_retention_days() || ' days after submission';
  return array_length(v_ids, 1);
end;
$$;

-- KYTC's explicit "this job is finished" sweep. Reviewer-only: a contractor
-- closing out their own contract's lots early would be deleting the state's
-- evidence, not their own.
create or replace function amaw_purge_contract(p_contract_id text, p_note text default null)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_me  uuid := auth.uid();
begin
  if not plantbook_reviewer() then
    raise exception 'only KYTC closes out a contract' using errcode = '42501';
  end if;

  select array_agg(id) into v_ids
    from amaw_lots
   where contract_id = p_contract_id
     and status <> 'Open'
     and purged_at is null;

  if v_ids is null then return 0; end if;

  perform set_config('amaw.sealing', 'on', true);   -- purged_at is a chain column
  delete from amaw_lot_data where lot_id = any(v_ids);
  update amaw_lots set purged_at = now(), updated_at = now() where id = any(v_ids);
  insert into amaw_lot_events (lot_id, user_id, kind, note)
    select unnest(v_ids), v_me, 'purged',
           coalesce(p_note, 'contract ' || p_contract_id || ' closed out');
  return array_length(v_ids, 1);
end;
$$;

revoke all on function amaw_purge_expired()              from public, anon, authenticated;
revoke all on function amaw_purge_contract(text, text)   from public, anon;
grant execute on function amaw_purge_contract(text, text) to authenticated;

-- THE SWEEP HAS TO BE SCHEDULED OR IT NEVER RUNS, and nothing in the browser
-- should be calling a global purge. pg_cron is the right home for it; it is
-- an extension Andrew enables on the project (Database -> Extensions), and it
-- is left commented because enabling an extension is a separate decision from
-- applying a schema.
--
--   create extension if not exists pg_cron;
--   select cron.schedule('amaw-purge-expired', '17 4 * * *', $cron$ select amaw_purge_expired(); $cron$);
--
-- Until it is scheduled, nothing is deleted and the retention rule is a
-- statement of intent rather than a fact. Say so rather than assuming it.

-- =====================================================================
-- 9. Guards - what a client may and may not change
-- =====================================================================
-- The identity is immutable once a lot exists, with two deliberate
-- exceptions: line_item and density_option, both of which arrive from a
-- lookup that legitimately runs after the lot is open (a change order
-- renumbers an item; the district switches the compaction option mid-job).
-- Everything in the chain block is refused unless amaw_seal_lot() is the one
-- asking - which it says by setting a transaction-local GUC no client can
-- reach through PostgREST.
create or replace function amaw_lots_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sealing boolean := coalesce(current_setting('amaw.sealing', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- Identity: pinned.
  new.id          := old.id;
  new.contract_id := old.contract_id;
  new.amp_number  := old.amp_number;
  new.mix_id      := old.mix_id;
  new.lot_number  := old.lot_number;
  new.sm_id       := old.sm_id;
  new.author_user_id := old.author_user_id;
  new.author_name := old.author_name;
  new.created_at  := old.created_at;

  if not v_sealing then
    -- The chain: only amaw_seal_lot() writes any of this. A client that
    -- sends it gets the old value back rather than an error, for the same
    -- reason the identity above does - a save is not the place to argue
    -- about a column the page should not have sent.
    new.status           := old.status;
    new.submitted_at     := old.submitted_at;
    new.submitted_by     := old.submitted_by;
    new.submitted_name   := old.submitted_name;
    new.accepted_at      := old.accepted_at;
    new.accepted_by      := old.accepted_by;
    new.accepted_name    := old.accepted_name;
    new.submittal_sha256 := old.submittal_sha256;
    new.prev_sha256      := old.prev_sha256;
    new.purge_after      := old.purge_after;
    new.purged_at        := old.purged_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function amaw_lots_audit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into amaw_lot_events (lot_id, user_id, sm_id, kind, to_status)
      values (new.id, auth.uid(), new.sm_id, 'created', new.status);
  end if;
  return null;
end;
$$;

create or replace function amaw_lot_data_guard()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.lot_id := old.lot_id;
    -- Optimistic concurrency, server-side so two tabs cannot both win by
    -- sending the same number. A client that sends the revision it read gets
    -- refused if anybody else has saved since.
    if new.revision is not null and new.revision <> old.revision then
      raise exception 'stale revision: this lot was saved by % at %',
        coalesce(old.saved_name, 'someone else'), old.updated_at
        using errcode = '40001';
    end if;
    new.revision := old.revision + 1;
  else
    new.revision := 0;
  end if;
  new.saved_by   := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists amaw_lots_guard_trg on amaw_lots;
create trigger amaw_lots_guard_trg before insert or update on amaw_lots
  for each row execute function amaw_lots_guard();

drop trigger if exists amaw_lots_audit_trg on amaw_lots;
create trigger amaw_lots_audit_trg after insert on amaw_lots
  for each row execute function amaw_lots_audit();

drop trigger if exists amaw_lot_data_guard_trg on amaw_lot_data;
create trigger amaw_lot_data_guard_trg before insert or update on amaw_lot_data
  for each row execute function amaw_lot_data_guard();

revoke all on function amaw_lots_guard()     from public, anon, authenticated;
revoke all on function amaw_lots_audit()     from public, anon, authenticated;
revoke all on function amaw_lot_data_guard() from public, anon, authenticated;

-- =====================================================================
-- 10. amaw_lot_summaries - the list, without the payload
-- =====================================================================
-- What a queue screen needs, and nothing a queue screen does not: this is the
-- answer to Jake's "KYTC to view a cid and see how many lots are on certain
-- mixes on that project and status if submitted or not". It reads the LEDGER,
-- so a purged lot is still listed - with `has_data` false, which is the
-- honest difference between "this lot's data is gone" and "this lot was never
-- filled in".
--
-- security_invoker so the caller's own RLS decides which rows they see. A
-- view is the one place in Postgres where forgetting that silently hands
-- every contractor's lots to every technician.
drop view if exists amaw_lot_summaries;
create view amaw_lot_summaries
  with (security_invoker = true)
as
  select l.id,
         l.contract_id, l.line_item, l.amp_number, p.name as plant_name,
         l.mix_id, l.mix_signature, l.lot_number, l.density_option,
         l.status, l.author_name, l.sm_id,
         l.submitted_at, l.submitted_name, l.accepted_at, l.accepted_name,
         l.submittal_sha256, l.prev_sha256,
         l.purge_after, l.purged_at,
         (d.lot_id is not null)                as has_data,
         coalesce(d.revision, 0)               as revision,
         coalesce(d.updated_at, l.updated_at)  as updated_at,
         d.saved_name,
         l.created_at
    from amaw_lots l
    left join amaw_lot_data d on d.lot_id = l.id
    left join plants p        on p.amp_number = l.amp_number;

-- Revoke first, as section 4 does for the tables. Supabase grants every new
-- relation in public to anon and authenticated automatically (until
-- 2026-10-30), so a bare grant leaves those in place - which is what the first
-- apply did.
revoke all on amaw_lot_summaries from anon, authenticated;
grant select on amaw_lot_summaries to authenticated;

-- =====================================================================
-- 11. After applying - run these
-- =====================================================================
-- 1. The linter, as CLAUDE.md requires after any DDL change:
--      select * from get_advisors('security');
--
-- 2. The tables and the view exist, and RLS is on all three:
--      select relname, relrowsecurity from pg_class
--       where relname in ('amaw_lots','amaw_lot_data','amaw_lot_events');
--
-- 3. The scoping actually scopes. Impersonate rather than assume - the way
--    the designs.sql policies were tested (CLAUDE.md): a rolled-back
--    transaction as a contractor, as a reviewer, and as an unrelated
--    technician. execute_sql runs read-only, so a write test goes through
--    apply_migration and ends in `raise exception` so nothing is recorded.
--
-- 4. The purge does nothing until pg_cron is enabled and the job scheduled -
--    see section 8. Check it with:
--      select * from cron.job where jobname = 'amaw-purge-expired';
