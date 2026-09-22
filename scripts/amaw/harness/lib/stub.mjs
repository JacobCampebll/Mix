/* The Supabase stand-in the harness boots designbook.html against.
 *
 * The page needs three things from Supabase before it will render a form: a
 * session, a `technicians` row, and a `technician_capabilities` row saying
 * can_access_designbook. After that it loads the five reference lists that
 * feed the dropdowns. None of that is what this harness is testing, and
 * CLAUDE.md is explicit that the tables are read-all reference data and the
 * anon key is not a secret — but a check suite that talks to the live project
 * would be measuring Andrew's network, so it talks to this instead.
 *
 * The rows below are SHAPED like the real ones and are not the real ones.
 * `aggregates` is padded past CONFIG.REFERENCE.SELECT_MAX (30) on purpose:
 * that is the line where a sourced field stops being a <select> and becomes
 * the combo popup, and the combo popup is the control the viewport sweep is
 * most likely to catch clipping in.
 */
export const LOGO_DIR = "/home/user/Mix/public/assets";

/* Real producer numbers, so a check that exercises resolveProducerCode() has
 * something to resolve. Names as KYTC files them — under the SITE, not the
 * owner (see the AGP011701 note in CLAUDE.md). */
const AGGREGATES = [
  ["AGP007401", "BOONESBORO QUARRY @ BOONESBORO", "crushed_stone"],
  ["AGP027501", "HAYDON MATERIALS, LLC - AIRPORT ROAD @ BARDSTOWN", "crushed_stone"],
  ["AGP004401", "HAYDON MATERIALS, LLC @ GREENSBURG", "crushed_stone"],
  ["AGP012102", "WATSON GRAVEL @ BOWLING GREEN", "sand_gravel"],
  ["AGP016501", "GADDIE SHAMROCK @ GLASGOW", "crushed_stone"],
  ["AGP011701", "THE ALLEN COMPANY @ CLOVER BOTTOM", "crushed_stone"],
];
// Padding to carry the list past SELECT_MAX. Deliberately long names: a short
// list would let a clipping bug through at 390px.
for (let i = 1; i <= 30; i++) {
  AGGREGATES.push([`AGP9${String(i).padStart(4, "0")}`,
                   `SAMPLE AGGREGATE PRODUCER NUMBER ${i} @ SITE ${i}`, "crushed_stone"]);
}

const AGGREGATE_TYPES = [
  ["Coarse RAP", "10400", null],
  ["Fine RAP", "10400", null],
  ["Intermediate RAP", "10400", null],
  ["Dol. #10's Washed", "10402", null],
  ["Dol. #11's Washed", "10404", null],
  ["Dolomite #78's", "10415", null],
  ["Dolomite #78's Class A", "10416", "A"],
  ["Dolomite #78's Class B", "10417", "B"],
  ["Limestone #8's", "10430", null],
  ["LS NSG Class B", "10441", "B"],
  ["Natural Sand", "10460", null],
  ["Granite Sand", "10465", null],
  ["Sandst. #78's Class A", "10470", "A"],
];

const BINDER_TERMINALS = [
  ["LAP001", "MARATHON @ CATLETTSBURG"],
  ["LAP002", "VALERO @ LOUISVILLE"],
  ["LAP003", "ERGON @ OWENSBORO"],
];
const BINDER_GRADES = [
  ["PG64-22", "31001"], ["PG70-22", "31002"], ["PG76-22", "31003"], ["CRS-2P", "31900"],
];
const PLANTS = [
  ["AMP070301", "BEREA"], ["AMP070302", "BOONESBORO"], ["AMP070401", "RICHMOND"],
];
const POLISH_SOURCES = [
  ["AGP027501", "HAYDON MATERIALS, LLC - AIRPORT ROAD @ BARDSTOWN", "dolomite", "A", "Bench B only"],
  ["AGP007401", "BOONESBORO QUARRY @ BOONESBORO", "limestone", "B", null],
];

const rows = (cols, data) => data.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));

const DATA = {
  aggregates: rows(["agp_number", "producer_name", "category"], AGGREGATES),
  aggregate_types: rows(["type_name", "mat_code", "polish_resistant_class"], AGGREGATE_TYPES),
  binder_terminals: rows(["lap_number", "terminal_name"], BINDER_TERMINALS),
  binder_grades: rows(["grade", "sitemanager_code"], BINDER_GRADES),
  plants: rows(["amp_number", "name"], PLANTS),
  polish_resistant_sources:
    rows(["agp_number", "producer_name", "lithology", "class", "restriction_note"], POLISH_SOURCES),
};

