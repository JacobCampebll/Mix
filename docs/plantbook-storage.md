# PlantBook: where does a lot live?

**Status: undecided. Both models are being built.** Jake, 2026-09-13: "let's
build it both ways for now until I talk with Tate and Andrew." This document
is the argument, not the answer. It exists so that conversation starts from
the real failure modes rather than from taste.

Nothing in here has been applied to the live database.
`supabase/amaw_lots.sql` is written for Andrew to apply, or not.

---

## Why this is a question at all

DesignBook settled it on 2026-09-04: **nothing is stored in Supabase, the file
is the record.** That rule is load-bearing and it works, because of a property
of mix designs that nobody wrote down at the time —

> a mix design is filled in **one sitting, by one person, on one machine**,
> and ends in a single signed artifact.

A tech opens DesignBook, types or imports a design, and downloads a PDF. If
they close the tab they lose an afternoon. The blast radius of "the browser
forgot" is one person's afternoon, and the thing KYTC actually receives — the
submittal PDF, the approval PDF, the generated MixPack — is a file either way.

**An AMAW lot has none of those properties.** From `docs/amaw-map.md` and the
two real workbooks Jake supplied (contract 252112, Boonesboro, 4,000 tons
each):

| | Mix design | AMAW lot |
|---|---|---|
| Duration | one sitting | **2026-07-26 → 07-31** and **08-03 → 08-06** — days, with weekends in them |
| Authors | one technician | plant QC tech(s) across shifts, **plus** a KYTC district tech for QA01, **plus** whoever does IQ01 |
| Shape | one sample | **seven test records** — VI01, QC01–QC04, QA01, IQ01 — filled at different times by different people |
| Arrives | complete | **incrementally**, one 1,000-ton sublot at a time |

The QC01 record exists days before QA01 does. A plant technician cannot hold
a browser tab open for a week, and the person who fills QA01 may never have
touched the file that holds QC01–QC04.

So this is not "should we store data" in the abstract. It is: **does the
sublot-by-sublot accrual of a lot have somewhere durable to live between
Monday and Thursday, and can two different people both write into it?**

---

## (a) The FILE MODEL

Exactly DesignBook's: `localStorage` autosave of the in-progress lot, plus
"download working copy" / "open a file" at any time, and the completed lot
generating the AMAW `.xlsm` for MEDL the way an approved design generates the
MixPack.

**What it buys.** It is free. It is already built once, so the second build is
mostly a port. It keeps one rule for both books, which is worth more than it
sounds — "the site stores nothing" is a sentence a contractor understands and
a sentence nobody has to qualify. It has no RLS surface to get wrong, no
schema for Andrew to apply, no shared-database risk, and it works with the
plant's network down, which matters more at an asphalt plant than in an
office.

### What breaks, specifically

These are not hypotheticals; each one is reachable with the real timeline
above.

**1. `localStorage` is origin-scoped, and this project has two origins.**
`kytcmix.netlify.app` and `claude-jake-sandbox--kytcmix.netlify.app` are
different origins. Work autosaved on one is invisible on the other, with no
error and no hint — the lot simply is not there. Same for any deploy preview.
A technician sent a sandbox link on Tuesday and the production link on
Thursday has two half-lots and no way to see either from the other.

**2. Safari evicts `localStorage` after 7 days of no interaction with the
site.** This is ITP, it is on by default on every iPhone and iPad, and the
window is *shorter than the gap between some sublots*. Lot 2 ran 08-03 to
08-06, which survives; a lot that pauses for a rain delay or a plant shutdown
does not. There is no warning and no recovery. This alone is close to
disqualifying for a tablet-based plant workflow.

**3. Cleared site data is routine, not exceptional.** "Clear browsing data"
is the first thing anyone does when a browser misbehaves, IT pushes it on
managed machines, and a shared plant PC gets it weekly. CLAUDE.md already
records that `localStorage` reads can come back empty or throw. With a mix
design that costs an afternoon. With a lot it costs four sublots of test data
that cannot be re-measured — the specimens are gone, the trucks have left.

**4. A different device is a different lot.** Sublot 1 entered on the plant
laptop, sublot 3 on the tech's tablet at the lab bench. Nothing reconciles
them. The tech has to remember to download and carry a file, and the file is
a JSON blob in a Downloads folder competing with `amaw-lot-1 (3).json`.
Choosing wrong silently discards a sublot.

**5. The QA technician is a different person entirely, at a different
employer.** QA01 is Department acceptance; IQ01 is independent assurance.
These are KYTC **district** personnel who visit the job. Under the file model
the only way they can contribute is: the contractor emails them the working
file, they open it, fill QA01, download it, email it back, and the contractor
must then not have edited their own copy in the meantime. That is a
merge-by-email workflow for a seven-record document, between two
organisations, over a week. It is the single strongest argument against the
file model and it has no good answer inside it.

