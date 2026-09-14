/**
 * volumetrics.mjs — the sublot volumetric chain, from raw laboratory weights.
 *
 * WHY THIS EXISTS (Jake, 2026-09-13): "we need it to where contractors can
 * input raw results for the msg and bsg that computes the numbers and then
 * computes air voids for each sub lot". Until now PlantBook asked a
 * technician to TYPE eight numbers per sublot — %AC, unit weight, Gmm, Va,
 * Pbe, VMA, VFA, D/A — every one of which the AMAW computes for itself from
 * weights the technician already has on the bench. Typing a derived figure is
 * how a lot ends up disagreeing with the workbook it will be loaded from.
 *
 * EVERY FORMULA HERE IS THE WORKBOOK'S OWN, read off `Superpave` in Jake's
 * two real accepted lots rather than from a standard. Where KYTC rounds, this
 * rounds in the same place and to the same number of digits, because the
 * rounding is not cosmetic: the two BSG specimens are each rounded to three
 * decimals BEFORE they are averaged, so averaging the raw quotients gives a
 * different answer. `check_volumetrics.mjs` recomputes every derived cell of
 * all eight sublots on file and compares against the workbook's own cached
 * values.
 *
 * VOCABULARY. KYTC writes BSG for bulk specific gravity (Gmb) and MSG for
 * maximum specific gravity (Gmm, the Rice value). CLAUDE.md already records
 * the MixPack using "BSG" the same way. The names here follow the workbook,
 * because the person filling this in is reading the workbook's own words off
 * a bench sheet.
 *
 * NULLS ARE NOT ZEROS, the same rule `pay.mjs` follows: a quantity whose
 * inputs are incomplete comes back `null`, never 0 and never a guess. An
 * untested sublot with a 0% air void reads as a catastrophic mix rather than
 * as an empty row.
 */

/**
 * Specific gravity to pounds per cubic foot. 62.4 is KYTC's number, not a
 * rounding of water's actual 62.428 — `Superpave!H12` is literally `G12*62.4`
 * and `Cores!I` uses the same figure. A lot has to agree with the workbook it
 * will be loaded from, so do not "correct" this.
 */
export const PCF_PER_SG = 62.4;

/**
 * The 1.03 in the absorbed-AC and Gse formulas is the workbook's, carried
 * verbatim from `Superpave!K14` and `J8`. It is the assumed specific gravity
 * of the binder.
 */
export const BINDER_SG = 1.03;

