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
  Still open from PR #3: Contract Information's KYTC contract lookup (binder
  supplier, funding, project items/number) is not built - Jacob's, since it is
  the same shape as the `kytc-lookup` function - and neither is the target
  gradation band trimmed to the mix's nominal max size, which is Andrew's.


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

### Designs (DesignBook storage)

- **`designs` + `design_events` (`supabase/designs.sql`) hold saved designs
  and their audit trail.** Real columns for what gets filtered and reported
  on (contract, letting date, plant, author, mix signature, stage, origin);
  JSONB for the form body (`values`, `rows`) until the MixPack field map
  settles. Applied live 2026-09-03.
- **Who can see a design is derived in one place:** its author, plus anyone
  whose `technician_effective_plant_access` includes its plant — so Central
  Office sees everything via `all_plants`. Contractors do not see other
  plants' designs. `design_summaries` is the list view; it inherits that RLS.
- **Stage rules live in a trigger, not in page code.** Draft → Internal
  Review by the author; Internal Review → Released → Approved by a
  **reviewer** (`technicians.can_review`) only, and **never their own
  design**; any → Draft by a reviewer only; Approved content is read-only
  until sent back. Pages mirror the rules to keep buttons honest, but the
  database is the one saying no — its error text is shown verbatim.
- `can_review` is deliberately separate from `all_plants`: "sees every
  plant" and "may approve" are different powers, even though the same 12
  Central Office people hold both today. The seed script sets both by
  company.
- **`author_name` is denormalised onto `designs` on purpose.** Contractors
  can only read their own `technicians` row, so a join would leave the
  review queue nameless. The trigger fills it from the caller's row.
- **Reviewers land on the Portal's Designs list; contractors reach it as
  "My designs".** Opening a row goes to `designbook.html?design=<id>` and
  the row is the job — nothing else is read from the URL.
- The RLS and stage rules were verified with a rolled-back transaction
  impersonating a contractor, a reviewer and an unrelated technician (13
  checks) before any page pointed at the table. `execute_sql` runs
  read-only; a write test has to go through `apply_migration` and end in
  `raise exception` so nothing is recorded — that pattern is worth reusing.

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
- **The Portal is the act of submitting, not a catalogue.** Four steps:
  contract & plant, mix (from `kytc-lookup`, always skippable unless
  `CONFIG.MIX_LOOKUP.required`), how (upload a MixPack or build in
  DesignBook), then fill in & submit - which is DesignBook's Draft ->
  Internal Review move. "My submissions" / "Review queue" is one list behind
  a top-bar link; contractors see stages collapsed on purpose (Draft = Not
  submitted, Internal Review and Released = In review) via
  `CONFIG.CONTRACTOR_STAGES`, reviewers see the raw names. Chosen from five
  mocked directions on 2026-09-03; the approval PDF and the SiteManager /
  AASHTOWare Project hand-off are still to build.


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

## Conventions for changing this file

Both collaborators edit `CLAUDE.md`. To avoid merge conflicts, append to the
end of a section rather than restructuring, and keep edits to one section per
commit where possible.
