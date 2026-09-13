#!/usr/bin/env node
// Does addresses.mjs still say where AMAW values really live?
//
//   node scripts/amaw/check_addresses.mjs <lot1.xlsm> [lot2.xlsm ...] \
//        [--map path/to/amaw_field_map.json]
//
// Two independent checks, because a map can be internally consistent and
// still wrong about the file:
//
//   1. AGAINST THE WORKBOOK'S OWN MAP (--map, optional). t_tst_rslt_dtl
//      carries a formula per field naming its source cell; that extract is
//      where addresses.mjs was derived from. This re-resolves all 210 fields
//      x 7 blocks through the map's constants and demands byte-identical
//      agreement. If a stride or a column ever drifts, this is what says so.
//
//   2. AGAINST TWO REAL COMPLETED LOTS. Resolve, read, print. Values from
//      contract 252112 lot 1 are asserted outright — if the map still lands
//      on Madison, 252112, Gsb 2.6528 and QC03 %AC 6.34, it is reading the
//      workbook the way the loader does.
//
// AMAW workbooks are not committed (docs/amaw-map.md says why), so this takes
// paths. No dependencies: the zip layer is `unzip -p`, same as the MixPack
// scripts, and the cell reader is theirs.
//
// SheetJS is not used here and must not be: AMAW carries a chartsheet AND a
// Dialog1 dialogsheet, so its SheetNames shift is worse than the MixPack's
// (wb.Sheets["t_smpl"] comes back as t_cont_smpl). Sheet names are resolved
// through xl/workbook.xml -> the rels -> the worksheet part, below.
import fs from 'fs';
import { execSync } from 'child_process';
import { cellsOf, sharedStrings } from '../mixpack/xlsx.mjs';
import { AMAW, BLOCKS, FIELDS, addressOf, bySn, UNCLASSIFIED } from './addresses.mjs';

// ---- zip / sheet plumbing -------------------------------------------
const unz = (f, p) => execSync(`unzip -p ${JSON.stringify(f)} ${p}`, { maxBuffer: 1 << 28 }).toString();

