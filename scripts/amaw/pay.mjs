// LOT PAY, ported out of KYTC's AMAW workbook. Pure functions - no DOM, no I/O.
//
// This computes MONEY. A wrong band edge is a silent four-figure error on one
// lot and nobody notices, so every rule below cites the cell it came from and
// nothing here was inferred from the spec book. It was read off two real
// completed lots (contract 252112, AMAW Version 13.3) and cross-checked against
// the blank VER 14.01 template; `check_pay.mjs` beside this file re-runs both
// lots and diffs every number against what Excel itself cached in them.
//
// WHERE THE MODEL LIVES IN THE WORKBOOK
//   'Pay Values'   rows 13-17  the five properties, per sublot and lot average
//                  rows 20-24  the property weights
//                  J21-J24     final pay, tonnage adjustment, dollar adjustment
//   Calculations   AG1:AN9     air-void pay curve ("Corrected Air Voids Pay Values")
//                  A23:T34     lane-core density pay curve
//                  A47:H54     VMA pay curve
//                  A57:L67     joint-core density pay curve
//                  A71/A72     the weighted roll-up
//   Cores          J10-J30     lane cores, per-sublot and lot averages
//                  J33-J45     joint cores, same shape
//
// THE FOUR CONTROL FLAGS. Everything switches on these, and they are set by
// drop-downs on the Pay Values sheet that write into Calculations:
//   Calculations!D15  ESAL Class, 1-4. The dropdown sits at 'Pay Values'!I4
//     beside the "ESAL Class:" label and its list is Calculations!C15:C18
//     (1,2,3,4) - confirmed from the control's own FmlaLink/FmlaRange in
//     xl/drawings/vmlDrawing1.vml, because the cell itself carries no label.
//   Calculations!H11  1 = joint density counts, 2 = it does not (a checkbox
//     into M11: H11 = IF(M11,1,2)).
//   Calculations!H12  density option, 1 = A, 2 = B (label at M12).
//   Calculations!H13  acceptance option, 1 = Gradation, 2 = Volumetrics,
//     3 = Visual (H13 = IF(H20="Gradation",1,...), label at I13).
//   Calculations!J1   mixture type code. 1-5 and 14 are the Superpave family;
//     the density and VMA tables refuse to pay anything for any other code.
//
// MCL ("material control limit") is a real state a pay cell takes, not an
// error and not a zero - it means the lot leaves the pay schedule and becomes
// a conversation with the Department. It is carried through as the string
// "MCL" everywhere a pay value can be one. A value that simply has not been
// tested is `null`, and null never turns into 0.
//
// WHAT THIS DOES NOT DO, AND WHAT NO REAL LOT HAS EXERCISED. Read this before
// trusting a number out of here on a lot that does not look like the two:
//   * Gradation acceptance (H13 = 1) is NOT modelled. Its final pay is
//     'Pay Values'!E41 - the average of MIN('Accept. Grad. # n'!H8:H22) over
//     the four sublots - a second pay schedule over fifteen sieve/AC
//     deviations per sublot. lotPay returns a null final pay and says so.
//   * Both real lots are ESAL Class 3. Every Class 1/2 branch here - the
//     1.5-2.9 air-void band, the 6.1-6.5 -> 75 band, the wider 1.4/6.6 MCL
//     edges, and the four density constants that move on Class 2 (85, 75,
//     88.9, 98.6) - is transcribed from the formulas and confirmed by nothing.
//   * 'Pay Values'!J20 (Pavement Wedge Tons) is blank in both, so the
//     (tonnage - wedgeTons) subtraction in J23/J24 is ported, not proven.
//   * Both are Volumetric acceptance, joint density on, density option A.
//     The other two weight rows are transcribed only.
//   * Mixture type is Superpave 0.38 (J1 = 5) in both.

export const MCL = 'MCL';

// ---------------------------------------------------------------------------
// Excel arithmetic
// ---------------------------------------------------------------------------

// Excel's ROUND is decimal and half-AWAY-from-zero, and it works from the
// value as Excel carries it (15 significant digits). JS `Math.round` is
// half-UP and would disagree on every negative half, and a naive `v*10` picks
// up its own float error - 4.55*10 lands a hair under 45.5 in some orders of
// operation and silently rounds down. Every band edge in this file is a tenth,
// so this is load-bearing: one tenth the wrong way is a whole pay band.
export function xlRound(v, dp = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  const sign = v < 0 ? -1 : 1;
  const f = Math.pow(10, dp);
  const a = Number(Math.abs(v).toPrecision(15));
  const shifted = Number((a * f).toPrecision(15));
  return (sign * Math.round(shifted)) / f;
}

// Excel carries every number at 15 significant digits, so it cached exactly 99
// where `100 * (1 + 0.1 * (4.5 - 4.6))` gives IEEE754's 99.00000000000001.
// Normalising to the same 15 digits reproduces that without inventing
// precision: it only ever removes float dust past the digit Excel itself keeps,
// so it cannot move a value across a band edge or lose a cent.
const tidy = v => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(15)) : v);

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const blank = v => v === null || v === undefined || v === '';

// AVERAGE over whatever is actually there. Excel's AVERAGE skips empty cells,
// which is exactly what a part-filled AMAW needs: "there will always be not
// fully filled out AMAWs" (Jake). Returns null rather than NaN when nothing is
// there, so a missing sublot never reads as a zero-pay sublot.
export function avgPresent(values) {
  const xs = (values || []).filter(isNum);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;   // no tidying - this feeds the weighted sum
}

// A lot average over pay values, with the workbook's MCL propagation:
// 'Pay Values'!D17/G17/K17 - all blank -> blank, any one MCL -> the whole lot
// is MCL, otherwise the mean of the sublots present.
//
// The sheet writes those averages as AVERAGE(VALUE(RIGHT(D13,5)),D14,D15,D16).
// The RIGHT(...,5) is a no-op for every value these curves can produce (they
// are whole numbers 65-105, at most three characters), so it is not reproduced
// - and reproducing it literally would be WRONG in JS, where 99.00000000000001
// stringifies in full and RIGHT(...,5) would return "00001". Noted rather than
// ported. It does mean the workbook throws #VALUE! on a lot whose sublot 1 is
// untested while a later one is not; this returns the average of what is there.
export function lotAverage(values) {
  const present = (values || []).filter(v => !blank(v));
  if (!present.length) return null;
  if (present.some(v => v === MCL)) return MCL;
  return avgPresent(present);
}

// ---------------------------------------------------------------------------
// Property weights - 'Pay Values'!E20:E24
// ---------------------------------------------------------------------------
//
// NOT constants. The five cells are formulas switching on the three control
// flags, and they only ever pay anything under Volumetric acceptance
// (H13 = 2). Three combinations are defined; anything else - including the
// "joint density counts, density option B" pairing, which the workbook simply
// does not answer for - weighs every property at zero.
export function propertyWeights({ jointDensityFlag, densityOption, acceptanceOption } = {}) {
  const k = `${jointDensityFlag}/${densityOption}/${acceptanceOption}`;
  switch (k) {
    // H11=1 (joint density counts), H12=1 (option A), H13=2 (volumetrics)
    case '1/1/2': return { jointDensity: 15, laneDensity: 30, ac: 5, av: 25, vma: 25 };
    // H11=2 (no joint density), option A: the joint's 15 moves onto lane+AC
    case '2/1/2': return { jointDensity: 0, laneDensity: 40, ac: 10, av: 25, vma: 25 };
    // H11=2, H12=2 (option B): no cores at all, so it is all volumetrics
    case '2/2/2': return { jointDensity: 0, laneDensity: 0, ac: 35, av: 40, vma: 25 };
    default: return { jointDensity: 0, laneDensity: 0, ac: 0, av: 0, vma: 0 };
  }
}

