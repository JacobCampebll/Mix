/* Build demo artifacts for the Thursday task force meeting:
 *   1. Import Eaton's real, approved-in-principle #404PA MixPack as johndoe
 *   2. Submit it
 *   3. Approve it under a DEMO signing key (never the production secret) -
 *      this is fabricated PlantBook data, not a real KYTC approval, and must
 *      never be indistinguishable from one
 *   4. Open PlantBook on that approval and fill in fabricated (but
 *      plausible) lot data
 *   5. Save the approval PDF and a completed lot PDF + .json working copy
 *
 * Run: node scripts/demo/build_404pa_demo.mjs   (output: scripts/demo/out/404pa/)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";

const require_ = createRequire(import.meta.url);
const REPO = "C:/Users/andrew.denmark/code/Mix";
const PAGE = `${REPO}/public/designbook.html`;
// scripts/demo/out/ is git-ignored, so the files survive a session without
// ever being committed.
const OUT = `${REPO}/scripts/demo/out/404pa`;
const MIXPACK = "N:/MATERIAL/BITSHARE/Mxpack2026/#404/#404PA.xlsm";
const CHROMIUM = `${os.homedir()}/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`;

const { chromium } = require_(`${REPO}/scripts/node_modules/playwright`);
const { signingMaterial, submitterOf, encodeDigest, approvalNumbers } =
  await import(`file://${REPO}/netlify/lib/canonical.mjs`);

fs.mkdirSync(OUT, { recursive: true });

const JOB = { cid: "261118", letting: "2026-05-21", plant: "AMP060302" };
const CONTRACTOR = { sm_id: "johndoe", first_name: "John", last_name: "Doe",
                      company: "Demo Contractor (Task Force Preview)", can_review: false, onboarded: true, user_id: "u-johndoe" };
const REVIEWER = { sm_id: "demoreviewer", first_name: "Demo", last_name: "Reviewer",
                    company: "KYTC", can_review: true, onboarded: true, user_id: "u-reviewer" };

/* ---------- libs (pdf-lib / xlsx / fflate) ---------- */
function findLibs() {
  const root = `${REPO}/scripts/node_modules`;
  const want = { "pdf-lib": "pdf-lib/dist/pdf-lib.min.js", xlsx: "xlsx/dist/xlsx.full.min.js", fflate: "fflate/umd/index.js" };
  const found = {};
  for (const [name, rel] of Object.entries(want)) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) found[name] = p;
  }
  return found;
}

/* ---------- the offline Supabase stand-in, tailored to #404PA ---------- */
// The reference tables are a SNAPSHOT of the live project, not a hand-typed
// list. A hand-typed one was tried first and it was wrong in a way that showed
// on screen: it carried placeholder AGP numbers and the MixPack's own freehand
// spellings, so the importer could not resolve a producer by its real AGP
// number, the approval carried names KYTC's list does not have, and PlantBook
// then found no AGP number for three of the four blend rows. The live upload
// resolves them, so the pre-built files disagreed with the demo's own first
// step. The snapshot is git-ignored; refresh it on project
// iwysxhcmvhkcjxmjarkd with one json_build_object over aggregates,
// aggregate_types, binder_terminals, binder_grades, plants (ordered
// `amp_number <> 'AMP060302', amp_number`), polish_resistant_sources,
// kytc_district_labs, and producer_supplier_labs limited to johndoe's
// plants - the rows RLS shows that account - saved as that file.
// `plants` must lead with AMP060302: this stub ignores filters, so a
// maybeSingle() plant lookup takes the first row.
const REFERENCE = `${OUT}/live_reference.json`;
function stubScript(tech) {
  if (!fs.existsSync(REFERENCE)) {
    throw new Error(`No reference snapshot at ${REFERENCE} - export the live reference tables first (see the comment above stubScript).`);
  }
  const DATA = JSON.parse(fs.readFileSync(REFERENCE, "utf8"));
  if (!DATA.plants || !DATA.plants.length || DATA.plants[0].amp_number !== "AMP060302") {
    throw new Error("reference snapshot: plants must lead with AMP060302 (the stub's maybeSingle() takes the first row)");
  }
  const CAPS = { can_access_plantbook: true, can_access_designbook: true };
  return `<script>
(function () {
  var DATA = ${JSON.stringify(DATA)};
  var TECH = ${JSON.stringify(tech)};
  var CAPS = ${JSON.stringify(CAPS)};
  function builder(table) {
    var single = false; var api = {};
    ["select","eq","neq","in","order","limit","match","filter","gte","lte","is","or","range"]
      .forEach(function (m) { api[m] = function () { return api; }; });
    ["maybeSingle","single"].forEach(function (m) { api[m] = function () { single = true; return api; }; });
    // supabase/amaw_lots.sql is deliberately NOT applied until after the
    // demo (CLAUDE.md), so its relations (amaw_lots, amaw_lot_data,
    // amaw_lot_events, amaw_lot_summaries) answer exactly as the live site
    // does today: Postgres 42P01. NOT amaw_types - that one is live.
    var UNAPPLIED = /^amaw_lot/.test(table)
      ? { code: "42P01", message: 'relation "public.' + table + '" does not exist' } : null;
    ["insert","update","upsert","delete"].forEach(function (m) {
      api[m] = function () {
        if (!UNAPPLIED) throw new Error("demo stub: unexpected write to " + table);
        var p = Promise.resolve({ data: null, error: UNAPPLIED });
        p.select = function () { return p; }; p.single = function () { return p; };
        return p;
      };
    });
    api.then = function (res, rej) {
      if (UNAPPLIED) return Promise.resolve({ data: null, error: UNAPPLIED }).then(res, rej);
      var d = table === "technicians" ? TECH : table === "technician_capabilities" ? CAPS : (DATA[table] || []);
      if (single && Array.isArray(d)) d = d.length ? d[0] : null;
      return Promise.resolve({ data: d, error: null }).then(res, rej);
    };
    return api;
  }
  window.supabase = {
    createClient: function () {
      return {
        from: builder,
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: { user: { id: TECH.user_id, email: TECH.sm_id + "@x.z" }, access_token: "t" } } }); },
          signOut: function () { return Promise.resolve({}); },
          onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        },
        functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } },
      };
    },
  };
})();
<\/script>`;
}

