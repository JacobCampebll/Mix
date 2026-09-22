#!/usr/bin/env node
// Ground truth for the AMAW lot-pay port.
//
//   node scripts/amaw/check_pay.mjs path/to/lot1.xlsm [path/to/lot2.xlsm ...]
//
// pay.mjs is a hand port of a pay schedule that decides money, so the only
// acceptable evidence that it is right is a real completed AMAW agreeing with
// it cell for cell. This reads the INPUTS out of a workbook (the typed
// volumetrics, the core densities, the four control flags, tonnage and unit
// price), runs them back through pay.mjs, and diffs every result against the
// value Excel itself cached in that same file - per-core pay, per-sublot pay,
// lot averages, both densities, the weights, the final percentage, and the
// tonnage and dollar adjustments. Anything that does not match is a bug in
// pay.mjs, not in the workbook.
//
// Real AMAWs carry technician IDs and contractor data and are gitignored, so
// this takes paths rather than shipping a fixture. Same rule as
// scripts/mixpack/check_staging.mjs.
//
// No dependencies: it shells out to unzip(1) for the zip layer and reads the
// worksheet XML directly. SheetJS is not an option here - it misfiles every
// sheet after a chartsheet, and AMAW has a chartsheet AND a dialogsheet, so
// wb.Sheets["t_smpl"] comes back as t_cont_smpl (see docs/amaw-map.md).
import { execFileSync } from 'child_process';
import {
  lotPay, propertyWeights, laneDensityLot, jointDensityLot,
  laneCorePay, jointCorePay, sublotPay, MCL,
  sievePay, specialtyAcPay, finenessModulusPay, finenessModulus, roundToHalf,
  gradationSublotPay, gradationLotPay, controlPointBand,
} from './pay.mjs';

// ---------------------------------------------------------------------------
// A minimal xlsx reader: sheet name -> Map(ref -> cached value)
// ---------------------------------------------------------------------------
function openWorkbook(file) {
  const part = p => {
    try { return execFileSync('unzip', ['-p', file, p], { maxBuffer: 1 << 28 }).toString('utf8'); }
    catch { return null; }
  };
  const rels = {};
  for (const m of part('xl/_rels/workbook.xml.rels').matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, '');
  }
  const sheetPath = {};
  for (const m of part('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g)) {
    sheetPath[unesc(m[1])] = 'xl/' + rels[m[2]];
  }
  const ssXml = part('xl/sharedStrings.xml') || '';
  const shared = [...ssXml.matchAll(/<si>((?:(?!<\/si>)[\s\S])*)<\/si>/g)]
    .map(m => unesc(m[1].replace(/<[^>]*>/g, '')));

  const cache = new Map();
  return function cells(name) {
    if (cache.has(name)) return cache.get(name);
    const out = new Map();
    const xml = sheetPath[name] ? part(sheetPath[name]) : null;
    if (xml) {
      // Cell-bounded on purpose: a greedy <v>...</v> match runs straight past
      // </c> on these sheets and invents values.
      for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>((?:(?!<\/c>)[\s\S])*)<\/c>)/g)) {
        const attrs = c[2] || '', body = c[3] || '';
        const v = /<v>([^<]*)<\/v>/.exec(body);
        if (!v) continue;
        out.set(c[1], /t="s"/.test(attrs) ? shared[+v[1]] : unesc(v[1]));
      }
    }
    cache.set(name, out);
    return out;
  };
}
const unesc = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

// A cached cell as a value pay.mjs would recognise: a number, a state string
// ("MCL" / "Call MCL"), or null for empty.
function val(map, ref) {
  const raw = map.get(ref);
  if (raw === undefined || raw === null || raw === '' || raw === ' ') return null;
  const n = Number(raw);
  return Number.isFinite(n) && raw.trim() !== '' ? n : raw;
}
const num = (map, ref) => { const v = val(map, ref); return typeof v === 'number' ? v : null; };

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
const results = [];
function cmp(label, got, want) {
  let ok;
  if (typeof got === 'number' && typeof want === 'number') ok = Math.abs(got - want) < 1e-9;
  else ok = (got ?? null) === (want ?? null);
  results.push({ label, got, want, ok });
  return ok;
}
const show = v => v === null || v === undefined ? '(blank)' : typeof v === 'number' ? String(Number(v.toPrecision(12))) : JSON.stringify(v);

