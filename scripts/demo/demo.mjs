/* A demo film of the real site, driven through a real browser.
 *
 *   node demo.mjs          record (writes a .webm)
 *   node demo.mjs --dry    same path, short waits, no video
 *
 * Nothing here is a mock-up. It opens public/designbook.html - rewritten only
 * to stub Supabase and load the three CDN libraries from disk, exactly as the
 * regression harness does - and clicks it. Every figure on screen is the page
 * computing it from the real #467PA MixPack.
 *
 * Two identities, because the page enforces that a reviewer cannot approve
 * their own submission: a contractor builds and submits, KYTC opens the
 * submitted file and approves. That is a page reload in the film, which is
 * what it is in life - a different person, opening an emailed file.
 */
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { rewrittenPage, loadChromium, CHROMIUM } from "/home/user/Mix/scripts/amaw/harness/lib/page.mjs";
import { signingMaterial, submitterOf, encodeDigest, approvalNumbers } from "/home/user/Mix/netlify/lib/canonical.mjs";
import { CHROME_CSS, chromeScript } from "./chrome.mjs";

const HERE = "/tmp/claude-0/-home-user-Mix/c9cd3888-ef57-5ba4-8674-a56236907f1c/scratchpad/demo";
const OUT = path.join(HERE, "out");
const UP = "/root/.claude/uploads/c9cd3888-ef57-5ba4-8674-a56236907f1c";
const MIXPACK = `${UP}/4d1a0420-467PA.xlsm`;
const DRY = process.argv.includes("--dry");
const W = 1280, H = 800;
const S = DRY ? 0.1 : 1;
const ms = (n) => Math.max(20, Math.round(n * S));
const JOB = { cid: "262120", letting: "2026-02-19", plant: "AMP070301" };

/* Two stub identities, cut from the harness's one. The page reads
 * state.tech.can_review and state.tech.sm_id; everything else about the
 * offline stand-in is the harness's own. */
function pageFor(who) {
  const { file } = rewrittenPage();
  const html = fs.readFileSync(file, "utf8").replace(
    /var TECH = \{[^}]*\};/,
    `var TECH = ${JSON.stringify({ ...who, onboarded: true, user_id: "u1" })};`);
  const out = path.join(OUT, `page-${who.sm_id}.html`);
  fs.writeFileSync(out, html);
  return out;
}
const CONTRACTOR = { sm_id: "jcampbell", first_name: "Jacob", last_name: "Campbell", company: "Allen", can_review: false };
const REVIEWER = { sm_id: "adenmark", first_name: "Andrew", last_name: "Denmark", company: "KYTC", can_review: true };

