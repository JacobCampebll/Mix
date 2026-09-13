// =====================================================================
//  AMAW address map — the one place an AMAW cell address is written down
// =====================================================================
//
//  KYTC's AMAW workbook (the "Asphalt Mixture Acceptance Workbook", what
//  PlantBook replaces) is a lot of production: one aggregate blend, four QC
//  sublots, a Department verification and an independent-assurance sample,
//  all loaded into SiteManager/MEDL through ten hidden staging sheets.
//  This module says where every value the loader reads actually lives.
//
//  ---- WHERE THIS CAME FROM, AND WHY IT CANNOT GO STALE -----------------
//
//  Not from the `AMAMAW` sheet. That sheet looks like the workbook's field
//  dictionary and is a stale 2007 description of one — its `Cell` column
//  disagrees with the live workbook on every entry tested (docs/amaw-map.md
//  has the table). `AMAMAW` is the test-METHOD code, not the workbook's name.
//
//  The real map is `t_tst_rslt_dtl` itself, the staging sheet the loader
//  reads: column A is "<block> - <field label>", column E is the field
//  sequence number (`tst_fld_sn`), and column F or G holds a FORMULA naming
//  the source cell. That is the same derivation the MixPack map came from,
//  and it is authoritative by construction — if it were wrong, the loader
//  would be wrong. All 1,469 rows were extracted to
//  scratch `amaw_field_map.json` and every entry below was DERIVED from it
//  programmatically, not typed. `check_addresses.mjs` re-derives and proves
//  it: 1,095 sourced (field, block) pairs, 0 mismatches, plus real values
//  read back out of two completed lots.
//
//  ---- THE SHAPE, IN ONE PARAGRAPH ------------------------------------
//
//  Seven test records — VI01 (verification/initial), QC01..QC04 (the four
//  sublots), QA01 (Department acceptance), IQ01 (independent assurance) —
//  of ~210 fields each. The SAME `tst_fld_sn` resolves to a different cell
//  in each block, and that is the entire complexity here. Four rules cover
//  it: a lot-level field reads one cell in all seven blocks; a per-sublot
//  field strides (by ROW down `Superpave`, by COLUMN across `Gradation` and
//  the blend percentages, or by SHEET for the four KYCT tabs); VI01 reads
//  sublot 1's cells for almost everything; and QA01/IQ01 read a different
//  sheet entirely (`Super Verify`), because they are verifying whichever
//  sublot the technician nominated rather than a fixed one.
//
//  So this file is a handful of structural constants plus ~210 one-line
//  field entries that point at them — not 1,469 addresses.
//
//  ---- HOW TO USE IT ---------------------------------------------------
//
//    import { AMAW, addressOf, BLOCKS } from "./addresses.mjs";
//    AMAW.LOT.county                     -> "I3"  (on AMAW.LOT.sheet)
//    addressOf(AMAW.bySn(42), "QC03")    -> "Superpave!B26"
//    addressOf(AMAW.bySn(42), "QA01")    -> "'Super Verify'!B10"
//
//  An address comes back sheet-qualified and quoted the way Excel spells it
//  ("'Super Verify'!B10"), so it can be handed straight to a cell reader.
//  Three return shapes are NOT a plain address and callers must handle them:
//    null            — this block does not carry this field (a QC-only core
//                      row asked for QA01, say), or the field is a caption.
//    "~<formula>"    — the loader computes it rather than reading one cell;
//                      the formula is given verbatim, leading "~" marks it.
//    an INDIRECT formula (also "~"-prefixed) — see VERIFY.sublotIndex below.
//
//  ---- WHAT IS DELIBERATELY NOT HERE -----------------------------------
//
//  Nothing is corrected. Where KYTC's own wiring is odd it is reproduced
//  verbatim and flagged in a comment (HAMBURG is the live example), because
//  this map's job is to say what the workbook DOES, not what it should do.
//  Every accepted lot on file was judged through that wiring.
//
//  Read docs/amaw-map.md first; it is the survey this map implements.
//  Derived 2026-09-13 against AMAW_VER14_01 (template) and two completed
//  Version 13.3 lots. Layout is identical across 13.3 / 13.04 / 14.01, so a
//  map built on one version holds on the others — unlike the MixPack, whose
//  Recycle Data block moved between 11.x and 12.1.

// The seven test records, in the order they occupy t_tst_rslt_dtl.
export const BLOCKS = ["VI01", "QC01", "QC02", "QC03", "QC04", "QA01", "IQ01"];

// Which production sublot a block's data comes from. QA01/IQ01 are absent on
// purpose: they read `Super Verify`, and WHICH sublot they verify is a value
// in the workbook (VERIFY.sublotIndex), not a constant we can write down.
export const SUBLOT_OF = { VI01: 1, QC01: 1, QC02: 2, QC03: 3, QC04: 4 };

// ---------------------------------------------------------------------
//  LOT — the `Pay Values` header, one cell each, the same in all seven
//  blocks. This is the lot's identity: who, what, where, under what
//  contract. Only `county` (sn 8) is in the staging field map; the rest
//  reach SiteManager through `t_smpl` / `t_cont_smpl` instead, which is
//  where these addresses were read from (their row-8..14 formulas), then
//  confirmed against both completed lots.
// ---------------------------------------------------------------------
export const LOT = {
  sheet: "Pay Values",

  // `smpl_id` is this prefix with the block name appended — "…VI01", "…QC01".
  // BOTH completed lots leave it BLANK, so their sample ids are empty and
  // nothing would load: KYTC evidently fills it at submission time. Treat an
  // empty B3 as "not ready to hand off", not as a read failure.
  sampleIdPrefix: "B3",
  itemCode: "D3",          // "385" — the pay item, matches the mix id's lead
  lotNumber: "F3",         // 1, 2, … within the contract
  county: "I3",            // sn 8, the one LOT field the staging map carries

  contract: "B4",          // `t_cont_smpl.cont_id` — "252112"
  unit: "E4",              // "TON"
  lotTons: "F4",           // `t_smpl.repr_qty`; the four sublots divide it
  esalClass: "I4",

  typeMix: "B5",           // "Superpave 0.38" (a formula in the blank template)
  unitPrice: "F5",
  kytcLabId: "I5",         // Department lab; QA/IQ use it, QC uses psLabId

  // PADDED, exactly like the MixPack's plant VLOOKUP key: "AMP070302      ".
  // The workbook's own lookups match it exactly, so anything we write here
  // has to be spelled the template's way, not Supabase's.
  plantCode: "D6",
  psLabId: "I6",           // producer/supplier lab

  // The approved DesignBook mix this lot is produced under — `t_smpl`
  // carries it as `rel_smpl_id`. The join between the two books.
  approvedMixDesign: "D7",

  approverName: "I8",      // "Tate Sallee"
  materialCode: "C9",      // SiteManager material code, "25500"
  mixId: "D9",             // "00385 CL3 ASPH SURF 0.38A PG64-22" — MIX ID +
                           // the design's signature; parseSignature() reads it
  approverId: "I9",        // SM user id, also stamped as last-modified-by

  // "Version 13.3" / "Version 14.1". The ONLY reliable version marker: the
  // `Workbook Edits` changelog stopped in 2007 and `discipline` carries the
  // loader contract (AMAW / v2.0), not the build.
  version: "K1",
};

