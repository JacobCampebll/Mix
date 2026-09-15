/* CHECK 8 — PlantBook's sublot locks.
 *
 * Jake, 2026-09-15: "we don't want people to be able to jump to future
 * sublots... Only Lot 1, sublot 1 is the set up so in theory its always
 * unlocked."
 *
 * A sublot is 1,000 tons (2026 Std Spec 402.03.02 A)) and its sample is taken
 * at a point chosen at random inside that tonnage, so sublot 3 cannot be
 * recorded before sublot 3's material exists. The tool that draws those points
 * is not built yet, so today a locked sublot stays locked and says so.
 *
 * The RULE itself is pure and lives in sections.mjs; check_sections.mjs holds
 * it to the section ids it has to match and check_page_plantbook.mjs proves
 * the page's copy has not drifted. What THIS check defends is the part that
 * only exists once there is a document: what the page DOES with the answer.
 *
 * THE ONE ASSERTION THAT MATTERS MOST IS NOT ABOUT LOCKING AT ALL.
 * The four Sublot tabs render one shared row table as four `[data-rowlist]`
 * blocks and collectForm() concatenates them IN DOM ORDER (sliceIndices,
 * PR #19). So if a locked tab ever stopped rendering its rows - which is the
 * obvious way to build a placeholder - the list would shorten, every later
 * tab's slice would read somebody else's rows, and those measurements would
 * vanish from the generated AMAW. That failure is silent in exactly the way
 * this project keeps rediscovering, so "locked changes nothing about what is
 * collected" is asserted directly, both ways round.
 *
 * WHY THE LOT-LEVEL EXEMPTION IS HERE TOO. Aggregate Blend and the hand-mixed
 * check sample sit on Sublot 1's tab (Andrew, 2026-09-14) but describe the
 * LOT. On lot 2, where sublot 1 is gated like any other, locking them with it
 * would leave the lot with no way to state its own blend - a form nobody can
 * fill in, reached only by typing "2" into a box on a different step.
 */
import { withBook, PLANT } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";

export const id = "sublotlocks";
const BOOK = "PlantBook";

/* Seed a lot without needing an approval PDF on disk: PB_LOT.lotFromApproval()
 * is the real intake and `openApprovalForLot()`'s own landing code is what
 * puts it on screen, so this is the same path a technician takes minus the
 * file. A synthetic approval keeps the check runnable in a fresh clone. */
const APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};

const inPage = async (page, fn, arg) => page.evaluate(fn, arg);

/* One reading of every sublot tab. Everything here is measured off the real
 * document rather than asked of the predicate, because the predicate already
 * has two checks of its own and what can still go wrong is the wiring. */