/* ---------- the director ------------------------------------------------ */
function director(page) {
  const wait = (n) => page.waitForTimeout(ms(n));
  const D = {
    wait,
    page: () => page,
    async caption(html, hold = 0) {
      await page.evaluate((h) => window.__dm.caption(h), html);
      if (hold) await wait(hold);
    },
    async clearCaption() { await page.evaluate(() => window.__dm.caption(null)); },
    async title(kicker, t, s, hold = 3000) {
      await page.evaluate(([k, tt, ss]) => window.__dm.title(k, tt, ss), [kicker, t, s]);
      await wait(hold);
      await page.evaluate(() => window.__dm.untitle());
      await wait(650);
    },
    async spot(sel, pad = 8, hold = 0) {
      const ok = await page.evaluate(([s, p]) => {
        const e = document.querySelector(s); if (!e) return false; window.__dm.spot(e, p); return true;
      }, [sel, pad]);
      if (!ok) console.log(`      (no spot ${sel})`);
      if (hold) await wait(hold);
    },
    async unspot() { await page.evaluate(() => window.__dm.spot(null)); },
    async center(sel, dur = 900, bias = 0.34) {
      const ok = await page.evaluate(([s, d, b]) => {
        if (!document.querySelector(s)) return false; window.__dm.center(s, d, b); return true;
      }, [sel, ms(dur), bias]);
      if (!ok) console.log(`      (no center ${sel})`);
      await wait(dur + 120);
    },
    async scroll(y, dur = 800) {
      await page.evaluate(([v, d]) => window.__dm.scrollTo(v, d), [y, ms(dur)]);
      await wait(dur + 100);
    },
    async point(sel, settle = 820) {
      const r = await page.evaluate((s) => window.__dm.rect(s), sel);
      if (!r) throw new Error(`point: no ${sel}`);
      await page.evaluate(([x, y]) => window.__dm.move(x, y), [r.x, r.y]);
      await wait(settle);
    },
    async click(sel, { settle = 820, after = 500, timeout = 20000 } = {}) {
      await D.point(sel, settle);
      await page.evaluate(() => window.__dm.press());
      await wait(200);
      await page.locator(sel).first().click({ timeout });
      await wait(after);
    },
    async type(sel, text, { settle = 620 } = {}) {
      await D.point(sel, settle);
      await page.evaluate(() => window.__dm.press());
      await page.locator(sel).first().click({ timeout: 20000 });
      await page.locator(sel).first().type(text, { delay: ms(95) });
      await wait(260);
    },
    async park() { await page.evaluate(() => window.__dm.park()); },
    async step(id, opts = {}) { await D.click(`#railnav .railstep[data-target="${id}"]`, { after: 800, ...opts }); },
    async dress() {
      await page.addStyleTag({ content: CHROME_CSS + "\n.section,.section.active{animation:none!important;opacity:1!important}" });
      await page.evaluate(chromeScript());
    },
  };
  return D;
}

/* ---------- the film ---------------------------------------------------- */
const SCENES = [];
const scene = (name, fn) => SCENES.push({ name, fn });

scene("title", async (p, D) => {
  await D.title("Kentucky Transportation Cabinet", "Mix",
    "DesignBook and PlantBook &mdash; one site, replacing two Excel workbooks.", 3600);
});

scene("import", async (p, D) => {
  await D.caption("A mix design starts life as a <em>MixPack</em> workbook.", 2000);
  await D.point("#drop", 900);
  await D.caption("DesignBook reads the one you already have.", 1400);
  await p.evaluate(() => window.__dm.press());
  await p.setInputFiles("#fileInput", MIXPACK);
  await D.park();
  await p.waitForFunction(() => document.querySelectorAll("#sections .section").length > 0, null, { timeout: 25000 });
  await D.wait(900);
  await D.caption("55 fields, the blend, the four trial points &mdash; read straight out of it.", 2800);
});

scene("tinted", async (p, D) => {
  await D.caption("What it read is <em>tinted</em>. A value off a file is a starting point, never an authority.", 600);
  await D.center(".section.active .grid", 800, 0.26);
  await D.spot('[data-field="county"]', 6, 800);
  await D.spot('[data-field="nominal_size"]', 6, 800);
  await D.spot('[data-field="binder_grade"]', 6, 1000);
  await D.unspot();
  await D.wait(500);
});

scene("blend", async (p, D) => {
  await D.caption("The aggregate blend, every producer resolved by its KYTC number.", 0);
  await D.step("aggregate");
  await D.center('[data-rowlist="aggregate"]', 900, 0.22);
  await D.wait(2800);
});

scene("compute", async (p, D) => {
  await D.caption("Four gyratory trial points.", 0);
  await D.step("fourpoint");
  await D.center("#fpchart", 900, 0.2);
  await D.wait(2600);
  await D.caption("Every design value is <em>computed</em> from them. None of it is typed.", 0);
  await D.step("design-values");
  await D.center(".section.active .dvtable", 900, 0.24);
  await D.wait(3000);
});

