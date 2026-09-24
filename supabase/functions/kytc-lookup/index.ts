// kytc_lookup_edge_function.ts
// ---------------------------------------------------------------------------
// STATUS (2026-09-02, updated — v5 deploy): DEPLOYED and LIVE in Supabase
// project "Design and Plant Book" (iwysxhcmvhkcjxmjarkd), function slug
// "kytc-lookup", version 5, ACTIVE. Endpoint:
//   POST https://iwysxhcmvhkcjxmjarkd.supabase.co/functions/v1/kytc-lookup
// verify_jwt: true — calls need the project's anon/publishable key in both
// the `apikey` and `Authorization: Bearer` headers.
//
// `location_desc` fix history (CID 262220 used throughout) — CLOSED:
//   - v1: came back null. Diagnosed (wrongly, as it turned out) as a
//     character-class problem in LOCATION_DESC_RE.
//   - v2: widened the character class. Retested — STILL null, everything
//     else regressed clean. That ruled out the character-class theory.
//   - v3: added row-window joining (1-3 rows) plus a temporary
//     `location_desc_debug_rows` diagnostic field for if it failed again.
//     It did — but this time with real data: the actual PDF row is
//     "...MILES.ASPHALT RESURFACING SYP NO. 08-20025.00." — the location
//     sentence and the NEXT header field are glued onto the same
//     reconstructed row with no separating space, so the regex's trailing
//     `$` anchor (requiring nothing after "MILES.") could never match.
//   - v4: dropped the trailing `$`, made the middle `.+` non-greedy, and
//     switched to `.exec()` + `match[0]` instead of testing the whole
//     joined-row string — so the match stops cleanly right after "MILES."
//     and the glued-on trailing field is discarded. Verified by actually
//     running this exact regex against the real row text from the v3 test
//     (not reasoned about) before deploying.
//   - v4 retest (Andrew, CID 262220): CONFIRMED WORKING. location_desc
//     returned exactly "ELKHORN ROAD (KY 76) (MP 12.203) BEGIN AT KY 551
//     EXTENDING NORTH TO ADAIR / TAYLOR COUNTY LINE (MP 14.452), A DISTANCE
//     OF 02.25 MILES." — byte-for-byte the expected sentence.
//   - v5 (this deploy): pure cleanup, no parsing-logic change. Removed the
//     temporary `location_desc_debug_rows` diagnostic field (from the
//     ContractHeader interface, parseHeader(), and parseLocation()) now
//     that its job — catching a second bad guess with real data — is done.
//   - `other_items_count` (12 vs. 11, from the original v1 test) is a
//     SEPARATE, still-open issue, untouched by any of the above — see
//     NEXT_STEPS.md.
//
// v6 (2026-09-03) — CORS fix, Jake's find, Andrew's go-ahead. Widened
// `Access-Control-Allow-Headers` to Supabase's own documented snippet
// (`authorization, x-client-info, apikey, content-type`), adding
// `x-client-info` to the allow-list. That header is sent by default by
// `supabase-js`, so a strict allow-list without it could fail CORS
// preflight (OPTIONS) requests from Jake's portal if it calls this
// function via the standard client. No other change — parsing logic is
// byte-for-byte identical to v5.
//
// v7 (2026-09-24) — CPU fix for large proposals, GitHub issue #29
// (JacobCampebll/Mix). CID 261118 (103-GALLATIN-26-1118.pdf, 21.3 MB, 185
// pages, plus a 6-page addendum) failed about two calls in three with
// WORKER_RESOURCE_LIMIT. The function logs say which limit: every failure
// was shutdown reason `CPUTime` at 2.8-3.6 s of CPU, and every success used
// about 1.95 s, just under the edge runtime's ~2 s CPU cap. Memory was
// never the problem (peak ~140 MB). The CPU went on pdf.js text extraction,
// which v6 ran on EVERY page to find the bid items, and ran more than once
// on the same page: getPageText() is getPageRows() joined, so each bid
// page was extracted twice, and parseLocation() extracted each of its
// first 5 pages twice as well. Four changes, no change to any regex, to
// row reconstruction, or to the output shape:
//   1. Each page is extracted at most ONCE. makePageReader() caches a
//      page's rows; header, location and bid-item parsing all read the
//      cache. getPageText() is gone: its only use was rows.join("\n").
//   2. Each page is released (page.cleanup()) as soon as its rows are
//      read, and each document is destroyed when parsing is done.
//   3. The bid items are found from the END. The issue suggested reading a
//      "Bid Items ... Pages X - Y of Z" line near the front; the real
//      proposals don't have one (the contents page says "PART IV BID
//      ITEMS" and no page numbers). What they do have: Part IV is always
//      the last pages of the PDF, and every bid-item page carries its own
//      section footer "Page k of n" on a row by itself, alongside the
//      whole-proposal footer "... Page 183 of 185". So the last page's
//      "Page n of n" says the section starts n pages from the end.
//      findBidItemPages() checks that reading three ways (the last page
//      and the first page of the range both say PROPOSAL BID ITEMS, the
//      first says "Page 1 of n", and the page before it does NOT say
//      PROPOSAL BID ITEMS) and falls back to v6's scan of every page if
//      any check fails. A wrong reading can only make it scan too much,
//      never too little. Addenda are laid out the same way (261118's
//      Addendum 1 has its bid items on pages 4-6 of 6, "Page 1 of 3" to
//      "Page 3 of 3"), so the same probe serves both.
//   4. unpdf is PINNED (`npm:unpdf@1.8.1`, pdf.js 6.1.200), the version v7
//      was verified against. v1-v6 imported bare `npm:unpdf`, so every
//      deploy silently took whatever unpdf was newest that day, and a
//      pdf.js change to text runs could move the output with no code
//      change at all. Bump it on purpose, and re-run the v6/v7 diff when
//      you do.
//   Which path was taken is logged (console.log), not returned, so the
//   JSON stays byte-identical to v6's.
//   VERIFICATION (2026-09-24, before deploy): v6 and v7 were run side by
//   side in Node on unpdf 1.8.1 against every contract on the 02/19, 05/21
//   and 09/03/2026 lettings, 108 contracts and 64 addenda. The JSON was
//   byte-identical for all 108. v6 run locally also matched v6 live
//   exactly on 262120, 262220 and 261118, so the local run reproduces the
//   deployed function. Summed over the 108, CPU went from 45.7 s (v6) to
//   8.1 s (v7). 261118: v6 0.8-1.0 s locally (1.9-3.6 s on the edge), v7
//   0.16-0.25 s. Every one of the 108 original proposals took the fast
//   path.
//
//   STILL OPEN: large ADDENDA. An addendum's bid pages can sit right after
//   its cover, at its end, or between plan sheets, and its cover's
//   "(N) Revised -" list does not reliably mention them (264202's
//   Addendum 2 reprints two bid pages its cover never lists; 262104's
//   cover lists nothing at all). So no position or label rule is safe,
//   and v7 scans an addendum whole unless the end-of-document probe
//   works, exactly as v6 did. That is cheap for the usual 2-10 page
//   addendum and not for a big one: 261122 (addenda of 254, 103, 15 and 2
//   pages) and 261503 (84, 45, 26, 8) both FAIL on v6 today and still
//   cost about 1 s of CPU locally on v7, which is likely over the edge
//   cap. If they matter, the next step is the issue's fix #4 (parse in a
//   Netlify function, which has no ~2 s CPU cap), not more heuristics.
//
//   NOT changed, but seen while testing, for whoever picks it up next:
//   261118's Addendum 1 cover says "Revised – Removed Bid Item Pages
//   183-185 of 185". BID_ITEMS_PAGE_RANGE_RE wants "Bid Items" (plural),
//   so bidItemsPageRange() returns null for it and mergeAddenda() never
//   runs its removal pass for that addendum. Whether that is a bug depends
//   on what KYTC means by "Removed" there (the addendum reprints the same
//   three pages); left alone so v7's output matches v6's.
//
// Keep this comment block in sync with NEXT_STEPS.md as further findings
// come in.
//
// WHY THIS EXISTS: kytc_lookup.py works, but only when a person runs it from
// a machine with normal network access (see NEXT_STEPS.md — Claude's own
// sandbox can't reach transportation.ky.gov, and a browser tab can't either,
// by design, on any site). Andrew: "we need this function to be completely
// web based in practice." A Supabase Edge Function is the right shape for
// that — it runs server-side (Deno), so it's not subject to a browser's
// same-origin/CORS restrictions or an Artifact page's CSP the way
// client-side JS is. It can just call transportation.ky.gov directly,
// same as the Python script does from a terminal.
//
// THIS IS A PORT, NOT A TRANSLITERATION — READ BEFORE TRUSTING OUTPUT:
// kytc_lookup.py's bid-item table reconstruction leans on pymupdf's
// `page.get_text('words')`, which already segments a PDF page into
// individual WORDS with (x0,y0,x1,y1,word,block,line,wno) — the block/line
// grouping is handed to it by pymupdf itself. Deno has no pymupdf. This file
// uses pdf.js (via the `unpdf` package's edge-optimized build) instead,
// whose `page.getTextContent()` returns TEXT RUNS, not necessarily
// individual words, each with a `transform` matrix ([a,b,c,d,e,f], where
// e/f are x/y in PDF space, y increasing upward — opposite of screen space).
// That's a different granularity than what kytc_lookup.py was built and
// validated against. This file re-derives "rows" by clustering text-content
// items by y-position (within Y_TOLERANCE) and sorting each cluster by x —
// see reconstructRows() below. **First live test (2026-09-02, CID 262220)
// confirmed this works against a real KYTC PDF** — see STATUS block above.
// Everything downstream of that (the regexes, the classification, the
// addenda merge, the mix-signature dedup) is a direct, close port of logic
// already validated live in kytc_lookup.py across 10+ real contracts (see
// NEXT_STEPS.md). Still worth running against more of the same real CIDs
// already logged as passing in NEXT_STEPS.md (261505, 264502 — both have
// addenda/removals this first test didn't exercise) and diffing the JSON
// against the Python script's own output for the same CID.
//
// USAGE:
//   POST /functions/v1/kytc-lookup
//   body: { "contract_id": "262220", "letting_date": "09/03/2026" }
//   -> same top-level JSON shape kytc_lookup.py's lookup_by_cid() returns:
//      source_url, source_filename, header, addenda_applied,
//      required_mix_designs, removed_items, removed_mix_items,
//      flagged_items_for_review, other_items_count,
//      requires_contractor_confirmation
// ---------------------------------------------------------------------------