// ---------------------------------------------------------------------------
// Reference values that hang off the mixture type code (Calculations!J1)
// ---------------------------------------------------------------------------

// 'Pay Values'!H13:H16 - the VMA minimum. One per Superpave nominal size.
export function vmaMinimumFor(mixTypeCode) {
  const t = { 1: 11, 2: 12, 3: 13, 4: 14, 5: 15, 14: 16 };
  return t[mixTypeCode] ?? null;
}

// 'Pay Values'!E13 - the air-void TARGET, LOOKUP(J1, A1:A14, F1:F14) = 3.5 for
// every Superpave type. Printed on the sheet for the technician; note that no
// pay curve reads it - the air-void bands below are absolute, not relative to
// this target. Kept so callers can display the same thing the workbook does.
export function airVoidTargetFor(mixTypeCode) {
  return mixTypeCode >= 1 && mixTypeCode <= 5 ? 3.5 : mixTypeCode === 14 ? 3.5 : null;
}

// The pay tables for density and VMA all open with
// OR(J1=1,J1=2,J1=3,J1=4,J1=5,J1=14) and pay 0 for anything else.
const SUPERPAVE_CODES = new Set([1, 2, 3, 4, 5, 14]);
const paysOn = code => SUPERPAVE_CODES.has(Number(code));

// ---------------------------------------------------------------------------
// % AC - 'Pay Values'!C13:D16
// ---------------------------------------------------------------------------
//
// Deviation from the JMF, then a three-step ladder on its absolute value
// rounded to a tenth. Note the ladder is on ROUND(ABS(dev),1), so a deviation
// of 0.55 is 0.6 and loses 5%, while 0.549 is 0.5 and loses nothing.
export function acPay({ jmfAC, ac, isFirstSublot = false } = {}) {
  if (!isNum(ac) || !isNum(jmfAC)) return { dev: null, rounded: null, pay: null, rule: null };
  const dev = ac - jmfAC;
  const d = xlRound(Math.abs(dev), 1);
  // `rule` is the ladder step that fired, in the words the schedule uses -
  // so the readout can say WHY a sublot paid what it did rather than only
  // what. It names the band and its factor and nothing else; the readout
  // never re-derives a band, so there is one copy of this arithmetic.
  // The sublot-1 allowance is the ONLY place the AC ladder differs, and unlike
  // air voids and VMA below it does not rescue an MCL-sized deviation - past
  // 0.7 the lot is still MCL on its first sublot. ('Pay Values'!D13)
  if (isFirstSublot && d <= 0.7 && d > 0.5) {
    return { dev, rounded: d, pay: 100, rule: { band: '|dev| 0.6 – 0.7, sublot 1 of lot 1', pay: 100, allowance: true } };
  }
  if (d <= 0.5) return { dev, rounded: d, pay: 100, rule: { band: '|dev| ≤ 0.5', pay: 100 } };
  if (d <= 0.6) return { dev, rounded: d, pay: 95, rule: { band: '|dev| = 0.6', pay: 95 } };
  if (d <= 0.7) return { dev, rounded: d, pay: 90, rule: { band: '|dev| = 0.7', pay: 90 } };
  return { dev, rounded: d, pay: MCL, rule: { band: '|dev| > 0.7', pay: MCL } };
}

// ---------------------------------------------------------------------------
// Air voids - Calculations!AG1:AN9, "Corrected Air Voids Pay Values"
// ---------------------------------------------------------------------------
//
// There are TWO air-void curves in Calculations and only one is live. The
// older block at A36:H44 is dead: its bottom row (E43) reads
// OR(E37>=1.9, E37<=6.1), which is true for every real number, so its MAX is
// floored at 65 forever. 'Pay Values'!G13:G16 read AH9/AJ9/AL9/AN9 - the
// AG:AN block - and that is what is ported here. Do not resurrect A36:H44.
//
// Bands, on the air void rounded to a tenth (Calculations!E37 = ROUND(F13,1)):
//   3.0 - 4.0                     105          (AG2/AH2 - no ESAL Class gate)
//   ESAL 1-2: 1.5 - 2.9           100*(1+0.1*(av-3))   (AG3/AH3)
//   ESAL 3-4: 2.0 - 2.9           same formula         (AG4/AH4)
//   any ESAL: 4.1 - 6.0           100*(1+0.1*(4.5-av)) (AG5/AH5)
//   ESAL 1-2: 6.1 - 6.5           75                   (AG6/AH6)
//   ESAL 1-2: <= 1.4 or >= 6.6    MCL                  (AG7)
//   ESAL 3-4: < 2.0 or > 6.0      MCL                  (AG8)
// AH9 sums the matched cells (the bands are disjoint, so the sum is the one
// that matched) unless a MCL cell fired.
//
// Two asymmetries worth knowing before touching this. The 105 band is the only
// one that does not consult the ESAL Class, so a blank/out-of-range class
// still pays 105 in 3.0-4.0 and pays ZERO everywhere else - the `note` on the
// return says so rather than guessing. And this block, unlike density and VMA,
// has no mixture-type gate at all.
export function airVoidPay({ av, esalClass, isFirstSublot = false } = {}) {
  if (!isNum(av)) return { rounded: null, pay: null, note: null, bands: [] };
  const v = xlRound(av, 1);
  const cls = Number(esalClass);
  const lowClass = cls === 1 || cls === 2;   // AG3/AG6/AG7
  const highClass = cls === 3 || cls === 4;  // AG4/AG8

  // `bands` records every AG:AN row that matched, with its factor, so the
  // readout can show the schedule line a sublot landed on. The bands are
  // disjoint, so it is one entry on any real lot; the shape is a list because
  // the sheet SUMS them and this reproduces the sheet.
  let pay = 0, note = null;
  const bands = [];
  if (lowClass && (v <= 1.4 || v >= 6.6)) { pay = MCL; bands.push({ band: '≤ 1.4 or ≥ 6.6 (Class 1-2)', pay: MCL }); }
  else if (highClass && (v < 2 || v > 6)) { pay = MCL; bands.push({ band: '< 2.0 or > 6.0 (Class 3-4)', pay: MCL }); }
  else {
    let sum = 0;
    if (v >= 3 && v <= 4) { sum += 105; bands.push({ band: '3.0 – 4.0', pay: 105 }); }
    if (lowClass && v <= 2.9 && v >= 1.5) {
      const p = tidy(100 * (1 + 0.1 * (v - 3))); sum += p;
      bands.push({ band: '1.5 – 2.9 (Class 1-2)', formula: '100 × (1 + 0.1 × (av − 3.0))', pay: p });
    }
    if (highClass && v <= 2.9 && v >= 2) {
      const p = tidy(100 * (1 + 0.1 * (v - 3))); sum += p;
      bands.push({ band: '2.0 – 2.9 (Class 3-4)', formula: '100 × (1 + 0.1 × (av − 3.0))', pay: p });
    }
    if ((lowClass || highClass) && v <= 6 && v >= 4.1) {
      const p = tidy(100 * (1 + 0.1 * (4.5 - v))); sum += p;
      bands.push({ band: '4.1 – 6.0', formula: '100 × (1 + 0.1 × (4.5 − av))', pay: p });
    }
    if (lowClass && v >= 6.1 && v <= 6.5) { sum += 75; bands.push({ band: '6.1 – 6.5 (Class 1-2)', pay: 75 }); }
    pay = tidy(sum);
    if (!lowClass && !highClass) {
      note = `AADTT Class ${esalClass ?? '(blank)'} is outside the workbook's 1-4 list; only the 3.0-4.0 band pays`;
    }
  }

  // 'Pay Values'!G13. The first sublot of the first lot is forgiven anything
  // that would have paid 90 or better. READ THE COMPARISON CAREFULLY: the cell
  // is IF(AND(F3=1, Calculations!AH9>=90), 100, AH9), and in Excel a text
  // value is greater than every number - so "MCL" >= 90 is TRUE and an MCL air
  // void on that one sublot pays 100. That is what the workbook does and what
  // every lot approved on it was paid by, so it is reproduced rather than
  // corrected. Flagged, not fudged.
  if (isFirstSublot && (pay === MCL || (isNum(pay) && pay >= 90))) {
    return {
      rounded: v,
      pay: 100,
      note: pay === MCL
        ? 'sublot-1 allowance applied to an MCL air void - Excel ranks text above every number, so AH9>=90 is true for "MCL"'
        : note,
      bands,
      allowance: { from: pay, to: 100 },
    };
  }
  return { rounded: v, pay, note, bands };
}

