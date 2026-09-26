#!/usr/bin/env node
/**
 * scripts/amaw/check_storage.mjs — what the lot store does when the network
 * is not there, when it comes back, and when two people edit one lot.
 *
 *   node scripts/amaw/check_storage.mjs
 *
 * WHY A FAKE SERVER RATHER THAN A REAL ONE. supabase/amaw_lots.sql is checked
 * against a real Postgres by scripts/supabase/check_amaw_lots.py — that is
 * where the policies, the guard trigger and the purge are proved. This file
 * checks the OTHER half: what the client does with the answers. The fake
 * below reproduces exactly the four server behaviours the client branches on,
 * and nothing else:
 *
 *   * amaw_lot_data's revision guard  — raise 40001 on a stale token
 *   * amaw_seal_lot's refusals        — already submitted, only KYTC accepts
 *   * the status='Open' write policy  — a submitted lot's data is frozen
 *   * a purged lot                    — the ledger row with no data behind it
 *
 * Each is a line in supabase/amaw_lots.sql, quoted where it is reproduced, so
 * a change there has a matching line to find here. A fake that drifts from
 * the schema is worse than no fake, which is why it models the FOUR rules the
 * client actually depends on rather than trying to be Postgres.
 */
import {
  blankLot, normaliseLot, restampIdentity, lotKey, lotIdentity, deriveIdentityParts,
  uidFromKey, lotSummary, isUnsynced, isTransient, mergeLots,
  localLotStore, supabaseLotStore, syncedLotStore, createLotStore, StorageError,
} from './storage.mjs';
// Only for the sublot count below: a lot the way the intake and the form
// really build one, rather than a fixture that agrees with the code by hand.
import PLANTBOOK_SECTIONS from './sections.mjs';
import { lotFromApproval } from './intake.mjs';

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? '' : '  -> ' + JSON.stringify(detail)}`); }
}
function head(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }
async function raises(fn, code) {
  try { await fn(); return { raised: false }; }
  catch (err) { return { raised: true, code: err && err.code, message: err && err.message, ok: !code || err.code === code }; }
}

// =====================================================================
// A browser that is not there
// =====================================================================
function fakeStorage({ failOn = null } = {}) {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failOn === 'quota') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

// =====================================================================
// A Supabase that behaves like supabase/amaw_lots.sql
// =====================================================================
function fakeServer() {
  const db = { lots: new Map(), data: new Map(), events: [] };
  const net = { up: true, unapplied: false };

  const netErr = () => Object.assign(new Error('Failed to fetch'), { code: '' });
  const unappliedErr = () => ({ code: '42P01', message: 'relation "amaw_lots" does not exist' });

  function summaries() {
    return Array.from(db.lots.values()).map((l) => {
      const d = db.data.get(l.id);
      return { ...l, has_data: !!d, revision: d ? d.revision : 0,
               saved_name: d ? d.saved_name : null,
               updated_at: (d && d.updated_at) || l.updated_at };
    });
  }

  // A chainable stub of the bits of postgrest-js this module uses.
  function table(name) {
    const q = { _filters: [], _single: null };
    const rows = () => {
      let out = name === 'amaw_lot_summaries' ? summaries()
              : name === 'amaw_lots' ? Array.from(db.lots.values())
              : Array.from(db.data.values());
      for (const [k, v] of q._filters) out = out.filter((r) => String(r[k]) === String(v));
      return out;
    };
    const settle = (data, error) => Promise.resolve({ data, error });
    const api = {
      select() { return api; },
      eq(k, v) { q._filters.push([k, v]); return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() {
        if (!net.up) return Promise.reject(netErr());
        if (net.unapplied) return settle(null, unappliedErr());
        const r = rows(); return settle(r[0] || null, null);
      },
      single() {
        if (!net.up) return Promise.reject(netErr());
        if (net.unapplied) return settle(null, unappliedErr());
        const r = rows();
        if (r.length !== 1) return settle(null, { code: 'PGRST116', message: 'no rows' });
        return settle(r[0], null);
      },
      then(res, rej) {
        if (!net.up) return Promise.reject(netErr()).then(res, rej);
        if (net.unapplied) return settle(null, unappliedErr()).then(res, rej);
        return settle(rows(), null).then(res, rej);
      },
      upsert(row) {
        if (!net.up) { const p = Promise.reject(netErr()); p.select = () => p; p.single = () => p; return p; }
        if (net.unapplied) { const r = settle(null, unappliedErr()); r.select = () => r; r.single = () => r; return r; }
        let out = null, error = null;
        if (name === 'amaw_lots') {
          const prev = db.lots.get(row.id);
          // amaw_lots_guard(): the identity is pinned after insert, and so is
          // everything in the chain block.
          db.lots.set(row.id, prev
            ? { ...prev, line_item: row.line_item, density_option: row.density_option,
                mix_signature: row.mix_signature, updated_at: new Date().toISOString() }
            : { ...row, status: 'Open', submitted_at: null, submitted_name: null,
                accepted_at: null, accepted_name: null, submittal_sha256: null, prev_sha256: null,
                purge_after: null, purged_at: null, plant_name: 'Fake Plant',
                updated_at: new Date().toISOString() });
          out = { id: row.id };
        } else {
          const lot = db.lots.get(row.lot_id);
          // "amaw_lot_data: update for open visible lots" — after submission
          // the data is the state's and is waiting to be purged.
          if (lot && lot.status !== 'Open') {
            error = { code: '42501', message: 'new row violates row-level security policy' };
          } else {
            const prev = db.data.get(row.lot_id);
            if (prev && row.revision != null && Number(row.revision) !== prev.revision) {
              // amaw_lot_data_guard(): raise exception 'stale revision: ...'
              error = { code: '40001', message: `stale revision: this lot was saved by ${prev.saved_name || 'someone else'}` };
            } else {
              const rev = prev ? prev.revision + 1 : 0;
              const next = { ...row, revision: rev, updated_at: new Date().toISOString() };
              db.data.set(row.lot_id, next);
              out = { revision: rev, updated_at: next.updated_at };
            }
          }
        }
        const r = settle(out, error);
        r.select = () => r; r.single = () => r;
        return r;
      },
      delete() {
        const r = { eq: (k, v) => { q._filters.push([k, v]); return r; },
                    select: () => {
                      const hits = rows();
                      for (const h of hits) { db.lots.delete(h.id); db.data.delete(h.id); }
                      return settle(hits.map((h) => ({ id: h.id })), null);
                    } };
        return r;
      },
    };
    return api;
  }

  const client = {
    from: table,
    async rpc(fn, args) {
      // Counted, so "a refused Accept is not retried on every flush" can be
      // asserted as a call that did not happen rather than inferred from a
      // status that happens to match.
      net.rpcCalls = (net.rpcCalls || 0) + 1;
      if (!net.up) throw netErr();
      // Unapplied, the FUNCTION is missing too, and PostgREST says so as
      // PGRST202 rather than 42P01.
      if (net.unapplied) return { data: null, error: { code: 'PGRST202',
        message: 'Could not find the function public.amaw_seal_lot(p_lot_id, p_prev, p_sha256, p_status) in the schema cache' } };
      if (fn !== 'amaw_seal_lot') return { data: null, error: { message: 'no such function' } };
      // The connection drops BEFORE the call lands: nothing changed server-side.
      if (net.failSealOnce) { net.failSealOnce = false; throw netErr(); }
      const lot = db.lots.get(args.p_lot_id);
      if (!lot) return { data: null, error: { code: 'P0002', message: 'no such lot' } };
      // amaw_seal_lot()'s other refusals, by the real message (e.g. "this lot is
      // not at a plant you hold PlantBook for"), for the status named.
      if (net.refuse && net.refuse[args.p_status]) {
        return { data: null, error: { code: '42501', message: net.refuse[args.p_status] } };
      }
      if (args.p_status === 'Submitted') {
        if (lot.status !== 'Open') {
          return { data: null, error: { message: `lot ${lot.lot_number} is already ${lot.status}, and a lot is never reopened once submitted` } };
        }
        if (!args.p_sha256) return { data: null, error: { message: 'a submitted lot needs the submittal hash' } };
        lot.status = 'Submitted';
        lot.submitted_at = new Date().toISOString();
        lot.submitted_name = 'Jo Cavanah';
        lot.submittal_sha256 = args.p_sha256;
        lot.prev_sha256 = lot.prev_sha256 || args.p_prev || null;
        lot.purge_after = new Date(Date.now() + 7 * 864e5).toISOString();
      } else if (args.p_status === 'Accepted') {
        if (!net.reviewer) return { data: null, error: { message: 'only KYTC accepts a lot' } };
        if (lot.status !== 'Submitted') return { data: null, error: { message: `lot ${lot.lot_number} is ${lot.status}, and only a submitted lot can be accepted` } };
        // amaw_seal_lot()'s Accepted branch stamps who and when, as the
        // Submitted one does - so "the ledger reads Accepted" can be asserted
        // on the same columns the real row carries.
        lot.status = 'Accepted';
        lot.accepted_at = new Date().toISOString();
        lot.accepted_name = 'KYTC Reviewer';
      }
      db.events.push({ lot_id: args.p_lot_id, kind: 'status', to_status: args.p_status });
      // The transaction COMMITTED and the answer is lost on the way back - the
      // case a seal refused as "already Accepted" really is.
      if (net.dropNext === args.p_status) { net.dropNext = null; throw netErr(); }
      return { data: lot, error: null };
    },
  };
  return { client, db, net,
           // amaw_purge_expired(): the data goes, the ledger row stays.
           purge: (id) => { db.data.delete(id); const l = db.lots.get(id); if (l) l.purged_at = new Date().toISOString(); } };
}

const IDENT = { contract_id: '252112', amp_number: 'AMP070302', mix_id: '00260467', lot_number: 1 };
const BY = { sm_id: 'jcavanah', name: 'Jo Cavanah' };

function newStore(server, storage) {
  return syncedLotStore({ storage: storage || fakeStorage(), client: server ? server.client : null });
}

// =====================================================================
head('the envelope and its identity');
// =====================================================================
{
  const a = blankLot(IDENT);
  const b = blankLot(IDENT);
  ok('the uid is a pure function of the natural key, so two devices agree', a.uid === b.uid, a.uid);
  ok('...and it is a well-formed v4-shaped uuid',
     /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.uid), a.uid);
  ok('a different lot number is a different lot',
     blankLot({ ...IDENT, lot_number: 2 }).uid !== a.uid);
  ok('the key has all six parts', a.key.split('|').length === 6, a.key);

  const round = normaliseLot(JSON.parse(JSON.stringify(a)));
  ok('normaliseLot() is a no-op on a fresh lot', round.uid === a.uid && round.key === a.key);

  // The uid is fixed at BIRTH: the two parts a lookup fills in later must not
  // move the lot out from under a week of work.
  const later = normaliseLot({ ...a, values: { lot_density_option: 'B' },
                               rows: { project_items: [{ line: '0165' }] } });
  ok('a line item found later restamps the key', later.key.split('|')[1] === '0165', later.key);
  ok('...and an option switched mid-job restamps it too', later.key.split('|')[5] === 'B', later.key);
  ok('...but NEITHER moves the uid', later.uid === a.uid);

  ok('two candidate line items refuse to guess between them',
     deriveIdentityParts({ rows: { project_items: [{ line: '0160' }, { line: '0165' }] } }).line_item === '');
  ok('"Option A" and "A" are the same option',
     deriveIdentityParts({ values: { lot_density_option: 'Option A' } }).density_option === 'A');
  ok('lotIdentity() hands back the ledger\'s own six columns',
     Object.keys(lotIdentity(later)).join() === 'contract_id,line_item,amp_number,mix_id,lot_number,density_option');
  ok('a lot with no contract is refused rather than filed under ""',
     (await raises(async () => blankLot({ ...IDENT, contract_id: '' }), 'invalid')).ok);
  ok('a newer envelope is refused rather than half-read',
     (await raises(async () => normaliseLot({ ...a, version: 99 }), 'invalid')).ok);
  ok('an unknown status reads as Open', normaliseLot({ ...a, status: 'Released' }).status === 'Open');
}

// =====================================================================
head('localStorage, including when it is not there');
// =====================================================================
{
  const s = localLotStore({ storage: fakeStorage() });
  ok('available() probes by WRITING, not by looking', (await s.available()).ok);

  const lot = blankLot(IDENT);
  const saved = await s.save(lot, { by: BY });
  ok('a save bumps the local revision', saved.revision === 1);
  ok('...and is readable straight back', (await s.load(saved.uid)).uid === saved.uid);
  ok('...and findable by its natural key', (await s.findByKey(saved.key)).uid === saved.uid);
  ok('the index lists it', (await s.list()).length === 1);
  ok('...filtered by contract', (await s.list({ contract_id: '252112' })).length === 1);
  ok('...and not by somebody else\'s', (await s.list({ contract_id: '999999' })).length === 0);

  const rebuilt = await s.rebuildIndex();
  ok('the index is a cache and can always be rebuilt', rebuilt === 1);

  ok('a missing lot is null, not a throw', (await s.load('nope')) === null);
  ok('remove() reports whether anything went', (await s.remove(saved.uid)) === true);

  const full = localLotStore({ storage: fakeStorage({ failOn: 'quota' }) });
  const q = await raises(() => full.save(blankLot(IDENT)), 'unavailable');
  ok('a browser out of storage says so, and says to download the working copy',
     q.raised && /download the working copy/.test(q.message), q.message);

  const none = localLotStore({ storage: null, prefix: 'x:' });
  const probe = await none.available();
  ok('no localStorage at all is an honest answer rather than a crash', probe.ok === false, probe.reason);
}

// =====================================================================
head('online: a save reaches the server');
// =====================================================================
{
  const server = fakeServer();
  const store = newStore(server);
  const lot = blankLot(IDENT);
  const saved = await store.save(lot, { by: BY });

  ok('the ledger row is written', server.db.lots.size === 1);
  ok('the data row is written', server.db.data.size === 1);
  ok('the lot is in step afterwards', !isUnsynced(saved), lotSummary(saved));
  ok('the server\'s own counter is recorded separately from ours',
     saved.server_revision === 0 && saved.synced_revision === saved.revision, saved);
  ok('nothing local is left in the outbox', (await store.local.outbox()).length === 0);

  // THE CHAIN IS NOT THE CLIENT'S TO WRITE - a push must never send it.
  const sent = server.db.lots.get(saved.uid);
  ok('a push does not send a status', sent.status === 'Open');
  ok('...nor a hash', sent.submittal_sha256 === null);

  const again = await store.save({ ...saved, values: { lot_tons: 4000 } }, { by: BY });
  ok('a second save presents the server\'s token and is accepted', again.server_revision === 1);
  ok('...and the data landed', server.db.data.get(saved.uid).values.lot_tons === 4000);
}

// =====================================================================
head('offline: the save still succeeds');
// =====================================================================
{
  const server = fakeServer();
  const store = newStore(server);
  server.net.up = false;

  const saved = await store.save(blankLot(IDENT), { by: BY });
  ok('a save with no signal does not throw at the technician', !!saved);
  ok('...it is on this machine', (await store.local.load(saved.uid)) !== null);
  ok('...the server has nothing', server.db.lots.size === 0);
  ok('...and it is in the outbox', (await store.local.outbox()).length === 1);
  ok('the store says it is offline', store.state().online === false, store.state());

  await store.save({ ...saved, values: { a: 1 } }, { by: BY });
  await store.save({ ...saved, values: { a: 2 } }, { by: BY });
  ok('three offline saves are still ONE thing to push', (await store.local.outbox()).length === 1);

  server.net.up = true;
  const res = await store.flush({ by: BY });
  ok('coming back online pushes it', res.pushed === 1, res);
  ok('...the outbox empties', res.pending === 0);
  ok('...and the server has the LATEST values, not the first',
     server.db.data.get(saved.uid).values.a === 2, server.db.data.get(saved.uid).values);
  ok('flushing again is a no-op', (await store.flush()).pushed === 0);
}

// =====================================================================
head('offline: submitting');
// =====================================================================
{
  const server = fakeServer();
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  server.net.up = false;

  const sealed = await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  ok('a lot submitted with no signal is Submitted ON THIS MACHINE at once',
     sealed.status === 'Submitted', sealed.status);
  ok('...and remembers what it owes the server', !!sealed.pending_seal);
  ok('...the server still says Open', server.db.lots.get(saved.uid).status === 'Open');

  server.net.up = true;
  const res = await store.flush({ by: BY });
  ok('the flush seals it', server.db.lots.get(saved.uid).status === 'Submitted', res);
  ok('...carrying the hash the page computed',
     server.db.lots.get(saved.uid).submittal_sha256 === 'a'.repeat(64));
  ok('...and the purge clock is the SERVER\'s to set',
     !!server.db.lots.get(saved.uid).purge_after);
  ok('...nothing is left pending', (await store.local.outbox()).length === 0);

  // THE ORDER IS THE POINT, and this check is why the first version of
  // pushOne() was wrong. A lot's data is writable only while the server still
  // thinks it is Open, so the data has to go BEFORE the seal. Sealing first
  // gets everything typed since the last sync refused by the write policy -
  // silently, as a permission error - which is exactly the case of a
  // technician who filled a lot offline all week and then pressed Submit.
  ok('a submitted lot\'s data is frozen server-side',
     server.db.lots.get(saved.uid).status === 'Submitted');
  const second = await raises(() => store.seal(saved.uid, 'Submitted', { sha256: 'b'.repeat(64) }), 'sealed');
  ok('a lot is never submitted twice', second.raised && /never reopened/.test(second.message), second.message);
}

// =====================================================================
head('who may accept');
// =====================================================================
{
  const server = fakeServer();
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });

  const r = await raises(() => store.seal(saved.uid, 'Accepted', { by: BY }));
  ok('a contractor cannot accept their own lot, and it is an ANSWER not a delay',
     r.raised && /only KYTC/.test(r.message) && r.code === 'sealed', r);

  // THE REFUSED ACCEPT COMES BACK OFF. seal() stamps before it pushes, which
  // is right for a Submit and wrong for an Accept: left stamped, this device
  // reads Accepted while the ledger reads Submitted, and the pending seal is
  // retried - and refused - on every flush after.
  const back = await store.local.load(saved.uid);
  ok('…and this device does NOT keep the refused Accept: it reads Submitted again',
     back.status === 'Submitted', back.status);
  ok('…with no seal left pending', back.pending_seal === null, back.pending_seal);
  // Asked, not assumed: the record is read before anything is put back, and
  // what it said is KEPT on the lot so a reload still knows.
  ok('…and it keeps what the record said, and where the record has the lot',
     !!back.seal_refused && back.seal_refused.status === 'Accepted' && /only KYTC/.test(back.seal_refused.reason)
       && !!back.seal_refused.record && back.seal_refused.record.status === 'Submitted', back.seal_refused);
  ok('…so it is not in the outbox', (await store.local.outbox()).length === 0);
  const callsBefore = server.net.rpcCalls;
  await store.flush({ by: BY });
  ok('…and a flush does not send it again', server.net.rpcCalls === callsBefore,
     `${server.net.rpcCalls - callsBefore} seal call(s) on the flush`);
  ok('a refusal is not a lost signal: the store still says online',
     store.state().online === true && store.state().notSetUp === false, store.state());
  ok('the ledger never moved', server.db.lots.get(saved.uid).status === 'Submitted'
     && !server.db.lots.get(saved.uid).accepted_at);

  server.net.reviewer = true;
  await store.seal(saved.uid, 'Accepted', { by: BY });
  ok('KYTC can', server.db.lots.get(saved.uid).status === 'Accepted');
  ok('…and the record says when', !!server.db.lots.get(saved.uid).accepted_at);
  const mine = await store.local.load(saved.uid);
  ok('…and this device agrees, with nothing pending',
     mine.status === 'Accepted' && mine.pending_seal === null, [mine.status, mine.pending_seal]);
  ok('…carrying the record\'s own who and when',
     mine.accepted_name === 'KYTC Reviewer' && !!mine.accepted_at, [mine.accepted_name, mine.accepted_at]);
  ok('…and the new seal superseded the old refusal', mine.seal_refused == null, mine.seal_refused);
}

// =====================================================================
head('an Accept that TOOK, its answer lost on the way back');
// =====================================================================
{
  // amaw_seal_lot() commits and the connection drops before the reply. The
  // retry is then refused - "lot 3 is Accepted, and only a submitted lot can
  // be accepted" - which is the record AGREEING. Rolled back on that wording,
  // this device read Submitted over an Accepted ledger and every retry failed.
  const server = fakeServer();
  server.net.reviewer = true;
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  server.net.dropNext = 'Accepted';
  const first = await store.seal(saved.uid, 'Accepted', { by: BY });
  ok('(the reply was lost: the Accept waits, and the record already says Accepted)',
     !!first.pending_seal && server.db.lots.get(saved.uid).status === 'Accepted',
     [first.pending_seal, server.db.lots.get(saved.uid).status]);
  const res = await store.flush({ by: BY });
  ok('the retry finds it already on the record, and is not a failure', res.failures.length === 0,
     res.failures.map((f) => f.error.message));
  const back = await store.local.load(saved.uid);
  ok('…so this device reads Accepted, nothing pending - not put back to Submitted',
     back.status === 'Accepted' && back.pending_seal === null, [back.status, back.pending_seal]);
  ok('…with the record\'s who and when', back.accepted_name === 'KYTC Reviewer' && !!back.accepted_at,
     [back.accepted_name, back.accepted_at]);
  ok('…and no refusal kept', back.seal_refused == null, back.seal_refused);
  const calls = server.net.rpcCalls;
  await store.flush({ by: BY });
  ok('…and it is not asked again', server.net.rpcCalls === calls, `${server.net.rpcCalls - calls} seal call(s)`);
}

// =====================================================================
head('a second reviewer: the record already reads Accepted');
// =====================================================================
{
  // Both reviewers get the submittal email, so the second one to press Accept
  // meeting a lot the first already accepted is ORDINARY. The record's "no"
  // means the lot is Accepted, and this device says so, naming who.
  const server = fakeServer();
  server.net.reviewer = true;
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  Object.assign(server.db.lots.get(saved.uid),
    { status: 'Accepted', accepted_at: '2026-09-26T06:03:53.000Z', accepted_name: 'Tate Salle' });
  let got = null, thrown = null;
  try { got = await store.seal(saved.uid, 'Accepted', { by: BY }); } catch (e) { thrown = e; }
  ok('pressing Accept is not an error', !thrown, thrown && [thrown.code, thrown.message]);
  ok('…the lot handed back says it was ALREADY on the record (adopted), not newly sealed',
     got && got.adopted === true && got.status === 'Accepted' && got.pending_seal === null,
     got && [got.adopted, got.status, got.pending_seal]);
  const back = await store.local.load(saved.uid);
  ok('…this device reads Accepted, by the reviewer who did it',
     back.status === 'Accepted' && back.accepted_name === 'Tate Salle' && back.accepted_at === '2026-09-26T06:03:53.000Z',
     [back.status, back.accepted_name, back.accepted_at]);
  ok('…and the record was not touched', server.db.lots.get(saved.uid).accepted_name === 'Tate Salle');
}

// =====================================================================
head('a Submit that TOOK, its answer lost on the way back');
// =====================================================================
{
  // The seal commits and the reply is lost, so the Submit waits. At the next
  // flush its data push is refused (the lot is no longer Open) - forever, in
  // every version before this one, with the chip saying "when there is a
  // signal". The record holds THIS submission's hash, so it is done.
  const server = fakeServer();
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  server.net.dropNext = 'Submitted';
  const s = await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  ok('(the reply was lost: the seal waits, and the record already says Submitted)',
     !!s.pending_seal && server.db.lots.get(saved.uid).status === 'Submitted',
     [s.pending_seal, server.db.lots.get(saved.uid).status]);
  const res = await store.flush({ by: BY });
  ok('the flush finds this very submission on the record, and is not a failure', res.failures.length === 0,
     res.failures.map((f) => f.error.message));
  const back = await store.local.load(saved.uid);
  ok('…nothing is left pending and the outbox is empty',
     back.status === 'Submitted' && back.pending_seal === null && (await store.local.outbox()).length === 0,
     [back.status, back.pending_seal]);
  ok('…carrying the hash and the stamp the record holds',
     back.submittal_sha256 === 'a'.repeat(64) && !!back.submitted_at, [back.submittal_sha256, back.submitted_at]);
  const calls = server.net.rpcCalls;
  await store.flush({ by: BY });
  ok('…and it is not retried', server.net.rpcCalls === calls, `${server.net.rpcCalls - calls} seal call(s)`);
}

// =====================================================================
head('a Submit the record REFUSES: a different submission is already there');
// =====================================================================
{
  // Another device submitted this lot first, with a different payload. This
  // device's submission is real - the PDF has gone to KYTC - so the lot stays
  // Submitted here and its seal stays in the outbox. What changed is that the
  // refusal is KEPT: it used to be one session's memory, and reopening the lot
  // showed "waiting to be sealed ... when there is a signal" on a device that
  // was online the whole time.
  const server = fakeServer();
  const storage = fakeStorage();
  const store = newStore(server, storage);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  server.net.up = false;
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  server.net.up = true;
  Object.assign(server.db.lots.get(saved.uid), { status: 'Submitted', submittal_sha256: 'b'.repeat(64),
    submitted_name: 'Night Shift', submitted_at: '2026-09-26T02:00:00.000Z' });
  const res = await store.flush({ by: BY });
  ok('the flush reports the refusal', res.failures.length === 1, res.failures.map((f) => f.error.message));
  ok('…carrying where the record has the lot, for the page to say',
     !!res.failures[0] && !!res.failures[0].error.record && res.failures[0].error.record.submittal_sha256 === 'b'.repeat(64),
     res.failures[0] && res.failures[0].error.record);
  const back = await store.local.load(saved.uid);
  ok('…the lot stays Submitted here, its own seal still waiting',
     back.status === 'Submitted' && back.pending_seal && back.pending_seal.sha256 === 'a'.repeat(64),
     [back.status, back.pending_seal]);
  ok('…with the refusal kept, naming the other submission',
     !!back.seal_refused && back.seal_refused.status === 'Submitted'
       && back.seal_refused.record && back.seal_refused.record.submitted_name === 'Night Shift', back.seal_refused);
  const reloaded = await newStore(server, storage).local.load(saved.uid);
  ok('…and a reload still knows it was refused', !!reloaded.seal_refused, reloaded.seal_refused);
  const plain = await store.save({ ...back, seal_refused: null }, { by: BY });
  ok('an ordinary save cannot clear it', !!(await store.local.load(saved.uid)).seal_refused, plain.seal_refused);
}

// =====================================================================
head('a seal that fails AFTER its data push went');
// =====================================================================
{
  // The data goes first and moves the server's counter; the seal then fails.
  // The new counter was held only in memory, so the next push presented the
  // old one and read as a colleague's stale-revision conflict.
  for (const how of ['refused', 'no signal']) {
    const server = fakeServer();
    const store = newStore(server);
    const saved = await store.save(blankLot(IDENT), { by: BY });
    await store.save({ ...saved, values: { lot_tons: 4000 } }, { by: BY });
    if (how === 'refused') server.net.refuse = { Submitted: 'this lot is not at a plant you hold PlantBook for' };
    else server.net.failSealOnce = true;
    await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY }).catch(() => null);
    const held = await store.local.load(saved.uid);
    ok(`${how}: this device kept the server's new counter`,
       held.server_revision === server.db.data.get(saved.uid).revision,
       [held.server_revision, server.db.data.get(saved.uid).revision]);
    server.net.refuse = null;
    const res = await store.flush({ by: BY });
    ok(`${how}: …so the retry seals it, with no false conflict`,
       res.failures.length === 0 && server.db.lots.get(saved.uid).status === 'Submitted',
       [res.failures.map((f) => f.error.message), server.db.lots.get(saved.uid).status]);
  }
}

