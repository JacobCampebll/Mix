/* CHECK 12 — PlantBook's front door, and the one refusal it makes.
 *
 * CLAUDE.md, 2026-09-13: the approval is signed, so "verify-approval turns the
 * front door into a real gate - a design KYTC never approved, or one edited
 * after approval, is refused there rather than three steps later". Until
 * 2026-09-26 it was not: the page compared against a VERIFICATION.FAILED that
 * does not exist, so an INVALID signature opened a 4,000-ton lot, printed as
 * the bare token "invalid." in the same colour as an unreachable server, with
 * the reason nowhere on screen.
 *
 * WHAT THIS DRIVES IS THE REAL PATH, not a re-implementation of it: a real
 * approval PDF (built here with pdf-lib, the payload attached the way
 * buildApprovalPDF() attaches it), handed to #fileInput the way a person's
 * pick arrives, through handleFile() -> startLotFromPDF() -> readHandoffPDF()
 * -> openApprovalForLot() -> verifyApproval(). The ONE thing stubbed is the
 * in-page fetch of verify-approval, answering each shape the Function can
 * give (netlify/functions/verify-approval.mjs), or throwing the way a plant
 * with no signal does. Every other Netlify function answers "no network"
 * rather than reaching for a file:// URL, whose console error would be the
 * harness's rather than the page's.
 *
 * The rule under test, from CLAUDE.md: the verification's answer is CARRIED,
 * never assumed, and a check that could not be made reads as not-checked. So
 * ONLY an invalid signature refuses; the other four states open, labelled.
 * And a lot ALREADY opened on an invalid approval - saved before the door
 * refused them - still reopens: a week of measurements is not a fresh start.
 *
 * AND THE ANSWER STAYS ON THE FORM: the Approval signature readout on
 * Contract & Mix (measured in the ledger's value column at 1440, stacked at
 * 390), the rail warning for anything short of verified, and the lot PDF's
 * header - all in the same words.
 *
 * Watched failing: with the refusal removed from openApprovalForLot() the
 * invalid case opens a lot, writes a ledger row, and six assertions fail;
 * with verifyApproval()'s catch put back to the bare error message the
 * no-signal sentence fails; with the raw token back on the door and reopen
 * lines, six fail. And one each for the part that keeps the answer: the
 * readout left unpainted (3 fail), its grid-column:2 removed (the caption
 * drops to column one, under the label), the 560px reset removed (the value
 * is pushed into a conjured second column at 390), the rail line out of
 * productionSpecWarnings() (2), and the PDF header back on the token (2).
 */
import { openPage, realErrors, findLibs } from "../lib/page.mjs";

export const id = "approvalgate";
const BOOK = "PlantBook";

// The shape lotstore.mjs opens a lot from, so the two checks describe one
// approval. Enough for approvalChecks() and lotFromApproval(); the signature
// is never checked here - verify-approval's answer is what is stubbed.
const APPROVAL = {
  format: "kytc-designbook", version: 1, book: "designbook", stage: "Approved",
  job: { cid: "262120", plant: "AMP070301", letting: "2026-02-19" },
  mix: { signature: "CL3 ASPH SURF 0.38B PG64-22", nominal_size: "0.38B", layer: "SURF" },
  values: { jmf_ac: "5.9", min_vma: "15" }, rows: {},
  approval: { approval_no: "#467", code: "HARNESS", issued_at: "2026-09-01T00:00:00.000Z",
              approved_by: "HARNESS", submitted_by: "HARNESS", mix_id: "00260467" },
};
const FILE = "KYTC_Approval_467_262120.pdf";

// Each answer verify-approval can give, in its own words.
const INVALID_REASON = "This does not match an approval issued by KYTC. Either the design was changed "
  + "after it was approved, or the code is not genuine.";
const ANSWERS = {
  verified: { status: 200, body: { valid: true, mix_id: "00260467", approval_no: "#467", pa: false,
                                   approved_by: "HARNESS", submitted_by: "HARNESS",
                                   issued_at: "2026-09-01T00:00:00.000Z" } },
  invalid: { status: 200, body: { valid: false, error: INVALID_REASON } },
  unavailable: { status: 500, body: { error: "Verification is not configured. Ask an admin." } },
  refused: { status: 400, body: { error: "That file does not carry a complete approval." } },
  throw: null,
};

