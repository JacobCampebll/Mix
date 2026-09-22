#!/usr/bin/env node
// =====================================================================
//  check_sections.mjs — prove PlantBook's schema is the shape the page
//  renderer already draws, before anyone splices it in
// =====================================================================
//
//  Run:  node scripts/amaw/check_sections.mjs
//
//  PLANTBOOK_SECTIONS is not a description of PlantBook, it IS PlantBook —
//  the markup, the validation rail, the payload and the AMAW mapper all
//  derive from it, the same way CONFIG.SECTIONS drives four things in
//  DesignBook. Four independent copies of one field list is four chances to
//  drift (CLAUDE.md), so the only defence is that the one copy is provably
//  well formed.
//
//  Everything DesignBook-side is READ OUT OF public/designbook.html rather
//  than retyped here: the reference-table keys, the section ids, the scalar
//  field keys and the row-table keys. A constant copied into this file would
//  be a fifth copy, and it would go stale the first time Jake adds a field —
//  quietly, which is the whole problem. Nothing is written to that file.
//
//  What it proves, in the order it checks:
//    A  section ids — unique here, and disjoint from DesignBook's
//    B  `into` targets exist, and are not themselves sub-blocks
//    C  every `source` names a reference table the page actually loads
//    D  every row spec's grid tracks match its column count
//    E  key uniqueness, at the granularity the DOM actually scopes at
//    F  every `cites` entry resolves to a real citation
//    G  shape sanity — the things the renderer reads without checking
//    H  every scalar the mapper writes exists, and vice versa
//    I  a sliced row table (PlantBook's Sublot 1-4 tabs) covers its whole
//       seed exactly once across every section that slices it
//
//  Plus a report, printed every run rather than being a one-off note:
//  which citations are still unverified, and what the schema adds up to.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  PLANTBOOK_SECTIONS, PLANTBOOK_CITES, PLANTBOOK_REFERENCE_KEYS,
  DESIGNBOOK_CITE_KEYS, AC_METHODS, acMethodCode,
} from "./sections.mjs";
import { LOT_FIELD_ALIASES } from "./mapper.mjs";
import { COURSES } from "./intake.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, "../../public/designbook.html");

const failures = [];
const notes = [];
const fail = (check, m) => failures.push(`${check}  ${m}`);

// =====================================================================
//  Reading designbook.html
// =====================================================================
//
//  A regex over the whole file is not good enough here: `key:` appears at
//  four different nesting levels inside CONFIG.SECTIONS and they mean
//  different things — a scalar field key is a global name in
//  state.extracted.scalars, a row COLUMN key is scoped by data-row and may
//  legitimately repeat. Flattening the two would make this checker either
//  blind or so strict it fails on correct schemas.
//
//  So: a small scanner that knows about strings, escapes and comments (the
//  block is full of both, and `// span: [wide, medium]` would otherwise
//  unbalance the brackets), tracking which named array or object each
//  `key:`/`id:` sits directly inside. No regex literals appear inside either
//  block it is pointed at, so it does not handle them.
function scan(src, from = 0, to = src.length) {
  const out = [];
  let i = from;
  while (i < to) {
    const c = src[i];
    // comments
    if (c === "/" && src[i + 1] === "/") { while (i < to && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 2; continue; }
    // strings, with escapes
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let j = i + 1, buf = "";
      while (j < to) {
        if (src[j] === "\\") { buf += src[j + 1]; j += 2; continue; }
        if (src[j] === q) break;
        buf += src[j]; j++;
      }
      out.push({ t: "str", v: buf, i });
      i = j + 1; continue;
    }
    if ("[]{}".includes(c)) { out.push({ t: c, i }); i++; continue; }
    // IDENT followed by ':'
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 64));
    if (m) {
      let j = i + m[0].length;
      while (j < to && /\s/.test(src[j])) j++;
      if (src[j] === ":") { out.push({ t: "name", v: m[0], i }); i = j + 1; continue; }
      i += m[0].length; continue;
    }
    i++;
  }
  return out;
}

// The matching close bracket for the open bracket at token index `k`.
function matchAt(tokens, k) {
  const open = tokens[k].t, close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let n = k; n < tokens.length; n++) {
    if (tokens[n].t === open) depth++;
    else if (tokens[n].t === close && --depth === 0) return n;
  }
  return -1;
}

