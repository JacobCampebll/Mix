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

/* THE SUBLOT TICKET, FILLED THE WAY A LOT IS (2026-09-26).
 *
 * The sweep above cannot see this table, and that is how the ticket
 * re-weight that clipped Tech, Binder lot and AC method at 1100-1440px
 * passed it. Two blind spots, both measured:
 *  - The sweep fills the default empty PlantBook form, whose sublot tabs are
 *    locked while fillForm() runs (the lock opens on the lot number, which
 *    the fill sets last), so every ticket text cell is still EMPTY when it is
 *    measured. An empty box clips nothing.
 *  - A <select> reports scrollWidth === clientWidth however far its label is
 *    cut, the same trap as a date or time picker, so AC method's seeded
 *    "Ignition Furnace" read as fitting in 86px.
 * So this opens a real lot through the page's own door with ?sublots=open,
 * types the kind of values a ticket carries - an eight-character SM ID and
 * binder lot, not fillForm()'s five-character junk - and measures every
 * control by what it NEEDS: a text box by its own text, a picker by its
 * intrinsic width, a select by its selected label. Absolute, with no
 * baseline: these are ordinary values and every one of them must be readable
 * at every width, the table scrolling where it cannot fit rather than
 * squeezing (CLAUDE.md). The values are fixtures of real shapes, not real
 * data. */
const TICKET_APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};
const TICKET_VALUES = { date: "2026-09-24", time: "14:15", truck: "22471", tons_cum: "4955",
                        tons_before: "1250", temperature: "305", binder_lot: "224711-A",
                        tack_lot: "T-88213", technician: "jcavanah" };
// The seed every lot opens on (AC_METHODS). The select is measured by it, so
// a table that lost its seed would be measuring an empty label.
const TICKET_AC_SEED = "Ignition Furnace";

/* Runs IN the page and closes over nothing. */
async function measureTicketRow({ approval, values }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  await sleep(250);
  // Above 700px only the active step is laid out; below it every section is
  // on one scroll. go() first either way, and measure the sublot-1 section.
  go(topSections().findIndex((s) => s.id === "sublot-1"), null, false);
  await sleep(40);
  const sec = document.querySelector('[data-section="sublot-1"]');
  const list = sec && sec.querySelector('[data-rowlist="sublot_tickets"]');
  const row = list && list.children[0];
  if (!row) return { none: "no sublot-1 ticket row on the page" };
  if (sec.getBoundingClientRect().height <= 0) return { none: "the sublot-1 step measured zero height" };
  for (const [k, v] of Object.entries(values)) {
    const el = row.querySelector(`[data-col="${k}"]`);
    if (!el) return { none: `no ${k} cell in the ticket row` };
    if (el.disabled) return { none: `${k} is disabled - ?sublots=open did not open sublot 1` };
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  await sleep(40);
  const textNeed = (el, s) => {
    const cs = getComputedStyle(el);
    const sp = document.createElement("span");
    sp.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
    sp.textContent = s;
    document.body.appendChild(sp);
    const w = sp.getBoundingClientRect().width;
    sp.remove();
    return w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) +
           parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  };
  const clipped = [], empty = [];
  let ac = null;
  row.querySelectorAll("[data-col]").forEach((el) => {
    if (getComputedStyle(el.closest(".cell") || el).display === "none") return;
    let need;
    if (el.type === "date" || el.type === "time") {
      const c = el.cloneNode(true);
      c.style.cssText = "position:absolute; visibility:hidden; width:auto; left:0; top:0";
      el.parentElement.appendChild(c);
      need = c.getBoundingClientRect().width;
      c.remove();
    } else if (el.tagName === "SELECT") {
      const label = el.selectedOptions[0] ? el.selectedOptions[0].textContent : "";
      if (el.dataset.col === "ac_method") ac = label;
      need = textNeed(el, label);
    } else {
      need = textNeed(el, el.value);
    }
    if (!String(el.value || "").trim()) empty.push(el.dataset.col);
    const have = el.getBoundingClientRect().width;
    if (need > have + 0.5) clipped.push(`${el.dataset.col}(${need.toFixed(1)}>${have.toFixed(1)})`);
  });
  const sc = list.closest(".rowscroll");
  return { clipped, empty, ac, scrolls: sc ? sc.scrollWidth > sc.clientWidth + 1 : false,
           page: document.documentElement.scrollWidth };
}

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

  // ---- the sublot ticket, filled the way a lot is (measureTicketRow) --------
  const plant = books.find((b) => b.label === "PlantBook");
  if (plant) {
    let skippedOnce = false;
    for (const width of WIDTHS) {
      const out = await withBook(browser, plant, { width, height: 900, query: "&sublots=open" }, async ({ page, errs }) => {
        const r = await page.evaluate(measureTicketRow, { approval: TICKET_APPROVAL, values: TICKET_VALUES });
        return { r, errs: realErrors(errs) };
      });
      if (out.skipped) {
        if (!skippedOnce) { results.skip(id, plant.label, `ticket row, all ${WIDTHS.length} widths`, out.skipped); skippedOnce = true; }
        continue;
      }
      const { r, errs } = out.value;
      const tag = `${width}px`;
      const what = `${tag} ticket row: every value readable, scrolling rather than squeezing`;
      if (r.none) { results.fail(id, plant.label, what, r.none); continue; }
      results.ok(id, plant.label, what,
                 r.clipped.length === 0 && r.empty.length === 0 && r.ac === TICKET_AC_SEED,
                 r.clipped.length ? "CLIPPED: " + r.clipped.join(" ")
                   : r.ac !== TICKET_AC_SEED ? `AC method reads "${r.ac}", not its seed "${TICKET_AC_SEED}" - measured nothing there`
                   : r.empty.length ? `still blank after the fill: ${r.empty.join(",")} - measured nothing there`
                   : `11 cells whole${r.scrolls ? ", the table scrolls" : ", the table fits"}`);
      results.ok(id, plant.label, `${tag} ticket row: no sideways page scroll, clean console`,
                 r.page <= width && errs.length === 0,
                 `scrollWidth ${r.page} vs viewport ${width}` + (errs.length ? ` | ${errs.slice(0, 2).join(" | ")}` : ""));
    }
  }
  if (bless) {
    fresh.page = "public/designbook.html";
    console.log("\nbaseline written to " + saveBaseline(fresh) + "\n");
  }
}
