/* CHECK 9 — PlantBook's lot-to-lot door.
 *
 * Jake, 2026-09-16, on how a technician gets from lot 7 to lot 8 over a
 * 44,000-ton line item: the previous lot's own file is a richer starting
 * point than the approval it came from, so "Start lot n+1" rolls it forward.
 *
 * THE RULE is `PB_LOT.rollForwardLot()` — pure, and held to the schema by
 * check_rollforward.mjs (which poisons every non-frame cell with a sentinel
 * and proves none survives) and by check_page_plantbook.mjs (which proves the
 * page's copy refuses to carry exactly the same things). What THIS check
 * defends is the part that only exists once there is a DOCUMENT: that the
 * frame survives a round trip through the real DOM and `collectForm()`, and
 * that not one measured value does.
 *
 * WHY IT IS NOT ENOUGH TO ASK WHETHER THE CELLS ARE EMPTY, which is what two
 * earlier drafts of this check asked and got wrong in the direction that made
 * the PAGE look broken — the fourth time this project has recorded that:
 *
 *   - `sublot_verified` is a SCHEMA SEED. A hand-written list of "identity
 *     columns to ignore" missed it and reported a leak where there was none.
 *   - The painted identities SHOULD change. `sublot: "2-1"` and
 *     `core_id: "2-1-A"` are built from the NEW lot number, so the fact that
 *     they differ from lot 1 is proof the roll worked, not evidence against.
 *   - `ac_method` is seeded "Ignition Furnace" on EVERY lot, so it matches
 *     lot 1 by collision rather than by carrying.
 *
 * So the assertion is the sentinel one against real data: collect lot 1's own
 * measured values, roll forward, and assert none of them appear — minus
 * anything sections.mjs seeds, which both lots get for free.
 */
import { withBook, PLANT } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";
import { fillForm } from "../lib/inpage.mjs";

export const id = "nextlot";
const BOOK = "PlantBook";

const APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};

// Everything the page collects that is a MEASUREMENT rather than the frame.
// Named by table here because this runs inside the page and the derivation
// lives in a module; check_rollforward.mjs is where the schema-enumerated
// version of this question is asked, and it is the stronger of the two.
const MEASURED = ["sublot_bsg", "sublot_msg", "sublot_moisture", "sublot_tickets",
                  "sublot_volumetrics", "mat_cores", "joint_cores", "handmix_msg",
                  "verification", "verify_bsg", "verify_msg", "verify_moisture",
                  "verify_volumetrics"];

const READ = ({ approval, measured }) => {
  const seed = () => {
    const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
    state.lot = out.lot; state.lotReport = out.report;
    state.extracted = { scalars: out.lot.values, tables: out.lot.rows };
    state.sources = out.lot.extracted_from || {}; state.history = [];
    state.job = { cid: out.lot.contract_id, letting: "2026-02-19", plant: out.lot.amp_number };
    state.stageIdx = 0;
    renderForm();
  };

  // Every value a lot's measurement tables hold, excluding the identity
  // columns the page PAINTS from the lot number (which must change) and
  // anything the schema seeds (which both lots get regardless).
  const IDENTITY = ["sublot", "specimen", "core_id", "determination", "record", "sublot_verified"];
  const seededCells = () => {
    const out = new Set();
    for (const sec of PB_SECTIONS.SECTIONS) {
      const rs = Array.isArray(sec.rows) ? sec.rows : sec.rows ? [sec.rows] : [];
      for (const r of rs) {
        for (const row of r.seed || []) for (const [c, v] of Object.entries(row)) out.add(`${r.key}.${c}=${v}`);
        for (const c of r.columns || []) if (c.seed !== undefined) out.add(`${r.key}.${c.key}=${c.seed}`);
      }
    }
    return out;
  };
  const cells = (rows) => {
    const out = new Set();
    for (const k of measured) for (const row of rows[k] || [])
      for (const [c, v] of Object.entries(row)) {
        if (v == null || v === "" || IDENTITY.includes(c)) continue;
        out.add(`${k}.${c}=${v}`);
      }
    return out;
  };

  seed();
  fillFormFn({ nominal_size: "0.38", mix_type: "B" });
  const before = collectForm();
  const wasCells = cells(before.rows);
  const beforeLot = Number(state.lot.lot_number);
  // THE FRAME IS COMPARED BEFORE-TO-AFTER, never against constants written
  // into this file. fillForm() fills EVERY control it can, the frame fields
  // included, so the contract on screen is junk by the time the roll happens
  // - and carrying that junk faithfully is the door working. An earlier draft
  // asserted `contract === "262120"` and failed on a page that was right.
  // Same trap one step along: the synthetic approval here supplies no
  // gradation and no JMF %AC, so asserting they are non-null tested the
  // fixture rather than the page.
  const frameOf = (f) => ({
    scalars: Object.fromEntries(Object.keys(f.values)
      .filter((k) => PB_LOT.frameFields().has(k))
      .map((k) => [k, f.values[k]])),
    // `pct` is EXCLUDED because it is deliberately re-seeded from
    // `design_pct` rather than carried - the next lot starts on the design's
    // own percentage again. Demanding it identical asserted the opposite of
    // the rule and failed on a page doing exactly what it should; the reset
    // itself is asserted separately below.
    blend: (f.rows.blend_pct || []).map((r) => {
      const { pct, ...rest } = r; return JSON.stringify(rest);
    }).join("|"),
    items: (f.rows.project_items || []).map((r) => JSON.stringify(r)).join("|"),
  });
  const frameBefore = frameOf(before);
  const designBefore = JSON.stringify((state.lot.values || {}).design || null);

  const realConfirm = window.confirm;
  window.confirm = () => true;
  let error = null;
  try { startNextLot(); } catch (e) { error = String(e); }
  window.confirm = realConfirm;

  const after = collectForm();
  const frameAfter = frameOf(after);
  // blend_pct.pct is re-seeded from design_pct rather than carried, so it is
  // compared on its own terms below rather than demanded identical.
  const frameDrift = Object.keys(frameBefore.scalars)
    .filter((k) => String(frameBefore.scalars[k]) !== String(frameAfter.scalars[k]));
  const seeded = seededCells();
  const leaked = [...cells(after.rows)].filter((x) => wasCells.has(x) && !seeded.has(x));
  const design = (state.lot.values || {}).design || null;

  return {
    error,
    beforeLot, afterLot: Number(state.lot.lot_number),
    filledBefore: wasCells.size,
    leaked,
    gradLeak: Object.keys(after.values).filter((k) => /^sub\d_/.test(k) && after.values[k] != null).length,
    frameCount: Object.keys(frameBefore.scalars).length,
    frameDrift,
    blendSame: frameBefore.blend === frameAfter.blend,
    itemsSame: frameBefore.items === frameAfter.items,
    mixId: state.lot.mix_id,
    pctFromDesign: (after.rows.blend_pct || []).every((r) =>
      r.design_pct == null || String(r.pct) === String(r.design_pct)),
    designSame: designBefore === JSON.stringify(design),
    designPresent: !!design,
    verification: design && design.approval ? design.approval.verification.state : null,
    handmix: after.values.lot_gse, wedge: after.values.lot_wedge_tons,
    // The whole reason the number matters: lot 1 sublot 1 carries the
    // "*For Sublot # 1 Only" pay allowance and nothing else on the job does.
    setupAllowance: PB_PAY.lotPay({ ...lotPayInputs(), lotNumber: Number(state.lot.lot_number) }),
    rowCounts: Object.fromEntries(Object.entries(after.rows).map(([k, v]) => [k, v.length])),
  };
};

