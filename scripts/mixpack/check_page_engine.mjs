#!/usr/bin/env node
// Does the MixPack engine INSIDE public/designbook.html still agree with the
// Node generator? Run against a real, completed MixPack.
//
//   node scripts/mixpack/check_page_engine.mjs path/to/SomeApproved.xlsm [out.xlsm]
//
// designbook.html carries a browser port of xlsx.mjs / formula.mjs / write.mjs
// (the block fenced `===== MIXPACK ENGINE =====`). Two copies of one thing
// drift unless a test says so, and that is what this is: it lifts the block
// straight out of the page, feeds it the same input surface regenerate.mjs
// derives from the source workbook, and diffs every staging cell against the
// value Excel cached in that workbook. Expect the same three-to-five expected
// differences regenerate.mjs reports (#VALUE! in the source, the NOW() stamp)
// and zero unexplained ones.
//
// No dependencies: the page's engine wants `fflate` for the zip layer, and
// this supplies a shim over unzip(1) for reading, then packs through
// write.mjs's zip(1) path. If `fflate` happens to be installed it is used
// instead, which also exercises the page's pack(). Real MixPacks are
// gitignored, so this takes a path rather than a fixture.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { cellsOf, sheetXml, sharedStrings, STAGING, SOURCE, DIRECT_READ, rowNum, FIRST_DATA_ROW } from './xlsx.mjs';
import { evaluate } from './formula.mjs';
import { packWorkbook } from './write.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '../../public/MIXPACK2026_VER12_01.xlsm');
const PAGE = path.join(HERE, '../../public/designbook.html');
const [SRC, OUT] = process.argv.slice(2);
if (!SRC) { console.error('usage: check_page_engine.mjs <completed.xlsm> [out.xlsm]'); process.exit(2); }

// ---- fflate: the real one if present, otherwise just enough of it ----
let fflate = null, realFflate = false;
try { fflate = await import('fflate'); realFflate = true; }
catch {
  const list = execSync(`unzip -Z1 ${JSON.stringify(TEMPLATE)}`).toString().trim().split('\n');
  fflate = {
    strFromU8: (u8) => Buffer.from(u8).toString('utf8'),
    strToU8: (s) => new Uint8Array(Buffer.from(s, 'utf8')),
    unzipSync: () => {
      const files = {};
      for (const p of list) {
        if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(p)) continue;
        files[p] = new Uint8Array(execSync(`unzip -p ${JSON.stringify(TEMPLATE)} ${JSON.stringify(p)}`, { maxBuffer: 1 << 28 }));
      }
      return files;
    },
    zipSync: () => { throw new Error('shim: pack through write.mjs instead'); },
  };
}
globalThis.fflate = fflate;

// ---- lift the engine out of the page ----
const html = fs.readFileSync(PAGE, 'utf8');
const block = (name) => {
  const a = html.indexOf(`/* ===== ${name} =====`), b = html.indexOf(`/* ===== END ${name} ===== */`);
  if (a < 0 || b < 0) throw new Error(`${name} block not found in designbook.html`);
  return html.slice(a, b);
};
const MP = new Function(block('MIXPACK ENGINE') + '; return MP;')();

// ---- the input surface, exactly as regenerate.mjs derives it ----
const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const SST = sharedStrings(SRC), cache = {};
const cellsFor = (n) => (cache[n] ||= cellsOf(sheetXml(SRC, SOURCE[n] ?? STAGING[n]), SST));
const resolving = new Set(), memo = new Map();
const valueOf = (sheet, ref) => {
  const k = `${sheet}!${ref}`;
  if (memo.has(k)) return memo.get(k);
  const c = cellsFor(sheet).get(ref); let out = '';
  if (c) {
    if (c.v != null) out = (c.t === 's' || c.t === 'str' || c.t === 'inlineStr') ? c.v : (NUMRE.test(c.v) ? +c.v : c.v);
    else if (c.f && !resolving.has(k)) { resolving.add(k); try { out = evaluate(c.f, (sh, cell) => valueOf(sh || sheet, cell)); } catch { out = ''; } finally { resolving.delete(k); } }
  }
  if (typeof out === 'string') out = out.trim();
  memo.set(k, out); return out;
};
const inputs = new Set();
for (const [stage, n] of Object.entries(STAGING))
  for (const [ref, c] of cellsOf(sheetXml(TEMPLATE, n), null)) {
    if (rowNum(ref) < FIRST_DATA_ROW(stage) || !c.f) continue;
    for (const m of c.f.matchAll(/(?:'([^']+)'|\b([A-Za-z_][A-Za-z0-9_]*))!\$?([A-Z]{1,3})\$?(\d+)/g)) {
      const sh = m[1] || m[2]; if (!(sh in STAGING)) inputs.add(`${sh}!${m[3]}${m[4]}`);
    }
  }
