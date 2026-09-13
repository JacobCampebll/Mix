#!/usr/bin/env node
// Ground truth for the staging-formula evaluator on KYTC's AMAW workbook.
//
//   node scripts/amaw/check_evaluator.mjs path/to/CompletedLot.xlsm
//
// AMAW is the same MEDL loader architecture as the MixPack - byte-identical
// xmlMaps.xml, the same t_* staging tables bound to it - so the engine in
// scripts/mixpack/ is meant to carry over whole (docs/amaw-map.md). What is
// different is the formula vocabulary: AMAW's staging sheets use CHAR, COUNT,
// INDIRECT and VLOOKUP, none of which a MixPack does, plus the arithmetic and
// concatenation operators the MixPack never needed.
//
// This is check_staging.mjs / check_page_engine.mjs pointed at an AMAW: it
// re-derives every staging cell from that same workbook's own inputs and
// compares against the value Excel cached there, reporting matching /
// expected-difference / unexplained exactly as those do.
//
// Two things are deliberately not shared with scripts/mixpack/xlsx.mjs:
//
//   * SHEETS ARE RESOLVED BY NAME, through the workbook's own manifest. AMAW
//     carries a chartsheet AND a Dialog1 dialogsheet, so any fixed sheet-number
//     table (or SheetJS's SheetNames) misfiles everything after them -
//     wb.Sheets["t_smpl"] is really t_cont_smpl. This is the amawlib open()
//     helper's approach, over unzip(1) so the repo keeps no dependency.
//   * THE STAGING LIST IS AMAW'S. It is a strict subset of the MixPack's: no
//     t_superpave, no t_bit_conc_mixblnd, no Chart Data.
//
// Real AMAWs carry technician SM IDs and contractor data, so this takes a path
// rather than shipping a fixture.
import { execSync } from 'child_process';
import { cellsOf, rowNum } from '../mixpack/xlsx.mjs';
import { evaluate } from '../mixpack/formula.mjs';

const XLSM = process.argv[2];
if (!XLSM) { console.error('usage: check_evaluator.mjs <completed-amaw.xlsm>'); process.exit(2); }

const Q = s => JSON.stringify(s);
const unzip = p => execSync(`unzip -p ${Q(XLSM)} ${Q(p)}`, { maxBuffer: 1 << 28 }).toString();
const dec = s => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
                  .replace(/&apos;/g,"'").replace(/&amp;/g,'&');

