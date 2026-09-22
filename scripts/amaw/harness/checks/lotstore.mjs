/* CHECK 10 — PlantBook's lot store, in a real browser.
 *
 * Jake, 2026-09-22: "Storage has to be the way." A lot now writes itself as it
 * is filled in, reopens from a list rather than a file, and is sealed on
 * Submit so nobody can quietly rewrite what KYTC received.
 *
 * WHAT THE OTHER TWO CHECKERS ALREADY PROVE, so that this one does not:
 *   scripts/supabase/check_amaw_lots.py  the policies, the guard trigger and
 *     the purge, against a real Postgres 16.
 *   scripts/amaw/check_storage.mjs       the client's own logic, against a
 *     fake browser and a fake server.
 *
 * WHAT ONLY EXISTS ONCE THERE IS A DOCUMENT, which is this file's whole job:
 * that autosave is wired to the real recompute(), that what reaches the store
 * is what collectForm() collected, that a lot reopened from the list is the
 * lot that was saved, and that pressing Submit on the real button seals the
 * real ledger row with the hash of the bytes that really downloaded.
 *
 * AND THE ONE CASE A NODE TEST CANNOT STATE HONESTLY: a plant with no signal.
 * window.__HARNESS_OFFLINE makes every Supabase call fail the way a dropped
 * connection does, and the assertion is that a technician notices nothing
 * except the chip.
 */
import { withBook, PLANT } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";
import { fillForm } from "../lib/inpage.mjs";

export const id = "lotstore";
const BOOK = "PlantBook";

const APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};

