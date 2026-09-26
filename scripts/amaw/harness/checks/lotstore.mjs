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
  const legend = ((document.querySelector("#lotListWrap .legend") || {}).textContent || "").replace(/\s+/g, " ").trim();

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
  // In step and online: the chip is the save, so the appbar's saved-state line
  // must not sit beside it saying "Not downloaded yet" (renderSavedState()).
  const savedChrome = { chip: $("syncChip").textContent, savedHidden: $("savedstate").hidden,
                        savedText: $("savedstate").textContent, chipTitle: $("syncChip").title || "" };

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

  // ---- a contractor pressing Accept, on the REAL button ---------------
  // Reviewer-only (Andrew, 2026-09-23): the button is hidden from a
  // contractor AND the click handler refuses. The button is clicked anyway -
  // hidden is UX, and every page here is directly linkable - and the seal
  // calls are COUNTED, because the server would refuse too ("only KYTC
  // accepts a lot") and a ledger that did not move proves nothing about the
  // page's own refusal.
  const acceptHidden = $("advanceStage").classList.contains("hidden");
  const realRpc = sb.rpc;
  let sealCalls = 0;
  sb.rpc = function () { sealCalls++; return realRpc.apply(this, arguments); };
  document.getElementById("advanceStage").click();
  await sleep(800);
  sb.rpc = realRpc;
  const contractorAccept = {
    hidden: acceptHidden, sealCalls, msg: $("saveMsg").textContent, cls: $("saveMsg").className,
    stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key,
    ledger: (server.amaw_lots[uid] || {}).status, acceptedAt: (server.amaw_lots[uid] || {}).accepted_at || null,
  };

  return {
    contractorAccept, savedChrome, legend,
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

/* THE STATE THE LIVE SITE IS IN TODAY, and the one every deploy passes
 * through: the page shipped, supabase/amaw_lots.sql has not been applied, and
 * PostgREST answers every query about a relation that does not exist with
 * PGRST205/42P01. That has to be indistinguishable from a plant with no signal
 * - a lot saves, opens and submits out of localStorage exactly as before - and
 * boot() now calls paintLotList() and flushLots(), so it is boot that would
 * break if it were not. */
const UNAPPLIED = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  const el = document.querySelector('[data-field="lot_tons"]');
  el.value = "4123";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 900);

  const local = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null");
  const avail = await state.store.available();
  // The front door still has to render, and its list still has to be honest.
  show("uploadCard", true);
  await paintLotList();
  await flushLots();
  const listText = ($("lotListWrap") || {}).textContent || "";
  return {
    savedLocally: !!local,
    localTons: local ? (local.values || {}).lot_tons : undefined,
    serverEmpty: Object.keys(window.__HARNESS_AMAW.amaw_lots).length === 0,
    availLocal: avail.ok, availRemote: avail.remote, availReason: avail.reason,
    availNotSetUp: avail.notSetUp, stateNotSetUp: state.store.state().notSetUp,
    stateOnline: state.store.state().online,
    listRows: document.querySelectorAll("#lotListWrap [data-lot-uid]").length,
    chipHidden: $("syncChip").classList.contains("hidden"),
    chip: $("syncChip").textContent,
    listSaysRetention: /days after it is submitted/.test(listText),
    listSaysNotYetSent: /not yet sent/.test(listText),
    formAlive: document.querySelectorAll("#sections .section").length,
  };
};

/* KYTC'S SIDE OF THE DOOR, as a reviewer (can_review). Until 2026-09-26 Accept
 * was a local stage change: the pill read Accepted, the ledger row stayed
 * Submitted with no accepted_at, and the contractor's list still said
 * Submitted. Every step here is the REAL #advanceStage button; the only
 * things stubbed are the confirm dialog, the download and - for the refusal -
 * the seal RPC's answer. */
const REVIEW = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = window.__HARNESS_AMAW;
  const open = async (n) => {
    const out = PB_LOT.lotFromApproval(approval, { lotNumber: n, verification: PB_LOT.notChecked("harness") });
    openLotEnvelope(out.lot, "the harness");
    await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
    return state.lot.uid;
  };
  const submit = async () => {
    const c = window.confirm, s = window.saveBytes;
    window.confirm = () => true; window.saveBytes = () => {};
    try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; }
  };
  const pressAccept = async () => {
    // From the Submit step, where a person is when they press it - and where
    // anything measured beside the button is laid out at all (a hidden step
    // measures zero).
    go(stepIndexOf("lot-status"));
    await sleep(500);
    const before = $("saveMsg").textContent;
    document.getElementById("advanceStage").click();
    for (let i = 0; i < 80 && ($("saveMsg").textContent === before
                               || $("advanceStage").textContent === "Accepting..."); i++) await sleep(100);
    await sleep(300);
  };
  const snap = (uid) => {
    const row = server.amaw_lots[uid] || {};
    const local = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
    // Where a refusal lands relative to the button that was pressed: #saveMsg
    // is in the rail, off-screen at most widths, so the refusal has to show
    // beside the button too - measured, not read off the markup.
    const w = $("stageWarn"), b = $("advanceStage");
    const wr = w ? w.getBoundingClientRect() : null, br = b ? b.getBoundingClientRect() : null;
    return { stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key, pill: $("statuspill").textContent,
             msg: $("saveMsg").textContent, cls: $("saveMsg").className, chip: $("syncChip").textContent,
             chipTitle: $("syncChip").title,
             warn: w && !w.classList.contains("hidden") ? w.textContent : null,
             warnGap: wr && br && wr.height > 0 ? Math.round(wr.top - br.bottom) : null,
             ledger: row.status || null, acceptedAt: row.accepted_at || null, acceptedName: row.accepted_name || null,
             local: local.status || null, pending: local.pending_seal || null,
             audit: ($("auditlog") || {}).textContent || "" };
  };
  const listRow = (uid) => {
    const el = document.querySelector(`#lotListWrap [data-lot-uid="${uid}"]`);
    return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
  };

  // A lot nobody has typed into, straight from the approval: its count.
  const u1 = await open(1);
  await paintLotList();
  const listUntouched = listRow(u1);

  // Accepted, and sealed.
  await submit();
  const offered = !$("advanceStage").classList.contains("hidden") ? $("advanceStage").textContent : null;
  await pressAccept();
  const accepted = snap(u1);
  accepted.listStatus = ((await state.store.list()).find((r) => r.uid === u1) || {}).status || null;
  await paintLotList();
  accepted.listRow = listRow(u1);

  // Refused by the record: nothing moves, and it says why.
  const u2 = await open(2);
  await submit();
  const realRpc = sb.rpc;
  sb.rpc = (fn, a) => (a && a.p_status === "Accepted")
    ? Promise.resolve({ data: null, error: { message: "lot 2 is Open, and only a submitted lot can be accepted" } })
    : realRpc(fn, a);
  await pressAccept();
  sb.rpc = realRpc;
  const refused = snap(u2);
  // ...and SAID ONCE. Back to the Start a lot door and in again from its list,
  // which is where it used to be said a second time - as an Accept "made
  // without a signal", with a history line written at reopen time.
  const stored = () => JSON.parse(localStorage.getItem("amaw_lot:" + u2) || "null") || {};
  refused.heldRefusal = stored().seal_refused || null;
  state.lot = null;
  showLotDoor("plantbook");
  await sleep(1200);
  await openLotFromStore(u2);
  await sleep(1500);
  go(stepIndexOf("lot-status"));
  await sleep(400);
  const reopened = { ...snap(u2), btn: $("advanceStage").textContent,
                     history: (state.history || []).map((h) => h.action),
                     storedHistory: (stored().history || []).map((h) => h.action) };
  // ...and it is left clean, so the next Accept simply works.
  await pressAccept();
  const retried = snap(u2);

  // A lot this device no longer holds, known only from the server.
  const u3 = await open(3);
  await state.store.local.remove(u3);
  await paintLotList();
  const listServerOnly = listRow(u3);

  return { offered, accepted, refused, reopened, retried, listUntouched, listServerOnly };
};

/* A REFUSED ACCEPT PRESSED AT THE EDGE OF WHAT A PERSON CAN SEE - the bottom
 * of a phone screen, or just above the fixed action bar. The refusal is
 * painted under the button, and used to land below the fold, where nothing a
 * person could see changed (the pill, the chip and the button all read as
 * before). It is scrolled into view now; measured, at three widths. */
