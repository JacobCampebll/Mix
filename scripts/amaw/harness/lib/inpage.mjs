/* Functions that run INSIDE the page.
 *
 * Every one of these is serialized by Playwright and evaluated in the browser,
 * so none of them may close over anything in this module. They are here rather
 * than pasted into each check so that "what the harness typed" is one
 * definition — two fills that differ slightly would make two round-trip
 * results incomparable.
 */

/* Fill every control the form collects from, deterministically.
 *
 * collectForm() reads four attribute families — [data-field] (scalars),
 * [data-col] (repeating rows), [data-fp] (Four Points) and [data-pr] (the
 * polish matrix) — so all four are filled, or a round-trip would "pass" on
 * the half it never touched.
 *
 * Readonly cells are left alone on purpose: MAT code and friends are written
 * by applyAutofills(), and a round-trip that re-derives them is the point.
 *
 * Values are picked to be plausible rather than random. The Four Points get
 * real gyratory-shaped numbers because computeFourPoint() fits a parabola
 * through them and solves it; garbage there produces a solve nobody can read
 * and, worse, an extrapolation warning that has nothing to do with the check.
 */
export function fillForm(overrides) {
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const fire = (el) => {
    // input BEFORE change, the order a real browser uses. CLAUDE.md's
    // data-guess gotcha turns on exactly that order, so the harness must not
    // invent a tidier one.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const setVal = (el, v) => { el.value = v; fire(el); };

  const pickOption = (el, key) => {
    const opts = Array.from(el.options).filter((o) => o.value !== "");
    if (!opts.length) return null;
    return opts[hash(key) % opts.length].value;
  };
  const pickRef = (el, key) => {
    const src = el.dataset.source;
    // Bare `state`, not `window.state`: designbook.html declares it with a
    // top-level `const`, which lands in the global LEXICAL record and never
    // on `window`. window.state reads undefined and every reference field
    // would silently go unfilled — which is the same silent-nothing failure
    // this harness exists to catch, so it must not commit it itself.
    const st = typeof state !== "undefined" ? state : null;
    const list = (st && st.ref && st.ref[src]) || [];
    if (!list.length) return null;
    return list[hash(key) % list.length].value;
  };

  let filled = 0;
  // ---- Four Points first: everything downstream computes off them. --------
  const FP = { fp_gb: "1.030", fp_vatgt: "3.5" };
  document.querySelectorAll("[data-fp]").forEach((el) => {
    const k = el.dataset.fp;
    let v = null;
    if (FP[k]) v = FP[k];
    else if (/^const:/.test(k)) v = null;                 // Gsb / %#200 are auto-filled
    else if (/:pb$/.test(k)) v = el.value || "5.0";       // seeded by CONFIG already
    else if (/:gmb$/.test(k)) v = (2.395 + Number(/pt:(\d+):/.exec(k)[1]) * 0.008).toFixed(3);
    else if (/:gmm$/.test(k)) v = (2.520 - Number(/pt:(\d+):/.exec(k)[1]) * 0.006).toFixed(3);
    if (v == null) return;
    setVal(el, v); filled++;
  });

  /* The schema, not the markup, says whether a control is a number.
   *
   * A row cell renders as a plain <input type="text"> with no inputmode — the
   * numeric-ness lives in CONFIG.SECTIONS, and rowHTML() re-applies
   * roundTo(v, CONFIG.DP[key]) on every re-render. So typing "H4725" into a
   * number column and then re-rendering gives back "4725.00", which is the
   * page behaving correctly and the harness lying. Ask the schema. */
  const colDef = (el) => {
    // Bare `CONFIG` for the same reason as `state` above.
    const C = typeof CONFIG !== "undefined" ? CONFIG : null;
    if (!C || !C.SECTIONS) return null;
    // Array.isArray guards rather than `|| []`: a schema key is not always
    // the shape its name suggests (CONFIG.LEGACY.TSR.rows is an object of
    // sheet row numbers), and one wrong assumption here throws inside the
    // fill and takes the whole check with it.
    const arr = (x) => (Array.isArray(x) ? x : []);
    // A section's `rows` is EITHER one row spec or an array of them —
    // Aggregate Structure declares a bare object, Performance Testing an
    // array of three. rowsBlockHTML() copes with both and so must this.
    const rowSpecs = (s) => (Array.isArray(s.rows) ? s.rows : s.rows ? [s.rows] : []);
    if (el.dataset.field) {
      for (const s of C.SECTIONS) {
        for (const f of arr(s.fields)) if (f.key === el.dataset.field) return f;
        for (const sv of arr(s.sieves)) if (sv.key === el.dataset.field) return { type: "number" };
      }
      return null;
    }
    if (el.dataset.row && el.dataset.col) {
      for (const s of C.SECTIONS) {
        for (const r of rowSpecs(s)) {
          if (r.key !== el.dataset.row) continue;
          for (const c of arr(r.columns)) if (c.key === el.dataset.col) return c;
        }
      }
    }
    return null;
  };

  // ---- Scalars, row cells and the polish matrix ---------------------------
  document.querySelectorAll("[data-field], [data-col], [data-pr]").forEach((el) => {
    if (el.readOnly || el.disabled) return;
    const key = el.dataset.field || el.dataset.pr ||
                `${el.dataset.row || ""}.${el.dataset.col || ""}`;
    const seed = key + ":" + Array.prototype.indexOf.call(el.parentElement ? el.parentElement.children : [], el);
    if (el.type === "checkbox") { el.checked = true; fire(el); filled++; return; }
    if (el.tagName === "SELECT") {
      const v = pickOption(el, seed);
      if (v != null) { setVal(el, v); filled++; }
      return;
    }
    if (el.dataset.source) {
      const v = pickRef(el, seed);
      if (v != null) { setVal(el, v); filled++; }
      return;
    }
    if (el.type === "date") { setVal(el, "2026-02-19"); filled++; return; }
    const def = colDef(el);
    const numeric = (def && def.type === "number") || el.getAttribute("inputmode") === "decimal";
    // CONFIG.DP is the page's claim about precision, and rowHTML() re-applies
    // roundTo(v, CONFIG.DP[key]) on EVERY render — so a fill that ignores it
    // reports a round-trip failure that is really the page obeying its own
    // rule. CLAUDE.md: "a precision constant is a claim about the whole page,
    // and it takes one hand-rolled line anywhere to make it false silently."
    // Type to the same precision the page would store.
    const C = typeof CONFIG !== "undefined" ? CONFIG : null;
    // CONFIG.DP is keyed by the FIELD/COLUMN key, not by the composite seed.
    const dpKey = el.dataset.field || el.dataset.col || "";
    const dp = C && C.DP && C.DP[dpKey] != null ? C.DP[dpKey] : 1;
    setVal(el, numeric ? ((hash(seed) % 900) / 10 + 1).toFixed(dp) : "H" + (hash(seed) % 9973));
    filled++;
  });

  // ---- Overrides last, so a check can pin the values it cares about -------
  Object.entries(overrides || {}).forEach(([k, v]) => {
    const el = document.querySelector(`[data-field="${k}"]`);
    if (el) setVal(el, v);
  });
  return filled;
}

/* What the book switch looks like right now.
 *
 * The switch is `#bookDesign` / `#bookPlant` in the appbar. CLAUDE.md has
 * PlantBook as a second VIEW of this page, and the markup says so: PlantBook
 * is present and `disabled`, with a title explaining why. That disabled
 * attribute is this harness's gate — everything that measures PlantBook skips
 * while it is set, and starts running the moment it is not.
 */
export function bookProbe() {
  const d = document.getElementById("bookDesign");
  const p = document.getElementById("bookPlant");
  return {
    hasSwitch: !!d && !!p,
    designOn: !!d && d.classList.contains("on"),
    plantOn: !!p && p.classList.contains("on"),
    plantDisabled: !p || p.disabled,
    plantTitle: p ? (p.getAttribute("title") || "") : "",
    current: [d, p].filter((b) => b && b.getAttribute("aria-current") === "page").length,
    // A second view will need somewhere to say which book is live. Read it if
    // it is there; its absence is not a failure today.
    stateBook: (typeof state !== "undefined" && state && state.book) || null,
  };
}

/* Ids and orphans, the two things a re-render is most likely to break.
 *
 * Two elements answering to one getElementById is the bug CLAUDE.md names
 * when it explains why #advanceStage was NOT moved into the action bar, and
 * why #valBlock is parked rather than rebuilt. An orphan [data-field] outside
 * #sections is the other half: collectForm() sweeps the whole document, so a
 * stray control off in some leftover markup silently joins the payload.
 */
export function domAudit() {
  const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
  const seen = new Set(), dup = new Set();
  ids.forEach((i) => (seen.has(i) ? dup.add(i) : seen.add(i)));
  const orphans = Array.from(document.querySelectorAll("[data-field], [data-col]"))
    .filter((e) => !e.closest("#sections"))
    .map((e) => e.dataset.field || `${e.dataset.row}.${e.dataset.col}`);
  // The rowlist contract: collectForm() reads a [data-rowlist]'s CHILDREN as
  // the rows, so anything in there that is not a row becomes an extra row.
  const rowlistStrays = [];
  document.querySelectorAll("[data-rowlist]").forEach((list) => {
    Array.from(list.children).forEach((row) => {
      if (!row.querySelector("[data-col]")) rowlistStrays.push(list.dataset.rowlist);
    });
  });
  return {
    dup: Array.from(dup),
    orphans: Array.from(new Set(orphans)),
    rowlistStrays: Array.from(new Set(rowlistStrays)),
    valBlocks: document.querySelectorAll("#valBlock, .valblock").length,
    hasValBlock: !!document.getElementById("valBlock"),
    hasSaveMsg: !!document.getElementById("saveMsg"),
    hasVallist: !!document.getElementById("vallist"),
  };
}

/* The step numerals, read the way a person reads them.
 *
 * CLAUDE.md: "Every number a person sees is a VISIBLE position, and it is
 * painted in one place." Three places show one: the rail's dots, the action
 * bar's "Step N of M", and the kicker in each section's navy band. This
 * returns all three so a check can insist they agree.
 */
export function stepAudit() {
  const secs = Array.from(document.querySelectorAll("#sections .section"));
  const rail = Array.from(document.querySelectorAll("#railnav .railstep"));
  const visible = secs.filter((s) => !s.classList.contains("hidden"));
  const active = secs.find((s) => s.classList.contains("active"));
  const bar = document.querySelector("#stepcount .sc1");
  const barText = bar ? bar.textContent : "";
  const m = /Step\s+(\d+)\s+of\s+(\d+)/.exec(barText);
  const kick = active ? active.querySelector(".kicker") : null;
  const km = kick ? /Step\s+(\d+)\s+of\s+(\d+)/.exec(kick.textContent) : null;
  return {
    sections: secs.length,
    visible: visible.length,
    hidden: secs.filter((s) => s.classList.contains("hidden")).map((s) => s.dataset.section),
    // Rail dots paired with whether their section is hidden.
    dots: rail.map((b, i) => ({
      step: i,
      section: b.dataset.target,
      numeral: b.querySelector(".dot") ? b.querySelector(".dot").textContent : "",
      railHidden: b.classList.contains("hidden"),
      secHidden: secs[i] ? secs[i].classList.contains("hidden") : null,
      current: b.classList.contains("current"),
    })),
    activeSection: active ? active.dataset.section : null,
    activeIndex: active ? secs.indexOf(active) : -1,
    barText,
    barPos: m ? Number(m[1]) : null,
    barTotal: m ? Number(m[2]) : null,
    kickerText: kick ? kick.textContent : null,
    kickerVisible: kick ? getComputedStyle(kick).display !== "none" : false,
    kickerPos: km ? Number(km[1]) : null,
    kickerTotal: km ? Number(km[2]) : null,
  };
}
