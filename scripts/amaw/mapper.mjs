// =====================================================================
//  AMAW MAPPER — a PlantBook lot -> the cells of KYTC's AMAW workbook
// =====================================================================
//
//  The PlantBook half of what `mixpackCells()` does for DesignBook: pure,
//  payload and template in, `{ values, evalOnly, report }` out. Nothing here
//  touches a DOM, opens a file or knows how a zip works — the engine in
//  scripts/mixpack/ (and its port in designbook.html) does all of that, and
//  docs/amaw-map.md records that it ports to AMAW unchanged apart from four
//  evaluator functions. What does NOT port is this file: the domain is a
//  production lot rather than a mix design.
//
//  ---- THE THREE OUTPUTS, AND WHY THERE ARE THREE ----------------------
//
//    values    cells to WRITE. A cell the template holds blank: the loader,
//              and every formula downstream of it, reads what we put there.
//    evalOnly  cells to FEED THE EVALUATOR WITHOUT WRITING. The template
//              already computes these from cells we did write, so Excel will
//              produce the same number the moment it opens the file; writing
//              a literal over the formula would break the recalculation and
//              leave an archived workbook that cannot be re-derived.
//    report    what the lot does NOT carry, named cell by cell. This is the
//              honest half. "There will always be not fully filled out
//              AMAWs" (Jake) — a partial lot is the normal case, not an
//              error, so this module never throws and never writes a zero
//              in place of a measurement nobody took. It says what is
//              missing and lets the page print it.
//
//  ---- THE ONE RULE THAT DECIDES WHICH OF THE FIRST TWO ----------------
//
//  Ask the TEMPLATE, not this file: `tpl.formulaAt(addr)`. If KYTC's blank
//  workbook computes that cell, our value is `evalOnly`; if it is blank,
//  our value is written. This matters because the AMAW is wired
//  inconsistently and by hand — `Superpave!C38` carries the "weight of mix +
//  calibration" formula and D38..J38, the identical quantity for the other
//  seven bowls, are typed; `Superpave!C41:E41` compute MSG and F41:J41 do
//  not; `Calculations!E67` has the joint-core pay formula and F67:N67 do
//  not. Hard-coding "this quantity is computed" would be wrong on most
//  columns of most of those rows. Asking the template is right on all of
//  them and costs one function.
//
//  The third case is `writeOver()`: we hold a value whose INPUTS we do not
//  hold (a CT index with no load/displacement curve behind it). Excel
//  recalculates on open, so its formula has to be dropped and the value
//  written plain, or the archived copy shows an empty cell. Same rule, same
//  reason, as the MixPack generator — docs/sitemanager-handoff.md, "two
//  write modes".
//
//  ---- WHERE THE ADDRESSES COME FROM -----------------------------------
//
//  Two places, and the split is deliberate.
//
//  `addresses.mjs` is the LOADER's map: where MEDL reads each field. That is
//  derived from `t_tst_rslt_dtl` and `check_addresses.mjs` proves it still
//  reproduces it, so nothing may be added to it that the loader does not
//  read. But 439 of the 621 addresses it names are cells KYTC's template
//  COMPUTES — `Superpave!N3` (producer code) is `IF('Pay Values'!D29="","",
//  'Pay Values'!D29)`, `Superpave!J14` (air voids) is arithmetic over
//  specimen weights. Writing those directly would produce a workbook Excel
//  blanks on open.
//
//  So the second place is `INPUTS` below: the cells a technician actually
//  types, which the loader never reads because it reads their results. Those
//  belong here rather than in addresses.mjs, and every one of them is cited
//  against the template formula that consumes it. Derived 2026-09-13 against
//  AMAW_VER14_01 and two completed Version 13.3 lots (contract 252112);
//  `check_mapper.mjs` beside this file round-trips both.
//
//  ---- WHAT THIS DOES NOT DO -------------------------------------------
//
//  * Pay arithmetic. `pay.mjs` is the pay model and it is imported, never
//    re-implemented — the per-core pay row on `Calculations` is filled by
//    calling `laneCorePay()` / `jointCorePay()`.
//  * The KYCT load/displacement curve (`KYCT Data Sublot # n` rows 31+).
//    Same call Jake made for DesignBook: the CT index is enough, the raw
//    curve is out of scope. The index is therefore a `writeOver()`.
//  * `Calculations!AD1` and `!C20`. Two literals both real lots carry and
//    nothing in the workbook explains. Named in UNCLASSIFIED, reported every
//    run, never guessed at — same rule addresses.mjs follows for sn 253.
//
//  Read docs/amaw-map.md first. It is the survey this mapper implements.

import {
  AGGREGATE, BLOCKS, CALC, CORES, GRADATION, KYCT, LOT, PAY,
  PERFORMANCE, SUBLOT, SUBLOT_OF, VERIFY, HAMBURG, addressOf,
} from './addresses.mjs';
import { laneCorePay, jointCorePay, MCL } from './pay.mjs';
// The Superpave mixture-type table. It lives in intake.mjs because that is
// where the approval is read, and there is one copy of it for the same
// reason there is one CONFIG.SECTIONS.
import { mixTypeFor, ADJUSTMENT_UNIT_PRICE } from './intake.mjs';
// The five AC determination methods and the code `Calculations!AP..` holds
// for each. In sections.mjs because the FORM is where they are picked, and
// one definition for the same reason there is one CONFIG.SECTIONS: the
// words and the codes cannot be allowed to drift, and a drifted label
// fails silently - VLOOKUP(.., FALSE) on a code nobody wrote is just blank.
import { acMethodCode } from './sections.mjs';

// =====================================================================
//  Address plumbing
// =====================================================================
// addresses.mjs keeps its quoting helpers private (they are an
// implementation detail of `addressOf`). Three lines is cheaper than
// widening that module's surface, and the spelling is asserted identical by
// check_mapper.mjs — an address built here and one built there have to be
// the same string or the diff is meaningless.
const quote = (sheet) => (/[^A-Za-z0-9_.]/.test(sheet) ? `'${sheet}'` : sheet);
export const A = (sheet, cell) => `${quote(sheet)}!${cell}`;

// A column letter n places right of `col`. "Q" + 1 -> "R", "Z" + 1 -> "AA".
// The workbook's own INDIRECTs do this with CHAR(81 + index); this is the
// same arithmetic without the 26-column ceiling that has.
export function colShift(col, n) {
  let x = 0;
  for (const ch of col) x = x * 26 + (ch.charCodeAt(0) - 64);
  x += n;
  let out = '';
  while (x > 0) { const r = (x - 1) % 26; out = String.fromCharCode(65 + r) + out; x = (x - r - 1) / 26; }
  return out;
}