// ---------------------------------------------------------------------------
// VMA - Calculations!A47:H54
// ---------------------------------------------------------------------------
//
// Deviation from the minimum (I13 - H13), rounded to a tenth, then bands:
//    0.0 to 200   -> 100       (row 49)
//   -0.5 to -0.1   -> 95       (row 50)
//   -1.0 to -0.6   -> 90       (row 51)
//   below -1.0     -> MCL      (row 53)
// Row 52 is a fourth band whose Min/Max cells (B52/C52) were never filled, so
// it reads "dev >= 0 AND dev <= 0" and fires "MCL" on a deviation of exactly
// zero. It is inert in the sheet because E54 takes MAX(E49:E53) and Excel's
// MAX ignores text, so the 100 from row 49 wins - which is why a VMA exactly
// on the minimum pays 100 and not MCL. Not ported; documented so nobody
// "restores" it.
export function vmaPay({ minVMA, vma, isFirstSublot = false, mixTypeCode = 5 } = {}) {
  if (!isNum(vma) || !isNum(minVMA)) return { dev: null, rounded: null, pay: null, rule: null };
  const dev = vma - minVMA;
  const d = xlRound(dev, 1);

  // `rule` names the A47:H54 row that fired - same purpose as acPay's.
  let pay, rule;
  if (!paysOn(mixTypeCode)) {
    // Every band is gated on the Superpave codes, so a non-Superpave mixture
    // takes MAX(0,0,0,0,0) = 0. A genuine quirk of the sheet, not a guess.
    pay = 0; rule = { band: 'mixture type is not Superpave', pay: 0 };
  } else if (d < -1) {
    pay = MCL; rule = { band: 'dev < −1.0', pay: MCL };
  } else {
    let best = 0; rule = { band: 'no band matched', pay: 0 };
    if (d >= 0 && d <= 200) { best = Math.max(best, 100); rule = { band: 'dev ≥ 0.0', pay: 100 }; }
    if (d >= -0.5 && d <= -0.1) { best = Math.max(best, 95); rule = { band: 'dev −0.5 to −0.1', pay: 95 }; }
    if (d >= -1 && d <= -0.6) { best = Math.max(best, 90); rule = { band: 'dev −1.0 to −0.6', pay: 90 }; }
    pay = best;
  }

  // 'Pay Values'!K13 - same sublot-1 allowance, and the same Excel
  // text-beats-number quirk as air voids: IF(AND(F3=1, E54>=90, E54<>""), 100, ...)
  // treats "MCL" as >= 90, so an MCL VMA on that sublot pays 100 too.
  if (isFirstSublot && (pay === MCL || (isNum(pay) && pay >= 90))) {
    return {
      dev,
      rounded: d,
      pay: 100,
      note: pay === MCL ? 'sublot-1 allowance applied to an MCL VMA (Excel ranks "MCL" above 90)' : null,
      rule,
      allowance: { from: pay, to: 100 },
    };
  }
  return { dev, rounded: d, pay, rule };
}

// ---------------------------------------------------------------------------
// One sublot
// ---------------------------------------------------------------------------
//
// `isFirstSublot` is the workbook's "*For Sublot # 1 Only" allowance, and its
// gate is 'Pay Values'!F3 = 1 - the LOT number, not the sublot number. So it
// applies to sublot 1 of lot 1 and to nothing else on the job: the start-up
// sublot, before anyone has had a chance to react to a result.
export function sublotPay({
  jmfAC, ac, targetAV, av, minVMA, vma,
  isFirstSublot = false, esalClass, mixTypeCode = 5,
} = {}) {
  return {
    ac: acPay({ jmfAC, ac, isFirstSublot }),
    av: { target: targetAV ?? airVoidTargetFor(mixTypeCode), ...airVoidPay({ av, esalClass, isFirstSublot }) },
    vma: vmaPay({ minVMA: minVMA ?? vmaMinimumFor(mixTypeCode), vma, isFirstSublot, mixTypeCode }),
  };
}

// ---------------------------------------------------------------------------
// Core density - the two curves
// ---------------------------------------------------------------------------
//
// Both take a core's % solid density rounded to a tenth (Calculations!E22:T22
// and E56:L56 are ROUND(Cores!I..,1)) and sum every band it falls in. The
// bands are laid out so that at most one non-zero factor matches - except
// where ESAL Class 3/4 zeroes a band and a wider 65% band underneath it picks
// the core up, which is deliberate and is why this sums rather than picking.

// Lane cores - Calculations!A23:T34. Three band edges and two factors move on
// ESAL Class 2, which is the only class the sheet treats specially here.
// `laneCoreDetail` is the same table with its working shown - the rounded
// density, every row it landed on and the factor each contributed - and
// laneCorePay() is its `pay` alone. One table, read once, so the readout that
// prints "93.4 -> 92.0-93.9 -> 100" cannot disagree with the number it paid.
export function laneCoreDetail(pctSolid, { esalClass, mixTypeCode = 5 } = {}) {
  if (!isNum(pctSolid)) return { rounded: null, matched: [], pay: null };
  if (!paysOn(mixTypeCode)) {                        // every row gates on J1; sum 0 -> MCL
    return { rounded: xlRound(pctSolid, 1), matched: [], pay: MCL, note: 'mixture type is not Superpave, so no density band pays' };
  }
  const d = xlRound(pctSolid, 1);
  const cls = Number(esalClass);
  const bands = [
    [94, 96, 105, 24],                               // row 24
    [92, 93.9, 100, 25],                             // row 25
    [91, 91.9, 95, 26],                              // row 26
    [96.1, 97, 100, 27],                             // row 27
    [90, 90.9, 90, 28],                              // row 28
    [97.1, 97.5, 90, 29],                            // row 29
    [97.6, 98.5, cls === 2 ? 85 : 0, 30],            // row 30, D30 = IF(D15=2,85,0)
    [89, 89.9, cls === 2 ? 75 : 0, 31],              // row 31, D31 = IF(D15=2,75,0)
    [0, cls === 2 ? 88.9 : 89.9, 65, 32],            // row 32, C32 = IF(D15=2,88.9,89.9)
    [cls === 2 ? 98.6 : 97.6, 200, 65, 33],          // row 33, B33 = IF(D15=2,98.6,97.6)
  ];
  const matched = [];
  let sum = 0;
  for (const [lo, hi, factor, row] of bands) if (d >= lo && d <= hi) { sum += factor; matched.push({ lo, hi, factor, row }); }
  return { rounded: d, matched, pay: sum === 0 ? MCL : sum };   // Calculations!E34
}
export function laneCorePay(pctSolid, opts = {}) {
  return laneCoreDetail(pctSolid, opts).pay;
}