// Walk a token run, and for every `name: "value"` report the name, the
// value, and the nearest ENCLOSING named container (skipping the anonymous
// object frames that array elements sit in).
function entries(tokens) {
  const out = [];
  const stack = [];         // { name }
  let pending = null;       // a `name:` awaiting its bracket
  for (let n = 0; n < tokens.length; n++) {
    const tk = tokens[n];
    if (tk.t === "name") { pending = tk.v; continue; }
    if (tk.t === "[" || tk.t === "{") { stack.push({ name: pending }); pending = null; continue; }
    if (tk.t === "]" || tk.t === "}") { stack.pop(); pending = null; continue; }
    if (tk.t === "str" && pending) {
      let container = null;
      for (let d = stack.length - 1; d >= 0; d--) if (stack[d].name) { container = stack[d].name; break; }
      out.push({ name: pending, value: tk.v, container });
      pending = null;
    }
  }
  return out;
}

function blockOf(src, opener) {
  const at = src.indexOf(opener);
  if (at < 0) throw new Error(`could not find ${JSON.stringify(opener)} in ${PAGE}`);
  const toks = scan(src, at);
  const end = matchAt(toks, toks.findIndex((t) => t.t === "[" || t.t === "{"));
  return entries(toks.slice(0, end + 1));
}

const page = readFileSync(PAGE, "utf8");
const sectionEntries = blockOf(page, "\n  SECTIONS: [");
const tableEntries = blockOf(page, "\n    TABLES: {");

const DB_SECTION_IDS = new Set(
  sectionEntries.filter((e) => e.name === "id" && e.container === "SECTIONS").map((e) => e.value));
const DB_SCALAR_KEYS = new Set(
  sectionEntries.filter((e) => e.name === "key" && e.container === "fields").map((e) => e.value));
const DB_ROW_KEYS = new Set(
  sectionEntries.filter((e) => e.name === "key" && e.container === "rows").map((e) => e.value));
const DB_SIEVE_KEYS = new Set(
  sectionEntries.filter((e) => e.name === "key" && e.container === "sieves").map((e) => e.value));
// A reference table is a key in CONFIG.REFERENCE.TABLES; its own `table:`
// entry is what it reads from Supabase, so pick the frames, not the strings.
const DB_REF_KEYS = new Set(
  tableEntries.filter((e) => e.name === "table" && e.container).map((e) => e.container));

if (!DB_SECTION_IDS.size || !DB_SCALAR_KEYS.size || !DB_REF_KEYS.size) {
  console.error("could not read designbook.html — the scanner found nothing. " +
    "Has CONFIG.SECTIONS or CONFIG.REFERENCE.TABLES moved?");
  process.exit(2);
}

const REF_KEYS = new Set([...DB_REF_KEYS, ...PLANTBOOK_REFERENCE_KEYS]);
const CITE_KEYS = new Set([...DESIGNBOOK_CITE_KEYS, ...Object.keys(PLANTBOOK_CITES)]);

// =====================================================================
//  Walking PlantBook's own schema
// =====================================================================
const S = PLANTBOOK_SECTIONS;
const rowSpecsOf = (s) => (s.rows ? (Array.isArray(s.rows) ? s.rows : [s.rows]) : []);
const tops = S.filter((s) => !s.into);
const subs = S.filter((s) => s.into);

// ---- A. section ids -------------------------------------------------
const seenIds = new Map();
for (const s of S) {
  if (!s.id) { fail("A", `a section has no id (label ${JSON.stringify(s.label)})`); continue; }
  if (seenIds.has(s.id)) fail("A", `duplicate PlantBook section id "${s.id}"`);
  seenIds.set(s.id, s);
  // Both books render into one page and renderForm() writes
  // <section id="${s.id}">, so a shared id is two nodes answering to one
  // getElementById - the failure CLAUDE.md records for the moved
  // #advanceStage node, and the reason "aggregate"/"gradation"/"status"
  // could not be reused here.
  if (DB_SECTION_IDS.has(s.id)) fail("A", `section id "${s.id}" collides with a DesignBook section id`);
}

