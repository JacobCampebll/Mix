# Prep for Andrew + Jake's in-person session (2026-09-18)

Compiled by Claude on 2026-09-17 while Andrew was away from the keyboard, by
reading CLAUDE.md end to end plus the current repo/branch state. Nothing in
this file was written by making changes — it's a scan-and-summarize pass.
Every claim below is either quoted/paraphrased from an existing CLAUDE.md
entry (dated) or something I checked directly against the live working tree
today (marked "checked 2026-09-17"). Verify before treating as gospel — same
rule this file applies to everyone else's notes.

## 1. Housekeeping: 13 stray branches, all safe to delete

Checked every local + `origin` branch other than the deploy branch
(`claude/mix-conventions-setup-w3dq6s`) against it. **All 13 are fully
contained in the deploy branch already** — either merged as a PR under a
different commit hash (squash/rebase merge changes the hash even when the
content is identical) or leftover session/worktree pointers. None carry any
commit that isn't already on deploy, so none of this is lost work sitting
somewhere it shouldn't be:

- `designbook-plantbook-design-mirrors` (tip `1a7db0e`) — this is the source
  branch for PR #18 ("PlantBook: Contract & Mix mirrors the approved
  design's aggregate structure and design values"), merged 2026-09-14 as
  `106653f`. Confirmed present and working in current `public/designbook.html`
  (`design-aggregate` / `design-values-ref` sections, `designMirrorHTML`).
- `plantbook-sublot-tabs` (tip `8de721b`) — source branch for PR #19
  ("Sublots and Cores become four Sublot 1-4 tabs"), merged 2026-09-14 as
  `9bd37b2`. CLAUDE.md's sublot-tab notes describe this feature as shipped.
- `check-bridge-stale-comment` (tip `0179f40`) — a one-line comment fix to
  `scripts/amaw/check_bridge.mjs`; the exact same wording is already on
  deploy (applied independently, different commit).
- The other 10 (`plantbook-aadtt-wording`, `plantbook-aggregate-blend-merge`,
  `plantbook-blend-per-sublot`, `plantbook-contract-mix-banners-gradation`,
  `plantbook-sublot-lock-fix`, `plantbook-sublot-overflow-fix`,
  `plantbook-sublot-space-gradation-chart`, `verify-plantbook-branch`, and
  the two `worktree-agent-*` branches) have **zero commits ahead of deploy**
  — they're pointers to commits that are now ancestors of the deploy branch.

Nobody needs to review anything here; this is just tidying. If you want it
gone:

```bash
git branch -d designbook-plantbook-design-mirrors plantbook-sublot-tabs check-bridge-stale-comment plantbook-aadtt-wording plantbook-aggregate-blend-merge plantbook-blend-per-sublot plantbook-contract-mix-banners-gradation plantbook-sublot-lock-fix plantbook-sublot-overflow-fix plantbook-sublot-space-gradation-chart verify-plantbook-branch worktree-agent-a1dd82a906a245760 worktree-agent-ac3fd37514d48c75d
git push origin --delete designbook-plantbook-design-mirrors plantbook-sublot-tabs check-bridge-stale-comment plantbook-aadtt-wording plantbook-aggregate-blend-merge plantbook-blend-per-sublot plantbook-contract-mix-banners-gradation plantbook-sublot-lock-fix plantbook-sublot-overflow-fix plantbook-sublot-space-gradation-chart
```

(`git branch -d`, lowercase, refuses to delete anything with unmerged
commits — so this command is self-checking; it will error rather than
silently discard something if my read above turns out to be wrong on any
one of them.) I didn't run this myself — deleting branches is Andrew/Jake's
call, not something to do unattended.

## 2. Real open questions worth deciding in person

Pulled from every `Open for` / `OPEN` marker in CLAUDE.md that doesn't
already have a later "SETTLED" or "CORRECTED" entry closing it out.

### Needs Tate (KYTC Central Office / spec interpretation)
- **CAA polish check**: `caa` is currently one field checked against the
  "two-or-more-crushed-faces" figure. Confirm whether KYTC wants the
  one-crushed-face value tracked as a separate field. (KM p.472 verification
  tolerances are noted in `CONFIG.CONSENSUS_CRITERIA`'s comment but not
  enforced — that's the Department's re-test side.)
- **403.03.03 A) fine-aggregate column**: does KYTC actually enforce the
  *fine* aggregate polish-resistance column (30% Class B / 20% Class A from
  a classed fine source), or only the coarse column? Approved design #467PA
  passes the coarse column at 54.2% but has 0% from any classed fine source
  under either reading — it would fail the fine column as written, and the
  MixPack's own Polish-Resistant tab only ever computed the coarse side.
- **MCL / sublot-1 pay quirks**: the workbook pays 100% for an MCL air void
  or VMA on lot 1 sublot 1 (`"MCL" >= 90` is true in Excel because text
  outranks numbers there), and `Calculations!A72`'s 100%-cap doesn't
  actually apply to `'Pay Values'!J23`/`J24`, so both real accepted lots
  were paid uncapped. Both are reproduced faithfully because that's what
  every approved lot on file was judged by — but PlantBook is now the
  *second* system doing this, worth Tate confirming it's intentional rather
  than a workbook bug nobody's caught.