/* The <script> that replaces the supabase-js CDN bundle.
 *
 * Note the global is window.supabase and the page's own client is named `sb` —
 * CLAUDE.md's `supabase`/`sb` gotcha. Nothing here may declare a top-level
 * `const supabase`, for exactly the reason that note gives: the collision is a
 * SyntaxError at script-instantiation time and not one line of the page's
 * inline script would run, which reads as a hung page rather than an error.
 */
export function stubScript() {
  return `<script>
(function () {
  var DATA = ${JSON.stringify(DATA)};
  var TECH = { sm_id: "harness", first_name: "Harness", last_name: "Runner",
               company: "Allen", onboarded: true, can_review: false, user_id: "u1" };
  var CAPS = { can_access_plantbook: true, can_access_designbook: true };
  function builder(table) {
    var single = false;
    var api = { _eq: {} };
    ["select","neq","in","order","limit","match","filter","gte","lte","is","or","range"]
      .forEach(function (m) { api[m] = function () { return api; }; });
    api.eq = function (k, v) { api._eq[k] = v; return api; };
    ["maybeSingle","single"].forEach(function (m) {
      api[m] = function () { single = true; return api; };
    });
    // A write is a bug in the page UNLESS it is a PlantBook lot. CLAUDE.md
    // settled 2026-09-04 that DESIGN content is never stored in Supabase, and
    // that has not changed; 2026-09-22 settled that a LOT is, while it is
    // being produced. So the three amaw_* relations are modelled below and
    // everything else still throws loudly.
    ["insert","update","upsert","delete"].forEach(function (m) {
      api[m] = function (row) {
        if (!AMAW[table]) throw new Error("harness: unexpected write to " + table);
        return amawWrite(table, m, row, api._eq);
      };
    });
    api.then = function (res, rej) {
      var d = table === "technicians" ? TECH
            : table === "technician_capabilities" ? CAPS
            : AMAW[table] ? amawRead(table, api._eq)
            : (DATA[table] || []);
      if (single && Array.isArray(d)) d = d.length ? d[0] : null;
      return Promise.resolve({ data: d, error: null }).then(res, rej);
    };
    return api;
  }

  /* ---- the PlantBook lot store, in miniature -----------------------------
   * The FOUR server behaviours storage.mjs branches on, and no more - the
   * same four scripts/amaw/check_storage.mjs models, and the same four
   * supabase/amaw_lots.sql actually enforces. A fake that drifts from the
   * schema is worse than no fake, so this reproduces rules rather than
   * pretending to be Postgres.
   *
   * window.__HARNESS_OFFLINE flips the whole thing to "no signal", which is
   * the state a plant is in often enough to be worth a check of its own. */
  var AMAW = { amaw_lots: {}, amaw_lot_data: {}, amaw_lot_summaries: {} };
  function offline() { if (window.__HARNESS_OFFLINE) throw new Error("Failed to fetch"); }
  function amawRead(table, eq) {
    offline();
    var out;
    if (table === "amaw_lot_data") {
      out = Object.keys(AMAW.amaw_lot_data).map(function (k) { return AMAW.amaw_lot_data[k]; });
    } else {
      // The summaries view: the ledger row, left-joined to its data, so a
      // purged lot is listed with has_data false.
      out = Object.keys(AMAW.amaw_lots).map(function (k) {
        var l = AMAW.amaw_lots[k], d = AMAW.amaw_lot_data[k];
        var r = {}; for (var p in l) r[p] = l[p];
        r.has_data = !!d; r.revision = d ? d.revision : 0;
        r.saved_name = d ? d.saved_name : null;
        r.updated_at = (d && d.updated_at) || l.updated_at;
        return r;
      });
    }
    Object.keys(eq || {}).forEach(function (k) {
      out = out.filter(function (r) { return String(r[k]) === String(eq[k]); });
    });
    return out;
  }
  function amawWrite(table, op, row, eq) {
    var res = { data: null, error: null };
    try { offline(); } catch (e) { var pr = Promise.reject(e); pr.select = function () { return pr; };
                                   pr.single = function () { return pr; }; return pr; }
    if (op === "delete") {
      Object.keys(eq || {}).forEach(function (k) {
        Object.keys(AMAW.amaw_lots).forEach(function (id) {
          if (String(AMAW.amaw_lots[id][k]) === String(eq[k])) {
            delete AMAW.amaw_lots[id]; delete AMAW.amaw_lot_data[id];
          }
        });
      });
      res.data = [{ id: eq && eq.id }];
    } else if (table === "amaw_lots") {
      var prev = AMAW.amaw_lots[row.id];
      if (prev) {
        // amaw_lots_guard(): the identity is pinned and so is the chain.
        prev.line_item = row.line_item; prev.density_option = row.density_option;
        prev.mix_signature = row.mix_signature; prev.updated_at = new Date().toISOString();
      } else {
        var l = {}; for (var p in row) l[p] = row[p];
        l.status = "Open"; l.submitted_at = null; l.submitted_name = null;
        l.accepted_at = null; l.accepted_name = null;
        l.submittal_sha256 = null; l.prev_sha256 = null;
        l.purge_after = null; l.purged_at = null;
        l.plant_name = null; l.updated_at = new Date().toISOString();
        AMAW.amaw_lots[row.id] = l;
      }
      res.data = { id: row.id };
    } else {
      var lot = AMAW.amaw_lots[row.lot_id];
      // "amaw_lot_data: update for open visible lots".
      if (lot && lot.status !== "Open") {
        res.error = { code: "42501", message: "new row violates row-level security policy" };
      } else {
        var d0 = AMAW.amaw_lot_data[row.lot_id];
        if (d0 && row.revision != null && Number(row.revision) !== d0.revision) {
          // amaw_lot_data_guard(): raise exception 'stale revision: ...'
          res.error = { code: "40001", message: "stale revision" };
        } else {
          var rev = d0 ? d0.revision + 1 : 0, d = {};
          for (var q in row) d[q] = row[q];
          d.revision = rev; d.updated_at = new Date().toISOString();
          AMAW.amaw_lot_data[row.lot_id] = d;
          res.data = { revision: rev, updated_at: d.updated_at };
        }
      }
    }
    var out = Promise.resolve(res);
    out.select = function () { return out; };
    out.single = function () { return out; };
    return out;
  }
  window.__HARNESS_AMAW = AMAW;
  window.supabase = {
    createClient: function () {
      return {
        from: builder,
        auth: {
          getSession: function () {
            return Promise.resolve({ data: { session: { user: { id: "u1", email: "h@x.z" },
                                                        access_token: "t" } } });
          },
          signOut: function () { return Promise.resolve({}); },
          onAuthStateChange: function () {
            return { data: { subscription: { unsubscribe: function () {} } } };
          },
        },
        functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } },
        // amaw_seal_lot(): the one-way door. Refuses exactly what the real
        // function refuses, because the client branches on those messages.
        rpc: function (fn, args) {
          try { offline(); } catch (e) { return Promise.reject(e); }
          if (fn !== "amaw_seal_lot") return Promise.resolve({ data: null, error: { message: "no such function" } });
          var lot = AMAW.amaw_lots[args.p_lot_id];
          if (!lot) return Promise.resolve({ data: null, error: { code: "P0002", message: "no such lot" } });
          if (args.p_status === "Submitted") {
            if (lot.status !== "Open") {
              return Promise.resolve({ data: null, error: { message:
                "lot " + lot.lot_number + " is already " + lot.status +
                ", and a lot is never reopened once submitted" } });
            }
            if (!args.p_sha256) {
              return Promise.resolve({ data: null, error: { message: "a submitted lot needs the submittal hash" } });
            }
            lot.status = "Submitted";
            lot.submitted_at = new Date().toISOString();
            lot.submitted_name = TECH.first_name + " " + TECH.last_name;
            lot.submittal_sha256 = args.p_sha256;
            lot.prev_sha256 = lot.prev_sha256 || args.p_prev || null;
            lot.purge_after = new Date(Date.now() + 7 * 864e5).toISOString();
          } else if (args.p_status === "Accepted") {
            if (!TECH.can_review) return Promise.resolve({ data: null, error: { message: "only KYTC accepts a lot" } });
            if (lot.status !== "Submitted") return Promise.resolve({ data: null, error: { message: "only a submitted lot can be accepted" } });
            lot.status = "Accepted";
          }
          return Promise.resolve({ data: lot, error: null });
        },
      };
    },
  };
  // openPage() sets this before navigation; a reviewer and a contractor get
  // different Status-step markup and both are worth sweeping.
  if (window.__HARNESS_CAN_REVIEW) TECH.can_review = true;
})();
<\/script>`;
}
