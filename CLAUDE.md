# Mix — project conventions

Purpose: a shared web app replacing KYTC's MixPack and AMAW workbooks, now known
as **DesignBook** and **PlantBook** respectively. A joint effort between KYTC and
contractors.

**What it is for - a submission pipeline, not a mix database.** A contractor
technician submits a mix design; KYTC Central Office reviews it and approves
it; an approved design yields a **one-page approval PDF** the contractor can
download; the approved data is sent on to **SiteManager / AASHTOWare Project**
so the state sees it (that is why the reference tables carry SiteManager
codes). The `designs` table is the submission record and its audit trail, not
a reference library, and the Portal is the place to submit and to see where a
submission stands - do not design it as a browse-and-search catalogue.

**Whose app this is - KYTC's, for the whole state** (Jake, 2026-09-15: "quit
thinking about the allen company and our apps for this site, its kytc and the
entire states app"). Every asphalt producer in Kentucky: 376 technicians, 130
plants, twelve districts, many companies. So **a feature only one contractor
can use is a feature KYTC cannot ship**, however much work it saves that one.

The worked example, proposed and rejected the same day: importing plant
tickets from **ILS** - The Allen Company's own ticketing system - to fill a
lot's tonnage. It would have removed typing for one producer and for nobody
else. The general rule it came from is the part worth keeping: **a data
source has to be one every contractor already has**, which in practice means
KYTC's own - the proposals, pay estimates and contract items that
`kytc-lookup` / `kytc-items` / `kytc-notes` already read.

The architecture mostly enforces this already, and that is the argument for
keeping it. Plants, producers, terminals and grades all resolve from
Supabase, so no contractor's name appears in a served page at all - checked
2026-09-15, zero matches for allen / boonesboro / berea anywhere under
`public/`. Same rule as everywhere else in this file: a row added to a table
reaches every page, a value added to a `CONFIG` reaches one page and is
usually one shop's.

**The one place it leaked: `CONFIG.MIXPACK.DISTRICTS` holds district 07 and
nothing else** - which is the district Allen's plants are in. A reviewer in
any of the other eleven generates a MixPack with no lab unit and no sample
id. It `need()`s, so the gap is stated rather than silent, but the workbook
is incomplete. The template appears to carry the whole list at
`Chart Data`!AV2:AV14 (`LU00642`, then `LU01210` ... `LU12210`), untrusted so
far because it disagrees with the one real data point - see the P/S lab id
note further down for why those may be two different questions. **Open for
Andrew**: the lab unit and sample-lab code for districts 01-12.

**And the one worth acting on: every file this app has ever been checked
against is one shop's.** Two real AMAWs, both Boonesboro, both contract
252112, both `CL3 ASPH SURF 0.38A PG64-22`; one approved MixPack, #467PA; one
contract behind the proposal and pay-estimate lookups. Every gotcha recorded
in this file came from a real file disagreeing with an assumption - so for a
state-wide app, **breadth of real files is worth more than any feature**.
What is missing, in rough order of value: a completed AMAW from another
district or producer; a lot carrying a QA or IQ sample (neither real lot has
one, so `Super Verify` has never been checked against a cached answer, only
against the template's own formulas); an approved design for something other
than a 0.38 surface; and anything at all for a **specialty mixture**
(402.05.01 - OGFC, ATDB, pavement wedge, leveling and wedging, scratch
course), which PlantBook does not model and refuses to pay rather than paying
a silent 0%.

Live at **https://kytcmix.netlify.app** (Netlify project `kytcmix`). Pages are
served from `public/`; `/` redirects to `login.html`.

**One branch: `claude/mix-conventions-setup-w3dq6s`.** It is both the repo
default and Netlify's production branch - checked against the live deploy
record 2026-09-03 (context `production`, alias `kytcmix.netlify.app`, built
from that ref). `main` was a second, hand-synced copy and is being retired:
merging into it published nothing, which cost us a confused hour on 2026-09-03.
Do not merge into `main`, do not recreate it. If it is still listed, delete it
(it holds nothing unique; it last pointed at `e94e965`). The eventual tidy-up
is a GitHub branch *rename* of this branch to `main` - that moves the default,
retargets open PRs, and Netlify follows a renamed production branch - done when
no session is mid-task, since both sessions push to this branch by name.

**One temporary exception: `claude/jake-sandbox` (Jake's, added 2026-09-05).**
A scratch branch to try things on without touching what is currently built.
Forked from `9c27043`, exactly what production was serving that day. It has
its own Netlify branch deploy at
`https://claude-jake-sandbox--kytcmix.netlify.app`; `kytcmix.netlify.app`
keeps building from `claude/mix-conventions-setup-w3dq6s` and does not move
whatever lands on the sandbox. **Do not merge it, and do not build on it** -
it is expected to be deleted, not integrated, and anything from it that
turns out to be worth keeping comes back as its own reviewed change.

**Nothing crosses from the sandbox to the live site without Andrew and Tate
first** (Jake, 2026-09-07). Not a code-review gate - a people gate. The
sandbox has changed how submitting and approving work, and KYTC Central
Office are the ones who receive those submissions, so they get a say before
contractors see any of it. Ask, then port.

**And when something does cross, the Netlify environment variables are the
pre-flight.** They are set per *site*, not per branch, so a merge does not
carry them and the functions fail closed with "not configured yet" - a flow
that clicks through and dead-ends rather than an error anyone would notice
in a diff. Checked 2026-09-07 by calling the deployed functions:

| Variable | Used by | State |
|---|---|---|
| `APPROVAL_SIGNING_SECRET` | sign, verify | **unset** - confirmed |
| `RESEND_API_KEY` | send | **unset** - confirmed |
| `KYTC_SUBMIT_TO` | send | **unset** - confirmed. `Andrew.Denmark@ky.gov,Tate.Salle@ky.gov` |
| `SUBMIT_FROM` | send | **unset** - confirmed |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | all functions | unknown - the two functions that would prove it short-circuit on the vars above first, so check in the Netlify UI |

`netlify/functions/` exists only on the sandbox today - production returns
404 for all three, so none of this is live anywhere yet.
`APPROVAL_SIGNING_SECRET` is the one that bites twice: changing it later
invalidates every approval already issued, so set it once and keep it.

Note what a branch does **not** isolate: **Supabase is shared.** Same
project, same tables, same rows. Jake has confirmed the sandbox will not
change the database - reads only, no DDL, no RLS edits - so the live schema
Andrew depends on stays put. If sandbox work ever does need schema changes,
it needs its own Supabase project first, not a shared one with extra tables.

Collaborators: **Jacob** and **Andrew**, working from separate Claude accounts
against this shared repo. Neither can see the other's chats — this file is the
shared context. If you learn something durable about the project, add it here
rather than leaving it in a conversation.

## Ground rules for Claude Code

- Read this file and the existing code before proposing changes.
- Deliver full, runnable files. Do not hand back patch fragments or
  "add this near line 40" snippets.
- One concern per commit. Small commits, clear messages.
- Never commit secrets. API keys live in Netlify environment variables and are
  read server-side only. If a key is needed client-side, that is a design
  error — proxy it instead.
- Do not rewrite git history or force-push. Two people work here.
- If a change touches a file the other person is likely editing, say so in the
  commit message.

## Architecture conventions

- **Self-contained pages, no build step.** Each page is one `.html` file with
  its markup, CSS, and JS inline. No bundler, no framework unless there is a
  specific reason. The app is several such pages on one Netlify site —
  `login.html`, `portal.html`, `designbook.html` — not one single file.
- **DesignBook and PlantBook are two views of one page**, not two pages. They
  belong in `designbook.html`, sharing its schema renderer, CONFIG and styling.
  See "Working in one file" below, which applies within any page you share.
- **CONFIG block at the top.** Every page opens with a single `CONFIG` object
  holding all tunable values — endpoints, thresholds, spec limits, plant lists,
  feature flags. No magic numbers buried in functions.
- **Some CONFIG values are duplicated across pages on purpose.**
  `SUPABASE_URL`, `SUPABASE_ANON_KEY` and the theme tokens appear in every
  page, because self-contained means no shared import. If the Supabase project
  moves or the palette changes, every page needs the edit — grep, do not
  assume one file covers it.
- **Netlify static hosting.** Each `.html` file deploys as-is. **Served pages
  live in `public/`, which is the Netlify publish directory** — only what is
  in there is reachable on the web. `docs/`, `supabase/` and `scripts/` stay
  out of it deliberately; they are repo content, not site content. A new page
  goes in `public/` or it will not be served.
- **Netlify Functions as API-key proxies.** Any third-party API call goes
  through a function in `netlify/functions/`. The browser never sees a key.
- **Client-side JSON knowledge bases.** Reference data ships as a JSON file
  loaded at runtime, with BM25 retrieval when search is needed.
- **No localStorage in artifacts.** In-memory state only for anything that will
  run inside Claude. Standalone Netlify apps may use localStorage.

## Working in one file

Both collaborators edit the same `.html`. That is a merge-conflict machine
unless we are deliberate about it:

- **Own your view.** Each view's markup, CSS, and JS stays in one contiguous
  block, fenced by a banner comment. Stay out of the other view's block.

  ```html
  <!-- ===== DESIGNBOOK ===== -->
  ...
  <!-- ===== END DESIGNBOOK ===== -->
  ```

- **Shared ground gets its own commit.** CONFIG, utility functions, and global
  styles belong to both of us. Change them in a small, separate commit so the
  other person can pull past it cleanly.
- **Pull before you start. Push as soon as it works.** Long-running local edits
  are what become conflicts. Small and often beats big and clean.
- **Say what you reached into.** If a commit touches anything outside your own
  view, put that in the commit message.

## Python conventions

- `openpyxl` for Excel read/write.
- `pdfplumber` for PDF parsing.
- `reportlab` for PDF generation.
- Anchor spreadsheet reads on **labels, not fixed cell addresses**. Find the
  label cell, then offset. KYTC workbooks move between revisions.
- Scripts are standalone and runnable with explicit paths, no notebook-only
  code.

## Domain notes

<!-- FILL IN as the project develops. -->

### DesignBook
Formerly the **MixPack** workbook.

### PlantBook
Formerly the **AMAW** workbook.

### Specifications and tolerances
TBD — cite the governing spec section when encoding a limit in code.

### Gotchas found the hard way
- (Log real bugs here so the other person does not rediscover them.)
- Supabase's **anon/public key** is not a secret like a normal API key — it is
  meant to ship in client-side JS (Supabase's own docs do this). Access
  control comes from Row Level Security (RLS) policies on your tables, not
  from hiding this key. So it's fine to put it directly in a `CONFIG` block
  in a single-file app; it does NOT need a Netlify Function proxy. The
  **service_role key** is the real secret — that one must never leave a
  Netlify Function/env var, ever.

  **RLS must be enabled on every table before the anon key ships — no
  exceptions.** The anon key is only safe *because* RLS is on. With RLS off,
  that key hands anyone who views source full read/write access to the whole
  database. Enabling RLS with no policy denies everything by default, which
  is the safe starting point: turn it on first, then add policies.

- **Never name a top-level `const` `supabase` on a page that loads the
  supabase-js CDN bundle.** The UMD bundle declares its global as
  `var supabase`. A script-top-level `const supabase = window.supabase
  .createClient(...)` collides with that var binding, and the collision is
  a **`SyntaxError: Identifier 'supabase' has already been declared`**
  raised at script-instantiation time — so *not one line* of that inline
  script ever runs. There is no console-visible failure inside your code,
  no half-executed state: the page just sits on its static markup forever.
  It cost real time because the symptom ("stuck on Loading…") looks like a
  hung `await` or an RLS problem, and the page's own error handling can
  never fire. `login.html` was immune only by accident — its
  `const supabase` sits inside an `else { }` block, so it is block-scoped.
  `portal.html` and `designbook.html` had it at top level and were both
  completely dead. The client is now named `sb` in both, with a comment
  saying why. Diagnose this class of bug by checking whether *static*
  markup the script should have rewritten is still showing.

- **SheetJS misfiles every worksheet that comes after a chartsheet.** KYTC
  MixPacks carry two `0.45 Power Chart` *chartsheets*. SheetJS 0.18.5 drops
  them but keeps their names in `SheetNames`, so each later worksheet is
  filed under the name two slots earlier — `wb.Sheets["TSR"]` is really
  KYCT Data, `["Chart Data"]` is really the 15-cell `discipline` tab, and
  `Chart Data!W14`/`AO2` read as `undefined`. This is why the first legacy
  importer found garbage. **Never trust a sheet name from SheetJS on these
  files; resolve by content fingerprint** (`CONFIG.LEGACY.FINGERPRINTS` in
  `designbook.html`). Sheets before the chartsheets are unaffected.

- **A 12.1 MixPack that came through the migrator has no cached values for
  its formula cells.** 12.1 turned the Design Value column (`O56–O75`),
  aggregate MAT. CODE and the row-49 averages into formulas; the migrator
  skips formula cells, so SheetJS reads them blank (`<f>` present, `<v/>`
  empty). A natively-saved 12.1 file has them. The import log reports
  this as `not-cached` with the remedy (open and save in Excel), which is
  a different problem from "not entered" — do not merge the two.

- **The legacy MixPack importer is fixed-cell and versioned on purpose** —
  a deliberate exception to "anchor on labels, not cell addresses". That
  rule is for Python scripts reading assorted KYTC workbooks. For the
  MixPack specifically, Design Data's layout is identical in Ver 11.x and
  12.1, only Recycle Data moved, and every address was verified against a
  real workbook of each version (`docs/legacy-mixpack-map.md`). A label
  hunt was tried first and was wrong. Add a new field's source to
  `CONFIG.LEGACY.CELLS` per version; anything a MixPack holds that the form
  has no field for goes in `UNMAPPED` so it is reported, never dropped.

- **An UPDATE (or DELETE) policy alone cannot "claim" a row for a user who
  doesn't own it yet — this silently updates 0 rows, always, and looks like
  it's just not working.** Postgres requires a row to pass the table's
  SELECT policy before an UPDATE can even see it to modify it. If your SELECT
  policy is `user_id = auth.uid()`, an unclaimed row (`user_id is null`) can
  never pass that check — `null = auth.uid()` is never true — so a
  first-claim-wins UPDATE policy like `using (user_id is null) with check
  (user_id = auth.uid())` never actually fires. No error, no exception, just
  an update that silently touches 0 rows every single time. Found this by
  testing the claim flow with a rolled-back transaction against the real
  schema before ever pointing a real user at it — the fix is a
  `SECURITY DEFINER` function (bypasses RLS internally, so it can see and
  update the unclaimed row) instead of loosening the SELECT policy (which
  would expose the whole unclaimed roster to any authenticated user). See
  `claim_technician()` in `supabase/schema.sql` for the working pattern —
  and note it still needs `revoke execute ... from anon` explicitly, since a
  newly created function is otherwise callable by `anon` too (Supabase's
  database linter / `get_advisors` catches this — run it after any DDL
  change, not just once).

- **Hand-inserting rows into `auth.users` looks fine and isn't.** A raw
  `INSERT` that passes every RLS check, has a correctly-verifying bcrypt
  password (`encrypted_password = crypt('password', encrypted_password)`
  returns true), and reads back with all the right values can still fail
  real sign-in with a generic, misleading error — because none of that
  exercises Supabase Auth's actual `/token` endpoint, only the row's shape.
  Two real GoTrue requirements a hand-built row will get wrong by default:
  `instance_id` must be the zero UUID (`00000000-...-000000000000`), not
  `null` — a null row is invisible to GoTrue's lookup, and the failure
  surfaces as ordinary `invalid_credentials`, indistinguishable from a
  wrong password. And `confirmation_token`, `recovery_token`,
  `email_change_token_new`, `email_change`, `email_change_token_current`,
  `phone_change`, `phone_change_token`, and `reauthentication_token` must
  all be `''` (empty string), not `null` — GoTrue's Go code scans these
  into plain strings, and a null crashes that scan with a 500 ("converting
  NULL to string is unsupported"), which only shows up *after* the
  instance_id issue is fixed and the row is actually found. Both were only
  caught by testing a real sign-in through a real deployed page — a SQL-only
  check of the row, however thorough, cannot catch either one. Both are
  already fixed in `supabase/bootstrap_technicians.sql`; if you ever
  hand-build a user row again instead of running that script, budget time
  to re-discover both.

- **The onboarding email-confirmation link redirects to Supabase's "Site
  URL" setting, not to wherever the technician actually is.** Left at the
  default (`localhost`), every confirmation click leads to a real "this
  site can't be reached" error on a real device — even though the
  confirmation itself already succeeded server-side before the broken
  redirect happens. Site URL (and Redirect URLs) must be updated every
  time the deployed URL changes, not just set once.

- **Sign-in identifier changes after onboarding, on purpose — decided,
  not a bug.** A technician signs in with their SM ID before onboarding,
  and their real email after (the SM ID stops resolving to anything the
  moment their real email is confirmed, since that's when the account's
  actual Supabase Auth email changes). We considered making SM ID work
  permanently post-onboarding too and deliberately chose not to — the
  hint text on the sign-in form covers it instead. Don't "fix" this
  without checking this note first.

- **A MAT code does not identify an aggregate type, so a legacy MixPack's
  MAT. CODE column cannot be reverse-resolved to a `type_name` on its own.**
  Checked on the live `aggregate_types` table 2026-09-03: 115 type names,
  every one with a `mat_code`, but only 42 distinct codes — 30 of them are
  shared, and the busiest (`10400`, `10415`) each cover eight type names
  (washed/unwashed and size variants of the same material). Forward is
  fine: pick a `type_name`, read its `mat_code`. Backward (code in a
  workbook cell -> type name) is ambiguous most of the time, so an importer
  must carry the code as an unmapped/provisional value and let the human
  pick the type — never pick the first match.

- **Every string that reaches `innerHTML` goes through `esc()`, including
  values read back from our own tables.** A saved design's `values` are
  rendered for whoever opens it next, and reviewers open every design from
  the Portal queue - so an unescaped `value="${v}"` in the sieve inputs was
  a cross-user stored XSS, not a self-XSS. Found by an adversarial review
  2026-09-03; the sieve and audit sinks were the only unescaped ones. Data
  from Supabase is not "ours" once it has been through another user's
  browser: escape it like any other input.

- **An UPDATE that RLS filters out surfaces as `PGRST116` ("JSON object
  requested, multiple (or no) rows returned"), not as a permission
  error.** Postgres updates 0 rows, `.single()` then complains about the
  count. A same-plant technician who can read a design but is neither its
  author nor a reviewer used to hit this on Save and lose their edits. Pages
  mirror the UPDATE policy in the UI (read-only form) so the message is
  never the first thing a person learns about their permissions.
- **A DesignBook layout change breaks the legacy importer unless
  `CONFIG.LEGACY` moves with it.** The restructure (PR #3, 2026-09-03: Four
  Points, Contract Information, Aggregate Structure, computed Design Values,
  split TSR / Performance Testing) renamed sections and changed sieve labels,
  which silently pointed `CONFIG.LEGACY.CELLS` at field keys that no longer
  existed - the Portal's "Upload the MixPack" path kept working but prefilled
  the wrong places. Re-aligned in PR #4 the same day. The importer is keyed on
  the schema, so treat the two as one change: rename a field key and you owe
  `CONFIG.LEGACY` an edit in the same commit.
  Contract Information's KYTC contract lookup landed 2026-09-11 (Jacob): the
  Portal's record now carries the proposal header, so a design started there
  arrives with county and funding filled, and a **Look up contract** button in
  the section head calls the same `kytc-lookup` function for everything else
  (`CONFIG.CONTRACT_LOOKUP`). It fills only blanks, tinted with the source. It
  picks the mix for tonnage and line items by the Portal's choice, else the
  designation already on the form, else the only mix; otherwise it names them.
  Two things the proposal cannot supply, so they stay typed: the **binder
  supplier** (the contractor's choice, not KYTC's) and the **project number** -
  a contract has one PCN per route, on the proposal's Project(s) page (262120
  has two; #467PA used the KY 627 one), and the function does not parse that
  page yet. Parsing it is the next step for that function, Andrew's deploy.
  **AADTT Class was on that "cannot supply" list and shouldn't have been -
  fixed 2026-09-11 (Andrew).** A mix's signature ("CL3 ASPH SURF 0.38A
  PG64-22") always starts with its Class - confirmed with Andrew, it's the
  same Class `CONFIG.CONSENSUS_CRITERIA` is keyed on, and only 2/3/4 occur -
  and `parseSignature()` was already pulling it into `mix_class` for every
  mix, it just wasn't wired to the `aadtt_class` field. `CONFIG.MIX_PREFILL`
  now includes it, same tinted/editable path as every other prefilled field.
  Worth flagging as a class of bug for both of us: a value already sitting
  parsed in `state.mix` (or anywhere else) is easy to leave unwired to its
  field, and it fails silent - the form just keeps asking a human to type
  something the page already knows, and nothing marks that as wrong. What
  the proposal genuinely still can't supply is narrower than it first
  looked: binder supplier, depth, and the project number - AADTT class is
  available per-mix (off the signature), just not off the bare header, which
  has no single mix to read a Class from.
  The target gradation band (Andrew's) landed 2026-09-04 - see the two entries
  below.

- **A completed MixPack *can* carry the 4-point gyratory trial sweep after
  all — `CONFIG.LEGACY.FOURPOINT: null` was a wrong assumption, corrected
  2026-09-04 against a real approved Ver 11.3 file
  (`CL3 0.38A 64-22 Haydon NEW.xlsm`).** It's neither on the Graphs tab nor
  in any chart (both prior guesses) - it's a plain input table, `Design
  Data!A30:P43`, that the Graphs-tab charts and the sheet's own `GRAPH DATA`
  block both read from. The four "Average" rows (34/37/40/43) are the four
  design points. **KYTC's MixPack calls Gmb "BSG"** (column `G`, header
  `BSG` at row 30) - pull it directly as Gmb, do not derive it from the
  adjacent `Unit Wt. @ Ndes (pcf)` column (`H = G × 62.4`, a display-only
  dead end). Full cell map and the cross-check math in
  `docs/legacy-mixpack-map.md`. **12.1 confirmed 2026-09-04** against a
  second real file (`#492PA.xlsm`) - identical headers and row numbers,
  cross-checked the same way. Both versions now trusted equally.

- **Four Points silently never restored on a reopened design — a rendering
  gap unrelated to RLS or the database, found while wiring the legacy
  importer above.** Every other section (`gridHTML`, `rowsHTML`,
  `sievesHTML`) seeds its initial DOM value from `state.extracted`;
  `fourpointHTML()` alone always rendered `CONFIG.SECTIONS`' static default
  seed instead, regardless of what a legacy import or a previously **saved**
  design actually held. The data was never lost - it was sitting safely in
  the `values.fourpoint` JSONB column the whole time, saved correctly by
  `collectForm()` - it just never made it back onto the screen on reopen.
  Fixed by `resolveFourpointPoints()`/`resolveFourpointConstants()`, which
  read that same saved shape (and a fresh import's `tables.fourpoint`) before
  falling back to the CONFIG default. Worth remembering as a class of bug:
  a section with its own bespoke render function is easy to leave off the
  "read from state" convention the rest of the page follows, and nothing
  errors when that happens - the page just quietly shows the wrong static
  values, same family as the `supabase`/`sb` naming gotcha above in spirit
  (silent, no console error, looks like a data problem instead of a code one).

- **The shaded target band is gold and translucent** (`--band-fill` /
  `--band-edge`, 2026-09-11): green was a third hue on a page built from
  navy, sky and gold. `CONFIG.HANDOFF.BRAND.bandEdge` and `CHART.bandOpacity`
  carry the same pair into the review sheet - one fact, one colour, the same
  rule that makes `effectiveMix()` and `trimFlatCoarseEnd()` shared.

- **Gradation control points (the shaded target band on the 0.45 power
  chart) are a `CONFIG` constant, not a Supabase table — deliberately, on
  the same footing as the sieve mm list and the R35 Pb tolerance already in
  `CONFIG`, unlike the aggregates/binder-grades tables.** The dividing line
  used to decide: **how often does the source document change, not whether
  the values vary by some key.** Aggregates/binder terminals/grades grow
  routinely (new producer certified, terminal added) independent of any
  spec revision, so they're Supabase, correctable without a deploy.
  Gradation control points (`CONFIG.GRADATION_CONTROL_POINTS`, cited
  **AASHTO M323 Table 4**) only change if that AASHTO table itself is
  revised - rare, and would likely come bundled with other spec-driven code
  changes anyway - so it ships in `designbook.html` like the other spec
  constants. Varying by NMAS is just shape (a small object keyed by NMAS),
  not by itself a reason to reach for a database. `state.mix.nominal_size`
  (e.g. `"0.38A"`) maps to a key by stripping the trailing letter -
  confirmed with Andrew 2026-09-04 that the letter is unrelated to NMAS or
  gradation control points, so don't try to derive meaning from it here.

- **A `@media` block does not beat a later rule of the same specificity — a
  media query is not a tiebreaker, it only gates when the block applies.**
  `designbook.html` put `@media (max-width:1080px){ .nav,.valpanel{position:
  static;} }` up beside `.layout`, above the `.nav` and `.valpanel` rules that
  set `position:sticky`. All three are one class, so the tie went to source
  order and the later `sticky` won at *every* width. The override was dead
  code that read as working, and the symptom appeared far from the cause: on a
  phone the layout correctly collapsed to one column (that half of the same
  media query *is* below `.layout`, so it worked), the rails then stayed
  pinned under the header, and because `.nav` has no background the section
  list ghosted through the form as you scrolled. Reported off a phone
  2026-09-07, and it had hit tablets too — anything at or below 1080px.
  **Put a responsive override directly below the rule it overrides**, which is
  what the other five media queries in that file already do; that adjacency is
  the convention, not decoration. Worth checking with
  `getComputedStyle(el).position` at a phone viewport rather than by eye,
  since a dead override looks identical to a live one in the source.
  **The one-column breakpoint is 1240px since 2026-09-11**, up from 1080: the
  two rails plus gaps take 450px, so at 1100-1200px three columns left the form
  510-630px and the aggregate MAT code, Gsb and type cells and the TSR loads
  clipped (measured by `scrollWidth > clientWidth`, zero clipped after). It is
  the same step the row tables take (`--w2`), so there is one "medium" line,
  and in one-column mode the section rail runs as a wrapping chip row rather
  than a 400px column above the form.
  **Below 700px the header is the other half of that problem, fixed the same
  day.** DesignBook's sticky header measured **375px on a 390px screen** - 44%
  of it, on every scroll - and the first form field sat 674px down, so the page
  opened on a header and a section list rather than on the design. The Portal's
  bar was 204px, its right-aligned `.who` block going ragged once it wrapped to
  its own line. Now 116px and 97px. Two things did it, both worth reusing: the
  three job chips become **one line** of contract / date / plant with the plant
  ellipsised (its full name goes in the span's `title`, and it is on the Portal
  a step earlier); and `order` on the flex children re-groups the header rows
  without touching the DOM, which is how the status pill gets up beside the book
  switch with the mix id between them in source. The layout's side padding also
  drops 32px to 16px, the floor a phone needs, which is 32px straight back to
  the form - and that alone packs the section chips from six rows into five.
  **The section rail stays a wrapping chip row on a phone, deliberately.** It
  was tried as one horizontally scrolling line and Jake turned that down the
  same day, rightly: below 1240px the rail is not sticky, so you scroll past
  its 212px once and never meet it again, and a wrapped row shows all ten
  sections at once where a scrolling one hides six behind a swipe. Vertical
  space is only worth buying where the element is sticky - the header was, this
  is not.
  Measure this with `getBoundingClientRect().height` at a real phone viewport
  rather than by eye, and re-check 1500/1366/1240/1000/800/701 afterwards to
  prove nothing above the breakpoint moved.
  **The section tag is desktop-only below 700px, from the same round.** It is
  the grey chip under each section title saying where that data comes from
  (`tag` in `CONFIG.SECTIONS`) - reading room beside a wide head, but a wrapped
  two-line paragraph above every section on a phone, where the person is there
  to fill the form rather than read about it. The strings stay in CONFIG, so
  this is one `display:none` and reversible. The spec citations in the same
  `.headmeta` stay on a phone: they are the link to the spec itself, not a
  description. Hiding the tag also removed the 383px of nowrap text that was
  this page's only source of sideways scroll at 390px.
  **The citation chips hold one line on a phone too**, which took measuring
  rather than guessing: at 360px the head gives them 278px, and Contract
  Information's two citations plus the lookup button needed 343 while Design
  Values' two 20-character citations needed 291, so both wrapped to a second
  row. 9px type with 5px side padding, and the button dropping the word
  "contract" below 700px (a `.wide-only` span, not a second label), brings the
  worst case to 262. Vertical padding went UP to 3px so the tap target did not
  shrink with the text. `flex-wrap` and `white-space:normal` stay as the
  fallback, so a longer citation in a future spec edition wraps rather than
  pushing the page sideways. Count the rows by the container's height over one
  chip's height - comparing each chip's `top` reports a phantom second row,
  since a button and an anchor sit on the same line a pixel apart.


- **DesignBook is two shapes as of 2026-09-11, and the breakpoint is 700px.**
  Above it, a ten-step wizard, one step on screen at a time. Below it, the
  page it has always been: every section on one vertical scroll under its own
  navy band. Jake's call, and the reasoning is worth keeping - one step per
  screen reads well on a wide window and badly on a phone, where a person is
  already scrolling and a fixed bar plus a step counter are chrome in place of
  the thing they came for.
  **The two share every renderer, every computation and the same `#valBlock`
  node.** Exactly two things differ now, and if a third ever appears that is
  the smell: whether the sections hide each other (`.step{display:block}`
  below 700px), and whether a rail click switches or scrolls.
  **`#valBlock` does not move at all** (corrected 2026-09-11, Jake: "put it
  back on the right like we used to"). It lives in `#valPark` and the
  stylesheet decides where that is - a sticky right-hand column beside the
  form above 1100px, above the sections below it. It lists the WHOLE design
  in both shapes, and clicking an item goes to the step it is on, which is
  the point: a per-step slice hides the other eight sections' gaps behind a
  click. The earlier build moved the node into the active step's `.stepval`
  and partitioned the list per step; both are gone, and so is `.stepval`.
  Note `.layout` places `main` and `.valpark` EXPLICITLY above 1100px,
  because the rail is before `<main>` in the document - it has to be, so one
  column stacks it above the form and a screen reader meets it in that order,
  and auto-flow would otherwise put it in column one.
  Both rails of the old three-column layout are gone in both shapes. The steps
  **are** `CONFIG.SECTIONS`, in order, derived - the count is never written
  down, which is what makes "adding a section adds a step" true, and each
  section now carries a short `step` name for the rail beside its long
  `label`. `state.step` is the index into `CONFIG.SECTIONS`, not the visible
  position: a hidden section (Polish on a Type D mix) is skipped by Next/Back
  and left out of both numerals, so that mix reads "Step 5 of 9".
  **Every number a person sees is a VISIBLE position, and it is painted in one
  place** - `paintStepChrome()`, called from the END of `recompute()` rather
  than from `go()`. Both halves of that matter and both were got wrong first
  time: numbering the rail's dots from the `CONFIG.SECTIONS` index gave a rail
  reading 1,2,3,4,6,7 beside a bar reading "Step 5 of 9" on every Type D mix
  *and* on every design before Nominal size is typed (no size -> no letter ->
  Polish hidden), which is the default; and painting from inside `go()` read
  the counts before `applyPolishVisibility()` had run, since `recompute()` is
  its only caller, so the first paint always said "of 10" beside nine chips.
  **A section can draw inside another one: `into: "<hostId>"` in
  `CONFIG.SECTIONS`** (Consensus Properties inside Aggregate Structure, Jake
  2026-09-11 - they are measured on the combined blend, so they belong under
  the blend that produces them). It stays a full schema entry, which is what
  keeps its citation, its `CONFIG.LEGACY` cells, `computeConsensus()`'s
  per-mix limits and the review sheet's bespoke `RENDER.consensus` all working
  untouched: only where it draws changed. **A section with `into` is not a
  step** - `topSections()` is what the rail, the numerals and `state.step`
  count, and `hostSectionId()` resolves a warning or a `jumpTo()` onto the
  step it is reached on. It renders through `sectionBodyHTML()`, the same
  function a top-level section uses, so a sub-block never needs a second set
  of rules. DesignBook is nine steps now, eight when Polish does not apply.
  Four things about the rebuild are worth carrying forward.
  **`recompute()` is still the single producer of `outstanding`** - all that
  changed is which slice renders. Resist a second list-builder for the step
  view; the moment there are two, one of them is wrong.
  **`#valBlock` is ONE node that `go()` moves into the active step's
  `.stepval`, and `renderForm()` parks it in `#valPark` before rewriting
  `#sections`** - without that park it is destroyed with the sections and
  every later `msg($("saveMsg"), ...)` writes to nothing. The alternative
  considered and rejected was moving `#advanceStage` into the action bar the
  same way: `statusHTML()` re-creates it on every `renderForm()`, so the
  moved node and the new one would both answer to `getElementById`. The
  submit button stays in the Status step's body and the bar's Next simply
  disables there.
  **`#saveMsg` is in that block and NOT in the action bar**, deliberately: its
  content is not a status word. The legacy importer writes its whole
  found / not-cached / mismatch summary there, and so does the MixPack
  generator's list of what the design lacks - a 44px fixed bar clips exactly
  the message you cannot afford to lose.
  **Anything the old page inferred from scroll position is now a fact.** The
  `IntersectionObserver` scroll-spy is gone, and `jumpTo()` no longer waits on
  a 400ms timer before focusing - there is no smooth scroll left to wait out,
  and `.focus()` inside a `display:none` step does nothing and reports
  nothing, which is the general trap: **a measurement or a focus inside a
  hidden step silently returns zero or no-ops**, so any check written against
  the wizard has to `go(i)` first and measure only `.section.active`. What is
  safe there: `collectForm()` (verified byte-identical on a re-imported
  467PA), the review PDF's build and round-trip, and both charts, which use a
  fixed viewBox and measure nothing.
  The rail wraps rather than scrolling sideways, same call as the section list
  the day before, is centred, and is not sticky - the fixed action bar carries
  Back/Next for the middle of a long step. A done step's numeral is the logo's
  **sky**, not the ok-green (Jake, 2026-09-11): the rail is brand furniture
  rather than a pass/fail readout, and navy type on sky, since white on it is
  thin. Below 700px it keeps its labels, because a bare numeral means nothing
  beside a section you can simply scroll to.
  **Two touch-target facts from the same round, both measured.** `.box` is
  44px and 16px below 700px, and the SIZE is a bug fix rather than taste: iOS
  zooms the whole page in whenever a focused input is under 16px, which on a
  form of forty fields was a zoom and a pinch-back per field. And
  `.rowitem .box` / `.prtable .box` have to restate it, because a two-class
  rule outranks a one-class `.box` whatever the source order - the same
  cascade trap as the `@media` gotcha above, one rung sideways. **That trap
  bit a second time in the same commit and is worth stating as a rule: any
  new property on `.box` has to be checked against those two.** `select.box`
  gained `appearance:none` with a drawn caret (so iOS honours the 44px) and
  `padding-right:26px` to reserve room for it - and every select inside a
  repeating row or the polish matrix painted the caret straight over its own
  text, because those two rules set `padding` as a shorthand.
  **The internal breakpoints above 1240px all had to be recalibrated, and the
  reason generalises**: they were written against the width the FORM had, and
  the two rails used to take 450px of the window out of it. The form is now
  `min(1180, window) - 64` and reaches its full 1116px at a 1244px window, so
  `1600`/`1601` became `1243`/`1244`. Left alone, Performance Testing would
  never have got its three-up arrangement on any monitor, silently. If the
  layout's width ever changes again, grep every `min-width`/`max-width` above
  the one-column line and re-derive it from the form, not the window. Fields and
  aggregate row cards go to one column below 560px, where 16px type in two
  columns clipped its own values. What still clips at 390px is two genuinely
  long strings (a producer name at 387px, the RAP note) and no layout fixes
  that - the combo popup and the `title` attribute are the answer there.

- **The section head is a navy band with the gold rule under it - Banded, one
  of five treatments, chosen by Jake 2026-09-11.** The other four were built
  or mocked and are gone: Plates and Provenance were already the page's look
  and stay (plate fields, and colour saying where a value came from), Ledger
  and Ruled were built behind a `?treatment=` switch for comparison and have
  been deleted along with the switch. Do not go looking for them in the file;
  they are in the history at `f9355ef` if anyone wants them back.
  The band is folded into the base rules rather than layered on top, so there
  is one `.section-head` and no scoping attribute anywhere. Three things about
  it are load-bearing. The negative margins equal `.section`'s own 22px/24px
  padding so the band reaches the card edge **without** `overflow:hidden` on
  `.section` - that would make a scroll container of every card and break the
  polish matrix's sticky row head. The 9px radius is the card's 10px less its
  1px border, so the band's shoulders sit inside the card's corners. And the
  on-navy rules are scoped to `.section-head` on purpose, because `a.cite`
  also appears inline in `.prnote` / `.prsub` on white, where it must keep the
  accent values. `--navy-dim` and `--navy-hairline` in `:root` are the derived
  pair for small type on navy; `--muted` on `--line` is unreadable there.
  **The Portal's card headings match** (same day): there is no head wrapper
  there as there is in DesignBook, so the `h2` itself is the band, with
  `.lead` staying on white beneath it. Two of the cards put the "so far"
  breadcrumb above the heading, so on those the band keeps its full-bleed
  width and loses its shoulders rather than pulling up over the breadcrumb -
  `.sofar + h2`. The negative margins are `.card`'s own 24px/28px, not
  DesignBook's 22px/24px, so do not copy the numbers between the two files.
  Two things worth keeping from building the three. A treatment rule is easily
  MORE specific than a base rule it did not mean to catch:
  `[data-treatment="ruled"] .dvrow .v` outranked `.dvhead .v`, so the Design
  Values column names went from 10px to 14px, overflowed their 76px track and
  gave the page 52px of sideways scroll. And **right-aligned nowrap text
  spills LEFTWARD**, which is why those column names have always been wider
  than their track without anyone noticing: the base absorbs the spill into
  the label column, and it only became page scroll once a treatment widened
  the section. Check a restyle with `documentElement.scrollWidth` at 390px,
  never by eye.
- **A native `<datalist>` is not a typeahead, and it looks exactly like
  one.** It substring-matches an option's **`value` only** — never the
  option's label text, never anything you put in an alias — it ranks
  nothing, and on iOS it barely opens. So on DesignBook's Producer field an
  AGP number matched nothing, and neither did "haydon airport" for
  `HAYDON MATERIALS, LLC - AIRPORT ROAD @ BARDSTOWN`, because neither is a
  substring of the producer name alone. Replaced 2026-09-10 with one shared
  popup (`comboOpen` in `designbook.html`) that scores value + label +
  aliases, ANDs the typed words, ranks closest first and highlights the
  match. The `<input>` keeps its classes and its `data-field` /
  `data-row`+`data-col`, so `collectForm()`, the rail and the auto-fill
  needed no changes; choosing an entry dispatches real `input`+`change`
  events so it lands exactly as typing does. If you add another long
  reference list, it gets this for free — anything over
  `CONFIG.REFERENCE.SELECT_MAX` uses it.

- **AGP and AMP are different registries, and a RAP row needs the second
  one.** An AGP number is an aggregate producer; an AMP number is an
  asphalt plant. Every aggregate component has an AGP producer except RAP,
  which is millings — so its "producer" is the plant they came off, and
  checking it against `aggregates` warned on every correctly filled RAP row
  (Jake, 2026-09-10). The Producer column now declares an `alt` list and
  resolves per row: RAP rows draw from `plants` and relabel to "Plant (RAP
  source)". **Detect a RAP row by Type & size, not by Producer** —
  `aggregate_types` carries `Coarse RAP`, `Fine RAP` and
  `Intermediate RAP`, and that is where a real MixPack puts it.
  `rapPercent()` had been looking for a Producer of literally `RAP`, so on
  every real design it returned null and the RAP note silently never
  computed. `isRapRow()` is now the single definition and accepts either
  spelling.

- **Natural sand and dolomite are not rows of the polish matrix any more**
  (2026-09-11). Both are settled entirely by the type name in the column
  caption above them - `Natural Sand` is the one uncrushed sand on KYTC's
  list and `Dol.`/`Dolomite` the only dolomite prefixes, per the reference-
  data note below - so two rows of Yes/No restating the caption were
  redundant. They are tags on the column now, shown only when true, and
  `polishComponents()` reads them from `polishFactsFor()` rather than from
  the DOM. A type KYTC's list does not carry reports neither; that blend is
  already flagged unproven by `unknown`, which is the honest answer rather
  than a guessed one.

- **The Polish-Resistant step exists only for a Type A or Type B mix**, and
  that is a rule rather than a default (Jake, 2026-09-11). `polishApplies()`
  reads the letter off `effectiveMix().nominal_size` - Contract Information's
  Nominal size + Mix type, falling back to the Portal's lookup - and
  `applyPolishVisibility()` puts the section AND its rail chip away for
  anything else, so such a design is eight steps rather than nine and
  Next/Back skip it. Verified across every combination 2026-09-11: A and B
  show, D and a blank letter hide, for both `0.38` and `NO.4` sizes.
  Hidden, never removed - classes and gradations already typed stay in the
  DOM and in the payload, so correcting D -> B brings the answers back.
  Two consequences worth knowing. `evaluatePolish()`'s "no restriction"
  branch and `polishVerdict()`'s matching state are **unreachable on screen**
  - they are the honest answer for a Type D blend, kept for if the section is
  ever shown for one, not a state anyone can meet. And because the section is
  hidden before Nominal size is typed, a brand-new design is eight steps
  until the mix type is chosen; that is why the step numerals have to be
  visible positions rather than schema indices (see the wizard note above).

- **Superpave consensus properties: values + per-mix spec limits.** Added
  2026-09-10 (Andrew): a `CONFIG.SECTIONS` section `id: "consensus"` with
  four number fields (`caa`, `faa`, `flat_elongated`, `sand_equivalent`),
  placed between Gradation and Polish-Resistant Aggregate, legacy-wired to
  `Design Data!O52–O55` (same in 11.x/12.1; PR #10). The per-mix limit for
  each is in `CONFIG.CONSENSUS_CRITERIA` (**KYTC 2026 Std Spec p.194 /
  AASHTO M323 Table 5** — a spec constant, same footing as
  `GRADATION_CONTROL_POINTS` and `POLISH`), keyed on **AADTT Class** (the
  spec's "Class" 2/3/4 — *not* ESAL or depth; the MixPack's `P52:P55`
  Criteria formulas still branch on the old ESAL-era table, so don't copy
  them). `consensusCriteriaFor()` is the pure core; on the page
  `computeConsensus()` prints the resolved limit + ✓/✗ under each value and
  an out-of-spec value raises a **non-blocking** rail warning (same pattern
  as Polish — "design is complete, it just wouldn't qualify"), and the
  review PDF has a bespoke `RENDER.consensus` (Property / Value / Spec
  limit / Result, coloured Pass/Fail — added `ok`/`bad` to
  `CONFIG.HANDOFF.BRAND`). FAA and SE are always `req`; CAA and F&E lose
  `req` on a No. 4 mix (`isNo4Mix()`), where they don't apply and FAA's
  min rises to 45. **Open (Andrew → Tate):** `caa` is one field checked against the
  two-or-more-crushed-faces figure; confirm whether KYTC wants the
  one-face value tracked separately. KM p.472 verification tolerances
  (CAA ±10, FAA ±2, SE ±15, F&E ±5 SMA-only) are noted in the CONFIG
  comment but not enforced — that's the Department's re-test side, not the
  contractor's. Full table in `docs/legacy-mixpack-map.md`.

- **Design Values no longer shows the uploaded MixPack's own stated figure
  next to the one computed from Four Points — decided 2026-09-11 (Andrew):
  the calculated value is gospel, not something a contractor should be able
  to dispute with a MixPack cell.** Until this, `computedHTML()` printed
  both columns for the ten quantities both sources have (AC/Pb, Va, VMA,
  VFA, Gmm, Gse, Pbe, dust ratio, density — everything but Gmb, which the
  workbook never states) so a reviewer could sanity-check the curve fit
  against what the technician originally submitted. That comparison is
  gone from the page now; only "From Four Points" prints. **Nothing was
  removed from the import itself** — `state.legacy.designValues`, the
  upload inspector log, and `extracted_from` still capture the workbook's
  figures exactly as before, same as every other provisional value in this
  codebase; only this one display stopped rendering them. The "Stated only
  in the MixPack" side panel (Gsb, %Gmm @ Nini/Nmax, absorbed AC, film
  thickness) is untouched — those five have no computed counterpart at
  all, so there's nothing to dispute them against, and Andrew confirmed
  keeping them visible. The PDF was never part of this: `RENDER["design-
  values"]` in `buildReviewPDF` only ever printed `dv[o.key]` — the
  computed figure — so the review sheet was already "gospel-only" and
  needed no change. If this section's `.dvtable.two` CSS variant or the
  `has`/`wb`-column logic in `computedHTML()` ever comes back, it's a
  reversion of this decision, not a bug fix — check here first.

- **The Va-vs-Pb chart got real axes 2026-09-11 (Andrew), and the page and
  the review PDF now share the axis code.** It had no tick marks and no
  numbers at all - you could see the curve cross the target but not read a
  value off either axis - and no y-axis title. Two pure helpers next to
  `solveQuadForTarget` are the shared ground: **`niceTicks()`** (round-number
  bounds + ticks; raw data bounds put the axis on values like 4.3 and 7.3,
  unreadable once labelled) and **`fitRuns()`** (splits the fitted curve into
  the stretch the four trial points support and the stretches past them).
  `drawFpChart()` and `fourpointBlock()` in `buildReviewPDF` both call them,
  so the two can never disagree about where a gridline sits - same reason
  `trimFlatCoarseEnd` is shared by the gradation chart and the sheet. Three
  things worth knowing if you touch this:
  **(1) A parabola drawn past its outermost trial point is extrapolation and
  must not read as measured** - those runs are dashed and faded, and when the
  *solved design Pb itself* lands outside the trial range the marker, its
  dropline and its label turn red (`--bad`), say "extrapolated", and
  `recompute()` raises a matching non-blocking rail warning (same footing as
  Polish / Consensus - the arithmetic is valid, whether the design stands on
  it is the Department's call). `solveQuadForTarget()` does **not** clamp its
  root to the trial range - it picks the root nearest the range's midpoint,
  which can sit well outside it - so this was previously invisible.
  **(2) The target label sits at the LEFT end of its line, deliberately.** The
  design-Pb marker is *on* the target line by definition, so a label at the
  right end collides with it exactly when the solve lands over there - which
  is where an extrapolated one does, and its label is the longest. Caught in
  a browser, not by eye on the source.
  **(3) `computeFourPoint()` now returns its solve and runs at the TOP of
  `recompute()`, not the bottom.** The rail's extrapolation warning reads that
  return value, and reading it from the old end-of-function call site would
  have left the rail one keystroke behind. Moving it also fixed a latent
  one-cycle lag of its own: `autoFpInputs()` fills Combined Gsb and %#200,
  which the required-field sweep counts, and it used to run *after* that
  sweep. Same "compute first, then count" rule `computeConsensus()` already
  followed.

- **A `<select>` fires `input` BEFORE `change`, so clearing an "auto-filled"
  marker only on `change` lets the `input` handler undo the person's first
  pick.** The Polish-Resistant Source column (coarse/fine) is prefilled from
  the component's own % passing the #4 and tagged `data-guess` so it keeps
  re-guessing as gradations arrive; the tag was removed in the `change`
  handler, but `reguessPolishRoles()` runs from the `input` handler, which
  fires first — so it re-guessed while the control still looked auto-filled
  and put its own answer back. On screen the dropdown appeared to reject the
  choice; picking a second time worked, because by then the tag was gone.
  Fixed 2026-09-10 by clearing the tag in the `input` handler too. Two things
  worth carrying: **if a marker decides whether an event handler may overwrite
  a control, clear it in the FIRST event that fires, not the tidiest one**;
  and this had been invisible until the per-component gradations started
  importing the same day, because with no #4 value the guess had nothing to
  overwrite with. A dormant bug that a *data* fix wakes up is easy to blame on
  the data fix.
  (Shipped inside commit `1103126`, whose message describes the other three
  polish changes and not this one.)

- **Spec citations are links, and the two KYTC documents anchor
  differently.** `CONFIG.SPECS` in `designbook.html` holds both, and every
  page in it was opened and read in the real file 2026-09-10 rather than
  inferred. The **2026 Standard Specifications** (703 pages, 101 MB) has
  **no named destinations and no bookmarks**, so `#page=N` - a physical
  page - is the only anchor a browser honours, and the book has no running
  page numbers either (footers are section-relative, `403-4`), so each entry
  records that footer too: that is how you re-find the page in one search
  when the next edition moves it. **Kentucky Methods** (13 MB) *does* carry
  123 named destinations, one per method (`km443p1` = KM 64-443 page 1),
  which survive a re-issue - so prefer `#nameddest=`; five are present by
  name but point at nothing (`km001`, `km265`, `km323`, `km421`, `km444`)
  and KM 64-450 has none at all, so those fall back to `#page=N`. The pages
  worth knowing: 403.03.03 A) polish-resistant + the 15% natural-sand cap is
  PDF **193** (`403-4`); C) 1) volumetric/gyrations, C) 3) TSR and C) 4)
  consensus properties are all PDF **194** (`403-5`); C) 5) Hamburg/KYCT
  limits is **195** (`403-6`); 805.05 aggregates for asphalt mixtures is
  **562** (`805-4`); 402.03.01 A) JMF is **176** (`402-1`). The `CITE`
  constants stay **plain text** on purpose - the review PDF prints them and
  a PDF string cannot carry an anchor - and `specLinkify()` links the
  citation's own name where it reaches the screen. One caveat to pass on
  before sending a contractor to the spec book on a phone: 101 MB is the
  whole download, since a phone browser generally will not range-request a
  PDF the way desktop Chrome does.

