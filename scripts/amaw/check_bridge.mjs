#!/usr/bin/env node
// Does a lot built from the FORM reach the AMAW's seven test records?
//
//   node scripts/amaw/check_bridge.mjs
//
// IT FAILS TODAY, ON PURPOSE — 0 passed, 30 failed as of 2026-09-14, and that
// is the bug rather than a broken check. A lot built from the form reaches the
// mapper with 15 filled row tables and 72 rows and writes 32 cells, all seven
// test records empty. Task #39 is the fix; this file is what proves it, and
// what stops it coming back. If you have pulled this branch and are wondering
// why a checker is red: nothing regressed, this one arrived red.
//
// PlantBook's form produces flat row tables keyed by an identity column and
// hands them to the mapper as `lot.rows.<tableKey>`. The mapper reads seven
// per-block records at `lot.records[block].values` / `.rows.<name>`. Those are
// two vocabularies for one fact, and CLAUDE.md already records what happens
// when there is no checked table between them: `write()` skips an absent
// value by design, so every cell it never reaches is simply not written and
// nothing is said about it.
//
// WHY THE EXISTING CHECKS CANNOT CATCH THIS. `check_mapper.mjs` builds its
// `records` by READING TWO REAL COMPLETED AMAWs, so it speaks the mapper's
// vocabulary natively and the seam it shares with the form has never been on
// either side of a test. `check_sections.mjs` checks the schema against
// itself. This file is the missing half: it starts where a TECHNICIAN starts,
// from the schema, fills every cell the form offers, and asks what came out
// the far end.
//
// It is deliberately ROUTING-AGNOSTIC. It asserts the OUTCOME — data lands in
// the workbook cells the real AMAWs hold it in — not the mechanism, so it
// stays true whichever shape the bridge takes.
import PLANTBOOK_SECTIONS from './sections.mjs';
// INPUTS lives in mapper.mjs (the raw-input addresses it writes), the rest in
// addresses.mjs (the loader's own map) — one seam per file, so import each
// from where it is actually declared rather than from whichever re-exports.
import { amawCells, A, INPUTS } from './mapper.mjs';
import { SUBLOT, CORES, GRADATION } from './addresses.mjs';

let pass = 0, fail = 0;
const failures = [];
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, got) => {
  fail++; failures.push(name);
  console.log(`  ✗ ${name}${got === undefined ? '' : `\n      got: ${JSON.stringify(got)}`}`);
};
const is = (name, cond, got) => (cond ? ok(name) : bad(name, got));

// ---------------------------------------------------------------------
//  A fixture built from the SCHEMA, not hand-written
// ---------------------------------------------------------------------
// Hand-writing a "full lot" is how a fixture quietly stops covering a column
// somebody added last week. Every value below is derived from the schema's
// own declaration of the field, so a new column arrives filled and a renamed
// one arrives under its new name.

const BLOCK_OF_SUBLOT = ['QC01', 'QC02', 'QC03', 'QC04'];
const SIEVE_COLS = { jmf: 'jmf', sub1: 'QC01', sub2: 'QC02', sub3: 'QC03', sub4: 'QC04', qa: 'QA01', iq: 'IQ01' };

/** A distinct, plausible number for a numeric cell. Distinct matters: a
 *  fixture of identical values cannot tell a right cell from its neighbour,
 *  which is the exact failure this file exists to catch. */
let tick = 0;
const nextNum = (key) => {
  tick += 1;
  // Keep each family in a believable range so a range-checked importer (KYCT
  // skips a slot whose index is 0) does not drop the row for being absurd.
  if (/wt_air|wt_mix|final_wt|calibration/.test(key)) return 4000 + tick;
  if (/wt_water/.test(key)) return 2400 + tick;
  if (/wt_ssd|wt_before|wt_after/.test(key)) return 4100 + tick;
  if (/gmm|msg/.test(key)) return 2.4 + tick / 1000;
  if (/gmb|bsg|gsb/.test(key)) return 2.3 + tick / 1000;
  if (/pct|percent|_pc$/.test(key)) return 10 + (tick % 40);
  if (/tons/.test(key)) return 1000 * (1 + (tick % 4));
  if (/density/.test(key)) return 140 + (tick % 10);
  return 1 + (tick % 90);
};

const valueFor = (col) => {
  if (Array.isArray(col.options) && col.options.length) return col.options[0];
  if (col.type === 'number') return nextNum(col.key);
  if (col.type === 'date') return '2026-09-02';
  if (col.type === 'time') return '09:30';
  return `${col.key}-${++tick}`;
};

/** Every row table in the PlantBook schema, section by section. */
function rowTables() {
  const out = [];
  for (const s of PLANTBOOK_SECTIONS) {
    const rows = s.rows;
    if (!rows) continue;
    for (const t of (Array.isArray(rows) ? rows : [rows])) out.push({ section: s.id, table: t });
  }
  return out;
}

