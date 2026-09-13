/* CHECK 2 — one id, one element; and no control outside #sections.
 *
 * WHAT IT DEFENDS (CLAUDE.md):
 *  - "#valBlock is ONE node that go() moves into the active step's .stepval,
 *    and renderForm() parks it in #valPark before rewriting #sections —
 *    without that park it is destroyed with the sections and every later
 *    msg($('saveMsg'), ...) writes to nothing." A destroyed #valBlock throws
 *    nothing and logs nothing; it just stops showing anything. So the check is
 *    re-render, then look for it.
 *  - "The alternative considered and rejected was moving #advanceStage into
 *    the action bar the same way: statusHTML() re-creates it on every
 *    renderForm(), so the moved node and the new one would both answer to
 *    getElementById." Two elements, one id, is the named failure mode. A
 *    second view splicing its own chrome into the same appbar is precisely
 *    where it would come back.
 *  - "Note the header lives OUTSIDE .rowlist: collectForm() reads that
 *    element's children as the rows, so anything else in there is collected
 *    as an extra row."
 *  - collectForm() sweeps the whole document for [data-field]/[data-col], so
 *    an orphan control anywhere on the page silently joins the payload. With
 *    two books in one document that stops being hypothetical: PlantBook's
 *    fields must not be collected while DesignBook is the live view.
 *
 * Run for a contractor AND a reviewer, because statusHTML() renders different
 * markup for each and the reviewer's is the one with the extra buttons.
 */
import { domAudit, fillForm } from "../lib/inpage.mjs";
import { withBook } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";

export const id = "ids";

const CASES = [
  { name: "contractor", canReview: false },
  { name: "reviewer", canReview: true },
];

export async function run({ browser, results, books }) {
  for (const book of books) {
    let skippedOnce = false;
    for (const c of CASES) {
      const out = await withBook(browser, book, { width: 1440, height: 1000, canReview: c.canReview },
        async ({ page, errs }) => {
          await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
          const before = await page.evaluate(domAudit);
          // Tag the live node, then force the re-render the page does on any
          // state change. A parked node keeps the tag; a rebuilt one loses it.
          await page.evaluate(() => {
            const v = document.getElementById("valBlock");
            if (v) v.dataset.harnessTag = "kept";
            renderForm();
          });
          await page.waitForTimeout(150);
          const after = await page.evaluate(domAudit);
          const kept = await page.evaluate(() => {
            const v = document.getElementById("valBlock");
            return { present: !!v, tagged: !!(v && v.dataset.harnessTag === "kept"),
                     parent: v && v.parentElement ? v.parentElement.id || v.parentElement.className : null };
          });
          return { before, after, kept, errs: realErrors(errs) };
        });

      if (out.skipped) {
        if (!skippedOnce) { results.skip(id, book.label, "both roles", out.skipped); skippedOnce = true; }
        continue;
      }
      const { before, after, kept, errs } = out.value;
      results.ok(id, book.label, `${c.name} no duplicate ids (first paint)`, before.dup.length === 0,
                 before.dup.join(",") || "0 duplicates");
      results.ok(id, book.label, `${c.name} no duplicate ids (after re-render)`, after.dup.length === 0,
                 after.dup.join(",") || "0 duplicates");
      results.ok(id, book.label, `${c.name} no orphan [data-field]/[data-col]`, after.orphans.length === 0,
                 after.orphans.slice(0, 6).join(",") || "0 outside #sections");
      results.ok(id, book.label, `${c.name} no stray child in a [data-rowlist]`, after.rowlistStrays.length === 0,
                 after.rowlistStrays.join(",") || "every rowlist child is a row");
      results.ok(id, book.label, `${c.name} #valBlock survives re-render`, kept.present && kept.tagged,
                 kept.present ? (kept.tagged ? `parked in #${kept.parent}` : "present but REBUILT — the park was lost")
                              : "destroyed by renderForm()");
      results.ok(id, book.label, `${c.name} exactly one .valblock`, after.valBlocks === 1, `${after.valBlocks} found`);
      results.ok(id, book.label, `${c.name} clean console`, errs.length === 0,
                 errs.slice(0, 2).join(" | ") || "0 errors");
    }
  }
}
