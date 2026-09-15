// =====================================================================
//  PlantBook's section schema — the same shape DesignBook's is
// =====================================================================
//
//  CLAUDE.md: "DesignBook and PlantBook are two views of one page, not two
//  pages. They belong in designbook.html, sharing its schema renderer,
//  CONFIG and styling." So this array is not a description of PlantBook —
//  it IS PlantBook, in exactly the shape `CONFIG.SECTIONS` already takes.
//  Splice it in as a sibling array and the whole visual language comes with
//  it for free: the navy section-head band, the wizard above 700px and one
//  vertical scroll below, the outstanding-items rail, 44px `.box` inputs,
//  the row tables, the citation chips. Anything that does not look right is
//  a bug in THIS file, not a missing stylesheet.
//
//  Keys used here are the renderer's own, no additions:
//    section  id, label, step, tag, type, cites, into, lookup
//             fields[] | rows[] | sieves[] | outputs[] | constants[]/points[]
//    field    key, label, type, req, mono, source, options, out/sub (readout)
//    row spec key, heading, max, start, fixed, seed, addLabel, span, grid,
//             action, columns[]
//    column   key, label, type, req, mono, source, options, readonly,
//             alt, fills
//
//  ---- WHERE THE DOMAIN COMES FROM -------------------------------------
//
//  docs/amaw-map.md (the survey) and scripts/amaw/addresses.mjs (the derived
//  address map, proven by check_addresses.mjs against two completed Version
//  13.3 lots). Every section below names the AMAW block it is the screen
//  for, so the mapper that eventually writes the workbook has one place to
//  look. Nothing here was read off the `AMAMAW` sheet, which is a stale 2007
//  field dictionary that disagrees with the live workbook on every entry
//  tested — see the CORRECTION in docs/amaw-map.md.
//
//  ---- WHAT THIS FILE DELIBERATELY DOES NOT DO -------------------------
//
//  It does not invent a renderer. Five places want something designbook.html
//  cannot draw today; each is marked `RENDERER GAP` with what it would take.
//  Read them before wiring this up — two of them fail SILENTLY (a scalar
//  `fills` is simply ignored; an `alt` column drops its `fills`), which is
//  this codebase's most expensive failure mode.
//
//  Written 2026-09-13. Do not edit public/designbook.html from here; Jake
//  splices it.

// ---------------------------------------------------------------------
//  Citations
// ---------------------------------------------------------------------
//
//  DesignBook's `cites` are keys into CONFIG.SPECS.CITES, and every page
//  number in that block was opened and read in the real PDF rather than
//  inferred (CLAUDE.md). Four of them apply to a production lot unchanged
//  and are reused by key below: `jmf` (what a JMF is — the lot is produced
//  under one), `agg805` (aggregates for asphalt mixtures), `ctrlpts` (the
//  AASHTO M 323 control points, which `.45 Data` in the AMAW carries as the
//  same table DesignBook holds in CONFIG.GRADATION_CONTROL_POINTS) and
//  `volumetric`.
//
//  Acceptance, in-place density and the pay schedule are PlantBook's own
//  governing sections. They shipped on 2026-09-13 as three GUESSES carrying
//  `verified: false` and no page number, because a cite chip is a link and a
//  link to a guessed page is worse than no chip; the checker printed them on
//  every run rather than letting them pass as fact.
//
//  CLOSED 2026-09-14 — see the note on each entry below. Verifying them was
//  worth more than a page number: all three named the wrong SECTION, and the
//  numbers they guessed are real clauses about something else. A citation
//  that resolves to a real page is not thereby a correct citation.
//
//  The method, for the next one: the book has no named destinations and no
//  running page numbers (footers are section-relative, "402-3"), so find the
//  section, record its PHYSICAL page AND that footer, and confirm the page
//  numbering by checking one citation this file already trusts —
//  `ctrlpts` is PDF 193 / footer 403-4, so a copy that disagrees is a
//  different edition and every page here needs re-deriving.
export const PLANTBOOK_CITES = {
  // VERIFIED 2026-09-14 against the real 2026 Standard Specifications, and
  // all three were wrong about the SECTION rather than merely the page -
  // which is exactly why they were carried unverified instead of being
  // guessed into CONFIG.SPECS.CITES.
  //
  // The guesses pointed at 403. In the real book `403.03.04` is
  // "Transporting Material" and `403.03.05` is "Spreading and Finishing":
  // plausible-looking numbers beside the mix-design clauses DesignBook
  // already cites, and about something else entirely. PlantBook's governing
  // section is 402 - CONTROL AND ACCEPTANCE OF ASPHALT MIXTURES. 403 is the
  // mixture's own composition and construction requirements, which is why
  // DesignBook's citations legitimately live there and a lot's do not.
  //
  // `402.03.02 A)` is worth reading once: "The Department will accept asphalt
  // mixtures from the plant on a lot basis. A lot is 4,000 tons. A sublot is
  // 1,000 tons... Document and report all quality control tests for the
  // Department's acceptance determination on the Asphalt Mixtures Acceptance
  // Workbook (AMAW)." The spec names this workbook, and that sentence is
  // where LOT_TONS comes from independently of the two real lots that also
  // carry 4000 at 'Pay Values'!F4.
  accept402: {
    doc: "STD", page: 176, footer: "402-1",
    label: "KYTC 402.03.02",
    what: "Contractor quality control and Department acceptance — a lot is 4,000 tons, a sublot 1,000",
  },
  density402: {
    doc: "STD", page: 178, footer: "402-3",
    label: "KYTC 402.03.02 D) 6)",
    what: "in-place density — the compaction option the Contract states, and the mat and joint cores",
  },
  pay402: {
    doc: "STD", page: 182, footer: "402-7",
    label: "KYTC 402.05.02",
    what: "the Lot Pay Adjustment — the three schedules are on PDF 185 (402-10), 186 (402-11) and 188 (402-13)",
  },
};

// DesignBook cite keys this schema reuses. The checker resolves a `cites`
// entry against this set first, then PLANTBOOK_CITES, so a typo in either
// direction is caught rather than rendering an empty chip.
export const DESIGNBOOK_CITE_KEYS = [
  "km421", "jmf", "agg805", "ctrlpts", "consensus", "polish",
  "volumetric", "optimumac", "tsrspec", "km443", "perf", "km450",
];

// ---------------------------------------------------------------------
//  The reference table PlantBook adds
// ---------------------------------------------------------------------
//
//  CLAUDE.md's rule, twice over: "Add a producer, type, terminal or grade in
//  the table, not in a page", and "Never from a list in CONFIG — reference
//  rows in a page's CONFIG would need copying into every page and would
//  drift from the tables the moment Andrew adds a row."
//
//  So PlantBook's mixture-type list is `amaw_types` (28 rows, seeded), read
//  the same way as the other five. This block is the CONFIG.REFERENCE.TABLES
//  entry it needs — splice it in beside `aggregates` and the rest. It is
//  exported rather than written into designbook.html here because that file
//  is Jake's.
//
//  `sitemanager_code` is what the workbook calls the mixture type code
//  (Calculations!J1) — pay.mjs switches the density and VMA pay tables on it
//  and refuses to pay anything for a code outside the Superpave family, so
//  it is load-bearing, not decoration.
export const PLANTBOOK_REFERENCE_TABLES = {
  amaw_types: {
    table: "amaw_types", select: "type_name, sitemanager_code", orderBy: "type_name",
    noun: "mixture types",
    value: (r) => r.type_name,
    label: (r) => `${r.type_name} — SM ${r.sitemanager_code}`,
    aliases: (r) => [r.sitemanager_code],
  },
};

// Every reference table a `source` may name once the block above is spliced
// in. The checker reads the real list out of public/designbook.html and adds
// these, so it cannot drift from what the page actually loads.
export const PLANTBOOK_REFERENCE_KEYS = Object.keys(PLANTBOOK_REFERENCE_TABLES);

// ---------------------------------------------------------------------
//  isRapRow — one definition, not two
// ---------------------------------------------------------------------
//
//  Byte-for-byte the page's own `isRapRow()` (designbook.html), reproduced
//  because this module has to load in Node for the checker. CLAUDE.md
//  records why the test is on Type & size rather than Producer: a real
//  MixPack — and both real AMAWs — put RAP in the type column, and looking
//  for a Producer of literally "RAP" made rapPercent() return null on every
//  real design. ON SPLICE, DELETE THIS AND CALL THE PAGE'S COPY. Two
//  definitions of one rule is how they drift.
export function isRapRow(values) {
  const t = String((values && values.type_size) || "");
  const p = String((values && values.producer) || "").trim();
  return /(^|\s)rap\b/i.test(t) || p.toLowerCase() === "rap";
}

// ---------------------------------------------------------------------
//  The fourteen AMAW sieves
// ---------------------------------------------------------------------
//
//  GRADATION.sieves in addresses.mjs, rows 10..23 of the `Gradation` sheet,
//  in the workbook's own order. `mm` drives the 0.45-power x-position, same
//  as DesignBook's.
//
//  THE 1/4" (6.3 mm) IS NOT HERE, and the note this replaces was wrong about
//  why. It claimed "the AMAW carries it as a real measured row on all four
//  sublots, so PlantBook keeps it". Checked against both of Jake's real lots
//  2026-09-13: `Gradation` row 16 is EMPTY in both — all four sublot columns
//  (D/G/J/M) and the JMF column (N). It is as dead here as it is on a
//  MixPack, which reads "N / A" there. DesignBook dropped it on 2026-09-07
//  for exactly that reason and PlantBook now does too (Jake, 2026-09-13:
//  "on the gradation tab lets get rid of the 1/4" sieve please") — seven
//  columns of an always-blank row is seven fields a technician is asked for
//  and cannot supply, and a column of dashes on the 0.45 chart.
//
//  THE WORKBOOK STILL HAS THE ROW, and that is the part to be careful with:
//  `GRADATION.sieves` in addresses.mjs is the AMAW's own fourteen rows and
//  keeps the 1/4" at index 6. The mapper walks THAT list and matches this
//  one by label, so a sieve absent here simply writes blank to row 16 rather
//  than shifting the seven below it up a row — which is precisely the class
//  of bug the SheetJS chartsheet note in CLAUDE.md is about. Never renumber
//  the workbook list to match this one.
//
//  The two books' sieve lists now agree, but do not start indexing across
//  them: anything shared (the control-point band, trimFlatCoarseEnd) still
//  keys on `mm`, never on position.
const AMAW_SIEVES = [
  { key: "s50",    label: '2"',     mm: 50.0  },
  { key: "s37_5",  label: '1-1/2"', mm: 37.5  },
  { key: "s25",    label: '1"',     mm: 25.0  },
  { key: "s19",    label: '3/4"',   mm: 19.0  },
  { key: "s12_5",  label: '1/2"',   mm: 12.5  },
  { key: "s9_5",   label: '3/8"',   mm: 9.5   },
  { key: "s4_75",  label: "#4",     mm: 4.75  },
  { key: "s2_36",  label: "#8",     mm: 2.36  },
  { key: "s1_18",  label: "#16",    mm: 1.18  },
  { key: "s0_6",   label: "#30",    mm: 0.600 },
  { key: "s0_3",   label: "#50",    mm: 0.300 },
  { key: "s0_15",  label: "#100",   mm: 0.150 },
  { key: "s0_075", label: "#200",   mm: 0.075 },
];

// The seven gradation columns. One measured column per production sublot,
// the lot's JMF target beside them, and the two Department columns — which
// read a DIFFERENT SHEET (`Super Verify` rows 33..46, columns D and G)
// rather than `Gradation`. They are here and not on the Verification step
// because they are the same quantity on the same sieves: a reviewer
// comparing QA against sublot 3 must not have to change screens to do it.
// Andrew, 2026-09-14: Gradation moved onto the Sublot 1-4 tabs (one column
// per tab, plus the read-only JMF target - see buildSublotGradationSections()
// below), which is why `qa`/`iq` below are unused now: they had no natural
// per-sublot home (Department data isn't any one sublot's), and adding one
// wasn't asked for. QA01/IQ01's own gradation percentages have NO UI
// anywhere in PlantBook until someone gives them one - a real, deliberate
// gap, not a silent drop; see NEXT_STEPS.md. Kept here as a record of the
// workbook's own shape (`Super Verify` rows 33..46, columns D and G) rather
// than deleted.
const GRADATION_COLUMNS = [
  { key: "jmf",  label: "JMF target", target: true },
  { key: "sub1", label: "Sublot 1" },
  { key: "sub2", label: "Sublot 2" },
  { key: "sub3", label: "Sublot 3" },
  { key: "sub4", label: "Sublot 4" },
  { key: "qa",   label: "QA01", department: true },
  { key: "iq",   label: "IQ01", department: true },
];

