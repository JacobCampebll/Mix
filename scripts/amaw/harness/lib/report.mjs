/* Results, and the table they print as.
 *
 * Three statuses and only three. PASS and FAIL are obvious; SKIP is the one
 * that carries the weight here, because most of this suite's subject does not
 * exist yet. A check whose subject is absent must say so out loud with a
 * reason — a check that quietly returns PASS because it found nothing to look
 * at is worse than no check, since it reads as coverage.
 */
export const PASS = "PASS", FAIL = "FAIL", SKIP = "SKIP";

export class Results {
  constructor() { this.rows = []; }
  /* check: which check file. book: "DesignBook" / "PlantBook" / "-".
     case: what was measured. detail: the number or the reason. */
  add(check, book, kase, status, detail = "") {
    this.rows.push({ check, book, case: kase, status, detail: String(detail) });
    return status;
  }
  pass(check, book, kase, detail) { return this.add(check, book, kase, PASS, detail); }
  fail(check, book, kase, detail) { return this.add(check, book, kase, FAIL, detail); }
  skip(check, book, kase, why) { return this.add(check, book, kase, SKIP, why); }
  /* The workhorse: assert, and record either way with the same detail string
     so a pass and a fail are read from the same number. */
  ok(check, book, kase, cond, detail) {
    return cond ? this.pass(check, book, kase, detail) : this.fail(check, book, kase, detail);
  }
  get failed() { return this.rows.filter((r) => r.status === FAIL); }
  get skipped() { return this.rows.filter((r) => r.status === SKIP); }
  get passed() { return this.rows.filter((r) => r.status === PASS); }
}

/* A plain padded table. console.table truncates long cells and reorders
 * nothing usefully; the detail column is where the evidence lives, so it must
 * survive intact. */
export function printTable(rows, { maxDetail = 96 } = {}) {
  const cols = ["check", "book", "case", "status", "detail"];
  const head = { check: "CHECK", book: "BOOK", case: "CASE", status: "STATUS", detail: "DETAIL" };
  const clip = (s) => (s.length > maxDetail ? s.slice(0, maxDetail - 1) + "…" : s);
  const body = rows.map((r) => ({ ...r, detail: clip(r.detail) }));
  const w = {};
  for (const c of cols) w[c] = Math.max(head[c].length, ...body.map((r) => String(r[c]).length));
  const line = (r) => cols.map((c) => String(r[c]).padEnd(w[c])).join("  ").trimEnd();
  const rule = cols.map((c) => "-".repeat(w[c])).join("  ");
  console.log(line(head));
  console.log(rule);
  let lastCheck = null;
  for (const r of body) {
    if (lastCheck !== null && r.check !== lastCheck) console.log(rule);
    console.log(line(r));
    lastCheck = r.check;
  }
}