**6. Two technicians at one plant, opposite shifts.** Night paving is normal.
Whoever downloads last wins; there is no merge, and the loser's sublot is
gone without either of them being told.

**7. Quota.** A design is small. A lot is not necessarily: `KYCT Data Sublot
# 1–4` are `A1:AE1031` each, `.45 Data` is `A1:AI108`, and there are four
gradation sheets. `localStorage` is ~5 MB per origin and throws
`QuotaExceededError` on overflow — mid-save, after the tech has typed the
data. The abstraction in `scripts/amaw/storage.mjs` catches it and reports,
but catching it does not create room.

**8. There is no moment to sign.** DesignBook's file model is safe partly
because it ends in an artifact a Netlify Function signs (`sign-approval`), so
tampering is detectable at the one point it matters. A lot has no equivalent
single moment — it accrues. A file that four people have passed around, each
able to edit every field including the ones the others filled, is a record
KYTC is being asked to accept tonnage on. "A status carried in a file is a
claim, not a fact" (CLAUDE.md) is a much bigger problem here than it was for
designs, because here the claims are *other people's measurements*.

**9. Failure is silent, total, and discovered at the worst moment.** Every
mode above presents identically: the lot is not there. Nobody finds out on
the day; they find out at close-out, when the lot is being paid on.

### The honest summary of (a)

The file model's unstated assumption is **one holder at a time**. That
assumption is true of a mix design and false of a lot. Every failure above is
that one assumption failing in a different way.

---

## (b) The STORED MODEL

A `lots` table in Supabase — as drafted, three objects:

- **`amaw_lots`** — identity (contract + plant + mix + lot number), status,
  lot-level values as `jsonb`.
- **`amaw_lot_records`** — **one row per test record**, seven per lot
  (`VI01`, `QC01`–`QC04`, `QA01`, `IQ01`), each with its own `jsonb` values
  and its own `revision`.
- **`amaw_lot_events`** — append-only audit, written by a trigger, the same
  shape `design_events` had.

Splitting the records out is the point, not a detail: **a contractor QC tech
saving sublot 3 and a district tech saving QA01 write different rows.** They
cannot clobber each other, they do not need to be online at the same time,
and the two populations can be governed by different policies. Put all seven
in one `jsonb` and you have rebuilt the merge problem inside the database.

**What it buys.**

- The week-long, multi-party accrual works at all — which is the whole
  question.
- The QA/IQ technician writes their own record from their own account, on
  their own device, without a file changing hands.
- A real audit trail: who entered which sublot, when. For data KYTC accepts
  tonnage on, that is not a nicety.
- Per-record optimistic concurrency (`revision`), so a stale tab reports a
  conflict instead of overwriting a colleague.
- Resume anywhere: the tech's phone, the plant laptop, the lab bench.
- The Portal gets a queue back. The 2026-09-04 change left "My submissions" /
  "Review queue" with no data source. For PlantBook there would be one —
  *open lots at your plants* is a genuinely useful screen and it is the
  natural landing page for a plant tech.

**What it costs.**

- **A schema change on the shared live project.** Supabase is one project for
  production and the sandbox (CLAUDE.md). This is Andrew's action, and the
  sandbox's "reads only, no DDL" promise means PlantBook cannot be built
  against it on the sandbox branch until Andrew applies something.
- **RLS surface.** Three objects, policies on each, plus SECURITY DEFINER
  functions for the department path. Every one is a chance to get it wrong,
  and the failure modes are quiet (`PGRST116` on a filtered UPDATE; an
  UPDATE-only policy silently touching 0 rows — both already recorded in
  CLAUDE.md, both directly relevant here).
- **District scoping has nowhere to live** — see below. Without it the
  department-side policies are wrong-grained on day one.
- **Confidentiality that did not arise for designs.** `all_plants` gives the
  12 Central Office people every plant. For designs that was fine — a design
  is submitted to them anyway. For PlantBook it means **KYTC sees a
  contractor's in-progress QC data before the contractor has closed the
  lot**, including a sublot the contractor might retest. Nobody has agreed to
  that. It is a policy question, not a technical one, and it needs Jake and
  Tate.
- **Retention and ownership.** Once lots are stored, somebody owns them, has
  to back them up, and has to answer how long they are kept.
- **Connectivity.** A plant is a bad place for a network. A save that
  requires the internet at the moment of entry is *worse* than
  `localStorage`, not better. This is why the abstraction exists and why the
  recommendation below is not "stored, delete the other one".

**What it reverses.** Less than it first appears, and this is the crux.

The 2026-09-04 decision is about **the deliverable**: the file KYTC receives
is the record, and there is no server-side mix-design library. That stays
true for PlantBook under either model — what KYTC loads into MEDL is the AMAW
`.xlsm`, generated in the browser exactly as the MixPack is today, and no
`lots` table changes that. What the stored model adds is a **durable
scratchpad for the week the lot is accruing**, which is a phase DesignBook
does not have.

