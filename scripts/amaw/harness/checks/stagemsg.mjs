/* CHECK 12 — the Submit confirmation is where the Submit button is.
 *
 * F1, 2026-09-26. The sentence a Submit writes - which file was made, that it
 * has to be emailed to KYTC - went only into #saveMsg, which lives in
 * #valBlock and does not move (decided 2026-09-11). Measured before the fix:
 * on a phone that is ~12,000px above the button (~62,000 on a lot), and at
 * 1366x768 on a lot it sat under the fixed action bar. So the line is echoed
 * into #stageMsg under the stage button, and after a submission a send row
 * names the address, the exact file, a Copy button and a mailto.
 *
 * Driven through the REAL button, in both books, at a phone and a laptop:
 * only the confirm dialog and the download are stubbed (a headless browser
 * has nowhere to put a file), so the PDF is really built and the name
 * compared is the name saveBytes() was handed.
 *
 * And the refusal: with CONFIG.SUBMIT.KYTC_EMAIL null, none of the new
 * controls may render - the CONFIG comment's "never invent an address".
 */
import { withBook, enterBook, DESIGN, PLANT } from "../lib/books.mjs";
import { openPage, realErrors } from "../lib/page.mjs";

export const id = "stagemsg";

const APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};

const SIZES = [[390, 844], [1366, 768]];

/* In-page: open the Status / Submit step and bring the stage button into the
 * clear part of the screen, the way a person pressing it would have it. */
const TO_STATUS = () => {
  const id = isPlantBook() ? "lot-status" : "status";
  const i = activeSections().findIndex((s) => s.id === id);
  if (window.innerWidth > 700 && i >= 0) go(i);
};
const CENTRE = () => { document.getElementById("advanceStage").scrollIntoView({ block: "center" }); };

/* In-page: every measurement this check makes, taken at one moment. */
const MEASURE = () => {
  const $$ = (id) => document.getElementById(id);
  const head = document.querySelector(".appbar");
  const top = head ? head.getBoundingClientRect().bottom : 0;
  const bar = document.querySelector(".actionbar:not(.hidden)");
  const floor = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : window.innerHeight;
  const inView = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.height) return null;                        // not laid out: hidden
    return r.top >= top - 0.5 && r.bottom <= floor + 0.5;
  };
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  const sm = $$("stageMsg"), save = $$("saveMsg"), btn = $$("advanceStage"), row = $$("sendRow");
  const cs = sm ? getComputedStyle(sm) : null;
  const kind = (el) => el ? ((el.className.match(/\b(ok|warn|error)\b/) || [])[1] || "") : null;
  const mails = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) => a.getAttribute("href"));
  return {
    band: [Math.round(top), Math.round(floor)],
    stageText: sm ? sm.textContent : null, stageTitle: sm ? sm.title : null,
    saveText: save ? save.textContent : null,
    stageKind: kind(sm), saveKind: kind(save),
    stageRole: sm ? sm.getAttribute("role") : null, stageLive: sm ? sm.getAttribute("aria-live") : null,
    saveLive: save ? (save.getAttribute("aria-live") || save.getAttribute("role") || "") : null,
    oneLine: cs ? cs.whiteSpace === "nowrap" && cs.textOverflow === "ellipsis" && cs.overflow === "hidden" : false,
    clamp: cs ? Number(cs.webkitLineClamp) || null : null,
    lineHeights: sm && cs ? sm.getBoundingClientRect().height / parseFloat(cs.lineHeight) : null,
    stageInView: inView(sm), stageRect: rect(sm),
    btnVisible: !!(btn && btn.getBoundingClientRect().height), btnInView: inView(btn), btnRect: rect(btn),
    // Document order: the echo comes after the stage button and before the note.
    order: !!(sm && btn && $$("stageNote")
      && (btn.compareDocumentPosition(sm) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (sm.compareDocumentPosition($$("stageNote")) & Node.DOCUMENT_POSITION_FOLLOWING)),
    rowShown: !!(row && !row.classList.contains("hidden") && row.getBoundingClientRect().height),
    rowHTML: row ? row.innerHTML : null,
    file: ($$("sendFile") || {}).textContent || null,
    copyBtn: !!$$("sendCopyBtn"),
    mails,
    note: ($$("stageNote") || {}).textContent || "",
    medl: ($$("medlNote") || {}).textContent || "",
    scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
  };
};

