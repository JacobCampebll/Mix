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
//  NOTE THE DIVERGENCE: this list has a 1/4" (6.3 mm) and DesignBook's does
//  not. DesignBook dropped it deliberately (Jake, 2026-09-07 — a real
//  MixPack reads "N / A" there, and an always-blank sieve is a column of
//  dashes on the chart and in every polish matrix). The AMAW carries it as a
//  real measured row on all four sublots, so PlantBook keeps it. The two
//  books' sieve lists are therefore NOT interchangeable — anything shared
//  between them (the control-point band, trimFlatCoarseEnd) has to key on
//  `mm`, never on position in the array.
const AMAW_SIEVES = [
  { key: "s50",    label: '2"',     mm: 50.0  },
  { key: "s37_5",  label: '1-1/2"', mm: 37.5  },
  { key: "s25",    label: '1"',     mm: 25.0  },
  { key: "s19",    label: '3/4"',   mm: 19.0  },
  { key: "s12_5",  label: '1/2"',   mm: 12.5  },
  { key: "s9_5",   label: '3/8"',   mm: 9.5   },
  { key: "s6_3",   label: '1/4"',   mm: 6.3   },
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

// The four QC sublots, seeded. An AMAW lot is exactly four — QC01..QC04 in
// t_tst_rslt_dtl, four volumetric blocks on `Superpave`, four columns on
// `Gradation`, four rows of pay. Not "up to four".
const SUBLOT_SEED = [{ sublot: "1" }, { sublot: "2" }, { sublot: "3" }, { sublot: "4" }];

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
    id: "lot", label: "Lot", step: "Lot",
    tag: "AMAW · Pay Values header — from the approved design, or typed",
    type: "grid",
    cites: ["jmf", "accept403"],
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
      // Pay Values!D3, "385" — the pay item, and the lead of the mix id.
      { key: "lot_item_code", label: "Item code", type: "text", req: true, mono: true },
      // Pay Values!D7/D9 — "00385 CL3 ASPH SURF 0.38A PG64-22", the approved
      // design's MIX ID followed by its signature. t_smpl carries it as
      // rel_smpl_id. This is the join between the two books, and the
      // workbook already writes it down.
      { key: "lot_mix_id", label: "Approved mix design", type: "text", req: true, mono: true },
      // Pay Values!B5, "Superpave 0.38". `amaw_types` is PlantBook's own
      // reference table; its sitemanager_code is the mixture type code the
      // pay tables switch on.
      { key: "lot_type_mix", label: "Type of mix", type: "text", req: true, source: "amaw_types" },
      // RENDERER GAP (1) — SILENT. `fills` is applied by autofillFrom(),
      // which returns early unless the element has `data-col` and sits in a
      // `.rowitem`. A `fills` on a GRID FIELD is accepted by the schema and
      // then quietly does nothing, so this code cannot be auto-filled from
      // the row above the way `mat_code` is from `type_size`. Until
      // autofillFrom() learns the field case, recompute() has to resolve it
      // with refMatch("amaw_types", ...). Left as a plain field rather than
      // declaring a `fills` that would look wired and not be — the same
      // class of bug as `aadtt_class` sitting parsed in state.mix and never
      // reaching its field.
      { key: "lot_mix_type_code", label: "Mixture type code", type: "number", req: true, mono: true },
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
      // Calculations!D15, dropdown at Pay Values!I4. Both real lots are
      // Class 3; every Class 1/2 branch in pay.mjs is transcribed from the
      // formulas and confirmed by nothing.
      { key: "lot_esal_class", label: "ESAL Class", type: "select", req: true,
        options: ["1", "2", "3", "4"] },
      // The three control flags the pay model switches on, as the workbook
      // spells them. These are not preferences — propertyWeights() answers
      // for exactly three of their combinations and weighs every property at
      // zero for the rest, which is a silent 0% lot if it is set wrong.
      { key: "lot_acceptance_method", label: "Acceptance method", type: "select", req: true,
        options: [
          { value: "Volumetrics", label: "Volumetrics" },
          { value: "Gradation",   label: "Gradation (pay not modelled)" },
          { value: "Visual",      label: "Visual" },
        ] },
      { key: "lot_density_option", label: "Density option", type: "select", req: true,
        options: [{ value: "A", label: "A" }, { value: "B", label: "B — no cores" }] },
      { key: "lot_joint_density", label: "Joint density counts", type: "select", req: true,
        options: [{ value: "1", label: "Yes" }, { value: "2", label: "No" }] },
      { key: "lot_kytc_lab", label: "KYTC lab id", type: "text", req: false, mono: true },
      { key: "lot_ps_lab",   label: "Producer/supplier lab id", type: "text", req: false, mono: true },
      // Pay Values!B3. The sample id prefix each block's name is appended to
      // ("…VI01", "…QC01"). BOTH completed lots leave it blank, so their
      // t_smpl.smpl_id is empty and nothing would load — KYTC evidently
      // fills it at submission. Read an empty one as "not ready to hand
      // off", not as a read failure, which is why it is optional here.
      { key: "lot_sample_id_prefix", label: "Sample id prefix", type: "text", req: false, mono: true },

      // ---- The three numbers the pay calculation is measured against ----
      //
      //  Readouts, not fields, and that is a decision rather than a
      //  shortcut. These come off the SIGNED approval (CLAUDE.md: "Pay is
      //  meaningless without them, so the approval upload is what makes the
      //  pay step computable at all"). A signature that covers a value and a
      //  form that lets someone retype it are contradictory; a typed JMF %AC
      //  is a silent four-figure error on one lot. So the page prints them
      //  from state.approval / the verified payload and carries them into
      //  the lot envelope from there — they are never read back out of the
      //  DOM by collectForm().
      //
      //  If the approval is missing or its signature does not verify, these
      //  read "—" and the pay step has nothing to compute, which is the
      //  honest answer and exactly what should happen.
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
        grid: ".5fr 1fr .8fr .9fr .9fr .8fr 1fr 1fr 1.1fr",
        seed: SUBLOT_SEED,
        columns: [
          { key: "sublot", label: "#", type: "text", mono: true, readonly: true },
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
        ],
      },
      {
        key: "sublot_volumetrics", heading: "Sublot volumetrics", fixed: true,
        grid: ".5fr .8fr 1fr .85fr .8fr .8fr .8fr .8fr .85fr",
        seed: SUBLOT_SEED,
        columns: [
          { key: "sublot", label: "#", type: "text", mono: true, readonly: true },
          // Superpave!B — the workbook's "% Binder in Mix".
          { key: "binder_pct", label: "%AC", type: "number", req: true, mono: true },
          { key: "unit_weight", label: "Unit wt (pcf)", type: "number", req: false, mono: true },
          { key: "gmm", label: "Gmm", type: "number", req: true, mono: true },
          { key: "va", label: "Va (%)", type: "number", req: true, mono: true },
          { key: "pbe", label: "Pbe (%)", type: "number", req: false, mono: true },
          { key: "vma", label: "VMA (%)", type: "number", req: true, mono: true },
          { key: "vfa", label: "VFA (%)", type: "number", req: true, mono: true },
          // KYTC writes it "D/A"; pay.mjs and the loader call it dustRatio.
          { key: "dust_ratio", label: "D/A ratio", type: "number", req: true, mono: true },
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
      { key: "lot_handmix_binder_pct", label: "Hand-mixed %AC", type: "number", req: false, mono: true },
      { key: "lot_handmix_gmm", label: "Hand-mixed Gmm", type: "number", req: false, mono: true },
    ],
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
        key: "mat_cores", heading: "Mat cores (lane density)",
        max: 16, start: 4, span: [6, 12],
        addLabel: "+ add mat core",
        grid: ".5fr 1.1fr 1.5fr .9fr .9fr auto",
        columns: [
          { key: "sublot", label: "Sublot", type: "select", req: true, mono: true,
            options: ["1", "2", "3", "4"] },
          // "1-2-A" … "1-2-D" in both real lots.
          { key: "core_id", label: "Core #", type: "text", req: true, mono: true },
          { key: "station", label: "Station / offset", type: "text", req: true },
          { key: "density", label: "Density (pcf)", type: "number", req: true, mono: true },
          // Cores!I is a formula on the sheet, so it is readonly here and
          // the page computes it — same pattern as TSR's Gmb / air voids.
          // Note the workbook's own rule for an untested core: a blank is a
          // blank, and lotPay() must not turn it into a zero.
          { key: "pct_solid", label: "% solid", type: "number", mono: true, readonly: true },
        ],
      },
      {
        key: "joint_cores", heading: "Joint cores (longitudinal joint density)",
        max: 8, start: 2, span: [6, 12],
        addLabel: "+ add joint core",
        grid: ".5fr 1.1fr 1.5fr .9fr .9fr auto",
        columns: [
          { key: "sublot", label: "Sublot", type: "select", req: true, mono: true,
            options: ["1", "2", "3", "4"] },
          // "1-2-J1", "1-2-J2".
          { key: "core_id", label: "Core #", type: "text", req: true, mono: true },
          { key: "station", label: "Station / offset", type: "text", req: true },
          { key: "density", label: "Density (pcf)", type: "number", req: true, mono: true },
          { key: "pct_solid", label: "% solid", type: "number", mono: true, readonly: true },
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
        // same string. It still does not fit its track, and widening the
        // track was tried and reverted - 2.4fr took the width straight out
        // of Gmm, Va, VMA and Pbe, which are figures a person reads rather
        // than a caption they already know. So this one clips and says the
        // whole thing in its `title`, which is exactly what CLAUDE.md
        // concluded for the producer name: some clipping is accepted, and
        // the baseline in scripts/amaw/harness/baseline/clipping.json is
        // where it is recorded rather than quietly tolerated.
        grid: "1.5fr .7fr 1fr .8fr 1fr .85fr .8fr .8fr .8fr .8fr .85fr",
        seed: [
          { record: "QA01 — Department acceptance" },
          { record: "IQ01 — Independent assurance" },
        ],
        columns: [
          { key: "record", label: "Record", type: "text", readonly: true },
          { key: "sublot_verified", label: "Verifies", type: "select", req: false, mono: true,
            options: ["1", "2", "3", "4"] },
          { key: "technician", label: "Tech (SM ID)", type: "text", req: false, mono: true },
          // Calculations!AU33/AU34 — per-record, and note those sit ABOVE the
          // four sublot rows (AU35..AU38), not after them.
          { key: "acceptance_method", label: "Method", type: "select", req: false,
            options: ["Volumetrics", "Gradation", "Visual"] },
          { key: "binder_pct", label: "%AC", type: "number", req: false, mono: true },
          { key: "unit_weight", label: "Unit wt (pcf)", type: "number", req: false, mono: true },
          { key: "gmm", label: "Gmm", type: "number", req: false, mono: true },
          { key: "va", label: "Va (%)", type: "number", req: false, mono: true },
          { key: "pbe", label: "Pbe (%)", type: "number", req: false, mono: true },
          { key: "vma", label: "VMA (%)", type: "number", req: false, mono: true },
          { key: "vfa", label: "VFA (%)", type: "number", req: false, mono: true },
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
    id: "pay", label: "Lot Pay", step: "Pay",
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
    //  Two things to carry over from DesignBook's Status step unchanged.
    //  Generating the workbook is REVIEWER-ONLY, gated on the signed-in
    //  account, and the project-items lookup sits here beside Approve as
    //  well as on the Lot step — the AMAW's `Project Items` sheet is the
    //  same sheet with the same ListObject (A5:C99, prj_nbr | ln_itm_nbr |
    //  repr_qty), so the pay-estimate lookup transfers whole, and a stale
    //  sheet bites at approval time rather than back on step 1.
    id: "lot-status", label: "Status & validation", step: "Submit",
    tag: "workflow", type: "status",
  },
];

export default PLANTBOOK_SECTIONS;
