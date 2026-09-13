#!/usr/bin/env node
// Does the AMAW mapper put a lot back where KYTC put it?
//
//   node scripts/amaw/check_mapper.mjs <lot1.xlsm> [lot2.xlsm ...] \
//        [--template public/../AMAW_VER14_01.xlsm]
//
// The same shape as scripts/mixpack/check_page_engine.mjs, and for the same
// reason: a mapper can be internally consistent and still be writing into
// the wrong cell, and the only thing that says otherwise is a real completed
// workbook. So this reads a real AMAW INTO a PlantBook lot payload, hands
// that payload to `amawCells()`, and diffs every cell it produces against
// what the workbook itself holds there.
//
//   matching             produced == the workbook
//   expected difference  produced != the workbook for a reason named below
//   UNEXPLAINED          everything else - must be 0
//
// And the half a value-diff alone would miss: COVERAGE. Every cell a real
// lot has TYPED is enumerated, and any one the mapper produced nothing for
// is listed. A mapper that quietly forgets the joint cores passes a value
// diff perfectly.
//
// AMAW workbooks are not committed (docs/amaw-map.md says why), so this
// takes paths. No npm dependencies: the zip layer is `unzip -p` and the cell
// reader is the MixPack scripts'. SheetJS is not used and must not be - AMAW
// carries a chartsheet AND a Dialog1 dialogsheet, so its SheetNames shift is
// worse than the MixPack's and `wb.Sheets["t_smpl"]` comes back as
// `t_cont_smpl`. Sheets are resolved through xl/workbook.xml -> the rels ->
// the worksheet part, below.
import { execSync } from 'child_process';
import { cellsOf, sharedStrings } from '../mixpack/xlsx.mjs';
import { CALC, CORES, GRADATION, KYCT, LOT, SUBLOT, SUBLOT_OF, addressOf } from './addresses.mjs';
import { amawCells, INPUTS, FLAGS, UNCLASSIFIED, A, colShift } from './mapper.mjs';

const argv = process.argv.slice(2);
const tplFlag = argv.indexOf('--template');
// The blank AMAW is a public KYTC download and is deliberately NOT committed
// (docs/amaw-map.md), so there is no default path worth pretending to: say so
// rather than failing on a path nobody has.
const TEMPLATE = tplFlag >= 0 ? argv[tplFlag + 1] : process.env.AMAW_TEMPLATE;
const LOTS = argv.filter((a, i) => a !== '--template' && i !== tplFlag + 1 && !a.startsWith('--'));
if (!LOTS.length || !TEMPLATE) {
  console.error('usage: check_mapper.mjs <lot.xlsm> [...] --template AMAW_VER14_01.xlsm');
  console.error('       (or set AMAW_TEMPLATE; get the blank from transportation.ky.gov/Materials/Documents/AMAW_VER14_01.xlsm)');
  process.exit(2);
}

// ---- zip / sheet plumbing (identical to check_addresses.mjs) ---------
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
  const sheet = (name) => {
    if (cache.has(name)) return cache.get(name);
    const part = parts[name];
    const cells = (part && /worksheets/.test(part)) ? cellsOf(unz(file, `xl/${part}`), sst) : new Map();
    cache.set(name, cells);
    return cells;
  };
  return { sheet, names: Object.keys(parts) };
}

const split = (addr) => {
  const m = /^(?:'([^']+)'|([^!]+))!([A-Z]+\d+)$/.exec(String(addr || ''));
  return m ? { sheet: m[1] ?? m[2], cell: m[3] } : null;
};
const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
// `slot` is bookkeeping, not data: a row carrying only its own index is an
// empty slot and must be dropped, or every blank table reads as full.
const hasMeasurement = (row) => Object.keys(row).some((k) => k !== 'slot' && row[k] != null);
const cellValue = (c) => {
  if (!c) return null;
  const raw = c.value ?? c.v;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return NUMRE.test(String(raw)) ? +raw : String(raw);
};

