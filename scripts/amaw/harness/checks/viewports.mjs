/* CHECK 1 — the standing viewport sweep.
 *
 * WHAT IT DEFENDS (all from CLAUDE.md):
 *  - "A @media block does not beat a later rule of the same specificity." The
 *    dead override read as working in the source and only a measurement found
 *    it. Same family: the inline grid-template-columns note ("cannot be
 *    overridden by a media query without !important") and the .box / .rowitem
 *    .box two-class trap. All three are invisible in a diff and obvious in a
 *    measurement.
 *  - "Check a restyle with documentElement.scrollWidth at 390px, never by eye."
 *  - "check for clipping by comparing each input's scrollWidth to its
 *    clientWidth rather than by eye."
 *  - "The internal breakpoints above 1240px all had to be recalibrated, and
 *    the reason generalises" — hence the 1244/1243 and 1240 pair, and 1100/
 *    1099 and 701/700: each is a breakpoint and the pixel on either side of
 *    it, so a rule that moved is caught rather than straddled.
 *  - "a measurement or a focus inside a hidden step silently returns zero or
 *    no-ops, so any check written against the wizard has to go(i) first and
 *    measure only .section.active." The sweep does exactly that, AND asserts
 *    the active section had a real height — a sweep that measured nothing is
 *    the failure mode this check exists to make impossible.
 *
 * The form is FILLED before measuring. A blank design clips nothing; the
 * clipping CLAUDE.md records was measured with a real design in the page, and
 * the long producer names in the stub are there to reproduce it.
 */
import { fillForm } from "../lib/inpage.mjs";
import { withBook } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";

export const id = "viewports";

/* The standing sweep. Do not thin this list: each width is either a
 * breakpoint named in CLAUDE.md or the pixel beside one. */
export const WIDTHS = [1500, 1440, 1366, 1244, 1243, 1240, 1100, 1099, 1000, 900, 800, 701, 700, 560, 390, 360];

/* Clipping the project has looked at and accepted. CLAUDE.md, on 390px:
 * "What still clips at 390px is two genuinely long strings (a producer name
 * at 387px, the RAP note) and no layout fixes that — the combo popup and the
 * title attribute are the answer there." An entry here needs that kind of
 * sentence behind it; it is not a place to park a new failure. */
export const ACCEPTED_CLIP = {
  390: ["producer", "rap_note"],
  360: ["producer", "rap_note"],
};

export async function run({ browser, results, books }) {
  for (const book of books) {
    let skippedOnce = false;
    for (const width of WIDTHS) {
      const out = await withBook(browser, book, { width, height: 900 }, async ({ page, errs }) => {
        await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
        await page.waitForTimeout(120);
        const r = await page.evaluate(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const n = topSections().length;
          let scroll = 0, clipped = [], measured = 0, deadSteps = [];
          for (let i = 0; i < n; i++) {
            go(i, null, false);
            await sleep(30);
            const active = document.querySelector(".section.active");
            if (!active) continue;
            const h = active.getBoundingClientRect().height;
            // A hidden step reports zero and would let every measurement
            // inside it pass by measuring nothing at all.
            if (h <= 0) { deadSteps.push(active.dataset.section); continue; }
            measured++;
            active.querySelectorAll("[data-field], [data-col], [data-fp], [data-pr]").forEach((el) => {
              if (el.scrollWidth > el.clientWidth + 1) {
                clipped.push((el.dataset.field || el.dataset.col || el.dataset.fp || el.dataset.pr) +
                             `(${el.scrollWidth}>${el.clientWidth})`);
              }
            });
            scroll = Math.max(scroll, document.documentElement.scrollWidth);
          }
          return { scroll, clipped: Array.from(new Set(clipped)), measured, deadSteps,
                   steps: n, headH: Math.round(document.querySelector(".appbar").getBoundingClientRect().height) };
        });
        return { r, errs: realErrors(errs) };
      });

      if (out.skipped) {
        // One skip line per book, not sixteen — the reason is the same every
        // time and a wall of identical skips hides the rest of the table.
        if (!skippedOnce) { results.skip(id, book.label, `all ${WIDTHS.length} widths`, out.skipped); skippedOnce = true; }
        continue;
      }
      const { r, errs } = out.value;
      const tag = `${width}px`;
      results.ok(id, book.label, `${tag} no sideways scroll`, r.scroll <= width,
                 `scrollWidth ${r.scroll} vs viewport ${width}`);
      const accepted = ACCEPTED_CLIP[width] || [];
      const bad = r.clipped.filter((c) => !accepted.some((a) => c.startsWith(a)));
      results.ok(id, book.label, `${tag} no input clips`, bad.length === 0,
                 bad.length ? bad.join(" ") : `${r.clipped.length} accepted, 0 new`);
      results.ok(id, book.label, `${tag} every step measured`, r.deadSteps.length === 0 && r.measured > 0,
                 `${r.measured}/${r.steps} steps had a live .section.active` +
                 (r.deadSteps.length ? ` — zero-height: ${r.deadSteps.join(",")}` : ""));
      results.ok(id, book.label, `${tag} clean console`, errs.length === 0, errs.slice(0, 2).join(" | ") || "0 errors");
    }
  }
}
