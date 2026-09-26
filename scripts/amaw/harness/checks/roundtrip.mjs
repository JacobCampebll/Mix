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

/* A native date or time picker blanks any value that is not in its own shape,
 * the moment it is set, with nothing said. So a fill that spoke the wrong
 * language leaves "" behind, and a round trip then compares "" with "" - a
 * pass that tested nothing (inpage.mjs's fill gives these controls ISO values
 * for exactly that reason). These two ask the question directly: which
 * pickers could the fill reach, and does each hold a value afterwards. Keys,
 * not element handles or markers, so a re-render in between cannot hide one.
 * Both run IN the page and close over nothing. */
function nativeReachable() {
  const out = [];
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach((el) => {
    if (el.disabled || el.readOnly || !(el.dataset.field || el.dataset.col)) return;
    const host = el.closest("[data-subsection]") || el.closest("[data-section]");
    const row = el.closest(".rowitem");
    const i = row && row.parentElement ? Array.prototype.indexOf.call(row.parentElement.children, row) : -1;
    out.push(el.dataset.field ? `f|${el.dataset.field}`
      : `c|${host ? host.dataset.subsection || host.dataset.section : ""}|${el.dataset.row}|${el.dataset.col}|${i}`);
  });
  return out;
}
function nativeHolding(keys) {
  const find = (k) => {
    const p = k.split("|");
    if (p[0] === "f") return document.querySelector(`[data-field="${p[1]}"]`);
    const host = document.querySelector(`[data-subsection="${p[1]}"]`) || document.querySelector(`[data-section="${p[1]}"]`);
    const list = host && host.querySelector(`[data-rowlist="${p[2]}"]`);
    const row = list && list.children[Number(p[4])];
    return row ? row.querySelector(`[data-col="${p[3]}"]`) : null;
  };
  const empty = keys.filter((k) => { const el = find(k); return !el || el.value === ""; });
  return { count: keys.length, empty };
}

