// PlantBook lot storage — local first, Supabase behind it.
//
// SETTLED 2026-09-22 (Jake): "the information of the plantbook data is deleted
// once the project is over or a week after is the best way to do this. Along
// the way contractors will still be downloading the pdf as a back up. Storage
// has to be the way." So this is no longer two competing implementations with
// a flag between them, as docs/plantbook-storage.md describes it — it is one
// store with two layers:
//
//   localStorage   always written, always first, always the thing on screen.
//   Supabase       written when it is reachable, caught up when it is not.
//
//   const store = createLotStore({ client: sb, backend: 'synced' });
//
// The order is the whole design. A plant is a shed beside a drum mixer and a
// technician with no signal must never be told to wait for one — so a save
// lands on this machine, returns, and the network happens afterwards. Jake,
// 2026-09-22: "we need it to work offline too."
//
// PURE MODULE. No DOM beyond `localStorage`, which is probed rather than
// assumed: CLAUDE.md records that it can come back empty or throw outright
// (private window, cleared or blocked site data), so every read and write here
// is wrapped and `available()` is the honest answer, not a guess. The Supabase
// client is INJECTED, never imported — the pages are self-contained with no
// build step, and this file has to be loadable in Node for its checker.
//
// Everything is async in both layers even where localStorage is synchronous,
// so a caller never has to know which one answered.
//
// ---------------------------------------------------------------------
// THE QUEUE IS NOT A QUEUE
// ---------------------------------------------------------------------
// There is no list of pending writes anywhere, and that is deliberate. Every
// lot carries `revision` (bumped on every local save) and `synced_revision`
// (the revision the server has confirmed). A lot needs pushing exactly when
// those differ, so the outbox is DERIVED from the lots themselves and cannot
// drift from them, go stale, or survive a lot being deleted. A queue that can
// disagree with its contents is a queue that eventually does.
//
// The same two numbers answer the question that actually bites — was this
// edited in two places? `unsynced` means local moved; a server revision above
// `synced_revision` means the server moved; BOTH is a conflict, and it is
// reported rather than resolved, because silently picking one loses a
// technician's afternoon.

// The one thing read from the schema: what counts as somebody having recorded
// something on a sublot (lotSummary()'s count). sections.mjs imports nothing,
// so this cannot become a cycle.
import { rowHoldsMeasurement, measuredScalarSublot } from './sections.mjs';

// ---------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------
// Same body on disk, in jsonb, in the .json download and inside the lot PDF.
// Bump VERSION only for a breaking change — `load()` refuses a newer envelope
// rather than half-reading it, the same rule readHandoffPDF() follows in
// designbook.html.
export const LOT_FORMAT = 'kytc-plantbook-lot';
export const LOT_VERSION = 1;

// t_tst_rslt_dtl's own block ids (docs/amaw-map.md), in workbook order.
export const BLOCKS = ['VI01', 'QC01', 'QC02', 'QC03', 'QC04', 'QA01', 'IQ01'];
// QA01 is Department acceptance, IQ01 independent assurance. Both are filled
// by KYTC district personnel, not by the plant — the single fact that makes a
// file-only model hard, and the one supabase/amaw_lots.sql still cannot model
// because district scoping has no representation in the schema.
export const DEPARTMENT_BLOCKS = ['QA01', 'IQ01'];
export const isDepartmentBlock = (block) => DEPARTMENT_BLOCKS.indexOf(block) >= 0;

// Open -> Submitted -> Accepted, one way. Jake, 2026-09-22: "A lot is never
// opened by a contractor or kytc after it has been submitted to the state."
export const LOT_STATUSES = ['Open', 'Submitted', 'Accepted'];

// THE CHAIN BLOCK: what the record stamps on a lot and the client never
// writes - the status, and the who, when and hash beside it. One list, read
// off the seal's own returned row (amaw_lots) and off amaw_lot_summaries
// alike, so "take the record's chain" means the same columns wherever it
// happens.
const CHAIN_FIELDS = ['status', 'submitted_at', 'submitted_name', 'accepted_at', 'accepted_name',
                      'submittal_sha256', 'prev_sha256', 'purge_after', 'purged_at'];
const statusRank = (s) => LOT_STATUSES.indexOf(s);

function chainOf(row) {
  const out = {};
  for (const k of CHAIN_FIELDS) out[k] = row && row[k] != null ? row[k] : null;
  return out;
}

// Copy the record's chain onto a lot. Only ever FROM the record: the client
// takes these and never writes them, which amaw_lots_guard() enforces
// server-side.
function takeChain(lot, row) {
  if (!lot || !row || typeof row !== 'object') return lot;
  const c = chainOf(row);
  if (statusRank(c.status) >= 0) lot.status = c.status;
  for (const k of CHAIN_FIELDS) if (k !== 'status' && c[k] != null) lot[k] = c[k];
  return lot;
}

// Does the record already hold what this seal asked for? An Accept is held
// by a record that reads Accepted, whoever pressed it - which is the point:
// both reviewers get the submittal email, so a second reviewer finding the lot
// already accepted is the ordinary case, and so is an Accept whose response
// was lost on the way back. A SUBMISSION is held only by a record carrying
// this submission's own hash: another device's submission of the same lot is
// a different document, and that is a refusal, not an agreement.
function holdsSeal(rec, seal) {
  if (!rec || !seal) return false;
  if (seal.status === 'Accepted') return rec.status === 'Accepted';
  return statusRank(rec.status) >= statusRank('Submitted') &&
         !!seal.sha256 && rec.submittal_sha256 === seal.sha256;
}

// ---------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------
// The six parts, settled 2026-09-17 (Jake): the lot number restarts per
// contract + LINE ITEM + design + plant, "and it could be the same of all
// those but be option B instead of option A dictated by kytc guys during the
// project from the district".
//
// This is the NATURAL key. It is not what a lot is stored under — see
// `uid` below — because two of the six legitimately change after a lot is
// open: a change order renumbers the line item, and the district switches the
// compaction option mid-job. Keying on them would fork a lot into two records
// the moment somebody corrected one, with the week's work stranded on the old
// one. Same six columns as amaw_lots' unique index, so a key computed here and
// a row found there can never disagree about which lot is which.
export const IDENTITY = ['contract_id', 'line_item', 'amp_number', 'mix_id', 'lot_number', 'density_option'];
// The four that must be present. A lot genuinely may not know its line item
// yet (the contract's items have not been looked up) or its option (the
// proposal carries one note per route and this contract has two).
const IDENTITY_REQUIRED = ['contract_id', 'amp_number', 'mix_id', 'lot_number'];

/** Stable natural key for one lot. Uppercased and trimmed so "252112 " and
 *  "252112" are not two lots; `|` cannot appear in any of the six fields. */
export function lotKey(identity) {
  const part = (v) => String(v == null ? '' : v).trim().toUpperCase();
  const missing = IDENTITY_REQUIRED.filter((k) => !part(identity && identity[k]));
  if (missing.length) throw new StorageError('invalid', `lot identity is missing ${missing.join(', ')}`);
  return IDENTITY.map((k) => part(identity[k])).join('|');
}

