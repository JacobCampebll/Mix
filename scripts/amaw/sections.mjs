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
//  governing sections and are NOT in CONFIG.SPECS.CITES yet. They are
//  carried here with `verified: false` and NO page number, because a cite
//  chip is a link and a link to a guessed page is worse than no chip. The
//  checker prints every unverified cite on every run — same rule as
//  UNCLASSIFIED in addresses.mjs: carried explicitly rather than guessed at.
//
//  TO CLOSE THIS: open the 2026 Standard Specifications (CONFIG.SPECS.DOCS
//  .STD), find each section, record its PHYSICAL page and its section-
//  relative footer ("403-7"), and move the entry into CONFIG.SPECS.CITES.
//  The book has no named destinations and no running page numbers, which is
//  why the footer is recorded too — it is how you re-find the page in one
//  search when the next edition moves it.
export const PLANTBOOK_CITES = {
  accept403: {
    doc: "STD", page: null, footer: null, verified: false,
    label: "KYTC 403.03.04",
    what: "acceptance of asphalt mixtures — lots, sublots and sampling",
  },
  density403: {
    doc: "STD", page: null, footer: null, verified: false,
    label: "KYTC 403.03.05",
    what: "in-place density — mat and longitudinal-joint cores",
  },
  pay403: {
    doc: "STD", page: null, footer: null, verified: false,
    label: "KYTC 403.05",
    what: "price adjustment for asphalt mixtures",
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
const VERIFY_SEED = VERIFY_RECORDS.map((r) => ({ record: r.label }));
const VERIFY_ROW_SEED = VERIFY_RECORDS.map((r) => ({ record: r.key }));
const VERIFY_SPECIMEN_SEED = VERIFY_RECORDS.flatMap((r) =>
  ["1", "2"].map((specimen) => ({ record: r.key, specimen })));

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
    cites: ["jmf", "accept403"],
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
    //  1a. BINDER & ADDITIVE — a sub-block inside Lot
    // ---------------------------------------------------------------
    //
    //  `into` draws this inside the Lot section's body rather than as a step
    //  of its own, the way Consensus Properties sits inside Aggregate
    //  Structure. It stays a full schema entry, so it keeps its own cite and
    //  its own heading; only where it draws changes. A section with `into`
    //  is not a step, so PlantBook is eight steps, not ten.
    //
    //  Pay Values!B46/C46 plus the grade the workbook VLOOKUPs at
    //  Calculations!D147 into A147:B161. addresses.mjs says it outright:
    //  PlantBook should read `binder_grades` instead of that in-sheet table,
    //  same rule as everywhere else. `PG Producer` / `Producer supplier` in
    //  the workbook are the same terminals as `binder_terminals`.
    id: "binder", label: "Binder & additive", into: "lot",
    tag: "AMAW · Pay Values B46/C46 — dropdowns from Supabase reference",
    type: "grid",
    cites: ["accept403"],
    fields: [
      { key: "lot_binder_terminal", label: "Binder producer", type: "text", req: true,
        source: "binder_terminals" },
      { key: "lot_binder_grade", label: "Binder grade", type: "text", req: true, mono: true,
        source: "binder_grades" },
      { key: "lot_additive", label: "Anti-strip additive", type: "text", req: false },
    ],
  },

  {
    // ---------------------------------------------------------------
    //  2. BLEND — `Superpave` rows 3..8, the aggregate structure
    // ---------------------------------------------------------------
    //
    //  `id: "blend"`, not "aggregate": DesignBook owns that id.
    //
    //  ---- THE PER-SUBLOT PERCENTAGE, AND WHY IT IS FOUR COLUMNS -------
    //
    //  Producer, type & size and BOD specific gravity are lot-level
    //  (`Superpave` N/O/Q, rows 3..8). THE PERCENTAGE IS NOT: it is one
    //  column per sublot — R/S/T/U — and so is combined Gsb at row 9. Both
    //  real lots repeat the same five percentages across all four columns,
    //  which is precisely why it reads as lot-level until you check the
    //  addresses (docs/amaw-map.md's own CORRECTION).
    //
    //  Three ways to express that were considered:
    //
    //    (a) One "% blend" column. Rejected: it is a lie the moment a plant
    //        adjusts its blend mid-lot, and it is a lie that cannot be
    //        detected — the four columns would silently collapse to
    //        whichever one was written last.
    //    (b) One "% blend" column plus three optional overrides, blank
    //        meaning "same as sublot 1". Rejected: blank-means-inherit is a
    //        convention the renderer cannot show and collectForm() cannot
    //        distinguish from not-yet-entered. A blank cell in this
    //        codebase means "nobody has said", everywhere else.
    //    (c) Four explicit columns, one per sublot. CHOSEN.
    //
    //  The cost of (c) is four near-identical columns on the ordinary lot
    //  where the blend never moved. That is a real cost and it is the right
    //  one to pay: the table then says exactly what the workbook holds, the
    //  mapper is a straight copy rather than a fan-out, and a lot whose
    //  blend DID move is representable instead of being quietly flattened.
    //  The page should offer a "copy sublot 1 across" affordance so the
    //  common case is one number and three clicks — that is UI sugar over an
    //  honest model, which is the right way round.
    //
    //  Combined Gsb is per-sublot for the same reason (row 9, R9/S9/T9/U9)
    //  and is DERIVED from the percentages and the BODs, so it is a second,
    //  fixed, one-row readonly table below the blend rather than four more
    //  columns on it. Same pattern as TSR's readonly Gmb / air voids
    //  columns: computed by the page, still collected, still round-tripped.
    id: "blend", label: "Aggregate Blend", step: "Blend",
    tag: "AMAW · Superpave rows 3-8 · % is PER SUBLOT",
    type: "rows",
    cites: ["agg805"],
    rows: [
      {
        key: "blend", heading: "Blend components", max: 6, start: 6,
        addLabel: "+ add aggregate component (up to 6)",
        // Six rows from the start, `start: 6`, same reasoning as TSR's six
        // specimens: `Superpave` has exactly six component slots (rows 3..8,
        // AGGREGATE.count) and a lot that uses five leaves one blank.
        // collectForm() drops an all-empty row, so unused slots never reach
        // the payload — but note the required-field count rises with them,
        // which is honest rather than a bug.
        //
        // Nine tracks. The producer name is the long one (up to 48 chars —
        // "HAYDON MATERIALS, LLC - AIRPORT ROAD @ BARDSTOWN") and the four
        // percentages are three characters each, so the weights follow the
        // content rather than being equal. gridWeights() reads this same
        // string for the review sheet.
        grid: "1.9fr .75fr 1.15fr .5fr .42fr .42fr .42fr .42fr auto",
        columns: [
          // AGP and AMP are different registries, and a RAP row needs the
          // second one — an AGP number is an aggregate producer, an AMP
          // number is an asphalt plant, and RAP is millings, so its
          // "producer" is the plant they came off. `alt` swaps the list and
          // the label per row, detected by Type & size (never by Producer).
          { key: "producer", label: "Producer", type: "text", req: true, source: "aggregates",
            // The workbook stores the CODE (Superpave!N, "AGP027501"), not
            // the name, so the code has to reach the payload — unlike a
            // legacy MixPack import, where `_agp` rides on the row and is
            // deliberately NOT a schema column because nothing downstream
            // wants it. Here the loader reads it, so it is a column.
            fills: { agp: (r) => r.agp_number },
            alt: {
              when: (row) => isRapRow(row),
              source: "plants", label: "Plant (RAP source)",
              // RENDERER GAP (2) — SILENT. effectiveColDef() copies only
              // `source` and `label` off `alt`, so on a RAP row this `fills`
              // never replaces the one above: the outer fills runs with a
              // `plants` row in hand, finds no `agp_number`, and CLEARS the
              // code cell it filled a moment ago. Teaching effectiveColDef()
              // to carry `fills` through is a two-line change and is
              // required before the RAP row works. Declared here so the fix
              // has something to switch on.
              fills: { agp: (r) => r.amp_number },
            } },
          // Filled from the chosen producer, and editable — a retired
          // producer or an older spelling that the table lacks is a WARNING
          // and is KEPT, never blanked (CLAUDE.md's provisional-values rule
          // applied to lists).
          { key: "agp", label: "AGP / AMP", type: "text", req: true, mono: true },
          { key: "type_size", label: "Type & size", type: "text", req: true,
            source: "aggregate_types" },
          // Superpave!Q. KYTC's own wording on the sheet.
          { key: "bod", label: "BOD sp. gr.", type: "number", req: true, mono: true },
          { key: "pct_1", label: "% S1", type: "number", req: true, mono: true },
          { key: "pct_2", label: "% S2", type: "number", req: true, mono: true },
          { key: "pct_3", label: "% S3", type: "number", req: true, mono: true },
          { key: "pct_4", label: "% S4", type: "number", req: true, mono: true },
        ],
      },
      {
        // Superpave row 9, R9/S9/T9/U9. Fixed at one row because there is
        // exactly one combined Gsb per sublot; readonly because it is
        // computed from the four percentage columns above and the BODs, and
        // a typed combined Gsb that disagrees with its own blend is a
        // reviewer's nightmare. `span` keeps it narrow instead of stretching
        // four numbers across the full width.
        key: "blend_gsb", heading: "Combined Gsb, by sublot",
        fixed: true, span: [6, 12],
        grid: "1fr 1fr 1fr 1fr",
        seed: [{}],
        columns: [
          { key: "gsb_1", label: "Sublot 1", type: "number", mono: true, readonly: true },
          { key: "gsb_2", label: "Sublot 2", type: "number", mono: true, readonly: true },
          { key: "gsb_3", label: "Sublot 3", type: "number", mono: true, readonly: true },
          { key: "gsb_4", label: "Sublot 4", type: "number", mono: true, readonly: true },
        ],
      },
    ],
  },

  {
    // ---------------------------------------------------------------
    //  3. SUBLOTS — `Superpave`, two strides
    // ---------------------------------------------------------------
    //
    //  Two tables, not one, and the workbook is the reason: the truck ticket
    //  steps ONE row (3,4,5,6) and the volumetric block steps SIX
    //  (14,20,26,32). addresses.mjs: "They are not the same table and must
    //  not share a constant." One fourteen-column table on screen would
    //  invite exactly that mistake in the mapper, and would put fourteen
    //  tracks in 1116px, which is 80px a column before the labels.
    //
    //  Both are `fixed` with four seeded rows rather than `start: 4`. A lot
    //  IS four QC sublots — QC01..QC04 in t_tst_rslt_dtl, four blocks on
    //  `Superpave`, four columns on `Gradation`, four rows of pay — so there
    //  is no add button to press and no fifth row to add. The sublot number
    //  is seeded and readonly for the same reason. Note the consequence:
    //  because the seeded column is never empty, collectForm() never drops
    //  one of these rows, so all four always reach the payload even when
    //  only two have been run. That is right for a lot: an untested sublot
    //  is a sublot that has not happened yet, not one that does not exist.
    id: "sublots", label: "Sublots", step: "Sublots",
    tag: "AMAW · QC01-QC04 — tickets stride 1 row, volumetrics stride 6",
    type: "rows",
    cites: ["accept403", "volumetric"],
    rows: [
      {
        key: "sublot_tickets", heading: "Sublot tickets", fixed: true,
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
          // It is on the TICKETS table rather than beside that figure because
          // the volumetrics table is nine short numbers and a 24-character
          // dropdown has no business in it; this is the step's one row per
          // sublot of record-keeping, which is what the method is.
          //
          // Seeded to Ignition Furnace and editable per sublot - see
          // AC_METHODS above for the whole list and why it is one definition.
          // `req: false` deliberately: a blank leaves AP/AU unwritten, which
          // is what both the template and a mid-production lot already look
          // like, and nothing in pay.mjs reads it.
          { key: "ac_method", label: "AC method", type: "select", req: false,
            options: AC_METHODS },
        ],
      },
      // ---- THE RAW WEIGHTS THE VOLUMETRICS ARE COMPUTED FROM ----------
      //
      // THE SHAPE, CONFIRMED WITH JAKE 2026-09-13 AND NOT TO BE RE-OPENED:
      // ONE PLANTBOOK IS ONE LOT. Four sublots per lot, two BSG samples and
      // two MSG bowls per sublot - "Each plant book represents 1 lot, then
      // once that is finished they would begin the 2nd lot". It matches the
      // workbook exactly: `Superpave` has four blocks captioned "Sublot # 1"
      // .. "# 4" at rows 10/16/22/28, each with exactly two "Sample #" rows
      // before its Average row, and the MSG block has two column pairs per
      // sublot (C,D / E,F / G,H / I,J). There is no room for a third of
      // either, and both real accepted lots filled exactly two.
      //
      // Holding several lots in one PlantBook was raised and withdrawn the
      // same day. An AMAW is one lot by construction - one set of Superpave
      // blocks, one lot number at 'Pay Values'!F3, and Calculations gates the
      // sublot-1 pay allowance on that lot number being 1 - so a multi-lot
      // PlantBook would have to generate one workbook per lot anyway.
      //
      // Jake, 2026-09-13: "we need it to where contractors can input raw
      // results for the msg and bsg that computes the numbers and then
      // computes air voids for each sub lot". Before this, every figure on
      // the volumetrics table below was TYPED - eight numbers per sublot,
      // all eight of which the AMAW computes for itself from weights already
      // on the technician's bench sheet. Typing a derived figure is how a lot
      // ends up disagreeing with the workbook it will be loaded from, and it
      // is thirty-two chances to fat-finger a decimal.
      //
      // `volumetrics.mjs` does the arithmetic and `check_volumetrics.mjs`
      // proves it reproduces both real lots cell for cell.
      {
        key: "sublot_bsg", heading: "Bulk specific gravity (BSG) — 2 samples for each of the 4 sublots",
        fixed: true,
        grid: ".7fr .5fr 1fr 1fr 1fr .9fr .9fr",
        seed: SPECIMEN_SEED,
        columns: [
          // "<lot>-<sublot>", KYTC's own convention - the workbook writes core
          // ids as "1-2-A" for lot 1 sublot 2, and Jake: "1-1 would mean lot 1
          // and sublot 1". Painted by paintSublotIds() from the Lot step's lot
          // number, so it follows a lot 2 without anyone retyping it, and read
          // back by sublotIndexOf(), which is the ONLY reader of this cell.
          // "Sample #" is the workbook's own caption (Superpave
          // A10 "Sublot # 1", A11 "Sample #"). They were "Sublot" and "Spec."
          // until 2026-09-13 and Jake read the pair as lot-and-sublot - two
          // columns of bare 1..4 and 1..2 side by side do not say which is
          // which on their own. A PlantBook is ONE lot; see the schema note.
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
          // NO unit weight column. It is BSG x 62.4 restated beside itself, it
          // is read by nothing in pay.mjs, the mapper or payview, and Jake asked
          // for it off this tab (2026-09-13). PB_VOL still computes it - the
          // workbook keeps the column and the mapper will want it - it just is
          // not shown.
        ],
      },
      {
        key: "sublot_msg", heading: "Maximum specific gravity (MSG, Rice) — 2 bowls for each of the 4 sublots",
        fixed: true,
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
      },
      {
        key: "sublot_volumetrics", heading: "Sublot volumetrics — computed", fixed: true,
        // Ten columns of short figures. EVEN tracks, deliberately: an earlier
        // weighting gave unit_weight 73px and va 50px at a 701px window, and
        // "4.57" in 50px clips while the wider neighbour sat half empty. Every
        // value here is 2-6 characters, so none has a claim on more room than
        // the others.
        grid: ".7fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
        seed: SUBLOT_SEED,
        columns: [
          { key: "sublot", label: "Lot-sublot", type: "text", mono: true, readonly: true },
          // Superpave!B — the workbook's "% Binder in Mix". STILL TYPED, and
          // the one figure on this table that is: the workbook takes it from
          // the Gradation tab's as-tested AC less a correction at row 48
          // (`B14 = Gradation!D33`), which is its own re-plumbing rather than
          // part of this change. Leaving it typed is honest; computing six of
          // the eight and silently guessing the seventh would not be.
          { key: "binder_pct", label: "%AC", type: "number", req: true, mono: true },
          // Everything from here is computed by volumetrics.mjs and painted
          // by the page. None carries `req`: the rail asks for the raw
          // weights above, because those are what a person can supply.
          { key: "gmb", label: "Gmb (BSG)", type: "number", req: false, mono: true, readonly: true },
          // NO unit weight on this row. It is BSG x 62.4 - a restatement of the
          // column beside it - it is already shown per specimen on the BSG table
          // above, and nothing in pay.mjs, the mapper or payview reads it. Ten
          // columns of figures clipped at 700-800px and this was the one with no
          // claim to the room.
          { key: "gmm", label: "Gmm (MSG)", type: "number", req: false, mono: true, readonly: true },
          { key: "va", label: "Va (%)", type: "number", req: false, mono: true, readonly: true },
          { key: "pbe", label: "Pbe (%)", type: "number", req: false, mono: true, readonly: true },
          { key: "vma", label: "VMA (%)", type: "number", req: false, mono: true, readonly: true },
          { key: "vfa", label: "VFA (%)", type: "number", req: false, mono: true, readonly: true },
          // KYTC writes it "D/A"; pay.mjs and the loader call it dustRatio.
          // = (% passing the #200, off the Gradation step) / Pbe, and it can
          // legitimately read ">1.6" or "<0.6" rather than a number - the
          // workbook prints a spec note beside it when it does.
          { key: "dust_ratio", label: "D/A ratio", type: "text", req: false, mono: true, readonly: true },
        ],
      },
    ],
  },

  {
    // ---------------------------------------------------------------
    //  3a. HAND-MIXED CHECK SAMPLE — a sub-block inside Sublots
    // ---------------------------------------------------------------
    //
    //  SUBLOT.handMixed — Superpave!N43/N42. Lot-level: one per lot, the
    //  same cell in all seven blocks, which is why it is not a column on the
    //  four-row table above. `into` puts it under the sublots it checks
    //  rather than giving two fields a step of their own.
    id: "handmix", label: "Hand-mixed check sample", into: "sublots",
    tag: "AMAW · Superpave N42/N43 — one per lot",
    type: "grid",
    cites: ["accept403"],
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
      key: "handmix_msg", heading: "Hand-mixed MSG determinations", fixed: true,
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

  {
    // ---------------------------------------------------------------
    //  4. GRADATION — fourteen sieves by seven columns
    // ---------------------------------------------------------------
    //
    //  RENDERER GAP (3) — the big one, and it fails LOUDLY (blank inputs
    //  rather than wrong ones), which is the good kind.
    //
    //  `sievesHTML()` today draws a two-column table: the sieve label and
    //  ONE "% passing" input per sieve, `data-field="${s.key}"`. A lot has
    //  seven columns of the same fourteen sieves — the JMF target, four
    //  measured sublots, and the two Department samples. That is the one
    //  place PlantBook genuinely needs the renderer to grow, and the growth
    //  is small and additive:
    //
    //    sievesHTML(section) reads `section.columns` (absent on DesignBook's
    //    section, so it defaults to a single implicit column and nothing
    //    about DesignBook changes), emits one <th> and one input per column,
    //    and keys each input `data-field="${col.key}_${sieve.key}"`.
    //
    //  Those composite keys are what the checker validates for uniqueness,
    //  so the schema is already carrying the real field list — 98 keys, none
    //  of which collide with DesignBook's bare `s50`/`s0_075`.
    //
    //  The 0.45 chart underneath wants to grow with it: four measured curves
    //  against the JMF target and the M323 control-point band, rather than
    //  DesignBook's one. `.45 Data` in the AMAW carries the SAME control
    //  points DesignBook holds in CONFIG.GRADATION_CONTROL_POINTS, so that
    //  constant belongs to both books — one fact, one copy, the same rule
    //  that makes effectiveMix() and trimFlatCoarseEnd() shared.
    //
    //  QA/IQ read `Super Verify` rows 33..46 columns D and G, not the
    //  `Gradation` sheet. Same quantity, different sheet; the mapper cares,
    //  the technician does not.
    id: "sublot-gradation", label: "Gradation", step: "Gradation",
    tag: "% passing by sublot · 0.45 power chart",
    type: "sieves",
    cites: ["ctrlpts"],
    sieves: AMAW_SIEVES,
    columns: GRADATION_COLUMNS,
  },

  {
    // ---------------------------------------------------------------
    //  5. CORES — two banks, two pay properties
    // ---------------------------------------------------------------
    //
    //  ---- WHY TWO TABLES AND NOT ONE WITH A "BANK" COLUMN -------------
    //
    //  `Cores` holds mat cores at rows 10..13 stride 5 and joint cores at
    //  rows 33..34 stride 3 — two banks with different strides, which no
    //  amount of staring at one sublot reveals (the earlier "six cores in
    //  lot 1" in docs/amaw-map.md was one bank read alone).
    //
    //  But the stride is not the argument. The argument is that they are TWO
    //  DIFFERENT PAY PROPERTIES: lane density carries 30% of the lot pay and
    //  joint density 15%, they run through two different pay curves
    //  (laneCorePay vs jointCorePay in pay.mjs), and joint density drops out
    //  entirely when Calculations!H11 = 2. One table with a Mat/Joint column
    //  is one careless `.reduce()` away from averaging them together, and
    //  that error is worth four figures on a lot and is invisible on screen.
    //  Two tables, two headings, two arrays — matching `laneCores` and
    //  `jointCores`, the two arguments lotPay() actually takes.
    //
    //  Core count is NOT fixed, per lot or per sublot: lot 1 has 24 ids and
    //  18 densities (sublot 1's six were labelled and never measured), lot 2
    //  has ten. So these are ordinary growable tables — read every slot and
    //  drop the blanks — with `max` at the workbook's own ceiling (4 and 2
    //  slots per sublot, four sublots) and `start` at one sublot's worth.
    id: "cores", label: "Cores & Density", step: "Cores",
    tag: "AMAW · Cores sheet — mat rows 10-13, joint rows 33-34",
    type: "rows",
    cites: ["density403"],
    rows: [
      {
        key: "mat_cores", heading: "Mat cores (lane density) — 4 per sublot",
        fixed: true, seed: MAT_CORE_SEED, span: [12, 12],
        grid: ".7fr .9fr 1.3fr 1fr 1fr 1fr .8fr .9fr .9fr .8fr",
        columns: [
          // Both derived and both readonly: a core's sublot and its id are
          // "<lot>-<sublot>-<letter>", which the lot already knows. Nobody
          // types what the form can spell.
          { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true },
          { key: "core_id", label: "Core #", type: "text", mono: true, readonly: true },
          { key: "station", label: "Station / offset", type: "text", req: false },
          // Cores D/E/F - the three weighings, and the only things typed on
          // this table. NOT `req`: a lot is cored over a week and the
          // Department picks the locations, so an uncored slot is a normal
          // in-progress state rather than a missing field, and pay.mjs reads
          // a blank as not-tested rather than as a zero.
          { key: "wt_air", label: "Wt in air (g)", type: "number", req: false, mono: true },
          { key: "wt_water", label: "Wt in water (g)", type: "number", req: false, mono: true },
          { key: "wt_ssd", label: "SSD wt (g)", type: "number", req: false, mono: true },
          // Cores G = air/(SSD-water), UNROUNDED - unlike a gyratory puck's
          // BSG on `Superpave`, which rounds to three. See coreDerived().
          { key: "bsg", label: "BSG", type: "number", req: false, mono: true, readonly: true },
          // Cores H = BSG x 62.4. The sheet labels it kg/m3 and it is pcf.
          { key: "density", label: "Density (pcf)", type: "number", req: false, mono: true, readonly: true },
          // Cores I = (density / (sublot MSG x 62.4)) x 100. The MSG is the
          // SUBLOT's, off the Sublots step - a core is measured against the
          // mix it came from.
          { key: "pct_solid", label: "% density", type: "number", mono: true, readonly: true },
          // Cores J - the spec's density pay value for that % density.
          // laneCorePay - Calculations!A22:L34, keyed on the AADTT/ESAL class.
          // Can read "MCL": that is a real state, not a zero.
          { key: "pay_value", label: "Pay (%)", type: "text", mono: true, readonly: true },
        ],
      },
      {
        key: "joint_cores", heading: "Joint cores (longitudinal joint density) — 2 per sublot",
        fixed: true, seed: JOINT_CORE_SEED, span: [12, 12],
        grid: ".7fr .9fr 1.3fr 1fr 1fr 1fr .8fr .9fr .9fr .8fr",
        columns: [
          // Both derived and both readonly: a core's sublot and its id are
          // "<lot>-<sublot>-<letter>", which the lot already knows. Nobody
          // types what the form can spell.
          { key: "sublot", label: "Sublot", type: "text", mono: true, readonly: true },
          { key: "core_id", label: "Core #", type: "text", mono: true, readonly: true },
          { key: "station", label: "Station / offset", type: "text", req: false },
          // Cores D/E/F - the three weighings, and the only things typed on
          // this table. NOT `req`: a lot is cored over a week and the
          // Department picks the locations, so an uncored slot is a normal
          // in-progress state rather than a missing field, and pay.mjs reads
          // a blank as not-tested rather than as a zero.
          { key: "wt_air", label: "Wt in air (g)", type: "number", req: false, mono: true },
          { key: "wt_water", label: "Wt in water (g)", type: "number", req: false, mono: true },
          { key: "wt_ssd", label: "SSD wt (g)", type: "number", req: false, mono: true },
          // Cores G = air/(SSD-water), UNROUNDED - unlike a gyratory puck's
          // BSG on `Superpave`, which rounds to three. See coreDerived().
          { key: "bsg", label: "BSG", type: "number", req: false, mono: true, readonly: true },
          // Cores H = BSG x 62.4. The sheet labels it kg/m3 and it is pcf.
          { key: "density", label: "Density (pcf)", type: "number", req: false, mono: true, readonly: true },
          // Cores I = (density / (sublot MSG x 62.4)) x 100. The MSG is the
          // SUBLOT's, off the Sublots step - a core is measured against the
          // mix it came from.
          { key: "pct_solid", label: "% density", type: "number", mono: true, readonly: true },
          // Cores J - the spec's density pay value for that % density.
          // jointCorePay - Calculations!A57:L67. NO ESAL dependence and no MCL
          // branch: a joint core cannot take the lot out of the pay schedule.
          { key: "pay_value", label: "Pay (%)", type: "text", mono: true, readonly: true },
        ],
      },
    ],
  },

  {
    // ---------------------------------------------------------------
    //  6. VERIFICATION — QA01 and IQ01, on `Super Verify`
    // ---------------------------------------------------------------
    //
    //  The KYTC district technician's records: QA01 is Department
    //  acceptance, IQ01 independent assurance. Both are filled by KYTC, not
    //  by the plant — which is the single fact that makes the file-is-the-
    //  record model hard for PlantBook (the district never holds the
    //  contractor's file) and is why docs/plantbook-storage.md exists. This
    //  schema is neutral on that: the section is the same either way.
    //
    //  A fixed two-row table rather than twenty `qa_`/`iq_` fields, because
    //  it is the sublot-volumetrics table with two rows instead of four and
    //  should read as one.
    //
    //  ---- THE TRAP IN THIS SECTION ------------------------------------
    //
    //  `Super Verify`'s columns are NOT `Superpave`'s. The same eight
    //  quantities sit one column left from `pbe` on (pbe K/L, vma L/M,
    //  vfa M/N, dustRatio N/O). The column KEYS here are the same as the
    //  sublot table's on purpose — they are the same quantity and should
    //  share CONFIG.DP — but the mapper must resolve them through
    //  VERIFY.cols and never through SUBLOT.volumetric.cols. Copying one set
    //  onto the other silently reads the NEIGHBOURING quantity, which looks
    //  like bad data rather than a bug.
    //
    //  `sublot_verified` is the value every INDIRECT in the workbook is
    //  built on ('Super Verify'!B5/B12, off Calculations!L1/L2). In BOTH
    //  completed lots it is empty — no QA/IQ sample was taken — so every
    //  INDIRECT-resolved field has no answer there. That is a real absence,
    //  not a parse failure, which is why nothing in this section is `req`.
    id: "verify", label: "Department Verification", step: "Verification",
    tag: "AMAW · Super Verify — QA01 / IQ01, stride 7",
    type: "grid",
    cites: ["accept403", "km443"],
    fields: [
      // Calculations!O1/O2 — the technician's confirmation that the plant's
      // equipment was checked. Two flags, one per verification block.
      { key: "lot_equipment_verified_qa", label: "Equipment verified (QA)", type: "select", req: false,
        options: ["Yes", "No"] },
      { key: "lot_equipment_verified_iq", label: "Equipment verified (IQ)", type: "select", req: false,
        options: ["Yes", "No"] },
    ],
    rows: [
      {
        key: "verification", heading: "Verification records", fixed: true,
        // The record column is the only one here that is not mono: it holds a
        // 28-character label ("QA01 — Department acceptance") rather than a
        // figure, and proportional text is about a fifth narrower for the
        // same string. It clips and says the whole thing in its `title`,
        // which is what CLAUDE.md concluded for the producer name: some
        // clipping is accepted, and the baseline in
        // scripts/amaw/harness/baseline/clipping.json is where it is recorded
        // rather than quietly tolerated. It has room to breathe now that the
        // seven computed figures have moved off this table.
        //
        // The AC method's track was 1fr and is 1.15fr (out of the technician's
        // 1.1), because a select does NOT report clipping - its scrollWidth
        // equals its clientWidth whatever the option text does - so the
        // harness cannot see a truncated one and this had to be measured
        // against the widest option's text directly. At 1fr the widest
        // ("Back-Calculation of MSG", 140px) had exactly 140px from 701px to
        // 1244px; it has 181 now. Measure the same way if these tracks move.
        grid: "1.9fr .8fr .95fr 1.15fr",
        seed: VERIFY_SEED,
        columns: [
          { key: "record", label: "Record", type: "text", readonly: true },
          // WHICH sublot this record verifies. It is not a label: every
          // INDIRECT on that sheet resolves through it, and the Gsb the row's
          // Pbe and VMA are measured against is that sublot's
          // (`Superpave!R9`/`S9`/`T9`/`U9`, picked by this value). A record
          // with weights and no sublot computes nothing, and says so.
          { key: "sublot_verified", label: "Verifies", type: "select", req: false, mono: true,
            options: ["1", "2", "3", "4"] },
          { key: "technician", label: "Tech (SM ID)", type: "text", req: false, mono: true },
          // Calculations!AU33/AU34 — per-record, and note those sit ABOVE the
          // four sublot rows (AU35..AU38), not after them.
          //
          // CORRECTED 2026-09-13: this offered Volumetrics / Gradation /
          // Visual, which is the LOT's acceptance method at `Calculations`
          // !H20 - a different question, asked once for the whole lot on the
          // Contract & Mix step. AU33/AU34 are fed by the same
          // VLOOKUP(AP.., AJ33:AK37) as the four sublot rows below them, and
          // that table is the AC DETERMINATION METHOD: how the binder
          // content was measured. Both real lots read "Ignition Furnace" on
          // all four sublots. Two controls a step apart, one of them
          // mislabelled with the other's options, is exactly what made the
          // question "what does that even mean?" - so the options are the
          // workbook's own five now.
          // The same five, from the same definition - see AC_METHODS. A
          // verification record is a box of mix somebody else re-tested, so
          // it is NOT seeded: the Department's method is the Department's to
          // state, and inheriting the plant's would be inventing it.
          { key: "ac_method", label: "AC method", type: "select", req: false,
            options: AC_METHODS },
        ],
      },
      // ---- THE RAW WEIGHTS, AND THE CALCULATION THEY DRIVE -------------
      //
      // Jake, 2026-09-13: "verification needs to be similar to lot pay in
      // terms of the full calc and information on the bsg msg and air
      // voids". It is the same argument the Sublots step won three days
      // earlier and for the same reason: the AMAW computes every one of
      // these from weights already on the technician's bench sheet, so
      // typing them is how a lot ends up disagreeing with the workbook it
      // will be loaded from. Seven typed figures per record became three
      // weighings.
      //
      // WHAT IS DIFFERENT HERE, and none of it is guessable from the QC
      // side - all four read out of KYTC's own blank template:
      //
      //   * `Super Verify` ROUNDS NOTHING. `Superpave` rounds the bulk
      //     volume to 0.1 and the BSG and each MSG to 0.001; the same
      //     quantities here are bare quotients. See verifyVolumetrics().
      //   * THE %AC IS BACK-CALCULATED. A verification sample is a box of
      //     mix off the road - nobody weighed binder into it - so its binder
      //     content is recovered from its own Gmm against the lot's Gse and
      //     then corrected for moisture. That is why there is a moisture
      //     table below and none on the Sublots step.
      //   * THE Gsb IS THE VERIFIED SUBLOT'S, not the lot's.
      //
      // NOT YET PROVEN AGAINST A REAL LOT: neither of Jake's completed AMAWs
      // has a QA or IQ sample at all, so `Super Verify` is blank in both.
      // `check_verify.mjs` evaluates the template's OWN formulas instead and
      // matches this to them cell for cell - which checks the transcription,
      // not the field experience.
      {
        key: "verify_bsg", heading: "Bulk specific gravity (BSG) — 2 samples for each record",
        fixed: true,
        grid: ".7fr .5fr 1fr 1fr 1fr .9fr .9fr",
        seed: VERIFY_SPECIMEN_SEED,
        columns: [
          { key: "record", label: "Record", type: "text", readonly: true },
          { key: "specimen", label: "Sample #", type: "text", mono: true, readonly: true },
          // Super Verify C/D/E, rows 8/9 and 15/16.
          { key: "wt_air", label: "Wt in air (g)", type: "number", req: false, mono: true },
          { key: "wt_water", label: "Wt in water (g)", type: "number", req: false, mono: true },
          { key: "wt_ssd", label: "SSD wt (g)", type: "number", req: false, mono: true },
          // F = E-D and G = C/F, both UNROUNDED on this sheet.
          { key: "bulk_volume", label: "Bulk vol.", type: "number", req: false, mono: true, readonly: true },
          { key: "bsg", label: "BSG", type: "number", req: false, mono: true, readonly: true },
        ],
      },
      {
        key: "verify_msg", heading: "Maximum specific gravity (MSG, Rice) — 2 bowls for each record",
        fixed: true,
        grid: ".7fr .5fr 1fr 1fr 1fr 1fr .8fr",
        seed: VERIFY_SPECIMEN_SEED,
        columns: [
          { key: "record", label: "Record", type: "text", readonly: true },
          { key: "specimen", label: "Bowl #", type: "text", mono: true, readonly: true },
          // Super Verify rows 20/21/23/24, in COLUMN pairs per record:
          // C,D for QA01 and E,F for IQ01.
          { key: "wt_mix", label: "Wt of mix (g)", type: "number", req: false, mono: true },
          { key: "calibration", label: "Calibration (g)", type: "number", req: false, mono: true },
          { key: "final_wt", label: "Final wt (g)", type: "number", req: false, mono: true },
          // Row 24. Blank in every real lot on file and a blank reads as 0
          // inside the sum, which is the workbook's own behaviour rather than
          // a convenience - so optional, not missing.
          { key: "absorbed_water", label: "Absorbed water (g)", type: "number", req: false, mono: true },
          { key: "msg", label: "MSG", type: "number", req: false, mono: true, readonly: true },
        ],
      },
      {
        key: "verify_moisture", heading: "Moisture in the mixture — the %AC correction",
        fixed: true,
        grid: ".7fr 1fr 1fr 1fr .9fr",
        seed: VERIFY_ROW_SEED,
        columns: [
          { key: "record", label: "Record", type: "text", readonly: true },
          // Super Verify M36/M37/M38 for QA01, N36/N38 for IQ01.
          { key: "wt_before", label: "Pan + mix, before drying (g)", type: "number", req: false, mono: true },
          { key: "wt_after", label: "Pan + mix, after drying (g)", type: "number", req: false, mono: true },
          { key: "wt_pan", label: "Pan (g)", type: "number", req: false, mono: true },
          { key: "moisture", label: "% moisture", type: "number", req: false, mono: true, readonly: true },
        ],
      },
      {
        key: "verify_volumetrics", heading: "Verification volumetrics — computed", fixed: true,
        // Even tracks past the record name, same reasoning as the sublot
        // volumetrics table: every value is 2-6 characters, so none has a
        // claim on more room than the others.
        grid: ".7fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
        seed: VERIFY_ROW_SEED,
        columns: [
          { key: "record", label: "Record", type: "text", readonly: true },
          // Computed, unlike the sublot table's - see the note above. The
          // moisture-corrected figure, which is what the workbook's own
          // average row carries (`B10` falls back to the uncorrected `J28`
          // when there is no moisture block).
          { key: "binder_pct", label: "%AC", type: "number", req: false, mono: true, readonly: true },
          { key: "gmb", label: "Gmb (BSG)", type: "number", req: false, mono: true, readonly: true },
          { key: "gmm", label: "Gmm (MSG)", type: "number", req: false, mono: true, readonly: true },
          { key: "va", label: "Va (%)", type: "number", req: false, mono: true, readonly: true },
          { key: "pbe", label: "Pbe (%)", type: "number", req: false, mono: true, readonly: true },
          { key: "vma", label: "VMA (%)", type: "number", req: false, mono: true, readonly: true },
          { key: "vfa", label: "VFA (%)", type: "number", req: false, mono: true, readonly: true },
        ],
      },
    ],
  },

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
    cites: ["pay403", "density403"],
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