// =====================================================================
//  INPUTS — the typed cells, which the loader's map cannot name
// =====================================================================
// Every entry cites the template formula that reads it, so a future KYTC
// revision can be re-checked one line at a time rather than wholesale.
export const INPUTS = {
  // 'Pay Values' rows 29-34: the blend AS TYPED. `Superpave!N3:Q8` are all
  // IF(x="","",x) pass-throughs of these six rows, which is why the blend is
  // entered here and read there.
  blend: {
    sheet: 'Pay Values', first: 29, count: AGGREGATE.count,
    cols: { producer: 'B', agpNumber: 'D', typeSize: 'F', matCode: 'H', pct: 'J' },
  },

  // 'Pay Values'!A13:A16 — the JMF %AC the lot is paid against, one row per
  // sublot. Its neighbours (E = target %AV, H = minimum %VMA) are formulas
  // off Calculations!H13/J1, so only column A is typed.
  jmfAc: { sheet: 'Pay Values', first: PAY.sublot.first, stride: PAY.sublot.stride, col: 'A' },

  // The SPEC MINIMUM VMA the lot is judged against, one per sublot beside
  // the JMF %AC. Checked in the shipped template: H13:H16 carry NO formula
  // - they are typed cells exactly like column A - while their neighbour
  // E13 (target %AV) IS a LOOKUP on Calculations!J1. That asymmetry is why
  // an earlier comment lumped the two together and skipped both, and it
  // cost a real number: `'Pay Values'!J13 = IF(I13="","",(I13-H13))`, so a
  // blank H13 reads as 0 in Excel and the VMA pay deviation becomes the
  // sublot's RAW VMA (~15.6) instead of its margin above the minimum
  // (~0.6). Not a blank - a wrong number, in the pay chain.
  minVma: { sheet: 'Pay Values', first: PAY.sublot.first, stride: PAY.sublot.stride,
            col: PAY.sublot.cols.minVma },

  // Pavement wedge tons, taken off the top of the lot tonnage before the
  // adjustment: `J24 = IF(J21="","",(((J21-100)*(F4-J20)*F5/100)))`, and the
  // loader reads it as sn 103. `lot_wedge_tons` has been a typed field with
  // an alias since the mapper was written and nothing ever wrote it - an
  // aliased field with no write is the quietest gap there is, because a grep
  // finds the alias and stops.
  wedgeTons: A('Pay Values', PAY.lot.wedgeTons),

  // The binder header. B46 (LAP number) is read by `Field Rutting!B15` and by
  // the loader's sn 112; C46 is the "% and type of additive" free text.
  binderProducer: A('Pay Values', PAY.lot.binderProducer),
  additive: A('Pay Values', PAY.lot.additive),
  sampleIdPrefix: A('Pay Values', LOT.sampleIdPrefix),

  // `Superpave` gyratory pucks: two per sublot, six rows apart, matching
  // SUBLOT.volumetric's stride. F/G/H (bulk volume, BSG, unit weight) are all
  // formulas over these three columns.
  specimens: {
    sheet: SUBLOT.sheet, first: 12, stride: SUBLOT.volumetric.stride, count: 2,
    cols: { wtAir: 'C', wtWater: 'D', wtSsd: 'E' },
  },

  // The Gmm (the sheet calls it MSG) bowls: two per sublot across columns
  // C..J, plus the hand-mixed check sample in M/N. Row 38 is the sum of 36
  // and 37 and row 41 the MSG itself — but only in the FIRST column of each
  // (C38, C41:E41); the rest are typed, which is exactly why `write()` asks
  // the template per cell instead of assuming.
  gmm: {
    sheet: SUBLOT.sheet,
    cols: [['C', 'D'], ['E', 'F'], ['G', 'H'], ['I', 'J']],
    handMixed: ['M', 'N'],
    rows: { mix: 36, calibration: 37, total: 38, final: 39, absorbed: 40, msg: 41 },
  },
  handMixedAc: A(SUBLOT.sheet, SUBLOT.handMixed.binderPct),

  // Moisture content of the mixture, one column per sublot. `Superpave!G48`
  // is the % and it is subtracted from the back-calculated AC in
  // `Gradation!D33`, so a missing moisture row moves the accepted %AC.
  moisture: {
    sheet: SUBLOT.sheet, cols: ['G', 'H', 'I', 'J'],
    rows: { panAndMixBefore: 45, panAndMixAfter: 46, pan: 47 },
  },

  // POLISH RESISTANT DATA, `Superpave!Q21:S24`, one row per sublot. Not in
  // the staging map at all — it is on the printed sheet and KYTC's own
  // record, and MEDL never receives it. Carried because the workbook is an
  // archived document as well as a payload.
  polish: { sheet: SUBLOT.sheet, first: 21, stride: 1, cols: { date: 'Q', coarsePct: 'R', finePct: 'S' } },

  gyrationsNdes: A(SUBLOT.sheet, 'R29'),

  // Recycle. V8 is the lot's %AC in the RAP; R11:U11 is the AC contributed
  // per sublot, and `Superpave!R12` (virgin binder) and R13 (effective
  // replacement) are computed from them.
  recycle: { sheet: SUBLOT.sheet, lotAc: 'V8', acFromRecycle: { row: 11, cols: AGGREGATE.pctCols } },

  // `Gradation`: grams retained per sieve, one column per sublot. C/F/I/L
  // (percent retained) and D/G/J/M (percent passing, which is what the
  // loader reads) are all formulas over these.
  gradation: {
    sheet: GRADATION.sheet, first: GRADATION.first, cols: ['B', 'E', 'H', 'K'],
    panRow: 24, totalRow: 25,
    // B/E/H/K are GRAMS RETAINED; C/F/I/L are % retained = (B/B25)*100 and
    // D/G/J/M are % passing derived from those. PlantBook's form collects
    // % PASSING and has no total mass, so grams cannot be recovered from it —
    // Jake's call 2026-09-14 was to write the two derived columns over their
    // formulas and leave grams blank.
    //
    // BOTH of the pair have to be written, never just the passing one.
    // `Superpave!O14` — the D/A dust ratio, a staged loader field — is
    // `IF(OR(Gradation!D23="",L14=""),"",IF((100-Gradation!C23)/L14>1.6,">1.6",...))`:
    // it GATES on the passing column and DIVIDES using the retained one. Fill
    // D23 alone and C23 stays blank, so `100-C23` is 100, the ratio is ~20,
    // and MEDL is handed a confident ">1.6" on every block. Checked in the
    // shipped template, not inferred.
    retainedCols: ['C', 'F', 'I', 'L'],
    passingCols: ['D', 'G', 'J', 'M'],
    dateRow: 6, dateCols: ['D', 'G', 'J', 'M'],
    // Row 32 is "As Tested % AC"; row 33 subtracts the moisture and row 34
    // back-calculates from the ignition furnace. `Superpave!B14` — the
    // loader's "% Binder in Mix" — reads row 33, so 32 is the typed one.
    acRow: 32, acCols: ['D', 'G', 'J', 'M'],
  },

  // `Cores`: the three weights behind the bulk specific gravity, plus the
  // core density itself. G (Gsb) and I (% solid) are formulas; H is NOT, in
  // this template, so a lot types it — another asymmetry `write()` absorbs.
  cores: { sheet: CORES.sheet, cols: { wtAir: 'D', wtWater: 'E', wtSsd: 'F', density: 'H' } },

  // Per-core pay, the row `Cores!J10:J45` reads. Sixteen lane slots (four
  // per sublot) from column E, eight joint slots (two per sublot) from
  // column E on their own row. Filled by calling pay.mjs — never by
  // reimplementing a band edge here.
  corePay: { sheet: CALC.sheet, lane: { row: 34, first: 'E' }, joint: { row: 67, first: 'E' } },

  // The blend's contribution to the combined Gsb: pct / BOD per component
  // per sublot. `Superpave!R9` is 100/SUM(D133:D138), so the combined Gsb —
  // and through it every VMA on the sheet — comes off this block.
  //
  // VER 14.01 wires the whole block (`D133` is C133/B133, and B/C are
  // pass-throughs of `Superpave!Q3`/`R3`), so on that template every one of
  // these lands in `evalOnly` and Excel recomputes it. The 13.3 lots on file
  // type rows 134-138 as literals, which is why they show up as typed cells
  // there. Carried either way rather than assuming a version: `write()` asks
  // the template, so the same code is right on both.
  gsbContribution: { sheet: CALC.sheet, first: 133, cols: ['D', 'G', 'J', 'M'] },

  // `Super Verify` — QA01 and IQ01. The same shapes as the QC side with its
  // own strides; see VERIFY in addresses.mjs for the read side.
  verify: {
    sheet: VERIFY.sheet,
    specimens: { first: 8, stride: VERIFY.stride, count: 2, cols: { wtAir: 'C', wtWater: 'D', wtSsd: 'E' } },
    gmm: { cols: [['C', 'D'], ['E', 'F']], rows: { mix: 20, calibration: 21, total: 22, final: 23, absorbed: 24, msg: 25 } },
    // Same pair as the QC side: 'Super Verify'!C33 = (B33/B48)*100 and
    // D33 = IF(B33="","",(100-C33)), both formulas, both written over.
    gradation: { first: VERIFY.gradation.first, cols: ['B', 'E'], panRow: 47, totalRow: 48,
      retainedCols: ['C', 'F'], passingCols: ['D', 'G'] },
    moisture: { cols: ['M', 'N'], rows: { panAndMixBefore: 36, panAndMixAfter: 37, pan: 38 } },
    inspectorId: VERIFY.technician,      // E5 / E12
    inspectorName: ['H5', 'H12'],
    sublotIndex: CALC.verifySublotIndex, // Calculations!L1 / L2, what every INDIRECT resolves through
  },

  // `Performance Specimens`: two banks of twelve, each bank split into two
  // sixes with its own average. Volume, bulk Gsb and % air voids are all
  // formulas over these four rows.
  performance: {
    sheet: PERFORMANCE.sheet,
    banks: [
      { cols: ['B', 'C', 'D', 'E', 'F', 'G'], rows: { thickness: 34, dry: 35, ssd: 36, water: 37, gmm: 40, airVoids: 41 } },
      { cols: ['I', 'J', 'K', 'L', 'M', 'N'], rows: { thickness: 34, dry: 35, ssd: 36, water: 37, gmm: 40, airVoids: 41 } },
      { cols: ['B', 'C', 'D', 'E', 'F', 'G'], rows: { thickness: 49, dry: 50, ssd: 51, water: 52, gmm: 55, airVoids: 56 } },
      { cols: ['I', 'J', 'K', 'L', 'M', 'N'], rows: { thickness: 49, dry: 50, ssd: 51, water: 52, gmm: 55, airVoids: 56 } },
    ],
  },

  // `Field Rutting`, which is IDT-HT and IDEAL-RT rather than Hamburg
  // whatever the loader's field labels say (HAMBURG in addresses.mjs, and
  // docs/amaw-map.md). Six specimens each. Diameter and thickness are read
  // from rows 28/29 by the table above them, so those are the typed cells.
  rutting: {
    sheet: HAMBURG.sheet,
    idt: { load: 'D', strength: 'E', first: 19, count: 6, dims: { diameter: 28, thickness: 29, first: 'B' } },
    ideal: { load: 'L', index: 'M', first: 19, count: 6, dims: { diameter: 28, thickness: 29, first: 'I' } },
  },

  // `KYCT Data Sublot # n`: the per-specimen header. The raw curve at rows
  // 31+ is deliberately out of scope (see the header).
  kyct: { header: { sampleId: 22, tempC: 23, airVoids: 24, diameter: 25, thickness: 26 } },

  // The two flat tabs. `Project Items` is the sheet the pay-estimate lookup
  // already fills for DesignBook, identical columns — that work transfers
  // whole (docs/amaw-map.md).
  projectItems: { sheet: 'Project Items', firstRow: 6, lastRow: 99, cols: { project: 'A', line: 'B', qty: 'C', unit: 'D' }, UNIT: 'TON' },
  certTechs: { sheet: 'Cert. Techs', firstRow: 2, lastRow: 31, cols: { smId: 'B', name: 'C' } },
};

// The control flags. All four drive pay.mjs as well, so the names match its
// argument names rather than the cells'.
export const FLAGS = {
  mixTypeCode: A(CALC.sheet, 'J1'),            // 1-5,14 are the Superpave family
  jointDensity: A(CALC.sheet, 'M11'),          // the checkbox; H11 = IF(M11,1,2)
  densityOption: A(CALC.sheet, CALC.densityOption),   // 1 = A, 2 = B
  acceptanceMethod: A(CALC.sheet, CALC.acceptanceMethod), // "Volumetrics" / "Gradation" / "Visual"
  esalClass: A(CALC.sheet, CALC.esalClass),
  binderGradeKey: A(CALC.sheet, CALC.binderGradeKey),
  perfSpecMadeWith: A(CALC.sheet, CALC.perfSpecMadeWith),
  lotNumber: A(CALC.sheet, 'BK1'),             // 'Pay Values'!F3 = VALUE(this)
  // The AC determination method: AP holds the CODE, AU the label, and
  // AU33:AU38 is ONE shared formula - IF(AP33="","",VLOOKUP(AP33,
  // AJ$33:AK$37,2,FALSE)) - over all six rows, verified in both real
  // lots. So AP is what a human fills and what we write; AU is supplied
  // as well, but only so the staging bank resolves it (the evaluator
  // does not do VLOOKUP), which is what `write()`'s evalOnly mode is for.
  // AP33/AP34 are the two verification rows - AQ33/AQ34 caption them
  // "Super Verify # 1"/"# 2" - and they sit ABOVE AP35:AP38, not after.
  sublotAcceptanceCode: { first: 35, stride: 1, col: 'AP', sheet: CALC.sheet,
                          verify: ['AP33', 'AP34'] },
  // NOTE the sheet: CALC.sublotAcceptanceMethod carries none of its own,
  // and reading `.sheet` off it produced the address "undefined!AU35" -
  // so every label write landed nowhere and nothing said so. It went
  // unseen because check_mapper.mjs read the label back through the same
  // expression, so both sides agreed on a cell that does not exist.
  sublotAcceptanceLabel: { ...CALC.sublotAcceptanceMethod, sheet: CALC.sheet }, // AU35.. / AU33,AU34
};

// Two literals both completed lots carry that nothing in the workbook
// explains. Reported every run rather than guessed at — the same treatment
// addresses.mjs gives sn 253.
export const UNCLASSIFIED = [
  { cell: A(CALC.sheet, 'AD1'), why: 'both real lots hold 1; the template is blank and no formula reads it' },
  { cell: A(CALC.sheet, 'C20'), why: 'template holds 1, both real lots hold 0; no formula reads it' },
];

// =====================================================================
//  Coercion
// =====================================================================
// Same three helpers mixpackCells uses, same names, so the two mappers read
// alike. `amNum` returns null rather than NaN — a lot is mostly empty and a
// NaN written into a workbook is a #VALUE! nobody can trace back.
const amNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const amStr = (v) => (v == null ? '' : String(v).trim());
const amHas = (v) => v !== null && v !== undefined && v !== '';

/** Excel serial date (days since 1899-12-30) from an ISO date, or a number
 *  already in serial form. Both real lots store dates as serials. */
export function amDateSerial(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return amNum(v);
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Excel time fraction from "HH:MM", or a fraction already. docs/amaw-map.md:
 *  0.9125 is 21:54, NOT the HHMM the stale AMAMAW sheet claims. */
export function amTimeFraction(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || '').trim());
  if (!m) return amNum(v);
  return (+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400;
}

// =====================================================================
//  THE FORM'S KEYS, IN THE MAPPER'S WORDS
// =====================================================================
/**
 * PlantBook's schema prefixes every lot scalar `lot_` and sections.mjs says
 * why: both books share `state.extracted.scalars`, so `county`, `unit` and
 * `binder_grade` would otherwise be one key holding two different records'
 * values. This mapper was written against the WORKBOOK, where the same
 * quantities have the names check_mapper.mjs reads back out of a real lot.
 *
 * The two vocabularies never met, and the failure was silent in the worst
 * way (found 2026-09-13): `v.county`, `v.unit_price`, `v.esal_class` and the
 * rest were plain `undefined` on a lot built from the form, `write()` skips
 * an absent value by design, and so a generated AMAW carried no county, no
 * unit price, no lab ids - and no `Calculations!J1` or `!D15`, which is not
 * cosmetic: every property in the pay schedule gates on those two and pays
 * ZERO without them. Six cells reached the workbook out of the whole header.
 *
 * A table rather than a prefix strip, because five of them say it
 * differently on the two sides (`lot_kytc_lab` -> `kytc_lab_id`,
 * `lot_ps_lab` -> `ps_lab_id`, `lot_binder_terminal` -> `binder_producer`,
 * `lot_handmix_binder_pct` -> `hand_mixed_ac`, `lot_mix_id` ->
 * `mix_id_line`) and one is spelled the same on both (`lot_tons`). Listing
 * every key, exceptions included, is what makes this checkable against
 * sections.mjs - check_sections.mjs asserts both directions.
 *
 * A value already under the mapper's own name WINS: check_mapper.mjs builds
 * its `values` straight off a real workbook, and a form key that is not
 * there must not overwrite it.
 */
export const LOT_FIELD_ALIASES = {
  lot_county: 'county',
  lot_nominal_size: 'nominal_size',
  lot_mix_id: 'mix_id_line',
  lot_tons: 'lot_tons',
  lot_unit: 'unit',
  lot_wedge_tons: 'wedge_tons',
  lot_esal_class: 'esal_class',
  lot_acceptance_method: 'acceptance_method',
  lot_density_option: 'density_option',
  lot_joint_density: 'joint_density',
  lot_kytc_lab: 'kytc_lab_id',
  lot_ps_lab: 'ps_lab_id',
  lot_binder_terminal: 'binder_producer',
  lot_binder_grade: 'binder_grade_key',
  lot_additive: 'additive',
  lot_handmix_binder_pct: 'hand_mixed_ac',
  // lot_equipment_verified_qa/_iq REMOVED 2026-09-14 - moved from lot-wide
  // scalars into the `verification` row table's own `equipment_verified`
  // column (LOT_TABLE_ROUTES above), one per record's own slot rather than
  // one shared answer four tabs could each try to set. See lotRecords()'s
  // write step for the "Yes"/"No" -> boolean conversion that moved with it.
};