// Lane cores sit four to a sublot on Cores rows 10-13 / 15-18 / 20-23 / 25-28;
// joint cores two to a sublot on rows 33-34 / 36-37 / 39-40 / 42-43. Column I
// is % solid density, column J is the pay the workbook computed for it.
const LANE_ROWS = [[10, 11, 12, 13], [15, 16, 17, 18], [20, 21, 22, 23], [25, 26, 27, 28]];
const JOINT_ROWS = [[33, 34], [36, 37], [39, 40], [42, 43]];
const LANE_SUBLOT_AVG = [14, 19, 24, 29];   // Cores!J14/J19/J24/J29
const JOINT_SUBLOT_AVG = [35, 38, 41, 44];  // Cores!J35/J38/J41/J44

function checkLot(file) {
  const cells = openWorkbook(file);
  const PV = cells('Pay Values'), C = cells('Calculations'), CO = cells('Cores');

  // ---- inputs ----
  const mixTypeCode = num(C, 'J1');
  const esalClass = num(C, 'D15');              // the "ESAL Class" dropdown
  const jointDensityFlag = num(C, 'H11');
  const densityOption = num(C, 'H12');
  const acceptanceOption = num(C, 'H13');
  const lotNumber = num(PV, 'F3');
  const tonnage = num(PV, 'F4');
  const unitPrice = num(PV, 'F5');
  const wedgeTons = num(PV, 'J20') ?? 0;

  const sublots = [13, 14, 15, 16].map(r => ({
    jmfAC: num(PV, 'A' + r), ac: num(PV, 'B' + r),
    targetAV: num(PV, 'E' + r), av: num(PV, 'F' + r),
    minVMA: num(PV, 'H' + r), vma: num(PV, 'I' + r),
  }));
  const laneCores = LANE_ROWS.map(rows => rows.map(r => num(CO, 'I' + r)).filter(v => v !== null));
  const jointCores = JOINT_ROWS.map(rows => rows.map(r => num(CO, 'I' + r)).filter(v => v !== null));

  console.log(`\n=== ${file} ===`);
  console.log(`  lot ${lotNumber} | mix type ${mixTypeCode} | ESAL Class ${esalClass} | `
    + `joint=${jointDensityFlag} density-option=${densityOption} acceptance=${acceptanceOption} | `
    + `${tonnage} tons @ $${unitPrice}, wedge ${wedgeTons}`);

  const at = results.length;

  // ---- weights, 'Pay Values'!E20:E24 ----
  const w = propertyWeights({ jointDensityFlag, densityOption, acceptanceOption });
  cmp('weight joint density (E20)', w.jointDensity, num(PV, 'E20'));
  cmp('weight lane density (E21)', w.laneDensity, num(PV, 'E21'));
  cmp('weight % AC (E22)', w.ac, num(PV, 'E22'));
  cmp('weight % AV (E23)', w.av, num(PV, 'E23'));
  cmp('weight % VMA (E24)', w.vma, num(PV, 'E24'));

  // ---- per-sublot volumetrics, 'Pay Values' rows 13-16 ----
  sublots.forEach((s, i) => {
    const r = 13 + i;
    const p = sublotPay({ ...s, isFirstSublot: lotNumber === 1 && i === 0, esalClass, mixTypeCode });
    cmp(`sublot ${i + 1} AC deviation (C${r})`, p.ac.dev, num(PV, 'C' + r));
    cmp(`sublot ${i + 1} AC pay (D${r})`, p.ac.pay, val(PV, 'D' + r));
    cmp(`sublot ${i + 1} AV pay (G${r})`, p.av.pay, val(PV, 'G' + r));
    cmp(`sublot ${i + 1} VMA deviation (J${r})`, p.vma.dev, num(PV, 'J' + r));
    cmp(`sublot ${i + 1} VMA pay (K${r})`, p.vma.pay, val(PV, 'K' + r));
  });

  // ---- every individual core, against the two density curves ----
  LANE_ROWS.forEach((rows, i) => rows.forEach(r => {
    const d = num(CO, 'I' + r);
    if (d === null) return;
    cmp(`lane core ${CO.get('A' + r) ?? 'row ' + r} pay (Cores!J${r})`,
      laneCorePay(d, { esalClass, mixTypeCode }), val(CO, 'J' + r));
  }));
  JOINT_ROWS.forEach((rows, i) => rows.forEach(r => {
    const d = num(CO, 'I' + r);
    if (d === null) return;
    cmp(`joint core ${CO.get('A' + r) ?? 'row ' + r} pay (Cores!J${r})`,
      jointCorePay(d, { mixTypeCode }), val(CO, 'J' + r));
  }));

  // ---- density lot roll-ups ----
  const lane = laneDensityLot({ sublotCores: laneCores, lotNumber, densityOption, esalClass, mixTypeCode });
  lane.sublots.forEach((v, i) => cmp(`lane density sublot ${i + 1} (Cores!J${LANE_SUBLOT_AVG[i]})`, v, val(CO, 'J' + LANE_SUBLOT_AVG[i])));
  cmp('lane density LOT (Cores!J30)', lane.lot, val(CO, 'J30'));

  const joint = jointDensityLot({ sublotCores: jointCores, lotNumber, jointDensityFlag, mixTypeCode });
  joint.sublots.forEach((v, i) => cmp(`joint density sublot ${i + 1} (Cores!J${JOINT_SUBLOT_AVG[i]})`, v, val(CO, 'J' + JOINT_SUBLOT_AVG[i])));
  cmp('joint density LOT (Cores!J45)', joint.lot, val(CO, 'J45'));

  // ---- the lot ----
  const out = lotPay({
    sublots, laneCores, jointCores,
    jointDensityFlag, densityOption, acceptanceOption,
    lotNumber, esalClass, mixTypeCode,
    tonnage, unitPrice, wedgeTons,
  });

  cmp('lot average % AC pay (D17)', out.byProperty.ac.value, val(PV, 'D17'));
  cmp('lot average % AV pay (G17)', out.byProperty.av.value, val(PV, 'G17'));
  cmp('lot average % VMA pay (K17)', out.byProperty.vma.value, val(PV, 'K17'));
  cmp('joint density (B21)', out.byProperty.jointDensity.value, val(PV, 'B21'));
  cmp('lane density (B22)', out.byProperty.laneDensity.value, val(PV, 'B22'));
  cmp('FINAL PAY VALUE % (J21)', out.finalPct, val(PV, 'J21'));
  cmp('lot tonnage adjustment (J23)', out.tonnageAdj, val(PV, 'J23'));
  cmp('lot pay adjustment $ (J24)', out.dollarAdj, val(PV, 'J24'));

  for (const row of results.slice(at)) {
    console.log(`  ${row.ok ? 'ok  ' : 'FAIL'}  ${row.label.padEnd(46)} ${show(row.got)}${row.ok ? '' : `   want ${show(row.want)}`}`);
  }
  if (out.notes.length) console.log('  notes: ' + out.notes.join('; '));
  for (const s of out.perSublot) {
    for (const k of ['av', 'vma']) if (s[k] && s[k].note) console.log(`  note: ${s[k].note}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Partial lots: "there will always be not fully filled out AMAWs" (Jake).
// A 1-, 2- or 3-sublot lot must compute on what is there and never throw or
// silently zero. Derived from the first workbook by truncating it, so the
// expectation is arithmetic we can state rather than a cached cell.
// ---------------------------------------------------------------------------
function checkPartial(file) {
  const cells = openWorkbook(file);
  const PV = cells('Pay Values'), C = cells('Calculations'), CO = cells('Cores');
  const base = {
    mixTypeCode: num(C, 'J1'), esalClass: num(C, 'D15'),
    jointDensityFlag: num(C, 'H11'), densityOption: num(C, 'H12'), acceptanceOption: num(C, 'H13'),
    lotNumber: num(PV, 'F3'), tonnage: num(PV, 'F4'), unitPrice: num(PV, 'F5'), wedgeTons: 0,
  };
  const allSublots = [13, 14, 15, 16].map(r => ({
    jmfAC: num(PV, 'A' + r), ac: num(PV, 'B' + r), targetAV: num(PV, 'E' + r),
    av: num(PV, 'F' + r), minVMA: num(PV, 'H' + r), vma: num(PV, 'I' + r),
  }));
  const allLane = LANE_ROWS.map(rows => rows.map(r => num(CO, 'I' + r)).filter(v => v !== null));
  const allJoint = JOINT_ROWS.map(rows => rows.map(r => num(CO, 'I' + r)).filter(v => v !== null));

  console.log(`\n=== partial lots, truncated from ${file} ===`);
  let bad = 0;
  for (const n of [1, 2, 3, 4]) {
    let out;
    try {
      out = lotPay({
        ...base,
        sublots: allSublots.slice(0, n),
        laneCores: allLane.slice(0, n),
        jointCores: allJoint.slice(0, n),
      });
    } catch (e) { console.log(`  FAIL  ${n} sublot(s): threw ${e.message}`); bad++; continue; }
    const f = out.finalPct;
    const okShape = f === null || (typeof f === 'number' && Number.isFinite(f));
    if (!okShape) { console.log(`  FAIL  ${n} sublot(s): final pay is ${show(f)}`); bad++; continue; }
    console.log(`  ok    ${n} sublot(s): AC ${show(out.byProperty.ac.value)}, `
      + `AV ${show(out.byProperty.av.value)}, VMA ${show(out.byProperty.vma.value)}, `
      + `joint ${show(out.byProperty.jointDensity.value)}, lane ${show(out.byProperty.laneDensity.value)} `
      + `-> ${show(f)}%  ${show(out.tonnageAdj)} tons  $${show(out.dollarAdj)}`);
  }
  // An empty AMAW: no sublots, no cores. Must not throw and must not invent a
  // 0% pay value - a lot nobody has tested yet has no pay value at all.
  try {
    const empty = lotPay({ ...base, sublots: [], laneCores: [[], [], [], []], jointCores: [[], [], [], []] });
    const ok = empty.finalPct === null || empty.finalPct === 100;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  0 sublots: final pay ${show(empty.finalPct)} (${empty.notes.join('; ') || 'no notes'})`);
    if (!ok) bad++;
  } catch (e) { console.log(`  FAIL  0 sublots: threw ${e.message}`); bad++; }
  return bad;
}

