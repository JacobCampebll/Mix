#!/usr/bin/env node
/**
 * check_verify.mjs — prove verifyVolumetrics() reproduces `Super Verify`.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM check_volumetrics.mjs. That one reads
 * the RAW weights out of a completed lot and compares every derived cell to
 * the value Excel itself cached in that same file. It cannot do that here:
 * both of Jake's completed AMAWs leave `Calculations!L1` and `L2` empty,
 * which means no QA or IQ sample was ever taken on either, so every cell of
 * `Super Verify` is blank in both. There is no cached answer to compare to,
 * and there may not be one for months.
 *
 * So this checks the transcription against the workbook a different way: it
 * takes KYTC's own blank template, seeds the input cells with weights, and
 * evaluates the template's OWN FORMULAS with scripts/mixpack/formula.mjs -
 * the same evaluator the MixPack and AMAW generators bank staging cells with.
 * The expectations are therefore still the workbook's, not ours; what is
 * missing is only the proof that a real technician's numbers flow through it.
 * That debt is stated here and in volumetrics.mjs rather than papered over.
 *
 *   node scripts/amaw/check_verify.mjs [--template public/AMAW_VER14_01.xlsm]
 *
 * The evaluator is generic over `(sheet, cell)`, so the sheet is loaded as a
 * plain cell map, the seeds are written into it, and the formulas are
 * evaluated to a fixed point (row 10 reads row 26 reads row 25, and J28 reads
 * a cell on another sheet), which converges in a couple of passes.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { evaluate } from '../mixpack/formula.mjs';
import { VERIFY } from './addresses.mjs';
import {
  bsgSpecimen, msgDetermination, backCalcBinderPct, moisturePct, verifyVolumetrics,
} from './volumetrics.mjs';

const argv = process.argv.slice(2);
const tplAt = argv.indexOf('--template');
const TEMPLATE = tplAt >= 0 ? argv[tplAt + 1] : 'public/AMAW_VER14_01.xlsm';

let pass = 0, fail = 0;
const head = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);
const ok = (label, cond, got) => {
  if (cond) { console.log(`  ok    ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got === undefined ? '' : `  ${JSON.stringify(got)}`}`); fail++; }
};
/** Excel caches a decimal rendering; 1e-9 relative is far tighter than any
 *  figure here is reported to and far looser than float noise. */
function near(label, got, want) {
  if (want == null && got == null) { console.log(`  ok    ${label} — both blank`); pass++; return; }
  if (want == null || got == null) { console.log(`  FAIL  ${label}  got ${got}  workbook ${want}`); fail++; return; }
  const tol = Math.max(1e-9, Math.abs(want) * 1e-9);
  if (Math.abs(got - want) <= tol) { console.log(`  ok    ${label} = ${want}`); pass++; }
  else { console.log(`  FAIL  ${label}  got ${got}  workbook ${want}  (d=${got - want})`); fail++; }
}

// ---- the template's Super Verify sheet, as formulas + literals -------
function loadSheet(file, sheetName) {
  const unz = (p) => execSync(`unzip -p ${JSON.stringify(file)} ${p}`, { maxBuffer: 1 << 28 }).toString();
  const rels = {};
  for (const m of unz('xl/_rels/workbook.xml.rels').matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, '');
  }
  let part = null;
  for (const m of unz('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g)) {
    if (m[1].replace(/&amp;/g, '&') === sheetName) part = rels[m[2]];
  }
  if (!part) throw new Error(`${sheetName} is not in ${file}`);
  const xml = unz('xl/' + part);
  const formulas = new Map(), literals = new Map();
  const CELL = /<c r="([A-Z]+\d+)"((?:(?!\/>|>).)*)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of xml.matchAll(CELL)) {
    const [, ref, , body = ''] = m;
    const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body);
    if (f) {
      formulas.set(ref, f[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
      continue;
    }
    const v = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (v) literals.set(ref, Number.isFinite(Number(v[1])) ? Number(v[1]) : v[1]);
  }
  return { formulas, literals };
}

const SHEET = VERIFY.sheet;
const { formulas } = loadSheet(TEMPLATE, SHEET);