/* In the page: replace fetch for the Netlify functions only. */
const STUB = ({ mode, answers }) => {
  window.__verifyBodies = [];
  const real = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("verify-approval")) {
      window.__verifyBodies.push(opts && opts.body != null ? String(opts.body) : null);
      if (mode === "throw") throw new TypeError("Failed to fetch");
      const a = answers[mode];
      return new Response(JSON.stringify(a.body), { status: a.status, headers: { "Content-Type": "application/json" } });
    }
    if (u.includes("/.netlify/functions/"))
      return new Response(JSON.stringify({ error: "harness: no network" }),
                          { status: 503, headers: { "Content-Type": "application/json" } });
    return real(url, opts);
  };
};

/* In the page: an approval PDF the page's own reader accepts - one page, the
 * payload attached under CONFIG.HANDOFF.ATTACHMENT, as buildApprovalPDF() does. */
const BUILD_PDF = async (approval) => {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([300, 200]);
  await doc.attach(new TextEncoder().encode(JSON.stringify(approval)), CONFIG.HANDOFF.ATTACHMENT,
                   { mimeType: "application/json", description: "DesignBook design data" });
  return Array.from(await doc.save());
};

/* In the page: a saved lot's .json, opened on an INVALID approval - the one
 * shape that can only exist from before the door refused them (or a file
 * somebody edited), built the way the intake built it then. */
const INVALID_LOT = ({ approval, reason }) => {
  const v = PB_LOT.readVerifyResponse({ status: 200, body: { valid: false, error: reason } });
  const out = PB_LOT.lotFromApproval(approval, { verification: v });
  return JSON.stringify(out.lot);
};

/* In the page: everything the assertions read, in one go. The lot step is
 * put on screen first - a measurement inside a hidden wizard step reads zero
 * (CLAUDE.md) - and the Approval signature readout is read with its label and
 * caption, so "in the value column" is a measured fact. */
const READ = async () => {
  const vis = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains("hidden"); };
  const up = document.getElementById("uploadMsg"), sv = document.getElementById("saveMsg");
  const ver = state.lot && state.lot.values && state.lot.values.design && state.lot.values.design.approval
    ? state.lot.values.design.approval.verification : null;
  if (state.lot) { go(0); await new Promise((r) => setTimeout(r, 300)); }
  const sig = document.querySelector('.section[data-section="lot"] [data-out="approval_signature"]');
  const field = sig ? sig.closest(".field") : null;
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const cap = field ? field.querySelector("[data-outsub]") : null;
  return {
    lot: state.lot ? { uid: state.lot.uid, n: state.lot.lot_number, state: ver ? ver.state : null } : null,
    upload: { text: up ? up.textContent : "", cls: up ? up.className : "", shown: vis("uploadCard") },
    save: { text: sv ? sv.textContent : "", cls: sv ? sv.className : "" },
    form: vis("dbLayout"),
    ledger: Object.keys(window.__HARNESS_AMAW.amaw_lots).length,
    local: Object.keys(localStorage).filter((k) => k.startsWith("amaw_lot:")).length,
    bodies: window.__verifyBodies || [],
    labels: PB_LOT.VERIFICATION_LABELS,
    audit: (document.querySelector("#auditlog .auditrow") || {}).textContent || "",
    readout: sig ? { text: sig.textContent, cls: sig.className, caption: cap ? cap.textContent : "",
                     label: box(field.querySelector("label")), value: box(sig), cap: box(cap) } : null,
    rail: Array.from(document.querySelectorAll("#vallist .vitem")).map((e) => e.textContent.replace(/\s+/g, " ").trim()),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
};

/* In the page: the lot PDF as downloadLotPdf() builds it, with every string
 * the builder draws recorded - the header's "Approval signature" value among
 * them. Needs pdf-lib, which the approval cases already require. */