// ---- B. `into` targets ----------------------------------------------
for (const s of subs) {
  const host = seenIds.get(s.into);
  if (!host) { fail("B", `section "${s.id}" draws into "${s.into}", which is not a PlantBook section`); continue; }
  if (host.into) fail("B", `section "${s.id}" draws into "${s.into}", which is itself a sub-block — renderForm() only nests one deep`);
  // There used to be a third rule here, refusing a host whose `type` has a
  // bespoke body renderer ("appends no children"). It was WRONG, and worth
  // recording as wrong rather than deleting quietly: renderForm() writes
  // `${sectionBodyHTML(s)} ${child}`, so the children are SIBLINGS of the
  // body and are appended whatever the type. Checked in a real browser
  // against `jmf-figures` inside the `computed` Lot Pay step (2026-09-13)
  // before the rule came out - the sub-block renders and its readouts paint.
  // The rule was a guess about the renderer, and a guess in a checker is
  // worse than no rule: it refuses a correct schema and reads like a fact.
  if (s.step) fail("B", `section "${s.id}" has \`into\` and a \`step\` name — a sub-block is not a step, so the name is dead`);
}

// ---- C/D/E/F/G, section by section ----------------------------------
const scalarKeys = new Map();   // key -> where
const rowKeys = new Map();
const claim = (map, key, where, check, what) => {
  if (map.has(key)) fail(check, `${what} "${key}" is used twice (${map.get(key)}, ${where})`);
  else map.set(key, where);
};
// PlantBook's Sublot 1-4 tabs (2026-09-14): the JMF gradation column is
// deliberately `readonly` and appears on all four sublot-N-gradation
// sections at once (see buildSublotGradationSections() in sections.mjs -
// a value that can never be edited can never diverge between its four
// copies, unlike an editable one). Its composite key (`jmf_<sieve>`) is
// therefore expected to repeat, and only for THAT reason: the first
// sighting still claims it normally via `claim()`, so a mismatch (one
// occurrence readonly, another not) still fails the ordinary "used twice"
// check on the non-readonly one.
const readonlySieveKeys = new Set();
// PlantBook's Sublot 1-4 tabs (2026-09-14): a row spec's `key` may repeat
// across several sections ONLY when every repeat declares `sliceIndices`
// (sliceSpec() in sections.mjs) - one shared table rendered as four DOM
// blocks, not four different tables that happen to share a name. Tracked
// separately from `rowKeys` so the ordinary "used twice" failure still
// fires for an accidental duplicate that does NOT declare sliceIndices.
const sliceCoverage = new Map();   // key -> { seedLen, seen: Set<number>, order: number[], wheres: string[] }
const claimSlice = (spec, where) => {
  const seedLen = Array.isArray(spec.seed) ? spec.seed.length : 0;
  const cov = sliceCoverage.get(spec.key) || { seedLen, seen: new Set(), order: [], wheres: [] };
  if (cov.seedLen !== seedLen)
    fail("I", `${where} slices a ${seedLen}-row seed, but another section slicing "${spec.key}" saw ${cov.seedLen}`);
  cov.wheres.push(where);
  for (const i of spec.sliceIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= cov.seedLen)
      fail("I", `${where} slices index ${i}, out of range for a ${cov.seedLen}-row seed`);
    else if (cov.seen.has(i))
      fail("I", `${where} slices index ${i}, already sliced by another section`);
    else cov.seen.add(i);
    cov.order.push(i);
  }
  sliceCoverage.set(spec.key, cov);
};

const checkSource = (src, where) => {
  if (src == null) return;
  if (!REF_KEYS.has(src)) fail("C", `${where} declares source "${src}", which is not a reference table ` +
    `(known: ${[...REF_KEYS].sort().join(", ")})`);
};

const checkOptions = (def, where) => {
  if (def.type !== "select") return;
  if (!Array.isArray(def.options) || !def.options.length)
    fail("G", `${where} is a select with no options — selectHTML() would render an empty control`);
};

