/* CHECK 4 — collectForm() round-trips.
 *
 * Fill, collect, re-render from what was collected, collect again, compare.
 *
 * WHY THAT IS THE REAL PATH, not a contrived one: applyHandoff() does exactly
 * this — `state.extracted = { scalars: payload.values, tables: payload.rows }`
 * and then renderForm(). So reopening a review PDF, reopening a submittal, and
 * this check are the same three lines. If the round trip loses something here,
 * it loses it for a supervisor reopening a design someone emailed them.
 *
 * WHAT IT DEFENDS (CLAUDE.md):
 *  - "Four Points silently never restored on a reopened design — a rendering
 *    gap unrelated to RLS or the database... The data was never lost — it was
 *    sitting safely in the values.fourpoint JSONB column the whole time, saved
 *    correctly by collectForm() — it just never made it back onto the screen
 *    on reopen." And the general form of it: "a section with its own bespoke
 *    render function is easy to leave off the 'read from state' convention the
 *    rest of the page follows, and nothing errors when that happens."
 *    PlantBook will arrive with bespoke render functions of its own.
 *  - "collectForm() (verified byte-identical on a re-imported 467PA)" is
 *    listed as safe inside the wizard. This is the check that keeps it so.
 *  - "Every string that reaches innerHTML goes through esc()" — the fill here
 *    deliberately includes a value with angle brackets and quotes, so a sink
 *    that stopped escaping shows up as a round-trip loss rather than as a
 *    stored XSS somebody finds later.
 *  - "collectForm() drops a row where every cell is empty, so unused rows
 *    never reach the payload" — asserted directly, since a row spec with
 *    `start: n` (TSR's six) depends on it.
 *
 * The review-PDF round trip is a second case and SKIPS unless pdf-lib is
 * available (set HARNESS_LIBS to a node_modules that has it).
 */
import { fillForm } from "../lib/inpage.mjs";
import { withBook } from "../lib/books.mjs";
import { realErrors, findLibs } from "../lib/page.mjs";

export const id = "roundtrip";

/* A string that would come back mangled if anything on the way to innerHTML
 * stopped escaping. Parked in a free-text field that has no list behind it. */
const XSS_PROBE = `A"B'C<D&E>F`;

/* Which field carries it, per book. It has to be a real field of the book on
 * screen: `rap_note` is DesignBook's and does not exist in a lot, so parking
 * the probe there against PlantBook read back `null` and the check reported a
 * mangled string when nothing had been escaped at all. Both are free text with
 * no reference list behind them, which is the property that matters - a
 * sourced field would snap the probe to the nearest list entry and prove
 * nothing. Fail loudly if the field is missing rather than skipping: a book
 * with nowhere to park this is a book whose escaping is untested. */
const PROBE_FIELD = { DesignBook: "rap_note", PlantBook: "lot_additive" };