/** The six parts as the ledger's own columns, ready to send. */
export function lotIdentity(lot) {
  return {
    contract_id:    String(lot.contract_id || '').trim(),
    line_item:      String(lot.line_item || '').trim(),
    amp_number:     String(lot.amp_number || '').trim(),
    mix_id:         String(lot.mix_id || '').trim(),
    lot_number:     Number(lot.lot_number),
    density_option: String(lot.density_option || '').trim().toUpperCase(),
  };
}

// The line item and the compaction option are not fields a technician types
// into an identity box — they are consequences of two lookups. Reading them
// off the envelope is what keeps the identity a FUNCTION of the lot rather
// than a second copy of it that can drift.
//
// The line item refuses to guess between two candidates, exactly as
// expectedLots() does: a contract with a PCN per route can carry this mix on
// both, and picking the first would file the lot under a line it was not
// produced on.
export function deriveIdentityParts(lot) {
  const values = (lot && lot.values) || {};
  const rows = (lot && lot.rows) || {};
  const items = Array.isArray(rows.project_items) ? rows.project_items : [];
  const lines = [];
  for (const r of items) {
    const v = r && (r.line != null ? r.line : r.line_item);
    const s = v == null ? '' : String(v).trim();
    if (s && lines.indexOf(s) < 0) lines.push(s);
  }
  return {
    line_item: lines.length === 1 ? lines[0] : '',
    density_option: String(values.lot_density_option || '').trim().toUpperCase().replace(/^OPTION\s+/, ''),
  };
}

// ---------------------------------------------------------------------
// uid — what a lot is actually stored under
// ---------------------------------------------------------------------
// Fixed at birth, on this machine, before the lot has ever reached a server.
// That is what lets a technician with no signal start a lot at all, and it is
// what makes every later push an upsert rather than a reconciliation.
//
// IT IS DERIVED FROM THE NATURAL KEY, NOT RANDOM, and that was a correction
// rather than the first instinct. A random uid gives two people who each start
// lot 3 offline — the day shift on the shared tablet, the night shift on a
// laptop — two rows carrying one identity, and the second one to get a signal
// is refused by amaw_lots' unique index with nothing a technician can do about
// it. Derived, they are one lot: both push to the same row and the second sees
// an ordinary revision conflict, which is a sentence the page can actually
// say. It also makes re-importing the same .json twice land on the lot it
// already is, instead of quietly making a second one.
//
// Fixed at BIRTH is the other half. normaliseLot() carries an existing uid
// through untouched, so a lot whose line item a change order renumbers, or
// whose compaction option the district switches mid-job, keeps the uid it was
// born with — the two identity parts that legitimately move cannot move the
// lot out from under a week of work.
//
// The narrow case it cannot tell apart: two genuinely different lots both
// started BEFORE their compaction option was known, so both born on the same
// key. The page guards that by looking for an existing lot on the key before
// opening a new one, and saying so rather than merging.

