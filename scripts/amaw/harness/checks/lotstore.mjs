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
  // In step and online: the chip is the save, so the appbar's saved-state line
  // must not sit beside it saying "Not downloaded yet" (renderSavedState()).
  const savedChrome = { chip: $("syncChip").textContent, savedHidden: $("savedstate").hidden,
                        savedText: $("savedstate").textContent };

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
    contractorAccept, savedChrome,
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
    listSaysRetention: /kept for/.test(listText),
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
    const before = $("saveMsg").textContent;
    document.getElementById("advanceStage").click();
    for (let i = 0; i < 80 && ($("saveMsg").textContent === before
                               || $("advanceStage").textContent === "Accepting..."); i++) await sleep(100);
    await sleep(300);
  };
  const snap = (uid) => {
    const row = server.amaw_lots[uid] || {};
    const local = JSON.parse(localStorage.getItem("amaw_lot:" + uid) || "null") || {};
    return { stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key, pill: $("statuspill").textContent,
             msg: $("saveMsg").textContent, cls: $("saveMsg").className, chip: $("syncChip").textContent,
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
  // ...and it is left clean, so the next Accept simply works.
  await pressAccept();
  const retried = snap(u2);

  // A lot this device no longer holds, known only from the server.
  const u3 = await open(3);
  await state.store.local.remove(u3);
  await paintLotList();
  const listServerOnly = listRow(u3);

  return { offered, accepted, refused, retried, listUntouched, listServerOnly };
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
                    chip: $("syncChip").textContent, chipCls: $("syncChip").className,
                    ledger: (server.amaw_lots[uid] || {}).status || null, stage: (CONFIG.LOT_STAGES[state.stageIdx] || {}).key };
  window.__HARNESS_OFFLINE = false;
  await flushLots();
  const flushed = { chip: $("syncChip").textContent, ledger: (server.amaw_lots[uid] || {}).status || null };
  return { offline, flushed };
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
    ok("…and the sentence says the record took it", /record now says so/.test(a.msg) && /\bok\b/.test(a.cls), a.msg);

    const f = v.refused;
    ok("a refused Accept leaves the stage Submitted", f.stage === "Submitted" && f.pill === "Submitted",
       `stage=${f.stage} pill=${f.pill}`);
    ok("…prints the record's reason as an error",
       /did not go through/.test(f.msg) && /only a submitted lot can be accepted/.test(f.msg) && /error/.test(f.cls), f.msg);
    ok("…the ledger never moved", f.ledger === "Submitted" && !f.acceptedAt, `ledger=${f.ledger} accepted_at=${f.acceptedAt}`);
    ok("…and this device took its stamp back off: Submitted, nothing pending",
       f.local === "Submitted" && f.pending === null, `local=${f.local} pending=${JSON.stringify(f.pending)}`);
    ok("…so pressing Accept again simply works", v.retried.ledger === "Accepted" && v.retried.stage === "Accepted",
       `ledger=${v.retried.ledger} stage=${v.retried.stage}`);

    ok("a lot known only from the server shows no sublot count rather than “0 of 4”",
       !!v.listServerOnly && !/of 4 sublots/.test(v.listServerOnly), v.listServerOnly);
    ok("the reviewer's run is clean", rv.value.errs.length === 0, rv.value.errs.slice(0, 3).join(" | ") || "clean");
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
    ok("…and the chip says “waiting to be sealed”, not “submitted”",
       /waiting to be sealed/.test(o.offline.chip) && /warn/.test(o.offline.chipCls), `chip="${o.offline.chip}"`);
    ok("…while the lot is Submitted here and the ledger is not yet",
       o.offline.stage === "Submitted" && o.offline.ledger !== "Submitted", `stage=${o.offline.stage} ledger=${o.offline.ledger}`);
    ok("…and once the signal is back the seal goes and the chip says so",
       o.flushed.ledger === "Submitted" && /submitted/.test(o.flushed.chip) && !/waiting/.test(o.flushed.chip),
       `ledger=${o.flushed.ledger} chip="${o.flushed.chip}"`);
    ok("the offline run is clean", os.value.errs.length === 0, os.value.errs.slice(0, 3).join(" | ") || "clean");
  }

  // ---- and the same page on a project without the schema ----
  const un = await withBook(browser, PLANT,
    { width: 1440, height: 1000, query: "&sublots=open", unapplied: true },
    async (h) => {
      const r = await h.page.evaluate(UNAPPLIED, { approval: APPROVAL });
      return { r, errs: realErrors(h.errors || []) };
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
}
