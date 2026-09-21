// LOT PAY READOUT - the presentation layer over scripts/amaw/pay.mjs.
//
// "The contractor once they have filled out an amaw can also see their lot
// pay, telling them if they have penalties or bonuses which is a major part of
// the sheet. The state uses that too calculate penalties or gains." (Jake).
// This is the payoff screen of PlantBook, so it is built to be read in that
// order: the answer first, then the working underneath it.
//
// NO ARITHMETIC LIVES HERE. Every number this module prints came out of
// lotPay(); the only maths below is formatting (rounding for display,
// thousands separators, and the weight x value contribution that the property
// table shows so a person can see the weighted sum add up). If a figure looks
// wrong, it is a pay.mjs question, and check_pay.mjs is the file that answers
// it - 127/127 cells against two real lots.
//
// PURE. Strings in, strings out. No DOM, no document, no window - the page
// calls payViewHTML() and assigns the result, exactly the way computedHTML()
// and renderPolish() do in public/designbook.html. That is also what lets
// check_payview.mjs render five lots in Node and read them.
//
// ESCAPING. Everything that reaches innerHTML goes through esc(). This module
// carries its own copy - identical to designbook.html's - and uses it by
// default, so it is safe even if a caller forgets; pass `{ esc }` in the
// context to use the page's own function instead, which is what PlantBook
// should do so there is one definition on the page. Nothing here is
// interpolated raw: not a note out of pay.mjs, not a state string like "Call
// MCL", not a label. A lot's own data has been through somebody else's browser
// by the time a reviewer opens it - same rule as the sieve inputs.
//
// WHAT IT REUSES FROM designbook.html'S STYLESHEET, so the two books look like
// one app rather than two:
//   .prverdict + .rvalue / .rsub    the answer strip, exactly as the polish
//                                   section's verdict (Jake asked for the TSR
//                                   percentage treatment: "pretty prominently")
//   .fp-card / .fp-card.hero        a computed figure in a card, .l + .v
//   .prscroll / .prtable            a wide data table that scrolls itself
//   .prrowhead .prsub .prempty      its sticky first column, sub-text, empty state
//   .prspacer                       the thicker rule above a summary row
//   .rowgroup-head                  the small uppercase sub-headings
//   .tsrwarn                        the notes list under a computed block
//   .prnote .computed-note .mono    body copy, the read-only footnote, figures
//
// AND THE TWO CLASSES IT NEEDS THAT THE PAGE DOES NOT HAVE YET. Paste these in
// beside .fp-card and .prverdict; nothing else is required.
//
//   /* The three headline figures. Three .fp-cards in a row, one column on a
//      phone - .fp-results is a six-column grid, which would leave each of
//      these a sixth of the width. */
//   .paygrid{display:grid; grid-template-columns:repeat(3,minmax(0,1fr));
//            gap:10px; margin:0 0 14px;}
//   @media (max-width:700px){ .paygrid{grid-template-columns:1fr;} }
//   /* MCL is a state, not a failure: gold, the same token the rail's
//      not-proven flag uses, never --bad. */
//   .paymcl{color:var(--flag); font-weight:600; letter-spacing:.04em;}
//
// One existing rule wants a second half. .prspacer styles the `th` only,
// because the polish matrix's spacer row is all row-heads; the summary rows
// here carry `td`s across, so they need the same rule to get the same line:
//   .prspacer td{border-top:2px solid var(--line);}
//
// A PENALTY IS NOT AN ERROR - it is the answer. The strip says "Penalty" and
// colours the figure honestly, and the word is a noun: nothing here says Fail,
// nothing raises a blocking state, and every rail warning payWarnings()
// produces is kind "warn" - the same footing Polish, Consensus, TSR and the
// Four Points extrapolation sit on in DesignBook. The lot is finished and
// correct; it just costs money.

import { MCL } from './pay.mjs';

const CALL_MCL = 'Call MCL';                 // Cores!J14 etc - the lane-density spelling

// ---------------------------------------------------------------------------
// Escaping and formatting
// ---------------------------------------------------------------------------

