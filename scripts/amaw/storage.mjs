// PlantBook lot storage — one interface, two implementations.
//
// Jake has not decided whether an AMAW lot lives in a file (localStorage plus
// download/upload, exactly as DesignBook works) or in Supabase. Both are
// being built until he has talked to Tate and Andrew — see
// docs/plantbook-storage.md for the argument and supabase/amaw_lots.sql for
// the schema half. This module is what makes that decision cheap to reverse:
// the page only ever calls save / load / list / remove, and the envelope is
// the same shape on disk and in jsonb, so flipping the flag changes where a
// lot lives, not what it is.
//
//   import { createLotStore } from './storage.mjs';
//   const store = createLotStore({ backend: CONFIG.STORAGE.BACKEND, client: sb });
//
// PURE MODULE. No DOM beyond `localStorage`, which is probed rather than
// assumed: CLAUDE.md records that it can come back empty or throw outright
// (private window, cleared or blocked site data), so every read and write
// here is wrapped and `available()` is the honest answer, not a guess. The
// Supabase client is INJECTED, never imported — the pages are self-contained
// with no build step, and this file has to be loadable in Node for tests.
//
// Everything is async in both implementations even where localStorage is
// synchronous, so the two are interchangeable without the caller knowing
// which it holds.

// ---------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------
// Same body either way: a lot's identity, its lot-level values, its seven
// test records, and an append-only history. Bump VERSION only for a breaking
// change — `load()` refuses a newer envelope rather than half-reading it,
// the same rule readHandoffPDF() follows in designbook.html.
export const LOT_FORMAT = 'kytc-plantbook-lot';
export const LOT_VERSION = 1;

// t_tst_rslt_dtl's own block ids (docs/amaw-map.md), in workbook order.
export const BLOCKS = ['VI01', 'QC01', 'QC02', 'QC03', 'QC04', 'QA01', 'IQ01'];
// QA01 is Department acceptance, IQ01 independent assurance. Both are filled
// by KYTC district personnel, not by the plant — which is the single fact
// that makes the file model hard (they never hold the contractor's file) and
// the stored model's department path necessary.
export const DEPARTMENT_BLOCKS = ['QA01', 'IQ01'];
export const isDepartmentBlock = (block) => DEPARTMENT_BLOCKS.indexOf(block) >= 0;

// A lot is identified by contract + plant + mix + lot number. Same four
// columns as amaw_lots' unique index, so a key computed here and a row found
// there can never disagree about which lot is which.
export const IDENTITY = ['contract_id', 'amp_number', 'mix_id', 'lot_number'];

/** Stable key for one lot. Uppercased and trimmed so "252112 " and "252112"
 *  are not two lots; `|` cannot appear in any of the four fields. */
export function lotKey(identity) {
  const part = (v) => String(v == null ? '' : v).trim().toUpperCase();
  const missing = IDENTITY.filter((k) => !part(identity && identity[k]));
  if (missing.length) throw new StorageError('invalid', `lot identity is missing ${missing.join(', ')}`);
  return IDENTITY.map((k) => part(identity[k])).join('|');
}

/** A new, empty lot envelope. */
export function blankLot(identity, extra) {
  const lot = {
    format: LOT_FORMAT,
    version: LOT_VERSION,
    key: lotKey(identity),
    contract_id: String(identity.contract_id).trim(),
    amp_number: String(identity.amp_number).trim(),
    mix_id: String(identity.mix_id).trim(),
    mix_signature: (extra && extra.mix_signature) || null,
    lot_number: Number(identity.lot_number),
    plant_name: (extra && extra.plant_name) || null,
    status: 'Open',
    values: {},           // lot-level: blend, Pay Values header, recycle
    rows: {},             // {cores:[...], gradation:[...]} — core count is NOT fixed
    records: {},          // block -> { values, rows, revision, entered_by, entered_name, updated_at }
    extracted_from: {},   // field -> source cell; provisional, never authoritative
    history: [],          // append only
    saved_at: null,
    saved_by: null,
    revision: 0,
  };
  return lot;
}