function openWorkbook(file) {
  const rels = {};
  for (const m of unz(file, 'xl/_rels/workbook.xml.rels').matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g))
    rels[m[1]] = m[2].replace(/^\/?xl\//, '');
  const parts = {};
  for (const m of unz(file, 'xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g))
    parts[m[1].replace(/&amp;/g, '&')] = rels[m[2]];
  const sst = sharedStrings(file);
  const cache = new Map();
  return (sheet) => {
    if (cache.has(sheet)) return cache.get(sheet);
    const part = parts[sheet];
    // A chartsheet or dialogsheet has no cells; so does a sheet we misnamed.
    const cells = (part && /worksheets/.test(part))
      ? cellsOf(unz(file, `xl/${part}`), sst) : new Map();
    cache.set(sheet, cells);
    return cells;
  };
}

// "'Super Verify'!B10" -> { sheet: "Super Verify", cell: "B10" }
const split = (addr) => {
  const m = /^(?:'([^']+)'|([^!]+))!([A-Z]+\d+)$/.exec(addr);
  return m ? { sheet: m[1] ?? m[2], cell: m[3] } : null;
};

// Read one resolved address. Returns null for "~formula", absent and blank
// cells alike — an AMAW is mostly empty by design (no QA sample, no cores on
// three of four sublots), so an empty read is data, not a failure.
function read(get, addr) {
  if (!addr || addr.startsWith('~')) return null;
  const s = split(addr); if (!s) return null;
  const c = get(s.sheet).get(s.cell);
  const v = c && (c.value ?? c.v);
  return (v === undefined || v === null || v === '') ? null : v;
}

const num = (v, dp = 4) => (v == null || v === '' || isNaN(+v)) ? null : +(+v).toFixed(dp);
const show = (v) => v == null ? '—' : String(v).length > 34 ? String(v).slice(0, 31) + '…' : String(v);

// ---- check 1: the map reproduces t_tst_rslt_dtl ----------------------
function checkAgainstFieldMap(mapPath) {
  const rows = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  // Reduce each source formula to the cell it names. The loader wraps some in
  // IF(x="",0,x) or ROUND(x,n); neither changes WHERE the value comes from.
  const R = String.raw`(?:'([^']+)'|([A-Za-z0-9_.# ]+))!\$?([A-Z]{1,3})\$?(\d+)`;
  const PLAIN = new RegExp(`^${R}$`), GUARD = new RegExp(`^IF\\(${R}="",[^,]*,${R}\\)$`),
        ROUND = new RegExp(`^ROUND\\(${R},(\\d+)\\)$`);
  const q = (s) => /[^A-Za-z0-9_.]/.test(s) ? `'${s}'` : s;
  const norm = (src) => {
    if (!src) return null;
    let m;
    if ((m = PLAIN.exec(src))) return `${q(m[1] || m[2])}!${m[3]}${m[4]}`;
    if ((m = GUARD.exec(src))) {
      const a = `${q(m[1] || m[2])}!${m[3]}${m[4]}`, b = `${q(m[5] || m[6])}!${m[7]}${m[8]}`;
      return a === b ? a : null;
    }
    if ((m = ROUND.exec(src))) return `${q(m[1] || m[2])}!${m[3]}${m[4]}`;
    return `~${src.replace(/\$/g, '')}`;          // computed: compare verbatim
  };

  let pairs = 0, bad = 0, missing = 0;
  for (const r of rows) {
    const want = norm(r.source);
    if (want === null) { missing++; continue; }   // no source: a caption row
    const f = bySn(r.sn);
    if (!f) { console.log(`  MISSING sn ${r.sn} (${r.block})`); bad++; continue; }
    const got = addressOf(f, r.block);
    pairs++;
    if (got !== want) { bad++; console.log(`  MISMATCH sn ${r.sn} ${r.block}: map says ${want}, map file says ${got}`); }
  }
  console.log(`\nt_tst_rslt_dtl round-trip: ${pairs} sourced (field, block) pairs, ${bad} mismatches`
            + `\n  (${missing} rows are caption/constant fields with no source cell at all)`);
  return bad === 0;
}

// ---- check 2: real values out of a real lot --------------------------
const F = (sn) => bySn(sn);

function dumpLot(file) {
  const get = openWorkbook(file);
  const A = AMAW;
  const lot = (k) => read(get, `${/[^A-Za-z0-9_.]/.test(A.LOT.sheet) ? `'${A.LOT.sheet}'` : A.LOT.sheet}!${A.LOT[k]}`);

  console.log(`\n${'='.repeat(72)}\n${file}\n${'='.repeat(72)}`);
  console.log('LOT');
  for (const k of ['version','contract','lotNumber','county','itemCode','mixId',
                   'plantCode','approvedMixDesign','lotTons','unit','approverName','approverId'])
    console.log(`  ${k.padEnd(19)} ${A.LOT[k].padEnd(4)} ${show(lot(k))}`);

  // The blend: lot-level columns, plus the per-sublot percentage columns.
  console.log('\nAGGREGATE  (Superpave rows 3-8; % is per sublot, R/S/T/U)');
  console.log('  ' + 'AGP'.padEnd(12) + 'Type & size'.padEnd(24) + 'BOD'.padEnd(8)
            + ['QC01','QC02','QC03','QC04'].map(b => b.padStart(7)).join(''));
  for (let i = 0; i < A.AGGREGATE.count; i++) {
    const cell = (part) => read(get, addressOf({ at: { family: 'agg', part, i } }, 'QC01'));
    if (cell('producerCode') == null && cell('typeSize') == null) continue;
    const pct = BLOCKS.slice(1, 5).map((b) =>
      String(num(read(get, addressOf({ at: { family: 'agg', part: 'pct', i } }, b)), 2) ?? '—').padStart(7));
    console.log('  ' + show(cell('producerCode')).padEnd(12) + show(cell('typeSize')).padEnd(24)
              + String(num(cell('bod'), 3) ?? '—').padEnd(8) + pct.join(''));
  }
  const gsb = BLOCKS.slice(1, 5).map((b) => num(read(get, addressOf({ at: { family: 'agg', part: 'gsb', i: 0 } }, b))));
  console.log('  ' + 'Combined Gsb'.padEnd(44) + gsb.map((g) => String(g ?? '—').padStart(7)).join(''));

  // sn -> label, so the table below reads as the workbook's own words. A
  // value is rounded only if it is a number: Truck # is a string field and
  // reading it through a numeric formatter is how it turns into a dash.
  const table = (title, sns, dp = 2) => {
    console.log(`\n${title}`);
    console.log('  ' + 'field'.padEnd(24) + BLOCKS.map((b) => b.padStart(10)).join(''));
    for (const sn of sns) {
      const f = F(sn);
      const vals = BLOCKS.map((b) => {
        const v = read(get, addressOf(f, b));
        return v == null ? '—' : (isNaN(+v) ? String(v) : String(num(v, dp)));
      });
      console.log('  ' + `${sn} ${f.field}`.slice(0, 23).padEnd(24)
                + vals.map((v) => v.padStart(10)).join(''));
    }
  };

  // sn 36-39 ticket, 42-49 volumetrics: the two Superpave strides.
  table('SUBLOT TICKET  (Superpave rows 3-6, stride 1)', [36, 37, 38, 39], 4);
  table('SUBLOT VOLUMETRICS  (Superpave rows 14/20/26/32 stride 6; QA/IQ read Super Verify stride 7)',
        [42, 43, 44, 45, 46, 47, 48, 49]);

  // Gradation: fourteen sieves, sublots across columns.
  console.log('\nGRADATION  (% passing; Gradation D/G/J/M, JMF target in N)');
  console.log('  ' + 'sieve'.padEnd(10) + ['QC01','QC02','QC03','QC04','JMF'].map((s) => s.padStart(9)).join(''));
  for (let i = 0; i < A.GRADATION.sieves.length; i++) {
    const v = BLOCKS.slice(1, 5).map((b) => num(read(get, addressOf({ at: { family: 'grad', i } }, b)), 1));
    const jmf = num(read(get, addressOf({ at: { family: 'gradJmf', i } }, 'QC01')), 1);
    if (v.every((x) => x == null) && jmf == null) continue;
    console.log('  ' + A.GRADATION.sieves[i].padEnd(10) + [...v, jmf].map((x) => String(x ?? '—').padStart(9)).join(''));
  }

  // Cores: two banks, different strides, and however many were actually cut.
  console.log('\nCORES  (Cores; bank 1 rows 10-13 stride 5, bank 2 rows 33-34 stride 3)');
  let slots = 0, measured = 0;
  for (const b of BLOCKS.slice(1, 5)) {
    for (let bank = 0; bank < A.CORES.banks.length; bank++) {
      for (let slot = 0; slot < A.CORES.banks[bank].count; slot++) {
        const cell = (key) => read(get, addressOf({ at: { family: 'cores', bank, slot, key } }, b));
        const id = cell('id'), d = num(cell('density'), 1), p = num(cell('pctSolid'), 1);
        if (id == null && d == null) continue;
        slots++; if (d != null) measured++;
        console.log(`  ${b}  ${show(id).padEnd(10)} density ${String(d ?? '—').padStart(7)} pcf   ${String(p ?? '—').padStart(6)} % solid`);
      }
    }
  }
  console.log(`  ${slots} core slots carry an id, ${measured} of them a density.`
            + ` The count is not fixed per lot OR per sublot — read every slot and drop the blanks.`);

  // Pay adjustment, and the lot-level figures only the QC blocks carry.
  table('PAY ADJUSTMENT  (Pay Values rows 13-16; JMF %AC is the one pay field QA/IQ read)',
        [95, 96, 97, 98, 99, 100], 2);
  console.log('  lot: ' + ['jointDensityPay','lotDensityPay','wedgeTons','finalPayMainline','lotPayAdjustment']
    .map((k) => `${k}=${show(num(read(get, addressOf({ at: { family: 'payLot', key: k } }, 'QC01')), 2))}`).join('  '));

  // The fields the loader calls "Hamburg". The sheet under them is IDT-HT and
  // IDEAL-RT, VI01 reads the derived columns where QC reads the raw peak
  // loads, and sn 176/177 share a cell on the production side. All KYTC's;
  // printed as addresses so the wiring is visible even in an empty lot.
  console.log('\n"HAMBURG" FIELDS  (really Field Rutting: IDT-HT + IDEAL-RT — see addresses.mjs)');
  for (const sn of [176, 177, 178, 187, 188])
    console.log(`  sn ${sn}  VI01 ${String(show(addressOf(F(sn), 'VI01'))).padEnd(22)}`
              + `QC01 ${show(addressOf(F(sn), 'QC01'))}`);

  // Coverage: every field, every block, so the whole map is exercised rather
  // than the handful printed above. "resolves" counts a real address; the
  // rest are legitimately absent (a caption, or a block that has no such
  // field) or computed by the loader.
  let addr = 0, comp = 0, none = 0, found = 0;
  for (const f of FIELDS) for (const b of BLOCKS) {
    const a = addressOf(f, b);
    if (a == null) { none++; continue; }
    if (a.startsWith('~')) { comp++; continue; }
    addr++; if (read(get, a) != null) found++;
  }
  console.log(`\nCOVERAGE  ${FIELDS.length} fields x ${BLOCKS.length} blocks = ${FIELDS.length * BLOCKS.length} pairs`);
  console.log(`  ${addr} resolve to a cell (${found} of them hold a value in this lot),`
            + ` ${comp} are loader-computed, ${none} have no source in that block`);

  // The verification blocks: present at all?
  const vIdx = A.VERIFY.sublotIndex.map((c) => read(get, `'${A.VERIFY.sheet}'!${c}`));
  const vTec = A.VERIFY.technician.map((c) => read(get, `'${A.VERIFY.sheet}'!${c}`));
  console.log(`\nVERIFY  QA01 sublot ${show(vIdx[0])} by ${show(vTec[0])} | IQ01 sublot ${show(vIdx[1])} by ${show(vTec[1])}`);
  if (vIdx.every((v) => v == null))
    console.log('  no QA/IQ sample in this lot — every INDIRECT-resolved field is legitimately unanswerable here');

  return { get, lot };
}

// ---- known-good assertions, contract 252112 lot 1 --------------------
function assertLot1(get, lot) {
  const at = (f, b) => read(get, addressOf(F(f), b));
  const agg = (part, i) => read(get, addressOf({ at: { family: 'agg', part, i } }, 'QC01'));
  const checks = [
    ['county',              lot('county'),                          'Madison'],
    ['contract',            lot('contract'),                        '252112'],
    ['Gsb',                 num(at(10, 'QC01')),                    2.6528],
    ['agg 1 producer',      agg('producerCode', 0),                 'AGP027501'],
    ['agg 1 type & size',   agg('typeSize', 0),                     "Dolomite #8's"],
    ['agg 1 %',             num(read(get, addressOf({at:{family:'agg',part:'pct',i:0}}, 'QC01')), 0), 35],
    ['agg 1 BOD',           num(agg('bod', 0), 3),                  2.64],
    ['QC01 %AC',            num(at(42, 'QC01')),                    5.98],
    ['QC02 %AC',            num(at(42, 'QC02')),                    6.32],
    ['QC03 %AC',            num(at(42, 'QC03')),                    6.34],
    ['QC04 %AC',            num(at(42, 'QC04')),                    6.32],
    ['QC01 Gmm',            num(at(44, 'QC01'), 3),                 2.495],
    ['QC01 Va',             num(at(45, 'QC01'), 2),                 4.57],
    ['QC01 VMA',            num(at(47, 'QC01'), 1),                 15.6],
  ];
  console.log('\nKNOWN-GOOD ASSERTIONS  (contract 252112, lot 1)');
  let bad = 0;
  for (const [name, got, want] of checks) {
    const ok = String(got) === String(want);
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(20)} got ${show(got).padEnd(16)} want ${show(want)}`);
  }
  return bad === 0;
}

// ---- main ------------------------------------------------------------
const argv = process.argv.slice(2);
const mapAt = argv.indexOf('--map');
const mapPath = mapAt >= 0 ? argv[mapAt + 1] : null;
const files = argv.filter((a, i) => a !== '--map' && i !== mapAt + 1);
if (!files.length) {
  console.error('usage: node scripts/amaw/check_addresses.mjs <lot.xlsm> [...] [--map amaw_field_map.json]');
  process.exit(2);
}

let ok = true;
console.log(`addresses.mjs: ${FIELDS.length} fields, ${BLOCKS.length} blocks, `
          + `${UNCLASSIFIED.length} field(s) the map could not classify`);
for (const u of UNCLASSIFIED) console.log(`  UNCLASSIFIED sn ${u.sn} "${u.field}" — ${u.why}`);

if (mapPath) ok = checkAgainstFieldMap(mapPath) && ok;
else console.log('\n(no --map given; skipping the t_tst_rslt_dtl round-trip)');

files.forEach((f, i) => {
  const { get, lot } = dumpLot(f);
  if (i === 0) ok = assertLot1(get, lot) && ok;
});

console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
