# The AMAW workbook, mapped

First look at a real AMAW, 2026-09-13. Nothing is built against it yet — this
is the survey that says what PlantBook has to produce and how much of the
MixPack machinery carries over.

**Get it from KYTC, do not hunt for it.** Both versions are public downloads
off the same SiteManager page the MixPack templates come from
(`transportation.ky.gov/Materials/Pages/SiteManager.aspx`):

| File | Size |
|---|---|
| `/Materials/Documents/AMAW_VER14_01.xlsm` | 977,239 — current, this map |
| `/Materials/Documents/AMAW_VER13_04.xlsm` | 977,671 — previous |

Deliberately **not committed**. The blank MixPack is in the repo because the
generator writes into it and Netlify has to serve it; nothing needs the AMAW
yet, and 977 KB of binary with no caller is just weight. Note `.gitignore`'s
`MIXPACK*.xls*` rule does not catch `AMAW_*`, so it would land if added
without thinking.

---

## The headline

**The engine ports. The mapper does not.**

Same loader architecture as the MixPack, verified rather than assumed — same
XML map, same staging tables, same column names, same `Project Items` sheet.
The zip-surgery writer and the staging evaluator in `scripts/mixpack/` (and
their port in `designbook.html`) are reusable as-is apart from four evaluator
functions. What is entirely new is the domain: acceptance testing over a
production lot, not one mix design.

**Version layout is stable, unlike the MixPack's.** Checked 2026-09-13 against
two completed workbooks Jake supplied, which are **Version 13.3** — older than
either public download. All 85 `AMAMAW` dictionary rows and every staging
dimension are identical across 13.3, 13.04 and 14.01, so a map built on one
version holds on the others. Note the version marker is `Pay Values!K1`; the
`Workbook Edits` changelog sheet is stale in all four files (its last entry is
from 2007) and the `discipline` row is the loader contract (`AMAW` / `v2.0`)
rather than the workbook version, so neither tells you which build you have.

---

## What is shared, exactly

**The XML map is byte-identical.** `xl/xmlMaps.xml` is 27,873 bytes in both
files — same `MaterialDisciplines_Map`, same `http://tempuri.org/XMLSchema.xsd`
namespace, same element roots (`discipline`, `t_smpl`, `t_cont_smpl`,
`t_cont_smpl_itm`, `t_rmrks_dtl`, `t_smpl_tst`, `t_smpl_tstr`,
`t_tst_rslt_hdr`, `t_tst_rslt_dtl`, `t_pcc`, `t_pcc_blnd`). That is one
contract shared across all eight MEDL disciplines, not a per-workbook schema —
which is why the roots include concrete (`t_pcc`) in a workbook that has no
concrete in it.

**Seven staging tables, identical column lists.** Compared column by column;
every one matches, including all 54 of `t_smpl`'s:

| Sheet | AMAW ref | MixPack ref | Columns |
|---|---|---|---|
| `t_smpl` | B7:BC14 | B7:BC8 | identical (54) |
| `t_cont_smpl` | B7:H14 | B7:H8 | identical (7) |
| `t_smpl_tst` | B7:K14 | B7:K8 | identical (10) |
| `t_smpl_tstr` | B7:G14 | B7:G8 | identical (6) |
| `t_tst_rslt_hdr` | B7:H14 | B7:H8 | identical (7) |
| `t_tst_rslt_dtl` | B7:I1477 | B7:I342 | identical (8) |
| `t_rmks_dtl` | B7:G357 | B7:G8 | identical (6) |
| `Project Items` | A5:C99 | A5:C99 | identical (3) |
| `discipline` | A1:E2 | A1:E3 | identical (5) |

The refs are the difference, and they say what AMAW is: **eight sample rows
(7–14) where the MixPack has one**, 1,470 test-result rows against 335, 350
remark rows against one. A mix design is one sample; an acceptance workbook is
a lot's worth of sublots.

The MixPack has three tables AMAW does not — `t_superpave` (B7:AJ8),
`t_bit_conc_mixblnd` (B7:L14), `Chart Data` (J187:N199). AMAW has none the
MixPack lacks, so its staging shape is a strict subset.

