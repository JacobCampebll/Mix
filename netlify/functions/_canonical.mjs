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

// The approval number is part of the signature. The reviewer types it, so
// without this someone could edit the number on an approved file and it
// would still verify - the signature would protect the design but not the
// label on it.
export function signingMaterial({ payload, approvedBy, submittedBy, issuedAt, approvalNo }) {
  return [canonicalDesign(payload), approvedBy || "", submittedBy || "", issuedAt || "", approvalNo || ""].join("\n|\n");
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

/* ---------- the approval number ----------
 *
 * KYTC numbers designs sequentially from 001 at the start of each year,
 * around 2,000 a year, and the SAME counter appears two ways: the sheet's
 * MIX ID NUM. (00260467) and KYTC's own label (#467PA). So the reviewer
 * types one thing - the sequence - and both renderings come from it.
 *
 * There is no counter here and no register. Sequential numbering needs
 * shared state, and this model stores nothing, so the reviewer supplies the
 * number from whatever KYTC uses today. Nothing can stop a duplicate or a
 * skip; what IS guaranteed is that the number cannot be altered afterwards,
 * because it is inside what the approval signs.
 *
 * These rules are duplicated in designbook.html's CONFIG.APPROVAL_NUMBER,
 * which uses them only to preview and validate. This file is authoritative:
 * the number that gets signed is the one derived here.
 */
export const APPROVAL_RULES = {
  MIN: 1,
  MAX: 9999,
  // UNVERIFIED - read off a single example (#467PA / MIX ID NUM 00260467,
  // letting 2/19/26). Check Design Data!H10 in another workbook before
  // trusting the "00" prefix or the 4-digit sequence.
  MIX_ID: { prefix: "00", seqDigits: 4 },
  // Always at least three digits (#050, #467). A minimum, not a maximum -
  // at ~2,000 designs a year the sequence runs past 999 and simply becomes
  // four, which sorts correctly because the pad only ever adds leading
  // zeros.
  SHORT_PREFIX: "#",
  SHORT_PAD: 3,
  // Sizes that require a performance review (CT + Hamburg). C is absent on
  // purpose: Jake listed A, B and D only.
  PA_SIZES: [0.38, 0.5],
  PA_LETTERS: ["A", "B", "D"],
  PA_SUFFIX: "PA",
};

// The year comes from the LETTING date on the proposal, not the approval
// date - a design let in December and approved in January still belongs to
// the letting year.
export function approvalYear(payload) {
  const l = payload && payload.job ? String(payload.job.letting || "") : "";
  const m = /(\d{4})-\d{2}-\d{2}/.exec(l) || /\d{1,2}\/\d{1,2}\/(\d{2,4})/.exec(l);
  if (!m) return null;
  const y = m[1].length === 4 ? m[1] : "20" + m[1];
  return y.slice(2);
}

// A performance review is required by the MIX, and is only true if the tests
// are actually there. Printing PA on a design with no CT or Hamburg data
// would assert a review that did not happen; dropping PA silently would hide
// a missing test. So the caller is told, and refuses.
export function requiresPA(payload) {
  const n = payload && payload.mix ? String(payload.mix.nominal_size || "").trim() : "";
  const m = /^([\d.]+)\s*([A-Za-z])$/.exec(n);
  if (!m) return false;
  const size = parseFloat(m[1]), letter = m[2].toUpperCase();
  return APPROVAL_RULES.PA_SIZES.some((s) => Math.abs(s - size) < 0.005)
      && APPROVAL_RULES.PA_LETTERS.includes(letter);
}

export function performanceEvidence(payload) {
  const rows = (payload && payload.rows) || {}, v = (payload && payload.values) || {};
  const has = (x) => x != null && String(x).trim() !== "";
  const ct = (rows.ct || []).some((r) => r && has(r.index));
  const hamburg = ["hamburg_left_maxdef", "hamburg_right_maxdef"].some((k) => has(v[k]))
    || (rows.hamburg_curve || []).some((r) => r && (has(r.left) || has(r.right)));
  return { ct, hamburg, ok: ct && hamburg };
}

// Returns { mix_id, short, pa } or { error }.
export function approvalNumbers(payload, sequence) {
  const R = APPROVAL_RULES;
  const seq = Number(sequence);
  if (!Number.isInteger(seq) || seq < R.MIN || seq > R.MAX)
    return { error: `The approval number must be a whole number between ${R.MIN} and ${R.MAX}.` };
  const yy = approvalYear(payload);
  if (!yy) return { error: "That design has no letting date, so its approval year cannot be determined." };

  const pa = requiresPA(payload);
  if (pa) {
    const ev = performanceEvidence(payload);
    if (!ev.ok) {
      const missing = [!ev.ct && "the CT test", !ev.hamburg && "Hamburg"].filter(Boolean).join(" and ");
      return { error: `A ${payload.mix.nominal_size} mix is approved with a performance review, and ${missing} ${ev.ct || ev.hamburg ? "is" : "are"} missing from this design. It cannot be approved as PA.` };
    }
  }
  const suffix = pa ? R.PA_SUFFIX : "";
  return {
    sequence: seq,
    year: yy,
    pa,
    mix_id: R.MIX_ID.prefix + yy + String(seq).padStart(R.MIX_ID.seqDigits, "0"),
    short: R.SHORT_PREFIX + String(seq).padStart(R.SHORT_PAD, "0") + suffix,
  };
}
