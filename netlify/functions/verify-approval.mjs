/* Is this approval real?
 *
 * Recomputes the signature from the design and says yes or no. Deliberately
 * open - anyone holding an approval PDF should be able to check it without
 * an account, including a district office that was emailed one.
 *
 * It stores nothing and reveals nothing: a valid answer repeats detail the
 * caller already has in their hand, and an invalid one says only that.
 *
 * Environment: APPROVAL_SIGNING_SECRET (the same secret sign-approval uses).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { json, ENV } from "./_auth.mjs";
import { signingMaterial, encodeDigest } from "./_canonical.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only." });
  const secret = ENV("APPROVAL_SIGNING_SECRET");
  if (!secret) return json(500, { error: "Verification is not configured. Ask an admin." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request body." }); }
  const { payload, approval } = body || {};
  if (!payload || !approval || !approval.code || !approval.issued_at || !approval.approved_by || !approval.mix_id)
    return json(400, { error: "That file does not carry a complete approval." });

  const digest = createHmac("sha256", secret)
    .update(signingMaterial({
      payload,
      approvedBy: approval.approved_by,
      submittedBy: approval.submitted_by,
      issuedAt: approval.issued_at,
      approvalNo: approval.mix_id,
    }))
    .digest("hex");

  const fp = encodeDigest(digest, 18);
  const expect = `${fp.slice(6, 10)}-${fp.slice(10, 14)}-${fp.slice(14, 18)}`;
  const a = Buffer.from(expect), b = Buffer.from(String(approval.code));
  const valid = a.length === b.length && timingSafeEqual(a, b);

  return valid
    ? json(200, { valid: true, mix_id: approval.mix_id, approval_no: approval.approval_no,
                  approved_by: approval.approved_by,
                  submitted_by: approval.submitted_by || null, issued_at: approval.issued_at })
    : json(200, { valid: false,
                  error: "This does not match an approval issued by KYTC. Either the design was changed after it was approved, or the code is not genuine." });
};