// ---------------------------------------------------------------------------
// Gradation acceptance - AGAINST THE TEMPLATE'S OWN FORMULAS, not against a
// cached answer. Neither real lot is gradation-accepted (both read
// Calculations!H13 = 2), so every 'Accept. Grad.' cell is blank in both and
// there is nothing of Excel's to compare to - the same debt check_verify.mjs
// records for Super Verify. Each expectation below is a hand evaluation of
// the H8:H22 / E37:E41 formulas quoted in pay.mjs, at the band edges. A real
// leveling-and-wedging AMAW would turn these into cached-value comparisons.
// ---------------------------------------------------------------------------
function checkGradationSchedule() {
  console.log('\n=== Gradation acceptance, against the template formulas (VER 14.01) ===');
  let bad = 0;
  const ok = (label, got, want) => {
    const pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) bad++;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label.padEnd(66)} ${show(got)}${pass ? '' : `   want ${show(want)}`}`);
  };
  const sv = (sieve, jmf, test, code = 5) => sievePay({ sieve, jmf, test, mixTypeCode: code });
  // H15 (#8) on a 0.38: control points 32-67. Starred below 32, so the ladder
  // runs; ROUND(ABS(dev),1) against 8/9/10/12/14.
  ok('#8 test 30 (starred) jmf 45 -> dev 15 -> 75 (H15)', sv('s2_36', 45, 30).pay, 75);
  ok('#8 test 30 jmf 44 -> dev 14 -> 85', sv('s2_36', 44, 30).pay, 85);
  ok('#8 test 30 jmf 42 -> dev 12 -> 90', sv('s2_36', 42, 30).pay, 90);
  ok('#8 test 30 jmf 40 -> dev 10 -> 95', sv('s2_36', 40, 30).pay, 95);
  ok('#8 test 30 jmf 39 -> dev 9 -> 98', sv('s2_36', 39, 30).pay, 98);
  ok('#8 test 30 jmf 38 -> dev 8 -> 100', sv('s2_36', 38, 30).pay, 100);
  ok('#8 test 30.4 (starred) is carried as ROUND(,0) = 30 (C15 "* 30")', sv('s2_36', 45, 30.4).shown, 30);
  ok('#8 test 44.6 INSIDE 32-67 pays 100 whatever the JMF (the gate)', [sv('s2_36', 10, 44.6).pay, sv('s2_36', 10, 44.6).rule.gate], [100, true]);
  ok('#8 test 44.6 inside is carried unrounded', sv('s2_36', 45, 44.6).shown, 44.6);
  ok('#8 test 31.9 is starred (< 32)', sv('s2_36', 45, 31.9).starred, true);
  ok('#8 test 32 is inside (>= 32)', sv('s2_36', 45, 32).starred, false);
  // H20 (#200) on a 0.38: control points 2-10, F20 = Calculations!Q124 (nearest half).
  ok('#200 test 12.36 -> "* 12" -> Q124 12 -> jmf 6 dev 6 -> 75 (H20)', sv('s0_075', 6, 12.36).pay, 75);
  ok('#200 jmf 9.5 dev 2.5 -> 98', sv('s0_075', 9.5, 12.36).pay, 98);
  ok('#200 jmf 10 dev 2 -> 100 (band edge)', sv('s0_075', 10, 12.36).pay, 100);
  ok('#200 jmf 8.6 dev 3.4 -> 85', sv('s0_075', 8.6, 12.36).pay, 85);
  ok('#200 jmf 8.4 dev 3.6 -> 75 (H20 has no 90 band)', sv('s0_075', 8.4, 12.36).pay, 75);
  ok('#200 jmf 9 dev 3 -> 95', sv('s0_075', 9, 12.36).pay, 95);
  ok('Q124 rounding: 4.26 -> 4.5, 4.3 -> 4.5, 4.76 -> 5, 4.2 -> 4', [4.26, 4.3, 4.76, 4.2].map(roundToHalf), [4.5, 4.5, 5, 4]);
  // H8/H9 (2", 1 1/2") ladder on a 1.5 (code 1): 2" is 100-100, so 80 is starred.
  ok('2" test 80 jmf 100 -> dev 20 -> 90 (H8, 13/14/16/20/23 ladder)', sv('s50', 100, 80, 1).pay, 90);
  ok('2" dev 24 -> 75', sv('s50', 100, 76, 1).pay, 75);
  ok('2" dev 13 -> 100', sv('s50', 100, 87, 1).pay, 100);
  // H10-H12 (1", 3/4", 1/2") on a 0.75: 1" is 100-100.
  ok('1" test 88 jmf 100 -> dev 12 -> 95 (H10)', sv('s25', 100, 88, 3).pay, 95);
  ok('1" dev 17 -> 75', sv('s25', 100, 83, 3).pay, 75);
  // H18 (#50) on the wedge (code 9): 5-20.
  ok('#50 test 25 (starred) jmf 18 -> dev 7 -> 98 (H18)', sv('s0_3', 18, 25, 9).pay, 98);
  ok('#50 dev 11 -> 75', sv('s0_3', 14, 25, 9).pay, 75);
  // H19 (#100) on the wedge: 3-10, no 98 and no 85 band.
  ok('#100 test 15 jmf 11 -> dev 4 -> 95 (H19)', sv('s0_15', 11, 15, 9).pay, 95);
  ok('#100 dev 5 -> 90', sv('s0_15', 10, 15, 9).pay, 90);
  ok('#100 dev 6 -> 75', sv('s0_15', 9, 15, 9).pay, 75);
  ok('#100 dev 3 -> 100', sv('s0_15', 12, 15, 9).pay, 100);
  // A sieve the mixture type has no control point for is 0-100: never starred.
  ok('#16 on a 0.38 (no control point) is inside 0-100', [controlPointBand(5, 's1_18'), sv('s1_18', 40, 5).pay], [[0, 100], 100]);
  // Sand Asphalt (7): sieve rows are "" by design; the F.M. pays instead.
  ok('Sand Asphalt I: sieve rows are not scored', sv('s2_36', 85, 30, 7).pay, null);
  ok('a code with no column (99) scores nothing', sv('s2_36', 45, 30, 99).pay, null);
  // H21: the AC ladder on ROUND(ABS(dev),1).
  ok('AC dev 0.5 -> 100, 0.55 -> 0.6 -> 98, 0.7 -> 90, 0.8 -> 85, 0.9 -> 75 (H21)',
     [0.5, 0.55, 0.7, 0.8, 0.9].map((d) => specialtyAcPay({ jmfAC: 5.0, ac: 5.0 + d }).pay), [100, 98, 90, 85, 75]);
  ok('AC pays the same on the low side', specialtyAcPay({ jmfAC: 5.9, ac: 5.2 }).pay, 90);
  // H22: fineness modulus on ROUND(ABS(dev),2).
  ok('F.M. dev 0.30/0.34/0.39/0.46/0.55/0.56 -> 100/98/95/90/85/75 (H22)',
     [0.30, 0.34, 0.39, 0.46, 0.55, 0.56].map((d) => finenessModulusPay({ target: 2.5, test: 2.5 + d }).pay), [100, 98, 95, 90, 85, 75]);
  ok('F.M. = SUM(100 - passing on #4..#100) / 100 (Gradation!D35)',
     finenessModulus({ s4_75: 60, s2_36: 44, s1_18: 33, s0_6: 24, s0_3: 17, s0_15: 11 }), 4.11);
  // E37:E40 - MIN over the factors present; the sublot-1 allowance as INTENDED.
  const jmf = { s12_5: 100, s9_5: 96, s4_75: 62, s2_36: 45, s0_075: 6 };
  const bad1 = gradationSublotPay({ mixTypeCode: 5, jmf, test: { s12_5: 100, s9_5: 95, s4_75: 60, s2_36: 30, s0_075: 12.4 }, jmfAC: 5.9, ac: 6.55, position: 1 });
  ok('sublot MIN over 6 factors: #8 75, #200 75, AC 98 -> 75, lowest names both', [bad1.pay, bad1.factors.length, bad1.lowest], [75, 6, ['#8', '#200']]);
  const setup = gradationSublotPay({ mixTypeCode: 5, jmf, test: { s12_5: 100, s9_5: 97, s4_75: 63, s2_36: 30, s0_075: 6.4 }, jmfAC: 5.9, ac: 5.9, isFirstSublot: true, position: 0 });
  ok('setup sublot at min 75 is NOT forgiven (< 90)', [setup.pay, setup.allowance], [75, null]);
  const setup2 = gradationSublotPay({ mixTypeCode: 5, jmf, test: { s12_5: 100, s9_5: 97, s4_75: 63, s2_36: 44, s0_075: 6.4 }, jmfAC: 5.9, ac: 6.55, isFirstSublot: true, position: 0 });
  ok('setup sublot at min 98 (AC) is forgiven to 100', [setup2.min, setup2.pay, setup2.allowance], [98, 100, { from: 98, to: 100 }]);
  ok('...and E37 as WRITTEN would print 100 either way (workbookLiteral)', [setup.workbookLiteral, setup2.workbookLiteral], [100, 100]);
  ok('a sublot with nothing scored pays null, not 0', gradationSublotPay({ mixTypeCode: 5, jmf, test: {}, position: 2 }).pay, null);
  // E41 -> Calculations!A71 -> J21/J23/J24, through lotPay().
  const lot = lotPay({
    acceptanceOption: 1, lotNumber: 2, mixTypeCode: 5, tonnage: 4000, unitPrice: 50,
    sublots: [{ jmfAC: 5.9, ac: 6.55 }, { jmfAC: 5.9, ac: 5.9 }],
    gradation: { jmf, sublots: [{ test: { s12_5: 100, s9_5: 95, s4_75: 60, s2_36: 30, s0_075: 12.4 } }, { test: { s12_5: 100, s9_5: 97, s4_75: 63, s2_36: 44, s0_075: 6.4 } }] },
  });
  ok('lot: average(75, 100) = 87.5 -> -500 tons -> -$25,000 at $50', [lot.finalPct, lot.tonnageAdj, lot.dollarAdj], [87.5, -500, -25000]);
  ok('lot: the five volumetric properties read blank under H13 = 1', Object.values(lot.byProperty).every((t) => t.value === null && t.weight === 0), true);
  ok('lot: the E37 quirk is noted once when the sheet would differ', lot.notes.filter((n) => /E37 as written/.test(n)).length, 1);
  const empty = lotPay({ acceptanceOption: 1, lotNumber: 1, mixTypeCode: 5, tonnage: 4000, unitPrice: 50, sublots: [], gradation: { jmf, sublots: [] } });
  ok('lot with nothing scored: no final pay, and says so', [empty.finalPct, empty.notes.some((n) => /no sublot has a gradation/.test(n))], [null, true]);
  return bad;
}
const gradationFails = checkGradationSchedule();

// ---------------------------------------------------------------------------
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: check_pay.mjs <completed-amaw.xlsm> [more.xlsm ...]');
  process.exit(gradationFails ? 1 : 2);
}
for (const f of files) checkLot(f);
const partialFails = checkPartial(files[0]);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} workbook cells matched.`);
if (failed.length) {
  console.log('MISMATCHES:');
  for (const r of failed) console.log(`  ${r.label}: got ${show(r.got)}, workbook says ${show(r.want)}`);
}
process.exit(failed.length || partialFails || gradationFails ? 1 : 0);