/** A uuid that is a pure function of a string. Deterministic on purpose. */
export function uidFromKey(key) {
  // FNV-1a over four offset streams. Not a cryptographic hash and does not
  // need to be — it only has to be stable and collision-free across the few
  // hundred lots one contractor will ever re-import.
  const bytes = new Uint8Array(16);
  for (let s = 0; s < 4; s++) {
    let h = 0x811c9dc5 ^ (s * 0x01000193);
    const salted = key + '#' + s;
    for (let i = 0; i < salted.length; i++) {
      h ^= salted.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    bytes[s * 4] = (h >>> 24) & 0xff; bytes[s * 4 + 1] = (h >>> 16) & 0xff;
    bytes[s * 4 + 2] = (h >>> 8) & 0xff; bytes[s * 4 + 3] = h & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

function bytesToUuid(b) {
  const hex = [];
  for (let i = 0; i < 16; i++) hex.push((b[i] + 0x100).toString(16).slice(1));
  return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
         hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
}

/** A new, empty lot envelope. */
export function blankLot(identity, extra) {
  const e = extra || {};
  const lot = {
    format: LOT_FORMAT,
    version: LOT_VERSION,
    uid: e.uid || identity.uid || null,       // filled below
    key: lotKey(identity),
    contract_id: String(identity.contract_id).trim(),
    line_item: String(identity.line_item == null ? (e.line_item || '') : identity.line_item).trim(),
    amp_number: String(identity.amp_number).trim(),
    mix_id: String(identity.mix_id).trim(),
    mix_signature: e.mix_signature || null,
    lot_number: Number(identity.lot_number),
    density_option: String(identity.density_option == null ? (e.density_option || '') : identity.density_option)
                      .trim().toUpperCase(),
    plant_name: e.plant_name || null,
    status: 'Open',
    values: {},           // lot-level: Contract & Mix, the binder block, the approval's `design`
    rows: {},             // every repeating table, flat, keyed as the form keys them
    records: {},          // block -> {...}. Unused until district scoping exists.
    extracted_from: {},   // field -> source cell; provisional, never authoritative
    history: [],          // append only
    saved_at: null,
    saved_by: null,
    revision: 0,
    // --- sync bookkeeping. See "THE QUEUE IS NOT A QUEUE" above. ---------
    // THREE counters, because there are two independent sequences. `revision`
    // counts saves on THIS machine; `server_revision` is the number the server
    // last handed back, and is the optimistic token a later push must present;
    // `synced_revision` is the local revision that push confirmed. Conflating
    // the first two sends a local count where the server expects its own, and
    // the mismatch reads as "somebody else saved first" on a lot nobody else
    // has touched.
    synced_revision: null,   // the local revision the server has confirmed
    server_revision: null,   // the server's own counter, as it last reported it
    synced_at: null,
    pending_seal: null,      // a Submit made with no signal, waiting to be sent
    // --- stamped by the server, never by the page ------------------------
    submitted_at: null, submitted_name: null,
    accepted_at: null,  accepted_name: null,
    submittal_sha256: null, prev_sha256: null,
    purge_after: null, purged_at: null,
  };
  lot.uid = lot.uid || uidFromKey(lot.key);
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
  for (const k of ['mix_signature', 'plant_name', 'saved_at', 'saved_by',
                   'synced_at', 'pending_seal',
                   'submitted_at', 'submitted_name', 'accepted_at', 'accepted_name',
                   'submittal_sha256', 'prev_sha256', 'purge_after', 'purged_at']) {
    if (raw[k] != null) lot[k] = raw[k];
  }
  for (const k of ['values', 'rows', 'records', 'extracted_from']) {
    if (raw[k] && typeof raw[k] === 'object') lot[k] = raw[k];
  }
  // What the record said when it last REFUSED a seal from this device (see
  // pushOne()). Store bookkeeping, like pending_seal, and carried only when
  // there is one, so an ordinary lot's shape does not change.
  if (raw.seal_refused && typeof raw.seal_refused === 'object') lot.seal_refused = raw.seal_refused;
  lot.history = Array.isArray(raw.history) ? raw.history : [];
  lot.revision = Number(raw.revision || 0);
  lot.synced_revision = raw.synced_revision == null ? null : Number(raw.synced_revision);
  lot.server_revision = raw.server_revision == null ? null : Number(raw.server_revision);
  // An unknown status reads as Open rather than being carried: every gate in
  // the page and every policy in the database switches on these three words.
  lot.status = LOT_STATUSES.indexOf(raw.status) >= 0 ? raw.status : 'Open';

  return restampIdentity(lot);
}

/**
 * Re-derive the two identity parts a lookup fills in AFTER a lot is open, and
 * restamp the key from them. Idempotent, and the one definition of the rule —
 * intake.mjs calls it too, on the lot it builds from an approval and on the
 * one it rolls forward, because a lot whose key disagreed with its own
 * contents would be filed under a line item it was not produced on the first
 * time anybody saved it.
 *
 * An explicit value already on the envelope wins: a lot read back from the
 * LEDGER carries what the server believes, and for an already-stored lot that
 * is the authority. The uid is NOT restamped — it is fixed at birth, which is
 * the whole point of it.
 */
export function restampIdentity(lot) {
  const derived = deriveIdentityParts(lot);
  if (!lot.line_item && derived.line_item) lot.line_item = derived.line_item;
  if (!lot.density_option && derived.density_option) lot.density_option = derived.density_option;
  lot.key = lotKey(lot);
  return lot;
}

/** The row a list() returns. Identical from both layers so a queue screen does
 *  not care which one it is talking to. */
export function lotSummary(lot) {
  const records = lot.records || {};
  const entered = BLOCKS.filter((b) => records[b] && hasContent(records[b]));
  return {
    uid: lot.uid,
    key: lot.key,
    contract_id: lot.contract_id,
    line_item: lot.line_item || '',
    amp_number: lot.amp_number,
    plant_name: lot.plant_name || null,
    mix_id: lot.mix_id,
    mix_signature: lot.mix_signature || null,
    lot_number: lot.lot_number,
    density_option: lot.density_option || '',
    status: lot.status || 'Open',
    // Who moved it along the chain, and when - the record's own stamps, so a
    // list can say "Accepted 2026-09-26 by Tate Salle" rather than a bare word.
    submitted_at: lot.submitted_at || null,
    submitted_name: lot.submitted_name || null,
    accepted_at: lot.accepted_at || null,
    accepted_name: lot.accepted_name || null,
    records_entered: entered.length,
    sublots_entered: sublotsWithContent(lot),
    saved_at: lot.saved_at || null,
    saved_by: lot.saved_by || null,
    revision: Number(lot.revision || 0),
    synced_revision: lot.synced_revision == null ? null : Number(lot.synced_revision),
    server_revision: lot.server_revision == null ? null : Number(lot.server_revision),
    unsynced: isUnsynced(lot),
    has_data: true,
    purge_after: lot.purge_after || null,
    purged_at: lot.purged_at || null,
  };
}

/** Does this lot hold local work the server has not confirmed? */
export function isUnsynced(lot) {
  if (!lot) return false;
  if (lot.pending_seal) return true;
  return Number(lot.revision || 0) !== Number(lot.synced_revision == null ? -1 : lot.synced_revision);
}

// How many of the four sublots somebody has recorded something on. Read off
// the flat row tables and the scalars the form actually writes, because
// `records` is unused today — a count derived from an empty map would report
// every lot as untouched.
//
// WHAT COUNTS IS ASKED OF THE SCHEMA (rowHoldsMeasurement() and
// measuredScalarSublot() in sections.mjs), never listed here. The first
// version counted any non-blank cell but `sublot` and `core_id`, so the
// component numbers, the seeded AC method and the specimen ids every lot
// carries before anybody types made every lot read "4 of 4 sublots". It also
// read the sublot off the part BEFORE the dash, and the page paints "1-3" for
// lot 1's sublot 3 - so every painted row counted as sublot 1, the lot number.
// The trailing number is the sublot, the page's own sublotIndexOf() reading.
function sublotsWithContent(lot) {
  const rows = (lot && lot.rows) || {};
  const values = (lot && lot.values) || {};
  const seen = new Set();
  for (const key of Object.keys(rows)) {
    const list = rows[key];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      const n = r && typeof r === 'object' ? sublotNumberOf(r.sublot) : null;
      if (n != null && rowHoldsMeasurement(key, r)) seen.add(n);
    }
  }
  for (const k of Object.keys(values)) {
    const v = values[k];
    if (v == null || String(v).trim() === '') continue;
    const n = measuredScalarSublot(k);
    if (n != null) seen.add(n);
  }
  return seen.size;
}

// "1-3" is lot 1's sublot 3 and "3" is sublot 3. Anything outside 1..4 is not
// a sublot of this lot and counts for none.
function sublotNumberOf(v) {
  const m = /(\d+)\s*$/.exec(String(v == null ? '' : v).trim());
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 4 ? n : null;
}

function hasContent(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const v = rec.values || {};
  return Object.keys(v).some((k) => v[k] !== null && v[k] !== '' && v[k] !== undefined);
}

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------
// Callers switch on `.code`, never on the message. Two need their own wording
// on screen. `conflict` — a week-long lot makes a stale tab ordinary, and "a
// colleague saved first" is a different sentence from "something went wrong".
// `offline` — not an error at all on this page; the save already succeeded
// locally and the sentence is about when it will reach KYTC.
export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'StorageError';
    // unavailable | quota | conflict | offline | not_found | denied |
    // invalid | backend | not_set_up | sealed
    this.code = code;
    if (cause) this.cause = cause;
  }
}

// A failure that means "the network, not the data". These are retried from the
// outbox; everything else is a real answer and is surfaced.
//
// `not_set_up` is in here because the OUTBOX should behave the same way — a lot
// waits rather than being discarded, and catches up the day the migration is
// applied. It is NOT the same thing to a person, though, and that is the
// distinction `state().notSetUp` exists to carry: "no signal" and "this project
// has no lot storage" want opposite sentences on screen, and for a while the
// page told every contractor they were offline while they were online.
export function isTransient(err) {
  if (!err) return false;
  if (err.code === 'offline' || err.code === 'backend' || err.code === 'not_set_up') return true;
  const m = String(err.message || '').toLowerCase();
  return m.indexOf('failed to fetch') >= 0 || m.indexOf('networkerror') >= 0 ||
         m.indexOf('load failed') >= 0 || m.indexOf('timeout') >= 0;
}

// =====================================================================
// (a) LOCAL — localStorage
// =====================================================================
// Everything stays on this machine, in this browser, at this origin. It is the
// layer that is always written and always read back, so it is also the layer
// that must never throw where it can report instead.

const LOCAL_PREFIX = 'amaw_lot:';

/**
 * @param {object} [opts]
 * @param {Storage} [opts.storage]  injectable for tests; defaults to globalThis.localStorage
 * @param {string}  [opts.prefix]
 */
