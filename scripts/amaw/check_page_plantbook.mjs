#!/usr/bin/env node
// Do the four PlantBook namespaces INSIDE public/designbook.html still agree
// with the modules under scripts/amaw/ they were spliced from?
//
//   node scripts/amaw/check_page_plantbook.mjs [lot1.xlsm lot2.xlsm 467PA.xlsm] \
//        [--page public/designbook.html] [--payloads <dir>]
//
// designbook.html carries a browser port of eight modules, folded into four
// blocks fenced `===== PLANTBOOK SCHEMA/VOLUMETRICS/PAY/AMAW/LOT =====`:
// pay.mjs + payview.mjs; addresses.mjs + mapper.mjs + the browser half of
// generate.mjs; storage.mjs + intake.mjs. This is the sibling of
// scripts/mixpack/check_page_engine.mjs and exists for the same reason — two
// copies of one thing drift unless a test says so — but it makes the
// comparison one rung sharper than that file can. check_page_engine.mjs has
// only the workbook to diff against; here the ORIGINAL is still on disk, so
// nothing is inferred: every page function is called beside its module
// function on the same input, and the two answers are compared.
//
// It is a comparison, never a re-derivation. What the module itself gets RIGHT
// is check_sections / check_pay / check_payview / check_addresses /
// check_mapper / check_generate / check_intake's job, each against a real
// workbook or a real approval PDF. This file asks one question only: is the
// page still the module? A wrong answer that both copies give identically
// passes here and fails there, which is the correct division — this is a drift
// detector, and a drift detector that also tries to be a correctness suite
// ends up weaker at both.
//
// Real AMAWs, the real MixPack and real approval payloads carry contractor
// data and are gitignored, so they arrive as paths rather than as fixtures —
// same rule as check_pay.mjs and check_mapper.mjs. Without them the run still
// does every check that needs no workbook and NAMES the ones it skipped. A
// check that silently tests nothing is the one result this must never produce,
// so a missing banner is fatal, a missing fixture is loud, and a namespace
// that evaluated to nothing fails the run rather than scoring zero of zero.
//
// No npm dependencies: the zip layer is unzip(1) through the MixPack scripts'
// reader, exactly as the other AMAW checkers do. SheetJS is not used and must
// not be — AMAW carries a chartsheet AND a Dialog1 dialogsheet, so its name
// shift is worse than the MixPack's and wb.Sheets["t_smpl"] comes back as
// t_cont_smpl (docs/amaw-map.md).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { cellsOf, sharedStrings } from '../mixpack/xlsx.mjs';
import * as MOD_SECTIONS from './sections.mjs';
import * as MOD_VOL from './volumetrics.mjs';
import * as MOD_PAY from './pay.mjs';
import * as MOD_PAYVIEW from './payview.mjs';
import * as MOD_ADDRESSES from './addresses.mjs';
import * as MOD_MAPPER from './mapper.mjs';
import * as MOD_GENERATE from './generate.mjs';
import * as MOD_STORAGE from './storage.mjs';
import * as MOD_INTAKE from './intake.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '../..');

// ---------------------------------------------------------------------
//  Arguments
// ---------------------------------------------------------------------
// `--page` exists so this file can be pointed at a COPY of designbook.html
// with a deliberate perturbation in it. A harness nobody has watched fail is
// a harness nobody knows works (scripts/amaw/harness/lib/page.mjs), and the
// only way to watch this one fail without editing the real page is to give it
// a different one to read.
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const PAGE = path.resolve(flag('--page', path.join(REPO, 'public/designbook.html')));
const PAYLOAD_DIR = flag('--payloads',
  '/tmp/claude-0/-home-user-Mix/c9cd3888-ef57-5ba4-8674-a56236907f1c/scratchpad');
const FLAGGED = new Set();
for (const name of ['--page', '--payloads']) {
  const i = argv.indexOf(name);
  if (i >= 0) { FLAGGED.add(i); FLAGGED.add(i + 1); }
}
const WORKBOOKS = argv.filter((a, i) => !FLAGGED.has(i) && !a.startsWith('--'));

// An AMAW and a MixPack are both .xlsm and the difference matters: the AMAWs
// drive the pay and mapper sweeps, the MixPack drives nothing here and is
// accepted only so the three fixture paths can be pasted in together. Sorted
// by what the file IS rather than by argument position, because a checker that
// silently reads a MixPack as a lot reports nonsense with total confidence.
const AMAW_LOTS = [], OTHER_XLSM = [];
for (const f of WORKBOOKS) {
  if (!fs.existsSync(f)) { OTHER_XLSM.push([f, 'no such file']); continue; }
  let names = '';
  try { names = execSync(`unzip -p ${JSON.stringify(f)} xl/workbook.xml`, { maxBuffer: 1 << 28 }).toString(); }
  catch (err) { OTHER_XLSM.push([f, 'not a readable .xlsm']); continue; }
  if (/name="Pay Values"/.test(names) && /name="Superpave"/.test(names)) AMAW_LOTS.push(f);
  else OTHER_XLSM.push([f, /name="Design Data"/.test(names) ? 'a MixPack, not an AMAW' : 'not an AMAW']);
}

// ---------------------------------------------------------------------
//  Scoring
// ---------------------------------------------------------------------
// Per namespace, so the summary can say which block drifted rather than only
// that something did. `skip` is a first-class outcome and is printed in the
// summary beside the passes: this file would rather report four skipped
// sections than four sections that quietly checked nothing.
const SCORE = {};
let NS_NOW = 'setup';
const namespace = (key, title) => {
  NS_NOW = key;
  SCORE[key] ||= { pass: 0, fail: 0, skip: 0 };
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
};
const ok = (name, cond, detail) => {
  const s = (SCORE[NS_NOW] ||= { pass: 0, fail: 0, skip: 0 });
  if (cond) { s.pass++; return true; }
  s.fail++;
  console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n          ${trunc(detail)}`}`);
  return false;
};
const skip = (name, why) => {
  (SCORE[NS_NOW] ||= { pass: 0, fail: 0, skip: 0 }).skip++;
  console.log(`  skip  ${name}  (${why})`);
};
const note = (s) => console.log(`  note  ${s}`);
// Pre-formatted diffs arrive already laid out over several lines and must not
// be clipped mid-diff — that is the one thing on the line worth reading. A
// single-line value is a raw dump and is clipped hard.
const trunc = (v, cap) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const n = cap || (typeof v === 'string' && v.includes('\n') ? 2000 : 400);
  return s == null ? 'undefined' : s.length > n ? s.slice(0, n) + ' …' : s;
};

// ---------------------------------------------------------------------
//  Comparison
// ---------------------------------------------------------------------
// Deep equality via JSON, with two accommodations that are stated rather than
// hidden, because a normaliser is where a drift detector goes blind.
//
//  1. THE CLOCK. intake.mjs stamps `new Date().toISOString()` in two places —
//     readVerifyResponse's `checked_at` and lotFromApproval's history entry —
//     and the page's copy and the module's copy run milliseconds apart. Every
//     full ISO-8601 instant is replaced with a token, and the number replaced
//     is COUNTED and printed, so "the timestamps were normalised" can never
//     grow quietly into "half the payload was normalised".
//  2. FUNCTIONS. JSON.stringify drops them silently, which would make a
//     schema whose `when:` predicate had been rewritten compare equal. So
//     every function-valued path is walked separately and compared by source
//     (`fnParity` below); JSON.stringify is structure only.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[-+]\d{2}:\d{2})$/;
let clockHits = 0;
const stable = (v) => JSON.stringify(v, (_k, x) => {
  if (typeof x === 'string' && ISO.test(x)) { clockHits++; return '<clock>'; }
  if (typeof x === 'number' && !Number.isFinite(x)) return `<${String(x)}>`;
  return x;
});
// Where two answers part, not what they start with. A 40 KB schema that
// differs in one sieve is useless reported from its head — check_page_engine.mjs
// prints got/want per cell for the same reason, and this is that idea applied
// to a structure instead of a cell.
const same = (name, a, b) => {
  const x = stable(a), y = stable(b);
  return ok(name, x === y, x === y ? undefined : firstDiff(x, y));
};

/** Every function-valued path in either object, compared by source text.
 *  Returns [checked, mismatches] so the caller can assert on both — a parity
 *  walk that finds nothing to compare is not a pass. */