/* HOW THE BINDER CONTENT WAS MEASURED — the workbook's own five, in its own
 * words and in its own order.
 *
 * `Calculations!AJ33:AK37` is a five-row lookup table, and the INDEX IS THE
 * CODE: 1 Back-Calculation of MSG, 2 Extraction, 3 Ignition Furnace, 4 NACG,
 * 5 Printed Ticket. `AP35:AP38` hold the code for the four sublots and
 * `AU35:AU38` the label, via `VLOOKUP(AP.., AJ$33:AK$37, 2, FALSE)`; the two
 * verification records are `AP33`/`AP34` and `AU33`/`AU34`, which sit ABOVE
 * the sublot rows rather than after them (`AQ33`/`AQ34` caption them
 * "Super Verify # 1"/"# 2"). All six AU cells are ONE shared formula, so what
 * a pick on this form becomes in the workbook is the CODE - see mapper.mjs.
 *
 * ONE definition, exported, because the same five words have to appear in two
 * places on the form and be turned back into a number by the mapper. Spelling
 * them out three times is how the form's words and `Calculations!AP..`'s codes
 * would drift, and a drifted label is not an error anywhere — `VLOOKUP(..,
 * FALSE)` on a code we never wrote just leaves the cell blank.
 *
 * NOT to be confused with the LOT's acceptance method (`Calculations!H20`,
 * Volumetrics / Gradation / Visual), which is a different question asked once
 * on the Contract & Mix step. The Verification step's Method column wore
 * H20's options over AU33/AU34 until 2026-09-13, which is most of why the
 * field was unanswerable. */
export const AC_METHODS = [
  "Back-Calculation of MSG",
  "Extraction",
  "Ignition Furnace",
  "NACG",
  "Printed Ticket",
];
/** The code `Calculations!AP..` holds for a label, or null for anything off
 *  the list. 1-based: the lookup table's own row order IS the code. */
export function acMethodCode(label) {
  const i = AC_METHODS.indexOf(String(label == null ? "" : label).trim());
  return i < 0 ? null : i + 1;
}
// ---------------------------------------------------------------------
//  Which sublots a technician may fill in
// ---------------------------------------------------------------------
//
//  Jake, 2026-09-15: "we don't want people to be able to jump to future
//  sublots... Only Lot 1, sublot 1 is the set up so in theory its always
//  unlocked."
//
//  WHY THERE IS A GATE AT ALL. A sublot is 1,000 tons (2026 Std Spec
//  402.03.02 A)) and its sample is taken at a point chosen at random inside
//  that tonnage. A technician cannot record sublot 3's sample before sublot
//  3's material has been made and the random point drawn, so a form that
//  lets them fill it in early is a form that invites made-up numbers into a
//  record KYTC pays against. The tool that draws those points does not exist
//  yet, so today the gate has no key: locked sublots stay locked and say so.
//
//  WHY LOT 1 SUBLOT 1 IS DIFFERENT, AND IT IS NOT AN EXEMPTION WE INVENTED.
//  It is the plant setup sample, and the workbook already treats it as one
//  in two independent places. `'Pay Values'!D13`/`G13` widen the AC ladder to
//  0.7 and rescue an air void or VMA to 100 on that one sublot, gated on the
//  LOT number (`F3=1`) - pay.mjs reproduces both as `isFirstSublot`. And the
//  MEDL staging's `VI01` record, the "verification/initial" sample, has no
//  storage of its own: addresses.mjs records that it READS sublot 1's cells.
//  Lot 1's first sublot is filed twice, once as production and once as the
//  initial verification. Nothing can gate it, because it is what establishes
//  the plant in the first place.
//
//  A BLANK LOT NUMBER READS AS LOT 1, deliberately. `lot_number` is seeded to
//  1 by intake.mjs and is `req: true`, so blank means "not typed yet" rather
//  than "not lot 1" - and locking every sublot the moment somebody clears
//  that box gives a technician a form with nothing open on it and no way to
//  tell why. The lock is a guardrail against wandering into a future sublot,
//  not a security boundary (the page is directly linkable and the lot lives
//  in the browser), so it fails open on an unreadable answer and says what it
//  assumed.
//
//  PURE, and here rather than in the page, so `check_sections.mjs` can hold
//  it to the section ids it actually has to match.
export const SETUP_LOT = 1;
export const SETUP_SUBLOT = 1;

/** The sublot a section belongs to, or null for a section that is not one of
 *  the four tabs. Matches the tab itself AND everything drawn inside it -
 *  "sublot-3", "sublot-3-gradation", "sublot-3-verify". */
export function sublotOfSectionId(id) {
  const m = /^sublot-([1-4])(?:-|$)/.exec(String(id == null ? "" : id));
  return m ? Number(m[1]) : null;
}

/** Does this sublot wait on a random sample point? False only for the setup
 *  sample, and for anything that is not a sublot tab at all. */
export function sublotNeedsSample(sublotNumber, lotNumber) {
  const s = Number(sublotNumber);
  if (!Number.isInteger(s) || s < SETUP_SUBLOT || s > 4) return false;
  const l = Number(lotNumber);
  const setupLot = !Number.isFinite(l) || l === SETUP_LOT;   // blank reads as lot 1
  return !(setupLot && s === SETUP_SUBLOT);
}

/** What describes the LOT rather than one sublot's sample, and so is never
 *  gated even when the tab it happens to sit on is. Both kinds live on Sublot
 *  1's tab, and on lot 2 or later - where sublot 1 is gated like any other -
 *  locking them with it would leave that lot no way to state its own blend.
 *
 *  TWO LISTS BECAUSE THERE ARE TWO SHAPES, and that is worth knowing rather
 *  than discovering: Andrew's 2026-09-14 split (PR #24) turned Aggregate
 *  Blend from an `into: "sublot-1"` SUB-SECTION into row TABLES on the tab
 *  itself, so an exemption that only knew about sub-sections silently stopped
 *  covering it. check_page_plantbook.mjs caught exactly that on the merge and
 *  fails if either list names something that is not really there.
 *
 *  NOTE WHAT IS DELIBERATELY *NOT* HERE: `blend_pct`. That table is sliced
 *  six rows per tab precisely so each sublot edits its own percentage
 *  ("that's how techs have been filling out the previous AMAW to date"), so
 *  it is this sublot's data and locks with it. Only the component identity -
 *  producer, AGP, type & size, BOD - is typed once for the lot. */
export const LOT_LEVEL_SUBBLOCKS = ["handmix"];
export const LOT_LEVEL_ROW_TABLES = ["blend", "blend_gsb"];

/* Seeded rather than asked for, which Jake asked for on 2026-09-13 ("do it
 * and the acc per sublot too"). Both of his real accepted lots read code 3 on
 * all four sublots, and an ignition furnace is what a plant lab actually has;
 * the other four are a back-calculation, a solvent extraction, a nuclear
 * gauge and simply believing the ticket. It is a per-sublot SELECT all the
 * same — a lab that runs a different method on one sublot says so there,
 * and the workbook has four separate cells precisely because it can differ. */
const AC_METHOD_DEFAULT = "Ignition Furnace";

// The four QC sublots, seeded. An AMAW lot is exactly four — QC01..QC04 in
// t_tst_rslt_dtl, four volumetric blocks on `Superpave`, four columns on
// `Gradation`, four rows of pay. Not "up to four".
const SUBLOT_SEED = [{ sublot: "1" }, { sublot: "2" }, { sublot: "3" }, { sublot: "4" }];
// The tickets table carries the AC method as well, so its seed is the sublot
// ids plus that default. `sublot_volumetrics` shares SUBLOT_SEED and must not
// gain it - it has no such column, and a seeded cell with no column is a
// value that reaches the payload and no screen.
const TICKET_SEED = SUBLOT_SEED.map((r) => ({ ...r, ac_method: AC_METHOD_DEFAULT }));

// Two laboratory specimens per sublot, which is what the workbook holds: the
// BSG block has two rows above each Average row, and the MSG block has two
// COLUMNS per sublot. Seeded rather than added by hand for the same reason
// SUBLOT_SEED is - a lot is exactly four sublots of exactly two specimens,
// not "up to".
const SPECIMEN_SEED = ["1", "2", "3", "4"].flatMap((sublot) =>
  ["1", "2"].map((specimen) => ({ sublot, specimen })));

// The two verification records, and the two specimens / bowls each takes.
// `Super Verify` is the same shape as `Superpave` one block at a time: two
// "Sample #" rows above an Average row, and two MSG column pairs - QA01 in
// C/D, IQ01 in E/F. The record name is the row's identity here where the
// sublot number is on the QC side.
const VERIFY_RECORDS = [
  { key: "QA01", label: "QA01 \u2014 Department acceptance" },
  { key: "IQ01", label: "IQ01 \u2014 Independent assurance" },
];
// The long caption on the IDENTITY table, which is where it explains what
// QA01 is, and the bare code on the four tables that repeat it. Five
// full-width copies of "QA01 - Department acceptance" is most of this step on
// a 360px screen, and after the first one it says nothing new.
//
// Andrew, 2026-09-14: "Department Verification... should be on each sublot
// tab. If the state does not verify a given sublot, this section will
// remain blank." Each record now has FOUR possible homes, one per sublot
// tab, of which normally exactly one is ever filled - the seeds below carry
// `sublot` on every table (not just the identity one, which already had
// `sublot_verified`) so computeVerification() can join a record's BSG/MSG/
// moisture/computed rows to the RIGHT slot instead of every same-named row
// across all four tabs. See verifyRowOf4()/verifySpecimenOf4() below for the
// slice indices, and the section's own comment for what did and did not
// need a mapper.mjs change to get here.
// ORDER MATTERS AND IS SUBLOT-MAJOR, not record-major. The four Sublot tabs
// render slices of these seeds BY INDEX, and collectForm() reads them back in
// DOM order - tab 1's rows, then tab 2's, and so on. Those two orders are the
// same list only while each tab's slice is CONTIGUOUS and the tabs run in
// order. Record-major seeds gave tab n the pair [n-1, 4+(n-1)], which
// interleaves, so a save and reopen re-sliced a list that was no longer in
// seed order and put sublot 3's Department record on sublot 1's tab -
// permuting again on every cycle, and never noticed because the values travel
// with the row and the mapper keys on them rather than on position.
// check_sections.mjs now fails ANY spec whose slices do not concatenate to
// 0..n-1 in section order, so this cannot come back quietly.
const VERIFY_SEED = ["1", "2", "3", "4"].flatMap((sublot) =>
  VERIFY_RECORDS.map((r) => ({ record: r.label, sublot_verified: sublot })));
const VERIFY_ROW_SEED = ["1", "2", "3", "4"].flatMap((sublot) =>
  VERIFY_RECORDS.map((r) => ({ record: r.key, sublot })));
const VERIFY_SPECIMEN_SEED = ["1", "2", "3", "4"].flatMap((sublot) =>
  VERIFY_RECORDS.flatMap((r) =>
    ["1", "2"].map((specimen) => ({ record: r.key, sublot, specimen }))));
// n is 1..4. Sublot-major puts sublot n's two records together at 2(n-1) and
// its four specimens at 4(n-1) - the same arithmetic as twoOf4()/fourOf4()
// below, written out rather than referenced because those are declared LATER
// in this module and an eager reference to them here would be a TDZ
// ReferenceError at load, before one line of this file runs.
const verifyRowOf4 = (n) => [2 * (n - 1), 2 * (n - 1) + 1];
const verifySpecimenOf4 = (n) =>
  [4 * (n - 1), 4 * (n - 1) + 1, 4 * (n - 1) + 2, 4 * (n - 1) + 3];

// The two Rice determinations of the lot's hand-mixed check sample
// (`Superpave` columns M and N). One per lot, not per sublot.
const HANDMIX_SEED = [{ determination: "1" }, { determination: "2" }];
// Every core slot the workbook holds, blank and waiting. Jake, 2026-09-13:
// "the cores tab needs to show all 4 sub lots worth of blank cores when
// loaded". `Cores` has room for exactly these and no more - four mat cores
// per sublot on rows 10-13 stride 5, two joint cores on 33-34 stride 3 - and
// that is also what the spec asks for under Option A: "Mainline - Furnish 4
// cores per sublot", "Joint - ... furnish 2 cores per sublot" (2026 Std Spec
// 402.03.02 D) 6), PDF p.178).
//
// Sixteen and eight is not a guess at a maximum: lot 1 on file carries 24
// core IDS and only 18 densities, because sublot 1's were labelled and never
// measured. The slots exist whether or not anyone cores them, so they are
// seeded the same way - the id is printed, the density is blank.
//
// The `core_id` here is the SUFFIX only. paintLotIds() expands it to
// "<lot>-<sublot>-<suffix>", which is KYTC's own convention in both real
// lots ("1-2-A", "1-2-J1").
const MAT_CORE_SEED = ["1", "2", "3", "4"].flatMap((sublot) =>
  ["A", "B", "C", "D"].map((suffix) => ({ sublot, core_id: suffix })));
