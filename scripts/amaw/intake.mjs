// APPROVAL INTAKE — the front door of PlantBook.
//
// "the start of every plant book will be uploading an approval from design
// book" (Jake, 2026-09-13). This module is that decision, as code.
//
// Two things fall out of it, and they are the two exports here.
//
// INHERITANCE. A DesignBook approval PDF carries the whole design as a JSON
// attachment (`buildApprovalPDF` attaches it, `readHandoffPDF` reads it back,
// both in public/designbook.html). So a lot does not TYPE its contract, its
// plant, its mix, its blend or its combined Gsb — it inherits them. More to
// the point it inherits the numbers lot pay is measured against: pay is a
// deviation from the JMF, and without the JMF there is nothing to deviate
// from. `lotFromApproval()` seeds a storage.mjs lot envelope from a payload
// and reports, field by field, what came across and what a technician is
// still going to have to type.
//
// A GATE. The approval is signed — `netlify/functions/verify-approval` is
// live and public/verify.html already calls it. So the front door can refuse
// to open a lot on a design KYTC never approved, or on one edited after
// approval. `approvalChecks()` is those decisions AS DATA: which document
// this is, what is missing, what to POST to verify-approval, and what each
// failure means. No DOM, no fetch, no messages formatted for a screen — the
// page owns all three.
//
// THE ONE RULE THAT IS NOT NEGOTIABLE. "Verified" and "we did not check" are
// different states and a lot must never confuse them. Every lot this module
// builds carries `values.design.approval.verification`, and it is
// `not-checked` unless a caller hands over a verify-approval response that
// actually came back `{ valid: true }`. There is no default of convenience:
// a page that forgets to verify produces a lot that SAYS it was never
// verified, rather than one that quietly looks fine.
//
// PURE MODULE. No DOM, no I/O, no network. The caller does the fetch; this
// shapes the request and reads the answer.
//
// ---------------------------------------------------------------------
// WHAT THIS WAS BUILT AGAINST
// ---------------------------------------------------------------------
// The lot's shape is not invented here. It comes from four files and from the
// workbook itself:
//   * `sections.mjs` — PlantBook's section schema, which landed while this was
//     being written. It is the authority on FIELD KEYS, and the seeded lot
//     uses its keys rather than a second set of names: a value seeded under a
//     key the form does not have is invisible, which is this codebase's most
//     expensive failure mode. `put()` below checks every key against it and
//     raises `schema-drift` when one goes missing, so a rename there is loud
//     here instead of silent.
//   * `storage.mjs`  — `blankLot()` and the envelope. The lot this returns is
//     one of those, so it saves, loads and round-trips through either
//     backend with nothing added. Note `normaliseLot()` keeps only its own
//     key list, so everything inherited lives INSIDE `values` / `rows` /
//     `extracted_from` rather than as a new top-level key, which would be
//     silently dropped on the first save.
//   * `addresses.mjs` — the AMAW cell for every field, so `report.to` names a
//     real cell rather than a guess.
//   * `pay.mjs`      — what `lotPay()` needs, which is what makes the three
//     inherited numbers the important ones.
//   * `docs/amaw-map.md` and the blank VER 14.01 template, read directly for
//     the two facts below.
//
// TWO FACTS READ OFF THE TEMPLATE, because they decide what is worth
// inheriting at all ('Pay Values' row 13, the first sublot):
//   A13  JMF %AC    — TYPED. Empty in the blank template, no formula.
//   E13  Target %AV — a LOOKUP on the mixture type code; 3.5 for every
//                     Superpave size (Calculations C1:C5 / F1:F14).
//   H13  Min. %VMA  — TYPED. Empty in the blank template, no formula.
//   I13  Sublot %VMA — computed, `Superpave!M14`.
// So two of the three are cells a human fills in today and this fills for
// them; the third the workbook derives for itself and we carry only as a
// cross-check. Do not "simplify" by treating all three the same.

import { blankLot } from './storage.mjs';
import { LOT, AGGREGATE, SUBLOT, VERIFY as AVERIFY, GRADATION, CORES, PAY, CALC } from './addresses.mjs';
import { vmaMinimumFor, airVoidTargetFor } from './pay.mjs';
import PLANTBOOK_SECTIONS from './sections.mjs';

// ---------------------------------------------------------------------
// The schema's own key list
// ---------------------------------------------------------------------
// `sections.mjs` landed while this was being written, so the lot is seeded
// with ITS field keys rather than a second set of names — a seeded value
// under a key the form does not have is invisible, and invisible is this
// codebase's most expensive failure mode (CLAUDE.md: a value already sitting
// parsed and never wired to its field "fails silent - the form just keeps
// asking a human to type something the page already knows").
//
// So every seed goes through `put()`, which checks the key against the schema
// and raises a `schema-drift` warning when it does not find it. Rename a
// field in sections.mjs and the intake SAYS SO on the next run instead of
// quietly filling nothing.
//
// Note the two families of key. Scalars are prefixed `lot_` (sections.mjs:
// they share `state.extracted.scalars` with DesignBook's, and `county` /
// `total_tons` / `binder_grade` would otherwise be one key holding two
// different records' values). Row COLUMN keys are deliberately not prefixed.
// And the gradation's seven columns key as `${col}_${sieve}` — `jmf_s50` —
// which is RENDERER GAP (3) in sections.mjs and is carried here in the shape
// that gap will fill.
const SCHEMA = (() => {
  const fields = new Set(), rows = new Map(), readouts = new Set();
  for (const s2 of PLANTBOOK_SECTIONS) {
    for (const f of s2.fields || []) {
      if (f.key) fields.add(f.key);
      if (f.type === 'readout' && f.out) readouts.add(f.out);
    }
    for (const sv of s2.sieves || [])
      for (const c of s2.columns || [{ key: null }])
        fields.add(c.key ? `${c.key}_${sv.key}` : sv.key);
    const rs = Array.isArray(s2.rows) ? s2.rows : s2.rows ? [s2.rows] : [];
    for (const r of rs) rows.set(r.key, new Set((r.columns || []).map((c) => c.key)));
  }
  return { fields, rows, readouts };
})();

// ---------------------------------------------------------------------
// What a DesignBook payload is
// ---------------------------------------------------------------------
// These four constants are DUPLICATED from designbook.html's CONFIG.HANDOFF
// and netlify/lib/canonical.mjs on purpose — same rule as SUPABASE_URL in
// every page: self-contained means no shared import. If any of them ever
// changes there, it changes here too, and a payload that no longer matches
// is refused rather than half-read.
export const APPROVAL_FORMAT = 'kytc-designbook';
export const APPROVAL_MAX_VERSION = 1;
export const DOC_KIND = { review: 'review', submittal: 'submittal', approval: 'approval' };
// canonical.mjs owns this string on the server; sign-approval finds the
// submitter by it. Read-only here.
export const SUBMITTED_ACTION = 'Submitted to KYTC';
export const APPROVED_ACTION = 'Approved by KYTC';

// ---------------------------------------------------------------------
// Verification states
// ---------------------------------------------------------------------
// Exactly one of these means the signature was checked and passed. Callers
// switch on the string; never on the human sentence beside it.
export const VERIFICATION = {
  VERIFIED: 'verified',        // verify-approval returned { valid: true }
  INVALID: 'invalid',          // it returned { valid: false } — changed, or not genuine
  NOT_CHECKED: 'not-checked',  // nobody asked. The DEFAULT.
  UNAVAILABLE: 'unavailable',  // the Function is not configured or unreachable
  REFUSED: 'refused',          // the Function refused the request (400) — our shaping is wrong
};

// Only one value is ever safe to read as "this approval is real".
export const isVerified = (v) => !!v && v.state === VERIFICATION.VERIFIED;

export const VERIFY_FN = '/.netlify/functions/verify-approval';

// ---------------------------------------------------------------------
// Failure codes
// ---------------------------------------------------------------------
// The page picks its own wording; what it must not do is invent its own
// taxonomy. `message` here is a plain sentence a technician could read, kept
// close to the wording verify.html and readHandoffPDF() already use so the
// three doors do not describe the same file three different ways.
export const FAILURE = {
  NOT_A_PAYLOAD: 'not-a-payload',
  NOT_DESIGNBOOK: 'not-designbook',
  NEWER_VERSION: 'newer-version',
  NO_CONTRACT: 'no-contract',
  NO_APPROVAL: 'no-approval',
  APPROVAL_INCOMPLETE: 'approval-incomplete',
};

