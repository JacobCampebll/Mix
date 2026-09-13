#!/usr/bin/env node
/**
 * check_notes.mjs — the compaction-option reader, netlify/functions/kytc-notes.
 *
 * Two halves, because they fail differently.
 *
 * The PARSER is checked against fixtures and always runs. The fixtures are
 * the real extracted text of two real proposals - 262120, which is the
 * per-route case (OPTION A (KY 627) and OPTION B (US 25) on facing pages),
 * and 252112, the ordinary single-note case whose OPTION A runs straight
 * into the page footer. Both decoys the real document contains are here too:
 * the table of contents' "COMPACTION OPTION A" and the KYCT note's "the
 * Option A or Option B test fixture", either of which a looser match reads
 * as a compaction note.
 *
 *     node scripts/kytc/check_notes.mjs
 *
 * The LIVE half needs transportation.ky.gov and is opt-in, because a slow
 * or unreachable KYTC site is not a failure of this code and a check that
 * goes red for it stops being read:
 *
 *     node scripts/kytc/check_notes.mjs --live
 *
 * What the live half is really proving is the PDF reader, which the
 * fixtures cannot: that these proposals' special-note pages decode to
 * English at all. See pdfText()'s note on subsetted CID fonts - the same
 * proposal's Project(s) page does not, which is exactly why hasText()
 * exists and why a failure there has to be a stated failure and never a
 * guess.
 */
import handler, { parseOptions, isProposalName } from '../../netlify/functions/kytc-notes.mjs';

let pass = 0, fail = 0, skipped = 0;
const head = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);
const ok = (label, cond, got) => {
  if (cond) { console.log(`  ok    ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got === undefined ? '' : `  got ${JSON.stringify(got)}`}`); fail++; }
};
const skip = (label, why) => { console.log(`  skip  ${label}  (${why})`); skipped++; };

// ---------------------------------------------------------------------
// Fixtures — real extracted text, wrapped exactly as the PDF wraps it.
// ---------------------------------------------------------------------
const TWO_ROUTES = [
  'monies with a change order.',
  ' ',
  'OPTION A (KY 627)',
  'Be advised that the Department will accept compaction of asphalt mixtures furnished for driving lanes and ramps, at 1 inch (25mm) or',
  'greater, on this project according to OPTION A in accordance with Section 402 and Section 403 of the current Standard',
  'Specifications.  The Department will require joint cores as described in Section 402.03.02 for surface mixtures only.  The Department',
  'will accept compaction of all other asphalt mixtures according to OPTION B.',
  ' ',
  'OPTION B (US 25)',
  'Be advised that the Department will control and accept compaction of asphalt mixtures furnished on this project under OPTION B in',
  'accordance with Sections 402 and 403.',
  ' ',
  'MATERIAL TRANSFER VEHICLE (MTV) (KY 627)',
].join('\n');

// 252112: one note, and it is the last thing on its page, so the three-line
// page footer follows it with no blank line between.
const ONE_NOTE = [
  'OPTION A',
  'Be advised that the Department will accept compaction of asphalt mixtures furnished for driving lanes and ramps, at 1 inch (25mm) or',
  'greater, on this project according to OPTION A in accordance with Section 402 and Section 403 of the current Standard',
  'Specifications.  The Department will require joint cores as described in Section 402.03.02 for surface mixtures only.  The Department',
  'will accept compaction of all other asphalt mixtures according to OPTION B.',
  'MADISON COUNTY',
  'FD05 076 0025 016-021',
  'Contract ID:  252112',
].join('\n');

const DECOYS = [
  'FUEL AND ASPHALT PAY ADJUSTMENT',
  'COMPACTION OPTION A',
  'COMPACTION OPTION B',
  'MATERIAL TRANSFER VEHICLE (MTV)',
  '',
  'the Option A or Option B test fixture is required. If the IDT-HT specimen',
  'is tested at 50 degrees C, compaction of the specimen shall follow KM 64-435.',
].join('\n');

// ---------------------------------------------------------------------
head('1. Two routes, two notes');
{
  const o = parseOptions(TWO_ROUTES);
  ok('both notes found', o.length === 2, o.map((x) => x.option));
  ok('the first is OPTION A on KY 627', o[0] && o[0].option === 'A' && o[0].route === 'KY 627', o[0]);
  ok('the second is OPTION B on US 25', o[1] && o[1].option === 'B' && o[1].route === 'US 25', o[1]);
  // The reason the whole function returns a list: nothing here can say which
  // stretch a lot paved, so filling the field from either would be a guess.
  ok('Option A requires joint cores', o[0] && o[0].joint_cores === true, o[0] && o[0].joint_cores);
  ok('Option B does NOT - it takes no cores at all', o[1] && o[1].joint_cores === false, o[1] && o[1].joint_cores);
  ok('the body stops at the next heading, not at the MTV note',
     o[1] && !/MATERIAL TRANSFER/i.test(o[1].text), o[1] && o[1].text);
}