// Joint cores - Calculations!A57:L67. No ESAL Class dependence, and NO "MCL"
// branch: E67 is a bare SUM, and the 0-87.9 band means every core that exists
// pays at least 75. A joint core cannot take the lot out of the pay schedule.
export function jointCoreDetail(pctSolid, { mixTypeCode = 5 } = {}) {
  if (!isNum(pctSolid)) return { rounded: null, matched: [], pay: null };
  if (!paysOn(mixTypeCode)) {
    return { rounded: xlRound(pctSolid, 1), matched: [], pay: 0, note: 'mixture type is not Superpave, so no density band pays' };
  }
  const d = xlRound(pctSolid, 1);
  const bands = [
    [97.1, 200, 75, 58],   // row 58 - over-compacted joint is penalised, same as under
    [96.6, 97, 90, 59],    // row 59
    [96.1, 96.5, 100, 60], // row 60
    [92, 96, 105, 61],     // row 61
    [90, 91.9, 100, 62],   // row 62
    [89, 89.9, 95, 63],    // row 63
    [88, 88.9, 90, 64],    // row 64
    [0, 87.9, 75, 65],     // row 65
  ];
  const matched = [];
  let sum = 0;
  for (const [lo, hi, factor, row] of bands) if (d >= lo && d <= hi) { sum += factor; matched.push({ lo, hi, factor, row }); }
  return { rounded: d, matched, pay: sum };
}
export function jointCorePay(pctSolid, opts = {}) {
  return jointCoreDetail(pctSolid, opts).pay;
}

// ---------------------------------------------------------------------------
// Core density - lot roll-up
// ---------------------------------------------------------------------------
//
// `sublotCores` is an array of up to four arrays of % solid densities. A
// sublot with no cores contributes nothing to the lot average rather than
// contributing a zero - which is how a part-filled AMAW has to behave, and
// also how Cores!J30 behaves, since AVERAGE skips its blanks.

// Cores!J10:J30. Two specials: density option B (H12=2) pays no lane density
// at all, and on lot 1 the first sublot is 100 whether or not it has cores.
export function laneDensityLot({
  sublotCores = [], lotNumber, densityOption = 1, esalClass, mixTypeCode = 5,
} = {}) {
  // `cores` (per sublot, per core: rounded density, the band rows it landed
  // on, its pay) and `rules` (one sentence per sublot saying how its figure
  // was arrived at) are the working; `sublots` and `lot` are unchanged.
  if (Number(densityOption) === 2) {
    return { sublots: [0, null, null, null], lot: 0, cores: [[], [], [], []],
             rules: ['density option B pays no lane density (Calculations!H12 = 2)', null, null, null],
             lotRule: 'density option B pays no lane density' };
  }
  const first = Number(lotNumber) === 1;
  const details = [0, 1, 2, 3].map(i => (sublotCores[i] || []).map(c => laneCoreDetail(c, { esalClass, mixTypeCode })));
  const rules = [null, null, null, null];
  const sublots = [0, 1, 2, 3].map(i => {
    const cores = details[i].map(d => d.pay);
    // Cores!J14 - sublot 1 of lot 1 is 100 with cores or without.
    if (i === 0 && first) { rules[i] = 'sublot 1 of lot 1 pays 100 with cores or without (Cores!J14)'; return 100; }
    const present = cores.filter(v => !blank(v));
    if (!present.length) { rules[i] = 'no cores yet'; return null; }
    if (present.some(v => v === MCL)) {
      // A single MCL core is text inside AVERAGE, which Excel skips - so the
      // sublot average is over the numeric cores only. Reproduced literally.
      const avg = avgPresent(present);
      rules[i] = 'average of the cores that paid - an MCL core is text, which AVERAGE skips';
      if (avg === 65) rules[i] += '; an average of exactly 65 is a call, not a payment';
      return avg === 65 ? 'Call MCL' : avg;
    }
    const avg = avgPresent(present);
    // Cores!J19/J24/J29 - an average of exactly 65 means every core was in the
    // bottom band, and that is a call rather than a payment.
    rules[i] = avg === 65 ? 'every core in the bottom band - an average of exactly 65 is a call, not a payment' : 'average of the cores';
    return avg === 65 ? 'Call MCL' : avg;
  });
  const present = sublots.filter(v => !blank(v));
  let lot = null, lotRule = 'no sublot has a lane density yet';
  if (present.length) {
    if (present.some(v => v === 'Call MCL')) { lot = 'Call MCL'; lotRule = 'a sublot is Call MCL, so the lot is'; }
    else {
      const avg = avgPresent(present);
      lot = avg === 65 ? 'Call MCL' : avg;            // Cores!J30
      lotRule = avg === 65 ? 'the sublots average exactly 65, which is a call' : 'average of the sublots present (Cores!J30)';
    }
  }
  return { sublots, lot, cores: details, rules, lotRule };
}

// Cores!J33:J45. H11 = 2 means joints are not being paid on, and the sheet
// blanks the whole block; on lot 1 the first sublot is 100 unconditionally.
export function jointDensityLot({
  sublotCores = [], lotNumber, jointDensityFlag = 1, mixTypeCode = 5,
} = {}) {
  if (Number(jointDensityFlag) === 2) {
    return { sublots: [null, null, null, null], lot: null, cores: [[], [], [], []],
             rules: [null, null, null, null], lotRule: 'joint density does not count on this lot (Calculations!H11 = 2)' };
  }
  const first = Number(lotNumber) === 1;
  const details = [0, 1, 2, 3].map(i => (sublotCores[i] || []).map(c => jointCoreDetail(c, { mixTypeCode })));
  const rules = [null, null, null, null];
  const sublots = [0, 1, 2, 3].map(i => {
    if (i === 0 && first) { rules[i] = 'sublot 1 of lot 1 pays 100 with cores or without (Cores!J35)'; return 100; }
    const cores = details[i].map(d => d.pay).filter(v => !blank(v));
    rules[i] = cores.length ? 'average of the cores' : 'no cores yet';
    return cores.length ? avgPresent(cores) : null;
  });
  const lot = avgPresent(sublots.filter(v => !blank(v)));
  return { sublots, lot, cores: details, rules,
           lotRule: lot == null ? 'no sublot has a joint density yet' : 'average of the sublots present (Cores!J45)' };
}