const WARN_IN_VIEW = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; }
  const realRpc = sb.rpc;
  sb.rpc = (fn, a) => (a && a.p_status === "Accepted")
    ? Promise.resolve({ data: null, error: { code: "42501", message: "only KYTC accepts a lot" } })
    : realRpc(fn, a);
  go(stepIndexOf("lot-status"));
  await sleep(1200);                        // below 700px go() scrolls, smoothly
  const limit = () => {
    const bar = document.getElementById("actionBar");
    const on = bar && !bar.classList.contains("hidden") && getComputedStyle(bar).display !== "none";
    return on ? bar.getBoundingClientRect().top : window.innerHeight;
  };
  // The button's bottom edge 4px above the visible edge, where a thumb or a
  // pointer has it at the end of a scroll.
  window.scrollBy(0, $("advanceStage").getBoundingClientRect().bottom - (limit() - 4));
  await sleep(200);
  const placed = { btnBottom: Math.round($("advanceStage").getBoundingClientRect().bottom), limit: Math.round(limit()) };
  document.getElementById("advanceStage").click();
  for (let i = 0; i < 60 && $("stageWarn").classList.contains("hidden"); i++) await sleep(100);
  await sleep(300);
  sb.rpc = realRpc;
  const w = $("stageWarn").getBoundingClientRect();
  const head = document.querySelector(".appbar").getBoundingClientRect().bottom;
  return { placed, shown: !$("stageWarn").classList.contains("hidden"), text: $("stageWarn").textContent,
           top: Math.round(w.top), bottom: Math.round(w.bottom), head: Math.round(head), limit: Math.round(limit()),
           inView: w.height > 0 && w.top >= head && w.bottom <= limit(),
           overflowX: document.documentElement.scrollWidth - window.innerWidth };
};

/* A plant with no signal, pressing Submit. The PDF downloads and the lot is
 * Submitted here; the seal waits in the outbox. The page used to print the
 * same success line as a sealed one and the chip read "submitted - KYTC holds
 * the copy" while the ledger row was still Open. */
const OFFLINE_SUBMIT = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = window.__HARNESS_AMAW;
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  window.__HARNESS_OFFLINE = true;
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; }
  const offline = { msg: $("saveMsg").textContent, cls: $("saveMsg").className,
                    chip: $("syncChip").textContent, chipCls: $("syncChip").className, chipTitle: $("syncChip").title || "",
                    ledger: (server.amaw_lots[uid] || {}).status || null, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key };
  // Reopened from the list while the seal still waits: the store hands the
  // page a lot carrying its pending seal - which must not travel on into the
  // .json or the lot PDF, where it outlives the seal it describes.
  state.lot = null;
  await openLotFromStore(uid);
  await sleep(600);
  let json = null;
  const s2 = window.saveBytes;
  window.saveBytes = (bytes) => { json = JSON.parse(new TextDecoder().decode(bytes)); };
  try { downloadLotFile(); } finally { window.saveBytes = s2; }
  offline.reopenedChip = $("syncChip").textContent;
  offline.heldSeal = !!(state.lot && state.lot.pending_seal);
  offline.snapshotSeal = lotSnapshot().pending_seal;
  offline.fileSeal = json ? json.pending_seal : "no file";
  window.__HARNESS_OFFLINE = false;
  await flushLots();
  const flushed = { chip: $("syncChip").textContent, ledger: (server.amaw_lots[uid] || {}).status || null };
  return { offline, flushed };
};

/* A REVIEWER'S ACCEPT WITH NO SIGNAL, and what the next flush makes of it:
 *   sealed           - the "no signal" sentence is replaced once it seals;
 *   refused, lot open - put back, with THAT lot's reason, beside the button,
 *                       and a history line saying what became of the Accept;
 *   refused, door     - no lot open when the record says no: said on the door,
 *                       then again (with the history line) when the lot opens.
 * The record's refusal is the stub's rpc answering "only KYTC accepts a lot",
 * the one thing stubbed besides the confirm dialog and the download. */
const ACCEPT_OFFLINE = async ({ approval, refuse, door, beaten }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__HARNESS_AMAW;
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; }
  window.__HARNESS_OFFLINE = true;
  go(stepIndexOf("lot-status"));
  await sleep(400);
  document.getElementById("advanceStage").click();
  for (let i = 0; i < 60 && $("advanceStage").textContent === "Accepting..."; i++) await sleep(100);
  await sleep(700);                               // the trailing save, made with no signal
  const waiting = { msg: $("saveMsg").textContent, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key };
  // The other reviewer accepts it on their own device meanwhile.
  if (beaten) Object.assign(S.amaw_lots[uid], { status: "Accepted", accepted_at: "2026-09-26T06:03:53.000Z",
                                               accepted_name: "Tate Salle" });
  const realRpc = sb.rpc;
  if (refuse) sb.rpc = (fn, a) => (a && a.p_status === "Accepted")
    ? Promise.resolve({ data: null, error: { code: "42501", message: "only KYTC accepts a lot" } })
    : realRpc(fn, a);
  window.__HARNESS_OFFLINE = false;
  let doorMsg = null;
  if (door) {
    state.lot = null;
    showLotDoor("plantbook");                     // the door flushes, with no lot open
    for (let i = 0; i < 40 && !$("uploadMsg").textContent; i++) await sleep(100);
    await sleep(300);
    const doorRowEl = document.querySelector(`#lotListWrap [data-lot-uid="${uid}"]`);
    doorMsg = { text: $("uploadMsg").textContent, cls: $("uploadMsg").className,
                row: doorRowEl ? doorRowEl.textContent.replace(/\s+/g, " ").trim() : null };
    sb.rpc = realRpc;
    await openLotFromStore(uid);
    await sleep(1500);
  } else {
    await flushLots();
    await sleep(900);
    sb.rpc = realRpc;
  }
  go(stepIndexOf("lot-status"));
  await sleep(400);
  const held = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
  const w = $("stageWarn");
  await paintLotList();
  const rowEl = document.querySelector(`#lotListWrap [data-lot-uid="${uid}"]`);
  return {
    waiting, doorMsg,
    after: { msg: $("saveMsg").textContent, cls: $("saveMsg").className, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key,
             warn: w && !w.classList.contains("hidden") ? w.textContent : null, chip: $("syncChip").textContent,
             chipTitle: $("syncChip").title || "",
             history: (state.history || []).map((h) => h.action),
             audit: ($("auditlog") || {}).textContent || "" },
    held: { status: held.status || null, refused: held.seal_refused || null, pending: held.pending_seal || null,
            history: (held.history || []).map((h) => h.action) },
    ledger: (S.amaw_lots[uid] || {}).status || null,
    outbox: (await state.store.local.outbox()).length,
    row: rowEl ? rowEl.textContent.replace(/\s+/g, " ").trim() : null,
  };
};

/* A SEAL THAT TOOK, ITS REPLY LOST on the way back. The page cannot know
 * better than "waiting", and says so; then the next SAVE finds the seal
 * already on the record - for an Accept the trailing save, for a Submit the
 * debounced autosave of something typed just before it was pressed. That save
 * used to adopt it silently, leaving "there is no signal" up over a sealed lot
 * beside a green chip, on a device with a signal the whole time; only a flush
 * replaced the sentence. The record COMMITS and the reply is dropped - the
 * stub's own rpc runs first. */
const LOST_REPLY = async ({ approval, which, acceptedMeanwhile }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__HARNESS_AMAW;
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const realRpc = sb.rpc;
  let dropped = false;
  sb.rpc = async (fn, a) => {
    const r = await realRpc(fn, a);
    if (a && a.p_status === which && !dropped) { dropped = true; throw new TypeError("Failed to fetch"); }
    return r;
  };
  const facts = () => {
    const held = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
    return { msg: $("saveMsg").textContent, cls: $("saveMsg").className,
             chip: $("syncChip").classList.contains("hidden") ? null : $("syncChip").textContent,
             chipTitle: $("syncChip").title || "", ledger: (S.amaw_lots[uid] || {}).status || null,
             local: held.status || null, pending: held.pending_seal ? held.pending_seal.status : null,
             stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key };
  };
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  const debounce = CONFIG.STORAGE.AUTOSAVE_MS;
  // Every sentence #saveMsg shows, in order: the trailing save can answer
  // within the same tick the Accept does, so sampling it would miss the
  // "waiting" line it is meant to replace.
  const said = [];
  const mo = new MutationObserver(() => {
    const t = $("saveMsg").textContent;
    if (said[said.length - 1] !== t) said.push(t);
  });
  mo.observe($("saveMsg"), { childList: true, characterData: true, subtree: true });
  let ledgerAtWait = null;
  try {
    if (which === "Submitted") {
      // Something typed just before Submit was pressed: its debounced autosave
      // is still on its timer when the submission goes, and fires after it.
      CONFIG.STORAGE.AUTOSAVE_MS = 6000;
      scheduleLotSave();
      await submitLotToKYTC();
      ledgerAtWait = (S.amaw_lots[uid] || {}).status || null;
      // KYTC accepts it on its own device before this one's save finds the
      // submission on the record.
      if (acceptedMeanwhile) Object.assign(S.amaw_lots[uid], { status: "Accepted",
        accepted_at: "2026-09-26T06:03:53.000Z", accepted_name: "Tate Salle" });
      for (let i = 0; i < 90 && facts().pending; i++) await sleep(100);
    } else {
      await submitLotToKYTC();
      go(stepIndexOf("lot-status"));
      await sleep(400);
      said.length = 0;
      const before = $("saveMsg").textContent;
      document.getElementById("advanceStage").click();
      for (let i = 0; i < 80 && ($("saveMsg").textContent === before
                                 || $("advanceStage").textContent === "Accepting..."); i++) await sleep(100);
      ledgerAtWait = (S.amaw_lots[uid] || {}).status || null;
    }
  } finally {
    CONFIG.STORAGE.AUTOSAVE_MS = debounce;
    window.confirm = c; window.saveBytes = s;
  }
  await sleep(1200);
  mo.disconnect();
  sb.rpc = realRpc;
  const noSignalAt = said.findIndex((t) => /no signal/.test(t));
  const sealedAt = said.findIndex((t) => /is now sealed in KYTC's lot record/.test(t));
  return { dropped, ledgerAtWait, said, noSignalAt, sealedAt, after: facts() };
};

/* A SUBMIT THE RECORD REFUSES: another device already submitted this lot, with
 * a different payload. This device's submission is real - its PDF has gone -
 * so the lot stays Submitted here, and the chip says "not sealed". That used
 * to last one session: reopened, the same lot read "waiting to be sealed ...
 * when there is a signal" on a device that was online the whole time. And the
 * sentence printed the server's raw "new row violates row-level security
 * policy", which nobody at a plant can act on. */
const REFUSED_SUBMIT = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__HARNESS_AMAW;
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  Object.assign(S.amaw_lots[uid], { status: "Submitted", submittal_sha256: "b".repeat(64),
    submitted_name: "Night Shift", submitted_at: "2026-09-26T02:00:00.000Z" });
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; }
  const chip = () => ({ text: $("syncChip").classList.contains("hidden") ? null : $("syncChip").textContent,
                        cls: $("syncChip").className, title: $("syncChip").title || "" });
  const refused = { msg: $("saveMsg").textContent, cls: $("saveMsg").className, chip: chip(),
                    stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key };
  // Another session: the lot reopened from the list, the record unchanged.
  state.lot = null;
  await openLotFromStore(uid);
  await sleep(1500);
  const held = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
  return { refused, reopened: { chip: chip(), stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key,
                                heldPending: !!held.pending_seal, heldRefused: held.seal_refused ? held.seal_refused.status : null } };
};

