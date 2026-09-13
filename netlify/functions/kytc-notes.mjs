/* The compaction OPTION notes off a KYTC proposal.
 *
 * Why this exists: 2026 Std Spec 402.03.02 D) 6) opens "The Contract will
 * state the compaction option to be used", so Option A or Option B is a
 * LOOKUP rather than a question anyone should be answering from memory - and
 * it decides a lot's whole density half. Option B takes no cores at all;
 * Option A takes lane cores, and joint cores "for surface mixtures only".
 * Getting it wrong is not a cosmetic error: propertyWeights() answers for
 * exactly three flag combinations and weighs every property at zero for the
 * rest, so a wrong option is a silently zero-paid lot.
 *
 * Why it is not part of kytc-lookup: that function is Andrew's, in a
 * different Supabase project, and it returns the proposal header and the mix
 * items and no notes at all. It does give us `source_filename`, which is the
 * one thing that cannot be derived from a contract ID (the proposal is named
 * `<call no>-<COUNTY>-<yy>-<nnnn>.pdf` and nothing on the contract carries
 * the call number). So the page calls kytc-lookup first, exactly as the
 * Portal and Contract Information already do, and hands the filename here.
 *
 * Why a function and not a fetch from the page: same reason as kytc-items -
 * the KYTC site is public and needs no key, but sends no CORS headers, so a
 * browser cannot read it. A transit proxy, storing nothing.
 *
 * THE NOTE IS WRITTEN PER ROUTE, which is the whole reason this returns a
 * list rather than a letter. Contract 262120 carries "OPTION A (KY 627)" and
 * "OPTION B (US 25)" on facing pages of one proposal. A contract with one
 * route writes a bare "OPTION A". This function reports what it found, with
 * the qualifier attached; deciding between two is the caller's problem and,
 * when nothing decides it, the technician's.
 */

import { inflateSync } from "node:zlib";

const HOST = "https://transportation.ky.gov";
const LIB = "/Construction-Procurement/Proposals";
// A proposal is a few megabytes and KYTC's IIS is slow under load. The page
// retries; this only bounds one call.
const FETCH_TIMEOUT_MS = 20000;
// 262120's proposal is 5 MB / 75 pages. A cap that a real proposal cannot hit
// but a mis-aimed URL can.
const MAX_BYTES = 40 * 1024 * 1024;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  });
}

// =====================================================================
//  PDF text
// =====================================================================
/* Enough of a PDF reader to find an English paragraph, and no more.
 *
 * Every content stream is FlateDecode'd, so node:zlib does the decoding and
 * there is no dependency. Within a stream only the text-showing operators
 * matter: `(...) Tj` and `[...] TJ` carry the glyphs, and the positioning
 * operators (Td, TD, T-star and Tm) are where a line breaks. That is enough for
 * these proposals because the special notes are set in ordinary embedded
 * fonts with standard encodings.
 *
 * It is NOT sufficient everywhere, and the failure mode matters: a page whose
 * font is a subsetted CID font with a custom CMap decodes to control
 * characters rather than to words. The Project(s) page of 262120's own
 * proposal is one of those. So this never guesses - `hasText()` checks that
 * what came back reads as English before anything is parsed out of it, and
 * the caller returns a stated failure instead of an answer. A wrong Option
 * letter is worse than no Option letter.
 */
export function pdfText(buf) {
  const bin = buf.toString("latin1");
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(bin))) {
    const start = m.index + m[0].length;
    const end = bin.indexOf("endstream", start);
    if (end < 0) continue;
    let data;
    try { data = inflateSync(buf.subarray(start, end)); } catch { continue; }
    const s = data.toString("latin1");
    if (!/\bTJ\b|\bTj\b/.test(s)) continue;
    const parts = [];
    let pend = [];
    // A literal string, a hex string, or one of the operators we care about.
    const tre = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\bTJ\b|\bTj\b|\bTd\b|\bTD\b|\bT\*\b|\bTm\b/g;
    let t;
    while ((t = tre.exec(s))) {
      const tok = t[0];
      if (tok[0] === "(") {
        pend.push(tok.slice(1, -1)
          .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "" }[c] ?? c))
          .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))));
      } else if (tok === "TJ" || tok === "Tj") {
        parts.push(pend.join("")); pend = [];
      } else {
        parts.push("\n"); pend = [];
      }
    }
    out.push(parts.join(""));
  }
  return out.join("\n");
}

/** Did that decode to words? See pdfText()'s note on subsetted CID fonts. */
export function hasText(s) {
  return /\bthe\b/i.test(s) && /[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(s);
}

// =====================================================================
//  The notes
// =====================================================================
/* A heading line, with the route qualifier the multi-route proposals carry:
 *
 *     OPTION A (KY 627)
 *     OPTION B (US 25)
 *     OPTION A
 *
 * Anchored to a whole line on purpose. The proposal's own table of contents
 * lists these as "COMPACTION OPTION A", and the KYCT special note further on
 * says "the Option A or Option B test fixture is required" mid-sentence -
 * neither is this note, and neither matches.
 */
const HEADING = /^[ \t]*OPTION[ \t]+([AB])[ \t]*(?:\(([^)\n]{1,40})\))?[ \t]*$/;

