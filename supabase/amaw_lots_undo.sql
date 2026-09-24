-- =====================================================================
--  UNDO supabase/amaw_lots.sql - remove PlantBook lot storage entirely
-- =====================================================================
--
--  Written 2026-09-24 (Andrew), before amaw_lots.sql was applied, so there
--  is a tested way back if KYTC (Tate) decides against storing lot data in
--  Supabase. Run it the same way as the migration: open this file raw,
--  paste the whole thing into the SQL Editor on project iwysxhcmvhkcjxmjarkd,
--  run once. It is one transaction - it removes everything or nothing.
--
--  WHAT IT DELETES THAT CANNOT COME BACK: every lot a contractor saved to
--  Supabase since the migration was applied - the ledger (amaw_lots), the
--  lot envelopes (amaw_lot_data) and the audit trail (amaw_lot_events).
--  "Permanent" in amaw_lots.sql means no APP role can delete a ledger row;
--  an admin dropping the table is not stopped by anything. Export first if
--  any of it is worth keeping:
--      select * from amaw_lots;  select * from amaw_lot_events;
--  Each contractor's browser keeps its own copy of their lots, and any lot
--  PDF or .json they downloaded still opens - the page is local-first.
--
--  WHAT THE PAGE DOES AFTERWARDS: exactly what it did before the migration.
--  PostgREST answers the missing tables with PGRST205 / 42P01, which
--  storage.mjs reports as `not_set_up`, so the sync chip, "not yet sent"
--  and the retention line stay hidden and a lot saves, lists and submits
--  out of the browser. No page change is needed in either direction.
--  Including for a contractor whose lots WERE syncing when this ran: the
--  browser harness check `lotremoved` (scripts/amaw/harness/checks/) starts a
--  lot with the tables live, removes them mid-session and again across a
--  reload, and the lot keeps everything typed before and after, reopens from
--  the device's list, and submits.
--
--  WHAT IT TOUCHES: only the objects amaw_lots.sql creates - 3 tables (their
--  indexes, RLS policies, triggers and grants go with them), 1 view and 9
--  functions - plus the pg_cron job, if one was ever scheduled. Checked
--  2026-09-24 that none of those names existed on the live project before
--  the migration, so nothing that predates it is dropped. It does NOT touch
--  `amaw_types`, which is a different, live table.
--
--  No CASCADE, deliberately. If something is ever built on top of these
--  tables (another view, a foreign key), this script stops with an error
--  naming it rather than silently dropping it as well.
--
--  Safe to run twice, and safe on a project where the migration was never
--  applied: every statement is IF EXISTS.
--
--  Tested on a scratch Postgres 16 (scripts/supabase/check_amaw_lots_undo.mjs):
--  apply, fill with lots (open, submitted, accepted, purged), undo, and the
--  public schema's objects and grants match the pre-migration snapshot
--  exactly; then re-apply and the 38-case impersonation suite still passes.

begin;

-- The retention sweep, if section 8 of amaw_lots.sql was ever run. A job left
-- behind would call a function that no longer exists, every night, and fail.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'amaw-purge-expired';
  end if;
end $$;

-- The view reads amaw_lots, so it goes first.
drop view if exists amaw_lot_summaries;

-- amaw_seal_lot() RETURNS amaw_lots - the table's row type - so Postgres
-- will not drop the table while it exists. Found by the test, not by
-- reading: the first draft dropped the tables first and stopped here.
drop function if exists amaw_seal_lot(uuid, text, text, text);

-- One statement, so the foreign keys between the three do not matter.
-- Their policies (which call plantbook_at_plant) and triggers go with them,
-- which is what frees the functions below.
drop table if exists amaw_lot_events, amaw_lot_data, amaw_lots;

-- The three trigger functions, the two purges and the three RLS helpers.
drop function if exists
  amaw_purge_expired(),
  amaw_purge_contract(text, text),
  amaw_lots_guard(),
  amaw_lots_audit(),
  amaw_lot_data_guard(),
  plantbook_at_plant(text),
  plantbook_reviewer(),
  amaw_retention_days();

commit;

-- Afterwards, this should return no rows:
--   select 'relation' as kind, relname as name from pg_class where relname like 'amaw_lot%'
--   union all
--   select 'function', proname from pg_proc
--    where proname in ('plantbook_at_plant','plantbook_reviewer','amaw_retention_days',
--                      'amaw_seal_lot','amaw_purge_expired','amaw_purge_contract',
--                      'amaw_lots_guard','amaw_lots_audit','amaw_lot_data_guard');
