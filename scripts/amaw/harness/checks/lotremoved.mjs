/* CHECK 11 - the lot store when its tables are REMOVED after being used.
 *
 * Andrew, 2026-09-24: supabase/amaw_lots_undo.sql exists so the storage can be
 * taken back out if KYTC decides against it. scripts/supabase/check_amaw_lots_undo.mjs
 * proves the database side. lotstore.mjs proves a page on a project that
 * NEVER had the tables. Neither covers the case the undo actually creates: a
 * contractor whose lots were syncing, and whose browser still thinks so, when
 * the tables vanish underneath them.
 *
 * Three phases, one browser:
 *   A. applied - a lot opens and syncs, so the server and this device agree.
 *   B. the undo runs WHILE the page is open (window.__HARNESS_UNAPPLIED flips;
 *      the stub checks it on every call) - the technician keeps typing.
 *   C. the next day - the page reloads with no tables at all. The lot comes
 *      back from this device's list, carries everything typed in A and B, and
 *      submits.
 * The assertion throughout is the one the undo script's header makes: the
 * page goes back to exactly what it did before the migration, and a person
 * loses nothing that was on their own device.
 */
import { withBook, PLANT } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";

export const id = "lotremoved";
const BOOK = "PlantBook";

const APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};

const type = (field, v) => {
  const el = document.querySelector(`[data-field="${field}"]`);
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

const PHASE_A_B = async ({ approval, typeSrc }) => {
  const type = eval(typeSrc);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = window.__HARNESS_AMAW;

  // ---- A. applied: open, type, sync ----
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  type("lot_tons", "4123");
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 800);
  const syncedTons = (server.amaw_lot_data[uid] || { values: {} }).values.lot_tons;
  const syncedLedger = !!server.amaw_lots[uid];

  // ---- B. the undo runs while this page is open ----
  window.__HARNESS_UNAPPLIED = true;
  type("lot_wedge_tons", "77");
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 800);
  await flushLots();
  const local = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null");
  const st = state.store.state();
  show("uploadCard", true);
  await paintLotList();
  const listText = ($("lotListWrap") || {}).textContent || "";
  return {
    uid, syncedTons, syncedLedger,
    localTons: local ? (local.values || {}).lot_tons : undefined,
    localWedge: local ? (local.values || {}).lot_wedge_tons : undefined,
    notSetUp: st.notSetUp, online: st.online,
    chipHidden: $("syncChip").classList.contains("hidden"), chip: $("syncChip").textContent,
    listed: document.querySelectorAll("#lotListWrap [data-lot-uid]").length,
    listSaysRetention: /kept for/.test(listText),
    listSaysNotYetSent: /not yet sent/.test(listText),
  };
};

const PHASE_C = async ({ uid }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);                       // boot's paintLotList() / flushLots()
  const listedOnBoot = Array.from(document.querySelectorAll("#lotListWrap [data-lot-uid]"))
    .map((b) => b.dataset.lotUid);
  const listText = ($("lotListWrap") || {}).textContent || "";
  await openLotFromStore(uid);
  const reopened = state.lot ? state.lot.uid : null;
  const tons = fieldValue("lot_tons"), wedge = fieldValue("lot_wedge_tons");
  const chipHidden = $("syncChip").classList.contains("hidden");

  // Submit through the real button, as lotstore.mjs does: only the confirm
  // dialog and the download are stubbed, so the PDF is really built.
  const realConfirm = window.confirm, realSaveBytes = window.saveBytes;
  let downloaded = null, submitError = null;
  window.confirm = () => true;
  window.saveBytes = (bytes, name) => { downloaded = { name, bytes: bytes.length }; };
  try { await submitLotToKYTC(); } catch (e) { submitError = String(e); }
  window.confirm = realConfirm; window.saveBytes = realSaveBytes;
  await sleep(600);
  return {
    listedOnBoot, reopened, tons, wedge, chipHidden,
    listSaysRetention: /kept for/.test(listText),
    listSaysNotYetSent: /not yet sent/.test(listText),
    downloaded, submitError, status: state.lot ? state.lot.status : null,
    stageText: (document.querySelector("#saveMsg") || {}).textContent || "",
    serverEmpty: Object.keys(window.__HARNESS_AMAW.amaw_lots).length === 0,
  };
};