// ---------------------------------------------------------------------
//  AGGREGATE — the blend, on `Superpave` rows 3..8 (six components).
//  Producer code / type & size / BOD specific gravity are LOT-level: one
//  blend for the whole lot. The PERCENTAGES are not — each sublot gets its
//  own column, so a plant that shifts its blend mid-lot is recorded. Both
//  completed lots repeat the same five percentages across R..U, which is
//  why this is easy to miss.
// ---------------------------------------------------------------------
export const AGGREGATE = {
  sheet: "Superpave",
  count: 6,        // rows 3..8; row 8 is where RAP sits in both real lots
  first: 3,
  cols: { producerCode: "N", typeSize: "O", bod: "Q" },

  // Per-sublot blend columns, sublot 1..4. QA01/IQ01 reach them through an
  // INDIRECT built on CHAR(81 + <sublot index>) — 81 is "Q", so index 1 is
  // column R. That arithmetic is reproduced in addressOf().
  pctCols: ["R", "S", "T", "U"],
  gsbRow: 9,       // combined Gsb, same four columns: R9/S9/T9/U9
};

// ---------------------------------------------------------------------
//  SUBLOT — everything a QC sublot records, on `Superpave`.
//  Two independent strides, which is the trap: the truck ticket steps ONE
//  row (3,4,5,6) and the volumetrics step SIX (14,20,26,32). They are not
//  the same table and must not share a constant.
// ---------------------------------------------------------------------
export const SUBLOT = {
  sheet: "Superpave",

  // Ticket header. `tons` is CUMULATIVE ticket tonnage, not this sublot's
  // own (lot 2 runs 4955 -> 5390 -> 6693 -> 7530), and `time` is an Excel
  // time fraction (0.9125 = 21:54) despite what the stale AMAMAW sheet says.
  // `temperature` is not in the staging map — it is in the workbook and on
  // the printed sheet, but MEDL never receives it.
  ticket: {
    first: 3, stride: 1,
    cols: { date: "I", time: "J", truck: "K", tons: "L", temperature: "M" },
  },

  // The volumetric block. Note the column letters differ from VERIFY's for
  // the same four quantities (pbe/vma/vfa/dustRatio sit one column left on
  // `Super Verify`) — copying one set onto the other silently reads the
  // neighbouring quantity, which is the kind of bug that looks like bad data.
  volumetric: {
    first: 14, stride: 6,
    cols: {
      binderPct: "B",  unitWeight: "H", gmm: "I",  va: "J",
      pbe: "L",        vma: "M",        vfa: "N",  dustRatio: "O",
    },
  },

  // Certified technician per sublot — a 2x2 block, NOT a stride. Read off
  // t_smpl.smpld_by / t_smpl_tstr.tst_id row by row.
  technician: ["B6", "E6", "B8", "E8"],

  // Hand-mixed check sample. Lot-level: one per lot, same cell in all blocks.
  handMixed: { binderPct: "N43", gmm: "N42" },
};

// ---------------------------------------------------------------------
//  VERIFY — `Super Verify`, where QA01 and IQ01 read. Stride 7 (rows 10
//  and 17), against Superpave's 6. Two records, not four.
// ---------------------------------------------------------------------
export const VERIFY = {
  sheet: "Super Verify",
  first: 10, stride: 7,

  // Same eight quantities as SUBLOT.volumetric, one column left from `pbe`
  // on. Deliberately spelled out rather than derived from the other.
  cols: {
    binderPct: "B", unitWeight: "H", gmm: "I", va: "J",
    pbe: "K",       vma: "L",        vfa: "M", dustRatio: "N",
  },

  // WHICH sublot each verification is verifying — a value, not a constant.
  // It drives every INDIRECT in the workbook, so any field that resolves
  // through one can only be resolved with the file open. Both cells are
  // themselves formulas off Calculations!L1/L2, and in BOTH completed lots
  // those are empty (no QA/IQ sample was taken), so the INDIRECT fields have
  // no answer there. That is a real absence, not a parse failure.
  sublotIndex: ["B5", "B12"],   // [QA01, IQ01]
  technician: ["E5", "E12"],    // also the "was this sample taken at all" flag

  // QA/IQ gradations live here rather than on `Gradation`: rows 33..46,
  // column D for QA01 and G for IQ01.
  gradation: { first: 33, cols: ["D", "G"] },
};

// ---------------------------------------------------------------------
//  GRADATION — fourteen sieves, rows 10..23. Sublots stride by COLUMN
//  (D/G/J/M, three apart), and the JMF target is a lot-level column.
//  Same fourteen sieves DesignBook uses; `.45 Data` on this workbook even
//  carries the same AASHTO M323 Table 4 control points as
//  CONFIG.GRADATION_CONTROL_POINTS, so that constant belongs to both books.
// ---------------------------------------------------------------------
export const GRADATION = {
  sheet: "Gradation",
  first: 10,
  sieves: ['2"', '1 1/2"', '1"', '3/4"', '1/2"', '3/8"', '1/4"',
           "#4", "#8", "#16", "#30", "#50", "#100", "#200"],
  cols: ["D", "G", "J", "M"],   // sublot 1..4
  jmfCol: "N",                  // the target, one column for the whole lot
};

// ---------------------------------------------------------------------
//  CORES — up to six per sublot, and they are in TWO banks with DIFFERENT
//  strides, which no amount of staring at one sublot reveals: cores 1-4 at
//  rows 10,11,12,13 stepping 5 per sublot, cores 5-6 ("J" cores, joint
//  density) at rows 33,34 stepping 3. Core count is not fixed — lot 1 has
//  six (all on sublot 2), lot 2 has ten spread over two sublots — so read
//  every slot and drop the blanks rather than assuming a count.
// ---------------------------------------------------------------------
export const CORES = {
  sheet: "Cores",
  banks: [
    { count: 4, first: 10, stride: 5 },   // mat cores,   "1-2-A" … "1-2-D"
    { count: 2, first: 33, stride: 3 },   // joint cores, "1-2-J1", "1-2-J2"
  ],
  cols: { id: "A", station: "B", density: "H", pctSolid: "I" },
};

// ---------------------------------------------------------------------
//  KYCT — the cracking-tolerance test. One SHEET per sublot rather than a
//  stride, and eight specimens across the columns. VI01 and the two
//  verification blocks carry none of it.
// ---------------------------------------------------------------------
export const KYCT = {
  sheetFor: (sublot) => `KYCT Data Sublot # ${sublot}`,
  specimens: 8,
  specimenCols: ["B", "D", "F", "H", "J", "L", "N", "P"],
  rows: { l75: 14, m75: 18, wf: 19, gf: 20, index: 21 },
  // Peak flow / peak stability alternate along one row, flow first.
  peakRow: 29,
  peakCols: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"],
};