Stated precisely: *the file is still the record; the database is the
workbench.* If that framing does not survive contact with Jake and Tate, the
recommendation below is wrong and (a) is right.

---

## Recommendation

**Build PlantBook on the stored model, keep the file model as the export /
import path and as the offline fallback, and put the choice behind one CONFIG
flag** (`CONFIG.STORAGE.BACKEND`, wired through `scripts/amaw/storage.mjs`).

Reasons, in order of weight:

1. **The QA/IQ record cannot be filled under the file model without email
   ping-pong between two organisations.** Nothing else on this page matters
   as much. A district tech visiting a job needs to write one record into a
   lot they did not create and will not hold; that is a database operation.
2. **Safari's 7-day eviction is shorter than a lot.** A storage layer that
   can lose the week's work because of a rain delay is not a storage layer
   for this workflow.
3. **The blast radius is asymmetric.** Losing a design costs an afternoon of
   typing; losing four sublots costs measurements on material that has been
   paved. Re-entry is impossible, not tedious.
4. **It does not actually reverse the DesignBook decision** — the artifact
   KYTC loads is still a generated workbook. It adds a workbench under a
   phase that DesignBook never had.
5. **The flag makes it cheap to be wrong.** Both implementations satisfy one
   four-method interface. If Tate says no, PlantBook flips to `local` and
   loses the queue screen, not the app.

**What is reversible, either way — be explicit about this with Jake:**

- **Switching backends is reversible and cheap**, by construction: the page
  only ever calls `save / load / list / remove`, and the envelope on disk and
  the envelope in `jsonb` are the same shape. Flipping the flag changes where
  a lot lives, not what it is.
- **Applying the DDL is reversible.** Tables, policies, functions, one
  `drop`. `designs` is the precedent in the other direction: applied,
  superseded, deliberately kept because it costs nothing.
- **Data already written is the part that is not reversible.** Once real QC
  data is in Supabase there is a retention and ownership question that cannot
  be un-asked, and a contractor who objects later is objecting to something
  that already happened. So decide the confidentiality question *before*
  Andrew applies, not after.
- **`APPROVAL_SIGNING_SECRET`-style one-way doors: none here.** Nothing in
  this design is set-once.
- **The record-per-block split is the one shape decision that is expensive to
  undo later** — it is what makes concurrent multi-party writes work, and
  retrofitting it after lots exist means a migration. Get it right now; it is
  free today.

---

## Open questions — for Jake, Tate and Andrew

Things nobody has been asked yet. The first three block the DDL.

1. **Who is the custodian of an in-progress lot — the contractor or KYTC?**
   This decides the default read policy. Today's draft says "anyone with
   effective plant access", which via `all_plants` means all 12 Central
   Office people can read a contractor's QC data before the lot is closed.
   Is that acceptable to Tate, and to the contractors?
2. **District scoping (Andrew).** `technicians` has `sm_id, first_name,
   last_name, company, certifications, user_id, onboarded, all_plants,
   can_review` — **no district column**. QA01/IQ01 are filled by district
   personnel across 12 districts, and there is nowhere to record which
   district a technician belongs to or which district a plant sits in. The
   draft uses `can_review` as a stand-in, which is *wrong* — `can_review` is
   the 12 Central Office reviewers, a different population from ~12 districts
   of field techs. No column has been invented. This needs Andrew to say what
   the real shape is: a `district` column on `technicians`, a `district` on
   `plants`, or a separate assignment table.
3. **Is a lot ever re-opened after acceptance?** A retest, a correction, a
   voided sublot. If yes, `status` is not one-way and the guard trigger needs
   a send-back path like `designs_guard()` has.
4. **Is a lot always four sublots?** The map assumes `QC01`–`QC04` because
   the staging sheet has four blocks, but a short lot (a job that ends at
   2,400 tons) must go somewhere. Also: core count is **not** fixed — lot 1
   has six, lot 2 has ten.
5. **Does PlantBook need to work offline?** If yes, the answer is not "pick a
   backend" but local-first with sync, and the abstraction should grow a
   third implementation that writes both and reconciles. Worth knowing before
   building either one properly.
6. **Who closes a lot, and is there a signed artifact?** DesignBook's chain
   of custody ends at a signed approval. A lot's does not, currently. Should
   closing a lot produce something `verify.html` can check?
7. **Retention.** How long do lots stay, and who can delete one? The draft
   allows no deletes at all past `Open`.
8. **Can two contractors share one AMP number?** `technician_plant_access` is
   per-plant, not per-company. If a plant is ever shared, plant-scoped reads
   leak one contractor's QC data to another. Probably not the case, but it
   should be confirmed rather than assumed.
