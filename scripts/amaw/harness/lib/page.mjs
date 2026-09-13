/* PlantBook regression harness — the browser side.
 *
 * This is the repo-committed descendant of the scratchpad's verify.mjs /
 * serve.mjs. Same launch path, same idea: rewrite designbook.html so it boots
 * with no network, drive it with Playwright, collect what it says.
 *
 * Why it exists at all: CLAUDE.md has PlantBook as a SECOND VIEW of
 * designbook.html ("DesignBook and PlantBook are two views of one page"),
 * sharing the renderer, the wizard and the styling. Splicing a second view
 * into a page whose layout facts were all measured rather than guessed is
 * exactly where the traps in CLAUDE.md's "DesignBook is two shapes" note come
 * back. The checks under ../checks/ are those traps written down; this file is
 * how they get a page to look at.
 *
 * Nothing here writes into the repo. The rewritten page goes to a temp dir.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { stubScript, LOGO_DIR } from "./stub.mjs";

const require_ = createRequire(import.meta.url);

/* HARNESS_PAGE exists so the suite can be pointed at a scratch copy — which
 * is how you prove a check still FAILS when it should. A harness nobody has
 * watched fail is a harness nobody knows works. */
export const PAGE = process.env.HARNESS_PAGE || "/home/user/Mix/public/designbook.html";

/* Identical to verify.mjs's launch path, on purpose — one browser build for
 * every measurement in this project, so a number in a check can be compared
 * with a number in the scratchpad probes it came from. */
export const CHROMIUM = process.env.PW_CHROMIUM ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/* Playwright is not a dependency of scripts/package.json (that file is
 * deliberately jsdom-only). Resolve it wherever it actually is, and hand back
 * null rather than throwing so run.mjs can SKIP the whole suite with a reason
 * instead of dying — a silent pass is the one result this harness must never
 * produce, and a stack trace is not a result. */
export function loadChromium() {
  const tries = [
    "playwright",
    "/opt/node22/lib/node_modules/playwright",
    process.env.HARNESS_PLAYWRIGHT,
  ].filter(Boolean);
  for (const t of tries) {
    try { return { chromium: require_(t).chromium, from: t }; } catch (_) { /* next */ }
  }
  return null;
}

/* pdf-lib / xlsx / fflate are CDN <script>s on the real page. Without them the
 * page still boots (every use is lazy), so the default is to drop the tags and
 * let the checks that need them skip. Point HARNESS_LIBS at a node_modules
 * that has them to turn those checks on. */
export function findLibs() {
  const roots = [
    process.env.HARNESS_LIBS,
    "/home/user/Mix/scripts/node_modules",
    "/home/user/Mix/node_modules",
  ].filter(Boolean);
  const want = {
    "pdf-lib": "pdf-lib/dist/pdf-lib.min.js",
    xlsx: "xlsx/dist/xlsx.full.min.js",
    fflate: "fflate/umd/index.js",
  };
  const found = {};
  for (const [name, rel] of Object.entries(want)) {
    for (const r of roots) {
      const p = path.join(r, rel);
      if (fs.existsSync(p)) { found[name] = p; break; }
    }
  }
  return found;
}

/* The page, rewritten for an offline browser.
 *
 * Everything removed here is removed rather than filtered out of the console
 * afterwards: "zero console errors" is only worth asserting if a failed CDN
 * fetch cannot be mistaken for one. The logo keeps pointing at the real file
 * so the appbar measures its true height — measureHeader() feeds --headh, and
 * every sticky offset on the page is derived from it. */
let cachedDir = null;
export function rewrittenPage(src = PAGE) {
  if (!cachedDir) cachedDir = fs.mkdtempSync(path.join(os.tmpdir(), "plantbook-harness-"));
  const libs = findLibs();
  const tag = (p) => `<script src="file://${p}"></script>`;
  let html = fs.readFileSync(src, "utf8")
    .replace(/<script[^>]*src="[^"]*supabase-js[^"]*"[^>]*><\/script>/, stubScript())
    .replace(/<script[^>]*src="[^"]*pdf-lib[^"]*"[^>]*><\/script>/, libs["pdf-lib"] ? tag(libs["pdf-lib"]) : "")
    .replace(/<script[^>]*src="[^"]*xlsx[^"]*"[^>]*><\/script>/, libs.xlsx ? tag(libs.xlsx) : "")
    .replace(/<script[^>]*src="[^"]*fflate[^"]*"[^>]*><\/script>/, libs.fflate ? tag(libs.fflate) : "")
    // Google Fonts: no network here, and a failed stylesheet is an error-level
    // console message that would have to be filtered back out again.
    .replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, "")
    // The logo, as a data: URI rather than a file:// path. The <img> would be
    // happy either way, but buildReviewPDF() FETCHES this same asset to embed
    // it, and Chromium refuses a fetch of a file:// URL from a file:// origin
    // - a CORS error on the console, which is the one thing the review-PDF
    // check measures besides the round trip itself. Rewriting the path does
    // not help; removing the fetch does. Same rule as the Google Fonts line
    // above: stop making the noise rather than widening IGNORE.
    .replace(/assets\/kytc-logo\.png/g, logoDataUri());
  const out = path.join(cachedDir, "page.html");
  fs.writeFileSync(out, html);
  return { file: out, libs };
}

/* A job that looks like the one #467PA came from, so a check that reaches the
 * contract lookup or the plant strip has real-shaped values to work with. */
export const JOB = { cid: "262120", letting: "2026-02-19", plant: "AMP070301" };

/* public/assets/kytc-logo.png, inlined. Read once - it is 8 KB and the page
 * is rewritten once per run. If it is missing, hand back a 1x1 transparent
 * PNG rather than throwing: a harness that cannot run because an image moved
 * is worse than one that measures a page with no logo on it, and every check
 * here is about layout and data rather than about the mark. */
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let logoCache = null;
function logoDataUri() {
  if (logoCache) return logoCache;
  try {
    const b = fs.readFileSync(path.join(LOGO_DIR, "kytc-logo.png"));
    return (logoCache = `data:image/png;base64,${b.toString("base64")}`);
  } catch (_) {
    return (logoCache = BLANK_PNG);
  }
}

/* Open designbook.html at one viewport and wait until the form is on screen.
 *
 * `canReview` picks which Status step renders: a contractor sees Submit, a
 * Central Office reviewer sees Approve and the two reviewer-only lookups. They
 * are different markup, so both are worth sweeping.
 */
export async function openPage(browser, { width = 1440, height = 1000, canReview = false, query = "" } = {}) {
  const { file } = rewrittenPage();
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await page.addInitScript((v) => { window.__HARNESS_CAN_REVIEW = v; }, canReview);
  const q = `?mode=new&cid=${JOB.cid}&letting=${JOB.letting}&plant=${JOB.plant}${query}`;
  await page.goto(`file://${file}${q}`);
  // Wait on a fact, not a timer: the sections exist only once enterForm() has
  // run renderForm(), and renderForm() ends in go() -> recompute().
  await page.waitForFunction(() => document.querySelectorAll("#sections .section").length > 0,
                             null, { timeout: 15000 });
  return { page, ctx, errs, close: async () => { await ctx.close(); } };
}

/* Console/page errors that are never the page's fault. Kept deliberately
 * short — see rewrittenPage(): the fix for a noisy console is to stop making
 * the noise, not to widen this list. */
const IGNORE = /net::ERR_|Failed to load resource|favicon/i;
export function realErrors(errs) { return errs.filter((e) => !IGNORE.test(e)); }