const PDF_STRINGS = async () => {
  const proto = PDFLib.PDFPage.prototype, real = proto.drawText, drawn = [];
  proto.drawText = function (text, opts) { drawn.push(String(text)); return real.call(this, text, opts); };
  try { await buildReviewPDF(handoffPayload("harness")); } finally { proto.drawText = real; }
  return drawn;
};

/* The value the header draws beside its "Approval signature" label: pairs()
 * draws each label then its value, and the header is drawn first. Matched by
 * position, not by searching every string: the Department Verification
 * table's "Equipment verified" heading wraps, so a bare "verified" is drawn
 * there on every lot PDF - which is how the first cut of this assertion
 * failed on a page that was right. */
const headerValue = (drawn) => {
  const i = (drawn || []).indexOf("Approval signature");
  return i >= 0 ? drawn[i + 1] : null;
};

/* A fresh page on PlantBook's door - the Start a lot card, no lot open. */
async function atTheDoor(browser, width = 1440) {
  const h = await openPage(browser, { width, height: 1000 });
  await h.page.click("#bookPlant");
  await h.page.waitForFunction(() => {
    const c = document.getElementById("uploadCard");
    return c && !c.classList.contains("hidden") && /start a lot/i.test(document.getElementById("uploadTitle").textContent);
  }, null, { timeout: 10000 });
  return h;
}

