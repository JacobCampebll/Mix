/* Send a submitted design to KYTC.
 *
 * Transit, not storage: this reads the package, hands it to the mail
 * provider and keeps nothing. That is the only reason a server is allowed
 * in this design at all (CLAUDE.md, "Designs: the file is the record").
 *
 * Two things this deliberately does NOT take from the caller:
 *   - the recipient. If the page could name it, the function is an open
 *     relay and anyone could mail a design anywhere. KYTC's address is an
 *     environment variable.
 *   - who is submitting. The body's sm_id is a claim; the Supabase access
 *     token is proof. The verified identity is what goes in the email.
 *
 * Environment: SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY,
 * KYTC_SUBMIT_TO, SUBMIT_FROM.
 */
import { verifyTechnician, json, ENV } from "./_auth.mjs";

const MAX_BYTES = 8 * 1024 * 1024;   // a design is ~50 KB; this is a sanity bound

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only." });

  const missing = ["RESEND_API_KEY", "KYTC_SUBMIT_TO", "SUBMIT_FROM"].filter((k) => !ENV(k));
  if (missing.length)
    return json(500, { error: `Submission is not configured yet (missing ${missing.join(", ")}). Ask an admin.` });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request body." }); }
  const { base, payload, pdf_b64, csv } = body || {};
  if (!payload || !pdf_b64 || !csv) return json(400, { error: "The submission package was incomplete." });
  if (pdf_b64.length > MAX_BYTES) return json(413, { error: "That package is too large to email." });

  const who = await verifyTechnician(req);
  if (!who.ok) return json(who.status, { error: who.error });

  const j = payload.job || {};
  const mix = payload.mix && payload.mix.signature ? payload.mix.signature : "(no mix)";
  const plant = payload.plant_name ? `${j.plant} - ${payload.plant_name}` : j.plant;
  const name = (base || "DesignBook_submission").replace(/[^A-Za-z0-9_.-]/g, "");
  const subject = `Mix design submission - contract ${j.cid || "?"} - ${mix}`;

  const lines = [
    `A mix design has been submitted through DesignBook.`,
    ``,
    `Contract      ${j.cid || "-"}`,
    `Letting date  ${j.letting || "-"}`,
    `Plant         ${plant || "-"}`,
    `Mix           ${mix}`,
    `Submitted by  ${who.sm_id}${who.company ? " (" + who.company + ")" : ""}`,
    `Submitted at  ${new Date().toISOString()}`,
    ``,
    `Two attachments:`,
    `  ${name}.pdf   the design as a readable sheet, with the full data embedded inside it`,
    `  ${name}.csv   the same design as data`,
    ``,
    `To review it, open DesignBook, upload the PDF, and it rebuilds the form.`,
    `The site stores nothing - these attachments are the record.`,
  ];

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ENV("SUBMIT_FROM"),
      to: ENV("KYTC_SUBMIT_TO").split(",").map((t) => t.trim()).filter(Boolean),
      reply_to: who.email || undefined,
      subject,
      text: lines.join("\n"),
      attachments: [
        { filename: `${name}.pdf`, content: pdf_b64 },
        { filename: `${name}.csv`, content: Buffer.from(csv, "utf8").toString("base64") },
      ],
    }),
  });

  if (!send.ok) {
    const detail = await send.text().catch(() => "");
    // Never echo the provider's raw response to the browser - it can carry
    // key fragments and account detail. Log it, tell the tech what to do.
    console.error("resend failed", send.status, detail);
    return json(502, { error: "KYTC's mail server did not accept the submission. Nothing was sent - try again, and tell an admin if it keeps failing." });
  }
  return json(200, { ok: true, to: ENV("KYTC_SUBMIT_TO"), submitted_by: who.sm_id });
};
