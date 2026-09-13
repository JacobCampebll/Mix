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
  if (!isNum(ac) || !isNum(jmfAC)) return { dev: null, pay: null };
  const dev = ac - jmfAC;
  const d = xlRound(Math.abs(dev), 1);
  // The sublot-1 allowance is the ONLY place the AC ladder differs, and unlike
  // air voids and VMA below it does not rescue an MCL-sized deviation - past
  // 0.7 the lot is still MCL on its first sublot. ('Pay Values'!D13)
  if (isFirstSublot && d <= 0.7) return { dev, pay: 100 };
  if (d <= 0.5) return { dev, pay: 100 };
  if (d <= 0.6) return { dev, pay: 95 };
  if (d <= 0.7) return { dev, pay: 90 };
  return { dev, pay: MCL };
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
  if (!isNum(av)) return { rounded: null, pay: null, note: null };
  const v = xlRound(av, 1);
  const cls = Number(esalClass);
  const lowClass = cls === 1 || cls === 2;   // AG3/AG6/AG7
  const highClass = cls === 3 || cls === 4;  // AG4/AG8

  let pay = 0, note = null;
  if (lowClass && (v <= 1.4 || v >= 6.6)) pay = MCL;
  else if (highClass && (v < 2 || v > 6)) pay = MCL;
  else {
    let sum = 0;
    if (v >= 3 && v <= 4) sum += 105;
    if (lowClass && v <= 2.9 && v >= 1.5) sum += tidy(100 * (1 + 0.1 * (v - 3)));
    if (highClass && v <= 2.9 && v >= 2) sum += tidy(100 * (1 + 0.1 * (v - 3)));
    if ((lowClass || highClass) && v <= 6 && v >= 4.1) sum += tidy(100 * (1 + 0.1 * (4.5 - v)));
    if (lowClass && v >= 6.1 && v <= 6.5) sum += 75;
    pay = tidy(sum);
    if (!lowClass && !highClass) {
      note = `ESAL Class ${esalClass ?? '(blank)'} is outside the workbook's 1-4 list; only the 3.0-4.0 band pays`;
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
    };
  }
  return { rounded: v, pay, note };
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
  if (!isNum(vma) || !isNum(minVMA)) return { dev: null, pay: null };
  const dev = vma - minVMA;
  const d = xlRound(dev, 1);

  let pay;
  if (!paysOn(mixTypeCode)) {
    // Every band is gated on the Superpave codes, so a non-Superpave mixture
    // takes MAX(0,0,0,0,0) = 0. A genuine quirk of the sheet, not a guess.
    pay = 0;
  } else if (d < -1) {
    pay = MCL;
  } else {
    let best = 0;
    if (d >= 0 && d <= 200) best = Math.max(best, 100);
    if (d >= -0.5 && d <= -0.1) best = Math.max(best, 95);
    if (d >= -1 && d <= -0.6) best = Math.max(best, 90);
    pay = best;
  }

  // 'Pay Values'!K13 - same sublot-1 allowance, and the same Excel
  // text-beats-number quirk as air voids: IF(AND(F3=1, E54>=90, E54<>""), 100, ...)
  // treats "MCL" as >= 90, so an MCL VMA on that sublot pays 100 too.
  if (isFirstSublot && (pay === MCL || (isNum(pay) && pay >= 90))) {
    return {
      dev,
      pay: 100,
      note: pay === MCL ? 'sublot-1 allowance applied to an MCL VMA (Excel ranks "MCL" above 90)' : null,
    };
  }
  return { dev, pay };
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
export function laneCorePay(pctSolid, { esalClass, mixTypeCode = 5 } = {}) {
  if (!isNum(pctSolid)) return null;
  if (!paysOn(mixTypeCode)) return MCL;             // every row gates on J1; sum 0 -> MCL
  const d = xlRound(pctSolid, 1);
  const cls = Number(esalClass);
  const bands = [
    [94, 96, 105],                                   // row 24
    [92, 93.9, 100],                                 // row 25
    [91, 91.9, 95],                                  // row 26
    [96.1, 97, 100],                                 // row 27
    [90, 90.9, 90],                                  // row 28
    [97.1, 97.5, 90],                                // row 29
    [97.6, 98.5, cls === 2 ? 85 : 0],                // row 30, D30 = IF(D15=2,85,0)
    [89, 89.9, cls === 2 ? 75 : 0],                  // row 31, D31 = IF(D15=2,75,0)
    [0, cls === 2 ? 88.9 : 89.9, 65],                // row 32, C32 = IF(D15=2,88.9,89.9)
    [cls === 2 ? 98.6 : 97.6, 200, 65],              // row 33, B33 = IF(D15=2,98.6,97.6)
  ];
  let sum = 0;
  for (const [lo, hi, factor] of bands) if (d >= lo && d <= hi) sum += factor;
  return sum === 0 ? MCL : sum;                      // Calculations!E34
}

