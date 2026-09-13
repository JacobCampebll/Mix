#!/usr/bin/env node
// Does the AMAW generator reproduce a real, completed lot?
//
//   node scripts/amaw/check_generate.mjs <completed-amaw.xlsm> [out.xlsm] \
//        [--template <blank-AMAW.xlsm>]
//
// This is scripts/mixpack/regenerate.mjs and check_page_engine.mjs pointed at
// an AMAW, and it is the proof the generator is worth anything: read a real
// lot's own cells as the payload, write them into KYTC's BLANK template,
// evaluate and bank the eight staging sheets, repack, and then diff EVERY cell
// of the result against the lot we started from.
//
// Four sections, and the last two are the ones people forget:
//
//   1. STAGING PARITY — every staging cell Excel cached a value for, against
//      the value we banked. This is the payload MEDL loads.
//   2. ARCHIVE PARITY — every other authored cell in the lot, because the
//      Applet archives the file as well as loading it. A cell the template
//      holds as a formula is checked by EVALUATING that formula against the
//      generated workbook, not by looking for a cached value: Excel
//      recomputes it on open, and "will it come back the same?" is the only
//      question that matters there.
//   3. THE WORKBOOK ITSELF — vbaProject.bin and xl/xmlMaps.xml byte-identical,
//      every other part either untouched or one we meant to rewrite, every
//      rewritten part well formed, and every banked value read back off the
//      DISK rather than out of memory. A workbook that loses the VBA or the
//      XML map is not an AMAW any more, whatever its cells say, and a regex
//      splice can produce a part that zips perfectly and Excel refuses.
//   4. THE MAPPER, through the generator — the seam between the two, which
//      has a quoting trap in it. See section 6.
//
// Measured on both real lots (contract 252112, Boonesboro, lots 1 and 2)
// against KYTC's blank 14.01 and 13.04 templates, 2026-09-13:
// 6,747 staging cells matching, 0 expected differences, 0 unexplained; about
// 16,100 archive cells matching with ~1,480 expected differences and 0
// unexplained; 6,719 banked cells read back off the file; VBA and XML map
// intact. Five seconds a lot.
//
// The payload here is the lot's own cells rather than a PlantBook lot object,
// for the same reason regenerate.mjs works that way: it isolates the engine
// from the mapper. When scripts/amaw/mapper.mjs lands, the same generator
// takes `{ lot }` instead and this check keeps measuring the half below it.
//
// Real AMAWs carry technician SM IDs and contractor data, so this takes a
// path rather than shipping a fixture. The blank template is not in the repo
// either - docs/amaw-map.md says where KYTC publishes it.
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { cellsOf, rowNum } from "../mixpack/xlsx.mjs";
import { evaluate } from "../mixpack/formula.mjs";
import { openWorkbook, generateAmaw, templateFacade, splitAddr,
         STAGING, FIRST_DATA_ROW, DIRECT_READ, REFERENCE_SHEETS } from "./generate.mjs";
import { AMAW } from "./addresses.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const positional = [];
let TEMPLATE = process.env.AMAW_TEMPLATE || "";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--template") TEMPLATE = argv[++i];
  else positional.push(argv[i]);
}
const [SRC, OUT] = positional;
if (!TEMPLATE) {
  for (const guess of [path.join(HERE, "../../public/AMAW_VER14_01.xlsm"),
                       path.join(HERE, "../../AMAW_VER14_01.xlsm")])
    if (fs.existsSync(guess)) { TEMPLATE = guess; break; }
}
if (!SRC || !TEMPLATE || !fs.existsSync(TEMPLATE)) {
  console.error("usage: check_generate.mjs <completed-amaw.xlsm> [out.xlsm] --template <blank-AMAW.xlsm>");
  console.error("       (or set AMAW_TEMPLATE; the blank template is a public KYTC download, see docs/amaw-map.md)");
  process.exit(2);
}