const READ = (approval) => {
  const seed = () => {
    const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
    state.lot = out.lot; state.lotReport = out.report;
    state.extracted = { scalars: out.lot.values, tables: out.lot.rows };
    state.sources = out.lot.extracted_from || {}; state.history = [];
    state.job = { cid: out.lot.contract_id, letting: "2026-02-19", plant: out.lot.amp_number };
    state.stageIdx = 0;
    renderForm();
  };
  const tabs = () => {
    const o = {};
    document.querySelectorAll("#sections .section").forEach((sec) => {
      const sid = sec.dataset.section;
      if (!/^sublot-[1-4]$/.test(sid)) return;
      const card = sec.querySelector(".steplock");
      const ctl = Array.from(sec.querySelectorAll("input,select,textarea"));
      // Derived from the page's own two exemption lists rather than named
      // here. Hardcoding them went stale within a day: Andrew's PR #24 turned
      // Aggregate Blend from a sub-section into row tables, and this probe
      // went on passing while quietly measuring only the hand-mix. What is
      // under test is that the page leaves these ENABLED inside a locked tab;
      // that the lists name real things is check_page_plantbook.mjs's job.
      const subs = new Set(PB_SECTIONS.LOT_LEVEL_SUBBLOCKS);
      const tbls = new Set(PB_SECTIONS.LOT_LEVEL_ROW_TABLES);
      const lotLevel = (el) => {
        const sub = el.closest("[data-subsection]");
        if (sub && subs.has(sub.dataset.subsection)) return true;
        const list = el.closest("[data-rowlist]");
        return !!(list && tbls.has(list.dataset.rowlist));
      };
      o[sid] = {
        locked: sec.classList.contains("locked"),
        rail: !!document.querySelector(`.railstep[data-target="${sid}"].locked`),
        cardShown: !!card && !card.hidden,
        holding: !!card && card.className.includes("holding"),
        text: card ? card.textContent.trim() : "",
        ownDisabled: ctl.filter((e) => !lotLevel(e)).every((e) => e.disabled),
        lotLevelCount: ctl.filter(lotLevel).length,
        lotLevelOpen: ctl.filter(lotLevel).every((e) => !e.disabled),
        domRows: sec.querySelectorAll("[data-rowlist] > *").length,
        // blend_pct is sliced six rows per tab so each sublot edits its own
        // percentage (Andrew, PR #24). That makes it this sublot's data, so
        // it MUST lock with the tab - exempting it would leave a future
        // sublot editable through the one door the lock exists to close.
        pctDisabled: Array.from(sec.querySelectorAll('[data-rowlist="blend_pct"] [data-col="pct"]'))
          .every((e) => e.disabled),
        pctCount: sec.querySelectorAll('[data-rowlist="blend_pct"] [data-col="pct"]').length,
      };
    });
    return o;
  };
  const collected = () => JSON.stringify(collectForm().rows);
  // Every rendered row, per shared table key, SUMMED across the four blocks -
  // the same sum collectForm() walks. Compared between the locked and unlocked
  // states rather than against the payload: collectForm() drops an all-empty
  // row by design, so a blank blend legitimately collects 0 of its 6, and a
  // check that read that as a gap would be testing that rule instead of this
  // one.
  const domRowCounts = () => {
    const n = {};
    document.querySelectorAll("[data-rowlist]").forEach((l) => {
      n[l.dataset.rowlist] = (n[l.dataset.rowlist] || 0) + l.children.length;
    });
    return n;
  };
  const setLot = (v) => {
    const el = document.querySelector('[data-field="lot_number"]');
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // READ toggles the bypass to compare states, so remember what this page was
  // actually loaded with and put it back - otherwise the ?sublots=open case
  // reads a payload built as an ordinary technician and the stamp looks broken
  // when it is the probe that moved.
  const wasOpen = state.sublotsOpen;
  // What the SCHEMA says each shared table should render, in total, across its
  // four blocks. check_sections.mjs proves the slices union to the seed exactly
  // once; this proves the DOCUMENT honours that. Absolute rather than a
  // locked-vs-open comparison, because a change that drops rows in BOTH states
  // is invisible to a comparison and is exactly how a placeholder gets built.
  const seedLengths = () => {
    const want = {};
    for (const sec of activeSections()) {
      for (const spec of (Array.isArray(sec.rows) ? sec.rows : [])) {
        if (!spec.fixed || !Array.isArray(spec.sliceIndices)) continue;
        want[spec.key] = (spec.seed || []).length;
      }
    }
    return want;
  };
  seed();
  const r = {};
  r.want = seedLengths();
  r.lot1 = tabs();
  r.collectedLocked = collected();
  r.domLocked = domRowCounts();

  // Unlock everything WITHOUT touching the lot number: every core id is built
  // from it, so changing it legitimately changes rows and would make the
  // invariance test below lie about what locking did.
  state.sublotsOpen = true; recompute();
  r.bypassed = tabs();
  r.collectedOpen = collected();
  r.domOpen = domRowCounts();
  state.sublotsOpen = false; recompute();
  r.collectedRelocked = collected();

  // Lot 2: the setup exemption is lot 1's only.
  setLot(2);
  r.lot2 = tabs();
  setLot(1);

  // The third state - locked while carrying data. Type a real measurement
  // into sublot 3 with the bypass on, then become an ordinary technician.
  state.sublotsOpen = true; recompute();
  const cell = document.querySelector('[data-section="sublot-3"] [data-col="wt_air"]');
  cell.value = "4821.7";
  cell.dispatchEvent(new Event("input", { bubbles: true }));
  cell.dispatchEvent(new Event("change", { bubbles: true }));
  const marked = () => (collectForm().rows.sublot_bsg || []).filter((x) => x.wt_air === "4821.7").length;
  r.markedWhileOpen = marked();
  state.sublotsOpen = false; recompute();
  const s3 = document.querySelector('[data-section="sublot-3"]');
  r.holding = {
    locked: s3.classList.contains("locked"),
    holding: s3.querySelector(".steplock").className.includes("holding"),
    onScreen: document.querySelector('[data-section="sublot-3"] [data-col="wt_air"]').value,
    disabled: document.querySelector('[data-section="sublot-3"] [data-col="wt_air"]').disabled,
    collected: marked(),
    emptyNeighbourStillEmpty:
      !document.querySelector('[data-section="sublot-2"] .steplock').className.includes("holding"),
  };
  state.sublotsOpen = wasOpen; recompute();
  return r;
};

export async function run({ browser, results }) {
  const ok = (name, pass, detail) => results.ok(id, BOOK, name, pass, detail);

  // ---- a contractor, no flag ---------------------------------------------
  const out = await withBook(browser, PLANT, { width: 1440, height: 1000 }, async (h) => {
    const r = await inPage(h.page, READ, APPROVAL);
    return { r, errs: realErrors(h.errs).filter((e) => !/CORS|ERR_FAILED/.test(e)) };
  });
  if (out.skipped) { results.skip(id, BOOK, "sublot locks", out.skipped); return; }
  const { r, errs } = out.value;

  ok("lot 1 sublot 1 is open — it is the plant setup sample",
     r.lot1["sublot-1"] && r.lot1["sublot-1"].locked === false,
     `locked=${r.lot1["sublot-1"] && r.lot1["sublot-1"].locked}`);
  for (const n of [2, 3, 4]) {
    const t = r.lot1[`sublot-${n}`];
    ok(`lot 1 sublot ${n} is locked, greyed on the rail, and says why`,
       !!t && t.locked && t.rail && t.cardShown && !t.holding && /not open yet/i.test(t.text),
       t ? `locked=${t.locked} rail=${t.rail} card=${t.cardShown} holding=${t.holding}` : "(no tab)");
    ok(`lot 1 sublot ${n} has every one of its own controls disabled`,
       !!t && t.ownDisabled, t ? `ownDisabled=${t.ownDisabled}` : "(no tab)");
  }

  // The reason the placeholder is a card ABOVE the body rather than a
  // replacement for it. A locked tab that dropped its rows would re-slice
  // every later tab and lose those measurements from the AMAW.
  ok("a locked tab still renders every row it owns",
     [2, 3, 4].every((n) => r.lot1[`sublot-${n}`].domRows > 0 &&
       r.lot1[`sublot-${n}`].domRows === r.bypassed[`sublot-${n}`].domRows),
     [2, 3, 4].map((n) => `${n}: ${r.lot1[`sublot-${n}`].domRows} locked / ${r.bypassed[`sublot-${n}`].domRows} open`).join(", "));
  ok("collectForm() reads exactly the same rows locked and unlocked",
     r.collectedLocked === r.collectedOpen && r.collectedOpen === r.collectedRelocked,
     r.collectedLocked === r.collectedOpen ? "identical across all three" : "the lock changed the payload");
  const gaps = Object.keys(r.domOpen)
    .filter((k) => (r.domLocked[k] || 0) !== r.domOpen[k])
    .map((k) => `${k}: ${r.domLocked[k] || 0} locked vs ${r.domOpen[k]} open`);
  const short = Object.entries(r.want)
    .filter(([k, n]) => (r.domLocked[k] || 0) !== n)
    .map(([k, n]) => `${k}: ${r.domLocked[k] || 0} rendered, seed is ${n}`);
  ok("every sliced table renders its whole seed, locked or not",
     short.length === 0 && Object.keys(r.want).length > 0,
     short.length ? short.join(" | ")
       : `${Object.keys(r.want).length} sliced tables, all complete`);
  ok("no row leaves the document when a sublot locks",
     gaps.length === 0 && Object.keys(r.domOpen).length > 0,
     gaps.length ? gaps.join(" | ") : `${Object.keys(r.domOpen).length} row tables, all unchanged`);

  // ---- lot 2: the exemption is lot 1's only ------------------------------
  ok("on lot 2 every sublot is locked, sublot 1 included",
     [1, 2, 3, 4].every((n) => r.lot2[`sublot-${n}`].locked),
     [1, 2, 3, 4].map((n) => `${n}=${r.lot2[`sublot-${n}`].locked}`).join(" "));
  ok("the per-sublot blend percentage locks WITH its tab",
     [2, 3, 4].every((n) => r.lot1[`sublot-${n}`].pctCount > 0 && r.lot1[`sublot-${n}`].pctDisabled),
     [2, 3, 4].map((n) => `${n}: ${r.lot1[`sublot-${n}`].pctCount} cell(s), disabled=${r.lot1[`sublot-${n}`].pctDisabled}`).join(" | "));
  ok("…but the lot-level blocks on that tab stay open, or lot 2 has no blend",
     r.lot2["sublot-1"].lotLevelCount > 0 && r.lot2["sublot-1"].lotLevelOpen,
     `${r.lot2["sublot-1"].lotLevelCount} control(s), all enabled: ${r.lot2["sublot-1"].lotLevelOpen}`);

  // ---- locked while carrying data ---------------------------------------
  const hd = r.holding;
  ok("a locked sublot that HOLDS data shows it rather than the placeholder",
     hd.locked && hd.holding && hd.onScreen === "4821.7" && hd.disabled,
     `locked=${hd.locked} holding=${hd.holding} value="${hd.onScreen}" disabled=${hd.disabled}`);
  ok("…and that data is still collected, so it still reaches the AMAW",
     r.markedWhileOpen === 1 && hd.collected === 1,
     `${r.markedWhileOpen} while open, ${hd.collected} while locked`);
  ok("…while a locked EMPTY sublot beside it still reads as empty",
     hd.emptyNeighbourStillEmpty, `sublot 2 holding=${!hd.emptyNeighbourStillEmpty}`);

  ok("clean console", errs.length === 0, errs.slice(0, 2).join(" | ") || "0 errors");

  // ---- a reviewer needs no flag -----------------------------------------
  const rev = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true },
    async (h) => inPage(h.page, READ, APPROVAL));
  if (rev.skipped) results.skip(id, BOOK, "a reviewer sees every sublot", rev.skipped);
  else ok("a reviewer sees every sublot with no flag — they build the AMAW from it",
          [1, 2, 3, 4].every((n) => rev.value.lot1[`sublot-${n}`].locked === false),
          [1, 2, 3, 4].map((n) => `${n}=${rev.value.lot1[`sublot-${n}`].locked}`).join(" "));

  // ---- the build bypass announces itself and is stamped ------------------
  const byp = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => {
      const r2 = await inPage(h.page, READ, APPROVAL);
      const meta = await h.page.evaluate(() => ({
        banner: !!document.querySelector(".lockbypass"),
        stamp: handoffPayload("harness").sublots_unlocked,
      }));
      return { r2, meta };
    });
  if (byp.skipped) results.skip(id, BOOK, "?sublots=open", byp.skipped);
  else {
    ok("?sublots=open opens every sublot",
       [1, 2, 3, 4].every((n) => byp.value.r2.lot1[`sublot-${n}`].locked === false),
       [1, 2, 3, 4].map((n) => `${n}=${byp.value.r2.lot1[`sublot-${n}`].locked}`).join(" "));
    // A build shortcut that behaved differently without saying so would be
    // worse than no shortcut: these lots go to Andrew and Tate.
    ok("…says so on the page, and stamps every file it makes",
       byp.value.meta.banner === true && byp.value.meta.stamp === true,
       `banner=${byp.value.meta.banner} payload.sublots_unlocked=${byp.value.meta.stamp}`);
  }
}
