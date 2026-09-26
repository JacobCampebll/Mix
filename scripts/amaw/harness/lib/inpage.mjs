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
   * A row cell renders as a plain <input type="text"> — the numeric-ness
   * lives in CONFIG.SECTIONS, and rowHTML() re-applies
   * roundTo(v, CONFIG.DP[key]) on every re-render. So typing "H4725" into a
   * number column and then re-rendering gives back "4725.00", which is the
   * page behaving correctly and the harness lying. Ask the schema.
   *
   * Since 2026-09-26 an EDITABLE row number cell also carries
   * inputmode="decimal" (the phone's number pad - inputFor() always gave it
   * to scalars), so the `inputmode` test below agrees with the schema. The
   * schema is still asked first: the attribute is rendered FROM it, so the
   * schema is the answer and the attribute only its echo. */
  const colDef = (el) => {
    // Bare `CONFIG` for the same reason as `state` above.
    const C = typeof CONFIG !== "undefined" ? CONFIG : null;
    if (!C || !C.SECTIONS) return null;
    // THE ACTIVE BOOK's schema, not DesignBook's. This read C.SECTIONS
    // unconditionally, which was correct while the page was one book and a
    // lie the moment it was two: every PlantBook number column came back
    // `null` from here, got filled with the junk string a text column gets,
    // and rowHTML()'s roundTo(v, CONFIG.DP[key]) then turned "H1758" into
    // "1758.000" on the next render - reported as the page losing a value
    // when the page was doing exactly what the comment above says it does.
    // activeSections() is the page's own answer to "which schema"; fall back
    // to C.SECTIONS so this still works against a build that predates it.
    const SECTIONS = typeof activeSections === "function" ? activeSections() : C.SECTIONS;
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
      for (const s of SECTIONS) {
        for (const f of arr(s.fields)) if (f.key === el.dataset.field) return f;
        for (const sv of arr(s.sieves)) if (sv.key === el.dataset.field) return { type: "number" };
      }
      return null;
    }
    if (el.dataset.row && el.dataset.col) {
      for (const s of SECTIONS) {
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
    // A native date or time picker holds a value only in its own shape and
    // silently blanks anything else - the junk string below would read back
    // "" and the round trip would then compare "" with "", passing while
    // testing nothing. Filled in that shape instead: DesignBook's referenced
    // design date, and PlantBook's sublot ticket Date and Time (2026-09-26).
    if (el.type === "date") { setVal(el, "2026-02-19"); filled++; return; }
    if (el.type === "time") { setVal(el, "14:15"); filled++; return; }
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

  /* ---- Values other values are BUILT from cannot take junk ---------------
   *
   * The generic numeric fill is `(hash % 900)/10 + 1`, which is fine for a
   * weight or a percentage and impossible for a lot number - it produced
   * 80.8. That matters more than realism, because `lot_number` is not just
   * displayed: every core id is built from it ("<lot>-<sublot>-A", mapper.mjs
   * and paintLotIds()), so one junk value silently widened SIX columns and
   * had the viewport sweep reporting mat_cores/joint_cores `sublot` and
   * `core_id` as clipping at 1500px. They do not: with a real lot number
   * every one of them fits, measured 2026-09-15. Blessing those into
   * baseline/clipping.json would have recorded a width limit that no lot can
   * ever reach and turned the check off for six real columns - the "a stale
   * baseline is not neutral, it is a hole" trap this file already carries,
   * arrived at from the other direction.
   *
   * A lot number is a positive integer, and 1 is what intake.mjs seeds. */
  const DERIVED_FROM = { lot_number: "1" };
  Object.entries(DERIVED_FROM).forEach(([k, v]) => {
    const el = document.querySelector(`[data-field="${k}"]`);
    if (el) setVal(el, v);
  });

  // ---- Overrides last, so a check can pin the values it cares about -------
  Object.entries(overrides || {}).forEach(([k, v]) => {
    const el = document.querySelector(`[data-field="${k}"]`);
    if (el) setVal(el, v);
  });

  /* Put the combo popup away.
   *
   * Typing into a sourced field opens comboOpen()'s popup, and the last field
   * filled leaves it on screen. That is not a hypothetical tidiness problem:
   * #comboPop is a real element that intercepts pointer events (a click on the
   * book switch timed out behind it) and occupies real width (the viewport
   * sweep would be measuring a page nobody is looking at). A person who has
   * finished typing has moved on; so does the harness. */
  if (typeof comboClose === "function") comboClose();
  const pop = document.getElementById("comboPop");
  if (pop) pop.remove();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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
    // Not just "does #valBlock exist" but "is it still the one with the
    // outstanding list and the message line inside it". CLAUDE.md's reason
    // for parking the node is that without it "every later
    // msg($('saveMsg'), ...) writes to nothing" — and an EMPTY #valBlock
    // answers getElementById perfectly well while doing exactly that. The
    // identity check alone was proved insufficient against a scratch copy
    // that cleared #valPark: the harness happily tagged the wrong node.
    valBlockIntact: (() => {
      const v = document.getElementById("valBlock");
      if (!v) return false;
      return !!(v.querySelector("#saveMsg") && v.querySelector("#vallist") && v.querySelector("#valsub"));
    })(),
    hasSaveMsg: !!document.getElementById("saveMsg"),
    hasVallist: !!document.getElementById("vallist"),
  };
}

