#!/usr/bin/env node
// Regenerate a MixPack from an existing one's inputs, using KYTC's blank
// template as the base, and report how the staging sheets compare.
//
//   node scripts/mixpack/regenerate.mjs <completed.xlsm> [out.xlsm]
//
// This is the end-to-end proof of the generator: it reads only the 330 input
// cells the nine staging sheets depend on, writes them into a fresh copy of
// KYTC's template, evaluates every staging formula, repacks, and then diffs the
// staging sheets it produced against the ones in the source workbook.
//
// Expect three differences on a real file (cells where the source itself holds
// #VALUE! - see docs/sitemanager-handoff.md) plus the remarks id, which embeds
// TEXT(NOW(),...) and is supposed to be stamped fresh.
//
// Real MixPacks are gitignored, so this takes a path rather than a fixture.
import fs from 'fs';
import path from 'path';
import { cellsOf, sheetXml, sharedStrings, STAGING, SOURCE, rowNum, FIRST_DATA_ROW } from './xlsx.mjs';
import { fillWorkbook, packWorkbook } from './write.mjs';
import { evaluate } from './formula.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TEMPLATE = path.join(HERE, '../../public/MIXPACK2026_VER12_01.xlsm');
const argv = process.argv.slice(2);
const overrides = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--set') continue;
  const eq = argv[i + 1].indexOf('=');
  overrides[argv[i + 1].slice(0, eq)] = argv[i + 1].slice(eq + 1);
  argv.splice(i, 2); i--;
}
const SRC = argv[0], OUT = argv[1];
if (!SRC) {
  console.error('usage: regenerate.mjs <completed.xlsm> [out.xlsm] [--set "Design Data!H10=00269999" ...]');
  process.exit(2);
}

const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const SST = sharedStrings(SRC);
const cache = {};
const cellsFor = name => (cache[name] ||= cellsOf(sheetXml(SRC, SOURCE[name] ?? STAGING[name]), SST));

// A visible cell can be a formula Excel never recalculated before the file was
// saved, so it has an <f> and no <v>. Design Data!Q14 (the plant's producer /
// supplier code, which MEDL validates) is exactly this: it reads Chart Data!AO2,
// which *is* cached. Take the cached value when there is one, otherwise evaluate.
const resolving = new Set();
const memo = new Map();
const valueOf = (sheet, ref) => {
  const k = `${sheet}!${ref}`;
  if (memo.has(k)) return memo.get(k);
  const c = cellsFor(sheet).get(ref);
  let out = '';
  if (c) {
    if (c.v != null) {
      out = (c.t === 's' || c.t === 'str' || c.t === 'inlineStr') ? c.v : (NUMRE.test(c.v) ? +c.v : c.v);
    } else if (c.f && !resolving.has(k)) {
      resolving.add(k);
      try { out = evaluate(c.f, (sh, cell) => valueOf(sh || sheet, cell)); }
      catch { out = ''; }                       // outside our grammar: treat as blank
      finally { resolving.delete(k); }
    }
  }
  if (typeof out === 'string') out = out.trim(); // AO2 is "AMP070301      "
  memo.set(k, out);
  return out;
};

// The input surface: every cell outside the staging sheets that a staging
// formula reads. Derived from the template, not hand-listed.
const inputs = new Set();
for (const [stage, n] of Object.entries(STAGING))
  for (const [ref, c] of cellsOf(sheetXml(TEMPLATE, n), null)) {
    if (rowNum(ref) < FIRST_DATA_ROW(stage) || !c.f) continue;
    for (const m of c.f.matchAll(/(?:'([^']+)'|\b([A-Za-z_][A-Za-z0-9_]*))!\$?([A-Z]{1,3})\$?(\d+)/g)) {
      const sheet = m[1] || m[2];
      if (!(sheet in STAGING)) inputs.add(`${sheet}!${m[3]}${m[4]}`);
    }
  }

const values = {};
for (const k of inputs) { const [s, r] = k.split('!'); values[k] = valueOf(s, r); }
// --set replaces an input after it is read, so overriding one cell carries
// through everything derived from it. Design Data!C10 and !H10 between them
// drive the sample id, the mix id, the discipline filename and the remarks id.
for (const [k, v] of Object.entries(overrides)) {
  values[k] = v;
  console.log(`override: ${k} = ${JSON.stringify(v)}` + (inputs.has(k) ? '' : '  (not itself a staging input)'));
}

const { parts, report } = fillWorkbook({ template: TEMPLATE, values });
console.log(`input cells read      : ${inputs.size}`);
console.log(`staging cells written : ${report.written} (${report.passes} passes)`);
if (report.failed.length) {
  console.log(`could not evaluate    : ${report.failed.length}`);
  for (const [w, f, e] of report.failed.slice(0, 10)) console.log(`   ${w}  ${String(f).slice(0,70)}  ${e}`);
}

let ok = 0; const diffs = [];
for (const [name, n] of Object.entries(STAGING)) {
  const gen = cellsOf(parts.get(`xl/worksheets/sheet${n}.xml`), null);
  for (const [ref, rc] of cellsFor(name)) {
    if (rowNum(ref) < FIRST_DATA_ROW(name) || !rc.f || rc.v == null) continue;
    const want = (rc.t === 's' || rc.t === 'str') ? rc.v : (NUMRE.test(rc.v) ? +rc.v : rc.v);
    const g = gen.get(ref);
    const got = !g ? '' : g.t === 'inlineStr' ? g.v : g.v == null ? '' : (NUMRE.test(g.v) ? +g.v : g.v);
    const same = (typeof got === 'number' && typeof want === 'number')
      ? Math.abs(got - want) < 1e-9 : String(got).trim() === String(want).trim();
    if (same) ok++; else diffs.push([`${name}!${ref}`, rc.f, got, want]);
  }
}
// A difference is expected when the source cell holds an Excel error, or when
// the value is stamped at generation time - directly via TEXT(NOW(),...), or
// transitively, as t_smpl.rmrks_id does by reading t_rmks_dtl's stamped id.
// An override is meant to change the output, so match on the value produced,
// not the formula text: identity propagates down whole columns by chained
// references (t_tst_rslt_dtl!B9 is just "=B8"), which never name the cell set.
const overrideValues = Object.values(overrides).filter(v => String(v).length >= 4);
const expected = d => String(d[3]).startsWith('#') || /NOW\(/.test(d[1])
                   || String(d[2]).includes(report.stamp)
                   || overrideValues.some(v => String(d[2]).includes(v));
const unexplained = diffs.filter(d => !expected(d));
console.log(`\nstaging cells matching source : ${ok}`);
console.log(`expected differences          : ${diffs.length - unexplained.length}  (#VALUE! in source, or NOW() stamp)`);
console.log(`unexplained differences       : ${unexplained.length}`);
for (const [w, f, got, want] of unexplained.slice(0, 20))
  console.log(`${w}\n   f=${String(f).slice(0,100)}\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

if (OUT) {
  packWorkbook({ template: TEMPLATE, parts, out: OUT, tmp: fs.mkdtempSync('/tmp/mixpack-') });
}
process.exit(report.failed.length || unexplained.length ? 1 : 0);