// =====================================================================
//  THE READER — a real AMAW -> a PlantBook lot payload
// =====================================================================
// Deliberately the mirror image of the mapper and nothing more: it reads the
// cells the mapper writes, through the same constants, and assembles the
// envelope storage.mjs defines. Anything it cannot place is left out, and
// the coverage pass at the end is what catches that.
function readLot(wb) {
  const at = (addr) => { const s = split(addr); return s ? cellValue(wb.sheet(s.sheet).get(s.cell)) : null; };
  const L = (key) => at(A(LOT.sheet, LOT[key]));

  const values = {}, rows = {}, records = {};

  // ---- identity and header -----------------------------------------
  const lot = {
    contract_id: L('contract'),
    amp_number: L('plantCode') == null ? null : String(L('plantCode')).trim(),
    mix_id: null, mix_signature: null,
    lot_number: at(FLAGS.lotNumber) ?? at(A(LOT.sheet, LOT.lotNumber)),
    plant_name: null,
    values, rows, records,
  };
  // 'Pay Values'!D9 is "<MIX ID> <signature>" - split on the first space.
  const mixLine = L('mixId');
  if (mixLine) {
    const m = /^(\S+)\s+(.*)$/.exec(String(mixLine));
    lot.mix_id = m ? m[1] : String(mixLine);
    lot.mix_signature = m ? m[2] : null;
    values.mix_id_line = String(mixLine);
  }
  values.county = L('county');
  values.item_code = L('itemCode');
  values.lot_tons = L('lotTons');
  values.unit = L('unit');
  values.unit_price = L('unitPrice');
  values.kytc_lab_id = L('kytcLabId');
  values.ps_lab_id = L('psLabId');
  values.approver_name = L('approverName');
  values.approver_id = L('approverId');
  values.material_code = L('materialCode');
  values.approved_mix_design = L('approvedMixDesign');
  values.plant_code = lot.amp_number;
  values.sample_id_prefix = at(INPUTS.sampleIdPrefix);
  values.binder_producer = at(INPUTS.binderProducer);
  values.additive = at(INPUTS.additive);
  values.gyrations_ndes = at(INPUTS.gyrationsNdes);
  values.hand_mixed_ac = at(INPUTS.handMixedAc);
  values.recycle_ac_pct = at(A(SUBLOT.sheet, INPUTS.recycle.lotAc));

  // ---- control flags ------------------------------------------------
  values.mix_type_code = at(FLAGS.mixTypeCode);
  values.esal_class = at(FLAGS.esalClass) ?? at(A(LOT.sheet, LOT.esalClass));
  values.density_option = at(FLAGS.densityOption);
  values.joint_density = at(FLAGS.jointDensity);
  values.acceptance_method = at(FLAGS.acceptanceMethod);
  values.binder_grade_key = at(FLAGS.binderGradeKey);
  values.perf_spec_made_with = at(FLAGS.perfSpecMadeWith);

  // ---- the blend ----------------------------------------------------
  const B = INPUTS.blend;
  rows.aggregate = [];
  for (let i = 0; i < B.count; i++) {
    const row = B.first + i;
    const c = {
      producer: at(A(B.sheet, `${B.cols.producer}${row}`)),
      agp_number: at(A(B.sheet, `${B.cols.agpNumber}${row}`)),
      type_size: at(A(B.sheet, `${B.cols.typeSize}${row}`)),
      mat_code: at(A(B.sheet, `${B.cols.matCode}${row}`)),
      pct: at(A(B.sheet, `${B.cols.pct}${row}`)),
      bod: at(addressOf({ at: { family: 'agg', part: 'bod', i } }, 'QC01')),
    };
    if (c.type_size == null && c.agp_number == null) break;
    if (typeof c.agp_number === 'string') c.agp_number = c.agp_number.trim();
    rows.aggregate.push(c);
  }

  // ---- the JMF target gradation -------------------------------------
  values.jmf = {};
  GRADATION.sieves.forEach((sieve, i) => {
    const n = at(addressOf({ at: { family: 'gradJmf', i } }, 'QC01'));
    if (n != null) values.jmf[sieve] = n;
  });

  // ---- the four QC sublots ------------------------------------------
  for (const block of ['QC01', 'QC02', 'QC03', 'QC04']) {
    const s = SUBLOT_OF[block];
    const rv = {}, rr = {};
    const tk = SUBLOT.ticket, tRow = tk.first + (s - 1) * tk.stride;
    rv.date = at(A(SUBLOT.sheet, `${tk.cols.date}${tRow}`));
    rv.time = at(A(SUBLOT.sheet, `${tk.cols.time}${tRow}`));
    rv.truck = at(A(SUBLOT.sheet, `${tk.cols.truck}${tRow}`));
    rv.tons = at(A(SUBLOT.sheet, `${tk.cols.tons}${tRow}`));
    rv.temperature = at(A(SUBLOT.sheet, `${tk.cols.temperature}${tRow}`));
    rv.tested_by = at(A(SUBLOT.sheet, SUBLOT.technician[s - 1]));
    rv.acceptance_code = at(A(FLAGS.sublotAcceptanceCode.sheet,
      `${FLAGS.sublotAcceptanceCode.col}${FLAGS.sublotAcceptanceCode.first + (s - 1)}`));
    rv.acceptance_label = at(A(FLAGS.sublotAcceptanceLabel.sheet,
      `${FLAGS.sublotAcceptanceLabel.col}${FLAGS.sublotAcceptanceLabel.first + (s - 1)}`));
    rv.binder_lot = at(addressOf({ at: { family: 'payLotNo' } }, block));
    rv.tack_lot = at(addressOf({ at: { family: 'payLotNo', tack: true } }, block));
    rv.jmf_ac = at(A(INPUTS.jmfAc.sheet, `${INPUTS.jmfAc.col}${INPUTS.jmfAc.first + (s - 1) * INPUTS.jmfAc.stride}`));
    rv.ac_from_recycle = at(A(SUBLOT.sheet, `${INPUTS.recycle.acFromRecycle.cols[s - 1]}${INPUTS.recycle.acFromRecycle.row}`));

    const PO = INPUTS.polish, prow = PO.first + (s - 1) * PO.stride;
    rv.polish_date = at(A(PO.sheet, `${PO.cols.date}${prow}`));
    rv.polish_coarse_pct = at(A(PO.sheet, `${PO.cols.coarsePct}${prow}`));
    rv.polish_fine_pct = at(A(PO.sheet, `${PO.cols.finePct}${prow}`));

    const MO = INPUTS.moisture, mcol = MO.cols[s - 1];
    rv.moisture_before = at(A(MO.sheet, `${mcol}${MO.rows.panAndMixBefore}`));
    rv.moisture_after = at(A(MO.sheet, `${mcol}${MO.rows.panAndMixAfter}`));
    rv.moisture_pan = at(A(MO.sheet, `${mcol}${MO.rows.pan}`));

    const SP = INPUTS.specimens;
    rr.specimens = [];
    for (let i = 0; i < SP.count; i++) {
      const row = SP.first + (s - 1) * SP.stride + i;
      const sp = {
        slot: i,
        wt_air: at(A(SP.sheet, `${SP.cols.wtAir}${row}`)),
        wt_water: at(A(SP.sheet, `${SP.cols.wtWater}${row}`)),
        wt_ssd: at(A(SP.sheet, `${SP.cols.wtSsd}${row}`)),
      };
      if (sp.wt_air != null || sp.wt_water != null || sp.wt_ssd != null) rr.specimens.push(sp);
    }

    const GM = INPUTS.gmm, gcols = GM.cols[s - 1];
    rr.gmm = gcols.map((col, gi) => ({
      slot: gi,
      wt_mix: at(A(GM.sheet, `${col}${GM.rows.mix}`)),
      calibration: at(A(GM.sheet, `${col}${GM.rows.calibration}`)),
      total: at(A(GM.sheet, `${col}${GM.rows.total}`)),
      final_wt: at(A(GM.sheet, `${col}${GM.rows.final}`)),
      absorbed_water: at(A(GM.sheet, `${col}${GM.rows.absorbed}`)),
      msg: at(A(GM.sheet, `${col}${GM.rows.msg}`)),
    })).filter(hasMeasurement);

    const GR = INPUTS.gradation, gcol = GR.cols[s - 1];
    rr.gradation = [];
    GRADATION.sieves.forEach((sieve, i) => {
      const g = at(A(GR.sheet, `${gcol}${GR.first + i}`));
      if (g != null) rr.gradation.push({ sieve, grams_retained: g });
    });
    rv.grams_pan = at(A(GR.sheet, `${gcol}${GR.panRow}`));
    rv.grams_total = at(A(GR.sheet, `${gcol}${GR.totalRow}`));
    rv.gradation_date = at(A(GR.sheet, `${GR.dateCols[s - 1]}${GR.dateRow}`));
    rv.ac_pct = at(A(GR.sheet, `${GR.acCols[s - 1]}${GR.acRow}`));

    // Cores: every slot of both banks, blanks dropped. The count is fixed
    // neither per lot nor per sublot, so nothing here assumes one.
    const CO = INPUTS.cores;
    rr.cores = [];
    CORES.banks.forEach((bank, bi) => {
      for (let slot = 0; slot < bank.count; slot++) {
        const row = bank.first + slot + (s - 1) * bank.stride;
        const c = {
          bank: bi, slot,
          station: at(addressOf({ at: { family: 'cores', bank: bi, slot, key: 'station' } }, block)),
          wt_air: at(A(CO.sheet, `${CO.cols.wtAir}${row}`)),
          wt_water: at(A(CO.sheet, `${CO.cols.wtWater}${row}`)),
          wt_ssd: at(A(CO.sheet, `${CO.cols.wtSsd}${row}`)),
          density: at(A(CO.sheet, `${CO.cols.density}${row}`)),
          // % solid density is a formula on the sheet; the mapper needs the
          // number to ask pay.mjs for the core's pay value, and the number
          // is what a PlantBook technician sees, so it rides on the row.
          pct_solid: at(addressOf({ at: { family: 'cores', bank: bi, slot, key: 'pctSolid' } }, block)),
        };
        if ([c.wt_air, c.wt_water, c.wt_ssd, c.density, c.station].some((x) => x != null)) rr.cores.push(c);
      }
    });

    // KYCT: one sheet per sublot, eight specimens. Both real lots are empty.
    const kyctSheet = KYCT.sheetFor(s), H = INPUTS.kyct.header;
    rr.kyct = [];
    KYCT.specimenCols.forEach((col, i) => {
      const spec = {
        slot: i,
        sample_id: at(A(kyctSheet, `${colShift(col, -1)}${H.sampleId}`)),
        temp_c: at(A(kyctSheet, `${col}${H.tempC}`)),
        air_voids: at(A(kyctSheet, `${col}${H.airVoids}`)),
        diameter: at(A(kyctSheet, `${col}${H.diameter}`)),
        thickness: at(A(kyctSheet, `${col}${H.thickness}`)),
        index: at(addressOf({ at: { family: 'kyct', i, key: 'index' } }, block)),
        l75: at(addressOf({ at: { family: 'kyct', i, key: 'l75' } }, block)),
        m75: at(addressOf({ at: { family: 'kyct', i, key: 'm75' } }, block)),
        wf: at(addressOf({ at: { family: 'kyct', i, key: 'wf' } }, block)),
        gf: at(addressOf({ at: { family: 'kyct', i, key: 'gf' } }, block)),
        peak_flow: at(addressOf({ at: { family: 'kyct', i: i * 2, peak: true } }, block)),
        peak_stability: at(addressOf({ at: { family: 'kyct', i: i * 2 + 1, peak: true } }, block)),
      };
      if (hasMeasurement(spec)) rr.kyct.push(spec);
    });

    // The per-sublot blend percentages, kept as an override so a plant that
    // shifted its blend mid-lot round-trips rather than being flattened.
    const over = rows.aggregate.map((c, i) => ({ pct: at(addressOf({ at: { family: 'agg', part: 'pct', i } }, block)) }));
    if (over.some((o, i) => o.pct != null && o.pct !== rows.aggregate[i].pct)) rr.blend = over;

    records[block] = { values: rv, rows: rr };
  }

  // ---- QA01 / IQ01 --------------------------------------------------
  const V = INPUTS.verify;
  ['QA01', 'IQ01'].forEach((block, slot) => {
    const rv = {}, rr = {};
    rv.sublot_verified = at(A(CALC.sheet, V.sublotIndex[slot]));
    rv.tested_by = at(A(V.sheet, V.inspectorId[slot]));
    rv.tested_by_name = at(A(V.sheet, V.inspectorName[slot]));
    rv.acceptance_label = at(A(FLAGS.sublotAcceptanceLabel.sheet, FLAGS.sublotAcceptanceLabel.verify[slot]));
    rr.specimens = [];
    for (let i = 0; i < V.specimens.count; i++) {
      const row = V.specimens.first + slot * V.specimens.stride + i;
      const sp = {
        wt_air: at(A(V.sheet, `${V.specimens.cols.wtAir}${row}`)),
        wt_water: at(A(V.sheet, `${V.specimens.cols.wtWater}${row}`)),
        wt_ssd: at(A(V.sheet, `${V.specimens.cols.wtSsd}${row}`)),
      };
      if (hasMeasurement(sp)) rr.specimens.push(sp);
    }
    rr.gmm = V.gmm.cols[slot].map((col, gi) => ({
      slot: gi,
      wt_mix: at(A(V.sheet, `${col}${V.gmm.rows.mix}`)),
      calibration: at(A(V.sheet, `${col}${V.gmm.rows.calibration}`)),
      total: at(A(V.sheet, `${col}${V.gmm.rows.total}`)),
      final_wt: at(A(V.sheet, `${col}${V.gmm.rows.final}`)),
      absorbed_water: at(A(V.sheet, `${col}${V.gmm.rows.absorbed}`)),
      msg: at(A(V.sheet, `${col}${V.gmm.rows.msg}`)),
    })).filter(hasMeasurement);
    rr.gradation = [];
    GRADATION.sieves.forEach((sieve, i) => {
      const g = at(A(V.sheet, `${V.gradation.cols[slot]}${V.gradation.first + i}`));
      if (g != null) rr.gradation.push({ sieve, grams_retained: g });
    });
    rv.grams_pan = at(A(V.sheet, `${V.gradation.cols[slot]}${V.gradation.panRow}`));
    rv.grams_total = at(A(V.sheet, `${V.gradation.cols[slot]}${V.gradation.totalRow}`));
    rv.moisture_before = at(A(V.sheet, `${V.moisture.cols[slot]}${V.moisture.rows.panAndMixBefore}`));
    rv.moisture_after = at(A(V.sheet, `${V.moisture.cols[slot]}${V.moisture.rows.panAndMixAfter}`));
    rv.moisture_pan = at(A(V.sheet, `${V.moisture.cols[slot]}${V.moisture.rows.pan}`));
    records[block] = { values: rv, rows: rr };
  });

  // VI01 has no storage of its own - it reads sublot 1's cells (and the
  // derived Field Rutting columns). Recorded as present-but-empty.
  records.VI01 = { values: {}, rows: {} };

  // ---- the hand-mixed check sample ----------------------------------
  const GM = INPUTS.gmm;
  rows.hand_mixed = GM.handMixed.map((col, gi) => ({
    slot: gi,
    wt_mix: at(A(GM.sheet, `${col}${GM.rows.mix}`)),
    calibration: at(A(GM.sheet, `${col}${GM.rows.calibration}`)),
    total: at(A(GM.sheet, `${col}${GM.rows.total}`)),
    final_wt: at(A(GM.sheet, `${col}${GM.rows.final}`)),
    absorbed_water: at(A(GM.sheet, `${col}${GM.rows.absorbed}`)),
    msg: at(A(GM.sheet, `${col}${GM.rows.msg}`)),
  })).filter(hasMeasurement);

  // ---- Field Rutting ------------------------------------------------
  const RU = INPUTS.rutting;
  const rut = { idt_ht: [], ideal_rt: [] };
  for (let i = 0; i < RU.idt.count; i++) {
    const row = RU.idt.first + i, dcol = colShift(RU.idt.dims.first, i);
    const sp = {
      slot: i,
      peak_load: at(A(RU.sheet, `${RU.idt.load}${row}`)),
      strength: at(A(RU.sheet, `${RU.idt.strength}${row}`)),
      diameter: at(A(RU.sheet, `${dcol}${RU.idt.dims.diameter}`)),
      thickness: at(A(RU.sheet, `${dcol}${RU.idt.dims.thickness}`)),
    };
    if (Object.values(sp).some((x) => x != null)) rut.idt_ht.push(sp);
  }
  for (let i = 0; i < RU.ideal.count; i++) {
    const row = RU.ideal.first + i, dcol = colShift(RU.ideal.dims.first, i);
    const sp = {
      slot: i,
      peak_load: at(A(RU.sheet, `${RU.ideal.load}${row}`)),
      rt_index: at(A(RU.sheet, `${RU.ideal.index}${row}`)),
      diameter: at(A(RU.sheet, `${dcol}${RU.ideal.dims.diameter}`)),
      thickness: at(A(RU.sheet, `${dcol}${RU.ideal.dims.thickness}`)),
    };
    if (Object.values(sp).some((x) => x != null)) rut.ideal_rt.push(sp);
  }
  if (rut.idt_ht.length || rut.ideal_rt.length) rows.rutting = rut;

  // ---- performance specimens ----------------------------------------
  rows.performance = INPUTS.performance.banks.map((spec) => ({
    specimens: spec.cols.map((col, ci) => ({
      slot: ci,
      thickness: at(A(INPUTS.performance.sheet, `${col}${spec.rows.thickness}`)),
      dry_wt: at(A(INPUTS.performance.sheet, `${col}${spec.rows.dry}`)),
      ssd_wt: at(A(INPUTS.performance.sheet, `${col}${spec.rows.ssd}`)),
      wt_water: at(A(INPUTS.performance.sheet, `${col}${spec.rows.water}`)),
      gmm: at(A(INPUTS.performance.sheet, `${col}${spec.rows.gmm}`)),
      air_voids: at(A(INPUTS.performance.sheet, `${col}${spec.rows.airVoids}`)),
    })).filter(hasMeasurement),
  })).filter((b) => b.specimens.length);

  // ---- the two flat tabs --------------------------------------------
  const PI = INPUTS.projectItems;
  rows.project_items = [];
  for (let r = PI.firstRow; r <= PI.lastRow; r++) {
    const project = at(A(PI.sheet, `${PI.cols.project}${r}`));
    if (project == null) continue;
    rows.project_items.push({
      project, line: at(A(PI.sheet, `${PI.cols.line}${r}`)),
      quantity: at(A(PI.sheet, `${PI.cols.qty}${r}`)),
      unit: at(A(PI.sheet, `${PI.cols.unit}${r}`)),
    });
  }
  const CT = INPUTS.certTechs;
  rows.technicians = [];
  for (let r = CT.firstRow; r <= CT.lastRow; r++) {
    const smId = at(A(CT.sheet, `${CT.cols.smId}${r}`));
    if (smId == null) continue;
    rows.technicians.push({ sm_id: smId, name: at(A(CT.sheet, `${CT.cols.name}${r}`)) });
  }

  // 'Pay Values'!A13:A16 is per sublot; both real lots repeat one figure, so
  // carry it lot-level too for a lot that has not been imported.
  values.jmf_ac = records.QC01.values.jmf_ac;
  return lot;
}