export function localLotStore(opts = {}) {
  const prefix = opts.prefix || LOCAL_PREFIX;
  const indexKey = prefix + 'index';

  // Resolved once, defensively: touching localStorage at all can throw in a
  // locked-down browser, so even reading the property is inside the try.
  function store() {
    try {
      const s = opts.storage || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
      return s || null;
    } catch (_) { return null; }
  }

  // QuotaExceededError is not hypothetical. A filled lot is ~32 KB and a
  // contractor may hold several at once.
  const isQuota = (err) => !!err && (err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);

  // A write probe, not a presence check: Safari in private mode exposes
  // localStorage and throws on setItem, so "it exists" proves nothing.
  //
  // IT HAS TO TELL A FULL BROWSER FROM A BLOCKED ONE. Both throw here, and
  // they need opposite sentences — one says download your working copy now,
  // the other says this window cannot store anything at all. Reporting the
  // blocked wording to somebody who is simply out of space sends them looking
  // at their privacy settings while the work they have not downloaded sits
  // one tab-close from gone.
  function probe() {
    const s = store();
    if (!s) return { ok: false, code: 'unavailable', reason: 'this browser has no localStorage' };
    const k = prefix + '__probe';
    try { s.setItem(k, '1'); s.removeItem(k); return { ok: true }; }
    catch (err) {
      return isQuota(err)
        ? { ok: false, code: 'quota', cause: err,
            reason: 'this browser is out of storage — download the working copy now, before anything else' }
        : { ok: false, code: 'unavailable', cause: err,
            reason: 'localStorage is not writable here (private window, or site data is blocked)' };
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
      throw new StorageError(isQuota(err) ? 'quota' : 'unavailable',
        isQuota(err) ? 'this browser is out of storage — download the working copy now, before anything else'
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

  const api = {
    name: 'local',

    async available() { return probe(); },

    async save(lot, { by = null, bump = true } = {}) {
      const p = probe();
      if (!p.ok) throw new StorageError(p.code || 'unavailable', p.reason, p.cause);
      const next = normaliseLot(lot);
      next.saved_at = new Date().toISOString();
      next.saved_by = by || next.saved_by || null;
      if (bump) next.revision = Number(next.revision || 0) + 1;
      writeJSON(prefix + next.uid, next);
      // Index second: if the lot write succeeded and this one throws, the lot
      // is still on disk and rebuildIndex() recovers it. The other order would
      // advertise a lot that is not there.
      try {
        const idx = index.read();
        idx[next.uid] = lotSummary(next);
        index.write(idx);
      } catch (_) { /* the lot itself is saved; the list is rebuildable */ }
      return next;
    },

    async load(uid) {
      const raw = readJSON(prefix + String(uid), null);
      if (!raw) return null;
      return normaliseLot(raw);
    },

    /** Find a lot by its natural key rather than its uid — the question a
     *  reopened file asks ("have I already got this lot?"). */
    async findByKey(key) {
      const idx = index.read();
      for (const uid of Object.keys(idx)) {
        if (idx[uid] && idx[uid].key === String(key)) return api.load(uid);
      }
      return null;
    },

    async list(filter = {}) {
      const idx = index.read();
      let out = Object.keys(idx).map((k) => idx[k]).filter(Boolean);
      out = applyFilter(out, filter);
      out.sort(byRecency);
      return out;
    },

    async remove(uid) {
      const s = store();
      if (!s) throw new StorageError('unavailable', 'localStorage is not available');
      let existed = false;
      try { existed = s.getItem(prefix + String(uid)) != null; s.removeItem(prefix + String(uid)); }
      catch (err) { throw new StorageError('unavailable', 'localStorage refused the delete', err); }
      try { const idx = index.read(); delete idx[String(uid)]; index.write(idx); } catch (_) {}
      return existed;
    },

    // The index is a cache of the lots themselves, so it can always be
    // rebuilt — after a partial write, or after a lot arrives by file import
    // rather than through save().
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
        try { const lot = normaliseLot(raw); idx[lot.uid] = lotSummary(lot); } catch (_) { /* skip a corrupt one */ }
      }
      index.write(idx);
      return Object.keys(idx).length;
    },

    /** Every lot holding work the server has not confirmed. The outbox,
     *  derived rather than stored. */
    async outbox() {
      const idx = index.read();
      return Object.keys(idx).filter((uid) => idx[uid] && idx[uid].unsynced);
    },
  };
  return api;
}

// =====================================================================
// (b) REMOTE — Supabase
// =====================================================================
// Against supabase/amaw_lots.sql. Until Andrew applies it every call here
// fails with code 'backend', which isTransient() treats as "not now" — so an
// unapplied schema behaves exactly like a plant with no signal, and the page
// keeps working out of localStorage either way.
//
// Two things about this layer are not incidental:
//
//  * IT NEVER WRITES THE CHAIN. status, the hashes, submitted_*/accepted_* and
//    purge_after go through amaw_seal_lot() and nowhere else, because the
//    guard trigger pins them on any other write. A save that tried would not
//    error — it would silently do nothing, which is worse.
//  * THE LEDGER ROW IS UPSERTED ON `id`, not on the identity. line_item and
//    density_option are the two identity columns a later lookup legitimately
//    changes, and an upsert on the natural key would insert a second lot the
//    first time one of them did.

export function supabaseLotStore(opts = {}) {
  const sb = opts.client;
  if (!sb) throw new StorageError('invalid', 'supabaseLotStore needs a client');
  const T_LOTS = opts.lotsTable || 'amaw_lots';
  const T_DATA = opts.dataTable || 'amaw_lot_data';
  const V_SUMMARIES = opts.summariesView || 'amaw_lot_summaries';
  const RPC_SEAL = opts.sealRpc || 'amaw_seal_lot';

  // PostgREST error -> StorageError. The ones that matter:
  //   42P01 / PGRST205 - the relation does not exist: the DDL is unapplied.
  //   PGRST202 - "Could not find the function public.amaw_seal_lot(...) in the
  //     schema cache": the same unapplied DDL, met by the seal rather than by a
  //     table. Left as 'backend' it was a lost SIGNAL, so a reviewer's Accept
  //     on a project with no lot storage said "there is no signal".
  //   PGRST116 - ".single() got no row". It is what an RLS-filtered write
  //     looks like from the client (CLAUDE.md): Postgres touched 0 rows and
  //     .single() complained about the count. A permission or conflict answer,
  //     never a bug to show raw.
  //   40001 - the data guard's stale-revision raise.
  function fail(err, what) {
    if (!err) return null;
    const code = err.code || '';
    const msg = String(err.message || '');
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') {
      return new StorageError('not_set_up',
        'PlantBook storage is not set up on this project yet (supabase/amaw_lots.sql has not been applied)', err);
    }
    if (code === '40001' || /stale revision/i.test(msg)) {
      return new StorageError('conflict', msg || `${what} was saved by somebody else while you were editing`, err);
    }
    if (code === 'PGRST116') {
      return new StorageError('conflict',
        `${what} matched no row — either a colleague saved first, or this lot is not yours to change`, err);
    }
    if (code === '42501' || code === 'PGRST301') {
      return new StorageError('denied', msg || `you do not have access to ${what}`, err);
    }
    // amaw_seal_lot()'s "no such lot". An ANSWER, not a dropped connection:
    // the ledger has no row for this lot - typically a reviewer accepting a
    // lot whose submission never reached the server. Left as 'backend' it was
    // transient, so the store marked itself OFFLINE and queued the Accept to
    // be refused again on every flush, and the page told a reviewer with a
    // perfectly good connection that there was no signal.
    if (code === 'P0002') {
      return new StorageError('not_found', 'there is no such lot in KYTC\'s lot record', err);
    }
    return new StorageError('backend', msg || `${what} failed`, err);
  }

  return {
    name: 'supabase',

    async available() {
      try {
        const { error } = await sb.from(V_SUMMARIES).select('id').limit(1);
        if (error) {
          const e = fail(error, 'PlantBook storage');
          return { ok: false, code: e.code, reason: e.message, cause: error };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, code: 'offline', reason: 'could not reach Supabase', cause: err };
      }
    },

    /**
     * Push one lot. Returns the server's confirmed data revision.
     * `by` carries { sm_id, name } — the ledger denormalises the name because
     * a contractor cannot read another technician's technicians row.
     */
    async push(lot, { by = null } = {}) {
      const next = normaliseLot(lot);
      const id = lotIdentity(next);

      const { error: lotErr } = await sb.from(T_LOTS)
        .upsert({
          id: next.uid,
          ...id,
          mix_signature: next.mix_signature,
          sm_id: (by && by.sm_id) || next.saved_by && next.saved_by.sm_id || null,
          author_name: (by && by.name) || (next.saved_by && next.saved_by.name) || 'unknown',
        }, { onConflict: 'id' });
      if (lotErr) throw fail(lotErr, 'this lot');

      // The envelope. `revision` is what the client last had confirmed; the
      // guard raises if anybody else has saved since.
      const { data, error } = await sb.from(T_DATA)
        .upsert({
          lot_id: next.uid,
          values: next.values,
          rows: next.rows,
          records: next.records,
          extracted_from: next.extracted_from,
          // The server's own counter, not ours. Null on a first push, which
          // the data guard reads as "insert" rather than as a stale token.
          revision: next.server_revision == null ? null : Number(next.server_revision),
          saved_name: (by && by.name) || null,
          client_saved_at: next.saved_at,
        }, { onConflict: 'lot_id' })
        .select('revision, updated_at')
        .single();
      if (error) throw fail(error, "this lot's data");
      return { revision: data.revision, updated_at: data.updated_at };
    },

    /** Where the RECORD has this lot on the chain, and nothing else - the
     *  ledger row, without the payload. Read when a seal is refused, to tell
     *  "the record already holds it" from "the record said no". */
    async chain(uid) {
      const { data: row, error } = await sb.from(V_SUMMARIES).select('*').eq('id', String(uid)).maybeSingle();
      if (error) throw fail(error, 'this lot');
      return row ? chainOf(row) : null;
    },

    /** Move a lot along the chain. The one call a client cannot fake. */
    async seal(uid, status, { sha256 = null, prev = null } = {}) {
      const { data, error } = await sb.rpc(RPC_SEAL, {
        p_lot_id: String(uid), p_status: status, p_sha256: sha256, p_prev: prev,
      });
      if (error) {
        const msg = String(error.message || '');
        if (/never reopened|only a submitted lot|only KYTC|not at a plant|needs the submittal hash/i.test(msg)) {
          throw new StorageError('sealed', msg, error);
        }
        throw fail(error, 'sealing this lot');
      }
      return data;
    },

    async load(uid) {
      const { data: row, error } = await sb.from(V_SUMMARIES).select('*').eq('id', String(uid)).maybeSingle();
      if (error) throw fail(error, 'this lot');
      if (!row) return null;

      const { data: d, error: dErr } = await sb.from(T_DATA)
        .select('values, rows, records, extracted_from, history, revision, saved_name, updated_at')
        .eq('lot_id', String(uid)).maybeSingle();
      if (dErr) throw fail(dErr, "this lot's data");

      const lot = blankLot(row, { ...row, uid: row.id });
      lot.status = row.status;
      lot.submitted_at = row.submitted_at; lot.submitted_name = row.submitted_name;
      lot.accepted_at = row.accepted_at;   lot.accepted_name = row.accepted_name;
      lot.submittal_sha256 = row.submittal_sha256; lot.prev_sha256 = row.prev_sha256;
      lot.purge_after = row.purge_after;   lot.purged_at = row.purged_at;
      if (d) {
        lot.values = d.values || {};
        lot.rows = d.rows || {};
        lot.records = d.records || {};
        lot.extracted_from = d.extracted_from || {};
        lot.history = Array.isArray(d.history) ? d.history : [];
        lot.revision = Number(d.revision || 0);
        lot.synced_revision = Number(d.revision || 0);
        lot.server_revision = Number(d.revision || 0);
        lot.saved_at = d.updated_at || null;
        lot.saved_by = d.saved_name ? { name: d.saved_name } : null;
      } else {
        // A purged lot: the ledger row survives and the data does not. This
        // is a real, expected state and it is not an error — it is what the
        // retention rule looks like from the client.
        lot.revision = 0; lot.synced_revision = 0; lot.server_revision = null;
        lot.saved_at = row.updated_at || null;
      }
      return lot;
    },

    async list(filter = {}) {
      let q = sb.from(V_SUMMARIES).select('*');
      if (filter.amp_number)  q = q.eq('amp_number', filter.amp_number);
      if (filter.contract_id) q = q.eq('contract_id', filter.contract_id);
      if (filter.status)      q = q.eq('status', filter.status);
      if (filter.mix_id)      q = q.eq('mix_id', filter.mix_id);
      const { data, error } = await q.order('updated_at', { ascending: false }).limit(filter.limit || 200);
      if (error) throw fail(error, 'the lot list');
      return (data || []).map(summaryFromRow);
    },

    async remove(uid) {
      const { data, error } = await sb.from(T_LOTS).delete().eq('id', String(uid)).select('id');
      if (error) throw fail(error, 'this lot');
      if (!data || !data.length) {
        throw new StorageError('denied',
          'only the technician who started a lot can delete it, and only while it is Open');
      }
      return true;
    },
  };
}