// ---------------------------------------------------------------------
// Mixture type code — Calculations!J1
// ---------------------------------------------------------------------
// The one control flag the approval CAN settle on its own, and everything
// downstream hangs off it: the VMA minimum, the air-void target, and whether
// the density and VMA tables pay anything at all (`paysOn()` in pay.mjs).
//
// Read out of the blank VER 14.01 template, Calculations A1:B14 — the code in
// column A, KYTC's own name for it in column B. Not inferred:
//   1 Superpave 1.5   2 Superpave 1.0   3 Superpave 0.75
//   4 Superpave 0.50  5 Superpave 0.38  14 Superpave No.4
// which is the same six sizes DesignBook's `nominal_size` field offers, in
// the same order. `5` is independently confirmed — both of Jake's real lots
// are Superpave 0.38 and read J1 = 5 (pay.mjs).
// A lot is 4,000 tons of asphalt - that is the definition, not a default
// anyone chose, and both real lots on file carry exactly 4000 at
// 'Pay Values'!F4. The last lot of a job is short, so the seeded value stays
// editable like every other provisional one.
export const LOT_TONS = 4000;

// The unit price the Lot Pay Adjustment is computed against - $50.00/ton,
// a SPEC CONSTANT and not this contract's bid price.
//
// 2026 Std Spec 402.05.02 (PDF p.182) says both halves in one breath: "The
// Department will pay for the mixture at the Contract unit bid price and
// apply a Lot Pay Adjustment for each lot placed ... The Department will
// apply the Lot Pay Adjustment for each lot to a defined unit price of
// $50.00 per ton." Two numbers doing two jobs - the bid price pays for the
// tonnage, this one scales the adjustment - and all three Lot Pay Adjustment
// Schedules open with the same figure whatever the mix:
//   Option A Base and Binder  p.185  ($50.00)(Quantity){...}
//   Option A Surface          p.186  ($50.00)(Quantity){...}
//   Option B                  p.188  ($50.00)(Quantity){...}
// KYTC's own blank AMAW agrees - 'Pay Values'!F5 ships as a hard-coded 50,
// not a formula and not blank - and both of Jake's real lots carry 50 and
// were paid by it (lot 2: +26.25 tons -> +$1,312.50 = 26.25 x 50).
//
// Seeded rather than asked for, on exactly the same footing as LOT_TONS, and
// editable for the same reason: if KYTC revises the figure, or a specialty
// mixture turns out to use another, a technician can correct it without a
// deploy. It is emphatically NOT filled from the contract's bid price - see
// the note beside applyProjectItems() in designbook.html for what that cost.
export const ADJUSTMENT_UNIT_PRICE = 50;

export const MIX_TYPE_CODES = [
  { size: '1.50', code: 1, name: 'Superpave 1.5' },
  { size: '1.00', code: 2, name: 'Superpave 1.0' },
  { size: '0.75', code: 3, name: 'Superpave 0.75' },
  { size: '0.50', code: 4, name: 'Superpave 0.50' },
  { size: '0.38', code: 5, name: 'Superpave 0.38' },
  { size: 'NO.4', code: 14, name: 'Superpave No.4' },
];

/** "0.38B" / "0.38" / "no.4 a" -> { size, letter }. Same split
 *  designbook.html's splitMixDesignation() does, and for the same reason:
 *  the trailing letter is the mix TYPE (A/B/D) and says nothing about NMAS
 *  (CLAUDE.md, confirmed with Andrew 2026-09-04). */
export function splitDesignation(raw) {
  const t = String(raw == null ? '' : raw).trim();
  if (!t) return { size: '', letter: '' };
  const m = /^(.*[^A-Za-z])([A-Za-z])$/.exec(t);
  return m ? { size: m[1].trim(), letter: m[2].toUpperCase() } : { size: t, letter: '' };
}

/** Nominal size token -> the workbook's mixture type code, or null. */
export function mixTypeFor(nominalSize) {
  const size = splitDesignation(nominalSize).size.toUpperCase().replace(/\s+/g, '');
  const hit = MIX_TYPE_CODES.find((m) => m.size === size);
  return hit ? { code: hit.code, name: hit.name } : null;
}

/** The sizes a surface mixture is placed at 1 inch (25 mm) or greater, which
 *  is what decides joint cores. Jake, 2026-09-13: "Joint cores is just if
 *  it's surface 0.38 or 0.50, which we already know". A NO.4 surface is a
 *  thin lift and falls outside the Option A note's "at 1 inch (25mm) or
 *  greater", which is why it is not on this list. */
export const JOINT_DENSITY_SIZES = ['0.38', '0.50'];

/** Whether joint density counts on a lot of this mix — the AMAW's
 *  `Calculations!H11`, 1 = yes, 2 = no.
 *
 *  Not a preference and not a per-lot decision: 2026 Std Spec 402.03.02 D)
 *  6) Option A reads "Joint - For surface mixtures placed on driving lanes
 *  and ramps, furnish 2 cores per sublot", and every proposal's OPTION A
 *  special note says the same in its own words ("The Department will require
 *  joint cores as described in Section 402.03.02 for surface mixtures
 *  only"). So the mix settles it, and the approval carries the mix.
 *
 *  Returns '1' / '2' to match the schema's option values, or null when the
 *  course is genuinely unknown — a design built from scratch with no
 *  signature and no Portal lookup has no layer to read, and a guessed answer
 *  there is worth less than an empty field with a reason beside it. Both of
 *  Jake's real lots are CL3 ASPH SURF 0.38A and read H11 = 1.
 */
export function jointDensityFor(mix) {
  if (!mix) return null;
  const layer = String(mix.layer == null ? '' : mix.layer).trim().toUpperCase();
  if (!layer) return null;
  if (!layer.startsWith('SURF')) return '2';
  const size = splitDesignation(mix.nominal_size).size.toUpperCase().replace(/\s+/g, '');
  if (!size) return null;
  return JOINT_DENSITY_SIZES.includes(size) ? '1' : '2';
}

/** The three acceptance methods `Calculations!H20` offers, and the codes
 *  `H13` turns them into: `IF(H20="Gradation",1,IF(H20="Volumetrics",2,
 *  IF(H20="Visual",3,"")))`. Spelled out because the WORDS are what the
 *  workbook stores and the CODES are what pay.mjs switches on. */
export const ACCEPTANCE_METHODS = { Gradation: 1, Volumetrics: 2, Visual: 3 };

/**
 * Which of them this lot is accepted under — `Calculations!H20`.
 *
 * WHAT THE FIELD MEANS, because it is not obvious from its name: it is not a
 * preference and not a quality grade, it is WHICH TESTS THE DEPARTMENT ACCEPTS
 * THE LOT ON, and therefore which pay schedule runs. 2026 Std Spec 402.03.02:
 *
 *   A) ordinary asphalt mixtures - "Monitor and evaluate the AC, air voids
 *      (AV), voids-in-mineral aggregate (VMA), density, and gradation", paid
 *      under 402.05.02's Lot Pay Adjustment Schedules. That is VOLUMETRICS.
 *   F) specialty mixtures - OGFC, ATDB, Pavement Wedge, Leveling and
 *      Wedging, Scratch Course, temporary mixtures and Base Failure Repair -
 *      "Perform one AC and one gradation determination per sublot", paid
 *      under 402.05.01's separate Specialty schedule. That is GRADATION.
 *   VISUAL is the third box on the dropdown; the nearest thing the spec has
 *      to it is the ATDB binder content, which is "based on visual
 *      inspection of the extent the aggregate is coated" (p.161).
 *
 * So it follows from the MIX, and it is derivable for every lot PlantBook
 * can currently open: the front door is a DesignBook approval, DesignBook
 * designs Superpave mixtures, and a Superpave mixture is accepted on
 * volumetrics. Both real lots read "Volumetrics".
 *
 * NULL rather than a default for anything else, and that is the important
 * half. `propertyWeights()` answers for three flag combinations, all of them
 * `acceptanceOption === 2`, and weighs every property at ZERO for the rest -
 * and PlantBook does not model the Specialty schedule at all (CLAUDE.md:
 * "was not read"). So a leveling-and-wedging lot is not a lot this page can
 * pay, and saying "Volumetrics" over it would be a silent 0% rather than a
 * stated gap. `mixTypeFor()` is the same test the pay tables already gate on,
 * which is why this reads off it rather than inventing a second opinion.
 */
export function acceptanceMethodFor(mix) {
  return mixTypeFor(mix && mix.nominal_size) ? 'Volumetrics' : null;
}

