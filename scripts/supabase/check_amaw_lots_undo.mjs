// Proves supabase/amaw_lots_undo.sql puts a database back exactly as it was
// before supabase/amaw_lots.sql, with real lots in it, and that the migration
// can be applied again afterwards.
//
// SCRATCH DATABASE ONLY. This creates and drops a database called `undotest`,
// applies the migration, fills it and undoes it. Never point it at the live
// project.
//
//   node scripts/supabase/check_amaw_lots_undo.mjs
//
// Needs the `pg` and `embedded-postgres` npm packages. They are not in
// scripts/node_modules (nothing else needs a database), so point
// NODE_MODULES_DIR at a folder that has them:
//   npm i pg embedded-postgres@16.14.0-beta.17   (in any scratch folder)
//   NODE_MODULES_DIR=<that folder>/node_modules node scripts/supabase/check_amaw_lots_undo.mjs
// With PGHOST set instead, it uses that server rather than starting its own.
//
// After the undo it runs check_amaw_lots.py (Jake's 38 impersonation cases)
// against the re-applied schema, if python and psycopg2 are available.
//
// Not covered here: the pg_cron branch of the undo. pg_cron cannot be
// installed in a scratch server; the branch is guarded by an existence check
// on pg_extension, and this run proves that guard is safe when it is absent.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const MODS = process.env.NODE_MODULES_DIR || path.join(ROOT, "scripts/node_modules");
const req = createRequire(path.join(MODS, "noop.js"));
const pg = req("pg");

const FIXTURE = fs.readFileSync(path.join(HERE, "amaw_lots_fixture.sql"), "utf8");
const MIGRATION = fs.readFileSync(path.join(ROOT, "supabase/amaw_lots.sql"), "utf8");
// UNDO_FILE lets you watch this fail: point it at a copy with a line removed.
const UNDO = fs.readFileSync(process.env.UNDO_FILE || path.join(ROOT, "supabase/amaw_lots_undo.sql"), "utf8");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${!ok && detail ? `\n        ${detail}` : ""}`);
};

// ---- a server: an existing one (PGHOST) or a throwaway embedded one ----
let server = null, conn;
if (process.env.PGHOST) {
  conn = { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432),
           user: process.env.PGUSER || "postgres", password: process.env.PGPASSWORD };
} else {
  // embedded-postgres is ESM-only, so it is imported by resolved path rather than required.
  const { pathToFileURL } = await import("node:url");
  const EmbeddedPostgres = (await import(pathToFileURL(req.resolve("embedded-postgres")).href)).default;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "undotest-"));
  const port = 55000 + Math.floor(Math.random() * 1000);
  server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "password", port, persistent: false });
  await server.initialise();
  await server.start();
  conn = { host: "127.0.0.1", port, user: "postgres", password: "password" };
}

const admin = new pg.Client({ ...conn, database: "postgres" });
await admin.connect();
await admin.query("drop database if exists undotest");
await admin.query("create database undotest");
await admin.end();
const db = new pg.Client({ ...conn, database: "undotest" });
await db.connect();
db.on("notice", () => {});
const q = (sql, params) => db.query(sql, params);

// Everything a migration could leave behind in public or auth: relations
// (with their grants and RLS flag), functions (with their grants), policies,
// triggers, and the database's extensions.
async function snapshot() {
  const parts = await Promise.all([
    q(`select n.nspname, c.relname, c.relkind, c.relrowsecurity, coalesce(c.relacl::text,'') acl
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public','auth') order by 1,2`),
    q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, coalesce(p.proacl::text,'') acl
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','auth') order by 1,2,3`),
    q(`select schemaname, tablename, policyname from pg_policies order by 1,2,3`),
    q(`select tgrelid::regclass::text, tgname from pg_trigger where not tgisinternal order by 1,2`),
    q(`select extname from pg_extension order by 1`),
  ]);
  return parts.map((r) => r.rows.map((x) => JSON.stringify(x)));
}
const diff = (a, b) => {
  const out = [];
  a.forEach((list, i) => {
    const A = new Set(list), B = new Set(b[i]);
    list.filter((x) => !B.has(x)).forEach((x) => out.push(`- ${x}`));
    b[i].filter((x) => !A.has(x)).forEach((x) => out.push(`+ ${x}`));
  });
  return out;
};