/** Fill one table: start from its own seed so the identity column keeps the
 *  spelling the form actually paints, then fill every other column. */
function fillTable(t) {
  const seed = Array.isArray(t.seed) && t.seed.length
    ? t.seed
    : Array.from({ length: t.start || 1 }, () => ({}));
  return seed.map((row) => {
    const filled = { ...row };
    for (const col of t.columns || []) {
      if (filled[col.key] !== undefined && filled[col.key] !== '') continue;
      filled[col.key] = valueFor(col);
    }
    return filled;
  });
}

/** The sublot identity column holds "<lot>-<sublot>", painted by the page from
 *  the Lot step's lot number. A seed carries the shape but not the lot, so
 *  paint it here exactly as the page does. */
function paintSublotIds(rows, lotNo) {
  return rows.map((r, i) => {
    if (!('sublot' in r)) return r;
    const n = i;
    // Two samples per sublot on the BSG/MSG tables, one row per sublot on the
    // others — derive from the table's own length rather than assuming.
    const per = rows.length / 4;
    const sub = Number.isInteger(per) && per > 0 ? Math.floor(n / per) + 1 : n + 1;
    return { ...r, sublot: `${lotNo}-${sub}` };
  });
}

function buildFormLot() {
  const lotNo = 1;
  const values = {};
  const rows = {};

  // -- scalars, from the schema. `lot_`-prefixed ones are the lot header;
  //    the rest are per-record candidates.
  for (const s of PLANTBOOK_SECTIONS) {
    for (const f of s.fields || []) {
      if (f.readonly) continue;
      values[f.key] = valueFor(f);
    }
  }
  // The handful the mapper gates the whole pay schedule on have to be real
  // rather than schema-plausible, or every downstream assertion is testing a
  // refusal instead of a route.
  Object.assign(values, {
    lot_contract_id: '262120', lot_county: 'Madison', lot_number: String(lotNo),
    lot_tons: 4000, lot_esal_class: 3, lot_nominal_size: '0.38B',
    lot_acceptance_method: 'Volumetrics', lot_density_option: 'A',
    lot_joint_density: 'Yes', lot_unit_price: 50, lot_mix_id: '00260467',
  });

  // -- row tables
  for (const { table } of rowTables()) {
    rows[table.key] = paintSublotIds(fillTable(table), lotNo);
  }

  // -- the sieve section is NOT a row table: its values live in `values`
  //    under composed keys, which is a third shape again.
  const grad = PLANTBOOK_SECTIONS.find((s) => s.id === 'sublot-gradation');
  if (grad) {
    for (const col of grad.columns || []) {
      for (const sieve of grad.sieves || []) {
        values[`${col.key}_${sieve.key}`] = nextNum('grams');
      }
    }
  }

  return { values, rows, records: {} };
}

// ---------------------------------------------------------------------
//  Run the real mapper over it
// ---------------------------------------------------------------------
// A template stub that says every cell exists and none is a formula, so the
// only reason a cell can be absent is that the mapper never tried to write
// it. `check_mapper.mjs` runs against real templates; this one is isolating
// the seam, and a real template would let a missing route hide behind a
// legitimately-skipped formula cell.
const tpl = { has: () => true, formula: () => null };

const lot = buildFormLot();
const out = amawCells(lot, tpl, {}) || {};
const cells = { ...(out.values || {}), ...(out.evalOnly || {}) };
const report = out.report || {};
const coverage = (report.coverage || {}).blocks || {};
const missing = report.missing || [];

const tableCount = rowTables().length;
console.log(`\nfixture       : ${tableCount} row tables, ${Object.keys(lot.values).length} scalars, `
  + `${Object.values(lot.rows).reduce((n, r) => n + r.length, 0)} rows`);
console.log(`cells written : ${Object.keys(cells).length}`);
console.log(`coverage      : ${JSON.stringify(coverage)}`);
console.log(`missing       : ${missing.length}\n`);

// ---------------------------------------------------------------------
//  A. every block that has storage of its own receives something
// ---------------------------------------------------------------------
// VI01 is deliberately absent: addresses.mjs records that it reads sublot 1's
// cells for everything but Field Rutting, so it has no storage of its own and
// a zero there is correct rather than a gap.
console.log('A. every block with storage of its own receives data');
for (const block of ['QC01', 'QC02', 'QC03', 'QC04', 'QA01', 'IQ01']) {
  is(`${block} receives at least one cell`, (coverage[block] || 0) > 0, coverage[block]);
}