for (const s of S) {
  const at = `section "${s.id}"`;
  if (!s.label) fail("G", `${at} has no label`);
  if (!s.type) fail("G", `${at} has no type`);
  if (!s.tag) fail("G", `${at} has no tag — the section head renders one unconditionally`);
  if (!s.into && !s.step) fail("G", `${at} is a step and has no short \`step\` name for the rail`);

  for (const c of s.cites || []) {
    if (!CITE_KEYS.has(c)) fail("F", `${at} cites "${c}", which is in neither CONFIG.SPECS.CITES nor PLANTBOOK_CITES`);
    else if (PLANTBOOK_CITES[c] && PLANTBOOK_CITES[c].verified === false) notes.push(`${at} cites ${PLANTBOOK_CITES[c].label} — UNVERIFIED`);
  }

  // ---- grid fields ----
  for (const f of s.fields || []) {
    if (f.type === "readout") {
      if (!f.out) fail("G", `${at} has a readout with no \`out\` key`);
      else claim(scalarKeys, f.out, `${at} readout`, "E", "scalar key");
      continue;
    }
    const where = `${at} field`;
    if (!f.key) { fail("G", `${where} has no key`); continue; }
    claim(scalarKeys, f.key, where, "E", "scalar key");
    // A scalar key is a global name in state.extracted.scalars, which BOTH
    // books share on one page - so a collision seeds a lot with a design's
    // value, or the reverse. Row column keys are deliberately NOT checked
    // this way: they are scoped by data-row, and sharing `gmm`/`va`/`vma`
    // with DesignBook is how PlantBook inherits CONFIG.DP's precision.
    if (DB_SCALAR_KEYS.has(f.key))
      fail("E", `${where} key "${f.key}" collides with a DesignBook scalar field key — they share state.extracted.scalars`);
    if (!f.label) fail("G", `${where} "${f.key}" has no label`);
    checkSource(f.source, `${where} "${f.key}"`);
    checkOptions(f, `${where} "${f.key}"`);
  }

  // ---- sieve columns ----
  if (s.type === "sieves") {
    if (!Array.isArray(s.sieves) || !s.sieves.length) fail("G", `${at} is type "sieves" with no sieves`);
    const sieveKeys = new Set();
    for (const sv of s.sieves) {
      if (!sv.key || !sv.label) fail("G", `${at} has a sieve with no key or label`);
      if (typeof sv.mm !== "number") fail("G", `${at} sieve "${sv.key}" has no numeric mm — the 0.45 chart reads it`);
      if (sieveKeys.has(sv.key)) fail("E", `${at} repeats sieve key "${sv.key}"`);
      sieveKeys.add(sv.key);
    }
    // PlantBook's gradation is fourteen sieves by seven columns where
    // DesignBook's is fourteen by one, so the field key on the page is the
    // composite. Checking the cross-product is the only way to know the real
    // field list is unique - see RENDERER GAP (3) in sections.mjs.
    if (!Array.isArray(s.columns) || !s.columns.length) {
      fail("G", `${at} is type "sieves" with no \`columns\` — one implicit column is DesignBook's shape, ` +
        `and a lot needs the JMF target plus four sublots`);
    } else {
      const colKeys = new Set();
      for (const col of s.columns) {
        if (!col.key || !col.label) { fail("G", `${at} has a gradation column with no key or label`); continue; }
        if (colKeys.has(col.key)) fail("E", `${at} repeats gradation column key "${col.key}"`);
        colKeys.add(col.key);
        for (const sv of s.sieves) {
          const k = `${col.key}_${sv.key}`;
          if (col.readonly && readonlySieveKeys.has(k)) {
            // Already claimed by an earlier readonly sighting of this same
            // key - the whole point of the exception. Not re-claimed, not
            // re-checked against DesignBook (the first sighting already did
            // both).
          } else {
            claim(scalarKeys, k, `${at} ${col.label} / ${sv.label}`, "E", "scalar key");
            if (DB_SCALAR_KEYS.has(k) || DB_SIEVE_KEYS.has(k))
              fail("E", `${at} composite sieve key "${k}" collides with a DesignBook key`);
            if (col.readonly) readonlySieveKeys.add(k);
          }
        }
      }
    }
  }

  // ---- computed outputs ----
  for (const o of s.outputs || []) {
    if (!o.key || !o.label) { fail("G", `${at} has an output with no key or label`); continue; }
    claim(scalarKeys, o.key, `${at} output`, "E", "scalar key");
  }

  // ---- row specs ----
  for (const spec of rowSpecsOf(s)) {
    const where = `${at} row table "${spec.key}"`;
    if (!spec.key) { fail("G", `${at} has a row spec with no key`); continue; }
    // A row spec key is the data-rowlist attribute and the payload's table
    // name - both global on the page, both global in the envelope. Sliced
    // (see above) is the one deliberate exception - checked for real
    // coverage rather than merely waived.
    if (Array.isArray(spec.sliceIndices)) {
      claimSlice(spec, where);
      rowKeys.set(spec.key, `${where} (sliced)`);
    } else {
      claim(rowKeys, spec.key, at, "E", "row table key");
    }
    // Colliding with a DesignBook row table is an error UNLESS the spec says
    // in so many words that the collision is the point. `sharesKey` is that
    // sentence, and it takes a reason rather than a `true`: the only case it
    // exists for is `Project Items`, which is literally the same sheet with
    // the same ListObject and the same three columns in the MixPack and in
    // the AMAW, so one name for it is right and two would be the drift this
    // whole file is about. Nothing is waived quietly - every declared share
    // is printed on every run, the same way an unverified citation is, and
    // the two books never render at once so the data-rowlist attribute is
    // still unique in the document.
    if (DB_ROW_KEYS.has(spec.key)) {
      if (typeof spec.sharesKey === "string" && spec.sharesKey.trim())
        notes.push(`${where} deliberately shares DesignBook's key - ${spec.sharesKey}`);
      else
        fail("E", `${where} collides with a DesignBook row table key`);
    }
    if (!Array.isArray(spec.columns) || !spec.columns.length) { fail("G", `${where} has no columns`); continue; }

    // D. The renderer writes `grid-template-columns:${spec.grid}` inline on
    // BOTH the header strip and every row, and appends one extra cell for
    // the remove button unless the spec is `fixed`. A track short and the
    // last column falls off the end of the header; a track long and the
    // header shears away from the rows. An inline style cannot be
    // overridden by a media query without !important (CLAUDE.md), so this
    // is not something a breakpoint can rescue.
    //
    // A `hidden` column (2026-09-15b, AGG_BLEND_SPEC's own `sublot`) gets no
    // track at all - `display:none` (rowHTML()) removes it from CSS Grid's
    // auto-placement entirely, and rowHeadHTML() skips it too, so only the
    // VISIBLE columns need to agree with the grid.
    const visible = spec.columns.filter((c) => !c.hidden);
    const tracks = String(spec.grid || "").trim().split(/\s+/).filter(Boolean);
    const want = visible.length + (spec.fixed ? 0 : 1);
    if (!spec.grid) fail("D", `${where} has no grid template`);
    else if (tracks.length !== want)
      fail("D", `${where} has ${tracks.length} grid tracks for ${visible.length} visible columns ` +
        `(want ${want}${spec.fixed ? "" : " — columns + the remove button"})`);
    else if (!spec.fixed && tracks[tracks.length - 1] !== "auto")
      fail("D", `${where} ends its grid with "${tracks[tracks.length - 1]}" — the remove button's track is \`auto\``);
    else if (spec.fixed && tracks[tracks.length - 1] === "auto")
      fail("D", `${where} is fixed but ends its grid with \`auto\` — a fixed table has no remove button`);

    if (spec.fixed) {
      if (!Array.isArray(spec.seed) || !spec.seed.length)
        fail("G", `${where} is fixed with no seed — rowsHTML() would render an empty table with no way to add`);
      if (spec.addLabel || spec.max || spec.start)
        fail("G", `${where} is fixed and also declares max/start/addLabel — a fixed table has no add button`);
    } else {
      if (!spec.addLabel) fail("G", `${where} has no addLabel and is not fixed — the add button renders "undefined"`);
      if (!spec.max) fail("G", `${where} has no max`);
      if (spec.start && spec.max && spec.start > spec.max)
        fail("G", `${where} starts with ${spec.start} rows but its max is ${spec.max}`);
    }
    if (spec.span && (!Array.isArray(spec.span) || spec.span.length !== 2))
      fail("G", `${where} has a malformed span — it is [wide, medium] in twelfths`);

    const colKeys = new Set();
    for (const c of spec.columns) {
      if (!c.key || !c.label) { fail("G", `${where} has a column with no key or label`); continue; }
      // Scoped by data-row, so a repeat across tables is fine and a repeat
      // WITHIN one is a cell that overwrites its neighbour.
      if (colKeys.has(c.key)) fail("E", `${where} repeats column key "${c.key}"`);
      colKeys.add(c.key);
      checkSource(c.source, `${where} column "${c.key}"`);
      checkOptions(c, `${where} column "${c.key}"`);
      if (c.alt) {
        if (typeof c.alt.when !== "function") fail("G", `${where} column "${c.key}" has an \`alt\` with no \`when\` predicate`);
        checkSource(c.alt.source, `${where} column "${c.key}" alt`);
        // effectiveColDef() copies only source and label off `alt`. A
        // column that needs its fills swapped too is RENDERER GAP (2) in
        // sections.mjs; report it rather than passing it silently.
        if (c.alt.fills && c.fills) notes.push(
          `${where} column "${c.key}" declares \`fills\` on both the column and its \`alt\` — ` +
          `effectiveColDef() carries only source/label, so the alt's fills is inert until it is taught to`);
      }
      if (c.fills) {
        for (const [target, pick] of Object.entries(c.fills)) {
          if (typeof pick !== "function") fail("G", `${where} column "${c.key}" fills "${target}" with a non-function`);
          if (!spec.columns.some((o) => o.key === target))
            fail("G", `${where} column "${c.key}" fills "${target}", which is not a column of the same table`);
        }
      }
      if (c.readonly && c.req)
        fail("G", `${where} column "${c.key}" is readonly and required — the rail would demand a value nobody can type`);
    }
    for (const seedRow of spec.seed || []) {
      for (const k of Object.keys(seedRow))
        if (!colKeys.has(k)) fail("G", `${where} seeds "${k}", which is not one of its columns`);
    }
  }
}

