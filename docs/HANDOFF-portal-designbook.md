# Handoff — Portal, Sub Portal, and DesignBook

Two new files for the Mix repo. Written against `main` at `93b116b`.
**Neither touches `login.html`, `netlify.toml`, `supabase/*`, or `scripts/*`.**

| File | What it is | Lines |
|---|---|---|
| `portal.html` | Job-selection gate + Sub Portal. New. | ~470 |
| `designbook.html` | The real DesignBook form (Layout A) + legacy MixPack import. New. | ~1050 |

Both go in the repo root, siblings of `login.html`.

---

## 1. The flow these implement

```
login.html
  → pick DesignBook                       (badge in login.html's session view)
  → portal.html                           Contract ID · Letting Date · Plant → Generate
  → portal.html Sub Portal                Legacy Upload | Build New
  → designbook.html?mode=legacy|new       the real form
```

Job context travels as query params: `?mode=legacy&cid=252112&letting=2026-01-17&plant=AMP%201`.
`designbook.html` refuses to render the form without all three of `cid`, `letting`, `plant` — it
sends you back to the Portal instead of letting someone deep-link into a form with no job attached.

---

## 2. How the session is shared (no glue code)

The Supabase JS client persists its session in `localStorage`, scoped to the origin. Since all
three pages deploy to the same Netlify site, `portal.html` and `designbook.html` call
`supabase.auth.getSession()` and already have whatever `login.html` established. No token in the
URL, no second sign-in, no shared-state module.

Each page independently re-checks, on every load:

1. Session exists → else `location.replace(LOGIN_URL)`.
2. `technicians` row linked to `auth.uid()` → else "contact an admin".
3. `technicians.onboarded` is true → else back to `login.html`, which owns onboarding.
4. `technician_capabilities.can_access_designbook` → else a plain explanation, no form.

`onAuthStateChange` also catches sign-out in another tab, so a page can't sit on stale data.

**This is client-side UX gating, not security.** The real boundary is RLS. See §6.

---

## 3. What reads from the database

Everything already exists in `supabase/schema.sql`. Nothing new was needed to make these run.

| Table / view | Used for |
|---|---|
| `technicians` | name, company, `sm_id`, `onboarded` |
| `technician_capabilities` | `can_access_designbook` gate + the two badges |
| `technician_plant_access` | **the Plant dropdown** — one option per `amp_number` for that `sm_id` |

The Plant dropdown is worth calling out: it is not a hardcoded list. If a technician has no
`technician_plant_access` rows, the dropdown disables itself and Generate is blocked with
"No plants are assigned to your SM ID" rather than silently offering plants they can't use.

---

## 4. The one structural change to the Layout A prototype

**The form renders from a `CONFIG.SECTIONS` schema instead of hand-written markup.**

In `designbook_layout_A_clickable.html` each field was markup with no key. That means four
separate places would have to independently agree about the field list:

- the markup
- the xlsx extractor
- the validation rail / nav ticks
- the save payload

Four copies of one list is four chances to drift. In `designbook.html` the schema is the single
source for all four. Adding a field is one object; renaming one is one string.

Everything visible from the prototype survived intact:

- All 7 sections, with their `t_smpl` / `t_superpave` / `t_bit_conc_mixblnd` / `t_tst_rslt_dtl` tags
- Nav rail ticks with filled / partial states, scroll-synced via `IntersectionObserver`
- Live "Outstanding items" rail, click-to-jump to the first empty required field
- Stage timeline Draft → Internal Review → Released → Approved, with the audit log
- Repeating rows: aggregate blend capped at 6, CT specimens capped at 8, add/remove

One thing was built rather than left as a placeholder: the **0.45 power chart** is now real SVG,
plotted on true `size^0.45` x-spacing from the sieve inputs, redrawing as you type. It was a
hatched box captioned "auto-generated" in the prototype.

Section types the renderer understands: `grid`, `rows`, `sieves`, `status`. A section may carry
both `fields` and `rows` — Performance testing does.