// ---------------------------------------------------------------------------
// GRADATION ACCEPTANCE - 'Accept. Grad. # 1'..'# 4' (Calculations!H13 = 1)
// ---------------------------------------------------------------------------
//
// 2026 Std Spec 402.05.01 (STD p.182, footer 402-7): specialty mixtures -
// OGFC, ATDB, Asphalt Mixture for Pavement Wedge, Leveling and Wedging,
// Scratch Course, temporary mixtures and Base Failure Repair - are paid under
// the "LOT PAY ADJUSTMENT SCHEDULE FOR SPECIALTY MIXTURES (TEST DEVIATION
// FROM JMF)" on p.184 (footer 402-9): "The Department will assign a pay value
// for AC and gradation within each sublot and average the sublot pay values
// to determine the pay value for each lot."
//
// The workbook's shape, read off the shipped VER 14.01 template. NO
// gradation-accepted lot is on file - both real lots are Volumetrics - so
// unlike every ladder above, this block is checked against the template's
// own formulas rather than against Excel's cached answers (check_pay.mjs
// says which is which). A real leveling-and-wedging AMAW is the thing still
// owed here.
//
//   'Accept. Grad. # n'!A8:H20  one row per sieve, 2" .. #200 - thirteen rows;
//                               the 1/4" is skipped (Gradation!D16 is never read)
//     B   the JMF target, TYPED on that sheet. PlantBook writes it from the
//         lot's one JMF column rather than asking twice.
//     C   the acceptance test, Gradation!D/G/J/M for the sublot, prefixed
//         "* " and ROUNDED TO A WHOLE PERCENT when it is outside the mixture
//         type's CONTROL POINTS (Calculations!AY16:AZ29, an HLOOKUP on J1
//         into W14:AX30 - transcribed below as CONTROL_POINTS_BY_MIX_TYPE)
//     D   a check test typed on the same sheet (not modelled here)
//     E   the Department's verification gradation (Super Verify; no UI yet)
//     F   AVERAGE of C, D and E as present; for the #200, Calculations!Q124
//     G   ABS(B - F), the deviation from the JMF
//     H   the pay factor
//   row 21  % AC   C21 is Gradation!D33 (the moisture-corrected back-calc),
//                  else D34; H21 is the AC ladder on ROUND(ABS(dev),1)
//   row 22  F.M.   fineness modulus, ONLY for mixture types 7, 8 and 13
//                  (Sand Asphalt I and II, Sand Seal), whose sieve rows read ""
//   'Pay Values'!E37:E40  MIN('Accept. Grad. # n'!H8:H22) - the sublot's pay
//   'Pay Values'!E41      AVERAGE(E37:E40)                - the lot's pay
//   Calculations!A71      IF(H13=1, 'Pay Values'!E41, ...) - the final pay value
//
// THREE THINGS THAT ARE NOT IN THE SPEC'S TABLE, all reproduced but the last:
//
//  1. THE CONTROL-POINT GATE. Every sieve row's H is
//       IF(OR(ROUND(ABS(G),1) <= <top band>, LEFT(C,1) <> "*"), 100, <ladder>)
//     so a sieve pays 100 WHATEVER its deviation from the JMF unless its
//     test value is outside the mixture's control points. The spec's table
//     is headed "test deviation from JMF" and says nothing about control
//     points; the workbook adds the gate and the workbook is what KYTC pays
//     by, so it is reproduced, and the readout says which of the two
//     reasons a sieve paid 100 for. Neither the AC row nor the F.M. row has
//     the gate.
//  2. THE #200 IS ROUNDED TO THE NEAREST HALF before the deviation
//     (Calculations!Q124: fractional part 0-0.2 rounds down, 0.3-0.7 to .5,
//     0.8-0.9 up); every other starred sieve is rounded to a whole percent
//     and an unstarred one is used as it is.
//  3. THE SUBLOT-1 ALLOWANCE IS MISWRITTEN IN THE WORKBOOK, and this is the
//     one place this file departs from it. 'Pay Values'!E37 reads
//       IF(AND(F3=1, MIN(H8:H22)) >= 90, 100, ...)
//     with the ">= 90" OUTSIDE the AND. AND() returns a boolean, and Excel
//     ranks a boolean above every number - so TRUE >= 90 and FALSE >= 90 are
//     both TRUE, and the first sublot pays 100 on EVERY lot, whatever it
//     tested and whatever the lot number. The three cells beside it
//     (D13/G13/K13, all IF(AND(F3=1, x >= 90), 100, x)) make the intent
//     unmistakable, and no real lot has ever been paid through E37 (both on
//     file are Volumetrics) - so unlike the text-beats-number quirks above,
//     which are reproduced because approved lots were paid by them, this is
//     implemented AS INTENDED: lot 1's first sublot is forgiven anything at
//     90 or better. `workbookLiteral` on the sublot result is what the sheet
//     itself would print, so the two can be compared. Flagged for Tate.
//
// Scale: 100 is the spec's 1.00, as everywhere else in this file.

const GRADATION_FLOOR = 75;   // the last row of every ladder on p.184

// The deviation ladders, [top of band, pay]; a deviation past the last band
// pays GRADATION_FLOOR. Transcribed from H8:H20 of the template, sieve by
// sieve. The spec's own table (p.184) groups them the same way, with two
// differences the workbook resolves: the spec has no 2" row (the workbook
// pays the 2" on the 1 1/2" ladder), and the spec writes "—" where a ladder
// skips a factor (the #100 has no 98 or 85; the #200 no 90).
export const GRADATION_LADDERS = {
  coarse: [[13, 100], [14, 98], [16, 95], [20, 90], [23, 85]],   // 2", 1 1/2"          H8, H9
  mid:    [[9, 100], [10, 98], [12, 95], [14, 90], [16, 85]],    // 1", 3/4", 1/2"      H10-H12
  fine:   [[8, 100], [9, 98], [10, 95], [12, 90], [14, 85]],     // 3/8" .. #30         H13-H17
  no50:   [[6, 100], [7, 98], [8, 95], [9, 90], [10, 85]],       // #50                 H18
  no100:  [[3, 100], [4, 95], [5, 90]],                          // #100                H19
  no200:  [[2, 100], [2.5, 98], [3, 95], [3.5, 85]],             // #200                H20
};
export const SPECIALTY_AC_LADDER = [[0.5, 100], [0.6, 98], [0.7, 90], [0.8, 85]];       // H21
export const FINENESS_MODULUS_LADDER = [[0.30, 100], [0.34, 98], [0.39, 95], [0.46, 90], [0.55, 85]];  // H22

// The thirteen sieves of 'Accept. Grad. # n', in sheet order, keyed the way
// both books' sieve lists are (sections.mjs AMAW_SIEVES / CONFIG.SECTIONS).
export const GRADATION_PAY_SIEVES = [
  { key: 's50',    label: '2"',     row: 8,  ladder: 'coarse' },
  { key: 's37_5',  label: '1-1/2"', row: 9,  ladder: 'coarse' },
  { key: 's25',    label: '1"',     row: 10, ladder: 'mid' },
  { key: 's19',    label: '3/4"',   row: 11, ladder: 'mid' },
  { key: 's12_5',  label: '1/2"',   row: 12, ladder: 'mid' },
  { key: 's9_5',   label: '3/8"',   row: 13, ladder: 'fine' },
  { key: 's4_75',  label: '#4',     row: 14, ladder: 'fine' },
  { key: 's2_36',  label: '#8',     row: 15, ladder: 'fine' },
  { key: 's1_18',  label: '#16',    row: 16, ladder: 'fine' },
  { key: 's0_6',   label: '#30',    row: 17, ladder: 'fine' },
  { key: 's0_3',   label: '#50',    row: 18, ladder: 'no50' },
  { key: 's0_15',  label: '#100',   row: 19, ladder: 'no100' },
  { key: 's0_075', label: '#200',   row: 20, ladder: 'no200' },
];
export const GRADATION_AC_ROW = 21;
export const GRADATION_FM_ROW = 22;

// Mixture types paid on FINENESS MODULUS rather than on the sieves: Sand
// Asphalt Type I (7), Type II (8) and Sand Seal (13). Their sieve rows on
// 'Accept. Grad.' read "" (C8 opens IF(OR(J1=7, J1=8, J1=13, ...), "", ...)),
// and 'Gradation'!D35 = SUM(C17:C22)/100 is the F.M. - the cumulative
// percent retained on the #4 .. #100, summed, over 100.
export const FM_MIX_TYPES = [7, 8, 13];
export const FM_SIEVES = ['s4_75', 's2_36', 's1_18', 's0_6', 's0_3', 's0_15'];

