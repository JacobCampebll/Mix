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
//
//  Plus a report, printed every run rather than being a one-off note:
//  which citations are still unverified, and what the schema adds up to.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  PLANTBOOK_SECTIONS, PLANTBOOK_CITES, PLANTBOOK_REFERENCE_KEYS,
  DESIGNBOOK_CITE_KEYS,
} from "./sections.mjs";

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
  if (!["grid", "rows"].includes(host.type) && !host.fields && !host.rows)
    fail("B", `section "${s.id}" draws into "${s.into}", whose type "${host.type}" has a bespoke body renderer and appends no children`);
  if (s.step) fail("B", `section "${s.id}" has \`into\` and a \`step\` name — a sub-block is not a step, so the name is dead`);
}

// ---- C/D/E/F/G, section by section ----------------------------------
const scalarKeys = new Map();   // key -> where
const rowKeys = new Map();
const claim = (map, key, where, check, what) => {
  if (map.has(key)) fail(check, `${what} "${key}" is used twice (${map.get(key)}, ${where})`);
  else map.set(key, where);
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
          claim(scalarKeys, k, `${at} ${col.label} / ${sv.label}`, "E", "scalar key");
          if (DB_SCALAR_KEYS.has(k) || DB_SIEVE_KEYS.has(k))
            fail("E", `${at} composite sieve key "${k}" collides with a DesignBook key`);
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
    // name - both global on the page, both global in the envelope.
    claim(rowKeys, spec.key, at, "E", "row table key");
    if (DB_ROW_KEYS.has(spec.key)) fail("E", `${where} collides with a DesignBook row table key`);
    if (!Array.isArray(spec.columns) || !spec.columns.length) { fail("G", `${where} has no columns`); continue; }

    // D. The renderer writes `grid-template-columns:${spec.grid}` inline on
    // BOTH the header strip and every row, and appends one extra cell for
    // the remove button unless the spec is `fixed`. A track short and the
    // last column falls off the end of the header; a track long and the
    // header shears away from the rows. An inline style cannot be
    // overridden by a media query without !important (CLAUDE.md), so this
    // is not something a breakpoint can rescue.
    const tracks = String(spec.grid || "").trim().split(/\s+/).filter(Boolean);
    const want = spec.columns.length + (spec.fixed ? 0 : 1);
    if (!spec.grid) fail("D", `${where} has no grid template`);
    else if (tracks.length !== want)
      fail("D", `${where} has ${tracks.length} grid tracks for ${spec.columns.length} columns ` +
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
