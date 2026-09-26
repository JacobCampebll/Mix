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
import { loadBaseline, saveBaseline, keyOf } from "../lib/baseline.mjs";

export const id = "viewports";

/* The standing sweep. Do not thin this list: each width is either a
 * breakpoint named in CLAUDE.md or the pixel beside one. */
export const WIDTHS = [1500, 1440, 1366, 1244, 1243, 1240, 1100, 1099, 1000, 900, 800, 701, 700, 560, 390, 360];

/* Per-input clipping is compared against baseline/clipping.json rather than
 * against zero — see lib/baseline.mjs for why, and for how to re-bless it.
 * The page-level scrollWidth assertion below is absolute and has no baseline:
 * a page that scrolls sideways is a bug at every width, every time. */

export async function run({ browser, results, books, bless }) {
  const baseline = loadBaseline();
  const fresh = { generatedAt: new Date().toISOString(), books: {} };
  for (const book of books) {
    let skippedOnce = false;
    for (const width of WIDTHS) {
      const out = await withBook(browser, book, { width, height: 900 }, async ({ page, errs }) => {
        await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
        await page.waitForTimeout(120);
        const r = await page.evaluate(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const n = topSections().length;
          let scroll = 0, clipped = [], measured = 0, deadSteps = [], misaligned = [];
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
              let need = el.scrollWidth, have = el.clientWidth;
              // A native date or time picker NEVER reports its own overflow:
              // Chromium gives scrollWidth === clientWidth however far its
              // fields are clipped (measured 2026-09-26), so a scrollWidth
              // test passes a squeezed one by measuring nothing. Its need is its
              // intrinsic width instead - a clone at width:auto in the same
              // cell, so the same row-box CSS applies - against its own box.
              if (el.type === "date" || el.type === "time") {
                const c = el.cloneNode(true);
                c.style.cssText = "position:absolute; visibility:hidden; width:auto; left:0; top:0";
                el.parentElement.appendChild(c);
                need = c.offsetWidth; have = el.offsetWidth;
                c.remove();
              }
              if (need > have + 1) {
                clipped.push((el.dataset.field || el.dataset.col || el.dataset.fp || el.dataset.pr) +
                             `(${need}>${have})`);
              }
            });
            /* EVERY COLUMN HEADING OVER ITS OWN VALUES.
             *
             * A repeating table is a header strip and a row strip, two grids,
             * sharing one `.rowscroll`. Sharing a scroller makes them scroll
             * together; it never made them agree about where a column IS.
             * With `min-width:max-content` on each separately they sized their
             * own tracks from their own content - the header from its labels,
             * the rows from their values - so the moment the scroller was
             * narrower than either, they drifted. Found 2026-09-13 while
             * screenshotting a filled lot for KYTC: EVERY repeating table in
             * BOTH books was out, 7px to 969px, at every width from 800 to
             * 1500, and a technician was reading values under the wrong
             * headings.
             *
             * Nothing else here could see it. Clipping compares an input to
             * its own box; page scroll is a page-level figure; the round trip
             * only reads values. A heading in the wrong place is correct data
             * displayed wrongly, which is exactly the shape this harness
             * exists to catch and did not. So: compare each header cell's
             * left edge to the cell below it, and allow 2px for rounding. */
            active.querySelectorAll(".rowscroll").forEach((sc) => {
              const head = sc.querySelector(".rowhead"), list = sc.querySelector(".rowlist");
              const row = list && list.firstElementChild;
              if (!head || !row) return;
              // Below 700px `.rowhead` is display:none - the rows are cards
              // with their own inline labels and there is no header strip to
              // line anything up with. Comparing zero-size cells there
              // reported every table as misaligned by hundreds of pixels,
              // which was this check being wrong rather than the page. Ask
              // whether the header is actually laid out, not what the
              // viewport is: the breakpoint is the stylesheet's business.
              if (!head.getClientRects().length) return;
              const L = (el) => Math.round(el.getBoundingClientRect().left);
              /* A `hidden` column (2026-09-15, AGG_BLEND_SPEC's own `sublot`
               * on the per-sublot tabs) is handled two different ways on
               * purpose: rowHeadHTML() leaves the header cell out entirely
               * while rowHTML() keeps the row cell and gives it
               * `display:none`. That is not an inconsistency - a display:none
               * grid item is removed from auto-placement, so both children
               * still place the same VISIBLE cells into the same tracks, and
               * measured at 1500px they do: 67,138,470,610,818,920,1032 on
               * each. Comparing raw child counts reported "7 headings over 8
               * cells" on a table that is perfectly aligned - the check being
               * wrong rather than the page, the same way it was for the <700px
               * card mode. Compare what is actually laid out. */
              const shown = (el) => getComputedStyle(el).display !== "none";
              const hs = Array.from(head.children).filter(shown).map(L),
                    rs = Array.from(row.children).filter(shown).map(L);
              let worst = 0;
              for (let k = 0; k < Math.min(hs.length, rs.length); k++)
                worst = Math.max(worst, Math.abs(hs[k] - rs[k]));
              if (hs.length !== rs.length)
                misaligned.push(`${list.dataset.rowlist}(${hs.length} headings over ${rs.length} cells)`);
              else if (worst > 2) misaligned.push(`${list.dataset.rowlist}(${worst}px)`);
            });

            scroll = Math.max(scroll, document.documentElement.scrollWidth);
          }
          return { scroll, clipped: Array.from(new Set(clipped)),
                   misaligned: Array.from(new Set(misaligned)), measured, deadSteps,
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
      // Absolute, with no baseline: a heading that is not over its own column
      // is never acceptable at any width, however long it has been that way.
      results.ok(id, book.label, `${tag} every column heading sits over its values`,
                 r.misaligned.length === 0,
                 r.misaligned.length ? r.misaligned.join(" ") : "all row tables aligned");

      const keys = Array.from(new Set(r.clipped.map(keyOf))).sort();
      (fresh.books[book.label] = fresh.books[book.label] || {})[width] = keys;
      if (bless) {
        results.pass(id, book.label, `${tag} clipping recorded`, keys.length ? keys.join(" ") : "nothing clips");
      } else {
        const known = ((baseline && baseline.books[book.label]) || {})[String(width)];
        if (!known) {
          results.skip(id, book.label, `${tag} no NEW input clips`,
                       "no baseline for this width — run with --bless once, read the diff, then commit it");
        } else {
          const added = keys.filter((k) => !known.includes(k));
          const gone = known.filter((k) => !keys.includes(k));
          const note = `${keys.length} clip, baseline ${known.length}` +
                       (gone.length ? ` — ${gone.join(",")} no longer clip, re-bless to tighten` : "");
          results.ok(id, book.label, `${tag} no NEW input clips`, added.length === 0,
                     added.length ? "NEW: " + added.join(" ") : note);
        }
      }
      results.ok(id, book.label, `${tag} every step measured`, r.deadSteps.length === 0 && r.measured > 0,
                 `${r.measured}/${r.steps} steps had a live .section.active` +
                 (r.deadSteps.length ? ` — zero-height: ${r.deadSteps.join(",")}` : ""));
      results.ok(id, book.label, `${tag} clean console`, errs.length === 0, errs.slice(0, 2).join(" | ") || "0 errors");
    }
  }
  if (bless) {
    fresh.page = "public/designbook.html";
    console.log("\nbaseline written to " + saveBaseline(fresh) + "\n");
  }
}