function buildPage(tech) {
  const libs = findLibs();
  const tag = (p) => `<script src="file://${p}"></script>`;
  let html = fs.readFileSync(PAGE, "utf8")
    .replace(/<script[^>]*src="[^"]*supabase-js[^"]*"[^>]*><\/script>/, stubScript(tech))
    .replace(/<script[^>]*src="[^"]*pdf-lib[^"]*"[^>]*><\/script>/, libs["pdf-lib"] ? tag(libs["pdf-lib"]) : "")
    .replace(/<script[^>]*src="[^"]*xlsx[^"]*"[^>]*><\/script>/, libs.xlsx ? tag(libs.xlsx) : "")
    .replace(/<script[^>]*src="[^"]*fflate[^"]*"[^>]*><\/script>/, libs.fflate ? tag(libs.fflate) : "")
    .replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, "");
  const out = path.join(OUT, `page-${tech.sm_id}.html`);
  fs.writeFileSync(out, html);
  return out;
}

/* ---------- run ---------- */
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
page.on("dialog", (d) => d.accept());

/* Sign with a demo key, never the production APPROVAL_SIGNING_SECRET, so
 * verify-approval correctly reports this as NOT a genuine KYTC approval. */
await page.route("**/sign-approval", async (route) => {
  const { payload, sequence } = JSON.parse(route.request().postData() || "{}");
  const num = approvalNumbers(payload, sequence);
  if (num.error) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify(num) });
  const submitted_by = submitterOf(payload) || CONTRACTOR.sm_id;
  const issued_at = new Date().toISOString();
  const fp = encodeDigest(createHmac("sha256", "demo-key-not-the-production-one")
    .update(signingMaterial({ payload, approvedBy: REVIEWER.sm_id, submittedBy: submitted_by, issuedAt: issued_at, approvalNo: num.mix_id }))
    .digest("hex"), 18);
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    mix_id: num.mix_id, approval_no: num.short, sequence: num.sequence, year: num.year, pa: num.pa,
    code: `${fp.slice(6, 10)}-${fp.slice(10, 14)}-${fp.slice(14, 18)}`,
    issued_at, approved_by: REVIEWER.sm_id, submitted_by,
  }) });
});
// kytc-items / kytc-notes reach the real internet; none of that exists in
// this offline run, so fail them fast and clean rather than timing out.
await page.route("**/kytc-items", (r) => r.fulfill({ status: 503, body: "{}" }));
await page.route("**/kytc-notes", (r) => r.fulfill({ status: 503, body: "{}" }));
await page.route("**/kytc-lookup", (r) => r.fulfill({ status: 503, body: "{}" }));