// Byte-identical to designbook.html's esc(). Kept here so this module is safe
// on its own; a caller that already has one passes it in.
export function escapeHTML(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isMCL = (v) => v === MCL || v === CALL_MCL;
const blank = (v) => v === null || v === undefined || v === '';

// Excel carries 15 significant digits and pay.mjs tidies to the same, so a pay
// value is a clean decimal like 97.9375 - print it whole rather than rounding
// it. A weighted sum of five two-decimal values can run to four or five
// decimal places and every one of them is money on a 4,000 ton lot, so this
// trims trailing zeros rather than fixing a decimal count.
function trim(v, dp = 6) {
  if (!isNum(v)) return '';
  const s = Number(v.toPrecision(12)).toFixed(dp);
  return s.replace(/\.?0+$/, '') || '0';
}

function group(s) {
  const [i, f] = String(s).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}

// The sign is a plain ASCII hyphen, not a typographic minus. A contractor
// copies this figure into an email to their project manager and a U+2212 does
// not survive that trip intact everywhere it goes; it also would not match a
// search for "-4,125" in the file the Department is looking at.
function sign(v) { return v > 0 ? '+' : v < 0 ? '-' : ''; }

export function fmtPct(v) { return isNum(v) ? trim(v) + '%' : '—'; }

export function fmtTons(v, { signed = true } = {}) {
  if (!isNum(v)) return '—';
  return (signed ? sign(v) : '') + group(Math.abs(v).toFixed(2)) + ' tons';
}

export function fmtMoney(v, { signed = true } = {}) {
  if (!isNum(v)) return '—';
  return (signed ? sign(v) : '') + '$' + group(Math.abs(v).toFixed(2));
}

// A pay value as it should read: a number, the MCL state, or a dash. MCL is
// rendered as itself - not as 0, not as a blank, not as an error - because
// that is what it means: the lot has left the pay schedule.
function payCell(v, esc) {
  if (isMCL(v)) return `<span class="paymcl">${esc(v)}</span>`;
  if (blank(v)) return '<span class="prsub">—</span>';
  return isNum(v) ? esc(trim(v)) : esc(String(v));
}

// ---------------------------------------------------------------------------
// The five properties, in the order 'Pay Values' lists them
// ---------------------------------------------------------------------------

const PROPERTIES = [
  { key: 'jointDensity', label: 'Joint core density', cell: "'Pay Values'!B21" },
  { key: 'laneDensity', label: 'Lane core density', cell: "'Pay Values'!B22" },
  { key: 'ac', label: '% AC', cell: "'Pay Values'!D17" },
  { key: 'av', label: '% Air voids', cell: "'Pay Values'!G17" },
  { key: 'vma', label: '% VMA', cell: "'Pay Values'!K17" },
];

const ACCEPTANCE = { 1: 'Gradation acceptance', 2: 'Volumetric acceptance', 3: 'Visual acceptance' };

// ---------------------------------------------------------------------------
// The 0.90 sublot floor - 2026 Std Spec 402.03.02 (STD PDF p.179, footer
// 402-4 for H) 1); p.177, footer 402-2 for the setup clause)
// ---------------------------------------------------------------------------
//
//  H) 1) Based on Lab Data: "After the setup period, when the Contractor or
//  Department determines any individual sublot pay value would be below 0.90
//  for AC, AV, or VMA in any QC or QA test, adjust as necessary and
//  immediately perform the tests again. If the second round of tests
//  determines any individual sublot pay value would have been below 0.90 for
//  AC, AV, or VMA, CEASE ALL SHIPMENTS to the project..."
//
//  This is a stop-work obligation wearing the clothes of a deduction, which
//  is exactly why it is worth saying: the readout's job is the money, and
//  everything else on this page treats a low pay value as a finished, correct
//  answer. It is still kind "warn" - the page does not know whether a second
//  round was run, and only the second round ceases shipments.
//
//  THREE PROPERTIES, NOT FIVE. The clause names AC, AV and VMA; neither
//  density is in it. Do not widen this to `PROPERTIES`.
//
//  AND IT IS PER SUBLOT, NOT PER LOT. `byProperty` holds the lot AVERAGE,
//  which is what pays; a single sublot at 75 inside a lot averaging 94 is
//  invisible there and is precisely what this clause is about.
//
//  ON THE SCALE THIS FILE USES, "0.90" IS 90. The ladders run 1.05/1.00/
//  0.95/0.90/0.75 in the spec and 105/100/95/90/75 here.
//
//  WHAT ACTUALLY TRIPS IT, worth knowing before assuming it is noisy: the only
//  numeric value any of the three ladders can produce below 90 is the air-void
//  75 band (6.1-6.5%, AADTT Class 2 only). Everything else that gets here is
//  MCL - the sheet's `(1)` footnote rows, which sit BELOW the lowest listed pay
//  value by construction of the table, so an MCL property is under the floor
//  too. MCL is already reported as a pay state; this says the other half of
//  what it means.
const SUBLOT_PAY_FLOOR = 90;
const FLOOR_PROPERTIES = [
  { key: 'ac', label: '% AC' },
  { key: 'av', label: '% Air voids' },
  { key: 'vma', label: '% VMA' },
];

// The flags in force, as a sentence. Everything a technician set on the Pay
// Values sheet that moved a weight, so the weights in the table below are
// never a number nobody can account for.
function flagsSentence(result, ctx) {
  const bits = [];
  if (ctx.lotNumber != null) bits.push(`Lot ${ctx.lotNumber}`);
  const n = (result.perSublot || []).length;
  if (n) bits.push(`${n} sublot${n === 1 ? '' : 's'}`);
  const acc = ACCEPTANCE[Number(ctx.acceptanceOption)];
  if (acc) bits.push(acc);
  if (ctx.jointDensityFlag != null) {
    bits.push(Number(ctx.jointDensityFlag) === 1 ? 'joint density counts' : 'joint density does not count');
  }
  if (ctx.densityOption != null) bits.push(`density option ${Number(ctx.densityOption) === 2 ? 'B' : 'A'}`);
  if (ctx.esalClass != null) bits.push(`AADTT Class ${ctx.esalClass}`);
  return bits.join(' · ');
}

// ---------------------------------------------------------------------------
// The headline - pure, so the same decision drives the strip, the cards and
// the rail warnings rather than three functions reaching their own verdict.
// ---------------------------------------------------------------------------
//
// States are the four .prverdict already has:
//   ok    a bonus                       (--ok)
//   bad   a penalty                     (--bad) - honest, and still not an error
//   warn  MCL, off the pay schedule     (--flag)
//   none  nothing to pay on yet, or exactly 100%  (--muted)
export function payHeadline(result, ctx = {}) {
  const by = result.byProperty || {};
  const mclProps = PROPERTIES.filter((p) => by[p.key] && isMCL(by[p.key].value));
  const pct = result.finalPct;
  const tons = result.tonnageAdj;
  const money = result.dollarAdj;
  const sub = flagsSentence(result, ctx);

  if (mclProps.length) {
    return {
      state: 'warn', word: 'MCL', mcl: true, pct, tons, money, sub,
      why: `${mclProps.map((p) => p.label).join(' and ')} came back MCL, so this lot leaves the pay `
        + `schedule altogether. There is no final pay value to compute - what the lot is paid is a `
        + `conversation with the Department.`,
    };
  }
  if (Number(ctx.acceptanceOption) === 1) {
    return {
      state: 'none', word: 'Gradation', mcl: false, pct, tons, money, sub,
      why: `This lot is accepted on gradation, whose pay schedule is a second one over the sieve and `
        + `AC deviations ('Pay Values'!E41). It is not computed here.`,
    };
  }
  if (!isNum(pct)) {
    const w = result.weights || {};
    const waiting = PROPERTIES.filter((p) => (w[p.key] || 0) > 0 && blank(by[p.key] && by[p.key].value));
    const n = (result.perSublot || []).length;
    return {
      state: 'none', word: '—', mcl: false, pct, tons, money, sub,
      why: n === 0
        ? 'Nothing has been tested on this lot yet, so it has no pay value. That is not a 0% and not a 100%.'
        : waiting.length
          ? `${waiting.map((p) => p.label).join(', ')} ${waiting.length === 1 ? 'has' : 'have'} no result `
            + `yet, and ${waiting.length === 1 ? 'it carries' : 'they carry'} weight, so there is no final `
            + `pay value yet.`
          : 'No final pay value yet.',
    };
  }
  if (pct > 100) {
    return {
      state: 'ok', word: 'Bonus', mcl: false, pct, tons, money, sub,
      why: `This lot pays ${fmtPct(pct)} of the bid price`
        + (isNum(tons) ? ` - ${fmtTons(tons, { signed: false })} added` : '')
        + (isNum(money) ? ` at ${fmtMoney(ctx.unitPrice, { signed: false })} a ton, worth ${fmtMoney(money, { signed: false })}.` : '.'),
    };
  }
  if (pct === 100) {
    return {
      state: 'none', word: 'Paid in full', mcl: false, pct, tons, money, sub,
      why: 'Every property paid at 100%, so there is no adjustment either way.',
    };
  }
  return {
    state: 'bad', word: 'Penalty', mcl: false, pct, tons, money, sub,
    why: `This lot pays ${fmtPct(pct)} of the bid price`
      + (isNum(tons) ? ` - ${fmtTons(tons, { signed: false })} deducted` : '')
      + (isNum(money) ? ` at ${fmtMoney(ctx.unitPrice, { signed: false })} a ton, worth ${fmtMoney(money, { signed: false })}.` : '.'),
  };
}

// ---------------------------------------------------------------------------
// The blocks
// ---------------------------------------------------------------------------

function headlineHTML(h, esc) {
  const card = (label, value, hero) =>
    `<div class="fp-card${hero ? ' hero' : ''}">
       <div class="l">${esc(label)}</div>
       <div class="v mono">${esc(value)}</div>
     </div>`;
  // The pay adjustment is the hero: it is the figure a contractor is looking
  // for and the one the Department writes on the estimate. The other two are
  // the road to it, and all three sit together because a percentage on its own
  // does not tell anyone what it cost.
  return `<div class="prverdict ${h.state}">
      <div class="rvalue">${esc(h.word)}</div>
      <div class="rsub">${esc(h.sub)}</div>
    </div>
    <div class="paygrid">
      ${card('Final pay value', h.mcl && !isNum(h.pct) ? 'MCL' : fmtPct(h.pct))}
      ${card('Tonnage adjustment', fmtTons(h.tons))}
      ${card('Pay adjustment', fmtMoney(h.money), true)}
    </div>
    <div class="prnote">${esc(h.why)}</div>`;
}

// Property | lot value | weight | contribution | what it cost.
// This is the table a contractor disputing a penalty reads: it is the only
// place that says WHICH property took the money, and the contribution column
// is the weighted sum adding up in front of them.
function propertiesHTML(result, esc) {
  const by = result.byProperty || {};
  const w = result.weights || {};
  const rows = PROPERTIES.map((p) => {
    const value = by[p.key] ? by[p.key].value : null;
    const weight = (by[p.key] ? by[p.key].weight : w[p.key]) || 0;
    const live = weight > 0;
    // 'Pay Values'!B21 goes blank rather than zero when joint density does not
    // count, and Calculations!A71 drops the term instead of adding a zero.
    // Saying "not in force" is the honest reading of a blank weight - the
    // property was not measured against, rather than measured and paid 0.
    const contribution = live && isNum(value) ? (value * weight) / 100 : null;
    const delta = live && isNum(value) ? ((value - 100) * weight) / 100 : null;
    let note = '';
    if (!live) note = 'not in force on this lot';
    else if (isMCL(value)) note = 'off the pay schedule';
    else if (blank(value)) note = 'no result yet';
    else if (delta != null && Math.abs(delta) > 1e-9) {
      note = `${delta < 0 ? 'costs' : 'adds'} ${trim(Math.abs(delta))}% of the lot`;
    } else note = 'no effect';
    // 'Pay Values'!B21 falls back to 100 when the joint block is empty - an
    // untested joint is not a deduction at all. That is a generous number
    // arrived at by an absence, so it says where it came from rather than
    // sitting in the table looking like a measurement.
    if (p.key === 'jointDensity' && live && value === 100
        && result.jointDetail && blank(result.jointDetail.lot)) {
      note = 'no joint cores — B21 falls back to 100';
    }
    return `<tr>
      <th class="prrowhead">${esc(p.label)}<div class="prsub mono">${esc(p.cell)}</div></th>
      <td class="mono">${payCell(value, esc)}</td>
      <td class="mono">${esc(weight)}%</td>
      <td class="mono">${contribution == null ? '<span class="prsub">—</span>' : esc(trim(contribution))}</td>
      <td><span class="prsub">${esc(note)}</span></td>
    </tr>`;
  }).join('');

  const total = Object.values(w).reduce((a, b) => a + (b || 0), 0);
  const final = result.finalPct;
  const totalRow = `<tr class="prspacer">
      <th class="prrowhead">Final pay value<div class="prsub mono">Calculations!A71</div></th>
      <td class="mono"></td>
      <td class="mono">${esc(total)}%</td>
      <td class="mono"><strong>${isNum(final) ? esc(trim(final)) : payCell(final, esc)}</strong></td>
      <td><span class="prsub">${esc(isNum(final)
        ? 'the five contributions, added'
        : 'no value - see the note above')}</span></td>
    </tr>`;

  return `<div class="prscroll"><table class="prtable">
      <thead><tr>
        <th>Property</th><th>Lot value</th><th>Weight</th><th>Contribution</th><th></th>
      </tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table></div>`;
}

// Per sublot, per property. Pay on top, the measurement that produced it
// underneath, so "which sublot" and "which property" are answered in one read.
function sublotsHTML(result, esc) {
  const per = result.perSublot || [];
  const lane = result.laneDetail ? result.laneDetail.sublots || [] : [];
  const joint = result.jointDetail ? result.jointDetail.sublots || [] : [];
  const lastCore = Math.max(
    lane.reduce((m, v, i) => (blank(v) ? m : i + 1), 0),
    joint.reduce((m, v, i) => (blank(v) ? m : i + 1), 0));
  const n = Math.max(per.length, lastCore);
  if (!n) return `<div class="prempty">No sublot results yet — nothing to pay on.</div>`;

  const showLane = !!result.laneDetail, showJoint = !!result.jointDetail;
  const sub = (t) => (t ? `<div class="prsub mono">${esc(t)}</div>` : '');

  const rows = [];
  for (let i = 0; i < n; i++) {
    const s = per[i];
    const ac = s && s.ac ? s.ac : {};
    const av = s && s.av ? s.av : {};
    const vma = s && s.vma ? s.vma : {};
    const cells = [
      `<td class="mono">${payCell(ac.pay, esc)}${sub(isNum(ac.dev) ? `dev ${sign(ac.dev)}${trim(Math.abs(ac.dev), 3)}` : '')}</td>`,
      `<td class="mono">${payCell(av.pay, esc)}${sub(isNum(av.rounded) ? `${trim(av.rounded)}%` : '')}</td>`,
      `<td class="mono">${payCell(vma.pay, esc)}${sub(isNum(vma.dev) ? `dev ${sign(vma.dev)}${trim(Math.abs(vma.dev), 3)}` : '')}</td>`,
    ];
    if (showLane) cells.push(`<td class="mono">${payCell(lane[i], esc)}</td>`);
    if (showJoint) cells.push(`<td class="mono">${payCell(joint[i], esc)}</td>`);
    // Anything pay.mjs flagged about this sublot - the sublot-1 allowance
    // especially. A number that came out of an oddity has to say so on the
    // line it produced, not only in a list at the bottom.
    const notes = [av.note, vma.note].filter(Boolean);
    rows.push(`<tr>
      <th class="prrowhead">Sublot ${i + 1}${notes.length ? `<div class="prsub">${esc(notes.join(' · '))}</div>` : ''}</th>
      ${cells.join('')}
    </tr>`);
  }

  const by = result.byProperty || {};
  const avg = [
    `<td class="mono">${payCell(by.ac && by.ac.value, esc)}</td>`,
    `<td class="mono">${payCell(by.av && by.av.value, esc)}</td>`,
    `<td class="mono">${payCell(by.vma && by.vma.value, esc)}</td>`,
  ];
  if (showLane) avg.push(`<td class="mono">${payCell(result.laneDetail.lot, esc)}</td>`);
  if (showJoint) avg.push(`<td class="mono">${payCell(result.jointDetail.lot, esc)}</td>`);
  rows.push(`<tr class="prspacer">
      <th class="prrowhead">Lot average<div class="prsub">over the sublots present</div></th>
      ${avg.join('')}
    </tr>`);

  const heads = ['Sublot', '% AC', '% Air voids', '% VMA']
    .concat(showLane ? ['Lane density'] : [], showJoint ? ['Joint density'] : []);
  return `<div class="prscroll"><table class="prtable">
      <thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
}

// Everything pay.mjs said about how it got here. A lot of these are the
// workbook's own quirks reproduced deliberately (the sublot-1 allowance, an
// MCL that Excel's text-beats-number ranking turned into a 100), and a number
// that came from an oddity is worth less than nothing if nobody is told.
function notesHTML(result, esc) {
  const notes = collectNotes(result);
  if (!notes.length) return '';
  return `<ul class="tsrwarn">${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

// One list, used by both the readout and the rail, so the two can never
// disagree about what was worth saying.
export function collectNotes(result) {
  const out = (result.notes || []).slice();
  (result.perSublot || []).forEach((s, i) => {
    ['av', 'vma'].forEach((k) => {
      if (s && s[k] && s[k].note) out.push(`Sublot ${i + 1}: ${s[k].note}`);
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The readout
// ---------------------------------------------------------------------------
//
//   payViewHTML(lotPay({...}), { esc, lotNumber, unitPrice, esalClass, ... })
//
// `ctx` carries only what lotPay's return does NOT - the flags and the unit
// price, for the sentence and the cards. All of it is optional: a readout with
// no context still renders, it just says less about why the weights are what
// they are.
export function payViewHTML(result, ctx = {}) {
  if (!result) return `<div class="prempty">No lot to pay on yet.</div>`;
  const esc = ctx.esc || escapeHTML;
  const h = payHeadline(result, ctx);
  const tons = isNum(result.payTons)
    ? `<div class="prsub mono">Pay tonnage ${esc(fmtTons(result.payTons, { signed: false }))}`
      + (isNum(ctx.unitPrice) ? ` at ${esc(fmtMoney(ctx.unitPrice, { signed: false }))} a ton` : '')
      + (isNum(ctx.wedgeTons) && ctx.wedgeTons > 0
        ? ` · ${esc(fmtTons(ctx.wedgeTons, { signed: false }))} of pavement wedge taken off the top`
        : '')
      + `</div>` : '';

  return `<div class="payreadout">
    ${headlineHTML(h, esc)}
    <div class="rowgroup-head">How the lot pay was arrived at</div>
    ${propertiesHTML(result, esc)}
    ${tons}
    <div class="rowgroup-head">Per sublot</div>
    ${sublotsHTML(result, esc)}
    ${notesHTML(result, esc)}
    <div class="computed-note">Read-only — computed from the sublot results and the cores.
      Final pay value is 'Pay Values'!J21, the tonnage adjustment J23 and the pay adjustment J24.</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// The layered readout - click a line for why, click again for the figures
// ---------------------------------------------------------------------------
//
// Jake, 2026-09-15: "I would like it to be where you can click on each part
// and it shows why the pay value is what it is and then one click further
// beyond that and it shows exactly what numbers went into it."
//
// Three layers, on native <details> so the disclosure needs no script and a
// keyboard reaches it:
//   1. the line     property | lot value | weight | contribution
//   2. why          per sublot: measured → rounded → the schedule band it
//                   landed on → pay, then how the sublots average to the lot
//                   value and what it contributes to the final pay
//   3. the figures  the weighings and the formula each measured value came
//                   from, cell by cell
// Layers 1 and 2 come from lotPay()'s own return - the `rule`, `bands` and
// `cores` pay.mjs carries - so nothing here re-derives a band; the readout
// that says "93.4 → 92.0-93.9 → 100" reads the same table that paid it.
// Layer 3 needs the raw weights, which lotPay() never sees: the page passes
// them as `ctx.trace` (lotPayTrace() in designbook.html). Without a trace a
// sublot line is a plain row and the third layer simply is not offered.
//
// `ctx.open` is the list of data-key values to render open. The page
// re-renders this on every keystroke anywhere in the lot, and a readout that
// folded every panel a person had opened would be unusable.

// A pay value as a pill, coloured by which way it moved the money: green
// above 100, red below, neutral at 100, gold for MCL. Same states the
// verdict strip uses, so a 95 in a sublot row and a Penalty at the top
// read as the same fact.
function payBadge(v, esc) {
  if (isMCL(v)) return `<span class="paypill mcl">${esc(v)}</span>`;
  if (blank(v)) return '<span class="prsub">—</span>';
  const cls = isNum(v) ? (v > 100 ? ' up' : v < 100 ? ' down' : ' even') : '';
  return `<span class="paypill${cls}">${esc(isNum(v) ? trim(v) : String(v))}</span>`;
}

const fx = (v, dp) => (isNum(v) ? Number(v).toFixed(dp) : '—');   // fixed decimals: weighings and gravities
const sg = (v, dp) => (isNum(v) ? sign(v) + Math.abs(v).toFixed(dp) : '—');   // signed deviation

function detailsHTML(key, open, cls, summary, body) {
  return `<details class="payx-d${cls ? ' ' + cls : ''}" data-key="${key}"${open.has(key) ? ' open' : ''}>`
    + `<summary>${summary}</summary><div class="payx-body">${body}</div></details>`;
}

// One line of working: a name, the expression, and the cell it lives in.
/* One line of working.
 *
 * `cell` is the workbook address this line corresponds to. It used to print as
 * a third column and no longer does (Jake, 2026-09-17: "lets get rid of the
 * grey letters that say superpave f and g or what not") - it rides in the
 * row's `title` instead. Same move, and the same reasoning, as the `.srcnote`
 * line that became a prefilled input's tooltip: the detail is worth keeping
 * and is not worth a column.
 *
 * `goto` is the form control this line was MEASURED on, as
 * "<section>|<row table>|<row>", where <row> is either an index within that
 * section's own slice of the table or `#<identity>` to match a cell's value.
 * Only lines that HAVE an input get one - an average, a deviation or a lot
 * roll-up is computed from the lines above it and has nowhere to send you.
 */
const src = (n, table, row) =>
  (Number.isFinite(Number(n)) && table && row !== '' && row != null) ? `sublot-${n}|${table}|${row}` : '';

// `rawName` is a narrow, explicit opt-in: `name` is escaped by default because
// several call sites pass real dynamic content (a typed core id, a loop
// index) that must never reach innerHTML unescaped - the sieve-value XSS
// this codebase already learned from once. Pass `rawName: true` ONLY when
// `name` is a hardcoded string literal at the call site (e.g. 'G<sub>mm</sub>'),
// never when it is built from a variable.
function eqHTML(esc, name, expr, cell, cls = '', goto = '', rawName = false) {
  const cl = 'payx-eq' + (cls ? ' ' + cls : '') + (goto ? ' payx-goto' : '');
  return `<div class="${cl}"${cell ? ` title="${esc(cell)}"` : ''}`
    + (goto ? ` data-goto="${esc(goto)}" role="button" tabindex="0"` : '') + '>'
    + `<span class="k">${rawName ? name : esc(name)}</span>`
    + `<span class="e mono">${esc(expr)}</span></div>`;
}

// ---- layer 3: the figures behind one sublot's measured value ---------------

function gmbFigures(esc, t, n) {
  if (!t) return '';
  const lines = [eqHTML(esc, 'Gmb', `${fx(t.gmb, 3)} - bulk specific gravity, the average of the specimens`, 'Superpave G, Average row')];
  (t.specimens || []).forEach((s, k) => {
    lines.push(eqHTML(esc, `specimen ${k + 1}`,
      `${fx(s.air, 1)} g in air ÷ (${fx(s.ssd, 1)} SSD − ${fx(s.water, 1)} in water = ${fx(s.volume, 1)}) = ${fx(s.bsg, 3)}`,
      'Superpave F, G', 'sub', src(n, 'sublot_bsg', k)));
  });
  return lines.join('');
}
function gmmFigures(esc, t, n) {
  if (!t) return '';
  const lines = [eqHTML(esc, 'G<sub>mm</sub>', `${fx(t.gmm, 3)} - maximum specific gravity (Rice), the average of the bowls`, 'Superpave row 42', '', '', true)];
  (t.dets || []).forEach((d, k) => {
    lines.push(eqHTML(esc, `bowl ${k + 1}`,
      `${fx(d.mix, 1)} g mix ÷ (${fx(d.mix, 1)} + ${fx(d.calibration, 1)} calibration − ${fx(d.finalWeight, 1)} final + ${fx(d.absorbedWater ?? 0, 1)} absorbed) = ${fx(d.msg, 3)}`,
      'Superpave row 41', 'sub', src(n, 'sublot_msg', k)));
  });
  return lines.join('');
}
function acFigures(esc, t, hm, s, n) {
  if (!t) return '';
  const out = [];
  if (hm) {
    // The hand-mixed check sample is the LOT's, and it lives on Sublot 1's tab.
    out.push(eqHTML(esc, 'G<sub>se</sub>', `${fx(hm.gse, 3)} - effective aggregate gravity, from the hand-mixed check sample`,
      'Superpave!J8', '', src(1, 'handmix_msg', 0), true));
    out.push(eqHTML(esc, '', `(100 − ${fx(hm.binderPct, 2)} hand-mixed %AC) ÷ (100 ÷ ${fx(hm.gmm, 3)} hand-mixed Gmm - ${fx(hm.binderPct, 2)} ÷ 1.03) = ${fx(hm.gse, 3)}`, '', 'sub'));
  }
  out.push(gmmFigures(esc, t, n));
  out.push(eqHTML(esc, 'back-calculated %AC',
    `1.03 × (${fx(t.gse, 3)} − ${fx(t.gmm, 3)}) ÷ (${fx(t.gmm, 3)} × (${fx(t.gse, 3)} − 1.03)) × 100 = ${fx(t.backCalc, 2)}`, 'Gradation!D34'));
  if (t.moisture && isNum(t.moisture.pct)) {
    const m = t.moisture;
    out.push(eqHTML(esc, 'moisture',
      `((${fx(m.before, 1)} − ${fx(m.pan, 1)}) − (${fx(m.after, 1)} − ${fx(m.pan, 1)})) ÷ (${fx(m.before, 1)} − ${fx(m.pan, 1)}) × 100 = ${fx(m.pct, 2)}%`,
      'Superpave G48', '', src(n, 'sublot_moisture', 0)));
    out.push(eqHTML(esc, '%AC', `${fx(t.backCalc, 2)} − ${fx(m.pct, 2)} = ${fx(t.binderPct, 2)}`, "Gradation!D33 → Superpave!B14"));
  } else {
    out.push(eqHTML(esc, '%AC', `${fx(t.binderPct, 2)} - no moisture entered, so nothing is taken off`, 'Superpave!B14'));
  }
  out.push(eqHTML(esc, 'deviation', `${fx(t.binderPct, 2)} − ${fx(s.jmfAC, 2)} JMF = ${sg(isNum(t.binderPct) && isNum(s.jmfAC) ? t.binderPct - s.jmfAC : null, 2)}`, "'Pay Values'!C13"));
  return out.join('');
}
function avFigures(esc, t, n) {
  if (!t) return '';
  return gmbFigures(esc, t, n) + gmmFigures(esc, t, n)
    + eqHTML(esc, 'air voids', `(${fx(t.gmm, 3)} − ${fx(t.gmb, 3)}) ÷ ${fx(t.gmm, 3)} × 100 = ${fx(t.va, 2)}%`, "Superpave J → 'Pay Values'!F13");
}
function vmaFigures(esc, t, s, n) {
  if (!t) return '';
  return gmbFigures(esc, t, n)
    + eqHTML(esc, '%AC', `${fx(t.binderPct, 2)} - back-calculated, see the % AC line`, 'Superpave!B14')
    + eqHTML(esc, 'G<sub>sb</sub>', `${fx(t.gsb, 3)} - combined aggregate gravity for this sublot, from the blend`, 'Superpave R9:U9', '', '', true)
    + eqHTML(esc, 'VMA', `100 − ${fx(t.gmb, 3)} × (100 − ${fx(t.binderPct, 2)}) ÷ ${fx(t.gsb, 3)} = ${fx(t.vma, 2)}%`, "Superpave M → 'Pay Values'!I13")
    + eqHTML(esc, 'deviation', `${fx(t.vma, 2)} − ${fx(s.minVMA, 2)} minimum = ${sg(isNum(t.vma) && isNum(s.minVMA) ? t.vma - s.minVMA : null, 2)}`, "'Pay Values'!J13");
}
function coreFigures(esc, c, n, table, id) {
  if (!c) return '';
  // A core is found by its ID, never by its position: the trace carries only
  // the cores that HAVE a % solid, in table order, so index k here is not
  // index k in the table the moment one core was labelled and never measured
  // (which is exactly what lot 1 of the two real AMAWs does).
  const to = id ? src(n, table, '#' + id) : '';
  return eqHTML(esc, 'BSG', `${fx(c.air, 1)} g in air ÷ (${fx(c.ssd, 1)} SSD − ${fx(c.water, 1)} in water) = ${fx(c.bsg, 3)}`, 'Cores G', 'sub', to)
    + eqHTML(esc, 'unit weight', `${fx(c.bsg, 3)} × 62.4 = ${fx(c.density, 1)} pcf`, 'Cores H', 'sub')
    + eqHTML(esc, '% solid', `${fx(c.density, 1)} ÷ (${fx(c.msg, 3)} sublot Gmm × 62.4) × 100 = ${fx(c.pctSolid, 2)}%`, 'Cores I', 'sub');
}

// ---- layer 2: why a property's lot value is what it is --------------------

const SUB_HEAD = ['Sublot', 'Measured', 'Rounded', 'Schedule band', 'Pay'];

function subGrid(esc, cells, cls = '') {
  return `<div class="payx-row${cls ? ' ' + cls : ''}">${cells.map((c, i) => `<span class="payx-x${i}">${c}</span>`).join('')}</div>`;
}

// The band that fired, as the schedule reads it, plus the allowance when the
// workbook overrode it (the "*For Sublot # 1 Only" column).
function bandText(esc, r, kind) {
  if (!r) return '';
  const chip = (band, formula) => `<span class="payband">${esc(band)}</span>`
    + (formula ? `<span class="payformula">→ ${esc(formula)}</span>` : '');
  let s = '';
  if (kind === 'av') {
    const b = r.bands || [];
    s = b.length ? b.map((x) => chip(x.band, x.formula)).join(' + ') : '<span class="prsub">—</span>';
  } else {
    s = r.rule ? chip(r.rule.band) : '<span class="prsub">—</span>';
  }
  if (r.allowance) s += `<span class="payallow">sublot-1 allowance: ${esc(isMCL(r.allowance.from) ? r.allowance.from : trim(r.allowance.from))} → 100</span>`;
  return s;
}

function volumetricWhy(p, result, ctx, esc, open) {
  const per = result.perSublot || [];
  const trace = ctx.trace || {};
  const rows = [subGrid(esc, SUB_HEAD.map(esc), 'head')];
  per.forEach((s, i) => {
    const r = s ? s[p.key] : null;
    if (!r) return;
    const inp = (ctx.sublots || [])[i] || {};
    const t = (trace.sublots || [])[i] || null;
    let measured, rounded, figures = '';
    if (p.key === 'ac') {
      measured = isNum(r.dev) ? `${fx(inp.ac, 2)}% (JMF ${fx(inp.jmfAC, 2)}, dev ${sg(r.dev, 2)})` : '—';
      rounded = isNum(r.rounded) ? `|dev| ${fx(r.rounded, 1)}` : '—';
      figures = acFigures(esc, t, trace.handmix, inp, i + 1);
    } else if (p.key === 'av') {
      measured = isNum(inp.av) ? `${fx(inp.av, 2)}%` : '—';
      rounded = isNum(r.rounded) ? fx(r.rounded, 1) : '—';
      figures = avFigures(esc, t, i + 1);
    } else {
      measured = isNum(r.dev) ? `${fx(inp.vma, 2)}% (min ${fx(inp.minVMA, 2)}, dev ${sg(r.dev, 2)})` : '—';
      rounded = isNum(r.rounded) ? sg(r.rounded, 1) : '—';
      figures = vmaFigures(esc, t, inp, i + 1);
    }
    const cells = [esc(`Sublot ${i + 1}`), `<span class="mono">${esc(measured)}</span>`, `<span class="mono">${esc(rounded)}</span>`,
                   bandText(esc, r, p.key), payBadge(r.pay, esc)];
    const note = r.note ? `<div class="payx-note">${esc(r.note)}</div>` : '';
    if (figures) {
      rows.push(detailsHTML(`sub.${p.key}.${i}`, open, 'payx-sub', subGrid(esc, cells), figures + note));
    } else {
      rows.push(subGrid(esc, cells) + note);
    }
  });
  const pays = per.map((s) => (s && s[p.key] ? s[p.key].pay : null)).filter((v) => !blank(v));
  const by = (result.byProperty || {})[p.key] || {};
  let roll;
  if (Number(ctx.acceptanceOption) === 3) roll = 'Visual acceptance: the lot value is 100 whatever the sublots read';
  else if (!pays.length) roll = 'no sublot has a value yet';
  else if (pays.some(isMCL)) roll = `a sublot is ${MCL}, so the lot value is ${MCL} - the lot leaves the pay schedule`;
  else roll = `average(${pays.map((v) => trim(v)).join(', ')}) = ${trim(by.value)}`;
  return rows.join('') + eqHTML(esc, 'lot value', roll, p.cell, 'roll') + contributionEq(esc, by);
}

function contributionEq(esc, by) {
  const v = by ? by.value : null, w = by ? by.weight : 0;
  if (!w) return eqHTML(esc, 'counts for', 'nothing - this property carries no weight on this lot', "'Pay Values'!E20:E24", 'roll');
  if (isMCL(v)) return eqHTML(esc, 'counts for', `${v} × ${w}% - the sheet cannot multiply text, so there is no final pay value`, 'Calculations!A71', 'roll');
  if (!isNum(v)) return eqHTML(esc, 'counts for', `— × ${w}% - no value yet`, 'Calculations!A71', 'roll');
  return eqHTML(esc, 'counts for', `${trim(v)} × ${w}% = ${trim((v * w) / 100)} of the final pay value`, 'Calculations!A71', 'roll');
}

function densityWhy(p, result, ctx, esc, open) {
  const detail = p.key === 'laneDensity' ? result.laneDetail : result.jointDetail;
  const by = (result.byProperty || {})[p.key] || {};
  const label = p.key === 'laneDensity' ? 'lane' : 'joint';
  if (!detail) {
    return eqHTML(esc, 'lot value', isNum(by.value) ? `${trim(by.value)} - supplied as a ready figure, no cores to show` : 'no value', p.cell, 'roll')
      + contributionEq(esc, by);
  }
  const trace = ((ctx.trace || {})[label]) || [];
  const rows = [subGrid(esc, ['Sublot', 'Cores', 'Each core pays', 'How the sublot is arrived at', 'Pay'].map(esc), 'head')];
  (detail.sublots || []).forEach((v, i) => {
    const cores = (detail.cores || [])[i] || [];
    const rule = (detail.rules || [])[i];
    if (blank(v) && !cores.length && !rule) return;
    const each = cores.length ? cores.map((c) => (isMCL(c.pay) ? c.pay : trim(c.pay))).join(', ') : '—';
    const cells = [esc(`Sublot ${i + 1}`), `<span class="mono">${esc(cores.length ? String(cores.length) : '—')}</span>`,
                   `<span class="mono">${esc(each)}</span>`, esc(rule || ''), payBadge(v, esc)];
    if (!cores.length) { rows.push(subGrid(esc, cells)); return; }
    const t = trace[i] || [];
    const body = cores.map((c, k) => {
      const band = c.matched && c.matched.length
        ? c.matched.map((m) => `${fx(m.lo, 1)} - ${m.hi >= 200 ? 'up' : fx(m.hi, 1)} (row ${m.row}) → ${m.factor}`).join(' + ')
        : (c.note || 'no band matched → MCL');
      const tc = t[k] || null;
      const id = tc && tc.id ? tc.id : `core ${k + 1}`;
      const table = label === 'lane' ? 'mat_cores' : 'joint_cores';
      const to = tc && tc.id ? src(i + 1, table, '#' + tc.id) : '';
      return eqHTML(esc, id, `${tc ? fx(tc.pctSolid, 2) : fx(c.rounded, 1)}% solid → rounded ${fx(c.rounded, 1)} → ${band} = ${isMCL(c.pay) ? c.pay : trim(c.pay)}`,
        `Calculations row ${label === 'lane' ? '22' : '56'}`, '', to)
        + coreFigures(esc, tc, i + 1, table, tc && tc.id);
    }).join('');
    rows.push(detailsHTML(`core.${p.key}.${i}`, open, 'payx-sub', subGrid(esc, cells), body));
  });
  let roll = detail.lotRule || '';
  const present = (detail.sublots || []).filter((v) => !blank(v));
  if (present.length && !present.some(isMCL) && isNum(detail.lot)) roll = `average(${present.map((v) => trim(v)).join(', ')}) = ${trim(detail.lot)} - ${roll}`;
  if (p.key === 'jointDensity' && blank(detail.lot) && by.value === 100 && by.weight > 0) {
    roll = "no joint cores anywhere on the lot, so 'Pay Values'!B21 falls back to 100 - an untested joint is not a deduction";
  }
  return rows.join('') + eqHTML(esc, 'lot value', roll, p.cell, 'roll') + contributionEq(esc, by);
}

// ---- layer 1: the lines -----------------------------------------------------

function propertyLine(p, result, esc) {
  const by = (result.byProperty || {})[p.key] || {};
  const w = (result.weights || {})[p.key] || 0;
  const value = by.value, weight = by.weight ?? w;
  const live = weight > 0;
  const contribution = live && isNum(value) ? (value * weight) / 100 : null;
  const delta = live && isNum(value) ? ((value - 100) * weight) / 100 : null;
  let note = '';
  if (!live) note = 'not in force on this lot';
  else if (isMCL(value)) note = 'off the pay schedule';
  else if (blank(value)) note = 'no result yet';
  else if (delta != null && Math.abs(delta) > 1e-9) note = `${delta < 0 ? 'costs' : 'adds'} ${trim(Math.abs(delta))}% of the lot`;
  else note = 'no effect';
  return `<span class="payx-l">${esc(p.label)}</span>`
    + `<span class="payx-v">${payBadge(value, esc)}</span>`
    + `<span class="payx-w mono">${esc(`×${weight}%`)}</span>`
    + `<span class="payx-c mono">${contribution == null ? '<span class="prsub">—</span>' : esc(trim(contribution))}</span>`
    + `<span class="payx-n">${esc(note)}</span>`;
}

function finalLines(result, ctx, esc, open) {
  const by = result.byProperty || {};
  const terms = PROPERTIES.filter((p) => by[p.key] && !(p.key === 'jointDensity' && blank(by[p.key].value)));
  const sum = terms.map((p) => {
    const t = by[p.key];
    const v = isMCL(t.value) ? t.value : blank(t.value) ? '—' : trim(t.value);
    return `${v} × ${t.weight}%`;
  }).join(' + ');
  const final = result.finalPct;
  let body = eqHTML(esc, 'final pay value', `${sum} = ${isNum(final) ? trim(final) : '—'}`, "Calculations!A71 → 'Pay Values'!J21");
  if (Number(ctx.acceptanceOption) === 3) body = eqHTML(esc, 'final pay value', '100 - Visual acceptance pays 100 whatever the properties read', "'Pay Values'!J21");
  if (!isNum(final)) (result.notes || []).forEach((n) => { body += `<div class="payx-note">${esc(n)}</div>`; });
  if (isNum(final) && final > 100) {
    body += eqHTML(esc, 'capped', `${trim(result.finalPctCapped)} - Calculations!A72 caps at 100 and the sheet prints "***Final Pay should be made at 100% Maximum"; J23/J24 multiply by the UNCAPPED figure`, 'Calculations!A72');
  }
  const line1 = `<span class="payx-l">Final pay value</span>`
    + `<span class="payx-v">${payBadge(final, esc)}</span>`
    + `<span class="payx-w mono">${esc(`×${Object.values(result.weights || {}).reduce((a, b) => a + (b || 0), 0)}%`)}</span>`
    + `<span class="payx-c mono"></span><span class="payx-n">${esc(isNum(final) ? 'the five contributions, added' : 'no value - open for why')}</span>`;
  const out = [detailsHTML('final', open, 'payx-prop total', line1, body)];

  const net = result.payTons, tons = result.tonnageAdj, money = result.dollarAdj;
  const wedge = isNum(ctx.wedgeTons) ? ctx.wedgeTons : 0;
  const tonsBody = eqHTML(esc, 'tonnage adjustment',
    isNum(tons) ? `(${trim(final)} − 100) × (${fx(ctx.tonnage, 2)} tons - ${fx(wedge, 2)} wedge = ${fx(net, 2)}) ÷ 100 = ${sg(tons, 2)} tons`
                : 'no final pay value, so no adjustment', "'Pay Values'!J23")
    + (wedge > 0 ? eqHTML(esc, 'wedge', `${fx(wedge, 2)} tons of pavement wedge come off the top - wedge is paid at its own rate`, "'Pay Values'!J20") : '');
  out.push(detailsHTML('tons', open, 'payx-prop total',
    `<span class="payx-l">Tonnage adjustment</span>`
    + `<span class="payx-v mono">${esc(fmtTons(tons))}</span><span class="payx-w mono"></span><span class="payx-c mono"></span>`
    + `<span class="payx-n">${esc(isNum(tons) ? `(final - 100) × ${fx(net, 2)} pay tons ÷ 100` : 'no value yet')}</span>`, tonsBody));

  const moneyBody = eqHTML(esc, 'pay adjustment',
    isNum(money) ? `${sg(tons, 2)} tons × ${fmtMoney(ctx.unitPrice, { signed: false })} = ${fmtMoney(money)}` : 'no tonnage adjustment, so no dollar figure', "'Pay Values'!J24")
    + eqHTML(esc, 'unit price', `${fmtMoney(ctx.unitPrice, { signed: false })} a ton is the spec's defined unit price for the Lot Pay Adjustment (402.05.02), the same for every mix - not the contract's bid price`, "'Pay Values'!F5");
  out.push(detailsHTML('money', open, 'payx-prop total hero',
    `<span class="payx-l">Pay adjustment</span>`
    + `<span class="payx-v mono"><strong>${esc(fmtMoney(money))}</strong></span><span class="payx-w mono"></span><span class="payx-c mono"></span>`
    + `<span class="payx-n">${esc(isNum(money) ? `tons × ${fmtMoney(ctx.unitPrice, { signed: false })}` : 'no value yet')}</span>`, moneyBody));
  return out.join('');
}

// ---- the readout -------------------------------------------------------------
//
//   payExplainHTML(lotPay(inputs), { esc, open, trace, ...inputs })
//
// `ctx` carries lotPay's own inputs (sublots, flags, tonnage, unitPrice,
// wedgeTons - the same object works) plus `trace` and `open`. Everything is
// optional; less context means fewer figures, never a wrong one.
export function payExplainHTML(result, ctx = {}) {
  if (!result) return `<div class="prempty">No lot to pay on yet.</div>`;
  const esc = ctx.esc || escapeHTML;
  const open = new Set(ctx.open || []);
  const h = payHeadline(result, ctx);
  const lines = PROPERTIES.map((p) => {
    const why = (p.key === 'laneDensity' || p.key === 'jointDensity')
      ? densityWhy(p, result, ctx, esc, open)
      : volumetricWhy(p, result, ctx, esc, open);
    return detailsHTML(`prop.${p.key}`, open, 'payx-prop', propertyLine(p, result, esc), why);
  }).join('');
  return `<div class="payreadout payx">
    ${headlineHTML(h, esc)}
    <div class="rowgroup-head">How the lot pay was arrived at <span class="payx-hint">click a line for why, and a sublot for the figures behind it</span></div>
    <div class="payx-list">
      <div class="payx-cols"><span class="payx-l">Property</span><span class="payx-v">Lot value</span><span class="payx-w">Weight</span><span class="payx-c">Counts</span><span class="payx-n"></span></div>
      ${lines}
      ${finalLines(result, ctx, esc, open)}
    </div>
    ${notesHTML(result, esc)}
    <div class="computed-note">Read-only — computed from the sublot results and the cores.
      Final pay value is 'Pay Values'!J21, the tonnage adjustment J23 and the pay adjustment J24.</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Rail warnings
// ---------------------------------------------------------------------------
//
// The page's `outstanding` shape: { id, label, kind, text }. EVERY item here
// is kind "warn" - non-blocking, the same footing Polish, Consensus, TSR and
// the Four Points extrapolation sit on in DesignBook. A penalty is a finished,
// correct answer; flagging it as an error would be telling a contractor their
// lot is broken when it is simply going to be paid less.
export function payWarnings(result, ctx = {}) {
  if (!result) return [];
  const id = ctx.id || 'pay';
  const label = ctx.label || 'Lot Pay';
  const w = (text) => ({ id, label, kind: 'warn', text });
  const out = [];
  const h = payHeadline(result, ctx);

  if (h.mcl) {
    out.push(w(`${h.why} The rest of this readout still shows every sublot's result, `
      + `which is what the Department will want to see. What MCL means on the ground `
      + `(402.05.02's own footnotes, STD pp.187-189): the Department decides whether the material `
      + `is removed and replaced at no expense to it, or stays in place at a 0.65 pay factor on the `
      + `Contract unit BID price - not the $50 - for the tonnage the failing test represents, one `
      + `sublot for an acceptance test. A removal runs from halfway to the preceding acceptable `
      + `test to halfway to the succeeding one, and the Engineer may widen or narrow it.`));
  } else if (h.state === 'bad') {
    out.push(w(`Lot pay is ${fmtPct(result.finalPct)}: a penalty of `
      + `${fmtTons(result.tonnageAdj, { signed: false })}`
      + (isNum(result.dollarAdj) ? `, worth ${fmtMoney(result.dollarAdj, { signed: false })}` : '')
      + `. A computed penalty is an answer, not a mistake - the property table shows which one cost it.`));
  } else if (h.state === 'ok') {
    // Calculations!A72 caps at 100 and the sheet does not use it; 'Pay
    // Values'!G26 prints the cap as an instruction to the person paying
    // instead. Both real lots were paid uncapped. Worth saying once, out
    // loud, rather than leaving a contractor to be surprised by an estimate.
    out.push(w(`Lot pay is ${fmtPct(result.finalPct)}: a bonus of `
      + `${fmtTons(result.tonnageAdj, { signed: false })}`
      + (isNum(result.dollarAdj) ? `, worth ${fmtMoney(result.dollarAdj, { signed: false })}` : '')
      + `. The workbook also computes a capped ${fmtPct(result.finalPctCapped)} and prints `
      + `"***Final Pay should be made at 100% Maximum" beside it; the adjustment above is the `
      + `uncapped figure, which is what J23/J24 multiply by.`));
  } else if (!isNum(result.finalPct)) {
    out.push(w(h.why));
  }

  // Any sublot under the 0.90 floor - see SUBLOT_PAY_FLOOR above. Collected
  // into at most two lines rather than one per (sublot, property), because a
  // lot that went wrong goes wrong on several at once and twelve rail entries
  // saying the same thing read as twelve problems.
  const under = { setup: [], normal: [] };
  (result.perSublot || []).forEach((s, i) => {
    // Setup is LOT 1's first sublot, the same gate `isFirstSublot` uses. A
    // lot with no number reads as lot 1 everywhere else on this page, so it
    // reads as lot 1 here; that puts sublot 1 in the setup bucket, which
    // cites the clause that is true of a setup sublot.
    const isSetup = i === 0 && (result.lotNumber === null || result.lotNumber === 1);
    FLOOR_PROPERTIES.forEach((p) => {
      const v = s && s[p.key] ? s[p.key].pay : null;
      const low = isMCL(v) || (isNum(v) && v < SUBLOT_PAY_FLOOR);
      if (low) (isSetup ? under.setup : under.normal)
        .push(`sublot ${i + 1} ${p.label} (${isMCL(v) ? 'MCL' : fmtPct(v)})`);
    });
  });
  if (under.normal.length) {
    out.push(w(`Below a 0.90 pay value: ${under.normal.join(', ')}. `
      + `KYTC 402.03.02 H) 1) makes that a re-test obligation rather than only a deduction - `
      + `adjust and immediately perform the tests again, and if the SECOND round is also below `
      + `0.90 for AC, AV or VMA, cease all shipments to the project until procedures or mixture `
      + `composition are acceptable. This page only has the figures in front of it; whether a `
      + `second round was run is not something it can know.`));
  }
  if (under.setup.length) {
    out.push(w(`Below a 0.90 pay value on the setup sublot: ${under.setup.join(', ')}. `
      + `H) 1) opens "after the setup period", so the clause that applies here is `
      + `KYTC 402.03.02 C): the mixture has to be documented at a 0.90 minimum pay value for `
      + `each of these by the end of the first sublot, and shipments cease until it is. `
      + `Note the sublot-1 allowance has already been applied to the figures above where it fired.`));
  }

  // A property carrying weight with nothing in it - the reason there is no
  // final pay value, named so it is actionable rather than mysterious. Skipped
  // on a lot nobody has tested at all, where the headline has already said so
  // and five identical lines add nothing.
  const by = result.byProperty || {};
  if ((result.perSublot || []).length) {
    PROPERTIES.forEach((p) => {
      const t = by[p.key];
      if (t && t.weight > 0 && blank(t.value) && !isMCL(t.value)) {
        out.push(w(`${p.label} carries ${t.weight}% of this lot's pay and has no value yet (${p.cell}).`));
      }
    });
  }

  // Every quirk pay.mjs reproduced on the way to the number - minus the two
  // lot-level ones the headline above has already explained at length. The
  // readout still prints the full list under the tables; this is the rail,
  // where saying the same thing twice reads as two separate problems.
  const covered = ['a property came back MCL', 'a weighted property has no value yet'];
  collectNotes(result)
    .filter((t) => !covered.some((c) => t.startsWith(c)))
    .forEach((t) => out.push(w(t)));
  return out;
}