/** Normalise anything claiming to be a lot, and refuse a future version. */
export function normaliseLot(raw) {
  if (!raw || typeof raw !== 'object') throw new StorageError('invalid', 'not a lot envelope');
  if (raw.format && raw.format !== LOT_FORMAT) {
    throw new StorageError('invalid', `not a PlantBook lot (format "${raw.format}")`);
  }
  if (Number(raw.version || 1) > LOT_VERSION) {
    throw new StorageError('invalid',
      `this lot was written by a newer PlantBook (v${raw.version}); update the page rather than opening it`);
  }
  const lot = blankLot(raw, raw);
  for (const k of ['mix_signature', 'plant_name', 'status', 'saved_at', 'saved_by']) {
    if (raw[k] != null) lot[k] = raw[k];
  }
  for (const k of ['values', 'rows', 'records', 'extracted_from']) {
    if (raw[k] && typeof raw[k] === 'object') lot[k] = raw[k];
  }
  lot.history = Array.isArray(raw.history) ? raw.history : [];
  lot.revision = Number(raw.revision || 0);
  lot.key = lotKey(lot);
  return lot;
}

/** The row a list() returns. Identical from both backends so the queue screen
 *  does not care which one it is talking to. */
export function lotSummary(lot) {
  const records = lot.records || {};
  const entered = BLOCKS.filter((b) => records[b] && hasContent(records[b]));
  return {
    key: lot.key,
    contract_id: lot.contract_id,
    amp_number: lot.amp_number,
    plant_name: lot.plant_name || null,
    mix_id: lot.mix_id,
    mix_signature: lot.mix_signature || null,
    lot_number: lot.lot_number,
    status: lot.status || 'Open',
    records_entered: entered.length,
    sublots_entered: entered.filter((b) => b.indexOf('QC') === 0).length,
    saved_at: lot.saved_at || null,
    saved_by: lot.saved_by || null,
  };
}

function hasContent(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const v = rec.values || {};
  return Object.keys(v).some((k) => v[k] !== null && v[k] !== '' && v[k] !== undefined);
}

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------
// Callers switch on `.code`, never on the message. `conflict` is the one that
// needs its own wording on screen: a week-long lot means stale tabs are
// normal, and "a colleague saved first, reload" is a different sentence from
// "something went wrong".
export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'StorageError';
    this.code = code;          // unavailable | quota | conflict | not_found | denied | invalid | backend
    if (cause) this.cause = cause;
  }
}

// =====================================================================
// (a) FILE MODEL — localStorage
// =====================================================================
// What DesignBook does, ported. Everything stays on this machine, in this
// browser, at this origin. Read docs/plantbook-storage.md before relying on
// it for a lot that spans days: origin scoping, Safari's 7-day eviction,
// cleared site data, a second device and a QA technician at another employer
// are all real and all silent.

const LOCAL_PREFIX = 'amaw_lot:';
const LOCAL_INDEX = 'amaw_lot_index';

/**
 * @param {object} [opts]
 * @param {Storage} [opts.storage]  injectable for tests; defaults to globalThis.localStorage
 * @param {string}  [opts.prefix]
 */
