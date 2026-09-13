// =====================================================================
//  The AMAW workbook generator — a lot payload in, a loadable .xlsm out
// =====================================================================
//
//  PlantBook's hand-off to KYTC is the same shape as DesignBook's: MEDL
//  takes an Excel file, loads it, and archives the copy. So this is the
//  AMAW half of scripts/mixpack/{write,regenerate}.mjs — write the input
//  cells into KYTC's own blank template, evaluate the eight hidden staging
//  sheets ourselves and bank the answers as literals, and repack at the zip
//  level so vbaProject.bin, xl/xmlMaps.xml and the XML-typed ListObjects
//  come through byte-identical. Nothing recalculates between here and the
//  Applet, so a staging cell left as a formula reaches SiteManager blank.
//
//  ---- WHAT IS SHARED WITH THE MIXPACK, AND WHAT IS NOT ----------------
//
//  Shared, and deliberately not copied: the cell parser (xlsx.mjs), the
//  formula evaluator (formula.mjs) and the cell splicer and repacker
//  (write.mjs). AMAW is byte-identical to the MixPack in xl/xmlMaps.xml and
//  in all seven t_* column lists (docs/amaw-map.md), so the engine ports
//  whole.
//
//  Not shared, for two reasons, which is why this is its own fill loop
//  rather than a call into write.mjs's:
//
//    * SHEETS RESOLVE BY NAME, through the workbook's own manifest. AMAW
//      carries a chartsheet AND a Dialog1 dialogsheet, so any fixed
//      sheet-number table misfiles everything after them — xlsx.mjs's
//      STAGING/SOURCE maps are the MixPack's numbers and would silently
//      write the aggregate blend onto a chart.
//    * THE STAGING LIST IS AMAW'S — a strict subset of the MixPack's: no
//      t_superpave, no t_bit_conc_mixblnd, no Chart Data.
//
//  ---- THE FORMULA RULE, WHICH IS THE WHOLE TRAP -----------------------
//
//  Excel recalculates every formula when it opens a file, so a value we
//  write beside a formula survives only if that formula would produce it
//  again. CLAUDE.md records the three cases and this module implements all
//  three:
//
//    keep-with-cache  the template's <f> stays and our value is cached
//                     beside it, because the formula reads cells we also
//                     wrote. Excel recomputes the same answer on open.
//    dropped          the <f> goes and the value is written plain, because
//                     we never had its inputs. Keeping it would blank the
//                     cell the moment somebody opens the archived copy.
//    evalOnly         not written at all. The value is handed to the
//                     evaluator so the staging sheets are correct now, and
//                     the template's own formula recomputes the same thing
//                     when Excel opens the file.
//
//  A caller that knows which case a cell is in says so (`keepFormula`).
//  Where it does not, `decideKeep()` works it out rather than guessing: it
//  evaluates the template's own formula against the post-write state and
//  keeps it only if it reproduces the value we are writing. That is the
//  rule stated as an executable check instead of a convention.
//
//  ---- USING IT --------------------------------------------------------
//
//    import { generateAmaw } from "./generate.mjs";
//    const { bytes, filename, report } = await generateAmaw({
//      template: "AMAW_VER14_01.xlsm", lot, ref,
//    });
//
//  `lot` goes to the mapper (scripts/amaw/mapper.mjs, `amawCells(lot, tpl,
//  ref) -> { values, evalOnly, report }`), the same interface
//  mixpackCells() has in designbook.html. Pass `values`/`evalOnly` directly
//  instead and no mapper is needed — which is how check_generate.mjs drives
//  this from a real completed lot's own cells.
//
//  Proven by scripts/amaw/check_generate.mjs, which regenerates a real
//  completed lot from the blank template and diffs every cell.

import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { cellsOf, rowNum } from "../mixpack/xlsx.mjs";
import { evaluate } from "../mixpack/formula.mjs";
import { setCell, packWorkbook } from "../mixpack/write.mjs";
import { AMAW } from "./addresses.mjs";