// sheet name -> part path, through workbook.xml and its rels.
const rels = {};
for (const m of unzip('xl/_rels/workbook.xml.rels').matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g))
  rels[m[1]] = 'xl/' + m[2].replace(/^\/?xl\//, '');
const PART = {};
for (const m of unzip('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g))
  PART[dec(m[1])] = rels[m[2]];

const SST = (() => {
  let xml; try { xml = unzip('xl/sharedStrings.xml'); } catch { return []; }
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => dec(x[1])).join(''));
})();

// AMAW's staging block. discipline keeps its data on row 2; the t_* sheets carry
// the same seven-row header the MixPack's do.
const STAGING = ['discipline', 't_smpl', 't_cont_smpl', 't_rmks_dtl', 't_smpl_tst',
                 't_smpl_tstr', 't_tst_rslt_hdr', 't_tst_rslt_dtl'];
const FIRST_DATA_ROW = name => name === 'discipline' ? 2 : 8;

const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const cache = new Map();
// Two <v> shapes scripts/mixpack/xlsx.mjs's reader does not see, normalised here
// rather than there. Both are all over an AMAW and BOTH ARE ALSO IN A REAL
// MIXPACK (467PA: one on Design Data, 36 on TSR, plus 43 empty <v/> on
// t_tst_rslt_dtl), so this is a genuine gap in the shared reader - fixing it
// there is a separate change, because it makes ~57 more MixPack staging cells
// comparable and one of them then needs the page's engine ported too. See the
// note at the foot of this file.
//   <v xml:space="preserve"> ... </v>  a value with significant whitespace
//   <v/>                               Excel's cached EMPTY STRING, which is
//                                      not the same as a cell never computed
const normalise = xml => xml.replace(/<v\s[^>]*>/g, '<v>').replace(/<v\/>/g, '<v></v>');
const load = name => {
  if (!cache.has(name))
    cache.set(name, PART[name] && /worksheets/.test(PART[name]) ? cellsOf(normalise(unzip(PART[name])), SST) : new Map());
  return cache.get(name);
};
const typed = c => (c.t === 's' || c.t === 'str' || c.t === 'inlineStr' || c.t === 'e') ? c.v
                 : (NUMRE.test(c.v) ? +c.v : c.v);
// null is a BLANK cell (nothing cached), '' is a cached empty string. The
// evaluator keeps them apart: `=A1` is 0 for the first and "" for the second.
const valueOf = (sheet, cell) => {
  const c = load(sheet).get(cell);
  return !c || c.v == null ? null : typed(c);
};

// What Excel cached for a staging cell. A formula that produced an empty string
// is written t="str" with an empty <v/>, which reads back as no value at all -
// that is a cached "", not an uncomputed cell, and skipping it would drop most
// of t_rmks_dtl from the comparison.
const cached = c => c.v != null ? typed(c) : undefined;

let ok = 0, skipped = 0;
const diffs = [], threw = [];
for (const name of STAGING) {
  for (const [ref, c] of load(name)) {
    if (rowNum(ref) < FIRST_DATA_ROW(name) || !c.f) continue;
    if (/NOW\(/.test(c.f)) { skipped++; continue; }        // stamped at generation time
    const want = cached(c);
    if (want === undefined) { skipped++; continue; }        // nothing cached to compare
    let got;
    try { got = evaluate(c.f, (sh, cell) => valueOf(sh || name, cell)); }
    catch (e) { threw.push([`${name}!${ref}`, c.f, e.message, c.v]); continue; }
    const same = (typeof got === 'number' && typeof want === 'number')
      ? Math.abs(got - want) < 1e-9
      : String(got).trim() === String(want).trim();
    if (same) ok++; else diffs.push([`${name}!${ref}`, c.f, got, want]);
  }
}

// The only tolerated outcomes. A cell the source workbook itself holds an Excel
// error in is not a value we can or should reproduce: we decline to evaluate it
// and leave the formula for Excel, which is what evalOnly means. VLOOKUP is the
// same decision made deliberately - see the note at the foot of this file.
const EXPECTED = {
  'source holds an Excel error (#VALUE! etc.)': d => String(d[3]).startsWith('#') || d[3] === '' && String(d[2] ?? '').startsWith('#'),
  'VLOOKUP - left to Excel on purpose': d => /VLOOKUP\(/.test(d[1]),
};
const classify = (list) => {
  const by = {}; const rest = [];
  for (const d of list) {
    const hit = Object.entries(EXPECTED).find(([, f]) => f(d));
    if (hit) (by[hit[0]] ||= []).push(d); else rest.push(d);
  }
  return [by, rest];
};
// A cell that threw is only expected if the source holds an error there too.
const [threwBy, threwRest] = classify(threw.map(t => [t[0], t[1], t[2], t[3] ?? '']));
const [diffBy, diffRest] = classify(diffs);
const expected = Object.values(threwBy).concat(Object.values(diffBy)).reduce((n, a) => n + a.length, 0);
const unexplained = [...threwRest.map(d => [...d, 'THREW']), ...diffRest];

console.log(`workbook                      : ${XLSM}`);
console.log(`staging sheets                : ${STAGING.length}`);
console.log(`\nstaging cells matching source : ${ok}`);
console.log(`expected differences          : ${expected}`);
for (const [why, list] of [...Object.entries(threwBy), ...Object.entries(diffBy)])
  console.log(`    ${String(list.length).padStart(4)}  ${why}`);
console.log(`unexplained differences       : ${unexplained.length}`);
console.log(`skipped (NOW / not cached)    : ${skipped}`);
for (const [w, f, got, want] of unexplained.slice(0, 20))
  console.log(`${w}\n   f=${String(f).slice(0, 110)}\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ---- INDIRECT, resolved rather than declined ------------------------------
// Both real lots leave 'Super Verify'!B5 / B12 empty (no sublot is being
// verified), so Excel's own answer in all 28 INDIRECT cells is #VALUE! and the
// check above can only prove we decline them. That proves nothing about the
// resolution, so drive the control cell through every sublot it can name and
// check that each INDIRECT lands on the cell its shape predicts, carrying that
// cell's value out of this same workbook.
const CONTROL = { 'Super Verify!B5': null, 'Super Verify!B12': null };
const target = (f, n) => {                    // what the two shapes should resolve to
  let m = /^INDIRECT\("([A-Z]{1,3})"&'?([^'!]+)'?!\$?[A-Z]+\$?\d+\+(\d+)\)$/.exec(f);
  if (m) return [null, m[1] + (n + +m[3])];
  m = /^INDIRECT\("'([^']+)'!"&CHAR\((\d+)\+'?[^'!]+'?!\$?[A-Z]+\$?\d+\)&"(\d+)"\)$/.exec(f);
  if (m) return [m[1], String.fromCharCode(+m[2] + n) + m[3]];
  m = /^INDIRECT\("'([^']+)'!([A-Z]{1,3})"&'?[^'!]+'?!\$?[A-Z]+\$?\d+\+(\d+)\)$/.exec(f);
  if (m) return [m[1], m[2] + (n + +m[3])];
  return null;
};
let probed = 0, probeBad = 0, shapes = 0;
for (const name of STAGING) for (const [ref, c] of load(name)) {
  if (!c.f || !/INDIRECT\(/.test(c.f)) continue;
  shapes++;
  const control = /'Super Verify'!(B\d+)/.exec(c.f);
  const t0 = target(c.f, 0);
  if (!control || !t0) { probeBad++; console.log(`INDIRECT shape not covered by the probe: ${name}!${ref}  ${c.f}`); continue; }
  for (let n = 1; n <= 4; n++) {
    CONTROL[`Super Verify!${control[1]}`] = n;
    const [sh, cell] = target(c.f, n);
    const want = valueOf(sh ?? name, cell);
    let got;
    try { got = evaluate(c.f, (s, r) => CONTROL[`${s || name}!${r}`] ?? valueOf(s || name, r)); }
    catch (e) { probeBad++; console.log(`INDIRECT ${name}!${ref} n=${n} THREW ${e.message}`); continue; }
    const same = String(got === 0 && want === '' ? '' : got).trim() === String(want).trim();
    if (same) probed++;
    else { probeBad++; console.log(`INDIRECT ${name}!${ref} n=${n} -> ${sh ?? name}!${cell}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  }
  CONTROL['Super Verify!B5'] = CONTROL['Super Verify!B12'] = null;
}
console.log(`\nINDIRECT cells                : ${shapes}`);
console.log(`resolutions checked           : ${probed} correct, ${probeBad} wrong`);

process.exit(unexplained.length || probeBad ? 1 : 0);
