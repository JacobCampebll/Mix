/* CHECK 7 — the compaction option, and the joint cores that follow from it.
 *
 * 2026 Std Spec 402.03.02 D) 6) opens "The Contract will state the compaction
 * option to be used", so Option A / Option B is a lookup off the proposal
 * rather than a preference - netlify/functions/kytc-notes reads the note and
 * scripts/kytc/check_notes.mjs guards that parser. What THIS check defends is
 * the other half, the part that lives in the page: what the page does with an
 * answer once it has one.
 *
 * It matters more than a fill usually would, twice over:
 *
 *  - A wrong density option is a SILENTLY ZERO-PAID LOT. propertyWeights()
 *    answers for exactly three flag combinations and weighs every property at
 *    zero for the rest, and nothing on the screen says "this lot pays nothing
 *    because a dropdown is wrong".
 *  - Joint density is 15% of the pay on a surface lot, and the rule is narrow
 *    in a way that is easy to round off: Option A takes joint cores "for
 *    surface mixtures only", and only at 0.38 and 0.50 (Jake, 2026-09-13:
 *    "Joint cores is just if it's surface 0.38 or 0.50, which we already
 *    know"). A NO.4 surface is a thin lift and is NOT on that list - the one
 *    case a reasonable person would get wrong by simplifying the rule to
 *    "surface".
 *
 * And the refusals are asserted as hard as the fills. An unknown course must
 * leave the field BLANK rather than collapsing to "no", because "no" is a
 * real answer that silently drops a surface lot's joint-density weight to no
 * deduction at all; and a proposal that states two options (they are written
 * per route - 262120 carries OPTION A (KY 627) and OPTION B (US 25)) must
 * fill nothing, because nothing in a lot says which stretch it paved.
 *
 * The notes are fixtures rather than a fetch: this check is about the page,
 * and check_notes.mjs already reads the real proposals.
 */
import { withBook, PLANT } from "../lib/books.mjs";

export const id = "compaction";
const BOOK = "PlantBook";

const A = { option: "A", route: null, joint_cores: true, text: "..." };
const B = { option: "B", route: null, joint_cores: false, text: "..." };
const A_NO_JOINTS = { option: "A", route: null, joint_cores: false, text: "..." };
const A627 = { option: "A", route: "KY 627", joint_cores: true, text: "..." };
const B25 = { option: "B", route: "US 25", joint_cores: false, text: "..." };

// Contract 262120's two mix items, and a base mix to stand for the course
// that takes no joint cores whatever the option.
const SURF = [
  { signature: "CL3 ASPH SURF 0.38B PG64-22", layer: "SURF", nominal_size: "0.38B" },
  { signature: "CL2 ASPH SURF 0.38D PG64-22", layer: "SURF", nominal_size: "0.38D" },
];
const BASE = [{ signature: "CL3 ASPH BASE 1.00B PG64-22", layer: "BASE", nominal_size: "1.00B" }];
const NO4 = [{ signature: "CL3 ASPH SURF NO.4A PG64-22", layer: "SURF", nominal_size: "NO.4A" }];

/* Every case: [label, options, contract mixes, nominal size, mix type,
 *              expected density option, expected joint density]
 * "" means the field must be left empty. */
const CASES = [
  ["a 0.38 surface mix under Option A takes joint cores", [A], SURF, "0.38", "B", "A", "1"],
  ["a 0.50 surface mix does too", [A], [{ layer: "SURF", nominal_size: "0.50A" }], "0.50", "A", "A", "1"],
  ["Option B takes no cores at all", [B], SURF, "0.38", "B", "B", "2"],
  ["a base mix takes none under Option A either", [A], BASE, "1.00", "B", "A", "2"],
  ["a NO.4 surface is a thin lift and takes none", [A], NO4, "NO.4", "A", "A", "2"],
  ["an Option A note that does not require joint cores", [A_NO_JOINTS], SURF, "0.38", "B", "A", "2"],
  ["an unknown course leaves joint density BLANK, never 'no'", [A], [], "0.38", "B", "A", ""],
  ["two routes fill NOTHING", [A627, B25], SURF, "0.38", "B", "", ""],
  ["no note in the proposal fills nothing", [], SURF, "0.38", "B", "", ""],
];

export async function run({ browser, results }) {
  const out = await withBook(browser, PLANT, { width: 1440, height: 1000 }, async (h) => {
    const got = await h.page.evaluate((cases) => {
      const el = (k) => document.querySelector(`[data-field="${k}"]`);
      const set = (k, v) => { const e = el(k); if (e) e.value = v; };
      const get = (k) => { const e = el(k); return e ? e.value : null; };
      return cases.map(([label, options, mixes, size, type]) => {
        // A fresh start each time: prefillLive() leaves a filled field alone,
        // so a case that inherited the last one's answer would pass by not
        // running at all.
        set("lot_density_option", ""); set("lot_joint_density", "");
        set("lot_nominal_size", size); set("lot_mix_type", type);
        let note = null, threw = null;
        try { note = applyCompaction({ file: "fixture.pdf", options }, mixes); }
        catch (err) { threw = String((err && err.message) || err); }
        return { label, threw, kind: note && note.kind, text: note && note.text,
                 opt: get("lot_density_option"), jd: get("lot_joint_density") };
      });
    }, CASES);

    CASES.forEach(([label, , , , , wantOpt, wantJd], i) => {
      const r = got[i];
      const detail = r.threw ? `threw: ${r.threw}`
        : `density option "${r.opt}", joint density "${r.jd}"`;
      results.ok(id, BOOK, label,
                 !r.threw && r.opt === wantOpt && r.jd === wantJd,
                 detail + (r.threw ? "" : `  (want "${wantOpt}" / "${wantJd}")`));
    });

    // A fill is reported as done; a refusal has to say WHY, or a technician
    // is left staring at two empty dropdowns after pressing a lookup button.
    const twoRoutes = got[CASES.findIndex((c) => c[0].startsWith("two routes"))];
    results.ok(id, BOOK, "two routes are both named in the note line",
               twoRoutes.kind === "warn" && /KY 627/.test(twoRoutes.text || "") && /US 25/.test(twoRoutes.text || ""),
               twoRoutes.text || "(no note)");
    const unknown = got[CASES.findIndex((c) => c[0].startsWith("an unknown course"))];
    results.ok(id, BOOK, "an unknown course says why joint density is blank",
               /course/i.test(unknown.text || ""), unknown.text || "(no note)");
    return true;
  });

  if (out && out.skipped) {
    for (const [label] of CASES) results.skip(id, BOOK, label, out.skipped);
    results.skip(id, BOOK, "two routes are both named in the note line", out.skipped);
    results.skip(id, BOOK, "an unknown course says why joint density is blank", out.skipped);
  }
}
