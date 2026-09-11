/* KYTC project (line) items for a contract.
 *
 * Why this is a function and not a fetch from the page: the KYTC site is
 * public and needs no key, but it sends no CORS headers, so a browser cannot
 * read it. This is the proxy CLAUDE.md's "third-party API call goes through a
 * function" rule asks for - a transit function like the other two, storing
 * nothing.
 *
 * Why it exists at all: a generated MixPack's Project Items sheet is what
 * MEDL and SiteManager check the design against, and contractors fill it from
 * the proposal they bid. A proposal goes stale the moment a change order adds
 * or re-numbers an item, and MEDL then rejects the load. KYTC's own current
 * list is the newest pay estimate for the contract (Jake, 2026-09-11: "always
 * use the newest pay estimate for this, its the top one in the list").
 *
 * Two sources, in order:
 *   1. Pay Estimates - /Construction/Pay Estimates/<cid>-<vendor>-EST<nnnn>.html
 *      (or -FINAL-<nnnn>.html for the last one). Authoritative and current:
 *      it carries every change-order item with its live CURRENT QUANTITY.
 *   2. Item List     - /Construction/Contract Items/<cid>items<vendor>.html
 *      The items as awarded. Used only when the contract has no estimate yet,
 *      which is the normal state for a NEW mix design - work has not started,
 *      so nobody has been paid. The response says which source answered so the
 *      page can tell the technician.
 *
 * Neither filename can be built from the contract ID alone - both carry the
 * contractor's KYTC vendor number. Rather than ask a technician for it, both
 * libraries are SharePoint document libraries whose classic view honours
 * FilterField1=FileLeafRef&FilterOp1=BeginsWith, so the contract ID alone
 * finds the file and the vendor number comes back with it.
 */

const HOST = "https://transportation.ky.gov";
const LIB = {
  estimates: "/Construction/Pay%20Estimates",
  items: "/Construction/Contract%20Items",
};
// KYTC's IIS is slow under load. The page retries; this only bounds one call.
const FETCH_TIMEOUT_MS = 12000;

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