/** The AMAW's "ESAL Class" (`Calculations!D15`, picklist 1-4) from the
 *  design's Class — CL2 -> 2, CL3 -> 3, CL4 -> 4.
 *
 *  CORRECTED 2026-09-13. This was refused as a trap for one day, on the
 *  reading that the spec's Class 2/3/4 is "not ESAL or depth" and that two
 *  scales overlapping on three values is the worst shape for a silent
 *  mis-mapping. The refusal confused two different things: the spec DID
 *  rename the concept away from ESALs, but KYTC never relabelled the
 *  workbook, so the AMAW's "ESAL Class" box holds what the 2026 spec now
 *  calls the AADTT Class. Same family as `Field Rutting` still saying
 *  "Hamburg" (docs/amaw-map.md) and the MixPack's P52:P55 Criteria formulas
 *  still branching on the old ESAL-era table.
 *
 *  Confirmed three ways rather than taken on trust:
 *    - Jake, asked directly: "esal class is easy, its what ever class the
 *      aproval is such as CL3 or CL2 or CL4";
 *    - both real lots are CL3 ASPH SURF 0.38A and read `Calculations!D15`
 *      = 3;
 *    - decisively, the bands this number selects in `airVoidPay()` are the
 *      2026 Std Spec AV table VERBATIM, and that table's own two columns are
 *      headed "AADTT Class 2" and "AADTT Class 3 or 4" (pp.185/186/188):
 *      the low branch pays 1.00+0.1(AV-3.0) over 1.5-3.1 and 0.75 over
 *      6.1-6.5, the high branch starts at 2.0 and has no 0.75 band at all.
 *      A field that drives the AADTT Class table IS the AADTT Class.
 *
 *  Note the workbook's picklist offers 1 as well, which no mix signature can
 *  produce (only CL2/CL3/CL4 occur — CLAUDE.md, confirmed with Andrew).
 *  `airVoidPay()` treats 1 and 2 alike, so nothing is lost; a 1 can still be
 *  chosen by hand.
 *
 *  Returns '1'-'4' to match the schema's option values, or null when neither
 *  source says — never a default, because an out-of-range class pays ZERO
 *  everywhere except the 3.0-4.0 air-void band.
 */
export function esalClassFor(mix, aadttClass) {
  for (const raw of [aadttClass, mix ? mix.mix_class : null]) {
    if (raw == null || raw === '') continue;
    const m = /^(?:CL\s*)?([1-4])$/i.exec(String(raw).trim());
    if (m) return m[1];
  }
  return null;
}

/** What mix this design is actually for.
 *
 *  Contract Information's own two fields win, then the Portal's lookup —
 *  the same order designbook.html's effectiveMix() uses. CLAUDE.md records
 *  what happens when two places answer this question differently: the review
 *  PDF drew no gradation band for any design that did not start from the
 *  Portal, because it read `payload.mix` where the page read the fields.
 *  One fact, one resolver. */
export function effectiveMixOf(payload) {
  const v = (payload && payload.values) || {};
  const size = str(v.nominal_size), letter = str(v.mix_type);
  const mix = (payload && payload.mix) || null;
  if (size || letter) {
    return {
      nominal_size: size + letter,
      signature: mix ? mix.signature || null : null,
      binder_grade: str(v.binder_grade) || (mix ? mix.binder_grade : null) || null,
      layer: mix ? mix.layer || null : null,
      mix_class: mix ? (mix.mix_class == null ? null : mix.mix_class) : null,
      from: 'contract-information',
    };
  }
  if (!mix) return null;
  return {
    nominal_size: mix.nominal_size || null,
    signature: mix.signature || null,
    binder_grade: mix.binder_grade || null,
    layer: mix.layer || null,
    mix_class: mix.mix_class == null ? null : mix.mix_class,
    from: 'mix-lookup',
  };
}

// ---------------------------------------------------------------------
// approvalChecks — the gate, as data
// ---------------------------------------------------------------------
/**
 * Decide what an uploaded payload IS and whether PlantBook may open a lot on
 * it. Returns data only; nothing here fetches and nothing here is worded for
 * a particular screen.
 *
 *   { ok, doc, approval, failures[], warnings[], verify }
 *
 * `doc.kind_declared` is the file's own `doc_kind`. `doc.kind_effective` is
 * what it actually is. READ THE NEXT PARAGRAPH BEFORE USING EITHER.
 *
 * `doc_kind` DOES NOT IDENTIFY AN APPROVAL, and it looks like it should.
 * designbook.html's `handoffPayload()` hard-codes `doc_kind: "review"`;
 * `freezeSubmittal()` overwrites it with "submittal"; and `approvedPayload()`
 * — the one the approval PDF is built from — does neither, so a real,
 * correctly signed approval PDF comes off the live page reading
 * `doc_kind: "review"`. Verified 2026-09-13 by building one with the page's
 * own buildApprovalPDF() and reading it back with its own readHandoffPDF()
 * (scripts/amaw/check_intake.mjs proves it every run). `DOC.approval` is
 * declared in CONFIG.HANDOFF and never assigned anywhere in the file.
 *
 * So the AUTHORITY is the approval block, not the label: a payload carrying
 * `approval.code` is an approval whatever `doc_kind` says, and a payload
 * without one is not, whatever it says. That is also the only reading that
 * cannot be spoofed by editing one string in a JSON attachment. `doc_kind`
 * is still carried, because it is the difference between "this is a review
 * copy" and "this is the document KYTC received" when telling someone which
 * wrong file they uploaded. This is designbook.html's bug to fix if anyone
 * wants it fixed; PlantBook must work against the files that exist today,
 * including every approval already issued.
 */
export function approvalChecks(payload) {
  const failures = [], warnings = [];
  const fail = (code, message, detail) => failures.push({ code, message, ...(detail || {}) });

  if (!payload || typeof payload !== 'object') {
    fail(FAILURE.NOT_A_PAYLOAD, 'There is no design data in that file.');
    return { ok: false, doc: null, approval: null, failures, warnings, verify: null };
  }

  // Same three refusals readHandoffPDF() makes, in the same order, so the two
  // doors agree about what is readable at all.
  if (payload.format !== APPROVAL_FORMAT)
    fail(FAILURE.NOT_DESIGNBOOK,
      'That file was not made by DesignBook. Upload the approval PDF KYTC issued.',
      { got: payload.format == null ? null : String(payload.format) });

  const version = Number(payload.version || 1);
  if (version > APPROVAL_MAX_VERSION)
    fail(FAILURE.NEWER_VERSION,
      `That approval was made by a newer version of DesignBook (v${version}). Reload this page and try again.`,
      { got: version, supported: APPROVAL_MAX_VERSION });

  const job = payload.job || null;
  if (!job || !str(job.cid))
    fail(FAILURE.NO_CONTRACT, "That design data is incomplete - it carries no contract.");

  const a = payload.approval || null;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const declared = payload.doc_kind == null ? null : String(payload.doc_kind);

  if (!a || !str(a.code)) {
    // Worded off which document they actually picked, because "this is not an
    // approval" is unhelpful when the answer is "you uploaded the submittal".
    const what = declared === DOC_KIND.submittal
      ? 'That is the submittal - the document KYTC received, before it was reviewed.'
      : history.some((h) => h && h.action === SUBMITTED_ACTION)
        ? 'That is a working copy of a submitted design, not the approval.'
        : 'That is an internal review copy, not an approval.';
    fail(FAILURE.NO_APPROVAL,
      `${what} A lot starts from the approval PDF KYTC issued - the one with a verification code on it.`,
      { doc_kind: declared, stage: payload.stage || null });
  } else {
    // verify-approval 400s unless all four are present, and a 400 reads as
    // "bad request" rather than as anything a technician can act on. Catch it
    // here so the message names the file instead of the API.
    const need = ['code', 'issued_at', 'approved_by', 'mix_id'].filter((k) => !str(a[k]));
    if (need.length)
      fail(FAILURE.APPROVAL_INCOMPLETE,
        'That file carries an approval, but not a complete one - it cannot be checked against KYTC.',
        { missing: need });
  }

  // Not failures. A design can be genuinely approved and still say something
  // odd about itself; refusing the lot over any of these would put a
  // technician in front of a file KYTC signed and a door that will not open.
  if (a && str(a.code) && payload.stage && payload.stage !== 'Approved')
    warnings.push({ code: 'stage-disagrees',
      message: `The file carries a KYTC approval but its stage reads "${payload.stage}". The approval is what counts; the stage is only a claim.` });
  if (a && str(a.code) && declared === DOC_KIND.submittal)
    warnings.push({ code: 'submittal-carrying-approval',
      message: 'This is labelled a submittal but carries an approval block. Check it is the approval PDF KYTC sent.' });

  const kindEffective = a && str(a.code)
    ? DOC_KIND.approval
    : declared === DOC_KIND.submittal ? DOC_KIND.submittal : DOC_KIND.review;

  const ok = failures.length === 0;
  return {
    ok,
    doc: {
      kind_declared: declared,
      // The derived answer. See the long note above: on every approval the
      // live page produces, these two disagree, and the derived one is right.
      kind_effective: kindEffective,
      kind_is_reliable: declared === kindEffective,
      stage: payload.stage || null,
      format: payload.format || null,
      version,
      submitted_by: submitterOf(payload),
      approved_by: a ? a.approved_by || null : null,
    },
    approval: a && str(a.code) ? { ...a } : null,
    failures,
    warnings,
    // Only shaped when there is something to check. A caller that finds
    // `verify: null` has nothing to send and must not treat that as a pass.
    verify: ok ? verifyRequest(payload) : null,
  };
}