async function open(tech, extraQuery = "") {
  const file = buildPage(tech);
  await page.goto(`file://${file}?mode=legacy&cid=${JOB.cid}&letting=${JOB.letting}&plant=${JOB.plant}${extraQuery}`);
  await page.waitForFunction(() => !!document.getElementById("drop"), null, { timeout: 20000 });
}

console.log("1. opening as johndoe, importing #404PA...");
try {
  await open(CONTRACTOR);
} catch (e) {
  console.log("OPEN FAILED. console/page errors:", JSON.stringify(errs, null, 2));
  console.log("page content snippet:", (await page.content()).slice(0, 2000));
  throw e;
}
await page.setInputFiles("#fileInput", MIXPACK);
await page.waitForFunction(() => document.querySelectorAll("#sections .section").length > 0, null, { timeout: 25000 });
await page.waitForTimeout(800);
console.log("   imported. checking mix signature on screen...");
const sig = await page.evaluate(() => (window.state && state.mix) ? state.mix : null);
console.log("   state.mix:", JSON.stringify(sig));

console.log("2. submitting...");
await page.click('#railnav .railstep[data-target="lot-status"], #railnav .railstep[data-target="status"]').catch(() => {});
await page.waitForTimeout(300);
const [dl1] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.locator("#advanceStage").first().click(),
]);
await dl1.saveAs(path.join(OUT, "submittal.pdf"));
console.log("   saved submittal.pdf");

console.log("3. reopening as reviewer, approving...");
await open(REVIEWER);
await page.setInputFiles("#fileInput", path.join(OUT, "submittal.pdf"));
await page.waitForFunction(() => document.querySelectorAll("#sections .section").length > 0, null, { timeout: 25000 });
await page.click('#railnav .railstep[data-target="status"]').catch(() => {});
await page.waitForTimeout(300);
await page.locator("#approvalSeq").fill("404");
await page.locator("#advanceStage").first().click();
await page.waitForTimeout(1500);
const [dl2] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.locator("#approvalPdfBtn").first().click(),
]);
await dl2.saveAs(path.join(OUT, "approval.pdf"));
console.log("   saved approval.pdf");

console.log("4. opening PlantBook on that approval...");
await open(CONTRACTOR, "&sublots=open");
await page.locator("#bookPlant").click();
await page.waitForTimeout(500);
await page.setInputFiles("#fileInput", path.join(OUT, "approval.pdf"));
await page.waitForFunction(() => !!document.querySelector('[data-section="lot"]'), null, { timeout: 25000 });
await page.waitForTimeout(800);
const jmf = await page.evaluate(() => {
  const d = typeof state !== "undefined" && state.lot && state.lot.values ? state.lot.values.design : null;
  return d;
});
console.log("   lot opened. design block:", JSON.stringify(jmf));

console.log("5. filling fabricated lot data...");
// NOTE: Playwright's locator .fill()/.selectOption() require the element to
// be VISIBLE, but PlantBook is a step wizard above 700px width - a field on
// a step that isn't active is display:none and those calls silently time
// out (and were being swallowed by a .catch() here, hiding the real bug).
// Raw DOM dispatch, same as the row cells below, works regardless of which
// step is showing.