/* ---- three functions the shared evaluator does not have ------------
 *
 * scripts/mixpack/formula.mjs implements exactly the grammar the STAGING
 * sheets use, and refuses everything else on purpose: a cell it cannot
 * evaluate is left as a formula for Excel to recompute, which is always
 * safe, where a wrong value banked as a literal is not. `Super Verify` is a
 * visible sheet and uses three it does not have - AVERAGE, ISERROR and AND.
 *
 * They are expanded HERE rather than added to the evaluator, deliberately.
 * Adding AVERAGE there would change which cells a generated MixPack or AMAW
 * banks as literals instead of leaving to Excel, which is a real change to
 * two shipping generators and has no business riding along inside a checker.
 * These three are independent implementations of Excel's own semantics, which
 * is the point: an expectation computed by the thing under test is not an
 * expectation.
 */
const MISSING = /\b(AVERAGE|ISERROR|AND)\s*\(/;
const ERR = '"#ERR#"';          // stands in for Excel's #DIV/0! between passes

function splitArgs(src) {
  const out = []; let depth = 0, start = 0, quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === '(') depth++;
    else if (!quoted && c === ')') depth--;
    else if (!quoted && c === ',' && depth === 0) { out.push(src.slice(start, i)); start = i + 1; }
  }
  out.push(src.slice(start));
  return out;
}

function expand(src, lookup, truth) {
  for (let guard = 0; guard < 40; guard++) {
    const m = MISSING.exec(src);
    if (!m) return src;
    const open = m.index + m[0].length - 1;
    let depth = 0, close = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close < 0) throw new Error('unbalanced parentheses in ' + src);
    const inner = src.slice(open + 1, close);
    // Innermost first: ISERROR(AVERAGE(C25:D25)) has to see a value.
    if (MISSING.test(inner)) {
      src = src.slice(0, open + 1) + expand(inner, lookup, truth) + src.slice(close);
      continue;
    }
    let lit;
    if (m[1] === 'AVERAGE') {
      const r = /^\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)$/.exec(inner.trim());
      if (!r) throw new Error('AVERAGE over something other than a simple range: ' + inner);
      const col = (n) => { let s2 = ''; while (n > 0) { const k = (n - 1) % 26; s2 = String.fromCharCode(65 + k) + s2; n = (n - k - 1) / 26; } return s2; };
      const n = (c) => { let v = 0; for (const ch of c) v = v * 26 + (ch.charCodeAt(0) - 64); return v; };
      const got = [];
      for (let r2 = Math.min(+r[2], +r[4]); r2 <= Math.max(+r[2], +r[4]); r2++) {
        for (let c2 = Math.min(n(r[1]), n(r[3])); c2 <= Math.max(n(r[1]), n(r[3])); c2++) {
          const v = lookup(null, col(c2) + r2);
          if (typeof v === 'number' && Number.isFinite(v)) got.push(v);
        }
      }
      // Excel's AVERAGE over an all-blank range is #DIV/0!, which every one
      // of these cells wraps in IF(ISERROR(...),"",...). That is the whole
      // reason ISERROR appears on this sheet at all.
      lit = got.length ? String(got.reduce((a, b) => a + b, 0) / got.length) : ERR;
    } else if (m[1] === 'ISERROR') {
      if (inner.trim() === ERR) lit = 'TRUE';
      else { try { evaluate(inner, lookup); lit = 'FALSE'; } catch { lit = 'TRUE'; } }
    } else {
      let all = true;
      for (const arg of splitArgs(inner)) {
        let v;
        try { v = evaluate(arg, lookup); } catch { all = false; break; }
        if (!truth(v)) { all = false; break; }
      }
      lit = all ? 'TRUE' : 'FALSE';
    }
    src = src.slice(0, m.index) + lit + src.slice(close + 1);
  }
  throw new Error('expand did not converge: ' + src);
}

/**
 * Evaluate the sheet's formulas over a seeded cell map, to a fixed point.
 * `seed` is { "Sheet!Cell": value }; cells on other sheets are read straight
 * from it (Superpave's Gse and Gsb, Calculations' sublot index), which is
 * exactly what the real workbook does.
 */
function runSheet(seed) {
  const cells = new Map(Object.entries(seed));
  const key = (sheet, cell) => `${sheet || SHEET}!${cell}`;
  const lookup = (sheet, cell) => {
    const k = key(sheet, cell);
    return cells.has(k) ? cells.get(k) : null;
  };
  // Excel's logical test, for AND above. A blank is FALSE; "" is FALSE.
  const truthy = (v) => (v === '' || v === null || v === undefined) ? false
    : (typeof v === 'boolean' ? v : (typeof v === 'number' ? v !== 0 : String(v).toUpperCase() === 'TRUE'));
  for (let pass_ = 0; pass_ < 6; pass_++) {
    let moved = false;
    for (const [ref, formula] of formulas) {
      const k = key(null, ref);
      let out;
      try { out = evaluate(expand(formula, lookup, truthy), lookup); } catch { continue; }
      const was = cells.get(k);
      const now = (out && out.__empty) ? '' : out;
      if (was !== now) { cells.set(k, now); moved = true; }
    }
    if (!moved) break;
  }
  return (cell) => {
    const v = cells.get(key(null, cell));
    if (v === '' || v === null || v === undefined) return null;
    return v;
  };
}