/* Which row cells open the phone's number pad, asked of the schema.
 *
 * rowHTML() gives an EDITABLE `number` column inputmode="decimal" and nothing
 * else gets it (2026-09-26): without it a phone opens the full keyboard on
 * each of the 327 weighings a lot asks for. The column is resolved from the
 * cell's OWN section - the four Sublot tabs each declare their own blend_pct
 * spec (BOD is editable on tab 1 only), so a spec looked up by row key alone
 * answers for the wrong tab - and a sub-block drawn `into` a host is found by
 * its data-subsection before the host's data-section. Both mistakes were
 * made, in that order, by the probe this came from. */
export function keypadAudit() {
  const rowsOf = (s) => (Array.isArray(s.rows) ? s.rows : s.rows ? [s.rows] : []);
  const secs = typeof activeSections === "function" ? activeSections() : [];
  const specOf = (el) => {
    const sub = el.closest("[data-subsection]"), sec = el.closest("[data-section]");
    const id = sub ? sub.dataset.subsection : sec && sec.dataset.section;
    const s = id && secs.find((x) => x.id === id);
    return s ? rowsOf(s).find((r) => r.key === el.dataset.row) || null : null;
  };
  let cells = 0, padded = 0;
  const missing = new Set(), stray = new Set(), unresolved = new Set();
  document.querySelectorAll("input[data-row][data-col]").forEach((el) => {
    const where = `${el.dataset.row}.${el.dataset.col}`;
    const spec = specOf(el);
    const c0 = spec && (spec.columns || []).find((c) => c.key === el.dataset.col);
    if (!c0) { unresolved.add(where); return; }
    const c = typeof effectiveColDef === "function"
      ? effectiveColDef(c0, rowValuesOf(el.closest(".rowitem"))) : c0;
    const pad = el.getAttribute("inputmode") === "decimal";
    if (c.type === "number" && !c.readonly && !c.source && !c.signed) {
      cells++;
      if (pad) padded++; else missing.add(where);
    } else if (el.hasAttribute("inputmode")) {
      stray.add(`${where}(${c.type}${c.readonly ? ", readonly" : ""}${c.signed ? ", signed" : ""})`);
    }
  });
  // The scalars, which inputFor() renders: the pad on every number field
  // EXCEPT a `signed` one, which keeps the full keyboard because iOS's
  // decimal pad has no minus key (lot_setup_ac_adjust, -0.10 to +0.3).
  const fieldDefs = {};
  for (const s of secs) for (const f of (Array.isArray(s.fields) ? s.fields : [])) fieldDefs[f.key] = f;
  const scalar = { cells: 0, padded: 0, missing: [], signed: [], signedPadded: [] };
  document.querySelectorAll("input[data-field]").forEach((el) => {
    const f = fieldDefs[el.dataset.field];
    if (!f || f.type !== "number" || f.readonly || f.source) return;
    const pad = el.getAttribute("inputmode") === "decimal";
    if (f.signed) { scalar.signed.push(f.key); if (el.hasAttribute("inputmode")) scalar.signedPadded.push(f.key); return; }
    scalar.cells++;
    if (pad) scalar.padded++; else scalar.missing.push(f.key);
  });
  return { cells, padded, missing: Array.from(missing), stray: Array.from(stray),
           unresolved: Array.from(unresolved), scalar };
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