// =====================================================================
//  EXPECTED DIFFERENCES
// =====================================================================
// Four classes, and each one is a fact about the files rather than a place
// to hide a bug. Anything outside them is UNEXPLAINED and fails the run.
//
//  1. VERSION DRIFT. Jake's lots are Version 13.3 and the public template is
//     14.01 (docs/amaw-map.md). Where 13.3 typed a cell that 14.01 computes,
//     the mapper correctly routes our value to `evalOnly` and writes
//     nothing - so the cell reads as "not carried" against a 13.3 file while
//     being right for the template we generate into.
//  2. A CELL THE TEMPLATE COMPUTES. `evalOnly` values are compared against
//     the workbook's cached result; a difference there is real and is NOT
//     forgiven.
//  3. THE REFERENCE SHEETS. `Producer supplier`, `PG Producer` and
//     `.45 Data` are KYTC's own in-workbook lists and cached chart data;
//     they differ between versions and are not lot data.
//  4. THE NAMED UNKNOWNS. mapper.mjs's UNCLASSIFIED and addresses.mjs's.
const REFERENCE_SHEETS = /^(Producer supplier|PG Producer|\.45 Data|Workbook Edits|AMAMAW|Drop_Downs)/;
const STAGING_SHEETS = /^(t_|discipline)/;