scene("submit", async (p, D) => {
  await D.caption("The contractor submits it to KYTC.", 0);
  await D.step("status");
  await D.center("#timeline", 800, 0.2);
  await D.wait(800);
  const [dl] = await Promise.all([
    p.waitForEvent("download", { timeout: 30000 }),
    D.click("#advanceStage", { after: 1600 }),
  ]);
  await dl.saveAs(path.join(OUT, "submittal.pdf"));
  await D.center("#saveMsg", 700, 0.42);
  await D.wait(2600);
});

scene("handover", async (p, D) => {
  await D.title("", "The file <em>is</em> the record.",
    "Nothing is stored on the site. The submittal PDF carries the whole design inside it.", 3600);
});

scene("approve", async (p, D) => {
  await D.caption("At KYTC, a reviewer opens the file they were emailed.", 1800);
  await D.point("#drop", 800);
  await p.evaluate(() => window.__dm.press());
  await p.setInputFiles("#fileInput", path.join(OUT, "submittal.pdf"));
  await D.park();
  await p.waitForFunction(() => document.querySelectorAll("#sections .section").length > 0, null, { timeout: 25000 });
  await D.wait(1000);
  await D.caption("The form comes back exactly as it was sent.", 2400);
  await D.step("status");
  await D.center("#approvalBox", 800, 0.3);
  await D.caption("KYTC types its approval number, and signs.", 0);
  await D.type("#approvalSeq", "467");
  await D.click("#advanceStage", { after: 2400 });
  await D.caption("Approved as <em>#467</em> &mdash; MIX ID 00260467, with a verification code.", 0);
  await D.center("#saveMsg", 700, 0.4);
  await D.spot("#saveMsg", 8, 3400);
  await D.unspot();
});

scene("approval-pdf", async (p, D) => {
  await D.caption("The approval is <em>signed</em>, and checkable by anyone holding the file.", 0);
  const [dl] = await Promise.all([
    p.waitForEvent("download", { timeout: 30000 }),
    D.click("#approvalPdfBtn", { after: 900 }),
  ]);
  await dl.saveAs(path.join(OUT, "approval.pdf"));
  await D.wait(1200);
});

scene("plantbook-title", async (p, D) => {
  await D.clearCaption();
  await D.title("PlantBook", "The lot begins where the design <em>ended</em>.",
    "4,000 tons off the plant, measured against the approval KYTC just issued.", 3400);
});

scene("open-lot", async (p, D) => {
  await D.caption("PlantBook opens on that same approval.", 0);
  await D.click("#bookPlant", { after: 1200 });
  await D.point("#drop", 800);
  await p.evaluate(() => window.__dm.press());
  await p.setInputFiles("#fileInput", path.join(OUT, "approval.pdf"));
  await D.park();
  await p.waitForFunction(() => !!document.querySelector('[data-section="lot"]'), null, { timeout: 25000 });
  await D.wait(1200);
  await D.caption("Contract, plant, mix, blend and Gsb all arrive with it. Nothing is retyped.", 0);
  await D.center(".section.active .grid", 800, 0.26);
  await D.wait(3000);
});

scene("weights", async (p, D) => {
  await D.caption("On the plant, a technician types what the bench sheet says.", 0);
  await D.step("sublot-1");
  await D.center('[data-rowlist="sublot_bsg"]', 900, 0.2);
  await D.wait(700);
  const sel = (c) => `[data-rowlist="sublot_bsg"] > *:nth-child(1) [data-col="${c}"]`;
  await D.type(sel("wt_air"), "4785.2");
  await D.type(sel("wt_water"), "2771.4");
  await D.type(sel("wt_ssd"), "4793.6");
  await D.park();
  await D.caption("The volumetrics compute themselves, the way the workbook does.", 0);
  await D.spot(sel("bsg"), 6, 1800);
  await D.unspot();
  await D.wait(400);
});

