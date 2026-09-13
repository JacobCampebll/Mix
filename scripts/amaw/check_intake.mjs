#!/usr/bin/env node
// Ground truth for the approval intake.
//
//   node scripts/amaw/check_intake.mjs [dir-of-payloads]
//
// The intake is a GATE, so the only evidence worth having is real files: a
// real approval PDF opens a lot with the right numbers in it, and the three
// documents that are NOT an approval are turned away with a reason someone
// could act on. Everything below runs against payloads read out of PDFs
// designbook.html actually produced — its own buildApprovalPDF() /
// buildReviewPDF(), read back through its own readHandoffPDF().
//
// WHERE THE FIXTURES COME FROM. designbook.html is a browser page: it needs
// pdf-lib, SheetJS and a DOM to build one of these, so the PDFs themselves
// are made by a headless-browser probe rather than here (see the note at the
// bottom of this file for the exact steps). The probe writes three JSON
// payloads — payload_approval.json, payload_review.json, payload_submittal.json
// — and this script runs the intake against them. They carry real contractor
// data, so they are NOT committed: same rule as check_pay.mjs, which takes
// paths to real AMAWs rather than shipping one.
//
// Point it at a directory holding the three files; it defaults to this
// session's scratchpad. WITHOUT them it still runs every check it can from
// payloads it builds itself, and says loudly which half it skipped — what it
// will not do is report a pass it did not earn.
import fs from 'node:fs';
import path from 'node:path';
import {
  approvalChecks, lotFromApproval, verifyRequest, readVerifyResponse, notChecked,
  VERIFICATION, FAILURE, DOC_KIND, isVerified, mixTypeFor, jointDensityFor, esalClassFor,
} from './intake.mjs';
import { normaliseLot, lotSummary } from './storage.mjs';
import { lotPay, sublotPay } from './pay.mjs';

const DIR = process.argv[2] ||
  '/tmp/claude-0/-home-user-Mix/c9cd3888-ef57-5ba4-8674-a56236907f1c/scratchpad';