for (const [sheet, spec] of Object.entries(DIRECT_READ))
  for (let r = spec.firstRow; r <= spec.lastRow; r++) for (const col of spec.cols) inputs.add(`${sheet}!${col}${r}`);
const tpl = {};
for (const [sheet, n] of Object.entries(SOURCE)) {
  const t = (tpl[sheet] ||= cellsOf(sheetXml(TEMPLATE, n), null));
  for (const [ref, c] of cellsFor(sheet)) {
    if (c.v == null || String(c.v).trim() === '') continue;
    const x = t.get(ref); if (x && x.f) continue;
    if (x && x.v != null && String(x.v) === String(c.v)) continue;
    inputs.add(`${sheet}!${ref}`);
  }
}
const values = {};
for (const k of inputs) { const [s, r] = k.split('!'); values[k] = valueOf(s, r); }

// ---- run the page's engine ----
const files = fflate.unzipSync(new Uint8Array(fs.readFileSync(TEMPLATE)));
const t0 = Date.now();
const { parts, report } = MP.fillWorkbook({ files, values, staging: Object.keys(STAGING), firstDataRow: FIRST_DATA_ROW });
console.log(`input cells          : ${inputs.size}`);
console.log(`page engine          : ${report.written} written, ${report.staged} staged, ${report.passes} passes, ${Date.now() - t0} ms` + (realFflate ? '' : '  (fflate shimmed over unzip)'));
if (report.failed.length) { console.log(`could not evaluate   : ${report.failed.length}`); report.failed.slice(0, 10).forEach((f) => console.log('   ', f[0], String(f[1]).slice(0, 70), f[2])); }
if (report.unknownSheet.length) console.log(`unknown sheets       : ${report.unknownSheet.join(', ')}`);

// ---- diff every staging cell against the source workbook ----
let ok = 0; const diffs = [];
for (const [name, n] of Object.entries(STAGING)) {
  const gen = MP.cellsOf(parts.get(`xl/worksheets/sheet${n}.xml`), null);
  for (const [ref, rc] of cellsFor(name)) {
    if (rowNum(ref) < FIRST_DATA_ROW(name) || !rc.f || rc.v == null) continue;
    const want = (rc.t === 's' || rc.t === 'str') ? rc.v : (NUMRE.test(rc.v) ? +rc.v : rc.v);
    const g = gen.get(ref);
    const got = !g ? '' : g.t === 'inlineStr' ? g.v : g.v == null ? '' : (NUMRE.test(g.v) ? +g.v : g.v);
    const same = (typeof got === 'number' && typeof want === 'number') ? Math.abs(got - want) < 1e-9 : String(got).trim() === String(want).trim();
    if (same) ok++; else diffs.push([`${name}!${ref}`, rc.f, got, want]);
  }
}
const expected = (d) => String(d[3]).startsWith('#') || /NOW\(/.test(d[1]) || String(d[2]).includes(report.stamp);
const un = diffs.filter((d) => !expected(d));
console.log(`\nstaging cells matching source : ${ok}`);
console.log(`expected differences          : ${diffs.length - un.length}  (#VALUE! in source, or NOW() stamp)`);
console.log(`unexplained differences       : ${un.length}`);
for (const [w, f, got, want] of un.slice(0, 20)) console.log(`${w}\n   f=${String(f).slice(0, 100)}\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

if (OUT) {
  if (realFflate) fs.writeFileSync(OUT, MP.pack(files, parts));
  else packWorkbook({ template: TEMPLATE, parts, out: OUT, tmp: fs.mkdtempSync('/tmp/mixpack-page-') });
  console.log(`wrote ${OUT}`);
}
process.exit(report.failed.length || un.length ? 1 : 0);