// =====================================================================
head('a refusal is the store\'s to keep and the page\'s to acknowledge');
// =====================================================================
{
  const server = fakeServer();
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  await store.seal(saved.uid, 'Accepted', { by: BY }).catch(() => null);   // a contractor: refused
  ok('(a refused Accept is kept on the lot)', !!(await store.local.load(saved.uid)).seal_refused);
  const forged = await store.save({ ...(await store.local.load(saved.uid)), seal_refused: null }, { by: BY });
  ok('an ordinary save neither clears nor replaces it', !!(await store.local.load(saved.uid)).seal_refused, forged.seal_refused);
  await store.acknowledge(saved.uid);
  ok('acknowledge() clears it', (await store.local.load(saved.uid)).seal_refused == null);
  const fresh = await newStore(server).save({ ...blankLot({ ...IDENT, lot_number: 8 }),
    seal_refused: { status: 'Accepted', reason: 'forged' } }, { by: BY });
  ok('a first save does not take one from the caller either', fresh.seal_refused == null, fresh.seal_refused);
}

// =====================================================================
head('an Accept with no signal');
// =====================================================================
{
  const server = fakeServer();
  server.net.reviewer = true;
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  server.net.up = false;

  const accepted = await store.seal(saved.uid, 'Accepted', { by: BY });
  ok('with no signal an Accept is stamped on this device and waits',
     accepted.status === 'Accepted' && accepted.pending_seal && accepted.pending_seal.status === 'Accepted',
     [accepted.status, accepted.pending_seal]);
  ok('…remembering what it would put back if the record refused it',
     accepted.pending_seal && accepted.pending_seal.was === 'Submitted', accepted.pending_seal);
  ok('…the record still says Submitted', server.db.lots.get(saved.uid).status === 'Submitted');
  server.net.up = true;
  await store.flush({ by: BY });
  ok('the flush seals it Accepted', server.db.lots.get(saved.uid).status === 'Accepted');
  ok('…and nothing is left pending', (await store.local.load(saved.uid)).pending_seal === null);
}