const q = (s) => JSON.stringify(s);
const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const same = (a, b) =>
  (typeof a === "number" && typeof b === "number")
    ? Math.abs(a - b) < 1e-9 || (b !== 0 && Math.abs((a - b) / b) < 1e-9)
    : String(a ?? "").trim() === String(b ?? "").trim();
const blank = (v) => v === null || v === undefined || String(v).trim() === "";

const src = openWorkbook(SRC);
const tpl = openWorkbook(TEMPLATE);

// ---------------------------------------------------------------------
//  1. the payload: what a person put in this workbook
// ---------------------------------------------------------------------
//
// Three sources, and all three are needed. The first is what SiteManager
// CONSUMES; the second is the tab nothing points at; the third is everything
// else a person typed, which matters because the Applet keeps the file.

const inputs = new Set();

// (a) every non-staging cell a staging formula reads, derived from the
//     TEMPLATE rather than hand-listed.
for (const name of STAGING)
  for (const [ref, c] of tpl.cellsOf(name)) {
    if (rowNum(ref) < FIRST_DATA_ROW(name) || !c.f) continue;
    for (const m of c.f.matchAll(/(?:'([^']+)'|\b([A-Za-z_][A-Za-z0-9_.]*))!\$?([A-Z]{1,3})\$?(\d+)/g)) {
      const sheet = m[1] || m[2];
      if (!STAGING.includes(sheet)) inputs.add(`${sheet}!${m[3]}${m[4]}`);
    }
  }
const staged1 = inputs.size;

// (b) the direct-read tabs. Nothing references Project Items, and a file
//     without it loads with no project items at all.
for (const [sheet, spec] of Object.entries(DIRECT_READ))
  for (let r = spec.firstRow; r <= spec.lastRow; r++)
    for (const col of spec.cols) inputs.add(`${sheet}!${col}${r}`);

// (c) ...and every other cell holding a value the template does not compute.
//     Same rule as regenerate.mjs: carry a source cell wherever the TEMPLATE
//     has no formula there. A template formula recalculates itself on open
//     and must keep its <f>, so those are left alone here and checked in
//     section 2 instead.
let carried = 0, skippedRef = 0;
for (const name of src.names) {
  if (STAGING.includes(name) || !src.has(name)) continue;
  if (REFERENCE_SHEETS.includes(name)) {
    for (const [, c] of src.cellsOf(name)) if (!blank(c.v)) skippedRef++;
    continue;
  }
  for (const [ref, c] of src.cellsOf(name)) {
    if (blank(c.v)) continue;
    const t = tpl.cellsOf(name).get(ref);
    if (t && t.f) continue;                                     // recalculates on open
    if (t && t.v != null && String(t.v) === String(c.v)) continue;  // the template's own label
    const k = `${name}!${ref}`;
    if (inputs.has(k)) continue;
    inputs.add(k); carried++;
  }
}

// Resolve each one out of the real lot. A visible cell can be a formula Excel
// never recalculated before the save, so take the cached value when there is
// one and evaluate otherwise.
const resolving = new Set(), memo = new Map();
const valueOfSrc = (sheet, ref) => {
  const k = `${sheet}!${ref}`;
  if (memo.has(k)) return memo.get(k);
  const c = src.cellsOf(sheet).get(ref);
  let out = null;
  if (c) {
    if (c.v != null) out = src.value(sheet, ref);
    else if (c.f && !resolving.has(k)) {
      resolving.add(k);
      try { out = evaluate(c.f, (sh, cell) => valueOfSrc(sh || sheet, cell)); }
      catch { out = null; }
      finally { resolving.delete(k); }
    }
  }
  memo.set(k, out);
  return out;
};

/* A cell the lot leaves empty is NOT written, and that is a real decision
 * rather than an optimisation. Two things go wrong if it is:
 *
 *   the template's own formula there is dropped for nothing - `Cores!H10` is
 *   IF(G10="","",G10*62.4), so an empty core reads "" and the sheet keeps
 *   working; overwriting it with a literal blank kills the arithmetic in the
 *   archived copy for every core the lab has not measured yet;
 *
 *   and Excel's cached EMPTY STRING is not a blank cell. `=Cores!H10` is ""
 *   for the first and 0 for the second, so flattening one to the other moves
 *   92 staging cells off the lot's own answer.
 *
 * The exception is a template cell holding a literal value the lot has since
 * cleared - there, writing the blank is the point.
 */