// Joint cores - Calculations!A57:L67. No ESAL Class dependence, and NO "MCL"
// branch: E67 is a bare SUM, and the 0-87.9 band means every core that exists
// pays at least 75. A joint core cannot take the lot out of the pay schedule.
export function jointCorePay(pctSolid, { mixTypeCode = 5 } = {}) {
  if (!isNum(pctSolid)) return null;
  if (!paysOn(mixTypeCode)) return 0;
  const d = xlRound(pctSolid, 1);
  const bands = [
    [97.1, 200, 75],   // row 58 - over-compacted joint is penalised, same as under
    [96.6, 97, 90],    // row 59
    [96.1, 96.5, 100], // row 60
    [92, 96, 105],     // row 61
    [90, 91.9, 100],   // row 62
    [89, 89.9, 95],    // row 63
    [88, 88.9, 90],    // row 64
    [0, 87.9, 75],     // row 65
  ];
  let sum = 0;
  for (const [lo, hi, factor] of bands) if (d >= lo && d <= hi) sum += factor;
  return sum;
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
  if (Number(densityOption) === 2) return { sublots: [0, null, null, null], lot: 0 };
  const first = Number(lotNumber) === 1;
  const sublots = [0, 1, 2, 3].map(i => {
    const cores = (sublotCores[i] || []).map(c => laneCorePay(c, { esalClass, mixTypeCode }));
    // Cores!J14 - sublot 1 of lot 1 is 100 with cores or without.
    if (i === 0 && first) return 100;
    const present = cores.filter(v => !blank(v));
    if (!present.length) return null;
    if (present.some(v => v === MCL)) {
      // A single MCL core is text inside AVERAGE, which Excel skips - so the
      // sublot average is over the numeric cores only. Reproduced literally.
      const avg = avgPresent(present);
      return avg === 65 ? 'Call MCL' : avg;
    }
    const avg = avgPresent(present);
    // Cores!J19/J24/J29 - an average of exactly 65 means every core was in the
    // bottom band, and that is a call rather than a payment.
    return avg === 65 ? 'Call MCL' : avg;
  });
  const present = sublots.filter(v => !blank(v));
  let lot = null;
  if (present.length) {
    if (present.some(v => v === 'Call MCL')) lot = 'Call MCL';
    else {
      const avg = avgPresent(present);
      lot = avg === 65 ? 'Call MCL' : avg;            // Cores!J30
    }
  }
  return { sublots, lot };
}

// Cores!J33:J45. H11 = 2 means joints are not being paid on, and the sheet
// blanks the whole block; on lot 1 the first sublot is 100 unconditionally.
export function jointDensityLot({
  sublotCores = [], lotNumber, jointDensityFlag = 1, mixTypeCode = 5,
} = {}) {
  if (Number(jointDensityFlag) === 2) return { sublots: [null, null, null, null], lot: null };
  const first = Number(lotNumber) === 1;
  const sublots = [0, 1, 2, 3].map(i => {
    if (i === 0 && first) return 100;                 // Cores!J35
    const cores = (sublotCores[i] || []).map(c => jointCorePay(c, { mixTypeCode })).filter(v => !blank(v));
    return cores.length ? avgPresent(cores) : null;
  });
  return { sublots, lot: avgPresent(sublots.filter(v => !blank(v))) };
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
} = {}) {
  const notes = [];
  const w = weights || propertyWeights({ jointDensityFlag, densityOption, acceptanceOption });
  if (!weights && Object.values(w).every(x => x === 0)) {
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

  // Calculations!A71. Under Visual acceptance the whole thing is 100; under
  // Gradation it is 'Pay Values'!E41, the gradation pay average, which is a
  // different acceptance path and is not modelled here.
  let finalPct = null;
  if (Number(acceptanceOption) === 3) {
    finalPct = 100;
  } else if (Number(acceptanceOption) === 1) {
    notes.push('Gradation acceptance (Calculations!H13 = 1): final pay is the gradation average at \'Pay Values\'!E41, which this module does not compute');
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
    perSublot,
    byProperty,
    laneDetail, jointDetail,
    finalPct,                                               // 'Pay Values'!J21 / Calculations!A71
    finalPctCapped: finalPct === null ? null : Math.min(finalPct, 100), // Calculations!A72, advisory
    payTons: net,
    tonnageAdj,                                             // 'Pay Values'!J23
    dollarAdj,                                              // 'Pay Values'!J24
    notes,
  };
}
