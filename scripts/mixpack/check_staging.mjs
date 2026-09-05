#!/usr/bin/env node
// Ground truth for the MixPack generator's formula evaluator.
//
// The nine veryHidden t_* sheets in a MixPack are the SiteManager payload, and
// every cell on them is a formula reading back into Design Data and the other
// visible tabs (see docs/sitemanager-handoff.md). To generate a MixPack from a
// browser we have to evaluate those formulas ourselves, because no xlsx writer
// recalculates.
//
// This checks that we evaluate them the way Excel does: point it at a real,
// completed MixPack, and it re-derives every staging cell from that same
// workbook's inputs and compares against the value Excel cached there.
//
//   node scripts/mixpack/check_staging.mjs path/to/SomeApproved.xlsm
//
// Real MixPacks are gitignored - they carry technician SM IDs and contractor
// data - so this takes a path rather than shipping a fixture.
import { cellsOf, sheetXml, sharedStrings, STAGING, SOURCE } from './xlsx.mjs';
import { evaluate } from './formula.mjs';

const XLSM = process.argv[2];
if (!XLSM) {
  console.error('usage: check_staging.mjs <completed-mixpack.xlsm>');
  process.exit(2);
}

const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const SST = sharedStrings(XLSM);
const cache = new Map();
const load = name => {
  if (cache.has(name)) return cache.get(name);
  const n = SOURCE[name] ?? STAGING[name];
  const cs = n === undefined ? new Map() : cellsOf(sheetXml(XLSM, n), SST);
  cache.set(name, cs);
  return cs;
};
const valueOf = (sheet, cell) => {
  const c = load(sheet).get(cell);
  if (!c || c.v == null) return '';
  return (c.t === 's' || c.t === 'str' || c.t === 'inlineStr') ? c.v
       : (NUMRE.test(c.v) ? +c.v : c.v);
};

let ok = 0, differs = 0, threw = 0, skipped = 0;
const notes = [];
for (const [name, n] of Object.entries(STAGING)) {
  for (const [ref, c] of cellsOf(sheetXml(XLSM, n), SST)) {
    if (+/(\d+)$/.exec(ref)[1] < 8 || !c.f) continue;
    if (/NOW\(/.test(c.f)) { skipped++; continue; }   // stamped at generation time
    if (c.v == null) { skipped++; continue; }         // nothing cached to compare
    let got;
    try { got = evaluate(c.f, (sh, cell) => valueOf(sh || name, cell)); }
    catch (e) { threw++; notes.push([name, ref, c.f, 'THREW: ' + e.message, c.v]); continue; }
    const want = (c.t === 's' || c.t === 'str') ? c.v : (NUMRE.test(c.v) ? +c.v : c.v);
    const same = (typeof got === 'number' && typeof want === 'number')
      ? Math.abs(got - want) < 1e-9
      : String(got).trim() === String(want).trim();
    if (same) ok++;
    else { differs++; if (notes.length < 40) notes.push([name, ref, c.f, got, want]); }
  }
}

console.log(`matched Excel's cached value : ${ok}`);
console.log(`differs                      : ${differs}`);
console.log(`evaluator threw              : ${threw}`);
console.log(`skipped (NOW / not cached)   : ${skipped}`);

// A cell where the source workbook itself holds an Excel error is a difference
// we want: KYTC's own template rounds a "N / A" against a formula testing
// "N /A" and banks the #VALUE!. We emit 0, per the discipline's "if not used,
// initialize to 0" rule. Those are the only differences we tolerate.
const real = notes.filter(([, , , got, want]) => !(got === 0 && String(want).startsWith('#')));
if (real.length) {
  console.log('\n--- unexplained differences ---');
  for (const [s, r, f, got, want] of real.slice(0, 20))
    console.log(`${s}!${r}\n   f=${String(f).slice(0, 100)}\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}
const tolerated = notes.length - real.length;
if (tolerated) console.log(`\n${tolerated} difference(s) are Excel errors in the source workbook, replaced with 0.`);
process.exit(threw || real.length ? 1 : 0);