const values = {};
for (const k of inputs) {
  const [s, r] = k.split("!");
  if (!src.has(s)) continue;
  const v = valueOfSrc(s, r);
  if (v === null || v === undefined || v === "") {
    const t = tpl.cellsOf(s).get(r);
    if (!t || t.f || t.v == null || String(t.v).trim() === "") continue;
    values[k] = "";
    continue;
  }
  values[k] = v;
}

// ---------------------------------------------------------------------
//  2. generate - through the shipped entry point, not a private half of it
// ---------------------------------------------------------------------
const out = OUT || path.join(fs.mkdtempSync("/tmp/amaw-check-"), "generated.xlsm");
const t0 = Date.now();
const { parts, staged, report, bytes, filename } =
  await generateAmaw({ template: TEMPLATE, book: tpl, values, out });
const ms = Date.now() - t0;

console.log(`lot                   : ${SRC}`);
console.log(`template              : ${TEMPLATE}`);
console.log(`input cells           : ${Object.keys(values).length}  (${staged1} read by a staging formula, ` +
            `${Object.keys(DIRECT_READ).join("/")} direct-read, +${carried} other authored cells; ` +
            `${skippedRef} reference-list cells left at the template's version)`);
console.log(`cells written         : ${report.written}  (${report.kept} keeping the template's formula, ` +
            `${report.dropped} dropping it)`);
console.log(`staging cells banked  : ${report.staged} in ${report.passes} passes, ${ms} ms`);
if (report.unknownSheet.length) console.log(`unknown sheets        : ${[...new Set(report.unknownSheet)].join(", ")}`);
if (report.failed.length) {
  console.log(`could not evaluate    : ${report.failed.length}  (left as formulas - the evalOnly path)`);
  for (const [w, f, e] of report.failed.slice(0, 5)) console.log(`   ${w}  ${String(f).slice(0, 70)}  ${e}`);
}
console.log(`sample id / filename  : ${report.sampleId ? report.sampleId : "(none - see below)"}  -> ${filename}  ${bytes.length} bytes`);
console.log(`what the lot lacks    : ${report.missing.length}`);
for (const m of report.missing) console.log(`   ${m}`);

// Read the generated workbook back the same way we read any other: by name,
// off the parts we rewrote, falling back to the template for the rest.
const genCache = new Map();
const genCells = (name) => {
  if (!genCache.has(name)) {
    const p = tpl.partOf(name);
    genCache.set(name, parts.has(p)
      ? cellsOf(parts.get(p).replace(/<v\/>/g, "<v></v>"), tpl.strings())
      : tpl.cellsOf(name));
  }
  return genCache.get(name);
};
const genValue = (name, ref) => {
  const c = genCells(name).get(ref);
  if (!c || c.v == null) return null;
  return (c.t === "s" || c.t === "str" || c.t === "inlineStr" || c.t === "e")
    ? c.v : (NUMRE.test(c.v) ? +c.v : c.v);
};

// ---------------------------------------------------------------------
//  3. staging parity - the payload SiteManager receives
// ---------------------------------------------------------------------
let ok = 0, okValued = 0;
const diffs = [];
for (const name of STAGING)
  for (const [ref, c] of src.cellsOf(name)) {
    if (rowNum(ref) < FIRST_DATA_ROW(name) || !c.f || c.v == null) continue;
    const want = src.value(name, ref);
    const got = genValue(name, ref);
    if (same(got, want)) { ok++; if (!blank(want)) okValued++; }
    else diffs.push([`${name}!${ref}`, c.f, got, want]);
  }