// Calculations!W14:AX30 - the control points per mixture type code (row 14 is
// the code, rows 16-29 the sieves 2" .. #200 with the 1/4" at row 22),
// [min, max] as the sheet holds them. A blank min reads 0 through
// AY = HLOOKUP(..., FALSE) and a blank max reads 100 through
// AZ = IF(HLOOKUP(...) = 0, 100, ...), so a sieve not listed here is [0, 100]
// - i.e. never starred - which is controlPointBand()'s answer for it.
//
// The Superpave columns (1-5, 14) are AASHTO M 323 Table 4 and match the
// workbook's own `.45 Data` sheet cell for cell. Note the 15-41 .. 32-67 band
// sits on the #8 (2.36 mm), NOT the #4; the #4 carries the "90 max" point.
// The specialty columns are KYTC's own (407 for the wedge, 404 for OGFC...).
export const CONTROL_POINTS_BY_MIX_TYPE = {
  1:  { s50: [100, 100], s37_5: [90, 100], s25: [0, 90], s2_36: [15, 41], s0_075: [0, 6] },      // Superpave 1.5
  2:  { s37_5: [100, 100], s25: [90, 100], s19: [0, 90], s2_36: [19, 45], s0_075: [1, 7] },      // Superpave 1.0
  3:  { s25: [100, 100], s19: [90, 100], s12_5: [0, 90], s2_36: [23, 49], s0_075: [2, 8] },      // Superpave 0.75
  4:  { s19: [100, 100], s12_5: [90, 100], s9_5: [0, 90], s2_36: [28, 58], s0_075: [2, 10] },    // Superpave 0.50
  5:  { s12_5: [100, 100], s9_5: [90, 100], s4_75: [0, 90], s2_36: [32, 67], s0_075: [2, 10] },  // Superpave 0.38
  6:  { s37_5: [100, 100], s19: [85, 100], s12_5: [35, 65], s4_75: [0, 20], s2_36: [0, 10], s0_075: [0, 4] },  // ATDB
  7:  { s6_3: [100, 100], s2_36: [75, 100], s1_18: [60, 90], s0_6: [45, 75], s0_3: [15, 45], s0_15: [5, 15], s0_075: [2, 6] },  // Sand Asphalt I
  8:  { s6_3: [100, 100], s2_36: [50, 90], s1_18: [25, 65], s0_6: [15, 45], s0_3: [5, 30], s0_15: [3, 20], s0_075: [2, 6] },    // Sand Asphalt II
  9:  { s37_5: [100, 100], s19: [70, 100], s9_5: [45, 80], s4_75: [30, 60], s2_36: [20, 45], s1_18: [15, 35], s0_3: [5, 20], s0_15: [3, 10] },  // Asphalt Wedge (407.02.02)
  10: { s9_5: [100, 100], s4_75: [90, 100], s2_36: [65, 90], s1_18: [45, 70], s0_6: [30, 50], s0_3: [18, 30], s0_15: [10, 21], s0_075: [5, 15] },  // Slurry Seal
  11: { s12_5: [100, 100], s4_75: [60, 80], s2_36: [45, 65], s0_3: [13, 25], s0_075: [6, 12] },  // Curb/Median Mix
  12: { s12_5: [100, 100], s9_5: [90, 100], s4_75: [25, 50], s2_36: [5, 15], s0_075: [2, 5] },   // Open Graded Friction Course
  13: { s6_3: [100, 100], s2_36: [50, 90], s1_18: [25, 65], s0_6: [15, 45], s0_3: [5, 30], s0_15: [3, 20], s0_075: [2, 6] },    // Sand Seal
  14: { s9_5: [100, 100], s6_3: [95, 100], s4_75: [90, 100], s1_18: [30, 60], s0_075: [6, 12] },  // Superpave No.4
};

/** The control-point table for a mixture type code, or null for a code the
 *  workbook has no column for (the HLOOKUP is #N/A and every sieve pays ""). */
export function controlPointsFor(mixTypeCode) {
  return CONTROL_POINTS_BY_MIX_TYPE[Number(mixTypeCode)] || null;
}

/** [min, max] the acceptance test is judged inside for one sieve, with the
 *  sheet's own defaults for a blank cell (AY -> 0, AZ -> 100). Null when the
 *  mixture type has no column at all. */
export function controlPointBand(mixTypeCode, sieveKey) {
  const t = controlPointsFor(mixTypeCode);
  if (!t) return null;
  const b = t[sieveKey];
  return [b && isNum(b[0]) ? b[0] : 0, b && isNum(b[1]) ? b[1] : 100];
}

// Calculations!Q124: the #200's test value to the nearest half. B124 =
// ROUND(frac, 1); 0-0.2 -> INT, 0.3-0.7 -> INT + 0.5, else INT + 1.
export function roundToHalf(v) {
  if (!isNum(v)) return v;
  const whole = Math.floor(v);
  const frac = xlRound(v - whole, 1);
  if (frac <= 0.2) return whole;
  if (frac <= 0.7) return whole + 0.5;
  return whole + 1;
}

// One ladder, on an already-rounded deviation. `rule` names the band in the
// schedule's own words so the readout never re-derives it.
function ladderPay(ladder, d, dp) {
  const f = (x) => (dp === 2 ? x.toFixed(2) : String(x));
  let lo = null;
  for (const [top, pay] of ladder) {
    const band = lo == null ? `|dev| ≤ ${f(top)}` : `|dev| ${f(lo)} – ${f(top)}`;
    if (d <= top) return { pay, rule: { band, pay } };
    lo = top;
  }
  return { pay: GRADATION_FLOOR, rule: { band: `|dev| > ${f(lo)}`, pay: GRADATION_FLOOR } };
}

/**
 * One sieve of one sublot - 'Accept. Grad. # n' row 8..20.
 *
 *   sieve        an entry of GRADATION_PAY_SIEVES (or its key)
 *   jmf          the JMF target % passing (column B)
 *   test         this sublot's % passing (Gradation!D/G/J/M, the raw quotient)
 *   mixTypeCode  Calculations!J1, for the control-point gate
 *
 * Returns { key, label, row, jmf, test, band, starred, shown, dev, rounded,
 *           pay, rule }. `shown` is what the sheet's F column carries into the
 * deviation - the test value rounded to a whole when starred, to the nearest
 * half on the #200; `starred` is the gate; `pay` is null where the sheet's H
 * would read "" (no test, no JMF, a mixture type with no control-point column,
 * or an F.M. mixture whose sieve rows are blank by design).
 */
export function sievePay({ sieve, jmf, test, mixTypeCode } = {}) {
  const sv = typeof sieve === 'string' ? GRADATION_PAY_SIEVES.find(s => s.key === sieve) : sieve;
  const base = { key: sv ? sv.key : null, label: sv ? sv.label : null, row: sv ? sv.row : null,
                 jmf: isNum(jmf) ? jmf : null, test: isNum(test) ? test : null,
                 band: null, starred: null, shown: null, dev: null, rounded: null, pay: null, rule: null };
  if (!sv || !isNum(jmf) || !isNum(test)) return base;
  const code = Number(mixTypeCode);
  if (FM_MIX_TYPES.indexOf(code) >= 0) {
    return { ...base, rule: { band: 'not scored - this mixture type is paid on fineness modulus', pay: null } };
  }
  const band = controlPointBand(code, sv.key);
  if (!band) {
    return { ...base, rule: { band: `not scored - Calculations!W14:AX30 has no column for mixture type ${mixTypeCode ?? '(blank)'}`, pay: null } };
  }
  const starred = test < band[0] || test > band[1];
  let shown = starred ? xlRound(test, 0) : test;
  if (sv.key === 's0_075') shown = roundToHalf(shown);              // F20 = Calculations!Q124
  const dev = Math.abs(jmf - shown);
  const rounded = xlRound(dev, 1);
  if (!starred) {
    return { ...base, band, starred, shown, dev, rounded, pay: 100,
             rule: { band: `inside the control points ${band[0]}–${band[1]}`, pay: 100, gate: true } };
  }
  const { pay, rule } = ladderPay(GRADATION_LADDERS[sv.ladder], rounded, 1);
  return { ...base, band, starred, shown, dev, rounded, pay, rule: { ...rule, ladder: sv.ladder } };
}