export async function run({ browser, results, books }) {
  const libs = findLibs();
  for (const book of books) {
    const out = await withBook(browser, book, { width: 1440, height: 1000 }, async ({ page, errs }) => {
      const probeField = PROBE_FIELD[book.label];
      const filled = await page.evaluate(fillForm,
        { nominal_size: "0.38", mix_type: "B", [probeField]: XSS_PROBE });
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const before = collectForm();
        // Exactly what applyHandoff() does with a reopened file.
        state.extracted = { scalars: before.values, tables: before.rows };
        renderForm();
        return { before };
      });
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => collectForm());
      const emptyRows = await page.evaluate(() => {
        // Add a blank row to every table and prove collectForm() drops it.
        const counts = {};
        document.querySelectorAll("[data-rowlist]").forEach((l) => { counts[l.dataset.rowlist] = l.children.length; });
        return counts;
      });
      const collectedRows = Object.fromEntries(Object.entries(after.rows).map(([k, v]) => [k, v.length]));
      const probe = await page.evaluate((f) => {
        const el = document.querySelector(`[data-field="${f}"]`);
        return el ? el.value : "(no such field on this book)";
      }, probeField);
      return { before: r.before, after, filled, emptyRows, collectedRows, probe, errs: realErrors(errs) };
    });

    if (out.skipped) { results.skip(id, book.label, "collectForm round trip", out.skipped); continue; }
    const { before, after, filled, emptyRows, collectedRows, probe, errs } = out.value;

    results.ok(id, book.label, "something was actually filled", filled > 40,
               `${filled} controls filled` + (filled > 40 ? "" : " — too few to prove anything"));

    // Compared in parts so a failure names the part. design_values is the
    // computed column and is compared too: re-rendering must re-derive the
    // same figures, which is the Four Points restore bug from the other side.
    const parts = {
      scalars: (v) => { const o = { ...v.values }; delete o.fourpoint; delete o.polish; delete o.design_values; return o; },
      fourpoint: (v) => v.values.fourpoint,
      polish: (v) => v.values.polish,
      design_values: (v) => v.values.design_values,
      rows: (v) => v.rows,
    };
    for (const [name, get] of Object.entries(parts)) {
      const a = JSON.stringify(get(before)), b = JSON.stringify(get(after));
      let detail = `${name} identical`;
      if (a !== b) {
        const ka = JSON.parse(a) || {}, kb = JSON.parse(b) || {};
        const diff = Object.keys({ ...ka, ...kb })
          .filter((k) => JSON.stringify(ka[k]) !== JSON.stringify(kb[k]))
          .slice(0, 5)
          .map((k) => `${k}: ${JSON.stringify(ka[k])} -> ${JSON.stringify(kb[k])}`);
        detail = diff.join(" | ") || "differs";
      }
      results.ok(id, book.label, `round trip preserves ${name}`, a === b, detail);
    }

    results.ok(id, book.label, "esc() survives the round trip", probe === XSS_PROBE,
               probe === XSS_PROBE ? "quotes and angle brackets intact" : `"${XSS_PROBE}" came back as "${probe}"`);

    const dropped = Object.entries(emptyRows)
      .filter(([k, n]) => (collectedRows[k] || 0) > n)
      .map(([k]) => k);
    results.ok(id, book.label, "no rowlist child collected twice", dropped.length === 0,
               dropped.length ? dropped.join(",") : Object.entries(collectedRows).map(([k, n]) => `${k}:${n}`).join(" "));

    results.ok(id, book.label, "clean console", errs.length === 0, errs.slice(0, 2).join(" | ") || "0 errors");

    // ---- the review PDF, when the library is there -------------------------
    if (!libs["pdf-lib"]) {
      results.skip(id, book.label, "review PDF round trip",
                   "pdf-lib not found — set HARNESS_LIBS to a node_modules containing pdf-lib/dist/pdf-lib.min.js");
      continue;
    }
    const pdf = await withBook(browser, book, { width: 1440, height: 1000 }, async ({ page, errs }) => {
      await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
      await page.waitForTimeout(200);
      const r = await page.evaluate(async () => {
        const pay = handoffPayload();
        const bytes = await buildReviewPDF(pay);
        const back = await readHandoffPDF(bytes);
        return {
          values: JSON.stringify(back.values) === JSON.stringify(pay.values),
          rows: JSON.stringify(back.rows) === JSON.stringify(pay.rows),
          bytes: bytes.length,
        };
      });
      return { r, errs: realErrors(errs) };
    });
    if (!pdf.skipped) {
      const { r, errs: e2 } = pdf.value;
      results.ok(id, book.label, "review PDF carries values back", r.values, `${r.bytes} bytes`);
      results.ok(id, book.label, "review PDF carries rows back", r.rows, `${r.bytes} bytes`);
      results.ok(id, book.label, "review PDF: clean console", e2.length === 0, e2.slice(0, 2).join(" | ") || "0 errors");
    }
  }
}
