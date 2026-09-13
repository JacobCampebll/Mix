/* CHECK 3 — every number a person sees is a VISIBLE position.
 *
 * WHAT IT DEFENDS (CLAUDE.md, "DesignBook is two shapes"):
 *  - "state.step is the index into CONFIG.SECTIONS, not the visible position:
 *    a hidden section (Polish on a Type D mix) is skipped by Next/Back and
 *    left out of both numerals, so that mix reads 'Step 5 of 9'."
 *  - "Every number a person sees is a VISIBLE position, and it is painted in
 *    one place — paintStepChrome(), called from the END of recompute() rather
 *    than from go(). Both halves of that matter and both were got wrong first
 *    time: numbering the rail's dots from the CONFIG.SECTIONS index gave a
 *    rail reading 1,2,3,4,6,7 beside a bar reading 'Step 5 of 9' ... and
 *    painting from inside go() read the counts before applyPolishVisibility()
 *    had run ... so the first paint always said 'of 10' beside nine chips."
 *  - "A section with `into` is not a step — topSections() is what the rail,
 *    the numerals and state.step count."
 *  - "because the section is hidden before Nominal size is typed, a brand-new
 *    design is eight steps until the mix type is chosen."
 *
 * The three cases below are exactly those three states: a blank design, a
 * Type B (Polish shows), a Type D (Polish hides). A second view in the same
 * page inherits this chrome, so it inherits the trap.
 *
 * FIRST PAINT is checked separately and on purpose: the "of 10 beside nine
 * chips" bug only ever showed on the very first paint, before anyone touched
 * anything.
 */
import { stepAudit, fillForm } from "../lib/inpage.mjs";
import { withBook } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";

export const id = "steps";

const CASES = [
  { name: "blank design", set: null, expectPolishHidden: true },
  { name: "Type B (polish shows)", set: { nominal_size: "0.38", mix_type: "B" }, expectPolishHidden: false },
  { name: "Type D (polish hides)", set: { nominal_size: "0.38", mix_type: "D" }, expectPolishHidden: true },
];

/* Read one audit and say what is wrong with it. Returns two lists, kept
 * apart deliberately: the rail-and-bar pair is ONE thing paintStepChrome()
 * owns, while the kicker in the section's navy band is a third readout that
 * has already been wrong once on its own (commit bc10e99, 2026-09-13: the
 * band said "Step 5 of 9" over a bar saying "Step 4 of 8" on every Type D
 * mix and on every untouched new design, because renderForm() wrote it from
 * the CONFIG.SECTIONS index). Reported on one line, a regression in either
 * would hide behind the other. */
function verdict(a, { wizard }) {
  const problems = [], kicker = [];
  // 1. The rail's numerals are 1..V over the visible sections, in order, and
  //    a hidden section has no numeral at all.
  let n = 0;
  for (const d of a.dots) {
    if (d.secHidden) {
      if (d.numeral !== "") problems.push(`hidden ${d.section} numbered "${d.numeral}"`);
      if (!d.railHidden) problems.push(`hidden ${d.section} still has a rail chip`);
    } else {
      n++;
      if (d.numeral !== String(n)) problems.push(`${d.section} numeral "${d.numeral}" should be ${n}`);
      if (d.railHidden) problems.push(`visible ${d.section} has no rail chip`);
    }
  }
  if (n !== a.visible) problems.push(`rail numbered ${n} steps, ${a.visible} sections visible`);
  if (!wizard) return { rail: problems.join("; "), kicker: "" };

  // 2. The action bar agrees with the rail, on both numbers.
  if (a.barTotal !== a.visible) problems.push(`bar says "of ${a.barTotal}", ${a.visible} visible`);
  const cur = a.dots.find((d) => d.current);
  if (!cur) problems.push("no current rail chip");
  else if (String(a.barPos) !== cur.numeral) problems.push(`bar "Step ${a.barPos}" vs rail dot "${cur.numeral}"`);

  // 3. The kicker in the active section's navy band is the third place a
  //    person reads this number, and it has to say the same thing.
  if (a.kickerVisible && a.kickerPos != null) {
    if (a.kickerPos !== a.barPos) kicker.push(`${a.activeSection}: band "Step ${a.kickerPos}" vs bar "Step ${a.barPos}"`);
    if (a.kickerTotal !== a.barTotal) kicker.push(`${a.activeSection}: band "of ${a.kickerTotal}" vs bar "of ${a.barTotal}"`);
  }
  return { rail: problems.join("; "), kicker: kicker.join("; ") };
}