function fnParity(a, b) {
  const bad = [];
  let n = 0;
  const walk = (x, y, p) => {
    const tx = typeof x, ty = typeof y;
    if (tx === 'function' || ty === 'function') {
      n++;
      if (tx !== ty) bad.push(`${p}: page ${tx}, module ${ty}`);
      else if (String(x) !== String(y)) bad.push(`${p}: source differs`);
      return;
    }
    if (!x || !y || tx !== 'object' || ty !== 'object') return;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${p}.${k}`);
  };
  walk(a, b, '');
  return [n, bad];
}

/** Call both copies on the same input and compare. Throwing is a result too:
 *  a port that starts throwing where the module returns is exactly the drift
 *  this is for, so the thrown message is compared rather than escaping. */
const call = (fn, args) => {
  try { return { ok: true, v: fn(...args) }; }
  catch (err) { return { ok: false, v: `threw: ${err && err.message}` }; }
};
function sweep(label, pageFn, modFn, cases) {
  if (typeof pageFn !== 'function' || typeof modFn !== 'function')
    return ok(`${label} exists on both copies`, false, `page ${typeof pageFn}, module ${typeof modFn}`);
  const bad = [];
  for (let i = 0; i < cases.length; i++) {
    const args = cases[i];
    const p = call(pageFn, args), m = call(modFn, args);
    const x = stable(p), y = stable(m);
    if (x === y) continue;
    // The input NAMED (so the case can be reproduced) and the outputs DIFFED
    // (so the divergence is visible). A whole-lot argument is itself 2 KB, so
    // printing both sides in full buries the one number that moved.
    bad.push(`case ${i}  in ${trunc(JSON.stringify(args).slice(0, 160))}\n            ${firstDiff(x, y)}`);
  }
  return ok(`${label} agrees over ${cases.length} inputs`, bad.length === 0, bad.slice(0, 4).join('\n          '));
}

// =====================================================================
//  1. LIFT THE FIVE BLOCKS OUT OF THE PAGE
// =====================================================================
namespace('lift', '1. Lifting the five blocks out of the page');

if (!fs.existsSync(PAGE)) { console.error(`\n  no page at ${PAGE}`); process.exit(2); }
const html = fs.readFileSync(PAGE, 'utf8');
console.log(`  page  ${PAGE} (${(html.length / 1024).toFixed(0)} KB)`);

// The four banners. Note the start banner is matched with a tail allowance —
// PLANTBOOK AMAW's reads `===== PLANTBOOK AMAW — address map, mapper and
// workbook writer =====`, and an exact-string search for `===== PLANTBOOK
// AMAW =====` finds nothing. The END banners have no such tail. A banner that
// cannot be found is FATAL and not a failed assertion: with no block there is
// nothing to test, and a run that scores 0/0 and exits 0 is worse than no run.
const BANNERS = [
  ['PLANTBOOK SCHEMA', 'PB_SECTIONS'],
  ['PLANTBOOK VOLUMETRICS', 'PB_VOL'],
  ['PLANTBOOK PAY', 'PB_PAY'],
  ['PLANTBOOK AMAW', 'PB_AMAW'],
  ['PLANTBOOK LOT', 'PB_LOT'],
];
const blocks = new Map();
for (const [banner, ns] of BANNERS) {
  const start = new RegExp(`/\\* ===== ${banner}(?: [^\\n]*)? =====`).exec(html);
  const end = html.indexOf(`/* ===== END ${banner} ===== */`);
  if (!start || end < 0 || end < start.index) {
    console.error(`\n  FATAL: cannot find the ${banner} block in ${PAGE}`);
    console.error(`         opening banner  ${start ? `found at ${start.index}` : 'NOT FOUND — expected "/* ===== ' + banner + ' ... ====="'}`);
    console.error(`         closing banner  ${end >= 0 ? `found at ${end}` : 'NOT FOUND — expected "/* ===== END ' + banner + ' ===== */"'}`);
    console.error('         Nothing was checked. Fix the banner or point --page somewhere else.');
    process.exit(2);
  }
  blocks.set(ns, html.slice(start.index, end));
  ok(`${banner} block found (${(blocks.get(ns).length / 1024).toFixed(0)} KB)`, true);
}
// Blocks must not overlap or be reordered relative to the page: PB_LOT reads
// PB_AMAW/PB_PAY/PB_SECTIONS, so "the page's own order" is part of what is
// being tested, not an implementation detail of this file.
const order = BANNERS.map(([b]) => html.indexOf(`/* ===== END ${b} ===== */`));
ok('the five blocks appear in the page in schema/volumetrics/pay/amaw/lot order',
   order.every((v, i) => i === 0 || v > order[i - 1]), order);

// ---- the stubs ------------------------------------------------------
// Deliberately the smallest surface that lets all five blocks EVALUATE. None
// of them may need a DOM; if one ever does that is a finding about the splice
// (a browser-only dependency has leaked into ported module code) and it is
// reported below rather than papered over with a jsdom.
const stubCalls = [];
const trap = (name) => new Proxy({}, {
  get: (_t, k) => { stubCalls.push(`${name}.${String(k)}`); throw new Error(`${name}.${String(k)} is not available in Node`); },
});
function makeContext() {
  const ctx = {
    console,
    // THE ONE DELIBERATE DIVERGENCE. sections.mjs carries its own isRapRow()
    // marked "ON SPLICE, DELETE THIS AND CALL THE PAGE'S COPY", and the splice
    // did exactly that — PB_SECTIONS's `when:` predicate calls the page's
    // hoisted isRapRow(), so the block needs one in scope and the returned
    // surface will NOT have one. Supplying the MODULE's own export here is
    // what keeps the comparison honest: both copies then test the same rule,
    // and the missing name is asserted as intended rather than counted as
    // drift (see "the surface" assertions under PB_SECTIONS).
    isRapRow: MOD_SECTIONS.isRapRow,
    // generateAmaw() wants the MixPack engine's zip/XML layer and fflate.
    // Neither is lifted here — see the note where the generator is reported.
    // A trap rather than `{}` so a block that reached for one at CONSTRUCTION
    // time (rather than lazily, inside generateAmaw) says so loudly.
    MP: trap('MP'),
    fflate: trap('fflate'),
    fetch: () => { throw new Error('fetch is not available in Node here'); },
    // Every DOM global a browser port might reach for, left UNDEFINED on
    // purpose. A ReferenceError here is the finding.
  };
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

// One context, the page's own order, one script — because the page is one
// script. Concatenating them is also what makes the `const` collision the
// block headers are about testable at all: if two blocks ever hoisted the same
// name, this line throws a SyntaxError at instantiation exactly as the page
// would, which is the `supabase`/`sb` gotcha in CLAUDE.md.
const SRC = BANNERS.map(([, ns]) => blocks.get(ns)).join('\n')
          + '\n;({ PB_SECTIONS, PB_VOL, PB_PAY, PB_AMAW, PB_LOT });';
let PB = null;
// The context is kept: the page's copies are built in another vm realm, so
// `pageError instanceof Error` is false against THIS realm's Error however
// correct the port is. An assertion about prototype chains has to be made
// against the realm the object came from, or it tests the checker.
const CTX = makeContext();
try {
  PB = vm.runInContext(SRC, CTX, { filename: 'designbook.html:PLANTBOOK' });
  ok('all five blocks evaluate in one context, in the page\'s order', true);
} catch (err) {
  ok('all five blocks evaluate in one context, in the page\'s order', false, String(err && err.stack || err).split('\n').slice(0, 3).join(' | '));
  console.error('\n  FATAL: the blocks did not evaluate, so nothing below could run.');
  console.error(`         ${err && err.message}`);
  if (/is not defined/.test(String(err && err.message)))
    console.error('         A missing global is a FINDING, not a stub to add: the ported\n'
                + '         modules must run without a DOM. Report it before widening makeContext().');
  process.exit(2);
}
for (const [, ns] of BANNERS) {
  const surface = PB[ns];
  ok(`${ns} is an object with a surface`, surface && typeof surface === 'object' && Object.keys(surface).length > 0,
     surface && Object.keys(surface).length);
}

// ---- CONFIG.DP has no duplicate keys --------------------------------
//
// Page-wide rather than PlantBook-specific, and here because this is the file
// that reads the page source on every change to either book.
//
// A DUPLICATE KEY IN AN OBJECT LITERAL IS NOT AN OVERRIDE, IT IS A COIN
// TOSS. `{ pbe: 2, ... pbe: 1 }` is legal JavaScript, throws nothing, warns
// nothing, and the LAST one wins — so which value applies depends on where
// somebody happened to paste. It happened on 2026-09-13: PlantBook's
// volumetrics added `pbe: 2` and `gse: 3` to a CONFIG.DP that already carried
// DesignBook's `pbe: 1` and `gse: 3`. DesignBook's won by position, so the
// symptom was PlantBook printing 5.0 where it asked for 5.02 — but a later
// tidy-up that moved the block would have silently changed DesignBook's Pbe
// precision instead, on a page whose whole claim is that the computed value
// is gospel. Both books now share the one entry.
//
// Textual on purpose: evaluating the object is exactly what CANNOT see this,
// because by then the duplicate is gone.
{
  const dpStart = html.indexOf('  DP: {');
  const dpEnd = dpStart >= 0 ? html.indexOf('\n  },\n', dpStart) : -1;
  if (dpStart < 0 || dpEnd < 0) {
    ok('CONFIG.DP block located', false, 'could not find `  DP: {` ... `\\n  },` in the page');
  } else {
    const body = html.slice(dpStart, dpEnd)
      .split('\n').map((ln) => ln.replace(/\/\/.*$/, '')).join('\n');
    const seen = new Map();
    for (const m of body.matchAll(/([A-Za-z_][A-Za-z_0-9]*)\s*:\s*-?[0-9]+/g))
      seen.set(m[1], (seen.get(m[1]) || 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
    ok('CONFIG.DP declares every key exactly once', dupes.length === 0,
       dupes.join(', ') || `${seen.size} distinct precisions, no duplicates`);
  }
}
if (stubCalls.length) note(`stub touched during construction: ${[...new Set(stubCalls)].join(', ')}`);
ok('no DOM was needed — document/window/navigator never referenced at construction', stubCalls.length === 0, stubCalls);

// ---- TDZ / lazy cross-namespace binding -----------------------------
// The page declares all four with `const`, so a reference from an earlier
// block to a later one resolves only when it is CALLED. PB_LOT's own header
// says every PB_AMAW/PB_PAY/PB_SECTIONS reference in it is lazy for exactly
// that reason, and an eager one would be a TDZ ReferenceError on a page where
// the order ever changed. That is a property worth asserting rather than
// trusting: evaluate PB_LOT entirely ALONE, with none of the other three in
// scope at all. If it constructs, nothing in it touched them eagerly.
{
  const alone = makeContext();
  let built = null;
  try { built = vm.runInContext(blocks.get('PB_LOT') + '\n;PB_LOT;', alone, { filename: 'PB_LOT alone' }); }
  catch (err) { built = { __err: String(err && err.message) }; }
  ok('PB_LOT constructs with PB_AMAW/PB_PAY/PB_SECTIONS absent — its cross-namespace refs are lazy',
     built && !built.__err, built && built.__err);
  // And the other half: the laziness is real, not vacuous. A call that needs
  // the address map must still fail without it, or the references were never
  // there in the first place and this assertion proves nothing.
  if (built && !built.__err) {
    let threw = null;
    try { built.lotFromApproval(loadPayload('payload_approval.json') || { format: 'kytc-designbook', version: 1, job: { cid: '1' }, approval: { approval_no: '#1', code: 'x', issued_at: '2026-01-01', approved_by: 'a', mix_id: '1' } }); }
    catch (err) { threw = err; }
    ok('…and a call into it without PB_AMAW does fail, so the laziness is load-bearing',
       threw instanceof ReferenceError || (threw && /is not defined/.test(threw.message)),
       threw ? threw.message : 'it returned instead of throwing');
  }
}
// The three leaves construct standalone as well — nothing in them reaches
// forward, which is what makes the page's order the only order that matters.
for (const ns of ['PB_SECTIONS', 'PB_PAY', 'PB_AMAW']) {
  let err = null;
  try { vm.runInContext(blocks.get(ns) + `\n;${ns};`, makeContext(), { filename: `${ns} alone` }); }
  catch (e) { err = e && e.message; }
  ok(`${ns} constructs standalone`, !err, err);
}

// =====================================================================
//  2. PB_SECTIONS  vs  sections.mjs
// =====================================================================
namespace('PB_SECTIONS', '2. PB_SECTIONS vs scripts/amaw/sections.mjs');
{
  const P = PB.PB_SECTIONS;

  // The four exported constants lose their PLANTBOOK_ prefix inside the
  // namespace (PB_SECTIONS's own header says so), so the pairing is by
  // meaning rather than by name.
  same('SECTIONS is structurally identical to PLANTBOOK_SECTIONS', P.SECTIONS, MOD_SECTIONS.PLANTBOOK_SECTIONS);
  same('CITES is identical to PLANTBOOK_CITES', P.CITES, MOD_SECTIONS.PLANTBOOK_CITES);
  same('DESIGNBOOK_CITE_KEYS is identical', P.DESIGNBOOK_CITE_KEYS, MOD_SECTIONS.DESIGNBOOK_CITE_KEYS);
  same('REFERENCE_KEYS is identical', P.REFERENCE_KEYS, MOD_SECTIONS.PLANTBOOK_REFERENCE_KEYS);

  // JSON.stringify dropped every function on the way past. The schema has
  // them — `when:` on the RAP producer column at least — and a rewritten
  // predicate would have compared equal above.
  const [fnCount, fnBad] = fnParity(P.SECTIONS, MOD_SECTIONS.PLANTBOOK_SECTIONS);
  ok(`every function in SECTIONS matches by source (${fnCount} found)`, fnBad.length === 0, fnBad);
  ok('…and the walk actually found functions to compare', fnCount > 0, fnCount);

  // REFERENCE_TABLES holds three functions per table; comparing them by
  // source would pass a table whose `label` template had been reworded into
  // the same shape, so they are CALLED on a sample row instead.
  const rows = [
    { type_name: 'Superpave 0.38', sitemanager_code: '00385' },
    { type_name: 'Superpave No.4', sitemanager_code: '00144' },
    { type_name: '', sitemanager_code: null },
    {},
  ];
  const tKeys = Object.keys(P.REFERENCE_TABLES);
  same('REFERENCE_TABLES has the same tables', tKeys, Object.keys(MOD_SECTIONS.PLANTBOOK_REFERENCE_TABLES));
  for (const t of tKeys) {
    const a = P.REFERENCE_TABLES[t], b = MOD_SECTIONS.PLANTBOOK_REFERENCE_TABLES[t] || {};
    same(`REFERENCE_TABLES.${t} scalars (table/select/orderBy/noun)`,
         { table: a.table, select: a.select, orderBy: a.orderBy, noun: a.noun },
         { table: b.table, select: b.select, orderBy: b.orderBy, noun: b.noun });
    for (const fn of ['value', 'label', 'aliases'])
      sweep(`REFERENCE_TABLES.${t}.${fn}()`, a[fn], b[fn], rows.map((r) => [r]));
  }

  // The five AC determination methods and the code Calculations!AP.. holds
  // for each. On this namespace rather than PB_AMAW's because the FORM is
  // where they are picked, and PB_AMAW calls PB_SECTIONS.acMethodCode() to
  // turn a label back into a number - so a drift here is a workbook whose
  // AP cells are blank and whose AU cells therefore VLOOKUP to nothing,
  // with nothing on screen or in the report saying so.
  same('AC_METHODS is identical', P.AC_METHODS, MOD_SECTIONS.AC_METHODS);
  sweep('acMethodCode()', P.acMethodCode, MOD_SECTIONS.acMethodCode,
        [...MOD_SECTIONS.AC_METHODS, ' Ignition Furnace ', 'ignition furnace',
         'Volumetrics', '', null, undefined, 3].map((x) => [x]));

  // The surface, including the ONE name that is deliberately absent.
  same('the surface is exactly the namespaced names',
       Object.keys(P).sort(),
       ['AC_METHODS', 'CITES', 'DESIGNBOOK_CITE_KEYS', 'REFERENCE_KEYS', 'REFERENCE_TABLES',
        'SECTIONS', 'acMethodCode',
        // PlantBook's sublot locks (2026-09-15). The RULE is here rather than
        // in the page so it can be checked against the section ids it has to
        // match; the page owns only who is exempt (a reviewer, or the
        // ?sublots=open build bypass), which is about the viewer rather than
        // about the lot.
        'SETUP_LOT', 'SETUP_SUBLOT', 'sublotOfSectionId', 'sublotNeedsSample',
        'LOT_LEVEL_SUBBLOCKS', 'LOT_LEVEL_ROW_TABLES', 'LOT_LEVEL_ROW_COLUMNS'].sort());
  // The lock rule itself. The cases that matter are the setup exemption and
  // its exact boundary: lot 1 sublot 1 open, lot 1 sublot 2 gated, lot 2
  // sublot 1 gated, and a blank lot number reading as lot 1 rather than
  // locking a technician out of a form they have not filled in yet.
  sweep('sublotNeedsSample()', P.sublotNeedsSample, MOD_SECTIONS.sublotNeedsSample,
        [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [1, 3], [1, ''], [1, null],
         [1, undefined], [1, 'x'], [0, 1], [5, 1], [null, 1], ['1', '1'], ['2', '1']]);
  sweep('sublotOfSectionId()', P.sublotOfSectionId, MOD_SECTIONS.sublotOfSectionId,
        [['sublot-1'], ['sublot-4'], ['sublot-2-gradation'], ['sublot-3-verify'],
         ['lot'], ['pay'], ['blend'], ['handmix'], ['sublot-5'], ['sublot-'], [''],
         [null], [undefined], ['SUBLOT-1']]);
  same('LOT_LEVEL_SUBBLOCKS is identical', P.LOT_LEVEL_SUBBLOCKS, MOD_SECTIONS.LOT_LEVEL_SUBBLOCKS);
  same('LOT_LEVEL_ROW_TABLES is identical', P.LOT_LEVEL_ROW_TABLES, MOD_SECTIONS.LOT_LEVEL_ROW_TABLES);
  same('LOT_LEVEL_ROW_COLUMNS is identical', P.LOT_LEVEL_ROW_COLUMNS, MOD_SECTIONS.LOT_LEVEL_ROW_COLUMNS);
  // Everything the lock rule exempts has to really BE there, or the exemption
  // is a name that matches nothing: it would silently lock a lot-level block
  // on lot 2 and leave that lot no way to state its own blend. This caught
  // exactly that on 2026-09-15, when Andrew's PR #24 turned Aggregate Blend
  // from an `into: "sublot-1"` sub-section into row TABLES on the tab and the
  // merge was textually clean. It caught the SAME failure again on
  // 2026-09-15b, a merge later: PR #26 folded `blend` into `blend_pct`, so
  // `LOT_LEVEL_ROW_TABLES`'s `blend` entry stopped naming anything real, and
  // this exact assertion is what failed rather than something silent in
  // production. Three shapes exempted now, so three assertions.
  ok('every LOT_LEVEL_SUBBLOCK is a real section drawn inside a sublot tab',
     MOD_SECTIONS.LOT_LEVEL_SUBBLOCKS.every((id) => {
       const sec = MOD_SECTIONS.PLANTBOOK_SECTIONS.find((x) => x.id === id);
       return sec && MOD_SECTIONS.sublotOfSectionId(sec.into) != null;
     }), MOD_SECTIONS.LOT_LEVEL_SUBBLOCKS.join(', ') || '(none)');
  ok('every LOT_LEVEL_ROW_TABLE is a real row table on a sublot tab',
     MOD_SECTIONS.LOT_LEVEL_ROW_TABLES.every((key) =>
       MOD_SECTIONS.PLANTBOOK_SECTIONS.some((sec) =>
         MOD_SECTIONS.sublotOfSectionId(sec.id) != null &&
         (Array.isArray(sec.rows) ? sec.rows : []).some((r) => r.key === key))),
     MOD_SECTIONS.LOT_LEVEL_ROW_TABLES.join(', ') || '(none)');
  // And an exempt table must NOT be sliced per sublot: a sliced one is this
  // sublot's own data by construction (blend_pct is six rows per tab so each
  // sublot edits its own percentage), so exempting it would leave a future
  // sublot editable through the back door the lock exists to close.
  ok('no exempt row table is sliced per sublot',
     MOD_SECTIONS.LOT_LEVEL_ROW_TABLES.every((key) =>
       !MOD_SECTIONS.PLANTBOOK_SECTIONS.some((sec) =>
         (Array.isArray(sec.rows) ? sec.rows : [])
           .some((r) => r.key === key && Array.isArray(r.sliceIndices)))),
     MOD_SECTIONS.LOT_LEVEL_ROW_TABLES.join(', ') || '(none)');
  // LOT_LEVEL_ROW_COLUMNS is the column-level answer for a table that IS
  // sliced per sublot but is not entirely this sublot's own data (blend_pct:
  // `pct` is, `component`/`producer`/`agp`/`type_size`/`bod`/`design_pct`
  // aren't). Same "every exemption has to name something real" rule as the
  // other two lists, parsed as "<row table key>.<column key>".
  ok('every LOT_LEVEL_ROW_COLUMN is a real column of a real row table on a sublot tab',
     MOD_SECTIONS.LOT_LEVEL_ROW_COLUMNS.every((pair) => {
       const [tableKey, colKey] = pair.split('.');
       return MOD_SECTIONS.PLANTBOOK_SECTIONS.some((sec) =>
         MOD_SECTIONS.sublotOfSectionId(sec.id) != null &&
         (Array.isArray(sec.rows) ? sec.rows : []).some((r) =>
           r.key === tableKey && (r.columns || []).some((c) => c.key === colKey)));
     }), MOD_SECTIONS.LOT_LEVEL_ROW_COLUMNS.join(', ') || '(none)');
  // And the column-level exemption must not add up to the WHOLE table: that
  // would be exempting a sliced table by the back door, the exact thing "no
  // exempt row table is sliced per sublot" (above) exists to refuse for
  // LOT_LEVEL_ROW_TABLES. A sliced table with every one of its columns
  // exempted has no column left for the lock to actually cover.
  ok('a sliced row table with any LOT_LEVEL_ROW_COLUMN exemption keeps at least one column NOT exempted',
     MOD_SECTIONS.PLANTBOOK_SECTIONS.every((sec) =>
       (Array.isArray(sec.rows) ? sec.rows : [])
         .filter((r) => Array.isArray(r.sliceIndices))
         .every((r) => {
           const exempt = MOD_SECTIONS.LOT_LEVEL_ROW_COLUMNS.filter((pair) => pair.startsWith(`${r.key}.`));
           if (!exempt.length) return true;
           return (r.columns || []).some((c) => !exempt.includes(`${r.key}.${c.key}`));
         })),
     MOD_SECTIONS.LOT_LEVEL_ROW_COLUMNS.join(', ') || '(none)');

  ok('isRapRow is NOT on the surface — the splice deleted it as the module asks, '
   + 'and the schema calls the page\'s hoisted copy instead', !('isRapRow' in P));
  ok('…and sections.mjs still exports the copy it tells the splice to delete, '
   + 'so the module keeps loading in Node', typeof MOD_SECTIONS.isRapRow === 'function');

  // Shape facts worth failing on directly, because a schema that still
  // stringifies identically but has lost a step is a different page.
  // Twenty-one as of 2026-09-14's Verification split - counted directly
  // against the schema rather than re-deriving the running total by hand,
  // which is how an earlier version of this comment (asserting "sixteen")
  // undercounted by 2: it walked the day's changes one at a time from
  // "eleven" but never added the +2 for PR #18's design-aggregate/
  // design-values-ref sections, which had already landed on this branch by
  // then. Count what P.SECTIONS actually holds before asserting a number,
  // not what a chain of deltas implies it should hold. A count rather than
  // a list on purpose - a schema that still stringifies identically but has
  // lost a section is a different page.
  // 2026-09-15: down to twenty - the standalone "Aggregate Blend" section
  // (into: "sublot-1") is gone, folded into buildSublotTabSections()'s own
  // rows/fields so it can sit at the TOP of each tab (into-children always
  // render after a section's own body). One fewer top-level section, two
  // more row-table keys (blend split into BLEND_IDENTITY_SPEC + a per-sublot
  // BLEND_PCT_SPEC) - the count that moved is sections, not tables.
  ok('SECTIONS carries twenty sections', P.SECTIONS.length === 20, P.SECTIONS.length);
  const ids = P.SECTIONS.map((s) => s.id);
  ok('every section id is unique', new Set(ids).size === ids.length, ids);
  ok('the status step is `lot-status`, not `status` — DesignBook owns that id '
   + 'and two sections answering to one getElementById is the failure CLAUDE.md records',
     ids.includes('lot-status') && !ids.includes('status'), ids);
}

// =====================================================================
//  3. PB_PAY  vs  pay.mjs + payview.mjs
// =====================================================================
namespace('PB_VOL', '3. PB_VOL vs scripts/amaw/volumetrics.mjs');
{
  const P = PB.PB_VOL;
  const M = MOD_VOL;

  same('the surface carries every name the module exports',
       Object.keys(P).sort(), Object.keys(M).filter((k) => k !== 'default').sort());
  ok('PCF_PER_SG is KYTC\'s 62.4, not a rounding of 62.428',
     P.PCF_PER_SG === 62.4 && M.PCF_PER_SG === 62.4, [P.PCF_PER_SG, M.PCF_PER_SG]);
  same('DP is identical', P.DP, M.DP);
  ok('DUST_RATIO_NOTE is identical', P.DUST_RATIO_NOTE === M.DUST_RATIO_NOTE);

  // Weights around the shapes that actually occur, plus the ones that break
  // arithmetic: a zero bulk volume (a typo, not a gravity), a missing third
  // weight, and a blank absorbed-water cell, which reads as 0 inside the sum
  // in Excel and therefore has to here.
  const specs = [
    { air: 4812.4, water: 2751.3, ssd: 4818.9 },
    { air: 4795.1, water: 2744.8, ssd: 4801.2 },
    { air: 4800, water: 2750, ssd: 2750 },          // zero volume
    { air: 4800, water: 2750 },                      // no SSD
    { air: null, water: null, ssd: null },
    {},
  ];
  // BOTH rounding modes, because the two sheets disagree and that divergence
  // is the single most reversible-looking thing in this module: `Superpave`
  // rounds the bulk volume and BSG, `Super Verify` rounds neither.
  sweep('bsgSpecimen()', P.bsgSpecimen, M.bsgSpecimen,
        specs.flatMap((sp) => [[sp], [sp, { round: true }], [sp, { round: false }]]).concat([[undefined]]));
  const dets = [
    { mix: 2015.3, calibration: 7996.2, finalWeight: 9205.4, absorbedWater: 0 },
    { mix: 2008.7, calibration: 7996.2, finalWeight: 9201.9 },   // absorbed water blank
    { mix: 2000, calibration: 8000, finalWeight: 10000, absorbedWater: 0 },  // zero denominator
    { mix: 2000 },
    {},
  ];
  sweep('msgDetermination()', P.msgDetermination, M.msgDetermination,
        dets.flatMap((d) => [[d], [d, { round: true }], [d, { round: false }]]).concat([[undefined]]));
  sweep('averagePresent()', P.averagePresent, M.averagePresent,
        [[[]], [[1, 2]], [[1, null]], [[null, null]], [[0, 0]], [null], [undefined]]);
  sweep('bsgAverage()', P.bsgAverage, M.bsgAverage,
        [[specs.slice(0, 2)], [specs.slice(0, 2), { round: false }], [[specs[0]]], [[]], [null]]);
  sweep('msgAverage()', P.msgAverage, M.msgAverage,
        [[dets.slice(0, 2)], [dets.slice(0, 2), { round: false }], [[]], [null]]);
  sweep('gseFromHandMix()', P.gseFromHandMix, M.gseFromHandMix,
        [[{ gmm: 2.5, binderPct: 5.2 }], [{ gmm: 2.5 }], [{ binderPct: 5.2 }], [{}], [undefined]]);
  sweep('handMixedGse()', P.handMixedGse, M.handMixedGse,
        [[{ determinations: dets.slice(0, 2), binderPct: 5.2 }], [{ determinations: [] }], [undefined]]);

  const gsbs = [2.664, 2.671, null];
  sweep('sublotVolumetrics()', P.sublotVolumetrics, M.sublotVolumetrics,
        gsbs.flatMap((gsb) => [5.25, null].map((binderPct) => [{
          specimens: specs.slice(0, 2), determinations: dets.slice(0, 2),
          binderPct, gsb, gse: 2.721, pctPassing200: 5.1,
        }])).concat([[{}], [undefined]]));

  // ---- the verification half ----------------------------------------
  // check_verify.mjs is what proves these against KYTC's own formulas; this
  // only proves the page's copy and the module's are the same code.
  sweep('backCalcBinderPct()', P.backCalcBinderPct, M.backCalcBinderPct,
        [[{ gse: 2.721, gmm: 2.5 }], [{ gse: 1.03, gmm: 2.5 }], [{ gse: 2.721, gmm: 0 }],
         [{ gse: 2.721 }], [{ gmm: 2.5 }], [{}], [undefined]]);
  sweep('moisturePct()', P.moisturePct, M.moisturePct,
        [[{ before: 1520.4, after: 1513.1, pan: 310.2 }], [{ before: 310.2, after: 310.2, pan: 310.2 }],
         [{ before: 1520.4 }], [{ before: 1520.4, after: 1513.1 }], [{}], [undefined]]);
  sweep('verifyVolumetrics()', P.verifyVolumetrics, M.verifyVolumetrics,
        gsbs.flatMap((gsb) => [0.6, null].map((moisture) => [{
          specimens: specs.slice(0, 2), determinations: dets.slice(0, 2), moisture, gsb, gse: 2.721,
        }])).concat([[{ specimens: specs.slice(0, 2), determinations: [], gsb: 2.664, gse: 2.721 }],
                     [{}], [undefined]]));

  sweep('coreDerived()', P.coreDerived, M.coreDerived,
        [[{ air: 4800, water: 2750, ssd: 4810, msg: 2.5 }],
         [{ air: 4800, water: 2750, ssd: 4810, msg: 2.5, paysOnMix: false }],
         [{ air: 4800, water: 2750, ssd: 4810, msg: 0 }],
         [{ air: 4800, water: 2750, ssd: 4810 }], [{}], [undefined]]);
}

namespace('PB_PAY', '4. PB_PAY vs scripts/amaw/pay.mjs + payview.mjs');
{
  const P = PB.PB_PAY;
  const M = { ...MOD_PAY, ...MOD_PAYVIEW };

  same('the surface carries every name both modules export',
       Object.keys(P).sort(),
       [...new Set([...Object.keys(MOD_PAY), ...Object.keys(MOD_PAYVIEW)])].filter((k) => k !== 'default').sort());
  ok('MCL is the same sentinel', P.MCL === MOD_PAY.MCL, [P.MCL, MOD_PAY.MCL]);

  // ---- the pure arithmetic, swept wide ------------------------------
  // Wide rather than realistic on purpose: a drift detector wants the edges
  // of every band in the pay schedule, the MCL sentinel, nulls, negatives and
  // the values Excel's own rounding disagrees with JavaScript about. A sweep
  // that only walks the middle of each band cannot see a boundary that moved.
  const nums = [null, undefined, '', 'MCL', 0, -0.5, 0.004, 0.005, 0.0049999,
                0.5, 1, 1.005, 2.5, 3.5, 4, 4.2, 5, 5.25, 6, 7, 10, 12.5,
                14, 14.5, 15, 20, 45, 50, 85, 88, 90, 91, 92, 92.5, 93, 94,
                95, 96, 97, 98, 100, 101, 105, -3, NaN];
  const dps = [0, 1, 2, 3];
  sweep('xlRound()', P.xlRound, M.xlRound, nums.flatMap((v) => dps.map((d) => [v, d])).concat(nums.map((v) => [v])));
  sweep('avgPresent()', P.avgPresent, M.avgPresent,
        [[[]], [[1, 2, 3]], [[1, null, 3]], [[null, null]], [['MCL', 1]], [[0, 0]], [null], [undefined]]);
  sweep('lotAverage()', P.lotAverage, M.lotAverage,
        [[[]], [[100, 100, 100, 100]], [[100, 'MCL', 100]], [['MCL', 'MCL']], [[null, 98]], [null]]);

  const codes = [null, undefined, 0, 1, 2, 3, 4, 5, 6, 13, 14, 15, '5', 'NO.4', 99];
  sweep('vmaMinimumFor()', P.vmaMinimumFor, M.vmaMinimumFor, codes.map((c) => [c]));
  sweep('airVoidTargetFor()', P.airVoidTargetFor, M.airVoidTargetFor, codes.map((c) => [c]));

  const flagsSweep = [];
  for (const jointDensityFlag of [null, 0, 1, 2])
    for (const densityOption of [null, 0, 1, 2, 3])
      for (const acceptanceOption of [null, 0, 1, 2, 3])
        flagsSweep.push([{ jointDensityFlag, densityOption, acceptanceOption }]);
  flagsSweep.push([undefined], [{}]);
  sweep('propertyWeights()', P.propertyWeights, M.propertyWeights, flagsSweep);

  const acCases = [];
  for (const jmfAC of [null, 4.5, 5.2, 6.0])
    for (const ac of nums.slice(0, 26))
      for (const isFirstSublot of [false, true])
        acCases.push([{ jmfAC, ac, isFirstSublot }]);
  sweep('acPay()', P.acPay, M.acPay, acCases.concat([[undefined], [{}]]));

  const avCases = [];
  for (const av of nums)
    for (const esalClass of [null, 1, 2, 3, 4])
      for (const isFirstSublot of [false, true])
        avCases.push([{ av, esalClass, isFirstSublot }]);
  sweep('airVoidPay()', P.airVoidPay, M.airVoidPay, avCases.concat([[undefined], [{}]]));

  const vmaCases = [];
  for (const vma of nums)
    for (const minVMA of [null, 13, 14, 15, 16])
      for (const isFirstSublot of [false, true])
        for (const mixTypeCode of [5, 14, null])
          vmaCases.push([{ vma, minVMA, isFirstSublot, mixTypeCode }]);
  sweep('vmaPay()', P.vmaPay, M.vmaPay, vmaCases.concat([[undefined], [{}]]));

  // ---- Gradation acceptance (2026-09-22) ---------------------------
  // The Specialty schedule: the control-point gate, the six ladders, the
  // #200's half-rounding, the AC and F.M. ladders, and the per-sublot MIN.
  same('CONTROL_POINTS_BY_MIX_TYPE is identical', P.CONTROL_POINTS_BY_MIX_TYPE, M.CONTROL_POINTS_BY_MIX_TYPE);
  same('GRADATION_LADDERS is identical', P.GRADATION_LADDERS, M.GRADATION_LADDERS);
  same('GRADATION_PAY_SIEVES is identical', P.GRADATION_PAY_SIEVES, M.GRADATION_PAY_SIEVES);
  const gradSieves = ['s50', 's37_5', 's25', 's19', 's12_5', 's9_5', 's4_75', 's2_36', 's1_18', 's0_6', 's0_3', 's0_15', 's0_075', 's6_3', 'bogus', null];
  sweep('controlPointsFor()', P.controlPointsFor, M.controlPointsFor, codes.map((c) => [c]));
  sweep('controlPointBand()', P.controlPointBand, M.controlPointBand, codes.flatMap((c) => gradSieves.map((sv) => [c, sv])));
  sweep('roundToHalf()', P.roundToHalf, M.roundToHalf, nums.map((v) => [v]));
  const sieveCases = [];
  for (const sieve of gradSieves)
    for (const jmf of [null, 45, 6.0, 100])
      for (const test of [null, 30, 33, 44.6, 60.4, 12.36, 100, 99.4])
        for (const mixTypeCode of [5, 7, 12, 14, 99, null])
          sieveCases.push([{ sieve, jmf, test, mixTypeCode }]);
  sweep('sievePay()', P.sievePay, M.sievePay, sieveCases.concat([[undefined], [{}]]));
  sweep('specialtyAcPay()', P.specialtyAcPay, M.specialtyAcPay,
        acCases.map(([c]) => [{ jmfAC: c.jmfAC, ac: c.ac }]).concat([[undefined], [{}]]));
  const passing = { s4_75: 60, s2_36: 44, s1_18: 33, s0_6: 24, s0_3: 17, s0_15: 11, s0_075: 6 };
  sweep('finenessModulus()', P.finenessModulus, M.finenessModulus, [[passing], [{ ...passing, s0_15: null }], [{}], [null]]);
  sweep('finenessModulusPay()', P.finenessModulusPay, M.finenessModulusPay,
        [2.5, 2.8, 2.95, 3.1, null].flatMap((t) => [2.5, 2.83, 2.9, 3.04, null].map((v) => [{ target: t, test: v }])).concat([[undefined], [{}]]));
  const gradJmf = { s12_5: 100, s9_5: 96, s4_75: 62, s2_36: 45, s0_075: 6 };
  const gradSub = (test, ac, extra) => ({ mixTypeCode: 5, jmf: gradJmf, test, jmfAC: 5.9, ac, ...extra });
  const gradSubCases = [
    [gradSub({ s12_5: 100, s9_5: 95, s4_75: 60, s2_36: 30, s0_075: 12.4 }, 6.55, { isFirstSublot: false, position: 0 })],
    [gradSub({ s12_5: 100, s9_5: 97, s4_75: 63, s2_36: 44, s0_075: 6.4 }, 5.9, { isFirstSublot: true, position: 0 })],
    [gradSub({ s12_5: 100, s9_5: 97, s4_75: 63, s2_36: 70, s0_075: 6.4 }, 5.9, { isFirstSublot: true, position: 0 })],
    [gradSub({}, null, { position: 2 })],
    [{ ...gradSub({ s4_75: 60, s2_36: 80, s1_18: 70, s0_6: 55, s0_3: 30, s0_15: 10, s0_075: 4 }, 6.1, {}),
       mixTypeCode: 7, jmf: { s4_75: 100, s2_36: 85, s1_18: 72, s0_6: 58, s0_3: 32, s0_15: 11, s0_075: 4.5 } }],
    [undefined], [{}],
  ];
  sweep('gradationSublotPay()', P.gradationSublotPay, M.gradationSublotPay, gradSubCases);
  sweep('gradationLotPay()', P.gradationLotPay, M.gradationLotPay,
        [[{ sublots: gradSubCases.slice(0, 3).map(([c]) => M.gradationSublotPay(c)) }], [{ sublots: [] }], [undefined]]);

  const density = [null, 80, 88, 89, 89.9, 90, 90.1, 91, 92, 92.5, 93, 94, 95, 96, 97, 98, 99, 100, 101, 'MCL'];
  sweep('laneCorePay()', P.laneCorePay, M.laneCorePay,
        density.flatMap((d) => [1, 2, 3, 4, null].flatMap((esalClass) => [5, 14].map((mixTypeCode) => [d, { esalClass, mixTypeCode }]))));
  sweep('jointCorePay()', P.jointCorePay, M.jointCorePay,
        density.flatMap((d) => [5, 14, null, 99].map((mixTypeCode) => [d, { mixTypeCode }])));

  const coreSets = [
    [[], [], [], []],
    [[92, 93, 94, 95], [91, 92, 93, 94], [90, 91, 92, 93], [95, 96, 97, 98]],
    [[92], [], [88], [100]],
    [[89.9, 90.1], [95, 95], [], []],
  ];
  const dlCases = [];
  for (const sublotCores of coreSets)
    for (const lotNumber of [1, 2])
      for (const densityOption of [null, 1, 2, 3])
        dlCases.push([{ sublotCores, lotNumber, densityOption, esalClass: 3, mixTypeCode: 5 }]);
  sweep('laneDensityLot()', P.laneDensityLot, M.laneDensityLot, dlCases.concat([[undefined], [{}]]));
  sweep('jointDensityLot()', P.jointDensityLot, M.jointDensityLot,
        coreSets.flatMap((sublotCores) => [1, 2].flatMap((lotNumber) => [0, 1, 2].map((jointDensityFlag) =>
          [{ sublotCores, lotNumber, jointDensityFlag, mixTypeCode: 5 }]))).concat([[undefined], [{}]]));

  const sublotCases = [];
  for (const ac of [null, 5.0, 5.2, 5.9])
    for (const av of [null, 3.0, 4.0, 4.2, 7.5])
      for (const vma of [null, 13.0, 14.5, 16.0])
        for (const isFirstSublot of [false, true])
          sublotCases.push([{ jmfAC: 5.2, ac, targetAV: 4, av, minVMA: 14, vma, isFirstSublot, esalClass: 3, mixTypeCode: 5 }]);
  sweep('sublotPay()', P.sublotPay, M.sublotPay, sublotCases.concat([[undefined], [{}]]));

  // ---- lotPay, and the readout, on whole lots -----------------------
  // Five shapes, the same five check_payview.mjs renders: a full lot, a
  // partial one, one driven to MCL, an empty one, and a lot 1 (whose sublot 1
  // carries the "*For Sublot # 1 Only" allowance nothing else on the job has).
  const SYNTH = {
    full: {
      sublots: [
        { jmfAC: 5.2, ac: 5.25, targetAV: 4, av: 4.1, minVMA: 14, vma: 14.6 },
        { jmfAC: 5.2, ac: 5.05, targetAV: 4, av: 3.6, minVMA: 14, vma: 14.2 },
        { jmfAC: 5.2, ac: 5.45, targetAV: 4, av: 4.8, minVMA: 14, vma: 15.1 },
        { jmfAC: 5.2, ac: 5.2, targetAV: 4, av: 4.0, minVMA: 14, vma: 14.4 },
      ],
      laneCores: [[92.1, 93.4, 91.8, 94.0], [90.5, 92.2, 93.9, 91.1], [95.2, 94.4, 93.1, 92.8], [89.4, 90.2, 91.6, 92.9]],
      jointCores: [[90.2, 91.4], [88.9, 92.0], [93.1, 91.8], [90.0, 89.5]],
      jointDensityFlag: 1, densityOption: 1, acceptanceOption: 1,
      lotNumber: 2, esalClass: 3, mixTypeCode: 5, tonnage: 4125, unitPrice: 82.5, wedgeTons: 0,
    },
    firstLot: null, partial: null, mcl: null,
    empty: { sublots: [], laneCores: [], jointCores: [], lotNumber: 1, esalClass: 3, mixTypeCode: 5, tonnage: 0, unitPrice: 0 },
    // Gradation acceptance (2026-09-22): a leveling-and-wedging lot on a 0.38
    // design - two sublots scored, one of them outside the control points on
    // two sieves, one clean, and two sublots not yet weighed.
    gradation: null,
  };
  SYNTH.gradation = {
    sublots: [{ jmfAC: 5.9, ac: 6.55 }, { jmfAC: 5.9, ac: 5.95 }, { jmfAC: 5.9 }, { jmfAC: 5.9 }],
    laneCores: [[], [], [], []], jointCores: [[], [], [], []],
    jointDensityFlag: 2, densityOption: 1, acceptanceOption: 1,
    lotNumber: 1, esalClass: 3, mixTypeCode: 5, tonnage: 3950, unitPrice: 50, wedgeTons: 0,
    gradation: {
      jmf: { s12_5: 100, s9_5: 96, s4_75: 62, s2_36: 45, s1_18: 33, s0_6: 24, s0_3: 17, s0_15: 11, s0_075: 6.0 },
      sublots: [
        { test: { s12_5: 100, s9_5: 95, s4_75: 60, s2_36: 30, s1_18: 22, s0_6: 16, s0_3: 11, s0_15: 8, s0_075: 12.4 } },
        { test: { s12_5: 100, s9_5: 97, s4_75: 63, s2_36: 44, s1_18: 32, s0_6: 23, s0_3: 16, s0_15: 10, s0_075: 6.4 } },
        { test: {} }, { test: {} },
      ],
    },
  };
  SYNTH.firstLot = { ...SYNTH.full, lotNumber: 1 };
  SYNTH.partial = { ...SYNTH.full, sublots: SYNTH.full.sublots.slice(0, 2), laneCores: SYNTH.full.laneCores.slice(0, 2), jointCores: SYNTH.full.jointCores.slice(0, 2) };
  SYNTH.mcl = { ...SYNTH.full, sublots: SYNTH.full.sublots.map((s) => ({ ...s, av: 9.9, vma: 9.0 })) };

  const lotInputs = Object.entries(SYNTH).map(([k, v]) => [k, v]);

  // The real lots, if they were handed to us. This is the only part of the
  // pay check that needs a workbook, and the sweeps above stand without it.
  if (!AMAW_LOTS.length) {
    skip('lotPay()/the readout on the two real AMAW lots',
         'no AMAW workbook passed — pass the completed lots as arguments');
  } else {
    for (const f of AMAW_LOTS) lotInputs.push([path.basename(f), readPayInputs(f)]);
  }

  sweep('lotPay()', P.lotPay, M.lotPay, lotInputs.map(([, v]) => [v]));

  // payview does no arithmetic — what it can still do is lose money in the
  // rendering, so the comparison is BYTE-identical HTML, not a parsed shape.
  const ctxFor = (label, input) => ({ label, id: 'pv', ...input });
  // The layered readout too, with a synthetic trace so the third layer
  // renders, and with panels open so the open-state plumbing is compared.
  const traceFor = (input) => ({
    handmix: { binderPct: 5.9, gmm: 2.4809, gse: 2.7212, dets: [{ mix: 2000, calibration: 7400, finalWeight: 8590, absorbedWater: 0, msg: 2.469 }] },
    sublots: (input.sublots || []).map((sub) => ({
      specimens: [{ air: 4785.2, water: 2771.4, ssd: 4793.6, volume: 2022.2, bsg: 2.366 }],
      dets: [{ mix: 2000, calibration: 7400, finalWeight: 8590, absorbedWater: 0, msg: 2.469 }],
      gmb: 2.366, gmm: 2.469, gse: 2.7212, moisture: { before: 1500, after: 1492, pan: 300, pct: 0.6667 },
      backCalc: 6.2, binderPct: sub.ac, gsb: 2.66, va: sub.av, vma: sub.vma, absorbedAC: 0.5, pbe: 5,
    })),
    lane: (input.laneCores || []).map((cs, i) => cs.map((pct, k) => ({ id: `${i + 1}-${k}`, air: 1250, water: 720, ssd: 1255, bsg: 2.336, density: 145.8, msg: 2.469, pctSolid: pct }))),
    joint: (input.jointCores || []).map((cs, i) => cs.map((pct, k) => ({ id: `${i + 1}-J${k}`, air: 1250, water: 690, ssd: 1255, bsg: 2.212, density: 138, msg: 2.469, pctSolid: pct }))),
  });
  const OPEN = ['prop.av', 'sub.av.1', 'prop.laneDensity', 'core.laneDensity.1', 'prop.jointDensity', 'final', 'tons', 'money', 'grad.0', 'grad.1'];
  let htmlBad = 0, headBad = 0, warnBad = 0, notesBad = 0, bytes = 0, xBad = 0, xBytes = 0;
  for (const [label, input] of lotInputs) {
    const rp = P.lotPay(input), rm = M.lotPay(input);
    const c = ctxFor(label, input);
    const hp = P.payViewHTML(rp, c), hm = M.payViewHTML(rm, c);
    bytes += hp.length;
    if (hp !== hm) { htmlBad++; console.log(`          payViewHTML differs on "${label}" (${firstDiff(hp, hm)})`); }
    const xc = { ...c, trace: traceFor(input), open: OPEN };
    const xp = P.payExplainHTML(rp, xc), xm = M.payExplainHTML(rm, xc);
    xBytes += xp.length;
    if (xp !== xm) { xBad++; console.log(`          payExplainHTML differs on "${label}" (${firstDiff(xp, xm)})`); }
    if (stable(P.payHeadline(rp, c)) !== stable(M.payHeadline(rm, c))) headBad++;
    if (stable(P.payWarnings(rp, c)) !== stable(M.payWarnings(rm, c))) warnBad++;
    if (stable(P.collectNotes(rp)) !== stable(M.collectNotes(rm))) notesBad++;
  }
  ok(`payViewHTML() is byte-identical on ${lotInputs.length} lots (${(bytes / 1024).toFixed(0)} KB rendered)`, htmlBad === 0, `${htmlBad} differ`);
  ok(`payExplainHTML() is byte-identical on ${lotInputs.length} lots, three layers open (${(xBytes / 1024).toFixed(0)} KB rendered)`, xBad === 0, `${xBad} differ`);
  ok(`payHeadline() agrees on ${lotInputs.length} lots`, headBad === 0, `${headBad} differ`);
  ok(`payWarnings() agrees on ${lotInputs.length} lots`, warnBad === 0, `${warnBad} differ`);
  ok(`collectNotes() agrees on ${lotInputs.length} lots`, notesBad === 0, `${notesBad} differ`);

  // The escaper is the page's own `escapeHTML`, kept rather than routed
  // through the page's esc() so this stays a pure port (PB_PAY's header).
  sweep('escapeHTML()', P.escapeHTML, M.escapeHTML,
        [['<script>alert(1)</script>'], ['a & b'], ['"quoted"'], ["it's"], [null], [undefined], [0], [5.5], [{}]].map((a) => a));
  sweep('fmtPct()', P.fmtPct, M.fmtPct, nums.map((v) => [v]));
  sweep('fmtTons()', P.fmtTons, M.fmtTons, nums.flatMap((v) => [[v], [v, { signed: false }]]));
  sweep('fmtMoney()', P.fmtMoney, M.fmtMoney, nums.flatMap((v) => [[v], [v, { signed: false }]]));
}

// =====================================================================
//  4. PB_AMAW  vs  addresses.mjs + mapper.mjs + generate.mjs
// =====================================================================
namespace('PB_AMAW', '5. PB_AMAW vs scripts/amaw/addresses.mjs + mapper.mjs + generate.mjs');
{
  const P = PB.PB_AMAW;

  // ---- addresses.mjs: the whole map ---------------------------------
  same('AMAW (the everything-under-one-name object) is identical', P.AMAW, MOD_ADDRESSES.AMAW);
  same('BLOCKS is identical', P.BLOCKS, MOD_ADDRESSES.BLOCKS);
  same('SUBLOT_OF is identical', P.SUBLOT_OF, MOD_ADDRESSES.SUBLOT_OF);
  for (const k of ['LOT', 'AGGREGATE', 'SUBLOT', 'VERIFY', 'GRADATION', 'CORES', 'KYCT', 'PAY', 'HAMBURG', 'PERFORMANCE', 'CALC', 'STAGING'])
    same(`${k} is identical`, P[k], MOD_ADDRESSES[k]);
  same('FIELDS is identical', P.FIELDS, MOD_ADDRESSES.FIELDS);
  ok(`FIELDS carries ${MOD_ADDRESSES.FIELDS.length} fields`, P.FIELDS.length === MOD_ADDRESSES.FIELDS.length, [P.FIELDS.length, MOD_ADDRESSES.FIELDS.length]);
  // addresses.mjs's UNCLASSIFIED and mapper.mjs's are two different lists that
  // the splice had to rename apart (UNCLASSIFIED_FIELDS / UNCLASSIFIED_CELLS)
  // because a flat splice would have collided them — which is the whole
  // argument for the namespaces.
  same('UNCLASSIFIED_FIELDS is addresses.mjs\'s UNCLASSIFIED', P.UNCLASSIFIED_FIELDS, MOD_ADDRESSES.UNCLASSIFIED);
  same('UNCLASSIFIED_CELLS is mapper.mjs\'s UNCLASSIFIED', P.UNCLASSIFIED_CELLS, MOD_MAPPER.UNCLASSIFIED);
  ok('…and the two really are different lists, so the rename was load-bearing',
     stable(MOD_ADDRESSES.UNCLASSIFIED) !== stable(MOD_MAPPER.UNCLASSIFIED));

  // bySn over every sn a real AMAW has, plus the misses. The reason this is a
  // sweep and not a spot check: `bySn` is a Map built at module load, and a
  // Map built from a subtly different FIELDS is invisible in FIELDS itself.
  const snCases = [];
  for (const f of MOD_ADDRESSES.FIELDS) snCases.push([f.sn]);
  for (const miss of [0, -1, null, undefined, 9999, '42', 42.5]) snCases.push([miss]);
  sweep('bySn()', P.bySn, MOD_ADDRESSES.bySn, snCases);

  // addressOf over EVERY field × EVERY block. This is the one that would
  // catch a stride typo: lot-level fields read one cell in all seven records,
  // the four QC sublots step 6 rows down `Superpave`, and QA/IQ step 7 down
  // `Super Verify` (docs/amaw-map.md).
  const addrCases = [];
  for (const f of MOD_ADDRESSES.FIELDS) for (const b of MOD_ADDRESSES.BLOCKS) addrCases.push([f, b]);
  for (const b of MOD_ADDRESSES.BLOCKS) addrCases.push([null, b], [{}, b], [{ sn: 1 }, b]);
  for (const f of MOD_ADDRESSES.FIELDS.slice(0, 5)) addrCases.push([f, 'NOPE'], [f, null]);
  sweep(`addressOf() over ${MOD_ADDRESSES.FIELDS.length} fields x ${MOD_ADDRESSES.BLOCKS.length} blocks`,
        P.addressOf, MOD_ADDRESSES.addressOf, addrCases);

  // ---- mapper.mjs: the helpers, then a real lot ---------------------
  same('INPUTS is identical', P.INPUTS, MOD_MAPPER.INPUTS);
  same('FLAGS is identical', P.FLAGS, MOD_MAPPER.FLAGS);
  sweep('A() (sheet, cell -> quoted address)', P.A, MOD_MAPPER.A,
        [['Pay Values', 'B3'], ['Superpave', 'N3'], ['discipline', 'E2'], ['.45 Data', 'A1'], ['Cores', 'I10'], ['', 'A1']]);
  sweep('colShift()', P.colShift, MOD_MAPPER.colShift,
        [['A', 0], ['A', 1], ['A', 25], ['A', 26], ['Z', 1], ['AA', -1], ['R', 3], ['G', 8], ['AZ', 1], ['B', -1]]);
  // Both helpers REFUSE a paper-format value (null, reported by the mapper's
  // writeWhen()) where they used to parseFloat it into a wrong serial, so the
  // refusal branches are swept as hard as the conversions: a copy that still
  // wrote 9 for '9/24/26' would be the drift that matters most here.
  sweep('amDateSerial()', P.amDateSerial, MOD_MAPPER.amDateSerial,
        [['2026-09-13'], ['2026-09-13T14:00:00Z'], ['9/13/2026'], [45000], ['0'], [''], [null], [undefined], ['not a date'],
         ['9/24/26'], ['09/24/2026'], ['24-09-2026'], ['2026-02-30'], ['2024-02-29'], ['0026-09-24'], ['1899-12-31'],
         [' 2026-09-24 '], ['20260924'], [46267.5]]);
  sweep('amTimeFraction()', P.amTimeFraction, MOD_MAPPER.amTimeFraction,
        [['21:54'], ['09:05'], ['2154'], [0.9125], [0], [1], [''], [null], [undefined], ['nope'],
         ['2:15 PM'], ['2:15pm'], ['1415'], ['2:15'], ['9:30'], ['24:00'], ['14:60'], ['23:59:59'], ['09:30:15.5'], [' 14:15 ']]);
  // The REASON a value is refused, which the page's rail prints beside the
  // mapper's report - one definition, so the two cannot name different
  // causes. The year is its own case: it is what the date picker produces
  // when a two-digit year is typed ('0026-09-24').
  sweep('amDateRefusal()', P.amDateRefusal, MOD_MAPPER.amDateRefusal,
        [['2026-09-24'], ['0026-09-24'], ['0002-09-24'], ['1899-12-31'], ['1900-01-01'], ['2026-02-30'],
         ['9/24/26'], ['20266-09-24'], ['2026-09-13T14:00:00Z'], [46289], [NaN], [''], ['  '], [null], [undefined]]);
  sweep('amTimeRefusal()', P.amTimeRefusal, MOD_MAPPER.amTimeRefusal,
        [['14:15'], ['14:15:30'], ['2:15 PM'], ['1415'], ['2:15'], ['24:00'], [0.5], [''], [null], [undefined]]);

  // The seam between the form's field keys and the workbook's own names.
  // Both copies have to agree about it or a lot built in the browser reaches
  // a different set of cells from one built in Node - which is precisely the
  // failure mode this bridge was written to end. The cases carry the two
  // conversions as well as the plain aliases: the density option's letter,
  // and joint density's 1/2 against Calculations!M11's boolean.
  same('LOT_FIELD_ALIASES is identical', P.LOT_FIELD_ALIASES, MOD_MAPPER.LOT_FIELD_ALIASES);
  const scalarCases = [
    [{ lot_county: 'Madison', lot_nominal_size: '0.38', lot_tons: 4000, lot_unit_price: 50 }],
    [{ lot_nominal_size: 'NO.4' }], [{ lot_nominal_size: '0.62' }], [{ lot_nominal_size: '' }],
    [{ lot_density_option: 'A' }], [{ lot_density_option: 'B' }], [{ lot_density_option: 'b' }],
    [{ lot_density_option: 1 }], [{ lot_density_option: 'Option A' }],
    [{ lot_joint_density: '1' }], [{ lot_joint_density: '2' }], [{ lot_joint_density: 2 }],
    [{ lot_joint_density: '' }], [{ joint_density: true }], [{ joint_density: false }],
    [{ mix_type_code: 14, lot_nominal_size: '0.38' }],
    // The equipment flags, into Calculations!M1/M2's BOOLEAN rather than the
    // IF(M,1,2) above it. Asymmetric cases on purpose: "No" -> 0 and not 2,
    // because 2 would read back as TRUE - the inversion joint density already
    // suffered at M11 - and an unreadable answer must vanish rather than
    // become a No.
    [{ lot_equipment_verified_qa: 'Yes', lot_equipment_verified_iq: 'No' }],
    [{ lot_equipment_verified_qa: 'No' }], [{ lot_equipment_verified_qa: 'yes' }],
    [{ lot_equipment_verified_qa: 'maybe' }], [{ lot_equipment_verified_qa: '' }],
    [{ lot_equipment_verified_qa: 2 }], [{ equipment_verified_qa: 1 }],
    [{ lot_kytc_lab: 'LU00642', lot_ps_lab: 'LU01210', lot_binder_terminal: 'X',
       lot_binder_grade: 'PG64-22', lot_additive: 'Y', lot_handmix_binder_pct: 5.2 }],
    // The approval's own figures, which live one level down on
    // `values.design` and have to be lifted. `target_va` must NOT be lifted
    // ('Pay Values'!E13 is a formula), and a value already under the
    // mapper's own name must win over the design block.
    [{ design: { jmf_ac: 5.9, target_va: 3.5, min_vma: 15 } }],
    [{ design: { jmf_ac: 5.9 }, jmf_ac: 6.1 }],
    [{ design: { min_vma: null, jmf_ac: '' } }],
    [{ design: {} }], [{ design: null }],
    [{}], [null], [undefined],
  ];
  sweep('lotScalars()', P.lotScalars, MOD_MAPPER.lotScalars, scalarCases);

  // The SECOND seam: the form's flat tables against the seven records. Same
  // argument as the scalars above, and a bigger surface - this is the one
  // that decides whether a lot built in the browser reaches the same cells as
  // one built in Node. The three declared tables are compared whole, then the
  // engine is swept over the cases that actually bite: a refused identity, a
  // seeded-but-blank row, a slot given out of order, the two spellings of a
  // Department record, and a lot that already carries the workbook's own
  // records and must come back unchanged.
  same('LOT_TABLE_ROUTES is identical', P.LOT_TABLE_ROUTES, MOD_MAPPER.LOT_TABLE_ROUTES);
  same('JMF_SIEVE_KEYS is identical', P.JMF_SIEVE_KEYS, MOD_MAPPER.JMF_SIEVE_KEYS);
  same('GRADATION_COLUMNS is identical', P.GRADATION_COLUMNS, MOD_MAPPER.GRADATION_COLUMNS);
  const R = (rows, values, existing) => [values || {}, rows, existing || {}];
  const recordCases = [
    // an ordinary filled sublot, and the same row with a lot-2 identity
    R({ sublot_bsg: [{ sublot: '1-1', specimen: '1', wt_air: 4631.2, wt_water: 2706.9, wt_ssd: 4632.9 }] }),
    R({ sublot_bsg: [{ sublot: '7-4', specimen: '2', wt_air: 1, wt_water: 2, wt_ssd: 3 }] }),
    // identities that must be REFUSED rather than composed into 'QC0'+n
    R({ sublot_bsg: [{ sublot: '1-0', specimen: '1', wt_air: 1, wt_water: 2, wt_ssd: 3 }] }),
    R({ sublot_bsg: [{ sublot: '10', specimen: '1', wt_air: 1, wt_water: 2, wt_ssd: 3 }] }),
    R({ sublot_bsg: [{ sublot: '', specimen: '1', wt_air: 1, wt_water: 2, wt_ssd: 3 }] }),
    R({ sublot_bsg: [{ sublot: '1.5', specimen: '1', wt_air: 1, wt_water: 2, wt_ssd: 3 }] }),
    // a seeded row with nothing measured in it makes NO record
    R({ sublot_bsg: [{ sublot: '1-1', specimen: '1' }], sublot_tickets: [{ sublot: '1-1' }] }),
    // the two spellings of a Department record's identity cell
    R({ verification: [{ record: 'QA01 — Department acceptance', sublot_verified: '3' }] }),
    R({ verify_bsg: [{ record: 'QA01', specimen: '1', wt_air: 1, wt_water: 2, wt_ssd: 3 }] }),
    R({ verify_bsg: [{ record: 'iq01', specimen: '2', wt_air: 1, wt_water: 2, wt_ssd: 3 }] }),
    // cores: two banks sharing one list, slots counted within their own bank
    R({ mat_cores: [{ sublot: '1-2', station: 'A', wt_air: 1, wt_water: 2, wt_ssd: 3 },
                    { sublot: '1-2', station: 'B', wt_air: 4, wt_water: 5, wt_ssd: 6 }],
        joint_cores: [{ sublot: '1-2', station: 'J', wt_air: 7, wt_water: 8, wt_ssd: 9 }] }),
    // the blend fans one row out to four sublots; the lot-level pct stays absent
    R({ blend: [{ producer: 'P', agp: 'AGP007401', type_size: 'Limestone #8s',
                  pct_1: 30, pct_2: 31, pct_3: 30, pct_4: 30 }] }),
    // the gradation lives in `values` under composed keys, not in a table
    R({}, { sub1_s37_5: 94.2, sub1_s0_075: 5.1, jmf_s37_5: 95, qa_s4_75: 55 }),
    // a lot already in the mapper's vocabulary comes back untouched
    R({ sublot_bsg: [{ sublot: '1-1', specimen: '1', wt_air: 9, wt_water: 9, wt_ssd: 9 }] }, {},
      { QC01: { values: { ac_pct: 5.91 }, rows: { specimens: [{ slot: 0, wt_air: 4631.2 }] } } }),
    R({}, {}, {}), R({}), [undefined, undefined, undefined],
  ];
  sweep('lotRecords()', P.lotRecords, MOD_MAPPER.lotRecords, recordCases);

  // amawCells() WHOLE, on lots built here rather than read off a workbook
  // (2026-09-26). The comparison below needs the uncommitted real AMAW lots,
  // so on every other machine the page's copy of the mapper body - the code a
  // reviewer's "AMAW for MEDL" download actually runs - was compared with
  // nothing: a page-only change to writeWhen()'s report passed 214/0. These
  // are check_bridge.mjs's shapes: an ISO ticket, the paper formats the mapper
  // refuses and reports, a record's own gradation and polish dates, and a lot
  // filled from the schema so every route runs. The same template stub as
  // there (every cell exists; these few are formulas, so write() and
  // writeOver() both run), and each copy gets its own deep copy of the lot so
  // a mutation in one cannot leak into the other's input.
  const TPL_FORMULAS = new Set([
    'Gradation!C10', 'Gradation!D10', 'Gradation!C23', 'Gradation!D23',
    "'Super Verify'!C33", "'Super Verify'!D33",
    'Cores!H10', 'Superpave!H12', 'Superpave!G12', 'Superpave!F12',
    'Calculations!O1', 'Calculations!O2',
  ]);
  const synthTpl = { has: () => true, formulaAt: (addr) => (TPL_FORMULAS.has(addr) ? '=…' : null) };
  const ticketLot = (over) => ({
    values: { lot_number: '1', lot_nominal_size: '0.38B' }, records: {},
    rows: { sublot_tickets: [1, 2, 3, 4].map((s) => ({
      sublot: `1-${s}`, date: '2026-09-24', time: '14:15', truck: `T${s}`, tons_cum: 1000 * s,
      ...(s === 1 ? over : {}),
    })) },
  });
  const schemaLot = () => {
    let n = 0;
    const val = (c) => (Array.isArray(c.options) && c.options.length
      ? (typeof c.options[0] === 'string' ? c.options[0] : c.options[0].value)
      : c.type === 'number' ? 1000 + (++n) : c.type === 'date' ? '2026-09-02'
        : c.type === 'time' ? '09:30' : `${c.key}-${++n}`);
    const values = { lot_number: '1', lot_nominal_size: '0.38B', lot_tons: 4000, lot_esal_class: 3,
      lot_density_option: 'A', lot_joint_density: '1', design: { jmf_ac: 5.9, target_va: 3.5, min_vma: 15 } };
    const rows = {};
    for (const s of MOD_SECTIONS.default) {
      for (const f of s.fields || []) if (!f.readonly && values[f.key] === undefined) values[f.key] = val(f);
      for (const t of (Array.isArray(s.rows) ? s.rows : s.rows ? [s.rows] : [])) {
        if (rows[t.key]) continue;
        const seed = Array.isArray(t.seed) && t.seed.length ? t.seed : [{}];
        rows[t.key] = seed.map((r) => {
          const o = { ...r };
          for (const c of t.columns || []) if (o[c.key] == null || o[c.key] === '') o[c.key] = val(c);
          return o;
        });
      }
    }
    return { values, rows, records: {} };
  };
  const SYNTH = [
    ['an ISO ticket', ticketLot({})],
    ["paper-format ticket values ('9/24/26', '2:15 PM')", ticketLot({ date: '9/24/26', time: '2:15 PM' })],
    ["paper-format ticket values ('09/24/2026', '1415')", ticketLot({ date: '09/24/2026', time: '1415' })],
    ["a two-digit year off the picker ('0026-09-24')", ticketLot({ date: '0026-09-24' })],
    ["a day the calendar lacks ('2026-02-30')", ticketLot({ date: '2026-02-30' })],
    ["a record's own dates, one of them refused", { values: { lot_number: '1', lot_nominal_size: '0.38B' }, rows: {},
      records: { QC01: { values: { date: 46289, time: 0.9125, gradation_date: 46290, polish_date: '9/25/26' }, rows: {} } } }],
    ['a lot filled from the schema', schemaLot()],
  ];
  let synthCells = 0, synthRefusals = 0;
  for (const [label, lot] of SYNTH) {
    const a = call(P.amawCells, [JSON.parse(JSON.stringify(lot)), synthTpl, {}]);
    const b = call(MOD_MAPPER.amawCells, [JSON.parse(JSON.stringify(lot)), synthTpl, {}]);
    if (!a.ok || !b.ok) { ok(`amawCells() runs on ${label}`, false, `page ${trunc(a.v)} / module ${trunc(b.v)}`); continue; }
    same(`amawCells().values on ${label} (${Object.keys(b.v.values).length} cells)`, a.v.values, b.v.values);
    same(`amawCells().evalOnly on ${label}`, a.v.evalOnly, b.v.evalOnly);
    same(`amawCells().report on ${label}`, a.v.report, b.v.report);
    synthCells += Object.keys(b.v.values).length;
    synthRefusals += ((b.v.report || {}).missing || []).filter((m) => /is not in a form the workbook can hold/.test(String(m))).length;
  }
  // A lot that maps to nothing compares equal on both copies, so say that
  // these wrote cells and exercised the refusal branch.
  ok(`…and the synthetic lots wrote cells (${synthCells}) and reported refused dates or times (${synthRefusals})`,
     synthCells > 300 && synthRefusals >= 5, { synthCells, synthRefusals });

  if (!AMAW_LOTS.length) {
    skip('amawCells() on a real completed lot',
         'no AMAW workbook passed — pass the two completed lots as arguments');
  } else {
    const reader = liftLotReader();
    for (const f of AMAW_LOTS) {
      const wb = reader.openWorkbook(f);
      const lot = reader.readLot(wb);
      // The template facts amawCells() needs. The LOT workbook is used as its
      // own template source, which is legitimate here and not a shortcut: this
      // file compares two copies of the mapper, so all that matters is that
      // both are handed the identical `tpl`. (check_mapper.mjs, which asks the
      // different question of whether the mapper is RIGHT, needs the real
      // blank AMAW and takes --template for it. That blank is a public KYTC
      // download and deliberately not committed, so there is no path here
      // worth pretending to.)
      const tpl = reader.templateFacts(wb);
      const ref = {}; // no Supabase: an empty ref also proves both copies
                      // degrade the same way when the lists are not loaded.
      const a = call(P.amawCells, [lot, tpl, ref]);
      const b = call(MOD_MAPPER.amawCells, [lot, tpl, ref]);
      const name = path.basename(f);
      if (!a.ok || !b.ok) { ok(`amawCells() runs on ${name}`, false, `page ${trunc(a.v)} / module ${trunc(b.v)}`); continue; }
      same(`amawCells().values on ${name} (${Object.keys(b.v.values).length} cells)`, a.v.values, b.v.values);
      same(`amawCells().evalOnly on ${name} (${Object.keys(b.v.evalOnly).length} cells)`, a.v.evalOnly, b.v.evalOnly);
      same(`amawCells().report on ${name}`, a.v.report, b.v.report);
      ok(`…and it produced something on ${name} (a lot that maps to nothing would compare equal)`,
         Object.keys(b.v.values).length > 100, Object.keys(b.v.values).length);
    }
  }

  // ---- generate.mjs: the pure half ----------------------------------
  // STAGING is renamed STAGING_SHEETS in the splice for the same collision
  // reason as UNCLASSIFIED: addresses.mjs exports a STAGING of its own, and
  // it is a different thing entirely (the t_smpl status column).
  same('STAGING_SHEETS is generate.mjs\'s STAGING', P.STAGING_SHEETS, MOD_GENERATE.STAGING);
  ok('…and addresses.mjs\'s STAGING is something else, so that rename matters too',
     stable(MOD_ADDRESSES.STAGING) !== stable(MOD_GENERATE.STAGING));
  same('DIRECT_READ is identical', P.DIRECT_READ, MOD_GENERATE.DIRECT_READ);
  same('REFERENCE_SHEETS is identical', P.REFERENCE_SHEETS, MOD_GENERATE.REFERENCE_SHEETS);
  sweep('FIRST_DATA_ROW()', P.FIRST_DATA_ROW, MOD_GENERATE.FIRST_DATA_ROW,
        [...MOD_GENERATE.STAGING, 'discipline', 'Superpave', '', null, undefined].map((n) => [n]));
  sweep('splitAddr()', P.splitAddr, MOD_GENERATE.splitAddr,
        [["'Pay Values'!B3"], ['Superpave!N3'], ["'Super Verify'!B5"], ['discipline!E2'],
         ["'.45 Data'!A1"], ['NoBang'], [''], [null], [undefined], ['A1'], ["'x'!AA100"]]);

  // generateAmaw() is the one thing here that cannot be exercised, and saying
  // so plainly is the point of this block. It reaches for `MP` (the MixPack
  // engine's zip/XML layer, a separate page block) and `fflate`, and it
  // fetches the blank template over HTTP. Lifting MP as well would make this
  // file a second copy of check_page_engine.mjs, and the template it wants is
  // a KYTC download that is deliberately not committed.
  ok('generateAmaw() is present on both copies', typeof P.generateAmaw === 'function' && typeof MOD_GENERATE.generateAmaw === 'function');
  ok('loadAmawTemplate()/amawTemplate() are present', typeof P.loadAmawTemplate === 'function' && typeof P.amawTemplate === 'function');
  note('generateAmaw() is NOT run here: it needs the page\'s MP block, fflate, and a fetch');
  note('of the blank AMAW. Its pure parts above are checked; the zip round-trip is not.');
  note('Nothing in this repo has yet loaded a browser-built AMAW into MEDL either (CLAUDE.md).');
  skip('generateAmaw() end to end', 'needs MP + fflate + the uncommitted blank AMAW template');
}

// =====================================================================
//  5. PB_LOT  vs  storage.mjs + intake.mjs
// =====================================================================
namespace('PB_LOT', '6. PB_LOT vs scripts/amaw/storage.mjs + intake.mjs');
{
  const P = PB.PB_LOT;
  const M = { ...MOD_STORAGE, ...MOD_INTAKE };

  // ---- the constants ------------------------------------------------
  for (const k of ['LOT_FORMAT', 'LOT_VERSION', 'BLOCKS', 'DEPARTMENT_BLOCKS', 'IDENTITY', 'BACKENDS',
                   'APPROVAL_FORMAT', 'APPROVAL_MAX_VERSION', 'DOC_KIND', 'SUBMITTED_ACTION',
                   'APPROVED_ACTION', 'VERIFICATION', 'VERIFY_FN', 'FAILURE', 'MIX_TYPE_CODES'])
    same(`${k} is identical`, P[k], M[k]);
  // storage.mjs and addresses.mjs both export BLOCKS — the same seven test
  // record ids, and they must not become two definitions.
  ok('PB_LOT.BLOCKS and PB_AMAW.BLOCKS are still the same seven ids',
     stable(P.BLOCKS) === stable(PB.PB_AMAW.BLOCKS), [P.BLOCKS, PB.PB_AMAW.BLOCKS]);

  // ---- the pure helpers ---------------------------------------------
  const designations = ['0.38A', '0.38B', '0.38D', '0.38', 'no.4 a', 'NO.4', 'NO.4B', '1.50',
                        '0.50 C', '  0.75b  ', '', null, undefined, 5, '0.38AB'];
  sweep('splitDesignation()', P.splitDesignation, M.splitDesignation, designations.map((d) => [d]));
  sweep('mixTypeFor()', P.mixTypeFor, M.mixTypeFor, designations.map((d) => [d]));
  // The three the intake DERIVES rather than asks for. All three return null
  // on anything they cannot answer, and that is the half worth sweeping: a
  // default here is a silently zero-paid lot in every case.
  const mixes = designations.map((d) => [{ nominal_size: d }])
    .concat([[{ nominal_size: '0.38A', layer: 'SURF' }], [{ nominal_size: '0.50A', layer: 'SURF' }],
             [{ nominal_size: 'NO.4A', layer: 'SURF' }], [{ nominal_size: '1.00A', layer: 'BASE' }],
             [{ layer: 'SURF' }], [{}], [null], [undefined]]);
  sweep('jointDensityFor()', P.jointDensityFor, M.jointDensityFor, mixes);
  sweep('densityOptionFor()', P.densityOptionFor, M.densityOptionFor, mixes);
  // The course (2026-09-22) decides the acceptance method for a Superpave
  // type, and a specialty TYPE decides it alone.
  const courseMixes = mixes.concat(
    ['mainline', 'leveling', 'scratch', 'wedge', 'base_repair', 'temporary', 'bogus', null]
      .flatMap((course) => ['0.38A', 'OGFC', 'SAND ASPHALT 1', 'WEDGE', 'NO.4B', ''].map((nominal_size) => [{ nominal_size, course }])));
  sweep('acceptanceMethodFor()', P.acceptanceMethodFor, M.acceptanceMethodFor, courseMixes);
  same('ACCEPTANCE_METHODS is identical', P.ACCEPTANCE_METHODS, M.ACCEPTANCE_METHODS);
  same('COURSES is identical', P.COURSES.map((c) => ({ ...c, match: String(c.match) })), M.COURSES.map((c) => ({ ...c, match: String(c.match) })));
  same('DEFAULT_COURSE is identical', P.DEFAULT_COURSE, M.DEFAULT_COURSE);
  sweep('courseFor()', P.courseFor, M.courseFor, ['mainline', 'LEVELING', ' scratch ', 'bogus', '', null, undefined].map((k) => [k]));
  sweep('specialtyCourseOf()', P.specialtyCourseOf, M.specialtyCourseOf,
        ['LEVELING & WEDGING PG64-22', 'LEVELING AND WEDGING PG76-22', 'ASPHALT SCRATCH COURSE (0.38-IN.) PG64-22',
         'ASPHALT WEDGE CURB', 'ASPH MIX FOR PAVEMENT WEDGE', 'MICROSURFACING-LEVELING COURSE', 'BASE FAILURE REPAIR',
         'ASPHALT MIXTURE FOR TEMPORARY APPLICATIONS', 'CL3 ASPH SURF 0.38A PG64-22', '', null, undefined].map((d) => [d]));
  sweep('esalClassFor()', P.esalClassFor, M.esalClassFor,
        mixes.flatMap(([mix]) => [null, '2', 3, 'CL4', 'CL9', ''].map((c) => [mix, c])));
  sweep('isDepartmentBlock()', P.isDepartmentBlock, M.isDepartmentBlock,
        [...MOD_STORAGE.BLOCKS, 'NOPE', '', null, undefined].map((b) => [b]));
  sweep('isVerified()', P.isVerified, M.isVerified,
        [[null], [undefined], [{}], [{ state: 'verified' }], [{ state: 'not-checked' }],
         [{ state: MOD_INTAKE.VERIFICATION.VERIFIED }], [{ state: MOD_INTAKE.VERIFICATION.INVALID }]]);
  sweep('notChecked()', P.notChecked, M.notChecked, [[], ['because'], [null], ['']]);

  const identities = [
    { contract_id: '252112', amp_number: 'AMP070302', mix_id: '00385', lot_number: 1 },
    { contract_id: '262120', amp_number: 'AMP070301', mix_id: '00260467', lot_number: 12 },
    { contract_id: '252112', amp_number: 'AMP070302', mix_id: '00385' },
    {}, null, undefined,
  ];
  sweep('lotKey()', P.lotKey, M.lotKey, identities.map((i) => [i]));
  sweep('blankLot()', P.blankLot, M.blankLot,
        identities.flatMap((i) => [[i], [i, { status: 'open', plant_name: 'Boonesboro' }]]));

  // blankLot() refuses an identity it cannot key, which is a branch worth
  // sweeping (above) but not a lot worth carrying into the sweeps below.
  const lots = [];
  for (const i of identities) { try { lots.push(M.blankLot(i)); } catch { /* refused, and the sweep above checked that */ } }
  lots.push(M.blankLot(identities[0], { records: { QC01: { values: { ac: 5.2 } } } }));
  const rawLots = [...lots, null, undefined, {}, { format: 'nope' }, JSON.parse(JSON.stringify(lots[0]))];
  sweep('normaliseLot()', P.normaliseLot, M.normaliseLot, rawLots.map((l) => [l]));
  sweep('lotSummary()', P.lotSummary, M.lotSummary, rawLots.map((l) => [l]));

  // mergeLots is the one storage function that decides what SURVIVES an
  // import, per record rather than per lot, so a drift here loses four
  // sublots to a file carrying only QA01. Swept over pairs, both directions.
  const mergeCases = [];
  for (const a of rawLots.slice(0, 6)) for (const b of rawLots.slice(0, 6)) mergeCases.push([a, b]);
  sweep('mergeLots()', P.mergeLots, M.mergeLots, mergeCases);

  // ---- verify-approval, request and answer --------------------------
  const approval = loadPayload('payload_approval.json');
  const review = loadPayload('payload_review.json');
  const submittal = loadPayload('payload_submittal.json');
  // The shape check_intake.mjs builds for itself when the PDFs are not on
  // disk. Reused verbatim so this file's fallback and that file's fallback
  // cannot describe two different "minimum payload"s.
  const SYNTH_BASE = {
    format: 'kytc-designbook', version: 1, doc_kind: 'review',
    job: { cid: '262120', letting: '2026-02-19', plant: 'AMP070301' },
    values: {}, rows: {},
  };
  const SYNTH_APPROVAL = {
    ...SYNTH_BASE, doc_kind: 'review', stage: 'Approved',
    mix: { nominal_size: '0.38A', binder_grade: 'PG64-22', mix_class: '3' },
    values: { nominal_size: '0.38A', mix_type: 'A', binder_grade: 'PG64-22', ac_design: 5.2, va_design: 4.0, vma_design: 14.2 },
    approval: { approval_no: '#467PA', code: 'AAAA-BBBB-CCCC', issued_at: '2026-09-11T00:00:00.000Z',
                approved_by: 'Andrew.Denmark@ky.gov', mix_id: '00260467' },
    history: [{ action: 'Approved by KYTC', by: 'Andrew.Denmark@ky.gov', at: '2026-09-11T00:00:00.000Z' }],
  };
  const payloads = [];
  if (approval) payloads.push(['payload_approval.json', approval]); else payloads.push(['synthetic approval', SYNTH_APPROVAL]);
  if (review) payloads.push(['payload_review.json', review]);
  if (submittal) payloads.push(['payload_submittal.json', submittal]);
  if (!approval || !review || !submittal) {
    const have = [approval && 'approval', review && 'review', submittal && 'submittal'].filter(Boolean);
    skip('the three REAL DesignBook payloads', `only ${have.length ? have.join('/') : 'none'} found under ${PAYLOAD_DIR} `
       + '— using the shape check_intake.mjs builds for itself; pass --payloads <dir> to use the real ones');
  }
  // The refusals. Every one of these is a shape a real file can take, and
  // they exercise branches no genuine approval ever reaches.
  const mutate = (p, f) => { const c = JSON.parse(JSON.stringify(p)); f(c); return c; };
  const basis = approval || review || SYNTH_APPROVAL;
  payloads.push(
    ['no approval block', mutate(basis, (c) => { delete c.approval; })],
    ['partial approval block', mutate(basis, (c) => { c.approval = { approval_no: '#467PA', code: 'AAAA-BBBB-CCCC' }; })],
    ['not a DesignBook payload', { format: 'something-else', version: 1, job: { cid: '1' } }],
    ['a newer DesignBook', mutate(basis, (c) => { c.version = 99; })],
    ['no contract', mutate(basis, (c) => { c.job = {}; })],
    ['doc_kind submittal', mutate(basis, (c) => { c.doc_kind = 'submittal'; })],
    ['null', null], ['a string', 'hello'], ['a number', 7], ['empty object', {}],
  );

  sweep(`approvalChecks() over ${payloads.length} payloads`, P.approvalChecks, M.approvalChecks, payloads.map(([, p]) => [p]));
  sweep(`effectiveMixOf() over ${payloads.length} payloads`, P.effectiveMixOf, M.effectiveMixOf, payloads.map(([, p]) => [p]));
  sweep(`submitterOf() over ${payloads.length} payloads`, P.submitterOf, M.submitterOf, payloads.map(([, p]) => [p]));
  sweep(`verifyRequest() over ${payloads.length} payloads`, P.verifyRequest, M.verifyRequest, payloads.map(([, p]) => [p]));

  // lotFromApproval, with the option surface swept as well — the defaulted
  // lot number is reported as something still to confirm rather than as a
  // fact, so which branch it took is part of the answer.
  const lfaCases = [];
  for (const [, p] of payloads)
    for (const opts of [undefined, {}, { lotNumber: 1 }, { lotNumber: 3 },
                        { verification: M.notChecked() },
                        { verification: { state: M.VERIFICATION.VERIFIED, checked_at: '2026-09-13T00:00:00.000Z' } }])
      lfaCases.push([p, opts]);
  const before = clockHits;
  sweep(`lotFromApproval() over ${lfaCases.length} payload/option pairs`, P.lotFromApproval, M.lotFromApproval, lfaCases);
  note(`${clockHits - before} wall-clock timestamps normalised across those pairs `
     + '(lotFromApproval stamps its history entry with new Date(); the two copies run ms apart)');

  // rollForwardLot - the lot-to-lot door. Swept over a lot that has been
  // POISONED in every non-frame cell, because the property that matters is a
  // negative one: the two copies must agree about what they REFUSE to carry,
  // not merely about what they carry. A frame-only case would pass even if
  // one copy leaked every measurement.
  const frameKeys = M.frameFields();
  const poisoned = (lotNo) => {
    const lot = M.blankLot({ contract_id: '262120', amp_number: 'AMP070301',
                             mix_id: '00260467', lot_number: lotNo }, {});
    lot.values = {};
    for (const k of MOD_SECTIONS.PLANTBOOK_SECTIONS.flatMap((sec) => [
      ...(sec.fields || []).map((f) => f.key),
      ...(sec.sieves || []).flatMap((sv) => (sec.columns || [{ key: null }])
        .map((c) => (c.key ? `${c.key}_${sv.key}` : sv.key))),
    ]).filter(Boolean)) lot.values[k] = frameKeys.has(k) ? `FRAME_${k}` : '__MEASURED__';
    lot.values.lot_number = lotNo;
    lot.values.design = { jmf_ac: 5.9, approval: { verification: { state: 'verified' } } };
    lot.rows = {};
    for (const sec of MOD_SECTIONS.PLANTBOOK_SECTIONS) {
      const rs = Array.isArray(sec.rows) ? sec.rows : sec.rows ? [sec.rows] : [];
      for (const r of rs) lot.rows[r.key] = [0, 1].map(() => {
        const row = {};
        for (const c of r.columns || []) row[c.key] = '__MEASURED__';
        if ((r.columns || []).some((c) => c.key === 'design_pct')) row.design_pct = 30;
        return row;
      });
    }
    lot.extracted_from = { lot_ps_lab: 'plants.ps_lab_id', lot_gse: 'x' };
    lot.status = 'Submitted';
    lot.history = [{ action: 'Submitted to KYTC' }];
    return lot;
  };
  const rfCases = [];
  for (const n of [1, 3, 7])
    for (const opts of [undefined, {}, { lotNumber: 12 }, { sm_id: 'jcampbell', name: 'J', now: '2026-09-16T00:00:00.000Z' }])
      rfCases.push([poisoned(n), opts]);
  for (const bad of [null, undefined, {}, { format: 'not-a-lot' }, { ...poisoned(1), lot_number: 0 }, { ...poisoned(1), lot_number: 'x' }])
    rfCases.push([bad, undefined]);
  sweep(`rollForwardLot() over ${rfCases.length} poisoned lots and refusals`,
        P.rollForwardLot, M.rollForwardLot, rfCases);
  sweep('frameFields() agrees on which scalars are frame',
        () => [...P.frameFields()].sort(), () => [...M.frameFields()].sort(), [[]]);
  sweep('ROLL_FORWARD_EXCEPTIONS matches', () => P.ROLL_FORWARD_EXCEPTIONS,
        () => M.ROLL_FORWARD_EXCEPTIONS, [[]]);

  const responses = [
    [{ status: 200, body: { valid: true, mix_id: '00260467', approval_no: '#467PA', pa: true, approved_by: 'a', submitted_by: 'b', issued_at: '2026-09-11T00:00:00.000Z' } }],
    [{ status: 200, body: { valid: false, error: 'the design changed after approval' } }],
    [{ status: 400, body: { error: 'incomplete approval' } }],
    [{ status: 405, body: { error: 'not a POST' } }],
    [{ status: 500, body: { error: 'APPROVAL_SIGNING_SECRET is not set' } }],
    [{ status: 503, body: {} }],
    [{ networkError: new Error('offline') }],
    [{ networkError: 'offline' }],
    [null], [undefined], [{}],
  ];
  sweep('readVerifyResponse()', P.readVerifyResponse, M.readVerifyResponse, responses);

  // ---- the two stores ------------------------------------------------
  // localLotStore takes its storage through opts, so the stub goes in the
  // front door rather than onto globalThis — which also means both copies get
  // their OWN store and cannot pass by reading each other's rows.
  const stubStorage = () => {
    const m = new Map();
    return {
      get length() { return m.size; },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(String(k), String(v)); },
      removeItem: (k) => { m.delete(String(k)); },
      clear: () => m.clear(),
      // Each value is PARSED before it is handed back, not compared as raw
      // bytes. A stored lot carries its own `saved_at`, and inside a JSON
      // string that stamp is invisible to the clock normaliser — so a byte
      // comparison here fails whenever the two copies happen to straddle a
      // millisecond, which is a flaky test rather than a drift detector.
      __dump: () => [...m.entries()].sort()
        .map(([k, v]) => { try { return [k, JSON.parse(v)]; } catch { return [k, v]; } }),
    };
  };
  const sa = stubStorage(), sb2 = stubStorage();
  const storeA = call(P.localLotStore, [{ storage: sa }]);
  const storeB = call(M.localLotStore, [{ storage: sb2 }]);
  if (!ok('localLotStore() builds on both copies', storeA.ok && storeB.ok, `page ${trunc(storeA.v)} / module ${trunc(storeB.v)}`)) {
    skip('the localLotStore round trip', 'the store did not build');
  } else {
    const A = storeA.v, B = storeB.v;
    same('localLotStore().name', A.name, B.name);
    same('localLotStore().available()', await A.available(), await B.available());
    const lot = M.blankLot(identities[0], { plant_name: 'Boonesboro' });
    lot.records.QC01 = { values: { ac: 5.25, av: 4.1, vma: 14.6 }, updated_at: '2026-09-13T00:00:00.000Z' };
    const savedA = await A.save(JSON.parse(JSON.stringify(lot)));
    const savedB = await B.save(JSON.parse(JSON.stringify(lot)));
    same('localLotStore().save()', savedA, savedB);
    same('localLotStore().list()', await A.list(), await B.list());
    same('localLotStore().load()', await A.load(M.lotKey(identities[0])), await B.load(M.lotKey(identities[0])));
    same('…and the two stubbed localStorages hold identical bytes', sa.__dump(), sb2.__dump());
    same('localLotStore().remove()', await A.remove(M.lotKey(identities[0])), await B.remove(M.lotKey(identities[0])));
    same('…and both are empty afterwards', sa.__dump(), sb2.__dump());
    same('localLotStore().list() after remove', await A.list(), await B.list());
  }

  // supabaseLotStore takes its client as an option, so a fake one proves it
  // BUILDS without reaching the network. Every method on the fake records and
  // throws, so any call made during construction shows up as a recorded call
  // rather than as a silent request from a checker.
  const calls = [];
  const fakeClient = {
    from: (t) => { calls.push(`from(${t})`); throw new Error('the fake Supabase client was actually called'); },
    rpc: (f) => { calls.push(`rpc(${f})`); throw new Error('the fake Supabase client was actually called'); },
  };
  const supA = call(P.supabaseLotStore, [{ client: fakeClient }]);
  const supB = call(M.supabaseLotStore, [{ client: fakeClient }]);
  ok('supabaseLotStore() builds on both copies with an injected client', supA.ok && supB.ok, `page ${trunc(supA.v)} / module ${trunc(supB.v)}`);
  ok('…and neither called out while building', calls.length === 0, calls);
  if (supA.ok && supB.ok) {
    same('supabaseLotStore().name', supA.v.name, supB.v.name);
    same('supabaseLotStore() exposes the same methods', Object.keys(supA.v).sort(), Object.keys(supB.v).sort());
  }
  sweep('supabaseLotStore() refuses a missing client the same way', P.supabaseLotStore, M.supabaseLotStore, [[{}], [undefined], [{ client: null }]]);
  sweep('createLotStore()', P.createLotStore, M.createLotStore,
        [[{ backend: 'local', storage: stubStorage() }], [{ backend: 'supabase', client: fakeClient }],
         [{ backend: 'nope' }], [{}], [undefined]].map((a) => a));
  // StorageError has to be the same shape in both copies, since the page's UI
  // branches on `.kind` to decide whether a failure is a conflict, a
  // permission answer or a backend that has not been set up.
  const ea = new P.StorageError('conflict', 'x'), eb = new M.StorageError('conflict', 'x');
  same('StorageError carries the same kind/message/name', { k: ea.kind, m: ea.message, n: ea.name }, { k: eb.kind, m: eb.message, n: eb.name });
  ok('StorageError is an Error in both copies — each against its own realm\'s Error',
     ea instanceof vm.runInContext('Error', CTX) && eb instanceof Error,
     [ea instanceof vm.runInContext('Error', CTX), eb instanceof Error]);
}

// =====================================================================
//  Helpers that need the workbooks
// =====================================================================

/** Everything lotPay() and payview's ctx want, read straight out of a real
 *  completed AMAW. Deliberately the same cells check_payview.mjs reads — the
 *  pay schedule's own inputs, not a derived view of them. */
function readPayInputs(file) {
  const part = (p) => {
    try { return execSync(`unzip -p ${JSON.stringify(file)} ${p}`, { maxBuffer: 1 << 28 }).toString('utf8'); }
    catch { return null; }
  };
  const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
  const rels = {};
  for (const m of part('xl/_rels/workbook.xml.rels').matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g))
    rels[m[1]] = m[2].replace(/^\/?xl\//, '');
  const sheetPath = {};
  for (const m of part('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g))
    sheetPath[unesc(m[1])] = 'xl/' + rels[m[2]];
  const shared = [...(part('xl/sharedStrings.xml') || '').matchAll(/<si>((?:(?!<\/si>)[\s\S])*)<\/si>/g)]
    .map((m) => unesc(m[1].replace(/<[^>]*>/g, '')));
  const cache = new Map();
  const cells = (name) => {
    if (cache.has(name)) return cache.get(name);
    const out = new Map();
    const xml = sheetPath[name] ? part(sheetPath[name]) : null;
    // Cell-bounded on purpose: a greedy <v>...</v> runs straight past </c> on
    // these sheets and invents values (docs/amaw-map.md).
    if (xml) for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>((?:(?!<\/c>)[\s\S])*)<\/c>)/g)) {
      const v = /<v>([^<]*)<\/v>/.exec(c[3] || '');
      if (v) out.set(c[1], /t="s"/.test(c[2] || '') ? shared[+v[1]] : unesc(v[1]));
    }
    cache.set(name, out);
    return out;
  };
  const num = (map, ref) => {
    const raw = map.get(ref);
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const PV = cells('Pay Values'), C = cells('Calculations'), CO = cells('Cores');
  const LANE = [[10, 11, 12, 13], [15, 16, 17, 18], [20, 21, 22, 23], [25, 26, 27, 28]];
  const JOINT = [[33, 34], [36, 37], [39, 40], [42, 43]];
  return {
    sublots: [13, 14, 15, 16].map((r) => ({
      jmfAC: num(PV, 'A' + r), ac: num(PV, 'B' + r),
      targetAV: num(PV, 'E' + r), av: num(PV, 'F' + r),
      minVMA: num(PV, 'H' + r), vma: num(PV, 'I' + r),
    })),
    laneCores: LANE.map((rows) => rows.map((r) => num(CO, 'I' + r)).filter((v) => v !== null)),
    jointCores: JOINT.map((rows) => rows.map((r) => num(CO, 'I' + r)).filter((v) => v !== null)),
    mixTypeCode: num(C, 'J1'), esalClass: num(C, 'D15'),
    jointDensityFlag: num(C, 'H11'), densityOption: num(C, 'H12'), acceptanceOption: num(C, 'H13'),
    lotNumber: num(PV, 'F3'), tonnage: num(PV, 'F4'), unitPrice: num(PV, 'F5'),
    wedgeTons: num(PV, 'J20') ?? 0,
  };
}

/** check_mapper.mjs's reader — a real AMAW -> a PlantBook lot payload — lifted
 *  out by source rather than copied.
 *
 *  That file is a CLI whose top level runs its own checks on import, so it
 *  cannot be imported for its reader; and copying the reader would put a
 *  second definition of "what a lot IS" in the repo, which is precisely the
 *  drift this whole file exists to catch. So it is sliced between its usage
 *  guard and its `main()` and evaluated with its imports passed in — the same
 *  trick check_page_engine.mjs plays on designbook.html, pointed at a sibling
 *  checker. If check_mapper.mjs is ever restructured this throws with a clear
 *  message rather than reading half a file. */
function liftLotReader() {
  const file = path.join(HERE, 'check_mapper.mjs');
  const src = fs.readFileSync(file, 'utf8');
  const guard = src.indexOf('process.exit(2);');
  const main = src.indexOf('function main()');
  if (guard < 0 || main < 0 || main < guard)
    throw new Error('check_mapper.mjs no longer has a usage guard followed by main(); '
                  + 'its reader cannot be lifted. Fix the slice in check_page_plantbook.mjs.');
  const body = src.slice(src.indexOf('}', guard) + 1, main);
  const names = ['execSync', 'cellsOf', 'sharedStrings', 'CALC', 'CORES', 'GRADATION', 'KYCT',
                 'LOT', 'SUBLOT', 'SUBLOT_OF', 'addressOf', 'amawCells', 'INPUTS', 'FLAGS',
                 'UNCLASSIFIED', 'A', 'colShift'];
  const make = new Function(...names, `${body}\n return { openWorkbook, readLot, split, cellValue };`);
  const R = make(execSync, cellsOf, sharedStrings,
    MOD_ADDRESSES.CALC, MOD_ADDRESSES.CORES, MOD_ADDRESSES.GRADATION, MOD_ADDRESSES.KYCT,
    MOD_ADDRESSES.LOT, MOD_ADDRESSES.SUBLOT, MOD_ADDRESSES.SUBLOT_OF, MOD_ADDRESSES.addressOf,
    MOD_MAPPER.amawCells, MOD_MAPPER.INPUTS, MOD_MAPPER.FLAGS, MOD_MAPPER.UNCLASSIFIED,
    MOD_MAPPER.A, MOD_MAPPER.colShift);
  if (typeof R.openWorkbook !== 'function' || typeof R.readLot !== 'function')
    throw new Error('check_mapper.mjs\'s openWorkbook/readLot were not where this expected them');
  // The two things amawCells() asks of a template: what formula sits at an
  // address, and KYTC's own plant list. Read out of whichever workbook is in
  // hand, because both copies of the mapper get the identical object.
  R.templateFacts = (wb) => {
    const formulaAt = (addr) => {
      const s = R.split(addr); if (!s) return null;
      const c = wb.sheet(s.sheet).get(s.cell);
      return (c && c.formula) || (c && c.f) || null;
    };
    const plants = [];
    for (let r = 2; r <= 200; r++) {
      const key = R.cellValue(wb.sheet('Producer supplier').get(`B${r}`));
      if (key != null) plants.push({ key: String(key), name: R.cellValue(wb.sheet('Producer supplier').get(`C${r}`)), row: r });
    }
    return { formulaAt, plants };
  };
  return R;
}

function loadPayload(name) {
  try { return JSON.parse(fs.readFileSync(path.join(PAYLOAD_DIR, name), 'utf8')); }
  catch { return null; }
}

/** Where two rendered strings first part company, as a readable excerpt. A
 *  byte index alone is useless on a 40 KB table. */
function firstDiff(a, b) {
  a = String(a); b = String(b);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return 'identical';
  const at = Math.max(0, i - 60);
  const lead = at ? '…' : '';
  return `first differ at ${i} of ${a.length}/${b.length}\n          page   ${lead}${a.slice(at, i + 60)}\n          module ${lead}${b.slice(at, i + 60)}`;
}

// =====================================================================
//  Summary
// =====================================================================
console.log(`\n${'='.repeat(74)}`);
console.log('PlantBook: public/designbook.html vs scripts/amaw/');
console.log('='.repeat(74));

const PAIRING = {
  lift: 'lifting the five blocks',
  PB_SECTIONS: 'PB_SECTIONS  <- sections.mjs',
  PB_VOL: 'PB_VOL       <- volumetrics.mjs',
  PB_PAY: 'PB_PAY       <- pay.mjs + payview.mjs',
  PB_AMAW: 'PB_AMAW      <- addresses.mjs + mapper.mjs + generate.mjs',
  PB_LOT: 'PB_LOT       <- storage.mjs + intake.mjs',
};
let pass = 0, fail = 0, skipped = 0;
for (const [key, label] of Object.entries(PAIRING)) {
  const s = SCORE[key] || { pass: 0, fail: 0, skip: 0 };
  pass += s.pass; fail += s.fail; skipped += s.skip;
  const verdict = s.fail ? `${s.fail} DRIFTED` : s.pass ? 'in step' : 'NOTHING CHECKED';
  console.log(`  ${label.padEnd(48)} ${String(s.pass).padStart(4)} pass  ${String(s.fail).padStart(2)} fail  ${String(s.skip).padStart(2)} skip   ${verdict}`);
}
console.log(`  ${''.padEnd(48)} ${String(pass).padStart(4)} pass  ${String(fail).padStart(2)} fail  ${String(skipped).padStart(2)} skip`);

console.log('\nfixtures');
console.log(`  AMAW lots            : ${AMAW_LOTS.length ? AMAW_LOTS.map((f) => path.basename(f)).join(', ') : 'NONE — the pay and mapper real-lot checks were skipped'}`);
for (const [f, why] of OTHER_XLSM) console.log(`  not used             : ${path.basename(f)} (${why})`);
console.log(`  approval payloads    : ${['payload_approval.json', 'payload_review.json', 'payload_submittal.json'].filter((n) => loadPayload(n)).join(', ') || `NONE under ${PAYLOAD_DIR} — synthetic shapes used`}`);
console.log(`  clock normalisations : ${clockHits}  (ISO instants replaced before comparison; everything else compared byte for byte)`);

// A namespace that scored zero passes is a namespace this run did not test,
// whatever the fail count says. It is the failure mode named at the top of
// this file and it exits non-zero like any other.
const empty = Object.entries(PAIRING).filter(([k]) => !(SCORE[k] || {}).pass);
if (empty.length) console.log(`\n  NOTHING WAS CHECKED for: ${empty.map(([, l]) => l.split(' ')[0]).join(', ')}`);

if (fail || empty.length) {
  console.log('\nThe page and the modules have drifted. The page is what ships and the');
  console.log('module is what the other checkers prove, so neither one is automatically');
  console.log('right: find out which side moved before copying either over the other.');
}
process.exit(fail || empty.length ? 1 : 0);