head('2. One note, running into the page footer');
{
  const o = parseOptions(ONE_NOTE);
  ok('one note found', o.length === 1, o.map((x) => x.option));
  ok('a bare OPTION A has no route', o[0] && o[0].option === 'A' && o[0].route === null, o[0]);
  ok('it requires joint cores', o[0] && o[0].joint_cores === true);
  // Without the footer test the returned sentence ends "...according to
  // OPTION B. MADISON COUNTY FD05 076 0025 016-021 Contract ID: 252112",
  // which is what the page prints to the technician.
  ok('the footer is not part of the note',
     o[0] && !/MADISON COUNTY|Contract ID/i.test(o[0].text), o[0] && o[0].text);
  ok('...and the note still ends with its own last sentence',
     o[0] && /according to OPTION B\.$/.test(o[0].text), o[0] && o[0].text.slice(-40));
}

head('3. The two decoys in every one of these proposals');
{
  const o = parseOptions(DECOYS);
  ok('neither the contents listing nor the KYCT sentence is read as a note', o.length === 0, o);
}

head('4. Shapes that must not produce an answer');
{
  ok('empty text', parseOptions('').length === 0);
  // A heading with no compaction prose under it is not this note. Guessing
  // "A" off a bare heading is exactly the failure worth refusing: a wrong
  // option weighs every pay property at zero.
  ok('a heading with nothing under it', parseOptions('OPTION A\n\nsomething else').length === 0);
  ok('a heading whose body is about something else',
     parseOptions('OPTION A\nBe advised that the Department will apply Pavement Rideability Requirements.').length === 0);
  // One proposal repeats its note across sections; a route is what makes two
  // notes two facts.
  const dup = parseOptions([ONE_NOTE, '', ONE_NOTE].join('\n'));
  ok('the same note twice is one note', dup.length === 1, dup.length);
}

head('5. The request guards');
{
  const call = async (q) => {
    const res = await handler(new Request(`https://example.invalid/f?${q}`));
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  // Every one of these is refused before any fetch happens, so this whole
  // section stays offline - which is the point of validating the name rather
  // than letting a bad one become a request.
  ok('a five-digit cid is refused', (await call('cid=26212&proposal=x.pdf')).status === 400);
  ok('a missing proposal name is refused', (await call('cid=262120')).status === 400);
  ok('a path is refused', (await call('cid=262120&proposal=../../etc/passwd')).status === 400);
  ok('an absolute URL is refused', (await call('cid=262120&proposal=https://elsewhere/x.pdf')).status === 400);
  ok('a non-pdf is refused', (await call('cid=262120&proposal=notes.html')).status === 400);
  // The name itself rather than a request, so proving that a real proposal
  // name IS accepted does not mean downloading five megabytes.
  ok('a real proposal name is accepted', isProposalName('404-MADISON-26-2120.pdf'));
  ok('...and so is the other one', isProposalName('323-MADISON-25-2112.pdf'));
  ok('a bare directory is not', !isProposalName('../'));
  ok('an encoded traversal is not', !isProposalName('%2e%2e/x.pdf'));
  const post = await handler(new Request('https://example.invalid/f?cid=262120&proposal=x.pdf', { method: 'POST' }));
  ok('POST is refused', post.status === 405);
}

// ---------------------------------------------------------------------
head('6. Against the real proposals');
if (!process.argv.includes('--live')) {
  skip('262120 and 252112 from transportation.ky.gov', 'pass --live to fetch them');
} else {
  const cases = [
    { cid: '262120', file: '404-MADISON-26-2120.pdf', want: ['A|KY 627', 'B|US 25'] },
    { cid: '252112', file: '323-MADISON-25-2112.pdf', want: ['A|'] },
  ];
  for (const c of cases) {
    const res = await handler(new Request(`https://example.invalid/f?cid=${c.cid}&proposal=${c.file}`));
    const body = await res.json().catch(() => null);
    if (res.status !== 200) {
      ok(`${c.cid} answered`, false, body && body.error);
      continue;
    }
    const got = (body.options || []).map((o) => `${o.option}|${o.route || ''}`);
    ok(`${c.cid}: ${c.want.join(', ')}`, JSON.stringify(got) === JSON.stringify(c.want), got);
    ok(`${c.cid}: routed is ${c.want.length > 1}`, body.routed === (c.want.length > 1), body.routed);
  }
  // The contract-ID cross-check: the file name carries a call number, not a
  // contract, so this is the only thing standing between a mistyped
  // source_filename and a confidently wrong answer.
  const wrong = await handler(new Request('https://example.invalid/f?cid=999999&proposal=404-MADISON-26-2120.pdf'));
  ok('a proposal that does not mention the contract is refused', wrong.status === 409, wrong.status);
}

head('Result');
console.log(`${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail ? 1 : 0);