---

## 5. Legacy MixPack import — how it works and what it does not claim

`?mode=legacy` asks for the workbook first, extracts, then drops values into the same form.

**Extraction is label-anchored, never cell-address-based**, per CLAUDE.md's rule about KYTC
workbooks moving between revisions. Each field lists `labels` — strings to hunt for in any cell,
matched case- and whitespace-insensitively as "contains". The value is read from the nearest
non-empty cell to the right (up to `CONFIG.SCAN_RIGHT`), falling back to the cell below.

Repeating tables (aggregate blend, CT specimens) use a header-row detector: find a row containing
that table's `tableHeaders`, map each of our column keys to a workbook column by matching header
text, then read downward until a fully blank row. Column order in the workbook does not have to
match ours.

**Nothing extracted is trusted.** Prefilled fields get a tinted background and a `from Sheet1!C14`
note underneath. The tint clears when edited. `extracted_from` ships in the save payload so a
legacy import stays auditable after the fact.

### The `labels` arrays are guesses

They were written without a real MixPack file. **Do not treat them as correct.** Open a real
workbook in `?mode=legacy` and expand **"Workbook inspector"** at the bottom of the form — it
lists every label-ish cell in every sheet with its address:

```
Sheet1!B12         Optimum Asphalt Content
Sheet1!B14         Maximum Specific Gravity
Volumetrics!A3     VMA
```

Copy the real wording into the matching field's `labels`. That is the whole remapping job — no
logic changes.

---

## 6. Open work, ranked

### 1. The DesignBook table does not exist — Save does not save

`supabase/schema.sql` has only the three technician tables. `saveDesign()` builds the payload and
displays the JSON instead of pretending to persist. Its shape:

```json
{
  "contract_id": "252112",
  "letting_date": "2026-01-17",
  "amp_number": "AMP 1",
  "sm_id": "jcavanah",
  "origin": "legacy",
  "stage": "Draft",
  "extracted_from": { "vma_pct": "Sheet1!C22" },
  "values": { "county": "Bourbon", "ac_pct": "5.2", "sieve_34": "100" },
  "rows": {
    "aggregate": [{ "producer": "Rogers Group", "pct_blend": "62.0", "gsb": "2.71" }],
    "ct": [{ "specimen": "CT #1", "l75": "0.041" }]
  },
  "saved_at": "2026-09-02T14:00:00.000Z"
}
```

Two real decisions before writing DDL, and I have not made either:

- **JSONB `values` vs real columns.** JSONB survives MixPack revisions without migrations, which
  matters given how much of the field map is still unknown. Real columns get type checking,
  constraints, and indexable queries — which matter more once anyone reports on this data.
  Probably: real columns for the stable identity and workflow fields (`contract_id`,
  `amp_number`, `sm_id`, `stage`, `mix_id`), JSONB for `values` until the field map settles.
- **Whether `technician_plant_access` should gate row visibility, or only row creation.** A
  technician who moves plants would lose sight of designs they authored if you gate reads on
  current plant access.

**RLS must be enabled on any new table before it ships**, per the CLAUDE.md gotcha. The anon key
is in all three files (correctly — it is the public key), and it is only safe because RLS is on.
Enable RLS first with no policy, then add policies. Run `get_advisors` after the DDL.

Scope the policy off `technician_capabilities` and `technician_plant_access` rather than
re-deriving the cert logic a third time — both already resolve from `auth.uid()` the same way.

### 2. Remap the `labels` arrays against a real MixPack

See §5. Fastest single improvement to the legacy path. Needs one real file.

### 3. Mix ID format is unknown

The prototype showed `MIX ID · 07210-AMD-260447`. I could not infer the generation rule, so
`designbook.html` shows `JOB · {cid} · {plant}` in that slot instead. Once the rule is known it
should be assigned by the database on insert, not by the browser.

### 4. Stage advance and audit log are in-memory only