/* The page footer, which is where a note that ends the page runs into next.
 * Every page of these proposals closes with three lines - "MADISON COUNTY",
 * the fed/state number, "Contract ID:  252112" - and 252112's OPTION A note
 * is the last thing on its page, so without this the returned text carries
 * the footer on the end of the sentence. Neither shape can be a line of the
 * note itself. The fed/state number is deliberately NOT matched: it varies
 * too much to pattern safely, and it only ever appears after one of these. */
const FOOTER = /^[ \t]*(?:Contract[ \t]+ID:|[A-Z][A-Z .'-]*COUNTY[ \t]*$)/;

export function parseOptions(text) {
  const lines = text.split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const h = HEADING.exec(lines[i]);
    if (!h) continue;
    // The paragraph under it: up to the next blank line or the next heading.
    // Proposals separate notes with a line holding a single space, so "blank"
    // has to mean whitespace-only rather than empty.
    const body = [];
    for (let j = i + 1; j < lines.length && body.length < 12; j++) {
      if (!lines[j].trim()) break;
      if (HEADING.test(lines[j]) || FOOTER.test(lines[j])) break;
      body.push(lines[j].trim());
    }
    const prose = body.join(" ").replace(/\s+/g, " ").trim();
    // This is the COMPACTION note or it is not this note at all.
    if (!/compaction/i.test(prose)) continue;
    found.push({
      option: h[1].toUpperCase(),
      route: h[2] ? h[2].trim() : null,
      // "The Department will require joint cores as described in Section
      // 402.03.02 for surface mixtures only." Absent from every Option B
      // note, which is correct - Option B takes no cores at all.
      joint_cores: /require\s+joint\s+cores/i.test(prose),
      text: prose,
    });
  }
  // One proposal can repeat a note verbatim across sections; a route says
  // which stretch it governs, so identical (option, route) pairs are one fact.
  const seen = new Set();
  return found.filter((n) => {
    const k = `${n.option}|${n.route || ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function get(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status };
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return { ok: false, status: 0, reason: "proposal is implausibly large" };
    return { ok: true, buf: Buffer.from(ab) };
  } catch (err) {
    return { ok: false, status: 0, reason: err && err.name === "AbortError" ? "timed out" : String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
}

// The filename comes from kytc-lookup's own `source_filename`, but it arrives
// through a browser, so it is validated rather than trusted: a bare name in
// the Proposals library and nothing else. No path, no scheme, no traversal -
// the host and directory are ours, and this is the only thing the caller
// chooses. Anything else is a 400 rather than a fetch.
const PROPOSAL = /^[0-9A-Za-z][0-9A-Za-z._-]{0,80}\.pdf$/;
export const isProposalName = (s) => PROPOSAL.test(String(s == null ? "" : s));

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (req.method !== "GET") return reply(405, { error: "GET only" });

  const q = new URL(req.url).searchParams;
  const cid = (q.get("cid") || "").trim();
  const proposal = (q.get("proposal") || "").trim();
  if (!/^\d{6}$/.test(cid)) return reply(400, { error: "cid must be a six-digit KYTC contract ID" });
  if (!isProposalName(proposal)) {
    return reply(400, {
      error: "proposal must be a plain .pdf file name from KYTC's Proposals library "
        + "(kytc-lookup returns it as source_filename)",
    });
  }

  const r = await get(`${HOST}${LIB}/${encodeURIComponent(proposal)}`);
  if (!r.ok) {
    return reply(r.status === 404 ? 404 : 502, {
      error: `Could not read ${proposal} from KYTC${r.reason ? ` - ${r.reason}` : r.status ? ` - HTTP ${r.status}` : ""}.`,
      cid, file: proposal,
    });
  }

  const text = pdfText(r.buf);
  if (!hasText(text)) {
    return reply(422, {
      error: `${proposal} downloaded but its text could not be read, so no option was guessed from it.`,
      cid, file: proposal,
    });
  }
  // The filename carries a call number rather than the contract ID, so this
  // is the one check that the right proposal was fetched. Every page of these
  // proposals carries "Contract ID:  262120" in its footer.
  if (text.replace(/\s+/g, " ").indexOf(cid) < 0) {
    return reply(409, {
      error: `${proposal} does not mention contract ${cid}, so it is not this contract's proposal.`,
      cid, file: proposal,
    });
  }

  const options = parseOptions(text);
  return reply(200, {
    cid,
    file: proposal,
    url: `${HOST}${LIB}/${encodeURIComponent(proposal)}`,
    // Empty is a real answer, not a failure: a proposal with no compaction
    // note leaves the option to whoever holds the Contract. Said plainly so
    // the page can print it rather than showing a blank lookup.
    options,
    // One note governs the whole contract; two or more are per route and
    // something else has to say which stretch this lot paved.
    routed: options.length > 1,
  });
}
