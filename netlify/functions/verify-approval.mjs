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
import { json, ENV } from "../lib/auth.mjs";
import { signingMaterial, encodeDigest, approvalNumbers, APPROVAL_RULES } from "../lib/canonical.mjs";

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
  if (!valid)
    return json(200, { valid: false,
                       error: "This does not match an approval issued by KYTC. Either the design was changed after it was approved, or the code is not genuine." });

  // The signature covers the eight-digit mix id, not the "#467PA" label or
  // the PA flag beside it. Echoing those from the file would let someone edit
  // a real #467 approval to read #467PA and still see "Verified". Both are a
  // pure function of the signed mix id and the signed design, so they are
  // recomputed here and the file's copy is never read. If the rules have
  // changed since signing they come back null and the page shows the mix id.
  const seq = Number(String(approval.mix_id).slice(-APPROVAL_RULES.MIX_ID.seqDigits));
  const num = approvalNumbers(payload, seq);
  const label = !num.error && num.mix_id === approval.mix_id ? num : null;

  return json(200, { valid: true, mix_id: approval.mix_id,
                     approval_no: label ? label.short : null, pa: label ? label.pa : null,
                     approved_by: approval.approved_by,
                     submitted_by: approval.submitted_by || null, issued_at: approval.issued_at });
};