// =====================================================================
//  I. Sliced row tables cover their whole seed exactly once
// =====================================================================
//
//  A sliced key (PlantBook's Sublot 1-4 tabs) is only correct if every
//  section slicing it, TAKEN TOGETHER, renders every row of the shared seed
//  exactly once - a gap silently drops a sublot's data from the screen (and
//  from collectForm(), since a row nobody renders is a row nobody can type
//  into), and an overlap duplicates one sublot's DOM node under two keys,
//  which is exactly the class of bug a duplicate `data-rowlist` risks.
//
//  AND THE SLICES HAVE TO RUN IN ORDER, which covering every row exactly once
//  does NOT imply and which cost a real regression on 2026-09-14. `sliceIndices`
//  indexes into the SEED, while collectForm() reads the rendered rows back in
//  DOM order - tab 1's, then tab 2's, and so on. Those are the same list only
//  when the concatenation of the slices, in section order, is 0,1,2,...,n-1.
//  The Department Verification tables were seeded record-major, giving tab n
//  the pair [n-1, 4+(n-1)]: every row rendered exactly once, this check passed,
//  and a save-and-reopen re-sliced a list that was no longer in seed order and
//  moved sublot 3's record onto sublot 1's tab - permuting further on every
//  cycle. Nothing errored, because the values travel with the row and the
//  mapper keys on them rather than on position, so the AMAW stayed right while
//  the screen lied about which sublot it was showing.
for (const [key, cov] of sliceCoverage) {
  if (cov.seen.size !== cov.seedLen)
    fail("I", `row table "${key}" is sliced across ${cov.wheres.length} section(s) (${cov.wheres.join(", ")}) ` +
      `but covers ${cov.seen.size} of its ${cov.seedLen} seed rows`);
  else {
    const at = cov.order.findIndex((v, i) => v !== i);
    if (at >= 0)
      fail("I", `row table "${key}" slices out of order across ${cov.wheres.join(", ")} — ` +
        `concatenated they read ${cov.order.join(",")}, and position ${at} holds ${cov.order[at]} rather than ${at}. ` +
        `collectForm() reads these rows back in DOM order, so a save and reopen would re-slice a list that is ` +
        `no longer in seed order and move rows between tabs. Re-order the SEED so each tab's slice is contiguous.`);
  }
}

