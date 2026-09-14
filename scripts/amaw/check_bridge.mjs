#!/usr/bin/env node
// Does a lot built from the FORM reach the AMAW's seven test records?
//
//   node scripts/amaw/check_bridge.mjs
//
// IT FAILED ON ARRIVAL, ON PURPOSE (2026-09-14) — 0 passed, 30 failed: a lot
// built from the form reached the mapper with 15 filled row tables and 72
// rows and wrote 32 cells, all seven test records empty. Task #39 was the
// fix, landed the same day in commit d140866 ("Route the form's tables into
// the AMAW's seven records") — this file is what proved it, and what stops
// it coming back, so it stays in the suite green rather than being deleted
// once it stopped catching anything. If a future pull finds it red again:
// that IS a regression this time, not the day-one arrival state above.
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
import { amawCells, A, INPUTS, LOT_TABLE_ROUTES } from './mapper.mjs';
import { SUBLOT, CORES, GRADATION, CALC } from './addresses.mjs';

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

/** Every row table in the PlantBook schema, section by section, ONE per
 *  distinct table key. PlantBook's Sublot 1-4 tabs (2026-09-14) declare the
 *  same table (`sublot_tickets`, `mat_cores`, ...) on all four sections via
 *  sliceSpec() - same key, same full seed and columns, only `sliceIndices`
 *  differs - so without the dedupe this would fill and overwrite the same
 *  table four times over for no reason, each time with different synthetic
 *  values (valueFor()'s counters are global), which is confusing to debug
 *  even though the final value happens to still be a complete, valid table. */