// ---------------------------------------------------------------------
//  The workbook's shape
// ---------------------------------------------------------------------

// The eight staging sheets bound to MaterialDisciplines_Map. Order does not
// matter — the evaluator iterates to a fixed point.
export const STAGING = ["discipline", "t_smpl", "t_cont_smpl", "t_rmks_dtl",
                        "t_smpl_tst", "t_smpl_tstr", "t_tst_rslt_hdr", "t_tst_rslt_dtl"];

// `discipline` keeps its one data row at 2; the t_* sheets carry the same
// seven-row header block the MixPack's do (SM Table, SM Column, Logical
// Validation, Comment, Long Description, Column Name).
export const FIRST_DATA_ROW = (name) => (name === "discipline" ? 2 : 8);

/* Tabs the Applet reads DIRECTLY, which no staging formula points at.
 *
 * Deriving the input surface from staging references misses these entirely,
 * and the failure is quiet: MEDL accepts the file and loads the lot with no
 * project items. Andrew and Tate hit exactly that on the MixPack's 00269999
 * probe (2026-09-10), which is why scripts/mixpack/xlsx.mjs carries the same
 * constant.
 *
 * AMAW's `Project Items` ListObject is A5:C99 — header on row 5, data from
 * 6 — and column D (unit) is display-only, "Not Stored on the SM database"
 * by the tab's own note. Carried anyway: the Applet archives the file, so
 * the tab should read like a person filled it.
 */
export const DIRECT_READ = {
  "Project Items": { firstRow: 6, lastRow: 99, cols: ["A", "B", "C", "D"] },
};

/* In-workbook reference lists. These are KYTC's data, not the lot's, and
 * the TEMPLATE's copy is the current one: `Producer supplier` alone differs
 * in 237 cells between a Version 13.3 lot and the 14.01 template (plants
 * added, rows re-sorted). Carrying a lot's copy forward would write a stale
 * roster into a fresh template, and PlantBook should be reading `plants` /
 * `binder_terminals` from Supabase for these anyway — same rule as
 * everywhere else in this project. Nothing on a staging sheet reads them;
 * they back the data-validation dropdowns.
 */
export const REFERENCE_SHEETS = ["PG Producer", "Producer supplier", "Drop_Downs_and_Tables"];

// What MEDL cannot do without, over and above whatever the mapper reports
// missing. Addresses come from addresses.mjs — this module writes none of
// its own. A blank `Pay Values!B3` is the common one and it is not a read
// failure: both real lots on file leave it empty, which is KYTC's own "not
// ready to hand off" state, and it empties smpl_id on all seven records.
const LOADER_REQUIRES = [
  ["sampleIdPrefix", "sample id prefix — every t_smpl row and the discipline Filename are built from it"],
  ["contract", "contract id (t_cont_smpl.cont_id)"],
  ["county", "county"],
  ["plantCode", "plant code (t_smpl.prodr_supp_cd)"],
  ["materialCode", "SiteManager material code"],
  ["mixId", "MIX ID + signature — the link to the approved design"],
  ["approvedMixDesign", "approved design sample id (t_smpl.rel_smpl_id)"],
  ["approverId", "approver SM user id"],
  ["lotTons", "lot tonnage (t_smpl.repr_qty)"],
];

const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const q = (s) => JSON.stringify(s);
const dec = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
                    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/* Two <v> shapes scripts/mixpack/xlsx.mjs's reader does not see, normalised
 * on the PARSE COPY only — never on the XML we splice and write back, where
 * rewriting `<v xml:space="preserve">` would quietly drop significant
 * whitespace from cells we never touched.
 *
 *   <v/>   Excel's cached EMPTY STRING. Not the same as a cell that was
 *          never computed: `=A1` is "" for the first and 0 for the second,
 *          and t_rmks_dtl is mostly these.
 *
 * Fixing this in xlsx.mjs instead would be the better home for it, but it
 * changes what the MixPack's checks compare (~57 more cells become
 * comparable there) and needs the blank-vs-empty-string rule ported into
 * designbook.html's copy of the engine in the same breath. That is its own
 * commit; see the note at the foot of check_evaluator.mjs.
 */