// ---------------------------------------------------------------------
//  PAY — the pay-adjustment tables, also on `Pay Values`, below the header.
//  Per-sublot rows 13..16; the gradation pay rows 37..40; binder and tack
//  lot numbers stride by COLUMN along rows 43/44.
// ---------------------------------------------------------------------
export const PAY = {
  sheet: "Pay Values",
  sublot: {
    first: 13, stride: 1,
    cols: { jmfAc: "A", acPayValue: "D", targetVa: "E",
            vaPayValue: "G", minVma: "H", vmaPayValue: "K" },
  },
  gradation: { first: 37, stride: 1,
               cols: { jmfTarget: "B", testResult: "C", payValue: "E" } },
  binderLotCols: ["B", "C", "D", "E"],   // by sublot
  binderLotRow: 43,
  tackLotRow: 44,
  lot: {
    jointDensityPay: "B21", lotDensityPay: "B22",
    wedgeTons: "J20", finalPayMainline: "J21", lotPayAdjustment: "J24",
    binderProducer: "B46", additive: "C46",
  },
};

// ---------------------------------------------------------------------
//  HAMBURG — named for the loader's field labels ("Hamburg Pass 100 Left
//  Max", …), which is NOT what the sheet under them holds any more.
//
//  `Field Rutting` is two six-specimen tables: IDT-HT at A18:E24 (Diameter,
//  Thickness, Peak Load lbs, Strength kPa) and IDEAL-RT at I18:M24 (the same
//  three plus RT Index). No wheel tracker, no pass counts. KYTC evidently
//  reused the old Hamburg field slots in the MEDL schema to carry these two
//  tests, and the labels never followed — so do not read a field's NAME here
//  as its meaning, and do not go looking for a Hamburg sheet.
//
//  The two sides read different COLUMNS, which is the part worth knowing:
//    VI01 reads the DERIVED columns — E19..E24 (strength) then M19..M24
//         (RT index). Twelve values; sn 188 has none.
//    QC01..QC04 and IQ01 read the RAW peak loads — D19..D24 then L19..L24.
//         Twelve cells for thirteen fields, because sn 176 and sn 177 BOTH
//         point at D19 and everything after is one place along. QA01 reads
//         nothing at all.
//
//  That duplication is in the blank template and in both completed lots, and
//  every accepted lot on file was loaded through it. Reproduced verbatim,
//  indexed by sn - 176, rather than rebuilt as the clean pairing it looks
//  like it wants to be. If KYTC ever fixes it, fix it here; do not fix it
//  here first.
// ---------------------------------------------------------------------
export const HAMBURG = {
  sheet: "Field Rutting",
  production:   ["D19","D19","D20","D21","D22","D23","D24",
                 "L19","L20","L21","L22","L23","L24"],
  verification: ["E19","E20","E21","E22","E23","E24",
                 "M19","M20","M21","M22","M23","M24", null],
};

// Performance specimens: four averaged air-void figures, all lot-level.
export const PERFORMANCE = {
  sheet: "Performance Specimens",
  avgAirVoids: ["H41", "O41", "H57", "O57"],
};

// ---------------------------------------------------------------------
//  CALC — `Calculations` is the workbook's scratch sheet, and a handful of
//  loader fields read it directly. Included because they are addresses like
//  any other, not because anything here is worth reimplementing.
// ---------------------------------------------------------------------
export const CALC = {
  sheet: "Calculations",
  esalClass: "D15",
  acceptanceMethod: "H20",        // "Volumetrics"
  densityOption: "H12",           // 1 -> "A", 2 -> "B", else blank
  binderGradeKey: "D147",         // VLOOKUP key into the grade table
  binderGradeTable: "A147:B161",  // PlantBook should read `binder_grades`
                                  // instead — same rule as everywhere else
  perfSpecMadeWith: "AR1",
  // Per-sublot acceptance method, rows 35..38; the two verification blocks
  // read AU33/AU34 — note those sit ABOVE the sublot rows, not after them.
  sublotAcceptanceMethod: { first: 35, stride: 1, col: "AU",
                            verify: ["AU33", "AU34"] },
  equipmentVerified: ["O1", "O2"],
  verifySublotIndex: ["L1", "L2"], // what VERIFY.sublotIndex resolves from
};

// The sample-status staging column, the only field that reads the loader's
// own output: block i's TEMPSTAT tests t_smpl!Z(8+i).
export const STAGING = { sheet: "t_smpl", statusCol: "Z", firstRow: 8 };

// =====================================================================
//  THE RESOLVER
// =====================================================================
//  Every FIELDS entry below names a `family` and its parameters; this turns
//  (entry, block) into an address using ONLY the constants above. Nothing
//  here writes a cell address of its own — that is the whole point of the
//  file, and check_addresses.mjs fails if a family ever starts inventing one.

const quote = (sheet) => (/[^A-Za-z0-9_.]/.test(sheet) ? `'${sheet}'` : sheet);
const at = (sheet, cell) => `${quote(sheet)}!${cell}`;

// A block's sublot number, or undefined for QA01/IQ01.
const sublotOf = (block) => SUBLOT_OF[block];
// A verification block's slot: 0 for QA01, 1 for IQ01, null otherwise.
const verifySlot = (block) => (block === "QA01" ? 0 : block === "IQ01" ? 1 : null);

// The two INDIRECT shapes the workbook uses, reproduced verbatim. Both pick a
// Superpave column or row off `Super Verify`'s sublot index, so neither can be
// flattened to an address without opening the file — hence the "~" marker.
// CHAR(81) is "Q", so sublot 1 lands on column R: the same pctCols sequence.
const indirectBlendCell = (block, row) =>
  `~INDIRECT("'Superpave'!"&CHAR(81+'Super Verify'!${VERIFY.sublotIndex[verifySlot(block)]})&"${row}")`;
const indirectTicketCell = (block, col) =>
  `~INDIRECT("'Superpave'!${col}"&'Super Verify'!${VERIFY.sublotIndex[verifySlot(block)]}+2)`;

const verifyRow = (block) => VERIFY.first + verifySlot(block) * VERIFY.stride;

/**
 * Where does `field` live for `block`?
 *  -> "Sheet!A1"     a cell, sheet-qualified and Excel-quoted
 *  -> "~<formula>"   computed, not read from one cell (formula given verbatim)
 *  -> null           this block does not carry this field
 */