const JOINT_CORE_SEED = ["1", "2", "3", "4"].flatMap((sublot) =>
  ["J1", "J2"].map((suffix) => ({ sublot, core_id: suffix })));
// 24 = 6 components x 4 sublots, same "identity cell always painted, never
// dropped, never compacted" shape MAT_CORE_SEED already relies on - see
// AGG_BLEND_SPEC below for why this table has to be fixed, not growable.
// `component` (1-6, the same value repeated once per sublot group) is the
// second identity anchor, alongside `sublot` - see AGG_BLEND_SPEC's own note
// on why a row needs one now that producer/AGP/type/BOD live here too.
const BLEND_PCT_SEED = ["1", "2", "3", "4"].flatMap((sublot) =>
  [1, 2, 3, 4, 5, 6].map((component) => ({ sublot, component: String(component) })));

// ---------------------------------------------------------------------
//  Sublot 1-4 tabs — one shared table, sliced four ways
// ---------------------------------------------------------------------
//
//  Andrew, 2026-09-14: "the sublots tab needs to become 4 separate tabs...
//  isolate those pieces of info into their corresponding sublot tab". The
//  five "Sublots" tables (tickets/BSG/MSG/moisture/computed) and the two
//  "Cores" tables all held ALL FOUR sublots' rows in ONE table - a
//  technician filling in sublot 2 had to find sublot 2's row among four
//  before typing anything.
//
//  Gradation and Department Verification are DELIBERATELY NOT split here,
//  and that is a finding, not a shortcut taken quietly. Gradation's
//  `gradSection()`/`computeGradation()`/`drawChart()` (designbook.html) all
//  assume exactly ONE `type: "sieves"` section on the active book - splitting
//  it across five (four sublot columns + the JMF/QA/IQ comparison) would
//  silently stop computing % passing and drawing the chart for every section
//  but the first one found, which is real renderer surgery this change does
//  not attempt. Verification's two records pick their sublot with a live
//  "Verifies" dropdown rather than a fixed 1:1 mapping, so filing one under
//  "its" tab needs dynamic re-filing (closer to renderPolishGrid()'s dynamic
//  show/hide than a static slice) - also not attempted here. Both are
//  logged as open follow-ups in NEXT_STEPS.md.
//
//  THE DATA MODEL DOES NOT CHANGE. Every one of these seven tables keeps its
//  ONE schema key (`sublot_tickets`, `mat_cores`, ...) and its FULL, unsliced
//  `seed` - mapper.mjs, pay.mjs, volumetrics.mjs and addresses.mjs all key a
//  row by its own `sublot` cell's VALUE, never by DOM position, so none of
//  them need to know a table now renders across four physical DOM blocks
//  instead of one. Only the page's renderer needs to learn that a
//  `[data-rowlist="X"]` key can appear more than once in the document - see
//  rowsOfList()/lotRows()/collectForm() in designbook.html, which now
//  aggregate every matching node instead of assuming there is exactly one.
//
//  `sliceSpec(spec, indices)` returns a shallow copy of a base row spec that
//  renders ONLY `indices` of its seed (`rowsHTML()`'s new `sliceIndices`
//  branch) while KEEPING THE FULL seed array on every copy -
//  `paintLotIds()`/`rowSpecOf()` read a spec's `.seed` expecting the whole
//  table, and would silently paint nothing for sublots 2-4 if handed a
//  one-row seed instead. Only which rows get RENDERED narrows; what the spec
//  itself says the table IS does not. check_sections.mjs's row-key check (E)
//  has a matching exception: a key may repeat across sections only when
//  every repeat declares `sliceIndices`, and it separately proves the
//  slices union to the whole seed exactly once each.
function sliceSpec(spec, indices) {
  return { ...spec, sliceIndices: indices };
}
// n is 1..4. One row per sublot for the five Sublots tables, four mat cores
// and two joint cores per sublot for Cores - arithmetic over the same order
// TICKET_SEED/SPECIMEN_SEED/SUBLOT_SEED/MAT_CORE_SEED/JOINT_CORE_SEED are
// already built in (every one of them is `["1","2","3","4"].flatMap(...)` or
// the sublot-keyed equivalent).
const oneOf4 = (n) => [n - 1];
const twoOf4 = (n) => [2 * (n - 1), 2 * (n - 1) + 1];
const fourOf4 = (n) => [4 * (n - 1), 4 * (n - 1) + 1, 4 * (n - 1) + 2, 4 * (n - 1) + 3];
// Six per sublot — AGGREGATE.count, the blend's own fixed slot count.
const sixOf4 = (n) => [0, 1, 2, 3, 4, 5].map((i) => 6 * (n - 1) + i);

// The base specs, named so sliceSpec() can copy each one four times. Bodies
// are unchanged from the single "Sublots"/"Cores" steps they came from - only
// the section(s) wrapping them changed.
const SUBLOT_TICKETS_SPEC = {
  key: "sublot_tickets", heading: "Sublot ticket", banded: true, fixed: true,
  grid: ".7fr 1fr .8fr .9fr .9fr .8fr 1fr 1fr 1.1fr 1.5fr",
  seed: TICKET_SEED,
  columns: [
    { key: "sublot", label: "Lot-sublot", type: "text", mono: true, readonly: true },
    // A row column is rendered as a plain text input whatever its
    // `type` — rowHTML() only branches on `select` and `source` — so
    // `type: "date"` would NOT give a date picker here the way it does
    // on a grid field. Left as text on purpose rather than declaring a
    // type the renderer ignores.
    { key: "date", label: "Date", type: "text", req: true, mono: true },
    // Superpave!J. STORED AS AN EXCEL TIME FRACTION (0.9125 = 21:54),
    // whatever the stale AMAMAW sheet says about HHMM. Typed here as
    // HH:MM, converted by the mapper — not the other way round, and
    // never typed as 0.9125.
    { key: "time", label: "Time", type: "text", req: true, mono: true },
    { key: "truck", label: "Truck", type: "text", req: true, mono: true },
    // CUMULATIVE ticket tonnage, not this sublot's own: lot 2 runs
    // 4955 -> 5390 -> 6693 -> 7530. The label says so, because a
    // technician reading "Tons" will type the sublot's own.
    { key: "tons_cum", label: "Tons (cum.)", type: "number", req: true, mono: true },
    // On the sheet and on the printed page, but NOT in the staging
    // field map — MEDL never receives it. Kept because the Department
    // reads it, and optional because nothing downstream needs it.
    { key: "temperature", label: "Temp (°F)", type: "number", req: false, mono: true },
    // Pay Values rows 43/44, striding by COLUMN across B/C/D/E.
    { key: "binder_lot", label: "Binder lot", type: "text", req: false, mono: true },
    { key: "tack_lot", label: "Tack lot", type: "text", req: false, mono: true },
    // SUBLOT.technician — a 2x2 block at B6/E6/B8/E8, NOT a stride.
    // The workbook's `Cert. Techs` sheet is an in-workbook list of SM
    // User I.D. + name; PlantBook should resolve a technician against
    // the `technicians` roster it already signs people in from rather
    // than shipping that list, same rule as binder terminals.
    { key: "technician", label: "Tech (SM ID)", type: "text", req: true, mono: true },
    // Calculations!AP35:AP38 (the code) and AU35:AU38 (the label this
    // holds). HOW THE SUBLOT'S %AC WAS MEASURED - the figure typed on
    // the volumetrics table below is the only one on this step a
    // technician still supplies, and this says where it came from.
    //
    // Seeded to Ignition Furnace and editable per sublot - see
    // AC_METHODS above for the whole list and why it is one definition.
    // `req: false` deliberately: a blank leaves AP/AU unwritten, which
    // is what both the template and a mid-production lot already look
    // like, and nothing in pay.mjs reads it.
    { key: "ac_method", label: "AC method", type: "select", req: false,
      options: AC_METHODS },
  ],
};
// ---- THE RAW WEIGHTS THE VOLUMETRICS ARE COMPUTED FROM ----------
//
// THE SHAPE, CONFIRMED WITH JAKE 2026-09-13 AND NOT TO BE RE-OPENED: ONE
// PLANTBOOK IS ONE LOT. Four sublots per lot, two BSG samples and two MSG
// bowls per sublot - "Each plant book represents 1 lot, then once that is
// finished they would begin the 2nd lot". It matches the workbook exactly:
// `Superpave` has four blocks captioned "Sublot # 1" .. "# 4" at rows
// 10/16/22/28, each with exactly two "Sample #" rows before its Average row,
// and the MSG block has two column pairs per sublot (C,D / E,F / G,H / I,J).
//
// `volumetrics.mjs` does the arithmetic and `check_volumetrics.mjs` proves it
// reproduces both real lots cell for cell.
// Andrew, 2026-09-15: BSG/MSG and the two Cores tables each declare
// `span: [6, 12]` now — half the row above ~1244px (paired with the table
// right after it, same `rowblock`/`--w`/`--w2` mechanism Performance
// Testing's three-up already uses, see rowsBlockHTML()), full width below
// it. Nothing about the tables themselves changed — same columns, same
// `data-row`/`data-col` keys, same grid track sharing that keeps a header
// over its own values — only how much of the row each one is given.
const SUBLOT_BSG_SPEC = {
  key: "sublot_bsg", heading: "Bulk specific gravity (BSG) — 2 samples for this sublot",
  banded: true, fixed: true, span: [6, 12],
  grid: ".7fr .5fr 1fr 1fr 1fr .9fr .9fr",
  seed: SPECIMEN_SEED,
  columns: [
    // "<lot>-<sublot>", KYTC's own convention - the workbook writes core
    // ids as "1-2-A" for lot 1 sublot 2, and Jake: "1-1 would mean lot 1
    // and sublot 1". Painted by paintLotIds() from the Lot step's lot
    // number, so it follows a lot 2 without anyone retyping it, and read
    // back by sublotIndexOf(), which is the ONLY reader of this cell.
    { key: "sublot", label: "Lot-sublot", type: "text", mono: true, readonly: true },
    { key: "specimen", label: "Sample #", type: "text", mono: true, readonly: true },
    // Superpave C/D/E. KYTC's own column captions are "Weight (g)" over
    // "(Air) / (Water) / (SSD)"; spelled out here because "(Air)" alone
    // on a phone is not a weight.
    { key: "wt_air", label: "Wt in air (g)", type: "number", req: true, mono: true },
    { key: "wt_water", label: "Wt in water (g)", type: "number", req: true, mono: true },
    { key: "wt_ssd", label: "SSD wt (g)", type: "number", req: true, mono: true },
    // F = ROUND(E-D,1), G = ROUND(C/F,3), H = G*62.4. Computed, never
    // typed - readonly and not `req`, so the rail asks for the three
    // weights a person actually has rather than for their quotient.
    { key: "bulk_volume", label: "Bulk vol.", type: "number", req: false, mono: true, readonly: true },
    { key: "bsg", label: "BSG", type: "number", req: false, mono: true, readonly: true },
    // NO unit weight column - see the original note in git history if this
    // is ever reopened; unchanged by the tab split.
  ],
};
const SUBLOT_MSG_SPEC = {
  key: "sublot_msg", heading: "Maximum specific gravity (MSG, Rice) — 2 bowls for this sublot",
  banded: true, fixed: true, span: [6, 12],
  grid: ".7fr .5fr 1fr 1fr 1fr 1fr .8fr",
  seed: SPECIMEN_SEED,
  columns: [
    { key: "sublot", label: "Lot-sublot", type: "text", mono: true, readonly: true },
    // The mapper calls these the Gmm bowls; "Bowl #" keeps them visibly
    // distinct from the BSG table's pucks on a step that shows both.
    { key: "specimen", label: "Bowl #", type: "text", mono: true, readonly: true },
    // Superpave rows 36/37/39/40, in COLUMN pairs per sublot rather
    // than rows - see SUBLOT.msg in addresses.mjs.
    { key: "wt_mix", label: "Wt of mix (g)", type: "number", req: true, mono: true },
    { key: "calibration", label: "Calibration (g)", type: "number", req: true, mono: true },
    { key: "final_wt", label: "Final wt (g)", type: "number", req: true, mono: true },
    // Blank in both real lots, and a blank reads as 0 inside the sum -
    // so optional, and a blank one does not block the MSG.
    { key: "absorbed_water", label: "Absorbed water (g)", type: "number", req: false, mono: true },
    { key: "msg", label: "MSG", type: "number", req: false, mono: true, readonly: true },
  ],
};
const SUBLOT_MOISTURE_SPEC = {
  // The moisture in the mix, three weighings per sublot. It exists for
  // ONE reason and it is not cosmetic: `Gradation!D33 = D34 - Superpave!G48`
  // takes the back-calculated %AC and subtracts this, and `Superpave!B14`
  // - the "% Binder in Mix" every AC pay value is a deviation from -
  // reads D33 in preference to D34. Without it the lot is paid on an
  // uncorrected binder content.
  key: "sublot_moisture", heading: "Moisture in the mixture — the %AC correction",
  banded: true, fixed: true, seed: SUBLOT_SEED,
  grid: ".7fr 1fr 1fr 1fr .9fr",
  columns: [
    { key: "sublot", label: "Lot-sublot", type: "text", mono: true, readonly: true },
    // Superpave G/H/I/J rows 45/46/47, one column per sublot.
    { key: "wt_before", label: "Pan + mix, before drying (g)", type: "number", req: false, mono: true },
    { key: "wt_after", label: "Pan + mix, after drying (g)", type: "number", req: false, mono: true },
    { key: "wt_pan", label: "Pan (g)", type: "number", req: false, mono: true },
    { key: "moisture", label: "% moisture", type: "number", req: false, mono: true, readonly: true },
  ],
};
// Andrew, 2026-09-15: `chips: true` renders this table as a single strip of
// labeled read-only chips instead of a full grid table with its own header
// row — nine header cells and a data row, for a table that is ALWAYS
// exactly one row, is most of the wasted vertical space on a sublot tab.
// Reuses the label-above-input markup rowHTML() already renders for a
// phone card row (see .rowitem label / the <700px "card" mode) rather than
// inventing a second one — see rowHTML()'s `spec.chips` branch. NOTHING
// about the data model changes: every cell is still a real
// `data-row="sublot_volumetrics" data-col="..."` input, so collectForm(),
// putCell()/cellValue() (computeSublotVolumetrics() paints these exactly as
// before) and mapper.mjs's `sublot_volumetrics` LOT_TABLE_ROUTES entry all
// keep reading and writing the same cells — this table is genuinely
// collected and mapped (unlike Combined Gsb's `readout` field), so it could
// not become a `type: "readout"` field without breaking the AMAW bridge.
// `chipHide: true` on the identity column keeps `sublot` in the DOM (still
// painted, still collected) but off the visible strip — the tab you're on
// already says which sublot this is.
const SUBLOT_VOLUMETRICS_SPEC = {
  key: "sublot_volumetrics", heading: "Sublot volumetrics — computed", banded: true, fixed: true,
  chips: true,
  grid: ".7fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
  seed: SUBLOT_SEED,
  columns: [
    { key: "sublot", label: "Lot-sublot", type: "text", mono: true, readonly: true, chipHide: true },
    // Superpave!B — the workbook's "% Binder in Mix". COMPUTED, back-calculated
    // from Gse and the sublot's Gmm, less the moisture correction - see
    // volumetrics.mjs.
    { key: "binder_pct", label: "%AC", type: "number", req: false, mono: true, readonly: true },
    { key: "gmb", label: "Gmb (BSG)", type: "number", req: false, mono: true, readonly: true },
    { key: "gmm", label: "Gmm (MSG)", type: "number", req: false, mono: true, readonly: true },
    { key: "va", label: "Va (%)", type: "number", req: false, mono: true, readonly: true },
    { key: "pbe", label: "Pbe (%)", type: "number", req: false, mono: true, readonly: true },
    { key: "vma", label: "VMA (%)", type: "number", req: false, mono: true, readonly: true },
    { key: "vfa", label: "VFA (%)", type: "number", req: false, mono: true, readonly: true },
    // KYTC writes it "D/A"; pay.mjs and the loader call it dustRatio.
    { key: "dust_ratio", label: "D/A ratio", type: "text", req: false, mono: true, readonly: true },
  ],
};
// The two Cores banks, unchanged from the standalone "Cores & Density" step -
// see that step's own comment in git history for why they are two tables and
// not one with a Mat/Joint column (lane density and joint density are two
// different pay properties, run through two different pay curves).
const CORE_COLUMNS = [
  { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true },
  { key: "core_id", label: "Core #", type: "text", mono: true, readonly: true },
  { key: "station", label: "Station / offset", type: "text", req: false },
  { key: "wt_air", label: "Wt in air (g)", type: "number", req: false, mono: true },
  { key: "wt_water", label: "Wt in water (g)", type: "number", req: false, mono: true },
  { key: "wt_ssd", label: "SSD wt (g)", type: "number", req: false, mono: true },
  { key: "bsg", label: "BSG", type: "number", req: false, mono: true, readonly: true },
  { key: "density", label: "Density (pcf)", type: "number", req: false, mono: true, readonly: true },
  { key: "pct_solid", label: "% density", type: "number", mono: true, readonly: true },
  { key: "pay_value", label: "Pay (%)", type: "text", mono: true, readonly: true },
];
const MAT_CORES_SPEC = {
  key: "mat_cores", heading: "Mat cores (lane density) — 4 for this sublot",
  banded: true, fixed: true, seed: MAT_CORE_SEED, span: [6, 12],
  grid: ".7fr .9fr 1.3fr 1fr 1fr 1fr .8fr .9fr .9fr .8fr",
  columns: CORE_COLUMNS,
};
const JOINT_CORES_SPEC = {
  key: "joint_cores", heading: "Joint cores (longitudinal joint density) — 2 for this sublot",
  banded: true, fixed: true, seed: JOINT_CORE_SEED, span: [6, 12],
  grid: ".7fr .9fr 1.3fr 1fr 1fr 1fr .8fr .9fr .9fr .8fr",
  columns: CORE_COLUMNS,
};

