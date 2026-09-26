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
import { withBook, DESIGN, PLANT } from "../lib/books.mjs";
import { realErrors } from "../lib/page.mjs";

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

export async function run({ browser, results }) {
  const A = "Andrew.Denmark@ky.gov", T = "Tate.Salle@ky.gov";
  for (const book of [DESIGN, PLANT]) {
    for (const [w, h] of SIZES) {
      const at = `${w}x${h}`;
      const ok = (what, cond, detail) => results.ok(id, book.label, `${at} ${what}`, !!cond, detail);
      const out = await submitCase(browser, book, w, h);
      if (out.skipped) { results.skip(id, book.label, at, out.skipped); continue; }
      const { before, after, downloaded, copied, errs } = out.value;
      const pre = book === PLANT ? before.medl : before.note;
      ok("the note before Submit names both addresses", pre.includes(A) && pre.includes(T), pre);
      ok("…and nothing of the send row is there before a submission",
         !before.rowShown && before.mails.length === 0 && !before.copyBtn,
         `row shown=${before.rowShown} mailtos=${before.mails.length}`);
      ok("the stage button was in the clear part of the screen when pressed",
         before.btnInView === true, `button ${JSON.stringify(before.btnRect)} band ${JSON.stringify(before.band)}`);
      ok("a real Submit downloaded the submittal", !!downloaded, downloaded);
      ok("#stageMsg says exactly what #saveMsg says, in its kind",
         !!after.saveText && after.stageText === after.saveText && after.stageKind === after.saveKind,
         `stage=${JSON.stringify((after.stageText || "").slice(0, 70))} kind ${after.stageKind}/${after.saveKind}`);
      ok("…on one line, ellipsised, with the whole text in its title",
         after.oneLine && after.lineHeights != null && after.lineHeights < 1.6 && after.stageTitle === after.saveText,
         `lines=${after.lineHeights && after.lineHeights.toFixed(2)} oneLine=${after.oneLine}`);
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
}