export function addressOf(field, block) {
  const f = field && field.at;
  if (!f) return null;
  const s = sublotOf(block);

  switch (f.family) {
    // One cell, every block.
    case "lot":
      return f.cell;

    // Computed by the loader; there is no single source cell.
    case "formula":
      return `~${f.formula}`;

    // The blend. Producer/type/BOD are lot-level; the percentage and the
    // combined Gsb follow the sublot's own column.
    case "agg": {
      if (f.part !== "pct" && f.part !== "gsb")
        return at(AGGREGATE.sheet, `${AGGREGATE.cols[f.part]}${AGGREGATE.first + f.i}`);
      const row = f.part === "gsb" ? AGGREGATE.gsbRow : AGGREGATE.first + f.i;
      return s ? at(AGGREGATE.sheet, `${AGGREGATE.pctCols[s - 1]}${row}`)
               : indirectBlendCell(block, row);
    }

    case "spTicket": {
      const col = SUBLOT.ticket.cols[f.key];
      return s ? at(SUBLOT.sheet, `${col}${SUBLOT.ticket.first + (s - 1) * SUBLOT.ticket.stride}`)
               : indirectTicketCell(block, col);
    }

    // The one family that crosses sheets: QC reads `Superpave`, QA/IQ read
    // `Super Verify`, and the column letters differ for four of the eight.
    case "spVol": {
      const v = SUBLOT.volumetric;
      return s ? at(SUBLOT.sheet, `${v.cols[f.key]}${v.first + (s - 1) * v.stride}`)
               : at(VERIFY.sheet, `${VERIFY.cols[f.key]}${verifyRow(block)}`);
    }

    case "spLot":
      return at(SUBLOT.sheet, SUBLOT.handMixed[f.key]);

    case "grad":
      return s ? at(GRADATION.sheet, `${GRADATION.cols[s - 1]}${GRADATION.first + f.i}`)
               : at(VERIFY.sheet, `${VERIFY.gradation.cols[verifySlot(block)]}${VERIFY.gradation.first + f.i}`);

    case "gradJmf":
      return at(GRADATION.sheet, `${GRADATION.jmfCol}${GRADATION.first + f.i}`);

    case "cores": {
      if (!s) return null;               // cores are a QC measurement only
      const bank = CORES.banks[f.bank];
      return at(CORES.sheet, `${CORES.cols[f.key]}${bank.first + f.slot + (s - 1) * bank.stride}`);
    }

    case "kyct": {
      if (block === "VI01" || !s) return null;
      const sheet = KYCT.sheetFor(s);
      return f.peak ? at(sheet, `${KYCT.peakCols[f.i]}${KYCT.peakRow}`)
                    : at(sheet, `${KYCT.specimenCols[f.i]}${KYCT.rows[f.key]}`);
    }

    case "paySublot": {
      const p = PAY.sublot;
      if (s) return at(PAY.sheet, `${p.cols[f.key]}${p.first + (s - 1) * p.stride}`);
      // JMF %AC is the lone pay field QA/IQ carry, and the workbook points
      // both at sublot 4's row rather than at a row of their own. Verbatim.
      return f.verifyUsesLastSublot
        ? at(PAY.sheet, `${p.cols[f.key]}${p.first + 3 * p.stride}`) : null;
    }

    case "payGrad": {
      if (!s) return null;
      const p = PAY.gradation;
      return at(PAY.sheet, `${p.cols[f.key]}${p.first + (s - 1) * p.stride}`);
    }

    case "payLotNo":
      return s ? at(PAY.sheet, `${PAY.binderLotCols[s - 1]}${f.tack ? PAY.tackLotRow : PAY.binderLotRow}`)
               : null;

    // Lot-level pay figures. Most are QC-only even though the value is a
    // property of the lot; `allBlocks` marks the few QA/IQ also carry.
    case "payLot":
      return (!s && !f.allBlocks) ? null : at(PAY.sheet, PAY.lot[f.key]);

    case "perf":
      return at(PERFORMANCE.sheet, PERFORMANCE.avgAirVoids[f.i]);

    case "calcAccept": {
      const c = CALC.sublotAcceptanceMethod;
      return s ? at(CALC.sheet, `${c.col}${c.first + (s - 1) * c.stride}`)
               : at(CALC.sheet, c.verify[verifySlot(block)]);
    }

    case "hamburg": {
      if (block === "QA01") return null;
      const cell = block === "VI01" ? HAMBURG.verification[f.i] : HAMBURG.production[f.i];
      return cell ? at(HAMBURG.sheet, cell) : null;
    }

    // Reads the loader's own staging row for this block.
    case "blockRow":
      return `~${f.template.replace("{cell}",
        `${STAGING.sheet}!${STAGING.statusCol}${STAGING.firstRow + BLOCKS.indexOf(block)}`)}`;

    // The escape hatch: a field whose seven addresses follow no rule. One
    // field uses it (sn 253) and it is listed in UNCLASSIFIED below.
    case "explicit":
      return f.at[BLOCKS.indexOf(block)];

    default:
      throw new Error(`addresses.mjs: unknown family "${f.family}" on sn ${field.sn}`);
  }
}

// =====================================================================
//  FIELDS — every tst_fld_sn, in loader order
// =====================================================================
//  GENERATED from t_tst_rslt_dtl, not typed. `field` is KYTC's own label
//  (column A, block prefix stripped) and `kind` is which staging column the
//  value goes in — "constant" means a caption row the loader emits with no
//  source at all, and those carry at: null.
//
//  `sn` is NOT a row number and NOT contiguous: it runs 1..209 with a single
//  outlier at 253, and VI01 is the one block that lacks that outlier, so it
//  has 209 fields where the other six have 210.
//
//  To add or correct an entry, re-derive it from the workbook's own
//  t_tst_rslt_dtl rather than editing an address in place — that sheet is
//  what the loader reads, so it is the thing that is true.