// deno-lint-ignore-file no-explicit-any
import { getResolvedPDFJS } from "npm:unpdf@1.8.1"; // v7: pinned - see header

// ===========================================================================
// Types (mirrors the @dataclass shapes in kytc_lookup.py)
// ===========================================================================

interface BidItem {
  line_no: string;
  bid_code: string;
  description: string;
  quantity: number;
  unit: string;
  section: string | null;
  mix_class: string | null;
  layer: string | null;
  nominal_size: string | null;
  binder_grade: string | null;
  revised_inline: string | null;
  change_notes: string[];
  page_no: number | null;
}

function newBidItem(partial: Partial<BidItem> & Pick<BidItem, "line_no" | "bid_code" | "description" | "quantity" | "unit">): BidItem {
  return {
    section: null, mix_class: null, layer: null, nominal_size: null,
    binder_grade: null, revised_inline: null, change_notes: [], page_no: null,
    ...partial,
  };
}

interface ContractHeader {
  call_no: string | null;
  contract_id: string | null;
  county: string | null;
  fed_state_number: string | null;
  work_type: string | null;
  letting_date: string | null;
  coordinates: { lat_dms: string; lon_dms: string } | null; // NOT in kytc_lookup.py yet — see NEXT_STEPS item 15
  location_desc: string | null; // ditto — see STATUS block above for history; confirmed working v4/v5
}