// =====================================================================
head('an Accept the record refuses at a LATER flush');
// =====================================================================
{
  // The other door to the same stray seal: an Accept made with no signal,
  // refused when the connection comes back. Put back there too.
  const server = fakeServer();
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  server.net.up = false;
  await store.seal(saved.uid, 'Accepted', { by: BY });   // not a reviewer: refused once it can be asked
  server.net.up = true;
  const res = await store.flush({ by: BY });
  ok('the flush reports the refusal', res.failures.length === 1 && /only KYTC/.test(String(res.failures[0].error.message)), res.failures);
  const back = await store.local.load(saved.uid);
  ok('…and the stamp comes off: Submitted, nothing pending',
     back.status === 'Submitted' && back.pending_seal === null, [back.status, back.pending_seal]);
  const callsBefore = server.net.rpcCalls;
  await store.flush({ by: BY });
  ok('…so the next flush does not ask again', server.net.rpcCalls === callsBefore,
     `${server.net.rpcCalls - callsBefore} seal call(s)`);
}

// =====================================================================
head('an Accept over a submission still waiting for a signal');
// =====================================================================
{
  const server = fakeServer();
  server.net.reviewer = true;
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  server.net.up = false;
  await store.seal(saved.uid, 'Submitted', { sha256: 'c'.repeat(64), by: BY });
  const r = await raises(() => store.seal(saved.uid, 'Accepted', { by: BY }), 'sealed');
  ok('is refused before anything is stamped', r.ok && /has not reached/.test(r.message || ''), r);
  const held = await store.local.load(saved.uid);
  ok('…and the waiting submission keeps its hash - one slot, not overwritten',
     held.pending_seal && held.pending_seal.status === 'Submitted' && held.pending_seal.sha256 === 'c'.repeat(64),
     held.pending_seal);
}

