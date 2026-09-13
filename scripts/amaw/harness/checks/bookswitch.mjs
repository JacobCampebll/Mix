/* CHECK 5 — the book switch.
 *
 * This is the check the whole suite is for. CLAUDE.md: "DesignBook and
 * PlantBook are two views of one page, not two pages. They belong in
 * designbook.html, sharing its schema renderer, CONFIG and styling." A switch
 * between two views of ONE page has two ways to go wrong that a switch between
 * two pages does not:
 *
 *  1. It destroys shared furniture. "#valBlock is ONE node that go() moves
 *     into the active step's .stepval, and renderForm() parks it in #valPark
 *     before rewriting #sections — without that park it is destroyed with the
 *     sections and every later msg($('saveMsg'), ...) writes to nothing."
 *     A view switch that rebuilds the layout is a renderForm() with a bigger
 *     blast radius, and the failure is silent in exactly the same way.
 *  2. It leaves two elements answering to one id — the named reason
 *     #advanceStage was not moved into the action bar. Two views that each
 *     own a #saveMsg, a #sections or a #stepcount is that bug at scale, and
 *     getElementById returns the first one, so half the page keeps working.
 *
 * Also asserted: switching must not lose the other book's typed values.
 * CLAUDE.md's rule for the Polish section is the precedent — "Hidden, never
 * removed: the classes and gradations already typed in stay in the DOM and in
 * the payload" — and a person who fills in a lot, looks at the design it came
 * from, and comes back to find the lot blank will not file a bug, they will
 * stop using it.
 *
 * TODAY: #bookPlant is disabled, so everything past the standing-invariant
 * case SKIPS. The standing invariants are checked anyway, because the disabled
 * button is itself a claim the page makes and it can rot.
 */
import { bookProbe, domAudit, fillForm } from "../lib/inpage.mjs";
import { enterBook, PLANT } from "../lib/books.mjs";
import { openPage, realErrors } from "../lib/page.mjs";

export const id = "bookswitch";
const BOOK = "-";     // this check is about the pair, not about one book

export async function run({ browser, results }) {
  const h = await openPage(browser, { width: 1440, height: 1000 });
  try {
    const { page, errs } = h;

    // ---- standing invariants, true today ---------------------------------
    const probe = await page.evaluate(bookProbe);
    results.ok(id, BOOK, "both books are on the switch", probe.hasSwitch,
               probe.hasSwitch ? "#bookDesign and #bookPlant present" : "switch missing");
    results.ok(id, BOOK, "exactly one book is current", probe.current === 1,
               `${probe.current} element(s) with aria-current="page"`);
    results.ok(id, BOOK, "DesignBook is the live view", probe.designOn && !probe.plantOn,
               `design .on=${probe.designOn} plant .on=${probe.plantOn}`);
    // A disabled button with no explanation is a dead end. While PlantBook is
    // unbuilt the title IS the feature.
    if (probe.plantDisabled) {
      results.ok(id, BOOK, "disabled PlantBook says why", /not built|coming|second view/i.test(probe.plantTitle),
                 probe.plantTitle || "(no title attribute)");
    }

    const before = await page.evaluate(domAudit);
    results.ok(id, BOOK, "one #valBlock before any switch", before.valBlocks === 1 && before.hasValBlock,
               `${before.valBlocks} .valblock`);

    // ---- the switch itself -----------------------------------------------
    const entered = await enterBook(page, PLANT);
    if (!entered.ok) {
      for (const kase of [
        "switching preserves the #valBlock node",
        "switching leaves no duplicate ids",
        "switching leaves no orphan controls",
        "DesignBook's values survive a round trip through PlantBook",
        "switching raises no console or page error",
      ]) results.skip(id, BOOK, kase, entered.why);
      return;
    }

    // From here on PlantBook exists. Everything below runs unedited.
    await page.evaluate(() => {
      const v = document.getElementById("valBlock");
      if (v) v.dataset.harnessTag = "kept";
    });
    // Fill DesignBook first, then switch away and back.
    await page.click("#bookDesign");
    await page.waitForTimeout(200);
    await page.evaluate(fillForm, { nominal_size: "0.38", mix_type: "B" });
    const designBefore = await page.evaluate(() => JSON.stringify(collectForm()));

    await page.click("#bookPlant");
    await page.waitForTimeout(400);
    const mid = await page.evaluate(domAudit);
    const kept = await page.evaluate(() => {
      const v = document.getElementById("valBlock");
      return { present: !!v, tagged: !!(v && v.dataset.harnessTag === "kept") };
    });
    results.ok(id, BOOK, "switching preserves the #valBlock node", kept.present && kept.tagged,
               kept.present ? (kept.tagged ? "same node, parked" : "REBUILT — every later msg() writes to nothing")
                            : "destroyed by the switch");
    results.ok(id, BOOK, "switching leaves no duplicate ids", mid.dup.length === 0,
               mid.dup.slice(0, 6).join(",") || "0 duplicates");
    results.ok(id, BOOK, "switching leaves no orphan controls", mid.orphans.length === 0,
               mid.orphans.slice(0, 6).join(",") || "0 outside #sections");

    await page.click("#bookDesign");
    await page.waitForTimeout(400);
    const designAfter = await page.evaluate(() => JSON.stringify(collectForm()));
    results.ok(id, BOOK, "DesignBook's values survive a round trip through PlantBook",
               designBefore === designAfter,
               designBefore === designAfter ? "collectForm() identical" : "the design came back changed");

    const e = realErrors(errs);
    results.ok(id, BOOK, "switching raises no console or page error", e.length === 0,
               e.slice(0, 2).join(" | ") || "0 errors");
  } finally {
    await h.close();
  }
}
