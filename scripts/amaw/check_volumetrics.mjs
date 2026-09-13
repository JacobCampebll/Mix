#!/usr/bin/env node
/**
 * check_volumetrics.mjs — prove volumetrics.mjs reproduces the AMAW.
 *
 * The whole argument for computing these figures instead of asking a
 * technician to type them is that the workbook already computes them. That is
 * only worth anything if our arithmetic lands on the workbook's own answer, so
 * this reads the RAW weights out of a completed lot, recomputes every derived
 * cell from them, and compares against the value Excel itself cached in that
 * same file.
 *
 * Run it against both of Jake's real lots:
 *
 *   node scripts/amaw/check_volumetrics.mjs lot1.xlsm lot2.xlsm
 *
 * Nothing is hard-coded per file: the expectations ARE the workbook's cells.
 * A lot that leaves a block empty is reported as skipped rather than passed,
 * because a check that silently passes on absent data is worse than no check.
 */
import { execSync } from 'child_process';
import { cellsOf, sharedStrings } from '../mixpack/xlsx.mjs';
import { SUBLOT, AGGREGATE } from './addresses.mjs';
import {
  bsgSpecimen, msgDetermination, bsgAverage, msgAverage,
  handMixedGse, sublotVolumetrics,
} from './volumetrics.mjs';

const LOTS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!LOTS.length) {
  console.error('usage: check_volumetrics.mjs <completed-amaw.xlsm> [more.xlsm ...]');
  process.exit(2);
}

// ---- zip / sheet plumbing (same shape as check_mapper.mjs) -----------
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
  return (sheet, addr) => {
    if (!cache.has(sheet)) cache.set(sheet, cellsOf(unz(file, 'xl/' + parts[sheet]), sst));
    const c = cache.get(sheet).get(addr);
    if (c === undefined) return null;
    const v = (c && typeof c === 'object') ? c.v : c;
    if (v == null || v === '' || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
  };
}

let pass = 0, fail = 0, skip = 0;
const head = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);
/**
 * Floats out of a spreadsheet and floats out of JavaScript agree to about
 * fifteen significant figures, not to the bit, because Excel caches a decimal
 * rendering. 1e-9 relative is far tighter than any figure here is reported to
 * (three decimals at most) and far looser than the noise.
 */
function near(label, got, want) {
  if (want == null && got == null) { console.log(`  ok    ${label} — both blank`); pass++; return; }
  if (want == null || got == null) {
    console.log(`  FAIL  ${label}  got ${got}  workbook ${want}`); fail++; return;
  }
  const tol = Math.max(1e-9, Math.abs(want) * 1e-9);
  if (Math.abs(got - want) <= tol) { console.log(`  ok    ${label} = ${want}`); pass++; }
  else { console.log(`  FAIL  ${label}  got ${got}  workbook ${want}  (d=${got - want})`); fail++; }
}