// =====================================================================
head('an Accept on a lot the record has never seen');
// =====================================================================
{
  // A reviewer holding a lot from its submittal PDF whose plant never synced
  // it. The record's "no such lot" is an answer: it used to classify as a
  // backend hiccup, which marked the store offline and queued the Accept.
  const server = fakeServer();
  server.net.reviewer = true;
  const store = newStore(server);
  const fromFile = normaliseLot({ ...blankLot(IDENT), status: 'Submitted' });
  await store.local.save(fromFile, { by: BY });
  const r = await raises(() => store.seal(fromFile.uid, 'Accepted', { by: BY }), 'not_found');
  ok('"no such lot" is refused as not_found, not queued as a lost signal', r.ok, r);
  ok('…the store does not claim to be offline', store.state().online === true, store.state());
  const back = await store.local.load(fromFile.uid);
  ok('…and the stamp comes off', back.status === 'Submitted' && back.pending_seal === null,
     [back.status, back.pending_seal]);
  ok('not_found is not transient', !isTransient(new StorageError('not_found', 'x')));
}

// =====================================================================
head('two people, one lot');
// =====================================================================
{
  const server = fakeServer();
  const mine = newStore(server);
  const saved = await mine.save(blankLot(IDENT), { by: BY });

  // Somebody else saves from another device.
  const theirs = newStore(server, fakeStorage());
  const copy = await theirs.load(saved.uid);
  ok('the other device picks the lot up off the server', copy && copy.uid === saved.uid);
  await theirs.save({ ...copy, values: { who: 'night shift' } }, { by: BY });
  ok('...and saves into it', server.db.data.get(saved.uid).values.who === 'night shift');

  // Now the first device, holding a stale token, saves too.
  const stale = await mine.save({ ...saved, values: { who: 'day shift' } }, { by: BY });
  ok('a stale save is reported as a CONFLICT, not swallowed', !!stale.conflict, stale.conflict);
  ok('...and the local copy is kept, not overwritten',
     (await mine.local.load(saved.uid)).values.who === 'day shift');
  ok('...and it still counts as unsynced, so it is not silently forgotten',
     (await mine.local.outbox()).length === 1);

  const seen = await mine.load(saved.uid);
  ok('loading it says both sides moved rather than picking a winner', !!seen.conflict, seen.conflict);
  ok('...and hands over the other side so a person can compare',
     seen.remote && seen.remote.values.who === 'night shift');
  ok('...while what is on screen is still this person\'s work', seen.values.who === 'day shift');
}