export function localLotStore(opts = {}) {
  const prefix = opts.prefix || LOCAL_PREFIX;
  const indexKey = (opts.prefix ? opts.prefix + 'index' : LOCAL_INDEX);

  // Resolved once, defensively: touching localStorage at all can throw in a
  // locked-down browser, so even reading the property is inside the try.
  function store() {
    try {
      const s = opts.storage || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
      if (!s) return null;
      return s;
    } catch (_) { return null; }
  }

  // A write probe, not just a presence check: Safari in private mode exposes
  // localStorage and throws on setItem, so "it exists" proves nothing.
  function probe() {
    const s = store();
    if (!s) return { ok: false, reason: 'this browser has no localStorage' };
    const k = prefix + '__probe';
    try {
      s.setItem(k, '1');
      s.removeItem(k);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'localStorage is not writable here (private window, or site data is blocked)', cause: err };
    }
  }

  function readJSON(key, fallback) {
    const s = store();
    if (!s) return fallback;
    let raw = null;
    try { raw = s.getItem(key); } catch (_) { return fallback; }
    if (raw == null || raw === '') return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }   // corrupt is the same as absent
  }

  function writeJSON(key, value) {
    const s = store();
    if (!s) throw new StorageError('unavailable', 'localStorage is not available');
    let text;
    try { text = JSON.stringify(value); }
    catch (err) { throw new StorageError('invalid', 'this lot cannot be serialised', err); }
    try { s.setItem(key, text); }
    catch (err) {
      // QuotaExceededError is not hypothetical here. KYCT Data Sublot # 1-4
      // are A1:AE1031 each; a full lot is not a mix design.
      const quota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
      throw new StorageError(quota ? 'quota' : 'unavailable',
        quota ? 'this browser is out of storage — download the working copy now, before anything else'
              : 'localStorage refused the write', err);
    }
  }

  const index = {
    read: () => {
      const idx = readJSON(indexKey, {});
      return (idx && typeof idx === 'object') ? idx : {};
    },
    write: (idx) => writeJSON(indexKey, idx),
  };

  return {
    name: 'local',

    async available() { return probe(); },

    async save(lot, { by = null } = {}) {
      const p = probe();
      if (!p.ok) throw new StorageError('unavailable', p.reason, p.cause);
      const next = normaliseLot(lot);
      next.saved_at = new Date().toISOString();
      next.saved_by = by || next.saved_by || null;
      next.revision = Number(next.revision || 0) + 1;
      writeJSON(prefix + next.key, next);
      // Index second: if the lot write succeeded and this one throws, the lot
      // is still on disk and a rebuildIndex() recovers it. The other order
      // would advertise a lot that is not there.
      try {
        const idx = index.read();
        idx[next.key] = lotSummary(next);
        index.write(idx);
      } catch (_) { /* the lot itself is saved; the list is rebuildable */ }
      return next;
    },

    async load(key) {
      const raw = readJSON(prefix + String(key), null);
      if (!raw) return null;
      return normaliseLot(raw);
    },

    async list(filter = {}) {
      const idx = index.read();
      let out = Object.keys(idx).map((k) => idx[k]).filter(Boolean);
      out = applyFilter(out, filter);
      out.sort(byRecency);
      return out;
    },

    async remove(key) {
      const s = store();
      if (!s) throw new StorageError('unavailable', 'localStorage is not available');
      let existed = false;
      try { existed = s.getItem(prefix + String(key)) != null; s.removeItem(prefix + String(key)); }
      catch (err) { throw new StorageError('unavailable', 'localStorage refused the delete', err); }
      try { const idx = index.read(); delete idx[String(key)]; index.write(idx); } catch (_) {}
      return existed;
    },

    // Local-only extra. The index is a cache of the lots themselves, so it can
    // always be rebuilt — after a partial write, or after a lot arrives by
    // file import rather than through save().
    async rebuildIndex() {
      const s = store();
      if (!s) throw new StorageError('unavailable', 'localStorage is not available');
      const idx = {};
      let n = 0;
      try { n = s.length; } catch (_) { return 0; }
      for (let i = 0; i < n; i++) {
        let k = null;
        try { k = s.key(i); } catch (_) { continue; }
        if (!k || k.indexOf(prefix) !== 0 || k === indexKey) continue;
        const raw = readJSON(k, null);
        if (!raw) continue;
        try { const lot = normaliseLot(raw); idx[lot.key] = lotSummary(lot); } catch (_) { /* skip a corrupt one */ }
      }
      index.write(idx);
      return Object.keys(idx).length;
    },
  };
}

// =====================================================================
// (b) STORED MODEL — Supabase
// =====================================================================
// Against supabase/amaw_lots.sql, which is NOT APPLIED. Every call here
// fails cleanly with code 'backend' until Andrew applies it, which is what
// lets both paths sit in the page at once.
//
// Two things about this implementation are not incidental:
//
//  * It writes ONE ROW PER TEST RECORD, because the table is shaped that way.
//    A contractor QC tech saving sublot 3 and a district tech saving QA01
//    touch different rows, days apart. Collapsing the seven into one document
//    would rebuild the file model's merge problem inside Postgres.
//  * QA01/IQ01 go through the `amaw_save_department_record` RPC, never a
//    plain update. A district technician has no plant access row, so the lot
//    fails the SELECT policy, so a direct UPDATE resolves no target and
//    silently writes 0 rows — the exact trap CLAUDE.md records. The RPC is
//    SECURITY DEFINER for that reason.

/**
 * @param {object} opts
 * @param {object} opts.client  a supabase-js client (injected — never named
 *                              `supabase` at a page's top level, see CLAUDE.md)
 */