// ---------------------------------------------------------------------
//  Aggregate Blend — one table, on every Sublot tab (Andrew, 2026-09-15b)
// ---------------------------------------------------------------------
//
//  Combines what used to be two tables (BLEND_IDENTITY_SPEC, Sublot-1-only,
//  and BLEND_PCT_SPEC's own narrower mirror) into one, present on all four
//  tabs: "the aggregate table [should be] present in each sublot tab
//  containing individual Gsb and design %s, but... the last column
//  represented in each sublot tab [should] show that specific sublot's
//  blend %s". So: component / producer / AGP / type & size / BOD sp. gr. /
//  Design % are the SAME six values on every tab (edited once, on Sublot 1 -
//  Andrew's standing call, 2026-09-14: one canonical edit point beats four
//  that could disagree), and the last column, Sublot %, is THIS tab's own.
//
//  `aggBlendColumns(editable)` returns the shared column list, differing
//  only in `readonly`/`req` on the five identity+design columns: Sublot 1's
//  copy gets `editable: true` (typed, sourced against `aggregates`/
//  `aggregate_types`), Sublots 2-4 get `editable: false` (painted by
//  paintBlendMirrors(), designbook.html, same "read-only mirror" pattern
//  `producer`/`type_size` already used before this merge). `pct` ("Sublot
//  %") is ALWAYS editable - it is the one column that is genuinely this
//  tab's own.
//
//  `design_pct` ("Design %") is new: the approved design's own blend % for
//  this component (`lot.values.design.aggregate[].pct_blend`, intake.mjs),
//  read-only on every tab, seeded once and never touched by editing a
//  sublot's own %. It is a comparison figure only - not a workbook cell,
//  see LOT_TABLE_ROUTES.blend_pct's `drop` entry for it.
//
//  ONE TABLE, ONE ROW-LIST KEY (`blend_pct`, unchanged - a rename would
//  ripple through LOT_TABLE_ROUTES, every check_*.mjs fixture and
//  docs/amaw-map.md for no behavioural gain). What used to be a SEPARATE
//  `blend` list (identity only, six rows) no longer exists as its own
//  table: Sublot 1's own six `blend_pct` rows (`sublot === "1"`) ARE the
//  identity now, and mapper.mjs's `lotRecords()` derives the old `blend`
//  shape from exactly that slice before running LOT_TABLE_ROUTES.blend and
//  the custom pct fan-out - both unchanged from before this merge. A lot
//  saved before this change still carries a genuine `rows.blend` and that
//  derivation is skipped in favour of it.
//
//  FIXED, not growable, still for the reason BLEND_IDENTITY_SPEC used to
//  give: `Superpave` rows 3..8 are six real slots whether or not a lot uses
//  all of them (AGGREGATE.count), matching mat_cores/joint_cores' own
//  "always six/four/two, identity cell always painted, never dropped or
//  compacted" shape. `sublot` was already an always-painted identity anchor
//  (BLEND_PCT_SEED); `component` still has to be too, for the same reason
//  discovered verifying this in a real browser 2026-09-15: collectForm()
//  drops a row only when EVERY cell in it is null, and producer/agp/
//  type_size/bod are all genuinely optional, so a blank component in the
//  MIDDLE of Sublot 1's six would silently compact the rest upward and
//  desync `component`'s own numbering from row position - `component`
//  itself is what stops that, being the one cell always painted regardless.
function aggBlendColumns(editable) {
  return [
    // `hidden: true` - a real, always-collected cell (rowHTML()'s own note),
    // just not a printed column: the tab a row is on already says which
    // sublot it belongs to. It is not decorative - paintBlendMirrors(),
    // computeBlendGsb() and mapper.mjs's fan-out all GROUP blend_pct's 24
    // rows by this cell's VALUE first, never by raw DOM position, the same
    // "group by a real identity value" rule mat_cores/sublot_bsg already use.
    { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true, hidden: true },
    { key: "component", label: "#", type: "text", mono: true, readonly: true },
    // AGP and AMP are different registries, and a RAP row needs the second
    // one — an AGP number is an aggregate producer, an AMP number is an
    // asphalt plant, and RAP is millings, so its "producer" is the plant
    // they came off. `alt` swaps the list and the label per row, detected
    // by Type & size (never by Producer).
    { key: "producer", label: "Producer", type: "text", req: editable, readonly: !editable,
      source: "aggregates",
      // The workbook stores the CODE (Superpave!N, "AGP027501"), not the
      // name, so the code has to reach the payload — unlike a legacy
      // MixPack import, where `_agp` rides on the row and is deliberately
      // NOT a schema column because nothing downstream wants it. Here the
      // loader reads it, so it is a column.
      fills: { agp: (r) => r.agp_number },
      alt: {
        when: (row) => isRapRow(row),
        source: "plants", label: "Plant (RAP source)",
        // RENDERER GAP (2) — SILENT. effectiveColDef() copies only `source`
        // and `label` off `alt`, so on a RAP row this `fills` never
        // replaces the one above: the outer fills runs with a `plants` row
        // in hand, finds no `agp_number`, and CLEARS the code cell it
        // filled a moment ago. Teaching effectiveColDef() to carry `fills`
        // through is a two-line change and is required before the RAP row
        // works. Declared here so the fix has something to switch on.
        fills: { agp: (r) => r.amp_number },
      } },
    // Filled from the chosen producer, and editable — a retired producer or
    // an older spelling that the table lacks is a WARNING and is KEPT,
    // never blanked (CLAUDE.md's provisional-values rule applied to lists).
    { key: "agp", label: "AGP / AMP", type: "text", req: editable, mono: true, readonly: !editable },
    { key: "type_size", label: "Type & size", type: "text", req: editable, readonly: !editable,
      source: "aggregate_types" },
    // Superpave!Q. KYTC's own wording on the sheet.
    { key: "bod", label: "BOD sp. gr.", type: "number", req: editable, mono: true, readonly: !editable },
    // The design's own blend % for this component - reference only, never
    // typed and never overwritten by editing "Sublot %" below.
    { key: "design_pct", label: "Design %", type: "number", mono: true, readonly: true },
    { key: "pct", label: "Sublot %", type: "number", req: true, mono: true },
  ];
}
function aggBlendSpec(n) {
  return {
    ...sliceSpec({
      key: "blend_pct", heading: "Aggregate Blend", banded: true, fixed: true,
      seed: BLEND_PCT_SEED,
      // Seven tracks - component, producer, AGP, type & size, BOD, Design %,
      // Sublot %.
      grid: ".3fr 1.7fr .7fr 1.05fr .5fr .55fr .55fr",
      columns: aggBlendColumns(n === 1),
    }, sixOf4(n)),
    // The stat lives IN the row-group's own navy banner (rowHeadingHTML(),
    // designbook.html) rather than as a separate readout field above it -
    // Andrew, 2026-09-15: "wrap the Gsb value into the agg structure box
    // instead of having it live all by itself in its own box... obvious
    // and standout, but not taking up its own box." Painted by the same
    // `show('blend_gsb_${n}', ...)` call paintLotReadouts() already made
    // when this was a `fields` readout - only the markup it targets moved.
    stat: { label: "Combined Gsb", out: `blend_gsb_${n}` },
  };
}
// Superpave row 9, R9/S9/T9/U9. Fixed at one row because there is exactly
// one combined Gsb per sublot; readonly because it is computed from the
// blend percentages and the BODs, and a typed combined Gsb that disagrees
// with its own blend is a reviewer's nightmare. Rendered HIDDEN
// (buildSublotTabSections() below) - its value has always had a visible
// home in the per-tab "Combined Gsb" readout (now the stat beside
// BLEND_PCT_SPEC's own banner), so showing this table too would just say
// the same four numbers a second time.
const BLEND_GSB_SPEC = {
  key: "blend_gsb", heading: "Combined Gsb, by sublot", hidden: true,
  fixed: true, span: [6, 12],
  grid: "1fr 1fr 1fr 1fr",
  seed: [{}],
  columns: [
    { key: "gsb_1", label: "Sublot 1", type: "number", mono: true, readonly: true },
    { key: "gsb_2", label: "Sublot 2", type: "number", mono: true, readonly: true },
    { key: "gsb_3", label: "Sublot 3", type: "number", mono: true, readonly: true },
    { key: "gsb_4", label: "Sublot 4", type: "number", mono: true, readonly: true },
  ],
};