- **Lot number reset scope**: per contract, per line item (PCN), or per
  design? `addresses.mjs`'s own comment and `storage.mjs`'s identity
  scheme (contract + plant + mix_id + lot_number) disagree, and no real
  file on hand settles it. This affects the new roll-forward feature
  (2026-09-16, "Start lot n+1") and the sublot-1 setup allowance.

### Needs Andrew (reference data / KYTC-internal knowledge)
- **District 01-12 lab codes** — the oldest open item in this file, and
  checking it against `kytc_district_labs` (2026-09-17 evening) sharpened
  the question rather than closing it. That table has no district-number
  column (it's keyed by `lab_name`, e.g. "D-07 Materials Section"), but it
  does have a clean `D-01`...`D-12 Materials Section` row per district
  (`LU01210`...`LU12210`) — and that series **exactly matches** the MixPack
  template's `Chart Data!AV2:AV14` list CLAUDE.md called "untrusted,"
  confirmed now via a second, independent source (SiteManager's real
  `t_qualf_lab` export). That part of the old note is resolved: the
  template list is real.
  **But the "one real data point" `CONFIG.MIXPACK.DISTRICTS["07"] = "LU00642"`
  turns out to be `CO Materials - Asphalt Mixtures Section` in this table —
  Central Office, not District 07** (`D-07 Materials Section` is a
  different code, `LU07210`). That confirms CLAUDE.md's half-suspicion that
  design approval routes through Central Office regardless of the plant's
  district, rather than `DISTRICTS` genuinely needing 12 different codes.
  The sample-id component (`sampleLab: "640"`) reinforces this: it's not in
  the table at all except as `Central Office Materials → DL00640`, a third
  distinct Central Office entry — again Central Office, not any district.
  **So the real question for tomorrow isn't "what are districts 01-12's
  codes" any more — it's "does every MixPack use the Central Office code
  regardless of plant district, or was #467PA's district-07 file an
  exception?"** If it's always Central Office, this is a one-line fix
  (drop the per-district framing entirely) rather than an 11-row one. Andrew
  or Tate would know; I don't have a second real file from another district
  to check it against.
- **LU vs DL code**: every KYTC district/section lab has two codes on file
  (`LU#####` and `DL#####`). Nothing confirms which one the AMAW's
  `'Pay Values'!I5` wants — both real completed AMAWs leave I5 blank. The
  dropdown currently defaults to the LU series (confirmed correct for
  DesignBook's MixPack) with DL riding along as an alias.
- **Sample id prefix** (`'Pay Values'!B3`, feeds every `t_smpl.smpl_id`):
  no known convention for what a *lot's* prefix should be, and both real
  accepted lots leave it blank. Deliberately not written rather than
  guessed. Distinct from the district-lab question above — this is a
  different cell with no known derivation at all, not just missing data.

## 3. Standing debts (not decisions — just don't forget these exist)

- **No browser-built MixPack or AMAW has ever actually been loaded into
  MEDL.** Repeated as a debt at least three times across CLAUDE.md. Every
  check in the harness validates arithmetic and cell-mapping against real
  *completed* workbooks, but nobody has confirmed a file this app generates
  actually loads. This is the single biggest unproven assumption in either
  book.
- **PlantBook has a `?sublots=open` bypass** that unlocks every sublot for
  demo purposes and stamps `sublots_unlocked` on anything generated under
  it. Real and deliberate, not a bug — worth knowing it exists if either of
  you wants to demo a fully-filled lot tomorrow without waiting on real
  production tonnage.
- **PCN → route parsing is unbuilt.** `kytc-notes`/`kytc-lookup` can find a
  contract's compaction Option A/B note, but on a two-route contract (like
  262120: Option A on KY 627, Option B on US 25) it can't yet tell which
  route the design's project number is on — the Project(s) page of that
  proposal uses a subsetted CID font that decodes to garbage with the
  current hand-rolled PDF reader. Andrew's function, not yet started.

## 4. What shipped today (2026-09-17), for orientation

A lot landed today across at least two sessions — useful to walk in already
oriented rather than re-deriving it from `git log`:
- Producer/supplier lab id lookups: two new Supabase tables
  (`producer_supplier_labs`, `kytc_district_labs`), wired into both lab
  fields on PlantBook's Contract & Mix step, then simplified (trigger-
  maintained `lab_name` instead of a view) and both required fields.
- The "which Supabase project" confusion from earlier today is resolved:
  the app's project is `iwysxhcmvhkcjxmjarkd` (per `CONFIG.SUPABASE_URL`);
  a personal/unrelated project (`allen-qc`) was what one session's MCP
  connector happened to be pointed at, which is why some probes came back
  empty. Worth remembering if a database check ever again "finds nothing" —
  check the project ref before trusting the answer.
- PlantBook's front door no longer crashes on a non-PDF/non-JSON upload.
- Gradation now takes raw weights per sublot and computes % passing itself
  (grams / this sublot's % passing / JMF target / deviation, four columns).
- Contract & Mix required fields go gold until filled, blue once done; Lot
  Pay's working-math lines are now clickable and jump to the control that
  measured them.

## 5. Suggested order

Housekeeping (§1) is a 30-second decision either of you can make solo.
Everything in §2 needs both of you (or Tate) in the room, which is
presumably the point of tomorrow — §2's four Tate items and three Andrew
items are the actual agenda. §3 is context to carry into any of those
conversations, not a decision itself.