// The tolerated outcomes, each one a rule rather than a list of cells.
const EXPECTED_STAGING = {
  'the lot itself holds an Excel error there (#VALUE! - every one is an INDIRECT over an empty "which sublot" cell)':
    (d) => String(d[3]).startsWith("#"),
  "stamped at generation time (TEXT(NOW(),…), or a value carrying this run's stamp)":
    (d) => /NOW\(/.test(d[1]) || String(d[2]).includes(report.stamp),
};
const classify = (list, rules) => {
  const by = {}, rest = [];
  for (const d of list) {
    const hit = Object.entries(rules).find(([, f]) => f(d));
    if (hit) (by[hit[0]] ||= []).push(d); else rest.push(d);
  }
  return [by, rest];
};
const [stagingBy, stagingRest] = classify(diffs, EXPECTED_STAGING);

console.log(`\n--- staging parity (the payload MEDL loads) ---`);
console.log(`matching              : ${ok}   (${okValued} of them carrying a value, not "")`);
console.log(`expected differences  : ${diffs.length - stagingRest.length}`);
for (const [why, list] of Object.entries(stagingBy)) console.log(`   ${String(list.length).padStart(4)}  ${why}`);
console.log(`UNEXPLAINED           : ${stagingRest.length}`);
for (const [w, f, got, want] of stagingRest.slice(0, 20))
  console.log(`${w}\n   f=${String(f).slice(0, 110)}\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ---------------------------------------------------------------------
//  4. archive parity - every other cell a person filled in
// ---------------------------------------------------------------------
//
// A generated workbook is a record as well as a payload: the Applet archives
// it, and a reviewer opens it. So the question for a cell here is not "did we
// cache a value" but "what does EXCEL show when it opens this file", which is
// a different thing for every cell that still carries a formula.
//
// excelValue() answers it by modelling exactly that. A generated cell with no
// <f> is a literal and stands; a cell that kept one is recomputed from it,
// through the same rule recursively. That also re-checks every keepFormula
// decision the generator made: a formula kept over inputs we did not write
// shows up here as a cell that comes back wrong, which is the failure mode
// this whole exercise exists to prevent.
//
// A formula the evaluator cannot compute - VALUE(), AND(), ISNUMBER(), and
// anything reading one - is NOT a failure: Excel computes it. But it has to
// be tracked rather than assumed, because a declined dependency reads as
// blank and yields a plausible wrong answer three formulas later (that is how
// `Pay Values!E18` comes out empty off a VALUE() in F3). So `unresolved`
// propagates up through every reference.
const excelMemo = new Map(), excelBusy = new Set();
const excelValue = (sheet, ref) => {
  const k = `${sheet}!${ref}`;
  if (excelMemo.has(k)) return excelMemo.get(k);
  if (excelBusy.has(k)) return { v: null, unresolved: true };   // a cycle: decline it
  const c = genCells(sheet).get(ref);
  if (!c) return { v: null, unresolved: false };
  if (!c.f) return { v: genValue(sheet, ref), unresolved: false };
  excelBusy.add(k);
  let out;
  try {
    let dep = false;
    const v = evaluate(c.f, (sh, cell) => {
      const d = excelValue(sh || sheet, cell);
      if (d.unresolved) dep = true;
      return d.v;
    });
    out = { v, unresolved: dep };
  } catch { out = { v: null, unresolved: true }; }
  finally { excelBusy.delete(k); }
  excelMemo.set(k, out);
  return out;
};

let aOk = 0, aRecomputed = 0;
const aDiffs = [];
for (const name of src.names) {
  if (STAGING.includes(name) || !src.has(name)) continue;
  for (const [ref, c] of src.cellsOf(name)) {
    if (blank(c.v)) continue;
    const want = src.value(name, ref);
    const got = excelValue(name, ref);
    const gc = genCells(name).get(ref);
    if (same(got.v, want)) { aOk++; if (gc && gc.f) aRecomputed++; }
    else {
      // What does the LOT's own formula come to, in the lot's own workbook?
      // Where that disagrees with the value cached beside it, the cache is
      // stale and Excel will change it the next time anybody opens the real
      // file - so our answer is not a difference from Excel, only from a
      // number nobody has recalculated since KYTC last saved.
      let lotRecompute;
      if (c.f) { try { lotRecompute = evaluate(c.f, (sh, cell) => valueOfSrc(sh || name, cell)); } catch {} }
      aDiffs.push([`${name}!${ref}`, gc && gc.f ? gc.f : "(a literal)", got.v, want,
                   got.unresolved, c.f || null, lotRecompute]);
    }
  }
}

const EXPECTED_ARCHIVE = {
  "a KYTC reference list, deliberately kept at the template's own version (see REFERENCE_SHEETS)":
    (d) => REFERENCE_SHEETS.includes(d[0].split("!")[0]),
  "a formula outside this evaluator's grammar, or reading one - Excel recomputes it on open":
    (d) => d[4],
  "the lot itself holds an Excel error there":
    (d) => String(d[3]).startsWith("#"),
  // The lot is a Version 13.3 workbook and the template is 14.01. Where KYTC
  // changed a formula between them the template's answer is the current one,
  // and it is not ours to reproduce - every instance so far is on `AMAMAW`,
  // the stale dictionary sheet docs/amaw-map.md says not to read.
  "KYTC changed the formula between the lot's template version and this one":
    (d) => d[5] && typeof d[1] === "string" && d[5] !== d[1],
  "the lot's own cached value is stale - its own formula recomputes to what we produce (AMAMAW, the stale dictionary sheet)":
    (d) => d[6] !== undefined && !same(d[6], d[3]) && same(d[2], d[6]),
};
const [archiveBy, archiveRest] = classify(aDiffs, EXPECTED_ARCHIVE);

console.log(`\n--- archive parity (the copy the Applet keeps, as Excel will open it) ---`);
console.log(`matching              : ${aOk}   (${aRecomputed} of them a formula the generated file recomputes to it)`);
console.log(`expected differences  : ${aDiffs.length - archiveRest.length}`);
for (const [why, list] of Object.entries(archiveBy)) console.log(`   ${String(list.length).padStart(4)}  ${why}`);
console.log(`UNEXPLAINED           : ${archiveRest.length}`);
for (const [w, f, got, want] of archiveRest.slice(0, 20))
  console.log(`${w}\n   ${String(f).slice(0, 110)}\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ---------------------------------------------------------------------
//  5. is it still an AMAW?
// ---------------------------------------------------------------------
const entries = (f) => execSync(`unzip -Z1 ${q(f)}`).toString().trim().split("\n").sort();
// unzip(1) reads [ ] in a member name as a GLOB, so "[Content_Types].xml"
// matches nothing and comes back empty - which would compare equal to the
// other empty and quietly pass. Escape them.
const member = (p) => q(p.replace(/([[\]])/g, "\\$1"));
const sha = (f, p) => execSync(`unzip -p ${q(f)} ${member(p)} | sha256sum`, { maxBuffer: 1 << 28 })
  .toString().slice(0, 16);
const tplEntries = entries(TEMPLATE), outEntries = entries(out);
const missing = tplEntries.filter((p) => !outEntries.includes(p));
const extra = outEntries.filter((p) => !tplEntries.includes(p));
const intact = ["xl/vbaProject.bin", "xl/xmlMaps.xml"].map((p) =>
  [p, sha(TEMPLATE, p) === sha(out, p)]);
// Everything that is NOT a part we rewrote must be byte-identical too -
// otherwise something (a repack, a stray edit) is touching parts it should
// not, which is how the ListObjects and activeX blobs get lost.
let changedParts = 0, unexpectedlyChanged = [];
for (const p of tplEntries) {
  if (p.endsWith("/")) continue;
  const differs = sha(TEMPLATE, p) !== sha(out, p);
  if (!differs) continue;
  changedParts++;
  if (![...parts.keys()].includes(p)) unexpectedlyChanged.push(p);
}
const zipOk = /No errors detected/.test(execSync(`unzip -t ${q(out)} | tail -1`).toString());

// Every cell we set is a regex splice into XML, so a part can come out of
// the generator zipping perfectly and still be malformed - Excel would then
// refuse the file outright, which no cell-level diff above would notice.
// Tag-balance is enough to catch a bad splice and needs no dependency.
const wellFormed = (xml) => {
  const stack = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[2] === undefined) continue;                 // comment, CDATA, PI
    if (m[4] === "/") continue;                       // self-closing
    if (m[1] === "/") { if (stack.pop() !== m[2]) return `</${m[2]}> closes nothing`; }
    else stack.push(m[2]);
  }
  return stack.length ? `unclosed <${stack[stack.length - 1]}>` : null;
};
const malformed = [...parts].map(([p, x]) => [p, wellFormed(x)]).filter(([, e]) => e);