// =====================================================================
head('a purged lot');
// =====================================================================
{
  const server = fakeServer();
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  await store.seal(saved.uid, 'Submitted', { sha256: 'a'.repeat(64), by: BY });
  server.purge(saved.uid);

  const fresh = newStore(server, fakeStorage());   // a device that never held it
  const rows = await fresh.list();
  ok('the lot is still listed a week later', rows.length === 1, rows);
  ok('...saying its data is gone rather than that it was never filled in',
     rows[0].has_data === false);
  ok('...and still carrying who submitted it and when',
     rows[0].status === 'Submitted' && !!rows[0].purged_at, rows[0]);
  const got = await fresh.load(saved.uid);
  ok('loading a purged lot is a real state, not an error', got && got.status === 'Submitted');
  ok('...with nothing in it', Object.keys(got.values).length === 0);
}

// =====================================================================
head('a project where the schema has not been applied');
// =====================================================================
{
  const server = fakeServer();
  server.net.unapplied = true;
  const store = newStore(server);
  const saved = await store.save(blankLot(IDENT), { by: BY });
  ok('the page keeps working out of localStorage', saved && saved.revision === 1);
  ok('...and the lot waits in the outbox rather than being lost',
     (await store.local.outbox()).length === 1);
  const avail = await store.available();
  ok('available() says local is fine and remote is not', avail.ok === true && avail.remote === false, avail);
  ok('...naming the missing migration rather than a stack trace',
     /has not been applied/.test(avail.reason || ''), avail.reason);

  // THE DISTINCTION THE PAGE ACTUALLY NEEDS, and the reason this is a code and
  // a flag rather than a sentence to match on. A project with no lot storage is
  // REACHABLE: saying "offline" there told every contractor they had no signal
  // while they were online (Andrew, 2026-09-23). The page reads `notSetUp`;
  // `online` stays the network's own answer.
  ok('...and says NOT SET UP rather than offline', avail.notSetUp === true, avail);
  ok('the store carries it as state, so nothing has to read the wording',
     store.state().notSetUp === true && store.state().online === true, store.state());
  ok('the error carries its own code', (await raises(
     () => store.remote.push(blankLot(IDENT), { by: BY }), 'not_set_up')).ok);
  ok('...which is still transient, so the lot waits rather than being discarded',
     isTransient(new StorageError('not_set_up', 'x')));

  server.net.unapplied = false;
  ok('applying it later catches everything up', (await store.flush({ by: BY })).pushed === 1);
  ok('...and the flag clears, because the migration has landed',
     store.state().notSetUp === false, store.state());
}