const READ = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const open = () => {
    const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
    // Through the page's own door, so adoptLotIntoStore() runs exactly as it
    // does for a real upload. Going round it would test a path nobody uses.
    openLotEnvelope(out.lot, "the harness");
    return out.lot;
  };

  const lot = open();
  const uid = state.lot.uid;
  const server = window.__HARNESS_AMAW;

  // NOTHING HAS BEEN TYPED YET, which is the point. adoptLotIntoStore() is
  // what makes a lot durable from the moment it opens rather than from the
  // first keystroke, and asserting it here - before any input event exists -
  // is the only way to tell it apart from the autosave, which would otherwise
  // cover for its removal a second later. It did, until this case was added.
  await sleep(1200);
  const ledgerOnOpen = !!server.amaw_lots[uid];

  fillFormFn({ nominal_size: "0.38", mix_type: "B" });
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const tonsAtOpen = (server.amaw_lot_data[uid] || { values: {} }).values.lot_tons;

  // A marker no seeding could have produced, so finding it later proves the
  // value travelled rather than being regenerated.
  const marker = "4123";
  const el = document.querySelector('[data-field="lot_tons"]');
  el.value = marker;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  // The autosave is debounced, which is the point of it: forty keystrokes are
  // one write, not forty.
  const tonsBeforeDebounce = (server.amaw_lot_data[uid] || { values: {} }).values.lot_tons;
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  // SNAPSHOT, not a reference: the stub hands back its live row and the seal
  // below mutates it in place, so holding it would report the end state as
  // the state at save time - which is exactly the assertion being made here.
  const ledger = server.amaw_lots[uid] ? JSON.parse(JSON.stringify(server.amaw_lots[uid])) : null;
  const data = server.amaw_lot_data[uid] ? JSON.parse(JSON.stringify(server.amaw_lot_data[uid])) : null;
  const localRaw = localStorage.getItem("amaw_lot:" + uid);

  // ---- the list on the front door -----------------------------------
  await paintLotList();
  const listRows = Array.from(document.querySelectorAll("#lotListWrap [data-lot-uid]"))
    .map((b) => b.dataset.lotUid);

  // ---- reopening it, through the real button -------------------------
  state.lot = null; state.extracted = { scalars: {}, tables: {} };
  await openLotFromStore(uid);
  const reopened = state.lot ? state.lot.uid : null;
  const reopenedTons = fieldValue("lot_tons");

  // ---- offline ------------------------------------------------------
  window.__HARNESS_OFFLINE = true;
  const el2 = document.querySelector('[data-field="lot_wedge_tons"]');
  el2.value = "77";
  el2.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const offlineLocal = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null");
  const offlineChip = { text: $("syncChip").textContent, cls: $("syncChip").className };
  const offlineOutbox = (await state.store.local.outbox()).length;
  const offlineServerWedge = (server.amaw_lot_data[uid] || {}).values
    ? server.amaw_lot_data[uid].values.lot_wedge_tons : undefined;

  // ---- back online --------------------------------------------------
  window.__HARNESS_OFFLINE = false;
  await flushLots();
  const flushedWedge = (server.amaw_lot_data[uid] || {}).values
    ? server.amaw_lot_data[uid].values.lot_wedge_tons : undefined;
  const afterFlushOutbox = (await state.store.local.outbox()).length;

  // ---- sealing, through the REAL Submit button ----------------------
  // submitLotToKYTC() is what a technician presses, and calling the function
  // it happens to call instead would pass with the call deleted - which an
  // earlier draft of this check did. Two things are stubbed and nothing else:
  // the confirm dialog, and the download, because a headless browser has
  // nowhere to put a file. The PDF is still BUILT, so the bytes that are
  // hashed are the bytes that would have been saved.
  const realConfirm = window.confirm, realSaveBytes = window.saveBytes;
  let downloaded = null;
  window.confirm = () => true;
  window.saveBytes = (bytes, name) => { downloaded = { name, bytes: bytes.length }; };
  state.storeError = null;
  let submitError = null;
  try { await submitLotToKYTC(); } catch (e) { submitError = String(e); }
  window.confirm = realConfirm; window.saveBytes = realSaveBytes;
  const sealRaw = state.storeError || null;
  // The frozen payload the submit actually built - the same object the PDF
  // carries - so the hash compared below is the file's, not a rebuild's.
  const expectedHash = state.submitted ? await lotPayloadHash(state.submitted) : null;
  const sealed = server.amaw_lots[uid] || {};
  const sealedChip = { text: $("syncChip").textContent, cls: $("syncChip").className };

  // A sealed lot must not keep writing. This is the case that would silently
  // lose an afternoon if the data window were reopened.
  const el3 = document.querySelector('[data-field="lot_wedge_tons"]');
  if (el3) { el3.value = "999"; el3.dispatchEvent(new Event("input", { bubbles: true })); }
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const afterSealWedge = (server.amaw_lot_data[uid] || {}).values
    ? server.amaw_lot_data[uid].values.lot_wedge_tons : undefined;

  return {
    uid, ledgerOnOpen, tonsAtOpen, tonsBeforeDebounce, downloaded, submitError,
    ledgerWritten: !!ledger,
    ledgerIdentity: ledger ? { contract_id: ledger.contract_id, amp_number: ledger.amp_number,
                               mix_id: ledger.mix_id, lot_number: ledger.lot_number,
                               line_item: ledger.line_item, density_option: ledger.density_option } : null,
    ledgerStatusOnSave: ledger ? ledger.status : null,
    ledgerHashOnSave: ledger ? ledger.submittal_sha256 : null,
    dataTons: data && data.values ? data.values.lot_tons : undefined,
    localHeld: !!localRaw,
    localTons: localRaw ? (JSON.parse(localRaw).values || {}).lot_tons : undefined,
    listRows, reopened, reopenedTons,
    offlineLocalWedge: offlineLocal ? (offlineLocal.values || {}).lot_wedge_tons : undefined,
    offlineChip, offlineOutbox, offlineServerWedge,
    flushedWedge, afterFlushOutbox,
    expectedHash, sealRaw, sealedStatus: sealed.status, sealedHash: sealed.submittal_sha256,
    sealedPurgeAfter: !!sealed.purge_after, sealedChip, afterSealWedge,
    lotStatus: state.lot ? state.lot.status : null,
    marker,
  };
};