/** Digits the workbook rounds each quantity to, at the point it rounds it. */
export const DP = {
  bulkVolume: 1,   // F = ROUND(E-D, 1)
  bsg: 3,          // G = ROUND(C/F, 3)
  msg: 3,          // row 41 = ROUND(36/(38-39+40), 3)
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** A blank cell, an empty string and a missing key are all "no value". */
function num(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Excel's ROUND: half away from zero, where JavaScript's Math.round is half
 * UP (so -2.5 rounds to -2 in JS and to -3 in Excel). No weight here is ever
 * negative, but the helper is the workbook's rule rather than the language's
 * so nobody has to wonder later.
 */
export function xlRound(v, digits) {
  if (!isNum(v)) return null;
  const m = Math.pow(10, digits);
  return (v < 0 ? -1 : 1) * Math.round(Math.abs(v) * m) / m;
}

/**
 * One BSG specimen — `Superpave` rows 12/13 (and 18/19, 24/25, 30/31).
 *
 *   volume     F = ROUND(SSD - water, 1)
 *   bsg        G = ROUND(air / F, 3)
 *   unitWeight H = G * 62.4
 *
 * Note `unitWeight` is computed from the ROUNDED bsg, as `H12 = G12*62.4`
 * does — not from the raw quotient.
 *
 * A specimen missing any of its three weights yields nulls throughout rather
 * than a partial answer. The workbook's own guards are one level looser
 * (`F` only tests SSD, `G` only tests air) but it cannot produce a number
 * without all three either, so this is the same behaviour stated honestly.
 */
export function bsgSpecimen(spec = {}, { round = true } = {}) {
  const air = num(spec.air), water = num(spec.water), ssd = num(spec.ssd);
  const blank = { volume: null, bsg: null, unitWeight: null };
  if (air == null || water == null || ssd == null) return blank;
  const volume = round ? xlRound(ssd - water, DP.bulkVolume) : ssd - water;
  if (volume == null || volume === 0) return blank;   // a zero volume is a typo, not a gravity
  const bsg = round ? xlRound(air / volume, DP.bsg) : air / volume;
  return { volume, bsg, unitWeight: bsg == null ? null : bsg * PCF_PER_SG };
}

/**
 * One MSG (Rice) determination — `Superpave` column C (and D, E, F, …).
 *
 *   sum   row 38 = mix + calibration
 *   msg   row 41 = ROUND(mix / (sum - finalWeight + absorbedWater), 3)
 *
 * `absorbedWater` is blank in both real lots and a blank reads as 0 inside
 * the sum, so it defaults to 0 rather than blocking the calculation — that
 * is the workbook's behaviour, not a convenience.
 */
export function msgDetermination(det = {}, { round = true } = {}) {
  const mix = num(det.mix), calibration = num(det.calibration), finalWeight = num(det.finalWeight);
  const absorbedWater = num(det.absorbedWater) ?? 0;
  if (mix == null || calibration == null || finalWeight == null) return { sum: null, msg: null };
  const sum = mix + calibration;
  const denom = sum - finalWeight + absorbedWater;
  if (denom === 0) return { sum, msg: null };
  const raw = mix / denom;
  return { sum, msg: round ? xlRound(raw, DP.msg) : raw };
}

/**
 * `AVERAGE()` over the values that are present, ignoring blanks exactly as
 * Excel does, and `null` when nothing is present (Excel's #DIV/0!, which
 * every one of these cells wraps in an IF/ISERROR and shows as blank).
 */
export function averagePresent(values) {
  const got = (values || []).filter(isNum);
  if (!got.length) return null;
  return got.reduce((a, b) => a + b, 0) / got.length;
}

/**
 * The average BSG and unit weight of a sublot — `Superpave!G14` / `H14`.
 *
 * ONE ODDITY REPRODUCED DELIBERATELY: the workbook gates both averages on
 * the FIRST specimen (`IF(G12="","",AVERAGE(G12:G13))`), so a sublot whose
 * first specimen is blank and whose second is filled reads blank rather than
 * reporting the second alone. Same family as the TSR absorbed-water guard in
 * CLAUDE.md — it is what every lot on file was judged by, so it is mirrored
 * rather than tidied.
 */
export function bsgAverage(specimens, opts) {
  const each = (specimens || []).map((s) => bsgSpecimen(s, opts));
  if (!each.length || each[0].bsg == null) {
    return { each, bsg: null, unitWeight: null };
  }
  return {
    each,
    bsg: averagePresent(each.map((e) => e.bsg)),
    unitWeight: averagePresent(each.map((e) => e.unitWeight)),
  };
}

/**
 * The average MSG of a sublot — `Superpave!D42` and its siblings. Unlike the
 * BSG average this is NOT gated on the first determination: the cell is
 * `IF(ISERROR(AVERAGE(C41:D41)),"",AVERAGE(C41:D41))`, and AVERAGE over one
 * filled and one blank cell is that one value.
 */
export function msgAverage(determinations, opts) {
  const each = (determinations || []).map((d) => msgDetermination(d, opts));
  return { each, msg: averagePresent(each.map((e) => e.msg)) };
}

/**
 * THE HAND-MIXED SAMPLE IS NOT ROUNDED, AND THE SUBLOTS ARE. Same rows, same
 * arithmetic, two different formulas in one workbook:
 *
 *   sublot    C41 = IF(C39="","",ROUND(C36/(C38-C39+C40),3))
 *   hand-mix  M41 = IF(M39="","",      M36/(M38-M39+M40)   )
 *
 * Three decimals is a big enough step at this magnitude to matter: rounding
 * the hand-mix moves Gse by ~0.00018, which moves every sublot's % absorbed
 * AC and Pbe by ~0.0023 — small, but it is the difference between agreeing
 * with the workbook and not, and a Pbe that disagrees puts the dust ratio and
 * VMA out with it. Caught by checking against the real files rather than by
 * reading the formula for the sublot and assuming the hand-mix matched.
 *
 * Reproduced rather than tidied, the same rule as the TSR absorbed-water
 * guard and the `Field Rutting` duplicate sn: it is what every approved lot
 * on file was judged by. This wrapper exists so nobody has to remember the
 * quirk at the call site.
 */
export function handMixedGse({ determinations, binderPct } = {}) {
  const { each, msg } = msgAverage(determinations, { round: false });
  return { each, gmm: msg, gse: gseFromHandMix({ gmm: msg, binderPct }) };
}

/**
 * Gse — the aggregate's effective specific gravity, `Superpave!J8`:
 *
 *   Gse = (100 - Pb) / ((100 / Gmm) - (Pb / 1.03))
 *
 * read off the LOT's HAND-MIXED check sample, not off a sublot. That is the
 * point of the hand-mixed sample: one binder content known exactly because
 * somebody weighed it in, so Gse is measured rather than inferred from
 * production. Every sublot's VMA and Pbe are measured against this one
 * number, which is why a lot with no hand-mixed sample can compute air voids
 * but not VMA.
 */
export function gseFromHandMix(handMix = {}) {
  const gmm = num(handMix.gmm), binderPct = num(handMix.binderPct);
  if (gmm == null || binderPct == null || gmm === 0) return null;
  const denom = (100 / gmm) - (binderPct / BINDER_SG);
  if (denom === 0) return null;
  return (100 - binderPct) / denom;
}

/**
 * ONE CORE, from its three weights — the `Cores` sheet, columns D/E/F.
 *
 *   bsg       G = air / (SSD - water)
 *   density   H = G * 62.4          (the sheet labels it kg/m3; it is pcf)
 *   pctSolid  I = (H / (MSG * 62.4)) * 100
 *
 * WATCH THE ROUNDING, WHICH IS NOT THE SAME AS THE SUBLOT'S. `Superpave`
 * rounds a gyratory puck's BSG to three decimals before using it
 * (`ROUND(C12/F12,3)`); `Cores!G10` is a bare `D10/(F10-E10)` with no ROUND at
 * all. Two bulk specific gravities, two rules, one workbook - so this is a
 * separate function from bsgSpecimen() rather than a call to it, and the
 * difference is the reason.
 *
 * THE MSG IS THE SUBLOT'S, not the core's: `Cores!C10` reads
 * `Superpave!D42`, the average of that sublot's two Rice bowls, and every
 * core in the block divides by that same figure (C11, C12, C13 all reference
 * C10). A core is compared against the mix it came from.
 *
 * `Cores!C` is also gated on `Calculations!J1<=5` - the mixture type code -
 * so on a No. 4 mix the MSG cell is blank and % solid with it. Pass
 * `paysOnMix: false` to reproduce that; it is why a No. 4 lot shows no core
 * density rather than showing a wrong one.
 */
export function coreDerived({ air, water, ssd, msg, paysOnMix = true } = {}) {
  const a = num(air), w = num(water), d = num(ssd);
  const blank = { bsg: null, density: null, pctSolid: null };
  if (a == null || w == null || d == null) return blank;
  const volume = d - w;
  if (volume === 0) return blank;                 // a zero volume is a typo, not a gravity
  const bsg = a / volume;                         // NO rounding - see above
  const density = bsg * PCF_PER_SG;
  const m = paysOnMix ? num(msg) : null;
  const pctSolid = (m == null || m === 0) ? null : (density / (m * PCF_PER_SG)) * 100;
  return { bsg, density, pctSolid };
}

/**
 * Everything the volumetric row shows, from the raw weights plus the two
 * values that come from elsewhere on the form.
 *
 * @param {object}   o
 * @param {object[]} o.specimens      two {air, water, ssd} — the BSG rows
 * @param {object[]} o.determinations two {mix, calibration, finalWeight, absorbedWater}
 * @param {number}   o.binderPct      %AC for this sublot (the Gradation tab's
 *                                    as-tested AC; NOT computed here)
 * @param {number}   o.gsb            this sublot's combined aggregate Gsb,
 *                                    off the Blend step (`Superpave!R9`..)
 * @param {number}   o.gse            the lot's Gse, from gseFromHandMix()
 * @param {number}   o.pctPassing200  % passing the #200 for this sublot, off
 *                                    the Gradation tab — the D/A numerator
 *
 * Returns every quantity the workbook's average row carries. Each is null
 * unless everything it needs is present, and the `needs` array says what a
 * null one is waiting for, so the page can explain a blank rather than just
 * showing one.
 */
export function sublotVolumetrics(o = {}) {
  const { bsg: gmb, unitWeight, each: bsgEach } = bsgAverage(o.specimens);
  const { msg: gmm, each: msgEach } = msgAverage(o.determinations);
  const binderPct = num(o.binderPct), gsb = num(o.gsb), gse = num(o.gse);
  const pctPassing200 = num(o.pctPassing200);
  const needs = [];

  // J = ((Gmm - Gmb) / Gmm) * 100
  let va = null;
  if (gmb == null) needs.push("BSG specimen weights");
  if (gmm == null) needs.push("MSG determinations");
  if (gmb != null && gmm != null && gmm !== 0) va = ((gmm - gmb) / gmm) * 100;

  // K = ((100-Pb) * (100 * (((Gse-Gsb)/(Gsb*Gse)) * 1.03))) / 100
  let absorbedAC = null;
  if (binderPct != null && gsb != null && gse != null && gsb !== 0 && gse !== 0) {
    absorbedAC = ((100 - binderPct) * (100 * (((gse - gsb) / (gsb * gse)) * BINDER_SG))) / 100;
  }
  // L = Pb - K
  const pbe = (binderPct != null && absorbedAC != null) ? binderPct - absorbedAC : null;
  // M = 100 - (Gmb * (100-Pb) / Gsb)
  const vma = (gmb != null && binderPct != null && gsb != null && gsb !== 0)
    ? 100 - (gmb * (100 - binderPct) / gsb) : null;
  // N = 100 * (VMA - Va) / VMA
  const vfa = (vma != null && va != null && vma !== 0) ? 100 * (vma - va) / vma : null;

  if (binderPct == null) needs.push("%AC");
  if (gsb == null) needs.push("combined Gsb for this sublot");
  if (gse == null) needs.push("the hand-mixed check sample (for Gse)");

  // O = %passing #200 / Pbe, reported as a band when it leaves 0.6..1.6.
  // The workbook prints a spec note beside it rather than a number; the band
  // strings are returned so the page can say the same thing.
  let dustRatio = null, dustRatioNote = null;
  if (pctPassing200 != null && pbe != null && pbe !== 0) {
    const raw = pctPassing200 / pbe;
    if (raw > 1.6) { dustRatio = ">1.6"; dustRatioNote = DUST_RATIO_NOTE; }
    else if (raw < 0.6) { dustRatio = "<0.6"; dustRatioNote = DUST_RATIO_NOTE; }
    else dustRatio = raw;
  }

  return {
    bsgEach, msgEach,
    gmb, unitWeight, gmm, va,
    absorbedAC, pbe, vma, vfa,
    dustRatio, dustRatioNote,
    needs: [...new Set(needs)],
  };
}

// =====================================================================
//  THE DEPARTMENT'S VERIFICATION — `Super Verify`, QA01 and IQ01
// =====================================================================
/*
 * The same volumetric chain a sublot runs, off the same kind of weights, with
 * three differences that are real and none of them guessable from the sublot
 * side. All four sets of formulas below were read out of KYTC's own blank
 * VER 14.01 template, not inferred.
 *
 *  1. NOTHING IS ROUNDED. `Superpave` rounds the bulk volume to 0.1, the BSG
 *     to 0.001 and each MSG to 0.001; `Super Verify` rounds none of the
 *     three - `F8 = E8-D8`, `G8 = C8/F8`, `C25 = C20/(C22-C23+C24)`, all bare.
 *     Same workbook, same arithmetic, two different formulas, exactly like
 *     the hand-mixed sample already documented above. Reproduced, not tidied.
 *
 *  2. THE %AC IS BACK-CALCULATED, NEVER TYPED. A verification sample is a
 *     box of mix off the road; nobody weighed binder into it, so its binder
 *     content is recovered from its own Gmm against the lot's Gse
 *     (`J28`) and then corrected for the moisture in the mix (`J27`). That is
 *     the whole reason the moisture block exists on that sheet.
 *
 *  3. THE Gsb IS THE VERIFIED SUBLOT'S. `K10`/`L10` branch on `B5` - the
 *     sublot this record verifies - and read `Superpave!R9`, `S9`, `T9` or
 *     `U9` accordingly. The blend percentages are per-sublot (docs/amaw-map.md),
 *     so this is not the same number for every record.
 *
 * NOT CHECKED AGAINST A REAL LOT, AND THAT CANNOT BE FIXED HERE: both of
 * Jake's completed AMAWs leave `Calculations!L1`/`L2` empty, meaning no QA or
 * IQ sample was ever taken on either, so every cell on that sheet is blank in
 * both. `check_verify.mjs` closes the gap the only other honest way - it
 * evaluates the template's OWN formulas with scripts/mixpack/formula.mjs and
 * compares them to this, so the transcription is checked against the workbook
 * even though the arithmetic has never met a real verification.
 */

/**
 * `'Super Verify'!J28` — the binder content recovered from the sample's own
 * maximum specific gravity:
 *
 *   Pb = 1.03 * (Gse - Gmm) / (Gmm * (Gse - 1.03)) * 100
 *
 * Null rather than a number whenever it cannot be formed. `Gse == 1.03` is
 * the degenerate case (an aggregate as light as the binder), which is not a
 * real mixture and would divide by zero.
 */
export function backCalcBinderPct({ gse, gmm } = {}) {
  const g = num(gse), m = num(gmm);
  if (g == null || m == null || m === 0 || g === BINDER_SG) return null;
  return ((BINDER_SG * (g - m)) / (m * (g - BINDER_SG))) * 100;
}

/**
 * `'Super Verify'!M39` — the water in the mix, as a percentage of it, from
 * the three pan weights:
 *
 *   % moisture = ((wet - dry) / wet) * 100,  wet = before - pan, dry = after - pan
 *
 * ONE DELIBERATE DIVERGENCE FROM THE WORKBOOK, and it is the only one in
 * this file that is not a reproduction. The cell gates on the BEFORE weight
 * alone (`IF(M36="","",...)`), so in Excel two blank cells under a filled one
 * read as zeros and the formula returns a confident 100%. Every other
 * quirk in this file is mirrored because a real approved lot was judged by
 * it; nothing was ever judged by this one (no completed AMAW has a
 * verification block at all), and 100% moisture would come straight off the
 * back-calculated %AC as a four-point error on a printed record. So all
 * three weights are required. The workbook's own zero-wet guard IS kept.
 */
export function moisturePct({ before, after, pan } = {}) {
  const b = num(before), a = num(after), p = num(pan);
  if (b == null || a == null || p == null) return null;
  const wet = b - p;
  if (wet === 0) return 0;            // the workbook's own IF(M36-M38=0,0,…)
  return ((wet - (a - p)) / wet) * 100;
}

/**
 * One verification record's whole row — `'Super Verify'` rows 10 and 17.
 *
 *   verifyVolumetrics({ specimens, determinations, moisture, gsb, gse })
 *
 * `specimens` is the two BSG pucks ({air, water, ssd}), `determinations` the
 * two Rice bowls ({mix, calibration, finalWeight, absorbedWater}), `moisture`
 * the percentage from moisturePct() (null when the pan weights are not there,
 * in which case the workbook uses the uncorrected back-calculation - `B10`
 * falls back from `J27` to `J28` for exactly that reason), `gsb` the VERIFIED
 * SUBLOT's combined aggregate Gsb and `gse` the lot's.
 *
 * Every figure is null unless everything it needs is present, and `needs`
 * names what a null one is waiting for, same contract as sublotVolumetrics().
 */
export function verifyVolumetrics(o = {}) {
  // Unrounded, on both - see (1) above.
  const { bsg: gmb, unitWeight, each: bsgEach } = bsgAverage(o.specimens, { round: false });
  const { msg: gmm, each: msgEach } = msgAverage(o.determinations, { round: false });
  const gsb = num(o.gsb), gse = num(o.gse), moisture = num(o.moisture);
  const needs = [];

  // J28, then J27 = J28 - M39. B10 takes the corrected one when there is one.
  const backCalc = backCalcBinderPct({ gse, gmm });
  const binderPct = backCalc == null ? null : (moisture == null ? backCalc : backCalc - moisture);

  // J10 = ((Gmm - Gmb) / Gmm) * 100
  if (gmb == null) needs.push("BSG specimen weights");
  if (gmm == null) needs.push("MSG determinations");
  const va = (gmb != null && gmm != null && gmm !== 0) ? ((gmm - gmb) / gmm) * 100 : null;

  // The absorbed half of K10, spelled out so the row can show the step.
  const absorbedAC = (binderPct != null && gsb != null && gse != null && gsb !== 0 && gse !== 0)
    ? ((100 - binderPct) * (100 * (((gse - gsb) / (gsb * gse)) * BINDER_SG))) / 100
    : null;
  // K10 = B10 - <the above>. Note the COLUMN differs from the sublot sheet -
  // `Super Verify` puts Pbe where `Superpave` puts absorbed AC - but the
  // quantity is the same one (addresses.mjs: "one column left from pbe on").
  const pbe = (binderPct != null && absorbedAC != null) ? binderPct - absorbedAC : null;
  // L10 = 100 - (Gmb * (100 - Pb) / Gsb)
  const vma = (gmb != null && binderPct != null && gsb != null && gsb !== 0)
    ? 100 - (gmb * (100 - binderPct) / gsb) : null;
  // M10 = 100 * (VMA - Va) / VMA
  const vfa = (vma != null && va != null && vma !== 0) ? 100 * (vma - va) / vma : null;

  if (gse == null) needs.push("the hand-mixed check sample (for Gse)");
  if (gsb == null) needs.push("combined Gsb for the sublot being verified");

  return {
    bsgEach, msgEach,
    gmb, unitWeight, gmm,
    backCalcBinderPct: backCalc, moisture, binderPct,
    va, absorbedAC, pbe, vma, vfa,
    needs: [...new Set(needs)],
  };
}

/**
 * One gradation column, from the bench weights the technician actually has.
 *
 * The AMAW's `Gradation` sheet is CUMULATIVE grams retained in column B, with
 * `C = (B/B25)*100` (percent retained) and `D = 100 - C` (percent passing).
 * That is verified rather than inferred: the sheet's own header cells read
 * "Grams Retained" / "Percent Retained" / "Percent Passing", and `D = 100 - C`
 * is only percent passing if C is cumulative.
 *
 * @param {Array<{key: string, grams: number}>} retained  coarse -> fine, as
 *        `GRADATION.sieves` orders them. A blank sieve is skipped, not zeroed:
 *        a sieve nobody ran is not a sieve that caught nothing.
 * @param {number} total  the total sample mass ('Gradation'!B25), TYPED - the
 *        workbook does not sum column B, and neither do we.
 * @param {number} pan    the pan weight, optional; used only for the check.
 */
export function gradationColumn(retained, total, pan) {
  const rows = Array.isArray(retained) ? retained : [];
  const tot = num(total);
  const out = [];
  const warnings = [];

  let last = null, descending = 0;
  for (const r of rows) {
    const g = num(r && r.grams);
    if (g == null) { out.push({ key: r && r.key, grams: null, pctRetained: null, pctPassing: null }); continue; }
    // A cumulative series only ever grows. Individual per-sieve masses typed
    // into a cumulative field is the one mistake this form cannot otherwise
    // see - the arithmetic stays plausible and every number comes out wrong -
    // so count it and say so rather than computing over it.
    if (last != null && g < last) descending += 1;
    last = g;
    const pctRetained = tot ? (g / tot) * 100 : null;
    out.push({
      key: r.key, grams: g,
      pctRetained,
      pctPassing: pctRetained == null ? null : 100 - pctRetained,
    });
  }

  if (descending) {
    warnings.push(`${descending} sieve(s) weigh LESS than the one above them. `
      + 'This column asks for CUMULATIVE grams retained - the running total down '
      + 'the sieve stack - so it should never fall. Per-sieve weights entered '
      + 'here would compute a wrong gradation that still looks reasonable.');
  }
  // The cross-check the workbook itself cannot do: the coarsest-to-finest
  // cumulative plus whatever fell through must be the sample you started with.
  const lastG = out.filter((o) => o.grams != null).map((o) => o.grams).pop();
  const p = num(pan);
  if (tot && lastG != null && p != null) {
    const diff = Math.abs(lastG + p - tot);
    if (diff / tot > 0.005) {
      warnings.push(`the finest cumulative weight (${lastG}) plus the pan (${p}) `
        + `is ${xlRound(lastG + p, 1)}, which is ${xlRound(diff, 1)} g off the total `
        + `sample mass (${tot}).`);
    }
  }
  if (!tot && out.some((o) => o.grams != null)) {
    warnings.push('no total sample mass, so no percentage can be computed from these weights.');
  }
  return { sieves: out, total: tot, pan: p, warnings };
}

/** `Superpave!O15` prints this verbatim when the D/A ratio leaves the band. */
export const DUST_RATIO_NOTE =
  "* Does not satisfy KY Specification Subsection 402.03.02 D) 5)";

export default {
  PCF_PER_SG, BINDER_SG, DP, DUST_RATIO_NOTE,
  xlRound, bsgSpecimen, msgDetermination, averagePresent,
  bsgAverage, msgAverage, gseFromHandMix, handMixedGse, sublotVolumetrics,
  coreDerived, backCalcBinderPct, moisturePct, verifyVolumetrics, gradationColumn,
};