The timeline advances and the audit log appends, but both reset on reload — there is nowhere to
persist them yet. They land with item 1. Note that stage transitions probably need their own
policy: a technician advancing their own design to "Approved" is likely wrong.

### 5. `PORTAL_URL` / `LOGIN_URL` assume flat paths

All three files assume they sit at the same directory depth. If anything moves into a subfolder,
update `CONFIG.LOGIN_URL` and `CONFIG.PORTAL_URL`. Andrew's root redirect (`93b116b`) points `/`
at `login.html`, which is consistent with this.

---

## 7. Conventions followed, and one deliberate departure

Followed:

- Single-file HTML, CSS and JS inline, no build step
- `CONFIG` block at the top of each file, all tunables in it, no magic numbers in functions
- Banner-fenced view blocks (`<!-- ===== SUB PORTAL ===== -->`) so blocks can be owned
- Anon key client-side, service_role key nowhere
- Label-anchored workbook reads, not fixed cell addresses
- `localStorage` used (standalone Netlify app, not an artifact)

**Departure:** CLAUDE.md says DesignBook and PlantBook are two views of one file. `designbook.html`
is a separate file from `login.html`, and PlantBook is not in it yet.

Reasoning: `login.html` is 523 lines of Andrew's auth and onboarding flow, and merging a form this
size into it invites exactly the conflict the convention exists to prevent. When PlantBook is
built it should go into `designbook.html` as a second banner-fenced block sharing the schema
renderer, at which point the file should probably be renamed. Flagging this as a decision to
ratify or reverse, not a rule quietly ignored.

`portal.html` takes `?book=plantbook` already, so PlantBook reuses the same portal rather than
needing a second copy of it.

Theme tokens (paper/ink palette, Space Grotesk + IBM Plex) are duplicated from the Layout A
prototype into both files, as are `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Both are shared ground —
if the Supabase project moves or the palette changes, three files need the edit.

---

## 8. Smoke test

Deploy, sign in as a technician with a current Mix Design Tech cert and at least one
`technician_plant_access` row, then:

1. `/portal.html` → header shows your name, company, SM ID, and two badges; DesignBook badge granted.
2. Plant dropdown lists your AMP numbers and only yours; hint reads "N plants assigned to you."
3. Generate with a field blank → "Still needed: …", no navigation.
4. Generate filled → Sub Portal shows the three values as chips.
5. Build New → DesignBook form, 7 sections, Outstanding items rail populated, nav ticks empty.
6. Type two sieve values → the 0.45 power chart draws a line between them.
7. Fill a section fully → its nav tick goes solid and it leaves the Outstanding list.
8. Save design → payload JSON appears, with the "not saved, no table yet" warning.
9. Sign out, hit `/designbook.html?mode=new&cid=1&letting=2026-01-01&plant=X` directly → bounced to login.

Then sign in as a **Plant Tech only** technician:

10. Sub Portal shows both buttons disabled, labelled "Mix Design Tech cert required."
11. Direct-navigating to `/designbook.html?mode=new&...` shows the cert message, not the form.

Step 11 is the one worth actually running — it is the check that the capability gate is applied at
the page and not only on the button.

---

## 9. For `CLAUDE.md`

Durable facts from this work, if they are worth appending:

- Pages downstream of `login.html` need no session plumbing — the Supabase client's per-origin
  `localStorage` persistence means `getSession()` just works on any same-site page. Deploy them to
  the same Netlify site and do not invent a token hand-off.
- Client-side capability checks must be applied at page load, not only to the button that
  navigates. Both `portal.html` and `designbook.html` re-check `can_access_designbook`
  independently, because the second one is directly linkable.
- The DesignBook form renders from a `CONFIG.SECTIONS` schema. Adding or renaming a field means
  editing that schema only — the markup, xlsx extractor, validation rail, and save payload all
  derive from it. Do not hand-write field markup back in; it reintroduces the four-copies problem.
- MixPack extraction confidence is surfaced in the UI on purpose (tint + source cell address).
  Extracted values are a starting point for a human, never an authority. Keep that visible in any
  future importer.