console.log(`\n--- the workbook itself ---`);
console.log(`output                : ${out}  ${fs.statSync(out).size} bytes`);
console.log(`zip integrity         : ${zipOk ? "ok (unzip -t clean)" : "FAILED"}`);
console.log(`entries               : ${outEntries.length} of the template's ${tplEntries.length}` +
            (missing.length ? `  MISSING ${missing.join(", ")}` : "") +
            (extra.length ? `  EXTRA ${extra.join(", ")}` : ""));
for (const [p, good] of intact) console.log(`${p.padEnd(22)}: ${good ? "byte-identical" : "CHANGED - the workbook is no longer loadable"}`);
console.log(`parts rewritten       : ${changedParts}, all of them sheets we filled` +
            (unexpectedlyChanged.length ? `  NO: ${unexpectedlyChanged.join(", ")}` : ""));
console.log(`rewritten XML         : ${parts.size - malformed.length} of ${parts.size} well formed` +
            (malformed.length ? `  BROKEN: ${malformed.map(([p, e]) => `${p} (${e})`).join(", ")}` : ""));

// Everything above reads the XML we produced in memory. Read the FILE back
// instead - through the same manifest-resolved reader anything else would
// use - so the zip layer is in the loop too. A pack that dropped or
// truncated a part passes every comparison until somebody opens the file.
const back = openWorkbook(out);
let reread = 0;
const rereadBad = [];
for (const [k, want] of staged) {
  const [sheet, ref] = splitAddr(k);
  const got = back.value(sheet, ref);
  if (same(got === null ? "" : got, want === null ? "" : want)) reread++;
  else rereadBad.push(`${k}: on disk ${JSON.stringify(got)}, banked ${JSON.stringify(want)}`);
}
console.log(`re-read from the file : ${reread} of ${staged.size} banked staging cells` +
            (rereadBad.length ? `  ${rereadBad.length} WRONG` : ""));