export function supabaseLotStore(opts = {}) {
  const sb = opts.client;
  if (!sb) throw new StorageError('invalid', 'supabaseLotStore needs a client');
  const T_LOTS = opts.lotsTable || 'amaw_lots';
  const T_RECORDS = opts.recordsTable || 'amaw_lot_records';
  const V_SUMMARIES = opts.summariesView || 'amaw_lot_summaries';
  const RPC_SAVE_DEPT = opts.saveDepartmentRpc || 'amaw_save_department_record';

  // PostgREST error -> StorageError. The two that matter:
  //   42P01 - the table does not exist, i.e. the DDL has not been applied.
  //   PGRST116 - "multiple (or no) rows returned" from .single(). It is what
  //     an RLS-filtered or revision-filtered write looks like from the client
  //     (CLAUDE.md): Postgres touched 0 rows and .single() complained about
  //     the count. It is a conflict or a permission answer, never a bug to
  //     show raw.
  function fail(err, what) {
    if (!err) return null;
    const code = err.code || '';
    if (code === '42P01') {
      return new StorageError('backend', 'PlantBook storage is not set up on this project yet (supabase/amaw_lots.sql has not been applied)', err);
    }
    if (code === 'PGRST116') {
      return new StorageError('conflict', `${what} matched no row — either a colleague saved first, or this lot is not yours to change`, err);
    }
    if (code === '42501' || code === 'PGRST301') {
      return new StorageError('denied', `you do not have access to ${what}`, err);
    }
    return new StorageError('backend', err.message || `${what} failed`, err);
  }

  return {
    name: 'supabase',

    async available() {
      try {
        const { error } = await sb.from(V_SUMMARIES).select('id').limit(1);
        if (error) { const e = fail(error, 'PlantBook storage'); return { ok: false, reason: e.message, cause: error }; }
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: 'could not reach Supabase', cause: err };
      }
    },

    async save(lot, { by = null, blocks = null } = {}) {
      const next = normaliseLot(lot);
      next.saved_at = new Date().toISOString();
      next.saved_by = by || next.saved_by || null;

      // 1. The lot row. Identity is immutable server-side (amaw_lots_guard),
      //    so an upsert on the natural key is safe to repeat.
      const { data: lotRow, error: lotErr } = await sb.from(T_LOTS)
        .upsert({
          contract_id: next.contract_id,
          amp_number: next.amp_number,
          mix_id: next.mix_id,
          lot_number: next.lot_number,
          mix_signature: next.mix_signature,
          status: next.status,
          values: next.values,
          rows: next.rows,
          extracted_from: next.extracted_from,
          // author_name is stamped by the trigger; sent so the NOT NULL is
          // satisfied on the first insert of a session.
          author_name: (by && by.name) || 'unknown',
        }, { onConflict: 'contract_id,amp_number,mix_id,lot_number' })
        .select('id')
        .single();
      if (lotErr) throw fail(lotErr, 'this lot');
      const lotId = lotRow.id;

      // 2. The records. Only the blocks asked for, so saving sublot 3 does
      //    not rewrite sublot 1 and steal its revision.
      const wanted = (blocks && blocks.length ? blocks : BLOCKS)
        .filter((b) => next.records && next.records[b]);
      for (const block of wanted) {
        const rec = next.records[block] || {};
        if (isDepartmentBlock(block)) {
          const { data, error } = await sb.rpc(RPC_SAVE_DEPT, {
            p_lot_id: lotId,
            p_block: block,
            p_values: rec.values || {},
            p_rows: rec.rows || {},
            p_revision: rec.revision == null ? null : Number(rec.revision),
          });
          if (error) {
            // The function raises on a stale revision rather than returning,
            // so the message is the only discriminator available.
            if (/stale revision/i.test(error.message || '')) {
              throw new StorageError('conflict', `${block} was saved by someone else while you were editing — reload it`, error);
            }
            throw fail(error, `the ${block} record`);
          }
          rec.revision = Number(data);
        } else {
          const { data, error } = await sb.from(T_RECORDS)
            .upsert({
              lot_id: lotId, block,
              values: rec.values || {},
              rows: rec.rows || {},
            }, { onConflict: 'lot_id,block' })
            .select('revision, entered_name, updated_at')
            .single();
          if (error) throw fail(error, `the ${block} record`);
          rec.revision = data.revision;
          rec.entered_name = data.entered_name;
          rec.updated_at = data.updated_at;
        }
        next.records[block] = rec;
      }
      return next;
    },

    async load(key) {
      const [contract_id, amp_number, mix_id, lot_number] = String(key).split('|');
      const { data: row, error } = await sb.from(T_LOTS)
        .select('id, contract_id, amp_number, mix_id, mix_signature, lot_number, status, values, rows, extracted_from, author_name, updated_at')
        .eq('contract_id', contract_id).eq('amp_number', amp_number)
        .eq('mix_id', mix_id).eq('lot_number', Number(lot_number))
        .maybeSingle();
      if (error) throw fail(error, 'this lot');
      if (!row) return null;

      const { data: recs, error: recErr } = await sb.from(T_RECORDS)
        .select('block, values, rows, revision, entered_name, updated_at')
        .eq('lot_id', row.id);
      if (recErr) throw fail(recErr, "this lot's test records");

      const lot = blankLot(row, row);
      lot.status = row.status;
      lot.values = row.values || {};
      lot.rows = row.rows || {};
      lot.extracted_from = row.extracted_from || {};
      lot.saved_at = row.updated_at || null;
      lot.saved_by = row.author_name ? { name: row.author_name } : null;
      for (const r of (recs || [])) {
        lot.records[r.block] = {
          values: r.values || {}, rows: r.rows || {},
          revision: r.revision, entered_name: r.entered_name, updated_at: r.updated_at,
        };
      }
      return lot;
    },

    async list(filter = {}) {
      let q = sb.from(V_SUMMARIES).select('*');
      if (filter.amp_number) q = q.eq('amp_number', filter.amp_number);
      if (filter.contract_id) q = q.eq('contract_id', filter.contract_id);
      if (filter.status) q = q.eq('status', filter.status);
      if (filter.mix_id) q = q.eq('mix_id', filter.mix_id);
      const { data, error } = await q.order('updated_at', { ascending: false }).limit(filter.limit || 200);
      if (error) throw fail(error, 'the lot list');
      const out = (data || []).map((r) => ({
        key: lotKey(r),
        contract_id: r.contract_id,
        amp_number: r.amp_number,
        plant_name: r.plant_name || null,
        mix_id: r.mix_id,
        mix_signature: r.mix_signature || null,
        lot_number: r.lot_number,
        status: r.status,
        records_entered: r.records_entered || 0,
        sublots_entered: r.sublots_entered || 0,
        saved_at: r.updated_at || null,
        saved_by: r.author_name ? { name: r.author_name } : null,
      }));
      return applyFilter(out, { ...filter, amp_number: null, contract_id: null, status: null, mix_id: null });
    },

    async remove(key) {
      const [contract_id, amp_number, mix_id, lot_number] = String(key).split('|');
      // The delete policy allows the author's own Open lot only. Anything
      // else deletes nothing and reports it, rather than appearing to work.
      const { data, error } = await sb.from(T_LOTS).delete()
        .eq('contract_id', contract_id).eq('amp_number', amp_number)
        .eq('mix_id', mix_id).eq('lot_number', Number(lot_number))
        .select('id');
      if (error) throw fail(error, 'this lot');
      if (!data || !data.length) {
        throw new StorageError('denied', 'only the technician who started a lot can delete it, and only while it is Open');
      }
      return true;
    },
  };
}