export const FIELDS = [
  { sn:   1, kind: "constant", field: "Comment  (NOT CURRENTLY USED)",           at: null },
  { sn:   2, kind: "string"  , field: "Template Status (TEMPSTAT)",              at: { family: "blockRow", template: "IF({cell}=\"COMP\",\"ISPC\",\"OSPC\")" } },
  { sn:   3, kind: "constant", field: "GenericString2  (NOT CURRENTLY USED)",    at: null },
  { sn:   4, kind: "constant", field: "GenericNum1  (NOT CURRENTLY USED)",       at: null },
  { sn:   5, kind: "constant", field: "GenericNum2  (NOT CURRENTLY USED)",       at: null },
  { sn:   6, kind: "constant", field: "GenericNum3  (NOT CURRENTLY USED)",       at: null },
  { sn:   7, kind: "constant", field: "GenericNum4  (NOT CURRENTLY USED)",       at: null },
  { sn:   8, kind: "string"  , field: "County",                                  at: { family: "lot", cell: "'Pay Values'!I3" } },
  { sn:   9, kind: "constant", field: "LABEL: Sublot Aggregate Data",            at: null },
  { sn:  10, kind: "numeric" , field: "Gsb =",                                   at: { family: "agg", part: "gsb", i: 0 } },
  { sn:  11, kind: "string"  , field: "Aggr. Pro. Codes",                        at: { family: "agg", part: "producerCode", i: 0 } },
  { sn:  12, kind: "string"  , field: "Aggr. Pro. Codes #2",                     at: { family: "agg", part: "producerCode", i: 1 } },
  { sn:  13, kind: "string"  , field: "Aggr. Pro. Codes #3",                     at: { family: "agg", part: "producerCode", i: 2 } },
  { sn:  14, kind: "string"  , field: "Aggr. Pro. Codes #4",                     at: { family: "agg", part: "producerCode", i: 3 } },
  { sn:  15, kind: "string"  , field: "Aggr. Pro. Codes #5",                     at: { family: "agg", part: "producerCode", i: 4 } },
  { sn:  16, kind: "string"  , field: "Aggr. Pro. Codes #6",                     at: { family: "agg", part: "producerCode", i: 5 } },
  { sn:  17, kind: "string"  , field: "Type & Size",                             at: { family: "agg", part: "typeSize", i: 0 } },
  { sn:  18, kind: "string"  , field: "Type & Size #2",                          at: { family: "agg", part: "typeSize", i: 1 } },
  { sn:  19, kind: "string"  , field: "Type & Size #3",                          at: { family: "agg", part: "typeSize", i: 2 } },
  { sn:  20, kind: "string"  , field: "Type & Size #4",                          at: { family: "agg", part: "typeSize", i: 3 } },
  { sn:  21, kind: "string"  , field: "Type & Size #5",                          at: { family: "agg", part: "typeSize", i: 4 } },
  { sn:  22, kind: "string"  , field: "Type & Size #6",                          at: { family: "agg", part: "typeSize", i: 5 } },
  { sn:  23, kind: "numeric" , field: "%",                                       at: { family: "agg", part: "pct", i: 0 } },
  { sn:  24, kind: "numeric" , field: "% #2",                                    at: { family: "agg", part: "pct", i: 1 } },
  { sn:  25, kind: "numeric" , field: "% #3",                                    at: { family: "agg", part: "pct", i: 2 } },
  { sn:  26, kind: "numeric" , field: "% #4",                                    at: { family: "agg", part: "pct", i: 3 } },
  { sn:  27, kind: "numeric" , field: "% #5",                                    at: { family: "agg", part: "pct", i: 4 } },
  { sn:  28, kind: "numeric" , field: "% #6",                                    at: { family: "agg", part: "pct", i: 5 } },
  { sn:  29, kind: "numeric" , field: "B.O.D. Sp. Gravity",                      at: { family: "agg", part: "bod", i: 0 } },
  { sn:  30, kind: "numeric" , field: "B.O.D. Sp. Gravity #2",                   at: { family: "agg", part: "bod", i: 1 } },
  { sn:  31, kind: "numeric" , field: "B.O.D. Sp. Gravity #3",                   at: { family: "agg", part: "bod", i: 2 } },
  { sn:  32, kind: "numeric" , field: "B.O.D. Sp. Gravity #4",                   at: { family: "agg", part: "bod", i: 3 } },
  { sn:  33, kind: "numeric" , field: "B.O.D. Sp. Gravity #5",                   at: { family: "agg", part: "bod", i: 4 } },
  { sn:  34, kind: "numeric" , field: "B.O.D. Sp. Gravity #6",                   at: { family: "agg", part: "bod", i: 5 } },
  { sn:  35, kind: "constant", field: "LABEL: Sample Info",                      at: null },
  { sn:  36, kind: "numeric" , field: "Date",                                    at: { family: "spTicket", key: "date" } },
  { sn:  37, kind: "numeric" , field: "Time",                                    at: { family: "spTicket", key: "time" } },
  { sn:  38, kind: "string"  , field: "Truck #",                                 at: { family: "spTicket", key: "truck" } },
  { sn:  39, kind: "numeric" , field: "Tons",                                    at: { family: "spTicket", key: "tons" } },
  { sn:  40, kind: "constant", field: "LABEL: Volumetric Results",               at: null },
  { sn:  41, kind: "string"  , field: "Acceptance Method",                       at: { family: "calcAccept" } },
  { sn:  42, kind: "numeric" , field: "% Binder in Mix",                         at: { family: "spVol", key: "binderPct" } },
  { sn:  43, kind: "numeric" , field: "Unit Weight",                             at: { family: "spVol", key: "unitWeight" } },
  { sn:  44, kind: "numeric" , field: "Max. Sp. Gravity",                        at: { family: "spVol", key: "gmm" } },
  { sn:  45, kind: "numeric" , field: "Air Voids",                               at: { family: "spVol", key: "va" } },
  { sn:  46, kind: "numeric" , field: "% Eff. Binder",                           at: { family: "spVol", key: "pbe" } },
  { sn:  47, kind: "numeric" , field: "VMA",                                     at: { family: "spVol", key: "vma" } },
  { sn:  48, kind: "numeric" , field: "VFA",                                     at: { family: "spVol", key: "vfa" } },
  { sn:  49, kind: "string"  , field: "D/A Ratio",                               at: { family: "spVol", key: "dustRatio" } },
  { sn:  50, kind: "numeric" , field: "Hand Mixed % Binder",                     at: { family: "spLot", key: "binderPct" } },
  { sn:  51, kind: "numeric" , field: "H. M. Max. Sp. Gravity",                  at: { family: "spLot", key: "gmm" } },
  { sn:  52, kind: "constant", field: "LABEL: Gradation Test Results % Passing", at: null },
  { sn:  53, kind: "numeric" , field: "2 \"",                                    at: { family: "grad", i: 0 } },
  { sn:  54, kind: "numeric" , field: "1 1/2 \"",                                at: { family: "grad", i: 1 } },
  { sn:  55, kind: "numeric" , field: "1 \"",                                    at: { family: "grad", i: 2 } },
  { sn:  56, kind: "numeric" , field: "3/4 \"",                                  at: { family: "grad", i: 3 } },
  { sn:  57, kind: "numeric" , field: "1/2 \"",                                  at: { family: "grad", i: 4 } },
  { sn:  58, kind: "numeric" , field: "3/8 \"",                                  at: { family: "grad", i: 5 } },
  { sn:  59, kind: "numeric" , field: "1/4 \"",                                  at: { family: "grad", i: 6 } },
  { sn:  60, kind: "numeric" , field: "# 4",                                     at: { family: "grad", i: 7 } },
  { sn:  61, kind: "numeric" , field: "# 8",                                     at: { family: "grad", i: 8 } },
  { sn:  62, kind: "numeric" , field: "# 16",                                    at: { family: "grad", i: 9 } },
  { sn:  63, kind: "numeric" , field: "# 30",                                    at: { family: "grad", i: 10 } },
  { sn:  64, kind: "numeric" , field: "# 50",                                    at: { family: "grad", i: 11 } },
  { sn:  65, kind: "numeric" , field: "# 100",                                   at: { family: "grad", i: 12 } },
  { sn:  66, kind: "numeric" , field: "# 200",                                   at: { family: "grad", i: 13 } },
  { sn:  67, kind: "constant", field: "LABEL: Core Data",                        at: null },
  { sn:  68, kind: "string"  , field: "Core #",                                  at: { family: "cores", bank: 0, slot: 0, key: "id" } },
  { sn:  69, kind: "string"  , field: "Core #2",                                 at: { family: "cores", bank: 0, slot: 1, key: "id" } },
  { sn:  70, kind: "string"  , field: "Core #3",                                 at: { family: "cores", bank: 0, slot: 2, key: "id" } },
  { sn:  71, kind: "string"  , field: "Core #4",                                 at: { family: "cores", bank: 0, slot: 3, key: "id" } },
  { sn:  72, kind: "string"  , field: "Core #5",                                 at: { family: "cores", bank: 1, slot: 0, key: "id" } },
  { sn:  73, kind: "string"  , field: "Core #6",                                 at: { family: "cores", bank: 1, slot: 1, key: "id" } },
  { sn:  74, kind: "string"  , field: "Sta,# / Offset",                          at: { family: "cores", bank: 0, slot: 0, key: "station" } },
  { sn:  75, kind: "string"  , field: "Sta,# / Offset #2",                       at: { family: "cores", bank: 0, slot: 1, key: "station" } },
  { sn:  76, kind: "string"  , field: "Sta,# / Offset #3",                       at: { family: "cores", bank: 0, slot: 2, key: "station" } },
  { sn:  77, kind: "string"  , field: "Sta,# / Offset #4",                       at: { family: "cores", bank: 0, slot: 3, key: "station" } },
  { sn:  78, kind: "string"  , field: "Sta,# / Offset #5",                       at: { family: "cores", bank: 1, slot: 0, key: "station" } },
  { sn:  79, kind: "string"  , field: "Sta,# / Offset #6",                       at: { family: "cores", bank: 1, slot: 1, key: "station" } },
  { sn:  80, kind: "numeric" , field: "Core Density",                            at: { family: "cores", bank: 0, slot: 0, key: "density" } },
  { sn:  81, kind: "numeric" , field: "Core Density #2",                         at: { family: "cores", bank: 0, slot: 1, key: "density" } },
  { sn:  82, kind: "numeric" , field: "Core Density #3",                         at: { family: "cores", bank: 0, slot: 2, key: "density" } },
  { sn:  83, kind: "numeric" , field: "Core Density #4",                         at: { family: "cores", bank: 0, slot: 3, key: "density" } },
  { sn:  84, kind: "numeric" , field: "Core Density #5",                         at: { family: "cores", bank: 1, slot: 0, key: "density" } },
  { sn:  85, kind: "numeric" , field: "Core Density #6",                         at: { family: "cores", bank: 1, slot: 1, key: "density" } },
  { sn:  86, kind: "numeric" , field: "% Sol. Den.",                             at: { family: "cores", bank: 0, slot: 0, key: "pctSolid" } },
  { sn:  87, kind: "numeric" , field: "% Sol. Den. #2",                          at: { family: "cores", bank: 0, slot: 1, key: "pctSolid" } },
  { sn:  88, kind: "numeric" , field: "% Sol. Den. #3",                          at: { family: "cores", bank: 0, slot: 2, key: "pctSolid" } },
  { sn:  89, kind: "numeric" , field: "% Sol. Den. #4",                          at: { family: "cores", bank: 0, slot: 3, key: "pctSolid" } },
  { sn:  90, kind: "numeric" , field: "% Sol. Den. #5",                          at: { family: "cores", bank: 1, slot: 0, key: "pctSolid" } },
  { sn:  91, kind: "numeric" , field: "% Sol. Den. #6",                          at: { family: "cores", bank: 1, slot: 1, key: "pctSolid" } },
  { sn:  92, kind: "numeric" , field: "ESAL Class",                              at: { family: "lot", cell: "Calculations!D15" } },
  { sn:  93, kind: "string"  , field: "Acceptance Method",                       at: { family: "lot", cell: "Calculations!H20" } },
  { sn:  94, kind: "string"  , field: "Density Option",                          at: { family: "formula", formula: "IF(Calculations!H12=1,\"A\",IF(Calculations!H12=2,\"B\",\" \"))" } },
  { sn:  95, kind: "numeric" , field: "JMF %AC",                                 at: { family: "paySublot", key: "jmfAc", verifyUsesLastSublot: true } },
  { sn:  96, kind: "numeric" , field: "AC Pay Value",                            at: { family: "paySublot", key: "acPayValue" } },
  { sn:  97, kind: "numeric" , field: "Target %AV",                              at: { family: "paySublot", key: "targetVa" } },
  { sn:  98, kind: "numeric" , field: "AV Pay Value",                            at: { family: "paySublot", key: "vaPayValue" } },
  { sn:  99, kind: "numeric" , field: "Min. %VMA",                               at: { family: "paySublot", key: "minVma" } },
  { sn: 100, kind: "numeric" , field: "VMA Pay Value",                           at: { family: "paySublot", key: "vmaPayValue" } },
  { sn: 101, kind: "numeric" , field: "JD Pay Value",                            at: { family: "payLot", key: "jointDensityPay" } },
  { sn: 102, kind: "numeric" , field: "LD Pay Value",                            at: { family: "payLot", key: "lotDensityPay" } },
  { sn: 103, kind: "numeric" , field: "Pavement Wedge Tons",                     at: { family: "payLot", key: "wedgeTons" } },
  { sn: 104, kind: "numeric" , field: "Final Pay Value Mainline",                at: { family: "payLot", key: "finalPayMainline" } },
  { sn: 105, kind: "numeric" , field: "Lot Pay Adjustment",                      at: { family: "payLot", key: "lotPayAdjustment", allBlocks: true } },
  { sn: 106, kind: "string"  , field: "Gradation Target JMF",                    at: { family: "payGrad", key: "jmfTarget" } },
  { sn: 107, kind: "string"  , field: "Gradation Test Result",                   at: { family: "payGrad", key: "testResult" } },
  { sn: 108, kind: "numeric" , field: "Gradation Pay Value",                     at: { family: "payGrad", key: "payValue" } },
  { sn: 109, kind: "string"  , field: "PG Binder Lot Number",                    at: { family: "payLotNo" } },
  { sn: 110, kind: "string"  , field: "Tack Oil Lot Number",                     at: { family: "payLotNo", tack: true } },
  { sn: 111, kind: "string"  , field: "PG Binder Grade",                         at: { family: "formula", formula: "VLOOKUP(Calculations!D147,Calculations!A147:B161,2,FALSE)" } },
  { sn: 112, kind: "string"  , field: "PG Binder Producer",                      at: { family: "payLot", key: "binderProducer", allBlocks: true } },
  { sn: 113, kind: "string"  , field: "% and Type of Additive",                  at: { family: "payLot", key: "additive", allBlocks: true } },
  { sn: 114, kind: "string"  , field: "First Sublot Verified Same Equipment",    at: { family: "formula", formula: "IF(Calculations!O1=1,\"Yes\", \"No\")" } },
  { sn: 115, kind: "string"  , field: "Second Sublot Verified Same Equipment",   at: { family: "formula", formula: "IF(Calculations!O2=1,\"Yes\", \"No\")" } },
  { sn: 116, kind: "numeric" , field: "JMF-2 \"",                                at: { family: "gradJmf", i: 0 } },
  { sn: 117, kind: "numeric" , field: "JMF-1 1/2 \"",                            at: { family: "gradJmf", i: 1 } },
  { sn: 118, kind: "numeric" , field: "JMF-1 \"",                                at: { family: "gradJmf", i: 2 } },
  { sn: 119, kind: "numeric" , field: "JMF-3/4 \"",                              at: { family: "gradJmf", i: 3 } },
  { sn: 120, kind: "numeric" , field: "JMF-1/2 \"",                              at: { family: "gradJmf", i: 4 } },
  { sn: 121, kind: "numeric" , field: "JMF-3/8 \"",                              at: { family: "gradJmf", i: 5 } },
  { sn: 122, kind: "numeric" , field: "JMF-1/4 \"",                              at: { family: "gradJmf", i: 6 } },
  { sn: 123, kind: "numeric" , field: "JMF-# 4",                                 at: { family: "gradJmf", i: 7 } },
  { sn: 124, kind: "numeric" , field: "JMF-# 8",                                 at: { family: "gradJmf", i: 8 } },
  { sn: 125, kind: "numeric" , field: "JMF-# 16",                                at: { family: "gradJmf", i: 9 } },
  { sn: 126, kind: "numeric" , field: "JMF-# 30",                                at: { family: "gradJmf", i: 10 } },
  { sn: 127, kind: "numeric" , field: "JMF-# 50",                                at: { family: "gradJmf", i: 11 } },
  { sn: 128, kind: "numeric" , field: "JMF-# 100",                               at: { family: "gradJmf", i: 12 } },
  { sn: 129, kind: "numeric" , field: "JMF-# 200",                               at: { family: "gradJmf", i: 13 } },
  { sn: 130, kind: "numeric" , field: "Perf. Spec. Avg % Air Voids # 1",         at: { family: "perf", i: 0 } },
  { sn: 131, kind: "numeric" , field: "Perf. Spec. Avg % Air Voids # 2",         at: { family: "perf", i: 1 } },
  { sn: 132, kind: "numeric" , field: "Perf. Spec. Avg % Air Voids # 3",         at: { family: "perf", i: 2 } },
  { sn: 133, kind: "numeric" , field: "Perf. Spec. Avg % Air Voids # 4",         at: { family: "perf", i: 3 } },
  { sn: 134, kind: "string"  , field: "Perf. Spec. Made With",                   at: { family: "lot", cell: "Calculations!AR1" } },
  { sn: 135, kind: "numeric" , field: "CT l75 #1",                               at: { family: "kyct", i: 0, key: "l75" } },
  { sn: 136, kind: "numeric" , field: "CT m75 #1",                               at: { family: "kyct", i: 0, key: "m75" } },
  { sn: 137, kind: "numeric" , field: "CT Wf #1",                                at: { family: "kyct", i: 0, key: "wf" } },
  { sn: 138, kind: "numeric" , field: "CT Gf #1",                                at: { family: "kyct", i: 0, key: "gf" } },
  { sn: 139, kind: "numeric" , field: "CT Index #1",                             at: { family: "kyct", i: 0, key: "index" } },
  { sn: 140, kind: "numeric" , field: "CT l75 #2",                               at: { family: "kyct", i: 1, key: "l75" } },
  { sn: 141, kind: "numeric" , field: "CT m75 #2",                               at: { family: "kyct", i: 1, key: "m75" } },
  { sn: 142, kind: "numeric" , field: "CT Wf #2",                                at: { family: "kyct", i: 1, key: "wf" } },
  { sn: 143, kind: "numeric" , field: "CT Gf #2",                                at: { family: "kyct", i: 1, key: "gf" } },
  { sn: 144, kind: "numeric" , field: "CT Index #2",                             at: { family: "kyct", i: 1, key: "index" } },
  { sn: 145, kind: "numeric" , field: "CT l75 #3",                               at: { family: "kyct", i: 2, key: "l75" } },
  { sn: 146, kind: "numeric" , field: "CT m75 #3",                               at: { family: "kyct", i: 2, key: "m75" } },
  { sn: 147, kind: "numeric" , field: "CT Wf #3",                                at: { family: "kyct", i: 2, key: "wf" } },
  { sn: 148, kind: "numeric" , field: "CT Gf #3",                                at: { family: "kyct", i: 2, key: "gf" } },
  { sn: 149, kind: "numeric" , field: "CT Index #3",                             at: { family: "kyct", i: 2, key: "index" } },
  { sn: 150, kind: "numeric" , field: "CT l75 #4",                               at: { family: "kyct", i: 3, key: "l75" } },
  { sn: 151, kind: "numeric" , field: "CT m75 #4",                               at: { family: "kyct", i: 3, key: "m75" } },
  { sn: 152, kind: "numeric" , field: "CT Wf #4",                                at: { family: "kyct", i: 3, key: "wf" } },
  { sn: 153, kind: "numeric" , field: "CT Gf #4",                                at: { family: "kyct", i: 3, key: "gf" } },
  { sn: 154, kind: "numeric" , field: "CT Index #4",                             at: { family: "kyct", i: 3, key: "index" } },
  { sn: 155, kind: "numeric" , field: "CT l75 #5",                               at: { family: "kyct", i: 4, key: "l75" } },
  { sn: 156, kind: "numeric" , field: "CT m75 #5",                               at: { family: "kyct", i: 4, key: "m75" } },
  { sn: 157, kind: "numeric" , field: "CT Wf #5",                                at: { family: "kyct", i: 4, key: "wf" } },
  { sn: 158, kind: "numeric" , field: "CT Gf #5",                                at: { family: "kyct", i: 4, key: "gf" } },
  { sn: 159, kind: "numeric" , field: "CT Index #5",                             at: { family: "kyct", i: 4, key: "index" } },
  { sn: 160, kind: "numeric" , field: "CT l75 #6",                               at: { family: "kyct", i: 5, key: "l75" } },
  { sn: 161, kind: "numeric" , field: "CT m75 #6",                               at: { family: "kyct", i: 5, key: "m75" } },
  { sn: 162, kind: "numeric" , field: "CT Wf #6",                                at: { family: "kyct", i: 5, key: "wf" } },
  { sn: 163, kind: "numeric" , field: "CT Gf #6",                                at: { family: "kyct", i: 5, key: "gf" } },
  { sn: 164, kind: "numeric" , field: "CT Index #6",                             at: { family: "kyct", i: 5, key: "index" } },
  { sn: 165, kind: "numeric" , field: "CT l75 #7",                               at: { family: "kyct", i: 6, key: "l75" } },
  { sn: 166, kind: "numeric" , field: "CT m75 #7",                               at: { family: "kyct", i: 6, key: "m75" } },
  { sn: 167, kind: "numeric" , field: "CT Wf #7",                                at: { family: "kyct", i: 6, key: "wf" } },
  { sn: 168, kind: "numeric" , field: "CT Gf #7",                                at: { family: "kyct", i: 6, key: "gf" } },
  { sn: 169, kind: "numeric" , field: "CT Index #7",                             at: { family: "kyct", i: 6, key: "index" } },
  { sn: 170, kind: "numeric" , field: "CT l75 #8",                               at: { family: "kyct", i: 7, key: "l75" } },
  { sn: 171, kind: "numeric" , field: "CT m75 #8",                               at: { family: "kyct", i: 7, key: "m75" } },
  { sn: 172, kind: "numeric" , field: "CT Wf #8",                                at: { family: "kyct", i: 7, key: "wf" } },
  { sn: 173, kind: "numeric" , field: "CT Gf #8",                                at: { family: "kyct", i: 7, key: "gf" } },
  { sn: 174, kind: "numeric" , field: "CT Index #8",                             at: { family: "kyct", i: 7, key: "index" } },
  { sn: 175, kind: "string"  , field: "Hamburg Made With",                       at: { family: "lot", cell: "Calculations!AR1" } },
  { sn: 176, kind: "numeric" , field: "Hamburg Pass 100 Left Max",               at: { family: "hamburg", i: 0 } },
  { sn: 177, kind: "numeric" , field: "Hamburg Pass 100 Right Max",              at: { family: "hamburg", i: 1 } },
  { sn: 178, kind: "numeric" , field: "Hamburg Pass 5000 Left Max",              at: { family: "hamburg", i: 2 } },
  { sn: 179, kind: "numeric" , field: "Hamburg Pass 5000 Right Max",             at: { family: "hamburg", i: 3 } },
  { sn: 180, kind: "numeric" , field: "Hamburg Pass 10000 Left Max",             at: { family: "hamburg", i: 4 } },
  { sn: 181, kind: "numeric" , field: "Hamburg Pass 10000 Right Max",            at: { family: "hamburg", i: 5 } },
  { sn: 182, kind: "numeric" , field: "Hamburg Pass 15000 Left Max",             at: { family: "hamburg", i: 6 } },
  { sn: 183, kind: "numeric" , field: "Hamburg Pass 15000 Right Max",            at: { family: "hamburg", i: 7 } },
  { sn: 184, kind: "numeric" , field: "Hamburg Pass 20000 Left Max",             at: { family: "hamburg", i: 8 } },
  { sn: 185, kind: "numeric" , field: "Hamburg Pass 20000 Right Max",            at: { family: "hamburg", i: 9 } },
  { sn: 186, kind: "numeric" , field: "Hamburg Pass 25000 Left Max",             at: { family: "hamburg", i: 10 } },
  { sn: 187, kind: "numeric" , field: "Hamburg Pass 25000 Right Max",            at: { family: "hamburg", i: 11 } },
  { sn: 188, kind: "numeric" , field: "Hamburg Max Deformation Left Max",        at: { family: "hamburg", i: 12 } },
  { sn: 189, kind: "constant", field: "Hamburg Max Deformation Right Max",       at: null },
  { sn: 190, kind: "constant", field: "Hamburg Pass Number Left Max",            at: null },
  { sn: 191, kind: "constant", field: "Hamburg Pass Number Right Max",           at: null },
  { sn: 192, kind: "constant", field: "Hamburg SIP Left Max",                    at: null },
  { sn: 193, kind: "constant", field: "Hamburg SIP Right Max",                   at: null },
  { sn: 194, kind: "numeric" , field: "CT Peak Flow # 1",                        at: { family: "kyct", i: 0, peak: true } },
  { sn: 195, kind: "numeric" , field: "CT Peak Stability # 1",                   at: { family: "kyct", i: 1, peak: true } },
  { sn: 196, kind: "numeric" , field: "CT Peak Flow # 2",                        at: { family: "kyct", i: 2, peak: true } },
  { sn: 197, kind: "numeric" , field: "CT Peak Stability # 2",                   at: { family: "kyct", i: 3, peak: true } },
  { sn: 198, kind: "numeric" , field: "CT Peak Flow # 3",                        at: { family: "kyct", i: 4, peak: true } },
  { sn: 199, kind: "numeric" , field: "CT Peak Stability # 3",                   at: { family: "kyct", i: 5, peak: true } },
  { sn: 200, kind: "numeric" , field: "CT Peak Flow # 4",                        at: { family: "kyct", i: 6, peak: true } },
  { sn: 201, kind: "numeric" , field: "CT Peak Stability # 4",                   at: { family: "kyct", i: 7, peak: true } },
  { sn: 202, kind: "numeric" , field: "CT Peak Flow # 5",                        at: { family: "kyct", i: 8, peak: true } },
  { sn: 203, kind: "numeric" , field: "CT Peak Stability # 5",                   at: { family: "kyct", i: 9, peak: true } },
  { sn: 204, kind: "numeric" , field: "CT Peak Flow # 6",                        at: { family: "kyct", i: 10, peak: true } },
  { sn: 205, kind: "numeric" , field: "CT Peak Stability # 6",                   at: { family: "kyct", i: 11, peak: true } },
  { sn: 206, kind: "numeric" , field: "CT Peak Flow # 7",                        at: { family: "kyct", i: 12, peak: true } },
  { sn: 207, kind: "numeric" , field: "CT Peak Stability # 7",                   at: { family: "kyct", i: 13, peak: true } },
  { sn: 208, kind: "numeric" , field: "CT Peak Flow # 8",                        at: { family: "kyct", i: 14, peak: true } },
  { sn: 209, kind: "numeric" , field: "CT Peak Stability # 8",                   at: { family: "kyct", i: 15, peak: true } },
  { sn: 253, kind: "numeric" , field: "Test Charges",                            at: { family: "explicit", at: [null,"Calculations!P84","Calculations!P278",null,null,null,null] } },
];