// =====================================================================
head('offline is not the same as not set up');
// =====================================================================
{
  // Both stop a push and both keep the lot in the outbox. They are opposite
  // sentences on screen, and for a day the page said the wrong one.
  const server = fakeServer();
  const store = newStore(server);
  await store.save(blankLot(IDENT), { by: BY });

  server.net.up = false;
  await store.save({ ...blankLot(IDENT), values: { a: 1 } }, { by: BY });
  ok('a dropped connection sets online false', store.state().online === false, store.state());
  ok('...and does NOT claim the project has no storage', store.state().notSetUp === false, store.state());

  server.net.up = true; server.net.unapplied = true;
  await store.save({ ...blankLot(IDENT), values: { a: 2 } }, { by: BY });
  ok('an unapplied schema sets notSetUp', store.state().notSetUp === true, store.state());
  ok('...and leaves online alone, because the network is fine',
     store.state().online === true, store.state());
  ok('either way the lot is still waiting', (await store.local.outbox()).length === 1);
}

// =====================================================================
head('not set up, met by the seal rather than by a table');
// =====================================================================
{
  // amaw_seal_lot() missing is PGRST202, not 42P01. Left as 'backend' it read
  // as a lost signal, so an Accept on a project with no lot storage said
  // "there is no signal". And a save that sent nothing called noteOk(), which
  // wiped the notSetUp a load() had just found.
  const sup = supabaseLotStore({ client: { rpc: async () => ({ data: null, error: { code: 'PGRST202',
    message: 'Could not find the function public.amaw_seal_lot(p_lot_id, p_prev, p_sha256, p_status) in the schema cache' } }) } });
  ok('a missing seal function is NOT SET UP', (await raises(() => sup.seal('x', 'Accepted'), 'not_set_up')).ok);

  const server = fakeServer();
  server.net.reviewer = true;
  const store = newStore(server);
  // A submitted lot this device holds from its file, as a reviewer's does.
  const fromFile = normaliseLot({ ...blankLot(IDENT), status: 'Submitted' });
  await store.local.save(fromFile, { by: BY });
  server.net.unapplied = true;
  await store.load(fromFile.uid);
  ok('(opening it finds no lot storage)', store.state().notSetUp === true, store.state());
  await store.save(await store.local.load(fromFile.uid), { by: BY });
  ok('saving a sealed lot sends nothing, and does not claim lot storage is there',
     store.state().notSetUp === true, store.state());
  const acc = await store.seal(fromFile.uid, 'Accepted', { by: BY });
  ok('an Accept there waits as NOT SET UP - not offline, not refused',
     acc.status === 'Accepted' && !!acc.pending_seal && store.state().notSetUp === true && store.state().online === true,
     [acc.status, acc.pending_seal, store.state()]);

  // A flush of a lot with nothing to send is not an answer either.
  const s4 = newStore(server);
  const frozen = normaliseLot({ ...blankLot({ ...IDENT, lot_number: 11 }), status: 'Submitted', revision: 3, synced_revision: 1 });
  await s4.local.save(frozen, { by: BY, bump: false });
  await s4.load(frozen.uid);
  const flushed = await s4.flush({ by: BY });
  ok('a flush that only froze a lot does not claim lot storage is there',
     flushed.pushed === 1 && s4.state().notSetUp === true, [flushed, s4.state()]);

  // The same device submitted it and now accepts it. One slot - but nothing
  // will ever send the waiting submission, so the Accept is stamped over it
  // rather than refused with a sentence about a record that does not exist.
  server.net.unapplied = false;
  const s2 = newStore(server);
  const lot2 = await s2.save(blankLot({ ...IDENT, lot_number: 9 }), { by: BY });
  server.net.unapplied = true;
  await s2.seal(lot2.uid, 'Submitted', { sha256: 'f'.repeat(64), by: BY });
  const over = await raises(() => s2.seal(lot2.uid, 'Accepted', { by: BY }));
  ok('with no lot storage, an Accept over a waiting submission is stamped, not refused', !over.raised, over);
  ok('…and reads Accepted on this device', (await s2.local.load(lot2.uid)).status === 'Accepted');

  // A fresh page has not heard yet, so the store ASKS before refusing.
  const s3 = newStore(server, fakeStorage());
  const lot3 = normaliseLot({ ...blankLot({ ...IDENT, lot_number: 10 }), status: 'Submitted',
    pending_seal: { status: 'Submitted', sha256: 'e'.repeat(64), prev: null, at: '2026-09-26T00:00:00.000Z' } });
  await s3.local.save(lot3, { by: BY });
  ok('(a fresh store has not heard yet)', s3.state().notSetUp === false, s3.state());
  const asked = await raises(() => s3.seal(lot3.uid, 'Accepted', { by: BY }));
  ok('…so it asks, finds no lot storage, and stamps',
     !asked.raised && (await s3.local.load(lot3.uid)).status === 'Accepted' && s3.state().notSetUp === true,
     [asked, s3.state()]);
}