async function submitCase(browser, book, w, h, { nullEmail = false } = {}) {
  return withBook(browser, book, { width: w, height: h }, async ({ page, errs }) => {
    await page.addStyleTag({ content: ".section{animation:none!important;opacity:1!important}" });
    if (book === PLANT) {
      await page.evaluate((approval) => {
        const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
        openLotEnvelope(out.lot, "the harness");
      }, APPROVAL);
      await page.waitForTimeout(600);
    }
    if (nullEmail) await page.evaluate(() => { CONFIG.SUBMIT.KYTC_EMAIL = null; renderStage(); });
    await page.evaluate(TO_STATUS);
    await page.waitForTimeout(300);
    if (book === PLANT) {                     // Open -> Closed, through the real button
      await page.evaluate(CENTRE);
      await page.click("#advanceStage");
      await page.waitForTimeout(200);
    }
    await page.evaluate(CENTRE);
    await page.waitForTimeout(200);
    const before = await page.evaluate(MEASURE);
    await page.evaluate(() => {
      window.__realConfirm = window.confirm; window.__realSave = window.saveBytes;
      window.__dl = null;
      window.confirm = () => true;
      window.saveBytes = (bytes, name) => { window.__dl = name; };
    });
    await page.click("#advanceStage");
    await page.waitForFunction(() => window.__dl && /downloaded/.test(document.getElementById("saveMsg").textContent),
                               null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const after = await page.evaluate(MEASURE);
    const downloaded = await page.evaluate(() => window.__dl);
    let copied = null;
    if (after.copyBtn) {
      await page.click("#sendCopyBtn");
      await page.waitForTimeout(250);
      copied = await page.evaluate(() => document.getElementById("sendCopyBtn").textContent);
    }
    // A message written with NO stage render after it - re-downloading the
    // submittal - reaches the echo through msg() itself. Submit re-renders
    // the stage in its finally, which would hide msg()'s own echo missing.
    const redl = book === PLANT ? "#lotSubmittalBtn" : "#submittalPdfBtn";
    await page.evaluate(() => { window.__dl = null; document.getElementById("saveMsg").textContent = ""; });
    await page.click(redl);
    await page.waitForFunction(() => window.__dl && /downloaded/.test(document.getElementById("saveMsg").textContent),
                               null, { timeout: 30000 }).catch(() => {});
    const redownload = await page.evaluate(MEASURE);
    // renderForm() re-creates the whole Status step, #stageMsg and #sendRow
    // with it - which is what a book switch, a reopened file and a Polish
    // show/hide all do. The line and the row have to come back.
    await page.evaluate(() => { renderForm(); });
    await page.waitForTimeout(200);
    const rerender = await page.evaluate(MEASURE);
    await page.evaluate(() => { window.confirm = window.__realConfirm; window.saveBytes = window.__realSave; });
    return { before, after, redownload, rerender, downloaded, copied, errs: realErrors(errs) };
  });
}

/* In-page: submit the design on screen through the real button, with the
 * confirm dialog and the download stubbed, and resolve to what saveBytes()
 * was handed. */
async function submitDesign(page) {
  await page.evaluate(TO_STATUS);
  await page.waitForTimeout(250);
  await page.evaluate(CENTRE);
  await page.evaluate(() => {
    window.__dl = null;
    window.confirm = () => true;
    window.saveBytes = (bytes, name) => { window.__dl = name; };
  });
  await page.click("#advanceStage");
  await page.waitForFunction(() => window.__dl && /downloaded/.test(document.getElementById("saveMsg").textContent),
                             null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__dl);
}

/* The send row says "the file that just downloaded", so it is for a
 * submission made on THIS page, in this session - never for a file someone
 * opened. Four ways a submittal reaches the page without being submitted
 * here, each of which used to light the row: a reviewer opening the
 * submittal they were emailed (and then approving it, which left the row
 * telling Andrew or Tate to email themselves), a contractor reopening an
 * approved design, and the other book's submittal in the shared
 * state.submitted slot. Plus the echo's own book: a line one book wrote must
 * not appear under the other book's stage button. */
async function custodyCases(browser, results) {
  const ok = (what, cond, detail) => results.ok(id, "DesignBook", `custody ${what}`, !!cond, detail);
  const rowOf = () => {
    const row = document.getElementById("sendRow");
    return {
      shown: !!(row && !row.classList.contains("hidden") && row.getBoundingClientRect().height),
      mails: document.querySelectorAll('a[href^="mailto:"]').length,
      stage: (isPlantBook() ? CONFIG.LOT_STAGES : CONFIG.STAGES)[state.stageIdx].key,
      echo: (document.getElementById("stageMsg") || {}).textContent || "",
      save: (document.getElementById("saveMsg") || {}).textContent || "",
    };
  };
  const ANIM = ".section{animation:none!important;opacity:1!important}";

  // 1. A contractor submits; then, on the same page, the other book.
  let frozen = null, downloaded = null;
  {
    const h = await openPage(browser, { width: 1366, height: 768 });
    try {
      await h.page.addStyleTag({ content: ANIM });
      // Before Submit: the live region is already in the accessibility tree,
      // empty. A region that arrives together with its first message is not
      // reliably announced.
      await h.page.evaluate(TO_STATUS);
      await h.page.waitForTimeout(250);
      const cdp = await h.page.context().newCDPSession(h.page);
      const ax = await cdp.send("Accessibility.getFullAXTree");
      const live = ax.nodes.filter((n) => n.role && n.role.value === "status" && !n.ignored);
      const disp = await h.page.evaluate(() => getComputedStyle(document.getElementById("stageMsg")).display);
      ok("the empty live region is in the accessibility tree before Submit", live.length === 1 && disp !== "none",
         `status nodes=${live.length} display=${disp}`);
      downloaded = await submitDesign(h.page);
      frozen = await h.page.evaluate(() => JSON.parse(JSON.stringify(state.submitted)));
      const own = await h.page.evaluate(rowOf);
      ok("a submission made here shows the send row", !!downloaded && own.shown && own.mails === 1,
         `downloaded=${downloaded} shown=${own.shown} mailtos=${own.mails}`);
      // To PlantBook, and a lot opened through the real front door. The
      // design's submittal is still in state.submitted - it is not the lot's.
      await h.page.evaluate((approval) => {
        switchBook("plantbook");
        const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
        openLotEnvelope(out.lot, "the harness");
      }, APPROVAL);
      await h.page.waitForTimeout(500);
      await h.page.evaluate(TO_STATUS);
      await h.page.waitForTimeout(250);
      const lot = await h.page.evaluate(rowOf);
      const held = await h.page.evaluate(() => !!submittedFor("designbook"));
      ok("on a lot, the design's submittal shows no send row and no mailto", held && !lot.shown && lot.mails === 0,
         `design submittal held=${held} shown=${lot.shown} mailtos=${lot.mails}`);
      await h.page.evaluate(() => { switchBook("designbook"); });
      await h.page.waitForTimeout(300);
      await h.page.evaluate(TO_STATUS);
      await h.page.waitForTimeout(250);
      const back = await h.page.evaluate(rowOf);
      ok("back on DesignBook, the design's send row returns", back.shown && back.mails === 1,
         `shown=${back.shown} mailtos=${back.mails}`);
      ok("…and the lot's line is not echoed under DesignBook's button",
         /lot/i.test(back.save) && back.echo === "",
         `saveMsg=${JSON.stringify(back.save.slice(0, 40))} echo=${JSON.stringify(back.echo.slice(0, 40))}`);
      ok("clean console", realErrors(h.errs).length === 0, realErrors(h.errs).join(" | ") || "clean");
    } finally { await h.close(); }
  }
  if (!frozen) return;

  // 2. A reviewer opens that submittal, then approves it.
  let approved = null;
  {
    const h = await openPage(browser, { width: 1366, height: 768, canReview: true });
    try {
      await h.page.addStyleTag({ content: ANIM });
      await h.page.evaluate((p) => {
        state.tech.sm_id = "adenmark";      // not the submitter, so Approve is offered
        enterFromHandoff(p, "DesignBook_submittal_x.pdf");
      }, frozen);
      await h.page.waitForTimeout(300);
      await h.page.evaluate(TO_STATUS);
      await h.page.waitForTimeout(250);
      const opened = await h.page.evaluate(rowOf);
      ok("a reviewer opening a submittal sees no send row and no mailto",
         opened.stage === "Submitted" && !opened.shown && opened.mails === 0,
         `stage=${opened.stage} shown=${opened.shown} mailtos=${opened.mails}`);
      await h.page.evaluate(() => {
        window.confirm = () => true;
        const real = window.fetch;
        window.fetch = (url, init) => String(url).includes(CONFIG.SUBMIT.SIGN_FN)
          ? Promise.resolve(new Response(JSON.stringify({
              mix_id: "00260467", approval_no: "#467", sequence: 467, year: "26", pa: "",
              code: "HARNESS", issued_at: "2026-09-26T00:00:00.000Z",
              approved_by: "adenmark", submitted_by: "harness" }), { status: 200 }))
          : real(url, init);
        document.getElementById("approvalSeq").value = "467";
      });
      await h.page.evaluate(CENTRE);
      await h.page.click("#advanceStage");
      await h.page.waitForFunction(() => !!state.approval, null, { timeout: 15000 }).catch(() => {});
      await h.page.waitForTimeout(250);
      const after = await h.page.evaluate(rowOf);
      ok("after Approve, no send row and no mailto", after.stage === "Approved" && !after.shown && after.mails === 0,
         `stage=${after.stage} shown=${after.shown} mailtos=${after.mails}`);
      approved = await h.page.evaluate(() => JSON.parse(JSON.stringify(handoffPayload("Downloaded approval"))));
      ok("clean console", realErrors(h.errs).length === 0, realErrors(h.errs).join(" | ") || "clean");
    } finally { await h.close(); }
  }
  if (!approved) return;

  // 3. The contractor reopens the approved design.
  {
    const h = await openPage(browser, { width: 1366, height: 768 });
    try {
      await h.page.addStyleTag({ content: ANIM });
      await h.page.evaluate((p) => { enterFromHandoff(p, "KYTC_Approval_467_262120.pdf"); }, approved);
      await h.page.waitForTimeout(300);
      await h.page.evaluate(TO_STATUS);
      await h.page.waitForTimeout(250);
      const r = await h.page.evaluate(rowOf);
      ok("a contractor reopening an approved design sees no send row and no mailto",
         r.stage === "Approved" && !r.shown && r.mails === 0,
         `stage=${r.stage} shown=${r.shown} mailtos=${r.mails}`);
      ok("clean console", realErrors(h.errs).length === 0, realErrors(h.errs).join(" | ") || "clean");
    } finally { await h.close(); }
  }

  // 4. A reviewer submits a lot on this page and then accepts it: the row
  //    was right after Submit and is not after Accept - the stage gate.
  {
    const h = await openPage(browser, { width: 1366, height: 768, canReview: true });
    const pk = (what, cond, detail) => results.ok(id, "PlantBook", `custody ${what}`, !!cond, detail);
    try {
      const entered = await enterBook(h.page, PLANT);
      if (!entered.ok) { results.skip(id, "PlantBook", "custody", entered.why); return; }
      await h.page.addStyleTag({ content: ANIM });
      await h.page.evaluate((approval) => {
        const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
        openLotEnvelope(out.lot, "the harness");
      }, APPROVAL);
      await h.page.waitForTimeout(500);
      await h.page.evaluate(TO_STATUS);
      await h.page.waitForTimeout(250);
      await h.page.evaluate(() => {
        window.__dl = null;
        window.confirm = () => true;
        window.saveBytes = (bytes, name) => { window.__dl = name; };
      });
      await h.page.evaluate(CENTRE);
      await h.page.click("#advanceStage");                    // Open -> Closed
      await h.page.waitForTimeout(200);
      await h.page.evaluate(CENTRE);
      await h.page.click("#advanceStage");                    // Submit
      await h.page.waitForFunction(() => window.__dl && /downloaded/.test(document.getElementById("saveMsg").textContent),
                                   null, { timeout: 30000 }).catch(() => {});
      await h.page.waitForTimeout(300);
      const sub = await h.page.evaluate(rowOf);
      pk("a reviewer's own lot Submit shows the send row", sub.stage === "Submitted" && sub.shown && sub.mails === 1,
         `stage=${sub.stage} shown=${sub.shown} mailtos=${sub.mails}`);
      await h.page.evaluate(CENTRE);
      await h.page.click("#advanceStage");                    // Accept
      await h.page.waitForFunction(() => state.lot && state.lot.status === "Accepted", null, { timeout: 15000 }).catch(() => {});
      await h.page.waitForTimeout(300);
      const acc = await h.page.evaluate(rowOf);
      pk("after Accept, no send row and no mailto", acc.stage === "Accepted" && !acc.shown && acc.mails === 0,
         `stage=${acc.stage} shown=${acc.shown} mailtos=${acc.mails}`);
      pk("clean console", realErrors(h.errs).length === 0, realErrors(h.errs).join(" | ") || "clean");
    } finally { await h.close(); }
  }
}

export async function run({ browser, results }) {
  const A = "Andrew.Denmark@ky.gov", T = "Tate.Salle@ky.gov";
  for (const book of [DESIGN, PLANT]) {
    for (const [w, h] of SIZES) {
      const at = `${w}x${h}`;
      const ok = (what, cond, detail) => results.ok(id, book.label, `${at} ${what}`, !!cond, detail);
      const out = await submitCase(browser, book, w, h);
      if (out.skipped) { results.skip(id, book.label, at, out.skipped); continue; }
      const { before, after, downloaded, copied, errs } = out.value;
      // DesignBook's stage note has a line to itself and names both. PlantBook's
      // shares one line with the save note and Start lot n+1 and says KYTC:
      // with the addresses it wrapped at 1440 (lineCase below).
      const pre = book === PLANT ? before.medl : before.note;
      if (book === PLANT) ok("the note before Submit says KYTC and no address", /KYTC/.test(pre) && !pre.includes("@"), pre);
      else ok("the note before Submit names both addresses", pre.includes(A) && pre.includes(T), pre);
      ok("…and nothing of the send row is there before a submission",
         !before.rowShown && before.mails.length === 0 && !before.copyBtn,
         `row shown=${before.rowShown} mailtos=${before.mails.length}`);
      ok("the stage button was in the clear part of the screen when pressed",
         before.btnInView === true, `button ${JSON.stringify(before.btnRect)} band ${JSON.stringify(before.band)}`);
      ok("a real Submit downloaded the submittal", !!downloaded, downloaded);
      ok("#stageMsg says exactly what #saveMsg says, in its kind",
         !!after.saveText && after.stageText === after.saveText && after.stageKind === after.saveKind,
         `stage=${JSON.stringify((after.stageText || "").slice(0, 70))} kind ${after.stageKind}/${after.saveKind}`);
      // One ellipsised line on a desktop; below 700px one line is a file name
      // and nothing else, so it wraps to three. (A warn/error wraps at every
      // width - warnCase below.)
      const phone = w <= 700;
      ok(phone ? "…wrapping to at most three lines on a phone, with the whole text in its title"
               : "…on one line, ellipsised, with the whole text in its title",
         after.lineHeights != null && after.stageTitle === after.saveText
           && (phone ? after.clamp === 3 && after.lineHeights > 1.6 && after.lineHeights < 3.1
                     : after.oneLine && after.lineHeights < 1.6),
         `lines=${after.lineHeights && after.lineHeights.toFixed(2)} oneLine=${after.oneLine} clamp=${after.clamp}`);
      ok("…sitting after the stage button and before the stage note", after.order, after.order);
      ok("…announced (role=status, aria-live=polite), and #saveMsg is NOT a second live region",
         after.stageRole === "status" && after.stageLive === "polite" && after.saveLive === "",
         `stage ${after.stageRole}/${after.stageLive} saveMsg "${after.saveLive}"`);
      ok("#stageMsg is on screen where the button is",
         after.stageInView === true && (!after.btnVisible || after.btnInView === true),
         `stageMsg ${JSON.stringify(after.stageRect)} button ${JSON.stringify(after.btnRect)} band ${JSON.stringify(after.band)}`);
      ok("exactly one mailto, carrying both addresses",
         after.mails.length === 1 && after.mails[0].startsWith(`mailto:${A},${T}?`),
         after.mails.map((m) => m.slice(0, 60)).join(" | ") || "none");
      const subj = after.mails[0] ? decodeURIComponent((after.mails[0].match(/subject=([^&]*)/) || [])[1] || "") : "";
      const wantSubj = book === PLANT ? "PlantBook submittal - 262120 - lot 1 - 00260467" : "DesignBook submittal - 262120";
      ok("…with the subject Andrew and Tate file by", subj.startsWith(wantSubj), subj);
      const body = after.mails[0] ? decodeURIComponent((after.mails[0].match(/body=([^&]*)/) || [])[1] || "") : "";
      ok("…and a body naming the file to attach", !!downloaded && body.startsWith(`Attached: ${downloaded}`), body.split("\n")[0]);
      ok("the send row names the file that downloaded, exactly", !!downloaded && after.file === downloaded,
         `row=${after.file} downloaded=${downloaded}`);
      ok("Copy address answers", copied === "Copied", copied);
      const rd = out.value.redownload;
      ok("re-downloading the submittal is echoed too, by msg() alone",
         !!rd.saveText && /downloaded/.test(rd.saveText) && rd.stageText === rd.saveText,
         `stage=${JSON.stringify((rd.stageText || "").slice(0, 50))} save=${JSON.stringify((rd.saveText || "").slice(0, 50))}`);
      const rr = out.value.rerender;
      ok("after renderForm() re-creates the step, the echo and the send row are back",
         !!rr.saveText && rr.stageText === rr.saveText && rr.stageKind === rr.saveKind && rr.rowShown
           && rr.mails.length === 1 && rr.file === downloaded,
         `stage=${JSON.stringify((rr.stageText || "").slice(0, 50))} row=${rr.rowShown} mailtos=${rr.mails.length}`);
      ok("no sideways page scroll after the submission", after.scroll[0] <= after.scroll[1], after.scroll.join(" / "));
      ok("clean console", errs.length === 0, errs.join(" | ") || "clean");
    }
    // KYTC_EMAIL null: nothing new renders, and no address is invented.
    const out = await submitCase(browser, book, 1366, 768, { nullEmail: true });
    if (out.skipped) { results.skip(id, book.label, "KYTC_EMAIL null", out.skipped); continue; }
    const { before, after, downloaded, errs } = out.value;
    const ok = (what, cond, detail) => results.ok(id, book.label, `KYTC_EMAIL null ${what}`, !!cond, detail);
    const pre = book === PLANT ? before.medl : before.note;
    ok("the note before Submit invents no address", pre.length > 0 && !pre.includes("@"), pre);
    ok("Submit still downloads", !!downloaded, downloaded);
    ok("no send row, no Copy, no mailto",
       !after.rowShown && !after.rowHTML && !after.copyBtn && after.mails.length === 0,
       `row shown=${after.rowShown} html=${(after.rowHTML || "").length} mailtos=${after.mails.length}`);
    ok("the echo still says what #saveMsg says", !!after.saveText && after.stageText === after.saveText,
       (after.stageText || "").slice(0, 70));
    ok("clean console", errs.length === 0, errs.join(" | ") || "clean");
  }
  await custodyCases(browser, results);
  await lineCase(browser, results);
  await warnCase(browser, results);
  await revealCase(browser, results);
}

/* A warning or an error is the line to act on - a lot's seal waiting for a
 * signal or refused comes AFTER the file name and the instruction - so it
 * wraps: to three lines on a desktop, six on a phone. */
async function warnCase(browser, results) {
  const LONG = "PlantBook_submittal_262120_lot1_00260467_2026-09-26.pdf downloaded and stamped as submitted by " +
    "harness. Email it to Andrew.Denmark@ky.gov, Tate.Salle@ky.gov - that file is the submission. The lot record " +
    "was not sealed: lot 1 is already submitted on this contract, line item and plant. You can download it again.";
  for (const [w, h, max] of [[1366, 768, 3], [390, 844, 6]]) {
    const out = await withBook(browser, DESIGN, { width: w, height: h }, async ({ page, errs }) => {
      await page.addStyleTag({ content: ".section{animation:none!important;opacity:1!important}" });
      await page.evaluate(TO_STATUS);
      await page.waitForTimeout(250);
      return page.evaluate((t) => {
        msg(document.getElementById("saveMsg"), t, "error");
        const el = document.getElementById("stageMsg"), cs = getComputedStyle(el);
        return { lines: el.getBoundingClientRect().height / parseFloat(cs.lineHeight), clamp: Number(cs.webkitLineClamp) };
      }, LONG).then((r) => ({ ...r, errs: realErrors(errs) }));
    });
    const r = out.value;
    results.ok(id, "DesignBook", `${w}x${h} an error echo wraps to at most ${max} lines`,
               r.clamp === max && r.lines > 1.6 && r.lines < max + 0.1, `lines=${r.lines.toFixed(2)} clamp=${r.clamp}`);
    results.ok(id, "DesignBook", `${w}x${h} clean console`, r.errs.length === 0, r.errs.join(" | ") || "clean");
  }
}

/* Pressed with the stage button at the bottom edge of a phone screen, the
 * echo and the send row land below it; Submit brings the row into view. */
async function revealCase(browser, results) {
  for (const book of [DESIGN, PLANT]) {
    const out = await withBook(browser, book, { width: 390, height: 844 }, async ({ page, errs }) => {
      await page.addStyleTag({ content: ".section{animation:none!important;opacity:1!important}" });
      if (book === PLANT) {
        await page.evaluate((approval) => {
          const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
          openLotEnvelope(out.lot, "the harness");
        }, APPROVAL);
        await page.waitForTimeout(500);
        await page.evaluate(CENTRE);
        await page.click("#advanceStage");                    // Open -> Closed
        await page.waitForTimeout(200);
      }
      await page.evaluate(() => {
        window.__dl = null;
        window.confirm = () => true;
        window.saveBytes = (bytes, name) => { window.__dl = name; };
        document.getElementById("advanceStage").scrollIntoView({ block: "end" });
      });
      await page.waitForTimeout(150);
      await page.click("#advanceStage");
      await page.waitForFunction(() => window.__dl && /downloaded/.test(document.getElementById("saveMsg").textContent),
                                 null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(300);
      const m = await page.evaluate(MEASURE);
      const row = await page.evaluate(() => {
        const r = document.getElementById("sendRow").getBoundingClientRect();
        return [Math.round(r.top), Math.round(r.bottom), innerHeight];
      });
      return { m, row, errs: realErrors(errs) };
    });
    if (out.skipped) { results.skip(id, book.label, "390 reveal", out.skipped); continue; }
    const { m, row, errs } = out.value;
    results.ok(id, book.label, "390x844 Submit at the screen's edge brings the echo and the send row into view",
               m.rowShown && m.stageInView === true && row[0] >= m.band[0] - 0.5 && row[1] <= m.band[1] + 0.5,
               `stageMsg ${JSON.stringify(m.stageRect)} row ${JSON.stringify(row)} band ${JSON.stringify(m.band)}`);
    results.ok(id, book.label, "390x844 clean console", errs.length === 0, errs.join(" | ") || "clean");
  }
}

/* PlantBook's Submit step note is ONE line at 1440 - the save note, the
 * Submit sentence and Start lot n+1 (Jake, 2026-09-24). Naming both KYTC
 * addresses in it took it to two. Measured on a fresh lot, before Submit. */
async function lineCase(browser, results) {
  const out = await withBook(browser, PLANT, { width: 1440, height: 1000 }, async ({ page, errs }) => {
    await page.addStyleTag({ content: ".section{animation:none!important;opacity:1!important}" });
    await page.evaluate((approval) => {
      const out = PB_LOT.lotFromApproval(approval, { verification: PB_LOT.notChecked("harness") });
      openLotEnvelope(out.lot, "the harness");
    }, APPROVAL);
    await page.waitForTimeout(500);
    await page.evaluate(TO_STATUS);
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const el = document.querySelector(".handoffnote.one"), cs = getComputedStyle(el);
      return { lines: el.getBoundingClientRect().height / parseFloat(cs.lineHeight), text: el.textContent,
               errs: 0 };
    }).then((r) => ({ ...r, errs: realErrors(errs) }));
  });
  if (out.skipped) { results.skip(id, "PlantBook", "1440 save note", out.skipped); return; }
  const r = out.value;
  results.ok(id, "PlantBook", "1440 the Submit step's note is one line before Submit", r.lines < 1.6,
             `lines=${r.lines.toFixed(2)} ${r.text.slice(0, 80)}`);
  results.ok(id, "PlantBook", "1440 clean console", r.errs.length === 0, r.errs.join(" | ") || "clean");
}