/** "Yes"/"No" -> the BOOLEAN `Calculations!M1`/`M2` hold, not the 1/2 the
 *  formulas above them produce. `O1 = IF(M1,1,2)`, so 1 is Yes and 0 is No -
 *  and a TEXT value would make `IF("No",1,2)` a #VALUE! rather than a flag.
 *  Converted here for the same reason `joint_density` is: a value already
 *  under the mapper's own name is in M1's words, and check_mapper reads M1. */
const YES_NO_BOOL = { YES: 1, Y: 1, TRUE: 1, '1': 1, NO: 0, N: 0, FALSE: 0, '0': 0, '2': 0 };

/** The FORM spells the density option the way the proposal writes it
 *  ("Option A" / "Option B"), which is deliberate - see sections.mjs -
 *  while `Calculations`!H12 holds 1 or 2. Converted here rather than
 *  written as a letter into a cell whose own IFs only ever test 1 and 2. */
const DENSITY_OPTION_CODES = { A: 1, B: 2 };

/** A THIRD seam, and the narrowest: the three figures the pay schedule is
 *  measured against live on the lot's `values.design` block, because they
 *  come off the approval rather than off the form (intake.mjs writes them
 *  there, and the Lot Pay step prints them as READOUTS - a signature that
 *  covers a value and a form that lets someone retype it are contradictory).
 *  The mapper reads them at the top of `values`, so nothing connected them.
 *
 *  Measured 2026-09-14 on a lot shaped the way intake.mjs actually builds
 *  one: `'Pay Values'!A13:A16`, `H13:H16` and `J20` were ALL unwritten.
 *  A13 at least raised a `need()`; the other two were silent.
 *
 *  `target_va` is deliberately absent: `'Pay Values'!E13` is a LOOKUP on
 *  `Calculations!J1`, so Excel supplies it and writing it would land in
 *  evalOnly. Checked in the shipped template rather than assumed - its
 *  neighbour H13 carries no formula at all, which is exactly why the two
 *  were lumped together and both skipped. */
const DESIGN_LIFTS = {
  jmf_ac: 'jmf_ac', min_vma: 'min_vma',
  // 'Pay Values'!D7, "Approved Mix Design:" - KYTC's own sample id for the
  // APPROVAL ("07640AMD260403" in both real lots), and the cell `t_smpl`
  // actually reads. Nothing supplied it until 2026-09-15; generate.mjs has
  // been naming it as missing since it was written. DesignBook builds exactly
  // this string for the MixPack's own `Design Data!C10`, so PlantBook derives
  // it the same way rather than inventing a second convention - see
  // approvalSampleId() on the page, which is where the district table lives.
  approved_mix_design: 'approved_mix_design',
};

/** The lot's scalars under the names this file reads them by. */
export function lotScalars(values) {
  const v = values || {};
  const out = {};
  for (const from of Object.keys(LOT_FIELD_ALIASES)) {
    const val = v[from];
    if (val !== undefined && val !== null && val !== '') out[LOT_FIELD_ALIASES[from]] = val;
  }
  // THE ADJUSTMENT UNIT PRICE IS A SPEC CONSTANT AND NO LONGER A FIELD
  // (Jake, 2026-09-15: "unit price is a constant at 50 and really doesn't even
  // need to be shown in here... we don't need anyone editing it"). 2026 Std
  // Spec 402.05.02 defines it - all three Lot Pay Adjustment Schedules open
  // `($50.00)(Quantity)` whatever the mix - and KYTC's own blank AMAW ships
  // `'Pay Values'!F5` as a hard-coded 50. A box asking a technician to confirm
  // it could only ever be got wrong: it is not this contract's bid price, and
  // typing that in (which the lookup briefly did) puts a number 2.4x too large
  // into every dollar adjustment. Supplied here so the workbook still gets it.
  // A value already under the mapper's own name WINS, the same rule as every
  // other entry above: check_mapper.mjs reads F5 out of a real completed lot
  // and must keep testing the workbook rather than this constant.
  if (out.unit_price === undefined) out.unit_price = ADJUSTMENT_UNIT_PRICE;
  const d = DENSITY_OPTION_CODES[String(out.density_option == null ? '' : out.density_option).trim().toUpperCase()];
  if (d) out.density_option = d;
  // Calculations!M11 is a BOOLEAN and H11 is IF(M11,1,2) on top of it, while
  // the form spells joint density the way H11 READS: 1 = yes, 2 = no. Left
  // alone, a "2" writes a truthy 2 into M11 and the workbook reads it back as
  // YES - a lot that takes no joint cores paid as though it should have had
  // them, on a 15% weight. Converted here, and only for a value that came off
  // the form: check_mapper.mjs reads M11 itself and is already in M11's words.
  if (out.joint_density !== undefined) {
    const jd = Number(out.joint_density);
    if (jd === 1 || jd === 2) out.joint_density = jd === 1 ? 1 : 0;
  }
  // The two equipment flags used to live here (form words -> M1/M2's
  // boolean) - REMOVED 2026-09-14, moved to the `verification` row table's
  // own `equipment_verified` column (LOT_TABLE_ROUTES) now that a record
  // lives on one of four possible Sublot tabs rather than being a single
  // lot-wide scalar. The SAME "Yes"/"No" -> boolean conversion (YES_NO_BOOL)
  // now happens at the write site in lotRecords()'s per-record loop instead
  // of here, since `lotScalars()` never sees a per-record value at all.
  // Calculations!J1 is a TRANSLATION of the nominal size and not a field at
  // all (sections.mjs), so a lot built on the form carries no code to read.
  // Derived here, once, where every reader below already looks.
  if (out.mix_type_code == null && v.mix_type_code == null) {
    const mt = mixTypeFor(out.nominal_size || '');
    if (mt) out.mix_type_code = mt.code;
  }
  // The approval's own figures, lifted out of `values.design`. Same rule as
  // every other translation here: a value already under the mapper's own
  // name wins, because check_mapper.mjs reads these cells off a real
  // workbook and is already speaking the mapper's words.
  const design = v.design || {};
  for (const from of Object.keys(DESIGN_LIFTS)) {
    const to = DESIGN_LIFTS[from];
    if (design[from] !== undefined && design[from] !== null && design[from] !== ''
        && v[to] === undefined) out[to] = design[from];
  }
  return { ...out, ...v };
}

// =====================================================================
//  THE SECOND SEAM: flat form TABLES -> the seven test records
// =====================================================================
//
// LOT_FIELD_ALIASES above is this seam for SCALARS. This is the same seam for
// ROWS, and it went unbuilt for a day longer: PlantBook's form produces flat
// tables keyed by an identity column at `lot.rows.<key>`, while everything
// below reads `lot.records[block].values` / `.rows.<name>`. Measured before
// this existed: a lot with 15 filled tables and 72 rows wrote 13 cells and
// left all seven records empty, and only the lot header landed.
//
// It is a TABLE and not a convention for the reason CLAUDE.md already
// records: a convention is invisible the moment it stops holding, and
// `undefined` is the quietest failure in this codebase. check_sections.mjs
// fails both directions off it.
//
// A value already under the mapper's own name WINS, exactly as it does for
// the scalars — check_mapper.mjs builds its records straight off two real
// completed AMAWs, so it must pass through here untouched.

/** Workbook sieve row -> the FORM's sieve key, BY INDEX INTO
 *  `GRADATION.sieves`, because the two spell the same sieve differently and
 *  a label match silently loses one.
 *
 *  The workbook writes `1 1/2"` (space) where the form writes `1-1/2"`
 *  (hyphen) — checked, not assumed — so a bridge that matched on the label
 *  would drop the 37.5 mm sieve from the JMF target AND all six measured
 *  columns of every lot, with nothing said. Index 6 is the 1/4", which
 *  CLAUDE.md records as dead on both books and absent from the form; it is
 *  `null` here and must stay null rather than being removed, or every sieve
 *  below it shifts up a row. NEVER renumber this to match the form's list. */
export const JMF_SIEVE_KEYS = [
  's50', 's37_5', 's25', 's19', 's12_5', 's9_5',
  null,              // 1/4" — on the workbook, never on the form
  's4_75', 's2_36', 's1_18', 's0_6', 's0_3', 's0_15', 's0_075',
];

/** The Gradation step is not a row table: its values live in `values` under
 *  composed `${column}_${sieve}` keys. This is which block each column is. */
export const GRADATION_COLUMNS = {
  jmf: null,            // lot-level: the JMF target, not a record
  sub1: 'QC01', sub2: 'QC02', sub3: 'QC03', sub4: 'QC04',
  qa: 'QA01', iq: 'IQ01',
};

/**
 * Every PlantBook row table, and where its rows go.
 *
 *   by      'sublot'  the identity cell holds "<lot>-<sublot>"; block QC0n
 *           'record'  the identity cell names the record (QA01 / IQ01)
 *           'lot'     lot-level; no block
 *   into    'values'  merge `cols` onto records[block].values
 *           'rows.X'  push a row onto records[block].rows.X
 *           'rows@X'  lot-level rows.X on the lot itself
 *   id      the identity column, excluded from the emptiness test
 *   slot    column holding a 1-based slot, emitted 0-based as `slot`
 *   cols    form column -> record key. A column mapped to `null` is a
 *           DELIBERATE drop and must say why in `drop`.
 */