for (const file of LOTS) {
  const g = openWorkbook(file);
  const S = SUBLOT.sheet, B = SUBLOT.bsg, M = SUBLOT.msg;
  console.log(`\n${'='.repeat(70)}\n${file.split('/').pop()}\n${'='.repeat(70)}`);

  // ---- the lot's hand-mixed sample -> Gse ---------------------------
  head('Hand-mixed check sample -> Gse');
  const hmDets = M.handMix.map((c) => ({
    mix: g(S, `${c}${M.rows.mix}`),
    calibration: g(S, `${c}${M.rows.calibration}`),
    finalWeight: g(S, `${c}${M.rows.finalWeight}`),
    absorbedWater: g(S, `${c}${M.rows.absorbedWater}`),
  }));
  // NOT rounded — see handMixedGse(). The sublot columns round to three
  // decimals and this one does not, in the same workbook on the same row.
  const hm = handMixedGse({ determinations: hmDets, binderPct: g(S, SUBLOT.handMixed.binderPct) });
  hm.each.forEach((e, i) => {
    const col = M.handMix[i];
    near(`hand-mix ${col} MSG, UNROUNDED (${col}${M.rows.msg})`, e.msg, g(S, `${col}${M.rows.msg}`));
  });
  near(`hand-mix average MSG (${SUBLOT.handMixed.gmm})`, hm.gmm, g(S, SUBLOT.handMixed.gmm));
  near(`Gse (${SUBLOT.handMixed.gse})`, hm.gse, g(S, SUBLOT.handMixed.gse));
  const gse = hm.gse;

  // ---- each sublot ---------------------------------------------------
  for (let s = 0; s < 4; s++) {
    const avgRow = SUBLOT.volumetric.first + s * SUBLOT.volumetric.stride;
    const V = SUBLOT.volumetric.cols;
    head(`Sublot ${s + 1} — average row ${avgRow}`);

    const specRows = Array.from({ length: B.specimens }, (_, k) => B.first + s * B.stride + k);
    const specimens = specRows.map((r) => ({
      air: g(S, `${B.cols.air}${r}`), water: g(S, `${B.cols.water}${r}`), ssd: g(S, `${B.cols.ssd}${r}`),
    }));
    if (specimens.every((x) => x.air == null)) {
      console.log(`  skip  sublot ${s + 1} has no BSG specimen weights in this file`); skip++; continue;
    }

    // per-specimen: bulk volume, BSG, unit weight
    specimens.forEach((spec, k) => {
      const r = specRows[k], out = bsgSpecimen(spec);
      near(`specimen ${k + 1} bulk vol (${B.cols.volume}${r})`, out.volume, g(S, `${B.cols.volume}${r}`));
      near(`specimen ${k + 1} BSG (${B.cols.bsg}${r})`, out.bsg, g(S, `${B.cols.bsg}${r}`));
      near(`specimen ${k + 1} unit wt (${B.cols.unitWeight}${r})`, out.unitWeight, g(S, `${B.cols.unitWeight}${r}`));
    });

    const [c1, c2] = M.cols[s];
    const dets = [c1, c2].map((c) => ({
      mix: g(S, `${c}${M.rows.mix}`),
      calibration: g(S, `${c}${M.rows.calibration}`),
      finalWeight: g(S, `${c}${M.rows.finalWeight}`),
      absorbedWater: g(S, `${c}${M.rows.absorbedWater}`),
    }));
    dets.forEach((d, k) => {
      const col = k === 0 ? c1 : c2, out = msgDetermination(d);
      near(`MSG ${col} sum (${col}${M.rows.sum})`, out.sum, g(S, `${col}${M.rows.sum}`));
      near(`MSG ${col} (${col}${M.rows.msg})`, out.msg, g(S, `${col}${M.rows.msg}`));
    });

    // the averages the volumetric row reads
    const bAvg = bsgAverage(specimens), mAvg = msgAverage(dets);
    // The average BSG sits in the SAME column as the specimens' (G), and is
    // deliberately read from B.cols rather than V.cols: `volumetric.cols` has
    // no bsg key, and `${V.bsg}` silently produced the string "undefined14"
    // rather than failing - the exact class of silent-wrong-address bug this
    // file exists to catch, caught here on the checker itself.
    near(`average BSG (${B.cols.bsg}${avgRow})`, bAvg.bsg, g(S, `${B.cols.bsg}${avgRow}`));
    near(`average unit wt (${V.unitWeight}${avgRow})`, bAvg.unitWeight, g(S, `${V.unitWeight}${avgRow}`));
    near(`average MSG (${c2}${M.rows.average})`, mAvg.msg, g(S, `${c2}${M.rows.average}`));
    near(`Gmm on the volumetric row (${V.gmm}${avgRow})`, mAvg.msg, g(S, `${V.gmm}${avgRow}`));

    // and the whole row, against the workbook's own cached figures
    const gsb = g(AGGREGATE.sheet, `${AGGREGATE.pctCols[s]}${AGGREGATE.gsbRow}`);
    const out = sublotVolumetrics({
      specimens, determinations: dets,
      binderPct: g(S, `${V.binderPct}${avgRow}`), gsb, gse,
    });
    near(`AIR VOIDS (${V.va}${avgRow})`, out.va, g(S, `${V.va}${avgRow}`));
    near(`% absorbed AC (K${avgRow})`, out.absorbedAC, g(S, `K${avgRow}`));
    near(`Pbe (${V.pbe}${avgRow})`, out.pbe, g(S, `${V.pbe}${avgRow}`));
    near(`VMA (${V.vma}${avgRow})`, out.vma, g(S, `${V.vma}${avgRow}`));
    near(`VFA (${V.vfa}${avgRow})`, out.vfa, g(S, `${V.vfa}${avgRow}`));
  }
}

console.log(`\nResult\n------\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