// =====================================================================
//  H. The seam to the workbook
// =====================================================================
//
//  mapper.mjs reads the lot's scalars by the WORKBOOK's names, this schema
//  writes them by the form's, and for a while the two simply never met: a
//  generated AMAW carried six header cells out of fifteen and, worse, no
//  Calculations!J1 or !D15, so every property in the pay schedule paid zero.
//  Silent, because write() skips an absent value by design.
//
//  LOT_FIELD_ALIASES is the bridge, and this is what keeps it honest. Both
//  directions matter: an alias naming a field this schema no longer has is
//  dead (that is how the removal of a field would go unnoticed), and a
//  `lot_` scalar with no alias is a value the workbook will never see.
for (const from of Object.keys(LOT_FIELD_ALIASES)) {
  if (!scalarKeys.has(from))
    fail("H", `mapper.mjs aliases "${from}", which this schema has no field for`);
}
// The exceptions are listed rather than pattern-matched, so adding a field
// that genuinely has no workbook cell is a deliberate line here.
const NO_WORKBOOK_CELL = new Set([
  // Written from the lot envelope's own identity, not from `values`.
  "lot_contract_id", "lot_plant", "lot_number",
  // Half of the mix designation. Calculations!J1 is derived from the SIZE
  // alone, and the letter reaches the workbook inside the D9 mix line.
  "lot_mix_type",
  // Readouts, not fields: the page computes both from the hand-mixed check
  // sample and paints them, and the workbook computes its own from the same
  // weights (Superpave row 41 / J8).
  "lot_handmix_gmm", "lot_gse",
  // Andrew, 2026-09-14: typed and saved on the lot, but no AMAW cell has
  // been confirmed for it yet - see NEXT_STEPS.md. Move it into
  // LOT_FIELD_ALIASES (mapper.mjs) once someone checks a real workbook for
  // the actual "Additive dosage rate" cell, and remove it from this set.
  "lot_additive_dosage",
  // 2026-09-18: the setup AC adjustment (402.03.02 C)) is a DELTA and the
  // workbook has no cell for a delta - only the JMF %AC each sublot is paid
  // against ('Pay Values'!A13:A16). lotScalars() folds it into that write, so
  // it reaches the AMAW without an alias of its own; check_bridge.mjs asserts
  // the fold (approval 5.9 + 0.2 -> 6.1 on all four rows).
  "lot_setup_ac_adjust",
  // 2026-09-22: the COURSE a lot is placed as (mainline / leveling and
  // wedging / scratch course...). It has no cell of its own - what the
  // workbook stores is its CONSEQUENCE, the acceptance method at
  // Calculations!H20 (aliased above), which intake.mjs derives from it - and
  // the Project Items lookup matches the contract's line by it. Asserted
  // below to be, key for key, intake.mjs's COURSES.
  "lot_course",
]);
// Only the `lot_`-prefixed scalars: sections.mjs reserves that prefix for the
// lot header, which is exactly what the mapper's 'Pay Values' block writes.
// A per-sublot gradation cell and a `pay_` output are neither typed nor
// written from `values` and have their own paths.
for (const [key, where] of scalarKeys) {
  if (!/^lot_/.test(key)) continue;
  if (LOT_FIELD_ALIASES[key] || NO_WORKBOOK_CELL.has(key)) continue;
  fail("H", `${where} "${key}" has no LOT_FIELD_ALIASES entry, so it never reaches the AMAW`);
}
for (const key of NO_WORKBOOK_CELL) {
  if (!scalarKeys.has(key))
    fail("H", `check_sections lists "${key}" as having no workbook cell, but the schema no longer has it`);
}

