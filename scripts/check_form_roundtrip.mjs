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
//   npm install jsdom          # one-off, anywhere; this is the only dep
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

const payload = {
  values: {
    county:"Fayette", total_tons:"12500", submittal_type:"Field change",
    binder_grade:"PG 76-22", binder_terminal:"LAP-07", funding:"State",
    project_items:"0055", project_number:"IM 64-1", depth_mm:"38",
    rap_note:"20% RAP", esal:">30M", designer:"Jacob Campbell",
    s50:"100", s37_5:"100", s25:"97", s19:"91", s12_5:"77", s9_5:"65", s6_3:"54",
    s4_75:"45", s2_36:"30", s1_18:"21", s0_6:"15", s0_3:"10", s0_15:"7.1", s0_075:"4.9",
    tsr_pct:"88.4", tsr_pct_additive:"93.1", tsr_dry_strength:"142",
    tsr_wet_strength:"125", tsr_additive:"Morlife 5000 @ 0.5%",
    perf_binder:"PG 76-22 (Marathon)",
    hamburg_left_maxdef:"12.4", hamburg_right_maxdef:"12.0",
    hamburg_left_passmax:"25000", hamburg_right_passmax:"25000",
    hamburg_left_sip:"14200", hamburg_right_sip:"14800",
    fourpoint: {
      "const:fp_gsb":"2.677","const:fp_gb":"1.032","const:fp_p075":"4.9","const:fp_vatgt":"4.0",
      "pt:0:pb":"4.6","pt:0:gmb":"2.411","pt:0:gmm":"2.522",
      "pt:1:pb":"5.1","pt:1:gmb":"2.428","pt:1:gmm":"2.506",
      "pt:2:pb":"5.6","pt:2:gmb":"2.439","pt:2:gmm":"2.491",
      "pt:3:pb":"6.1","pt:3:gmb":"2.443","pt:3:gmm":"2.476" },
    design_values: {},
  },
  rows: {
    aggregate: [
      { producer:"Allen Company", type_size:"No. 57 Crushed Stone", mat_code:"10400", pct_blend:"40", gsb:"2.681" },
      { producer:"Nally & Hamilton", type_size:"No. 8 Crushed Stone", mat_code:"10415", pct_blend:"35", gsb:"2.664" } ],
    perf_specimens: [
      { specimen:"S-1", dry_wt:"4821.3", ssd_wt:"4838.9", wt_water:"2801.4", air_voids:"3.4" },
      { specimen:"S-2", dry_wt:"4818.7", ssd_wt:"4835.1", wt_water:"2799.8", air_voids:"3.6" } ],
    ct: [ { specimen:"CT-1", index:"72.4" }, { specimen:"CT-2", index:"75.8" } ],
    hamburg_curve: [
      { passes:"100", left:"1.2", right:"1.1" }, { passes:"5000", left:"3.4", right:"3.2" },
      { passes:"10000", left:"5.1", right:"4.9" }, { passes:"15000", left:"7.0", right:"6.8" },
      { passes:"20000", left:"9.3", right:"9.1" }, { passes:"25000", left:"12.4", right:"12.0" } ],
  },
};

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
console.log(bad ? `\n${bad} field(s) LOST on re-upload` : "\nAll fields survive the round trip");
process.exit(bad ? 1 : 0);