export async function run({ browser, results, books }) {
  for (const book of books) {
    // ---- first paint, untouched ------------------------------------------
    const first = await withBook(browser, book, { width: 1440, height: 1000 }, async ({ page, errs }) => {
      const a = await page.evaluate(stepAudit);
      return { a, errs: realErrors(errs) };
    });
    if (first.skipped) {
      results.skip(id, book.label, "all cases", first.skipped);
      continue;
    }
    {
      const { a } = first.value;
      const v = verdict(a, { wizard: true });
      results.ok(id, book.label, "first paint: rail and bar agree", v.rail === "",
                 v.rail || `${a.barText.trim()} / ${a.visible} visible`);
      results.ok(id, book.label, "first paint: section band agrees", v.kicker === "",
                 v.kicker || a.kickerText || "no kicker on screen");
    }

    // ---- the three mix states, every step of each -------------------------
    for (const c of CASES) {
      const out = await withBook(browser, book, { width: 1440, height: 1000 }, async ({ page, errs }) => {
        if (c.set) await page.evaluate(fillForm, c.set);
        await page.waitForTimeout(120);
        // One step per round trip rather than a loop inside the page: the
        // audit has to be read AFTER recompute() has painted, and stepping
        // out to Node between go() calls is the plainest way to be sure of
        // that ordering.
        const n = await page.evaluate(() => topSections().length);
        const walked = [];
        for (let i = 0; i < n; i++) {
          await page.evaluate((k) => go(k, null, false), i);
          await page.waitForTimeout(25);
          walked.push(await page.evaluate(stepAudit));
        }
        return { walked, errs: realErrors(errs) };
      });
      if (out.skipped) continue;   // already reported once above
      const { walked, errs } = out.value;
      const v = walked.map((a) => verdict(a, { wizard: true }));
      const railBad = v.map((x) => x.rail).filter(Boolean);
      const kickBad = v.map((x) => x.kicker).filter(Boolean);
      const a0 = walked[0];
      results.ok(id, book.label, `${c.name}: rail and bar agree on every step`, railBad.length === 0,
                 railBad.slice(0, 2).join(" | ") || `${walked.length} steps, "${a0.barText.trim()}"`);
      results.ok(id, book.label, `${c.name}: section band agrees on every step`, kickBad.length === 0,
                 kickBad.slice(0, 2).join(" | ") || `all ${walked.length} bands match the bar`);
      const polishHidden = a0.hidden.includes("polish");
      results.ok(id, book.label, `${c.name}: polish step ${c.expectPolishHidden ? "hidden" : "shown"}`,
                 polishHidden === c.expectPolishHidden,
                 `visible ${a0.visible} of ${a0.sections}; hidden: ${a0.hidden.join(",") || "none"}`);
      results.ok(id, book.label, `${c.name}: clean console`, errs.length === 0,
                 errs.slice(0, 2).join(" | ") || "0 errors");
    }

    // ---- the phone shape: no action bar, but the rail still counts --------
    const phone = await withBook(browser, book, { width: 390, height: 844 }, async ({ page, errs }) => {
      await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "D" });
      await page.waitForTimeout(150);
      const a = await page.evaluate(stepAudit);
      return { a, errs: realErrors(errs) };
    });
    if (!phone.skipped) {
      const { a } = phone.value;
      const v = verdict(a, { wizard: false });
      results.ok(id, book.label, "390px rail numerals are visible positions", v.rail === "",
                 v.rail || `${a.visible} visible, ${a.hidden.length} hidden`);
    }
  }
}