const normalise = (xml) => xml.replace(/<v\/>/g, "<v></v>");

// ---------------------------------------------------------------------
//  Reading a workbook by sheet NAME
// ---------------------------------------------------------------------

/**
 * Open an .xlsm for reading. Sheets resolve through the workbook's own
 * manifest (xl/workbook.xml -> its rels -> the part), so a re-issued
 * template that reorders sheets still resolves, and AMAW's chartsheet and
 * dialogsheet cannot shift anything.
 *
 * Parts are read on demand through unzip(1): the repo carries no
 * dependencies, and this is the same approach check_evaluator.mjs uses.
 *
 * @returns {{file, names, partOf, xmlOf, cellsOf, value, has}}
 */
export function openWorkbook(file) {
  if (!fs.existsSync(file)) throw new Error(`no such workbook: ${file}`);
  const raw = (p) => execSync(`unzip -p ${q(file)} ${q(p)}`, { maxBuffer: 1 << 28 }).toString();

  const rels = {};
  for (const m of raw("xl/_rels/workbook.xml.rels").matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g))
    rels[m[1]] = m[2].startsWith("/") ? m[2].slice(1) : "xl/" + m[2].replace(/^\/?xl\//, "");
  const part = {};
  for (const m of raw("xl/workbook.xml").matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g))
    part[dec(m[1])] = rels[m[2]];

  let sst = null;
  const strings = () => {
    if (sst) return sst;
    let xml; try { xml = raw("xl/sharedStrings.xml"); } catch { return (sst = []); }
    return (sst = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
      .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => dec(x[1])).join("")));
  };

  const xmlCache = new Map(), cellCache = new Map();
  const isSheet = (name) => !!part[name] && /worksheets\//.test(part[name]);
  const xmlOf = (name) => {
    if (!isSheet(name)) return null;
    if (!xmlCache.has(name)) xmlCache.set(name, raw(part[name]));
    return xmlCache.get(name);
  };
  const cells = (name) => {
    if (!cellCache.has(name))
      cellCache.set(name, isSheet(name) ? cellsOf(normalise(xmlOf(name)), strings()) : new Map());
    return cellCache.get(name);
  };
  // The cached value of one cell, typed. null means BLANK - nothing cached -
  // which the evaluator reads as 0; '' means a cached empty string, which it
  // reads as text. Keeping the two apart is not pedantry here: most of
  // t_rmks_dtl is the second.
  const value = (sheet, ref) => {
    const c = cells(sheet).get(ref);
    if (!c || c.v == null) return null;
    return (c.t === "s" || c.t === "str" || c.t === "inlineStr" || c.t === "e")
      ? c.v : (NUMRE.test(c.v) ? +c.v : c.v);
  };

  return { file, names: Object.keys(part), partOf: (n) => part[n], xmlOf, cellsOf: cells, value,
           has: isSheet, strings };
}

// ---------------------------------------------------------------------
//  Filling one
// ---------------------------------------------------------------------

// Same-value test the checks use: numbers to 1e-9, strings trimmed. Used to
// decide whether a template formula reproduces what we are writing, so it
// has to forgive float noise and the padding KYTC's own lookup keys carry
// ("AMP070302      ").
const agrees = (a, b) =>
  (typeof a === "number" && typeof b === "number")
    ? Math.abs(a - b) < 1e-9 || (b !== 0 && Math.abs((a - b) / b) < 1e-9)
    : String(a ?? "").trim() === String(b ?? "").trim();

