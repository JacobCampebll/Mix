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
- **Open for Andrew: does KYTC enforce 403.03.03 A)'s *fine* aggregate
  column?** The spec table gives Type B two columns — coarse (100% Class B,
  or +4 at least 50% Class A) and fine (30% of total combined from a Class B
  fine source, or 20% from a Class A fine source). Approved design **#467PA**
  passes the coarse column at 54.2% and has **0%** from any classed fine
  source, so it fails the fine column under either reading of that table's
  `-OR-` layout. The MixPack's own Polish-Resistant tab only ever computed
  the +4/coarse side, which is probably why it went through. Not resolved
  here; whichever way it goes it is a one-line change.

## Conventions for changing this file

Both collaborators edit `CLAUDE.md`. To avoid merge conflicts, append to the
end of a section rather than restructuring, and keep edits to one section per
commit where possible.