**`Project Items` is the same sheet we just wired the pay-estimate lookup to**
— `prj_nbr | ln_itm_nbr | repr_qty`, ListObject at A5:C99, no formulas, so the
project-items work transfers whole. (One difference from the MixPack: no
column D unit here. The MixPack's D is display-only and "Not Stored on the SM
database" anyway.)

**`discipline` row 2 is the loader id**, and it is not the filename version:

| | discipline_id | version |
|---|---|---|
| AMAW 14.01 | `AMAW` | `v2.0` |
| MixPack 12.1 | `AMMIXPACK` | `v3.0` |

## What the evaluator would need

Staging cells are formulas here too, and more of them — 5,147 in
`t_tst_rslt_dtl` alone against the MixPack's 1,643. Cell-bounded census of the
staging sheets:

| Function | AMAW | MixPack |
|---|---|---|
| `IF` | 1114 | 287 |
| `CONCATENATE` | 364 | 1 |
| `CHAR` | **364** | — |
| `INDIRECT` | **28** | — |
| `LEFT` | 8 | 2 |
| `VLOOKUP` | **7** | — |
| `TEXT` / `NOW` / `RIGHT` | 7 each | 1 each |
| `ROUND` | 5 | 135 |
| `COUNT` | **1** | — |

Four additions, three of them trivial. `CHAR` and `COUNT` are one line each.
`VLOOKUP` already has an escape: the MixPack engine feeds such cells to the
evaluator as `evalOnly` and lets Excel recompute them, and all seven AMAW uses
are the *same* lookup (`Calculations!$D$147` into `$A$147:$B$161`).

**`INDIRECT` is the one real piece of work**, and it is contained — 28 cells in
exactly two shapes, both selecting a column or row from one control cell:

```
t_smpl_tst!G13    INDIRECT("G"&'Super Verify'!B5+8)
t_tst_rslt_dtl!G1067  INDIRECT("'Superpave'!"&CHAR(81+'Super Verify'!B5)&"9")
```

`'Super Verify'!B5` and `!B12` are "which sublot am I verifying". So this is
dynamic reference resolution driven by a sublot index, not arbitrary
string-built references — tractable, but it is a genuine addition to the
evaluator rather than a function-table entry.

## CORRECTION (2026-09-13): the field map, and where it really lives

An earlier version of this document said the `AMAMAW` sheet documents the
workbook's own input cells and that its 85 cell references "are the typed
inputs — all on the `Superpave` sheet". **Both halves of that are wrong**, and
checking it against two completed workbooks is what caught it. Do not use that
sheet's `Cell` column for anything.

`AMAMAW` is the **test-method code**, not an abbreviation of AMAW — it is the
value in `t_tst_rslt_dtl.tst_meth` on every row. Its sheet is a stale
description of the fields, and its `Cell` column disagrees with the live
workbook on every entry checked:

| Field | `AMAMAW` says | Real source | Value in Lot 1 |
|---|---|---|---|
| Aggr. Pro. Codes | `C10` (empty) | `Superpave!N3` | `AGP027501` |
| Type & Size | `E10` (empty) | `Superpave!O3` | `Dolomite #8's` |
| % | `G10` → "BSG" | `Superpave!R3` | `35` |
| B.O.D. Sp. Gravity | `H10` → "Unit" | `Superpave!Q3` | `2.640` |
| Gsb | `H8` (empty) | `Superpave!R9` | `2.6528` |
| % Binder in Mix | `D25` → `2794.5` | `Superpave!B14` | `5.98` |
| Air Voids | `D28` → "Weight (g)" | `Superpave!J14` | `4.57` |
| County | `E5` (empty) | `'Pay Values'!I3` | `Madison` |

**The real map is `t_tst_rslt_dtl` itself**, which carries its own
documentation in the columns beside the ListObject:

- **column A** — `<block> - <field label>`, e.g. `VI01 - Gsb =`
- **column E** (`tst_fld_sn`) — the field sequence number, 1…209/210 per block
- **columns F / G** (`tst_strg_fld_val` / `tst_numrc_fld_val`) — whichever
  applies holds a **formula naming the source cell**, e.g. `=Superpave!R9`

That is the same way the MixPack's map was derived, and it cannot go stale
because it is the thing the loader actually reads. Extracted whole to
`docs/amaw-field-map.json` — 1,469 rows, 1,095 of them carrying a source
formula.

(The `f93`-style numbers on the `AMAMAW` sheet were flagged as *possibly*
`tst_fld_sn`. They are not: "Acceptance Method" is `f93` there and
`tst_fld_sn` 42 in the staging table. Whatever they are, they are not this.)

## The seven test records, and the stride that generates them

`t_tst_rslt_dtl`'s 1,470 rows are **seven blocks of ~210 fields**, which is
what an AMAW lot is:

| Block | Rows | Fields | What |
|---|---|---|---|
| `VI01` | 8–216 | 209 | verification / initial |
| `QC01`–`QC04` | 218–1057 | 210 each | the four QC sublots |
| `QA01` | 1058–1267 | 210 | Department acceptance |
| `IQ01` | 1268–1477 | 210 | independent assurance |

A mapper does not need 1,469 addresses — it needs the lot-level fields once
and **two strides**, because the same `tst_fld_sn` resolves differently per
block:

- **Lot-level fields read the same cell in every block.** `Aggr. Pro. Codes`
  (sn 11) is `Superpave!N3` in all seven.
- **The four QC sublots step 6 rows down the `Superpave` sheet.**
  `% Binder in Mix` (sn 42) is `Superpave!B14 / B20 / B26 / B32`.
- **QA and IQ read a different sheet entirely** — `'Super Verify'!B10` and
  `B17`, 7 rows apart. That is why the QA/IQ blocks reference `Super Verify`
  where the QC blocks reference `Cores`.

So the `Superpave` sheet holds the aggregate structure once (rows 3–8, columns
N/O/Q/R) and then one volumetric block per sublot at rows 14/20/26/32, with
the sublot's own date, time, truck, tons and temperature in rows 3–6 of
columns I–M.

## The sheets PlantBook would have to become

24 input sheets beyond the staging block. Formula/input counts are from the
blank template:

| Sheet | Dim | Formulas | Typed |
|---|---|---|---|
| `Pay Values` | A1:IU68 | 105 | 74 |
| `Calculations` | A1:CP339 | 1701 | 1456 |
| `Superpave` | A1:V49 | 131 | 83 |
| `Cores` | A2:K52 | 142 | 32 |
| `Super Verify` | A1:T50 | 128 | 47 |
| `Gradation` | A1:N59 | 136 | 32 |
| `Accept. Grad. # 1–4` | A1:M50 | ~130 each | 36 each |
| `.45 Data` | A1:AI108 | 594 | 421 |
| `Performance Specimens` | A1:U60 | 122 | 86 |
| `KYCT Data Sublot # 1–4` | A1:AE1031 | ~2208 each | ~70 each |
| `Field Rutting` | A1:R42 | 91 | 36 |
| `PG Producer` / `Producer supplier` | — | 0/1 | reference lists |
| `Cert. Techs` | B1:C31 | 0 | SM User I.D. + name |
| `Control Charts` / `0.45 Chart` | — | — | chart sheets |
| `Comments` | A1:A53 | 0 | free text |
| `Workbook Edits` | A1:C19 | 0 | KYTC's own changelog |

Two things worth noticing there. **`.45 Data` carries "Gradation Control
Points"** — the same AASHTO M323 Table 4 values DesignBook already holds in
`CONFIG.GRADATION_CONTROL_POINTS`, so that constant is shared between the two
books rather than design-only. And **`PG Producer` / `Producer supplier` are
in-workbook reference lists** (ATS @ Lexington, BP Amoco @ Whiting and so on)
— the same data as the `binder_terminals` Supabase table, which is the right
source for PlantBook per the reference-data rule.

## A real lot, for anyone building against this

Two completed workbooks (Jake, 2026-09-13), both **contract 252112, Madison
County, plant AMP070302 Boonesboro**, mix `00385 CL3 ASPH SURF 0.38A PG64-22`,
4,000 tons each, approved by Tate Sallee. Lots 1 and 2 of the same mix.

Worth noting what `Pay Values!D9` is: `00385 CL3 ASPH SURF 0.38A PG64-22` —
the **approved mix design's MIX ID followed by its signature**. That is the
join between the two books. A PlantBook lot is a child of a DesignBook
approval, and the workbook already writes the link down.

**CORRECTION (2026-09-13): the blend percentages are PER-SUBLOT, not
lot-level.** Producer, type & size and BOD are lot-level (`Superpave` columns
N/O/Q, rows 3-8), but the percentage is one column per sublot - **R/S/T/U** -
and so is combined Gsb at row 9. Both real lots repeat the same five
percentages across all four columns, which is exactly why this reads as
lot-level until you check the addresses. A plant that adjusts its blend
mid-lot would break any code that assumed otherwise.

The blend below is lot 1's, the same in all four sublot columns:

| AGP | Type & size | % | BOD sp. gr. |
|---|---|---|---|
| AGP027501 | Dolomite #8's | 35.0 | 2.640 |
| AGP027501 | Dol. #10's Washed | 20.0 | 2.690 |
| AGP007401 | LS #10's (Washed) | 12.0 | 2.660 |
| AGP007401 | LS #10's (Unwashed) | 5.0 | 2.660 |
| AGP012102 | Natural Sand | 15.0 | 2.620 |

Combined Gsb 2.6528. Recycle: 0.481 AC from recycle, 5.499 virgin binder in
mix, 10% effective replacement (lot 2: 5.669 and 9%).

Sublot volumetrics, lot 1 / lot 2:

| | %AC | Gmm | Va | VMA | VFA |
|---|---|---|---|---|---|
| QC01 | 5.98 / 6.15 | 2.495 / 2.476 | 4.57 / 3.84 | 15.6 / 15.8 | 70.8 / 75.7 |
| QC02 | 6.32 / 6.21 | 2.462 / 2.474 | 3.25 / 3.54 | 15.9 / 15.6 | 79.5 / 77.4 |
| QC03 | 6.34 / 6.20 | 2.479 / 2.473 | 3.89 / 3.64 | 15.9 / 15.8 | 75.5 / 76.9 |
| QC04 | 6.32 / 6.21 | 2.483 / 2.470 | 3.48 / 4.15 | 15.4 / 16.3 | 77.3 / 74.6 |

**CORRECTION (2026-09-13): there are two core banks, and the earlier count
here was wrong.** This document previously said "six cores in lot 1, ten in
lot 2". That was one bank read in isolation. `Cores` carries **mat cores at
rows 10-13, stride 5** and **joint cores at rows 33-34, stride 3** - lot 1 has
**24 core ids across its four sublots, 18 of them carrying a density**
(sublot 1's six were labelled and never measured). The count is not fixed per
lot *or* per sublot: read every slot and drop the blanks. Sublot mix temperature was 325–330 °F throughout.

Two format traps in that data. **Times are Excel time fractions**, not HHMM as
the stale `AMAMAW` sheet's comment claims — `0.9125` is 21:54. And the
per-sublot **Tons figure is cumulative ticket tonnage**, not the sublot's own
tons: lot 2 runs 4,955 → 5,390 → 6,693 → 7,530 across its four sublots.

**One thing here bears directly on an open DesignBook question.** This is a
real, KYTC-accepted production blend whose second-largest component is
**`Dol. #10's Washed` at 20%** — the exact component the open dolomite-class
note in CLAUDE.md is about, from `AGP027501`, the producer the LAM lists as
Class A dolomite restricted to Bench B. It does not settle the class question
on its own (an AMAW records production, it does not re-adjudicate the design),
but it is evidence that blend is ordinary rather than exceptional, and it is a
real case to put to Andrew alongside #467PA.

## `Field Rutting` is not Hamburg

Worth knowing before anyone maps it. The loader's own field labels say things
like "Hamburg Pass 100 Left Max", but the sheet underneath them is **IDT-HT**
(A18:E24) and **IDEAL-RT** (I18:M24) - six specimens each, no wheel tracker.
KYTC reused the old Hamburg field slots when the test changed and the labels
never followed.

Two traps inside that. The verification and production sides read **different
columns for the same quantity** - VI01 takes the derived E/M columns, QC and IQ
the raw peak loads in D/L. And **sn 176 and sn 177 both point at `D19`** in the
production blocks, which shifts that series one place. Both are reproduced
verbatim rather than corrected, on the same rule as the TSR absorbed-water
oddity: it is what the workbooks on file were judged by.

## Also on that page, unmapped

`RAP Stockpile Management Workbook.xlsm` — noted, not looked at.

## Caveat that cost time here

**SheetJS misfiles AMAW sheets worse than MixPack ones.** The known chartsheet
bug (CLAUDE.md) applies, and AMAW has a `Dialog1` dialogsheet too, so the shift
is larger: `wb.Sheets["t_smpl"]` came back as a 15-row sheet with 22 formulas,
which is actually `t_cont_smpl`. Every count in this document was taken by
resolving `xl/workbook.xml` → `xl/_rels/workbook.xml.rels` → the worksheet part
and reading the XML directly. Do the same, and use cell-bounded regexes — a
greedy `<f>…</f>` match runs straight past `</c>` on these sheets and invents
hits.