/**
 * Write `values` into a copy of the template's sheets and bank the staging
 * sheets.
 *
 * @param book      an openWorkbook() over KYTC's blank template
 * @param values    { "Superpave!B14": 5.98, ... }  written into the sheets.
 *                  A value may also be { v, keepFormula } to force the
 *                  formula decision; left alone, decideKeep() makes it.
 * @param evalOnly  { "Calculations!D147": 4, ... } fed to the evaluator and
 *                  NOT written — cells the template computes itself.
 * @param now       stamp for TEXT(NOW(),...) in the remarks id
 * @returns {{ parts, staged, report, valueOf }}  parts is part path -> XML
 */
export function fillWorkbook({ book, values = {}, evalOnly = {}, now = new Date() }) {
  const xml = new Map();                 // sheet name -> XML as we are editing it
  const report = { written: 0, kept: 0, dropped: 0, staged: 0, passes: 0,
                   failed: [], unknownSheet: [], stamp: null };

  const open = (name) => {
    if (!book.has(name)) return false;
    if (!xml.has(name)) xml.set(name, book.xmlOf(name));
    return true;
  };

  // 1. The values, and the overrides the evaluator will read them through.
  //    Writing happens after the decision pass, because deciding whether a
  //    template formula reproduces a value needs every other value in place.
  const overrides = new Map();
  const wanted = [];
  for (const [k, spec] of Object.entries(values)) {
    const [sheet, ref] = k.split("!");
    if (!open(sheet)) { report.unknownSheet.push(k); continue; }
    const v = spec && typeof spec === "object" && "v" in spec ? spec.v : spec;
    const keep = spec && typeof spec === "object" && "keepFormula" in spec ? !!spec.keepFormula : null;
    wanted.push({ sheet, ref, v, keep });
    // '' and null are how a caller says "this cell is blank" - it resolves to
    // a blank cell, not to the empty STRING the evaluator would read as text.
    overrides.set(k, v === "" || v == null ? null : v);
  }
  for (const [k, v] of Object.entries(evalOnly)) if (!overrides.has(k)) overrides.set(k, v);

  // 2. Resolving a cell: an override wins, then the template's own cached
  //    value, then - for a template formula with nothing cached - that
  //    formula, evaluated with the same grammar. Outside the grammar reads
  //    as blank, which is what the workbook itself shows there.
  const memo = new Map(), resolving = new Set();
  const valueOf = (sheet, ref) => {
    const k = `${sheet}!${ref}`;
    if (overrides.has(k)) return overrides.get(k);
    if (memo.has(k)) return memo.get(k);
    if (!book.has(sheet)) return null;
    const c = book.cellsOf(sheet).get(ref);
    let out = null;
    if (c && c.v != null) out = book.value(sheet, ref);
    else if (c && c.f && !resolving.has(k)) {
      resolving.add(k);
      try { out = evaluate(c.f, (sh, cell) => valueOf(sh || sheet, cell)); }
      catch { out = null; }
      finally { resolving.delete(k); }
    }
    memo.set(k, out);
    return out;
  };

  /* Keep the template's formula, or drop it?
   *
   * Keep it only if it reproduces the value we are writing from the state
   * the finished workbook will be in - which is a thing we can simply run,
   * rather than a judgement call. Excel will do exactly this on open.
   * Anything else (it disagrees, it throws, it is outside the grammar)
   * drops the formula, because a live formula over inputs we do not hold
   * blanks the cell the moment the archived copy is opened. */
  const decideKeep = (sheet, ref, v) => {
    const c = book.cellsOf(sheet).get(ref);
    if (!c || !c.f) return false;                       // nothing to keep
    if (v === "" || v == null) return false;            // writing a blank: drop it
    let out;
    try { out = evaluate(c.f, (sh, cell) => valueOf(sh || sheet, cell)); }
    catch { return false; }
    return agrees(out, v);
  };

  for (const w of wanted) {
    const keep = w.keep === null ? decideKeep(w.sheet, w.ref, w.v) : w.keep;
    xml.set(w.sheet, setCell(xml.get(w.sheet), w.ref, w.v, keep));
    report.written++;
    const hadFormula = !!(book.cellsOf(w.sheet).get(w.ref) || {}).f;
    if (keep) report.kept++;
    else if (hadFormula) report.dropped++;
  }

  // 3. The staging sheets, evaluated to a fixed point and banked as
  //    literals. They keep no formula: nothing recalculates between here
  //    and the Applet, and a banked literal is what the MixPack generator
  //    has been loading through MEDL.
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "") +
                String(now.getUTCHours()).padStart(2, "0") +
                String(now.getUTCMinutes()).padStart(2, "0") +
                String(now.getUTCSeconds()).padStart(2, "0");
  report.stamp = stamp;

  const todo = [];
  for (const name of STAGING) {
    if (!open(name)) { report.unknownSheet.push(name); continue; }
    for (const [ref, c] of book.cellsOf(name)) {
      if (rowNum(ref) < FIRST_DATA_ROW(name) || !c.f) continue;
      todo.push({ name, ref, f: c.f.replace(/TEXT\(NOW\(\)[^)]*\)/g, JSON.stringify(stamp)) });
    }
  }

  // Staging cells reference each other and document order is not dependency
  // order, so iterate rather than trying to sort.
  const staged = new Map();
  for (let pass = 1; pass <= 8; pass++) {
    let changed = 0;
    report.passes = pass;
    for (const t of todo) {
      let out;
      try { out = evaluate(t.f, (sh, cell) => valueOf(sh || t.name, cell)); }
      catch (e) { if (pass === 1) report.failed.push([`${t.name}!${t.ref}`, t.f, e.message]); continue; }
      const k = `${t.name}!${t.ref}`;
      if (!staged.has(k) || staged.get(k) !== out) { changed++; staged.set(k, out); overrides.set(k, out); }
    }
    if (!changed) break;
  }
  for (const [k, out] of staged) {
    const [name, ref] = k.split("!");
    xml.set(name, setCell(xml.get(name), ref, out, false));
    report.staged++;
  }

  const parts = new Map();
  for (const [name, x] of xml) parts.set(book.partOf(name), x);
  return { parts, staged, report, valueOf };
}