export const LOT_TABLE_ROUTES = {
  // -- the four production sublots ------------------------------------
  sublot_tickets: {
    by: 'sublot', id: 'sublot', into: 'values',
    cols: {
      date: 'date', time: 'time', truck: 'truck',
      tons_cum: 'tons',                 // RENAME: cumulative ticket tonnage
      temperature: 'temperature', binder_lot: 'binder_lot', tack_lot: 'tack_lot',
      technician: 'tested_by',          // RENAME
      ac_method: 'acceptance_label',    // RENAME; the CODE is derived from it
    },
  },
  sublot_bsg: {
    by: 'sublot', id: 'sublot', slot: 'specimen', into: 'rows.specimens',
    cols: { wt_air: 'wt_air', wt_water: 'wt_water', wt_ssd: 'wt_ssd' },
    drop: { bulk_volume: 'Superpave F = ROUND(E-D,1), a template formula',
            bsg: 'Superpave G = ROUND(C/F,3), a template formula' },
  },
  sublot_msg: {
    by: 'sublot', id: 'sublot', slot: 'specimen', into: 'rows.gmm',
    cols: { wt_mix: 'wt_mix', calibration: 'calibration', final_wt: 'final_wt',
            absorbed_water: 'absorbed_water', msg: 'msg' },
  },
  sublot_moisture: {
    by: 'sublot', id: 'sublot', into: 'values',
    cols: { wt_before: 'moisture_before', wt_after: 'moisture_after',
            wt_pan: 'moisture_pan' },   // three RENAMEs, as on the verify side
    drop: { moisture: 'Superpave G48, a formula over the three weights' },
  },
  sublot_volumetrics: {
    by: 'sublot', id: 'sublot', into: 'values',
    // `binder_pct` is COMPUTED now (back-calculated from Gse and this
    // sublot's Gmm, less the moisture) and there is no cell to write it to -
    // `Gradation`!D32 is dead. Carried as `ac_pct` all the same so a lot
    // saved before that change still reaches volumetrics.mjs's fallback.
    cols: { binder_pct: 'ac_pct' },
    drop: { gmb: 'Superpave G14, a formula over the specimen weights',
            gmm: 'Superpave I14', va: 'Superpave K14', pbe: 'Superpave L14',
            vma: 'Superpave M14', vfa: 'Superpave N14', dust_ratio: 'Superpave O14' },
  },
  // -- the Department's two samples -----------------------------------
  verification: {
    by: 'record', id: 'record', into: 'values',
    // `equipment_verified` added 2026-09-14: moved here from a lot-wide
    // scalar (`lot_equipment_verified_qa`/`_iq`, LOT_FIELD_ALIASES below)
    // now that a record lives on one of four possible Sublot tabs -
    // repeating a scalar `data-field` across four tabs is the unsafe kind
    // of duplication (collectForm() overwrites by DOM order), while a row
    // column scoped to this one record's own slot is not. See the write
    // step below for the "Yes"/"No" -> boolean conversion that moved with
    // it (lotScalars() no longer sees this value at all).
    cols: { sublot_verified: 'sublot_verified', technician: 'tested_by',
            ac_method: 'acceptance_label', equipment_verified: 'equipment_verified' },
  },
  verify_bsg: {
    by: 'record', id: 'record', slot: 'specimen', into: 'rows.specimens',
    cols: { wt_air: 'wt_air', wt_water: 'wt_water', wt_ssd: 'wt_ssd' },
    drop: { bulk_volume: "'Super Verify' F = E-D, a formula",
            bsg: "'Super Verify' G = C/F, a formula",
            sublot: 'page-only join key (computeVerification(), 2026-09-14) - not read by the mapper' },
  },
  verify_msg: {
    by: 'record', id: 'record', slot: 'specimen', into: 'rows.gmm',
    cols: { wt_mix: 'wt_mix', calibration: 'calibration', final_wt: 'final_wt',
            absorbed_water: 'absorbed_water', msg: 'msg' },
    drop: { sublot: 'page-only join key (computeVerification(), 2026-09-14) - not read by the mapper' },
  },
  verify_moisture: {
    by: 'record', id: 'record', into: 'values',
    cols: { wt_before: 'moisture_before', wt_after: 'moisture_after',
            wt_pan: 'moisture_pan' },   // three RENAMEs
    drop: { moisture: 'computed by volumetrics.mjs and by the sheet',
            sublot: 'page-only join key (computeVerification(), 2026-09-14) - not read by the mapper' },
  },
  verify_volumetrics: {
    by: 'record', id: 'record', into: 'values', cols: {},
    drop: { binder_pct: 'BACK-CALCULATED, never typed - Super Verify J27/J28',
            gmb: "'Super Verify' G", gmm: 'C25', va: 'J30', pbe: 'J31',
            vma: 'J32', vfa: 'J33',
            sublot: 'page-only join key (computeVerification(), 2026-09-14) - not read by the mapper' },
  },
  // -- cores: two banks, different strides, slot by position in its sublot
  mat_cores: {
    by: 'sublot', id: 'sublot', into: 'rows.cores', bank: 0,
    cols: { station: 'station', wt_air: 'wt_air', wt_water: 'wt_water', wt_ssd: 'wt_ssd' },
    drop: { core_id: "CONCATENATE('Pay Values'!F3,...) in the template, built not typed",
            bsg: 'Cores G, a formula', density: 'Cores H = IF(G="","",G*62.4), a formula',
            pct_solid: 'Cores I, a formula', pay_value: 'written from pay.mjs, not from the row' },
  },
  joint_cores: {
    by: 'sublot', id: 'sublot', into: 'rows.cores', bank: 1,
    cols: { station: 'station', wt_air: 'wt_air', wt_water: 'wt_water', wt_ssd: 'wt_ssd' },
    drop: { core_id: 'built from the lot number', bsg: 'formula', density: 'formula',
            pct_solid: 'formula', pay_value: 'written from pay.mjs' },
  },
  // -- lot-level ------------------------------------------------------
  handmix_msg: {
    by: 'lot', id: 'determination', into: 'rows@hand_mixed',   // RENAME of the list
    cols: { wt_mix: 'wt_mix', calibration: 'calibration', final_wt: 'final_wt',
            absorbed_water: 'absorbed_water', msg: 'msg' },
  },
  // -- already in the mapper's vocabulary; listed so the table is total --
  project_items: { by: 'lot', into: 'rows@project_items', passthrough: true,
    cols: { project: 'project', line: 'line', quantity: 'quantity', unit: 'unit' },
    drop: { description: 'screen-only: INPUTS.projectItems is A..D = project/line/qty/unit' } },
  // `blend` is identity only (producer/AGP/type & size/BOD) - the percentage
  // lives on `blend_pct` below. 2026-09-15b: the page no longer collects a
  // separate `blend` list at all (it folded producer/AGP/type & size/BOD
  // into `blend_pct` itself, one merged "Aggregate Blend" table per sublot
  // tab) - `lotRecords()` derives this route's input from `blend_pct`'s own
  // Sublot 1 rows before this table runs, so the route itself, and
  // everything downstream of it (amawCells()'s `rows.aggregate` read), is
  // unchanged. A lot saved before that merge still carries a genuine
  // `rows.blend` and takes that path unmodified.
  blend: { by: 'lot', into: 'rows@aggregate', blend: true,
    cols: { producer: 'producer', agp: 'agp_number', type_size: 'type_size', bod: 'bod' },
    drop: { component: 'identity anchor only (keeps collectForm() from dropping a blank slot out of position) - never written' } },
  // Declared orphan (`into: null`), same footing as blend_gsb below: this
  // table is read by the CUSTOM fan-out further down (search "blend_pct"),
  // not by the generic per-block routing above, because it needs to GROUP by
  // its own `sublot` cell first and then match POSITION within that group to
  // `blend`'s own row order - one column mapping cannot express that join.
  // `producer`/`agp`/`type_size`/`bod`/`design_pct` are read-only mirrors or
  // reference-only figures (sections.mjs) and carry no information the
  // workbook needs a second time - `producer`/`agp`/`type_size`/`bod` are
  // what the `blend` route above already reads, off this same table's own
  // Sublot 1 rows.
  blend_pct: { by: 'lot', into: null,
    drop: { sublot: 'groups the fan-out below, not written anywhere',
            component: 'identity anchor only (keeps collectForm() from dropping a blank slot out of position) - never written',
            producer: 'same figure the blend route above reads off Sublot 1\'s own rows',
            agp: 'same figure the blend route above reads off Sublot 1\'s own rows',
            type_size: 'same figure the blend route above reads off Sublot 1\'s own rows',
            bod: 'same figure the blend route above reads off Sublot 1\'s own rows',
            design_pct: 'the approved design\'s own blend % - reference only, not a workbook cell',
            pct: 'fans out per sublot, see the custom fan-out below' } },
  blend_gsb: { by: 'lot', into: null,
    drop: { gsb_1: 'Superpave R9:U9, a formula over the blend', gsb_2: '', gsb_3: '', gsb_4: '' } },
};

/** "<lot>-<sublot>" -> 1..4, and NOTHING else.
 *
 *  The page's own sublotIndexOf() is `/(\d+)\s*$/` and does not clamp, so it
 *  answers 0 for "1-0", 10 for "10" and 5 for "1.5". Composing `'QC0' + n`
 *  from any of those files a whole sublot's weights under a block that does
 *  not exist — confidently, and with nothing in the report. This one refuses
 *  instead, and the caller reports the refusal. */