// =====================================================================
// The switch
// =====================================================================
// One flag. `CONFIG.STORAGE = { BACKEND: 'local' | 'supabase' }` in the page,
// and this is the only place that reads it.
export const BACKENDS = ['local', 'supabase'];

export function createLotStore(config = {}) {
  const backend = config.backend || 'local';
  if (backend === 'local') return localLotStore(config);
  if (backend === 'supabase') return supabaseLotStore(config);
  throw new StorageError('invalid', `unknown storage backend "${backend}" (expected ${BACKENDS.join(' or ')})`);
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------
function applyFilter(rows, filter) {
  let out = rows;
  for (const k of ['contract_id', 'amp_number', 'mix_id', 'status']) {
    if (filter && filter[k]) out = out.filter((r) => String(r[k]) === String(filter[k]));
  }
  if (filter && filter.lot_number != null) out = out.filter((r) => Number(r.lot_number) === Number(filter.lot_number));
  return out;
}

function byRecency(a, b) {
  return String(b.saved_at || '').localeCompare(String(a.saved_at || ''));
}

/** Merge a lot read from a file into one already held, record by record.
 *  Used by the file model's import and by any future local-first sync: the
 *  newer `updated_at` wins PER RECORD, never per lot, so importing a file
 *  that carries only QA01 cannot wipe four sublots. */
export function mergeLots(base, incoming) {
  const a = normaliseLot(base);
  const b = normaliseLot(incoming);
  if (a.key !== b.key) throw new StorageError('invalid', 'these are two different lots');
  const out = normaliseLot(a);
  for (const block of BLOCKS) {
    const ra = a.records[block], rb = b.records[block];
    if (!rb) continue;
    if (!ra) { out.records[block] = rb; continue; }
    const ta = String(ra.updated_at || ''), tb = String(rb.updated_at || '');
    out.records[block] = (tb > ta) ? rb : ra;
  }
  const seen = new Set();
  out.history = a.history.concat(b.history)
    .filter((h) => { const k = JSON.stringify(h); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => String(x.at || '').localeCompare(String(y.at || '')));
  return out;
}