// ---------------------------------------------------------------------
//  The whole job
// ---------------------------------------------------------------------

// The mapper is another module by design - payload shape belongs to it, not
// here - and it may not be present yet. Import it only when a `lot` is
// actually passed, and say plainly what is missing if it is not there.
async function loadMapper() {
  try {
    const m = await import("./mapper.mjs");
    const fn = m.amawCells || (m.default && m.default.amawCells) || m.default;
    if (typeof fn !== "function") throw new Error("mapper.mjs exports no amawCells()");
    return fn;
  } catch (e) {
    throw new Error(
      "generateAmaw({ lot }) needs scripts/amaw/mapper.mjs to export " +
      "amawCells(lot, tpl, ref) -> { values, evalOnly, report }. " +
      "Pass { values } directly to generate without it. (" + e.message + ")");
  }
}

/**
 * Generate a loadable AMAW.
 *
 * @param template  path to KYTC's blank AMAW (AMAW_VER14_01.xlsm). Not in
 *                  the repo - see docs/amaw-map.md for where it comes from.
 * @param lot       the PlantBook lot payload, handed to the mapper
 * @param ref       reference data for the mapper (plants, binder grades…)
 * @param mapper    amawCells implementation; defaults to ./mapper.mjs
 * @param values    written cells, instead of (or as well as) a lot
 * @param evalOnly  cells fed to the evaluator but not written
 * @param out       optional path to write the .xlsm to
 * @returns {{ bytes, filename, parts, staged, report }}
 */