interface AddendumInfo {
  number: number;
  date: string | null;
  revised_labels: string[];
}

interface MixSignature {
  kind: "CL_ASPH" | "LEVELING_WEDGING";
  mix_class: string | null;
  layer: string | null;
  nominal_size: string | null;
  binder_grade: string | null;
}

function sigKey(s: MixSignature): string {
  return [s.kind, s.mix_class, s.layer, s.nominal_size, s.binder_grade].join("|");
}
function sigLabel(s: MixSignature): string {
  if (s.kind === "LEVELING_WEDGING") return `LEVELING & WEDGING ${s.binder_grade}`;
  return `CL${s.mix_class} ASPH ${s.layer} ${s.nominal_size} ${s.binder_grade}`;
}

interface ProposalCandidate {
  url: string;
  filename: string;
  kind: "original" | "addendum";
  addendum_no: number | null;
}

// ===========================================================================
// Step 1: CID + letting date -> proposal PDF URL(s)
// ===========================================================================

/** Percent-encodes just the path portion of a URL (KYTC hrefs sometimes
 * contain literal spaces — see NEXT_STEPS item 9, the same bug already
 * found and fixed in kytc_lookup.py's _url_quote_path()). */
function quoteUrlPath(urlStr: string): string {
  const u = new URL(urlStr);
  u.pathname = u.pathname
    .split("/")
    .map((seg) => (seg.includes("%") ? seg : encodeURIComponent(seg)))
    .join("/");
  return u.toString();
}

async function findProposalPdfUrls(
  lettingDate: string,
  contractId: string,
): Promise<{ candidates: ProposalCandidate[] | null; error: string | null }> {
  try {
    const proposalsUrl =
      `https://transportation.ky.gov/Construction-Procurement/Pages/proposals.aspx?letting=${encodeURIComponent(lettingDate)}`;
    const resp = await fetch(proposalsUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await resp.text();

    const cidStr = String(contractId).trim();
    if (cidStr.length < 6) {
      return { candidates: null, error: `CID '${contractId}' too short to derive search key.` };
    }
    // Same dual-search-key fix as kytc_lookup.py item 12 — KYTC's own
    // filenames are inconsistent about dashing the CID for multi-county
    // contracts (e.g. "204-EDMONSON-BUTLER-264502.pdf" vs "23-5320.pdf").
    const yy = cidStr.slice(0, 2);
    const xxxx = cidStr.slice(2);
    const searchKeys = [`${yy}-${xxxx}`, cidStr];

    const base = "https://transportation.ky.gov/Construction-Procurement/Proposals/";
    const hrefRe = /href="([^"]*\.pdf)"/gi;
    const addendumNoRe = /addendum[\s_-]*(\d+)/i;

    const candidates: ProposalCandidate[] = [];
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(html)) !== null) {
      const href = m[1];
      const fname = href.split("/").pop() ?? href;
      if (!searchKeys.some((k) => fname.includes(k))) continue;
      if (fname.toLowerCase().includes("withdrawn")) continue;

      let fullUrl: string;
      if (href.startsWith("http")) fullUrl = href;
      else if (href.startsWith("/")) fullUrl = "https://transportation.ky.gov" + href;
      else fullUrl = base + fname;
      fullUrl = quoteUrlPath(fullUrl);

      const isAddendum = fname.toLowerCase().includes("addendum");
      let addendumNo: number | null = null;
      if (isAddendum) {
        const am = addendumNoRe.exec(fname);
        if (am) addendumNo = parseInt(am[1], 10);
      }
      candidates.push({ url: fullUrl, filename: fname, kind: isAddendum ? "addendum" : "original", addendum_no: addendumNo });
    }

    if (candidates.length === 0) {
      return { candidates: null, error: `No proposal PDF found for CID ${contractId} on letting ${lettingDate}.` };
    }
    const originals = candidates.filter((c) => c.kind === "original").sort((a, b) => a.filename.length - b.filename.length);
    const addenda = candidates.filter((c) => c.kind === "addendum")
      .sort((a, b) => (a.addendum_no ?? Infinity) - (b.addendum_no ?? Infinity));

    if (originals.length === 0) {
      return { candidates: null, error: `Found ${addenda.length} addendum PDF(s) for CID ${contractId} but no original.` };
    }
    return { candidates: [originals[0], ...addenda], error: null };
  } catch (e) {
    return { candidates: null, error: String(e) };
  }
}