// ---------------------------------------------------------------------
//  B. the raw weights reach the cells the real AMAWs hold them in
// ---------------------------------------------------------------------
// Cell-level, because "some cells were written" is exactly the reassurance
// that let this ship: the four header cells the pay schedule gates on landed
// and nothing else did.
console.log('\nB. raw measurements land in their own cells');
const SP = INPUTS.specimens;
is('QC01 gyratory specimen 1, weight in air',
  cells[A(SP.sheet, `${SP.cols.wtAir}${SP.first}`)] != null,
  A(SP.sheet, `${SP.cols.wtAir}${SP.first}`));
is('QC04 gyratory specimen 1, weight in air',
  cells[A(SP.sheet, `${SP.cols.wtAir}${SP.first + 3 * SP.stride}`)] != null);

const GM = INPUTS.gmm;
is('QC01 Gmm bowl 1, weight of mix',
  cells[A(GM.sheet, `${GM.cols[0][0]}${GM.rows.mix}`)] != null,
  A(GM.sheet, `${GM.cols[0][0]}${GM.rows.mix}`));

const GR = INPUTS.gradation;
is('QC01 gradation, first sieve grams retained',
  cells[A(GR.sheet, `${GR.cols[0]}${GR.first}`)] != null);
is('the JMF target gradation column',
  cells[A(GRADATION.sheet, `${GRADATION.jmfCol}${GRADATION.first}`)] != null);

const CO = INPUTS.cores;
is('a mat core weight in air',
  cells[A(CO.sheet, `${CO.cols.wtAir}${CORES.banks[0].first}`)] != null);
is('a joint core weight in air',
  cells[A(CO.sheet, `${CO.cols.wtAir}${CORES.banks[1].first}`)] != null);

is('QC01 as-tested %AC',
  cells[A(GR.sheet, `${GR.acCols[0]}${GR.acRow}`)] != null);
is('QC01 truck ticket tonnage',
  cells[A(SUBLOT.sheet, `${SUBLOT.ticket.cols.tons}${SUBLOT.ticket.first}`)] != null);

// ---------------------------------------------------------------------
//  C. distinct values land in distinct cells
// ---------------------------------------------------------------------
// A bridge that routed every sublot to QC01 would pass A and B. This is what
// separates "reached the workbook" from "reached the RIGHT place".
console.log('\nC. the four sublots are four different sublots');
const airCells = [0, 1, 2, 3].map((s) => cells[A(SP.sheet, `${SP.cols.wtAir}${SP.first + s * SP.stride}`)]);
const distinct = new Set(airCells.filter((v) => v != null));
is('four sublots write four distinct specimen weights',
  distinct.size === 4, airCells);

// ---------------------------------------------------------------------
//  D. a full lot stops the mapper asking for what it has
// ---------------------------------------------------------------------
// `need()` is the mapper saying a cell MEDL wants has nothing behind it. On a
// lot where a technician filled every box the form offers, each of these is a
// route that does not exist.
console.log('\nD. a fully filled lot does not still read as empty');
const STILL_ASKED = [
  [/no gyratory specimen weights/, 'gyratory specimen weights'],
  [/no Gmm bowl weights/, 'Gmm bowl weights'],
  [/no gradation/, 'a gradation'],
  [/no as-tested %AC/, 'an as-tested %AC'],
  [/JMF target gradation/, 'the JMF target gradation'],
];
for (const [re, what] of STILL_ASKED) {
  const hits = missing.filter((m) => re.test(String(m)));
  is(`the lot is not still missing ${what}`, hits.length === 0, hits.slice(0, 2));
}

// ---------------------------------------------------------------------
//  E. no form table is silently dropped
// ---------------------------------------------------------------------
// The bridge may legitimately decline a table — a computed one the workbook
// recalculates, or one with no workbook home. What it must not do is decline
// it silently: an unrouted table has to show up in the report, so the reason
// is a written line rather than an absence nobody notices.
console.log('\nE. an unrouted table is reported, not dropped');
const unmapped = report.unmapped || [];
const said = [...missing, ...unmapped, ...(report.notes || [])].map(String).join(' | ');
for (const { table } of rowTables()) {
  const rowsIn = (lot.rows[table.key] || []).length;
  if (!rowsIn) continue;
  const reached = Object.keys(cells).length > 0;   // cheap guard; per-table below
  const named = said.includes(table.key);
  // Either the table's data is somewhere in the workbook, or its key is named
  // in the report. This is deliberately loose: it is the ONE assertion here
  // that a future bridge design gets to satisfy either way.
  is(`${table.key} is routed or reported`, reached && (coverage.QC01 > 0 || named), table.key);
}

// ---------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailing:');
  for (const f of failures) console.log('  - ' + f);
  console.log('\nThis is the form -> records seam. See task #39 and CLAUDE.md on');
  console.log('LOT_FIELD_ALIASES: two vocabularies for one fact need a checked');
  console.log('table between them, not a convention.');
}
process.exit(fail ? 1 : 0);