for (const b of rereadBad.slice(0, 10)) console.log(`   ${b}`);

// ---------------------------------------------------------------------
//  6. the mapper, wired through the generator
// ---------------------------------------------------------------------
//
// Everything above drives the engine from a workbook's own cells, which is
// deliberate - it measures the generator without the mapper in the way, the
// same separation regenerate.mjs keeps for the MixPack. But the two have to
// MEET somewhere, and the seam has a trap in it: the mapper spells its
// addresses the way Excel does, so a sheet name with a space arrives quoted
// ("'Pay Values'!B3"). A generator that splits on "!" and keeps the quotes
// drops every one of those cells into "unknown sheet" and still produces a
// file - a whole tab of lot data missing from a workbook that looks fine.
//
// So this builds a small lot out of the identity of the one being checked,
// runs it through the real amawCells() and the real generateAmaw(), and
// asserts the plumbing rather than the mapping: every address resolves, no
// address lands on a staging sheet, written cells read back, evalOnly cells
// are NOT written, and what the mapper could not fill is reported. Field-by-
// field mapping fidelity is check_mapper.mjs's job, not this one's.
const mapperProblems = [];
let mapperRan = false;
try {
  const { blankLot } = await import("./storage.mjs");
  const { amawCells } = await import("./mapper.mjs");
  mapperRan = true;

  const lotVal = (key) => src.value(AMAW.LOT.sheet, AMAW.LOT[key]);
  const identity = {
    contract_id: lotVal("contract") || "252112",
    amp_number: String(lotVal("plantCode") || "AMP070302").trim(),
    mix_id: String(lotVal("mixId") || "00385").split(/\s+/)[0],
    lot_number: lotVal("lotNumber") || 1,
  };
  const lot = blankLot(identity, { mix_signature: "CL3 ASPH SURF 0.38A PG64-22" });
  lot.values = {
    county: lotVal("county"), item_code: lotVal("itemCode"), lot_tons: lotVal("lotTons"),
    material_code: lotVal("materialCode"), approver_id: lotVal("approverId"),
    approver_name: lotVal("approverName"), approved_mix_design: lotVal("approvedMixDesign"),
    acceptance_method: "Volumetrics", density_option: 1, esal_class: 3, mix_type_code: 5,
  };
  lot.records = {
    QC01: {
      values: { truck: "T-1", tons: 4955, temperature: 325, tested_by: "jwheatl2" },
      rows: { specimens: [{ wt_air: 4800.1, wt_water: 2750.2, wt_ssd: 4805.3 }] },
    },
  };

  // The SAME facade the generator hands it. Handing the mapper a stub here
  // instead splits values/evalOnly differently from the run being checked,
  // and the diff then reports the harness's own inconsistency as a fault in
  // the workbook - which it did, on 'Pay Values'!C9, before this line said
  // templateFacade.
  const mapped = amawCells(lot, templateFacade(tpl), {});
  const gen2 = await generateAmaw({ template: TEMPLATE, book: tpl, lot,
                                    out: path.join(fs.mkdtempSync("/tmp/amaw-mapper-"), "mapped.xlsm") });
  const g2 = (name) => {
    const p = tpl.partOf(name);
    return gen2.parts.has(p) ? cellsOf(gen2.parts.get(p).replace(/<v\/>/g, "<v></v>"), tpl.strings())
                             : tpl.cellsOf(name);
  };

  const all = { ...mapped.values, ...mapped.evalOnly };
  let unresolvable = 0, ontoStaging = 0, landed = 0, wrong = 0, keptEvalOnly = 0, overwritten = 0;
  for (const addr of Object.keys(all)) {
    const [sheet, ref] = splitAddr(addr);
    if (!sheet || !tpl.has(sheet) || !/^[A-Z]{1,3}\d+$/.test(ref)) { unresolvable++; mapperProblems.push(`address does not resolve: ${addr}`); continue; }
    if (STAGING.includes(sheet)) { ontoStaging++; mapperProblems.push(`the mapper writes onto a staging sheet: ${addr}`); }
  }
  for (const [addr, spec] of Object.entries(mapped.values)) {
    const [sheet, ref] = splitAddr(addr);
    if (!tpl.has(sheet)) continue;
    const want = spec && typeof spec === "object" && "v" in spec ? spec.v : spec;
    const c = g2(sheet).get(ref);
    const got = !c || c.v == null ? null
      : (c.t === "s" || c.t === "str" || c.t === "inlineStr") ? c.v : (NUMRE.test(c.v) ? +c.v : c.v);
    if (same(got, want)) landed++;
    else { wrong++; mapperProblems.push(`${addr}: mapper said ${JSON.stringify(want)}, the workbook reads ${JSON.stringify(got)}`); }
  }
  for (const addr of Object.keys(mapped.evalOnly)) {
    const [sheet, ref] = splitAddr(addr);
    if (!tpl.has(sheet)) continue;
    const t = tpl.cellsOf(sheet).get(ref), c = g2(sheet).get(ref);
    if (t && t.f && (!c || !c.f)) { overwritten++; mapperProblems.push(`evalOnly cell was written over: ${addr}`); }
    else keptEvalOnly++;
  }
  if (gen2.report.unknownSheet.length)
    mapperProblems.push(`generator could not place: ${[...new Set(gen2.report.unknownSheet)].slice(0, 5).join(", ")}`);
  // A lot this thin should be loudly incomplete. A silent report here would
  // mean the "what is missing" half is not working, which is the half a
  // technician actually reads.
  if (!gen2.report.missing.length) mapperProblems.push("the report names nothing missing on a deliberately thin lot");

  console.log(`\n--- the mapper, through the generator ---`);
  console.log(`lot built from        : this workbook's identity + one QC01 sublot`);
  console.log(`mapper produced       : ${Object.keys(mapped.values).length} cells to write, ${Object.keys(mapped.evalOnly).length} evalOnly`);
  console.log(`addresses resolved    : ${Object.keys(all).length - unresolvable} of ${Object.keys(all).length}` +
              (ontoStaging ? `  ${ontoStaging} ONTO A STAGING SHEET` : ""));
  console.log(`written cells read back: ${landed} correct, ${wrong} wrong`);
  console.log(`evalOnly left computed : ${keptEvalOnly} kept their formula, ${overwritten} overwritten`);
  console.log(`the lot lacks          : ${gen2.report.missing.length} cells named`);
} catch (e) {
  if (/Cannot find module|ERR_MODULE_NOT_FOUND/.test(String(e && e.message))) {
    console.log(`\n--- the mapper, through the generator ---`);
    console.log(`skipped: scripts/amaw/mapper.mjs is not here yet. The generator takes`);
    console.log(`{ values } directly, which is what every section above exercises.`);
  } else {
    mapperProblems.push(`threw: ${e && e.message}`);
    console.log(`\n--- the mapper, through the generator ---\nthrew: ${e && e.stack}`);
  }
}
if (mapperProblems.length) {
  console.log(`PROBLEMS              : ${mapperProblems.length}`);
  for (const p of mapperProblems.slice(0, 20)) console.log(`   ${p}`);
}