// ===========================================================================
// Step 2: PDF text extraction — confirmed working live 2026-09-02 (CID 262220)
// ===========================================================================

const Y_TOLERANCE = 2.0; // PDF-space units; matches items onto the same "row"

interface PositionedItem { str: string; x: number; y: number }

/** Groups pdf.js text-content items into rows by y-position, then sorts each
 * row left-to-right by x. This is the JS stand-in for what pymupdf's own
 * block/line indices gave kytc_lookup.py for free. First live test
 * (2026-09-02, CID 262220) confirmed this reconstructs a real KYTC
 * bid-items table correctly. See file header. */
function reconstructRows(items: PositionedItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x); // top-to-bottom, then left-to-right
  const rows: PositionedItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - item.y) <= Y_TOLERANCE);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
}

async function getPageRows(page: any): Promise<string[]> {
  const content = await page.getTextContent();
  const items: PositionedItem[] = content.items
    .filter((it: any) => typeof it.str === "string" && it.str.trim().length > 0)
    .map((it: any) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
  return reconstructRows(items);
}

/** v7: reads each page's rows at most once, then releases the page. v6
 * called getPageRows() (directly or through getPageText()) up to three
 * times on the same page, and pdf.js text extraction is where this
 * function's CPU goes. Rows are small strings, so caching every page read
 * costs little even on the full-scan fallback. */
interface PageReader {
  numPages: number;
  rows(p: number): Promise<string[]>;
}

function makePageReader(pdfDoc: any): PageReader {
  const cache = new Map<number, string[]>();
  return {
    numPages: pdfDoc.numPages,
    async rows(p: number): Promise<string[]> {
      const hit = cache.get(p);
      if (hit) return hit;
      const page = await pdfDoc.getPage(p);
      const rows = await getPageRows(page);
      page.cleanup();
      cache.set(p, rows);
      return rows;
    },
  };
}

// ===========================================================================
// Step 3: Patterns — direct ports of kytc_lookup.py's regexes
// ===========================================================================

const MIX_RE = /^CL(?<class>\d)\s+ASPH\s+(?<layer>SURF|BASE)\s+(?<size>\S+)\s+PG(?<grade>\d{2}-\d{2})/i;
const LEVELING_WEDGING_RE = /^LEVELING\s*(?:&|AND)\s*WEDGING\s+PG(?<grade>\d{2}-\d{2})/i;
const ANY_PG_RE = /PG\d{2}-\d{2}/i;
const REVISED_TAG_RE = /\(REVISED\s+([\d/-]+)\)/i;
const BID_ROW_RE = /^\s*(?<line>\d{4})\s+(?<code>[A-Z0-9]+)\s+(?<desc>.+)\s+(?<qty>[\d,]+\.\d{2})\s*(?<unit>[A-Z]+)\$?/;
const SECTION_RE = /^Section:\s*(.+)$/i;

// Multi-county-aware, same widened pattern as kytc_lookup.py item 14.
const COUNTY_RE = /^([A-Z][A-Z .]+(?:\s*-\s*[A-Z][A-Z .]+)*) COUNT(?:Y|IES)$/;
const HEADER_LINE_PATTERNS: Array<[keyof ContractHeader, RegExp, (m: RegExpMatchArray) => string]> = [
  ["call_no", /^CALL NO\.\s*(\S+)/, (m) => m[1]],
  ["contract_id", /^CONTRACT ID\.\s*(\S+)/, (m) => m[1]],
  ["county", COUNTY_RE, (m) => m[1]],
  ["fed_state_number", /^FED\/STATE PROJECT NUMBER\s+(.+)/, (m) => m[1].trim()],
  ["work_type", /^WORK TYPE\s+(.+)/, (m) => m[1].trim()],
  ["letting_date", /^LETTING DATE:\s*([A-Za-z]+)\s+(\d{1,2})\s*,\s*(\d{4})/, (m) => `${m[1]} ${m[2]}, ${m[3]}`],
];

// Confirmed live 2026-09-02 (see NEXT_STEPS item 15) — every checked
// proposal has exactly ONE such line, on page 3 (Scope of Work), not a
// begin/end pair. Not yet wired into kytc_lookup.py itself either.
// First live function test (CID 262220) confirmed this regex works —
// extracted coordinates matched the real PDF exactly.
const COORD_RE = /GEOGRAPHIC COORDINATES\s+LATITUDE\s+([\d:.]+)\s+LONGITUDE\s+([\d:.]+)/i;
// e.g. "ELKHORN ROAD (KY 76) (MP 12.203) BEGIN AT KY 551 EXTENDING NORTH TO
// ADAIR / TAYLOR COUNTY LINE (MP 14.452), A DISTANCE OF 02.25 MILES" — loose
// on purpose; tighten once validated against more real examples.
// FIX HISTORY (CID 262220, 2026-09-02) — CLOSED, confirmed live on v4 retest:
//  - v1: null. Guessed character-class problem — wrong (v2 proved inert).
//  - v2: widened character class. Still null.
//  - v3: added row-window joining (1-3 rows) + a location_desc_debug_rows
//    diagnostic field. Andrew's retest returned the actual raw rows: the
//    real PDF row is "...MILES.ASPHALT RESURFACING SYP NO. 08-20025.00."
//    — the route description and the NEXT header field run together on
//    the same reconstructed row with NO separating space, so the old
//    trailing `$` anchor required nothing to follow "MILES." and always
//    failed once the sentence and the next field were on the same row.
//  - v4: dropped the trailing `$` anchor and made the middle `.+`
//    non-greedy (`.+?`) so the match stops right after "MILES" (+
//    optional period) instead of requiring end-of-string. Code now uses
//    .exec() and takes match[0] (not the whole joined-row string) as
//    location_desc, so trailing garbage past "MILES." is discarded even
//    though it's still part of the same combined row text. Verified by
//    actually running this exact regex against the real row text returned
//    in Andrew's v3 test (not just reasoned about) before deploying.
//    Andrew's retest confirmed it: exact expected sentence returned.
//  - v5: cleanup only — removed the now-unneeded location_desc_debug_rows
//    field. No change to this regex or the matching logic.
const LOCATION_DESC_RE = /^[A-Z0-9 ./,()'-]+\(MP [\d.]+\).+?DISTANCE OF [\d.]+ MILES?\.?/i;

const ADDENDUM_NO_RE = /^ADDENDUM\s*#\s*(\d+)/i;
const ADDENDUM_DATE_RE = /^\s*([A-Za-z]+ \d{1,2},\s*\d{4})\s*$/;
const ADDENDUM_REVISED_MARKER_RE = /^\(\d+\)$/;
const ADDENDUM_REVISED_LINE_RE = /^\(\d+\)\s*Revised\s*[-–—]\s*(.+)$/i;
const BID_ITEMS_PAGE_RANGE_RE = /Bid\s+Items.*?Pages?\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i;

function bidItemsPageRange(revisedLabels: string[]): [number, number] | null {
  for (const label of revisedLabels) {
    const m = BID_ITEMS_PAGE_RANGE_RE.exec(label);
    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  }
  return null;
}

// v7: the bid-items section's own footer, on a row by itself ("Page 1 of 3").
// Anchored at both ends on purpose, so the whole-proposal footer on the same
// page ("NHPP 0713 (070) Page 183 of 185") never matches it.
const BID_SECTION_FOOTER_RE = /^Page\s+(\d+)\s+of\s+(\d+)$/i;
const BID_PAGE_MARKER = "PROPOSAL BID ITEMS";

function isBidPage(rows: string[]): boolean {
  return rows.join("\n").includes(BID_PAGE_MARKER);
}

/** The one "Page k of n" section footer on a page, or null if there is none
 * or more than one (ambiguous, so the caller falls back to a full scan). */
function bidSectionFooter(rows: string[]): [number, number] | null {
  let found: [number, number] | null = null;
  for (const row of rows) {
    const m = BID_SECTION_FOOTER_RE.exec(row.trim());
    if (!m) continue;
    if (found) return null;
    found = [parseInt(m[1], 10), parseInt(m[2], 10)];
  }
  return found;
}

// ===========================================================================
// Step 4: Extraction
// ===========================================================================

async function parseHeader(reader: PageReader): Promise<ContractHeader> {
  const header: ContractHeader = {
    call_no: null, contract_id: null, county: null, fed_state_number: null,
    work_type: null, letting_date: null, coordinates: null, location_desc: null,
  };
  const rows = await reader.rows(1);
  const remaining = new Set(HEADER_LINE_PATTERNS.map(([k]) => k));

  for (const raw of rows.slice(0, 60)) {
    const line = raw.trim();
    if (!line) continue;
    for (const [field, re, extract] of HEADER_LINE_PATTERNS) {
      if (!remaining.has(field)) continue;
      const m = line.match(re);
      if (m) {
        (header as any)[field] = extract(m);
        remaining.delete(field);
        break;
      }
    }
  }
  return header;
}

/** Coordinates + location description live on a later page (page 3 in every
 * real example checked so far — NOT yet confirmed this holds for every
 * contract shape, e.g. bridge-only or multi-county ones). Scanned
 * separately from parseHeader() since it isn't reliably on page 1.
 *
 * Fix history (v1-v4) is in the file's top STATUS block — CLOSED as of v4,
 * confirmed against real CID 262220 data. Tries progressively wider windows
 * (1-3 consecutive rows) joined together and tested against
 * LOCATION_DESC_RE, since the route-description sentence can span more than
 * one reconstructed PDF row (same technique parseAddendumCover() uses for
 * the "(N) Revised - ..." case). Takes match[0] rather than testing the
 * whole joined string, since a glued-on trailing field with no separating
 * space can otherwise follow the sentence on the same row — see STATUS
 * block. The temporary location_desc_debug_rows diagnostic field (v3) was
 * removed in v5 now that this is confirmed working. */
async function parseLocation(reader: PageReader, header: ContractHeader, maxPages = 5): Promise<void> {
  const pageCount = Math.min(reader.numPages, maxPages);
  for (let p = 1; p <= pageCount; p++) {
    // v7: one extraction serves both searches (v6 extracted this page twice).
    const rows = await reader.rows(p);
    const text = rows.join("\n");
    const coordM = COORD_RE.exec(text);
    if (coordM && !header.coordinates) {
      header.coordinates = { lat_dms: coordM[1], lon_dms: coordM[2] };
    }
    if (!header.location_desc) {
      windowSearch:
      for (const windowSize of [1, 2, 3]) {
        for (let i = 0; i + windowSize <= rows.length; i++) {
          const combined = rows.slice(i, i + windowSize).join(" ").replace(/\s+/g, " ").trim();
          // .exec() + match[0], not .test() + the whole combined string —
          // the joined row can carry trailing content past "MILES." (the
          // next header field, glued on with no space in the real PDF).
          // Taking match[0] discards that trailing part; see v4 note above.
          const descM = LOCATION_DESC_RE.exec(combined);
          if (descM) {
            header.location_desc = descM[0].trim();
            break windowSearch;
          }
        }
      }
    }
    if (header.coordinates && header.location_desc) return;
  }
}

/** v7: which pages to look for bid items on. Part IV (bid items) is the last
 * pages of every KYTC proposal and addendum checked, and each of its pages
 * carries a section footer "Page k of n" on a row by itself - so the last
 * page's "Page n of n" puts the section's first page n pages from the end.
 * Every check below that fails falls back to ALL pages, which is exactly
 * what v6 scanned: a bad reading costs CPU, never bid items. The one case
 * this cannot see is a stray page earlier in the document that also says
 * PROPOSAL BID ITEMS; v6 would have read it, this does not. The page just
 * before the range is checked for exactly that, and none of the proposals
 * compared against v6 had one anywhere. */
async function findBidItemPages(reader: PageReader, label: string): Promise<number[]> {
  const n = reader.numPages;
  const all = () => Array.from({ length: n }, (_, i) => i + 1);
  const fallback = (why: string) => {
    console.log(`kytc-lookup v7: ${label}: scanning all ${n} pages for bid items (${why})`);
    return all();
  };

  const lastRows = await reader.rows(n);
  if (!isBidPage(lastRows)) return fallback("last page is not a bid-items page");
  const lastFooter = bidSectionFooter(lastRows);
  if (!lastFooter) return fallback("no single 'Page k of n' footer on the last page");
  const [k, total] = lastFooter;
  if (k !== total || total < 1 || total > n) return fallback(`last page footer reads 'Page ${k} of ${total}'`);

  const start = n - total + 1;
  const firstRows = await reader.rows(start);
  const firstFooter = bidSectionFooter(firstRows);
  if (!isBidPage(firstRows) || !firstFooter || firstFooter[0] !== 1 || firstFooter[1] !== total) {
    return fallback(`page ${start} is not 'Page 1 of ${total}' of the bid items`);
  }
  if (start > 1 && isBidPage(await reader.rows(start - 1))) {
    return fallback(`page ${start - 1}, before the range, also says ${BID_PAGE_MARKER}`);
  }
  console.log(`kytc-lookup v7: ${label}: bid items on pages ${start}-${n} of ${n}`);
  return Array.from({ length: total }, (_, i) => start + i);
}

async function parseBidItems(reader: PageReader, label: string): Promise<BidItem[]> {
  const items: BidItem[] = [];
  let currentSection: string | null = null;

  for (const p of await findBidItemPages(reader, label)) {
    const rows = await reader.rows(p);
    if (!isBidPage(rows)) continue;

    for (const row of rows) {
      const secM = SECTION_RE.exec(row.trim());
      if (secM) { currentSection = secM[1].trim(); continue; }

      const m = BID_ROW_RE.exec(row);
      if (!m || !m.groups) continue;
      let desc = m.groups.desc.trim();
      let revisedTag: string | null = null;
      const rt = REVISED_TAG_RE.exec(desc);
      if (rt) { revisedTag = rt[1]; desc = desc.replace(REVISED_TAG_RE, "").trim(); }

      items.push(newBidItem({
        line_no: m.groups.line,
        bid_code: m.groups.code,
        description: desc,
        quantity: parseFloat(m.groups.qty.replace(/,/g, "")),
        unit: m.groups.unit,
        section: currentSection,
        page_no: p,
        revised_inline: revisedTag,
      }));
    }
  }
  return items;
}

function classifyItems(items: BidItem[]): { mixItems: BidItem[]; flaggedItems: BidItem[]; otherItems: BidItem[] } {
  const mixItems: BidItem[] = [], flaggedItems: BidItem[] = [], otherItems: BidItem[] = [];
  for (const item of items) {
    const m = MIX_RE.exec(item.description);
    if (m && m.groups) {
      item.mix_class = m.groups.class;
      item.layer = m.groups.layer.toUpperCase();
      item.nominal_size = m.groups.size;
      item.binder_grade = `PG${m.groups.grade}`;
      mixItems.push(item);
      continue;
    }
    const lw = LEVELING_WEDGING_RE.exec(item.description);
    if (lw && lw.groups) {
      item.layer = "LEVELING_WEDGING";
      item.binder_grade = `PG${lw.groups.grade}`;
      mixItems.push(item);
      continue;
    }
    if (ANY_PG_RE.test(item.description)) { flaggedItems.push(item); continue; }
    otherItems.push(item);
  }
  return { mixItems, flaggedItems, otherItems };
}

async function parseProposalPdf(buf: ArrayBuffer, label: string): Promise<{ header: ContractHeader; items: BidItem[] }> {
  const { getDocument } = await getResolvedPDFJS();
  const task = getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  try {
    const reader = makePageReader(doc);
    const header = await parseHeader(reader);
    await parseLocation(reader, header);
    const items = await parseBidItems(reader, label);
    return { header, items };
  } finally {
    // v7: release the document; v6 never did. destroy() lives on the loading
    // task - pdf.js 6's document proxy has no destroy() of its own.
    await task.destroy();
  }
}

// ===========================================================================
// Step 5: Addendum cover-letter parsing
// ===========================================================================

async function parseAddendumCover(reader: PageReader): Promise<AddendumInfo> {
  const rows = (await reader.rows(1)).map((r) => r.trim());
  let number: number | null = null;
  let date: string | null = null;
  const revisedLabels: string[] = [];

  let i = 0;
  while (i < rows.length) {
    const line = rows[i];
    if (!line) { i++; continue; }
    const m = ADDENDUM_NO_RE.exec(line);
    if (m) { number = parseInt(m[1], 10); i++; continue; }
    if (date === null) {
      const dm = ADDENDUM_DATE_RE.exec(line);
      if (dm) { date = dm[1]; i++; continue; }
    }
    const rm = ADDENDUM_REVISED_LINE_RE.exec(line);
    if (rm) { revisedLabels.push(rm[1].trim()); i++; continue; }
    if (ADDENDUM_REVISED_MARKER_RE.test(line)) {
      let j = i + 1;
      while (j < rows.length && !rows[j]) j++;
      if (j < rows.length) {
        const combined = `${line} ${rows[j]}`;
        const rm2 = ADDENDUM_REVISED_LINE_RE.exec(combined);
        if (rm2) { revisedLabels.push(rm2[1].trim()); i = j + 1; continue; }
      }
    }
    i++;
  }
  return { number: number ?? -1, date, revised_labels: revisedLabels };
}

// ===========================================================================
// Step 6: Merge addenda over the original, oldest -> newest
// ===========================================================================

const TRACKED_FIELDS: Array<keyof BidItem> = ["bid_code", "description", "quantity", "unit"];

function mergeAddenda(
  originalItems: BidItem[],
  addendaDocs: Array<{ info: AddendumInfo; items: BidItem[] }>,
): { merged: BidItem[]; applied: AddendumInfo[]; removed: Array<Record<string, unknown>> } {
  const byLine = new Map<string, BidItem>(originalItems.map((it) => [it.line_no, it]));
  const order: string[] = originalItems.map((it) => it.line_no);
  const applied: AddendumInfo[] = [];
  const removed: Array<Record<string, unknown>> = [];
  const originalPageByLine = new Map<string, number | null>(originalItems.map((it) => [it.line_no, it.page_no]));

  for (const { info, items: replacementItems } of addendaDocs) {
    applied.push(info);
    const sourceLabel = `Addendum #${info.number}` + (info.date ? ` (${info.date})` : "");
    const newLineNos = new Set(replacementItems.map((it) => it.line_no));

    const range = bidItemsPageRange(info.revised_labels);
    if (range) {
      const [startPage, endPage] = range;
      for (const lineNo of [...order]) {
        if (newLineNos.has(lineNo)) continue;
        const origPage = originalPageByLine.get(lineNo);
        if (origPage == null || origPage < startPage || origPage > endPage) continue;
        const item = byLine.get(lineNo);
        if (!item) continue;
        removed.push({
          line_no: item.line_no, bid_code: item.bid_code, description: item.description,
          page_no: origPage, removed_by: sourceLabel,
        });
        byLine.delete(lineNo);
        order.splice(order.indexOf(lineNo), 1);
      }
    }

    for (const newItem of replacementItems) {
      const oldItem = byLine.get(newItem.line_no);
      if (!oldItem) {
        newItem.change_notes.push(`New line added by ${sourceLabel}`);
        byLine.set(newItem.line_no, newItem);
        order.push(newItem.line_no);
        continue;
      }
      const changed: Array<[string, unknown, unknown]> = [];
      for (const f of TRACKED_FIELDS) {
        if (oldItem[f] !== newItem[f]) changed.push([f, oldItem[f], newItem[f]]);
      }
      if (changed.length === 0) continue; // reprinted unchanged
      for (const [f, oldV, newV] of changed) {
        newItem.change_notes.push(`${f} changed ${JSON.stringify(oldV)} -> ${JSON.stringify(newV)} per ${sourceLabel}`);
      }
      newItem.change_notes = [...oldItem.change_notes, ...newItem.change_notes];
      byLine.set(newItem.line_no, newItem);
    }
  }

  return { merged: order.map((ln) => byLine.get(ln)!), applied, removed };
}

// ===========================================================================
// Step 7: Required mix designs (dedup by signature)
// ===========================================================================

function buildRequiredMixDesigns(mixItems: BidItem[]) {
  const groups = new Map<string, any>();
  const order: string[] = [];
  for (const item of mixItems) {
    const sig: MixSignature = item.layer === "LEVELING_WEDGING"
      ? { kind: "LEVELING_WEDGING", mix_class: null, layer: null, nominal_size: null, binder_grade: item.binder_grade }
      : { kind: "CL_ASPH", mix_class: item.mix_class, layer: item.layer, nominal_size: item.nominal_size, binder_grade: item.binder_grade };
    const key = sigKey(sig);
    if (!groups.has(key)) {
      groups.set(key, {
        signature: sigLabel(sig), kind: sig.kind, mix_class: sig.mix_class, layer: sig.layer,
        nominal_size: sig.nominal_size, binder_grade: sig.binder_grade,
        total_quantity: 0, unit: item.unit, instances: [] as any[], change_notes: [] as string[],
      });
      order.push(key);
    }
    const g = groups.get(key);
    if (item.unit !== g.unit) g.unit = `MIXED UNITS: ${g.unit} / ${item.unit}`;
    g.total_quantity += item.quantity;
    g.instances.push({ line_no: item.line_no, section: item.section, bid_code: item.bid_code, quantity: item.quantity, unit: item.unit });
    g.change_notes.push(...item.change_notes);
  }
  return order.map((k) => groups.get(k));
}

// ===========================================================================
// Step 8: End-to-end
// ===========================================================================

async function lookupByCid(contractId: string, lettingDate: string) {
  const { candidates, error } = await findProposalPdfUrls(lettingDate, contractId);
  if (!candidates) return { error };

  const [original, ...addenda] = candidates;
  const origBuf = await fetch(original.url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.arrayBuffer());
  const { header, items: originalItems } = await parseProposalPdf(origBuf, original.filename);

  const addendaDocs: Array<{ info: AddendumInfo; items: BidItem[] }> = [];
  for (const c of addenda) {
    const buf = await fetch(c.url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.arrayBuffer());
    const { getDocument } = await getResolvedPDFJS();
    const task = getDocument({ data: new Uint8Array(buf) });
    const doc = await task.promise;
    try {
      const reader = makePageReader(doc);
      const info = await parseAddendumCover(reader);
      if (c.addendum_no != null) info.number = c.addendum_no; // filename is more reliable
      const replacementItems = await parseBidItems(reader, c.filename);
      addendaDocs.push({ info, items: replacementItems });
    } finally {
      await task.destroy(); // v7: release the document; v6 never did
    }
  }
  addendaDocs.sort((a, b) => a.info.number - b.info.number);

  const { merged: mergedItems, applied, removed: removedItems } = mergeAddenda(originalItems, addendaDocs);
  const { mixItems, flaggedItems, otherItems } = classifyItems(mergedItems);
  const requiredMixDesigns = buildRequiredMixDesigns(mixItems);

  const removedMixItems = removedItems.filter(
    (r) => MIX_RE.test(r.description as string) || LEVELING_WEDGING_RE.test(r.description as string),
  );
  const requiresConfirmation = requiredMixDesigns.some((g) => g.change_notes.length > 0) || removedMixItems.length > 0;

  return {
    source_url: original.url,
    source_filename: original.filename,
    header,
    addenda_applied: applied,
    required_mix_designs: requiredMixDesigns,
    removed_items: removedItems,
    removed_mix_items: removedMixItems,
    flagged_items_for_review: flaggedItems,
    other_items_count: otherItems.length,
    requires_contractor_confirmation: requiresConfirmation,
  };
}

// ===========================================================================
// Deno.serve entrypoint (Supabase Edge Function)
// ===========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to the real DesignBook/PlantBook origin(s) before final production use
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", // v6: Supabase's own documented CORS snippet — adds x-client-info, which supabase-js sends by default
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS_HEADERS });
  }
  try {
    const { contract_id, letting_date } = await req.json();
    if (!contract_id || !letting_date) {
      return new Response(JSON.stringify({ error: "contract_id and letting_date (MM/DD/YYYY) are required" }), {
        status: 400, headers: CORS_HEADERS,
      });
    }
    const result = await lookupByCid(String(contract_id), String(letting_date));
    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