/* A device that never pressed Accept: a contractor holding its lot as
 * Submitted opens a lot PDF made after KYTC accepted, with no signal, then
 * comes back online. The flush must not tell them an Accept was refused - the
 * old test was "the page reads Accepted and this copy does not". */
const NEVER_PRESSED = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__HARNESS_AMAW;
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; }
  const accepted = lotSnapshot();
  accepted.status = "Accepted";
  Object.assign(S.amaw_lots[uid], { status: "Accepted", accepted_at: new Date().toISOString(), accepted_name: "Tate Salle" });
  window.__HARNESS_OFFLINE = true;
  openLotEnvelope(accepted, "the lot PDF");
  await sleep(1200);
  window.__HARNESS_OFFLINE = false;
  await flushLots();
  await sleep(600);
  const first = { msg: $("saveMsg").textContent, cls: $("saveMsg").className,
                  stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key };
  // A refusal of an Accept kept on a lot this device already holds as
  // Accepted - the record got there anyway (another press, or its own chain).
  // "The Accept did not go through" over an Accepted lot is the page
  // contradicting itself, so it is not said.
  const held = await state.store.local.load(uid);
  held.status = "Accepted";
  held.seal_refused = { status: "Accepted", reason: "only KYTC accepts a lot", code: "sealed", record: null, at: new Date().toISOString() };
  await state.store.local.save(held, { bump: false });
  await flushLots();
  await sleep(400);
  const stale = { msg: $("saveMsg").textContent, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key,
                  refusedLine: (state.history || []).some((h) => h.action === "Accept refused by KYTC's lot record") };
  return { ...first, stale };
};

/* TWO DEVICES - the production reviewer path. A contractor submits on device
 * A and emails the submittal; a KYTC reviewer opens that file on device B,
 * which has never held the lot, and presses Accept. Each device is its own
 * browser context (its own localStorage and its own copy of the stub
 * server); the server as A left it is carried across, as the real one would
 * be. REVIEW above does all of it on one device and one store, which is not
 * where a stale pending seal or a stale status can show up. */
const SUBMIT_ON_A = async ({ approval, offline }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  // No signal at the plant: the submittal goes by email, its seal waits here.
  if (offline) window.__HARNESS_OFFLINE = true;
  try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; window.__HARNESS_OFFLINE = false; }
  await sleep(300);
  const keep = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf("amaw_lot:") === 0) keep[k] = localStorage.getItem(k);
  }
  return { uid: state.lot.uid, submitted: JSON.parse(JSON.stringify(state.submitted)),
           msg: $("saveMsg").textContent, chip: $("syncChip").textContent,
           server: JSON.parse(JSON.stringify(window.__HARNESS_AMAW)), local: keep };
};
const REVIEW_ON_B = async ({ submitted, server, ledgerPatch, ledgerPatchAfterOpen, stalePending, offline, reopen,
                             reopenFromList, applyAfter }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__HARNESS_AMAW;
  if (server) { Object.assign(S.amaw_lots, server.amaw_lots); Object.assign(S.amaw_lot_data, server.amaw_lot_data); }
  const uid = submitted.lot.uid;
  if (ledgerPatch && S.amaw_lots[uid]) Object.assign(S.amaw_lots[uid], ledgerPatch);
  const lot = JSON.parse(JSON.stringify(submitted.lot));
  // An OLD .json, saved while the submission was still waiting for a signal:
  // it carries that seal long after the record took it.
  if (stalePending) {
    lot.pending_seal = { status: "Submitted", sha256: (S.amaw_lots[uid] || {}).submittal_sha256 || null,
                         prev: null, at: "2026-09-26T00:00:00.000Z" };
  }
  if (offline) window.__HARNESS_OFFLINE = true;
  // The PDF door: startLotFromPDF() routes a lot PDF to exactly this call.
  openLotEnvelope(lot, "the submittal");
  await sleep(1500);
  const facts = () => {
    const row = S.amaw_lots[uid] || {};
    const local = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
    const w = $("stageWarn");
    return { stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key, pill: $("statuspill").textContent,
             btn: $("advanceStage").textContent, btnDisabled: $("advanceStage").disabled,
             msg: $("saveMsg").textContent, cls: $("saveMsg").className,
             chip: $("syncChip").classList.contains("hidden") ? null : $("syncChip").textContent,
             chipTitle: $("syncChip").title || "",
             note: ($("lotSaveNote") || {}).textContent || "",
             warn: w && !w.classList.contains("hidden") ? w.textContent : null,
             ledger: row.status || null, acceptedName: row.accepted_name || null,
             local: local.status || null, pending: local.pending_seal ? local.pending_seal.status : null,
             dataRevision: (S.amaw_lot_data[uid] || {}).revision == null ? null : S.amaw_lot_data[uid].revision,
             history: (state.history || []).map((h) => `${h.action}|${h.name || h.sm_id || ""}`),
             audit: ($("auditlog") || {}).textContent || "" };
  };
  const opened = facts();
  // Another reviewer accepts it WHILE this one has it open - so this device's
  // own open saw Submitted, and it is the press that meets the record's "no".
  if (ledgerPatchAfterOpen && S.amaw_lots[uid]) Object.assign(S.amaw_lots[uid], ledgerPatchAfterOpen);
  let accepted = null;
  if (!$("advanceStage").disabled && !$("advanceStage").classList.contains("hidden")) {
    const before = $("saveMsg").textContent;
    document.getElementById("advanceStage").click();
    for (let i = 0; i < 80 && ($("saveMsg").textContent === before
                               || $("advanceStage").textContent === "Accepting..."); i++) await sleep(100);
    await sleep(400);
    accepted = facts();
  }
  let flushed = null;
  if (offline) {
    window.__HARNESS_OFFLINE = false;
    await flushLots();
    await sleep(300);
    flushed = facts();
  }
  // Lot storage arrives (amaw_lots.sql applied) after an Accept made without
  // it, and the next flush sends that Accept to a record that answers.
  let applied = null;
  if (applyAfter) {
    window.__HARNESS_UNAPPLIED = false;
    await flushLots();
    await sleep(400);
    applied = facts();
  }
  // The same submittal opened again on the device that accepted it - which
  // is how a reviewer builds the AMAW - once the record reads Accepted.
  let reopened = null;
  if (reopen) {
    openLotEnvelope(JSON.parse(JSON.stringify(submitted.lot)), "the submittal");
    await sleep(1500);
    reopened = facts();
  }
  // Refused at the button, then the reviewer comes back through the Start a
  // lot door's list - after the record has moved on (the contractor's seal
  // landed), which is where a second report used to say the record "still"
  // had the lot where it no longer did.
  let listReopened = null;
  if (reopenFromList) {
    if (reopenFromList.ledgerPatch && S.amaw_lots[uid]) Object.assign(S.amaw_lots[uid], reopenFromList.ledgerPatch);
    state.lot = null;
    showLotDoor("plantbook");
    await sleep(1200);
    await openLotFromStore(uid);
    await sleep(1500);
    go(stepIndexOf("lot-status"));
    await sleep(400);
    listReopened = facts();
  }
  return { opened, accepted, flushed, applied, reopened, listReopened, server: JSON.parse(JSON.stringify(S)) };
};