/** % AC under Gradation acceptance - 'Accept. Grad. # n'!H21. The ladder is
 *  the Specialty schedule's (≤0.5 100, 0.6 98, 0.7 90, 0.8 85, ≥0.9 75), on
 *  ROUND(ABS(dev), 1), with no MCL and no control-point gate. NOT acPay():
 *  the volumetric ladder is 100/95/90/MCL and has the sublot-1 widening. */
export function specialtyAcPay({ jmfAC, ac } = {}) {
  if (!isNum(ac) || !isNum(jmfAC)) return { dev: null, rounded: null, pay: null, rule: null };
  const dev = ac - jmfAC;
  const d = xlRound(Math.abs(dev), 1);
  const { pay, rule } = ladderPay(SPECIALTY_AC_LADDER, d, 1);
  return { dev, rounded: d, pay, rule };
}

/** Gradation!D35 / Calculations!D121: the fineness modulus of a % passing
 *  column - the cumulative percent retained on the #4 .. #100, summed, over
 *  100. Null unless all six sieves are present. */
export function finenessModulus(passingByKey) {
  if (!passingByKey) return null;
  let sum = 0;
  for (const k of FM_SIEVES) {
    const p = passingByKey[k];
    if (!isNum(p)) return null;
    sum += 100 - p;
  }
  return tidy(sum / 100);
}

/** 'Accept. Grad. # n'!H22 - on ROUND(ABS(dev), 2). */
export function finenessModulusPay({ target, test } = {}) {
  if (!isNum(target) || !isNum(test)) return { dev: null, rounded: null, pay: null, rule: null };
  const dev = test - target;
  const d = xlRound(Math.abs(dev), 2);
  const { pay, rule } = ladderPay(FINENESS_MODULUS_LADDER, d, 2);
  return { dev, rounded: d, pay, rule };
}

/**
 * One sublot under Gradation acceptance - 'Pay Values'!E37:E40.
 *
 *   mixTypeCode   Calculations!J1
 *   jmf           { sieveKey: % passing }   the JMF column ('Accept. Grad.'!B8:B20)
 *   test          { sieveKey: % passing }   this sublot's gradation
 *   jmfAC, ac     the JMF %AC and this sublot's %AC (rows B21 / C21)
 *   fmTarget, fm  fineness modulus, target and test - read only for FM_MIX_TYPES;
 *                 derived from `jmf` / `test` by finenessModulus() when not given
 *   isFirstSublot lot 1's first sublot - the allowance (see note 3 above)
 *   position      0-based sublot index; 0 is 'Pay Values' row 37, whose
 *                 literal formula pays 100 unconditionally (note 3)
 *
 * `pay` is MIN over every factor present (sieves, AC, F.M.) - the sheet's
 * MIN(H8:H22) - or null when nothing has been tested. `lowest` names the
 * factor(s) that set it.
 */
export function gradationSublotPay({
  mixTypeCode, jmf = {}, test = {}, jmfAC, ac, fmTarget, fm,
  isFirstSublot = false, position = null,
} = {}) {
  const code = Number(mixTypeCode);
  const sieves = GRADATION_PAY_SIEVES.map(sv => sievePay({ sieve: sv, jmf: jmf[sv.key], test: test[sv.key], mixTypeCode: code }));
  const acR = specialtyAcPay({ jmfAC, ac });
  let fmR = null;
  if (FM_MIX_TYPES.indexOf(code) >= 0) {
    const tgt = isNum(fmTarget) ? fmTarget : finenessModulus(jmf);
    const tst = isNum(fm) ? fm : finenessModulus(test);
    fmR = { target: tgt, test: tst, ...finenessModulusPay({ target: tgt, test: tst }) };
  }
  const factors = [];
  sieves.forEach(s => { if (isNum(s.pay)) factors.push({ what: s.label, key: s.key, pay: s.pay }); });
  if (isNum(acR.pay)) factors.push({ what: '% AC', key: 'ac', pay: acR.pay });
  if (fmR && isNum(fmR.pay)) factors.push({ what: 'F.M.', key: 'fm', pay: fmR.pay });

  let min = null, lowest = [];
  if (factors.length) {
    min = Math.min(...factors.map(f => f.pay));
    lowest = factors.filter(f => f.pay === min).map(f => f.what);
  }
  let pay = min, allowance = null;
  if (isFirstSublot && isNum(min) && min >= 90 && min !== 100) {
    pay = 100; allowance = { from: min, to: 100 };
  }
  // What the sheet itself prints for this row - see note 3: row 37 is 100
  // whenever anything is scored, and the other three rows are the MIN.
  const workbookLiteral = position === 0 ? (factors.length ? 100 : null) : min;
  return { position, sieves, ac: acR, fm: fmR, factors, min, lowest, pay, allowance, workbookLiteral };
}

/** 'Pay Values'!E41 - the lot's pay under Gradation acceptance, the average
 *  of the sublot pays present; null when no sublot has one. */
export function gradationLotPay({ sublots = [] } = {}) {
  const pays = sublots.map(s => (s ? s.pay : null)).filter(v => isNum(v));
  return { sublots, lot: pays.length ? avgPresent(pays) : null,
           rule: pays.length ? `average of the ${pays.length} sublot${pays.length === 1 ? '' : 's'} scored ('Pay Values'!E41)`
                             : 'no sublot has a gradation or %AC result yet' };
}

