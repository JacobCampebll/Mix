/* The exact bytes an approval signs.
 *
 * Signing has to be reproducible months later, from a file that has been
 * through other people's browsers, so it cannot depend on JSON key order or
 * on anything that changes after approval. It covers the DESIGN - job, mix,
 * values, rows - plus who submitted it and who approved it, and nothing
 * else. The approval block and the history are excluded on purpose: the
 * first does not exist yet when the signature is made, and the second grows
 * every time someone downloads a copy.
 *
 * Change anything here and every approval already issued stops verifying.
 */
export function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object")
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}

export function canonicalDesign(payload) {
  return stable({
    format: payload.format,
    version: payload.version,
    job: payload.job || null,
    plant_name: payload.plant_name || null,
    mix: payload.mix || null,
    origin: payload.origin || null,
    values: payload.values || {},
    rows: payload.rows || {},
  });
}

// The last person who submitted it, from the file's own chain of custody.
export function submitterOf(payload, submittedAction) {
  const h = Array.isArray(payload.history) ? payload.history : [];
  const e = h.filter((x) => x && x.action === submittedAction).slice(-1)[0];
  return e && e.sm_id ? e.sm_id : null;
}

export function signingMaterial({ payload, approvedBy, submittedBy, issuedAt }) {
  return [canonicalDesign(payload), approvedBy || "", submittedBy || "", issuedAt || ""].join("\n|\n");
}

// Readable, unambiguous, and derived from the signature itself - so the
// number IS a fingerprint of the design and cannot be reused on another one.
// Crockford base32 minus the letters that get misread aloud.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function encodeDigest(hex, chars) {
  let bits = "", out = "";
  for (const c of hex) bits += parseInt(c, 16).toString(2).padStart(4, "0");
  for (let i = 0; out.length < chars && i + 5 <= bits.length; i += 5)
    out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