export async function run({ browser, results }) {
  const ok = (what, cond, detail) => results.add(id, BOOK, what, cond ? "PASS" : "FAIL", detail);

  const out = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => {
      await h.page.addScriptTag({ content: `window.fillFormFn = ${fillForm.toString()};` });
      const r = await h.page.evaluate(READ, { approval: APPROVAL });
      return { r, errs: realErrors(h.errors || []) };
    });

  if (out.skipped) { results.skip(id, BOOK, "the lot store", out.skipped); return; }
  const r = out.value.r;

  // ---- autosave ----
  ok("a value typed after the lot opened is NOT there before the debounce elapses",
     String(r.tonsAtOpen) !== r.marker && String(r.tonsBeforeDebounce) !== r.marker,
     `at open=${JSON.stringify(r.tonsAtOpen)} immediately after typing=${JSON.stringify(r.tonsBeforeDebounce)}`);
  ok("a lot registers itself the moment it opens, before anything is typed",
     r.ledgerOnOpen, `ledger row present with no input events yet: ${r.ledgerOnOpen}`);
  ok("…so it is on the server at all", r.ledgerWritten, r.ledgerIdentity);
  ok("…with the six-part identity the ledger's unique index is on",
     r.ledgerIdentity && r.ledgerIdentity.contract_id === "262120"
       && r.ledgerIdentity.amp_number === "AMP070301"
       && r.ledgerIdentity.mix_id === "00260467"
       && Number(r.ledgerIdentity.lot_number) === 1
       && r.ledgerIdentity.density_option === "B", r.ledgerIdentity);
  ok("what a technician typed reaches the server", String(r.dataTons) === r.marker,
     `lot_tons=${JSON.stringify(r.dataTons)}`);
  ok("…and this device", String(r.localTons) === r.marker, `local lot_tons=${JSON.stringify(r.localTons)}`);

  // THE CHAIN IS NOT THE CLIENT'S TO WRITE. The page saving a lot must never
  // move its status or stamp a hash; supabase/amaw_lots.sql pins them, and
  // this is the client half of the same assertion.
  ok("an ordinary save does not touch the chain",
     r.ledgerStatusOnSave === "Open" && r.ledgerHashOnSave === null,
     `status=${r.ledgerStatusOnSave} hash=${r.ledgerHashOnSave}`);

  // ---- the list, which is what storage actually buys a person ----
  ok("the lot appears in “lots you already have”", r.listRows.includes(r.uid), r.listRows);
  ok("opening it from the list reopens THAT lot", r.reopened === r.uid, `${r.reopened} vs ${r.uid}`);
  ok("…with the values it was saved with", String(r.reopenedTons) === r.marker,
     `lot_tons=${JSON.stringify(r.reopenedTons)}`);

  // ---- offline ----
  ok("with no signal the save still lands on this device",
     String(r.offlineLocalWedge) === "77", `local lot_wedge_tons=${JSON.stringify(r.offlineLocalWedge)}`);
  ok("…the server does not have it", r.offlineServerWedge !== "77", `server=${JSON.stringify(r.offlineServerWedge)}`);
  ok("…it is waiting in the outbox rather than lost", r.offlineOutbox === 1, `${r.offlineOutbox} waiting`);
  ok("…and the page SAYS so rather than looking saved",
     /offline/.test(r.offlineChip.text) && /warn/.test(r.offlineChip.cls), r.offlineChip);
  ok("coming back online sends it", String(r.flushedWedge) === "77", `server=${JSON.stringify(r.flushedWedge)}`);
  ok("…and the outbox empties", r.afterFlushOutbox === 0, `${r.afterFlushOutbox} left`);

  // ---- sealing ----
  ok("the real Submit button runs and builds the PDF",
     !r.submitError && !!r.downloaded, r.submitError || JSON.stringify(r.downloaded));
  ok("Submit seals the ledger row", r.sealedStatus === "Submitted",
     `status=${r.sealedStatus} ${r.sealRaw ? 'error: ' + r.sealRaw : ''}`);
  ok("…with the hash of the very bytes the PDF carries",
     !!r.expectedHash && r.sealedHash === r.expectedHash, `${r.sealedHash} vs ${r.expectedHash}`);
  ok("…and the retention clock is the SERVER's to start", r.sealedPurgeAfter, r.sealedPurgeAfter);
  ok("…and the chip stops saying “saved” and says what it is",
     /submitted/.test(r.sealedChip.text), r.sealedChip);
  // The one that would silently lose an afternoon if the window reopened.
  ok("a submitted lot stops writing, so nothing edits what KYTC received",
     r.afterSealWedge !== "999", `server lot_wedge_tons=${JSON.stringify(r.afterSealWedge)}`);

  ok("no console errors through any of it",
     out.value.errs.length === 0, out.value.errs.slice(0, 3).join(" | ") || "clean");
}
