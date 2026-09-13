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
    var api = {};
    ["select","eq","neq","in","order","limit","match","filter","gte","lte","is","or","range"]
      .forEach(function (m) { api[m] = function () { return api; }; });
    ["maybeSingle","single"].forEach(function (m) {
      api[m] = function () { single = true; return api; };
    });
    // A write from this page would be a bug in the page, not in the harness:
    // CLAUDE.md settled 2026-09-04 that design content is never stored in
    // Supabase. Throw loudly if one is ever attempted.
    ["insert","update","upsert","delete"].forEach(function (m) {
      api[m] = function () { throw new Error("harness: unexpected write to " + table); };
    });
    api.then = function (res, rej) {
      var d = table === "technicians" ? TECH
            : table === "technician_capabilities" ? CAPS
            : (DATA[table] || []);
      if (single && Array.isArray(d)) d = d.length ? d[0] : null;
      return Promise.resolve({ data: d, error: null }).then(res, rej);
    };
    return api;
  }
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
      };
    },
  };
  // openPage() sets this before navigation; a reviewer and a contractor get
  // different Status-step markup and both are worth sweeping.
  if (window.__HARNESS_CAN_REVIEW) TECH.can_review = true;
})();
<\/script>`;
}