function main() {
  // The template's own knowledge. `formulaAt` is the whole reason the mapper
  // gets the two write modes right on a workbook this inconsistently wired.
  const tplWb = openWorkbook(TEMPLATE);
  const tplFormula = (addr) => {
    const s = split(addr); if (!s) return null;
    const c = tplWb.sheet(s.sheet).get(s.cell);
    return (c && c.formula) || (c && c.f) || null;
  };
  // The template's own plant list. It runs to row 140 in VER 14.01 even
  // though 'Pay Values'!C6 looks it up over B3:C106 - KYTC's range never grew
  // with the list, which is why both completed lots show #N/A there for
  // AMP070302 (row 130). Read the whole list; the mapper reports the gap.
  const plants = [];
  for (let r = 2; r <= 200; r++) {
    const key = cellValue(tplWb.sheet('Producer supplier').get(`B${r}`));
    if (key != null) plants.push({ key: String(key), name: cellValue(tplWb.sheet('Producer supplier').get(`C${r}`)), row: r });
  }
  const tpl = { formulaAt: tplFormula, plants };
  // No Supabase here: the check is about addresses, and every lot on file
  // carries its own AGP/AMP numbers anyway. An empty `ref` also proves the
  // mapper degrades rather than throwing when the lists are not loaded.
  const ref = {};

  let failed = 0;
  for (const file of LOTS) {
    console.log(`\n${'='.repeat(74)}\n${file}\n${'='.repeat(74)}`);
    const wb = openWorkbook(file);
    const at = (addr) => { const s = split(addr); return s ? cellValue(wb.sheet(s.sheet).get(s.cell)) : null; };
    const lot = readLot(wb);
    const { values, evalOnly, report } = amawCells(lot, tpl, ref);

    console.log(`lot                  : contract ${lot.contract_id}, lot ${lot.lot_number}, ${lot.mix_id || '?'} `
              + `(${(lot.rows.aggregate || []).length} components, ${report.blocks.join('/') || 'no records'})`);
    console.log(`produced             : ${report.cells} written + ${report.supplied} supplied to the evaluator`);

    // ---- 1. every produced cell against the workbook ----------------
    const produced = new Map();
    for (const [k, v] of Object.entries(values)) produced.set(k, { v, mode: 'write' });
    for (const [k, v] of Object.entries(evalOnly)) produced.set(k, { v, mode: 'supply' });

    let ok = 0; const diffs = [], blankInWorkbook = [];
    for (const [addr, { v, mode }] of produced) {
      const want = at(addr);
      if (want === null) { blankInWorkbook.push([addr, v, mode]); continue; }
      const same = (typeof v === 'number' && typeof want === 'number')
        ? Math.abs(v - want) <= 1e-9 * Math.max(1, Math.abs(want))
        : String(v).trim() === String(want).trim();
      if (same) ok++; else diffs.push([addr, v, want, mode]);
    }

    // ---- 2. coverage: what the lot has typed and we did not write ----
    // The rule regenerate.mjs uses, applied to the lot rather than the
    // staging: a cell with a value, no formula of its own, that the template
    // neither computes nor already holds, is something a human entered.
    const typed = [];
    for (const sheet of wb.names) {
      if (REFERENCE_SHEETS.test(sheet) || STAGING_SHEETS.test(sheet)) continue;
      const tplCells = tplWb.sheet(sheet);
      for (const [cellRef, c] of wb.sheet(sheet)) {
        if (c.formula || c.f) continue;
        const val = cellValue(c); if (val === null) continue;
        const t = tplCells.get(cellRef);
        if (t && (t.formula || t.f)) continue;
        if (t && cellValue(t) !== null && String(cellValue(t)) === String(val)) continue;
        typed.push([`${/[^A-Za-z0-9_.]/.test(sheet) ? `'${sheet}'` : sheet}!${cellRef}`, val]);
      }
    }
    const notCarried = typed.filter(([addr]) => !produced.has(addr));

    console.log(`\ncells produced matching the workbook : ${ok}`);
    console.log(`produced where the workbook is blank : ${blankInWorkbook.length}`);
    console.log(`typed cells in the lot               : ${typed.length}`);
    console.log(`  of which the mapper carries        : ${typed.length - notCarried.length}`);
    console.log(`  of which it does not               : ${notCarried.length}`);

    // ---- 3. classify ------------------------------------------------
    const known = new Set(UNCLASSIFIED.map((u) => u.cell));
    const explainNotCarried = ([addr, v]) => {
      if (known.has(addr)) return 'named in mapper.mjs UNCLASSIFIED';
      // A 13.3 literal where 14.01 has a formula never reaches this list
      // (the coverage pass already skips template-formula cells), so what is
      // left here is genuinely a cell nothing in the mapper reaches.
      const s = split(addr);
      if (s && s.sheet === CALC.sheet) return 'Calculations scratch: a cached lookup row the workbook fills by hand';
      // The version marker. 'Pay Values'!K1 says which BUILD of the workbook
      // this is ("Version 13.3"); the file we generate is whatever template
      // we generated into, so the mapper must not carry it forward - a 13.3
      // marker on a 14.01 workbook would be a lie (docs/amaw-map.md: K1 is
      // the only reliable version marker, so it matters that it is right).
      if (addr === A(LOT.sheet, LOT.version)) return "the workbook's own version marker; the template supplies its own";
      // A printed caption. 13.3 and 14.01 word several of them differently
      // ("As Tested % AC:"), which makes them differ from the template
      // without being lot data. The loader never sees them.
      if (typeof v === 'string' && /[:?]$/.test(v.trim())) return 'a printed caption, worded differently in 13.3 than in 14.01';
      return null;
    };
    const unexplainedNotCarried = notCarried.filter((r) => !explainNotCarried(r));
    const explainedNotCarried = notCarried.filter((r) => explainNotCarried(r));

    const explainBlank = ([addr, v, mode]) => {
      // We computed a value for a cell the real lot simply left empty. The
      // only benign case is a derived convenience (a bowl total from its two
      // weights) on a column the template computes anyway.
      if (mode === 'supply') return 'supplied to the evaluator for a cell the template computes; the workbook cached nothing there';
      return null;
    };
    const unexplainedBlank = blankInWorkbook.filter((r) => !explainBlank(r));

    const explainDiff = ([addr, got, want]) => {
      if (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) <= 5e-4 * Math.max(1, Math.abs(want)))
        return 'rounding: the workbook stores Excel\'s 15-digit figure';
      if (typeof want === 'string' && want.startsWith('#')) return 'the workbook cached an Excel error there';
      return null;
    };
    const unexplainedDiffs = diffs.filter((d) => !explainDiff(d));

    const expected = (diffs.length - unexplainedDiffs.length)
      + (blankInWorkbook.length - unexplainedBlank.length)
      + (notCarried.length - unexplainedNotCarried.length);
    const unexplained = unexplainedDiffs.length + unexplainedBlank.length + unexplainedNotCarried.length;

    console.log(`\nmatching                : ${ok}`);
    console.log(`expected differences    : ${expected}`);
    console.log(`UNEXPLAINED             : ${unexplained}`);

    if (unexplainedDiffs.length) {
      console.log(`\n  value differs (${unexplainedDiffs.length}):`);
      for (const [addr, got, want, mode] of unexplainedDiffs.slice(0, 25))
        console.log(`    ${addr.padEnd(26)} ${mode}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
    }
    if (unexplainedBlank.length) {
      console.log(`\n  produced where the workbook is blank (${unexplainedBlank.length}):`);
      for (const [addr, v] of unexplainedBlank.slice(0, 25)) console.log(`    ${addr.padEnd(26)} ${JSON.stringify(v)}`);
    }
    if (unexplainedNotCarried.length) {
      console.log(`\n  the lot has it typed and the mapper does not carry it (${unexplainedNotCarried.length}):`);
      for (const [addr, v] of unexplainedNotCarried.slice(0, 40)) console.log(`    ${addr.padEnd(26)} ${JSON.stringify(String(v).slice(0, 30))}`);
    }

    // ---- 4. the mapper's own report, which is the point of it -------
    if (explainedNotCarried.length) {
      console.log(`\nexpected differences, one line each:`);
      for (const r of explainedNotCarried) console.log(`   - ${r[0].padEnd(24)} ${explainNotCarried(r)}`);
    }
    if (report.missing.length) {
      console.log(`\nthe mapper reports ${report.missing.length} thing(s) this lot should carry and does not:`);
      for (const m of report.missing) console.log(`   - ${m}`);
    }
    if (report.notes.length) {
      console.log(`\nnotes:`);
      for (const n of report.notes) console.log(`   * ${n}`);
    }
    if (report.unmapped.length) console.log(`\nunmapped payload entries: ${report.unmapped.join(', ')}`);

    if (unexplained) failed++;
  }
  process.exit(failed ? 1 : 0);
}

main();
