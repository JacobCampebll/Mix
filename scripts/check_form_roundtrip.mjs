// Does a design survive a round trip through the form?
//
// Renders every CONFIG.SECTIONS block from a payload exactly as renderForm()
// does, then reads it back exactly as collectForm() does, and diffs. That is
// the path a review PDF takes on re-upload, and the path a saved design took
// on reopen - so anything this loses, a technician loses.
//
// It exists because two render paths were building their markup from the
// CONFIG seeds instead of the values in hand: Four Points (all four
// constants and every Pb/Gmb/Gmm row) and any `fixed` row spec (the Hamburg
// curve). 28 fields vanished on every reopen and nothing complained.
//
// Run it after touching CONFIG.SECTIONS or any *HTML() builder:
//
//   npm install --prefix scripts     # one-off; jsdom is the only dep
//   node scripts/check_form_roundtrip.mjs
//
// Exit code is the number of lost fields, so it drops straight into CI.
// Add new field types to the payload below when you add them to the schema -
// a field absent here is a field this does not protect.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
const PAGE = path.resolve(fileURLToPath(import.meta.url), '../../public/designbook.html');
const html = fs.readFileSync(PAGE, 'utf8');

const grab = (start, end) => { const a = html.indexOf(start); const b = html.indexOf(end, a); return html.slice(a, b); };
const configSrc = (() => { const a = html.indexOf('const CONFIG = {'); return html.slice(a, html.indexOf('\n};', a) + 3); })();
// every pure HTML builder + helpers, from the field-helpers banner to renderForm
const buildersSrc = grab("/* ---------- field helpers ---------- */", "function renderForm()");

// The sample is DERIVED from CONFIG.SECTIONS, not hand-written: a
// hand-written one silently stops covering a field the moment someone
// renames or adds one (aadtt_class/line_items caught exactly that).
function sampleFor(f, i) {
  if (f.options && f.options.length) return String(f.options[i % f.options.length]);
  if (f.type === "date") return "2026-03-13";
  if (f.type === "number") return String((i % 90) + 10) + "." + ((i % 9) + 1);
  return "Sample " + f.key + " " + i;
}
const CFG = (() => {
  const a = html.indexOf('const CONFIG = {');
  return new Function(html.slice(a, html.indexOf('\n};', a) + 3) + '; return CONFIG;')();
})();
const payload = (() => {
  const values = {}, rows = {}, fourpoint = {};
  let n = 0;
  CFG.SECTIONS.forEach((sec) => {
    (sec.fields || []).forEach((f) => { values[f.key] = sampleFor(f, n++); });
    if (sec.type === "sieves") sec.sieves.forEach((sv, i) => { values[sv.key] = String(100 - i * 7); });
    if (sec.type === "fourpoint") {
      sec.constants.forEach((c) => { fourpoint["const:" + c.key] = String(2 + (n++ % 3)) + ".5"; });
      sec.points.forEach((_, i) => {
        fourpoint[`pt:${i}:pb`] = (4.3 + i * 0.5).toFixed(1);
        fourpoint[`pt:${i}:gmb`] = (2.39 + i * 0.01).toFixed(3);
        fourpoint[`pt:${i}:gmm`] = (2.52 - i * 0.015).toFixed(3);
      });
    }
    if (sec.rows) (Array.isArray(sec.rows) ? sec.rows : [sec.rows]).forEach((spec) => {
      const count = spec.fixed ? (spec.seed || []).length : 2;
      rows[spec.key] = Array.from({ length: count }, (_, r) => {
        const o = {};
        (spec.columns || []).forEach((c) => {
          const seeded = spec.fixed && (spec.seed || [])[r] && (spec.seed || [])[r][c.key];
          o[c.key] = seeded != null ? String(seeded) : sampleFor(c, n++);
        });
        return o;
      });
    });
  });
  values.fourpoint = fourpoint;
  values.design_values = {};
  return { values, rows };
})();

const dom = new JSDOM('<body><div id="sections"></div></body>');
global.document = dom.window.document;

const escSrc = grab("function esc(v) {", "\n// Ephemeral");
const refSrc = grab("function refMatch(", "function refreshReferenceControls");

const src = `
${configSrc}
${escSrc}
const state = { extracted: EXTRACTED, ref: Object.assign({loaded:true,error:null},
  ...Object.keys(CONFIG.REFERENCE.TABLES).map(k=>({[k]:[]}))), sources:{}, legacy:null };
${refSrc}
${buildersSrc}
return { CONFIG, state, gridHTML, sievesHTML, fourpointHTML, computedHTML, rowsBlockHTML };
`;
const mk = new Function('EXTRACTED', src);
const M = mk({ scalars: payload.values, tables: payload.rows });

// exactly what renderForm does per section
const parts = M.CONFIG.SECTIONS.map((s) => {
  if (s.type === "sieves") return M.sievesHTML(s);
  if (s.type === "status") return "";
  if (s.type === "fourpoint") return M.fourpointHTML(s);
  if (s.type === "computed") return M.computedHTML(s);
  let b = "";
  if (s.fields) b += M.gridHTML(s.fields);
  if (s.rows) b += M.rowsBlockHTML(s.rows);
  return b;
});
document.getElementById('sections').innerHTML = parts.join("");

// exactly what collectForm does
const values = {};
document.querySelectorAll("[data-field]").forEach(el => { values[el.dataset.field] = String(el.value||"").trim() || null; });
const fourpoint = {};
document.querySelectorAll("[data-fp]").forEach(el => { fourpoint[el.dataset.fp] = String(el.value||"").trim() || null; });
values.fourpoint = fourpoint;
const rows = {};
document.querySelectorAll("[data-rowlist]").forEach(list => {
  rows[list.dataset.rowlist] = Array.from(list.children).map(row => {
    const o = {}; row.querySelectorAll("[data-col]").forEach(el => { o[el.dataset.col] = String(el.value||"").trim() || null; });
    return o;
  }).filter(o => Object.values(o).some(v => v !== null));
});

let bad = 0;
const cmp = (label, want, got) => {
  if (String(want ?? "") !== String(got ?? "")) { bad++; console.log(`  LOST ${label}: sent ${JSON.stringify(want)}, form gave ${JSON.stringify(got)}`); }
};
Object.entries(payload.values).forEach(([k,v]) => {
  if (k === "fourpoint" || k === "design_values") return;
  cmp("values."+k, v, values[k]);
});
Object.entries(payload.values.fourpoint).forEach(([k,v]) => cmp("fourpoint."+k, v, fourpoint[k]));
Object.entries(payload.rows).forEach(([key, list]) => {
  list.forEach((r, i) => Object.entries(r).forEach(([c, v]) =>
    cmp(`rows.${key}[${i}].${c}`, v, rows[key] && rows[key][i] && rows[key][i][c])));
});
const checked = Object.keys(payload.values).length - 2
  + Object.keys(payload.values.fourpoint).length
  + Object.values(payload.rows).reduce((a, l) => a + l.reduce((b, r) => b + Object.keys(r).length, 0), 0);
console.log(bad ? `\n${bad} of ${checked} field(s) LOST on re-upload`
                : `\nAll ${checked} fields survive the round trip`);
process.exit(bad ? 1 : 0);