// Fabricated but plausible weights, solved against this mix's real Gsb-blend
// (2.6705) and Gmm (~2.473-2.475) with volumetrics.mjs so Va lands near the
// 3.5% pay target rather than at a random number.
const FILL = () => {
  const set = (el, v) => {
    if (!el || el.readOnly || el.disabled) return;
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const rows = (key) => Array.from(document.querySelectorAll(`[data-rowlist="${key}"]`)).flatMap((l) => Array.from(l.children));
  const cell = (r, c) => r.querySelector(`[data-col="${c}"]`);

  set(document.querySelector('[data-field="lot_density_option"]'), "A");
  set(document.querySelector('[data-field="lot_handmix_binder_pct"]'), 5.9);

  rows("handmix_msg").forEach((r, i) => {
    set(cell(r, "wt_mix"), 2000 + i * 2);
    set(cell(r, "calibration"), 7400);
    set(cell(r, "final_wt"), i ? 8591.4 : 8591.3);
  });
  rows("sublot_bsg").forEach((r, i) => {
    const s = Math.floor(i / 2);
    set(cell(r, "wt_air"), i % 2 ? 4786.0 + s : 4785.0 + s);
    set(cell(r, "wt_water"), i % 2 ? 2780.5 + s * 0.5 : 2780.0 + s * 0.5);
    set(cell(r, "wt_ssd"), i % 2 ? 4784.5 + s : 4783.5 + s);
  });
  rows("sublot_msg").forEach((r, i) => {
    const s = Math.floor(i / 2);
    set(cell(r, "wt_mix"), i % 2 ? 2001 + s : 2000 + s);
    set(cell(r, "calibration"), 7400);
    set(cell(r, "final_wt"), i % 2 ? 8593.6 + s : 8591.9 + s);
  });
  rows("mat_cores").forEach((r, i) => {
    set(cell(r, "wt_air"), 1250);
    set(cell(r, "wt_water"), 700 + (i % 4) * 2);
    set(cell(r, "wt_ssd"), 1243 + (i % 4) * 2);
  });
  rows("joint_cores").forEach((r, i) => {
    set(cell(r, "wt_air"), 1250);
    set(cell(r, "wt_water"), 690 + (i % 2) * 3);
    set(cell(r, "wt_ssd"), 1244.9 + (i % 2) * 3);
  });
  // Contract 261118's line 0025 (this mix) is only 1,141 tons on the live pay
  // estimate - smaller than one 4,000-ton lot - so the demo lot is that short
  // final lot, and its dollar figures agree with the real contract.
  set(document.querySelector('[data-field="lot_tons"]'), 1141);
};
await page.evaluate(FILL);
await page.waitForTimeout(1000);

// Project items: the page's own lookup cannot reach KYTC from a file:// page,
// and a saved lot does NOT re-run it on reopen - so fetch the REAL answer from
// the live kytc-items function here and hand it to the page's own
// applyProjectItems(). Real KYTC data for contract 261118, nothing invented.
try {
  const r = await fetch(`https://kytcmix.netlify.app/.netlify/functions/kytc-items?cid=${JOB.cid}`);
  const live = await r.json();
  const applied = await page.evaluate((d) => {
    const res = applyProjectItems(d);
    if (typeof recompute === "function") recompute();
    return res;
  }, live);
  console.log("   project items:", applied && applied.text);
} catch (e) {
  console.log("   project items NOT loaded (live lookup failed):", e.message);
}
await page.waitForTimeout(500);

console.log("6. checking computed pay...");
await page.click('#railnav .railstep[data-target="pay"]').catch((e) => console.log("   pay step click failed:", e.message));
await page.waitForTimeout(800);
const verdict = await page.evaluate(() => {
  const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim().slice(0, 160) : null; };
  return { verdict: t(".prverdict .rvalue"), sub: t(".prverdict .rsub"),
           densityOption: (document.querySelector('[data-field="lot_density_option"]')||{}).value,
           handmixPct: (document.querySelector('[data-field="lot_handmix_binder_pct"]')||{}).value };
});
console.log("   verdict:", JSON.stringify(verdict));

console.log("7. downloading lot PDF + working copy...");
await page.click('#railnav .railstep[data-target="lot-status"]').catch(() => {});
await page.waitForTimeout(400);
const [dl3] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.locator("#lotPdfBtn").first().click(),
]);
await dl3.saveAs(path.join(OUT, "demo-lot-404.pdf"));
const [dl4] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.locator("#lotFileBtn").first().click(),
]);
await dl4.saveAs(path.join(OUT, "demo-lot-404.json"));
console.log("   saved demo-lot-404.pdf and demo-lot-404.json");

// What a contractor sees on the Submit step while amaw_lots.sql is unapplied -
// checked because it will be on screen in front of the task force.
await page.addStyleTag({ content: ".section,.section.active{animation:none!important;opacity:1!important}" });
await page.waitForTimeout(400);
const statusText = await page.evaluate(() => {
  const s = document.querySelector('[data-section="lot-status"]');
  return s ? s.innerText.replace(/\n{2,}/g, "\n").trim() : null;
});
console.log("8. Submit step as a contractor sees it:\n---\n" + statusText + "\n---");
await page.locator('[data-section="lot-status"]').screenshot({ path: path.join(OUT, "submit-step.png") });

console.log("errors so far:", errs.filter((e) => !/net::ERR_|favicon|CORS policy/.test(e)));
await browser.close();
console.log("DONE. Output in:", OUT);