/** The last SUBMITTED_ACTION entry's sm_id — canonical.mjs's submitterOf(),
 *  reproduced because that file is server-side and this runs in a page. */
export function submitterOf(payload) {
  const h = Array.isArray(payload && payload.history) ? payload.history : [];
  const e = h.filter((x) => x && x.action === SUBMITTED_ACTION).slice(-1)[0];
  return e && e.sm_id ? e.sm_id : null;
}

// ---------------------------------------------------------------------
// Talking to verify-approval
// ---------------------------------------------------------------------
/**
 * Exactly what public/verify.html POSTs, and it has to stay exactly that:
 * `{ payload, approval }`, with `approval` being the file's own block.
 *
 * The Function recomputes the HMAC over `signingMaterial()` — the canonical
 * design plus approved_by, submitted_by, issued_at and the eight-digit mix
 * id — so the payload must go across UNTOUCHED. Do not normalise it, do not
 * strip keys you think are noise, do not reorder anything: `canonicalDesign()`
 * sorts keys itself, but it reads `values` and `rows` verbatim, and one
 * coerced number is a signature that no longer matches with no visible cause.
 * That is why this takes the payload as it came out of the PDF and hands it
 * straight on.
 *
 * No Authorization header, deliberately: verify-approval is open so a district
 * office that was emailed an approval can check it without an account.
 */
export function verifyRequest(payload) {
  return {
    url: VERIFY_FN,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { payload, approval: (payload && payload.approval) || null },
  };
}

/**
 * Turn a verify-approval answer into a verification state.
 *
 *   readVerifyResponse({ status, body })            — an HTTP answer
 *   readVerifyResponse({ networkError: err })       — the fetch never landed
 *
 * The shape of the answers is fixed by the Function:
 *   200 { valid: true, mix_id, approval_no, pa, approved_by, submitted_by, issued_at }
 *   200 { valid: false, error }   the design changed after approval, or it is not genuine
 *   400 { error }                 the request did not carry a complete approval
 *   405 { error }                 not a POST
 *   500 { error }                 APPROVAL_SIGNING_SECRET is not set on the site
 *
 * Note what is taken from a successful answer and what is not. verify-approval
 * recomputes `approval_no` and `pa` from the SIGNED mix id rather than echoing
 * the file's copy, precisely so that editing "#467" to read "#467PA" cannot
 * survive a check. So when the answer is good, the server's label wins and the
 * file's is recorded beside it as `claimed`. Anything else and we keep the
 * file's, clearly marked as unchecked.
 */
export function readVerifyResponse(res) {
  const at = new Date().toISOString();
  if (!res || res.networkError)
    return { state: VERIFICATION.UNAVAILABLE, checked_at: at,
             reason: 'The approval could not be checked - the verification service did not answer.',
             detail: res && res.networkError ? String(res.networkError.message || res.networkError) : null };

  const status = Number(res.status);
  const body = res.body || {};

  if (status === 200 && body.valid === true) {
    return {
      state: VERIFICATION.VERIFIED,
      checked_at: at,
      reason: 'KYTC signed this approval and the design has not changed since.',
      // The server's own recomputation. Prefer these to the file's copies.
      mix_id: body.mix_id || null,
      approval_no: body.approval_no || null,
      pa: body.pa == null ? null : !!body.pa,
      approved_by: body.approved_by || null,
      submitted_by: body.submitted_by || null,
      issued_at: body.issued_at || null,
    };
  }
  if (status === 200 && body.valid === false)
    return { state: VERIFICATION.INVALID, checked_at: at,
             reason: body.error || 'This does not match an approval issued by KYTC. Either the design was changed after it was approved, or the code is not genuine.' };
  if (status === 400)
    return { state: VERIFICATION.REFUSED, checked_at: at,
             reason: body.error || 'That file does not carry a complete approval.' };
  if (status === 500)
    return { state: VERIFICATION.UNAVAILABLE, checked_at: at,
             reason: body.error || 'Verification is not configured on this site, so this approval could not be checked.' };
  return { state: VERIFICATION.UNAVAILABLE, checked_at: at,
           reason: body.error || `The verification service answered ${status}.` };
}

/** The state a lot gets when nobody checked. Explicit, and the default, so
 *  "we did not look" can never be mistaken for "we looked and it was fine". */
export function notChecked(reason) {
  return { state: VERIFICATION.NOT_CHECKED, checked_at: null,
           reason: reason || 'This approval has not been checked against KYTC.' };
}

// ---------------------------------------------------------------------
// lotFromApproval — the inheritance
// ---------------------------------------------------------------------
/**
 * Seed a blank PlantBook lot from an approval payload.
 *
 *   lotFromApproval(payload, { lotNumber = 1, verification = null })
 *     -> { ok, lot, report, checks }
 *
 * `ok: false` means the gate refused it and `lot` is null; `checks.failures`
 * says why. Nothing half-builds — an intake that silently produces an empty
 * lot is the same failure mode readHandoffPDF() refuses to have.
 *
 * `verification` is whatever `readVerifyResponse()` returned. Leave it out
 * and the lot is stamped `not-checked` — see the rule at the top of this
 * file. It is NOT an error to open a lot unverified (the Function may be
 * down, the site may be new), it just has to be written down.
 *
 * The lot is a `storage.mjs` envelope and nothing more: everything inherited
 * lives under `values`, `rows` and `extracted_from`, which is what
 * `normaliseLot()` preserves.
 *
 * `report` is data, for whatever the page wants to draw:
 *   inherited[] { key, value, from, to, note }  — came across, with the AMAW cell it fills
 *   derived[]   { key, value, how, to }         — computed here, not on the approval
 *   typed[]     { key, to, why, blocks[] }      — a technician still has to enter this
 *   missing[]   { key, why, blocks[] }          — the approval should have carried it and did not
 *   warnings[]  { code, message }
 * `blocks` names what cannot be computed without it: 'pay' above all.
 */
