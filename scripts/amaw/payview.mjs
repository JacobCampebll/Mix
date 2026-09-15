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
      + `which is what the Department will want to see.`));
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
