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
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: check_pay.mjs <completed-amaw.xlsm> [more.xlsm ...]');
  process.exit(2);
}
for (const f of files) checkLot(f);
const partialFails = checkPartial(files[0]);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} workbook cells matched.`);
if (failed.length) {
  console.log('MISMATCHES:');
  for (const r of failed) console.log(`  ${r.label}: got ${show(r.got)}, workbook says ${show(r.want)}`);
}
process.exit(failed.length || partialFails ? 1 : 0);
