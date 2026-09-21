# Aggregate reference-data reconciliation: `aggregate_types` vs SiteManager `T_MATL`

**Status: open, multi-session, started 2026-09-21.** This is the working
audit for an ongoing effort - getting DesignBook/PlantBook's polish-resistant
designation right against KYTC's own scattered records (the LAM, SiteManager's
own material-code table, the MixPack's Chart Data tab, and whatever else turns
up). Andrew's own framing: "the challenge is that information here at the
Division of Materials is stored in too many places and in often a
disorganized manner." This doc exists so that fact doesn't also become true of
*our* record of the reconciliation - it is the data of record; CLAUDE.md
narrates only the decisions, dates and open questions, the same split it
already uses for `docs/lam-polish-resistant-sources.md` and
`docs/plantbook-lab-id-reconciliation.md`.

**How to use this across sessions**: read the "Open questions" section first.
If Andrew has since talked to Jake/Tate/anyone at Central Office, get the
answer, update the relevant row(s) in the audit table below, move the
question to "Resolved", and only THEN write anything to Supabase - and even
then, confirm the specific values with Andrew before running the UPDATE. If
nothing has changed, don't re-derive the table from scratch - it's already
here. When a new source document shows up (new LAM revision, a new
SiteManager export, anything from a Central Office materials engineer), add
it to "Sources" with its date and what it covers, and re-run the comparison
in the section it's relevant to.

## Sources

| Source | What it covers | Obtained |
|---|---|---|
| KYTC MixPack template, `Chart Data` tab | The 115-row extraction that originally became `aggregate_types` (type_name, mat_code, polish_resistant_class) | seeded 2026-09-02/03 |
| LAM (List of Approved Materials), Class A+/A/B Polish-Resistant Aggregate Source List, pp.37-51, dated 12/22/2025 | Per-producer, per-bench polish class certification | extracted 2026-09-11, `docs/lam-polish-resistant-sources.md`, `supabase/polish_resistant_sources.sql` |
| `SM basic material codes_Coop.xls` (SiteManager `tsm.T_MATL` export, sheet `T_MATL`, 906 rows / sheet `SQL` showing the source query) | SiteManager's own material-code catalog, all categories (AGGR is 147 of the 906) | pulled by Andrew, reconciled 2026-09-21, at `N:\MATERIAL\BITSHARE\Performance\AI Shit\Asphalt Documentation Task Force\SM basic material codes_Coop.xls` |
| Jake, verbal (via Andrew), 2026-09-18 | "All Dolomite products are polish resistant, and all Granite products are polish resistant" - confirmed by Andrew to mean "every KYTC-approved producer," not "any material regardless of source/bench" | CLAUDE.md, "A broader `aggregate_types` polish-resistant reconciliation pass" |

## What `mat_code` actually does (why this is worth getting right)

`aggregate_types.mat_code` isn't a display label. It's auto-filled onto the
Aggregate Structure row (tinted "SiteManager code - auto-filled, not read by a
reviewer") and flows into both generated hand-off files: the MixPack's
`Design Data!H` column (`designbook.html` line ~12321) and the AMAW mapper's
`matCodeFor` (line ~16865, `scripts/amaw/`). A wrong code here is a wrong
value in the file KYTC loads into SiteManager/MEDL - the same class of stakes
as every other reference-table gotcha in CLAUDE.md.

## The SiteManager tier model (derived 2026-09-21, worth keeping - this took real reading to work out)

SiteManager's asphalt-aggregate codes (`MATL_CATG_T = 'AGGR'`, name containing
`ASPH`) are **not** uniformly one-code-per-size. For exactly five nominal
coarse sizes - `#67`, `#68`, `#78`, `#8`, `#9M` - SiteManager carries **four**
codes each:

| Tier | Example (#67) | Meaning |
|---|---|---|
| base | `10350` ASPH AGG #67 | unclassed |
| A+ | `10354` ASPH AGG #67 A-SKD A+ | Class A+ |
| A | `10355` ASPH AGG #67 ANTI-SKID A | Class A |
| B | `10360` ASPH AGG #67 ANTI-SKID B | Class B |

The same four-tier shape exists once more for the fine (sand) family (base
`10310`/`10313` washed/unwashed, A+ `10438`, A `10436`, B `10437` - note the
fine tiers do NOT carry the washed/unwashed split the base codes do) and for
non-graded coarse (base `10440`, A+ `10429`, A `10430`, B `10435`). `#11`'s
gets a partial version: washed/unwashed base codes (`10295`/`10297`) plus a
single A/B pair (`10298`/`10299`) that does not itself distinguish washed from
unwashed.

**Everything else in the catalog has exactly one code, full stop** - `#57`,
`#4`, `#467`, `#357`, `#5`, `#10`'s, NSG-fine, DGA, mineral filler,
"combined-NSG". SiteManager never split those by class at all, which matches
`aggregate_types` already having no Class A/B rows for those sizes either -
no bug there.

**Within a tier, SiteManager genuinely is lithology-blind** - Dolomite Class A,
Limestone Class A, Slag Class A at `#67` all correctly share `10355`. That
part of the existing `aggregate_types` design already matches SiteManager's
own model and needs no fix. The bugs below are all cases where a row's
`polish_resistant_class` disagrees with the tier its own `mat_code` says it's
in - which is a `mat_code` problem, a `polish_resistant_class` problem, or
both, and which one depends on the material (see per-row notes).

**The A+ tier is currently unused by any `aggregate_types` row at all** - not
one of the 7 A+ codes (`10354`, `10369`, `10384`, `10399`, `10414`, `10429`,
`10438`) is referenced, even though `polish_resistant_class`'s own check
constraint already allows `'A+'` (confirmed live 2026-09-21:
`CHECK (polish_resistant_class = ANY (ARRAY['A+','A','B']))`) - the schema
anticipated this and nobody has wired a row to it yet.

## Full audit table (110 `aggregate_types` rows in the ASPH AGG family)

24 rows disagree with SiteManager's own tier for their `mat_code`.

| type_name | mat_code | our class | SiteManager code name | SiteManager tier | status |
|---|---|---|---|---|---|
| Dol. #10's Washed | 10290 | - | ASPH AGG - #10 WASHED | - | match |
| LS #10's (Washed) | 10290 | - | ASPH AGG - #10 WASHED | - | match |
| Dol. #10's Unwashed | 10293 | - | ASPH AGG - #10 UNWASHED | - | match |
| LS #10's (Unwashed) | 10293 | - | ASPH AGG - #10 UNWASHED | - | match |
| Dol. #11's Washed | 10295 | - | ASPH AGG - #11 WASHED | - | match |
| LS #11's (Washed) | 10295 | - | ASPH AGG - #11 WASHED | - | match |
| Sandst. #11's Class A | 10295 | A | ASPH AGG - #11 WASHED | - | **MISMATCH** |
| Dol. #11's Unwashed | 10297 | - | ASPH AGG - #11 UNWASHED | - | match |
| LS #11's (Unwashed) | 10297 | - | ASPH AGG - #11 UNWASHED | - | match |
| Dolomite Comb.-NSG | 10300 | - | ASPH AGG - COMBINED-NON-SPECIFIC GRADE | - | match |
| LS Combined-NSG | 10300 | - | ASPH AGG - COMBINED-NON-SPECIFIC GRADE | - | match |
| ROM | 10300 | - | ASPH AGG - COMBINED-NON-SPECIFIC GRADE | - | match |
| Gravel Sand-Crushed | 10305 | - | ASPH AGG - CRUSHED GRAVEL SAND | - | match |
| Dol. Sand (Washed) | 10310 | - | ASPH AGG - FINE WASHED | - | match |
| LSS (Washed) | 10310 | - | ASPH AGG - FINE WASHED | - | match |
| Quartzite Sand (Washed) Class A | 10310 | A | ASPH AGG - FINE WASHED | - | **MISMATCH** |
| Sandst. Sand (Washed) Class A | 10310 | A | ASPH AGG - FINE WASHED | - | **MISMATCH** |
| Dol. Sand (Unwashed) | 10313 | - | ASPH AGG - FINE UNWASHED | - | match |
| LSS (Unwashed) | 10313 | - | ASPH AGG - FINE UNWASHED | - | match |
| Quartzite Sand (Unwashed) Class A | 10313 | A | ASPH AGG - FINE UNWASHED | - | **MISMATCH** |
| Sandst. Sand (Unwashed) Class A | 10313 | A | ASPH AGG - FINE UNWASHED | - | **MISMATCH** |
| Mineral Filler | 10315 | - | ASPH AGG - MINERAL FILLER | - | match |
| Dol. NSG Fine (Washed) | 10320 | - | ASPH AGG - NSG-FINE WASHED | - | match |
| LS NSG-Fine (Washed) | 10320 | - | ASPH AGG - NSG-FINE WASHED | - | match |
| Dol. NSG Fine (Unwashed) | 10323 | - | ASPH AGG - NSG-FINE UNWASHED | - | match |
| LS NSG-Fine (Unwashed) | 10323 | - | ASPH AGG - NSG-FINE UNWASHED | - | match |
| Limestone #357's | 10325 | - | ASPH AGG #357 | - | match |
| Limestone #4's | 10330 | - | ASPH AGG #4 | - | match |
| Limestone #467's | 10335 | - | ASPH AGG #467 | - | match |
| Limestone #5's | 10340 | - | ASPH AGG #5 | - | match |
| Gravel #57's | 10345 | - | ASPH AGG #57 | - | match |
| Limestone #57's | 10345 | - | ASPH AGG #57 | - | match |
| Slag #57's | 10345 | - | ASPH AGG #57 | - | match |
| Dolomite #67's | 10350 | - | ASPH AGG #67 | - | match |
| Limestone #67's | 10350 | - | ASPH AGG #67 | - | match |
| Dolomite #67's Class A | 10355 | A | ASPH AGG #67 ANTI-SKID A | A | match |
| Granite #67's | 10355 | - | ASPH AGG #67 ANTI-SKID A | A | **MISMATCH** |
| Gravel #67's | 10355 | - | ASPH AGG #67 ANTI-SKID A | A | **MISMATCH** |
| LS #67's Class A | 10355 | A | ASPH AGG #67 ANTI-SKID A | A | match |
| Siltstone #67's | 10355 | - | ASPH AGG #67 ANTI-SKID A | A | **MISMATCH** |
| Slag #67's Class A | 10355 | A | ASPH AGG #67 ANTI-SKID A | A | match |
| Dolomite #67's Class B | 10360 | B | ASPH AGG #67 ANTI-SKID B | B | match |
| LS #67's Class B | 10360 | B | ASPH AGG #67 ANTI-SKID B | B | match |
| Slag #67's Class B | 10360 | B | ASPH AGG #67 ANTI-SKID B | B | match |
| Dolomite #68's | 10365 | - | ASPH AGG #68 | - | match |
| Limestone #68's | 10365 | - | ASPH AGG #68 | - | match |
| Dolomite #68's Class A | 10370 | A | ASPH AGG #68 ANTI-SKID A | A | match |
| LS #68's Class A | 10370 | A | ASPH AGG #68 ANTI-SKID A | A | match |
| Slag #68's Class A | 10370 | A | ASPH AGG #68 ANTI-SKID A | A | match |
| Dolomite #68's Class B | 10375 | B | ASPH AGG #68 ANTI-SKID B | B | match |
| LS #68's Class B | 10375 | B | ASPH AGG #68 ANTI-SKID B | B | match |
| Slag #68's Class B | 10375 | B | ASPH AGG #68 ANTI-SKID B | B | match |
| Dolomite #78's | 10380 | - | ASPH AGG #78 | - | match |
| Limestone #78's | 10380 | - | ASPH AGG #78 | - | match |
| Dolomite #78's Class A | 10385 | A | ASPH AGG #78 ANTI-SKID A | A | match |
| Granite #78's | 10385 | - | ASPH AGG #78 ANTI-SKID A | A | **MISMATCH** |
| Gravel #78's | 10385 | - | ASPH AGG #78 ANTI-SKID A | A | **MISMATCH** |
| LS #78's Class A | 10385 | A | ASPH AGG #78 ANTI-SKID A | A | match |
| Sandst. #78's Class A | 10385 | A | ASPH AGG #78 ANTI-SKID A | A | match |
| Siltstone #78's | 10385 | - | ASPH AGG #78 ANTI-SKID A | A | **MISMATCH** |
| Slag #78's Class A | 10385 | A | ASPH AGG #78 ANTI-SKID A | A | match |
| Dolomite #78's Class B | 10390 | B | ASPH AGG #78 ANTI-SKID B | B | match |
| LS #78's Class B | 10390 | B | ASPH AGG #78 ANTI-SKID B | B | match |
| Slag #78's Class B | 10390 | B | ASPH AGG #78 ANTI-SKID B | B | match |
| Dolomite #8's | 10395 | - | ASPH AGG #8 | - | match |
| Limestone #8's | 10395 | - | ASPH AGG #8 | - | match |
| Dolomite #8's Class A | 10400 | A | ASPH AGG #8 ANTI SKID A | A | match |
| Granite #8's | 10400 | - | ASPH AGG #8 ANTI SKID A | A | **MISMATCH** |
| Gravel #8's | 10400 | - | ASPH AGG #8 ANTI SKID A | A | **MISMATCH** |
| LS #8's Class A | 10400 | A | ASPH AGG #8 ANTI SKID A | A | match |
| Quartzite #8's Class A | 10400 | A | ASPH AGG #8 ANTI SKID A | A | match |
| Sandst. #8's Class A | 10400 | A | ASPH AGG #8 ANTI SKID A | A | match |
| Siltstone #8's | 10400 | - | ASPH AGG #8 ANTI SKID A | A | **MISMATCH** |
| Slag #8's Class A | 10400 | A | ASPH AGG #8 ANTI SKID A | A | match |
| Dolomite #8's Class B | 10405 | B | ASPH AGG #8 ANTI SKID B | B | match |
| LS #8's Class B | 10405 | B | ASPH AGG #8 ANTI SKID B | B | match |
| Slag #8's Class B | 10405 | B | ASPH AGG #8 ANTI SKID B | B | match |
| Dolomite #9M's | 10410 | - | ASPH AGG #9M | - | match |
| Limestone #9M's | 10410 | - | ASPH AGG #9M | - | match |
| Dolomite #9M's Class A | 10415 | A | ASPH AGG #9M ANTI-SKID A | A | match |
| Granite #9M's | 10415 | - | ASPH AGG #9M ANTI-SKID A | A | **MISMATCH** |
| Gravel #9M's | 10415 | - | ASPH AGG #9M ANTI-SKID A | A | **MISMATCH** |
| LS #9M's Class A | 10415 | A | ASPH AGG #9M ANTI-SKID A | A | match |
| Quartzite #9M's Class A | 10415 | A | ASPH AGG #9M ANTI-SKID A | A | match |
| Sandst. #9-M's Class A | 10415 | A | ASPH AGG #9M ANTI-SKID A | A | match |
| Siltstone #9M's | 10415 | - | ASPH AGG #9M ANTI-SKID A | A | **MISMATCH** |
| Slag #9M's Class A | 10415 | A | ASPH AGG #9M ANTI-SKID A | A | match |
| Dolomite #9M's Class B | 10420 | B | ASPH AGG #9M ANTI-SKID B | B | match |
| LS #9M's Class B | 10420 | B | ASPH AGG #9M ANTI-SKID B | B | match |
| Slag #9M's Class B | 10420 | B | ASPH AGG #9M ANTI-SKID B | B | match |
| Limestone DGA | 10425 | - | ASPH AGG DGA | - | match |
| Dolomite NSG Class A | 10430 | A | ASPH AGG NON-GRAD ANTI-SKID A | A | match |
| LS NSG Class A | 10430 | A | ASPH AGG NON-GRAD ANTI-SKID A | A | match |
| Slag NSG Class A | 10430 | A | ASPH AGG NON-GRAD ANTI-SKID A | A | match |
| Dolomite NSG Class B | 10435 | B | ASPH AGG NON-GRAD ANTI-SKID B | B | match |
| LS NSG Class B | 10435 | B | ASPH AGG NON-GRAD ANTI-SKID B | B | match |
| Slag NSG Class B | 10435 | B | ASPH AGG NON-GRAD ANTI-SKID B | B | match |
| Dolomite Sand Class A | 10436 | A | ASPHALT AGGREGATE FINE ANTI-SKID A | A | match |
| Granite Sand | 10436 | - | ASPHALT AGGREGATE FINE ANTI-SKID A | A | **MISMATCH** |
| LSS Anti-Skid A (Unwashed) | 10436 | - | ASPHALT AGGREGATE FINE ANTI-SKID A | A | **MISMATCH** |
| LSS Anti-Skid A (Washed) | 10436 | - | ASPHALT AGGREGATE FINE ANTI-SKID A | A | **MISMATCH** |
| Natural Sand | 10436 | - | ASPHALT AGGREGATE FINE ANTI-SKID A | A | **MISMATCH** |
| Siltstone Sand | 10436 | - | ASPHALT AGGREGATE FINE ANTI-SKID A | A | **MISMATCH** |
| Slag Sand Class A | 10436 | A | ASPHALT AGGREGATE FINE ANTI-SKID A | A | match |
| Dolomite Sand Class B | 10437 | B | ASPHALT AGGREGATE FINE ANTI-SKID B | B | match |
| LSS Anti-Skid B (Unwashed) | 10437 | - | ASPHALT AGGREGATE FINE ANTI-SKID B | B | **MISMATCH** |
| LSS Anti-Skid B (Washed) | 10437 | - | ASPHALT AGGREGATE FINE ANTI-SKID B | B | **MISMATCH** |
| Slag Sand Class B | 10437 | B | ASPHALT AGGREGATE FINE ANTI-SKID B | B | match |
| Dolomite NSG-Coarse | 10440 | - | ASPH NON-SPECIFIC GRADE-COARSE | - | match |
| LS NSG-Coarse | 10440 | - | ASPH NON-SPECIFIC GRADE-COARSE | - | match |

## Findings needing no further work

- Every row not flagged `MISMATCH` above is internally consistent - the
  `mat_code` and `polish_resistant_class` agree with what SiteManager itself
  calls that code. No action needed on the 86 matching rows.
- The lithology-blind-within-a-tier design (multiple `type_name`s sharing one
  `mat_code`) is correct and matches SiteManager's own model. Don't "fix"
  this by giving each lithology its own code - SiteManager doesn't have one.

## Findings that need a person's judgment before any Supabase write

Grouped by what's actually unresolved, not just by which rows are flagged -
several rows below share one open question.

### 1. Five rows claim Class A but sit on an unclassed SiteManager code
`Sandst. #11's Class A` (`10295`), `Quartzite Sand (Washed/Unwashed) Class A`
(`10310`/`10313`), `Sandst. Sand (Washed/Unwashed) Class A` (`10310`/`10313`).
These would hand SiteManager the *unclassed* material code for something
DesignBook tells a reviewer is polish-resistant. SiteManager has real Class A
codes available that nothing currently uses: `10298` (#11 Anti-Skid A) and
`10438` (fine Anti-Skid A+, one tier up - fine sand's family jumps straight to
A+, there is no separate fine "A" tier the way coarse sizes have one; see open
question 4). **Likely a straightforward mat_code fix once question 4 is
settled** - low ambiguity on the class value itself (LAM already lists these
as Class A - `docs/lam-polish-resistant-sources.md`), the only question is
which of `10436`/`10438` a "fine Class A" row should actually point at.

### 2. `Granite`, `Gravel`, `Siltstone` (coarse, all four sizes) sit on the Class A code with no class value
12 rows: `Granite`/`Gravel`/`Siltstone` `#67`/`#78`/`#8`/`#9M`'s, all at the
"ANTI-SKID A" code with `polish_resistant_class = null`. Three different
materials, three different answers likely needed:
- **Granite**: per Jake (confirmed 2026-09-18) and the LAM (Class A+, no
  restriction, all 4 approved producers), Granite is very likely supposed to
  be on the **A+** codes (`10354`/`10384`/`10399`/`10414`), not the plain
  Class A ones it's on now - this is the natural home for the unused A+ tier.
  Not yet confirmed with Andrew as the specific fix to apply.
- **Gravel**: **no source found yet** settling whether crushed gravel is
  polish-resistant at all. Open - don't guess.
- **Siltstone**: CLAUDE.md already documents Siltstone as certified
  per-producer with no KY-wide generic answer, same structural shape as
  Granite pre-fix but *not* confirmed Class A the way Granite was. The generic
  row being unclassed is probably correct on the `polish_resistant_class`
  side - which argues the `mat_code` should probably move to the **base**
  unclassed code (`10350` etc.) rather than gaining a class value. Open.

### 3. Fine-sand equivalents of the same shape
`Granite Sand`, `Natural Sand`, `Siltstone Sand` (all `10436`, Class A code,
null class), plus `LSS Anti-Skid A/B (Washed/Unwashed)` (`10436`/`10437`,
also null class). The `LSS` ("Limestone Sand") ones are very likely a plain
data-entry gap - `Anti-Skid A`/`Anti-Skid B` is literally in the type_name,
`polish_resistant_class` should probably just be filled in to match. **Natural
Sand is a special case**: CLAUDE.md already establishes it's automatically
Class A for any approved producer (LAM p.37, confirmed by Andrew), and the
page already special-cases this in `polishFactsFor()` independent of what
`aggregate_types` says - so the `mat_code` (`10436`, Class A) may already be
*correct*, and the fix may be filling in `polish_resistant_class = 'A'` on the
table rather than touching the code. Worth deciding deliberately rather than
batch-fixing with the Granite/Siltstone rows above.

## Open questions (waiting on people, not more digging)

1. **The precise per-lithology rule from Jake and Tate**, carried over from
   the earlier pass: is "every KYTC-approved producer is Class A" (confirmed
   for Dolomite and Granite) true of any other lithology? Bears directly on
   Gravel and Siltstone above.
2. **Gravel's polish-resistant status** - nothing found yet, anywhere, that
   settles this either way.
3. **Whether the A+ codes are actually meant for Granite**, or whether
   Granite should stay on the plain Class A codes and A+ is meant for
   something else entirely (KYTC's LAM class labels and SiteManager's
   material-code tiers were extracted from different documents and have not
   been cross-confirmed to mean the same thing to a KYTC reviewer).
4. **Does fine (sand) aggregate skip a tier?** Coarse sizes have base/A+/A/B;
   fine only has base/A+/A/B too, structurally, but the "A" tier (`10436`)
   might be what KYTC actually means by "Class A sand" in practice, making
   the "A+" fine code (`10438`) the outlier needing its own explanation -
   unlike the coarse sizes where A+ clearly sits above A. Untested against
   any real approved design with a Class A+ or Class A fine component.
5. **Size-coverage gaps carried over from the earlier pass** (still open):
   Sandstone/Quartzite/Granite/Siltstone/Dolomite/Gravel are each missing some
   of the standard `#57`/`#67`/`#68`/`#78`/`#8`/`#9M` sizes that Limestone and
   Slag have in full. Unconfirmed whether that's a real SiteManager gap or an
   artifact of the original 115-row extraction.

## Resolved

- (nothing yet promoted out of "needs judgment" as of 2026-09-21 - this
  session found the mismatches and built the audit; no Supabase writes were
  made.)