// `lot_course`'s options ARE intake.mjs's COURSES, key for key and in order.
// Two lists of one fact, in two files that cannot import each other (the
// schema is what intake reads), so the seam is asserted rather than trusted -
// a course added on one side and not the other would seed a value the select
// cannot show, which prefillLive() silently declines.
{
  const f = S.flatMap((s) => s.fields || []).find((x) => x && x.key === "lot_course");
  const got = f ? (f.options || []).map((o) => o.value) : [];
  const want = COURSES.map((c) => c.key);
  if (JSON.stringify(got) !== JSON.stringify(want))
    fail("H", `lot_course options ${JSON.stringify(got)} are not intake.mjs COURSES ${JSON.stringify(want)}`);
}

// A row spec by table key, wherever it lives - `sublot_tickets` etc. used to
// have exactly one owning section ("sublots"); since the Sublot 1-4 split
// (2026-09-14) it has four, and every one of them carries the SAME full
// `seed` (sliceSpec() only narrows what a given section RENDERS, never the
// spec's own seed - see the comment on sliceSpec() in sections.mjs), so the
// first match is as good as any.
function findRowSpec(key) {
  for (const s of S) {
    const t = rowSpecsOf(s).find((x) => x && x.key === key);
    if (t) return t;
  }
  return null;
}