export function lotFromApproval(payload, opts = {}) {
  const checks = approvalChecks(payload);
  if (!checks.ok) return { ok: false, lot: null, report: null, checks };

  // Which lot of the contract this is. The approval cannot know - it is a
  // design, and a design runs for many lots - so the caller supplies it and a
  // defaulted 1 is reported as something still to confirm rather than as a
  // fact. It matters more than it looks: lot 1 sublot 1 carries the
  // "*For Sublot # 1 Only" allowance and nothing else on the job ever does.
  const lotNumberGiven = opts.lotNumber != null;
  const lotNumber = lotNumberGiven ? Number(opts.lotNumber) : 1;
  const verification = opts.verification || notChecked();

  const v = payload.values || {};
  const rows = payload.rows || {};
  const dv = v.design_values || {};
  const fp = v.fourpoint || {};
  const job = payload.job || {};
  const a = checks.approval;
  const mix = effectiveMixOf(payload);

  const inherited = [], derived = [], typed = [], missing = [];
  const warnings = checks.warnings.slice();
  const sources = {};

  // A field the approval supplied. `to` is the AMAW cell it will fill, from
  // addresses.mjs, so the report is checkable against the workbook rather
  // than being a list of our own names for things.
  // `key` is the schema's own field key wherever the value lands on a form
  // field; `checkKey` false for the handful that live in `values.design`
  // instead (the three readouts and the structures under them), which are
  // read by recompute() rather than typed into a box.
  const seeded = {};
  const put = (key, value, checkKey) => {
    if (checkKey !== false && !SCHEMA.fields.has(key) && !SCHEMA.readouts.has(key))
      warnings.push({ code: 'schema-drift',
        message: `The intake seeds "${key}", which sections.mjs no longer has. That value will not reach the form.` });
    if (SCHEMA.fields.has(key)) seeded[key] = value;
  };
  const take = (key, value, from, to, note, checkKey) => {
    if (value == null || value === '') return null;
    inherited.push({ key, value, from, to: to || null, ...(note ? { note } : {}) });
    sources[key] = `${sourceLabel(a)} · ${from}`;
    put(key, value, checkKey);
    return value;
  };
  const derive = (key, value, how, to, checkKey) => {
    if (value == null || value === '') return null;
    derived.push({ key, value, how, to: to || null });
    sources[key] = `${sourceLabel(a)} · derived: ${how}`;
    put(key, value, checkKey);
    return value;
  };
  const needsTyping = (key, to, why, blocks) =>
    typed.push({ key, to: to || null, why, blocks: blocks || [] });
  const wasMissing = (key, why, blocks) =>
    missing.push({ key, why, blocks: blocks || [] });

  /* ---- identity -----------------------------------------------------
     The four columns storage.mjs keys a lot on. `mix_id` is KYTC's own
     eight-digit MIX ID NUM. off the approval, which is also the lead of the
     AMAW's 'Pay Values'!D9 — the join between the two books, already written
     down in the workbook (docs/amaw-map.md). */
  const contract = str(job.cid);
  const amp = str(job.plant);
  const mixId = str(a.mix_id);
  if (!amp) wasMissing('amp_number', 'The approval carries no plant, so the lot cannot say which plant produced it.', ['identity']);

  take('lot_contract_id', contract, 'job.cid', cell(LOT.sheet, LOT.contract));
  take('lot_plant', amp, 'job.plant', cell(LOT.sheet, LOT.plantCode),
       'the template pads this key ("AMP070302      ") and matches it exactly - spell it the workbook\'s way, not Supabase\'s');
  take('plant_name', str(payload.plant_name), 'plant_name', null, null, false);
  take('lot_county', str(v.county), 'values.county', cell(LOT.sheet, LOT.county));
  take('lot_number', lotNumber, lotNumberGiven ? 'supplied by the caller' : 'defaulted to 1',
       cell(LOT.sheet, LOT.lotNumber), lotNumberGiven ? null : 'defaulted - see report.typed', false);
  derive('lot_unit', 'TON', "the AMAW's only unit ('Pay Values'!E4)", cell(LOT.sheet, LOT.unit));

  const signature = mix && mix.signature ? mix.signature : null;
  // 'Pay Values'!D9 in both of Jake's real lots is "<mix id> <signature>" —
  // "00385 CL3 ASPH SURF 0.38A PG64-22". Build it the same way rather than
  // making PlantBook re-derive it later from two half-remembered fields.
  const designation = mixId && signature ? `${mixId} ${signature}` : (mixId || signature || null);
  take('lot_mix_id', designation, 'approval.mix_id + mix.signature',
       `${cell(LOT.sheet, LOT.approvedMixDesign)} / ${cell(LOT.sheet, LOT.mixId)}`,
       't_smpl.rel_smpl_id - the approval this lot is produced under, and the join between the two books');

  // THE MIX ID IS EIGHT DIGITS, settled by Jake 2026-09-13. Both of his real
  // AMAWs carry a FIVE-digit lead ("00385 CL3 ASPH SURF 0.38A PG64-22"), and
  // canonical.mjs issues eight ("00260467" for #467PA) - "00" + the letting
  // year + a four-digit sequence. Asked which shape MEDL expects; the answer
  // is eight, so DesignBook's id is carried through untouched and the two
  // real lots are read as the older shape rather than as the standard.
  //
  // That five-digit lead is a BID CODE off the workbook's own catalogue at
  // Calculations!BB3:BF349, not a mix id, which is why the item code at
  // 'Pay Values'!D3 is no longer asked for here or on the form: nothing in
  // the workbook reads D3 and no staging row sources it. See sections.mjs.

  /* ---- the mix, in DesignBook's own two fields ----------------------
     Nominal size and Mix type, the same pair Contract Information asks for,
     carried across so a person moving between the books is reading one
     vocabulary rather than two. Both are covered by the approval's
     signature, so PlantBook shows them readonly rather than asking again. */
  if (mix && mix.nominal_size) {
    const split = splitDesignation(mix.nominal_size);
    take('lot_nominal_size', split.size || null, 'mix.nominal_size', cell(LOT.sheet, LOT.typeMix));
    // The letter can be absent on a design that never had one typed; that is
    // a gap in the approval rather than something to invent here.
    if (split.letter) take('lot_mix_type', split.letter, 'mix.nominal_size (the trailing letter)', null);
  }

  /* ---- the mixture type code, and what hangs off it -----------------
     Calculations!J1. Everything in the pay schedule gates on it, and it is
     a TRANSLATION of the nominal size above rather than a second question -
     so it is not seeded, not stored and not on the form. mixTypeFor() is
     the single answer, called where the code is wanted: the pay tables on
     the page, and mapper.mjs on the way to the workbook.

     What IS reported is the one case that matters: a nominal size the
     Superpave table has no row for. The pay schedule then gates on nothing
     and every property pays zero, so it is named against the field a person
     can actually fix rather than against a code they never see. */
  const mt = mix ? mixTypeFor(mix.nominal_size) : null;
  if (!mt) {
    wasMissing('lot_nominal_size',
      'The approval carries no nominal size that matches a Superpave mixture type, so Calculations!J1 has nothing to gate on - every property pays zero until the size is set.',
      ['pay']);
  }

  /* ---- THE THREE NUMBERS LOT PAY IS MEASURED AGAINST ----------------
     This is the whole argument for starting PlantBook here. Without them
     `lotPay()` has nothing to deviate from and pay is not merely wrong, it
     is uncomputable.

     They are NOT all of a kind, and the difference is worth keeping:
       jmf_ac    is COPIED   - 'Pay Values'!A13:A16 is a typed cell today.
       min_vma   is DERIVED  - the approval has no spec minimum on it at all
                               (DesignBook computes the VMA the design
                               ACHIEVES, 16.1 on #467PA, which is a different
                               quantity from the minimum it must beat).
                               'Pay Values'!H13:H16 is also a typed cell, so
                               this still saves the typing - it just has to be
                               labelled derived, because a technician
                               correcting it is correcting our lookup, not
                               KYTC's approval.
       target_va is CARRIED as a cross-check - 'Pay Values'!E13 is a LOOKUP
                               the workbook does for itself (3.5 for every
                               Superpave size), so the design's own target is
                               not an input. If the two ever disagree, that
                               disagreement is the finding. */
  const jmfAc = num(dv.design_pb);
  if (jmfAc == null) {
    wasMissing('jmf_ac',
      'The approval carries no design Pb, so there is no JMF to measure a sublot\'s %AC against and no AC pay can be computed.',
      ['pay']);
  } else {
    take('jmf_ac', jmfAc, 'values.design_values.design_pb',
         cellRange(PAY.sheet, PAY.sublot.cols.jmfAc, PAY.sublot.first, 4),
         'typed in the workbook today - this is the pay schedule\'s reference point', false);
  }

  const designTarget = num(fp['const:fp_vatgt']);
  const bookTarget = mt ? airVoidTargetFor(mt.code) : null;
  if (designTarget != null)
    take('target_va', designTarget, 'values.fourpoint["const:fp_vatgt"]',
         cell(PAY.sheet, PAY.sublot.cols.targetVa + PAY.sublot.first),
         'the workbook looks this up for itself; carried so the two can be compared', false);
  else if (bookTarget != null)
    derive('target_va', bookTarget, `airVoidTargetFor(${mt.code}) - Calculations F1:F14`,
           cell(PAY.sheet, PAY.sublot.cols.targetVa + PAY.sublot.first), false);
  else
    wasMissing('target_va', 'Neither the approval nor the mixture type settles the air-void target.', ['pay']);

  if (designTarget != null && bookTarget != null && Math.abs(designTarget - bookTarget) > 0.001)
    warnings.push({ code: 'target-va-disagrees',
      message: `The design was built to ${designTarget}% air voids but the workbook's own table gives ${bookTarget}% for a ${mt.name}. The workbook wins in the pay cells; check which is right before running the lot.` });

  const minVma = mt ? vmaMinimumFor(mt.code) : null;
  if (minVma != null)
    derive('min_vma', minVma, `vmaMinimumFor(${mt.code}) - 'Pay Values'!H13:H16 is typed, and the approval carries the VMA the design ACHIEVED, not the minimum it must beat`,
           cellRange(PAY.sheet, PAY.sublot.cols.minVma, PAY.sublot.first, 4), false);
  else
    wasMissing('min_vma',
      'Without a mixture type there is no VMA minimum, so no VMA pay can be computed.',
      ['pay']);

  // The design's own achieved volumetrics. Not pay inputs — they are the
  // yardstick a technician eyeballs a sublot against, and the reason the lot
  // can show "VMA 15.6 against a design of 16.1" without anyone typing it.
  const achieved = {};
  for (const [k, src] of [['va', 'va_design'], ['vma', 'vma_design'], ['vfa', 'vfa_design'],
                          ['gmm', 'gmm_design'], ['gmb', 'gmb_design'], ['pbe', 'pbe'],
                          ['dust_pbe', 'dust_pbe'], ['gse', 'gse'], ['density', 'density']]) {
    const n = num(dv[src]);
    if (n != null) achieved[k] = n;
  }
  if (Object.keys(achieved).length)
    inherited.push({ key: 'design_volumetrics', value: achieved,
                     from: 'values.design_values', to: null,
                     note: 'what the design achieved - the reference a sublot is read against, not a pay input' });

  /* ---- the blend ----------------------------------------------------
     Superpave N/O/Q rows 3-8 are lot-level; the percentages are per-sublot
     (R/S/T/U) and combined Gsb likewise at row 9. Both real lots repeat the
     same percentages across all four columns, which is exactly why this
     reads as lot-level until you check the addresses (docs/amaw-map.md).
     Seeded into all four sublots as the design's target, and a plant that
     shifts its blend mid-lot overwrites the sublot it shifted. */
  const agg = Array.isArray(rows.aggregate) ? rows.aggregate : [];
  // DesignBook's own Aggregate Structure table, verbatim - producer / type &
  // size / mat code / % blend / Gsb, the same five columns `CONFIG.SECTIONS`
  // renders on that book. Carried alongside `blend_pct` below rather than
  // instead of it: `blend_pct` is reshaped for the AMAW's own columns (no
  // mat_code, `gsb` renamed `bod`, one percentage per sublot) and is the
  // plant's working data; this is what was APPROVED, read-only, for the Lot
  // step's mirror of the design. Two different jobs, so two different shapes
  // of the same rows.
  const aggregateStructure = agg.map((r) => ({
    producer: str(r.producer) || null,
    type_size: str(r.type_size) || null,
    mat_code: str(r.mat_code) || null,
    pct_blend: num(r.pct_blend),
    gsb: num(r.gsb),
  }));
  // sections.mjs's `blend_pct` columns: component / producer / agp /
  // type_size / bod / design_pct / pct - 2026-09-15b, folded from what used
  // to be two lists (a six-row `blend` identity table plus this one) into
  // one, present on every sublot tab. One row per component PER SUBLOT (24
  // total), grouped by its own `sublot` cell (the same value-based join
  // mapper.mjs's fan-out and the page's paintBlendMirrors() both use, never
  // raw array position across sublots) and, within a sublot's own six, kept
  // in POSITION by `component` (1-6) - the identity anchor a blank
  // producer/agp/type_size/bod would otherwise let collectForm() drop out of
  // place, same reason MAT_CORE_SEED's `core_id` is always painted.
  //
  // Producer/AGP/type_size/BOD are the SAME six values on every sublot -
  // Sublot 1 is the one place they are typed (one canonical edit point beats
  // four that could disagree), Sublots 2-4 mirror them read-only
  // (paintBlendMirrors(), designbook.html) - so they are seeded identically
  // into all 24 rows here, exactly as the old six-row `blend` list was.
  // `design_pct` and `pct` both start at the design's own blend % for this
  // component, but only `pct` is ever edited afterwards: `design_pct` is a
  // separate, never-touched copy kept for comparison once a sublot's own %
  // has moved away from what was designed.
  const blend_pct = [];
  for (let s = 1; s <= 4; s++) {
    agg.forEach((r, i) => {
      blend_pct.push({
        sublot: String(s),
        component: String(i + 1),
        producer: str(r.producer) || null,
        // NO AGP NUMBER. The approval does not carry one: the legacy importer
        // resolves the producer by KYTC's own AGP/AMP number and rides it on
        // the row as `_agp`, which CLAUDE.md records is deliberately not a
        // schema column and never reaches the payload. sections.mjs makes it
        // a real column here because the loader reads it, so it has to be
        // resolved from the producer NAME against `aggregates` (or `plants`
        // for a RAP row) on load, or typed. Same lesson as the TSR thickness,
        // from the other side: the key we needed was dropped at the
        // boundary, so we carry the label and say the key is owed.
        agp: null,
        type_size: str(r.type_size) || null,
        bod: num(r.gsb),
        design_pct: num(r.pct_blend),
        pct: num(r.pct_blend),
        // Not a schema column - `alt`/isRapRow() re-derives it from Type &
        // size at render time. Carried on the report only, so the caller can
        // say "component 6 is the RAP" without re-implementing the test.
        _rap: isRapType(r.type_size),
      });
    });
  }
  if (agg.length) {
    inherited.push({ key: 'blend_pct', value: blend_pct, from: 'rows.aggregate',
                     to: `${AGGREGATE.sheet}!${AGGREGATE.cols.producerCode}${AGGREGATE.first}:${AGGREGATE.cols.bod}${AGGREGATE.first + AGGREGATE.count - 1}, ${AGGREGATE.cols.pct}${AGGREGATE.first}:${AGGREGATE.cols.pct}${AGGREGATE.first + AGGREGATE.count - 1} x4 sublots`,
                     note: `identity seeded once, mirrored across all four sublots; percentages seeded into all four sublot columns ${AGGREGATE.pctCols.join('/')} as each sublot's own starting %, alongside a separate never-edited Design % copy` });
    sources.blend_pct = `${sourceLabel(a)} · rows.aggregate`;
    if (agg.length > AGGREGATE.count)
      warnings.push({ code: 'blend-too-long',
        message: `The design has ${agg.length} aggregate components; the AMAW's blend block holds ${AGGREGATE.count}.` });
    needsTyping('blend_pct[].agp',
      `${AGGREGATE.sheet}!${AGGREGATE.cols.producerCode}${AGGREGATE.first}:${AGGREGATE.cols.producerCode}${AGGREGATE.first + AGGREGATE.count - 1}`,
      'The approval carries producer NAMES, not AGP/AMP numbers - DesignBook drops the code at the payload boundary. Resolve each name against `aggregates` (or `plants` for a RAP row) on load, or have the technician pick.',
      ['medl-load']);
  } else {
    wasMissing('blend_pct', 'The approval carries no aggregate structure.', ['medl-load']);
  }

  const combinedGsb = num(fp['const:fp_gsb']);
  // sections.mjs keeps combined Gsb as its own one-row readonly table
  // (`blend_gsb`, gsb_1..gsb_4) because it is DERIVED from the percentages
  // and the BODs. Seeding the design's figure across all four is the same
  // "provisional until the page recomputes it" move every other inherited
  // value makes.
  const blendGsb = combinedGsb == null ? null
    : [Object.fromEntries(AGGREGATE.pctCols.map((_, i) => [`gsb_${i + 1}`, combinedGsb]))];
  if (combinedGsb != null)
    take('blend_gsb', combinedGsb, 'values.fourpoint["const:fp_gsb"]',
         `${AGGREGATE.sheet}!${AGGREGATE.pctCols.map((c) => c + AGGREGATE.gsbRow).join('/')}`,
         'seeded across all four sublots; the page recomputes it from the percentages and BODs', false);
  else
    wasMissing('blend_gsb', 'The approval carries no combined Gsb, which the sublot VMA is computed from.', ['volumetrics']);

  /* ---- the JMF gradation -------------------------------------------
     Gradation!N10:N23, one lot-level target column beside the four sublot
     columns. Fourteen WORKBOOK slots against thirteen sieves on either
     book's form: the AMAW keeps a 1/4" ROW that neither form now carries
     (a real MixPack reads "N / A" there and `Gradation` row 16 is empty in
     both real lots), so that slot stays null rather than shifting
     everything below it up one. */
  const jmf = gradationJmf(v);
  if (jmf.some((x) => x.pct != null)) {
    inherited.push({ key: 'jmf_gradation', value: jmf, from: 'values.<sieve>',
                     to: `${GRADATION.sheet}!${GRADATION.jmfCol}${GRADATION.first}:${GRADATION.jmfCol}${GRADATION.first + GRADATION.sieves.length - 1}`,
                     note: 'the 1/4" slot is left blank - neither book carries that sieve' });
    sources.jmf_gradation = `${sourceLabel(a)} · values.<sieve>`;
    // One field per sieve, keyed `jmf_<sieve>` - the composite key
    // sections.mjs's RENDERER GAP (3) specifies for its seven gradation
    // columns. Seeded whether or not the renderer can draw them yet: when
    // sievesHTML() grows its `columns` support these are already there, and
    // until then put() says loudly if a key is wrong.
    for (const x of jmf) if (x.pct != null && x.schemaKey) put(x.schemaKey, x.pct);
  } else {
    wasMissing('jmf_gradation',
      'The approval carries no gradation, so a sublot has no JMF to be judged against under Gradation acceptance.',
      ['gradation-acceptance']);
  }

  /* ---- project items ------------------------------------------------
     The `Project Items` sheet is the same sheet with the same ListObject in
     both workbooks (A6:C99), so a lot inherits whatever the approved design
     carried rather than looking them up a second time. Worth inheriting even
     though the Lot step has its own lookup button: the Spreadsheet Applet
     expands one t_cont_smpl row per row on that tab, so a lot with none loads
     carrying no project at all.
     Provisional like everything else here - a change order re-numbers items,
     which is the whole reason that button exists, so these are a starting
     point and the lookup is how they are refreshed. */
  const projectItems = (rows.project_items || [])
    .filter((r) => r && str(r.project) && str(r.line))
    .map((r) => ({ ...r }));
  if (projectItems.length) {
    inherited.push({ key: 'project_items', value: `${projectItems.length} line item(s)`,
                     from: 'rows.project_items', to: cell('Project Items', 'A6'),
                     note: 'a change order can re-number these; the Lot step has a lookup that re-reads KYTC' });
    sources.project_items = `${sourceLabel(a)} · rows.project_items`;
  } else {
    wasMissing('project_items',
      'The approved design carries no project items. The loader expands one t_cont_smpl row per row on that tab, so a lot with none loads carrying no project - use the lookup on the Lot step.',
      ['medl-load']);
  }

  /* ---- binder -------------------------------------------------------- */
  take('lot_binder_grade', str(v.binder_grade) || (mix ? mix.binder_grade : null), 'values.binder_grade', null);
  take('lot_binder_terminal', str(v.binder_terminal), 'values.binder_terminal', cell(PAY.sheet, PAY.lot.binderProducer),
       'PlantBook should still resolve this against `binder_terminals` rather than trusting the string');

  /* ---- what a technician still has to type --------------------------
     The honest half of the report. Everything here is a cell the approval
     genuinely cannot fill, with the reason, because "why am I typing this
     again" is the question this whole intake exists to answer. */

  // ESAL Class, derived from the design's Class - see esalClassFor() for why
  // the workbook's label is legacy and the quantity is the spec's AADTT
  // Class. Refused as a trap until 2026-09-13; that refusal was wrong.
  const aadtt = str(v.aadtt_class);
  const esal = esalClassFor(mix, aadtt);
  if (esal) {
    derive('lot_esal_class', esal,
           `the design is Class ${esal} - the AMAW's box is labelled ESAL Class but selects the spec's AADTT Class bands`,
           `${cell(LOT.sheet, LOT.esalClass)} -> ${cell(CALC.sheet, CALC.esalClass)}`);
  } else {
    needsTyping('lot_esal_class', `${cell(LOT.sheet, LOT.esalClass)} -> ${cell(CALC.sheet, CALC.esalClass)}`,
      'The approval carries no Class - neither an AADTT Class field nor a CL prefix on the mix signature - and this moves three air-void bands and four density constants.',
      ['pay']);
  }
  if (aadtt) {
    inherited.push({ key: 'aadtt_class', value: aadtt, from: 'values.aadtt_class', to: null,
                     note: 'the design\'s Class; lot_esal_class is derived from it' });
    sources.aadtt_class = `${sourceLabel(a)} · values.aadtt_class`;
  }

  const accept = acceptanceMethodFor(mix);
  if (accept) {
    derive('lot_acceptance_method', accept,
      'a Superpave mixture is accepted on volumetric properties - 2026 Std Spec 402.03.02 A)',
      `${cell(CALC.sheet, CALC.acceptanceMethod)} -> ${cell(CALC.sheet, 'H13')}`);
  } else {
    wasMissing('lot_acceptance_method',
      'The approval is not a Superpave mixture, so it is accepted on AC and gradation under '
      + '402.03.02 F) and paid under the Specialty Mixtures schedule - which PlantBook does not '
      + 'model. Nothing here can pay this lot; the acceptance method is left blank rather than '
      + 'defaulted, because a wrong one weighs every property at zero without saying so.',
      ['pay']);
  }
  // Density option. On the CONTRACT, not on the design: 2026 Std Spec
  // 402.03.02 D) 6) opens "The Contract will state the compaction option to
  // be used", and every proposal carries it as an OPTION A / OPTION B
  // special note. It is not yet fetched, and the reason is worth stating
  // rather than discovering: the note is written PER ROUTE, so one contract
  // can be both. 262120 - the very contract Jake is testing against - reads
  // "OPTION A (KY 627)" and "OPTION B (US 25)" on facing pages, and the
  // design's own project number is what picks between them (#467PA is on
  // MP07606272601, the KY 627 one). So this needs `kytc-lookup` to return
  // the notes with their route qualifier; the lookup returns the proposal
  // header and the mix items and no notes at all today.
  needsTyping('lot_density_option', cell(CALC.sheet, CALC.densityOption),
    'Option A or Option B. It is stated in the Contract (Std Spec 402.03.02 D) 6)), as an OPTION A / OPTION B special note in the proposal - and per ROUTE, so a two-route contract can be both. Option B pays no lane density and takes no cores.',
    ['pay']);

  // Joint density. Fully settled by the mix, so it is derived rather than
  // asked for - see jointDensityFor() for the spec wording. Left blank with
  // a reason when the course is unknown, which is only a design that reached
  // PlantBook with neither a signature nor a Portal mix lookup.
  const jd = jointDensityFor(mix);
  if (jd) {
    derive('lot_joint_density', jd,
           `${mix.layer} ${mix.nominal_size || ''}`.trim() +
           (jd === '1' ? ' is a surface mixture at 1 inch or greater, so joint cores are taken'
                       : ' is not a surface mixture placed at 1 inch or greater, so no joint cores'),
           cell(CALC.sheet, 'H11'));
  } else {
    needsTyping('lot_joint_density', cell(CALC.sheet, 'H11'),
      'Joint cores are taken on surface mixtures at 1 inch or greater (0.38 and 0.50), and this approval does not say which course the mix is - it reached PlantBook with no signature and no Portal mix lookup.',
      ['pay']);
  }
  if (!lotNumberGiven)
    needsTyping('lot_number', cell(LOT.sheet, LOT.lotNumber),
      'Defaulted to 1. Lot 1 sublot 1 carries the "*For Sublot # 1 Only" allowance and nothing else on the job ever does, so confirm it.', ['pay']);
  // A lot IS 4,000 tons - that is what a lot is, and both real lots on file
  // say exactly 4000 at 'Pay Values'!F4. Seeded rather than asked for, and
  // still editable, because the LAST lot of a job is short. Note this is not
  // the approval's Tonnage, which is the whole CONTRACT quantity.
  derive('lot_tons', LOT_TONS,
         `a lot is ${LOT_TONS} tons - correct it for a short final lot`,
         cell(LOT.sheet, LOT.lotTons));
  derive('lot_unit_price', ADJUSTMENT_UNIT_PRICE,
         `the Lot Pay Adjustment is computed against a defined $${ADJUSTMENT_UNIT_PRICE}.00/ton (Std Spec 402.05.02), not this contract's bid price`,
         cell(LOT.sheet, LOT.unitPrice));
  needsTyping('lot_wedge_tons', cell(PAY.sheet, PAY.lot.wedgeTons),
    'Pavement wedge tons come off the top of the lot tonnage. Blank in both of Jake\'s real lots.', ['pay']);
  needsTyping('lot_sample_id_prefix', cell(LOT.sheet, LOT.sampleIdPrefix),
    'Both real lots leave it blank - KYTC fills it at hand-off. Empty means "not ready to hand off", not a read failure.', ['medl-load']);
  needsTyping('binder_lot_numbers', `${PAY.sheet}!${PAY.binderLotCols.join('/')}${PAY.binderLotRow}`,
    'PG binder lot numbers, per sublot, off the delivery tickets.', []);
  needsTyping('technicians', `${SUBLOT.sheet}!${SUBLOT.technician.join('/')} ('Cert. Techs')`,
    'Who sampled and tested each sublot.', ['medl-load']);
  needsTyping('sublot_tests',
    `${SUBLOT.sheet} rows ${[0,1,2,3].map((i)=>SUBLOT.volumetric.first + i*SUBLOT.volumetric.stride).join('/')}, ` +
    `${GRADATION.sheet} ${GRADATION.cols.join('/')}, ${CORES.sheet}, KYCT`,
    'Every sublot result. This is the work the lot exists to record - the approval supplies what they are measured against, never the measurements.', ['pay']);
  needsTyping('department_records',
    `${AVERIFY.sheet} rows ${[0,1].map((i)=>AVERIFY.first + i*AVERIFY.stride).join('/')} (QA01, IQ01)`,
    'Department acceptance and independent assurance are filled by KYTC district personnel, not by the plant.', []);

  /* ---- the envelope -------------------------------------------------- */
  const identity = {
    contract_id: contract,
    amp_number: amp,
    mix_id: mixId,
    lot_number: lotNumber,
  };
  const bad = Object.keys(identity).filter((k) => !str(identity[k]));
  if (bad.length) {
    // blankLot() would throw; say what is wrong instead, in the same shape as
    // every other refusal here.
    checks.failures.push({ code: FAILURE.NO_CONTRACT,
      message: `A lot cannot be identified without ${bad.join(', ')}.`, missing: bad });
    return { ok: false, lot: null, report: null, checks: { ...checks, ok: false } };
  }

  const lot = blankLot(identity, { mix_signature: signature, plant_name: str(payload.plant_name) || null });

  // Every scalar the seeding above accepted, under sections.mjs's own field
  // keys, plus every field the schema has and this lot has not filled -
  // present and null on purpose. A key that exists and is empty is a field
  // the form knows about; a key that is absent is a field somebody forgot,
  // and the two must not look the same.
  lot.values = {};
  for (const k of SCHEMA.fields) lot.values[k] = k in seeded ? seeded[k] : null;

  // Everything inherited from the approval, in one place, so a reviewer
  // looking at a lot can see what it was produced under without holding the
  // PDF - and so recompute() has somewhere to read the three readouts from
  // (`out: "jmf_ac"` / `"target_va"` / `"min_vma"` on the Lot step).
  // Nested under `values` rather than as a new top-level key because
  // storage.mjs's normaliseLot() keeps only its own key list and would drop
  // it on the first save.
  lot.values.design = {
    source: sourceLabel(a),
    approval: {
      mix_id: a.mix_id || null,
      // The file's claims. When a verification comes back good, the SERVER's
      // recomputed label is the one to show - it is derived from the signed
      // mix id, which is why editing "#467" to "#467PA" cannot survive a
      // check. Both are kept so the disagreement is visible.
      claimed_approval_no: a.approval_no || null,
      claimed_pa: a.pa == null ? null : !!a.pa,
      code: a.code || null,
      issued_at: a.issued_at || null,
      approved_by: a.approved_by || null,
      submitted_by: a.submitted_by || submitterOf(payload),
      // NEVER absent, NEVER true by default.
      verification,
    },
    signature,
    nominal_size: mix ? mix.nominal_size : null,
    // The course the mix is placed in - SURF / BASE / BINDER - when the
    // approval carries a signature to read it off. It is what decides joint
    // cores under Option A ("for surface mixtures only"), so it is carried
    // rather than re-parsed at each use.
    layer: mix && mix.layer ? str(mix.layer) : null,
    // The contract's letting date, carried for one reason: kytc-lookup will
    // not answer without it, and the Lot step's compaction lookup needs that
    // function to find the proposal (it is the only source of the proposal's
    // file name). A lot reopened from its .json would otherwise have lost it
    // and the lookup would be dead on exactly the lots that run for a week.
    letting_date: str(job.letting_date || job.letting) || null,
    designer: str(v.designer) || null,
    submittal_type: str(v.submittal_type) || null,
    // The design's own Class, carried on the envelope as well as being
    // wired to lot_esal_class - the AMAW's "ESAL Class" box, which this
    // form labels AADTT Class. See esalClassFor().
    aadtt_class: aadtt || null,
    // The three the pay schedule reads, and what the Lot step's three
    // readouts print. `min_vma` and sometimes `target_va` are OURS, not
    // KYTC's - `report.derived` is what says which.
    jmf_ac: jmfAc,
    target_va: designTarget != null ? designTarget : bookTarget,
    min_vma: minVma,
    volumetrics: achieved,
    combined_gsb: combinedGsb,
    blend_pct,
    // The design's own Aggregate Structure table, unreshaped - see
    // `aggregateStructure` above. Read-only reference; `lot.rows.blend_pct`
    // above is the plant's working copy of the same components.
    aggregate: aggregateStructure,
    jmf_gradation: jmf,
  };

  // The lot's own measurements are empty by definition - this is a blank lot,
  // and sections.mjs seeds the four fixed sublot rows itself. What IS seeded
  // is the blend, which is the design's, not the lot's.
  lot.rows = {
    blend_pct,
    ...(blendGsb ? { blend_gsb: blendGsb } : {}),
    project_items: projectItems,
    sublot_tickets: [], sublot_volumetrics: [],
    mat_cores: [], joint_cores: [], verification: [],
  };

  lot.extracted_from = sources;

  lot.history = [{
    at: new Date().toISOString(),
    action: 'Opened from a DesignBook approval',
    approval_no: a.approval_no || null,
    mix_id: a.mix_id || null,
    // On the record, in the file, for whoever opens this lot next.
    verification: verification.state,
  }];

  return {
    ok: true,
    lot,
    checks,
    report: { inherited, derived, typed, missing, warnings, verification,
              blocked: blockedBy(missing) },
  };
}