async function get(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, text: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, reason: err && err.name === "AbortError" ? "timed out" : String(err && err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

/* ---- HTML helpers. These reports are hand-rolled RTF-to-HTML from the
   1990s: unclosed <td>, stray <font>, tables inside table rows. Nothing
   parses them as a tree, so read them as a flat run of <tr> blocks. ---- */
const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
function txt(s) {
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, e) => (e[0] === "#" && e.length > 1 && /^\d+$/.test(e.slice(1))
      ? String.fromCharCode(+e.slice(1))
      : (ENTITIES[e.toLowerCase()] !== undefined ? ENTITIES[e.toLowerCase()] : m)))
    .replace(/\s+/g, " ")
    .trim();
}
function cellsOf(row) {
  const out = [];
  const re = /<t[dh]\b[^>]*>([\s\S]*?)(?=<\/t[dh]>|<t[dh]\b|<\/tr>|$)/gi;
  let m;
  while ((m = re.exec(row))) out.push(txt(m[1]));
  return out;
}
function rowsOf(html) {
  return html.match(/<tr\b[^>]*>[\s\S]*?(?=<\/tr>|<tr\b|$)/gi) || [];
}
function num(s) {
  const v = parseFloat(String(s == null ? "" : s).replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? v : null;
}

/* ---- the library listing: contract ID -> file name ---- */
async function listFiles(lib, cid) {
  const url = `${HOST}${lib}/Forms/AllItems.aspx`
    + `?FilterField1=FileLeafRef&FilterValue1=${encodeURIComponent(cid)}&FilterOp1=BeginsWith`;
  const r = await get(url);
  if (!r.ok) return [];
  const names = new Set();
  const re = /([0-9A-Za-z][0-9A-Za-z_-]*\.html)/g;
  let m;
  while ((m = re.exec(r.text))) if (m[1].toUpperCase().startsWith(String(cid).toUpperCase())) names.add(m[1]);
  return [...names];
}

// <cid>-<vendor>-EST0006.html / <cid>-<vendor>-FINAL-0007.html. The number is
// the estimate sequence and is what "newest" means - the numbers can have
// gaps (an estimate voided in SiteManager leaves none behind), so take the
// highest rather than counting up until one 404s.
function newestEstimate(names, cid) {
  const re = new RegExp(`^${cid}-(\\d+)-(EST|FINAL-?)(\\d+)\\.html$`, "i");
  let best = null;
  for (const n of names) {
    const m = n.match(re);
    if (!m) continue;
    const seq = parseInt(m[3], 10);
    if (!best || seq > best.seq) best = { file: n, vendor: m[1], seq, final: /FINAL/i.test(m[2]) };
  }
  return best;
}
function itemListFile(names, cid) {
  const re = new RegExp(`^${cid}items(\\d+)\\.html$`, "i");
  for (const n of names) { const m = n.match(re); if (m) return { file: n, vendor: m[1] }; }
  return null;
}

/* ---- the two report layouts ----
   Both are one row per line item under a project heading, but the columns
   differ, so the header row that most recently went past decides how to read
   a row. Anything that is not a data row under a known header is skipped
   rather than guessed at. */
const LAYOUTS = [
  { // pay estimate
    id: "estimate",
    is: (c) => c.includes("LINE ITEM NUMBER") && c.includes("CURRENT QUANTITY"),
    min: 6,
    read: (c) => ({ line: c[0], description: c[1], item_no: c[2], unit: c[3], plan_qty: num(c[4]), quantity: num(c[5]) }),
  },
  { // item list (as awarded)
    id: "itemlist",
    is: (c) => c.includes("PROJ LN #") && c.includes("BID CODE"),
    min: 7,
    read: (c) => ({ line: c[0], description: c[1], item_no: c[2], unit: c[6], plan_qty: num(c[4]), quantity: num(c[4]) }),
  },
];

function parseItems(html) {
  let layout = null, project = "";
  const items = [], seen = new Set();
  for (const row of rowsOf(html)) {
    const c = cellsOf(row);
    if (!c.length) continue;
    const head = LAYOUTS.find((l) => l.is(c));
    if (head) { layout = head; continue; }
    // "Project" / "SM- Project" heading rows carry the PCN the rows beneath
    // belong to. A contract can have more than one (one per route).
    const label = (c[0] || "").replace(/[^A-Za-z]/g, "").toUpperCase();
    if ((label === "PROJECT" || label === "SMPROJECT") && c[1]) { project = c[1].trim(); continue; }
    if (!layout || c.length < layout.min) continue;
    if (!/^\d{4}$/.test((c[0] || "").trim())) continue;           // line item number
    const r = layout.read(c);
    const itemNo = (r.item_no || "").trim();
    if (!/^[0-9A-Z]{4,}$/.test(itemNo)) continue;                 // bid/item code
    const key = `${project}|${(r.line || "").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      project,
      line: (r.line || "").trim(),
      item_no: itemNo,
      description: (r.description || "").trim(),
      unit: (r.unit || "").trim(),
      plan_qty: r.plan_qty,
      quantity: r.quantity != null ? r.quantity : r.plan_qty,
    });
  }
  return items;
}

// The estimate's own header block, so the page can say which one it read.
function estimateHeader(html) {
  const out = {};
  const want = {
    "Contract Id": "contract_id", "Contract Type": "contract_type", "Estimate Nbr": "estimate_number",
    "Estimate Number": "estimate_number", "Estimate Type": "estimate_type", "Period": "period",
    "Contractor": "contractor", "County": "county", "Primary Project Number": "primary_project_number",
    "Date Approved": "approved",
  };
  for (const row of rowsOf(html)) {
    const c = cellsOf(row);
    for (let i = 0; i < c.length - 1; i++) {
      const key = want[c[i]];
      if (key && !out[key] && c[i + 1]) out[key] = c[i + 1].trim();
    }
  }
  return out;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (req.method !== "GET") return reply(405, { error: "GET only" });

  const cid = (new URL(req.url).searchParams.get("cid") || "").trim();
  if (!/^\d{6}$/.test(cid)) return reply(400, { error: "cid must be a six-digit KYTC contract ID" });

  const estimates = await listFiles(LIB.estimates, cid);
  const newest = newestEstimate(estimates, cid);
  if (newest) {
    const r = await get(`${HOST}${LIB.estimates}/${newest.file}`);
    if (r.ok) {
      const items = parseItems(r.text);
      if (items.length) {
        return reply(200, {
          cid, source: "estimate", file: newest.file, vendor: newest.vendor,
          estimate: { number: String(newest.seq).padStart(4, "0"), final: newest.final, ...estimateHeader(r.text) },
          estimates_available: estimates.length, items,
        });
      }
    }
  }

  // No estimate yet - normal for a new design, since paving has not started.
  const listed = await listFiles(LIB.items, cid);
  const list = itemListFile(listed, cid);
  if (list) {
    const r = await get(`${HOST}${LIB.items}/${list.file}`);
    if (r.ok) {
      const items = parseItems(r.text);
      if (items.length) {
        return reply(200, {
          cid, source: "itemlist", file: list.file, vendor: list.vendor,
          estimate: null, estimates_available: 0, items,
        });
      }
    }
  }

  return reply(404, {
    error: `No project items found for contract ${cid}.`,
    cid, estimates_available: estimates.length,
  });
}