const hardFail = stagingRest.length || archiveRest.length || missing.length || extra.length ||
                 unexpectedlyChanged.length || !zipOk || intact.some(([, g]) => !g) ||
                 malformed.length || rereadBad.length || mapperProblems.length;
console.log(`\n${hardFail ? "FAIL" : "PASS"}`);
process.exit(hardFail ? 1 : 0);

/* ---------------------------------------------------------------------------
 * What this proves, and the three things it does not.
 *
 * IT PROVES THE PAYLOAD. Every staging cell either matches the lot KYTC
 * accepted or differs for a reason this file states as a rule rather than a
 * list: the lot holds an Excel error there (28 INDIRECTs over an empty
 * "which sublot" cell, which a generated file reproduces as the same error),
 * or the value is stamped at generation time.
 *
 * IT PROVES THE FILE OPENS THE SAME. Archive parity models what Excel shows
 * rather than what we cached, which is the only way to catch a formula kept
 * over inputs we did not write - the failure this whole exercise exists to
 * prevent, and one that looks like a perfect file until somebody opens it.
 *
 * WHAT IT DOES NOT PROVE, first: A MEDL LOAD. The same thing is still owed
 * for the MixPack (docs/sitemanager-handoff.md) - Andrew and Tate loaded a
 * regenerate.mjs file on 2026-09-10 and nobody has put an AMAW through yet.
 * Staging parity with a workbook KYTC accepted is strong evidence and not a
 * receipt.
 *
 * Second: A LOT'S OWN SAMPLE ID. Both real lots leave 'Pay Values'!B3 blank,
 * so both generate as "AMAW-no-sample-id.xlsm" with smpl_id empty on all
 * seven records, and the report says so. That is KYTC's own "not ready to
 * hand off" state rather than a fault here, but it means no run so far has
 * exercised a fully identified workbook end to end.
 *
 * Third: THE MAPPING. Section 6 proves the two modules meet correctly, not
 * that a lot's %AC lands on the right row - that is check_mapper.mjs, which
 * reads a real AMAW into a payload and diffs every cell the mapper produces.
 * Run both; neither subsumes the other.
 * ------------------------------------------------------------------------- */
