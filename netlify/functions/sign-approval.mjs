/* Issue an approval: a number and a verification code, signed.
 *
 * This is the one place the file-is-the-record model genuinely needs a
 * server. A stage carried in a file is a claim - anyone can edit a payload
 * and re-import it. A signature cannot be produced without the secret, so
 * an approval is the one status that is a fact rather than an assertion.
 *
 * Nothing is stored. The signature is recomputed from the design itself
 * whenever someone verifies it.
 *
 * Two rules enforced here rather than in the page, because the page can be
 * edited by whoever is looking at it:
 *   - only a can_review account may approve;
 *   - the approver may not be the person who submitted it.
 * The second used to be a Postgres trigger. It now reads the submitter out
 * of the file's chain of custody.
 *
 * Environment: SUPABASE_URL, SUPABASE_ANON_KEY, APPROVAL_SIGNING_SECRET.
 */
import { createHmac } from "node:crypto";
import { verifyTechnician, json, ENV } from "./_auth.mjs";
import { signingMaterial, submitterOf, encodeDigest, approvalNumbers } from "./_canonical.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only." });
  const secret = ENV("APPROVAL_SIGNING_SECRET");
  if (!secret) return json(500, { error: "Approval signing is not configured (APPROVAL_SIGNING_SECRET). Ask an admin." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request body." }); }
  const { payload, submitted_action, sequence } = body || {};
  if (!payload || !payload.job || !payload.job.cid)
    return json(400, { error: "That design is incomplete - it carries no contract." });

  const who = await verifyTechnician(req, { requireReview: true });
  if (!who.ok) return json(who.status, { error: who.error });

  const submittedBy = submitterOf(payload, submitted_action || "Submitted to KYTC");
  if (!submittedBy)
    return json(409, { error: "That design has no submission on record, so there is nothing to approve." });
  if (submittedBy === who.sm_id)
    return json(403, { error: "You submitted this design; another reviewer must approve it." });

  // KYTC's own number, typed by the reviewer. Derived here, not in the
  // page, because this is what signs it.
  const num = approvalNumbers(payload, sequence);
  if (num.error) return json(400, { error: num.error });

  const issued_at = new Date().toISOString();
  const digest = createHmac("sha256", secret)
    .update(signingMaterial({ payload, approvedBy: who.sm_id, submittedBy, issuedAt: issued_at, approvalNo: num.mix_id }))
    .digest("hex");

  const fp = encodeDigest(digest, 18);
  return json(200, {
    mix_id: num.mix_id,           // 00260467 - the sheet's MIX ID NUM.
    approval_no: num.short,       // #467PA   - what KYTC calls it
    sequence: num.sequence,
    year: num.year,
    pa: num.pa,
    code: `${fp.slice(6, 10)}-${fp.slice(10, 14)}-${fp.slice(14, 18)}`,
    issued_at,
    approved_by: who.sm_id,
    submitted_by: submittedBy,
  });
};