/* Drop the approval on the door with verify-approval answering `mode`. */
async function dropApproval(browser, mode, { width = 1440, pdf = false } = {}) {
  const h = await atTheDoor(browser, width);
  try {
    await h.page.evaluate(STUB, { mode, answers: ANSWERS });
    const bytes = await h.page.evaluate(BUILD_PDF, APPROVAL);
    await h.page.setInputFiles("#fileInput", { name: FILE, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
    // Settled when a lot is open, or the door has said no.
    await h.page.waitForFunction(() => !!state.lot || /\berror\b/.test(document.getElementById("uploadMsg").className),
                                 null, { timeout: 15000 });
    // Past the autosave debounce, so "nothing was saved" is an observation
    // rather than a race won.
    const wait = await h.page.evaluate(() => CONFIG.STORAGE.AUTOSAVE_MS + 700);
    await h.page.waitForTimeout(wait);
    const r = await h.page.evaluate(READ);
    if (pdf && r.lot) r.pdf = await h.page.evaluate(PDF_STRINGS);
    return { r, errs: realErrors(h.errs) };
  } finally {
    await h.close();
  }
}

export async function run({ browser, results }) {
  const ok = (what, cond, detail) => results.ok(id, BOOK, what, !!cond, detail);
  const clip = (s) => (s.length > 150 ? s.slice(0, 149) + "…" : s);
  const errs = [];

  if (!findLibs()["pdf-lib"]) {
    results.skip(id, BOOK, "an approval PDF through the front door",
                 "pdf-lib not found - set HARNESS_LIBS; the door reads the approval out of a real PDF");
  } else {
    // ---- verified: opens, and says so first -------------------------------
    const good = await dropApproval(browser, "verified", { pdf: true });
    const g = good.r, L = g.labels;
    const unverified = [L.invalid, L["not-checked"], L.unavailable, L.refused];
    errs.push(...good.errs);
    ok("verified: the lot opens", g.lot && g.form && !g.upload.shown,
       `lot=${g.lot && g.lot.uid} form=${g.form} door=${g.upload.shown}`);
    ok("verified: the first thing on the line is the label, in words",
       g.save.text.startsWith(`${L.verified} - `) && /\bok\b/.test(g.save.cls), clip(`[${g.save.cls}] ${g.save.text}`));
    ok("verified: …then the reason, then what was opened",
       /KYTC signed this approval/.test(g.save.text) && /Opened lot 1 on 00260467 from KYTC_Approval/.test(g.save.text),
       clip(g.save.text));
    ok("verified: the audit line carries the label", g.audit.includes(L.verified) && /\(verified\)/.test(g.audit),
       clip(g.audit));
    // The page sends the file's own payload, as readHandoffPDF() parsed it -
    // the reason a genuine older approval cannot start reading INVALID
    // because of anything done on this side.
    const sent = g.bodies.length ? JSON.parse(g.bodies[0]) : null;
    ok("verify-approval is sent the file's embedded payload, untouched",
       sent && JSON.stringify(sent.payload) === JSON.stringify(APPROVAL)
         && JSON.stringify(sent.approval) === JSON.stringify(APPROVAL.approval),
       sent ? `${g.bodies.length} request(s); payload keys ${Object.keys(sent.payload || {}).join(",")}` : "no request made");
    // ...and the answer stays on the form, for the life of the lot.
    const ro = g.readout || {};
    ok("verified: Contract & Mix keeps it - the readout reads the label, in the ok colour, the reason under it",
       ro.text === L.verified && /\bok\b/.test(ro.cls || "") && /KYTC signed this approval/.test(ro.caption || ""),
       clip(`"${ro.text}" [${ro.cls}] ${ro.caption}`));
    ok("the readout's value and caption sit in the ledger's value column, not under its label",
       ro.value && ro.value.l >= ro.label.r && ro.cap.l === ro.value.l && ro.cap.t >= ro.value.b,
       ro.value ? `label ${ro.label.l}-${ro.label.r}, value from ${ro.value.l}, caption from ${ro.cap.l} (top ${ro.cap.t} vs value bottom ${ro.value.b})` : "no readout");
    ok("verified: the rail carries no warning about the approval",
       !g.rail.some((t) => unverified.some((x) => t.includes(x))),
       clip(g.rail.filter((t) => /Approval/.test(t)).join(" | ") || "none"));
    ok("verified: the lot PDF header prints the label, not the token",
       headerValue(g.pdf) === L.verified, `header "Approval signature" -> ${JSON.stringify(headerValue(g.pdf))}`);

    // ---- invalid: refused at the door, and nothing opens ------------------
    const bad = await dropApproval(browser, "invalid");
    const b = bad.r;
    errs.push(...bad.errs);
    ok("invalid: no lot is opened", b.lot === null, b.lot ? `state.lot = ${b.lot.uid}` : "state.lot null");
    ok("invalid: no form opens - the door stays up", !b.form && b.upload.shown,
       `form=${b.form} door=${b.upload.shown}`);
    ok("invalid: the door says so in red, label first",
       /\berror\b/.test(b.upload.cls) && b.upload.text.startsWith(`${L.invalid} - `),
       clip(`[${b.upload.cls}] ${b.upload.text}`));
    ok("invalid: …with verify-approval's reason", b.upload.text.includes(INVALID_REASON), clip(b.upload.text));
    ok("invalid: …that no lot was opened, and to check with Central Office",
       /No lot was opened/.test(b.upload.text) && /Central Office/.test(b.upload.text), clip(b.upload.text));
    ok("invalid: nothing was saved - no ledger row, nothing on this device",
       b.ledger === 0 && b.local === 0, `ledger rows=${b.ledger} local lots=${b.local}`);

    // ---- no signal: opens, labelled not checked, with a sentence ----------
    const none = await dropApproval(browser, "throw", { pdf: true });
    const n = none.r;
    errs.push(...none.errs);
    ok("no signal: the lot still opens - a plant with no signal must start a lot",
       n.lot && n.form, `lot=${n.lot && n.lot.uid} form=${n.form}`);
    ok("no signal: labelled not checked, with a sentence rather than a bare \"Failed to fetch\"",
       n.save.text.startsWith(`${L["not-checked"]} - KYTC's verification service could not be reached (Failed to fetch). Opened lot 1`)
         && /\bwarn\b/.test(n.save.cls),
       clip(`[${n.save.cls}] ${n.save.text}`));
    ok("no signal: the lot carries not-checked - carried, never assumed",
       n.lot && n.lot.state === "not-checked", n.lot && n.lot.state);
    const nr = n.readout || {};
    ok("no signal: the readout reads not checked, in the warning colour, the reason under it",
       nr.text === L["not-checked"] && /\bwarn\b/.test(nr.cls || "") && /could not be reached/.test(nr.caption || ""),
       clip(`"${nr.text}" [${nr.cls}] ${nr.caption}`));
    ok("no signal: the rail says so, on Contract & Mix",
       n.rail.some((t) => t.startsWith("Contract & Mix") && t.includes(`${L["not-checked"]} - `)),
       clip(n.rail.filter((t) => /Approval/.test(t)).join(" | ") || "no approval warning on the rail"));
    ok("no signal: the lot PDF header prints the label, not the token",
       headerValue(n.pdf) === L["not-checked"], `header "Approval signature" -> ${JSON.stringify(headerValue(n.pdf))}`);

    // ---- and on a phone, where the ledger is one column -------------------
    const phone = await dropApproval(browser, "throw", { width: 390 });
    const pr = phone.r.readout || {};
    errs.push(...phone.errs);
    ok("390px: the readout stacks - label, then value, then caption, in one column, no sideways scroll",
       pr.value && pr.value.t >= pr.label.b && pr.value.l === pr.label.l && pr.cap.t >= pr.value.b
         && pr.cap.l === pr.value.l && phone.r.overflow <= 0,
       pr.value ? `label ${pr.label.l}/${pr.label.b}, value ${pr.value.l}/${pr.value.t}-${pr.value.b}, caption ${pr.cap.l}/${pr.cap.t}; page overflow ${phone.r.overflow}px` : "no readout");

    // ---- a check that could not be made opens, labelled ------------------
    for (const [mode, why] of [["unavailable", "Verification is not configured"],
                               ["refused", "That file does not carry a complete approval"]]) {
      const o = await dropApproval(browser, mode);
      errs.push(...o.errs);
      ok(`${mode}: the lot opens, labelled "${L[mode]}", with the reason`,
         o.r.lot && o.r.lot.state === mode && o.r.save.text.startsWith(`${L[mode]} - `)
           && o.r.save.text.includes(why) && /\bwarn\b/.test(o.r.save.cls),
         clip(`lot=${o.r.lot && o.r.lot.state} [${o.r.save.cls}] ${o.r.save.text}`));
    }
  }

  // ---- a SAVED lot is never refused, whatever it carries -----------------
  // Through the real .json door (handleFile -> openLotFile -> openLotEnvelope).
  const h = await atTheDoor(browser);
  try {
    const json = await h.page.evaluate(INVALID_LOT, { approval: APPROVAL, reason: INVALID_REASON });
    await h.page.setInputFiles("#fileInput", { name: "lot1.json", mimeType: "application/json", buffer: Buffer.from(json) });
    await h.page.waitForFunction(() => !!state.lot || /\berror\b/.test(document.getElementById("uploadMsg").className),
                                 null, { timeout: 15000 });
    const r = await h.page.evaluate(READ);
    errs.push(...realErrors(h.errs));
    ok("reopen: a saved lot on an invalid approval still opens", r.lot && r.form && r.lot.state === "invalid",
       `lot=${r.lot && r.lot.uid} state=${r.lot && r.lot.state} form=${r.form}`);
    ok("reopen: …and prints the label, not the token",
       r.save.text.includes(`${r.labels.invalid} - `) && !/was invalid|\binvalid\./.test(r.save.text)
         && /\bwarn\b/.test(r.save.cls),
       clip(`[${r.save.cls}] ${r.save.text}`));
    ok("reopen: the audit line carries the label", r.audit.includes(r.labels.invalid), clip(r.audit));
    const rr = r.readout || {};
    ok("reopen: the readout keeps it on screen, in the bad colour",
       rr.text === r.labels.invalid && /\bbad\b/.test(rr.cls || ""), clip(`"${rr.text}" [${rr.cls}]`));
    ok("reopen: …and the rail says a lot is no longer opened on one",
       r.rail.some((t) => t.includes(`${r.labels.invalid} - `) && /no longer opens a lot/.test(t)),
       clip(r.rail.filter((t) => /Approval/.test(t)).join(" | ") || "no approval warning on the rail"));
  } finally {
    await h.close();
  }

  ok("no console or page errors through any of it", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
}
