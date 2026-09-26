/* The two books, and how the harness gets into one of them.
 *
 * CLAUDE.md: "DesignBook and PlantBook are two views of one page, not two
 * pages. They belong in designbook.html, sharing its schema renderer, CONFIG
 * and styling." So every check in this suite is written once and run per
 * book — which is the whole point of the harness. A check that only ever ran
 * against DesignBook would not notice the second view breaking the first.
 *
 * THE GATE. PlantBook is not spliced in yet: `#bookPlant` sits in the appbar
 * `disabled`, with a title saying so, and login.html / portal.html both carry
 * `built: false`. While that is true every PlantBook case SKIPS with that as
 * its reason. The moment the button is enabled they start running, and no
 * check has to be edited for that to happen.
 */
import { openPage } from "./page.mjs";
import { bookProbe } from "./inpage.mjs";

export const DESIGN = { key: "design", label: "DesignBook" };
export const PLANT = { key: "plant", label: "PlantBook" };
export const BOOKS = [DESIGN, PLANT];

/* Put the page into `book`. Returns { ok } or { ok:false, why } — never
 * throws, because "not built yet" is a normal answer here, not an error. */
export async function enterBook(page, book) {
  if (book.key === "design") return { ok: true };
  const before = await page.evaluate(bookProbe);
  if (!before.hasSwitch) return { ok: false, why: "no #bookDesign/#bookPlant switch on the page" };
  if (before.plantDisabled) {
    return { ok: false, why: "#bookPlant is disabled — PlantBook is not spliced into designbook.html yet" };
  }
  // The only thing the harness may assume about a view it has not seen: the
  // switch is a button and clicking it switches. Everything else is measured.
  await page.click("#bookPlant");
  // With no lot open the switch now shows PlantBook's Start a lot door rather
  // than an empty lot form (switchBook, Jake 2026-09-24), and DesignBook's
  // sections stay in #sections, hidden. The checks that call this measure the
  // RENDERER - ids, steps, clipping, headings, the round trip - not the way
  // in, so they get the empty PlantBook form the switch used to draw, opened
  // here on purpose and nowhere in the page. The door itself is asserted by
  // checks/bookswitch.mjs, and lotstore/compaction/nextlot/sublotlocks each
  // open their own lot through openLotEnvelope(), the real front door.
  await page.evaluate(() => {
    if (!state.bookDoor) return;
    state.bookDoor = false;
    // The door hides the stage pill and the saved-state line (paintDoorChrome,
    // 2026-09-26) and enterForm() brings them back; this opens a form by hand,
    // so it has to do the same or every PlantBook case measures an appbar no
    // real lot has.
    if (typeof paintDoorChrome === "function") paintDoorChrome();
    show("uploadCard", false);
    show("dbLayout", true);
    show("actionBar", true);
    document.getElementById("jobStrip").hidden = false;
    bookRestore("plantbook");
    renderForm();
    document.getElementById("mixid").textContent = designLabel();
  });
  await page.waitForFunction(() => document.querySelectorAll("#sections .section").length > 0,
                             null, { timeout: 10000 }).catch(() => {});
  const after = await page.evaluate(bookProbe);
  if (!after.plantOn) return { ok: false, why: "clicked #bookPlant but it did not become the current book" };
  return { ok: true };
}

/* Open a page, enter the book, run fn, always close.
 * fn receives the open page handle ({ page, errs, ... }). */
export async function withBook(browser, book, opts, fn) {
  const h = await openPage(browser, opts);
  try {
    const entered = await enterBook(h.page, book);
    if (!entered.ok) return { skipped: entered.why };
    return { value: await fn(h) };
  } finally {
    await h.close();
  }
}
