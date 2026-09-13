/* The clipping baseline.
 *
 * WHY A BASELINE AND NOT A BARE ASSERTION. CLAUDE.md states the page-level
 * rule absolutely — "Check a restyle with documentElement.scrollWidth at
 * 390px, never by eye" — and that one IS asserted absolutely, because the page
 * must never scroll sideways. Per-input clipping is different: the file is
 * explicit that some of it is accepted and unfixable ("What still clips at
 * 390px is two genuinely long strings (a producer name at 387px, the RAP note)
 * and no layout fixes that — the combo popup and the title attribute are the
 * answer there"). A check that failed on those would be turned off within a
 * week, and a turned-off check defends nothing.
 *
 * So: record what clips today, and fail on anything NEW. That is the question
 * the PlantBook splice actually has to answer — not "is this layout perfect"
 * but "did adding a second view make the first one worse".
 *
 * Re-bless with:  node scripts/amaw/harness/run.mjs viewports --bless
 * A blessing is a decision. Read the diff it prints before committing it —
 * every entry in here is a cell a person cannot fully read.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_FILE = path.join(HERE, "..", "baseline", "clipping.json");

export function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")); }
  catch (_) { return null; }
}

export function saveBaseline(data) {
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2) + "\n");
  return BASELINE_FILE;
}

/* A clipped entry is reported as "key(scrollWidth>clientWidth)". The pixels
 * move with the font and the browser build; the KEY is the fact worth
 * recording, so the baseline stores keys only. */
export function keyOf(entry) { return String(entry).replace(/\(.*$/, ""); }