export async function run({ browser, results, books }) {
  const libs = findLibs();
  for (const book of books) {
    const out = await withBook(browser, book, { width: 1440, height: 1000 }, async ({ page, errs }) => {
      const probeField = PROBE_FIELD[book.label];
      // The native pickers the fill can reach - the ones enabled BEFORE it
      // runs. PlantBook's sublot tabs are locked in this empty form until the
      // fill's own last step sets a lot number, so its ticket pickers are
      // exercised by the ?sublots=open pass below rather than here.
      const reachable = await page.evaluate(nativeReachable);
      const filled = await page.evaluate(fillForm,
        { nominal_size: "0.38", mix_type: "B", [probeField]: XSS_PROBE });
      await page.waitForTimeout(200);
      const native = await page.evaluate(nativeHolding, reachable);
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
        // SUM, never assign. PlantBook's Sublot 1-4 tabs render one shared
        // table as four `[data-rowlist="key"]` blocks (sliceIndices), so an
        // assignment keeps only the LAST block's count and every sliced table
        // then looks like it collected four times what the DOM holds. This
        // check reported all twelve of them as "collected twice" on
        // 2026-09-14 when nothing was wrong with the page - written when one
        // key meant one element, and never revisited when that stopped
        // being true.
        const counts = {};
        document.querySelectorAll("[data-rowlist]").forEach((l) => {
          counts[l.dataset.rowlist] = (counts[l.dataset.rowlist] || 0) + l.children.length;
        });
        return counts;
      });
      const collectedRows = Object.fromEntries(Object.entries(after.rows).map(([k, v]) => [k, v.length]));
      const probe = await page.evaluate((f) => {
        const el = document.querySelector(`[data-field="${f}"]`);
        return el ? el.value : "(no such field on this book)";
      }, probeField);
      /* THE STORED-VALUE GUARD (2026-09-26). A file saved with "9/24/26" in a
       * date - DesignBook's referenced design date, or a lot's ticket Date and
       * Time from before they were pickers - must reopen showing it as typed,
       * in a text box, not as an empty picker the next save would store. The
       * same reopen applyHandoff() and openLotEnvelope() do, with the value
       * swapped in; PlantBook's rail must also say it will not reach the AMAW. */
      const guard = await page.evaluate((isPlant) => {
        const b = collectForm();
        const typed = isPlant ? ["9/24/26", "2:15 PM"] : ["9/24/26"];
        if (isPlant) {
          const t = (b.rows.sublot_tickets || [])[0];
          if (!t) return { none: "no sublot ticket row was collected" };
          t.date = typed[0]; t.time = typed[1];
        } else {
          b.values.reference_design_date = typed[0];
        }
        state.extracted = { scalars: b.values, tables: b.rows };
        renderForm();
        const q = (sel) => document.querySelector(sel);
        const els = isPlant
          ? [q('[data-section="sublot-1"] [data-rowlist="sublot_tickets"] [data-col="date"]'),
             q('[data-section="sublot-1"] [data-rowlist="sublot_tickets"] [data-col="time"]')]
          : [q('[data-field="reference_design_date"]')];
        const back = collectForm();
        const t0 = (back.rows.sublot_tickets || [])[0] || {};
        return {
          typed,
          controls: els.map((el) => (el ? { type: el.type, value: el.value } : null)),
          collected: isPlant ? [t0.date, t0.time] : [back.values.reference_design_date],
          rail: (document.getElementById("vallist") || {}).textContent || "",
        };
      }, book.label === "PlantBook");
      return { before: r.before, after, filled, native, emptyRows, collectedRows, probe, guard, errs: realErrors(errs) };
    });

    if (out.skipped) { results.skip(id, book.label, "collectForm round trip", out.skipped); continue; }
    const { before, after, filled, native, emptyRows, collectedRows, probe, guard, errs } = out.value;

    results.ok(id, book.label, "something was actually filled", filled > 40,
               `${filled} controls filled` + (filled > 40 ? "" : " — too few to prove anything"));
    // DesignBook's referenced design date is reachable here. PlantBook has no
    // picker this empty form's fill can reach (its sublot tabs are locked
    // while the fill runs), so its pickers are asserted in the open pass below.
    if (book.label !== "PlantBook") {
      results.ok(id, book.label, "every native date/time control holds what the fill gave it",
                 native.count > 0 && native.empty.length === 0,
                 `${native.count - native.empty.length}/${native.count} hold a value` +
                 (native.empty.length ? ` — blanked: ${native.empty.join(",")}` : ""));
    }
    if (guard.none) {
      results.fail(id, book.label, "an off-format date or time reopens as typed", guard.none);
    } else {
      results.ok(id, book.label, "an off-format date or time reopens in a text box, as typed",
                 guard.controls.every((c, i) => c && c.type === "text" && c.value === guard.typed[i]),
                 JSON.stringify(guard.controls));
      results.ok(id, book.label, "...and collectForm() carries it back unchanged, never blank",
                 guard.collected.every((v, i) => v === guard.typed[i]), JSON.stringify(guard.collected));
      if (book.label === "PlantBook") {
        const says = guard.typed.every((v, i) => guard.rail.includes(`sublot 1 ${i ? "time" : "date"} "${v}"`));
        results.ok(id, book.label, "the rail names the sublot and the value that will not reach the AMAW", says,
                   says ? "named in #vallist" : `#vallist: ${guard.rail.slice(0, 160)}`);
      }
    }

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

    // ---- PlantBook's ticket Date and Time, through the pickers ---------------
    // The pass above cannot reach them: in this empty form every sublot tab is
    // locked while the fill runs, so no sublot table is round-tripped with a
    // value in it. ?sublots=open is the page's own bypass and opens all four,
    // so the four tickets' pickers take the fill's ISO values, and the same
    // reopen as above must bring every one back as a picker holding it.
    if (book.label === "PlantBook") {
      const open = await withBook(browser, book, { width: 1440, height: 1000, query: "&sublots=open" },
        async ({ page, errs: e3 }) => {
          const reach = await page.evaluate(nativeReachable);
          await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
          await page.waitForTimeout(200);
          const held = await page.evaluate(nativeHolding, reach);
          const rt = await page.evaluate(() => {
            const pick = (rows) => (rows.sublot_tickets || []).map((r) => [r.sublot, r.date, r.time]);
            const b = collectForm();
            state.extracted = { scalars: b.values, tables: b.rows };
            renderForm();
            const a = collectForm();
            const kinds = Array.from(document.querySelectorAll(
              '[data-rowlist="sublot_tickets"] [data-col="date"], [data-rowlist="sublot_tickets"] [data-col="time"]'))
              .map((el) => el.type);
            // A date picker's year is bounded to what a workbook date can be
            // (NATIVE_DATE_LIMITS): max caps the year at four digits.
            const bounds = Array.from(document.querySelectorAll('[data-rowlist="sublot_tickets"] input[type="date"]'))
              .map((el) => `${el.getAttribute("min")}..${el.getAttribute("max")}`);
            return { before: pick(b.rows), after: pick(a.rows), kinds, bounds };
          });
          /* A TWO-DIGIT YEAR, TYPED. The paper writes "9/24/26", and typed
           * into the picker from the keyboard that is "0026-09-24" - a real
           * YYYY-MM-DD the browser keeps and the mapper refuses, because the
           * workbook's dates start in 1900. The rail must name the YEAR, not
           * the format the value is already in. Typed rather than set, because
           * the keyboard is how the value gets there; the step is opened first
           * because a focus inside a hidden step does nothing. */
          await page.evaluate(() => go(topSections().findIndex((s) => s.id === "sublot-1"), null, false));
          await page.waitForTimeout(150);
          const dsel = '[data-section="sublot-1"] [data-rowlist="sublot_tickets"] [data-col="date"]';
          await page.evaluate((sel) => { const el = document.querySelector(sel); el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); }, dsel);
          await page.focus(dsel);
          await page.keyboard.type("092426");
          await page.keyboard.press("Tab");
          await page.waitForTimeout(150);
          const year = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            // The ticket line alone, whitespace folded, so a failure shows it.
            const rail = Array.from(document.querySelectorAll("#vallist .vitem"))
              .map((v) => v.textContent.replace(/\s+/g, " ").trim()).filter((t) => /Ticket sublot/.test(t)).join(" | ");
            return { type: el.type, value: el.value, rail };
          }, dsel);
          return { reach, held, rt, year, errs: realErrors(e3) };
        });
      if (!open.skipped) {
        const { held, rt, year, errs: e3 } = open.value;
        results.ok(id, book.label, "with the sublots open, all 8 ticket pickers take the fill's values",
                   held.count === 8 && held.empty.length === 0,
                   `${held.count - held.empty.length}/${held.count} hold a value` +
                   (held.empty.length ? ` — blanked: ${held.empty.slice(0, 4).join(",")}` : ""));
        const whole = rt.before.length === 4 && rt.before.every((r) => r[1] && r[2]);
        results.ok(id, book.label, "ticket Date and Time round-trip through the pickers",
                   whole && JSON.stringify(rt.before) === JSON.stringify(rt.after)
                     && rt.kinds.length === 8 && rt.kinds.every((k) => k === "date" || k === "time"),
                   `before ${JSON.stringify(rt.before)} | after ${JSON.stringify(rt.after)} | reopened as ${rt.kinds.join(",")}`);
        results.ok(id, book.label, "every ticket date picker is bounded 1900-01-01..9999-12-31",
                   rt.bounds.length === 4 && rt.bounds.every((x) => x === "1900-01-01..9999-12-31"),
                   rt.bounds.join(" ") || "no date pickers");
        const namesYear = year.rail.includes('sublot 1 date "0026-09-24" (the year reads 0026');
        results.ok(id, book.label, "a two-digit year typed into the picker: kept, and the rail names the year",
                   year.type === "date" && year.value === "0026-09-24" && namesYear,
                   `picker holds ${JSON.stringify(year.value)}` + (namesYear ? ", the rail names the year"
                     : ` | the rail says: ${year.rail.slice(0, 220) || "(no ticket line)"}`));
        results.ok(id, book.label, "sublots-open pass: clean console", e3.length === 0, e3.slice(0, 2).join(" | ") || "0 errors");
      }
    }

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

    // ---- PlantBook: the lot PDF prints every ticket value WHOLE (2026-09-26)
    // The sublot ticket's `fr` is what sizes the lot PDF's 345pt table
    // (gridWeights()), so a weight moved for the screen can cut a figure in the
    // submittal KYTC reads - which is how a 4-digit "Tons today before sample"
    // came to print as "1...". Real-shaped values in (the sublots opened so the
    // cells take them), pdf-lib's drawText captured, and every value must be
    // drawn as typed in the table that follows the "Sublot ticket" heading.
    if (book.label === "PlantBook") {
      const lp = await withBook(browser, book, { width: 1440, height: 1000, query: "&sublots=open" },
        async ({ page, errs: e4 }) => {
          const r = await page.evaluate(async (tickets) => {
            const rows = rowsOfList("sublot_tickets");
            let typed = 0;
            tickets.forEach((t, i) => {
              for (const [k, v] of Object.entries(t)) {
                const el = rows[i] && rows[i].querySelector(`[data-col="${k}"]`);
                if (!el || el.disabled) continue;
                el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); typed++;
              }
            });
            await new Promise((res) => setTimeout(res, 200));
            const drawn = [];
            const orig = PDFLib.PDFPage.prototype.drawText;
            PDFLib.PDFPage.prototype.drawText = function (t, o) { drawn.push(String(t)); return orig.call(this, t, o); };
            try { await buildReviewPDF(handoffPayload()); } finally { PDFLib.PDFPage.prototype.drawText = orig; }
            const at = drawn.indexOf("Sublot ticket");
            const table = at < 0 ? [] : drawn.slice(at, at + 80);
            const want = tickets.flatMap((t) => Object.values(t));
            return { typed, want: want.length, missing: want.filter((v) => !table.includes(v)), found: at >= 0 };
          }, PDF_TICKETS);
          return { r, errs: realErrors(e4) };
        });
      if (!lp.skipped) {
        const { r, errs: e4 } = lp.value;
        const expected = PDF_TICKETS.reduce((n, t) => n + Object.keys(t).length, 0);
        results.ok(id, book.label, "lot PDF prints every ticket value whole",
                   r.found && r.typed === expected && r.missing.length === 0,
                   !r.found ? "no \"Sublot ticket\" table was drawn"
                     : r.typed !== expected ? `only ${r.typed}/${expected} values could be typed - the sublots did not open`
                     : r.missing.length ? `cut or missing: ${r.missing.join(", ")}` : `${r.want}/${r.want} drawn as typed`);
        results.ok(id, book.label, "lot PDF tickets: clean console", e4.length === 0, e4.slice(0, 2).join(" | ") || "0 errors");
      }
    }
  }
}

// Two tickets of real shape for the lot PDF check above: an eight-character
// binder lot and SM ID, a 4- and a 5-digit tonnage. Fixtures, not real data.
const PDF_TICKETS = [
  { date: "2026-09-24", time: "14:15", truck: "22471", tons_cum: "4955", tons_before: "1250",
    temperature: "305", binder_lot: "224711-A", tack_lot: "T-88213", technician: "jcavanah" },
  { date: "2026-09-25", time: "07:05", truck: "18803", tons_cum: "41250", tons_before: "975",
    temperature: "310", binder_lot: "224711-B", tack_lot: "T-88214", technician: "jharmon3" },
];