export async function generateAmaw({ template, lot, ref, mapper, values, evalOnly,
                                     out, now = new Date(), keepTmp = false } = {}) {
  if (!template) throw new Error("generateAmaw: a blank AMAW template path is required");
  const book = openWorkbook(template);

  let mapped = { values: values || {}, evalOnly: evalOnly || {}, report: {} };
  if (lot) {
    const amawCells = mapper || (await loadMapper());
    const m = amawCells(lot, book, ref) || {};
    mapped = {
      values: { ...(m.values || {}), ...(values || {}) },
      evalOnly: { ...(m.evalOnly || {}), ...(evalOnly || {}) },
      report: m.report || {},
    };
  }

  const filled = fillWorkbook({ book, values: mapped.values, evalOnly: mapped.evalOnly, now });

  // What the lot lacked. The mapper reports the fields it could not fill;
  // this adds the handful the LOADER refuses a file without, read back out
  // of the finished workbook so it catches a value that was mapped but
  // evaluated away to nothing.
  const missing = [...(mapped.report.missing || [])];
  for (const [key, why] of LOADER_REQUIRES) {
    const v = filled.valueOf(AMAW.LOT.sheet, AMAW.LOT[key]);
    if (v === null || v === undefined || String(v).trim() === "")
      missing.push(`${AMAW.LOT.sheet}!${AMAW.LOT[key]} — ${why}`);
  }
  const items = [];
  const pi = DIRECT_READ["Project Items"];
  for (let r = pi.firstRow; r <= pi.lastRow; r++)
    if (pi.cols.some((c) => { const v = filled.valueOf("Project Items", c + r); return v != null && String(v).trim() !== ""; }))
      items.push(r);
  if (!items.length)
    missing.push("Project Items!A6 — no project / line item rows; the Applet expands one t_cont_smpl row per row on that tab, so the lot would load without any");

  // The sample id is the filename, same as the MixPack's. An empty one is
  // KYTC's own "not ready to hand off" state rather than a fault here, so it
  // falls back to a name that says so instead of writing "undefined.xlsm".
  const sampleId = String(filled.staged.get("discipline!E2") ?? "").trim();
  const filename = (sampleId && sampleId !== "0" ? sampleId : "AMAW-no-sample-id") + ".xlsm";

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amaw-"));
  const target = out || path.join(tmp, filename);
  try {
    packWorkbook({ template, parts: filled.parts, out: target, tmp: path.join(tmp, "zip") });
    const bytes = fs.readFileSync(target);
    return {
      bytes, filename, parts: filled.parts, staged: filled.staged,
      report: { ...filled.report, ...mapped.report, missing, projectItemRows: items, sampleId, filename,
                cells: Object.keys(mapped.values).length },
    };
  } finally {
    if (!keepTmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export default generateAmaw;

// ---------------------------------------------------------------------
//  CLI — generate from a lot payload on disk
//
//    node scripts/amaw/generate.mjs <lot.json> <blank-AMAW.xlsm> [out.xlsm]
//
//  Needs mapper.mjs. To exercise the engine without one, use
//  check_generate.mjs, which builds its values from a real completed lot.
// ---------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const [LOT, TEMPLATE, OUT] = process.argv.slice(2);
  if (!LOT || !TEMPLATE) {
    console.error("usage: generate.mjs <lot.json> <blank-AMAW.xlsm> [out.xlsm]");
    process.exit(2);
  }
  const lot = JSON.parse(fs.readFileSync(LOT, "utf8"));
  const { bytes, filename, report } = await generateAmaw({ template: TEMPLATE, lot, out: OUT });
  console.log(`wrote ${OUT || filename}  ${bytes.length} bytes`);
  console.log(`cells written : ${report.written} (${report.kept} keeping their formula, ${report.dropped} dropped)`);
  console.log(`staging banked: ${report.staged} in ${report.passes} passes`);
  if (report.failed.length) console.log(`not evaluated : ${report.failed.length} (left as formulas for Excel)`);
  if (report.missing.length) {
    console.log(`the lot lacks : ${report.missing.length}`);
    for (const m of report.missing.slice(0, 20)) console.log("   " + m);
  }
}
