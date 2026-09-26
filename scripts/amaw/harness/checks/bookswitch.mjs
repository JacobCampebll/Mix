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
 * AND THE DOOR (2026-09-24). With no lot open, #bookPlant shows PlantBook's
 * Start a lot card IN PLACE rather than an empty lot form - a lot with no
 * approval behind it has nothing to pay against (Jake: clicking PlantBook
 * from DesignBook "should take me to this page"). The round trip below now
 * goes through that door rather than through a PlantBook form, and the door
 * restores DesignBook's screen from its own record rather than re-rendering
 * what a form switch would - so the design coming back byte-identical is
 * asserted through the door, not assumed from the old path. Watched failing:
 * with the door removed, both door cases fail and name what shows instead.
 */
import { bookProbe, domAudit, fillForm } from "../lib/inpage.mjs";
import { enterBook, PLANT } from "../lib/books.mjs";
import { openPage, realErrors, rewrittenPage } from "../lib/page.mjs";

export const id = "bookswitch";
const BOOK = "-";     // this check is about the pair, not about one book

// The appbar, measured rather than read off an attribute: `hidden` on the job
// strip was a no-op for as long as `.jobstrip{display:flex}` outranked it, so
// only the computed display says whether it is really gone. Serialized into
// the page by page.evaluate(), so it names nothing from this module.
const appbar = () => {
  const shown = (id) => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== "none"; };
  return { pill: shown("statuspill") ? document.getElementById("statuspill").textContent : null,
           saved: shown("savedstate"), jobStrip: shown("jobStrip"),
           jobH: Math.round(document.getElementById("jobStrip").getBoundingClientRect().height),
           mixid: document.getElementById("mixid").textContent };
};

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
        "PlantBook with no lot open is the Start a lot page",
        "the door takes an approval or a saved lot, never a blank",
        "the door wears no stage pill, saved-state line or contract chips",
        "back from the door, DesignBook's pill, saved-state line and chips return",
        "a page booted on PlantBook opens on the same bare door",
        "back from the door is DesignBook's form, in DesignBook's words",
        "switching preserves the #valBlock node",
        "switching keeps #vallist/#saveMsg inside it",
        "switching leaves no duplicate ids",
        "switching leaves no orphan controls",
        "DesignBook's values survive a round trip through PlantBook",
        "switching raises no console or page error",
        // The two cases below the early return run in their own contexts, so
        // they vanish on this path unless they are named here.
        "back from the door to DesignBook's upload card, its appbar is as it was",
        "back from a lot, DesignBook carries none of PlantBook's sync chip",
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

    const designBar = await page.evaluate(appbar);

    await page.click("#bookPlant");
    await page.waitForTimeout(400);
    const doorBar = await page.evaluate(appbar);
    // Start a lot is neither a lot nor a design: DesignBook's DRAFT pill, its
    // "Not downloaded yet" and three empty contract chips all read as though
    // the door were a draft of something (2026-09-26).
    results.ok(id, BOOK, "the door wears no stage pill, saved-state line or contract chips",
               doorBar.pill === null && !doorBar.saved && !doorBar.jobStrip && doorBar.jobH === 0 && !/MIX ID/.test(doorBar.mixid),
               `pill=${JSON.stringify(doorBar.pill)} saved=${doorBar.saved} chips=${doorBar.jobStrip} (${doorBar.jobH}px) mixid="${doorBar.mixid}"`);
    const door = await page.evaluate(() => {
      const vis = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains("hidden"); };
      return {
        upload: vis("uploadCard"), layout: vis("dbLayout"), bar: vis("actionBar"),
        title: (document.getElementById("uploadTitle") || {}).textContent || "",
        skipHidden: !vis("skipUpload"),
        accept: (document.getElementById("fileInput") || {}).accept || "",
        plantOn: document.getElementById("bookPlant").classList.contains("on"),
      };
    });
    results.ok(id, BOOK, "PlantBook with no lot open is the Start a lot page",
               door.upload && !door.layout && !door.bar && /start a lot/i.test(door.title) && door.plantOn,
               `upload=${door.upload} form=${door.layout} bar=${door.bar} title="${door.title}" plant.on=${door.plantOn}`);
    results.ok(id, BOOK, "the door takes an approval or a saved lot, never a blank",
               door.skipHidden && /\.pdf/.test(door.accept) && /\.json/.test(door.accept),
               `skip hidden=${door.skipHidden} accept="${door.accept}"`);
    const mid = await page.evaluate(domAudit);
    const kept = await page.evaluate(() => {
      const v = document.getElementById("valBlock");
      return { present: !!v, tagged: !!(v && v.dataset.harnessTag === "kept") };
    });
    results.ok(id, BOOK, "switching preserves the #valBlock node", kept.present && kept.tagged,
               kept.present ? (kept.tagged ? "same node, parked" : "REBUILT — every later msg() writes to nothing")
                            : "destroyed by the switch");
    results.ok(id, BOOK, "switching keeps #vallist/#saveMsg inside it", mid.valBlockIntact,
               mid.valBlockIntact ? "intact" : "hollow — the switch emptied it");
    results.ok(id, BOOK, "switching leaves no duplicate ids", mid.dup.length === 0,
               mid.dup.slice(0, 6).join(",") || "0 duplicates");
    results.ok(id, BOOK, "switching leaves no orphan controls", mid.orphans.length === 0,
               mid.orphans.slice(0, 6).join(",") || "0 outside #sections");

    await page.click("#bookDesign");
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => {
      const vis = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains("hidden"); };
      return { upload: vis("uploadCard"), layout: vis("dbLayout"),
               title: (document.getElementById("uploadTitle") || {}).textContent || "" };
    });
    results.ok(id, BOOK, "back from the door is DesignBook's form, in DesignBook's words",
               back.layout && !back.upload && !/start a lot/i.test(back.title),
               `form=${back.layout} upload=${back.upload} card title="${back.title}"`);
    const backBar = await page.evaluate(appbar);
    results.ok(id, BOOK, "back from the door, DesignBook's pill, saved-state line and chips return",
               backBar.pill === designBar.pill && backBar.pill !== null && backBar.saved === designBar.saved
                 && backBar.jobStrip && backBar.jobH === designBar.jobH && backBar.mixid === designBar.mixid,
               `pill ${JSON.stringify(designBar.pill)}->${JSON.stringify(backBar.pill)} saved ${designBar.saved}->${backBar.saved} ` +
               `chips ${designBar.jobH}px->${backBar.jobH}px mixid "${backBar.mixid}"`);
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

  // ---- a page booted straight onto PlantBook ---------------------------
  // boot()'s own door rather than the switch's. Only showLotDoor() painted the
  // door's appbar, so this one kept the markup's "MIX ID · —" and DesignBook's
  // DRAFT pill. openPage() waits for a form this page never draws, so it is
  // opened by hand and waited on the door itself.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const p = await ctx.newPage();
    const bootErrs = [];
    p.on("pageerror", (err) => bootErrs.push("pageerror: " + String(err)));
    p.on("console", (m) => { if (m.type() === "error") bootErrs.push("console: " + m.text()); });
    await p.goto(`file://${rewrittenPage().file}?book=plantbook`);
    await p.waitForFunction(() => typeof state !== "undefined" && state.bookDoor === true, null, { timeout: 15000 });
    await p.waitForTimeout(300);
    const bar = await p.evaluate(appbar);
    const be = realErrors(bootErrs);
    results.ok(id, BOOK, "a page booted on PlantBook opens on the same bare door",
               bar.pill === null && !bar.saved && !bar.jobStrip && bar.jobH === 0 && /^LOT/.test(bar.mixid) && be.length === 0,
               `pill=${JSON.stringify(bar.pill)} saved=${bar.saved} chips=${bar.jobStrip} (${bar.jobH}px) mixid="${bar.mixid}"` +
               (be.length ? ` errors: ${be.slice(0, 2).join(" | ")}` : ""));
  } finally {
    await ctx.close();
  }

  // ---- the door from DesignBook's upload card, and back ----------------
  // switchBook()'s other return path: no form behind the door, so nothing
  // re-renders on the way back and closeLotDoor() alone has to put the pill
  // and the saved-state line back as they were - not repainted, or the legacy
  // card would come back saying things it never said.
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const p = await ctx2.newPage();
    await p.goto(`file://${rewrittenPage().file}?mode=legacy&cid=262120&letting=2026-02-19&plant=AMP070301`);
    await p.waitForFunction(() => typeof state !== "undefined" && state.caps
      && !document.getElementById("uploadCard").classList.contains("hidden"), null, { timeout: 15000 });
    await p.waitForTimeout(300);
    const card = await p.evaluate(appbar);
    const cardText = await p.evaluate(() => document.getElementById("savedstate").textContent);
    await p.click("#bookPlant"); await p.waitForTimeout(300);
    await p.click("#bookDesign"); await p.waitForTimeout(300);
    const again = await p.evaluate(appbar);
    const againText = await p.evaluate(() => document.getElementById("savedstate").textContent);
    results.ok(id, BOOK, "back from the door to DesignBook's upload card, its appbar is as it was",
               JSON.stringify(card) === JSON.stringify(again) && cardText === againText && card.pill !== null,
               `before ${JSON.stringify(card)} "${cardText}" / after ${JSON.stringify(again)} "${againText}"`);
  } finally {
    await ctx2.close();
  }

  // ---- a lot open, then back to DesignBook -------------------------------
  // The sync chip is a LOT's. DesignBook's designs are never stored
  // (2026-09-04), so a green "saved" there - beside DesignBook's own "Not
  // downloaded yet" - was the contradiction PlantBook's saved-state fix
  // removed, mirrored onto the other book: switchBook() repainted the
  // incoming book's saved-state line and not the chip.
  const h3 = await openPage(browser, { width: 1440, height: 1000 });
  try {
    await h3.page.click("#bookPlant");
    await h3.page.waitForTimeout(400);
    const lotChip = await h3.page.evaluate(async (approval) => {
      const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
      openLotEnvelope(out.lot, "the harness");
      await new Promise((r) => setTimeout(r, 1500));
      const c = document.getElementById("syncChip");
      return c.classList.contains("hidden") ? null : c.textContent;
    }, CHIP_APPROVAL);
    await h3.page.click("#bookDesign");
    await h3.page.waitForTimeout(400);
    const design = await h3.page.evaluate(() => {
      const c = document.getElementById("syncChip");
      return { hidden: c.classList.contains("hidden") || getComputedStyle(c).display === "none",
               text: c.textContent, saved: document.getElementById("savedstate").textContent };
    });
    await h3.page.click("#bookPlant");
    await h3.page.waitForTimeout(400);
    const lotAgain = await h3.page.evaluate(() => {
      const c = document.getElementById("syncChip");
      return c.classList.contains("hidden") ? null : c.textContent;
    });
    results.ok(id, BOOK, "back from a lot, DesignBook carries none of PlantBook's sync chip",
               lotChip === "saved" && design.hidden && lotAgain === "saved",
               `lot's chip="${lotChip}" -> DesignBook's chip hidden=${design.hidden} ("${design.text}"), ` +
               `saved-state "${design.saved}" -> back on the lot "${lotAgain}"`);
  } finally {
    await h3.close();
  }

  // ---- a keystroke on the autosave timer, then the switch ----------------
  // The autosave is debounced, and the timer used to fire after the switch:
  // saveLotNow() -> lotSnapshot() -> collectForm() read the schema ON SCREEN,
  // so the stored lot - here and on the server - became DesignBook's tables,
  // with the tickets gone and the tonnage back at its seed (measured
  // 2026-09-26). The switch flushes the pending save first now.
  const h4 = await openPage(browser, { width: 1440, height: 1000, query: "&sublots=open" });
  try {
    await h4.page.click("#bookPlant");
    await h4.page.waitForTimeout(400);
    const out = await h4.page.evaluate(async (approval) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const o = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
      openLotEnvelope(o.lot, "the harness");
      await sleep(1500);
      const uid = state.lot.uid;
      const tons = document.querySelector('[data-field="lot_tons"]');
      tons.value = "4123";
      tons.dispatchEvent(new Event("input", { bubbles: true }));
      tons.dispatchEvent(new Event("change", { bubbles: true }));
      const truck = document.querySelector('[data-row="sublot_tickets"][data-col="truck"]');
      truck.value = "T-SWITCH";
      truck.dispatchEvent(new Event("input", { bubbles: true }));
      const pending = !!lotSaveTimer;
      switchBook("designbook");
      await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 1500);
      const pick = (x) => x ? { tons: x.values && x.values.lot_tons,
                                tickets: ((x.rows || {}).sublot_tickets || []).map((t) => t.truck),
                                designTable: !!(x.rows || {}).tsr_specimens } : null;
      const local = state.store && state.store.local ? await state.store.local.load(uid) : null;
      return { pending, book: state.book, server: pick(window.__HARNESS_AMAW.amaw_lot_data[uid]), local: pick(local) };
    }, CHIP_APPROVAL);
    const good = (x) => !!x && String(x.tons) === "4123" && x.tickets.includes("T-SWITCH") && !x.designTable;
    results.ok(id, BOOK, "a switch inside the autosave debounce saves the LOT, not DesignBook's form",
               out.pending && out.book === "designbook" && good(out.server) && good(out.local),
               `pending=${out.pending} book=${out.book} server=${JSON.stringify(out.server)} local=${JSON.stringify(out.local)}`);
  } finally {
    await h4.close();
  }
}

// Just enough of an approval for PB_LOT.lotFromApproval() to open a lot.
const CHIP_APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};