function sublotIndex(value) {
  const m = /(\d+)\s*$/.exec(String(value == null ? '' : value).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 4 ? n : null;
}

/** The identity cell of a Department row. The `verification` table seeds it
 *  as "QA01 — Department acceptance" while `verify_bsg` seeds a bare "QA01",
 *  so match the leading token rather than the whole cell. */
function recordName(value) {
  const m = /^\s*(VI01|QC0[1-4]|QA01|IQ01)/i.exec(String(value == null ? '' : value));
  return m ? m[1].toUpperCase() : null;
}

/** Is this row worth a record at all?
 *
 *  Every FIXED PlantBook table reaches the payload at its full seeded length:
 *  collectForm keeps a row if ANY cell is non-null, and the identity columns
 *  are always painted. So routing rows unconditionally would create seven
 *  records on a brand-new lot and SILENCE every `need()` below — the mapper
 *  would stop saying "QC01 has no gyratory specimen weights" on exactly the
 *  lot that has none. A row counts only if something MEASURED is in it. */
function hasMeasurement(row, route) {
  const id = route.id;
  return Object.keys(route.cols || {}).some((k) => k !== id && amHas(row[k]));
}

/**
 * Build the seven records from the form's flat tables.
 *
 * @returns {{records: object, unmapped: string[]}}
 */
export function lotRecords(values, rows, existing) {
  const src = { ...(rows || {}) };
  // 2026-09-15b: the page merged what used to be two row-lists (`blend`,
  // identity only, six rows; `blend_pct`, this component's % per sublot)
  // into one - producer/AGP/type & size/BOD now live INSIDE `blend_pct`
  // itself, mirrored across all four sublots' own copies, edited only on
  // Sublot 1. So there is no longer a separate `src.blend` for the `blend`
  // route (LOT_TABLE_ROUTES.blend, -> rows@aggregate) or the custom pct
  // fan-out below to read - derive it here, once, from Sublot 1's own six
  // `blend_pct` rows (`sublot === "1"`), so both keep working unmodified. A
  // lot saved before this merge still carries a genuine `rows.blend` and
  // that takes precedence, unchanged.
  if (!Array.isArray(src.blend) || !src.blend.length) {
    const pct1 = Array.isArray(src.blend_pct)
      ? src.blend_pct.filter((r) => sublotIndex(r.sublot) === 1) : [];
    if (pct1.length) {
      src.blend = pct1.map((r) => ({
        component: r.component, producer: r.producer, agp: r.agp,
        type_size: r.type_size, bod: r.bod,
      }));
    }
  }
  const out = {};
  const unmapped = [];
  // Start from whatever is already in the mapper's own vocabulary. A lot read
  // back off a real workbook arrives fully formed and must come out unchanged.
  for (const b of Object.keys(existing || {})) out[b] = { ...(existing[b] || {}) };

  const block = (name) => (out[name] = out[name] || {});
  const valuesOf = (name) => {
    const r = block(name); r.values = { ...(r.values || {}) }; return r.values;
  };
  const listOf = (name, list) => {
    const r = block(name); r.rows = { ...(r.rows || {}) };
    r.rows[list] = (r.rows[list] || []).slice(); return r.rows[list];
  };

  const lotRows = {};   // lot-level lists this bridge renames into place

  // Which `records[block].rows.<list>` already came in with content. The
  // "already under the mapper's own name wins" rule has to cover ROW LISTS
  // and not just scalars: a lot read back off a real workbook carries
  // `specimens` for every sublot, and appending the form's rows to it puts
  // two specimens in slot 0 whose cells then fight over the same address.
  // Caught by a pass-through test, not by reading.
  const locked = new Set();
  for (const b of Object.keys(existing || {})) {
    const r = (existing[b] || {}).rows || {};
    for (const list of Object.keys(r)) if ((r[list] || []).length) locked.add(`${b}.${list}`);
  }

  for (const key of Object.keys(LOT_TABLE_ROUTES)) {
    const route = LOT_TABLE_ROUTES[key];
    const table = src[key];
    if (!Array.isArray(table) || !table.length) continue;
    if (route.into === null) continue;                 // declared orphan

    // -- lot-level lists: rename the list, keep the rows
    if (route.by === 'lot') {
      const name = String(route.into).slice('rows@'.length);
      const kept = [];
      table.forEach((row) => {
        // `project_items` already speaks the mapper's words, and its rows are
        // a lookup's output rather than a measurement, so it passes whole.
        if (route.passthrough) { kept.push(row); return; }
        // A blend component is a declaration, not a measurement: a row naming
        // only a producer is still a component and must keep its POSITION,
        // which is what INPUTS.blend's `first + i` assumes. So no emptiness
        // test and no compaction here.
        if (!route.blend && !hasMeasurement(row, route)) return;
        const o = {};
        for (const from of Object.keys(route.cols || {})) {
          if (amHas(row[from])) o[route.cols[from]] = row[from];
        }
        // NOTE the blend's `pct` is deliberately NOT set from pct_1.
        // mapper.mjs reads `amNum(over[i].pct) ?? amNum(c.pct)` - a NULLISH
        // fallback from the per-sublot value to this lot-level one - so
        // seeding it from sublot 1 would make a plant that adjusted its blend
        // mid-lot silently fall back to sublot 1's percentages wherever a
        // later sublot's cell was blank. Left absent, the ?? has nothing to
        // reach for and the blank stays a blank.
        kept.push(o);
      });
      if (kept.length) lotRows[name] = kept;
      continue;
    }

    // -- per-block tables
    const seen = {};
    table.forEach((row, i) => {
      const name = route.by === 'sublot'
        ? (sublotIndex(row[route.id]) ? `QC0${sublotIndex(row[route.id])}` : null)
        : recordName(row[route.id]);
      if (!hasMeasurement(row, route)) return;
      if (!name) {
        // A row dropped inside the bridge never reaches the mapper's own
        // unmapped channel, so say it here or the measurement is simply gone.
        unmapped.push(`${key} row ${i + 1}: cannot read "${route.id}" `
          + `(${JSON.stringify(row[route.id])}), so ${Object.keys(route.cols)
            .filter((k) => k !== route.id && amHas(row[k])).length} value(s) have no record`);
        return;
      }
      const mapped = {};
      for (const from of Object.keys(route.cols || {})) {
        if (from === route.id) continue;
        if (amHas(row[from])) mapped[route.cols[from]] = row[from];
      }
      if (route.into === 'values') {
        const dest = valuesOf(name);
        // The mapper's own name wins: only fill what is not already there.
        for (const k of Object.keys(mapped)) if (!amHas(dest[k])) dest[k] = mapped[k];
        return;
      }
      const list = String(route.into).slice('rows.'.length);
      if (locked.has(`${name}.${list}`)) return;   // the workbook's own rows stand
      // The slot is EXPLICIT. slotOf() falls back to array position, and a
      // table that dropped an empty row would then compact the rest upwards
      // into the wrong slots - the same shift Field Rutting already produces.
      const n = (seen[name + list] = (seen[name + list] || 0) + 1) - 1;
      const declared = route.slot ? Number(row[route.slot]) : NaN;
      const slot = Number.isFinite(declared) && declared >= 1 ? declared - 1 : n;
      const entry = { ...mapped, slot };
      if (route.bank !== undefined) entry.bank = route.bank;
      // Cores share one list across two banks, so the per-bank slot has to
      // count within its own bank rather than across both.
      if (route.bank !== undefined) {
        const k = `${name}${list}b${route.bank}`;
        entry.slot = (seen[k] = (seen[k] || 0) + 1) - 1;
      }
      listOf(name, list).push(entry);
    });
  }

  // -- the blend fans out the other way: ONE form row, four sublot records.
  //    Each component keeps its position, which is what INPUTS.blend's
  //    `first + i` already assumes.
  //
  //    The percentage does not live on blendRows - it is its own table,
  //    `blend_pct`, 24 rows (six components x four sublots) each carrying
  //    its OWN `sublot` cell - the same "group by a real identity value,
  //    never by raw array position" rule mat_cores/sublot_bsg already use,
  //    not a new one. GROUP by that cell first, THEN match POSITION within
  //    the group to blendRows' own order - safe only because both are fixed
  //    (sections.mjs's `blend_pct` and, whether real or derived above,
  //    `blendRows`), so neither can reorder or drop a MIDDLE slot out from
  //    under the other. `blendRows` here is `src.blend` - real for a lot
  //    saved before the 2026-09-15b merge, derived from `blend_pct`'s own
  //    Sublot 1 rows for one saved after it (see the top of this function).
  const blendRows = src.blend;
  const blendPctRows = src.blend_pct;
  if (Array.isArray(blendRows) && blendRows.length && Array.isArray(blendPctRows)) {
    [1, 2, 3, 4].forEach((s) => {
      const name = `QC0${s}`;
      const mine = blendPctRows.filter((r) => sublotIndex(r.sublot) === s);
      const per = blendRows.map((c, i) => ({ pct: mine[i] ? mine[i].pct : null }));
      if (!per.some((c) => amHas(c.pct))) return;
      const r = block(name); r.rows = { ...(r.rows || {}) };
      if (!r.rows.blend) r.rows.blend = per;
    });
  }

  // -- the Gradation step, which is not a row table at all
  const v = values || {};
  const grad = {};
  const gradTotals = {};
  for (const col of Object.keys(GRADATION_COLUMNS)) {
    const list = [];
    JMF_SIEVE_KEYS.forEach((key, i) => {
      if (!key) return;                      // the 1/4", absent from the form
      // WEIGHTS FIRST. The form collects cumulative grams retained since
      // 2026-09-14 and the workbook computes both percentage columns from
      // them. The `${col}_${key}` percentage is the OLDER shape and is still
      // read, so a lot saved before that change still reaches the workbook -
      // the provisional-values rule applied to a schema change.
      const grams = v[`${col}_wt_${key}`];
      const pct = v[`${col}_${key}`];
      if (amHas(grams)) list.push({ sieve: GRADATION.sieves[i], grams_retained: grams });
      else if (amHas(pct)) list.push({ sieve: GRADATION.sieves[i], pct_passing: pct });
    });
    if (list.length) grad[col] = list;
    // The pan and the total are per column and are what the percentages are
    // computed FROM - `C = (B/B25)*100` reads B25, so a column of weights
    // with no total produces nothing at all.
    const pan = v[`${col}_wt_pan`], total = v[`${col}_wt_total`];
    if (amHas(pan) || amHas(total)) gradTotals[col] = { pan, total };
  }
  for (const col of Object.keys(grad)) {
    const name = GRADATION_COLUMNS[col];
    if (!name) continue;                     // the JMF target, handled below
    const r = block(name); r.rows = { ...(r.rows || {}) };
    if (!(r.rows.gradation || []).length) r.rows.gradation = grad[col];
  }
  // The pan and total are per-RECORD values, not rows, and the mapper
  // already reads them as `rv.grams_pan` / `rv.grams_total`.
  for (const col of Object.keys(gradTotals)) {
    const name = GRADATION_COLUMNS[col];
    if (!name) continue;
    const dest = valuesOf(name);
    const { pan, total } = gradTotals[col];
    if (amHas(pan) && !amHas(dest.grams_pan)) dest.grams_pan = pan;
    if (amHas(total) && !amHas(dest.grams_total)) dest.grams_total = total;
  }

  // The JMF target is a lot-level column keyed by the WORKBOOK's sieve
  // string, which is what `jmf[sieve]` below looks it up by.
  const jmf = {};
  for (const g of grad.jmf || []) jmf[g.sieve] = g.pct_passing;

  return { records: out, unmapped, lotRows, jmf };
}

// =====================================================================
//  THE MAPPER
// =====================================================================

/**
 * @param {object} lot  a PlantBook lot envelope — scripts/amaw/storage.mjs.
 *        Identity at the top, `values` for the lot, `rows` for the blend and
 *        the two flat tabs, `records[block]` for each of the seven test
 *        records. Everything is optional: a lot mid-production has four of
 *        the seven and half of one of those.
 * @param {object} tpl  what KYTC's blank template knows about itself:
 *        { formulaAt(addr) -> string|null,  plants?: [{key,name}],  version? }
 *        `formulaAt` is the only required member and it is the whole reason
 *        this mapper gets the two write modes right on a workbook wired as
 *        inconsistently as this one.
 * @param {object} ref  the Supabase reference lists the template does not
 *        carry: { agpFor(name), ampFor(name), lapFor(terminal),
 *        matCodeFor(typeName), plantNameFor(amp) }. Every one optional.
 * @returns {{values: object, evalOnly: object, report: object}}
 */
export function amawCells(lot, tpl, ref) {
  lot = lot || {};
  const T = tpl || {};
  const R = ref || {};
  const formulaAt = typeof T.formulaAt === 'function' ? T.formulaAt : () => null;
  const call = (fn, arg) => { try { return typeof fn === 'function' ? fn(arg) : null; } catch { return null; } };

  const values = {}, evalOnly = {};
  const missing = [], notes = [], unmapped = [];
  const coverage = { lot: 0, blocks: {} };

  /** We hold the value; the template decides whether it is ours to write. */
  const write = (addr, v) => {
    if (!amHas(v) || !addr) return false;
    if (formulaAt(addr)) evalOnly[addr] = v; else values[addr] = v;
    return true;
  };
  /** We hold the value and NOT its inputs: the formula has to go, or Excel
   *  recalculates the cell to blank the moment the archived copy is opened. */
  const writeOver = (addr, v) => {
    if (!amHas(v) || !addr) return false;
    values[addr] = v;
    return true;
  };
  const need = (what, why) => missing.push(why ? `${what} - ${why}` : what);
  const note = (s) => { if (notes.indexOf(s) < 0) notes.push(s); };

  /** % passing for one sieve, written as the MATCHED PAIR the sheet needs.
   *
   *  Both columns are formulas over the grams column, and PlantBook has no
   *  grams (see INPUTS.gradation), so both are written over. Writing only the
   *  passing column leaves % retained blank and hands the dust ratio at
   *  `Superpave!O14` a confident ">1.6" — which is why this is one function
   *  called from both sheets rather than two call sites that can drift, the
   *  same rule that makes `trimFlatCoarseEnd` shared in DesignBook. */
  const writeGradationPair = (spec, col, i, pctPassing, sheet) => {
    const passing = amNum(pctPassing);
    if (passing == null) return;
    const on = sheet || spec.sheet;
    const row = spec.first + i;
    const ret = (spec.retainedCols || [])[col], pas = (spec.passingCols || [])[col];
    if (ret) writeOver(A(on, `${ret}${row}`), Math.round((100 - passing) * 1000) / 1000);
    if (pas) writeOver(A(on, `${pas}${row}`), passing);
  };

  const v = lotScalars(lot.values);
  // The form's flat tables, translated into the seven records everything
  // below reads. A lot that already carries records (one read back off a real
  // workbook) passes through untouched — see lotRecords().
  const bridged = lotRecords(lot.values, lot.rows, lot.records);
  const rows = { ...(lot.rows || {}), ...bridged.lotRows };
  const records = bridged.records;
  for (const u of bridged.unmapped) unmapped.push(u);
  const rec = (block) => records[block] || null;
  const recVals = (block) => (rec(block) || {}).values || {};
  const recRows = (block) => (rec(block) || {}).rows || {};

  // A record under a name that is not one of the seven blocks has nowhere to
  // go. Named rather than dropped — a typo'd "QC5" would otherwise cost a
  // whole sublot silently.
  for (const key of Object.keys(records)) {
    if (BLOCKS.indexOf(key) < 0) unmapped.push(`record "${key}" is not one of ${BLOCKS.join('/')}`);
  }

  // Which of the seven are actually present. A block with nothing in it is
  // not written and not complained about individually: PlantBook opens a lot
  // with one sublot and fills the rest over a week.
  const present = BLOCKS.filter((b) => {
    const r = rec(b);
    if (!r) return false;
    // An empty array is not content. `amHas([])` is true (it is neither null
    // nor ""), so the length test has to come FIRST or every block reads as
    // present and a lot with no QA sample reports a missing sublot index.
    const has = (o) => o && Object.keys(o).some((k) => (Array.isArray(o[k]) ? o[k].length > 0 : amHas(o[k])));
    return has(r.values) || has(r.rows);
  });

  // ---------------------------------------------------------------
  //  1. Lot identity — the 'Pay Values' header
  // ---------------------------------------------------------------
  const L = (key) => A(LOT.sheet, LOT[key]);
  write(L('county'), amStr(v.county));
  // LOT.itemCode ('Pay Values'!D3) is deliberately NOT written. No formula in
  // the workbook reads it and no t_* staging row sources it - it is a printed
  // header cell, and the 385 both real lots carry is the lead of the BID ITEM
  // at D9, off KYTC's own catalogue at Calculations!BB3:BF349. sections.mjs
  // carries the whole finding; nobody is asked for it, so nothing writes it.
  write(L('contract'), amStr(lot.contract_id));
  write(L('unit'), amStr(v.unit) || INPUTS.projectItems.UNIT);
  write(L('lotTons'), amNum(v.lot_tons));
  write(L('unitPrice'), amNum(v.unit_price));
  // Optional and blank in both real lots, so NO need() - a lot with no
  // pavement wedge is the ordinary case, and reporting it every run would
  // teach people to skim the report.
  write(INPUTS.wedgeTons, amNum(v.wedge_tons));
  write(L('kytcLabId'), amStr(v.kytc_lab_id));
  write(L('psLabId'), amStr(v.ps_lab_id));
  // LOT.esalClass ('Pay Values'!I4) is deliberately NOT written: that cell is
  // the anchor of a drop-down whose FmlaLink is `Calculations!D15`, so the
  // class is a value THERE and the cell itself stays empty in both real lots
  // (addresses.mjs, CALC.esalClass). Writing it would put a number on the
  // printed sheet that nothing reads.
  write(L('approverName'), amStr(v.approver_name));
  write(L('approverId'), amStr(v.approver_id));
  write(L('materialCode'), amNum(v.material_code) ?? amStr(v.material_code));
  write(L('approvedMixDesign'), amStr(v.approved_mix_design));

  // The lot number reaches 'Pay Values'!F3 through VALUE(Calculations!BK1),
  // and from there into every core id (Cores!A10 = CONCATENATE(F3,"-1-A")),
  // so writing F3 itself would be writing over the formula that makes those
  // ids. Write the source.
  write(FLAGS.lotNumber, amNum(lot.lot_number));
  if (!amHas(lot.lot_number)) need(FLAGS.lotNumber, 'the lot number; every core id is built from it');

  // `Pay Values`!D9 — "<MIX ID> <signature>". The join back to the approved
  // DesignBook design (docs/amaw-map.md); `t_smpl.rel_smpl_id` carries it.
  const mixLine = amStr(v.mix_id_line)
    || [amStr(lot.mix_id), amStr(lot.mix_signature)].filter(Boolean).join(' ');
  write(L('mixId'), mixLine);
  if (!mixLine) need(L('mixId'), 'MIX ID + signature - the join to the approved design');
  if (!amStr(v.approved_mix_design)) need(L('approvedMixDesign'), "the approval's sample id");

  // The plant code is PADDED in the template's own list ("AMP070302      ")
  // and the VLOOKUP at 'Pay Values'!C6 matches exactly, the same trap the
  // MixPack's plant list has. Take the template's spelling when we can.
  const amp = amStr(lot.amp_number) || amStr(v.plant_code);
  const tplPlant = (T.plants || []).find((p) => amStr(p.key) === amp);
  if (amp) {
    write(L('plantCode'), tplPlant ? tplPlant.key : amp);
    if (!tplPlant && (T.plants || []).length) {
      note(`${amp} is not in the template's 'Producer supplier' list; written unpadded, so 'Pay Values'!C6 will not resolve a name`);
    } else if (tplPlant && tplPlant.row > 106) {
      // KYTC's own lookup range is stale: 'Pay Values'!C6 is
      // VLOOKUP(D6,'Producer supplier'!B3:C106,2,FALSE) and the list now runs
      // past row 140, so every plant added after row 106 reads #N/A on the
      // printed sheet however correctly the code is spelled. Both completed
      // lots show exactly that for AMP070302 at row 130. Nothing to fix here
      // - the range is KYTC's - but it is worth not re-discovering.
      note(`${amp} is row ${tplPlant.row} of the template's plant list and 'Pay Values'!C6 only looks up B3:C106, so the plant NAME will read #N/A - KYTC's range, not ours; both completed lots do the same`);
    }
  } else need(L('plantCode'), 'the AMP number of the plant that produced the lot');

  // B3 is blank in BOTH completed lots — KYTC fills the sample id at
  // submission. An empty one is "not ready to hand off", not a read failure,
  // so it is reported rather than invented.
  if (amHas(v.sample_id_prefix)) write(INPUTS.sampleIdPrefix, amStr(v.sample_id_prefix));
  else need(INPUTS.sampleIdPrefix, 't_smpl.smpl_id is this prefix + the block name; both real lots leave it blank');

  write(INPUTS.binderProducer, amStr(v.binder_producer));
  write(INPUTS.additive, amStr(v.additive));
  write(INPUTS.gyrationsNdes, amNum(v.gyrations_ndes));
  write(INPUTS.handMixedAc, amNum(v.hand_mixed_ac));
  write(A(SUBLOT.sheet, INPUTS.recycle.lotAc), amNum(v.recycle_ac_pct));
  coverage.lot = Object.keys(values).length + Object.keys(evalOnly).length;

  // ---------------------------------------------------------------
  //  2. The control flags
  // ---------------------------------------------------------------
  // Everything on the sheet switches on these five, pay.mjs included, and
  // three of them are the difference between a paid lot and a zero one. A
  // lot that does not carry them is reported loudly.
  write(FLAGS.mixTypeCode, amNum(v.mix_type_code));
  write(FLAGS.esalClass, amNum(v.esal_class));
  write(FLAGS.densityOption, amNum(v.density_option));
  write(FLAGS.jointDensity, amNum(v.joint_density) ?? (v.joint_density === false ? 0 : null));
  write(FLAGS.acceptanceMethod, amStr(v.acceptance_method));
  write(FLAGS.binderGradeKey, amNum(v.binder_grade_key) ?? amStr(v.binder_grade_key));
  write(FLAGS.perfSpecMadeWith, amStr(v.perf_spec_made_with));
  for (const [key, addr, what] of [
    ['mix_type_code', FLAGS.mixTypeCode, 'mixture type code; the density and VMA pay tables pay nothing without it'],
    ['esal_class', FLAGS.esalClass, 'AADTT class; every pay band edge moves with it'],
    ['acceptance_method', FLAGS.acceptanceMethod, 'acceptance method (Volumetrics / Gradation / Visual)'],
    ['density_option', FLAGS.densityOption, 'density option A or B'],
  ]) if (!amHas(v[key])) need(addr, what);

  // Per-sublot AC DETERMINATION METHOD - how that sublot's %AC was measured.
  //
  // AP holds the code and AU the label, and AU33:AU38 is ONE shared formula
  // over all six rows - IF(AP33="","",VLOOKUP(AP33,AJ$33:AK$37,2,FALSE)) -
  // read out of both real lots rather than assumed. So the CODE is what is
  // written plain and the label rides in `evalOnly`: the evaluator does not
  // do VLOOKUP, so the staging bank needs the words supplied, while Excel
  // recomputes the same words from AP the moment the file is opened. Writing
  // the label over its own formula instead would be the trap CLAUDE.md
  // records - a value whose inputs we never wrote, blanked on open.
  //
  // Two vocabularies again, and the same rule as lotScalars(): a record under
  // this file's own names wins, because check_mapper.mjs builds its records by
  // reading a real completed workbook and is already in those words; the FORM
  // fills the gap, because a lot built in PlantBook has no records at all -
  // it has `rows.sublot_tickets[s-1].ac_method`, one select per sublot, and
  // the code is derived from the label rather than stored beside it.
  const acc = FLAGS.sublotAcceptanceCode, accL = FLAGS.sublotAcceptanceLabel;
  const ticket = (s) => (rows.sublot_tickets || [])[s - 1] || {};
  [1, 2, 3, 4].forEach((s) => {
    const r = recVals(`QC0${s}`);
    // amStr() returns '' rather than null for an absent value, so the
    // fallback is || and not ?? - a ?? here would write four empty
    // strings over the form's answers and say nothing about it.
    const label = amStr(r.acceptance_label) || amStr(ticket(s).ac_method);
    const code = amNum(r.acceptance_code) ?? acMethodCode(label);
    write(A(acc.sheet, `${acc.col}${acc.first + (s - 1) * acc.stride}`), code);
    write(A(accL.sheet, `${accL.col}${accL.first + (s - 1) * accL.stride}`), label);
  });
  // The verification records' own method, `AU33`/`AU34`. Same fallback, onto
  // the Verification step's identity table - which had no path to a cell at
  // all until this, so the column existed and the workbook never saw it.
  ['QA01', 'IQ01'].forEach((b, i) => {
    const vrow = (rows.verification || [])[i] || {};
    const label = amStr(recVals(b).acceptance_label) || amStr(vrow.ac_method);
    write(A(acc.sheet, acc.verify[i]), amNum(recVals(b).acceptance_code) ?? acMethodCode(label));
    write(A(accL.sheet, accL.verify[i]), label);
  });

  // Which sublot each verification verifies. A value, not a constant — it
  // drives every INDIRECT in the workbook, so nothing QA/IQ carries resolves
  // without it (addresses.mjs, VERIFY.sublotIndex).
  ['QA01', 'IQ01'].forEach((b, i) => {
    const idx = amNum(recVals(b).sublot_verified);
    write(A(CALC.sheet, INPUTS.verify.sublotIndex[i]), idx);
    if (present.indexOf(b) >= 0 && idx == null) {
      need(A(CALC.sheet, INPUTS.verify.sublotIndex[i]),
        `${b} has data but does not say which sublot it verifies; every INDIRECT on that block resolves to nothing`);
    }
  });

  // ---------------------------------------------------------------
  //  3. The blend
  // ---------------------------------------------------------------
  // Producer, type & size and BOD are lot-level. The PERCENTAGE is not — one
  // column per sublot (docs/amaw-map.md's correction of 2026-09-13). Both
  // real lots repeat the same five figures across R..U, which is exactly why
  // it reads as lot-level until you check; a plant that shifts its blend
  // mid-lot is recorded here and nowhere else.
  const blend = (rows.aggregate || []).slice(0, AGGREGATE.count);
  const B = INPUTS.blend;
  blend.forEach((c, i) => {
    const row = B.first + i;
    const isRap = /(^|[\s#])rap\b/i.test(amStr(c.type_size));
    const producer = amStr(c.producer);
    // Same two registries the DesignBook aggregate rows switch between: an
    // AGP for an aggregate, an AMP for RAP, because RAP's "producer" is the
    // plant the millings came off (CLAUDE.md).
    const num = amStr(c.agp_number)
      || (isRap ? (call(R.ampFor, producer) || '') : (call(R.agpFor, producer) || ''));
    write(A(B.sheet, `${B.cols.producer}${row}`), producer);
    write(A(B.sheet, `${B.cols.agpNumber}${row}`), num);
    write(A(B.sheet, `${B.cols.typeSize}${row}`), amStr(c.type_size));
    write(A(B.sheet, `${B.cols.matCode}${row}`),
      amNum(c.mat_code) ?? amNum(call(R.matCodeFor, amStr(c.type_size))));
    if (!num && producer) {
      need(A(B.sheet, `${B.cols.agpNumber}${row}`),
        `"${producer}" has no ${isRap ? 'AMP' : 'AGP'} number on file`);
    }
    // BOD specific gravity: lot-level, on `Superpave` column Q.
    write(addressOf({ at: { family: 'agg', part: 'bod', i } }, 'QC01'), amNum(c.bod));
  });
  if (!blend.length) need(`${A(B.sheet, `${B.cols.typeSize}${B.first}`)}:${B.cols.pct}${B.first + B.count - 1}`, 'the lot has no blend');

  // The percentage and the combined-Gsb contribution, per sublot. A sublot
  // that carries its own `blend_pct` overrides; otherwise every sublot gets
  // the lot's blend, which is what both real lots do.
  const G = INPUTS.gsbContribution;
  [1, 2, 3, 4].forEach((s) => {
    const block = `QC0${s}`;
    const over = recRows(block).blend || null;
    blend.forEach((c, i) => {
      const pct = amNum((over && over[i] && over[i].pct)) ?? amNum(c.pct);
      // 'Pay Values'!J29:J34 is the typed lot blend; the per-sublot columns
      // are Superpave R..U and addressOf() resolves them for us.
      if (s === 1) write(A(B.sheet, `${B.cols.pct}${B.first + i}`), pct);
      write(addressOf({ at: { family: 'agg', part: 'pct', i } }, block), pct);
      // pct / BOD — the term `Superpave!R9` divides 100 by. Without these
      // the combined Gsb is blank and every VMA on the sheet goes with it.
      const bod = amNum(c.bod);
      if (pct != null && bod) write(A(G.sheet, `${G.cols[s - 1]}${G.first + i}`), pct / bod);
    });
    // AC contributed by the RAP, per sublot.
    write(A(SUBLOT.sheet, `${INPUTS.recycle.acFromRecycle.cols[s - 1]}${INPUTS.recycle.acFromRecycle.row}`),
      amNum(recVals(block).ac_from_recycle) ?? amNum(v.ac_from_recycle));
  });
  const pctSum = blend.reduce((a, c) => a + (amNum(c.pct) || 0), 0);
  if (blend.length && Math.abs(pctSum - 100) > 0.05) {
    note(`the blend sums to ${pctSum.toFixed(2)}%, not 100 - the combined Gsb at ${addressOf({ at: { family: 'agg', part: 'gsb', i: 0 } }, 'QC01')} will be wrong`);
  }

  // ---------------------------------------------------------------
  //  4. The four QC sublots
  // ---------------------------------------------------------------
  const sieveCount = GRADATION.sieves.length;

  // The JMF target gradation is a lot-level column, `Gradation!N10:N23`.
  // N10:N23 are typed cells (checked), so this is % passing written plain.
  const jmf = v.jmf || bridged.jmf || {};
  GRADATION.sieves.forEach((sieve, i) => {
    write(addressOf({ at: { family: 'gradJmf', i } }, 'QC01'), amNum(jmf[sieve]));
  });
  if (!Object.keys(jmf).length) {
    need(`${A(GRADATION.sheet, `${GRADATION.jmfCol}${GRADATION.first}`)}:${GRADATION.jmfCol}${GRADATION.first + sieveCount - 1}`,
      'the JMF target gradation - every gradation pay value is a deviation from it');
  }

  for (const block of ['QC01', 'QC02', 'QC03', 'QC04']) {
    const s = SUBLOT_OF[block];
    const rv = recVals(block), rr = recRows(block);
    const before = Object.keys(values).length + Object.keys(evalOnly).length;

    // -- the truck ticket. `tons` is CUMULATIVE ticket tonnage (lot 2 runs
    //    4955 -> 5390 -> 6693 -> 7530), not the sublot's own; `temperature`
    //    is on the sheet and never reaches MEDL.
    const tk = SUBLOT.ticket, tRow = tk.first + (s - 1) * tk.stride;
    write(A(SUBLOT.sheet, `${tk.cols.date}${tRow}`), amDateSerial(rv.date));
    write(A(SUBLOT.sheet, `${tk.cols.time}${tRow}`), amTimeFraction(rv.time));
    write(A(SUBLOT.sheet, `${tk.cols.truck}${tRow}`), amStr(rv.truck));
    write(A(SUBLOT.sheet, `${tk.cols.tons}${tRow}`), amNum(rv.tons));
    write(A(SUBLOT.sheet, `${tk.cols.temperature}${tRow}`), amNum(rv.temperature));

    // -- who tested it. A 2x2 block on `Superpave`, NOT a stride.
    write(A(SUBLOT.sheet, SUBLOT.technician[s - 1]), amStr(rv.tested_by));

    // -- the two gyratory pucks.
    const SP = INPUTS.specimens;
    (rr.specimens || []).forEach((sp, i) => {
      const slot = slotOf(sp, i); if (slot >= SP.count) return;
      const row = SP.first + (s - 1) * SP.stride + slot;
      write(A(SP.sheet, `${SP.cols.wtAir}${row}`), amNum(sp.wt_air));
      write(A(SP.sheet, `${SP.cols.wtWater}${row}`), amNum(sp.wt_water));
      write(A(SP.sheet, `${SP.cols.wtSsd}${row}`), amNum(sp.wt_ssd));
    });
    if (!(rr.specimens || []).length) {
      need(A(SP.sheet, `${SP.cols.wtAir}${SP.first + (s - 1) * SP.stride}`),
        `${block} has no gyratory specimen weights, so its bulk Gsb, air voids, VMA and VFA are all blank`);
    }

    // -- the two Gmm bowls. `absorbed` is a correction the sheet applies in
    //    the MSG formula; `msg` is only written where the template does not
    //    compute it (F41:J41 - see the header).
    const GM = INPUTS.gmm, gcols = GM.cols[s - 1];
    (rr.gmm || []).forEach((b, i) => {
      const col = gcols[slotOf(b, i)]; if (!col) return;
      write(A(GM.sheet, `${col}${GM.rows.mix}`), amNum(b.wt_mix));
      write(A(GM.sheet, `${col}${GM.rows.calibration}`), amNum(b.calibration));
      write(A(GM.sheet, `${col}${GM.rows.total}`), amNum(b.total) ?? sumOf(b.wt_mix, b.calibration));
      write(A(GM.sheet, `${col}${GM.rows.final}`), amNum(b.final_wt));
      write(A(GM.sheet, `${col}${GM.rows.absorbed}`), amNum(b.absorbed_water));
      write(A(GM.sheet, `${col}${GM.rows.msg}`), amNum(b.msg));
    });
    if (!(rr.gmm || []).length) {
      need(A(GM.sheet, `${gcols[0]}${GM.rows.mix}`), `${block} has no Gmm bowl weights, so its maximum specific gravity is blank`);
    }

    // -- moisture. Small, and it moves the accepted %AC: `Gradation!D33`
    //    subtracts `Superpave!G48` from the back-calculated figure.
    const MO = INPUTS.moisture, mcol = MO.cols[s - 1];
    write(A(MO.sheet, `${mcol}${MO.rows.panAndMixBefore}`), amNum(rv.moisture_before));
    write(A(MO.sheet, `${mcol}${MO.rows.panAndMixAfter}`), amNum(rv.moisture_after));
    write(A(MO.sheet, `${mcol}${MO.rows.pan}`), amNum(rv.moisture_pan));

    // -- gradation: grams retained per sieve, plus the pan and the total.
    const GR = INPUTS.gradation, gcol = GR.cols[s - 1];
    const grad = rr.gradation || [];
    GRADATION.sieves.forEach((sieve, i) => {
      const g = grad.find((x) => amStr(x.sieve) === sieve) || {};
      write(A(GR.sheet, `${gcol}${GR.first + i}`), amNum(g.grams_retained));
      writeGradationPair(GR, s - 1, i, g.pct_passing);
    });
    write(A(GR.sheet, `${gcol}${GR.panRow}`), amNum(rv.grams_pan));
    write(A(GR.sheet, `${gcol}${GR.totalRow}`), amNum(rv.grams_total));
    write(A(GR.sheet, `${GR.dateCols[s - 1]}${GR.dateRow}`), amDateSerial(rv.gradation_date ?? rv.date));
    // NOTHING IS WRITTEN TO `Gradation`!D32/G32/J32/M32 any more. That row is
    // EMPTY in the shipped template - no value, no formula, no label - and no
    // formula on any sheet references it, so every %AC ever written there went
    // nowhere while the workbook used its own back-calculation instead.
    //
    // The live chain is `D34` (back-calculated from Gse and this sublot's
    // Gmm), less the moisture at `Superpave!G48`, into `B14`. Both inputs are
    // cells this mapper writes - the Rice bowls and the hand-mixed sample -
    // so the workbook computes it natively and there is nothing to write.
    //
    // What IS still needed is the moisture, or `D33` has nothing to subtract
    // and `B14` falls back to the uncorrected back-calculation.
    if (!amHas(rv.moisture_before)) {
      need(A(MO.sheet, `${MO.cols[s - 1]}${MO.rows.panAndMixBefore}`),
        `${block} has no moisture weights, so 'Gradation'!D33 cannot correct the `
        + 'back-calculated %AC and the lot is paid on the uncorrected figure');
    }
    // NOT `!grad.length`. A table can arrive full of rows this mapper has no
    // way to write - a shape it does not know, or a column that never made it
    // through the bridge - and a length test would read that as "gradation
    // present" and go quiet on the one case worth reporting.
    if (!grad.some((g) => amHas(g.grams_retained) || amHas(g.pct_passing))) {
      need(A(GR.sheet, `${gcol}${GR.first}`), `${block} has no gradation`);
    }

    // -- the binder and tack lot numbers, one column per sublot on row 43/44.
    write(addressOf({ at: { family: 'payLotNo' } }, block), amStr(rv.binder_lot));
    write(addressOf({ at: { family: 'payLotNo', tack: true } }, block), amStr(rv.tack_lot));

    // -- the JMF %AC this sublot is paid against.
    const J = INPUTS.jmfAc;
    write(A(J.sheet, `${J.col}${J.first + (s - 1) * J.stride}`), amNum(rv.jmf_ac) ?? amNum(v.jmf_ac));
    if (!amHas(rv.jmf_ac) && !amHas(v.jmf_ac)) {
      need(A(J.sheet, `${J.col}${J.first + (s - 1) * J.stride}`), 'the JMF %AC - the AC pay value is a deviation from it');
    }

    // -- the spec minimum VMA this sublot is judged against. One value for
    //    all four rows (it is the mix's minimum, not the sublot's), but
    //    written per row because that is how the sheet holds it.
    const MV = INPUTS.minVma, mvAddr = A(MV.sheet, `${MV.col}${MV.first + (s - 1) * MV.stride}`);
    write(mvAddr, amNum(rv.min_vma) ?? amNum(v.min_vma));
    if (!amHas(rv.min_vma) && !amHas(v.min_vma)) {
      need(mvAddr, 'the minimum VMA - with it blank Excel reads 0 and the VMA pay '
        + 'deviation becomes the raw VMA rather than the margin above the minimum');
    }

    // -- polish-resistant data, on the sheet and on KYTC's record but never
    //    in the staging map.
    const PO = INPUTS.polish, prow = PO.first + (s - 1) * PO.stride;
    write(A(PO.sheet, `${PO.cols.date}${prow}`), amDateSerial(rv.polish_date ?? rv.date));
    write(A(PO.sheet, `${PO.cols.coarsePct}${prow}`), amNum(rv.polish_coarse_pct));
    write(A(PO.sheet, `${PO.cols.finePct}${prow}`), amNum(rv.polish_fine_pct));

    // -- cores. TWO banks with different strides, and the count is fixed
    //    neither per lot nor per sublot (lot 1 has 24 ids and 18 densities;
    //    sublot 1's six were labelled and never measured). Read every slot,
    //    drop the blanks - so a core row is placed by its declared bank and
    //    slot, never by its position in the array.
    const CO = INPUTS.cores;
    (rr.cores || []).forEach((c) => {
      const bank = amNum(c.bank) ?? 0, slot = amNum(c.slot);
      const spec = CORES.banks[bank];
      if (!spec || slot == null || slot >= spec.count) { unmapped.push(`${block} core bank ${c.bank}/slot ${c.slot}`); return; }
      // The core id itself is CONCATENATE('Pay Values'!F3,"-2-A") in the
      // template - built from the lot number, never typed - so it is
      // deliberately not written even though addressOf() resolves it.
      const row = spec.first + slot + (s - 1) * spec.stride;
      write(A(CO.sheet, `${CO.cols.wtAir}${row}`), amNum(c.wt_air));
      write(A(CO.sheet, `${CO.cols.wtWater}${row}`), amNum(c.wt_water));
      write(A(CO.sheet, `${CO.cols.wtSsd}${row}`), amNum(c.wt_ssd));
      write(A(CO.sheet, `${CO.cols.density}${row}`), amNum(c.density));
      write(addressOf({ at: { family: 'cores', bank, slot, key: 'station' } }, block), amStr(c.station));
      // The per-core pay value. `Cores!J15` reads Calculations!I34, so the
      // pay row is where the number has to land - and pay.mjs is where it
      // has to come from. Never a band edge in this file.
      const pctSolid = amNum(c.pct_solid);
      if (pctSolid != null) {
        const pv = bank === 0
          ? laneCorePay(pctSolid, { esalClass: amNum(v.esal_class), mixTypeCode: amNum(v.mix_type_code) ?? 5 })
          : jointCorePay(pctSolid, { mixTypeCode: amNum(v.mix_type_code) ?? 5 });
        const P = INPUTS.corePay[bank === 0 ? 'lane' : 'joint'];
        const col = colShift(P.first, (s - 1) * spec.count + slot);
        if (pv === MCL) note(`${block} ${bank === 0 ? 'lane' : 'joint'} core ${slot + 1} is MCL - the lot leaves the pay schedule`);
        write(A(INPUTS.corePay.sheet, `${col}${P.row}`), pv);
      }
    });

    // -- KYCT. The CT index and the four quantities behind it are formulas
    //    over a raw load/displacement curve PlantBook does not store (the
    //    same call Jake made for DesignBook), so they are writeOver: drop
    //    the formula, write the number, or Excel blanks them on open.
    const ct = rr.kyct || [];
    ct.forEach((spec, n) => {
      const i = slotOf(spec, n); if (i >= KYCT.specimens) return;
      const sheet = KYCT.sheetFor(s), col = KYCT.specimenCols[i];
      const H = INPUTS.kyct.header, labelCol = colShift(col, -1);
      write(A(sheet, `${labelCol}${H.sampleId}`), amStr(spec.sample_id));
      write(A(sheet, `${col}${H.tempC}`), amNum(spec.temp_c));
      write(A(sheet, `${col}${H.airVoids}`), amNum(spec.air_voids));
      write(A(sheet, `${col}${H.diameter}`), amNum(spec.diameter));
      write(A(sheet, `${col}${H.thickness}`), amNum(spec.thickness));
      for (const key of ['l75', 'm75', 'wf', 'gf', 'index']) {
        writeOver(addressOf({ at: { family: 'kyct', i, key } }, block), amNum(spec[key]));
      }
      writeOver(addressOf({ at: { family: 'kyct', i: i * 2, peak: true } }, block), amNum(spec.peak_flow));
      writeOver(addressOf({ at: { family: 'kyct', i: i * 2 + 1, peak: true } }, block), amNum(spec.peak_stability));
    });
    if (ct.length) note('KYCT indices are written over their formulas: PlantBook holds the CT summary, not the raw load/displacement curve (docs/sitemanager-handoff.md)');

    coverage.blocks[block] = Object.keys(values).length + Object.keys(evalOnly).length - before;
  }

  // ---------------------------------------------------------------
  //  5. VI01 — the verification/initial record
  // ---------------------------------------------------------------
  // VI01 reads sublot 1's cells for almost everything (addresses.mjs), so it
  // has no storage of its own. Its one distinct surface is `Field Rutting`,
  // where it takes the DERIVED columns E/M while the production blocks take
  // the raw peak loads in D/L. If a lot ever carries VI01 values that are
  // not sublot 1's, they cannot be written and this says so rather than
  // quietly filing them under QC01.
  const vi = recVals('VI01');
  const viOwn = Object.keys(vi).filter((k) => amHas(vi[k]) && ['tested_by', 'date'].indexOf(k) < 0);
  if (viOwn.length) {
    note(`VI01 reads sublot 1's cells for every field but Field Rutting, so ${viOwn.length} value(s) on it have nowhere of their own to go: ${viOwn.slice(0, 6).join(', ')}`);
  }

  // ---------------------------------------------------------------
  //  6. Field Rutting — IDT-HT and IDEAL-RT, not Hamburg
  // ---------------------------------------------------------------
  // The loader's labels still say "Hamburg Pass 100 Left Max". The sheet
  // underneath is two six-specimen tables and there is no wheel tracker in
  // the building. Reproduced, not corrected - docs/amaw-map.md.
  const rut = rows.rutting || v.rutting || {};
  const RU = INPUTS.rutting;
  [['idt', rut.idt_ht || []], ['ideal', rut.ideal_rt || []]].forEach(([which, list]) => {
    const spec = RU[which];
    list.forEach((sp, n) => {
      const i = slotOf(sp, n); if (i >= spec.count) return;
      const row = spec.first + i;
      write(A(RU.sheet, `${spec.load}${row}`), amNum(sp.peak_load));
      // Strength / RT index: the template wires row 19 only and leaves
      // 20..24 typed, so `write()` does the right thing on both.
      write(A(RU.sheet, `${which === 'idt' ? spec.strength : spec.index}${row}`),
        amNum(which === 'idt' ? sp.strength : sp.rt_index));
      const d = spec.dims, dcol = colShift(d.first, i);
      write(A(RU.sheet, `${dcol}${d.diameter}`), amNum(sp.diameter));
      write(A(RU.sheet, `${dcol}${d.thickness}`), amNum(sp.thickness));
    });
  });

  // ---------------------------------------------------------------
  //  7. Performance specimens
  // ---------------------------------------------------------------
  // Four averaged air-void figures reach the loader (PERFORMANCE), each the
  // average of one six-specimen half-bank. Note the loader reads H57/O57 for
  // the second bank where VER 14.01 puts the average on row 56 - a KYTC
  // off-by-one we reproduce on the read side and step around on the write
  // side by writing the inputs, which are unambiguous.
  const perf = rows.performance || [];
  perf.slice(0, INPUTS.performance.banks.length).forEach((bank, bi) => {
    const spec = INPUTS.performance.banks[bi];
    (bank.specimens || []).forEach((sp, n) => {
      const col = spec.cols[slotOf(sp, n)]; if (!col) return;
      write(A(spec.sheet || INPUTS.performance.sheet, `${col}${spec.rows.thickness}`), amNum(sp.thickness));
      write(A(INPUTS.performance.sheet, `${col}${spec.rows.dry}`), amNum(sp.dry_wt));
      write(A(INPUTS.performance.sheet, `${col}${spec.rows.ssd}`), amNum(sp.ssd_wt));
      write(A(INPUTS.performance.sheet, `${col}${spec.rows.water}`), amNum(sp.wt_water));
      write(A(INPUTS.performance.sheet, `${col}${spec.rows.gmm}`), amNum(sp.gmm));
      // Air voids is a formula over the four above; only written over when
      // the lot carries the result and not the weights.
      if (!amHas(sp.dry_wt) && amHas(sp.air_voids)) writeOver(A(INPUTS.performance.sheet, `${col}${spec.rows.airVoids}`), amNum(sp.air_voids));
    });
  });

  // ---------------------------------------------------------------
  //  8. QA01 / IQ01 — `Super Verify`
  // ---------------------------------------------------------------
  // The Department's two samples. Filled by KYTC district personnel rather
  // than the plant, which is the whole reason storage.mjs has a department
  // path - see docs/plantbook-storage.md.
  ['QA01', 'IQ01'].forEach((block, slot) => {
    const rv = recVals(block), rr = recRows(block);
    const before = Object.keys(values).length + Object.keys(evalOnly).length;
    const V = INPUTS.verify;

    write(A(V.sheet, V.inspectorId[slot]), amStr(rv.tested_by));
    write(A(V.sheet, V.inspectorName[slot]), amStr(rv.tested_by_name));

    // Equipment verified, into the BOOLEAN at `Calculations!M1`/`M2` rather
    // than the `IF(M,1,2)` formula above it that the loader reads. Reads off
    // THIS RECORD's own row now (2026-09-14, `rv.equipment_verified`) rather
    // than a lot-wide scalar - see LOT_TABLE_ROUTES.verification and the
    // note on `lotScalars()` above for why. The "Yes"/"No" -> boolean
    // conversion moved here with it: `rv` carries the raw form word,
    // `lotScalars()` never saw a per-record value to convert in the first
    // place.
    const flag = YES_NO_BOOL[String(rv.equipment_verified == null ? '' : rv.equipment_verified).trim().toUpperCase()];
    write(A(CALC.sheet, CALC.equipmentVerified[slot]), flag);
    // A BLANK flag is not neutral: O1 evaluates to 2 and sn 114/115 tell MEDL
    // "No". That is the workbook's own behaviour and is reproduced rather than
    // worked around - but a Department sample WITH no answer is worth saying
    // once, because the file makes a claim the lot never made.
    if (!amHas(flag)) {
      note(`${block} has no "equipment verified" answer, so ${A(CALC.sheet, CALC.equipmentVerifiedRead[slot])} `
        + 'evaluates to 2 and the loader reports it as "No"');
    }

    (rr.specimens || []).forEach((sp, i) => {
      const k = slotOf(sp, i); if (k >= V.specimens.count) return;
      const row = V.specimens.first + slot * V.specimens.stride + k;
      write(A(V.sheet, `${V.specimens.cols.wtAir}${row}`), amNum(sp.wt_air));
      write(A(V.sheet, `${V.specimens.cols.wtWater}${row}`), amNum(sp.wt_water));
      write(A(V.sheet, `${V.specimens.cols.wtSsd}${row}`), amNum(sp.wt_ssd));
    });

    const gcols = V.gmm.cols[slot];
    (rr.gmm || []).forEach((b, i) => {
      const col = gcols[slotOf(b, i)]; if (!col) return;
      write(A(V.sheet, `${col}${V.gmm.rows.mix}`), amNum(b.wt_mix));
      write(A(V.sheet, `${col}${V.gmm.rows.calibration}`), amNum(b.calibration));
      write(A(V.sheet, `${col}${V.gmm.rows.total}`), amNum(b.total) ?? sumOf(b.wt_mix, b.calibration));
      write(A(V.sheet, `${col}${V.gmm.rows.final}`), amNum(b.final_wt));
      write(A(V.sheet, `${col}${V.gmm.rows.absorbed}`), amNum(b.absorbed_water));
      write(A(V.sheet, `${col}${V.gmm.rows.msg}`), amNum(b.msg));
    });

    const gcol = V.gradation.cols[slot], grad = rr.gradation || [];
    GRADATION.sieves.forEach((sieve, i) => {
      const g = grad.find((x) => amStr(x.sieve) === sieve) || {};
      write(A(V.sheet, `${gcol}${V.gradation.first + i}`), amNum(g.grams_retained));
      writeGradationPair(V.gradation, slot, i, g.pct_passing, V.sheet);
    });
    write(A(V.sheet, `${gcol}${V.gradation.panRow}`), amNum(rv.grams_pan));
    write(A(V.sheet, `${gcol}${V.gradation.totalRow}`), amNum(rv.grams_total));

    const mcol = V.moisture.cols[slot];
    write(A(V.sheet, `${mcol}${V.moisture.rows.panAndMixBefore}`), amNum(rv.moisture_before));
    write(A(V.sheet, `${mcol}${V.moisture.rows.panAndMixAfter}`), amNum(rv.moisture_after));
    write(A(V.sheet, `${mcol}${V.moisture.rows.pan}`), amNum(rv.moisture_pan));

    coverage.blocks[block] = Object.keys(values).length + Object.keys(evalOnly).length - before;
  });

  // ---------------------------------------------------------------
  //  9. The hand-mixed check sample
  // ---------------------------------------------------------------
  const HM = INPUTS.gmm.handMixed;
  (rows.hand_mixed || []).forEach((b, i) => {
    const col = HM[slotOf(b, i)], r = INPUTS.gmm.rows; if (!col) return;
    write(A(INPUTS.gmm.sheet, `${col}${r.mix}`), amNum(b.wt_mix));
    write(A(INPUTS.gmm.sheet, `${col}${r.calibration}`), amNum(b.calibration));
    write(A(INPUTS.gmm.sheet, `${col}${r.total}`), amNum(b.total) ?? sumOf(b.wt_mix, b.calibration));
    write(A(INPUTS.gmm.sheet, `${col}${r.final}`), amNum(b.final_wt));
    write(A(INPUTS.gmm.sheet, `${col}${r.absorbed}`), amNum(b.absorbed_water));
    write(A(INPUTS.gmm.sheet, `${col}${r.msg}`), amNum(b.msg));
  });

  // ---------------------------------------------------------------
  //  10. Project Items and Cert. Techs
  // ---------------------------------------------------------------
  // `Project Items` is the same sheet, same three columns, the DesignBook
  // pay-estimate lookup already fills (docs/amaw-map.md), and the same trap
  // applies: no staging formula reads this tab, so a generated workbook with
  // the headers and no rows LOADS, silently, without its project items.
  const PI = INPUTS.projectItems;
  const items = (rows.project_items || []).filter((r) => amHas(r.project) && amHas(r.line));
  const room = PI.lastRow - PI.firstRow + 1;
  items.slice(0, room).forEach((r, i) => {
    const row = PI.firstRow + i;
    write(A(PI.sheet, `${PI.cols.project}${row}`), amStr(r.project));
    write(A(PI.sheet, `${PI.cols.line}${row}`), amStr(r.line));
    write(A(PI.sheet, `${PI.cols.qty}${row}`), amNum(r.quantity));
    write(A(PI.sheet, `${PI.cols.unit}${row}`), amStr(r.unit) || PI.UNIT);
  });
  if (!items.length) need(A(PI.sheet, `${PI.cols.project}${PI.firstRow}`), 'no project items - MEDL loads the lot without them rather than refusing it');
  else if (items.length > room) need(A(PI.sheet, PI.cols.project), `${items.length} project items and the sheet holds ${room}`);

  const CT = INPUTS.certTechs;
  (rows.technicians || []).slice(0, CT.lastRow - CT.firstRow + 1).forEach((t, i) => {
    const row = CT.firstRow + i;
    write(A(CT.sheet, `${CT.cols.smId}${row}`), amStr(t.sm_id));
    write(A(CT.sheet, `${CT.cols.name}${row}`), amStr(t.name));
  });

  // ---------------------------------------------------------------
  //  11. What is left over
  // ---------------------------------------------------------------
  for (const u of UNCLASSIFIED) note(`${u.cell} not written: ${u.why}`);
  const absent = BLOCKS.filter((b) => present.indexOf(b) < 0);
  if (absent.length) note(`no data for ${absent.join(', ')} - a part-filled AMAW is the normal case, not an error`);

  return {
    values,
    evalOnly,
    report: {
      missing,
      notes,
      unmapped,
      blocks: present,
      coverage,
      cells: Object.keys(values).length,
      supplied: Object.keys(evalOnly).length,
    },
  };
}

// Small enough to inline, but it is used three times and the null handling
// is the point: two weights and no total is a total we can compute; one
// weight and no total is not.
// Which slot of a repeating table a row belongs in. A row that declares its
// own `slot` is placed there; otherwise it takes its position in the array.
//
// This is not decoration. A reader that drops blank slots COMPACTS the array,
// and the second specimen of a six-slot table then lands in the first slot -
// which is exactly what happened on `Field Rutting` the first time this was
// run: the workbook mirrors B28 into C28:G28, the empty first slot was
// dropped, and the mapper wrote specimen 2's diameter into specimen 1's cell.
// The cores code has always carried an explicit bank and slot for the same
// reason; every other repeating table now may too.
function slotOf(row, i) {
  const n = amNum(row && row.slot);
  return n == null || n < 0 ? i : n;
}

function sumOf(a, b) {
  const x = amNum(a), y = amNum(b);
  return x == null || y == null ? null : x + y;
}

export default amawCells;