/** What cannot be computed, and what is missing that would let it be.
 *  `pay` appearing here is the one that matters: it means this lot cannot be
 *  paid until somebody supplies the field. */
function blockedBy(missing) {
  const out = {};
  for (const m of missing)
    for (const b of m.blocks || []) (out[b] = out[b] || []).push(m.key);
  return out;
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
const cell = (sheet, ref) => `${sheet}!${ref}`;
const cellRange = (sheet, col, first, count) => `${sheet}!${col}${first}:${col}${first + count - 1}`;

function sourceLabel(a) {
  const n = a && (a.approval_no || a.mix_id);
  return n ? `DesignBook approval ${n}` : 'DesignBook approval';
}

/** RAP by Type & size, never by Producer — `aggregate_types` carries
 *  `Coarse RAP`, `Fine RAP` and `Intermediate RAP`, and that is where a real
 *  MixPack puts it (CLAUDE.md, `isRapRow()`). */
function isRapType(typeSize) {
  return /\bRAP\b|\bR\.A\.P\b/i.test(str(typeSize));
}

// DesignBook's sieve keys, in the AMAW's own row order. The 1/4" slot is
// deliberately `null`: NEITHER book carries that sieve — a real MixPack
// reads "N / A" there and `Gradation` row 16 is empty in both of Jake's real
// lots — so it stays blank rather than shifting the thirteen below it up a
// row, which is precisely the class of bug the SheetJS chartsheet note in
// CLAUDE.md is about, one sheet over. The WORKBOOK keeps all fourteen rows;
// this list is fourteen long to match it, not to match either form.
const JMF_SIEVE_KEYS = [
  's50', 's37_5', 's25', 's19', 's12_5', 's9_5',
  null,                       // 1/4" — AMAW has the row, DesignBook does not
  's4_75', 's2_36', 's1_18', 's0_6', 's0_3', 's0_15', 's0_075',
];

function gradationJmf(values) {
  return GRADATION.sieves.map((label, i) => {
    const key = JMF_SIEVE_KEYS[i];
    return {
      sieve: label,
      row: GRADATION.first + i,
      // The DesignBook field this came from, and the PlantBook field it goes
      // to. `sections.mjs` keys its seven gradation columns `<col>_<sieve>`
      // (RENDERER GAP (3) there), so the JMF target column is `jmf_s50` and
      // so on. PlantBook's list carried a 1/4" (`s6_3`) until 2026-09-13 and
      // no longer does, so index 6 now has no field at EITHER end - it is a
      // workbook row and nothing else.
      key,
      schemaKey: key ? `jmf_${key}` : null,
      pct: key ? num(values[key]) : null,
    };
  });
}

export default { approvalChecks, lotFromApproval, verifyRequest, readVerifyResponse, notChecked };