// ---------------------------------------------------------------------------
// The lot
// ---------------------------------------------------------------------------
//
// lotPay takes either ready density figures (`jointDensity` / `laneDensity`,
// the numbers 'Pay Values'!B21 and B22 show) or the raw cores, in which case
// the two curves above produce them.
//
//   Calculations!A71  the weighted sum, and 'Pay Values'!J21 prints it as-is.
//   Calculations!A72  the same capped at 100 - the sheet computes it and then
//                     does NOT use it; the cap is a printed instruction to the
//                     person paying ("***Final Pay should be made at 100%
//                     Maximum", 'Pay Values'!G26). Both are returned, with the
//                     uncapped one as `finalPct` because that is what J23/J24
//                     actually multiply by. Do not quietly cap it here.
//   J23  (finalPct - 100) * (tonnage - wedgeTons) / 100
//   J24  that * unitPrice
//
// Pavement wedge tons come off the top of the lot tonnage because wedge is
// paid at its own rate when placed monolithically with the mainline
// ('Pay Values'!G20/G25).
export function lotPay({
  sublots = [],
  jointDensity, laneDensity,
  jointCores, laneCores,
  weights,
  jointDensityFlag = 1, densityOption = 1, acceptanceOption = 2,
  lotNumber, esalClass, mixTypeCode = 5,
  tonnage, unitPrice, wedgeTons = 0,
  // Gradation acceptance only: { jmf: {sieveKey: %}, jmfAC?, fmTarget?,
  //   sublots: [{ test: {sieveKey: %}, ac?, jmfAC?, fm? }, ...] } - see
  //   gradationSublotPay(). The %AC per sublot falls back to `sublots[i]`.
  gradation = null,
} = {}) {
  const notes = [];
  const w = weights || propertyWeights({ jointDensityFlag, densityOption, acceptanceOption });
  // Under Gradation acceptance every weight IS zero by design ('Pay
  // Values'!E20:E24 all read 0 when H13 = 1) - the pay comes from the
  // Specialty schedule below, so a zero weight there is not worth a note.
  if (!weights && Number(acceptanceOption) !== 1 && Object.values(w).every(x => x === 0)) {
    notes.push(`no weights defined for joint=${jointDensityFlag} density-option=${densityOption} acceptance=${acceptanceOption}; the workbook pays 0 on every property`);
  }

  // Per sublot. Sublot index 0 of lot 1 carries the "*For Sublot # 1 Only"
  // allowance; nothing else ever does.
  const perSublot = sublots.map((s, i) => sublotPay({
    ...s,
    isFirstSublot: Number(lotNumber) === 1 && i === 0,
    esalClass, mixTypeCode,
  }));

  const acLot = lotAverage(perSublot.map(s => s.ac.pay));
  const avLot = lotAverage(perSublot.map(s => s.av.pay));
  const vmaLot = lotAverage(perSublot.map(s => s.vma.pay));

  // Under Visual acceptance the three volumetric lot averages are simply 100
  // ('Pay Values'!D17/G17/K17 all open with IF(Calculations!H13=3,100,...)).
  const visual = Number(acceptanceOption) === 3;

  let lane = laneDensity, joint = jointDensity, laneDetail = null, jointDetail = null;
  if (lane === undefined && laneCores) {
    laneDetail = laneDensityLot({ sublotCores: laneCores, lotNumber, densityOption, esalClass, mixTypeCode });
    lane = laneDetail.lot;
  }
  if (joint === undefined && jointCores) {
    jointDetail = jointDensityLot({ sublotCores: jointCores, lotNumber, jointDensityFlag, mixTypeCode });
    joint = jointDetail.lot;
  }
  // 'Pay Values'!B21: joint density is blank when it does not count or under
  // Gradation acceptance, and falls back to 100 when the block is empty - an
  // untested joint is not a free 0, it is not a deduction at all.
  if (Number(jointDensityFlag) === 2 || Number(acceptanceOption) === 1) joint = null;
  else if (blank(joint)) joint = 100;
  // 'Pay Values'!B22: lane density is blank under Gradation acceptance.
  if (Number(acceptanceOption) === 1) lane = null;

  const byProperty = {
    jointDensity: { value: joint, weight: w.jointDensity },
    laneDensity: { value: blank(lane) ? null : lane, weight: w.laneDensity },
    ac: { value: visual ? 100 : acLot, weight: w.ac },
    av: { value: visual ? 100 : avLot, weight: w.av },
    vma: { value: visual ? 100 : vmaLot, weight: w.vma },
  };

  // Gradation acceptance (Calculations!H13 = 1). On the sheet the five
  // properties read "" - 'Pay Values' rows 13-16, 21 and 22 all open
  // IF(Calculations!H13=1,"",...) - and the pay is the Specialty schedule's,
  // per sublot then averaged. See gradationSublotPay() above for the
  // schedule and for the three things about it that are not in the spec.
  let gradationResult = null;
  if (Number(acceptanceOption) === 1) {
    const g = gradation || {};
    const gs = g.sublots || [];
    const n = Math.max(gs.length, sublots.length);
    const per = [];
    for (let i = 0; i < n; i++) {
      const gi = gs[i] || {}, si = sublots[i] || {};
      per.push(gradationSublotPay({
        mixTypeCode, jmf: g.jmf || {}, test: gi.test || {},
        jmfAC: gi.jmfAC ?? si.jmfAC ?? g.jmfAC, ac: gi.ac ?? si.ac,
        fmTarget: g.fmTarget, fm: gi.fm,
        isFirstSublot: Number(lotNumber) === 1 && i === 0, position: i,
      }));
    }
    gradationResult = gradationLotPay({ sublots: per });
    for (const k of Object.keys(byProperty)) byProperty[k] = { value: null, weight: 0 };
    const literalDiffers = per.filter(s => s.workbookLiteral !== s.pay && (isNum(s.pay) || isNum(s.workbookLiteral)));
    if (literalDiffers.length) {
      notes.push(`'Pay Values'!E37 as written in the workbook pays sublot 1 100 whatever it tested (its ">= 90" sits outside the AND, and Excel ranks a boolean above every number); this computes the allowance as the cells beside it intend - lot 1's first sublot is forgiven anything at 90 or better - so sublot 1 here is ${per[0].pay ?? 'blank'} where the sheet would print ${per[0].workbookLiteral ?? 'blank'}`);
    }
  }

  // Calculations!A71. Under Visual acceptance the whole thing is 100; under
  // Gradation it is 'Pay Values'!E41, the gradation pay average, which is a
  // different acceptance path and is not modelled here.
  let finalPct = null;
  if (Number(acceptanceOption) === 3) {
    finalPct = 100;
  } else if (Number(acceptanceOption) === 1) {
    // 'Pay Values'!E41 -> Calculations!A71.
    finalPct = gradationResult.lot;
    if (finalPct === null) notes.push(`Gradation acceptance (Calculations!H13 = 1): ${gradationResult.rule}, so there is no final pay value`);
  } else {
    // Joint density blank drops its term entirely rather than contributing 0 -
    // that is A71's own IF('Pay Values'!B21="", ...) branch. It comes to the
    // same number, because E20 is already 0 whenever B21 is blank.
    const terms = [
      byProperty.jointDensity, byProperty.laneDensity,
      byProperty.ac, byProperty.av, byProperty.vma,
    ].filter(t => !(t === byProperty.jointDensity && blank(joint)));

    const mcl = terms.find(t => t.value === MCL || t.value === 'Call MCL');
    const missing = terms.find(t => t.weight > 0 && blank(t.value));
    if (mcl) {
      // The sheet multiplies "MCL" by a weight, gets #VALUE!, and J21's
      // ISERROR wrapper prints nothing. A blank final pay IS the answer: the
      // lot has left the pay schedule.
      notes.push('a property came back MCL, so there is no final pay value - the lot goes to the Department');
    } else if (missing) {
      notes.push('a weighted property has no value yet, so there is no final pay value');
    } else {
      finalPct = tidy(terms.reduce((sum, t) => sum + (t.value * t.weight) / 100, 0));
    }
  }

  const net = isNum(tonnage) ? tonnage - (isNum(wedgeTons) ? wedgeTons : 0) : null;
  const tonnageAdj = finalPct !== null && net !== null ? tidy(((finalPct - 100) * net) / 100) : null;
  const dollarAdj = tonnageAdj !== null && isNum(unitPrice) ? tidy(tonnageAdj * unitPrice) : null;

  return {
    weights: w,
    // Carried so payWarnings() can tell the SETUP sublot from the rest
    // without a second reader of `lot_number` - 402.03.02 H) 1)'s
    // cease-shipments rule opens "After the setup period", and setup is
    // lot 1's first sublot. `isFirstSublot` above is the same fact, but it
    // is spent inside perSublot and not recoverable from the result.
    lotNumber: isNum(Number(lotNumber)) ? Number(lotNumber) : null,
    perSublot,
    byProperty,
    laneDetail, jointDetail,
    gradation: gradationResult,                             // Gradation acceptance only: the sublot factors and 'Pay Values'!E41
    finalPct,                                               // 'Pay Values'!J21 / Calculations!A71
    finalPctCapped: finalPct === null ? null : Math.min(finalPct, 100), // Calculations!A72, advisory
    payTons: net,
    tonnageAdj,                                             // 'Pay Values'!J23
    dollarAdj,                                              // 'Pay Values'!J24
    notes,
  };
}