// Sign in as someone the way check_amaw_lots.py does: the authenticated role
// plus the stand-in auth.uid().
async function as(uid, fn) {
  await q("begin");
  await q("set local role authenticated");
  await q("select set_config('test.uid', $1, true)", [uid]);
  try { const r = await fn(); await q("commit"); return r; }
  catch (e) { await q("rollback"); throw e; }
}
const JO = "11111111-1111-1111-1111-111111111111";      // contractor at AMP070302
const ANDREW = "44444444-4444-4444-4444-444444444444";  // KYTC reviewer
const lotId = (n) => `aaaaaaaa-0000-0000-0000-00000000000${n}`;
const newLot = (n, contract = "252112") => as(JO, async () => {
  await q(`insert into amaw_lots (id, contract_id, line_item, amp_number, mix_id, mix_signature,
             lot_number, density_option, sm_id, author_user_id, author_name)
           values ($1,$2,'0160','AMP070302','00260467','CL3 ASPH SURF 0.38A PG64-22',$3,'A',
             'jcavanah',$4,'Jo Cavanah')`, [lotId(n), contract, n, JO]);
  await q(`insert into amaw_lot_data (lot_id, values) values ($1, '{"lot_tons": 4000}')`, [lotId(n)]);
});

try {
  console.log("\n=== 1. the database before the migration ===");
  await q(FIXTURE);
  // A live table whose name starts like the migration's. The undo must leave it.
  await q("create table amaw_types (code text primary key, label text)");
  await q("insert into amaw_types values ('1','Superpave')");
  const before = await snapshot();
  check("fixture loaded (stand-ins for plants, technicians, auth.uid)", before[0].length > 5);

  console.log("\n=== 2. undo on a project that never had the migration ===");
  await q(UNDO);
  check("runs without error", true);
  const d0 = diff(before, await snapshot());
  check("and changes nothing", d0.length === 0, d0.join("\n        "));

  console.log("\n=== 3. apply the migration and use it ===");
  await q(MIGRATION);
  const applied = await snapshot();
  const added = diff(before, applied);
  check("the migration adds objects (sanity)", added.length > 20, `${added.length} differences`);
  await newLot(1);                                            // stays Open
  await newLot(2);                                            // Submitted
  await as(JO, () => q("select amaw_seal_lot($1,'Submitted',$2,$3)", [lotId(2), "b".repeat(64), "c".repeat(64)]));
  await newLot(3);                                            // Submitted, then Accepted by KYTC
  await as(JO, () => q("select amaw_seal_lot($1,'Submitted',$2)", [lotId(3), "d".repeat(64)]));
  await as(ANDREW, () => q("select amaw_seal_lot($1,'Accepted')", [lotId(3)]));
  await newLot(4, "999999");                                  // Submitted, then purged by close-out
  await as(JO, () => q("select amaw_seal_lot($1,'Submitted',$2)", [lotId(4), "e".repeat(64)]));
  await as(ANDREW, () => q("select amaw_purge_contract('999999','contract closed')"));
  const counts = (await q(`select (select count(*) from amaw_lots) lots,
                                  (select count(*) from amaw_lot_data) data,
                                  (select count(*) from amaw_lot_events) events,
                                  (select string_agg(status::text || coalesce('/purged' || (purged_at is not null)::text,''), ',' order by lot_number) from amaw_lots) st`)).rows[0];
  check("4 lots, 3 envelopes (one purged), audit events written",
        +counts.lots === 4 && +counts.data === 3 && +counts.events >= 4, JSON.stringify(counts));
  console.log(`        ${JSON.stringify(counts)}`);
  const guarded = await as(JO, () => q("update amaw_lots set status='Accepted' where id=$1", [lotId(2)]))
    .then(() => false, () => true);
  const stillSubmitted = (await q("select status from amaw_lots where id=$1", [lotId(2)])).rows[0].status === "Submitted";
  check("the one-way seal holds while applied (a contractor cannot accept their own lot)", guarded || stillSubmitted);

  console.log("\n=== 4. undo with lots in it ===");
  await q(UNDO);
  check("runs without error", true);
  const d1 = diff(before, await snapshot());
  check("public and auth match the pre-migration snapshot exactly - objects, grants, RLS, policies, triggers",
        d1.length === 0, d1.join("\n        "));
  const left = (await q(`select count(*) n from pg_class where relname like 'amaw_lot%'`)).rows[0].n;
  check("no amaw_lot* relation left", +left === 0);
  const types = (await q("select count(*) n from amaw_types")).rows[0].n;
  check("amaw_types (a different, live table) untouched, rows and all", +types === 1);
  const plants = (await q("select count(*) n from plants")).rows[0].n;
  check("the identity tables untouched", +plants === 3);

  console.log("\n=== 5. undo again ===");
  await q(UNDO);
  const d2 = diff(before, await snapshot());
  check("a second run is harmless", d2.length === 0, d2.join("\n        "));

  console.log("\n=== 6. it refuses rather than cascading ===");
  await q(MIGRATION);
  await q("create view someone_elses_report as select id, status from amaw_lots");
  const refused = await q(UNDO).then(() => null, (e) => e.message);
  if (refused) await q("rollback").catch(() => {});
  check("stops when something else is built on the tables", !!refused, "the undo ran to completion");
  console.log(`        error: ${refused}`);
  const intact = (await q(`select (select count(*) from pg_class where relname in ('amaw_lots','amaw_lot_data','amaw_lot_events','amaw_lot_summaries','someone_elses_report')) rels,
                                  (select count(*) from pg_proc where proname in ('amaw_seal_lot','plantbook_at_plant','amaw_lots_guard')) fns`)).rows[0];
  check("and, being one transaction, drops nothing at all", +intact.rels === 5 && +intact.fns === 3, JSON.stringify(intact));
  await q("drop view someone_elses_report");
  await q(UNDO);
  const d3 = diff(before, await snapshot());
  check("once the blocker is gone it completes, back to the snapshot", d3.length === 0, d3.join("\n        "));

  console.log("\n=== 7. apply again after the undo ===");
  await q(MIGRATION);
  const d4 = diff(applied, await snapshot());
  check("re-applying gives the same schema as the first apply", d4.length === 0, d4.join("\n        "));
} catch (e) {
  fail++;
  console.log(`  FAIL  unexpected error: ${e.message}`);
}
await db.end();

// Jake's 38 impersonation cases, against the re-applied schema.
console.log("\n=== 8. check_amaw_lots.py against the re-applied schema ===");
const py = spawnSync(process.env.PYTHON || "python",
  [path.join(HERE, "check_amaw_lots.py")],
  { env: { ...process.env, AMAW_TEST_DSN: `host=${conn.host} port=${conn.port} user=${conn.user} password=${conn.password} dbname=undotest` },
    encoding: "utf8" });
if (py.error || py.status === null) {
  console.log(`  SKIP  could not run python (${py.error ? py.error.message : "no exit status"})`);
} else {
  const tail = (py.stdout + py.stderr).trim().split("\n").slice(-3).join("\n        ");
  check("the impersonation suite still passes", py.status === 0, tail);
  console.log(`        ${tail}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
// On Windows the throwaway data folder can still be locked when stop() tries
// to delete it (EBUSY). That is cleanup, not a result, so it cannot fail the run.
if (server) await server.stop().catch((e) => console.log(`(scratch server cleanup: ${e.code || e.message})`));
process.exit(fail ? 1 : 0);