function summaryFromRow(r) {
  return {
    uid: r.id,
    key: lotKey(r),
    contract_id: r.contract_id,
    line_item: r.line_item || '',
    amp_number: r.amp_number,
    plant_name: r.plant_name || null,
    mix_id: r.mix_id,
    mix_signature: r.mix_signature || null,
    lot_number: r.lot_number,
    density_option: r.density_option || '',
    status: r.status,
    submitted_at: r.submitted_at || null,
    submitted_name: r.submitted_name || null,
    accepted_at: r.accepted_at || null,
    accepted_name: r.accepted_name || null,
    // amaw_lot_summaries carries neither count, and a zero is a claim: a lot
    // known only from the server read "0 of 4 sublots" whether it was blank or
    // finished. Unknown is null, and the list prints no count for it.
    records_entered: null,
    sublots_entered: null,
    saved_at: r.updated_at || null,
    saved_by: r.saved_name ? { name: r.saved_name } : (r.author_name ? { name: r.author_name } : null),
    revision: Number(r.revision || 0),
    synced_revision: Number(r.revision || 0),
    unsynced: false,
    has_data: r.has_data !== false,
    purge_after: r.purge_after || null,
    purged_at: r.purged_at || null,
  };
}

// =====================================================================
// (c) SYNCED — local first, Supabase behind it
// =====================================================================
// This is what the page holds. Every method answers out of localStorage and
// then reconciles; nothing a technician does waits on a network.

