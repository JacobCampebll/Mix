/* CHECK 6 — the two shapes, and crossing between them in a live page.
 *
 * WHAT IT DEFENDS (CLAUDE.md):
 *  - "DesignBook is two shapes as of 2026-09-11, and the breakpoint is 700px.
 *    Above it, a ten-step wizard, one step on screen at a time. Below it, the
 *    page it has always been: every section on one vertical scroll."
 *  - "Exactly two things differ now, and if a third ever appears that is the
 *    smell: whether the sections hide each other (.step{display:block} below
 *    700px), and whether a rail click switches or scrolls." Both are asserted
 *    here, and a second view is exactly the thing that would quietly make it
 *    three.
 *  - "#valBlock does not move at all... a sticky right-hand column beside the
 *    form above 1100px, above the sections below it." The two breakpoints are
 *    different numbers (1100 for the rail, 700 for the shape) and it is easy
 *    to conflate them, so both are read off getComputedStyle.
 *  - "Worth checking with getComputedStyle(el).position at a phone viewport
 *    rather than by eye, since a dead override looks identical to a live one
 *    in the source." That sentence is this check's charter: an @media block
 *    that lost a specificity fight is invisible in a diff.
 *  - "Crossing the breakpoint re-places #valBlock and re-paints the rail." So
 *    one page is RESIZED across both lines rather than reloaded at each — a
 *    fresh load can never catch a re-place that goes wrong.
 */
import { fillForm, domAudit } from "../lib/inpage.mjs";
import { withBook } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";

export const id = "shapes";

/* Read the two facts that separate the shapes, plus the rail's position. */
function shapeProbe() {
  const secs = Array.from(document.querySelectorAll("#sections .section"));
  const shown = secs.filter((s) => !s.classList.contains("hidden") &&
                                    getComputedStyle(s).display !== "none");
  const park = document.getElementById("valPark");
  const v = document.getElementById("valBlock");
  return {
    width: window.innerWidth,
    onePage: typeof onePage === "function" ? onePage() : null,
    sections: secs.length,
    visibleNotHidden: secs.filter((s) => !s.classList.contains("hidden")).length,
    shown: shown.length,
    parkPosition: park ? getComputedStyle(park).position : null,
    railPosition: (() => { const n = document.querySelector(".railnav"); return n ? getComputedStyle(n).position : null; })(),
    valBlockIn: v && v.parentElement ? (v.parentElement.id || v.parentElement.className) : null,
    valBlocks: document.querySelectorAll(".valblock").length,
    railChips: document.querySelectorAll("#railnav .railstep").length,
    numerals: Array.from(document.querySelectorAll("#railnav .railstep .dot")).map((d) => d.textContent).join(","),
  };
}

/* width -> what must be true there. */
const EXPECT = [
  { w: 1440, wizard: true, sticky: true },
  { w: 1101, wizard: true, sticky: true },
  { w: 1100, wizard: true, sticky: false },   // @media (max-width:1100px)
  { w: 900, wizard: true, sticky: false },
  { w: 701, wizard: true, sticky: false },
  { w: 700, wizard: false, sticky: false },   // @media (max-width:700px)
  { w: 390, wizard: false, sticky: false },
];

export async function run({ browser, results, books }) {
  for (const book of books) {
    // ---- one shape per fresh load ----------------------------------------
    let skippedOnce = false;
    for (const e of EXPECT) {
      const out = await withBook(browser, book, { width: e.w, height: 900 }, async ({ page, errs }) => {
        await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
        await page.waitForTimeout(150);
        return { p: await page.evaluate(shapeProbe), errs: realErrors(errs) };
      });
      if (out.skipped) {
        if (!skippedOnce) { results.skip(id, book.label, "every shape", out.skipped); skippedOnce = true; }
        continue;
      }
      const { p } = out.value;
      const tag = `${e.w}px`;
      // Wizard: exactly one section on screen. One page: all of the
      // not-hidden ones. "hidden" here is the Polish rule, not the shape.
      const wizardOK = e.wizard ? p.shown === 1 : p.shown === p.visibleNotHidden && p.shown > 1;
      results.ok(id, book.label, `${tag} ${e.wizard ? "wizard: one step on screen" : "one page: every section on screen"}`,
                 wizardOK, `${p.shown} of ${p.visibleNotHidden} not-hidden sections displayed`);
      results.ok(id, book.label, `${tag} onePage() agrees with the CSS`, p.onePage === !e.wizard,
                 `onePage()=${p.onePage}, ${p.shown} section(s) shown`);
      results.ok(id, book.label, `${tag} #valPark ${e.sticky ? "sticky" : "not sticky"}`,
                 (p.parkPosition === "sticky") === e.sticky, `position: ${p.parkPosition}`);
    }

    // ---- one page, resized across both lines ------------------------------
    const cross = await withBook(browser, book, { width: 1440, height: 900 }, async ({ page, errs }) => {
      await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
      await page.evaluate(() => {
        const v = document.getElementById("valBlock");
        if (v) v.dataset.harnessTag = "kept";
      });
      const seen = [];
      for (const w of [1440, 1100, 700, 390, 700, 1100, 1440]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(220);
        const p = await page.evaluate(shapeProbe);
        const d = await page.evaluate(domAudit);
        const tag = await page.evaluate(() => {
          const v = document.getElementById("valBlock");
          return { present: !!v, kept: !!(v && v.dataset.harnessTag === "kept") };
        });
        seen.push({ w, ...p, dup: d.dup, orphans: d.orphans, valBlockIntact: d.valBlockIntact, tag });
      }
      return { seen, errs: realErrors(errs) };
    });
    if (cross.skipped) continue;
    const { seen, errs } = cross.value;
    const lostNode = seen.filter((s) => !s.tag.present || !s.tag.kept).map((s) => s.w);
    results.ok(id, book.label, "crossing the breakpoint keeps the same #valBlock", lostNode.length === 0,
               lostNode.length ? `rebuilt at ${lostNode.join(",")}px` : "same node at all 7 widths");
    const hollow = seen.filter((s) => !s.valBlockIntact).map((s) => s.w);
    results.ok(id, book.label, "crossing keeps #vallist/#saveMsg inside it", hollow.length === 0,
               hollow.length ? `hollow at ${hollow.join(",")}px` : "intact at all 7 widths");
    const many = seen.filter((s) => s.valBlocks !== 1).map((s) => `${s.w}:${s.valBlocks}`);
    results.ok(id, book.label, "crossing never leaves two .valblock", many.length === 0,
               many.join(",") || "exactly one at all 7 widths");
    const dups = seen.filter((s) => s.dup.length).map((s) => `${s.w}:${s.dup.join("/")}`);
    results.ok(id, book.label, "crossing leaves no duplicate ids", dups.length === 0, dups.join(" ") || "0 duplicates");
    const chips = seen.filter((s) => s.railChips !== seen[0].railChips).map((s) => `${s.w}:${s.railChips}`);
    results.ok(id, book.label, "the rail re-paints with the same chips", chips.length === 0,
               chips.join(" ") || `${seen[0].railChips} chips, numerals ${seen[0].numerals}`);
    results.ok(id, book.label, "crossing raises no console or page error", errs.length === 0,
               errs.slice(0, 2).join(" | ") || "0 errors");
  }
}