scene("fill", async (p, D) => {
  await D.caption("&hellip; and the rest of the lot, sublot by sublot.", 0);
  for (const part of ["handmix", "bsg", "msg", "moisture", "cores", "tons"]) {
    await p.evaluate(FILL_LOT, part);
    await D.wait(420);
  }
  await D.center('[data-rowlist="sublot_volumetrics"]', 900, 0.26);
  await D.wait(2200);
});

scene("pay", async (p, D) => {
  await D.caption("Then <em>Lot Pay</em>: what the lot earns, and why.", 0);
  await D.step("pay");
  await D.scroll(0, 600);
  await D.center(".prverdict", 800, 0.16);
  await D.wait(2800);
  await D.caption("Every property, its weight, and what it cost.", 0);
  await D.center("#payReadout .payx-list", 900, 0.2);
  await D.wait(2600);
  await D.caption("Click a line and it says <em>why</em>.", 0);
  await D.click('#payReadout details[data-key="prop.av"] > summary', { after: 1200 });
  await D.center('#payReadout details[data-key="prop.av"]', 800, 0.16);
  await D.wait(3200);
  await D.caption("Click a sublot and it shows the <em>weighings</em> behind it.", 0);
  await D.click('#payReadout details[data-key="sub.av.1"] > summary', { after: 1300 });
  await D.center('#payReadout details[data-key="sub.av.1"] .payx-body', 800, 0.18);
  await D.wait(4000);
});

scene("money", async (p, D) => {
  await D.caption("Down to the dollars, with the arithmetic written out.", 0);
  await p.evaluate(() => {
    document.querySelectorAll("#payReadout details[open]").forEach((d) => { d.open = false; });
    ["final", "money"].forEach((k) => {
      const d = document.querySelector(`#payReadout details[data-key="${k}"]`); if (d) d.open = true;
    });
  });
  await D.wait(700);
  await D.center('#payReadout details[data-key="money"]', 800, 0.28);
  await D.wait(3400);
});

scene("medl", async (p, D) => {
  /* The lot's project-items lookup fires on opening and reaches
   * transportation.ky.gov. This film runs with no network, so it leaves a
   * red "couldn't read the contract's items" note that is an artefact of the
   * recording rather than anything the site does in production. Cleared
   * rather than filmed - and no KYTC data is invented in its place. */
  await p.evaluate(() => { if (window.state && state.notes) { state.notes.items = null; paintItemsNote(); } });
  await D.caption("KYTC turns the finished lot into the workbook MEDL loads.", 0);
  await D.step("lot-status");
  await D.center(".handoff", 800, 0.3);
  await D.wait(900);
  await D.spot("#amawBtn", 8, 2800);
  await D.unspot();
  await D.wait(400);
});

scene("close", async (p, D) => {
  await D.clearCaption();
  await D.wait(600);
  await D.title("", "kytcmix<em>.netlify.app</em>",
    "DesignBook &middot; PlantBook &middot; for every asphalt producer in Kentucky.", 4200);
});

/* The rest of the lot, typed the way the harness types it - the page
 * computing from real weights, just faster than a person. */