// ---------------------------------------------------------------------
//  What this map could NOT classify, stated rather than guessed.
//
//  One field out of 210. sn 253 "Test Charges" is wired to Calculations!P84
//  for QC01 and Calculations!P278 for QC02 and to nothing at all for the
//  other five blocks — no stride connects 84 to 278, QC03/QC04 are simply
//  missing, and it is also the one sn VI01 does not carry. It is reproduced
//  verbatim through the `explicit` family and flagged here. Do not invent a
//  third and fourth address for it; if PlantBook ever needs test charges,
//  ask KYTC what those two cells are before writing anything.
// ---------------------------------------------------------------------
export const UNCLASSIFIED = [
  { sn: 253, field: "Test Charges",
    why: "QC01 -> Calculations!P84, QC02 -> Calculations!P278, no stride between them; QC03/QC04/VI01/QA01/IQ01 have no source." },
];

// Lookup by field sequence number. Built once — FIELDS is static.
const BY_SN = new Map(FIELDS.map((f) => [f.sn, f]));
export const bySn = (sn) => BY_SN.get(sn) || null;

// Everything under one name, for callers that would rather not import ten.
export const AMAW = {
  BLOCKS, SUBLOT_OF,
  LOT, AGGREGATE, SUBLOT, VERIFY, GRADATION, CORES, KYCT, PAY,
  HAMBURG, PERFORMANCE, CALC, STAGING,
  FIELDS, UNCLASSIFIED, bySn, addressOf,
};
export default AMAW;