// ---------------------------------------------------------------------
//  A worked verification, invented but plausible, in the workbook's own
//  units. Nothing here is special: the point is that the formulas and this
//  module are fed identical inputs.
// ---------------------------------------------------------------------
const GSE = 2.721;     // Superpave!J8, the lot's Gse off the hand-mixed sample
const GSB = [2.664, 2.671, 2.658, 2.669];   // Superpave R9/S9/T9/U9, per sublot
const SPECIMENS = [
  [{ air: 4812.4, water: 2751.3, ssd: 4818.9 }, { air: 4795.1, water: 2744.8, ssd: 4801.2 }],
  [{ air: 4801.0, water: 2746.0, ssd: 4809.5 }, { air: 4788.6, water: 2740.2, ssd: 4795.0 }],
];
const DETERMINATIONS = [
  [{ mix: 2015.3, calibration: 7996.2, finalWeight: 9205.4, absorbedWater: 0 },
   { mix: 2008.7, calibration: 7996.2, finalWeight: 9201.9, absorbedWater: 0 }],
  [{ mix: 2021.8, calibration: 7996.2, finalWeight: 9210.1, absorbedWater: 0 },
   { mix: 2019.4, calibration: 7996.2, finalWeight: 9208.7, absorbedWater: 0 }],
];
const MOISTURE = [
  { before: 1520.4, after: 1513.1, pan: 310.2 },
  { before: 1498.7, after: 1492.9, pan: 308.8 },
];
// Which sublot each record verifies. Deliberately NOT 1 and 1: `K10`/`L10`
// branch on it to pick R9/S9/T9/U9, so two records on one sublot would let a
// wrong branch pass.
const VERIFIES = [2, 4];

const M = VERIFY.cols;
const BLOCKS = [
  { name: 'QA01', row: 10, specRows: [8, 9], msgCols: ['C', 'D'], avgCell: 'D26',
    backCalc: 'J28', corrected: 'J27', moistCol: 'M', sublotCell: 'Calculations!L1' },
  { name: 'IQ01', row: 17, specRows: [15, 16], msgCols: ['E', 'F'], avgCell: 'F26',
    backCalc: 'M28', corrected: 'M27', moistCol: 'N', sublotCell: 'Calculations!L2' },
];

const seed = {
  'Superpave!J8': GSE,
  'Superpave!R9': GSB[0], 'Superpave!S9': GSB[1], 'Superpave!T9': GSB[2], 'Superpave!U9': GSB[3],
};
BLOCKS.forEach((b, i) => {
  seed[b.sublotCell] = VERIFIES[i];
  SPECIMENS[i].forEach((sp, k) => {
    seed[`${SHEET}!C${b.specRows[k]}`] = sp.air;
    seed[`${SHEET}!D${b.specRows[k]}`] = sp.water;
    seed[`${SHEET}!E${b.specRows[k]}`] = sp.ssd;
  });
  DETERMINATIONS[i].forEach((d, k) => {
    const c = b.msgCols[k];
    seed[`${SHEET}!${c}20`] = d.mix;
    seed[`${SHEET}!${c}21`] = d.calibration;
    seed[`${SHEET}!${c}23`] = d.finalWeight;
    seed[`${SHEET}!${c}24`] = d.absorbedWater;
  });
  seed[`${SHEET}!${b.moistCol}36`] = MOISTURE[i].before;
  seed[`${SHEET}!${b.moistCol}37`] = MOISTURE[i].after;
  seed[`${SHEET}!${b.moistCol}38`] = MOISTURE[i].pan;
});

const at = runSheet(seed);

console.log(`\n${'='.repeat(70)}\n${TEMPLATE} — ${SHEET}\n${'='.repeat(70)}`);
console.log(`${formulas.size} formulas on the sheet; ${Object.keys(seed).length} cells seeded`);