function rowTables() {
  const out = [];
  const seen = new Set();
  for (const s of PLANTBOOK_SECTIONS) {
    const rows = s.rows;
    if (!rows) continue;
    for (const t of (Array.isArray(rows) ? rows : [rows])) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      out.push({ section: s.id, table: t });
    }
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

  // -- the approval's own block. NOT form fields: intake.mjs writes these
  //    from the signed approval and the Lot Pay step prints them as
  //    readouts, so they live one level down and the mapper has to lift
  //    them. A fixture without this block cannot see that seam at all.
  values.design = { jmf_ac: 5.9, target_va: 3.5, min_vma: 15.0 };
  values.lot_wedge_tons = 120;

  // -- row tables
  for (const { table } of rowTables()) {
    rows[table.key] = paintSublotIds(fillTable(table), lotNo);
  }

  // -- the sieve section is NOT a row table: its values live in `values`
  //    under composed keys, which is a third shape again.
  const grad = PLANTBOOK_SECTIONS.find((s) => s.id === 'sublot-gradation');
  if (grad) {
    // The JMF column is a TARGET and stays % passing; the six measured
    // columns are cumulative grams retained plus a pan and a total. A
    // cumulative series must never fall, so the fixture builds a real one
    // rather than scattering distinct numbers - a descending column would
    // trip the form's own guard and this fixture would be testing that
    // instead of the route.
    const TOTAL = 1500;
    const CUM = [0, 0, 0, 15, 120, 285, 600, 840, 1005, 1140, 1245, 1335, 1410];
    for (const col of grad.columns || []) {
      (grad.sieves || []).forEach((sieve, i) => {
        if (col.target) { values[`${col.key}_${sieve.key}`] = 100 - (CUM[i] / TOTAL) * 100; return; }
        values[`${col.key}_wt_${sieve.key}`] = CUM[i];
      });
      if (!col.target) {
        values[`${col.key}_wt_pan`] = TOTAL - CUM[CUM.length - 1];
        values[`${col.key}_wt_total`] = TOTAL;
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
// NOT `formulaAt: () => null`. A stub that says nothing is a formula cannot
// tell write() from writeOver(), and the gradation route exists precisely
// because those two columns ARE formulas — so the check that guards it would
// have been blind to the thing it guards. These addresses were read out of
// public/AMAW_VER14_01.xlsm rather than assumed; each is a cell this file
// asserts something about.
const FORMULA_CELLS = new Set([
  'Gradation!C10', 'Gradation!D10', 'Gradation!C23', 'Gradation!D23',
  "'Super Verify'!C33", "'Super Verify'!D33",
  'Cores!H10', 'Superpave!H12', 'Superpave!G12', 'Superpave!F12',
  'Calculations!O1', 'Calculations!O2',
]);
const tpl = { has: () => true, formulaAt: (addr) => (FORMULA_CELLS.has(addr) ? '=…' : null) };

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

// The form collects % PASSING and has no total mass, so grams are NOT
// written (Jake, 2026-09-14) - the two derived columns are written over
// instead. Both halves of the pair, because Superpave!O14 gates on the
// passing column and divides using the retained one: fill only one and MEDL
// gets a confident ">1.6" dust ratio on every block.
const GR = INPUTS.gradation;
// Since 2026-09-14 the form collects CUMULATIVE GRAMS RETAINED and the
// workbook computes both percentage columns itself, so what has to land is
// column B plus the pan and the total - and the two derived columns must be
// left ALONE. Writing over a formula Excel can evaluate is strictly worse:
// it loses the weights a reviewer can check on the printed sheet.
const gradRet = A(GR.sheet, `${GR.retainedCols[0]}${GR.first}`);
const gradPas = A(GR.sheet, `${GR.passingCols[0]}${GR.first}`);
const gradGrams = (i) => A(GR.sheet, `${GR.cols[0]}${GR.first + i}`);
is("QC01 gradation, a sieve's cumulative grams retained", cells[gradGrams(3)] === 15, cells[gradGrams(3)]);
is('QC01 gradation, the pan weight', cells[A(GR.sheet, `${GR.cols[0]}${GR.panRow}`)] === 90);
is('QC01 gradation, the total sample mass', cells[A(GR.sheet, `${GR.cols[0]}${GR.totalRow}`)] === 1500);
is('the derived % retained is NOT written over (Excel computes it)',
  cells[gradRet] == null, cells[gradRet]);
is('the derived % passing is NOT written over (Excel computes it)',
  cells[gradPas] == null, cells[gradPas]);

// The older shape still reaches the workbook: a lot saved before the change
// carries percentages and no weights, and must not silently lose its
// gradation. That one DOES take the writeOver pair, both halves, because
// there are no grams for Excel to compute from.
const legacy = amawCells({
  values: { lot_number: '1', lot_nominal_size: '0.38B', sub1_s19: 99 },
  rows: {}, records: {},
}, tpl, {});
const lc = { ...legacy.values, ...legacy.evalOnly };
is("a pre-change lot's % passing still reaches the sheet",
  lc[A(GR.sheet, `${GR.passingCols[0]}${GR.first + 3}`)] === 99);
is('and its matched % retained half goes with it',
  lc[A(GR.sheet, `${GR.retainedCols[0]}${GR.first + 3}`)] === 1,
  lc[A(GR.sheet, `${GR.retainedCols[0]}${GR.first + 3}`)]);
is('the JMF target gradation column',
  cells[A(GRADATION.sheet, `${GRADATION.jmfCol}${GRADATION.first}`)] != null);
// The workbook spells it `1 1/2"` and the form `1-1/2"`, so a label match
// silently loses 37.5 mm on all seven columns. Assert it arrived.
const i37 = GRADATION.sieves.indexOf('1 1/2"');
is('the 37.5 mm sieve survives the two spellings',
  i37 > 0 && cells[gradGrams(i37)] != null, { i37, cell: cells[gradGrams(i37)] });
// Index 6 is the 1/4", which is on the workbook and not on the form. It must
// stay blank AND must not have shifted every sieve below it up a row. The
// row BELOW it proves the second half: index 7 is the #4, and the fixture
// gives it 600 g, so a shifted list would put 600 in the 1/4" row instead.
is('the 1/4" row is left blank rather than shifting the list',
  cells[gradGrams(6)] == null && cells[gradGrams(7)] === 600,
  { quarter: cells[gradGrams(6)], no4: cells[gradGrams(7)] });

const CO = INPUTS.cores;
is('a mat core weight in air',
  cells[A(CO.sheet, `${CO.cols.wtAir}${CORES.banks[0].first}`)] != null);
is('a joint core weight in air',
  cells[A(CO.sheet, `${CO.cols.wtAir}${CORES.banks[1].first}`)] != null);

// `Gradation` row 32 is EMPTY in the shipped template and referenced by no
// formula on any sheet, so writing the %AC there sent it nowhere while the
// workbook back-calculated its own. Assert the REFUSAL - a later tidy-up
// "restoring" that write would silently reintroduce a figure nothing reads.
is('nothing is written to the dead Gradation row 32',
  cells[A(GR.sheet, `${GR.acCols[0]}${GR.acRow}`)] == null,
  cells[A(GR.sheet, `${GR.acCols[0]}${GR.acRow}`)]);
// What the back-calculation actually needs instead: the moisture that
// `Gradation!D33` subtracts before `Superpave!B14` reads it.
const MO = INPUTS.moisture;
is('QC01 moisture, pan + mix before drying',
  cells[A(MO.sheet, `${MO.cols[0]}${MO.rows.panAndMixBefore}`)] != null,
  A(MO.sheet, `${MO.cols[0]}${MO.rows.panAndMixBefore}`));
is('QC04 moisture reaches its own column',
  cells[A(MO.sheet, `${MO.cols[3]}${MO.rows.pan}`)] != null);
is('QC01 truck ticket tonnage',
  cells[A(SUBLOT.sheet, `${SUBLOT.ticket.cols.tons}${SUBLOT.ticket.first}`)] != null);

// ---------------------------------------------------------------------
//  B2. the three constants the pay schedule is measured against
// ---------------------------------------------------------------------
// These come off the signed approval and live on `values.design`, one level
// below where the mapper reads. All three were unwritten until 2026-09-14;
// only the JMF %AC said so, and a blank minimum VMA is not a blank in the
// workbook - `J13 = IF(I13="","",(I13-H13))` reads it as 0 and prints the
// raw VMA as the deviation.
console.log('\nB2. the approval\'s pay constants reach their cells');
const jmfCell = A(INPUTS.jmfAc.sheet, `${INPUTS.jmfAc.col}${INPUTS.jmfAc.first}`);
const mvCell = A(INPUTS.minVma.sheet, `${INPUTS.minVma.col}${INPUTS.minVma.first}`);
is('the JMF %AC reaches \'Pay Values\'!A13', cells[jmfCell] === 5.9, cells[jmfCell]);
is('the minimum VMA reaches \'Pay Values\'!H13', cells[mvCell] === 15.0, cells[mvCell]);
is('wedge tons reaches \'Pay Values\'!J20', cells[INPUTS.wedgeTons] === 120, cells[INPUTS.wedgeTons]);
is('the minimum VMA is written for all four sublots',
  [0, 1, 2, 3].every((i) =>
    cells[A(INPUTS.minVma.sheet, `${INPUTS.minVma.col}${INPUTS.minVma.first + i}`)] === 15.0));
// target_va is deliberately NOT written - 'Pay Values'!E13 is a LOOKUP on
// Calculations!J1, so Excel supplies it. Assert the refusal, or a later
// tidy-up "completing the set" would put a value in a formula cell.
is('the target %AV is NOT written (E13 is a formula Excel evaluates)',
  cells[A('Pay Values', 'E13')] == null, cells[A('Pay Values', 'E13')]);

// And the other direction: a lot with no approval block must still SAY the
// minimum VMA is missing rather than writing a confident blank.
const bare = amawCells({ values: { lot_number: '1', lot_nominal_size: '0.38B' },
                         rows: {}, records: {} }, tpl, {});
is('a lot with no approval reports the missing minimum VMA',
  (bare.report.missing || []).some((m) => /minimum VMA/.test(String(m))));

// ---------------------------------------------------------------------
//  B3. the two equipment flags, and the cell they must NOT go in
// ---------------------------------------------------------------------
// `Calculations!O1` is `IF(M1,1,2)` and the loader reads it as
// `IF(O1=1,"Yes","No")` (sn 114/115). Writing the flag to O1 lands in
// evalOnly, Excel recomputes it from a blank M1 and MEDL is told "No" - a
// confident wrong answer on a question the technician did answer.
console.log('\nB3. equipment verified reaches the boolean, not the formula');
const eqW = A(CALC.sheet, CALC.equipmentVerified[0]);
const eqR = A(CALC.sheet, CALC.equipmentVerifiedRead[0]);
is('the QA flag is written to the boolean at M1', cells[eqW] === 1, cells[eqW]);
is('nothing is written to the formula at O1', cells[eqR] == null, cells[eqR]);
is('the IQ flag reaches M2',
  cells[A(CALC.sheet, CALC.equipmentVerified[1])] === 1);
// "Yes" -> 1 and "No" -> 0, NOT the 1/2 the formula above produces. A text
// value would make IF("No",1,2) a #VALUE! rather than a flag, and writing 2
// for No would read back as TRUE - the same inversion CLAUDE.md records for
// joint density at M11.
//
// FIXTURE UPDATED 2026-09-14: `equipment_verified` moved from the lot-wide
// scalar `values.lot_equipment_verified_qa` to QA01's own record
// (`records.QA01.values.equipment_verified`) now that a Verification record
// lives on one of four possible Sublot tabs - see LOT_TABLE_ROUTES.
// verification and mapper.mjs's write step for the "Yes"/"No" -> boolean
// conversion, which moved to read `rv.equipment_verified` there instead of
// `lotScalars()`'s old output.
const flags = (qa) => {
  const o = amawCells({ values: { lot_number: '1', lot_nominal_size: '0.38B' },
    rows: {}, records: { QA01: { values: { tested_by: 'x', equipment_verified: qa } } } }, tpl, {});
  return { ...o.values, ...o.evalOnly }[eqW];
};
is('"Yes" converts to 1', flags('Yes') === 1, flags('Yes'));
is('"No" converts to 0, never 2', flags('No') === 0, flags('No'));
is('an unreadable answer writes nothing rather than a No',
  flags('maybe') === undefined, flags('maybe'));
// And the silence that is not neutral: no answer at all still reads as "No"
// to MEDL, so a lot with a Department sample says so once.
const quiet = amawCells({ values: { lot_number: '1', lot_nominal_size: '0.38B' },
  rows: {}, records: { QA01: { values: { tested_by: 'x' } } } }, tpl, {});
is('a Department sample with no answer is reported',
  (quiet.report.notes || []).some((n) => /equipment verified/.test(String(n))),
  quiet.report.notes);

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
// The first version of this section asked `coverage.QC01 > 0 || named`, which
// every table satisfies the instant ANY table routes - it passed all fifteen
// while fourteen of them were being dropped. A check that goes green for the
// wrong reason is worse than no check, so this one is per table and per value.
console.log('\nE. every table either reaches a cell or is declared dropped');
const written = new Set(Object.values(cells).map((x) => JSON.stringify(x)));
for (const { table } of rowTables()) {
  const rowsIn = lot.rows[table.key] || [];
  if (!rowsIn.length) continue;
  const route = LOT_TABLE_ROUTES[table.key];
  if (!route) { bad(`${table.key} has no entry in LOT_TABLE_ROUTES`); continue; }

  // A table whose every column is a declared drop is accounted for by the
  // routing table itself - blend_gsb and verify_volumetrics are computed by
  // the sheet and have nothing to send.
  const routed = Object.keys(route.cols || {}).filter((k) => k !== route.id);
  if (!routed.length) {
    const dropped = Object.keys(route.drop || {});
    is(`${table.key} is declared fully dropped, with reasons`,
      dropped.length > 0 && Object.values(route.drop).some(Boolean), dropped);
    continue;
  }

  // Otherwise SOME value this fixture put in the table has to appear in some
  // cell. The fixture makes every value distinct precisely so this can be an
  // identity test rather than a count.
  const mine = rowsIn.flatMap((r) => routed.map((c) => r[c]))
    .filter((x) => x !== null && x !== undefined && x !== '');
  const landed = mine.filter((x) => written.has(JSON.stringify(x))).length;
  is(`${table.key}: ${landed}/${mine.length} routed values reach a cell`,
    landed > 0, { table: table.key, sample: mine.slice(0, 3) });
}

// And the reverse direction: a column the schema has that the routing table
// mentions in neither `cols` nor `drop` is a value with nowhere to go and no
// line saying so - the exact shape of the bug this file was written for.
console.log('\nF. every schema column is routed or explicitly dropped');
for (const { table } of rowTables()) {
  const route = LOT_TABLE_ROUTES[table.key];
  if (!route) continue;
  const unaccounted = (table.columns || [])
    .map((c) => c.key)
    // The identity column and the slot column are both accounted for by
    // being declared as such — `by`/`id` and `slot` on the route.
    .filter((k) => k !== route.id && k !== route.slot
      && !(route.cols || {})[k]
      && !Object.prototype.hasOwnProperty.call(route.drop || {}, k));
  is(`${table.key} accounts for all ${(table.columns || []).length} columns`,
    unaccounted.length === 0, unaccounted);
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