export async function run({ browser, results }) {
  const ok = (what, cond, detail) => results.add(id, BOOK, what, cond ? "PASS" : "FAIL", detail);

  const out = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => {
      // fillForm is serialized separately, so it is handed in rather than
      // imported inside the page — the same rule inpage.mjs states.
      await h.page.addScriptTag({ content: `window.fillFormFn = ${fillForm.toString()};` });
      const r = await h.page.evaluate(READ, { approval: APPROVAL, measured: MEASURED });
      return { r, errs: realErrors(h.errors || []) };
    });

  if (out.skipped) { results.skip(id, BOOK, "start the next lot", out.skipped); return; }
  const r = out.value.r;

  ok("startNextLot() runs without throwing", !r.error, r.error || "no exception");
  ok("the lot number is derived, not typed", r.afterLot === r.beforeLot + 1,
     `lot ${r.beforeLot} -> ${r.afterLot}`);
  ok("the previous lot really was full, so the negative below means something",
     r.filledBefore > 50, `${r.filledBefore} measured cells before the roll`);

  // THE one that matters.
  ok("not one of the previous lot's measured values survives",
     r.leaked.length === 0, r.leaked.length ? r.leaked.slice(0, 4).join(" | ") : `0 of ${r.filledBefore}`);
  ok("…nor any of its sublot gradation weights", r.gradLeak === 0, `${r.gradLeak} non-null sub*_ keys`);
  ok("…nor the hand-mixed check sample, which the sublot LOCK calls lot-level",
     r.handmix == null, `lot_gse=${JSON.stringify(r.handmix)}`);
  ok("…nor the wedge tonnage this lot placed", r.wedge == null, `lot_wedge_tons=${JSON.stringify(r.wedge)}`);

  // …and the other way round, or the door would be pointless. Compared
  // before-to-after, so this tests the PAGE rather than the fixture.
  ok("every frame scalar comes through the DOM unchanged",
     r.frameDrift.length === 0, r.frameDrift.length
       ? `drifted: ${r.frameDrift.join(", ")}` : `${r.frameCount} frame scalars identical`);
  ok("the mix id follows the lot", r.mixId === "00260467", `mix_id=${r.mixId}`);
  ok("the approval's design block travels whole and unaltered",
     r.designPresent && r.designSame, `present=${r.designPresent} identical=${r.designSame}`);
  ok("…including the verification state as it was CHECKED, not re-derived",
     r.verification != null, `verification=${r.verification}`);
  ok("the blend's component identity and the project items carry",
     r.blendSame && r.itemsSame,
     `blend identical (pct aside)=${r.blendSame} project items identical=${r.itemsSame}`);
  ok("blend_pct.pct is re-seeded from design_pct, not left blank",
     r.pctFromDesign, `every row pct === design_pct: ${r.pctFromDesign}`);

  // The measurement tables come back at their SEEDED length, exactly as a
  // brand-new lot has them - absent and empty must not look the same.
  ok("the measurement tables are re-seeded, not dropped",
     MEASURED.filter((k) => (r.rowCounts[k] || 0) > 0).length >= 8,
     JSON.stringify(r.rowCounts));

  ok("clean console", out.value.errs.length === 0, `${out.value.errs.length} errors`);
}