// =====================================================================
head('classifying a failure');
// =====================================================================
{
  ok('a dropped connection is transient', isTransient(new StorageError('offline', 'x')));
  ok('an unapplied schema is transient', isTransient(new StorageError('backend', 'x')));
  ok('a fetch that failed is transient', isTransient(new Error('Failed to fetch')));
  ok('a conflict is NOT transient', !isTransient(new StorageError('conflict', 'x')));
  ok('a refusal is NOT transient', !isTransient(new StorageError('denied', 'x')));
}

// =====================================================================
head('the switch');
// =====================================================================
{
  ok('no client means the local store', createLotStore({ storage: fakeStorage() }).name === 'local');
  ok('a client means the synced one', createLotStore({ client: fakeServer().client, storage: fakeStorage() }).name === 'synced');
  ok('an unknown backend is refused by name',
     (await raises(async () => createLotStore({ backend: 'postgres' }), 'invalid')).ok);
}

// =====================================================================
head('how many sublots have anything in them');
// =====================================================================
{
  // The Start a lot list prints lotSummary()'s count as "2 of 4 sublots". It
  // read 4 of 4 on every lot opened from an approval, because the cells the
  // schema and the intake fill in before anybody types - the blend's
  // component numbers and design %, the Ignition Furnace AC method, the
  // specimen and core ids - all counted.
  const APPROVAL = {
    format: 'kytc-designbook', version: 1, doc_kind: 'review', stage: 'Approved',
    job: { cid: '262120', letting: '2026-02-19', plant: 'AMP070301' },
    mix: { nominal_size: '0.38A', binder_grade: 'PG64-22', mix_class: '3' },
    values: { nominal_size: '0.38A', mix_type: 'A', binder_grade: 'PG64-22', ac_design: 5.2, va_design: 4.0, vma_design: 14.2 },
    rows: { aggregate: [
      { producer: 'BOONESBORO QUARRY @ BOONESBORO', type_size: "Dolomite #78's", pct_blend: 45, gsb: 2.71 },
      { producer: 'HAYDON MATERIALS', type_size: "Dol. #10's Washed", pct_blend: 35, gsb: 2.69 },
      { producer: 'WATSON GRAVEL', type_size: 'Natural Sand', pct_blend: 20, gsb: 2.62 },
    ] },
    approval: { approval_no: '#467PA', code: 'AAAA-BBBB-CCCC', issued_at: '2026-09-11T00:00:00.000Z',
                approved_by: 'Andrew.Denmark@ky.gov', mix_id: '00260467' },
    history: [],
  };
  const fresh = lotFromApproval(APPROVAL, { lotNumber: 3 });
  ok('(the intake builds the lot these cases start from)', fresh.ok && !!fresh.lot, fresh.checks);
  const base = fresh.lot;
  ok('a lot straight from an approval has NO sublots entered, blend % and all',
     lotSummary(base).sublots_entered === 0, lotSummary(base).sublots_entered);

  // The same lot the way collectForm() hands it back untouched: every row
  // table at its seeded length, straight off the schema's own seeds, with the
  // sublot painted "<lot>-<sublot>" as the page paints it.
  const untouched = () => {
    const lot = JSON.parse(JSON.stringify(base));
    for (const sec of PLANTBOOK_SECTIONS) {
      for (const spec of (Array.isArray(sec.rows) ? sec.rows : sec.rows ? [sec.rows] : [])) {
        if (lot.rows[spec.key] && lot.rows[spec.key].length) continue;   // the intake's own (blend_pct)
        lot.rows[spec.key] = (spec.seed || []).map((s) => {
          const row = Object.fromEntries((spec.columns || []).map((c) => [c.key, null]));
          Object.assign(row, s);
          if (row.sublot != null) row.sublot = `3-${s.sublot}`;
          return row;
        });
      }
    }
    return lot;
  };
  const form = untouched();
  ok('…nor as the form collects it untouched: seeded AC method, specimen and core ids say nothing',
     lotSummary(form).sublots_entered === 0, lotSummary(form).sublots_entered);

  const put = (lot, table, sublot, patch, nth = 0) => {
    const rows = lot.rows[table].filter((r) => String(r.sublot).split('-').pop() === String(sublot));
    Object.assign(rows[nth], patch);
    return lot;
  };
  // The sublot is the TRAILING number: "3-2" is lot 3's sublot 2. The first
  // version read the part before the dash and counted both of these as one.
  const two = put(put(untouched(), 'sublot_bsg', 1, { wt_air: 4812.4 }), 'sublot_bsg', 2, { wt_air: 4795.1 });
  ok('a weighing on sublot 1 and another on sublot 2 of lot 3 are TWO sublots, not the lot number twice',
     lotSummary(two).sublots_entered === 2, lotSummary(two).sublots_entered);
  ok('a computed cell on its own is nobody\'s entry',
     lotSummary(put(untouched(), 'sublot_bsg', 4, { bsg: 2.401, bulk_volume: 2004.1 })).sublots_entered === 0);
  ok('the seeded AC method is not an entry…',
     lotSummary(put(untouched(), 'sublot_tickets', 4, { ac_method: 'Ignition Furnace' })).sublots_entered === 0);
  ok('…but a different method on a sublot is somebody writing it down',
     lotSummary(put(untouched(), 'sublot_tickets', 4, { ac_method: 'Extraction' })).sublots_entered === 1);
  ok('a Sublot % still equal to the design\'s is the design talking (number or string)',
     lotSummary(put(untouched(), 'blend_pct', 3, { pct: '45' })).sublots_entered === 0);
  ok('…and one the plant changed is an entry on that sublot',
     lotSummary(put(untouched(), 'blend_pct', 3, { pct: 47 })).sublots_entered === 1);
  const grad = untouched();
  grad.values = { ...grad.values, jmf_s4_75: 62, sub4_wt_s4_75: 812.4 };
  ok('a gradation weight counts for its own sublot; the JMF target beside it does not',
     lotSummary(grad).sublots_entered === 1, lotSummary(grad).sublots_entered);
  ok('a table the schema does not render counts for nothing',
     lotSummary({ ...base, rows: { mystery: [{ sublot: '2', x: 1 }] } }).sublots_entered === 0);

  // amaw_lot_summaries has no such column. A row the list knows only from the
  // server used to say "0 of 4" of a lot that might be finished.
  const server = fakeServer();
  const a = newStore(server);
  await a.save(normaliseLot(two), { by: BY });
  const b = newStore(server, fakeStorage());     // a device that has never held it
  const rows = await b.list();
  ok('a lot known only from the server carries NO count rather than a zero',
     rows.length === 1 && rows[0].sublots_entered === null, rows[0] && rows[0].sublots_entered);
  ok('…while the device holding it counts it', (await a.list())[0].sublots_entered === 2);
}

// =====================================================================
head('merging two files');
// =====================================================================
{
  const a = normaliseLot({ ...blankLot(IDENT), records: { QC01: { values: { x: 1 }, updated_at: '2026-09-01' } } });
  const b = normaliseLot({ ...blankLot(IDENT), records: { QA01: { values: { y: 2 }, updated_at: '2026-09-02' } } });
  const m = mergeLots(a, b);
  ok('a file carrying only QA01 cannot wipe the sublots', !!m.records.QC01 && !!m.records.QA01);
  ok('two different lots refuse to merge',
     (await raises(async () => mergeLots(a, blankLot({ ...IDENT, lot_number: 9 })), 'invalid')).ok);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