- **A row spec can declare `start: n`, the number of blank rows it opens
  with** (2026-09-11). Only TSR uses it: a KYTC TSR is six specimens - three
  conditioned, three broken dry - so a blank design shows six waiting rows
  rather than one and five presses of the add button. `collectForm()` drops a
  row where every cell is empty, so unused rows never reach the payload, but
  note the required-field count does rise with it: six rows at two required
  columns is twelve missing on a blank design, which is honest rather than a
  bug. Everything else stays at one row.

- **`CONFIG.DP` is only obeyed where something actually reads it, and one
  Design Value did not.** `computeFourPoint()` wrote unit weight with
  `Math.round()` while its nine neighbours all went through `fmt(v, DP)`, so
  147.9 printed 147 - on a page whose whole point is that the computed value
  is gospel. Fixed 2026-09-11. Worth pairing with the row-importer note below:
  a precision constant is a claim about the whole page, and it takes one
  hand-rolled line anywhere to make it false silently.

- **A row table's importer is a second place `CONFIG.DP` has to be applied,
  and two of them were missing it.** The scalars and the aggregate columns
  have always gone through `coerceField(key, ...)`; Performance Specimens and
  KYCT called plain `coerce()`, so air voids printed
  `6.804854270811085` and CT index `111.47418451832462` - both are MixPack
  *formula* cells, so the cached value behind a cell KYTC formats to a tenth
  is a full float (same family as the TSR note in `CONFIG.DP`'s comment).
  Fixed 2026-09-10. If you add another repeating table, wire its import
  through `coerceField`, and where a value is range-checked before it is
  stored (KYCT skips a slot whose index is 0), **test the raw value and round
  the stored one** - rounding first can turn a real but tiny number into
  `"0.0"` and drop the row.

- **An inline `style="grid-template-columns:..."` cannot be overridden by a
  media query without `!important`** - the row renderer writes each table's
  column template inline, so the phone breakpoint could restore the labels
  but not the columns, and five columns at 390px squeezed "Specimen 1" to
  "Spec". Same family as the `@media` gotcha above, one rung further up the
  cascade: there the fix was source order, here no amount of ordering helps,
  because an inline style outranks every stylesheet rule. Repeating rows now
  render as one header strip plus thin rows (wide) or two-column cards
  (narrow). Note the header lives *outside* `.rowlist`: `collectForm()` reads
  that element's children as the rows, so anything else in there is collected
  as an extra row. A row spec also declares `span: [wide, medium]` in
  twelfths, which is how Performance Testing gets its three tables on one
  line; pick the breakpoints from what the window leaves the *form* (the nav
  and the rail take 450px of it), and check for clipping by comparing each
  input's `scrollWidth` to its `clientWidth` rather than by eye.

- **The TSR tab carries the specimen weights and derives from them as of
  2026-09-11, and the tab's OWN Gmm (`TSR!B38`) is the cell that makes that
  correct.** DesignBook imports dry / SSD / in-water weights (rows 33/34/35)
  and the vacuum-saturated SSD weight (row 44), and `tsrSpecimenDerived()`
  computes Gmb - KYTC calls it **Bulk Specific Gravity** - air voids and
  initial saturation exactly as the sheet does. **TSR specimens are compacted
  to a different air-void target (7 +/- 1 %) and bulked separately, so the
  TSR tab's Gmm is NOT the design Gmm**: computing against the design figure
  put #467PA's specimen 1 at 71.3 % saturation and raised a warning on a test
  KYTC approved, where `TSR!B38` reproduces the workbook's own
  69.7 / 66.1 / 61.8 exactly and warns about nothing. Same lesson as the
  thickness one below, twice over: import the cell a workbook computes FROM.
  Two details worth keeping. The absorbed-water line mirrors the workbook
  including its oddity - the guard tests `row44 - row34 > 0` (the SSD weight)
  while the value returned is `row44 - row33` (the DRY weight); do not "fix"
  it to one or the other, it is what every approved design on file was judged
  by. And a derived cell is only written when all its inputs are present, so
  a workbook that carried a cached result and no weights keeps the number it
  came with rather than being blanked by an incomplete recalculation.
  The targets (95 mm, 7 +/- 1 % air voids, 65 +/- 5 % initial saturation) now
  print under the table as well as firing in the rail - `CONFIG.TSR` had held
  them all along, but only somewhere you met after getting one wrong.

- **The MixPack's TSR tab: three traps, all only visible against a real
  file.** DesignBook imports the six specimens as of 2026-09-11
  (`CONFIG.LEGACY.TSR_SPECIMENS`; full cell map in
  `docs/legacy-mixpack-map.md`). **Which three are conditioned is not
  fixed** - #467PA conditioned 1-3 and broke 4-6 dry, the Ver 11.3 file did
  the opposite - and the workbook's own discriminator is the
  **conditioned-thickness row (49)**, since its dry-strength formula blanks
  itself the moment that cell is filled. **Carry the strengths, never
  recompute them:** the sheet's psi is `2P/(pi*d*t)` and it takes `t` for a
  conditioned specimen from that same row 49, which in the approved 11.3
  file reads **150** - the diameter, not the 95 mm height - so recomputing
  at 95 turns its approved **83.5%** TSR into **131%**. The thickness is
  imported too, so the page warns about it rather than silently absorbing
  it. And **saturation is row 46, not row 52**: row 52 is the same
  measurement after the 24-hour 140F conditioning and is always higher,
  while the 65 +/- 5 % target the tab prints on itself is the *initial*
  figure - reading 52 flagged all three of #467PA's specimens on a design
  KYTC approved. General lesson for any importer here: when a workbook
  computes something from a cell, import that cell too, and check it -
  a wrong input that the sheet has already folded into its answer is
  invisible in the answer alone.

- **One fact, two resolvers: the page and the PDF have to agree on where
  the mix comes from.** The review/submittal sheet drew no gradation control
  points for any design that did not start from the Portal's mix lookup -
  a legacy MixPack upload, or a build from scratch - because
  `gradationBlock()` read `payload.mix.nominal_size` while the page reads
  `effectiveMix()`, which takes Contract Information's **Nominal size + Mix
  type** first and falls back to the lookup. The two fields are the
  authority (a custom build has no `state.mix` at all), so anything deriving
  from the mix designation must resolve them in that order - the consensus
  renderer already did, twelve lines below the one that did not. Fixed
  2026-09-11. Worth checking the same way whenever the page shows something
  the sheet does not: it is usually not a rendering bug but two different
  answers to "what mix is this?".

- **A formula cell in a generated workbook is either kept-with-cache or
  dropped, and the choice depends on whether we also wrote its inputs.**
  Excel recalculates every formula when it opens a file, so a value written
  beside a kept `<f>` survives only if the formula would produce it again
  from cells we wrote (MAT code from type name). A result whose inputs we
  never had (Gmb from specimen weights) must have its formula DROPPED and
  the value written plain, or Excel blanks it on open and the archived copy
  shows an empty cell next to a staging sheet that carries the number. A
  third case - cells whose formulas use functions the evaluator lacks
  (VLOOKUP, AVERAGE) - are fed to the evaluator as `evalOnly` and not
  written at all, since Excel recomputes them correctly. Also learned there:
  the template's plant VLOOKUP key is padded (`"AMP070301      "`) and the
  match is exact, so a value has to be spelled as the template's own list
  spells it, not as Supabase does. `mixpackCells()` in `designbook.html`.

- **The Project Items sheet is the one thing a correct design could still get
  wrong at the hand-off, and it is fixed by reading KYTC rather than by asking
  anyone to re-type it** (Jake, 2026-09-11: "the only thing we need to do is
  update the project items in the excel file before they take it to medl and
  sitemanger, contractors use the proposal and most of the time it gets
  outdated and medl and sitemanger wont accept it"). A contractor fills that
  sheet from the proposal they bid; a change order then adds, deletes or
  re-numbers an item and MEDL refuses the load. KYTC's own current list is the
  **newest pay estimate** for the contract - "always use the newest pay
  estimate for this, its the top one in the list" - so
  `netlify/functions/kytc-items` reads that, and `CONFIG.PROJECT_ITEMS` wires
  a **Look up project items** button to it. Contract 252112 is the worked
  example that makes the case: its estimate 0006 carries ten items numbered
  8000-8009 that no proposal has, and the mix item itself sits on a
  supplemental code (`22906ES403`) rather than a standard one.
  Six things worth carrying forward.
  **The filename needs the contractor's KYTC vendor number and nobody should
  have to know it.** Both sources are named `<cid>-<vendor>-EST<nnnn>.html`
  (`/Construction/Pay Estimates/`) and `<cid>items<vendor>.html`
  (`/Construction/Contract Items/`). Both are SharePoint document libraries
  whose classic view honours
  `Forms/AllItems.aspx?FilterField1=FileLeafRef&FilterOp1=BeginsWith`, so the
  contract ID alone finds the file and the vendor number comes back with it.
  That filter is also the only way in: the unfiltered listing serves 300 old
  files (CIDs 000001-042918) and no paging parameter moves it.
  **"Newest" is the highest sequence number, not the next one up.** The
  numbers have gaps (030749 has no EST0076 or EST0081 - an estimate voided in
  SiteManager leaves nothing behind), so counting up until a 404 stops early.
  A contract's last estimate is named `FINAL-<nnnn>` rather than `EST<nnnn>`.
  **A brand-new design usually has no estimate at all**, which is not an error
  - paving has not started, so nobody has been paid. It falls back to the
  Item List (the items as awarded) and the note says so, because that list can
  itself go stale later.
  **The description IS the mix signature**, so `parseSignature()` already
  reads it and the design's own Nominal size + Mix type + Binder grade pick
  its lines out of a contract that can carry 282 of them. Nothing else on the
  contract (DGA, tack, striping) belongs on that sheet. A contract with two
  routes has a PCN each and the right line can be on the second one - 262120's
  0.38B is on `MP07606272601`, and #467PA's own MixPack states exactly that,
  which is how the lookup was cross-checked against a real approved file.
  **The mapper wrote one row and had to write all of them.** `Project Items` is
  `A6:D105` and its own note beside it reads "Add as many rows as required";
  the two Contract Information scalars still seed a single row when nobody ran
  the lookup, which is what a legacy MixPack's `PROJ. (ITEM)` cell gives, and
  the report says so rather than pretending the sheet is current.
  **The reports are hand-rolled RTF-to-HTML from the 1990s** - unclosed `<td>`,
  stray `<font>`, tables nested inside table *rows* - so nothing parses them as
  a tree. Read them as a flat run of `<tr>` blocks and let the last header row
  decide how to read the cells; the estimate has 12 columns and a live CURRENT
  QUANTITY, the item list has 8 and only the bid quantity.
  The lookup runs from two places and reports in both: the button on the table
  in Contract Information, and **Project look up beside Approve on the Status
  step** (Jake's ask the same day) - Andrew and Tate are there when they
  approve and generate the workbook, and that is where a stale sheet actually
  bites, not back on step 1 where a contractor filled it.

- **PlantBook's target, the AMAW workbook, is mapped as of 2026-09-13 -
  `docs/amaw-map.md`.** First real look at one. The headline for whoever picks
  PlantBook up: **the engine ports, the mapper does not.** AMAW is the same
  MEDL loader architecture as the MixPack, checked rather than assumed -
  `xl/xmlMaps.xml` is **byte-identical** (27,873 bytes, same
  `MaterialDisciplines_Map` and `http://tempuri.org/XMLSchema.xsd`), and all
  seven `t_*` staging tables plus `Project Items` and `discipline` have
  **identical column lists**, including all 54 of `t_smpl`'s. So the zip
  surgery and the staging evaluator are reusable; what is new is the domain.
  The refs are where they differ, and they say what AMAW is: **eight sample
  rows where the MixPack has one** (B7:BC14 vs B7:BC8), 1,470 test-result rows
  against 335, 350 remark rows against one - a lot's worth of sublots rather
  than one design. AMAW's staging shape is a strict SUBSET: the MixPack has
  `t_superpave`, `t_bit_conc_mixblnd` and `Chart Data`, AMAW has nothing the
  MixPack lacks. `Project Items` is the very sheet the pay-estimate lookup
  already fills (`prj_nbr | ln_itm_nbr | repr_qty`, A5:C99), so that work
  transfers whole.
  **`discipline` row 2 is the loader id and is NOT the filename version**:
  AMAW 14.01 declares `AMAW` / `v2.0`, MixPack 12.1 declares `AMMIXPACK` /
  `v3.0`.
  **The evaluator needs four functions**, three trivial. `CHAR` (364 uses) and
  `COUNT` (1) are one line each; `VLOOKUP` (7, all the same lookup) already has
  the `evalOnly` escape. **`INDIRECT` (28) is the one real piece of work** -
  but contained, two shapes, both selecting a column or row off one sublot
  index (`INDIRECT("G"&'Super Verify'!B5+8)`), not arbitrary string-built
  references.
  **CORRECTION 2026-09-13 to the note this replaces, which said the `AMAMAW`
  sheet documents the workbook's input cells "all on the `Superpave` sheet".
  Both halves were wrong** - caught by checking it against two completed
  workbooks Jake supplied. `AMAMAW` is the **test-method code** (the value in
  `t_tst_rslt_dtl.tst_meth`), not an abbreviation of AMAW, and that sheet is
  stale: its `Cell` column disagrees with the live workbook on every entry
  tested - it says `C10` for Aggr. Pro. Codes where the real source is
  `Superpave!N3`, `D28` for Air Voids where it is `Superpave!J14`, `E5` for
  County where it is `'Pay Values'!I3`. Do not map against it. (Its `f93`-style
  numbers are not `tst_fld_sn` either - "Acceptance Method" is `f93` there and
  sn 42 in the staging table.)
  **The real map is `t_tst_rslt_dtl` itself**, documented in the columns beside
  its ListObject: column A is `<block> - <field label>`, column E is
  `tst_fld_sn`, and column F or G holds a **formula naming the source cell**.
  Same derivation the MixPack map came from, and it cannot go stale because it
  is what the loader reads. Extracted whole to `docs/amaw-field-map.json`
  (1,469 rows, 1,095 with a source formula).
  **A lot is seven test records, and two strides generate them all.**
  `VI01` (verification), `QC01`-`QC04` (the four sublots), `QA01`
  (Department acceptance) and `IQ01` (independent assurance), ~210 fields
  each. Lot-level fields read the same cell in all seven; the four QC sublots
  step **6 rows** down `Superpave` (`B14/B20/B26/B32`); QA and IQ read
  `'Super Verify'` at a stride of **7** (`B10/B17`). So a mapper needs the
  lot-level addresses once plus two strides, not 1,469 addresses.
  **Version layout is stable, unlike the MixPack's** - Jake's two lots are
  **13.3**, older than either public download, and all 85 dictionary rows and
  every staging dimension are identical across 13.3 / 13.04 / 14.01. The
  version marker is `Pay Values!K1`; the `Workbook Edits` changelog is stale in
  all four files (last entry 2007) and `discipline` carries the loader contract
  (`AMAW` / `v2.0`) rather than the build, so neither identifies your copy.
  **`Pay Values!D9` is the join between the two books**: `00385 CL3 ASPH SURF
  0.38A PG64-22` - the approved design's MIX ID followed by its signature. A
  PlantBook lot is a child of a DesignBook approval and the workbook already
  writes that link down.
  Two data-format traps from the real files: **times are Excel time fractions**
  (0.9125 = 21:54), not the HHMM the stale sheet claims, and the per-sublot
  **Tons figure is cumulative ticket tonnage** rather than that sublot's own.
  Core count is not fixed either - lot 1 has six, lot 2 has ten.
  **Jake's lots bear on the open dolomite question**: both are contract 252112
  at Boonesboro, and the blend's second-largest component is `Dol. #10's
  Washed` at **20%** from `AGP027501` - the exact component and producer that
  question is about. It does not settle the class (an AMAW records production,
  it does not re-adjudicate a design) but it is a real accepted lot to put to
  Andrew beside #467PA. Full lot data in `docs/amaw-map.md`.
  Two facts that cross back into DesignBook. `.45 Data` carries the **same
  gradation control points** DesignBook holds in
  `CONFIG.GRADATION_CONTROL_POINTS`, so that constant belongs to both books
  rather than being design-only. And `PG Producer` / `Producer supplier` are
  in-workbook reference lists of the same terminals as the `binder_terminals`
  table - PlantBook should read the table, same rule as everywhere else.
  **The SheetJS gotcha is worse here than on a MixPack**: AMAW has a chartsheet
  AND a `Dialog1` dialogsheet, so the name shift is bigger - `wb.Sheets["t_smpl"]`
  returns `t_cont_smpl`. Every figure in that doc was taken by resolving
  `xl/workbook.xml` -> the rels -> the worksheet XML directly. Use cell-bounded
  regexes too: a greedy `<f>...</f>` match runs past `</c>` on these sheets and
  invents hits, which it did here before being caught.
  The blank templates are public downloads off KYTC's SiteManager page
  (`AMAW_VER14_01.xlsm`, and 13.04 before it) and are deliberately **not
  committed** - nothing uses them yet, and `.gitignore`'s `MIXPACK*.xls*` rule
  does not catch `AMAW_*`, so one would land if added without thinking.

- **PlantBook starts by uploading a DesignBook approval** (Jake, 2026-09-13),
  and that one decision settles a surprising amount. The approval PDF already
  **embeds the whole design payload** as a JSON attachment - `buildApprovalPDF`
  attaches it exactly as the review sheet does, and `readHandoffPDF` reads it
  back - so a lot does not TYPE its contract, plant, mix, blend or Gsb, it
  inherits them. More to the point it inherits the three numbers the pay
  calculation is measured against: **JMF %AC, target air voids and minimum
  VMA**. Pay is meaningless without them, so the approval upload is what makes
  the pay step computable at all rather than merely convenient.
  **And the approval is signed**, which turns the front door into a real gate:
  `verify-approval` is already live and `verify.html` already uses it, so
  PlantBook can refuse to open a lot on a design KYTC never approved, or on one
  edited after approval. That is a property the file-is-the-record model gives
  away for free here, and it is worth not losing whichever way the storage
  question lands.

- **Three corrections to `docs/amaw-map.md`, found 2026-09-13 by deriving the
  address map instead of reading the sheet.** All three are the kind that look
  right until real data disagrees:
  **The blend percentages are PER-SUBLOT, not lot-level.** Producer, type &
  size and BOD are lot-level (`Superpave` N/O/Q, rows 3-8) but the percentage
  is one column per sublot - R/S/T/U - and so is combined Gsb at row 9. Both
  real lots repeat the same five percentages across all four columns, which is
  precisely why it reads as lot-level; a plant that adjusted its blend mid-lot
  would break anything that assumed otherwise.
  **There are TWO core banks with different strides**, and the earlier "six
  cores in lot 1" was one bank read alone. Mat cores are rows 10-13 stride 5,
  joint cores rows 33-34 stride 3; lot 1 has 24 core ids and 18 densities
  (sublot 1's six were labelled and never measured). Never assume a count per
  lot or per sublot - read every slot and drop blanks.
  **`Field Rutting` is not Hamburg.** The loader's labels still say "Hamburg
  Pass 100 Left Max" but the sheet is IDT-HT (A18:E24) and IDEAL-RT
  (I18:M24) - KYTC reused the old slots when the test changed and the labels
  never followed. Two traps inside it: verification reads the derived E/M
  columns where production reads raw peak loads in D/L, and **sn 176 and 177
  both point at `D19`** in the production blocks, shifting that series one
  place. Reproduced verbatim, not corrected - same rule as the TSR
  absorbed-water oddity.
  One field of 210 stays unclassified: **sn 253 "Test Charges"** is
  `Calculations!P84` on QC01 and `P278` on QC02 with no stride between them and
  nothing for the other five blocks. Carried explicitly and printed by the
  checker every run rather than guessed at.
  Also: both real lots leave `'Pay Values'!B3` blank, so `t_smpl.smpl_id` is
  empty in both - read that as "not ready to hand off", not as a read failure.

- **PlantBook is spliced in and live as of 2026-09-13** - the book switch in
  DesignBook's appbar works, `built: false` is gone from `portal.html` and
  `login.html`, and `designbook.html?book=plantbook` opens a lot. What follows
  is what a second reader needs to know about it; the note it replaces
  described the parts before they were wired.
  **The page carries four namespaces, `PB_SECTIONS` / `PB_PAY` / `PB_AMAW` /
  `PB_LOT`, each a verbatim port of modules under `scripts/amaw/`, and each
  defining exactly ONE top-level name.** That is not tidiness. Half a dozen of
  those modules export the same bare names as each other and as this page -
  `BLOCKS`, `STAGING`, `UNCLASSIFIED`, `MCL`, `A`, `escapeHTML` - and a
  top-level `const` collision is not a runtime error anyone can see: it is a
  `SyntaxError` at script-instantiation time, so not one line of the inline
  script runs and the page sits on its static markup forever. That is the
  `supabase`/`sb` gotcha above, and a namespace is what keeps every later
  splice clear of it. **Add the next module as its own `PB_*` namespace; never
  hoist a name out of one.** Cross-namespace references bind LAZILY (inside
  the function that uses them, or at the use site) because the four are
  `const`s and an eager reference to a later one throws a TDZ error at
  construction - which the drift checker asserts stays true.
  **`scripts/amaw/check_page_plantbook.mjs` is what stops the page and the
  modules drifting**, the same job `scripts/mixpack/check_page_engine.mjs`
  does for the MixPack engine, and it reads like it. It lifts each block out
  of the page by its banner comment, evaluates all four in one `vm` context
  with no DOM, and runs the real assertions against the modules rather than
  diffing text: 152 pass / 0 fail / 1 skip against Jake's two real lots. The
  one skip is `generateAmaw()` end to end, which needs `MP`, `fflate` and the
  blank template; its pure parts are checked and the output says which part is
  not. **Run it after touching either copy.** It has been watched failing -
  perturbing one number inside `PLANTBOOK PAY` reports two drifts and exits 1;
  a missing banner is a fatal saying "Nothing was checked". One divergence is
  asserted as INTENDED rather than reported as drift: the page's copy of
  `sections.mjs` has `isRapRow` deleted, because it calls the page's own.
  **The schema lives in `scripts/amaw/sections.mjs` AND in the page, and an
  edit owes both.** `check_sections.mjs` runs against the module;
  `check_page_plantbook.mjs` proves the page matches it.
  **`scripts/amaw/harness/run.mjs` is the regression suite** - 275 passing, 0
  failing, 3 skipped (the Polish-Resistant cases, which are DesignBook's
  rule), with `HARNESS_LIBS` pointed at a `node_modules` carrying pdf-lib so
  both books' review-PDF round trip runs. It was 136/12 with everything
  PlantBook skipped. It defends the traps this file already records:
  measuring inside a hidden step, `documentElement.scrollWidth` at 390px, the
  `#valBlock` park, one-id-one-element, visible-position numerals,
  `collectForm()` round-trip. Per-input clipping compares against
  `harness/baseline/clipping.json` rather than zero, because this file is
  explicit that some clipping is accepted and unfixable - a check that failed
  on the RAP note would simply get turned off.
  **Three checks in that harness had assumed one book and had to be taught
  there are two** - worth knowing as a class, because all three failed in the
  direction that makes the PAGE look wrong: `fillForm()`'s `colDef()` read
  `CONFIG.SECTIONS` unconditionally, so every PlantBook number column got the
  junk string a text column gets and `rowHTML()`'s `roundTo()` then turned
  "H1758" into "1758.000" on the next render; the XSS probe was parked in
  `rap_note`, which a lot does not have, so it read back `null` and reported a
  mangled string when nothing had been escaped at all; and the Polish
  assertion was passing one of its three cases by ACCIDENT, expecting hidden
  and getting hidden because there was nothing to hide.

- **The book switch is a re-render, not a navigation, and three things about
  that are load-bearing** (2026-09-13). CLAUDE.md has had DesignBook and
  PlantBook as two views of one page from the start; this is what that costs.
  `#valBlock` is ONE node for both books and survives only because the switch
  goes through `renderForm()`, which already parks it in `#valPark` - do not
  "optimise" it into an `innerHTML` on `#dbLayout`, or every later
  `msg($("saveMsg"), ...)` writes to nothing, silently. Every id in the two
  schemas is distinct, which is why PlantBook's status step is `lot-status`
  and not `status`. And the off-screen book is held in `state.books` in
  `renderForm()`'s own seed shape (`{scalars, tables}` - `collectForm()`'s
  `{values, rows}` under its other name), so a switch away and back is
  byte-identical rather than approximately so: a person who fills in a lot,
  looks at the design it was produced under, and comes back to a blank lot
  does not file a bug, they stop using it. Same rule as the Polish section's -
  hidden, never removed.
  **`activeSections()` is the single answer to "which schema is on screen"**,
  and every renderer, the rail, the step machinery and `collectForm()` read
  it. The three `CONFIG.SECTIONS` left in `buildReviewPDF()` are deliberate:
  the review sheet is DesignBook's document.
  **The cert gate is the ACTIVE book's capability**, not a hardcoded
  `can_access_designbook`, because every page here is directly linkable and a
  gate applied only to the link that navigates here is not a gate.
  `login.html`'s `destination()` now picks a book the account can actually
  open - defaulting to DesignBook was right while it was the only one built
  and would now land a Plant-Tech-only technician on a Portal that bounces
  them, which reads as a broken sign-in rather than as a certification they do
  not have.

- **PlantBook's front door is the approval upload, and the Portal gives it a
  door rather than the four-step wizard.** Jake, 2026-09-13: "the start of
  every plant book will be uploading an approval from design book". The
  wizard exists to establish a contract, a plant and a mix before the form
  opens; a lot inherits all three from the approved design, so asking here
  would be asking twice and letting the two answers disagree. The approval
  also carries the three figures the pay calculation is measured against -
  **JMF %AC, the air-void target and the minimum VMA** - which is what makes
  the pay step computable at all rather than merely convenient. Those three
  are READOUTS, not fields: a signature that covers a value and a form that
  lets someone retype it are contradictory, and a typed JMF %AC is a silent
  four-figure error on one lot. And because the approval is signed,
  `verify-approval` turns the front door into a real gate - a design KYTC
  never approved, or one edited after approval, is refused there rather than
  three steps later. The verification's answer is CARRIED, never assumed: a
  check that could not be made reads as not-checked, which is a different
  thing from failed and from passed, and all three print differently.
  A lot's own working copy reopens through the same door - as a `.json` or,
  since 2026-09-13, as a lot PDF. **The sentence this replaces said a lot's
  working copy "is a `.json` rather than a PDF" because "there is no one-page
  document a lot IS"; Jake asked for the PDF and the reasoning was half
  wrong** - see the lot-PDF entry below. The half that stands is the AMAW:
  half-finished is still exactly when you cannot generate one of those.

- **Two things about painting Lot Pay that will look like bugs if you
  "fix" them.** A pay value can be the STRING `"MCL"` - material control
  limit, a real state rather than an error and emphatically not a zero: the
  lot has left the pay schedule and become a conversation with the Department,
  and anything that coerces it to a number turns a conversation into a
  deduction. And a property that has not been tested is `null`, which must
  never become 0 - an untested joint is not a free deduction, it is not a
  deduction at all. `PB_PAY.payWarnings()` is the single producer of the
  rail's pay warnings; the page does not invent a second opinion about a
  figure it did not compute.
  **`% solid` is the one computed core column** and is `Cores!I`'s own
  formula, `density / (sublot Gmm x 62.4) x 100`, written only when both
  inputs are present. 62.4 is KYTC's number, not a rounding of 62.428 - a lot
  has to agree with the workbook it will be loaded from. The sublot's Gmm is
  read off the sublot volumetrics row rather than held twice: `Cores!C10`
  reads `Superpave!D42` and `Superpave!I14` reads the same cell.
  **The weight column beside each value is NOT the old `.dvtable.two`
  variant coming back.** That one printed the uploaded MixPack's own stated
  figure beside the computed one, and this file is explicit that restoring it
  for DesignBook would revert Andrew's "the calculated value is gospel"
  decision. A weight is part of the arithmetic, not a second opinion about the
  same number, so it has its own variant and its own CSS - do not merge them.

- **`public/AMAW_VER14_01.xlsm` is served now**, beside the MixPack template,
  and `.gitignore` carries a second `!public/` exception for it - the rule
  already anticipated this in so many words. 14.01 is KYTC's current public
  download; Jake's two real lots are 13.3, and all 85 dictionary rows and
  every staging dimension are identical across 13.3 / 13.04 / 14.01, so the
  newer template is the right base for a lot checked against the older files.
  **Still owed, and unchanged by the splice: no browser-built AMAW has ever
  been loaded into MEDL**, the same debt the MixPack carries.

- **What the splice did NOT wire, stated rather than left to be discovered.**
  **`PB_LOT.createLotStore()` is in the page and nothing calls it.** Jake asked
  for persistence built both ways (local and Supabase) until he has talked to
  Tate and Andrew, and both backends are there behind one factory - but the
  shipped model is the one DesignBook already uses: the file is the record.
  A lot's working copy is a `.json` download and reopening it is the same
  front door. `supabase/amaw_lots.sql` is DDL for Andrew to apply and **has
  not been applied**; nothing in the page reads or writes those tables, so
  applying it changes nothing until the store is wired.
  **REVERSED 2026-09-14 (Jake): the AMAW download IS reviewer-only** - see
  the entry below. The sentence that stood here for one day said the opposite
  in bold ("anyone holding the lot may download the AMAW... do not add a
  `can_review` gate"), so it is worth knowing it was reversed rather than
  never written.
  **The `ref` the AMAW mapper takes is three FUNCTIONS, not three lists**
  (`agpFor`, `ampFor`, `matCodeFor`), and it swallows a throw from any of
  them - so handing it `state.ref` directly produces a workbook missing every
  producer number with nothing said about it. `amawRef()` in the page builds
  them over `refMatch()`, which is the single definition of "this value is
  that entry", so a producer spelled the way a real MixPack spells it
  resolves for the workbook exactly as it does in the form.

- **Three things a lot should have inherited from its approval and did not**
  (Jake, 2026-09-13, off a phone: "Should these not be auto picked from
  uploading the approval?"). All three are now inherited, and the reason they
  were not is the same each time: the value is on a document nobody had asked
  for it from yet.
  **The approval's PROJECT ITEMS never reached the lot, and that one was a
  real bug** - `project_items` was added to PlantBook's Lot step after
  `intake.mjs` was written, so the schema had the table and the intake never
  filled it. It matters more than a convenience: the Spreadsheet Applet
  expands one `t_cont_smpl` row per row on that tab, so a lot with none loads
  carrying no project at all, and `generate.mjs` names exactly that gap.
  Inherited provisionally, because a change order re-numbers items - which is
  the whole reason the lookup button exists beside it.
  **Two more things about the inherited Project Items rows, found 2026-09-13
  and NOT yet acted on.** The rows carry the CONTRACT's quantity (7,525 on
  262120), but both real AMAWs write `Project Items` column C = **4000** -
  the lot tonnage - so `repr_qty` there looks like what this lot represents
  rather than what the contract holds. Two files is not a rule, and MEDL is
  the one that would reject it, so it is written down rather than changed.
  And the **item code genuinely cannot be derived**: the lots carry `385`
  where the contract line's item number is `22906ES403`. It stays typed.
  **A lot IS 4,000 tons.** That is the definition rather than a default anyone
  picked, and both real lots carry exactly 4000 at `'Pay Values'!F4`, so
  `lot_tons` is seeded (`LOT_TONS`) instead of asked for. Still editable: the
  LAST lot of a job is short. Note it is emphatically NOT the approval's
  Tonnage, which is the whole contract quantity. `check_intake.mjs` asserts it
  both ways round - seeded, AND not still listed as something to type - because
  a value that is both is the worse bug: it tells a technician to supply a
  figure the form already holds.
  **The unit price is on the contract, and `kytc-items` was throwing it
  away.** A lot's whole pay adjustment is tons x this number. Both report
  layouts carry it and the parser read neither; the columns were read off the
  real reports rather than inferred, and `/tmp` probes against
  `252112-00135-EST0006` and `252112items00135` confirmed both:
  **pay estimate** is 13 columns, UNIT PRICE at index **9** (0 LINE ITEM
  NUMBER, 1 ITEM DESCRIPTION, 2 ITEM NO., 3 UNIT, 4 PLAN QTY, 5 CURRENT
  QUANTITY, 6/7/8 the three QUANTITY PAID columns, 9 UNIT PRICE, 10/11 the
  AMOUNT PAID pair); **item list** is 8 columns, Unit Price at index **5**
  (0 PROJ LN #, 1 Item Description, 2 BID CODE, 3 Bid Qty, 4 Plan Qty, 5 Unit
  Price, 6 Unit, 7 % of Bid Amt). `min` stays at 6 for the estimate, so a row
  that stops short of the money columns is still a line item and a missing
  price comes back null rather than dropping the row.
  **The price is NOT a column on the Project Items table** - it belongs to the
  lot, not to each row, and that table is already tight at 390px. DesignBook
  ignores it - a design is not paid. Verified end to end on contract 262120,
  whose 0.38B is line 0165 on `MP07606272601` at **$117.45/TON**.
  **CORRECTION, same day, to the sentence this replaces: the lookup FILLED
  `lot_unit_price` for about an hour and that was wrong.** A lot's unit price
  is not the contract's bid price. Contract 252112's line 0160 IS the mix both
  of Jake's real lots were produced under (`CL3 ASPH SURF 0.38A PG64-22`, item
  `22906ES403`) and the contract bids it at **$119.80/TON** - but both AMAWs
  carry **$50**, and 50 is the figure their pay actually used: lot 2's +26.25
  tons came to +$1,312.50, which is 26.25 x 50. Filling the bid price in put a
  number more than twice too large into every dollar adjustment, silently, and
  tinted as though the page knew it.

- **SETTLED 2026-09-13: the AMAW's "Unit Price" is the SPEC's $50.00/ton, the
  same for every mix type, and it is seeded rather than asked for.** Jake's
  question - "does the AMAW show 50 per ton as the unit price no matter the
  mix type?" - is what closed it, and the answer is yes, from three
  independent directions.
  **The spec says it outright.** 2026 Std Spec **402.05.02** (PDF p.182) puts
  both numbers in one breath: "The Department will pay for the mixture at the
  Contract unit bid price and apply a Lot Pay Adjustment for each lot placed
  ... The Department will apply the Lot Pay Adjustment for each lot to **a
  defined unit price of $50.00 per ton**." Two numbers doing two jobs - the
  bid price pays for the tonnage, the $50 scales the adjustment - which is
  why reading one as the other is a silent 2.4x error rather than an obvious
  one.
  **All three Lot Pay Adjustment Schedules open with the same constant**,
  whatever the mix: Option A Base and Binder (p.**185**), Option A Surface
  (p.**186**) and Option B (p.**188**) are each
  `Lot Pay Adjustment = ($50.00)(Quantity){...}`. Only the WEIGHTS differ
  between them, which is what `propertyWeights()` already models. (The
  Specialty Mixtures schedule - OGFC, ATDB, wedge, leveling and wedging,
  scratch course, 402.05.01 - is a separate table and was not read; PlantBook
  does not model it.)
  **KYTC's own blank AMAW agrees**: `'Pay Values'!F5` ships as a hard-coded
  `50` in the untouched VER 14.01 template - not a formula, not blank - so
  nobody typed it on those two lots either.
  So `ADJUSTMENT_UNIT_PRICE = 50` is seeded on exactly the same footing as
  `LOT_TONS`, and stays editable for the same reason. `check_intake.mjs`
  asserts it both ways round like `lot_tons`, and note it also had to re-point
  its "every schema field is present, null where unfilled" probe, which had
  been parked on `lot_unit_price` - now on `lot_wedge_tons`, which is optional,
  blank in both real lots and derived by nothing.
  The lookup still reports the contract's bid price beside it, because that is
  genuinely useful and genuinely a different quantity. **The field is arguably
  misnamed** - it is the adjustment basis rather than a price - but it is what
  the workbook calls it, so the label follows the workbook and the derivation
  note carries the explanation.

- **Still NOT auto-filled on the Lot step, and both are open questions rather
  than settled answers** (2026-09-13):
  **ESAL Class** was refused deliberately, and **that refusal was WRONG -
  corrected the same day, see the entry below.** It is the design's own Class.
  **Acceptance method / density option / joint density counts** are KYTC's
  per-lot decisions about how this lot is accepted and paid, and the approval
  is a design. Both real lots are Volumetrics / A / Yes, so a tinted default
  is defensible - but `propertyWeights()` answers for exactly three
  combinations and weighs EVERY property at zero for the rest, so a wrong one
  is a silent 0% lot. Left blank pending Tate.
  **All of this moved the same day - see the entries below.** Joint density is
  derived from the mix, the density option turns out to be on the proposal
  rather than being anybody's decision, ESAL Class is the design's own Class,
  and the unit price is a spec constant. **Acceptance method is now the ONLY
  field on the Lot step still waiting on a person.**

- **CORRECTED 2026-09-13: the AMAW's "ESAL Class" IS the design's Class, and
  refusing to map it was this file's own mistake.** Jake: "esal class is easy,
  its what ever class the aproval is such as CL3 or CL2 or CL4". He is right,
  and the note above was wrong in a way worth understanding, because the same
  error is easy to repeat.
  **What the refusal got right and what it got wrong.** It is true that the
  2026 spec's Class 2/3/4 is not an ESAL count and not a depth - the
  Department renamed the concept away from ESALs. What does not follow, and
  what the note assumed, is that the AMAW's box labelled "ESAL Class" is
  therefore a *different quantity*. **KYTC never relabelled the workbook.**
  This is the same family as `Field Rutting` still saying "Hamburg Pass 100
  Left Max" when the sheet is IDT-HT, and the MixPack's `P52:P55` Criteria
  formulas still branching on the old ESAL-era table: an old label over a
  renamed thing. The general lesson is that **a stale label is evidence about
  the workbook's age, not about the quantity** - resolve it by asking what the
  cell DRIVES, not what it is called.
  **Doing that settles it decisively.** `Calculations!D15` feeds
  `airVoidPay()`, whose two branches are `cls === 1 || cls === 2` and
  `cls === 3 || cls === 4`. Those branches reproduce the 2026 Std Spec AV
  table verbatim - and that table's own two columns are headed **"AADTT Class
  2"** and **"AADTT Class 3 or 4"** (pp.185/186/188). The low branch pays
  `1.00+0.1(AV-3.0)` over 1.5-3.1 and 0.75 over 6.1-6.5; the high branch
  starts at 2.0 and has no 0.75 band at all - exactly the spec's two columns.
  A field that selects the AADTT Class table is the AADTT Class.
  Corroborated by both real lots: CL3 ASPH SURF 0.38A, `D15` = 3.
  `esalClassFor(mix, aadttClass)` takes the design's `aadtt_class` field first
  and the signature's CL prefix second, accepts a "CL2" spelling, and returns
  **null rather than a default** for anything outside 1-4 - an out-of-range
  class pays ZERO everywhere except the 3.0-4.0 air-void band, so a guess
  there is far worse than a blank. The workbook's picklist also offers 1,
  which no mix signature can produce; `airVoidPay()` treats 1 and 2 alike and
  it stays hand-pickable.
  `check_intake.mjs`'s assertion was INVERTED rather than deleted, so the file
  records that it once claimed the opposite.

- **Joint density is settled by the MIX, and the density option is on the
  PROPOSAL - neither is a per-lot preference** (Jake, 2026-09-13: "Joint
  cores is just if it's surface 0.38 or 0.50, which we already know", and
  "the options should Option A or Option B. That could be auto found off the
  proposal which we already tie to the approval").
  **Joint density is derived and no longer asked for.** 2026 Std Spec
  402.03.02 D) 6) Option A reads "Joint - For surface mixtures placed on
  driving lanes and ramps, furnish 2 cores per sublot" (PDF p.178), and every
  proposal's OPTION A special note says it again in its own words: "The
  Department will require joint cores as described in Section 402.03.02 for
  surface mixtures only." So `jointDensityFor(mix)` is SURF + 0.38/0.50 ->
  yes, anything else -> no, and it inherits tinted and editable like every
  other provisional value. Two things about it are load-bearing. **A NO.4
  surface is NOT on the list** - the note's scope is "at 1 inch (25mm) or
  greater" and a No. 4 is a thin lift, which is why Jake named the two sizes
  rather than saying "surface". And **an unknown course returns `null`, never
  "no"** - a design that reached PlantBook with neither a signature nor a
  Portal mix lookup has no layer to read, and collapsing that into "no" would
  silently drop a surface lot's 15% joint-density weight to no deduction at
  all. The field stays a field rather than becoming a readout, because the
  proposal's OPTION note is what finally says so and a lot may have to
  disagree with the derivation. The label lost the word "counts".
  **The density option is stated in the Contract** - 402.03.02 D) 6) opens
  "The Contract will state the compaction option to be used" - so it is a
  lookup rather than a question, and the dropdown now reads "Option A" /
  "Option B" as the proposal writes them. It is NOT yet fetched, and the
  reason is worth knowing before anyone tries: **the note is written PER
  ROUTE, so one contract can be both.** 262120 - the contract Jake is testing
  against - carries "OPTION A (KY 627)" and "OPTION B (US 25)" on facing
  pages of its own proposal, and the design's project number is what picks
  between them (#467PA is on `MP07606272601`, the KY 627 one). Closing it
  means `kytc-lookup` returning the OPTION notes WITH their route qualifier;
  it returns the proposal header and the mix items and no notes at all today.
  That is Andrew's function, and it already downloads and parses that exact
  PDF - `required_mix_designs` comes out of it.

- **The producer/supplier lab belongs to the PLANT, and
  `supabase/plants_lab_id.sql` is the DDL for it - written, NOT applied**
  (Jake, 2026-09-13: "The producer lab id should be somewhere in supabase,
  given the approval is tied to this plant this should be in there somewhere
  and auto populated"). He is right about where it belongs: an AMAW's
  `'Pay Values'!I6` names the lab that ran the contractor's acceptance tests,
  every lot a plant produces has the same one, and this project's standing
  rule is that a value belonging to a plant goes in `plants` rather than into
  a page. `loadPlantLabId()` reads it and `applyPlantLabId()` fills the field,
  tinted, on the same terms as every other provisional value.
  **It is its OWN query, deliberately** - not another column on the plant-name
  select and not on `CONFIG.REFERENCE.TABLES.plants`. PostgREST answers a
  select naming a column that does not exist with a 400 for the WHOLE row, so
  folded into either of those a not-yet-applied migration would take the plant
  NAME down with it here, and the entire RAP producer list down with it there.
  As written it degrades to the empty field it already was.
  **Nobody has seeded a value and there is no worked example of one** - both
  real AMAWs leave I5 and I6 blank - so the seed is Andrew's, from what KYTC
  actually holds, not from a pattern inferred here. **Open for Jake: what is
  Allen's P/S lab id?**
  **The Department's lab (I5) is deliberately NOT derived.** KYTC's lab-unit
  list turns out to be in the MixPack template all along, at
  `Chart Data`!AV2:AV14 - `LU00642` then `LU01210` ... `LU12210`, which reads
  as Central plus one per district 1-12. That is worth knowing beside
  `CONFIG.MIXPACK.DISTRICTS`, whose only entry is `07 -> LU00642` taken off a
  real approved MixPack. Note those two DISAGREE if the list is read as
  district-keyed, and the likely reason is that they are different questions:
  a design is approved centrally (LU00642) while a lot is accepted in its
  district. Do not derive an AMAW's KYTC lab from that list until somebody
  confirms it.

- **The 1/4" sieve is off PlantBook's gradation tab too, and the note that
  kept it there was factually wrong** (Jake, 2026-09-13: "on the gradation tab
  lets get rid of the 1/4" sieve please"). `sections.mjs` had claimed "the
  AMAW carries it as a real measured row on all four sublots, so PlantBook
  keeps it". Checked against both of Jake's real lots: **`Gradation` row 16 is
  EMPTY in both** - all four sublot columns (D/G/J/M) and the JMF column (N).
  It is as dead on an AMAW as it is on a MixPack, which reads "N / A" there
  and is why DesignBook dropped it on 2026-09-07. Seven columns of an
  always-blank row is seven fields a technician is asked for and cannot
  supply, plus a column of dashes on the 0.45 chart. The tab is 13 sieves x 7
  columns now, 91 fields rather than 98.
  **The WORKBOOK keeps all fourteen rows, and that is the part to be careful
  with.** `GRADATION.sieves` in `addresses.mjs` is the AMAW's own row order
  and still has the 1/4" at index 6; the mapper walks THAT list and matches
  the form's by LABEL, so a sieve absent from the form writes blank to row 16
  rather than shifting #4..#200 up a row - exactly the class of bug the
  SheetJS chartsheet note above is about. **Never renumber the workbook list
  to match a form's.** `check_intake.mjs` now asserts the full shape of that
  slot (14 long, index 6 is the 1/4" with no schema key, index 7 is `#4`) so
  a later tidy-up cannot quietly shift it, and asserts that no `s6_3` field is
  seeded at either end. Verified end to end: `check_mapper` still reports 0
  unexplained cells against both real lots.
  The two books' sieve lists now agree, but do not start indexing across them
  - anything shared (the control-point band, `trimFlatCoarseEnd`) still keys
  on `mm`, never on position.

- **A row table key may now be shared between the books, but only out loud.**
  `check_sections.mjs` fails a PlantBook row table whose key collides with a
  DesignBook one - the key is the `data-rowlist` attribute and the payload's
  table name - unless the spec declares `sharesKey: "<reason>"`, which takes a
  sentence rather than a `true` and is PRINTED on every run beside the
  unverified citations. Exactly one table uses it: `project_items` is
  literally the same sheet with the same ListObject (A6:C99) and the same
  three columns in the MixPack and in the AMAW, so one name for it is right
  and two would be the drift the file exists to catch. The two books never
  render at once, so the attribute is still unique in the document.

- **Two layout findings from the splice, both measured rather than
  eyeballed.** **Inside an `overflow-x` container, `width:100%` is not a
  width, it is a squeeze.** `table.sievetable` sets it, which is right for
  DesignBook's two columns and wrong for a lot's eight: at 360px it gave every
  sieve input 40px and every value clipped inside a container that was
  supposed to be scrolling instead. 89 clipped inputs at 390px, 2 after
  `.gradwrap.wide table.sievetable{width:auto; min-width:100%}`. And **the
  verification table's Record column holds a 28-character caption that does
  not fit its track, and widening the track was tried and reverted** - 2.4fr
  took the width straight out of Gmm, Va, VMA and Pbe, which are figures a
  person reads rather than a caption they already know. It clips, says the
  whole thing in its `title`, and is recorded in the baseline: the same
  conclusion this file reached for the producer name.

- **A repeating row on a phone packs its FIGURES three-up and gives only its
  TEXT the full width** (Jake, 2026-09-13, off a phone: "surely this isn't the
  best way to show or ask for this information... the gsb per sublot could be
  one table like the AMAW or displayed more efficiently"). The one-column rule
  below 560px was written for a 48-character producer name and was being
  applied to `2.66`, so "Combined Gsb, by sublot" - which the schema already
  declares as ONE row of four columns - came out as four full-width boxes down
  the screen. `rowHTML()` marks a cell `.num` when its column is
  `type: "number"`, `.rowitem` runs on six tracks, and a text cell takes
  three of them (two-up) or six (one-up below 560) while a figure takes two.
  Measured at 390px rather than eyeballed, and it is worth a lot more than it
  sounds: **PlantBook's whole page went 19,517px -> 15,000px** (the blend
  3,664 -> 2,146, sublot volumetrics 2,516 -> 1,156, Combined Gsb 283 -> 147)
  and **DesignBook's 15,059px -> 12,797px** with the TSR specimens
  5,296 -> 3,778. That is five phone screens off one book and three off the
  other, for a rule about what a number is.
  **The tabs half of that report was withdrawn** - Jake was on a phone and had
  forgotten that the one-scroll shape below 700px is deliberate and his own
  call (see the two-shapes note above). Do not add a per-row tab strip or a
  phone wizard on the strength of that message.

- **Three live bugs found while building PlantBook, all in DesignBook or in
  KYTC's own workbook, all now fixed or recorded:**
  **The section head's kicker disagreed with the action bar.** `renderForm()`
  wrote it as `Step ${i+1} of ${tops.length}` - a SCHEMA count - so the navy
  band read "Step 1 of 9" over a bar reading "Step 1 of 8" on every Type D mix
  AND on every design before Nominal size is typed, which is the default a
  contractor opens on. The rail and the bar had both been fixed for exactly
  this; the kicker was the third place and was missed. It is painted in
  `paintStepChrome()` now, from the same counter as the rail dots, on every
  section rather than only the active one (below 700px they are all on one
  scroll). The harness check that caught it fails again if the fix is reverted.
  **An approval PDF called itself a review copy.** `handoffPayload()`
  hard-codes `doc_kind: "review"`, `freezeSubmittal()` overwrites it, and
  `approvedPayload()` did neither - so every approval ever issued carried
  `"review"` in its payload and `CONFIG.HANDOFF.DOC.approval` was declared and
  assigned nowhere. One line. Safe both ways: `doc_kind` is deliberately
  outside what the signature covers, so no issued approval is invalidated, and
  both readers test only for `submittal`.
  **`'Pay Values'!C6` reads `#N/A` in both approved lots and it is KYTC's bug,
  not ours.** The plant VLOOKUP range is `'Producer supplier'!B3:C106` while
  that list now runs to row 140 and `AMP070302` sits at row 130, so Boonesboro
  can never resolve. The mapper notes it rather than working around it.

- **SETTLED 2026-09-13 (Jake): the mix id is EIGHT digits.** Both real AMAWs
  carry a five-digit lead whose tail is the pay item code (`00385 CL3 ASPH
  SURF 0.38A PG64-22`) and `canonical.mjs` issues eight (`00260467` for
  #467PA); asked which shape MEDL expects, and the answer is eight. So
  DesignBook's id is carried through untouched, the five-digit form on the two
  real lots is read as the older shape rather than as the standard, and
  `intake.mjs`'s `mix-id-shape` warning is gone. **The pay item code stays its
  own field** (`'Pay Values'!D3`), because it always was one - the five-digit
  form merely happened to end in it.

- **One PlantBook question still open for Andrew and Tate, not guessable:**
  **An MCL air void or VMA on sublot 1 of lot 1 pays 100%.** `'Pay Values'!G13`
  is `IF(AND(F3=1,AH9>=90),100,AH9)` and in Excel a text value outranks every
  number, so `"MCL" >= 90` is true. Reproduced because it is what every lot
  approved on this workbook was paid by - but we are now the second system
  doing it, which is worth Tate confirming. Note the sublot-1 allowance is
  gated on the LOT number (`F3=1`), not the sublot, despite the caption.
  Also unresolved: `Calculations!A72` computes a capped 100% and
  `'Pay Values'!G26` prints "Final Pay should be made at 100% Maximum", but
  `J23`/`J24` multiply the UNCAPPED figure and both real lots were paid
  uncapped. Lot 2's +$1,312.50 may or may not be what KYTC actually pays.

- **PlantBook shipped with two debts open, deliberately** (Jake, 2026-09-13:
  "Let's get it built we can change that after"), and both are stated here
  rather than hidden in the code.
  **`sections.mjs` carries three spec citations that are UNVERIFIED** -
  `accept403` (KYTC 403.03.04), `density403` (403.03.05) and `pay403`
  (403.05), cited from eight sections between them - inferred rather than
  opened and read in the real document, which is not the standard every
  DesignBook citation was held to. They carry `verified: false` and NO page
  number, because a cite chip is a link and a link to a guessed page is worse
  than no chip, and `check_sections.mjs` prints every one of them on every
  run. **They are merged into `CONFIG.SPECS.CITES` all the same**, because a
  `cites` key `specLink()` cannot resolve renders the KEY as the chip
  ("accept403"), which is worse than either - so the page draws them as a
  muted, dashed, non-linking `span.cite` whose title says "section not yet
  page-verified, so this does not link". A key that resolves to NOTHING still
  prints bare, deliberately: that is a typo, not a citation, and the loudest
  way to say so. To close it: open the 2026 Standard
  Specifications, record each section's PHYSICAL page and its section-relative
  footer ("403-7"), and move the entry into `CONFIG.SPECS.CITES`. The book has
  no named destinations and no running page numbers, which is why the footer
  is recorded too - it is how you re-find the page in one search when the next
  edition moves it.
  **No browser-built AMAW has ever been loaded into MEDL**, the same debt the
  MixPack still carries.

- **PlantBook's form keys and the AMAW mapper's keys never met, and every
  generated AMAW paid ZERO because of it** (found 2026-09-13, chasing Jake's
  question about the mixture type code). `sections.mjs` prefixes every lot
  scalar `lot_` - it has to, both books share `state.extracted.scalars` and
  `county`/`unit`/`binder_grade` would otherwise be one key holding two
  records' values - while `mapper.mjs` was written against the WORKBOOK and
  reads `v.county`, `v.unit_price`, `v.esal_class`. Nothing translated. On a
  lot built from the form, **six header cells reached the workbook out of
  fifteen**: county, unit price, both lab ids, the mix line, the acceptance
  method and the three flags were plain `undefined`, and `write()` skips an
  absent value by design, so not one word was said about it. Two of the
  missing ones are `Calculations!J1` and `!D15` - every property in the pay
  schedule gates on those, so the AMAW downloaded, opened, and paid nothing.
  Why no check caught it: `check_mapper.mjs` builds its `values` by reading a
  real completed workbook, so it speaks the mapper's vocabulary natively and
  the seam it shares with the form was never on either side of a test. The
  fix is `LOT_FIELD_ALIASES` + `lotScalars()` in `mapper.mjs`, one table, and
  `check_sections.mjs` now fails **both** directions - an alias naming a field
  the schema no longer has (which is how deleting a field would go unnoticed)
  and a `lot_` scalar with no alias (a value the workbook will never see).
  The exceptions are a listed set, so a genuinely cell-less field is a
  deliberate line rather than a silent pass.
  **A prefix strip would not have done it**, which is the argument for a
  table: five say it differently on the two sides (`lot_kytc_lab` ->
  `kytc_lab_id`, `lot_ps_lab` -> `ps_lab_id`, `lot_binder_terminal` ->
  `binder_producer`, `lot_handmix_binder_pct` -> `hand_mixed_ac`,
  `lot_mix_id` -> `mix_id_line`) and one is spelled the same (`lot_tons`).
  **Two of them are conversions, not renames, and both were wrong in the
  dangerous direction.** `Calculations!H12` is the density option as 1/2
  while the form spells it "A"/"B" the way the proposal does. And
  `Calculations!M11` is a **boolean** with `H11 = IF(M11,1,2)` on top of it,
  while the form spells joint density the way H11 READS - so a "2" (no joint
  cores) wrote a truthy 2 into M11 and the workbook read it back as YES, on a
  15% weight. Both convert in `lotScalars()`, and only for a value that came
  off the form: a value already under the mapper's own name wins, because
  `check_mapper` reads M11 itself.
  General lesson worth more than the bug: **two vocabularies for one fact
  need a checked table between them, not a convention** - a convention is
  invisible when it stops holding, and `undefined` is the quietest failure
  this codebase has.

- **'Pay Values'!D3 "Item Code:" is not asked for and not written - it feeds
  NOTHING** (Jake, 2026-09-13: "do we need the item code part?"). Answered by
  reading the real files rather than by opinion: no formula anywhere in
  either completed lot references `'Pay Values'!D3`, and no `t_*` staging row
  sources it. It is a printed header cell; MEDL never sees it.
  **And it was never ours to derive.** The 385 both lots carry is the lead of
  the **bid item** at D9, which is picked from the workbook's own catalogue
  at `Calculations!BB3:BF349` ("00385 CL3 ASPH SURF 0.38A PG64-22", and C9
  VLOOKUPs column BF for the material code 25500). That is KYTC's catalogue
  number for the mix, not the contract's line: contract 252112 bids the same
  mix as the supplemental `22906ES403`, and `00385` appears in no contract in
  the JMF corpus at all, while `00388` (the 0.38B) appears on five. So a box
  asking a technician for it was asking for a number they could not source
  and nothing would read. One line in `sections.mjs` if KYTC ever wants it
  printed; `check_mapper.mjs` carries the reason as an expected difference,
  so the cell being absent stays explained rather than becoming noise.
  **CORRECTION to this file, found the same way: D9 is not "the approved mix
  design" and D7 is.** The note above under PlantBook's intake called D9 the
  MIX ID + signature and the join between the two books. Its printed label is
  "Matl. Code:" / the bid item, and the cell the workbook labels **"Approved
  Mix Design:" is D7**, which in both real lots reads `07640AMD260403` - and
  D7 is the one `t_smpl` actually reads. Nothing on the form supplies D7 yet;
  `generate.mjs` already names it as missing, so that gap fails loud.

- **"ESAL Class" is labelled AADTT Class on the form, and the mixture type
  code and Type of Mix are gone** (Jake, 2026-09-13: "Type of Mix (AMAW)
  isn't needed. I don't know what the mixture type code is and esal class
  should be AADTT Class like in the design book"). Three small changes with
  one idea behind them: **a form asks in the words of the person filling it,
  and translates on the way out.**
  The field key stays `lot_esal_class` because it is the workbook's cell
  (`Calculations!D15`); only the label moves to DesignBook's words. Already
  established above that the two are the same quantity - `airVoidPay()`'s two
  branches reproduce the spec table whose own columns are headed "AADTT Class
  2" and "AADTT Class 3 or 4" - so this is the label catching up with the
  finding.
  `lot_mix_type_code` and `lot_type_mix` are **deleted, not hidden**.
  `Calculations!J1` is a translation of Nominal size and nothing else, so
  `mixTypeFor()` answers for it at each use - `lotMixTypeCode()` on the page
  for the pay tables and `Cores!C`, `lotScalars()` in the mapper on the way
  to the workbook - and there is no stored copy to drift from the size it
  came from. `'Pay Values'!B5` needs nothing written at all: the template has
  it as `IF(Calculations!J1=0,"",LOOKUP(...))`, so Excel recomputes the
  phrase. The intake stopped seeding both and now reports the one case that
  matters against the field a person can actually fix - a nominal size the
  Superpave table has no row for, which zeroes the pay schedule.
  `check_intake.mjs` asserts BOTH halves (the lot does not store the code,
  AND `lotScalars()` derives 5 back out of the size it does store), because a
  removal that quietly lost the value would pass the first half alone.

- **The density option is looked up off the proposal now, and joint cores
  follow from it** (Jake, 2026-09-13: "I thought you were deriving the density
  option from the proposal?... once that is figured out the we will know if
  joint cores apply because its only for 0.38 and 0.50 mixes"). The note above
  said closing this meant `kytc-lookup` returning the OPTION notes. It does
  not return them, confirmed by calling the deployed function rather than
  trusting the note: header, `required_mix_designs`, items, no notes at all.
  And it is Andrew's, in a Supabase project this repo has no access to.
  **What it does return is `source_filename`**, and that turned out to be the
  whole key. The proposal is named `<call no>-<COUNTY>-<yy>-<nnnn>.pdf` and
  nothing on a contract carries the call number, so that name is the one thing
  a contract ID cannot produce - everything else is public. So the page calls
  `kytc-lookup` exactly as the Portal and Contract Information already do,
  takes the file name, and hands it to a new **`netlify/functions/kytc-notes`**
  which fetches the PDF and reads the OPTION notes out of it. No change to
  Andrew's function, and the same CORS-proxy shape as `kytc-items`.
  **The PDF reading is `node:zlib` and about eighty lines** - inflate every
  FlateDecode stream, keep the text-showing operators - and it is deliberately
  not a PDF library. It is also NOT sufficient everywhere, which is the part to
  remember: a page set in a subsetted CID font with a custom CMap decodes to
  control characters, and **the Project(s) page of 262120's own proposal is one
  of those** (which is also why the PCN -> route question below is still open).
  `hasText()` checks the result reads as English before anything is parsed out
  of it, and a page that fails returns a stated failure - a wrong Option letter
  is worse than no Option letter, because a wrong one weighs every pay property
  at zero and nothing on screen says so.
  **The note is per ROUTE, so the function returns a list and the page fills
  nothing when there are two.** 262120 carries "OPTION A (KY 627)" and
  "OPTION B (US 25)" on facing pages; 252112 carries a bare "OPTION A". One is
  applied; two are named, the same answer `applyProjectItems()` gives when two
  mixes could be the design's. Closing THAT needs the design's project number
  resolved to a route, which is the Project(s) page, which is the font problem.
  **Then joint cores follow, and the narrow rule is the one worth guarding.**
  Option B takes no cores at all. Option A takes them "for surface mixtures
  only" - and only at 0.38 and 0.50, so **a NO.4 surface is NOT on the list**
  (a thin lift, outside the note's "at 1 inch (25mm) or greater"), which is the
  case a reasonable person gets wrong by shortening the rule to "surface".
  `jointDensityFor()` already held all of it; what it never had was the COURSE,
  which comes off the contract's own mix item (`layer: "SURF"`). An unknown
  course leaves the field BLANK rather than collapsing to "no" - "no" is a real
  answer that would silently drop a surface lot's 15% joint-density weight.
  Two checks, because the two halves fail differently:
  `scripts/kytc/check_notes.mjs` guards the parser against fixtures from both
  real proposals (including the two decoys every one of these documents
  carries - the contents listing's "COMPACTION OPTION A" and the KYCT note's
  "the Option A or Option B test fixture"), with `--live` for the real PDFs;
  and the harness's new `compaction` check guards what the PAGE does with an
  answer, refusals asserted as hard as fills. Both watched failing.
  **A section-head lookup is a declared thing now**, not a hardcoded button:
  `lookup: { key, label }` in the schema, `state.lookupNotes[key]` for the
  message, and `<key>LookupBtn` / `<key>LookupNote` for the ids so two lookups
  on one page can never answer to one `getElementById`. DesignBook's
  `lookup: true` still means its contract lookup and reads the same way.
  The lot carries **`letting_date`** and **`layer`** on `values.design` for
  this: `kytc-lookup` 400s without a letting date, and a lot reopened from its
  .json had lost it - the lookup would have been dead on exactly the lots that
  run for a week.

- **Where a prefilled value came from is on the control, not under it**
  (Jake, 2026-09-13: "lets get rid of the grey letter below each box"). The
  `.srcnote` line is gone; the text is the input's `title`. **This does not
  weaken the provisional-value rule**, and it is worth being precise about
  why: that rule says an extracted value must read as provisional rather than
  as fact, and the TINT is what says so (`.prefilled`, plus the warning rail
  behind it). The sentence naming the source cell is the detail behind the
  tint, and `extracted_from` in the payload is where the audit trail has
  always actually lived. What it cost was real: PlantBook's Lot step inherits
  most of its fields, so it was twenty paragraphs of provenance standing
  between a person and the four boxes they actually have to fill.

- **The Verification step computes now, off its own weights** (Jake,
  2026-09-13: "verification needs to be similar to lot pay in terms of the
  full calc and information on the bsg msg and air voids"). It was seven typed
  figures per record - %AC, unit weight, Gmm, Va, Pbe, VMA, VFA - which is the
  same mistake the Sublots step made until three days earlier, and the same
  argument settles it: the AMAW computes all of them from weights already on
  the bench sheet, so typing them is how a lot ends up disagreeing with the
  workbook it will be loaded from. Three weighings per record now.
  **Three things about `Super Verify` are NOT guessable from the QC side, and
  all three came out of KYTC's own blank template rather than by analogy:**
  **It rounds NOTHING.** `Superpave` rounds the bulk volume to a tenth and
  each BSG and each sublot MSG to three (`F12 = ROUND(E12-D12,1)`,
  `G12 = ROUND(C12/F12,3)`, `C41 = ROUND(...,3)`); the same quantities here
  are bare quotients (`F8 = E8-D8`, `G8 = C8/F8`, `C25 = C20/(C22-C23+C24)`).
  Same workbook, same arithmetic, two different formulas - the hand-mixed
  sample's already-recorded quirk, one sheet over. `bsgSpecimen()` and
  `msgAverage()` take a `{ round }` option for it and the checker asserts the
  rounded form would NOT match, so a later tidy-up cannot quietly align them.
  **The %AC is BACK-CALCULATED, never typed.** A verification sample is a box
  of mix off the road - nobody weighed binder into it - so its binder content
  is recovered from its own Gmm against the lot's Gse
  (`Pb = 1.03(Gse-Gmm) / (Gmm(Gse-1.03)) x 100`, `J28`) and then corrected for
  the water in the mix (`J27 = J28 - M39`). That is the entire reason the
  sheet carries a moisture block and the Sublots step does not, and it is why
  the step needs a moisture table nobody would otherwise have added.
  **The Gsb is the VERIFIED SUBLOT's**, not the lot's: `K10`/`L10` branch on
  `B5` and read `Superpave!R9`/`S9`/`T9`/`U9`. So "Verifies" on the first
  table is load-bearing arithmetic rather than a label - with it blank there
  is no Gsb, and Pbe and VMA are blank and say why.
  **`check_verify.mjs` is a different KIND of check and the difference is
  worth understanding.** `check_volumetrics.mjs` reads raw weights out of a
  completed lot and compares every derived cell to what Excel itself cached
  there - the strongest kind available. That is impossible here: both of
  Jake's completed AMAWs leave `Calculations!L1`/`L2` empty, meaning no QA or
  IQ sample was ever taken on either, so every cell of `Super Verify` is blank
  in both and there is no cached answer to compare to. So this one seeds the
  blank template's input cells and evaluates the template's OWN FORMULAS with
  `scripts/mixpack/formula.mjs`, matching 53 cells. The expectations are still
  the workbook's; what is still owed is a real lot with a real verification on
  it. Stated in the code, not just here.
  Three functions the shared evaluator lacks - AVERAGE, ISERROR and AND - are
  expanded inside that checker rather than added to `formula.mjs`, and that is
  deliberate: adding AVERAGE there would change which cells a generated
  MixPack or AMAW banks as a literal instead of leaving to Excel, which is a
  real change to two shipping generators and has no business riding along
  inside a checker.
  **One deliberate divergence from the workbook, the only one in
  `volumetrics.mjs` that is not a reproduction.** `M39` gates on the BEFORE
  weight alone, so in Excel two blank cells under a filled one read as zeros
  and the formula returns a confident **100% moisture** - which would come
  straight off the back-calculated %AC as a four-point error on a printed
  record. Every other quirk in that file is mirrored because a real approved
  lot was judged by it; nothing was ever judged by this one. `moisturePct()`
  requires all three weights and `check_verify.mjs` asserts both halves - that
  ours is blank, and that the workbook's own answer there is 100.

- **`PB_VOL` was the fifth namespace and the drift checker did not know it
  existed.** `check_page_plantbook.mjs` lifted four blocks by banner and swept
  them against their modules; `PLANTBOOK VOLUMETRICS` was spliced in on
  2026-09-13 and never added, so the page's copy of `volumetrics.mjs` and the
  module could have diverged silently for as long as anyone liked - which is
  precisely the thing that file exists to prevent, and it went unnoticed
  because its summary table reads "0 fail" whether a block is in step or
  absent. Now five blocks, sixteen sweeps, and the summary names it. Watched
  failing: changing `PCF_PER_SG` to 62.5 in the page's copy alone reports 6
  drifts. **When a sixth namespace is spliced in, add it to `BANNERS` and to
  `PAIRING` in the same commit** - a block that is not in both is not checked,
  and nothing says so.

- **PlantBook's first and seventh steps are "Contract & Mix" and "Lot Pay"**
  (Jake, 2026-09-13: "rename lot to contract and mix, and the one named pay
  name lot pay"). Labels only - the section ids stay `lot` and `pay`, because
  every id in the two schemas is distinct on purpose (`lot-status` versus
  DesignBook's `status`) and renaming one to read better on screen would trade
  a caption for the `getElementById` collision CLAUDE.md records for the moved
  `#advanceStage` node. The step's contents already were the contract and the
  mix; "Lot" was the file's word for the record rather than for what the step
  asks.

- **The clipping baseline was carrying a lot of entries that had stopped
  clipping, and the harness had been saying so every run.** `re-bless to
  tighten` appeared on fourteen widths across both books before this change -
  the `.rowitem` three-up rule of 2026-09-13 fixed most of them and nobody
  re-blessed. Re-blessed now: 110 stale lines out of, 22 in. A stale baseline
  is not neutral, it is a hole - every key it lists is one this check can no
  longer catch, and the only sign was a PASS note nobody was reading.
  **Read the diff before committing a blessing, and read it for REMOVALS as
  well as additions.** The one addition here is `va` on PlantBook's
  verification volumetrics at 360px, and it is worth knowing what it is: the
  harness fills every raw weight with junk, so the back-calculated %AC comes
  out at 54% and Va at **-217.80** - seven characters where a real lot's is
  "6.84". Any `.num` cell clips at seven characters in a three-up row at
  360px, the sublot volumetrics table included; it simply never produced a
  negative under the same fill. So the entry records a width limit that is
  real and a value that is not.

- **Acceptance method is WHICH TESTS THE DEPARTMENT ACCEPTS THE LOT ON, and
  it follows from the mix - so it is derived now, and the Lot step has
  nothing left waiting on a person** (Jake, 2026-09-13: "lets get the
  acceptance method auto filled too, that was my prompt what does that even
  mean?"). The name is the problem: it sounds like a preference or a grade
  and it is neither. 2026 Std Spec **402.03.02 A)** - an ordinary asphalt
  mixture is monitored on "the AC, air voids (AV), voids-in-mineral aggregate
  (VMA), density, and gradation" and paid under 402.05.02's schedules, which
  is **Volumetrics**. **F)** - a specialty mixture (OGFC, ATDB, pavement
  wedge, leveling and wedging, scratch course, temporary mixtures, base
  failure repair) gets "one AC and one gradation determination per sublot"
  and is paid under 402.05.01's separate Specialty schedule, which is
  **Gradation**. **Visual** is the third box; the nearest thing the spec has
  to it is ATDB's binder content, "based on visual inspection of the extent
  the aggregate is coated" (p.161).
  So the mix settles it, and `acceptanceMethodFor()` reads off the same
  `mixTypeFor()` the pay tables already gate on: a Superpave mixture is
  Volumetrics, and every lot PlantBook can open is one, because the front
  door is a DesignBook approval and DesignBook designs Superpave mixtures.
  Both real lots read `Calculations!H20` = "Volumetrics".
  **NULL for anything else, and that is the load-bearing half.**
  `propertyWeights()` answers for three flag combinations, all of them
  Volumetrics, and weighs every property at ZERO for the rest - and PlantBook
  does not model the Specialty schedule at all. A leveling-and-wedging lot is
  therefore not a lot this page can pay, and writing "Volumetrics" over it
  would be a silent 0% instead of a stated gap. `check_intake.mjs` asserts it
  both ways round and asserts the refusal.
  **`Calculations!H13` is the decoder and is worth quoting**:
  `IF(H20="Gradation",1,IF(H20="Volumetrics",2,IF(H20="Visual",3,"")))` - the
  WORDS are what the workbook stores, the CODES are what pay.mjs switches on.

- **The Verification step's "Method" column was the LOT's acceptance method's
  options over a completely different cell, and that is most of why the
  question was confusing.** It offered Volumetrics / Gradation / Visual for
  `Calculations!AU33`/`AU34` - which are fed by the same
  `VLOOKUP(AP.., AJ33:AK37)` as the four sublot rows below them, and that
  table is the **AC determination method**: `1 Back-Calculation of MSG,
  2 Extraction, 3 Ignition Furnace, 4 NACG, 5 Printed Ticket`. Both real lots
  read `AP35:AP38` = 3, "Ignition Furnace", on all four sublots. Two controls
  a step apart, one of them wearing the other's options, is exactly the shape
  that makes a form unanswerable. The column is `ac_method` now with the
  workbook's own five.
  **The PER-SUBLOT AC method is asked for now** - see the entry below, which
  closes the gap this paragraph used to record.

- **The per-sublot AC determination method is a column on the Sublots step's
  ticket table, seeded to Ignition Furnace** (Jake, 2026-09-13: "do it and the
  acc per sublot too", answering a note that said a lot-level field with a
  tinted default was defensible but that two files is not a rule). Per SUBLOT
  rather than per lot because the workbook has four separate cells precisely
  so it can differ, and on the TICKETS table rather than beside the %AC it
  describes because `sublot_volumetrics` is nine short figures and a
  24-character dropdown has no business in it.
  **`AC_METHODS` in `sections.mjs` is the one definition**, and the reason it
  has to be one is that the form's WORDS are the lookup key:
  `Calculations!AU33:AU38` is `VLOOKUP(AP.., AJ$33:AK$37, 2, FALSE)`, and
  `AJ33:AK37`'s own row order IS the code - 1 Back-Calculation of MSG,
  2 Extraction, 3 Ignition Furnace, 4 NACG, 5 Printed Ticket, read out of the
  real lot's shared strings rather than inferred. Reword an option and nothing
  errors anywhere: the VLOOKUP just finds nothing. `acMethodCode()` is the
  only translation, `check_sections.mjs` fails both `ac_method` columns if
  their options are not that list and fails a seed that is not one of them,
  and `check_page_plantbook.mjs` sweeps the page's copy against it.
  **Three real bugs came out of building it, all in the same few lines:**
  **`FLAGS.sublotAcceptanceLabel` was `CALC.sublotAcceptanceMethod`, which
  carries no `sheet` of its own - so every label write went to the address
  `"undefined!AU35"` and landed nowhere, silently.** It had been that way
  since the mapper was written. What kept it invisible is worth more than the
  fix: **`check_mapper.mjs` read the value back through the same expression**,
  so both sides agreed on a cell that does not exist and the comparison passed.
  A checker that derives an address the way the code does cannot catch a wrong
  address - it can only catch a wrong value at a right one.
  **AU33:AU38 is ONE shared formula over all six rows**, not "wired only for
  the two verification rows" as the mapper's comment claimed. So the CODE is
  what is written plain, into AP, and the label rides in `evalOnly` - the
  staging bank needs the words (the evaluator does not do VLOOKUP) while Excel
  recomputes the same words from AP on open. Writing the label over its own
  formula would be the trap this file already records: a value whose inputs we
  never wrote, blanked the moment the archived copy is opened.
  **`AP33`/`AP34` are the two verification records' code cells** - `AQ33`/`AQ34`
  caption them "Super Verify # 1"/"# 2" - and nothing wrote them at all; the
  mapper wrote only the label, into the formula cell above. Both are written
  now, and the Verification step's own `ac_method` column (added the same day)
  had no path to a cell until this.
  Not seeded on the two verification records, deliberately: the Department
  states its own method, and inheriting the plant's would be inventing it.

- **A lot saves as a PDF and submits as one, the same way a design does**
  (Jake, 2026-09-13: "if you want to save you can generate a pdf at any point
  and save what you have similar to the design book... when you want to submit
  you make a pdf and you will email it to tate and andrew"). Three buttons on
  the Submit step now: **Download lot PDF** (the save, at any point),
  **Download working copy (.json)**, and the AMAW. Closing the lot then
  pressing Submit stamps it, freezes what was stamped, downloads
  `PlantBook_submittal_<cid>_lot<n>_<mixid>_<date>.pdf` and names Andrew and
  Tate - the technician sends it.
  **The server stays out of the mail path**, the same conclusion this file
  already records for DesignBook and for the same reason: a provider
  authenticates by DKIM records in a domain you control, this is KYTC's system
  rather than a contractor's, and nobody can add DNS records to `gmail.com`, so
  sending as `@ky.gov` would need the Commonwealth Office of Technology to
  authorise a third-party sender. **And the same tradeoff: a lot submittal is
  UNSIGNED.** Whoever is signed in is stamped on it; nothing proves it was not
  edited afterwards. Only a DesignBook approval is signed, and a lot INHERITS
  that signature rather than issuing one - which is why the lot PDF's header
  prints the approval's own verification state (`passed` / `failed` /
  `not-checked`) rather than a code of its own, and why a lot is **Accepted**
  and never "Approved".
  **`buildReviewPDF()` lays out whichever book the PAYLOAD names**, not
  `state.book` - it is also handed a frozen submittal stamped in an earlier
  session, and the file is what says what it is. `handoffPayload()` writes
  `book` for exactly that. A payload from before this change carries none,
  which reads as DesignBook, which is what all of them are. CLAUDE.md used to
  say "the three `CONFIG.SECTIONS` left in `buildReviewPDF()` are deliberate";
  there are none left there now. `buildApprovalPDF()` still names it twice and
  correctly - only a design is ever approved.
  **Most of PlantBook prints through the generic path already in that
  function** (grid pairs + row tables), because PlantBook's section ids are
  disjoint from DesignBook's by construction. Three needed a bespoke
  `RENDER` entry and each for a different reason worth knowing:
  `jmf-figures`, because its three values are READOUTS and are not in
  `values` at all (they are on the lot's `values.design`); `pay`, because it
  is computed and is likewise in no field - `handoffPayload()` banks it as
  `lot_pay` when the file is made, and the renderer goes through the page's
  own `payText()` so an **MCL** stays the string it is and an untested
  property stays a dash rather than becoming a zero; and `sublot-gradation`,
  because a multi-column sieve section composes its keys as
  `${column.key}_${sieve.key}` and only `sievesHTML()` knew that.
  **`openLotEnvelope()` is the ONE reader for both doors.** A lot comes back
  as its `.json` or inside a lot PDF's attachment and both carry the same
  envelope, so they must land in the same place; two readers would be two
  answers to "what did I just open" and the second would be wrong the first
  time anybody added a field. **The door routes on `payload.lot`, not on the
  file name** - a person renames a download and a payload does not rename
  itself, and getting it wrong is not a small error: reopening an approval AS
  a lot would silently start a second lot on a design somebody had already
  produced four thousand tons under.
  **`state.submitted` is ONE slot shared by both books** (the book switch is a
  re-render, not a navigation), so it is gated on `submittedFor(book)` rather
  than on merely existing - otherwise a lot submitted this session offers
  itself on DesignBook's Status step and rebuilds as a design. Opening another
  lot clears it, because a frozen submittal from the previous lot would be the
  right file under the wrong lot with nothing on screen saying so.
  Verified end to end in a real browser rather than by reading: a lot PDF
  built from a real approval round-trips `values`, `rows` AND the whole `lot`
  envelope byte-identically, reopens through `startLotFromPDF()` with a marker
  value intact, and the printed sheet carries all eight steps - the pay table
  included, with its "no weights defined ... pays 0 on every property" note.

- **The approval's three figures are on Lot Pay now, not on Contract & Mix**
  (Jake, 2026-09-13: "take the jmf ac, target av and minimum vma off the
  contract and mix tab"). They are not contract facts and not mix facts - they
  are the three constants the pay schedule is measured against - so they sit
  beside the pay they produce, as `jmf-figures`, an `into: "pay"` sub-block on
  the same mechanism Consensus Properties uses inside Aggregate Structure.
  Still READOUTS, for the reason that has not changed: a signature that covers
  a value and a form that lets someone retype it are contradictory. When the
  approval is missing they read "—" and the pay above has nothing to compute,
  which is now said in the place where the emptiness is explained rather than
  a step and a half away from it.
  **`check_sections.mjs` had a rule refusing an `into` host with a bespoke
  body renderer, and the rule was factually WRONG** - `renderForm()` writes
  `${sectionBodyHTML(s)} ${child}`, so children are SIBLINGS of the body and
  are appended whatever the type. It was a guess about the renderer, and a
  guess in a checker is worse than no rule: it refuses a correct schema and
  reads like a fact. Checked in a browser before it came out.
  Also that day: the step's rail name capitalises the M ("Contract & Mix"),
  and **the book switch golds "Plant" in PlantBook** the way it golds "Book"
  in DesignBook - `<span>Plant</span>Book`, on the existing `.book.on span`
  rule, so it is gold only while that book is current.


- **Every repeating table's column headings were sitting over the wrong
  values, in BOTH books, at every width, and nothing could see it**
  (2026-09-13, found while filling a lot in to screenshot it for Andrew and
  Tate). A row table is a header strip and a row strip - two grids sharing one
  `.rowscroll`. Sharing a scroller makes them SCROLL together; it never made
  them AGREE about where a column is. `min-width:max-content` was on each of
  them separately, so each sized its own tracks from its own content - the
  header from its labels, the rows from their values - and the moment the
  scroller was narrower than either, the two resolved to different widths.
  Measured across both books: **7px to 969px out, at every width from 800 to
  1500**. DesignBook's TSR specimens was 606px out at 1500px. A technician
  reading a value under the heading two columns to its left is the worst kind
  of wrong: the data is right and the page is lying about what it is.
  **The fix is one grid COLUMN rather than two min-widths.**
  `.rowscroll{display:grid; grid-template-columns:minmax(max-content,1fr)}`
  puts both children in the SAME track, which is at least the larger of their
  two max-contents and at most the container, and both stretch to it - so
  there is one set of track widths and they cannot drift. The scroll still
  happens, because the track may exceed the container, which is the behaviour
  this file already asked for ("a table that cannot fit its columns SCROLLS
  rather than squeezing them").
  **Half of it was a 26px hole, and that half is worth knowing on its own.**
  A removable table's last track is `auto` and the row puts its remove button
  there; the header's trailing spacer was an EMPTY `<div>`, so the header
  handed 26px back to its `fr` tracks that the row kept for the button, and
  every column drifted. `.rowhead > .rowspacer` is `.rmbtn`'s width now - keep
  the two equal.
  **Why no check caught it, which is the part to carry forward.** Per-input
  clipping compares an input to its own box; the page-scroll assertion is
  page-level; the `collectForm()` round trip only reads values. **Every
  existing check measured one element against itself.** A heading in the
  wrong place is two elements disagreeing, and nothing was comparing two
  elements. The harness has `every column heading sits over its values` now -
  absolute, no baseline, because a heading off its column is never acceptable
  at any width however long it has been that way (318 checks, up from 286).
  Note the check has to ask whether `.rowhead` is actually LAID OUT rather
  than what the viewport is: below 700px it is `display:none` and the rows are
  cards with their own inline labels, and comparing zero-size cells there
  reported every table as hundreds of pixels out - the check being wrong, not
  the page. Watched failing both ways round.


- **The AMAW download is REVIEWER-ONLY, reversing a note that stood for one
  day and said the opposite in capitals** (Jake, 2026-09-14: "the contractors
  don't need to see the upload for medl, they should only see the PDF that is
  to be submitted to kytc. Just like on the design book Andrew and Tate with
  reviewer access can take that submitted PlantBook PDF and turn it into the
  medl file").
  **What the reversed note argued, and why it lost.** It said the MixPack is
  gated because a contractor never loads SiteManager, whereas the AMAW is the
  contractor's OWN document - what they fill out over a lot, and the lot pay
  is most of why they care. The first half of that is still true and is now
  the reason for the gate rather than against it: **MEDL is KYTC's loader, so
  a workbook only the Department can load is a button that can only confuse
  the person it is shown to.** The second half turned out not to be at stake,
  which is the part worth carrying: **the lot pay is ON the two PDFs**, fully
  computed, so nothing a contractor actually needs moved behind the gate. An
  argument that a gate costs somebody something is only as good as a check of
  what they lose.
  A contractor's Submit step is the **lot PDF** (the save, at any point), the
  **.json**, and Submit itself, which downloads the submittal to email. A
  reviewer sees the **AMAW for MEDL** as well, on `state.canReview`, the same
  gate and the same second guard inside the function that `downloadMixPack()`
  carries - hiding a button is UX and every page here is directly linkable, so
  the function refuses too, and says what the file is rather than that they
  may not have one. The note under the buttons changes with the gate, because
  a missing button explains nothing by itself.
  **The hand-off works because the submittal PDF carries the whole lot
  envelope inside it.** A reviewer opens that same file through the ordinary
  front door, `openLotEnvelope()` restores the lot exactly, and the AMAW is
  generated from there - the same shape as DesignBook, where the MixPack is
  built from the approval a reviewer is holding. Verified end to end in a
  browser rather than reasoned about: submit as a contractor, wipe the page,
  reopen the downloaded submittal as a reviewer, and `amawCells()` produces
  the workbook from it with a marker value intact, the stage reading
  Submitted, and `Calculations!J1`, `!D15`, `!H20` and `!H12` all present -
  the four cells the whole pay schedule gates on.



- **Every generated AMAW was nearly empty, and the end-to-end check that said
  otherwise - mine, 2026-09-13 - only ever looked at the four cells it
  named.** Measured 2026-09-14: a lot built on the form reached `amawCells()`
  with 15 filled row tables and 72 rows and wrote **13 cells**, with
  `coverage.blocks` at zero for all seven test records. Every ticket, every
  gyratory specimen weight, every Gmm bowl, every gradation, all 24 cores and
  both verification records went nowhere. What DID land is the lot header -
  including `Calculations!J1`, `!D15`, `!H20` and `!H12`, which is exactly
  what the entry above reports checking. **A verification that names the
  cells it checked is not thereby a verification of the file**; the honest
  version of that sentence would have been "the four cells the pay schedule
  gates on are present, and I did not look at the test data".
  **The cause is the second seam, and it is the same one as
  `LOT_FIELD_ALIASES` one level up.** That table translates the form's
  `lot_`-prefixed SCALARS into the workbook's words. Nothing did it for the
  TABLES: the form produces flat lists keyed by an identity column at
  `lot.rows.<key>`, while the mapper reads seven per-block records at
  `lot.records[block].values` / `.rows.<name>`, and `lot.records` was never
  created at all. `LOT_TABLE_ROUTES` + `lotRecords()` in `mapper.mjs` is the
  fix, declared as a table for the reason the scalars are: a convention is
  invisible the moment it stops holding, and `undefined` is the quietest
  failure in this codebase.
  **Why no check caught it, which is the part worth carrying.**
  `check_mapper.mjs` builds its `records` by READING TWO REAL COMPLETED
  AMAWs, so it speaks the mapper's vocabulary natively and this seam has
  never been on either side of a test. `check_sections.mjs` checks the schema
  against itself. Both were green throughout. The missing check was the one
  that starts where a TECHNICIAN starts - `check_bridge.mjs` now builds a lot
  from `PLANTBOOK_SECTIONS`, fills every cell the form offers, and asks what
  came out the far end (56 assertions; it was committed RED at `6bb2f6f`
  before any fix existed, which is why its header says so).
  **Four traps the naive bridge would have shipped, all caught by an
  adversarial pass before any of it ran** - three independent lenses over a
  proposed routing table, all three returning FLAWED, 27 defects:
  **(1) Silencing.** Every FIXED PlantBook table reaches the payload at full
  seeded length - `collectForm()` keeps a row if ANY cell is non-null and the
  identity columns are always painted - so routing rows unconditionally would
  have created seven records on a brand-new lot and stopped
  `if (!(rr.specimens||[]).length) need(...)` and its siblings firing on
  exactly the empty lot they exist for. A route drops a row whose
  non-identity, non-`readonly` cells are all null. Proved both ways round.
  **(2) The gradation is a UNIT mismatch, not a rename.** The form collects
  **% passing**; the workbook's input column is **grams retained**
  (`Gradation!B/E/H/K`, pan row 24, total row 25) with `C = (B/B25)*100` and
  `D` derived from `C`. There is no way back without a total mass. Jake chose
  (2026-09-14) to write the two derived columns over their formulas and leave
  grams blank. **Both halves of the pair, always** - `Superpave!O14`, the D/A
  dust ratio and a staged loader field, is
  `IF(OR(Gradation!D23="",L14=""),"",IF((100-Gradation!C23)/L14>1.6,">1.6",...))`:
  it GATES on the passing column and DIVIDES using the retained one, so
  filling only D hands MEDL a confident `">1.6"` on every block. One shared
  `writeGradationPair()` serves both sheets, same rule as `trimFlatCoarseEnd`.
  **(3) The two lists spell the same sieve differently.** The workbook says
  `1 1/2"` (space), the form says `1-1/2"` (hyphen) - so a label match
  silently loses 37.5 mm from the JMF target AND all six measured columns of
  every lot. `JMF_SIEVE_KEYS` maps BY INDEX into `GRADATION.sieves`, with
  index 6 (the 1/4", on the workbook and never on the form) held as `null`
  so nothing below it shifts up a row. Never renumber it to match the form.
  **(4) The page's `sublotIndexOf()` does not clamp.** It is `/(\d+)\s*$/`,
  so `"1-0"` is 0, `"10"` is 10 and `"1.5"` is 5, and `'QC0' + n` files a
  whole sublot's weights under a block that does not exist. The bridge has
  its own helper that clamps to 1..4 and REPORTS the refusal - a row dropped
  inside the bridge never reaches the mapper's own `unmapped` channel, so it
  would otherwise be the quietest possible loss of a measurement.
  **One correction the adversarial pass got wrong, and it is worth knowing
  that it can be:** it asserted `Superpave!F41:J41` are formulas and that the
  existing comment was false. Probed the shipped template - `C41`/`D41`/`E41`
  are formulas, `F41` through `J41` are **empty**. The comment was right and
  the correction was rejected. Check the workbook, not the confident report
  about the workbook.
  **Records still win.** A lot read back off a real AMAW passes through
  untouched, scalars AND row lists - the row-list half was a real bug in the
  first cut of `lotRecords()`, found by a pass-through test rather than by
  reading: the form's specimen row was APPENDED to the workbook's, putting
  two specimens in slot 0 to fight over the same address.
  After: **533 cells, all six storing blocks populated, `missing` 27 -> 7.**

- **Three cells the AMAW mapper writes to the wrong place or not at all,
  found while building the bridge and all verified against
  `public/AMAW_VER14_01.xlsm` rather than inferred.** They are pre-existing
  and independent of the bridge; tasks #40-#42.
  **`Gradation!D32` is EMPTY** - no value, no formula, no label - and no
  formula on any sheet references it, but `INPUTS.gradation.acRow` is 32. So
  the one figure a technician still types on the Sublots step, the
  ignition-furnace %AC the AC pay property is judged on, is written to a dead
  cell and the workbook silently substitutes its own back-calculation
  (`D34`, via `D33`, into `Superpave!B14`). The mapper's comment describing
  row 32 as "the typed one" was true of an older AMAW and did not follow
  VER 14.01's rewiring - the same stale-label trap as "ESAL Class" and
  "Hamburg Pass 100 Left Max", and the same remedy: resolve a cell by what it
  DRIVES, not by what it is called.
  **`Calculations!O1`/`O2` are `IF(M1,1,2)`** and `M1`/`M2` are the empty,
  writable booleans. `CALC.equipmentVerified` names O1/O2 - right for the
  loader's read side, wrong to write to - so a write lands in `evalOnly`,
  Excel recomputes from a blank `M1`, gets 2, and sn 114/115 ship **"No"**.
  That is a confident wrong answer, not a blank, on two technician-answerable
  fields. Same boolean-vs-1/2 shape as `Calculations!M11`, which this file
  already records getting wrong in the dangerous direction once.
  **`'Pay Values'!H13:H16` (minimum VMA) is typed and EMPTY**, while its
  neighbour `E13` (target %AV) IS a formula - which is why the mapper's
  comment lumps them together and skips both. `J13 = IF(I13="","",(I13-H13))`,
  so with H13 blank Excel reads 0 and the VMA pay deviation becomes the raw
  VMA (~15.6) instead of ~0.6. `'Pay Values'!J20` (wedge tons) is the same
  shape: `lot_wedge_tons` is a typed field WITH an alias and `amawCells()`
  never writes it anywhere. **An aliased field with no write is the quietest
  gap there is** - grep finds the alias and stops.

- **FIXED 2026-09-14, and it was a THIRD seam rather than the two cells the
  note above describes.** Probing a lot shaped the way `intake.mjs` actually
  builds one showed all three of `'Pay Values'!A13:A16` (JMF %AC), `H13:H16`
  (minimum VMA) and `J20` (wedge tons) unwritten - **the JMF %AC included**,
  which the note had not suspected because the mapper plainly reads
  `v.jmf_ac` and writes it.
  **The reason is that `values.design` is one level down.** The three figures
  the pay schedule is measured against come off the SIGNED APPROVAL rather
  than off the form, so `intake.mjs` writes them to `lot.values.design` and
  the Lot Pay step prints them as readouts - a signature that covers a value
  and a form that lets someone retype it are contradictory. `lotScalars()`
  spreads `lot.values`, so `v.jmf_ac` was simply `undefined` on every real
  lot. `DESIGN_LIFTS` is the declared table that lifts them, on the same
  footing as `LOT_FIELD_ALIASES` and `LOT_TABLE_ROUTES`, with the same
  "a value already under the mapper's own name wins" rule.
  **Three seams for one payload, and that is the thing to carry**: scalars
  (`LOT_FIELD_ALIASES`), tables (`LOT_TABLE_ROUTES`) and now the approval's
  own block (`DESIGN_LIFTS`). Each was found separately, each failed
  silently, and each looked like the only one at the time. When a value does
  not reach a cell, ask which of the three it should have travelled by before
  assuming the write is missing.
  **`target_va` is deliberately NOT lifted** and `check_bridge.mjs` asserts
  the refusal, because `'Pay Values'!E13` IS a formula (a LOOKUP on
  `Calculations!J1`) - so Excel supplies it and a write would land in
  `evalOnly`. That asymmetry between E13 and H13 is exactly what made the
  original comment skip both; assert the refusal or a later tidy-up
  "completing the set" puts a value in a formula cell.
  Wedge tons raises no `need()` - a lot with no pavement wedge is the
  ordinary case, and reporting it every run teaches people to skim the
  report. The minimum VMA does, because a blank one is a wrong number.


- **The Gradation step takes WEIGHTS now and computes the percentages**
  (Jake, 2026-09-14: "the gradation page needs to be where you can put in the
  weights and it generates the percent passing for you"). Same argument the
  Sublots step settled a day earlier, landing the same way: the AMAW computes
  % passing for itself from weights already on the bench sheet, so typing the
  percentage is how a lot ends up disagreeing with the workbook it will be
  loaded into.
  **It retires a decision taken the SAME MORNING**, and that is worth knowing
  rather than discovering. The bridge had been writing % passing and %
  retained OVER their formulas, because the form had no grams to give and
  `Superpave!O14` (the D/A dust ratio) gates on one column and divides using
  the other. With grams the workbook computes both natively - nothing is
  written over, the printed sheet carries the weights a reviewer can check,
  and the dust ratio falls out correctly on its own. Strictly better, and it
  means `writeGradationPair()` is now the FALLBACK path rather than the main
  one.
  **Column B is CUMULATIVE grams retained, and that was verified rather than
  reasoned.** `Gradation!C = (B/B25)*100` and `D = 100 - C`, and the sheet's
  own header cells (rows 8/9) read "Grams" / "Retained", "Percent" /
  "Retained", "Percent" / "Passing". `D = 100 - C` is only percent passing if
  C is cumulative. Confirmed with Jake. Row 24 is the Pan and row 25 the
  Total, and **the total is TYPED - the workbook does not sum column B** - so
  a column of weights with no total computes nothing at all, which is why it
  is the one `req` cell on the two foot rows.
  **The measured columns' field keys carry `_wt_` and are therefore NEW**,
  not a reinterpretation of the old `${col}_${sieve}` ones. Those held %
  passing, and silently reading 94.2 as 94.2 grams is exactly the quiet
  wrongness this file exists to prevent. `mapper.mjs` still READS the old
  keys, so a lot saved before the change still reaches the workbook and takes
  the writeOver pair; it simply stops being asked for on the form. Same rule
  as every other provisional value - never drop what a file already carries.
  **The JMF column stays a typed percentage.** `Gradation!N10:N23` are typed
  cells and a job mix formula is published as % passing - it is a target,
  not something anybody weighed.
  **The one guard worth copying: a cumulative series can only grow.** Per-sieve
  masses typed into a cumulative field is the single mistake this form cannot
  otherwise see - the arithmetic stays plausible and every number comes out
  wrong - so `gradationColumn()` counts the descents and says so by name, and
  cross-checks the finest cumulative plus the pan against the total sample
  mass. Both fire as non-blocking rail warnings, named by column. Verified in
  a browser: a real cumulative column reads
  100/100/100/99/92/81/60/44/33/24/17/11/6 with no warnings, and the same
  sample entered per-sieve raises both.
  **`computeGradation()` is the single producer** of the computed
  percentages; the readouts, the 0.45 chart and the rail all read
  `state.gradPassing`. `drawChart()` must NOT fall back to reading the input
  beside the readout for a weighed column - that input is grams now, and
  plotting 1410 as a percentage draws a curve off the top of the chart.

- **The sublot %AC is BACK-CALCULATED now, and `Gradation` row 32 was dead all
  along** (task #42, fixed 2026-09-14). PlantBook asked a technician to type
  the as-tested %AC and `INPUTS.gradation.acRow` wrote it to
  `Gradation`!D32/G32/J32/M32. Those cells are **EMPTY in the shipped
  template** - no value, no formula, no label - and referenced by **no formula
  on any sheet**. So the one figure a person still typed on that table went
  nowhere, and the workbook used its own back-calculation regardless.
  **The live chain, read off the template rather than inferred:**
  `Gradation!D34 = 1.03(Gse - Gmm) / (Gmm(Gse - 1.03)) x 100` - the
  back-calculation from the hand-mixed sample's Gse and this sublot's Gmm;
  `D33 = D34 - Superpave!G48` - less the moisture; and
  `Superpave!B14 = IF(D33="", D34, D33)`, which is the "% Binder in Mix" every
  AC pay value is a deviation from. Both inputs are cells the mapper already
  writes, so **the workbook computes it natively and there is nothing to
  write**. `volumetrics.mjs` reproduces the same chain for the page.
  **The AC determination method does NOT switch the source**, which is the
  question that had to be settled before any of this was safe.
  `Calculations!AU33:AU38` is read by the MEDL staging rows and one label
  lookup, and by nothing else - eight formulas in the whole workbook, all
  accounted for. So "Ignition Furnace" records how the lab measured it; the
  acceptance figure is the back-calculation either way. Same lesson as the
  ESAL Class correction: **resolve a cell by what it DRIVES, not by what it is
  called** - and the same method, a whole-workbook search for references.
  **Three consequences worth knowing.**
  **(1) The Sublots step gained a moisture table** (`sublot_moisture`,
  `Superpave` G/H/I/J rows 45/46/47), mirroring the one the Verification step
  has carried since 2026-09-13. It is not cosmetic: without it `D33` has
  nothing to subtract and the lot is paid on an uncorrected binder content.
  The mapper `need()`s it by name.
  **(2) PRECEDENCE IS BACKWARDS FROM WHAT IT LOOKS LIKE, deliberately.** An
  explicitly supplied `binderPct` WINS over the back-calculation, because
  `check_volumetrics.mjs` - the strongest check in that directory - reads raw
  weights out of a real completed lot, feeds the workbook's own
  `Superpave!B14` in, and compares every derived cell against Excel's cached
  values. That check must keep testing the workbook's arithmetic rather than
  ours. **So the PAGE must pass nothing**: `binder_pct` is readonly and the
  page PAINTS this function's answer into it, and feeding that painted value
  back would pin the %AC to whatever was computed first - entering the
  moisture afterwards would never move it. Verified in a browser: 5.89% with
  no moisture, 5.17% once 0.71% moisture is entered.
  **(3) It caught a live bug the gradation change had just introduced.**
  `sublotVolumetrics` was handed `pctPassing200` from
  `fieldValue("sub${n}_s0_075")` - which is GRAMS since that morning - so the
  dust ratio would have divided a weight by Pbe and printed the result. It
  reads `state.gradPassing` now. A key whose MEANING changes is not caught by
  anything that only checks the key still exists; grep for every reader when
  one does.

- **"Equipment verified" shipped a confident "No" to MEDL, and it was never
  written at all** (task #40, fixed 2026-09-14). `Calculations!O1` and `O2`
  are FORMULAS - `IF(M1,1,2)` / `IF(M2,1,2)` - over booleans at M1/M2 that
  ship empty, and the loader reads the O pair
  (`IF(Calculations!$O$1=1,"Yes","No")`, sn 114/115).
  `CALC.equipmentVerified` named O1/O2, which is right for the READ side and
  wrong for the write side; and in fact nothing in the mapper referenced it,
  so the two technician-answerable selects reached no cell whatever. A blank
  M1 makes O1 evaluate to 2, so every generated AMAW told the Department the
  plant's equipment had NOT been verified. **That is a confident wrong answer
  rather than a blank**, which is the worse failure of the two.
  `equipmentVerified` is `["M1","M2"]` now with `equipmentVerifiedRead`
  carrying O1/O2, so both sides are named and neither can be mistaken for the
  other.
  **The conversion is "Yes" -> 1 and "No" -> 0, NOT the 1/2 the formula above
  produces**, and the distinction is the whole bug: writing 2 for No would
  read back through `IF(M1,1,2)` as TRUE - the exact inversion CLAUDE.md
  already records for joint density at `Calculations!M11`. A TEXT value is
  equally wrong (`IF("No",1,2)` is a #VALUE!, not a flag). `YES_NO_BOOL` does
  it in `lotScalars()`, only for a value that came off the FORM, because one
  already under the mapper's own name is in M1's words and `check_mapper`
  reads M1. **An unreadable answer writes NOTHING rather than defaulting to a
  No** - a guess there is a claim about a Department inspection.
  **Silence is not neutral here, so it is reported.** A lot with a QA or IQ
  record and no answer to the flag gets a `note()` saying O1 will evaluate to
  2 and the loader will report "No". The workbook's behaviour is reproduced
  rather than worked around, but the file makes a claim the lot never made and
  that is worth saying once.
  **The two fields had been sitting on `check_sections`'s `NO_WORKBOOK_CELL`
  exception list**, whose stated reason was "Task #36: the mapper still reads
  the hand-mix and equipment blocks in a per-record shape". That was stale -
  #36 is closed and these were always ordinary lot scalars with a real cell.
  Worth carrying as a class: **an exception list is a place bugs hide**, and
  its entries need re-reading whenever the reason they cite is closed. Only
  the two genuine readouts (`lot_handmix_gmm`, `lot_gse`) remain on it.

- **PlantBook's three unverified citations are closed, and all three named the
  WRONG SECTION** (2026-09-14). They shipped a day earlier as deliberate
  guesses carrying `verified: false` and no page number, printed by
  `check_sections.mjs` on every run. Verifying them against the real 2026
  Standard Specifications was worth more than three page numbers:
  **`403.03.04` is "Transporting Material" and `403.03.05` is "Spreading and
  Finishing"** - real clauses, sitting right beside the mix-design ones
  DesignBook legitimately cites, and about something else entirely. A guessed
  citation that resolves to a real page is the worst kind, because nothing on
  screen looks wrong.
  **PlantBook's governing section is 402 - CONTROL AND ACCEPTANCE OF ASPHALT
  MIXTURES.** 403 is the mixture's own composition and construction
  requirements, which is why DesignBook's citations are there and a lot's are
  not. The three are now `accept402` / `density402` / `pay402`:
  **KYTC 402.03.02** (PDF **176**, footer `402-1`) - Contractor quality
  control and Department acceptance; **402.03.02 D) 6)** (PDF **178**,
  `402-3`) - in-place density, the compaction option and the cores; and
  **402.05.02** (PDF **182**, `402-7`) - the Lot Pay Adjustment, whose three
  schedules are on PDF 185/186/188 (`402-10`/`402-11`/`402-13`).
  **`402.03.02 A)` is worth reading once**, because it is the spec naming this
  workbook and confirming a constant we had only from two files: "The
  Department will accept asphalt mixtures from the plant on a lot basis. **A
  lot is 4,000 tons. A sublot is 1,000 tons.** Monitor and evaluate the AC,
  air voids (AV), voids-in-mineral aggregate (VMA), density, and gradation.
  Document and report all quality control tests for the Department's
  acceptance determination on the **Asphalt Mixtures Acceptance Workbook
  (AMAW)**." `LOT_TONS` now has a spec citation as well as two real lots.
  **The method, for the next edition.** The book has no named destinations and
  no running page numbers, so record the PHYSICAL page and the
  section-relative footer together. And **calibrate before trusting any page**:
  `ctrlpts` is PDF 193 / footer `403-4` and was already verified, so a copy
  that disagrees is a different edition and every page in `CONFIG.SPECS.CITES`
  needs re-deriving. That check took one probe and is what made the rest
  trustworthy.
  Verified in a browser afterwards rather than assumed: all eight distinct
  citation chips on PlantBook render as real `<a>` links with a `#page=`
  anchor, none muted. The dashed non-linking `span.cite` path stays in the
  stylesheet for the next unverified cite; it currently renders nothing.

- **The KYTC/producer-supplier lab id database landed 2026-09-17 (Andrew),
  closing the "Open for Jake"/"Open for Andrew" lab-id items above with two
  new Supabase tables rather than the single `plants.ps_lab_id` column
  those notes assumed.** Source: `PlantBook Lab IDs.xlsx`, a real 311-row
  export off SiteManager's `tsm.t_qualf_lab` (confirmed from the file's own
  `SQL` tab). Reconciled against the live `plants` table before writing
  anything — full reconciliation in
  `docs/plantbook-lab-id-reconciliation.md`.
  **Two tables, not one column, because the real data isn't 1:1.**
  `supabase/producer_supplier_labs.sql` (92 rows seeded) is one row per
  contractor lab code, tied to the AMP it tests for — 8 AMPs had 2-3
  competing codes and 26 codes' AMPs didn't match any live plant, both left
  OUT of the seed rather than guessed at (see the doc). `supabase/
  kytc_district_labs.sql` (80 rows seeded) is KYTC's own Central
  Office/district/design-build-crew labs, read-all like `plants`.
  `supabase/plants_lab_id.sql` is now marked superseded in its own header,
  unapplied, kept as historical record.
  **`producer_supplier_labs` is the first table in this project scoped by
  RLS rather than read-all** — Jake's ask, a plantbook user should only see
  their own company's lab codes. It reuses
  `technician_effective_plant_access` (the AMP-access view, not a new
  company-name-matching layer — `technicians.company` disagrees with this
  export's spelling too often to match on: "Hinkle Contracting" vs "Hinkle
  Contracting Corp."), so a technician's dropdown is exactly the lab codes
  for plants they can already see.
  Both fields on PlantBook's Contract & Mix step (`lot_kytc_lab`,
  `lot_ps_lab`) are dropdowns now, wired through the same
  `CONFIG.REFERENCE.TABLES` / `source:` mechanism as every other reference
  field — no new UI plumbing needed. `applyPlantLabId()` (designbook.html)
  was rewritten to auto-fill the P/S lab from `state.ref.
  producer_supplier_labs` by AMP match, replacing its old direct query
  against the never-applied `plants.ps_lab_id` column.
  **OPEN, DO NOT FORGET: every KYTC district/section lab has TWO codes on
  file (`LU#####` and `DL#####`, e.g. `D-01 Materials Section` is both
  `LU01210` and `DL01210`), and nothing proves which one the AMAW's 'Pay
  Values'!I5 wants** — both real completed AMAWs on file leave I5 blank.
  The dropdown defaults to `lu_lab_id` (confirmed correct for DesignBook's
  MixPack, `Chart Data!AV2:AV14`) purely because that's the series already
  proven elsewhere; the DL code rides along as an alias so a lot already
  typed with one still resolves. Flip the default in both
  `CONFIG.REFERENCE.TABLES.kytc_district_labs` (`designbook.html`) and
  `PLANTBOOK_REFERENCE_TABLES` (`scripts/amaw/sections.mjs`) if it turns out
  to be DL — check against a real filled-in AMAW's I5, or ask KYTC.

- **`producer_supplier_labs` now reads through `producer_supplier_labs_view`
  (a `security_invoker` join to `plants`, added 2026-09-17) rather than the
  bare table, so the PlantBook dropdown's subtitle reads exactly like
  `plants.name` — Andrew: "reconciled against the plants table... name
  that reads exactly like the name column from plants table."** It's a
  live join, never a stored copy, so it can't drift from `plants.name`.
  Kept the join in SQL rather than inside `label()`: every
  `CONFIG.REFERENCE.TABLES` entry's `label`/`value`/`aliases` must stay a
  pure function of its own row, because `check_page_plantbook.mjs` calls
  them directly with fixture rows in a Node `vm` context with no `state`
  global — a cross-table lookup inside one of those functions (reaching
  into `state.ref.plants`, which was tried first) throws there.
  **That join immediately surfaced 7 rows where the export's company name
  and the plant's actual current operator are different companies** — not
  spelling variants, real disagreements (e.g. `C513` "Purchase Asphalt LLC"
  sits on `AMP010201`, which `plants` has as "Central Paving Co. @
  Paducah"). Full list and the cross-referencing done against them in
  `docs/plantbook-lab-id-reconciliation.md` section 5.
  **Andrew: H. G. Mays Corp is one of the 7 and is "very much active" in
  his 14 months at KYTC** — worth remembering as a general caution: a
  mismatch between two data sources does not mean the older-looking side
  is wrong or retired. It can just as easily mean the AMP number itself is
  mistyped in one source. All 7 are flagged (`flagged_mismatch` +
  `flag_note` columns, kept rather than dropped) with wording that says
  only "unverified," never "old" or "wrong" — the PlantBook dropdown
  appends "⚠ unverified — doesn't match plants" to a flagged row's label,
  and `recompute()`'s reference-list sweep raises the same fact as a
  non-blocking rail warning if a lot's `lot_ps_lab` ever holds one of these
  values. The check is generic (any sourced field whose matched row carries
  `flagged_mismatch: true`), not special-cased to this one table.

- **Aggregate Blend's sublot tables silently wrapped back to the first
  aggregates whenever a design had fewer than six components** (found
  2026-09-17, Andrew, off a screenshot: sublot 2's table showing rows
  labelled 2,3,4,5,1,2). The AMAW's blend block is a fixed 6-slot table per
  sublot (`AGGREGATE.count`), and every renderer/mapper downstream slices
  the flat 24-row `blend_pct` array assuming a fixed 6-per-sublot stride
  (`sixOf4()` in `designbook.html`, `AGGREGATE.count` in `mapper.mjs`) -
  but `intake.mjs`'s seeding loop (and its byte-identical mirror in
  `designbook.html`) ran `agg.forEach`, so a 5-component design seeded only
  5 rows per sublot block. With that shorter stride, sublot 2's 6-row slice
  spilled into sublot 3's rows, sublot 3's into sublot 4's, and so on -
  which on screen read as the table "starting over with the first few
  aggregates" because a spilled-in row from the NEXT sublot at the SAME
  component position carries identical producer/type/BOD (every sublot's
  identity columns are seeded identically per component,
  `paintBlendMirrors()`). **Same class of bug this file already warns
  about with MAT_CORE_SEED - "the slots exist whether or not anyone [fills
  them], so they are seeded the same way"** - the fix loops to
  `AGGREGATE.count` now, not `agg.length`, so a design with fewer than six
  components gets its real rows plus genuinely blank ones, never someone
  else's data. `component` (1-6) is still always painted as the identity
  anchor even on a blank slot, same reason `MAT_CORE_SEED`'s `core_id`
  always is. Also repairs `mapper.mjs`'s AMAW output for the same reason -
  its own comment already assumed "`blend_pct`, 24 rows (six components x
  four sublots)", which the buggy seed was quietly not providing.

### Technician login & plant access

Login identity and plant-access scoping are two different keys, bridged by
one column:

- **The roster has no email addresses at all** — technicians are identified
  purely by SM ID (e.g. `jcavanah`). Supabase Auth's password provider still
  needs *some* email internally, so accounts get a fabricated one
  (`${sm_id}@technicians.mix.local`) the technician never sees until they
  onboard.
- **Accounts are bulk-provisioned, not self-signed-up.** All 376 technician
  auth accounts were created directly (an admin action against the
  database, done once — see `technicians.user_id` being set at the same
  time as the `auth.users` row, no separate claim step for this
  population) with the fabricated email and a **shared temporary
  password**. `claim_technician(sm_id)` still exists for onboarding anyone
  added to the roster *after* this initial rollout, but isn't part of the
  normal flow anymore.
- **Onboarding, forced on first real sign-in.** A technician's first
  sign-in uses SM ID + the temp password. `login.html` checks
  `technicians.onboarded`: if false, it walks them through setting a real
  email (confirmed via a real link Supabase sends — requires "Secure email
  change" turned OFF in Supabase Auth, since the old/fake address can never
  confirm anything) and then a real password, calling
  `mark_technician_onboarded()` (same SECURITY DEFINER pattern as
  `claim_technician()`) once both are done. Which of the two onboarding
  steps to resume into is decided by whether the account's current email is
  still the fake one, not by a step counter — so abandoning onboarding
  partway and coming back later resumes correctly. After onboarding, sign-in
  uses their real email + their own password, and Supabase's normal
  "forgot password" flow works since there's now a real address on file.
- **Known, accepted tradeoff during rollout**: every account starts with
  the *same* temp password, and that password is now written down in this
  file and in chat history. Until a technician onboards, anyone who knows
  or guesses their SM ID can sign in as them. Get people onboarded quickly,
  and don't publish this repo (or this chat) somewhere the temp password
  becomes public knowledge beyond your own team.
- Supabase's free-tier email sending is rate-limited to a handful of
  emails/hour — nowhere near enough to onboard 376 people in a reasonable
  window. A custom SMTP provider (Resend, SendGrid, etc.) needs to be wired
  into Supabase Auth settings before rolling this out broadly, or
  onboarding will stall on rate-limit errors partway through.
- Which plants (AMP numbers) a technician can see comes from
  `technician_plant_access`, a normalized (sm_id, amp_number) table — not
  the horizontal `AMP 1..AMP N` columns the roster spreadsheet uses for
  human readability.
- **Certifications gate which book(s) a technician can use, not just which
  plants.** Two cert types: `plant_tech` (everyone has this — it's earned
  first) and `mix_design_tech` (earned later, implies plant_tech-level
  competency). Plant Tech alone -> PlantBook only. Both certs -> PlantBook
  *and* DesignBook. This lives in `technician_certifications`
  (sm_id, cert_type, expires_on) plus a `technician_capabilities` view that
  computes `can_access_plantbook` / `can_access_designbook` gated on the
  cert being **currently unexpired** — a lapsed cert loses that access
  until the roster is updated and re-seeded, it doesn't stay granted
  forever just because the row exists. `login.html` already queries this
  view and shows the two badges post-login as a preview of what the
  real app will gate.
- Any future table holding real DesignBook/PlantBook data should scope its
  RLS off `technician_capabilities` (the plantbook/designbook yes-or-no
  gate) and `technician_plant_access` (which AMP numbers) — both already
  resolve from `auth.uid()` the same way, so join or reuse rather than
  re-deriving the logic a third time.
- The roster spreadsheets are the source of truth, not the database. When
  either changes, regenerate with `scripts/build_technician_seed.py`
  (it now takes *both* the Technician Plant Access file and the original
  per-cert roster file — see its docstring) and re-import via Supabase's
  Table Editor or SQL Editor. The generated CSVs/SQL contain real names —
  they are gitignored, never commit them.

### Plants

- **`plants` (`supabase/plants.sql`) is the single source for AMP number to
  plant name.** `technician_plant_access` holds only `(sm_id, amp_number)`;
  it has no name to join to, which is why this table exists. It is applied
  and seeded on the live project. Add a new plant there — never in a page's
  `CONFIG`, which would need copying into every page. A page resolves a
  label as plants table, then the bare AMP number, so an unseeded plant
  degrades rather than disappearing.
- **Plant names are read-all reference data**, not per-technician data:
  the RLS policy is `to authenticated using (true)`. Scoping reads to a
  technician's own plants would stop their dropdown labelling a plant they
  are about to be assigned. There is no write policy — seeding is an admin
  action.
- **Central Office Materials reviewers see every plant.** The 12 KYTC
  Central Office people hold both certs but have no
  `technician_plant_access` rows — correct, they review rather than
  produce. `technicians.all_plants` marks them, and the view
  **`technician_effective_plant_access`** (`supabase/effective_plant_access.sql`)
  is a technician's own access rows plus every plant when that flag is set.
  **Pages and RLS query the view, never the raw access table**, so "all
  plants" is derived in exactly one place. It is a flag, not 1,560 inserted
  rows, because inserted rows would vanish on the next roster re-seed and
  would miss plants added later. The seed script sets the flag by company.
  Applied live 2026-09-02; Andrew and Tate resolve to 130 plants, a
  contractor tech still resolves to only their own.
- The spelling is **Boonesboro**. The JMF corpus carries it both ways
  (`plant_name` says Boonesborough, the aggregate producer entry says
  Boonesboro); Boonesboro is what people expect.

### Designs: the file is the record, not a table

**Decided 2026-09-04 (Jacob). Design content is never stored in Supabase.**
Supabase holds identity and reference data only - technicians, certs and
capabilities, plant access, `plants`, and the four aggregate/binder reference
tables. What a contractor types into DesignBook lives in the browser and in
the files it produces, and nowhere else.

The flow, which is deliberately *not* a linear stage ladder:

1. A tech fills in DesignBook.
2. They **either** submit straight to KYTC - internal review is optional and
   skippable - **or** download a clean PDF, email it to their supervisor
   themselves, and stop.
3. The supervisor reviews it, signs in, uploads that same PDF, and the site
   rehydrates the entire form from it. They edit **in DesignBook**, with the
   real dropdowns and the validation rail, then submit.

- **Two artifacts, two jobs. Internal review is a PDF; the KYTC submission is
  a CSV.** The review PDF is a clean read-only one-pager with the design data
  embedded inside it as an attachment, so one file is both the human document
  and the machine payload - there is no separate CSV to keep in sync, and
  nothing parses the visual layer. `pdf-lib` attaches in one call but has no
  API to read an attachment back; that is ~30 lines walking the embedded-files
  name tree.
- **No editable PDF form fields - considered and rejected 2026-09-04.** An
  AcroForm round-trip fails silently when a reader flattens it (Mac Preview
  especially), needs every field placed at an x/y coordinate so it drifts from
  `CONFIG.SECTIONS` on every schema change, and makes the approval PDF look
  forgeable. The supervisor is signing in to upload anyway, so they edit in
  the page, where the reference lists and validation actually apply.
- **Internal review is not a stage the site can observe**, so it must not be a
  node in the stepper - a tech who legitimately skipped it would sit staring
  at a permanently grey step. Stages are **Draft -> Submitted -> Approved**.
  `Released` is gone.
- **Whoever is signed in when Submit is pressed is stamped on the package, and
  that is the whole proof of internal review.** The site cannot tell a
  supervisor's upload from the tech re-uploading their own file, and does not
  need to: if the SM ID on the submission is the supervisor's, it was
  reviewed. Contractor supervisors hold their own logins.
- **Nothing is stored, so closing the tab loses the work.** Autosave the
  in-progress form to `localStorage` (allowed here - see the artifacts rule
  above, this is a standalone Netlify app, and it never leaves the machine),
  and offer "download working copy" at any time, not only at the review step.
- **A status carried in a file is a claim, not a fact.** Postgres used to be
  the thing refusing to let someone approve their own design. Gate PDF and
  submission generation on the signed-in account (`can_review` for anything
  KYTC-side), and before anyone relies on an approval PDF, have a Netlify
  Function sign its hash and print a verification code on it - stores nothing,
  and it is the only place this model genuinely needs a server.
- **Export and import both generate from `CONFIG.SECTIONS`**, same rule as the
  form and the xlsx extractor. Never hand-write a field list for either.
  Rehydrating an uploaded PDF is the legacy-importer pattern reused, so the
  provisional-value rules apply: tint what came from a file, keep an off-list
  value with a warning, never blank it.

**Settled 2026-09-10: the server is out of the mail path entirely.** Submit
stamps the package, freezes it and **downloads** the submittal PDF; the
technician emails it themselves. `send-submission.mjs` is deleted and with it
`RESEND_API_KEY`, `KYTC_SUBMIT_TO` and `SUBMIT_FROM`. The reason is not
convenience: a provider like Resend authenticates by DKIM records in a domain
you control, this is KYTC's system rather than a contractor's, and nobody can
add DNS records to `gmail.com` — so sending as `@ky.gov` would need the
Commonwealth Office of Technology to authorise a third-party sender. A
technician's own mail already reaches `@ky.gov`. The destination is
`CONFIG.SUBMIT.KYTC_EMAIL`, which is not a secret and cannot make an open
relay because there is no relay. **Note the tradeoff: the submittal is
unsigned.** Whoever is signed in is stamped on it, but nothing proves the
file was not edited afterwards. Only the approval is signed
(`sign-approval`), and that is what KYTC issues and `verify.html` checks.

**The SiteManager hand-off is the MixPack itself, generated in the browser
(2026-09-11).** Once a design is approved, a reviewer downloads it as a
workbook: the payload is written into KYTC's blank
`public/MIXPACK2026_VER12_01.xlsm`, the ten hidden staging sheets are
evaluated and banked, and `<sample id>.xlsm` downloads for MEDL. Reviewer-
only - the sample id, MIX ID, approver and release date all come from the
approval, and a contractor never loads SiteManager. Three blocks in
`designbook.html`: `CONFIG.MIXPACK` (every template address, by meaning),
the `MIXPACK ENGINE` (a port of `scripts/mixpack/`, zip-level XML edits so
the VBA and XML map survive) and the `MIXPACK MAPPER` (payload -> cells,
with a report of what the design lacks that the page prints). Full notes,
including the two write modes and what a generated file still cannot carry,
in `docs/sitemanager-handoff.md`. `scripts/mixpack/check_page_engine.mjs`
runs the page's engine against a real MixPack in Node - run it after touching
either copy. Still owed: an actual MEDL load of a browser-built file, and the
lab-unit codes for districts other than 07 (`CONFIG.MIXPACK.DISTRICTS`).

**Built and live as of 2026-09-10.** This section now describes what
`kytcmix.netlify.app` actually serves. The sandbox branch merged that day
with Andrew and Tate's sign-off: there is no Save button and no `designs`
write, the stepper is the three-stage `Draft -> Submitted -> Approved`, and
the Portal's `?design=` branch is gone. Submit downloads the submittal for
the technician to email; Approve is signed by `sign-approval`; `verify.html`
is public.

Between 2026-09-04 and that merge, production still stored designs while
the *copy* from the new model had already reached it, so the page claimed
"This site stores nothing" while saving - corrected 2026-09-07 rather than
by ripping out a load-bearing button. That is why `designs` is not quite
empty: one Draft row from 2026-09-04 testing.

**Netlify environment variables are set** (2026-09-10, on the `kytcmix`
site, all contexts, functions scope): `SUPABASE_URL`, `SUPABASE_ANON_KEY`
and `APPROVAL_SIGNING_SECRET`. They are per-*site*, not per-branch, so a
deploy preview shares them. Two things learned setting them: Netlify bakes
them into the function bundle at **build** time, so a value added after a
deploy does nothing until the next build; and marking a variable `secret`
through the API silently fails to store it - it upserts with a success
message and is simply absent afterwards. Check `getAllEnvVars` after
setting one rather than trusting the reply. **Never change
`APPROVAL_SIGNING_SECRET`** - it invalidates every approval already
issued.

**The tables from the old model are applied but empty and no longer the
store.** `designs`, `design_events`, `design_summaries` and the stage trigger
(`supabase/designs.sql`) were verified live and never took a row - both counts
were 0 when the model changed. Stop writing to them; **do not drop them**, they
cost nothing and the bridge is worth keeping. Two things from that work are
still true and still used: `can_review` is deliberately separate from
`all_plants` ("sees every plant" and "may approve" are different powers, even
though the same 12 Central Office people hold both), and the way those rules
were tested is worth reusing - a rolled-back transaction impersonating a
contractor, a reviewer and an unrelated technician. `execute_sql` runs
read-only, so a write test goes through `apply_migration` and ends in
`raise exception` so nothing is recorded.

### Pages downstream of login

- **No session plumbing is needed between pages.** The Supabase JS client
  persists its session in `localStorage`, scoped to the origin, so any
  same-site page can call `supabase.auth.getSession()` and already have
  whatever `login.html` established. Deploy every page to the same Netlify
  site and do not invent a token hand-off or a shared-state module.
- **Capability checks belong at page load, not just on the button.** Every
  page is directly linkable, so a gate applied only to the link that
  navigates there is not a gate. `portal.html` and `designbook.html` each
  re-check `can_access_designbook` independently on load. This is UX gating
  either way — the real boundary is RLS.
- **The DesignBook form renders from `CONFIG.SECTIONS`.** That schema is the
  single source for the markup, the xlsx extractor, the validation rail and
  the save payload. Adding or renaming a field means editing the schema only.
  Do not hand-write field markup back in — four independent copies of one
  field list is four chances to drift.
- **Extracted workbook values are shown as provisional, on purpose.** Legacy
  MixPack imports tint prefilled fields and print the source cell
  (`from Sheet1!C14`) underneath, and ship `extracted_from` in the save
  payload. An extracted value is a starting point for a human, never an
  authority. Keep that visible in any future importer.
- **The Portal is the act of submitting, not a catalogue.** Steps 1-3 -
  contract & plant, mix (from `kytc-lookup`, always skippable unless
  `CONFIG.MIX_LOOKUP.required`), and how (upload or build in DesignBook) -
  are about *starting* a design and survive the 2026-09-04 storage change
  untouched. Step 4 and the lists behind the top-bar link ("My submissions" /
  "Review queue", `CONFIG.CONTRACTOR_STAGES`) read `design_summaries` and no
  longer have a data source: with nothing stored, a technician who closes the
  tab has only the files on their disk, so there is no queue to render. The
  Portal becomes two doors - start a new design, or open a file someone
  emailed you. Chosen from five mocked directions on 2026-09-03; the approval
  PDF and the SiteManager / AASHTOWare Project hand-off are still to build.


### Reference data (aggregates, binders)

- **Four KYTC reference tables feed the DesignBook dropdowns, all Andrew's:**
  `aggregates` keyed by `agp_number` (producer name plus a `category` of
  crushed_stone / sand_gravel / slag / sandstone), `aggregate_types` keyed
  by `type_name` (polish-resistant class A+/A/B and the five-digit
  SiteManager `mat_code`), `binder_terminals` keyed by `lap_number`
  (terminal name) and `binder_grades` keyed by `grade` (five-digit
  `sitemanager_code`). Applied and seeded live 2026-09-02/03 — 178 / 115 /
  26 / 12 rows. The DDL lives in `supabase/reference_tables.sql`; that file
  reproduces the structure only, the rows are the live project's data.
- **They are read-all reference data, the same pattern as `plants`:** RLS
  on, one `to authenticated using (true)` SELECT policy each, no write
  policy. Seeding and corrections are Andrew's admin action through the
  SQL Editor or Table Editor. One divergence from `plants.sql`: the
  `revoke all … grant select` step was never run on them, so `anon` and
  `authenticated` still hold Supabase's default DML grants. Harmless while
  RLS is on; the corrective statements are in the file, commented, for
  whenever Andrew wants to run them.
- **A DesignBook field declares `source: "<table>"` in `CONFIG.SECTIONS`**
  and the renderer builds its dropdown/datalist from `state.ref.<table>`,
  loaded once at page start. Never from a list in `CONFIG` — reference rows
  in a page's CONFIG would need copying into every page and would drift
  from the tables the moment Andrew adds a row.
- **A value that is not in the list is a WARNING, and it is kept.** Legacy
  MixPacks and mix prefill carry producers, type names, terminals and
  grades the tables lack (retired producers, older wording). The validation
  rail flags the mismatch; the save payload keeps the value as typed. Never
  blank or drop a value because a lookup failed — that is the provisional-
  values rule under "Pages downstream of login" applied to lists.
- **Add a producer, type, terminal or grade in the table, not in a page.**
  Same rule as plants: a row added to the table reaches every page on its
  next load; a row added to a page reaches one page.
- Two display facts worth knowing: `binder_grades` sorted by primary key
  puts CRS-2P before the PG grades, so sort explicitly; and the 115
  `aggregate_types` names resolve to only 42 distinct `mat_code`s (none
  null, 30 codes shared), so `mat_code` is a lookup from the chosen
  `type_name`, never a key to dedupe or select on — see the gotcha above.
- **A null `polish_resistant_class` is an answer, not a blank — the table is
  complete.** Checked against the live table 2026-09-07, all 115 rows: KYTC
  names the polish-resistant variants explicitly (`Dolomite #8's Class A`,
  `LS NSG Class B`) and leaves the plain ones plain (`Dolomite #8's`,
  `Limestone #8's`, `Natural Sand`, `Fine RAP`). 30 A, 20 B, 65 with no
  class, and **not one contradiction in either direction** — no name says
  "Class A" without the column agreeing, and no unqualified name carries a
  class. So a type that is on the list with no class is *definitively not
  polish-resistant*; only a type that is **not on the list at all** is
  genuinely unknown. Do not read the 65 as data Andrew still owes — an
  earlier note in this project said exactly that and was wrong.
  Two more facts fall out of the names, both used rather than asked for:
  `Dol.`/`Dolomite` are the only prefixes for the dolomite lithology (29
  rows, no false positives — `Sandst.` is sandstone), and `Natural Sand` is
  the one uncrushed sand in the list, so 403.03.03 A)'s 15% natural-sand cap
  and its dolomite footnote both resolve from the type name. `Granite Sand`,
  `Gravel Sand-Crushed`, `Siltsone Sand` and the Class A sands are
  manufactured and must not count as natural sand.
- **A legacy import resolves the producer by KYTC's own number, not by its
  name** (2026-09-11). Design Data's aggregate block carries **AGG. PROD. NO.
  in column A** beside the free-text PRODUCER NAME in column C, and the
  importer read only the name - which a MixPack writes freehand ("Haydon
  Materials", "Watson Sand and Gravel", "Clover Bottom Quarry"), so nearly
  every row raised an off-list warning and the producer had to be re-picked
  by hand on every single import. The number is an **AGP** for an aggregate
  row and an **AMP** for a RAP row, matching the two registries the Producer
  column already switches between, and both are already aliases on their
  reference entries - so `resolveProducerCode()` is a lookup, not a fuzzy
  match. The code rides on the row as `_agp`, which is deliberately not a
  schema column, so it never reaches the form or the payload. The lists reach
  `extractLegacy()` through `ctx`, not `state`, so it stays a pure function
  of its inputs; `resolveProducersLate()` re-runs the same resolution when
  the lists load after an import, touching only a cell that still holds
  exactly what the workbook wrote. `refMatch()` now delegates to
  `refMatchIn()` so the page and the importer cannot grow two definitions of
  "this value is that entry". General lesson, the third time this project has
  hit it: **when a workbook carries a key beside a label, import the key** -
  the same rule as the TSR thickness and `TSR!B38`.

- **Open for Andrew: `AGP011701` (The Allen Company @ Clover Bottom) is the
  one producer missing from `aggregates`.** Checked 2026-09-11 against every
  producer number that appears in the JMF corpus and in the MixPacks on hand:
  seven distinct codes, six of them present.
  `AGP004401` Haydon @ Greensburg, `AGP007401` Boonesboro Quarry,
  `AGP012102` Watson Gravel, `AGP016501` Gaddie Shamrock and `AGP027501`
  Haydon @ Airport Road are all there, as are both plants (`AMP070301`
  Berea, `AMP070302` Boonesboro) in `plants`. Only Clover Bottom is absent,
  and nothing matching "clover" or "bottom" exists under any other code, so
  it is a genuine gap rather than a naming difference.
  **CORRECTION to an earlier version of this note, which said no Allen
  Company quarry was in the table at all.** That was wrong, and wrong in an
  instructive way: it came from searching `producer_name ilike '%allen%'`,
  which returns only `SCOTTY'S ALLEN COUNTY STONE @ SCOTTSVILLE` - a
  different company - because **KYTC files a quarry under its SITE name, not
  its owner's**. `AGP007401` is an Allen quarry and sits in the table as
  `BOONESBORO QUARRY @ BOONESBORO`. Search this table by AGP number, never
  by company name.
  While confirming it: **one AGP number appears under at least four different
  names across real approved designs** - `AGP027501` is written "Haydon
  Materials, LLC-Airport Rd @ Bardstown", "Haydon Materials @ Airport Rd.",
  "Haydon Mateirals @ Airport RD" (sic) and "Haydon Materials", and
  `AGP007401` is written "Boonesboro Quarry @ Boonesboro", "The Allen Co @
  Boonesboro" and "The Allen Company @ Boonesborough". That is the whole
  argument for resolving on the number.
  **Category confirmed 2026-09-11 (Andrew): `crushed_stone`.** Andrew found
  the LAM's basic producer entry for `AGP011701` (approved, McKee KY,
  contact Dave Reilly) — that entry alone doesn't carry a material category.
  KYTC's own current Aggregate Source Book
  (`transportation.ky.gov/Materials/Documents/aggsourcebook`, 12/10/2025)
  settles it: District 11, p.27, lists `AGP011701* The Allen Company /
  McKee, KY - 13 miles north on US 421 (Clover Bottom) / Jackson County`
  under that district's **LIMESTONE SOURCES** heading — the same heading
  Boonesboro and every other Allen Co. quarry in `aggregates` falls under.
  (The `*` is the source book's own "Mine Operation" flag, unrelated to
  category.) Independently corroborated by public listings (industrynet.com
  lists it outright as "Crushed Limestone").
  **Inserted 2026-09-11 (Andrew), by hand in the SQL Editor** — the write was
  blocked here by Claude Code's auto-mode classifier (a live-database write
  it won't run unattended), so Andrew ran it himself and confirmed the row:
  `AGP011701 / crushed_stone / THE ALLEN COMPANY @ CLOVER BOTTOM`.
  `aggregates` is 179 rows now. This gap is closed; Clover Bottom rows
  resolve by AGP number like every other producer.

- **SETTLED 2026-09-11 (Jake): the polish fine column counts MATERIAL.** Both
  columns do now - `minus4(c) = pct * p4 / 100` beside the existing
  `contrib(c) = pct * (100 - p4) / 100`, and they partition every component
  exactly. A coarse aggregate's own minus-#4 is real polish-resistant fine
  material and is credited as such; a fine source no longer contributes its
  +4 to the fine side. On #467PA fine Class A goes 10.0% -> 15.1%. What the
  coarse/fine **Source** column still decides: the "100% Class B coarse"
  route and the non-PR-fine-retained-on-the-#4 check, both of which are
  genuinely about the designation rather than the material. The note below
  records how it used to work and why it changed.

- **OPEN FOR ANDREW - the polish-resistant class is a property of the SOURCE,
  and `aggregate_types` only carries it for the coarse sizes.** Jake,
  2026-09-11: "the Dol. #10's are dolomite and they're Class A". The table
  disagrees, and the shape of the disagreement is the point - checked live:
  every COARSE dolomite size carries a three-way set (`Dolomite #8's` /
  `#8's Class A` / `#8's Class B`, and the same for #67's, #68's, #78's,
  #9M's, NSG), while **`Dol. #10's`, `Dol. #11's`, `Dol. NSG Fine` and
  `Dol. Sand` have no classed variant at all** - Washed and Unwashed only,
  all null. `Dolomite Sand Class A`/`Class B` do exist, so it is not that
  KYTC never classes a fine dolomite.
  If Jake is right - and a polish value is measured on a quarry's ledge, not
  on a gradation size, so he very likely is - then **the "a null class means
  definitively not polish-resistant" inference recorded under Reference data
  is wrong for these sizes**, and `polishFactsFor()` is reporting proven-not
  where the honest answer is unknown. That inference is load-bearing: it
  decides `unknown`, which decides whether a failing check reads "Out of
  spec" or "Not proven".
  **This is a reference-data question and has deliberately NOT been patched
  in the page** - not by special-casing dolomite, and not by editing Andrew's
  table, which CLAUDE.md reserves to him. Two things make it less urgent than
  it looks: the matrix's Polish class dropdown is editable precisely for this
  ("the class can be changed here when the list does not settle it"), so a
  technician can set it per design today; and doing so on #467PA takes fine
  Class A to 23.5% and the verdict to **In spec**, which matches what KYTC
  actually approved. That is good evidence the class, not the arithmetic, was
  the gap - and it is the same conclusion the fine-column work reached from
  the other direction.

- **How the fine column used to work, for anyone reading old designs:** it
  was `role === "fine" ? c.pct : 0`. Raised by Jake 2026-09-11 - "are you counting the fine portion of the coarse
  aggregate in the fine portion?" The answer is no, and the asymmetry is
  real: `plus4Total`/`plus4ClassA` are `pct * (100 - p4) / 100`, so the +4
  route is actual retained material, while `fineClassA`/`fineClassB` are
  `pct * inClass(...)` gated on `role === "fine"` - a coarse-designated
  component contributes NOTHING to the fine total even though part of it
  passes the #4, and a fine-designated one contributes its WHOLE blend
  percentage rather than just its minus-#4 fraction. The spec's wording
  ("30% of total combined from a Class B fine SOURCE") is what the role
  reading rests on; nobody has confirmed it.
  **Worked on #467PA, because it settles what is actually at stake.** By
  role, fine Class A is 10.0% (the Natural Sand alone); by material it is
  15.1% (adding the Dolomite Class A's 5.31%, being 30% blend at 17.7%
  passing the #4). **Twenty percent is required, so the design fails either
  way** - changing the interpretation does not flip it, which means this
  question and the approval question are separate.
  **What decides #467PA is one component's class.** `Dol. #10's Washed` is
  10% of the blend at 84.2% passing the #4 and carries NO class in
  `aggregate_types`, but the uploaded workbook declared it polish-resistant
  (the page already warns about exactly this disagreement). Make it Class A
  and the design passes under BOTH readings - 20.0% by role, 23.5% by
  material. That is the likeliest explanation of the approval, and it is a
  reference-data question rather than an arithmetic one.
  The arithmetic has deliberately NOT been changed pending this.

- **Open for Andrew: does KYTC enforce 403.03.03 A)'s *fine* aggregate
  column?** The spec table gives Type B two columns — coarse (100% Class B,
  or +4 at least 50% Class A) and fine (30% of total combined from a Class B
  fine source, or 20% from a Class A fine source). Approved design **#467PA**
  passes the coarse column at 54.2% and has **0%** from any classed fine
  source, so it fails the fine column under either reading of that table's
  `-OR-` layout. The MixPack's own Polish-Resistant tab only ever computed
  the +4/coarse side, which is probably why it went through. Not resolved
  here; whichever way it goes it is a one-line change.

- **The "no class = definitively not polish-resistant" rule two entries up is
  true only as a reading of `aggregate_types`, and that table is not the
  Department's actual last word on polish class — the LAM (List of Approved
  Materials) is, and it certifies per PRODUCER, not per generic material
  name.** Found 2026-09-11 chasing a real DesignBook screenshot where a
  Haydon Materials dolomite sand and a Watson Gravel natural sand both
  autopopulated "Not polish-resistant" from `aggregate_types`, and the LAM
  says otherwise for both. Confirmed against the live LAM (pp. 37-51, Class
  A+/A/B Polish-Resistant Aggregate Source List, dated 12/22/2025): **Haydon
  Materials, LLC — Airport Rd. @ Bardstown (AGP027501) is Class A dolomite,
  restricted to Bench B** — a real approval `aggregate_types` cannot encode,
  since that table has no producer dimension at all, only a type_name one.
  Worse, the LAM certifies at **producer + bench/ledge** grain, finer than
  either `aggregates` (producer only) or `aggregate_types` (type name only)
  — the same quarry can have benches that qualify and benches that don't.
  **Natural (river) sand is the other half, and it is not a data gap at
  all — confirmed by Andrew: it is automatically Class A for any approved
  producer, no bench check, independent of this list entirely** (the LAM's
  own p.37 text: polish-resistant fine aggregate "includes... natural
  sands... which are on the Aggregate Source List" — the general producer
  list, not the lettered one). So `aggregate_types`' `Natural Sand` row being
  null is correct as data; the bug is that the page's PR logic reads null as
  "proven not PR" for every type, when for natural sand specifically it
  should mean "always Class A." Whether conglomerate sand and
  `Gravel Sand-Crushed` get the same automatic treatment is NOT yet
  confirmed — open question.
  A `polish_resistant_sources` table (agp_number, lithology, class,
  restriction_note) exists live, seeded with all 45 producer/bench entries
  from pp. 37-51, and **is wired into `designbook.html` as of 2026-09-11**:
  `polishFactsFor(typeName, producer)` derives a lithology from the type name
  (`polishLithologyOf()`), resolves the component's producer to its AGP
  number, and checks this table before falling back to `aggregate_types`'
  generic answer. Natural sand short-circuits to Class A directly, same
  function. The seeded value's caption now says which of the three answered
  ("LAM: Class A (Bench B)" / "Natural sand — automatically Class A" / the
  old generic wording), since a LAM-sourced class carries a bench/restriction
  this form has no field to verify and prints instead. Full extraction, every
  entry, and the open questions (does A+ imply A the way this table assumes;
  does the sand rule extend past natural sand; bench-level truth still has
  nowhere to live on the current Aggregate Structure form) are in
  `docs/lam-polish-resistant-sources.md` and `supabase/polish_resistant_sources.sql`.

- **A sliced row table's tabs must slice CONTIGUOUSLY AND IN ORDER, and
  covering every seed row exactly once does not imply it.** PlantBook's four
  Sublot tabs render one shared row table as four `[data-rowlist]` blocks
  (`sliceIndices`, Andrew's PR #19), and `collectForm()` reads them back in
  DOM order - tab 1's rows, then tab 2's. `sliceIndices` indexes into the
  SEED. Those are the same list only when the concatenation of the slices, in
  section order, is 0,1,2,...,n-1.
  PR #21 seeded the Department Verification tables **record-major** (QA01's
  four sublots, then IQ01's four), so tab n got `[n-1, 4+(n-1)]` and the
  concatenation read `0,4,1,5,2,6,3,7`. Every row rendered exactly once, the
  existing coverage check passed, and a save-and-reopen re-sliced a list that
  was no longer in seed order: **sublot 3's Department record came back on
  sublot 1's tab, permuting further on every cycle.** Invisible because the
  values travel WITH the row and `mapper.mjs` keys on them rather than on
  position, so the generated AMAW stayed right while the screen lied about
  which sublot it was showing. Found by the browser harness on 2026-09-15;
  all four module checks were green throughout.
  **The fix is the SEED order, never the slicer** - sublot-major puts sublot
  n's two records together at 2(n-1). `check_sections.mjs` now fails any spec
  whose slices do not concatenate to 0..n-1 in section order, naming the table
  and the position, so this cannot come back quietly.
  The deeper fix, if it ever does: merge a saved row onto its seed by the
  row's own IDENTITY cells rather than by index. Not done - the contiguity
  check is cheaper and the positional merge is in the shared renderer both
  books use.

- **PlantBook locks a sublot until its random sample point exists, and lot 1
  sublot 1 is the one that cannot be locked** (Jake, 2026-09-15: "we don't
  want people to be able to jump to future sublots... Only Lot 1, sublot 1 is
  the set up so in theory its always unlocked").
  A sublot is 1,000 tons (402.03.02 A)) and its sample is taken at a point
  chosen at random inside that tonnage, so sublot 3 cannot be recorded before
  sublot 3's material exists. The tool that draws those points is not built,
  and Jake chose to lock without a key rather than invent one: a locked tab is
  greyed, still clickable, and says what is missing.
  **The setup exemption is KYTC's, not ours.** `'Pay Values'!D13`/`G13` widen
  the AC ladder to 0.7 and rescue an air void or VMA to 100 on that one
  sublot, gated on the LOT number (`F3=1`) - `pay.mjs` has always reproduced
  it as `isFirstSublot` - and the MEDL staging's `VI01` record has no storage
  of its own, reading sublot 1's cells (`addresses.mjs`). Lot 1's first sublot
  is filed twice, once as production and once as the initial verification.
  `lot_number` decides it and needed no new machinery; a blank reads as lot 1,
  because the field is seeded to 1 and locking everything the moment somebody
  clears a box leaves a technician with no open form and no reason why.
  **THE BODY IS ALWAYS RENDERED.** A locked tab keeps every input in the
  document, disabled; the placeholder is a card ABOVE them. Dropping the rows
  is the obvious way to build a placeholder and it is the entry above from the
  other end - a missing block shortens the shared list, re-slices every later
  tab onto somebody else's rows, and loses those measurements from the AMAW.
  **LOCKED IS NOT THE SAME AS EMPTY.** Three states: open; locked and empty,
  which gets the card; and locked while CARRYING data, which renders read-only
  showing its values. The third is not hypothetical - a lot built under the
  bypass and opened without it lands there, as does any lot saved before this.
  Which columns arrive pre-filled is asked of the schema's own seeds rather
  than listed, because a hand-written list rots: the first cut used one and
  reported every blank sublot as already holding data, since `ac_method` is
  seeded to Ignition Furnace.
  **What is never gated is what describes the LOT rather than the sample** -
  the blend's component identity and the hand-mixed check sample, both on
  Sublot 1's tab. On lot 2, where sublot 1 is gated like any other, locking
  them with it would leave that lot no way to state its own blend. **Not**
  `blend_pct`, which is sliced per tab precisely so each sublot edits its own
  percentage, and is therefore that sublot's data.
  **Two ways through.** A reviewer (`can_review`) needs no flag - they receive
  the lot and build the AMAW from it, and a reviewer who cannot open sublot 3
  cannot review it. `?sublots=open` opens everything for anyone, banners the
  page, and stamps `sublots_unlocked` onto every file it makes, because a demo
  lot with all four sublots filled is otherwise indistinguishable from a real
  one and these files go to KYTC.
  **And it is a guardrail, not a boundary** - say so to anyone who asks.
  Every page here is directly linkable and the lot lives in the browser; this
  stops an accidental jump, not a determined one. The real control is that a
  submittal is stamped with whoever was signed in.
  Harness check `sublotlocks`, watched failing four ways.

- **`Nfr` is shorthand for `minmax(auto, Nfr)`, and that automatic minimum is
  MIN-CONTENT - so two grids handed the identical template at the identical
  width still resolve to different track widths.** This is what put every
  repeating table's headings back off their values on 2026-09-15, 3px to 40px
  across both books, a week after the 2026-09-13 fix that was supposed to end
  it. Measured on DesignBook's TSR specimens at 701px: one 408px scroller,
  header 408px, rows 408px, nothing overflowing, both children carrying
  `grid-template-columns:.7fr .5fr .5fr 1fr 1fr 1fr .9fr .9fr` - and resolving
  `head 45.1 41.8 42.4 43.7 43.7 43.7 39.3 39.3` against
  `row 36.5 26.1 26.1 52.2 52.2 52.1 46.9 47.0`. The header holds its narrow
  tracks open on a label like "Wt in air (g)" while the row lets the same
  tracks collapse around "2.451" and spends the surplus on its wide ones.
  `rowGridTemplate()` rewrites every `Nfr` as `minmax(0,Nfr)` for BOTH
  callers, so the tracks resolve on the declared proportions alone.
  **It is not `.rowscroll`, which is where it looks**, and three hours went
  into proving that: `max-content`, `min-content` and `0` were each tried as
  the floor of the shared track and all three left every drift exactly where
  it was. Sharing that track was never the problem - the two children already
  had the same width. The 2026-09-13 note's "that guarantee comes from SHARING
  the track, not from what its minimum is" is right about the sharing and
  wrong about the consequence.
  **The floor still has to exist, and has to be PIXELS.** Removing the minimum
  also removes the scroll: with nothing able to exceed `.rowscroll`, the box
  never scrolls and the columns squeeze instead - which is the opposite of
  this file's own "a table that cannot fit its columns SCROLLS", and had TSR
  specimens at 701px with all fourteen columns clipped into 31px boxes holding
  values that need 44-52px. Every CONTENT-based floor is computed per grid and
  would reintroduce the divergence above, so `ROW_TRACK_MIN` is a pixel
  figure. **64px is measured, not picked**: it leaves a 62px input, which
  clears the widest real value those narrow columns hold (a joint core id
  "1-1-J1" at 59px, a five-figure Gmb at 52px). At 1500px with a real lot
  number, zero clipped inputs in either book.
  General form, and the reason this is worth carrying: **two grids with one
  template is not one answer.** Any track whose size depends on content
  resolves per grid, and a header's content is never the row's.

- **A harness must not fabricate a value that OTHER values are derived from.**
  `fillForm()`'s generic numeric fill is `(hash % 900)/10 + 1`, fine for a
  weight and impossible for a lot number - it produced 80.8. Every core id is
  BUILT from the lot number, so one junk value widened six columns and had the
  viewport sweep reporting `mat_cores`/`joint_cores` `sublot` and `core_id` as
  clipping at 1500px. They do not: with a real lot number every one of them
  fits. Blessing those into `baseline/clipping.json` would have recorded a
  width limit no lot can ever reach and turned the check off for six real
  columns - "a stale baseline is not neutral, it is a hole", arrived at from
  the other direction. `fillForm()` pins such fields now (`DERIVED_FROM`).
  Pairs with the `va` entry above: that one blessed a junk-driven limit with
  the caveat written down, and this one shows the case where the honest answer
  is to fix the fill instead. Ask which it is before blessing.
  Re-blessed the same day, diff read for removals as well as additions: what
  is in the baseline now is `producer` and `record`, the two this file already
  records as accepted and unfixable, and the junk-inflated `va` is OUT.

- **Two checks were wrong about the page on 2026-09-15, both in the direction
  that makes the PAGE look broken, and both worth knowing as a class.**
  `roundtrip.mjs` built its DOM row counts with `counts[key] = ...`, one
  assignment per element, so with four blocks sharing a key it kept only the
  last and reported all twelve sliced tables as "collected twice" when nothing
  was wrong - written when one key meant one element, never revisited when
  PR #19 made that false. And `viewports.mjs` compared raw child COUNTS
  between the header strip and the row, so a deliberately `hidden` column
  (rendered as an omitted header cell but a `display:none` row cell - a
  display:none grid item is removed from auto-placement, so both still place
  the same visible cells into the same tracks) read as "7 headings over 8
  cells" on a table measured perfectly aligned at 67,138,470,610,818,920,1032.
  **When a check fails on something that has just been restructured, measure
  the page before believing the check** - this file already records the same
  conclusion for the <700px card mode, and it has now happened three times.

- **Contract & Mix lost two boxes on 2026-09-15, both because a value nobody
  should be typing was being asked for anyway** (Jake, off a real screenshot).
  **The unit price is not a field.** "unit price is a constant at 50 and
  really doesn't even need to be shown in here... we don't need anyone editing
  it." It has been a seeded spec constant since 2026-09-13 - 402.05.02 defines
  it, all three Lot Pay Adjustment Schedules open `($50.00)(Quantity)`
  whatever the mix, and the blank AMAW ships `'Pay Values'!F5` hard-coded as
  50 - so the box's only reachable states were "right, and you could not have
  known" and "wrong". It is emphatically NOT the contract's bid price, and
  filling that in put a figure 2.4x too large into every dollar adjustment.
  Gone from the schema, the intake and `LOT_FIELD_ALIASES`; `lotScalars()`
  supplies it, the page's pay reads the same definition, and a value already
  under the mapper's own name still wins so `check_mapper` keeps testing the
  workbook. `check_intake`'s assertions are INVERTED rather than deleted, plus
  a fourth: **a constant that reaches nothing is the worse bug of the two**,
  since every dollar figure is tons x this number and a missing one pays zero
  while looking fine.
  **The project items look themselves up** on opening from an approval, rather
  than waiting on the button. The lot inherits them provisionally and the
  whole reason a refresh exists is a change order re-numbering an item between
  approval and production, which is exactly what MEDL refuses the load over -
  so behind a button the ordinary case was the stale one. Two limits, both
  deliberate: **not on reopening a saved lot**, because `applyProjectItems()`
  REPLACES the table and would overwrite a week of corrections (the button is
  still there for that and for a mid-lot change order), and **not awaited**,
  because it fetches a KYTC report that is often slow and a lookup must never
  be the difference between opening a lot and not.

- **Open for Andrew and Tate, from the same round:**
  **What should fill the Sample id prefix?** `'Pay Values'!B3`, and every
  `t_smpl.smpl_id` is that prefix with the record name appended (`...VI01`,
  `...QC01`), plus the `discipline` Filename - so it names every sample MEDL
  receives. But **both real accepted lots leave it blank**, and DesignBook
  does not ask for its equivalent at all: it DERIVES one
  (`${district}${sampleLab}AMD${yy}${seq}`, e.g. `07640AMD260403`). A
  technician typing a MEDL identifier freehand is the wrong shape either way.
  Two ways to close it - derive it, which needs KYTC's convention for a LOT
  sample id, or drop it like the unit price and let it stay blank as it does
  on every real lot. Not guessed at; `req: false` in the meantime.
  **The producer/supplier lab id is wired and waiting on two admin actions.**
  Andrew is building the list (2026-09-15). `loadPlantLabId()` /
  `applyPlantLabId()` already read `plants.ps_lab_id` and fill the field
  tinted, keyed on the AMP number the approval carries - so it ties to the
  plant the approval names, with no further page work. What is needed is
  applying `supabase/plants_lab_id.sql` (written, never applied) and then
  seeding it. Nothing changes until both happen and nothing breaks meanwhile:
  it is deliberately its OWN query, because PostgREST answers a select naming
  a missing column with a 400 for the WHOLE row, so folding it into the
  plant-name lookup would take the plant name down with it.

- **Two Claudes on one branch: a textually clean merge hid a semantic conflict
  twice in one day, and both times a CHECK caught it rather than a person.**
  Andrew's PR #24 turned Aggregate Blend from an `into: "sublot-1"`
  sub-section into row TABLES on the tab; the sublot-lock exemption named it
  as a sub-section, git merged both sides without a murmur, and the exemption
  silently stopped covering anything. Then PR #26 folded `blend` into
  `blend_pct` and the replacement exemption named a key that no longer
  existed. `check_page_plantbook.mjs` failed on both, because the exemption
  lists are asserted to name things that really exist.
  **So: when you add a list of names that points at the other person's
  structures, assert that every entry resolves.** A name that matches nothing
  is the quietest failure this codebase has, and a merge is where it is
  created. (We also both fixed the same exemption independently within an
  hour; Andrew's is the one that stands, since his restructure needed a
  column-level exemption so `blend_pct`'s own `pct` stays locked.)
  **And run the browser harness before pushing a layout or schema change.**
  Andrew has no Node on that machine and asked in every commit message for
  someone to; the four module checks were green through all of it while the
  harness was 25 red. `node scripts/amaw/harness/run.mjs` with `HARNESS_LIBS`
  pointed at a `node_modules` carrying pdf-lib, xlsx and fflate - 339 passing
  as of 2026-09-15.

- **The Sample id prefix box is gone, and the cell that DID have a known
  convention is filled instead** (Jake, 2026-09-15: "Just do it like the
  designbook does and not make it editable. Not sure it needs to be seen on
  the site?"). Two cells wear this name and only one of them is guessable, so
  only one is written - which is the whole content of this entry.
  **`'Pay Values'!D7` "Approved Mix Design:" is the APPROVAL's sample id**
  (`07640AMD260403` in both real lots) and is the cell `t_smpl` actually
  reads. Nothing supplied it until now; `generate.mjs` has named it as missing
  since it was written. DesignBook already builds exactly this string for the
  MixPack's own `Design Data!C10`, so `approvalSampleId()` is that same
  convention rather than a second one: district + that district's sample-lab
  code + `AMD` + the approval's two-digit year + its four-digit sequence, all
  read off the eight-digit mix id (`00` + yy + seq) the lot already inherits.
  It lands on `values.design` and reaches the workbook through `DESIGN_LIFTS`,
  the same path as the JMF %AC and the minimum VMA. Derived on the PAGE
  because the district table is DesignBook's `CONFIG.MIXPACK.DISTRICTS`.
  Verified end to end: an approval on `AMP070301` with mix id `00260467`
  derives `07640AMD260467` and reaches `lotScalars()` under the mapper's own
  name.
  **`'Pay Values'!B3`, the prefix every `t_smpl.smpl_id` is built from, is
  still NOT written, and that is the decision rather than an omission.** Its
  box is gone because nobody should type a MEDL identifier freehand, but
  nothing fills it either: the convention for a LOT's prefix is unknown, and
  **both real accepted lots leave it blank**. A guessed identifier in a MEDL
  field is worse than an empty one - the same call this file already makes for
  a wrong compaction Option. The mapper still `need()`s it, so the gap stays
  named in the generator's report instead of disappearing with the box.
  **Eleven districts derive NOTHING**, which is honest rather than a guess:
  `CONFIG.MIXPACK.DISTRICTS` carries district 07 alone - the statewide hole
  recorded near the top of this file - so a plant anywhere else leaves D7 as
  empty as it was, with `generate.mjs` still naming it. Closing that one gap
  closes it for both books at once, which is the argument for closing it.

- **Contract & Mix is a LEDGER, chosen 2026-09-15 from five mocked
  directions** (Jake: "I don't love the look of this, give me 5 options to
  change not just color but spacing and how the boxes look or something
  different all together?" then "lets go with ledger"; the canvas is at
  https://claude.ai/artifact/1Dcro8PWWFgG2ksgWGY2ey). The step is mostly READ
  - a lot inherits its contract, plant, mix and class from the approval and a
  technician types three or four things - so a grid of sixteen plates read as
  sixteen questions. Now it is label | value rows under hairlines, two columns
  once the form has its full width, with a one-line legend under the band.
  **It is a stylesheet fact, declared in the schema.** `layout: "ledger"` on
  the section (in `sections.mjs` AND the page's `PB_SECTIONS`, like every
  schema edit) becomes the `<section>`'s `data-layout` attribute, and a block
  scoped on that attribute restyles `.grid`, `.field` and `.box`. Same
  `gridHTML()`, same `inputFor()`, same classes and `data-field`s, so
  `collectForm()`, the rail, the sublot locks and the harness saw nothing
  change (339 passing before and after). If a second section ever wants it,
  it is one word in its schema entry. `legend` is the sentence under the band,
  emitted by `renderForm()` only where declared.
  **The tint stays.** The mock said "plain values are read from the
  approval"; the page says "shaded", because the provisional-value rule in
  this file is that the TINT is what marks a value as read from a file rather
  than typed. In the ledger it is a soft wash behind the value rather than a
  plate with a 2px edge; a blank typed field is a blue rule. Same rule, quieter.
  Three cascade facts from building it, all in the family this file already
  records for `.rowitem .box`:
  **A scoped rule beats the base media queries at every width**, so the 16px /
  44px phone box had to be restated inside the ledger block or the step would
  have lost iOS's no-zoom size silently. **`background-color`, never the
  shorthand, on a select** - `select.box` carries its drawn caret as four
  background longhands, and the base `.box.prefilled{background:...}` already
  wipes them off every prefilled select on the page (which is why a prefilled
  select has no caret anywhere else; not fixed here, noted). **Restore all
  FOUR** - restating image and position without size and repeat tiled the
  caret across the whole box, seen in the first screenshot. And the base
  inset-edge rule is a five-link `:not()` chain; a scoped override one link
  shorter loses to it, so the ledger's `box-shadow:none` carries the same
  chain, with a comment saying why.
  **Two columns only from 1244px, one below.** At a 1000px window the form is
  936px, and a 180px label left the approved-mix line 250px, which clips.
  Below 700 the label track is 150px; below 560 the label sits above its value
  and the rule runs full width. Zero clipped inputs at 1440/1244/1000/701/390
  with the real 467PA approval loaded. And a note for whoever screenshots a
  step next: `.section.active` fades in, so a capture taken straight after
  `go()` is at opacity 0 and reads as a page-wide dim - wait ~900ms, or the
  colours you are checking are not the colours on screen.

- **Lot Pay is a layered readout now: the line, why, and the figures**
  (Jake, 2026-09-15: "click on each part and it shows why the pay value is
  what it is and then one click further beyond that and it shows exactly what
  numbers went into it"). It was a `computed` dvtable of eleven rows - a
  number beside a weight, and nothing to say where either came from. Now each
  property is a line (lot value | weight | what it counts for), opening to a
  per-sublot strip (measured -> rounded -> the schedule band it landed on ->
  pay, then the average and the contribution), and each sublot opening to the
  weighings and the formula behind its measured value, cell by cell. The final
  pay, tonnage and dollar lines open the same way and write their arithmetic
  out in full - including that the $50 is the spec's defined unit price, not
  the bid price, said where the dollars are.
  **Nothing in the readout re-derives a band.** `pay.mjs` now RETURNS its own
  working: `acPay`/`vmaPay` carry `rule` (the ladder step that fired),
  `airVoidPay` carries `bands` (every AG:AN row that matched - a list because
  the sheet sums them), all three carry `allowance` when the sublot-1 column
  overrode them, and `laneCoreDetail`/`jointCoreDetail` are the two density
  tables with their matched rows shown, `laneCorePay`/`jointCorePay` being
  their `.pay`. `laneDensityLot`/`jointDensityLot` return `cores`, `rules`
  and `lotRule` beside the unchanged `sublots`/`lot`. All additive:
  `check_pay.mjs` still matches 127/127 cells on both real lots.
  **The third layer needs weighings lotPay() never sees**, so the page passes
  `ctx.trace` - `computeSublotVolumetrics()` and `computeCoreSolids()` stash
  what they were handed on `state.volTrace` / `state.coreTrace` as they run,
  and `lotPayTrace()` shapes it. Stashed there rather than read again in
  `lotPayInputs()`, because a second reader of the same cells is the drift
  this file keeps recording. The core trace pushes ONLY cores with a % solid,
  in table order, because `coresBySublot()` feeds lotPay() only those and the
  readout pairs the two lists by index. Without a trace (the PDF, a checker) a
  volumetric sublot is a plain row; a density sublot still opens, because its
  nested layer is the per-core band, which lotPay() knows without a weighing.
  **It is native `<details>`, and the open panels survive the re-render.**
  `computeLotPay()` runs on every keystroke anywhere in the lot and rewrites
  the readout; it reads the open `data-key`s off the old DOM first and hands
  them back as `ctx.open`, so a person mid-comparison does not watch every
  panel fold. Verified in a browser: type into a core weight, six panels stay
  open.
  `payExplainHTML()` in `payview.mjs` is the renderer, pure, spliced into
  `PB_PAY` like the rest; `check_page_plantbook.mjs` compares it
  byte-identical on the five synthetic lots with a trace and eight panels
  open, and `check_payview.mjs` asserts the three layers' text on real lot 1,
  that no volumetric sublot offers figures without a trace, that a hostile
  core id is escaped, and that MCL stays text in every layer. The section is
  `type: "pay"` (`payStepHTML()` hosts it; `outputs` are gone from the
  schema); `RENDER.pay` in the PDF is untouched and still prints the plain
  table.
  **One thing the readout surfaced that a table never would**: on lot 1
  sublot 1 the allowance is not only a rescue - `'Pay Values'!G13` is
  `IF(AND(F3=1,AH9>=90),100,AH9)`, so an air void that would have paid 103
  pays 100 there too. The strip prints "sublot-1 allowance: 103 -> 100". It
  is the workbook, reproduced; whether KYTC means it is the same open
  question as the MCL-on-sublot-1 one above.
  And a probe note: my first realistic fill had a hand-mix bowl 10 g off, the
  %AC came out MCL, and the readout traced it to the bowl in one click - which
  is the feature working, not a bug in it. Screenshot a tall step with the
  fade disabled (`animation:none` on `.section`), or a capture taller than
  the viewport comes back dimmed.
  **Restyled the same evening** (Jake: "visually it looks a little rigid...
  what it shows is exactly what I wanted though"). The first cut was hairlines
  and uppercase mono on every row. Now each property is a rounded card whose
  summary is the line, the marker is a small disc that turns, a pay value is
  a pill coloured by direction (`.paypill.up/.down/.even/.mcl` - the verdict
  strip's own states, so a 95 in a sublot row and a Penalty at the top read
  as one fact), the schedule band is a chip with its formula beside it, the
  roll-up sits in a tinted box, and the working uses real glyphs: × ÷ − → and
  ≤ ≥ in the band labels. The content is byte-for-byte the same facts.
  **One trap from that pass, worth a sentence**: swapping ` / ` for ` ÷ ` across
  the readout block also rewrote three JavaScript divisions inside template
  expressions (`(value * weight) / 100`) and the module stopped parsing. A
  glyph substitution over a file that mixes prose and code has to be checked
  against the code, not only the prose. The signed figures (`-6.25 tons`)
  keep the ASCII hyphen, deliberately - the copy-into-an-email rule stands.

- **There is a demo film, and it is the real page clicked rather than a
  mock-up** (Jake, 2026-09-15: "Can you make a demo video to show this site
  off to people?"). `scripts/demo/` drives a browser through
  `public/designbook.html` and records one continuous 2:56 take: a contractor
  imports the real #467PA MixPack, submits, a KYTC reviewer opens that
  submittal and approves it, and a PlantBook lot is opened from the approval
  and paid. `node scripts/demo/demo.mjs` rebuilds it; the 18 MB `.webm` is
  not committed.
  **Filming it is a test, which is most of why it is worth keeping.** The
  film does not narrate a flow, it performs one, so anything that does not
  actually work stops the recording - and the run proved the whole chain end
  to end, including that the page REFUSES a reviewer approving their own
  submission (`canApprove` is `can_review` AND NOT `iSubmitted`), which is
  why the film needs two identities and one page navigating between them
  rather than one stubbed technician.
  **The three offline stand-ins are named rather than left to be
  discovered**, because a demo that quietly fakes a step is a claim about the
  product: Supabase is stubbed (the harness rewrite already does this),
  `sign-approval` is intercepted so the REAL `netlify/lib/canonical.mjs` does
  the numbering under a demo key that is emphatically not the production one,
  and `kytc-items` cannot reach transportation.ky.gov from here - so its red
  "Couldn't read the contract's items" note is CLEARED rather than filmed or
  filled with invented KYTC data.
  Two facts for whoever runs it next. `HARNESS_LIBS` must point at a
  `node_modules` carrying pdf-lib, xlsx and fflate, same as the browser
  harness. And **Playwright's bundled ffmpeg is a stripped build** -
  libvpx/WebM only, no MP4 or x264 - so the output is `.webm` and converting
  it needs an ffmpeg from somewhere else.

- **A lot opens the NEXT lot from its own file, and the rule that makes it
  safe is "carry the frame, clear the record"** (Jake, 2026-09-16, choosing
  route 1 of the three below). PlantBook's front door was the approval PDF and
  nothing else, so the page saw the same file eleven times over a 44,000-ton
  line item and could not tell the first lot from the eighth - the lot number
  was typed, and `lot_number` is seeded to 1.
  **A finished lot is a strictly RICHER starting point than the approval it
  came from**: it carries the same design block plus everything a technician
  has since corrected - the two lab ids, the compaction option `kytc-notes`
  found on the proposal, a Project Items table refreshed after a change order.
  So `PB_LOT.rollForwardLot()` takes the previous lot and `Start lot n+1` sits
  on the Submit step, next to the saves, where a technician actually is when a
  lot ends.
  **THE POLARITY IS THE WHOLE DESIGN. Every field starts NULL and is carried
  only if it is demonstrably frame**, never the other way round. A measurement
  that slipped through would let somebody submit lot 8 holding lot 7's
  numbers with nothing on screen saying so; a frame value wrongly cleared only
  makes a technician retype it. Default-clear fails in the harmless direction,
  so a field added to `sections.mjs` next year is cleared until somebody
  decides otherwise.
  **What the frame IS, is asked of the schema rather than listed** - the rule
  `sections.mjs` already states about the sublot-lock exemptions, two of which
  rotted on two separate merges in one day. A scalar is frame when its section
  is the `lot` step or draws `into` it; it is a record on a sublot, a
  gradation tab or a Department verification. That derives 18 `lot_*` scalars
  and the 13 `jmf_*` sieve targets (a sieve section's READONLY column is the
  design's published target, not anything anyone weighed) with exactly **two
  named exceptions**: `lot_number`, which is incremented, and
  `lot_wedge_tons`, which reads as a contract fact because it sits on Contract
  & Mix and is a quantity THIS lot placed.
  **`handmix` is the trap, and it is why the lock lists could not simply be
  reused for the scalars.** The hand-mixed check sample sets the lot's Gse and
  is lot-level to the sublot LOCK - it must not be gated by which sublot's
  sample exists - but it is emphatically this lot's own MEASUREMENT. Two
  questions that look identical and are not: the lock asks "is this gated by
  which sublot's sample exists", the roll-forward asks "was this measured on
  this lot's material". For ROW TABLES the two questions do coincide, so
  `LOT_LEVEL_ROW_TABLES` and `LOT_LEVEL_ROW_COLUMNS` are reused as-is rather
  than copied - `check_page_plantbook.mjs` already asserts every entry in them
  names something real.
  `blend_pct.pct` is re-seeded from `design_pct` rather than carried or
  blanked: the next lot starts on the design's own percentage again, and a
  blend column with no number in it is not a starting point.
  **`check_rollforward.mjs` asserts the negative one by ENUMERATING FROM THE
  SCHEMA, not from a list** - every scalar and every row column the derivation
  does not call frame is stuffed with a sentinel, the lot is rolled, and the
  whole envelope is searched for that sentinel. A measurement table added next
  year is covered the day it is added, without anyone remembering that file
  exists. 40 assertions; watched failing both ways (letting `handmix` count as
  frame, and carrying `mat_cores` whole). `check_page_plantbook.mjs` sweeps
  the page's copy over **poisoned** lots for the same reason: the two copies
  must agree about what they REFUSE to carry, and a frame-only case would pass
  even if one of them leaked every measurement.
  **Two hazards close for free.** Lot 8 can never come out numbered 1, so the
  `'Pay Values'!F3 = 1` setup allowance - which widens the AC ladder to 0.7
  and rescues an air void or VMA to 100 on sublot 1 - stops being one
  untouched seeded field away; and sublot 1 correctly locks on lot 2+.
  **One loader, still.** `openLotEnvelope()` gained an optional wording
  argument rather than a second path, because two readers would be two answers
  to "what did I just open" and the second would be wrong the first time
  somebody added a field. And the door is a BUTTON rather than a second file
  input: opening lot 7's PDF must still REOPEN lot 7 to correct it, never
  silently start lot 8 on top of it. A button you press is that intent; a file
  you drop is not.
  **Two checks of mine were wrong about the page before the page was**, both
  in the direction that makes it look broken, which this file now records for
  the fourth time. A hand-written exclusion list flagged `sublot_verified` as
  a leak when it is a schema seed; and comparing raw values flagged
  `ac_method` because "Ignition Furnace" is seeded on EVERY lot, so it matched
  by collision rather than by carrying. The painted identities SHOULD differ
  from lot 1 - `sublot: "2-1"`, `core_id: "2-1-A"` are built from the new lot
  number, and that they changed is proof the roll worked. The assertion that
  survived is the sentinel one against real data: none of lot 1's measured
  values appear in lot 2, minus anything the schema seeds.
  **Still open, and Tate's**: what the lot number resets on - per contract,
  per line item, or per design. `addresses.mjs` comments `F3` as "1, 2, ...
  within the contract"; `storage.mjs`'s identity (contract + plant + mix_id +
  lot_number) assumes per design. They disagree, no real file can tell them
  apart, and this door inherits whichever is right because it only ever adds
  one to what it was given.

- **Contract & Mix marks what is still OUTSTANDING in gold, and Lot Pay's
  working lines link back to the box they were measured in** (Jake,
  2026-09-17). Two separate asks with one idea between them: the page should
  say where to go next, rather than only what it computed.
  **GOLD MEANS OUTSTANDING, BLUE MEANS DONE.** The ledger's "yours to fill"
  rule was blue whether or not anything was in it, so a blank read exactly
  like a filled one - "lets have it where the boxes that users need to input
  are yellow until they put the information in there, but turn the blue once
  its in there so they know if they missed anything". Now a REQUIRED box with
  nothing in it takes `var(--gold)` and a soft `--flag-soft` wash; the moment
  it holds anything it is the ordinary blue rule.
  **`.req` only, deliberately.** Wedge tons and the two lab ids are optional
  and stay blue when empty: a person has not "missed" one of those, and
  golding them would make the colour mean "empty" rather than "outstanding",
  which is the thing worth knowing.
  **`.unfilled` is toggled in `recompute()`'s existing required-field sweep**,
  not in a pass of its own - that loop already reads every `.req` control's
  value on every recompute. It is set page-WIDE and styled only inside the
  ledger block, so nothing else on either book changed appearance. It has to
  be a class rather than pure CSS because **there is no `:placeholder-shown`
  for a `<select>`**, and half these controls are selects.
  **The `.rowitem .box` cascade trap, hit for the third time and caught by
  measuring.** The new rule is `(0,9,0)` against `select.box`'s `(0,2,1)`, so
  its `padding-right:8px` beat the 22px that reserves room for the drawn
  caret and painted the caret straight over the text. Restated inside the
  block, per the rule that block's own comment already states. Verified by
  reading `getComputedStyle().paddingRight` on a gold select rather than by
  eye: 22px, and the caret is visible in the screenshot.
  Round-tripped in a browser, an input and a select each: filled -> cleared
  is gold at 2px with the wash -> refilled is blue at 1px, and an optional one
  never leaves blue. The legend under the band says so now ("Gold is still to
  fill in; blue is done") - it used to say "a blue rule is yours to fill",
  which had become half the story.
  **Lot Pay's third column is gone and its address rides in `title`** - "lets
  get rid of the grey letters that say superpave f and g or what not". Same
  move, and the same reasoning, as the `.srcnote` line that became a prefilled
  input's tooltip on 2026-09-13: the workbook address is the detail behind the
  figure and is worth keeping, and is not worth a column of grey chips beside
  every line. `.payx-eq` is two tracks now rather than three, because an
  `auto` track with nothing in it still takes its gap.
  **And a line that was MEASURED on a control links back to it** - "where it
  says gmb then specimen 1 or 2, they can click on it and boom it takes them
  down to that specific area in the lot pages". `eqHTML()` takes a `goto` of
  `"<section>|<row table>|<row>"`, `payview.mjs` decides which lines get one,
  and `gotoLotSource()` on the page finds the control and hands it to
  `jumpTo()`. 88 lines are clickable on a filled lot.
  **Only measured lines get one, and that is the whole rule**: a Gmb average,
  an air-void figure, a deviation or a lot roll-up is computed from the lines
  above it and has nowhere to send you. What links is a specimen, a Rice bowl,
  a moisture pan, the hand-mixed sample and a core.
  **A core is found by its ID, never its index.** The trace carries only the
  cores that HAVE a % solid, in table order, so its index stops matching the
  table's the moment one core is labelled and never measured - which is
  exactly what lot 1 of the two real AMAWs does. `#<value>` in the target
  means "match an identity cell", and `src()` builds it.
  **`jumpTo()` does the navigating, and it has to.** `.focus()` inside a
  `display:none` step does nothing and reports nothing, so the step has to be
  switched FIRST - which `go()` already handles, along with the one-page case
  below 700px where there is no switch at all and a smooth scroll to wait out
  instead. Re-implementing any of that here would have been a second answer to
  a question the page already answers.
  A locked sublot's controls are all disabled, so the lookup comes back null,
  the step still opens and flashes, and nothing is focused - which is the
  honest outcome rather than a failure: the figure is there, the box is not
  yours yet. The rows carry `role="button"` and `tabindex="0"`, so they owe
  the keyboard Enter and Space, and get them.
  Verified in a browser across all four target shapes (`sublot_bsg`,
  `mat_cores` by id, `handmix_msg`, `sublot_moisture`): each lands on the
  right step with the right control focused holding the right value. Harness
  354 passing, page checker 197, unchanged by any of this.

## Conventions for changing this file

Both collaborators edit `CLAUDE.md`. To avoid merge conflicts, append to the
end of a section rather than restructuring, and keep edits to one section per
commit where possible.

- **The lab-id tables are NOT applied live, so both lab fields on Contract &
  Mix are dead on the deployed site right now** (checked 2026-09-17 against
  the live project, after merging Andrew's six lab-id commits). The page
  queries three relations - `producer_supplier_labs`, `kytc_district_labs`
  and `producer_supplier_labs_view` - and **not one of them exists**: a
  search of `information_schema.tables` across every schema for anything
  matching `lab` returns only Postgres's own `pg_seclabel` catalogue rows.
  The DDL is written and committed (`supabase/producer_supplier_labs.sql`,
  `supabase/kytc_district_labs.sql`, and the view), it has simply never been
  run. **Applying and seeding it is Andrew's admin action** - the same rule
  as every other reference table, and the seed carries real company names.
  **It degrades rather than breaking, and that is by design rather than by
  luck.** `loadReferenceData()` is `Promise.allSettled` per table, so the
  three failures are isolated: each sets `state.ref[key] = []`, is named in
  `state.ref.error` on the Status step, and `refControlHTML()` falls through
  its `list.length &&` guard to the plain `<input type="text">` - so the two
  fields are free text instead of dropdowns and nothing else on the page
  loses its list. `applyPlantLabId()` simply fills nothing.
  Worth carrying as a class, because this is the second time the two halves
  of one change have shipped apart: **a page change and a migration are one
  change, and only one half of it is in git.** A checker cannot catch this -
  `check_page_plantbook.mjs` calls those `label`/`value` functions with
  FIXTURE rows in a Node vm, which is exactly why they must not reach into
  `state`, and it is equally why 197 green assertions say nothing about
  whether the relation exists. The only proof is querying the live project.
  Same shape as the Netlify environment variables: set per site, not carried
  by a merge, failing closed and quietly.

- **CORRECTION to the entry above, same day: the lab-id tables WERE applied,
  and were live the whole time the note above says they weren't.** Andrew
  applied and seeded all three relations himself, live, before that note was
  written - `producer_supplier_labs` (92 rows), `kytc_district_labs` (80
  rows) and `producer_supplier_labs_view` all exist in `public` on the
  project this file calls "the live project," confirmed twice: once
  immediately after seeding (row counts, an RLS-scoping test distinguishing
  a Hinkle technician's 10 visible rows from Central Office's 92, `get_
  advisors` clean) and again 2026-09-17 by re-running the other note's own
  check (`select table_schema, table_name, table_type from information_
  schema.tables where table_name ilike '%lab%'` - all three come back). The
  deployed site was fetched directly the same day and confirmed serving code
  that reads `flagged_mismatch` off these tables.
  So the other check was not lying about what it found, and this is not "the
  page was fine, the check was buggy" (the pattern this file has now recorded
  three times for THIS project's own harness) - it is simpler and stranger:
  **two sessions querying "the live project" got two different answers,
  which means they were not looking at the same project.** Nothing here
  proves which one is wrong, or whether there are now genuinely two Supabase
  projects in play where CLAUDE.md's "Supabase is shared, same project, same
  tables" has always assumed exactly one. That is worth Andrew and Jake
  settling directly rather than a third session guessing - which Supabase
  project each of your Claude sessions' `list_projects` actually returns is
  the one question that would answer it outright.
  Until that is settled, do not trust "I queried the live project and found
  X" from either side of this repo at face value - requery it yourself
  before acting on it, the same discipline this file already asks for the
  Netlify environment variables and the deploy branch.

- **SETTLED, closing the question the entry above leaves open: the two
  sessions were querying two different Supabase projects, and here are both
  refs.** This session's `mcp__Supabase` `list_projects` returns exactly ONE
  project - **`knaeexnlyfjgpowihcel`, named `allen-qc`** - which is not this
  app's. The app's is **`iwysxhcmvhkcjxmjarkd`**, the ref in
  `CONFIG.SUPABASE_URL` in every page. Nothing in this repo is on `allen-qc`:
  `aggregates` and `plants` are as absent from it as the lab tables are, which
  is exactly why every probe came back empty and read as "nothing was ever
  applied". **CLAUDE.md's "Supabase is shared, same project, same tables" is
  still true of the app** - there is one app project, and the second one is a
  personal project that happens to be what an MCP connector was pointed at.
  **So the rule is: check the project REF before believing a database answer,
  not just that you queried "the live project".** Compare what `list_projects`
  returns against `CONFIG.SUPABASE_URL`; they are both right there.
  **And when the MCP is on the wrong project, PostgREST with the anon key the
  page already ships is the fallback, because it cannot be pointed anywhere
  else** - it is the same URL and key the browser uses. Two error codes are
  what make it conclusive, and they are worth keeping:
  **`PGRST205 Could not find the table 'public.<name>' in the schema cache`**
  is a relation that does not exist, and **`42501 permission denied for
  table <name>`** is a relation that exists and is refusing this ROLE. All
  three lab relations answer `anon` with 42501, as does `plants`, which has
  been seeded and working for a fortnight - the app reads as an authenticated
  technician, never as `anon`. Reading one of those codes as the other is what
  produced a false accusation about somebody else's applied migration.
  (`aggregates` differs - it answers `anon` with an empty array, the grant
  present and only RLS holding the rows back, because the four original
  reference tables never had the `revoke all ... grant select` step run on
  them. The new lab tables do, so they match `plants` rather than those.)

- **PlantBook's front door crashed on ANY file that was not a `.pdf` or
  `.json`, and it took a real AMAW to find it** (2026-09-17, Andrew: Jake
  sent a test AMAW to preview the interface, dropped it on "Start a lot",
  got "Cannot read properties of null (reading 'max')"). `handleFile()` is
  ONE function shared by both books' upload dropzones, and its two early
  checks only recognize `.pdf` (an approval, on PlantBook) and `.json` (a
  saved lot, PlantBook only) - anything else fell through, unconditionally,
  into DesignBook's legacy MixPack importer. That importer's very first row
  table lookup is `rowSpec("aggregate")`, which resolves against
  `activeSections()` - on PlantBook that is `PLANTBOOK_SECTIONS`, which has
  no section named `"aggregate"` (PlantBook's equivalent is `blend_pct`, a
  different key) - so the lookup returned `null` and the next line's
  `spec.max` threw. Same shape as the `supabase`/`sb` gotcha's cousin: not a
  silent failure this time, but still a generic function assuming one book's
  schema with nothing checking which book is active first.
  **The AMAW itself was never going to work here anyway, crash or not** -
  PlantBook does not read a completed AMAW as input under any circumstance;
  its only two doors are a DesignBook approval and its own saved `.json`.
  Jake's file was the right instinct (a real example to preview against) on
  the wrong door.
  Fixed with a guard right after the `.json` branch: `isPlantBook()` with
  neither a pdf nor a json refuses cleanly ("PlantBook opens a KYTC approval
  PDF or a saved lot (.json)...") rather than falling into DesignBook's
  importer at all. Worth remembering as a class: a shared handler with an
  early-exit per recognized case and a silent fall-through for everything
  else is a trap the MOMENT one of the branches is book-specific - the fix
  is a book-specific handler's fall-through refusing explicitly, not just
  recognizing more cases.

- **A sublot's gradation is four columns now - grams, this sublot's % passing,
  the JMF target, and the deviation - and the schema's two columns are no
  longer the table's** (Jake, 2026-09-17: "make a third column so the one
  beside the jmf percent passing shows the percent passing of the lot 1
  gradation... Make the order the raw weights first then the lot 1 percent
  passing then the jmf percent passing").
  The computed percentage used to be a 10px line tucked under the grams it
  came from, and the note that put it there said why: "six samples already
  make this the widest table in either book, and twelve would make it
  unreadable". That reasoning was written when ONE table carried all six
  sublot columns at once. The 2026-09-14 split gave every sublot tab its own
  table with ONE measured column, so the crowding it was avoiding no longer
  exists - and a figure a person compares across a row belongs in a column,
  at the table's own size, not in 10px under something else.
  **`sievesHTML()` builds ONE PLAN and the header, the rows and the two foot
  rows all render from it.** A schema column is not a physical column any
  more: a weighed one expands to grams + % passing, and a section carrying
  both a weighed column and a `target` appends the deviation. Deriving the
  `<th>` list and the `<td>` list separately is exactly the drift this file
  records twice for the row tables, and a heading over the wrong column is
  the same worst-kind-of-wrong in a `<table>` as it is in a grid. Asserted in
  a browser rather than by eye: 5 headings, 5 body cells, 5 cells in each
  foot row.
  **DesignBook is untouched by construction** - its gradation has no
  `weights` and no target column, so the plan is one entry per schema column
  and it renders exactly as before.
  **The chart's axis is asked for BY NAME now, and that was the trap.**
  `drawGradChart()` built the axis and `trimFlatCoarseEnd` from `series[0]`,
  with a comment saying that was "DesignBook's own gradation, or a lot's JMF
  target". Putting the weighed column first so a technician meets the grams
  before the target would have silently made the axis the SUBLOT's curve -
  entirely null on a lot nobody has weighed yet. `cols.findIndex(c => c.target)`
  is the fix. Worth carrying as a class: **a comment that names what
  `[0]` happens to be is a dependency on display order, and reordering for
  readability is exactly what breaks it.**
  **The deviation is NOT coloured pass/fail, and that is deliberate.** It was
  written green-above / red-below and reverted the same hour: no JMF
  tolerance band is encoded anywhere in this page, so neither direction is by
  itself good or bad, and a green +4 on the #8 would be the page inventing an
  opinion about a figure it only subtracted - the same rule that keeps
  `payWarnings()` the single producer of the rail's pay warnings. The sign is
  the information. Encode 403's real tolerances and it can earn a colour.
  **The sign is decided on the ROUNDED figure.** Every sieve but the #200
  prints to a whole percent (`CONFIG.DP`), so testing the raw difference
  printed "+0" and "−0" on three sieves of a column that was on target -
  a direction the precision on screen cannot support. Round first, then ask
  which way it went; what prints as zero reads "±0", which says measured and
  on target rather than off by an amount too small to show.
  **`computeGradation()` is still the single producer** - the deviation is
  painted in the same loop, from `state.gradPassing` and the JMF input, never
  recomputed from the DOM by a second reader.
  Measured at 1440/1000/701/390: zero clipped inputs and zero page overflow
  at every width, so the two extra columns cost nothing even on a phone.

- **`producer_supplier_labs.lab_name` is `plants.name` now, trigger-
  maintained rather than joined, and `producer_supplier_labs_view` is
  gone** (2026-09-17b, Andrew: "make the producer supplier labs table
  simpler, with lab id, amp number, lab name column (with plant location
  and without AMP number redundancy)"). This REVERSES the 2026-09-17
  decision two entries up ("a live join, never a stored copy") - not
  because that reasoning was wrong, but because the same guarantee (can't
  drift from `plants.name`) is available a second way: `trg_sync_
  producer_supplier_lab_name` sets it on insert or `amp_number` change,
  `trg_cascade_plant_name_to_labs` re-syncs every row tied to an AMP
  whenever `plants.name` is corrected (the Gaddie Shamrock LLC fix would
  have cascaded automatically had it landed after this). A trigger is a
  DIFFERENT tradeoff than a view, not a strictly better one - more moving
  parts (two functions, two triggers, `get_advisors` flagged both for a
  mutable `search_path` and needed `set search_path = public, pg_temp`
  added to each) bought for a base table that reads "Company @ Site"
  directly in Studio's Table Editor with no view to remember exists.
  `company_name` is dropped - fully superseded once `lab_name` became the
  plant's own name rather than the export's raw label. The page's
  `CONFIG.REFERENCE.TABLES.producer_supplier_labs` (both copies) points at
  the bare table again; `label` is a plain `${lab_id} — ${lab_name} —
  ${amp_number}` with no `plant_name`/`company_name` fallback branch to
  choose between, because there is only one name column left.
  **Same pass resolved all 8 duplicate-AMP rows left out of the original
  seed** (`docs/plantbook-lab-id-reconciliation.md` section 1 - Andrew,
  off noticing Allen/Berea missing: "let's do another pass to make sure
  nothing is missing between plants table an[d] producer supplier lab
  IDs"). Comparing each code's ORIGINAL export company against
  `plants.name` - the exact test that produced the 7 `flagged_mismatch`
  rows already on file - turned out to settle 6 of the 8 AMPs outright
  (both/all codes agree with `plants`, so neither is flagged) and revealed
  the other 2 were never really a tie: one code already matched `plants`,
  the other didn't. All 17 codes are inserted; 2 more rows join the
  original 7 under `flagged_mismatch` (9 total), the rest clean. General
  lesson worth carrying: **a "duplicate, can't tell which is right" case
  is worth re-testing against whatever you've already decided is gospel**
  before accepting it as unresolvable - the same `plants`-is-gospel
  comparison that flagged 7 rows the first time silently answered most of
  a second, harder-looking question too.

- **The sublot gradation table is 356px wide now, down from ~590, and the
  chart took every pixel of it** (Jake, 2026-09-17: "lets make the width of
  these a lot more narrow so I can see the graph way better"). Two things
  were making it wide, and only one of them was the obvious one.
  **The cell-level `width` rules under `table-layout:fixed` DID NOTHING, and
  that is the finding worth carrying.** `.gradwrap.wide table.sievetable
  th:not(:first-child){width:112px}` had been there since the split, and the
  four-column rebuild earlier the same day added
  `th.calc/td.gcalc{width:60px}` after it - correct specificity, correct
  source order, and Chrome ignored it outright. Proved rather than assumed:
  setting the computed columns to **20px** moved nothing, every non-first
  column still rendering at exactly `(table - 64) / 4`. The same two rules in
  an isolated fixture resolve to 60px, so it is not the cascade.
  **`<colgroup>` is where fixed layout actually reads column widths** - the
  CSS table model takes them from `<col>` elements FIRST and only falls back
  to the first row's cells. `sievesHTML()` emits one `<col>` per physical
  column from the same PLAN that builds the header and the rows, so a
  column's width is declared beside its heading and its cells and cannot
  drift the way a `:nth-child`/`:not()` rule does when a column is added.
  Widths obeyed exactly the moment it went in: 64 / 84 / 62 / 84 / 62.
  **The second cause was `white-space:nowrap` on the HEADING.** "Grams
  retained" alone held its column at 106px whatever any width said, and the
  surplus then spread over every other column - so even a correct width rule
  would have been overridden by the heading. Headings wrap now and VALUES
  still never do; a wrapped figure is unreadable, and KYTC's own sheet reads
  "Grams" / "Retained" on two lines (rows 8/9), so this is the workbook's
  own layout rather than an abbreviation nobody asked for.
  **The chart grows by exactly what the table gives up**, with no second
  number to keep in step: `.gradwrap.wide` is
  `grid-template-columns:auto minmax(280px,1fr)`, so the table's track
  shrinking IS the chart's track growing. 646px -> 712px at a 1500 window,
  586 -> 652 at 1440.
  Measured at 1500/1440/1244/1000/901/701/390: zero clipped inputs, zero
  clipped readouts and zero page overflow at every width, and the harness's
  clipping baseline needed no re-blessing.
  **DesignBook is untouched again by construction** - the `<colgroup>` is
  emitted only for `wide` (a section with more than one physical column), so
  its single fluid `width:100%` gradation table is exactly as it was.

- **`CONFIG.MIXPACK.DISTRICTS`'s "district 07" entry was never a district
  code - it was Central Office's, and the fix is a Class 3/4-vs-Class-2
  branch rather than a 12-row table.** Closes the oldest open item in this
  file, and reopens a narrower one in its place. Andrew, 2026-09-17: "CO
  Materials Asphalt Mixtures Testing Section is responsible for approving
  all Class 3 and Class 4 mix designs from all jobs in districts across the
  state... The district personnel are responsible for approving the Class 2
  mix designs from jobs in their respective districts."
  **Checked against the live `kytc_district_labs` table the same evening,
  and it confirmed both halves of that.** `LU00642` - the value this file
  had called "district 07's lab" since the note was first written, off the
  one real approved file on hand (#467PA, CL3 ASPH SURF, Boonesboro/
  district 07) - is `CO Materials - Asphalt Mixtures Section` in that
  table. Not a district code at all. `D-07 Materials Section` is a
  different code, `LU07210`. So the "one real data point" this file spent
  months treating as district 07's own was Central Office's the entire
  time, and #467PA being Class 3 is exactly why it read that way - Central
  Office is who actually reviewed it, regardless of Boonesboro sitting in
  district 07. That also settles the MixPack template's `Chart Data!
  AV2:AV14` list, called "untrusted" at the top of this file because it
  disagreed with that one point: it doesn't disagree.
  `LU01210`...`LU12210`, one entry per district, is the same "Materials
  Section" series `kytc_district_labs` carries too - confirmed independently
  through a second real source (SiteManager's own `t_qualf_lab` export)
  rather than trusted off the template alone.
  **`CONFIG.MIXPACK.CENTRAL_OFFICE` is new** (`{ lab: "LU00642", sampleLab:
  "640" }`) and is what both `mixpackCells()` and PlantBook's
  `approvalSampleId()` use whenever the design's own `aadtt_class` is 3 or
  4, regardless of the plant's district - DesignBook's own field is the
  authority for class, same rule the AADTT-class prefill already follows a
  few lines below in `mixpackCells()`. **`DISTRICTS` is Class 2's table now,
  and it is EMPTY, deliberately.** Every district's own Materials Section
  code ends in `210` (`LU01210`...`LU12210`), which is a plausible guess for
  Class 2's `sampleLab`, but nobody has checked it against a real Class 2
  file, and this project's standing rule is that a guessed MEDL identifier
  is worse than a blank one. So a Class 2 design honestly derives nothing
  yet, for any district including 07 - which is a real behavior change: a
  Class 2 design at Boonesboro used to silently get Central Office's code
  (wrong, but present), and now correctly gets neither, with `need()` saying
  why. **A worse silent answer became an honest gap**, which is the
  direction this class of fix should always go.
  Not yet in code, and worth a real Class 2 file before it is: whether
  Class 2's `sampleLab` really is each district's own `210` suffix, or
  something else entirely. `docs/session-prep-2026-09-18.md` carries this
  as the sharpened open question for the next in-person session.
  Verified the page's inline script still parses (`new Function()` over the
  `<script>` tag, no SyntaxError) via a local static server + browser tools -
  no Node on this machine, same verification the design-mirrors branch used
  2026-09-14.

- **All 12 districts, same evening: Andrew pulled two real approved Class 2
  MixPacks off the district production repository** (District 1's
  `01210JWH260077.xlsm`, McCracken County; District 2's `02210GSM260366.xlsm`,
  Webster County) **and the `...210` guess above checked out exactly.** Read
  directly with openpyxl rather than trusted off the filename: both show
  `Design Data!H20` (AADTT Class) = 2, and `!H12` (the LAB field) is
  `LU01210` / `LU02210` - each district's own "Materials Section" code from
  `kytc_district_labs`, not Central Office's. `!C10` (the sample id) is
  `01210JWH260077` / `02210GSM260366`, which decomposes cleanly as district +
  `210` + the rest - confirming `sampleLab` too. `CONFIG.MIXPACK.DISTRICTS`
  now carries all twelve districts (`{ lab: "LU0N210", sampleLab: "210" }`),
  01 and 02 confirmed directly against these two files, 03-12 carried on the
  same unbroken pattern in `kytc_district_labs` (every district's Materials
  Section code is `LU0N210`, no exceptions in that table).
  **One thing this did NOT settle, and it stays unresolved rather than
  guessed: the sample id's middle token isn't "AMD" in either file - it's
  `JWH` and `GSM`.** Both read as the approver's own initials
  (`Design Data!S82` = `jharmon3` / `gmarr`; JWH/GSM plausibly the same
  people's monogram with a middle initial the sm_id drops). `AMD` is still
  what the code writes for every district, because it's confirmed correct
  for Central Office (both real AMAW lots on file show it) and there is no
  field anywhere in DesignBook that captures a reviewer's 3-letter monogram
  to write instead. Two live theories, neither chosen: district reviewers
  have their own convention DesignBook doesn't yet model, or these two
  files predate any standard and `AMD` would be accepted regardless. Worth
  asking Tate or district materials staff directly rather than inferring
  further from files alone - a wrong middle token is the same class of risk
  CLAUDE.md already warns about for a guessed MEDL identifier, even though
  the district/lab half of this fix is no longer a guess.

- **The JWH/GSM monogram theory is confirmed (Andrew, 2026-09-17) - and
  deliberately still not implemented, because the question behind it is
  bigger than one field.** Asked where a district approver's 3-letter
  monogram should come from (`technicians` has no middle name, and
  `approved_by`'s sm_id drops the middle initial the monogram keeps - so
  there's no data source to derive it from today). Andrew's answer: "Tate
  and I have discussed potentially, once DesignBook and PlantBook are fully
  built out, having CO Materials do approvals for all classes of mix
  designs, since it will be much easier and streamlined than the current
  process."
  **If that happens, Class 2 district review - and the monogram it would
  need - goes away, not just gets solved.** Every district-approved design
  becomes a Central Office one, `CONFIG.MIXPACK.CENTRAL_OFFICE` (already
  built tonight) is what every design uses, and `CONFIG.MIXPACK.DISTRICTS`
  (also built tonight, all twelve districts, confirmed against two real
  files) stops being reachable rather than needing a monogram field added
  to it. Worth knowing this before spending effort on a `technicians`
  schema change for a data point the workflow might retire.
  **So, deliberately unresolved and left as "AMD" for every reviewer,
  district or Central Office**: not because the monogram theory is in
  doubt (it's confirmed), but because building infrastructure for Class 2's
  own identity convention is premature while whether Class 2 stays a
  separate review path at all is still an open direction call between
  Andrew and Tate, not a data-sourcing problem to be solved in code.