export function syncedLotStore(opts = {}) {
  const local = opts.local || localLotStore(opts);
  const remote = opts.remote || (opts.client ? supabaseLotStore(opts) : null);
  // Reported to the page so it can say where a lot stands, rather than
  // guessing from a spinner.
  // `notSetUp` is a THIRD state beside online and offline: the network is fine
  // and the project simply has no lot storage. Reading it off the error's
  // wording works and is what the page did first, but a sentence is not an API —
  // rephrase that message and the chip silently starts lying again. The code is.
  const state = { online: null, notSetUp: false, lastError: null, lastSyncAt: null, pending: 0 };
  const listeners = [];

  function announce() {
    for (const fn of listeners) { try { fn({ ...state }); } catch (_) {} }
  }

  // ONE place decides what an outcome means for the reported state. There are
  // seven call sites, and a flag set in six of them is a flag that is wrong
  // somewhere — which is the whole reason the page was reading an error's
  // wording instead.
  function noteOk() {
    state.online = true; state.notSetUp = false; state.lastError = null;
  }
  function noteFailure(err) {
    state.notSetUp = !!err && err.code === 'not_set_up';
    // A project with no lot storage IS reachable, so `online` stays true and
    // the page reads the flag. Saying "offline" there is what put "offline ·
    // 1 waiting" in front of contractors who had a perfectly good connection.
    state.online = state.notSetUp ? true : !isTransient(err);
    state.lastError = err && err.message;
  }
  function online() {
    try {
      const nav = (typeof globalThis !== 'undefined') && globalThis.navigator;
      if (nav && typeof nav.onLine === 'boolean') return nav.onLine;
    } catch (_) {}
    return true;   // no navigator (Node, or an old browser): try and find out
  }

  // THE ORDER HERE IS LOAD-BEARING, and the first version had it backwards.
  // A lot's data is writable only while the server still considers it Open —
  // "amaw_lot_data: update for open visible lots" — so the DATA GOES FIRST and
  // the seal closes the door behind it. Sealing first refuses the write that
  // carries everything typed since the last sync, and refuses it as a
  // permission error, which reads as a conflict it is not. A technician who
  // filled a whole lot offline and then pressed Submit is exactly the case,
  // and it is not a rare one.
  // Whether this project has lot storage at all, when that decides something
  // (seal()'s one-slot rule). Usually already known - boot, the door and every
  // open ask the server - and asked once more here if not, because "no signal"
  // and "no lot storage" want opposite answers.
  async function notSetUpHere() {
    if (state.notSetUp) return true;
    if (!remote || !online()) return false;
    try { return (await api.available()).notSetUp === true; } catch (_) { return false; }
  }

  // Written back here rather than left to the caller, because a failure is
  // exactly when the caller does not write the lot again.
  async function keep(lot, by) {
    try { await local.save(lot, { by, bump: false }); } catch (_) { /* the throw that follows still says what happened */ }
  }

  // The record's own answer about one lot, or null when it cannot be had. A
  // null here only means "not known", never "not held".
  async function recordOf(uid) {
    if (!remote || typeof remote.chain !== 'function') return null;
    try { return await remote.chain(uid); } catch (_) { return null; }
  }

  // Returns whether it reached the server at all - a lot already sealed with
  // nothing to send makes no call, and "nothing was sent" must not read as
  // "the server answered" (the caller's noteOk()).
  async function pushOne(lot, by) {
    if (!remote) return false;
    if (!online()) throw new StorageError('offline', 'no connection — this lot is saved on this device and will sync when you are back online');
    const seal = lot.pending_seal;
    // The server treats a lot as Open until it has been sealed to SUBMITTED,
    // whatever this copy says. A pending Accept is therefore not a reopening:
    // by then KYTC already holds the copy the hash on the PDF covers, and its
    // data window shut when it was submitted.
    const serverOpen = seal ? seal.status === 'Submitted' : (lot.status === 'Open');
    let reached = false;
    try {
      if (serverOpen) {
        const res = await remote.push(lot, { by });
        lot.server_revision = Number(res.revision);
        reached = true;
      } else if (!seal && isUnsynced(lot)) {
        // Already sealed server-side and still holding local changes: they
        // cannot reach KYTC and never will, because the copy KYTC holds is the
        // one the hash on the PDF covers. The lot stops asking, and says why
        // rather than retrying forever or pretending it went.
        lot.frozen = 'this lot was submitted, so the copy KYTC holds can no longer be changed';
      }
      if (seal) {
        const row = await remote.seal(lot.uid, seal.status, { sha256: seal.sha256, prev: seal.prev });
        reached = true;
        lot.status = seal.status;
        takeChain(lot, row);          // the record's own who and when
      }
    } catch (err) {
      if (!seal || isTransient(err)) {
        // No signal, or no lot storage: the seal waits. But the data push may
        // already have gone and moved the server's counter - kept, or the next
        // push presents the old token and reads as a colleague's conflict.
        if (reached) await keep(lot, by);
        throw err;
      }
      // REFUSED - OR ALREADY DONE. Before anything is put back, the record is
      // asked where it has this lot, because "no" from amaw_seal_lot() is also
      // what an Accept or a Submit that ALREADY TOOK sounds like: its response
      // lost on the way back, or another reviewer first. Rolled back on the
      // wording alone, this device read Submitted over an Accepted ledger, said
      // the Accept had failed, and every retry failed the same way.
      const rec = await recordOf(lot.uid);
      if (!holdsSeal(rec, seal)) {
        // Refused for real, and kept, so a reload still knows (it used to be
        // one session's memory). A REFUSED ACCEPT IS PUT BACK and a refused
        // submission is not, deliberately. A Submit is the technician's act
        // and the PDF has already downloaded and gone to KYTC, so the lot stays
        // Submitted on this device whatever the record says, and its seal stays
        // in the outbox. An Accept is KYTC's act on a lot the record must
        // already hold as Submitted: stamped here and refused there, it would
        // read Accepted on this device while the ledger reads Submitted, and -
        // still pending - be retried and refused on every flush after. So the
        // stamp comes off, here, because this is the one place seal(), save()
        // and flush() all reach the server through. A transient failure (above)
        // keeps the stamp: that Accept is waiting, not refused.
        lot.seal_refused = {
          status: seal.status,
          reason: String((err && err.message) || 'no reason was given'),
          code: (err && err.code) || null,
          record: rec,
          at: new Date().toISOString(),
        };
        if (seal.status === 'Accepted') {
          lot.status = seal.was || 'Submitted';
          lot.pending_seal = null;
        }
        await keep(lot, by);
        if (err && typeof err === 'object') err.record = rec;
        throw err;
      }
      // The record holds it: this device takes the record's chain, and the
      // seal is done rather than refused. `adopted` rides on the object handed
      // back (not the stored copy), so a caller can say "already".
      takeChain(lot, rec);
      lot.adopted = true;
      reached = true;
    }
    if (seal) {
      lot.pending_seal = null;
      lot.seal_refused = null;
    }
    lot.synced_revision = Number(lot.revision || 0);
    lot.synced_at = new Date().toISOString();
    return reached;
  }

  const api = {
    name: 'synced',
    local, remote,
    state: () => ({ ...state }),
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } },

    async available() {
      const l = await local.available();
      if (!remote) return l;
      const r = await remote.available();
      if (r.ok) noteOk();
      else noteFailure(new StorageError(r.code || 'backend', r.reason, r.cause));
      announce();
      // Local alone is a working PlantBook. Remote alone is not, because the
      // page reads what it just wrote.
      return l.ok ? { ok: true, remote: r.ok, notSetUp: state.notSetUp,
                      reason: r.ok ? null : r.reason } : l;
    },

    /**
     * Save. Local FIRST, and the promise is not waiting on the network — the
     * push is started and its failure recorded, never thrown at the caller,
     * because a save that succeeded on this machine did succeed.
     */
    async save(lot, { by = null, sync = true } = {}) {
      // THE CALLER'S SYNC BOOKKEEPING IS NOT TO BE TRUSTED, and this cost a
      // silent failure to find. A page hands in the FORM's view of the lot,
      // carrying whatever `revision` / `server_revision` / `synced_revision`
      // it was opened with — and a flush that succeeded in the background
      // since then moved all three on disk without touching the copy on
      // screen. Letting the incoming envelope win rolls them back, so the very
      // next push presents a token the server has already moved past, and the
      // answer is a stale-revision conflict on a lot nobody else has touched.
      // It surfaced as Submit quietly not sealing.
      //
      // So those four fields come from the store, never from the caller. The
      // caller owns the lot's CONTENT; the store owns where that content has
      // got to.
      let held = null;
      try { held = await local.load(lot.uid); } catch (_) { /* first save */ }
      const incoming = held ? {
        ...lot,
        // THE STATUS IS CHAIN STATE, and the chain is not the client's to
        // write — the same rule amaw_lots_guard() enforces server-side, here
        // so the two cannot disagree. It matters more than it looks:
        // submitLotToKYTC() moves the stage to Submitted BEFORE it builds the
        // payload, so the very next autosave would write that status locally
        // and seal() would then refuse its own submission as "already
        // Submitted". Only seal() moves it, and it writes through local.save()
        // rather than through here.
        status: held.status,
        // ...and the same goes for the stamps beside it. A page that opened a
        // lot from its file carries none, and taking the caller's here wiped
        // the who and when load() had just taken off the record.
        submitted_at: held.submitted_at, submitted_name: held.submitted_name,
        accepted_at: held.accepted_at, accepted_name: held.accepted_name,
        submittal_sha256: held.submittal_sha256,
        prev_sha256: held.prev_sha256 || lot.prev_sha256 || null,
        purge_after: held.purge_after, purged_at: held.purged_at,
        revision: held.revision,
        server_revision: held.server_revision,
        synced_revision: held.synced_revision,
        // A SEAL IS MADE BY seal() AND NOWHERE ELSE - which writes through
        // local.save(), never through here - so the one this device holds is
        // kept and a caller's is ignored. Taking the caller's re-offered a
        // stale one: a .json saved while a submission was still waiting
        // carries it long after the record sealed it, and a reviewer who
        // opened that file and pressed Accept was refused, falsely, for a
        // submission that "has not reached KYTC's lot record yet".
        pending_seal: held.pending_seal || null,
        // And the record's last refusal is the store's to keep and to clear
        // (acknowledge()), never an envelope field a caller carries in.
        seal_refused: held.seal_refused || null,
      } : { ...lot, pending_seal: null, seal_refused: null };
      const saved = await local.save(incoming, { by });
      if (sync && remote) {
        try {
          // A sealed lot with nothing to send makes no call at all, and
          // "nothing was sent" is not "the server answered": noteOk() there
          // wiped the notSetUp a load() had just found, and the page then told
          // a reviewer on a project with no lot storage that it was live.
          const reached = await pushOne(saved, by);
          await local.save(saved, { by, bump: false });   // record synced_revision
          if (reached) noteOk();
          state.lastSyncAt = saved.synced_at;
        } catch (err) {
          noteFailure(err);
          // A real disagreement, not a dropped connection. The local copy is
          // kept — it is this person's work — and the caller is told, so it
          // can offer the download before anything is overwritten.
          if (err && err.code === 'conflict') saved.conflict = err.message;
        }
        state.pending = (await local.outbox()).length;
        announce();
      }
      return saved;
    },

    /** Everything local, reconciled with the server where it can be. */
    async load(uid) {
      const mine = await local.load(uid);
      if (!remote || !online()) return mine;
      let theirs = null;
      try { theirs = await remote.load(uid); noteOk(); }
      catch (err) { noteFailure(err); announce(); return mine; }
      if (!theirs) return mine;
      if (!mine) { await local.save(theirs, { bump: false }); return theirs; }

      // THE CHAIN IS THE RECORD'S, and it moves without the data moving: a
      // seal changes the status and stamps and leaves the data revision where
      // it was. Reading the chain only when the data moved meant a contractor's
      // list said Accepted (list() already takes the server's chain) and the
      // same lot opened as Submitted. Taken whenever the record is at least as
      // far along - never backwards (a reviewer's copy from the submittal file
      // stays Submitted while the contractor's seal is still waiting), and not
      // over a seal of this device's own that is still waiting: that seal's
      // answer decides it (pushOne()).
      if (!mine.pending_seal && statusRank(theirs.status) >= statusRank(mine.status)) {
        const before = JSON.stringify(chainOf(mine));
        takeChain(mine, theirs);
        // A refusal the record has since overtaken says nothing any more.
        if (mine.seal_refused && statusRank(mine.status) >= statusRank(mine.seal_refused.status)) mine.seal_refused = null;
        if (JSON.stringify(chainOf(mine)) !== before) { try { await local.save(mine, { bump: false }); } catch (_) {} }
      }

      const localMoved = isUnsynced(mine);
      const remoteMoved = Number(theirs.server_revision == null ? -1 : theirs.server_revision) >
                          Number(mine.server_revision == null ? -1 : mine.server_revision);
      if (localMoved && remoteMoved) {
        // BOTH moved. Nothing is overwritten and nothing is merged: the local
        // copy stays on screen and the caller is handed the fact, because
        // silently picking a winner loses somebody's afternoon.
        mine.conflict = 'this lot was also edited elsewhere — download your working copy before taking theirs';
        mine.remote = theirs;
        return mine;
      }
      if (remoteMoved) { await local.save(theirs, { bump: false }); return theirs; }
      return mine;
    },

    async findByKey(key) { return local.findByKey(key); },

    /** The local list, with anything the server knows about folded in. A
     *  purged lot appears here from the server alone, which is the point:
     *  "lot 7 existed and was submitted" outlives its data. */
    async list(filter = {}) {
      const mine = await local.list(filter);
      if (!remote || !online()) return mine;
      let theirs = [];
      try { theirs = await remote.list(filter); noteOk(); }
      catch (err) { noteFailure(err); return mine; }
      const byUid = new Map();
      for (const r of theirs) byUid.set(r.uid, r);
      for (const m of mine) {
        const r = byUid.get(m.uid);
        // The local copy wins on content (it may hold unsynced work) and the
        // server wins on the chain, which the client never writes.
        byUid.set(m.uid, r ? { ...m, status: r.status,
                               submitted_at: r.submitted_at, submitted_name: r.submitted_name,
                               accepted_at: r.accepted_at, accepted_name: r.accepted_name,
                               purge_after: r.purge_after, purged_at: r.purged_at,
                               has_data: true } : m);
      }
      return Array.from(byUid.values()).sort(byRecency);
    },

    async remove(uid) {
      const gone = await local.remove(uid);
      if (remote && online()) { try { await remote.remove(uid); } catch (_) { /* local is the answer */ } }
      return gone;
    },

    /**
     * Seal. Works offline: the seal is stamped on the local lot and pushed
     * with everything else when there is a connection. A submitted lot is
     * frozen locally the moment the button is pressed, whatever the network
     * is doing — which is what a technician means by "I submitted it". An
     * Accept waits the same way with no signal, but one the record REFUSES
     * comes back off this device (pushOne()), because KYTC's Accept is only
     * real once the record holds it.
     */
    async seal(uid, status, { sha256 = null, prev = null, by = null } = {}) {
      const lot = await local.load(uid);
      if (!lot) throw new StorageError('not_found', 'there is no such lot on this device');
      if (status === 'Submitted' && lot.status !== 'Open') {
        throw new StorageError('sealed', `lot ${lot.lot_number} is already ${lot.status}, and a lot is never reopened once submitted`);
      }
      const waiting = lot.pending_seal || null;
      // ONE SLOT, so an Accept stamped over a submission still waiting for a
      // signal would drop the submission's hash on the floor - and the record
      // refuses to accept a lot it does not yet hold as Submitted anyway.
      // Refused here, before anything is stamped - UNLESS this project has no
      // lot storage at all. Then nothing will ever send the waiting
      // submission, the file is the record (and every sentence on the page
      // says so), and refusing would only stop a reviewer accepting a lot on
      // the device it was submitted from - which is what the page let them do
      // before lot storage existed.
      if (status === 'Accepted' && waiting && waiting.status === 'Submitted' && !(await notSetUpHere())) {
        throw new StorageError('sealed',
          `lot ${lot.lot_number}'s submission has not reached KYTC's lot record yet, so it cannot be accepted until it has`);
      }
      lot.pending_seal = { status, sha256, prev, at: new Date().toISOString() };
      lot.seal_refused = null;          // a new seal supersedes the last refusal
      // What a REFUSED Accept puts back (pushOne()). Carried on the seal
      // itself rather than held in this call, because an Accept made with no
      // signal is refused - if it is refused - by a later flush.
      if (status === 'Accepted') {
        lot.pending_seal.was = waiting && waiting.status === 'Accepted' ? (waiting.was || 'Submitted') : lot.status;
      }
      lot.status = status;
      const saved = await local.save(lot, { by, bump: false });
      if (remote && online()) {
        try {
          const reached = await pushOne(saved, by);
          await local.save(saved, { by, bump: false });
          if (reached) noteOk();
        } catch (err) {
          noteFailure(err);
          // "only KYTC accepts a lot" is an answer, not a delay. The outbox is
          // counted and announced first all the same: a refused Accept has
          // just come OFF it (pushOne() put the stamp back), and a chip still
          // counting it would be the page and the store disagreeing.
          if (!isTransient(err)) {
            state.pending = (await local.outbox()).length;
            announce();
            throw err;
          }
        }
        state.pending = (await local.outbox()).length;
        announce();
      }
      return saved;
    },

    /** The record REFUSED a seal from this device (pushOne() keeps that on
     *  the lot) and the caller has now said so out loud - on screen and in
     *  the lot's own history - so this device stops carrying it. */
    async acknowledge(uid) {
      const lot = await local.load(uid);
      if (!lot || !lot.seal_refused) return lot;
      lot.seal_refused = null;
      return local.save(lot, { bump: false });
    },

    /** Send everything the server has not confirmed. Safe to call often —
     *  it is a no-op when the outbox is empty. */
    async flush({ by = null } = {}) {
      if (!remote) return { pushed: 0, pending: 0 };
      const uids = await local.outbox();
      let pushed = 0, reached = 0;
      const failures = [];
      for (const uid of uids) {
        const lot = await local.load(uid);
        if (!lot) continue;
        try {
          if (await pushOne(lot, by)) reached++;
          await local.save(lot, { by, bump: false });
          pushed++;
        } catch (err) {
          failures.push({ uid, error: err });
          if (isTransient(err)) break;   // still offline: stop, do not hammer
        }
      }
      state.pending = (await local.outbox()).length;
      state.lastSyncAt = new Date().toISOString();
      if (reached) noteOk();
      else if (failures.length) noteFailure(failures[0].error);
      announce();
      return { pushed, pending: state.pending, failures };
    },
  };
  return api;
}