const FILL_LOT = (part) => {
  const set = (el, v) => {
    if (!el || el.readOnly || el.disabled) return;
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const rows = (k) => Array.from(document.querySelectorAll(`[data-rowlist="${k}"]`)).flatMap((l) => Array.from(l.children));
  const cell = (r, c) => r.querySelector(`[data-col="${c}"]`);
  const want = (k) => !part || part === k;
  if (want("handmix")) {
  set(document.querySelector('[data-field="lot_handmix_binder_pct"]'), 5.9);
  rows("handmix_msg").forEach((r, k) => {
    set(cell(r, "wt_mix"), 2000 + k * 10); set(cell(r, "calibration"), 7400);
    set(cell(r, "final_wt"), k ? 8599.8 : 8593.8);
  }); }
  if (want("bsg")) {
  const water = [2771.4, 2755.0, 2771.4, 2785.0];
  rows("sublot_bsg").forEach((r, k) => {
    const s = Math.floor(k / 2);
    set(cell(r, "wt_air"), k % 2 ? 4790.1 : 4785.2);
    set(cell(r, "wt_water"), water[s] + (k % 2 ? 1.6 : 0));
    set(cell(r, "wt_ssd"), k % 2 ? 4797.9 : 4793.6);
  }); }
  if (want("msg")) {
  rows("sublot_msg").forEach((r, k) => {
    set(cell(r, "wt_mix"), k % 2 ? 2005 : 2000); set(cell(r, "calibration"), 7400);
    set(cell(r, "final_wt"), k % 2 ? 8593.4 : 8590.0);
  }); }
  if (want("moisture")) {
  rows("sublot_moisture").forEach((r, k) => {
    set(cell(r, "wt_before"), 1500); set(cell(r, "wt_after"), k === 2 ? 1489 : 1492); set(cell(r, "wt_pan"), 300);
  }); }
  if (want("cores")) {
  const lane = [720.0, 712.0, 705.0, 700.0];
  rows("mat_cores").forEach((r, k) => {
    set(cell(r, "wt_air"), 1250); set(cell(r, "wt_water"), lane[k % 4]); set(cell(r, "wt_ssd"), 1255);
  });
  rows("joint_cores").forEach((r, k) => {
    set(cell(r, "wt_air"), 1250); set(cell(r, "wt_water"), k % 2 ? 700 : 690); set(cell(r, "wt_ssd"), 1255);
  }); }
  if (want("tons")) set(document.querySelector('[data-field="lot_tons"]'), 4000);
};

/* ---------- run --------------------------------------------------------- */
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = loadChromium();
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, acceptDownloads: true,
  ...(DRY ? {} : { recordVideo: { dir: OUT, size: { width: W, height: H } } }),
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e));
page.on("dialog", (d) => d.accept());

/* The one server call the film makes is the approval signature. The real
 * Function is netlify/functions/sign-approval.mjs and its numbering and
 * signing live in netlify/lib/canonical.mjs, imported and run here for real
 * against the design on screen. What is stood in for is the production
 * signing key and the Supabase auth check - the same offline stand-in the
 * regression harness makes for the database. The MIX ID, the #467PA and the
 * verification code are all computed from the bytes of the design. */
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

const D = director(page);
async function open(who) {
  await page.goto(`file://${pageFor(who)}?mode=legacy&cid=${JOB.cid}&letting=${JOB.letting}&plant=${JOB.plant}`);
  await page.waitForFunction(() => !!document.getElementById("drop"), null, { timeout: 20000 });
  await D.dress();
  await page.waitForTimeout(ms(500));
}

await open(CONTRACTOR);
for (let i = 0; i < SCENES.length; i++) {
  const t0 = Date.now();
  try {
    if (SCENES[i].name === "approve") await open(REVIEWER);   // the file changes hands
    await SCENES[i].fn(page, D);
    console.log(`  ok   ${String(i).padStart(2)} ${SCENES[i].name.padEnd(16)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`  FAIL ${String(i).padStart(2)} ${SCENES[i].name.padEnd(16)} ${String(e).split("\n")[0].slice(0, 130)}`);
    break;
  }
}
const shown = await page.evaluate(() => {
  const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim().slice(0, 90) : null; };
  return { verdict: t(".prverdict .rvalue"), sub: t(".prverdict .rsub"),
           cards: Array.from(document.querySelectorAll(".paygrid .fp-card")).map((c) => c.textContent.trim().replace(/\s+/g, " ")) };
});
console.log("on screen:", JSON.stringify(shown));
if (errs.length) console.log("page errors:", errs.slice(0, 3));
await page.waitForTimeout(ms(400));
const vid = DRY ? null : await page.video().path();
await ctx.close();
if (vid) console.log("video:", vid, (fs.statSync(vid).size / 1e6).toFixed(1) + " MB");
await browser.close();