/* ONE DEVICE, NO LOT STORAGE: Submit, then Accept on the same device (a demo,
 * or a reviewer trying the flow), then amaw_lots.sql is applied. The Accept is
 * stamped over the waiting submission and CARRIES it, so the record takes the
 * two in order. It used to drop the submission - "nothing will ever send it" -
 * and the lone Accept was refused ("no such lot"), leaving the lot out of the
 * ledger for good. */
const UNAPPLIED_SAME_DEVICE = async ({ approval }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__HARNESS_AMAW;
  const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
  openLotEnvelope(out.lot, "the harness");
  const uid = state.lot.uid;
  await sleep(CONFIG.STORAGE.AUTOSAVE_MS + 700);
  const c = window.confirm, s = window.saveBytes;
  window.confirm = () => true; window.saveBytes = () => {};
  try { await submitLotToKYTC(); } finally { window.confirm = c; window.saveBytes = s; }
  const hash = await lotPayloadHash(state.submitted);
  go(stepIndexOf("lot-status"));
  await sleep(400);
  const before = $("saveMsg").textContent;
  document.getElementById("advanceStage").click();
  for (let i = 0; i < 80 && ($("saveMsg").textContent === before
                             || $("advanceStage").textContent === "Accepting..."); i++) await sleep(100);
  await sleep(400);
  const held0 = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
  const accepted = { msg: $("saveMsg").textContent, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key,
                     pending: held0.pending_seal || null, ledger: (S.amaw_lots[uid] || {}).status || null };
  window.__HARNESS_UNAPPLIED = false;            // Andrew applies amaw_lots.sql
  await flushLots();
  await sleep(500);
  const held = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
  const row = S.amaw_lots[uid] || {};
  return { hash, accepted,
           after: { msg: $("saveMsg").textContent, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key,
                    warn: $("stageWarn").classList.contains("hidden") ? null : $("stageWarn").textContent,
                    chip: $("syncChip").classList.contains("hidden") ? null : $("syncChip").textContent,
                    ledger: row.status || null, sha: row.submittal_sha256 || null, acceptedName: row.accepted_name || null,
                    local: held.status || null, pending: held.pending_seal || null, refused: held.seal_refused || null,
                    outbox: (await state.store.local.outbox()).length } };
};

/* The contractor's own device, later: its localStorage as it was left, and
 * the server as KYTC left it after accepting. The list and the lot it opens
 * have to agree - the list said Accepted and the lot opened as Submitted. */
const CONTRACTOR_LATER = async ({ local, server, uid }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const k of Object.keys(local || {})) localStorage.setItem(k, local[k]);
  const S = window.__HARNESS_AMAW;
  Object.assign(S.amaw_lots, server.amaw_lots);
  Object.assign(S.amaw_lot_data, server.amaw_lot_data);
  await paintLotList();
  const el = document.querySelector(`#lotListWrap [data-lot-uid="${uid}"]`);
  const row = el ? el.textContent.replace(/\s+/g, " ").trim() : null;
  state.lot = null;
  await openLotFromStore(uid);
  await sleep(1500);
  return { row, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key, pill: $("statuspill").textContent,
           chip: $("syncChip").classList.contains("hidden") ? null : $("syncChip").textContent,
           chipTitle: $("syncChip").title || "",
           acceptHidden: $("advanceStage").classList.contains("hidden") || $("advanceStage").disabled,
           local: (JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {}).status || null };
};