let pass = 0, fail = 0, skipped = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail == null ? '' : `  -> ${JSON.stringify(detail)}`}`); }
};
const skip = (name, why) => { skipped++; console.log(`  skip  ${name}  (${why})`); };
const head = (s) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

function load(name) {
  const p = path.join(DIR, name);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

const approval = load('payload_approval.json');
const review = load('payload_review.json');
const submittal = load('payload_submittal.json');

// =====================================================================
//  1. A real approval opens a lot, with the right inherited values
// =====================================================================
head('1. An approval payload seeds a lot');

if (!approval) {
  skip('every check in this section', `no payload_approval.json in ${DIR}`);
} else {
  // The finding this whole section rests on, and it is worth asserting rather
  // than only writing down: a REAL approval PDF, built by the live page, says
  // doc_kind "review". If designbook.html is ever fixed this assertion flips
  // and the intake needs re-reading, which is the point of asserting it.
  const c = approvalChecks(approval);
  ok('an approval payload passes the gate', c.ok, c.failures);
  ok('doc_kind on a real approval is NOT "approval"', c.doc.kind_declared !== DOC_KIND.approval,
     { declared: c.doc.kind_declared });
  ok('...it is "review", so doc_kind cannot be the test', c.doc.kind_declared === DOC_KIND.review,
     { declared: c.doc.kind_declared });
  ok('kind_effective resolves it from the approval block instead',
     c.doc.kind_effective === DOC_KIND.approval, c.doc);
  ok('kind_is_reliable says the two disagree', c.doc.kind_is_reliable === false, c.doc);

  const r = lotFromApproval(approval, { lotNumber: 1 });
  ok('lotFromApproval returns a lot', r.ok && !!r.lot, r.checks && r.checks.failures);

  if (r.ok) {
    const lot = r.lot, d = lot.values.design;
    const got = (k) => (r.report.inherited.concat(r.report.derived).find((x) => x.key === k) || {}).value;

    // --- identity, straight off the approval -------------------------
    ok('contract inherited', lot.contract_id === approval.job.cid, lot.contract_id);
    ok('plant inherited', lot.amp_number === approval.job.plant, lot.amp_number);
    ok('mix id is KYTC\'s own, off the approval', lot.mix_id === approval.approval.mix_id, lot.mix_id);
    ok('mix signature inherited', lot.mix_signature === approval.mix.signature, lot.mix_signature);
    ok('county inherited', lot.values.lot_county === approval.values.county, lot.values.lot_county);
    ok("mix designation is \"<mix id> <signature>\" as 'Pay Values'!D9 spells it",
       lot.values.lot_mix_id === `${approval.approval.mix_id} ${approval.mix.signature}`,
       lot.values.lot_mix_id);

    // --- the three numbers lot pay is measured against ---------------
    const dvPb = parseFloat(approval.values.design_values.design_pb);
    ok('JMF %AC inherited from the design Pb', d.jmf_ac === dvPb, { got: d.jmf_ac, want: dvPb });
    ok('JMF %AC is reported as INHERITED, not derived',
       r.report.inherited.some((x) => x.key === 'jmf_ac'), r.report.derived.map((x) => x.key));
    ok("JMF %AC names 'Pay Values' A13:A16",
       (r.report.inherited.find((x) => x.key === 'jmf_ac') || {}).to === "Pay Values!A13:A16");

    const mt = mixTypeFor(approval.values.nominal_size + approval.values.mix_type);
    ok('mixture type code resolved (Superpave 0.38 -> 5)', mt && mt.code === 5, mt);
    ok('lot carries the mixture type code', lot.values.lot_mix_type_code === 5, lot.values.lot_mix_type_code);

    ok('target air voids inherited from the design target', d.target_va === 3.5, d.target_va);
    ok('minimum VMA present', d.min_vma === 15, d.min_vma);
    // The honest half: min VMA is OURS, not KYTC's. A page that shows it as
    // if the approval said so is lying by omission.
    ok('minimum VMA is reported as DERIVED, not inherited',
       r.report.derived.some((x) => x.key === 'min_vma') &&
       !r.report.inherited.some((x) => x.key === 'min_vma'), r.report.derived.map((x) => x.key));
    ok('...and the derivation says why',
       /ACHIEVED/.test((r.report.derived.find((x) => x.key === 'min_vma') || {}).how || ''));

    // --- these three are exactly what pay.mjs needs ------------------
    // Not a re-test of pay.mjs (check_pay.mjs does that against real lots) -
    // the point is that the intake's output plugs straight into it, which is
    // the reason the intake exists.
    const s = sublotPay({ jmfAC: d.jmf_ac, ac: d.jmf_ac + 0.55,
                          targetAV: d.target_va, av: 3.9,
                          minVMA: d.min_vma, vma: 15.6,
                          esalClass: 3, mixTypeCode: lot.values.lot_mix_type_code });
    ok('the inherited triple computes an AC pay band', s.ac.pay === 95, s.ac);
    ok('...an air-void pay band', s.av.pay != null, s.av);
    ok('...and a VMA pay band', s.vma.pay != null, s.vma);

    // --- blend, Gsb, gradation ---------------------------------------
    ok('blend inherited, one row per design component',
       d.blend.length === (approval.rows.aggregate || []).length, d.blend.length);
    ok('blend carries type & size and BOD specific gravity',
       d.blend.every((b) => b.type_size && b.bod != null));
    ok('the RAP row is found by Type & size, not by Producer',
       d.blend.some((b) => b._rap) === (approval.rows.aggregate || []).some((x) => /RAP/i.test(x.type_size || '')),
       d.blend.filter((b) => b._rap).map((b) => b.type_size));
    ok('NO AGP code came across - the payload does not carry one',
       d.blend.every((b) => b.agp === null));
    ok('...and the report says a technician still owes it',
       r.report.typed.some((t) => t.key === 'blend[].agp'));
    // The blend has to land under sections.mjs's own column keys or the form
    // renders six empty rows and nobody notices.
    ok('blend rows use the schema\'s column keys',
       d.blend.every((b) => 'producer' in b && 'agp' in b && 'type_size' in b && 'bod' in b && 'pct_1' in b && 'pct_4' in b),
       Object.keys(d.blend[0] || {}));
    ok('the design\'s percentage is seeded into all four sublot columns',
       d.blend.every((b) => b.pct_1 === b.pct_4), d.blend.map((b) => [b.pct_1, b.pct_4]));
    ok('combined Gsb is seeded across the blend_gsb row',
       lot.rows.blend_gsb[0].gsb_1 === d.combined_gsb && lot.rows.blend_gsb[0].gsb_4 === d.combined_gsb,
       lot.rows.blend_gsb);
    ok('the JMF gradation is also seeded as jmf_<sieve> form fields',
       lot.values.jmf_s0_075 === parseFloat(approval.values.s0_075),
       { s200: lot.values.jmf_s0_075 });
    // The 1/4" came off PlantBook's sieve list on 2026-09-13 - `Gradation`
    // row 16 is empty in both real lots, so it was seven columns nobody could
    // fill. This asserted `jmf_s6_3 === null` while the field existed; now it
    // must not exist at all, at either end of the mapping. The WORKBOOK row
    // survives and is checked separately below.
    ok('no 1/4" field is seeded at all',
       !('jmf_s6_3' in lot.values) && !Object.keys(lot.values).some((k) => /s6_3$/.test(k)),
       Object.keys(lot.values).filter((k) => /s6_3/.test(k)));
    ok('nothing was seeded under a key sections.mjs does not have',
       !r.report.warnings.some((w) => w.code === 'schema-drift'),
       r.report.warnings.filter((w) => w.code === 'schema-drift'));
    // The example field here was lot_unit_price until it became a seeded spec
    // constant on 2026-09-13. lot_wedge_tons is the replacement and a better
    // one: it is optional, blank in BOTH real lots, and nothing derives it -
    // so it should stay null for as long as this assertion is worth making.
    ok('every schema field is present on the lot, null where unfilled',
       'lot_wedge_tons' in lot.values && lot.values.lot_wedge_tons === null);
    ok('combined Gsb inherited', d.combined_gsb === parseFloat(approval.values.fourpoint['const:fp_gsb']),
       d.combined_gsb);
    ok('JMF gradation has the AMAW\'s fourteen slots', d.jmf_gradation.length === 14, d.jmf_gradation.length);
    // The workbook keeps all fourteen rows even though neither book now has a
    // field for the 1/4". This is the assertion that stops anyone "tidying"
    // the address map to match the form and shifting #4..#200 up a row.
    ok('the 1/4" slot is blank, not shifted',
       d.jmf_gradation.length === 14 && d.jmf_gradation[6].sieve === '1/4"' &&
       d.jmf_gradation[6].pct === null && d.jmf_gradation[6].schemaKey === null &&
       d.jmf_gradation[7].sieve === '#4', d.jmf_gradation[6]);
    ok('#200 lands on the last row against the design\'s own #200',
       d.jmf_gradation[13].pct === parseFloat(approval.values.s0_075), d.jmf_gradation[13]);

    // --- verification, the rule that is not negotiable ---------------
    ok('an un-verified lot is stamped not-checked',
       d.approval.verification.state === VERIFICATION.NOT_CHECKED, d.approval.verification);
    ok('isVerified() says no', isVerified(d.approval.verification) === false);
    ok('the history entry records the verification state',
       lot.history[0].verification === VERIFICATION.NOT_CHECKED, lot.history[0]);
    ok('the file\'s own approval number is stored as CLAIMED',
       d.approval.claimed_approval_no === approval.approval.approval_no &&
       !('approval_no' in d.approval), Object.keys(d.approval));

    // --- what a technician still types --------------------------------
    const typedKeys = r.report.typed.map((t) => t.key);
    for (const k of ['lot_acceptance_method', 'lot_density_option', 'sublot_tests'])
      ok(`report.typed names ${k}`, typedKeys.includes(k), typedKeys);
    // lot_unit_price came off that list on 2026-09-13, once the $50 turned out
    // to be the spec's defined adjustment price (402.05.02) rather than a bid
    // price that varies by contract. Same both-ways-round assertion as
    // lot_tons, and one extra: it must NOT be the contract's bid price, which
    // is the bug this replaced.
    ok('lot_unit_price is seeded from the spec constant, not asked for',
       Number(lot.values.lot_unit_price) === 50, lot.values.lot_unit_price);
    ok('...and is not also listed as still to type',
       !typedKeys.includes('lot_unit_price'), typedKeys);
    ok('report.derived names lot_unit_price',
       r.report.derived.some((d2) => d2.key === 'lot_unit_price'),
       r.report.derived.map((d2) => d2.key));
    // lot_joint_density came off that list on 2026-09-13. Joint cores are
    // taken on surface mixtures at 1 inch or greater and on nothing else, so
    // the mix settles it and the approval carries the mix. Asserted both ways
    // round for the same reason lot_tons is: derived AND still listed is the
    // worse bug of the two.
    ok('lot_joint_density is derived from the mix, not asked for',
       String(lot.values.lot_joint_density) === '1', lot.values.lot_joint_density);
    ok('...and is not also listed as still to type',
       !typedKeys.includes('lot_joint_density'), typedKeys);
    ok('report.derived names lot_joint_density',
       r.report.derived.some((d2) => d2.key === 'lot_joint_density'),
       r.report.derived.map((d2) => d2.key));
    // lot_tons was on that list until 2026-09-13. A lot IS 4,000 tons - it is
    // the definition rather than a default anyone chose, and both real lots
    // carry exactly 4000 - so it is seeded and stays editable for the short
    // final lot of a job. Asserted both ways round, because a value that is
    // seeded AND still listed as something to type is the worse bug: it tells
    // a technician to supply a figure the form already holds.
    ok('lot_tons is seeded, not asked for', Number(lot.values.lot_tons) === 4000,
       lot.values.lot_tons);
    ok('...and is not also listed as still to type', !typedKeys.includes('lot_tons'), typedKeys);
    ok('report.derived names lot_tons',
       r.report.derived.some((d2) => d2.key === 'lot_tons'),
       r.report.derived.map((d2) => d2.key));
    ok('a lot number the caller supplied is NOT listed as still to type',
       !typedKeys.includes('lot_number'), typedKeys);
    ok('...but a defaulted one is',
       lotFromApproval(approval).report.typed.some((t) => t.key === 'lot_number'));
    // The trap worth a test of its own: AADTT Class is on the approval and
    // must NOT be wired to the AMAW's ESAL Class. Two scales that overlap on
    // 2/3/4 is the worst possible shape for a silent mis-mapping.
    // INVERTED 2026-09-13. This asserted the opposite for one day, on the
    // reading that ESAL Class and AADTT Class are different scales. They are
    // not: the AMAW kept the old ESAL-era label after the spec renamed the
    // concept, and the bands this number selects in airVoidPay() are the
    // 2026 spec's AV table whose own columns are headed "AADTT Class 2" and
    // "AADTT Class 3 or 4". See esalClassFor().
    ok('ESAL class IS the design\'s Class',
       String(lot.values.lot_esal_class) === String(approval.values.aadtt_class),
       { esal: lot.values.lot_esal_class, aadtt: d.aadtt_class });
    ok('...and it is not also listed as still to type',
       !typedKeys.includes('lot_esal_class'), typedKeys);
    ok('report.derived names lot_esal_class',
       r.report.derived.some((d2) => d2.key === 'lot_esal_class'),
       r.report.derived.map((d2) => d2.key));
    ok('the design\'s Class is still carried in its own right',
       d.aadtt_class === String(approval.values.aadtt_class), d.aadtt_class);

    // --- the lot is a real storage.mjs envelope ----------------------
    const round = normaliseLot(JSON.parse(JSON.stringify(lot)));
    ok('the lot survives normaliseLot() unchanged',
       JSON.stringify(round.values) === JSON.stringify(lot.values) &&
       round.key === lot.key, { key: round.key });
    ok('...including everything inherited (nothing parked on a top-level key)',
       JSON.stringify(round.values.design) === JSON.stringify(d));
    const sum = lotSummary(round);
    ok('lotSummary() reads it', sum.mix_id === lot.mix_id && sum.records_entered === 0, sum);
    ok('a blank lot has no records yet', Object.keys(lot.records).length === 0);
    ok('extracted_from records where each inherited value came from',
       Object.keys(lot.extracted_from).length > 0 &&
       Object.values(lot.extracted_from).every((s2) => /DesignBook approval/.test(s2)),
       Object.keys(lot.extracted_from).length);

    // --- pay is not blocked -------------------------------------------
    ok('nothing the approval owed is missing', r.report.missing.length === 0,
       r.report.missing.map((m) => m.key));
    ok('pay is not blocked by anything the approval failed to carry',
       !r.report.blocked.pay, r.report.blocked);
  }
}

// =====================================================================
//  2. A review copy is refused, with a reason
// =====================================================================
head('2. A review PDF is refused');

if (!review) {
  skip('every check in this section', `no payload_review.json in ${DIR}`);
} else {
  const c = approvalChecks(review);
  ok('a review copy does NOT pass the gate', c.ok === false);
  ok('the failure is no-approval', c.failures.some((f) => f.code === FAILURE.NO_APPROVAL),
     c.failures.map((f) => f.code));
  const m = (c.failures.find((f) => f.code === FAILURE.NO_APPROVAL) || {}).message || '';
  ok('the reason names what it actually is (a review copy)', /review copy/i.test(m), m);
  ok('...and says what to upload instead', /verification code/i.test(m), m);
  ok('no verify request is shaped for a file with nothing to check', c.verify === null);

  const r = lotFromApproval(review);
  ok('lotFromApproval refuses it outright', r.ok === false && r.lot === null);
  ok('...and hands back the same failures rather than a half-built lot',
     r.report === null && r.checks.failures.length > 0);
}

if (!submittal) {
  skip('a submittal is refused and named as one', `no payload_submittal.json in ${DIR}`);
} else {
  const c = approvalChecks(submittal);
  ok('a submittal does NOT pass the gate', c.ok === false);
  const m = (c.failures.find((f) => f.code === FAILURE.NO_APPROVAL) || {}).message || '';
  ok('the reason names it as the submittal, not as "a review copy"', /submittal/i.test(m), m);
  ok('doc_kind "submittal" IS trustworthy when it is set', c.doc.kind_effective === DOC_KIND.submittal);
}

// =====================================================================
//  3. Payloads with no approval block at all
// =====================================================================
head('3. No approval block, and other refusals');

// Built here rather than loaded: these are the shapes a real file can take
// that no PDF on disk happens to be.
const base = approval || review || {
  format: 'kytc-designbook', version: 1, doc_kind: 'review',
  job: { cid: '262120', letting: '2026-02-19', plant: 'AMP070301' },
  values: {}, rows: {},
};
const without = (p, mutate) => { const c = JSON.parse(JSON.stringify(p)); mutate(c); return c; };

{
  const p = without(base, (c) => { delete c.approval; });
  const r = lotFromApproval(p);
  ok('a payload with no approval block is refused', r.ok === false && r.lot === null);
  ok('...with code no-approval', r.checks.failures.some((f) => f.code === FAILURE.NO_APPROVAL));
}
{
  // The nastiest near-miss: an approval block that exists but is not
  // checkable. verify-approval would 400 on it, and "bad request" is not
  // something a technician can act on, so the gate has to catch it first.
  const p = without(base, (c) => { c.approval = { approval_no: '#467PA', code: 'AAAA-BBBB-CCCC' }; });
  const r = approvalChecks(p);
  ok('a partial approval block is refused', r.ok === false);
  ok('...with code approval-incomplete',
     r.failures.some((f) => f.code === FAILURE.APPROVAL_INCOMPLETE), r.failures.map((f) => f.code));
  ok('...naming exactly the fields verify-approval requires',
     JSON.stringify((r.failures.find((f) => f.code === FAILURE.APPROVAL_INCOMPLETE) || {}).missing) ===
     JSON.stringify(['issued_at', 'approved_by', 'mix_id']));
}
{
  const r = approvalChecks({ format: 'something-else', version: 1, job: { cid: '1' } });
  ok('a PDF we did not make is refused', r.failures.some((f) => f.code === FAILURE.NOT_DESIGNBOOK));
}
{
  const r = approvalChecks(without(base, (c) => { c.version = 99; }));
  ok('a payload from a newer DesignBook is refused rather than half-read',
     r.failures.some((f) => f.code === FAILURE.NEWER_VERSION));
}
{
  const r = approvalChecks(without(base, (c) => { c.job = {}; }));
  ok('a payload with no contract is refused', r.failures.some((f) => f.code === FAILURE.NO_CONTRACT));
}
{
  ok('a null payload is refused without throwing',
     approvalChecks(null).failures.some((f) => f.code === FAILURE.NOT_A_PAYLOAD));
  ok('...and so is a string', approvalChecks('hello').ok === false);
}

// =====================================================================
//  3b. Warnings — a file that is genuinely approved and still says something odd
// =====================================================================
head('3b. Warnings, not refusals');

if (!approval) {
  skip('every check in this section', 'no approval payload');
} else {
  // The design was built to one air-void target and the workbook looks up
  // another. Not a refusal - the lot is real - but the pay cells use the
  // workbook's, so somebody has to look.
  const t = without(approval, (c) => { c.values.fourpoint['const:fp_vatgt'] = '4.0'; });
  const r = lotFromApproval(t, { lotNumber: 1 });
  ok('a disagreeing air-void target warns rather than refusing',
     r.ok && r.report.warnings.some((w) => w.code === 'target-va-disagrees'),
     r.report && r.report.warnings);

  // An approval whose stage was edited, and a submittal carrying an approval
  // block. Both open - the signature is what decides, not the label - and
  // both say so.
  const st = approvalChecks(without(approval, (c) => { c.stage = 'Draft'; }));
  ok('a stage that disagrees with the approval warns, and still passes',
     st.ok && st.warnings.some((w) => w.code === 'stage-disagrees'), st.warnings);
  const sb2 = approvalChecks(without(approval, (c) => { c.doc_kind = 'submittal'; }));
  ok('a submittal label over an approval block warns, and still passes',
     sb2.ok && sb2.warnings.some((w) => w.code === 'submittal-carrying-approval'), sb2.warnings);

  // Eight digits is the shape (Jake, 2026-09-13), so DesignBook's own id is
  // carried through and nothing warns about it.
  ok('the eight-digit DesignBook mix id is carried without a shape warning',
     !lotFromApproval(approval).report.warnings.some((w) => w.code === 'mix-id-shape'));
}

// The mixture-type table, read off the blank VER 14.01 template. Every size
// DesignBook offers has to resolve, including the No. 4 family, whose token
// broke parseSignature() once already (CLAUDE.md).
head('3c. Mixture type codes');
for (const [token, code] of [['1.50A', 1], ['1.00', 2], ['0.75B', 3], ['0.50A', 4],
                             ['0.38B', 5], ['NO.4B', 14], ['NO.4', 14]])
  ok(`${token} -> ${code}`, (mixTypeFor(token) || {}).code === code, mixTypeFor(token));
ok('an unknown size resolves to nothing rather than to a default',
   mixTypeFor('0.62A') === null && mixTypeFor('') === null);

// Joint density, settled by the mix. The three answers are deliberately
// distinct: '1' and '2' are both facts, null is "the approval does not say
// which course this is" - and null must never collapse into '2', which would
// silently drop a surface lot's joint-density pay to no deduction at all.
head('3d. Joint density from the mix');
for (const [mix, want, why] of [
  [{ layer: 'SURF', nominal_size: '0.38A' }, '1', 'surface 0.38 takes joint cores'],
  [{ layer: 'SURF', nominal_size: '0.50B' }, '1', 'surface 0.50 takes joint cores'],
  [{ layer: 'SURF', nominal_size: 'NO.4B' }, '2', 'a No. 4 surface is a thin lift - under 1 inch, so no joint cores'],
  [{ layer: 'BASE', nominal_size: '0.75A' }, '2', 'a base mix takes no joint cores'],
  [{ layer: 'INT',  nominal_size: '0.50A' }, '2', 'an intermediate 0.50 takes no joint cores'],
  [{ layer: null,   nominal_size: '0.38A' }, null, 'an unknown course is not an answer'],
  [{ layer: 'SURF', nominal_size: null    }, null, 'an unknown size is not an answer'],
  [null, null, 'no mix at all is not an answer'],
]) ok(why, jointDensityFor(mix) === want, jointDensityFor(mix));

// ESAL Class off the design's Class. The AADTT field wins over the
// signature's CL prefix because a human confirmed the former on the form.
head('3e. ESAL Class from the design\'s Class');
for (const [mix, aadtt, want, why] of [
  [{ mix_class: 3 }, null, '3', 'CL3 -> 3'],
  [{ mix_class: 2 }, null, '2', 'CL2 -> 2'],
  [{ mix_class: 4 }, null, '4', 'CL4 -> 4'],
  [null, '3', '3', 'the AADTT field alone answers'],
  [null, 'CL2', '2', "a 'CL2' spelling is accepted"],
  [{ mix_class: 3 }, '2', '2', 'the AADTT field wins over the signature'],
  [null, '5', null, 'a class outside 1-4 is refused, not clamped'],
  [null, null, null, 'no class at all is not an answer'],
]) ok(why, esalClassFor(mix, aadtt) === want, esalClassFor(mix, aadtt));

// =====================================================================
//  4. The verify-approval request, and reading its answer
// =====================================================================
head('4. verify-approval: request shape and answers');

// APPROVAL_SIGNING_SECRET is a Netlify environment variable and is not
// available here, so the SIGNATURE cannot be exercised from this machine —
// and it must not be faked. What IS testable, and is the part that breaks
// silently, is the request shape: verify-approval recomputes the HMAC over
// the payload verbatim, so a payload that is normalised, re-keyed or coerced
// on the way out stops verifying with no visible cause.
if (!approval) {
  skip('request shaping', 'no approval payload to shape a request from');
} else {
  const req = verifyRequest(approval);
  ok('POSTs to the live Function path', req.url === '/.netlify/functions/verify-approval' && req.method === 'POST');
  ok('sends exactly { payload, approval } - what verify.html sends',
     JSON.stringify(Object.keys(req.body).sort()) === JSON.stringify(['approval', 'payload']));
  ok('the approval sent is the file\'s own block', req.body.approval === approval.approval);
  ok('the payload is passed through BY REFERENCE, untouched', req.body.payload === approval);
  ok('...and serialises byte-identically to what came out of the PDF',
     JSON.stringify(req.body.payload) === JSON.stringify(approval));
  ok('no Authorization header - verification is deliberately open',
     !Object.keys(req.headers).some((h) => /authorization/i.test(h)), req.headers);
  ok('the four fields verify-approval requires are all present',
     ['code', 'issued_at', 'approved_by', 'mix_id'].every((k) => req.body.approval[k]));
}

// Every answer verify-approval can give, read back. Shapes taken from the
// Function itself, not invented.
const answers = [
  [{ status: 200, body: { valid: true, mix_id: '00260467', approval_no: '#467PA', pa: true,
                          approved_by: 'agdenmak', submitted_by: 'jcampbe2', issued_at: 'x' } },
   VERIFICATION.VERIFIED, 'a good signature'],
  [{ status: 200, body: { valid: false, error: 'This does not match an approval issued by KYTC.' } },
   VERIFICATION.INVALID, 'a bad signature'],
  [{ status: 400, body: { error: 'That file does not carry a complete approval.' } },
   VERIFICATION.REFUSED, 'a refused request'],
  [{ status: 500, body: { error: 'Verification is not configured. Ask an admin.' } },
   VERIFICATION.UNAVAILABLE, 'an unconfigured site'],
  [{ status: 405, body: { error: 'POST only.' } }, VERIFICATION.UNAVAILABLE, 'a wrong method'],
  [{ networkError: new Error('fetch failed') }, VERIFICATION.UNAVAILABLE, 'no answer at all'],
];
for (const [res, want, what] of answers)
  ok(`${what} -> ${want}`, readVerifyResponse(res).state === want, readVerifyResponse(res));

ok('only "verified" reads as verified',
   answers.filter(([res]) => isVerified(readVerifyResponse(res))).length === 1);
ok('notChecked() is not verified', isVerified(notChecked()) === false);

if (approval) {
  // A verified lot takes the SERVER's recomputed label, never the file's -
  // that is the whole reason verify-approval recomputes it (editing "#467" to
  // read "#467PA" must not survive a check).
  const good = readVerifyResponse({ status: 200, body: {
    valid: true, mix_id: approval.approval.mix_id, approval_no: '#467', pa: false,
    approved_by: 'agdenmak', submitted_by: 'jcampbe2', issued_at: approval.approval.issued_at } });
  const r = lotFromApproval(approval, { lotNumber: 2, verification: good });
  const ver = r.lot.values.design.approval;
  ok('a verified lot is stamped verified', isVerified(ver.verification));
  ok('the server\'s recomputed approval number is what the lot carries',
     ver.verification.approval_no === '#467', ver.verification.approval_no);
  ok('...and the file\'s differing claim is kept beside it, not overwritten',
     ver.claimed_approval_no === approval.approval.approval_no, ver.claimed_approval_no);
  ok('the history entry records that it WAS verified',
     r.lot.history[0].verification === VERIFICATION.VERIFIED);

  // An invalid signature does not refuse the intake outright - that is the
  // page's call, and a district office may well want to open the thing to see
  // what it claims. What it must never do is look verified.
  const bad = readVerifyResponse({ status: 200, body: { valid: false, error: 'nope' } });
  const r2 = lotFromApproval(approval, { verification: bad });
  ok('an invalid signature is carried as invalid, never as verified',
     r2.lot.values.design.approval.verification.state === VERIFICATION.INVALID &&
     !isVerified(r2.lot.values.design.approval.verification));
}

// =====================================================================
//  5. A lot with nothing inherited cannot be paid, and says so
// =====================================================================
head('5. Missing pay inputs are reported, not silently zero');

if (!approval) {
  skip('every check in this section', 'no approval payload');
} else {
  const stripped = without(approval, (c) => {
    c.values.design_values = {};
    c.values.nominal_size = ''; c.values.mix_type = '';
    c.mix = null;
  });
  const r = lotFromApproval(stripped);
  ok('the lot still opens - a gap in the design is not a forged approval', r.ok === true);
  const keys = r.report.missing.map((m) => m.key);
  ok('the missing JMF %AC is reported', keys.includes('jmf_ac'), keys);
  ok('the missing mixture type is reported', keys.includes('lot_mix_type_code'), keys);
  ok('the missing VMA minimum is reported', keys.includes('min_vma'), keys);
  ok('report.blocked names pay', Array.isArray(r.report.blocked.pay) && r.report.blocked.pay.length > 0,
     r.report.blocked);
  ok('the lot carries nulls, not zeroes',
     r.lot.values.design.jmf_ac === null && r.lot.values.design.min_vma === null,
     r.lot.values.design);
  // And prove the consequence rather than asserting it: pay.mjs must refuse.
  const p = lotPay({ sublots: [{ ac: 6.0, av: 3.9, vma: 15.6 }], lotNumber: 1,
                     esalClass: 3, mixTypeCode: r.lot.values.lot_mix_type_code ?? 0,
                     tonnage: 4000, unitPrice: 80 });
  ok('pay.mjs cannot produce a final pay without them', p.finalPct === null, p.finalPct);
}

// =====================================================================
head('Result');
console.log(`${pass} passed, ${fail} failed, ${skipped} skipped`);
if (skipped) {
  console.log(`\nSkipped checks need real DesignBook PDFs. To make them, in a headless browser:`);
  console.log(`  1. load public/designbook.html with a Supabase stub and local pdf-lib/SheetJS`);
  console.log(`  2. import a real MixPack through handleFile() so Four Points and Design Values are live`);
  console.log(`  3. buildReviewPDF(handoffPayload())                       -> payload_review.json`);
  console.log(`     buildReviewPDF(freezeSubmittal(handoffPayload()))      -> payload_submittal.json`);
  console.log(`     set state.approval / state.signedDesign, then`);
  console.log(`     buildApprovalPDF(approvedPayload())                    -> payload_approval.json`);
  console.log(`  4. read each one back with readHandoffPDF() and write the payload as JSON into ${DIR}`);
}
process.exit(fail ? 1 : 0);