//  The other half of that seam, for the one thing on the form that is not a
//  scalar and still has to become a NUMBER in a cell: the AC determination
//  method. Two `ac_method` columns - one per sublot on the tickets table, one
//  per record on the Verification identity table - and `Calculations!AP..`
//  holds the code that `AJ33:AK37` looks the label up by, so the form's words
//  ARE the lookup key. A reworded option is not an error anywhere: the
//  VLOOKUP simply finds nothing and the cell goes blank.
const AC_COLUMNS = ["sublot_tickets", "verification"];
for (const tableKey of AC_COLUMNS) {
  const t = findRowSpec(tableKey);
  const col = t && (t.columns || []).find((c) => c.key === "ac_method");
  if (!col) { fail("H", `no row table "${tableKey}" declares an "ac_method" column`); continue; }
  if (JSON.stringify(col.options) !== JSON.stringify(AC_METHODS))
    fail("H", `${tableKey}.ac_method does not offer AC_METHODS - `
            + `a label off that list is a blank cell, not an error`);
  for (const label of col.options || []) {
    if (acMethodCode(label) === null)
      fail("H", `${tableKey}.ac_method offers "${label}", which acMethodCode() cannot turn into a code`);
  }
}
// Seeded on the four sublots (Jake, 2026-09-13) and deliberately NOT on the
// two verification records - the Department states its own method. Asserted
// both ways round, because a seed that quietly disappeared and a seed that
// quietly spread are both silent.
const ticketSeed = (findRowSpec("sublot_tickets") || {}).seed || [];
if (ticketSeed.length !== 4)
  fail("H", `sublot_tickets seeds ${ticketSeed.length} rows; a lot is exactly four sublots`);
for (const r of ticketSeed) {
  if (acMethodCode(r.ac_method) === null)
    fail("H", `a seeded sublot row carries ac_method ${JSON.stringify(r.ac_method)}, which is not one of AC_METHODS`);
}
const verifySeed = (findRowSpec("verification") || {}).seed || [];
for (const r of verifySeed) {
  if (r.ac_method !== undefined)
    fail("H", "a verification record is seeded with an AC method; the Department's method is the Department's to state");
}
// `sublot_volumetrics` shares SUBLOT_SEED and has no such column. A seeded
// cell with no column reaches the payload and no screen.
const volSeed = (findRowSpec("sublot_volumetrics") || {}).seed || [];
for (const r of volSeed) {
  if (r.ac_method !== undefined)
    fail("H", "sublot_volumetrics is seeded with an AC method it has no column for");
}

// =====================================================================
//  Report
// =====================================================================
const line = (s) => console.log(s);
line("");
line("PlantBook section schema — scripts/amaw/sections.mjs");
line("checked against " + PAGE.replace(/^.*\/Mix\//, ""));
line("");
line(`  DesignBook, read from the page :  ${DB_SECTION_IDS.size} sections, ` +
     `${DB_SCALAR_KEYS.size} scalar keys, ${DB_ROW_KEYS.size} row tables, ${DB_REF_KEYS.size} reference tables`);
line(`  PlantBook                      :  ${tops.length} steps, ${subs.length} sub-block(s), ` +
     `${scalarKeys.size} scalar keys, ${rowKeys.size} row tables`);
line("");
line("  steps");
tops.forEach((s, i) => {
  const kids = subs.filter((c) => c.into === s.id).map((c) => c.label);
  line(`    ${String(i + 1).padStart(2)}. ${s.step.padEnd(13)} ${s.id.padEnd(17)} ${s.type.padEnd(9)}` +
       (kids.length ? `  + ${kids.join(", ")}` : ""));
});
line("");

if (notes.length) {
  line("  carried, not fixed — printed every run so it stays visible");
  [...new Set(notes)].forEach((n) => line(`    · ${n}`));
  line("");
}

if (failures.length) {
  line(`  ${failures.length} problem(s):`);
  failures.forEach((f) => line(`    ✗ ${f}`));
  line("");
  process.exit(1);
}
line("  ✓ all checks pass");
line("");