// Four near-identical sections, generated rather than hand-typed four times -
// a hand-typed fourth copy is exactly how a slice range gets fat-fingered
// silently. `handmix` (Superpave N42/N43, one per LOT not per sublot) lands
// on Sublot 1's tab specifically - Andrew's call, 2026-09-14, over giving it
// a step of its own or repeating it on all four.
function buildSublotTabSections() {
  const out = [];
  for (let n = 1; n <= 4; n++) {
    const rows = [];
    // Aggregate Blend, at the TOP of every tab (Andrew, 2026-09-15: "relocate
    // agg table(s) to the top of each sublot tab") - `into` children render
    // AFTER a section's own body (renderForm() appends them:
    // `${sectionBodyHTML(s)} ${child}`), which is what stopped the old
    // standalone "blend" `into: "sublot-1"` section from ever sitting above
    // the ticket table. Folding it into this function's own `rows` is what
    // actually moves it - it is no longer an `into` section at all.
    rows.push(aggBlendSpec(n));
    rows.push(
      sliceSpec(SUBLOT_TICKETS_SPEC, oneOf4(n)),
      sliceSpec(SUBLOT_BSG_SPEC, twoOf4(n)),
      sliceSpec(SUBLOT_MSG_SPEC, twoOf4(n)),
      sliceSpec(SUBLOT_MOISTURE_SPEC, oneOf4(n)),
      sliceSpec(SUBLOT_VOLUMETRICS_SPEC, oneOf4(n)),
      sliceSpec(MAT_CORES_SPEC, fourOf4(n)),
      sliceSpec(JOINT_CORES_SPEC, twoOf4(n)),
      // Hidden storage, not display - see BLEND_GSB_SPEC's own note. Needs
      // to exist somewhere in the DOM once; Sublot 1's tab is as good a home
      // as any, since that is also where the identity table lives.
      ...(n === 1 ? [BLEND_GSB_SPEC] : []),
    );
    out.push({
      id: `sublot-${n}`, label: `Sublot ${n}`, step: `Sublot ${n}`,
      tag: `AMAW · QC0${n} — this sublot's blend %, ticket, BSG/MSG, gradation weights and cores`,
      type: "rows",
      cites: ["accept402", "volumetric", "density402", "agg805"],
      rows,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
//  Gradation, also per sublot (Andrew, 2026-09-14)
// ---------------------------------------------------------------------
//
//  "The Gradation tab should be divided among the four sublot tabs to
//  provide an opportunity to add a gradation test per sublot." Each tab
//  gets its OWN two-column sieve table: the JMF target (read-only, for
//  comparison while typing) and that sublot's own weights-in column.
//
//  THE JMF COLUMN IS READ-ONLY EVERYWHERE, ON PURPOSE. It still renders as
//  a real `data-field="jmf_<sieve>"` input on all four tabs - collectForm()
//  still collects it, so a save/reload round-trip does not lose it - it is
//  just never focusable. That is what makes rendering it FOUR TIMES safe:
//  a value that can never be edited can never diverge between its four
//  copies, unlike Producer/Type/AGP/BOD on the Blend question still open
//  for Andrew (see NEXT_STEPS.md) - those would need the same "one canonical
//  edit point, N read-only mirrors" answer, or a genuinely new one.
//
//  CHART, ADDED 2026-09-15 (Andrew, Part B Option 1 of the sublot-tab
//  mockup — "beside the table", not below it). `drawChart()`
//  (designbook.html) used to be written for exactly ONE `type: "sieves"`
//  section on the active book at a time, keyed to a single global `#chart`
//  div; it is now `allGradationSections()`-driven, drawing into
//  `chart_<section.id>` for every weighed gradation section the active book
//  has, so four sublots' charts (and DesignBook's own, unaffected) can never
//  collide. `.gradwrap.wide` — previously "wide" meant *only* "stack the
//  chart below" because nothing wide ever HAD a chart — now means "table and
//  chart side by side" above 900px, matching every other gradwrap. The band
//  (AASHTO M323 control points for this mix's NMAS) and trimFlatCoarseEnd
//  are the same shared, pure functions the DesignBook chart and the review
//  PDF already use, so all five charts on a lot agree with each other and
//  with DesignBook's about where the target corridor sits.
//
//  QA01/IQ01's own gradation percentages (`qa`/`iq` in GRADATION_COLUMNS
//  above) have no home here either - Department data isn't any one
//  sublot's, and giving it one wasn't asked for. Still open.
function buildSublotGradationSections() {
  const jmf = { ...GRADATION_COLUMNS.find((c) => c.key === "jmf"), readonly: true };
  const out = [];
  for (let n = 1; n <= 4; n++) {
    const sub = GRADATION_COLUMNS.find((c) => c.key === `sub${n}`);
    out.push({
      id: `sublot-${n}-gradation`, label: "Gradation", into: `sublot-${n}`, banded: true,
      tag: "cumulative grams retained · % passing computed",
      type: "sieves",
      cites: ["ctrlpts"],
      sieves: AMAW_SIEVES,
      columns: [jmf, sub],
      weights: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
//  Department Verification, also per sublot (Andrew, 2026-09-14)
// ---------------------------------------------------------------------
//
//  "The verification tab which is one sublot verification per lot should
//  be on each sublot tab. If the state does not verify a given sublot,
//  this section will remain blank." QA01 and IQ01 are still exactly one
//  record each (matching `Super Verify`'s real shape) - each now has FOUR
//  possible homes, one per sublot tab, and normally exactly one is filled.
//
//  THE "VERIFIES" DROPDOWN IS GONE. Which sublot a record verifies used to
//  be typed; now it is which tab the record was filled in on, so
//  `sublot_verified` is seeded and `readonly` instead. Its value and its
//  column key are UNCHANGED - the bridge and mapper.mjs still read exactly
//  what they always did.
//
//  A `sublot` column is NEW on the four repeating tables (BSG/MSG/moisture/
//  computed), which previously joined to the identity table by `record`
//  alone - fine when there were only two records total, wrong now that
//  four blank copies of "QA01" exist alongside the one real one.
//  computeVerification() (designbook.html) joins on record AND sublot as
//  of this change. The bridge does NOT need this column: a blank slot has
//  no measurement, and LOT_TABLE_ROUTES' `hasMeasurement()` already drops
//  a measurement-less row before it ever reaches `records[block]` - see
//  mapper.mjs. Confirmed by re-reading that file, not by guessing.
//
//  EQUIPMENT VERIFIED MOVED HERE FROM THE LOT STEP'S SCALAR `fields` - the
//  ONE PIECE OF THIS THAT DOES TOUCH mapper.mjs. `lot_equipment_verified_qa`/
//  `_iq` were global scalars; repeating either across four tabs would have
//  been the unsafe kind of duplication (collectForm() overwrites a scalar
//  `data-field` by DOM order, so filling it in on one tab and leaving the
//  other three at their untouched default could silently lose the answer
//  on the next save). A row column scoped to one record's own slot has no
//  such risk - only ONE of the four physical `equipment_verified` cells for
//  a given record is ever expected to hold anything. mapper.mjs's write
//  step for it now reads `recVals(block).equipment_verified` (already in
//  scope there) instead of the old lot-level scalar; LOT_TABLE_ROUTES gained
//  one `cols` entry to route it. Both are one-line changes, not a new
//  selection algorithm - unlike the "pick the one filled slot" logic this
//  looked at first, the record-scoped write already existed for every
//  OTHER field on this table (`tested_by`, `acceptance_label`); this one
//  had simply never needed it before there were four possible homes.
//
//  NOT YET RUN AGAINST A REAL AMAW WITH A QA OR IQ SAMPLE - see the note on
//  the old "Department Verification" step this replaces: neither of Jake's
//  two real lots has ever had one, so there is nothing to verify the new
//  routing against yet regardless of who writes it or when.
const VERIFY_IDENTITY_SPEC = {
  key: "verification", heading: "Verification records", banded: true, fixed: true,
  grid: "1.5fr .5fr .8fr 1fr .8fr",
  seed: VERIFY_SEED,
  columns: [
    { key: "record", label: "Record", type: "text", readonly: true },
    { key: "sublot_verified", label: "Verifies", type: "text", mono: true, readonly: true },
    { key: "technician", label: "Tech (SM ID)", type: "text", req: false, mono: true },
    { key: "ac_method", label: "AC method", type: "select", req: false, options: AC_METHODS },
    { key: "equipment_verified", label: "Equipment verified", type: "select", req: false,
      options: ["Yes", "No"] },
  ],
};
// Andrew, 2026-09-15: paired the same way the Sublots' own BSG/MSG are
// (`span: [6, 12]`, see the note on SUBLOT_BSG_SPEC) - these two carry one
// extra "Record" column (8 vs 7), which is what actually overflowed a
// narrower window: reported off a real screenshot, not guessed.
const VERIFY_BSG_SPEC = {
  key: "verify_bsg", heading: "Bulk specific gravity (BSG) — 2 samples for this record",
  banded: true, fixed: true, span: [6, 12],
  grid: ".7fr .5fr .5fr 1fr 1fr 1fr .9fr .9fr",
  seed: VERIFY_SPECIMEN_SEED,
  columns: [
    { key: "record", label: "Record", type: "text", readonly: true },
    { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true },
    { key: "specimen", label: "Sample #", type: "text", mono: true, readonly: true },
    { key: "wt_air", label: "Wt in air (g)", type: "number", req: false, mono: true },
    { key: "wt_water", label: "Wt in water (g)", type: "number", req: false, mono: true },
    { key: "wt_ssd", label: "SSD wt (g)", type: "number", req: false, mono: true },
    { key: "bulk_volume", label: "Bulk vol.", type: "number", req: false, mono: true, readonly: true },
    { key: "bsg", label: "BSG", type: "number", req: false, mono: true, readonly: true },
  ],
};
const VERIFY_MSG_SPEC = {
  key: "verify_msg", heading: "Maximum specific gravity (MSG, Rice) — 2 bowls for this record",
  banded: true, fixed: true, span: [6, 12],
  grid: ".7fr .5fr .5fr 1fr 1fr 1fr 1fr .8fr",
  seed: VERIFY_SPECIMEN_SEED,
  columns: [
    { key: "record", label: "Record", type: "text", readonly: true },
    { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true },
    { key: "specimen", label: "Bowl #", type: "text", mono: true, readonly: true },
    { key: "wt_mix", label: "Wt of mix (g)", type: "number", req: false, mono: true },
    { key: "calibration", label: "Calibration (g)", type: "number", req: false, mono: true },
    { key: "final_wt", label: "Final wt (g)", type: "number", req: false, mono: true },
    { key: "absorbed_water", label: "Absorbed water (g)", type: "number", req: false, mono: true },
    { key: "msg", label: "MSG", type: "number", req: false, mono: true, readonly: true },
  ],
};
const VERIFY_MOISTURE_SPEC = {
  key: "verify_moisture", heading: "Moisture in the mixture — the %AC correction",
  banded: true, fixed: true,
  grid: ".7fr .5fr 1fr 1fr 1fr .9fr",
  seed: VERIFY_ROW_SEED,
  columns: [
    { key: "record", label: "Record", type: "text", readonly: true },
    { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true },
    { key: "wt_before", label: "Pan + mix, before drying (g)", type: "number", req: false, mono: true },
    { key: "wt_after", label: "Pan + mix, after drying (g)", type: "number", req: false, mono: true },
    { key: "wt_pan", label: "Pan (g)", type: "number", req: false, mono: true },
    { key: "moisture", label: "% moisture", type: "number", req: false, mono: true, readonly: true },
  ],
};
// Andrew, 2026-09-15: `chips: true`, same reasoning as SUBLOT_VOLUMETRICS_SPEC
// - always read-only, always computed, a full grid table + header is mostly
// blank space around eight short numbers. Unlike the sublot version this can
// hold up to two rows (QA01 and IQ01), so `record` stays VISIBLE - it is the
// only thing telling the two chip strips apart - and only `sublot` (this
// tab's own number, already said once above) is chipHide.
const VERIFY_VOLUMETRICS_SPEC = {
  key: "verify_volumetrics", heading: "Verification volumetrics — computed", banded: true, fixed: true,
  chips: true,
  grid: ".7fr .5fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
  seed: VERIFY_ROW_SEED,
  columns: [
    { key: "record", label: "Record", type: "text", readonly: true },
    { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true, chipHide: true },
    { key: "binder_pct", label: "%AC", type: "number", req: false, mono: true, readonly: true },
    { key: "gmb", label: "Gmb (BSG)", type: "number", req: false, mono: true, readonly: true },
    { key: "gmm", label: "Gmm (MSG)", type: "number", req: false, mono: true, readonly: true },
    { key: "va", label: "Va (%)", type: "number", req: false, mono: true, readonly: true },
    { key: "pbe", label: "Pbe (%)", type: "number", req: false, mono: true, readonly: true },
    { key: "vma", label: "VMA (%)", type: "number", req: false, mono: true, readonly: true },
    { key: "vfa", label: "VFA (%)", type: "number", req: false, mono: true, readonly: true },
  ],
};
function buildSublotVerificationSections() {
  const out = [];
  for (let n = 1; n <= 4; n++) {
    out.push({
      id: `sublot-${n}-verify`, label: "Department Verification", into: `sublot-${n}`, banded: true,
      tag: "AMAW · Super Verify — QA01 / IQ01, this sublot's slot",
      type: "grid",
      cites: ["accept402", "km443"],
      rows: [
        sliceSpec(VERIFY_IDENTITY_SPEC, verifyRowOf4(n)),
        sliceSpec(VERIFY_BSG_SPEC, verifySpecimenOf4(n)),
        sliceSpec(VERIFY_MSG_SPEC, verifySpecimenOf4(n)),
        sliceSpec(VERIFY_MOISTURE_SPEC, verifyRowOf4(n)),
        sliceSpec(VERIFY_VOLUMETRICS_SPEC, verifyRowOf4(n)),
      ],
    });
  }
  return out;
}

// =====================================================================
//  PLANTBOOK_SECTIONS
// =====================================================================
export const PLANTBOOK_SECTIONS = [
  {
    // ---------------------------------------------------------------
    //  1. LOT — the `Pay Values` header
    // ---------------------------------------------------------------
    //
    //  NOT `id: "contract"` and not `id: "status"` further down: both books
    //  live in one page, renderForm() writes `<section id="${s.id}">`, and
    //  two sections answering to one getElementById is the same class of bug
    //  CLAUDE.md records for the moved #advanceStage node. Every id here is
    //  distinct from every DesignBook id, and check_sections.mjs proves it.
    //
    //  Most of this step is INHERITED rather than typed. CLAUDE.md, Jake
    //  2026-09-13: "PlantBook starts by uploading a DesignBook approval" —
    //  the approval PDF embeds the whole design payload and is signed, so
    //  the contract, plant, mix, blend and Gsb arrive with it and
    //  verify-approval can refuse a lot on a design KYTC never approved.
    //  Seeded values follow the provisional-value rule: tinted, with
    //  `state.sources[key]` saying where they came from, never blanked,
    //  never locked.
    id: "lot", label: "Contract & Mix", step: "Contract & Mix",
    tag: "AMAW · Pay Values header — from the approved design, or typed",
    type: "grid",
    cites: ["jmf", "accept402"],
    // A button in the section head, the same shape Contract Information's
    // contract lookup has. `key` is what the page dispatches on; the schema
    // names the lookup and never holds a handler, because this module is
    // read in Node with no DOM.
    //
    // What it is for: 402.03.02 D) 6) opens "The Contract will state the
    // compaction option to be used", so Option A / Option B is a LOOKUP and
    // not a preference - and once it is known, joint cores follow from it
    // and the mix (Jake, 2026-09-13: "once that is figured out the we will
    // know if joint cores apply because its only for 0.38 and 0.50 mixes").
    // Both fields are filled from one press.
    lookup: { key: "compaction", label: "Look up compaction<span class=\"wide-only\"> option</span>" },
    fields: [
      // Scalar field keys are prefixed `lot_` throughout. They share
      // `state.extracted.scalars` with DesignBook's, and `county`,
      // `total_tons` and `binder_grade` would otherwise be one key holding
      // two different records' values. Row COLUMN keys are deliberately NOT
      // prefixed: they are scoped by data-row, and sharing `gmm`/`va`/`vma`
      // with DesignBook means they inherit CONFIG.DP's precision for free.
      { key: "lot_contract_id", label: "Contract", type: "text", req: true, mono: true },
      { key: "lot_county",      label: "County",   type: "text", req: true },
      // `plants` is the single source for AMP number -> plant name
      // (CLAUDE.md). MAPPER NOTE: the workbook's own VLOOKUP key at
      // Pay Values!D6 is PADDED — "AMP070302      " — and the match is
      // exact, so the generator has to spell it the template's way, not
      // Supabase's. Exactly the trap mixpackCells() already hit.
      { key: "lot_plant", label: "Plant", type: "text", req: true, source: "plants" },
      { key: "lot_number", label: "Lot number", type: "number", req: true, mono: true },
      // 'Pay Values'!D3 ("Item Code:", 385 in both real lots) is NOT asked
      // for, and that is a finding rather than a preference (Jake, 2026-09-13:
      // "do we need the item code part?"). Checked against both completed lots:
      // no formula anywhere in the workbook reads D3, and no t_* staging row
      // sources it - it is a printed header cell and nothing else, so MEDL
      // never sees it. Nor is it ours to derive. The 385 is the lead of the BID
      // ITEM at D9, which is picked from the workbook's OWN catalogue at
      // Calculations!BB3:BF349 ("00385 CL3 ASPH SURF 0.38A PG64-22", column BF
      // the material code C9 looks up) - KYTC's catalogue number for the mix,
      // not the contract's line, which for 252112 is the supplemental
      // 22906ES403. A box asking a technician for a number that feeds nothing
      // is worse than an empty cell. One line here if KYTC ever wants it back.
      // Pay Values!D9 — "00385 CL3 ASPH SURF 0.38A PG64-22", the approved
      // design's MIX ID followed by its signature. t_smpl carries it as
      // rel_smpl_id. This is the join between the two books, and the
      // workbook already writes it down. (D7, "Approved Mix Design:", is a
      // SECOND cell and a different value — KYTC's own sample id for the
      // approval, "07640AMD260403" in both real lots — and it is the one
      // t_smpl actually reads. Nothing on this form supplies it yet;
      // generate.mjs names it as missing, which is the loud failure.)
      { key: "lot_mix_id", label: "Approved mix design", type: "text", req: true, mono: true },
      // ---- THE MIX, IN DESIGNBOOK'S OWN WORDS --------------------------
      //
      // Jake, 2026-09-13: "the way that it is asking for the mix type seems
      // so much more tedious than the design book, could they not be more
      // similar so that when uploading an approval it is easier to match?"
      //
      // They can, and these two are how. DesignBook's Contract Information
      // asks Nominal size + Mix type; the approval carries both; so the lot
      // shows THE SAME TWO FIELDS with the same option lists and the same
      // labels rather than a second vocabulary for one fact. Reading
      // "0.38 (3/8\")" and "A — polish-resistant" on both books is the whole
      // point - a person moving between them is looking at the same thing.
      //
      // Inherited and tinted but EDITABLE, the same as Contract, County and
      // Plant beside them - one convention per step. Not readonly, and the
      // word is avoided deliberately: `readonly` is inert on a <select> in
      // HTML (it only applies to inputs and textareas), so declaring it here
      // would have looked like a lock and been nothing at all. A field that
      // genuinely must not be retyped is a READOUT on this page - which is
      // what JMF %AC, the air-void target and the minimum VMA already are.
      { key: "lot_nominal_size", label: "Nominal size", type: "select", req: true, mono: true,
        options: [
          { value: "1.50", label: "1.50 (1-1/2\")" }, { value: "1.00", label: "1.00 (1\")" },
          { value: "0.75", label: "0.75 (3/4\")" },   { value: "0.50", label: "0.50 (1/2\")" },
          { value: "0.38", label: "0.38 (3/8\")" },   { value: "NO.4", label: "NO.4 (4.75 mm)" },
        ] },
      { key: "lot_mix_type", label: "Mix type", type: "select", req: true,
        options: [
          { value: "A", label: "A \u2014 polish-resistant" },
          { value: "B", label: "B \u2014 polish-resistant" },
          { value: "D", label: "D \u2014 no polish requirement" },
        ] },
      // ---- and the workbook's own translation of them -------------------
      //
      // `Pay Values`!B5 wants the phrase "Superpave 0.38" and
      // `Calculations`!J1 the code 5, both off the workbook's own
      // Calculations A1:B14 table. NEITHER IS A FIELD (Jake, 2026-09-13:
      // "Type of Mix (AMAW) isn't needed. I don't know what the mixture type
      // code is"). They are a translation of Nominal size and nothing else,
      // so mixTypeFor() answers for them wherever they are wanted - the pay
      // tables on this page, and the mapper on the way to the workbook - and
      // there is no stored copy to drift from the size it was translated
      // from. A readonly box restating a value in a vocabulary the person
      // filling the form does not speak is a question they cannot check,
      // which is the worst kind of question to put on a form.
      //
      // B5 needs nothing written to it at all: it is
      // IF(Calculations!J1=0,"",LOOKUP(...)) in the template, so Excel
      // recomputes the phrase from the code. (`amaw_types` is left with no
      // reader; the entry stays documented in PLANTBOOK_REFERENCE_TABLES
      // rather than being deleted out from under Andrew.)
      { key: "lot_tons",  label: "Lot tonnage",  type: "number", req: true, mono: true },
      { key: "lot_unit",  label: "Unit",         type: "select", req: true,
        options: ["TON"] },
      { key: "lot_unit_price", label: "Unit price ($/ton)", type: "number", req: true, mono: true },
      // Pay Values!J20. Wedge is paid at its own rate when placed
      // monolithically with the mainline, so it comes off the top of the lot
      // tonnage before the pay adjustment (J23/J24). Blank in BOTH real
      // lots, so the subtraction is ported and not proven — hence optional,
      // and a blank means zero rather than missing.
      { key: "lot_wedge_tons", label: "Pavement wedge tons", type: "number", req: false, mono: true },
      // Calculations!D15, the cell the workbook labels "ESAL Class:" at
      // Pay Values!H4 — and the label on THIS form is "AADTT Class", the
      // words DesignBook already uses (Jake, 2026-09-13: "esal class should
      // be AADTT Class like in the design book"). It is the same quantity:
      // D15 chooses between airVoidPay()'s two branches, and those two
      // branches are the 2026 Std Spec's two columns, headed "AADTT Class 2"
      // and "AADTT Class 3 or 4". KYTC renamed the concept away from ESALs
      // and never relabelled the workbook, the same way `Field Rutting`
      // still says "Hamburg". The field key stays `lot_esal_class` because
      // it is the workbook's cell, and the derivation note says which cell.
      // Both real lots are Class 3; every Class 1/2 branch in pay.mjs is
      // transcribed from the formulas and confirmed by nothing.
      { key: "lot_esal_class", label: "AADTT Class", type: "select", req: true,
        options: ["1", "2", "3", "4"] },
      // The three control flags the pay model switches on, as the workbook
      // spells them. These are not preferences — propertyWeights() answers
      // for exactly three of their combinations and weighs every property at
      // zero for the rest, which is a silent 0% lot if it is set wrong.
      //
      // WHAT THE ACCEPTANCE METHOD IS, since the name does not say (Jake,
      // 2026-09-13: "that was my prompt what does that even mean?"): it is
      // WHICH TESTS THE DEPARTMENT ACCEPTS THE LOT ON, and therefore which
      // pay schedule runs. An ordinary asphalt mixture is judged on AC, air
      // voids, VMA, density and gradation (2026 Std Spec 402.03.02 A)) and
      // paid under 402.05.02 - that is VOLUMETRICS. A specialty mixture -
      // OGFC, ATDB, pavement wedge, leveling and wedging, scratch course -
      // gets "one AC and one gradation determination per sublot" (F)) and is
      // paid under a separate Specialty schedule - that is GRADATION.
      //
      // So it follows from the mix, and acceptanceMethodFor() derives it:
      // every lot PlantBook can open comes from a DesignBook approval, and
      // DesignBook designs Superpave mixtures. It is a FIELD rather than a
      // readout because the Department decides acceptance, not the design -
      // but it arrives filled and tinted like every other inherited value.
      { key: "lot_acceptance_method", label: "Acceptance method", type: "select", req: true,
        options: [
          { value: "Volumetrics", label: "Volumetrics" },
          { value: "Gradation",   label: "Gradation (pay not modelled)" },
          { value: "Visual",      label: "Visual" },
        ] },
      // The proposal writes these two words out in full ("OPTION A", "OPTION
      // B"), so the dropdown does too - a bare "A" beside "Acceptance
      // method" reads as a grade.
      { key: "lot_density_option", label: "Density option", type: "select", req: true,
        options: [{ value: "A", label: "Option A" }, { value: "B", label: "Option B — no cores" }] },
      // Derived from the mix by intake.mjs' jointDensityFor(); surface
      // mixtures at 1 inch or greater take joint cores and nothing else
      // does. Still a field rather than a readout, because the proposal's
      // OPTION note is what finally says so and a lot may have to disagree
      // with the derivation.
      { key: "lot_joint_density", label: "Joint density", type: "select", req: true,
        options: [{ value: "1", label: "Yes" }, { value: "2", label: "No" }] },
      { key: "lot_kytc_lab", label: "KYTC lab id", type: "text", req: false, mono: true },
      { key: "lot_ps_lab",   label: "Producer/supplier lab id", type: "text", req: false, mono: true },
      // Pay Values!B3. The sample id prefix each block's name is appended to
      // ("…VI01", "…QC01"). BOTH completed lots leave it blank, so their
      // t_smpl.smpl_id is empty and nothing would load — KYTC evidently
      // fills it at submission. Read an empty one as "not ready to hand
      // off", not as a read failure, which is why it is optional here.
      { key: "lot_sample_id_prefix", label: "Sample id prefix", type: "text", req: false, mono: true },
    ],
      // The AMAW's `Project Items` sheet, A6:C99 - the same sheet, the same
      // three columns and the same ListObject the MixPack has, so the
      // pay-estimate lookup transfers whole and this table is DesignBook's
      // verbatim. It is not decoration: the Spreadsheet Applet expands one
      // t_cont_smpl row per row on that tab, so a lot with none loads
      // carrying no project at all, and generate.mjs names exactly that.
      //
      // It belongs to the LOT rather than to the approval, because a
      // contractor fills it from the proposal they bid and a change order
      // then adds, deletes or re-numbers an item - which is the whole
      // reason the lookup exists (Jake: "contractors use the proposal and
      // most of the time it gets outdated and medl and sitemanger wont
      // accept it"). The button is on the table here and again beside the
      // stage button on the Status step, because a stale sheet bites at
      // hand-off rather than back on step 1.
      rows: {
        key: "project_items", heading: "Project Items", max: 20, start: 1,
        sharesKey: "the same sheet, the same ListObject (A6:C99) and the same "
          + "three columns in the MixPack and in the AMAW - one fact, one name",
        addLabel: "+ add project item",
        action: { id: "itemsLookupBtn", note: "itemsLookupNote", key: "items",
              label: "Look up<span class=\"wide-only\"> project</span> items" },
        grid: "1.1fr .62fr 2fr .8fr .55fr auto",
        columns: [
          // Column A of the sheet. A contract with two routes has a PCN each,
          // so this is per row.
          { key: "project",     label: "Project number",  type: "text",   req: true,  mono: true },
          { key: "line",        label: "Line item",       type: "text",   req: true,  mono: true },
          // Not written to the workbook - it is how a reviewer sees at a
          // glance that the line really is this mix.
          { key: "description", label: "Item description", type: "text",  req: false },
          { key: "quantity",    label: "Represented qty", type: "number", req: true,  mono: true },
          { key: "unit",        label: "Unit",            type: "text",   req: false, mono: true },
        ],
      },
    },

  {
    // ---------------------------------------------------------------
    //  1a. BINDER — a sub-block inside Lot
    // ---------------------------------------------------------------
    //
    //  `into` draws this inside the Lot section's body rather than as a step
    //  of its own, the way Consensus Properties sits inside Aggregate
    //  Structure. It stays a full schema entry, so it keeps its own cite and
    //  its own heading; only where it draws changes. A section with `into`
    //  is not a step. PlantBook was eight steps (not ten) before the Sublot
    //  1-4 split (2026-09-14), ten steps (not thirteen) right after it -
    //  buildSublotTabSections() turned one step into four - nine once the
    //  Gradation split folded "sublot-gradation" `into` a Sublot tab too,
    //  eight again once Aggregate Blend moved `into: "sublot-1"` the same
    //  day, and is SEVEN STEPS now that Department Verification has too -
    //  Lot, Sublot 1-4, Lot Pay, Submit. This IS Andrew's target shape: the
    //  seven tabs he asked for. Twenty-one total array entries; seven of
    //  them are steps.
    //
    //  Pay Values!B46/C46 plus the grade the workbook VLOOKUPs at
    //  Calculations!D147 into A147:B161. addresses.mjs says it outright:
    //  PlantBook should read `binder_grades` instead of that in-sheet table,
    //  same rule as everywhere else. `PG Producer` / `Producer supplier` in
    //  the workbook are the same terminals as `binder_terminals`.
    //
    //  Andrew, 2026-09-14: label shortened from "Binder & additive" to
    //  "Binder" (the field below is "Additive" now, not "Anti-strip
    //  additive" - the section name doesn't need to repeat it), `banded:
    //  true` added for the same navy `.section-head`-style band the
    //  Aggregate Structure/Design Values mirrors got, and a new Additive
    //  Dosage rate field. `lot_additive_dosage` has NO KNOWN AMAW CELL YET -
    //  see NO_WORKBOOK_CELL in check_sections.mjs and the note in
    //  NEXT_STEPS.md. It is typed and will round-trip through the lot's own
    //  save/load, it just is not written into a generated AMAW until
    //  someone confirms the real cell against a workbook.
    id: "binder", label: "Binder", into: "lot", banded: true,
    tag: "AMAW · Pay Values B46/C46 — dropdowns from Supabase reference",
    type: "grid",
    cites: ["accept402"],
    fields: [
      { key: "lot_binder_terminal", label: "Binder producer", type: "text", req: true,
        source: "binder_terminals" },
      { key: "lot_binder_grade", label: "Binder grade", type: "text", req: true, mono: true,
        source: "binder_grades" },
      { key: "lot_additive", label: "Additive", type: "text", req: false },
      // % by weight of binder - Andrew's call, 2026-09-14. Not `req`: an
      // additive is itself optional (`lot_additive` above), so a dosage rate
      // with nothing to dose is meaningless rather than missing.
      { key: "lot_additive_dosage", label: "Additive dosage rate (%)", type: "number",
        req: false, mono: true },
    ],
  },

  {
    // ---------------------------------------------------------------
    //  1a. AGGREGATE STRUCTURE (approved design) — read-only mirror
    // ---------------------------------------------------------------
    //
    //  Andrew, 2026-09-14: Contract & Mix should show what the aggregate
    //  structure and design values WERE on the approved design, not just the
    //  three pay-schedule numbers `jmf-figures` already prints under Lot Pay.
    //  A reviewer opening a lot should be able to see what was approved
    //  without leaving step 1 or reaching for the PDF.
    //
    //  This is `lot.values.design.aggregate` (intake.mjs), which is
    //  DesignBook's own five columns UNRESHAPED — producer, type & size, mat
    //  code, % blend, Gsb — the same rows CONFIG.SECTIONS renders on that
    //  book's Aggregate Structure step. It is NOT `lot.rows.blend`: that is
    //  the AMAW-shaped, per-sublot, EDITABLE working copy of these same
    //  components (Aggregate Blend, below), and the two must not be
    //  confused — one is what the plant is producing, this is what KYTC
    //  approved.
    //
    //  `type: "design-mirror"` is new and deliberately narrow: a section with
    //  neither `fields` nor `rows`, painted straight from `lotDesign()` by
    //  `paintDesignMirror()` on the page side. Nothing in it carries
    //  data-col/data-field/data-dv, so collectForm() cannot see it and there
    //  is nothing on it for a technician to edit or for check_sections.mjs's
    //  scalar/row-key checks to have an opinion about — it is pure display,
    //  same footing as a static caption. Andrew's call: the CONSENSUS
    //  PROPERTIES half of DesignBook's Aggregate Structure section is left
    //  out here — just the component table.
    //
    //  `banded: true` is also new: Andrew asked for "the bold navy blue
    //  header the rest of the boxes have" rather than the plain `.subhead`
    //  every other `into` sub-block gets (Binder & additive, Hand-mixed
    //  check sample). See the page-side CSS comment on `.subhead.banded`.
    id: "design-aggregate", label: "Aggregate Structure", into: "lot",
    tag: "from the approved design — read-only", banded: true,
    type: "design-mirror", show: "aggregate",
    cites: ["agg805"],
  },

  {
    // ---------------------------------------------------------------
    //  1b. DESIGN VALUES (approved design) — read-only mirror
    // ---------------------------------------------------------------
    //
    //  Same decision, same mechanism, the other read-only mirror Andrew
    //  asked for: all ten of DesignBook's own Design Values figures — AC/
    //  design Pb, air voids, VMA, VFA, Gmm, Gmb, Gse, Pbe, dust ratio, unit
    //  weight — as the design achieved them, not as a sublot measures them.
    //  `design_pb` comes off `lotDesign().jmf_ac` (the same figure
    //  `jmf-figures` already prints under Lot Pay); the other nine are
    //  `lotDesign().volumetrics`, intake.mjs's `achieved` object. Nothing
    //  new to inherit — both were already on the lot envelope before this,
    //  just not shown here.
    id: "design-values-ref", label: "Design Values", into: "lot",
    tag: "from the approved design — read-only", banded: true,
    type: "design-mirror", show: "design-values",
    cites: ["volumetric"],
  },

  // 3. SUBLOTS 1-4 — one tab per sublot; see buildSublotTabSections() and
  // its base specs above (SUBLOT_TICKETS_SPEC etc.), which carry every
  // comment the old single "Sublots" step held. Cores & Density
  // (mat_cores/joint_cores, formerly its own step) is folded in the same
  // way - see MAT_CORES_SPEC/JOINT_CORES_SPEC above.
  ...buildSublotTabSections(),

  {
    // ---------------------------------------------------------------
    //  3a. HAND-MIXED CHECK SAMPLE — a sub-block inside Sublot 1
    // ---------------------------------------------------------------
    //
    //  SUBLOT.handMixed — Superpave!N43/N42. Lot-level: one per lot, the
    //  same cell in all seven blocks, which is why it is not a column on any
    //  of the four sublot tabs. `into: "sublot-1"` (formerly `into:
    //  "sublots"`, before that step became four) puts it on the first
    //  sublot's tab rather than giving it a step of its own or repeating it
    //  on all four - Andrew's call, 2026-09-14.
    id: "handmix", label: "Hand-mixed check sample", into: "sublot-1", banded: true,
    tag: "AMAW · Superpave N42/N43 — one per lot",
    type: "grid",
    cites: ["accept402"],
    fields: [
      // N43, typed - the whole point of a hand-mixed sample is that somebody
      // weighed the binder in, so this is known rather than measured.
      { key: "lot_handmix_binder_pct", label: "Hand-mixed %AC", type: "number", req: false, mono: true },
      // N42 = AVERAGE of the two determinations below, so it is computed now
      // rather than typed.
      { key: "lot_handmix_gmm", label: "Hand-mixed Gmm", type: "number", req: false, mono: true, readonly: true },
      // J8 = (100-N43)/((100/N42)-(N43/1.03)). Not a cell a person fills, but
      // shown because every sublot's VMA and Pbe are measured against it, and
      // a blank one explains why those columns are blank.
      { key: "lot_gse", label: "Gse (effective aggregate)", type: "number", req: false, mono: true, readonly: true },
    ],
    // The same Rice test as the sublots', on the lot's hand-mixed sample -
    // `Superpave` columns M and N of the same block. WATCH THE ROUNDING: this
    // pair is NOT rounded to three decimals where the sublot pairs are, which
    // is a real difference in the workbook and not a transcription slip. See
    // handMixedGse() in volumetrics.mjs.
    rows: {
      key: "handmix_msg", heading: "Hand-mixed MSG determinations", banded: true, fixed: true,
      grid: ".5fr 1fr 1fr 1fr 1fr .8fr",
      seed: HANDMIX_SEED,
      columns: [
        { key: "determination", label: "Bowl #", type: "text", mono: true, readonly: true },
        { key: "wt_mix", label: "Wt of mix (g)", type: "number", req: false, mono: true },
        { key: "calibration", label: "Calibration (g)", type: "number", req: false, mono: true },
        { key: "final_wt", label: "Final wt (g)", type: "number", req: false, mono: true },
        { key: "absorbed_water", label: "Absorbed water (g)", type: "number", req: false, mono: true },
        { key: "msg", label: "MSG", type: "number", req: false, mono: true, readonly: true },
      ],
    },
  },

  // 4. GRADATION — folded into the four Sublot tabs above
  // (buildSublotGradationSections()), Andrew's 2026-09-14 ask. See that
  // function's own comment for what came with it (JMF read-only
  // everywhere, no chart, QA/IQ gradation dropped) and why - the RENDERER
  // GAP (3) history that used to live in this comment (the composite-key
  // growth sievesHTML() needed to draw seven columns at all, WEIGHTS IN /
  // PERCENT PASSING OUT, Jake 2026-09-14) is unchanged and still applies -
  // it just belongs to sievesHTML()/computeGradation() generally now, not
  // to one section.
  ...buildSublotGradationSections(),

  // 5. CORES — folded into the four Sublot tabs above (MAT_CORES_SPEC /
  // JOINT_CORES_SPEC, sliced by sliceSpec()). See buildSublotTabSections()
  // for why two tables and not one with a Mat/Joint column (still true,
  // unchanged): lane density and joint density are two different pay
  // properties, run through two different pay curves in pay.mjs.

  // 6. VERIFICATION — folded into the four Sublot tabs above
  // (buildSublotVerificationSections()), Andrew's 2026-09-14 ask. See that
  // function's own comment for the full reasoning (the dropped "Verifies"
  // dropdown, the new per-table `sublot` join column, and the one
  // mapper.mjs change this needed - equipment_verified moving from a
  // lot-wide scalar into this table's own row column). `Super Verify`'s
  // columns are NOT `Superpave`'s (the same eight quantities sit one
  // column left of `pbe` on: pbe K/L, vma L/M, vfa M/N, dustRatio N/O) -
  // the mapper resolves them through VERIFY.cols and never through
  // SUBLOT.volumetric.cols, unchanged by this move.
  ...buildSublotVerificationSections(),

  {
    // ---------------------------------------------------------------
    //  7. PAY — the lot pay readout
    // ---------------------------------------------------------------
    //
    //  Same `type: "computed"` as DesignBook's Design Values, and for the
    //  same reason: nothing here is typed. Every line is produced by
    //  scripts/amaw/pay.mjs (ported out of the workbook, every band edge
    //  citing the cell it came from, re-run against both real lots by
    //  check_pay.mjs), and `computedHTML()` prints `data-dv="${key}"` cells
    //  for the page to write into.
    //
    //  Andrew's 2026-09-11 decision applies here with more force than it
    //  does on a mix design: the calculated value is gospel. THIS COMPUTES
    //  MONEY. A wrong band edge is a silent four-figure error on one lot and
    //  nobody notices.
    //
    //  ---- THREE THINGS THE RENDERER HAS TO RESPECT --------------------
    //
    //  RENDERER GAP (4): a pay value can be the STRING "MCL" — "material
    //  control limit", a real state, not an error and not a zero: the lot
    //  leaves the pay schedule and becomes a conversation with the
    //  Department. `computedHTML()` prints whatever string it is given, so
    //  it needs no change, but whatever writes these cells must not coerce.
    //  And a property that has not been tested is null, and null must never
    //  become 0 — an untested joint is not a free deduction.
    //
    //  RENDERER GAP (5): each property carries a WEIGHT (15/30/5/25/25 under
    //  the ordinary flags) and the weighted sum is the whole calculation, so
    //  the weight belongs on screen beside its value. `computedHTML()` draws
    //  one value column. It HAD a two-column `.dvtable.two` variant, and
    //  CLAUDE.md is explicit that bringing it back for DesignBook would be a
    //  reversion of Andrew's decision rather than a bug fix — so do NOT
    //  reuse that code path. A `weight` column here is a different thing
    //  entirely (it is part of the arithmetic, not a second opinion about
    //  the same number) and wants its own small variant. The `weight` key on
    //  each output below is inert today and is what that would read.
    //
    //  Two branches produce no final pay at all, and both are correct
    //  answers rather than failures: an MCL property, and Gradation
    //  acceptance (Calculations!H13 = 1), whose pay is a second schedule
    //  over fifteen sieve/AC deviations per sublot that pay.mjs does not
    //  model and says so in `notes`. Those notes belong under this table.
    id: "pay", label: "Lot Pay", step: "Lot Pay",
    tag: "computed from the sublots, cores and the approved JMF",
    type: "computed",
    cites: ["pay402", "density402"],
    // computedHTML()'s head band names the table, and its default is
    // DesignBook's "From Four Points". A lot's figures come from the
    // sublots, the cores and the approved JMF, so it says so.
    valueHead: "Lot pay",
    note: "Read-only \u2014 computed from the sublots, the cores and the three " +
          "figures the approved design supplies. A weight of \u00d70% means that " +
          "property does not count on this lot.",
    outputs: [
      { key: "pay_joint_density", label: "Joint density (%)", weight: "jointDensity",
        row: "Joint density" },
      { key: "pay_lane_density",  label: "Lane density (%)",  weight: "laneDensity",
        row: "Lane density" },
      { key: "pay_ac",   label: "%AC (%)",      weight: "ac",  row: "%AC" },
      { key: "pay_av",   label: "Air voids (%)", weight: "av", row: "Air voids" },
      { key: "pay_vma",  label: "VMA (%)",      weight: "vma", row: "VMA" },
      // Calculations!A71, printed as-is at 'Pay Values'!J21. NOT capped:
      // A72 computes the capped figure and the sheet then does not use it —
      // the cap is a printed instruction to the person paying ("***Final Pay
      // should be made at 100% Maximum"). J23/J24 multiply by the UNCAPPED
      // one, so both print and neither is quietly dropped.
      { key: "pay_final_pct",     label: "Final pay (%)",            row: "Final pay" },
      { key: "pay_final_capped",  label: "Final pay, capped at 100%", row: "Capped (advisory)" },
      // ('Pay Values'!J20 off the top: wedge is paid at its own rate.)
      { key: "pay_tons",          label: "Pay tonnage",   row: "Tonnage less wedge" },
      { key: "pay_tonnage_adj",   label: "Tonnage adjustment", row: "Tonnage adjustment" },
      { key: "pay_dollar_adj",    label: "Dollar adjustment ($)", row: "Dollar adjustment" },
    ],
  },

  {
    // ---------------------------------------------------------------
    //  7a. THE THREE FIGURES THE PAY IS MEASURED AGAINST — inside Lot Pay
    // ---------------------------------------------------------------
    //
    //  Moved here from the Contract & Mix step on 2026-09-13 (Jake: "take
    //  the jmf ac, target av and minimum vma off the contract and mix
    //  tab"). They are not contract facts and they are not mix facts — they
    //  are the three constants the pay schedule is measured against, so they
    //  belong beside the pay they produce rather than on the step a person
    //  fills in first. `into` puts them there without making them a step of
    //  their own, the same mechanism Consensus Properties uses inside
    //  Aggregate Structure.
    //
    //  READOUTS, NOT FIELDS, and that is a decision rather than a shortcut.
    //  They come off the SIGNED approval (CLAUDE.md: "Pay is meaningless
    //  without them, so the approval upload is what makes the pay step
    //  computable at all"). A signature that covers a value and a form that
    //  lets someone retype it are contradictory; a typed JMF %AC is a silent
    //  four-figure error on one lot. So the page prints them from
    //  state.approval / the verified payload and carries them into the lot
    //  envelope from there — they are never read back out of the DOM by
    //  collectForm().
    //
    //  If the approval is missing or its signature does not verify, these
    //  read "—" and the pay above has nothing to compute, which is the
    //  honest answer and exactly what should happen — and it now reads that
    //  way in the place where the emptiness is explained rather than a step
    //  and a half away from it.
    id: "jmf-figures", label: "From the approved design", into: "pay",
    tag: "AMAW · the approval's JMF — read-only, and signed",
    type: "grid",
    cites: ["jmf"],
    fields: [
      { type: "readout", label: "JMF %AC", out: "jmf_ac",
        sub: "from the approved design" },
      { type: "readout", label: "Target air voids (%)", out: "target_va",
        sub: "from the approved design" },
      { type: "readout", label: "Minimum VMA (%)", out: "min_vma",
        sub: "from the approved design" },
    ],
  },

  {
    // ---------------------------------------------------------------
    //  8. STATUS — submit / approve
    // ---------------------------------------------------------------
    //
    //  `id: "lot-status"`, NOT "status" — DesignBook owns that id, and two
    //  sections answering to one getElementById in a shared page is the
    //  failure CLAUDE.md already records for the moved #advanceStage node.
    //
    //  RENDERER GAP (6, small): `type: "status"` calls `statusHTML()`, which
    //  is DesignBook's — its three stages (Draft -> Submitted -> Approved),
    //  its Submit button, its #advanceStage, and the MixPack generator
    //  hanging off the approval. PlantBook's stages are a lot's (Open ->
    //  Submitted -> Accepted, per storage.mjs's envelope) and its generator
    //  writes an AMAW, not a MixPack. statusHTML() has to branch on which
    //  book is rendering. Everything else about this step is already right:
    //  #valBlock lists the whole lot, #saveMsg stays in that block and NOT
    //  in the 44px action bar, because the generator's list of what the lot
    //  lacks is exactly the message you cannot afford to clip.
    //
    //  THE AMAW DOWNLOAD IS REVIEWER-ONLY — REVERSED 2026-09-14 (Jake):
    //  "the contractors don't need to see the upload for medl, they should
    //  only see the PDF that is to be submitted to kytc. Just like on the
    //  design book Andrew and Tate with reviewer access can take that
    //  submitted PlantBook PDF and turn it into the medl file."
    //
    //  This reverses a note that stood here for one day and said the
    //  opposite in capitals ("anyone holding the lot may download the
    //  AMAW... do not add a can_review gate here"), on the reasoning that
    //  the AMAW is the contractor's own document in a way the MixPack is
    //  not. Jake has settled it the other way, and the reasoning that wins
    //  is the one DesignBook already runs on: MEDL is KYTC's loader, a
    //  contractor never touches it, and a workbook nobody outside the
    //  Department can load is a button that can only confuse the person
    //  it is shown to.
    //
    //  What a contractor gets instead is not less: the lot PDF is the save
    //  at any point, and the submittal PDF is the thing that goes to KYTC.
    //  The lot pay — which is most of why a contractor cares — is ON those
    //  PDFs, computed, so nothing they actually need moved behind the gate.
    //
    //  And the hand-off works because the submittal PDF carries the whole
    //  lot envelope inside it: a reviewer opens that same file through the
    //  front door, `openLotEnvelope()` restores the lot exactly, and the
    //  AMAW is generated from there. Same shape as DesignBook, where the
    //  MixPack is built from the approval a reviewer is holding.
    //
    //  One thing IS carried over from DesignBook's Status step unchanged:
    //  the project-items lookup sits here as well as on the Lot step — the
    //  AMAW's `Project Items` sheet is the same sheet with the same
    //  ListObject (A5:C99, prj_nbr | ln_itm_nbr | repr_qty), so the
    //  pay-estimate lookup transfers whole, and a stale sheet bites at
    //  hand-off rather than back on step 1.
    id: "lot-status", label: "Status & validation", step: "Submit",
    tag: "workflow", type: "status",
  },
];

export default PLANTBOOK_SECTIONS;