export async function run({ browser, results }) {
  const ok = (what, cond, detail) => results.add(id, BOOK, what, cond ? "PASS" : "FAIL", detail);

  const out = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => {
      await h.page.addScriptTag({ content: `window.fillFormFn = ${fillForm.toString()};` });
      const r = await h.page.evaluate(READ, { approval: APPROVAL });
      return { r, errs: realErrors(h.errs || []) };
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
  // pg_cron is not scheduled, so nothing is deleted yet: the seven days are
  // INTENT (CLAUDE.md, 2026-09-24), and the list and the chip say them so.
  ok("…and its legend gives the retention as intent, not as something that happens",
     /due to be deleted 7 days after it is submitted/.test(r.legend) && !/and then deleted/.test(r.legend), r.legend);
  ok("…as does the “saved” chip's title",
     /due to be deleted 7 days after this lot is submitted/.test(r.savedChrome.chipTitle), r.savedChrome.chipTitle);
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

  // ---- the saved-state line, beside a live chip ----
  ok("with lot storage live the appbar does not say “Not downloaded yet” beside “saved”",
     /saved/.test(r.savedChrome.chip) && r.savedChrome.savedHidden === true,
     `chip="${r.savedChrome.chip}" saved-state hidden=${r.savedChrome.savedHidden} ("${r.savedChrome.savedText}")`);

  // ---- a contractor cannot Accept ----
  const ca = r.contractorAccept;
  ok("a contractor is not offered Accept", ca.hidden === true, `button hidden=${ca.hidden}`);
  ok("…and pressing the hidden button anyway is refused by the page, before the record is asked",
     ca.sealCalls === 0 && /Only KYTC accepts a lot/.test(ca.msg) && /warn/.test(ca.cls),
     `seal calls=${ca.sealCalls} msg="${ca.msg}"`);
  ok("…and nothing moved: still Submitted here and in the ledger, no accepted_at",
     ca.stage === "Submitted" && ca.ledger === "Submitted" && !ca.acceptedAt,
     `stage=${ca.stage} ledger=${ca.ledger} accepted_at=${ca.acceptedAt}`);

  ok("no console errors through any of it",
     out.value.errs.length === 0, out.value.errs.slice(0, 3).join(" | ") || "clean");

  // ---- KYTC accepting, through the real button ----
  const rv = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true, query: "&sublots=open" },
    async (h) => {
      const v = await h.page.evaluate(REVIEW, { approval: APPROVAL });
      return { v, errs: realErrors(h.errs || []) };
    });
  if (rv.skipped) { results.skip(id, BOOK, "a reviewer's Accept", rv.skipped); }
  else {
    const v = rv.value.v;
    ok("a lot nobody has typed into lists as 0 of 4 sublots, not 4",
       !!v.listUntouched && /0 of 4 sublots/.test(v.listUntouched), v.listUntouched);
    ok("a reviewer is offered Accept on a submitted lot", /Accept/.test(v.offered || ""), `button="${v.offered}"`);
    const a = v.accepted;
    ok("Accept seals the ledger row Accepted", a.ledger === "Accepted", `ledger=${a.ledger}`);
    ok("…stamped with when and by whom, as amaw_seal_lot() stamps it",
       !!a.acceptedAt && !!a.acceptedName, `accepted_at=${a.acceptedAt} accepted_name=${a.acceptedName}`);
    ok("…and the page, the chip, this device and the lot list all agree",
       a.stage === "Accepted" && a.pill === "Accepted" && /accepted/.test(a.chip)
         && a.local === "Accepted" && a.pending === null && a.listStatus === "Accepted",
       `stage=${a.stage} pill=${a.pill} chip="${a.chip}" local=${a.local} pending=${JSON.stringify(a.pending)} list=${a.listStatus}`);
    ok("…and the audit log carries the accept line", /Lot accepted/.test(a.audit), a.audit.slice(0, 120));
    ok("…and the list row says when and by whom, not when it was last saved",
       /· Accepted \d{4}-\d\d-\d\d \d\d:\d\d by Harness Runner/.test(a.listRow || ""), a.listRow);
    ok("…and the sentence says the record took it", /record now says so/.test(a.msg) && /\bok\b/.test(a.cls), a.msg);

    ok("…and the chip's title says who accepted it", /by Harness Runner/.test(a.chipTitle || ""), a.chipTitle);

    const f = v.refused;
    ok("a refused Accept leaves the stage Submitted", f.stage === "Submitted" && f.pill === "Submitted",
       `stage=${f.stage} pill=${f.pill}`);
    ok("…prints the record's reason as an error",
       /did not go through/.test(f.msg) && /only a submitted lot can be accepted/.test(f.msg) && /error/.test(f.cls), f.msg);
    ok("…says where the record has the lot, never a hard-coded “still Submitted”",
       /KYTC's lot record still reads lot 2 as Submitted/.test(f.msg) && !/Lot 2 is still Submitted/.test(f.msg), f.msg);
    ok("…and shows it directly under the Accept button, not only in the rail",
       f.warn === f.msg && f.warnGap != null && f.warnGap >= 0 && f.warnGap < 120,
       `warn=${JSON.stringify(f.warn)} gap below the button=${f.warnGap}px`);
    ok("…the ledger never moved", f.ledger === "Submitted" && !f.acceptedAt, `ledger=${f.ledger} accepted_at=${f.acceptedAt}`);
    ok("…and this device took its stamp back off: Submitted, nothing pending",
       f.local === "Submitted" && f.pending === null, `local=${f.local} pending=${JSON.stringify(f.pending)}`);
    ok("…and, said at the button, the refusal is not kept to be said again",
       f.heldRefusal === null, `kept on this device: ${JSON.stringify(f.heldRefusal)}`);
    const ro = v.reopened;
    ok("reopened from the door's list, a refusal said at the button is NOT said again - no rail line, nothing under the button",
       !/did not take|did not go through|made without a signal/.test(ro.msg) && ro.warn === null
         && ro.stage === "Submitted" && /Accept/.test(ro.btn),
       `stage=${ro.stage} btn="${ro.btn}" warn=${JSON.stringify(ro.warn)} msg="${ro.msg}"`);
    ok("…and no “Accept refused” history line is written at reopen time, on the page or on this device",
       !ro.history.includes("Accept refused by KYTC's lot record")
         && !ro.storedHistory.includes("Accept refused by KYTC's lot record") && !/Accept refused/.test(ro.audit),
       `page: ${ro.history.join(" / ")} || stored: ${ro.storedHistory.join(" / ")}`);
    ok("…so pressing Accept again simply works, and the warning under the button goes",
       v.retried.ledger === "Accepted" && v.retried.stage === "Accepted" && v.retried.warn === null,
       `ledger=${v.retried.ledger} stage=${v.retried.stage} warn=${JSON.stringify(v.retried.warn)}`);

    ok("a lot known only from the server shows no sublot count rather than “0 of 4” - it says Open",
       !!v.listServerOnly && !/of 4 sublots/.test(v.listServerOnly) && /· Open ·/.test(v.listServerOnly), v.listServerOnly);
    ok("the reviewer's run is clean", rv.value.errs.length === 0, rv.value.errs.slice(0, 3).join(" | ") || "clean");
  }

  // ---- a refused Accept pressed at the bottom edge of the screen ----
  for (const [width, height] of [[390, 844], [1000, 800], [1366, 768]]) {
    const wv = await withBook(browser, PLANT, { width, height, canReview: true, query: "&sublots=open" },
      async (h) => ({ v: await h.page.evaluate(WARN_IN_VIEW, { approval: APPROVAL }), errs: realErrors(h.errs || []) }));
    if (wv.skipped) { results.skip(id, BOOK, `a refusal at the screen's edge (${width}px)`, wv.skipped); continue; }
    const x = wv.value.v;
    // At 1366x768 the Submit step fits without scrolling, so the button cannot
    // be put at the edge - there the line is simply on screen already.
    const atEdge = width < 1366;
    ok(`${width}x${height}: a refused Accept pressed ${atEdge ? "at the bottom edge" : "on a step that does not scroll"} shows its warning, clear of the header and the action bar`,
       x.shown && /did not go through/.test(x.text) && x.inView && x.overflowX <= 0
         && (!atEdge || (x.placed.btnBottom <= x.placed.limit && x.placed.btnBottom >= x.placed.limit - 8)),
       `warning ${x.top}-${x.bottom} against ${x.head}-${x.limit} (button placed at ${x.placed.btnBottom}/${x.placed.limit})`);
    ok(`${width}x${height}: …clean`, wv.value.errs.length === 0, wv.value.errs.slice(0, 3).join(" | ") || "clean");
  }

  // ---- Submit with no signal ----
  const os = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => {
      const v = await h.page.evaluate(OFFLINE_SUBMIT, { approval: APPROVAL });
      return { v, errs: realErrors(h.errs || []) };
    });
  if (os.skipped) { results.skip(id, BOOK, "Submit with no signal", os.skipped); }
  else {
    const o = os.value.v;
    ok("offline Submit: the sentence says the seal is WAITING, not that KYTC has it",
       /no signal/.test(o.offline.msg) && /when the connection is back/.test(o.offline.msg) && /warn/.test(o.offline.cls),
       o.offline.msg);
    ok("…and the chip says “waiting to be sealed”, not “submitted” - “when there is a signal”, to a device without one",
       /waiting to be sealed/.test(o.offline.chip) && /warn/.test(o.offline.chipCls) && /when there is a signal/.test(o.offline.chipTitle),
       `chip="${o.offline.chip}" title="${o.offline.chipTitle}"`);
    ok("…while the lot is Submitted here and the ledger is not yet",
       o.offline.stage === "Submitted" && o.offline.ledger !== "Submitted", `stage=${o.offline.stage} ledger=${o.offline.ledger}`);
    ok("…and once the signal is back the seal goes and the chip says so",
       o.flushed.ledger === "Submitted" && /submitted/.test(o.flushed.chip) && !/waiting/.test(o.flushed.chip),
       `ledger=${o.flushed.ledger} chip="${o.flushed.chip}"`);
    ok("reopened from the list while it waits, the chip still says so",
       o.offline.heldSeal === true && /waiting to be sealed/.test(o.offline.reopenedChip),
       `held a seal=${o.offline.heldSeal} chip="${o.offline.reopenedChip}"`);
    ok("…but the waiting seal is not put into the lot a file carries (snapshot and .json)",
       o.offline.snapshotSeal === null && o.offline.fileSeal === null,
       `snapshot=${JSON.stringify(o.offline.snapshotSeal)} .json=${JSON.stringify(o.offline.fileSeal)}`);
    ok("the offline run is clean", os.value.errs.length === 0, os.value.errs.slice(0, 3).join(" | ") || "clean");
  }

  // ---- a reviewer's Accept with no signal, and what the next flush makes of it ----
  for (const v of [{ name: "sealed", refuse: false, door: false },
                   { name: "another reviewer first", refuse: false, door: false, beaten: true },
                   { name: "refused, lot open", refuse: true, door: false },
                   { name: "refused at the door", refuse: true, door: true }]) {
    const r = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true, query: "&sublots=open" },
      async (h) => ({ v: await h.page.evaluate(ACCEPT_OFFLINE, { approval: APPROVAL, refuse: v.refuse, door: v.door,
                                                                 beaten: !!v.beaten }),
                      errs: realErrors(h.errs || []) }));
    if (r.skipped) { results.skip(id, BOOK, `an Accept with no signal (${v.name})`, r.skipped); continue; }
    const x = r.value.v;
    ok(`offline Accept (${v.name}): it waits first, and says so`,
       /no signal/.test(x.waiting.msg) && x.waiting.stage === "Accepted", x.waiting.msg);
    if (v.beaten) {
      // Tate accepted it on his own device while this one had no signal: the
      // record adopts rather than seals, and it is said as that.
      const pressed = x.after.history.indexOf("Lot accepted");
      ok("…another reviewer got there first: it says so, and whose - not “your Accept is now sealed”",
         /already said so \(by Tate Salle on 2026-09-26 06:03\), before the Accept made on this device reached it/.test(x.after.msg)
           && !/is now sealed/.test(x.after.msg) && x.after.stage === "Accepted" && x.ledger === "Accepted"
           && /by Tate Salle/.test(x.after.chipTitle), `msg="${x.after.msg}" title="${x.after.chipTitle}"`);
      ok("…and the “Lot accepted” line written when it was pressed gets one saying what became of it - on this device too",
         pressed >= 0 && x.after.history.lastIndexOf("Lot already accepted in KYTC's lot record") > pressed
           && x.held.history.lastIndexOf("Lot already accepted in KYTC's lot record") > x.held.history.indexOf("Lot accepted"),
         `page: ${x.after.history.join(" / ")} || stored: ${x.held.history.join(" / ")}`);
    } else if (!v.refuse) {
      ok("…once it seals, the “no signal” sentence is replaced by one that says so",
         /Accept is now sealed in KYTC's lot record/.test(x.after.msg) && x.ledger === "Accepted" && x.after.stage === "Accepted",
         `msg="${x.after.msg}" ledger=${x.ledger}`);
    } else {
      const refusedAt = x.after.history.lastIndexOf("Accept refused by KYTC's lot record");
      ok(`offline Accept (${v.name}): put back to Submitted, on the page and on this device, nothing pending`,
         x.after.stage === "Submitted" && x.held.status === "Submitted" && x.held.pending === null && x.ledger === "Submitted",
         `stage=${x.after.stage} held=${x.held.status} pending=${JSON.stringify(x.held.pending)} ledger=${x.ledger}`);
      ok("…saying that lot's OWN reason, beside the button as well as in the rail",
         /did not take lot 1's Accept made without a signal: only KYTC accepts a lot\./.test(x.after.msg)
           && x.after.warn === x.after.msg && /error/.test(x.after.cls), x.after.msg);
      ok("…and where the record had the lot WHEN IT REFUSED, in the past tense - the lot may be opened days later",
         /When it refused, the record read lot 1 as Submitted\./.test(x.after.msg) && !/still reads/.test(x.after.msg),
         x.after.msg);
      ok("…with a history line saying what became of the Accept, after the one written when it was pressed - kept on this device too",
         refusedAt > x.after.history.indexOf("Lot accepted") && x.after.history.indexOf("Lot accepted") >= 0
           && x.held.history.lastIndexOf("Accept refused by KYTC's lot record") > x.held.history.indexOf("Lot accepted"),
         `page: ${x.after.history.join(" / ")} || stored: ${x.held.history.join(" / ")}`);
      ok("…said once: the store stops carrying it, and the lot leaves the outbox",
         x.held.refused === null && x.outbox === 0 && !/not yet sent/.test(x.row || ""),
         `refusal kept=${JSON.stringify(x.held.refused)} outbox=${x.outbox} row="${x.row}"`);
      if (v.door) {
        ok("…and the door said it, when no lot was open",
           !!x.doorMsg && /did not take the Accept made without a signal of lot 1 on 00260467 \(only KYTC accepts a lot\)/.test(x.doorMsg.text)
             && /error/.test(x.doorMsg.cls), x.doorMsg && x.doorMsg.text);
        ok("…while the door's own list already shows it Submitted and nothing waiting to send",
           !!x.doorMsg && /· Submitted/.test(x.doorMsg.row || "") && !/not yet sent/.test(x.doorMsg.row || ""),
           x.doorMsg && x.doorMsg.row);
      }
    }
    ok(`offline Accept (${v.name}): clean`, r.value.errs.length === 0, r.value.errs.slice(0, 3).join(" | ") || "clean");
  }

  // ---- a seal that took, its reply lost: the next SAVE says so ----
  for (const which of ["Accepted", "Submitted"]) {
    const lr = await withBook(browser, PLANT, { width: 1366, height: 768, canReview: true, query: "&sublots=open" },
      async (h) => ({ v: await h.page.evaluate(LOST_REPLY, { approval: APPROVAL, which }), errs: realErrors(h.errs || []) }));
    if (lr.skipped) { results.skip(id, BOOK, `a lost reply (${which})`, lr.skipped); continue; }
    const x = lr.value.v;
    const word = which === "Accepted" ? /Lot 1's Accept is now sealed in KYTC's lot record\./ : /Lot 1 is now sealed in KYTC's lot record as submitted\./;
    ok(`a lost ${which} reply: the page says it waits (it cannot know better), while the record already took it`,
       x.dropped && x.noSignalAt >= 0 && x.ledgerAtWait === which, `ledger=${x.ledgerAtWait} said: ${x.said.join(" >> ")}`);
    ok(`…and the save that finds it on the record replaces “no signal” with the seal - not only a flush`,
       x.sealedAt > x.noSignalAt && word.test(x.after.msg) && !/no signal/.test(x.after.msg) && /\bok\b/.test(x.after.cls)
         && x.after.local === which && x.after.pending === null && x.after.stage === which,
       `msg="${x.after.msg}" local=${x.after.local} pending=${x.after.pending} said: ${x.said.join(" >> ")}`);
    ok(`…and the chip's title says who and when, taken there and then`,
       x.after.chip === which.toLowerCase() && /\(by Harness Runner on \d{4}-\d\d-\d\d \d\d:\d\d\)/.test(x.after.chipTitle),
       `chip=${x.after.chip} title="${x.after.chipTitle}"`);
    ok(`a lost ${which} reply: clean`, lr.value.errs.length === 0, lr.value.errs.slice(0, 3).join(" | ") || "clean");
  }
  // The same lost submission reply, found by the save only after KYTC has
  // accepted the lot: the answer is worded by the seal this device made (a
  // submission), and the page follows the record on to Accepted - a save has
  // no reconcileLotSeal() after it to do that.
  const lm = await withBook(browser, PLANT, { width: 1366, height: 768, query: "&sublots=open" },
    async (h) => ({ v: await h.page.evaluate(LOST_REPLY, { approval: APPROVAL, which: "Submitted", acceptedMeanwhile: true }),
                    errs: realErrors(h.errs || []) }));
  if (lm.skipped) { results.skip(id, BOOK, "a lost Submit reply, accepted meanwhile", lm.skipped); }
  else {
    const x = lm.value.v;
    ok("a lost Submit reply found after KYTC accepted: never told “your Accept is now sealed” - it pressed Submit",
       x.noSignalAt >= 0 && !x.said.some((t) => /Accept is now sealed/.test(t)), x.said.join(" >> "));
    ok("…and the page follows the record on to Accepted, saying who accepted it",
       x.after.stage === "Accepted" && /was accepted in KYTC's lot record \(by Tate Salle on 2026-09-26 06:03\)/.test(x.after.msg)
         && x.after.local === "Accepted" && x.after.pending === null,
       `stage=${x.after.stage} local=${x.after.local} msg="${x.after.msg}"`);
    ok("…clean", lm.value.errs.length === 0, lm.value.errs.slice(0, 3).join(" | ") || "clean");
  }

  // ---- a Submit the record refuses, and the next session ----
  const rs = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => ({ v: await h.page.evaluate(REFUSED_SUBMIT, { approval: APPROVAL }), errs: realErrors(h.errs || []) }));
  if (rs.skipped) { results.skip(id, BOOK, "a Submit the record refuses", rs.skipped); }
  else {
    const x = rs.value.v;
    ok("a refused Submit says why in words a technician can act on - another submission is on the record, and whose",
       /The lot record was not sealed: KYTC's lot record already holds a different submission of lot 1 \(by Night Shift on 2026-09-26 02:00\)/.test(x.refused.msg)
         && !/row-level security/.test(x.refused.msg) && /error/.test(x.refused.cls), x.refused.msg);
    ok("…the lot stays Submitted and the chip says “not sealed”, keeping the server's own words in its title",
       x.refused.stage === "Submitted" && x.refused.chip.text === "not sealed" && /bad/.test(x.refused.chip.cls)
         && /row-level security policy/.test(x.refused.chip.title), `chip=${JSON.stringify(x.refused.chip)}`);
    ok("…and in the next session it is STILL “not sealed” - not “waiting to be sealed ... when there is a signal”",
       x.reopened.chip.text === "not sealed" && !/when there is a signal/.test(x.reopened.chip.title)
         && x.reopened.heldPending === true && x.reopened.heldRefused === "Submitted",
       `chip=${JSON.stringify(x.reopened.chip)} pending=${x.reopened.heldPending} refusal=${x.reopened.heldRefused}`);
    ok("…clean", rs.value.errs.length === 0, rs.value.errs.slice(0, 3).join(" | ") || "clean");
  }

  // ---- a device that never pressed Accept ----
  const np = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => ({ v: await h.page.evaluate(NEVER_PRESSED, { approval: APPROVAL }), errs: realErrors(h.errs || []) }));
  if (np.skipped) { results.skip(id, BOOK, "a device that never pressed Accept", np.skipped); }
  else {
    const n = np.value.v;
    ok("a device that never pressed Accept is never told its Accept was refused",
       !/did not take/.test(n.msg) && n.stage === "Accepted", `stage=${n.stage} msg="${n.msg}"`);
    ok("…and a kept Accept refusal is never said over a lot this device holds as Accepted",
       !/did not take/.test(n.stale.msg) && n.stale.stage === "Accepted" && !n.stale.refusedLine,
       `stage=${n.stale.stage} history line=${n.stale.refusedLine} msg="${n.stale.msg}"`);
  }

  // ---- the production reviewer path: a submittal opened on another device ----
  const pa = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => ({ a: await h.page.evaluate(SUBMIT_ON_A, { approval: APPROVAL }), errs: realErrors(h.errs || []) }));
  if (pa.skipped) { results.skip(id, BOOK, "a reviewer on another device", pa.skipped); }
  else {
    const A = pa.value.a;
    const rowA = A.server.amaw_lots[A.uid] || {};
    const pb = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true },
      async (h) => ({ b: await h.page.evaluate(REVIEW_ON_B, { submitted: A.submitted, server: A.server, reopen: true }),
                      errs: realErrors(h.errs || []) }));
    if (pb.skipped) { results.skip(id, BOOK, "a reviewer on another device", pb.skipped); }
    else {
      const o = pb.value.b.opened, acc = pb.value.b.accepted || {};
      ok("another device: the reviewer opens the contractor's sealed submittal and is offered Accept",
         rowA.status === "Submitted" && o.stage === "Submitted" && /Accept/.test(o.btn) && !o.btnDisabled
           && o.local === "Submitted" && o.pending === null,
         `record=${rowA.status} stage=${o.stage} btn="${o.btn}" local=${o.local} pending=${o.pending}`);
      ok("…opening it wrote nothing into the contractor's data",
         o.dataRevision === ((A.server.amaw_lot_data[A.uid] || {}).revision), `revision ${o.dataRevision}`);
      ok("…the real Accept seals the record Accepted, stamped with the reviewer",
         acc.ledger === "Accepted" && acc.acceptedName === "Harness Runner", `ledger=${acc.ledger} by=${acc.acceptedName}`);
      ok("…and the page, the chip, this device and the audit agree",
         acc.stage === "Accepted" && /accepted/.test(acc.chip || "") && /by Harness Runner/.test(acc.chipTitle)
           && acc.local === "Accepted" && acc.pending === null && /Lot accepted/.test(acc.audit)
           && /record now says so/.test(acc.msg),
         `stage=${acc.stage} chip=${acc.chip} local=${acc.local} msg="${acc.msg}"`);
      // The reviewer reopens that same submittal to build the AMAW. The file
      // says Submitted; this device and the record say Accepted - and it used
      // to offer Accept again, which the record then refused.
      const re = pb.value.b.reopened || {};
      ok("reopening the submittal on the device that accepted it opens Accepted, and offers no Accept",
         re.stage === "Accepted" && re.pill === "Accepted" && re.btnDisabled === true && !/Accept →/.test(re.btn || "")
           && /was accepted in KYTC's lot record \(by Harness Runner/.test(re.msg || ""),
         `stage=${re.stage} btn="${re.btn}" disabled=${re.btnDisabled} msg="${re.msg}"`);

      // The contractor, later, on their own device: the list and the lot it
      // opens agree, and both say who accepted it and when.
      const cl = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
        async (h) => ({ c: await h.page.evaluate(CONTRACTOR_LATER, { local: A.local, server: pb.value.b.server, uid: A.uid }),
                        errs: realErrors(h.errs || []) }));
      if (cl.skipped) { results.skip(id, BOOK, "the contractor's device after KYTC accepted", cl.skipped); }
      else {
        const c = cl.value.c;
        ok("the contractor's list says Accepted, with when and by whom",
           /· Accepted \d{4}-\d\d-\d\d \d\d:\d\d by Harness Runner/.test(c.row || ""), c.row);
        ok("…and the lot it opens says Accepted too - not Submitted",
           c.stage === "Accepted" && c.pill === "Accepted" && /accepted/.test(c.chip || "")
             && /by Harness Runner/.test(c.chipTitle) && c.local === "Accepted",
           `stage=${c.stage} pill=${c.pill} chip=${c.chip} local=${c.local}`);
        ok("…with the contractor's run clean", cl.value.errs.length === 0, cl.value.errs.slice(0, 3).join(" | ") || "clean");
      }
    }

    // A second reviewer who opens it AFTER the first accepted: the page takes
    // the record's chain on open, so Accept is never offered at all.
    const po = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true },
      async (h) => ({ b: await h.page.evaluate(REVIEW_ON_B, { submitted: A.submitted, server: A.server,
                        ledgerPatch: { status: "Accepted", accepted_at: "2026-09-26T06:03:53.000Z", accepted_name: "Tate Salle" } }),
                      errs: realErrors(h.errs || []) }));
    if (!po.skipped) {
      const o = po.value.b.opened;
      ok("a reviewer opening a lot another reviewer already accepted sees it Accepted, and no Accept button",
         o.stage === "Accepted" && o.btnDisabled === true && /was accepted in KYTC's lot record \(by Tate Salle/.test(o.msg || ""),
         `stage=${o.stage} btn="${o.btn}" disabled=${o.btnDisabled} msg="${o.msg}"`);
    }

    // A SECOND reviewer: both Andrew and Tate get the submittal email, and
    // Tate accepts while Andrew has it open.
    const pc = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true },
      async (h) => ({ b: await h.page.evaluate(REVIEW_ON_B, { submitted: A.submitted, server: A.server,
                        ledgerPatchAfterOpen: { status: "Accepted", accepted_at: "2026-09-26T06:03:53.000Z",
                                                accepted_name: "Tate Salle" } }),
                      errs: realErrors(h.errs || []) }));
    if (pc.skipped) { results.skip(id, BOOK, "a second reviewer", pc.skipped); }
    else {
      const acc = pc.value.b.accepted || {};
      ok("a second reviewer's Accept on a lot already accepted is not a failure: it says who did it",
         /already said so/.test(acc.msg || "") && /by Tate Salle/.test(acc.msg || "") && /\bok\b/.test(acc.cls || "")
           && !/did not go through/.test(acc.msg || ""), acc.msg);
      ok("…the page and this device read Accepted, nothing pending, and the chip names Tate",
         acc.stage === "Accepted" && acc.local === "Accepted" && acc.pending === null && /by Tate Salle/.test(acc.chipTitle),
         `stage=${acc.stage} local=${acc.local} pending=${acc.pending} title="${acc.chipTitle}"`);
      ok("…and no “Lot accepted” history line is written in the second reviewer's name",
         !acc.history.some((h) => /^Lot accepted\|/.test(h)) && /already accepted/.test(acc.audit),
         acc.history.join(" / "));
      ok("the two-device runs are clean",
         pa.value.errs.length === 0 && (pb.skipped || pb.value.errs.length === 0) && pc.value.errs.length === 0,
         [...pa.value.errs, ...(pb.value ? pb.value.errs : []), ...pc.value.errs].slice(0, 3).join(" | ") || "clean");
    }
  }

  // ---- the record still reads Open: the contractor's seal is waiting ----
  // The submittal was emailed from a plant with no signal. The reviewer's
  // Accept is refused, and has to say WHY in the record's terms - it used to
  // end "Lot 1 is still Submitted" over a ledger reading Open - and pressing
  // it must not write the reviewer's copy into the contractor's data again.
  const wa = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => ({ a: await h.page.evaluate(SUBMIT_ON_A, { approval: APPROVAL, offline: true }), errs: realErrors(h.errs || []) }));
  if (wa.skipped) { results.skip(id, BOOK, "Accept while the contractor's seal waits", wa.skipped); }
  else {
    const W = wa.value.a;
    // The contractor's own waiting seal, as the record will take it once the
    // plant has a signal: THIS submission's hash, not a made-up one.
    const heldA = JSON.parse((W.local || {})["amaw_lot:" + W.uid] || "null") || {};
    const landed = { status: "Submitted", submittal_sha256: (heldA.pending_seal || {}).sha256 || null,
                     submitted_name: "Jo Contractor", submitted_at: "2026-09-26T10:00:00.000Z" };
    const wb = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true },
      async (h) => ({ b: await h.page.evaluate(REVIEW_ON_B, { submitted: W.submitted, server: W.server,
                                                             reopenFromList: { ledgerPatch: landed } }),
                      errs: realErrors(h.errs || []) }));
    if (wb.skipped) { results.skip(id, BOOK, "Accept while the contractor's seal waits", wb.skipped); }
    else {
      const o = wb.value.b.opened, acc = wb.value.b.accepted || {};
      ok("contractor's seal waiting: the reviewer's Accept is refused, saying the record still has the lot Open",
         (W.server.amaw_lots[W.uid] || {}).status === "Open" && /did not go through/.test(acc.msg || "")
           && /still has lot 1 Open - its submission has not reached the record yet/.test(acc.msg || "")
           && !/is still Submitted/.test(acc.msg || ""), acc.msg);
      ok("…the page stays Submitted, with the refusal under the button",
         acc.stage === "Submitted" && acc.warn === acc.msg, `stage=${acc.stage} warn=${JSON.stringify(acc.warn)}`);
      ok("…and pressing Accept wrote nothing more into the contractor's data",
         acc.dataRevision === o.dataRevision, `revision ${o.dataRevision} on open -> ${acc.dataRevision} after Accept`);
      const lr = wb.value.b.listReopened || {};
      ok("…and once the contractor's seal lands, reopening from the door's list does not say that refusal again",
         !!landed.submittal_sha256 && lr.ledger === "Submitted" && lr.stage === "Submitted" && /Accept/.test(lr.btn || "")
           && lr.warn === null && !/did not take|did not go through|still has lot 1 Open/.test(lr.msg || ""),
         `ledger=${lr.ledger} stage=${lr.stage} btn="${lr.btn}" warn=${JSON.stringify(lr.warn)} msg="${lr.msg}"`);
      ok("…with no “Accept refused” history line written at reopen time",
         !(lr.history || []).some((h) => /^Accept refused/.test(h)) && !/Accept refused/.test(lr.audit || ""),
         (lr.history || []).join(" / "));
      ok("…both devices clean", wa.value.errs.length === 0 && wb.value.errs.length === 0,
         [...wa.value.errs, ...wb.value.errs].slice(0, 3).join(" | ") || "clean");
    }
  }

  // ---- a reviewer opening an OLD file that still carries a waiting seal ----
  // The record sealed that submission long ago; the file's seal must not be
  // offered again. With no signal - where it bites - the Accept used to be
  // refused as "lot 1's submission has not reached KYTC's lot record yet".
  const st = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open" },
    async (h) => ({ a: await h.page.evaluate(SUBMIT_ON_A, { approval: APPROVAL }), errs: realErrors(h.errs || []) }));
  if (st.skipped) { results.skip(id, BOOK, "a reviewer opening an old file", st.skipped); }
  else {
    const sr = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true },
      async (h) => ({ b: await h.page.evaluate(REVIEW_ON_B, { submitted: st.value.a.submitted, server: st.value.a.server,
                                                             stalePending: true, offline: true }),
                      errs: realErrors(h.errs || []) }));
    if (sr.skipped) { results.skip(id, BOOK, "a reviewer opening an old file", sr.skipped); }
    else {
      const b = sr.value.b, acc = b.accepted || {};
      ok("an old file's waiting seal is not offered again: the chip does not say “waiting to be sealed”",
         b.opened.chip !== "waiting to be sealed" && b.opened.pending === null,
         `chip=${JSON.stringify(b.opened.chip)} this device's seal=${JSON.stringify(b.opened.pending)}`);
      ok("…so a reviewer with no signal can Accept it - it waits, it is not refused",
         acc.stage === "Accepted" && /no signal/.test(acc.msg || "") && !/did not go through/.test(acc.msg || ""),
         acc.msg);
      ok("…and it seals Accepted once the signal is back",
         !!b.flushed && b.flushed.ledger === "Accepted", b.flushed && b.flushed.ledger);
      ok("…both devices clean", st.value.errs.length === 0 && sr.value.errs.length === 0,
         [...st.value.errs, ...sr.value.errs].slice(0, 3).join(" | ") || "clean");
    }
  }

  // ---- and the same page on a project without the schema ----
  const un = await withBook(browser, PLANT,
    { width: 1440, height: 1000, query: "&sublots=open", unapplied: true },
    async (h) => {
      const r = await h.page.evaluate(UNAPPLIED, { approval: APPROVAL });
      return { r, errs: realErrors(h.errs || []) };
    });
  if (un.skipped) { results.skip(id, BOOK, "with the schema unapplied", un.skipped); return; }
  const u = un.value.r;

  ok("unapplied: the form still renders", u.formAlive > 0, `${u.formAlive} sections`);
  ok("unapplied: a lot still saves on this device",
     u.savedLocally && String(u.localTons) === "4123", `lot_tons=${JSON.stringify(u.localTons)}`);
  ok("unapplied: nothing reached the server", u.serverEmpty, u.serverEmpty);
  ok("unapplied: available() says local is fine and remote is not",
     u.availLocal === true && u.availRemote === false, `local=${u.availLocal} remote=${u.availRemote}`);
  ok("unapplied: …naming the missing migration rather than a stack trace",
     /has not been applied/.test(u.availReason || ""), u.availReason);

  // NOT SET UP IS NOT OFFLINE, and for a day the page said it was: the chip
  // read "offline · 1 waiting" to contractors who were online, because the
  // failure is transient for RETRY purposes (Andrew, 2026-09-23). These three
  // assert the honest version, off the store's own flag rather than the
  // wording of its error.
  ok("unapplied: the store says NOT SET UP, and leaves online alone",
     u.availNotSetUp === true && u.stateNotSetUp === true && u.stateOnline === true,
     `notSetUp=${u.stateNotSetUp} online=${u.stateOnline}`);
  ok("unapplied: …so there is no sync chip at all", u.chipHidden === true, `chip="${u.chip}"`);
  ok("unapplied: …and the list does not promise a retention nothing enforces",
     u.listSaysRetention === false && u.listSaysNotYetSent === false,
     `retention=${u.listSaysRetention} notYetSent=${u.listSaysNotYetSent}`);

  ok("unapplied: the lot still lists, out of localStorage", u.listRows === 1, `${u.listRows} rows`);
  ok("unapplied: no console errors at all",
     un.value.errs.length === 0, un.value.errs.slice(0, 3).join(" | ") || "clean");

  // ---- a reviewer accepting a submittal, on a project without the schema ----
  // The reviewer's device has never held the lot and opens it from the file.
  // The seal function is missing too (PGRST202): that is NOT SET UP, and the
  // sentence has to say so - it read "there is no signal" against the real
  // PostgREST answer, and "relation does not exist" against this stub.
  const ua = await withBook(browser, PLANT, { width: 1440, height: 1000, query: "&sublots=open", unapplied: true },
    async (h) => ({ a: await h.page.evaluate(SUBMIT_ON_A, { approval: APPROVAL }), errs: realErrors(h.errs || []) }));
  if (ua.skipped) { results.skip(id, BOOK, "a reviewer's Accept with the schema unapplied", ua.skipped); return; }
  const ub = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true, unapplied: true },
    async (h) => ({ b: await h.page.evaluate(REVIEW_ON_B, { submitted: ua.value.a.submitted, server: null, applyAfter: true }),
                    errs: realErrors(h.errs || []) }));
  if (ub.skipped) { results.skip(id, BOOK, "a reviewer's Accept with the schema unapplied", ub.skipped); return; }
  const uo = ub.value.b.opened, uacc = ub.value.b.accepted || {};
  ok("unapplied: the contractor's Submit says lot storage is not set up and the file is the only record",
     /Lot storage is not set up here, so the site keeps nothing - that file is the only record\./.test(ua.value.a.msg || ""),
     ua.value.a.msg);
  ok("unapplied: a reviewer opening the submittal sees no sync chip and the file's save note",
     uo.chip === null && /saved copy/.test(uo.note), `chip=${JSON.stringify(uo.chip)} note="${uo.note}"`);
  ok("unapplied: …and Accept says lot storage is NOT SET UP - not “no signal”, not a refusal",
     /Lot storage is not set up here/.test(uacc.msg || "") && !/no signal/.test(uacc.msg || "")
       && !/did not go through/.test(uacc.msg || ""), uacc.msg);
  ok("unapplied: …the lot reads Accepted, still with no chip and the file's save note",
     uacc.stage === "Accepted" && uacc.chip === null && /saved copy/.test(uacc.note || ""),
     `stage=${uacc.stage} chip=${JSON.stringify(uacc.chip)} note="${uacc.note}"`);
  // The record arrives, has never seen this lot (the contractor's device never
  // sent it), and refuses the Accept. That Accept waited for LOT STORAGE, not
  // for a signal, and the sentence has to say which - it called every refusal
  // it said after the fact an Accept "made without a signal".
  const uap = ub.value.b.applied || {};
  ok("unapplied, then lot storage arrives: the refused Accept is put back and said as one made before lot storage - not “without a signal”",
     uap.stage === "Submitted" && /did not take lot 1's Accept made before lot storage was set up here: there is no such lot/.test(uap.msg || "")
       && !/without a signal/.test(uap.msg || "") && uap.warn === uap.msg,
     `stage=${uap.stage} msg="${uap.msg}"`);
  ok("unapplied: both devices ran clean", ua.value.errs.length === 0 && ub.value.errs.length === 0,
     [...ua.value.errs, ...ub.value.errs].slice(0, 3).join(" | ") || "clean");

  // ---- one device, no lot storage: Submit, Accept, then the migration lands ----
  const sd = await withBook(browser, PLANT, { width: 1440, height: 1000, canReview: true, query: "&sublots=open", unapplied: true },
    async (h) => ({ v: await h.page.evaluate(UNAPPLIED_SAME_DEVICE, { approval: APPROVAL }), errs: realErrors(h.errs || []) }));
  if (sd.skipped) { results.skip(id, BOOK, "one device, no lot storage, then the migration", sd.skipped); return; }
  const w = sd.value.v;
  ok("one device, no lot storage: Accept over the waiting submission is stamped, and carries it",
     w.accepted.stage === "Accepted" && /Lot storage is not set up here/.test(w.accepted.msg)
       && !!w.accepted.pending && w.accepted.pending.status === "Accepted" && !!w.accepted.pending.submit
       && w.accepted.pending.submit.sha256 === w.hash && w.accepted.ledger === null,
     `stage=${w.accepted.stage} pending=${JSON.stringify(w.accepted.pending)} msg="${w.accepted.msg}"`);
  ok("…and once amaw_lots.sql is applied, the record takes the submission AND the Accept, under the submittal's own hash",
     w.after.ledger === "Accepted" && w.after.sha === w.hash && w.after.acceptedName === "Harness Runner",
     `ledger=${w.after.ledger} sha matches=${w.after.sha === w.hash} by=${w.after.acceptedName}`);
  ok("…with this device Accepted, nothing pending or refused, nothing said as refused, and the chip live",
     w.after.local === "Accepted" && w.after.pending === null && w.after.refused === null && w.after.outbox === 0
       && w.after.stage === "Accepted" && w.after.warn === null && !/did not take/.test(w.after.msg) && w.after.chip === "accepted",
     `local=${w.after.local} pending=${JSON.stringify(w.after.pending)} refused=${JSON.stringify(w.after.refused)} chip=${w.after.chip} msg="${w.after.msg}"`);
  ok("…clean", sd.value.errs.length === 0, sd.value.errs.slice(0, 3).join(" | ") || "clean");
}