// =====================================================================
// The switch
// =====================================================================
// `CONFIG.STORAGE = { BACKEND: 'synced' | 'local' | 'supabase' }` in the page,
// and this is the only place that reads it. 'local' is the fallback for a page
// with no Supabase client; 'supabase' alone is for the checker, and is not a
// shape the page should ever run in — it would block a technician's save on a
// network that may not be there.
export const BACKENDS = ['synced', 'local', 'supabase'];

export function createLotStore(config = {}) {
  const backend = config.backend || (config.client ? 'synced' : 'local');
  if (backend === 'synced')   return syncedLotStore(config);
  if (backend === 'local')    return localLotStore(config);
  if (backend === 'supabase') return supabaseLotStore(config);
  throw new StorageError('invalid', `unknown storage backend "${backend}" (expected ${BACKENDS.join(', ')})`);
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------
function applyFilter(rows, filter) {
  let out = rows;
  for (const k of ['contract_id', 'amp_number', 'mix_id', 'status', 'line_item']) {
    if (filter && filter[k]) out = out.filter((r) => String(r[k]) === String(filter[k]));
  }
  if (filter && filter.lot_number != null) out = out.filter((r) => Number(r.lot_number) === Number(filter.lot_number));
  return out;
}

function byRecency(a, b) {
  return String(b.saved_at || '').localeCompare(String(a.saved_at || ''));
}

/** Merge a lot read from a file into one already held, record by record. Used
 *  by the file import: the newer `updated_at` wins PER RECORD, never per lot,
 *  so importing a file that carries only QA01 cannot wipe four sublots. */
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