BLOCKS.forEach((b, i) => {
  head(`${b.name} — verifying sublot ${VERIFIES[i]}, average row ${b.row}`);
  const gsb = GSB[VERIFIES[i] - 1];

  // Per specimen, UNROUNDED on this sheet where Superpave rounds.
  SPECIMENS[i].forEach((sp, k) => {
    const r = b.specRows[k], out = bsgSpecimen(sp, { round: false });
    near(`specimen ${k + 1} bulk vol (F${r})`, out.volume, at(`F${r}`));
    near(`specimen ${k + 1} BSG (G${r})`, out.bsg, at(`G${r}`));
    near(`specimen ${k + 1} unit wt (H${r})`, out.unitWeight, at(`H${r}`));
  });
  // The rounding divergence itself, asserted rather than left implicit: if
  // someone "tidies" this sheet to match Superpave, this is what says no.
  const rounded = bsgSpecimen(SPECIMENS[i][0], { round: true });
  ok('...and the ROUNDED sublot form would NOT match this sheet',
     rounded.bsg !== at(`G${b.specRows[0]}`), { rounded: rounded.bsg, sheet: at(`G${b.specRows[0]}`) });

  DETERMINATIONS[i].forEach((d, k) => {
    const c = b.msgCols[k], out = msgDetermination(d, { round: false });
    near(`MSG ${c} total (${c}22)`, out.sum, at(`${c}22`));
    near(`MSG ${c} (${c}25)`, out.msg, at(`${c}25`));
  });

  const moisture = moisturePct(MOISTURE[i]);
  near(`% moisture (${b.moistCol}39)`, moisture, at(`${b.moistCol}39`));

  const v = verifyVolumetrics({
    specimens: SPECIMENS[i], determinations: DETERMINATIONS[i], moisture, gsb, gse: GSE,
  });
  near(`average MSG (${b.avgCell})`, v.gmm, at(b.avgCell.replace(`${SHEET}!`, '')));
  near(`Max Spec Gravity on the row (${M.gmm}${b.row})`, v.gmm, at(`${M.gmm}${b.row}`));
  near(`average BSG (G${b.row})`, v.gmb, at(`G${b.row}`));
  near(`average unit wt (${M.unitWeight}${b.row})`, v.unitWeight, at(`${M.unitWeight}${b.row}`));
  near(`%AC by back-calculation (${b.backCalc})`, v.backCalcBinderPct, at(b.backCalc));
  near(`...moisture-corrected (${b.corrected})`, v.binderPct, at(b.corrected));
  near(`%AC on the row (${M.binderPct}${b.row})`, v.binderPct, at(`${M.binderPct}${b.row}`));
  near(`% VOIDS (${M.va}${b.row})`, v.va, at(`${M.va}${b.row}`));
  near(`% Eff. AC / Pbe (${M.pbe}${b.row})`, v.pbe, at(`${M.pbe}${b.row}`));
  near(`% VMA (${M.vma}${b.row})`, v.vma, at(`${M.vma}${b.row}`));
  near(`% VFA (${M.vfa}${b.row})`, v.vfa, at(`${M.vfa}${b.row}`));
});

head('The refusals');
{
  // A verification with no MSG has no %AC at all - there is nothing to
  // back-calculate from - and therefore no Pbe, VMA or VFA either. The
  // workbook blanks the same cells; what matters here is that none of them
  // becomes a zero.
  const v = verifyVolumetrics({ specimens: SPECIMENS[0], determinations: [], gsb: GSB[1], gse: GSE });
  ok('no Rice bowls -> no %AC', v.binderPct === null, v.binderPct);
  ok('...and no Va, Pbe, VMA or VFA',
     v.va === null && v.pbe === null && v.vma === null && v.vfa === null, v);
  ok('...and it says what it is waiting for', v.needs.includes('MSG determinations'), v.needs);

  const noGse = verifyVolumetrics({ specimens: SPECIMENS[0], determinations: DETERMINATIONS[0], gsb: GSB[1] });
  ok('no Gse -> no %AC, but Va still computes',
     noGse.binderPct === null && noGse.va !== null, { pb: noGse.binderPct, va: noGse.va });

  // The one deliberate divergence from the workbook, asserted so it cannot be
  // "fixed" back to the sheet's behaviour without this failing. See
  // moisturePct()'s note: in Excel a filled BEFORE over two blanks returns
  // 100, which would come straight off the back-calculated %AC.
  ok('a partial moisture block is blank here, not 100%',
     moisturePct({ before: 1520.4 }) === null, moisturePct({ before: 1520.4 }));
  ok('...and the workbook itself would say 100', at('M39') !== null);
  ok('an equal wet weight and pan weight is 0, as the workbook has it',
     moisturePct({ before: 310.2, after: 310.2, pan: 310.2 }) === 0);
}

head('Result');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