export async function run({ browser, results }) {
  const ok = (what, cond, detail) => results.add(id, BOOK, what, cond ? "PASS" : "FAIL", detail);

  const out = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => {
      const ab = await h.page.evaluate(PHASE_A_B, { approval: APPROVAL, typeSrc: `(${type.toString()})` });
      // C: the next morning. The stub's in-page "server" starts empty on a
      // reload, and this makes it answer every amaw_* query with 42P01 - the
      // project after the undo. localStorage is the device, and survives.
      await h.page.addInitScript(() => { window.__HARNESS_UNAPPLIED = true; });
      await h.page.reload();
      // The harness page opens in DesignBook, so do what a technician does:
      // press PlantBook, which with no lot open is the Start a lot door and
      // its "lots you already have" list (switchBook, 2026-09-24).
      await h.page.waitForFunction(() => document.querySelectorAll("#sections .section").length > 0,
        null, { timeout: 30000 });
      await h.page.click("#bookPlant");
      await h.page.waitForFunction(() => state.book === "plantbook" && state.bookDoor === true,
        null, { timeout: 15000 });
      const c = await h.page.evaluate(PHASE_C, { uid: ab.uid });
      return { ab, c, errs: realErrors(h.errs || []) };
    });
  if (out.skipped) { results.skip(id, BOOK, "the lot store after its tables are removed", out.skipped); return; }
  const { ab, c } = out.value;

  ok("A: the lot synced while the tables existed (the state the undo starts from)",
     ab.syncedLedger && String(ab.syncedTons) === "4123", `ledger=${ab.syncedLedger} server lot_tons=${ab.syncedTons}`);

  ok("B: tables removed mid-session - typing still saves on this device",
     String(ab.localWedge) === "77" && String(ab.localTons) === "4123",
     `local lot_tons=${ab.localTons} lot_wedge_tons=${ab.localWedge}`);
  ok("B: …the store reads it as NOT SET UP, not as offline",
     ab.notSetUp === true && ab.online === true, `notSetUp=${ab.notSetUp} online=${ab.online}`);
  ok("B: …so the sync chip goes away rather than saying “offline · waiting”",
     ab.chipHidden, `chip="${ab.chip}"`);
  ok("B: …and the list keeps the lot without promising a retention or a send",
     ab.listed === 1 && !ab.listSaysRetention && !ab.listSaysNotYetSent,
     `rows=${ab.listed} retention=${ab.listSaysRetention} notYetSent=${ab.listSaysNotYetSent}`);

  ok("C: next day, the lot is still on this device's list", c.listedOnBoot.includes(ab.uid), c.listedOnBoot);
  ok("C: …the list says nothing about retention or sending",
     !c.listSaysRetention && !c.listSaysNotYetSent,
     `retention=${c.listSaysRetention} notYetSent=${c.listSaysNotYetSent}`);
  ok("C: it reopens with everything typed before AND after the tables went",
     c.reopened === ab.uid && String(c.tons) === "4123" && String(c.wedge) === "77",
     `lot_tons=${c.tons} lot_wedge_tons=${c.wedge}`);
  ok("C: no sync chip", c.chipHidden, c.chipHidden);
  ok("C: Submit still builds and downloads the submittal PDF",
     !c.submitError && !!c.downloaded, c.submitError || JSON.stringify(c.downloaded));
  ok("C: …and the lot reads Submitted on this device", c.status === "Submitted", `status=${c.status}`);
  ok("C: nothing was written anywhere but this device", c.serverEmpty, c.serverEmpty);
  ok("no console errors across all three phases",
     out.value.errs.length === 0, out.value.errs.slice(0, 3).join(" | ") || "clean");
}
