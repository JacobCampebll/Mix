# Legacy MixPack → DesignBook field map

Source of truth for `CONFIG.LEGACY` in `public/designbook.html`. Derived from
`kytc_mixpack_migrator.py` (which pins the version cell, Chart Data W14/AO2,
KYCT rows 21 and 29, the Reference Information block, the Recycle log cells and
the Performance Specimens rows to skip) plus a cell-by-cell audit of one real
**Ver 11.2** workbook and one real **Ver 12.1** workbook, read with the same
SheetJS 0.18.5 build the page ships. Every address below was observed, not
inferred.

## Three findings that shape the importer

1. **SheetJS misfiles every sheet after the two `0.45 Power Chart` chartsheets.**
   It drops the chartsheets but keeps their names in `SheetNames`, so each later
   worksheet is filed under the name two slots earlier: `wb.Sheets["TSR"]` is
   really KYCT Data, `["Hamburg Data"]` is really Chart Data, `["Chart Data"]`
   is the 15-cell `discipline` tab. **Sheets are resolved by content
   fingerprint** (`CONFIG.LEGACY.FINGERPRINTS`), never by name. Design Data,
   Recycle Data and Project Items sit before the chartsheets and are unaffected.
2. **12.1 made the Design Value summary column (`O56–O75`) into formulas, and a
   file that came through the migrator has no cached values there.** Same for
   aggregate MAT. CODE (`H23–H28`) and the row-49 averages. SheetJS reads them
   blank. A 12.1 file saved natively in Excel has them. The log reports this as
   `not-cached` with the remedy, distinct from "not entered".
3. **Design Data's input layout is identical in 11.x and 12.1** (rows 8–76).
   Only Recycle Data moved. The sample "11.3" file actually reads `Ver 11.2`,
   so the version key is `11.x`, not a literal 11.3.

## Version detection (any two agreeing wins; disagreement is logged)

| Signal | 11.x | 12.1 |
|---|---|---|
| `Design Data!U3` | `Ver 11.x` | `Ver 12.1` |
| `Performance Specimens!A47` | empty | `Performance Approval` |
| Recycle Data header row 11 | starts at `A11` | starts at `D11` |

## Scalar fields (same address in both versions unless shown)

| Field | Source → fallbacks | Note |
|---|---|---|
| county | Design Data!K10 | input cell; `T52` is 12.1-formula/blank, not used |
| submittal_type | Design Data!R10 | legacy wording ≠ form options → reported, left blank |
| total_tons | Design Data!Q12 | |
| depth_mm | Design Data!K20 | |
| binder_grade | Design Data!C18 | formula, cached in both |
| rap_note | 11.x: A19 → Recycle!C27 · 12.1: Recycle!F18 | KYTC advisory text, best-effort |
| ac_pct | Design Data!B49 → O63 → U56 | B49 = hand-entered optimum, plain value |
| gmm_ini (%Gmm@Nini) | O59 → P49 | |
| av_pct | O61 → J49 | |
| vma_pct | O57 → M49 | |
| vfa_pct | O56 → N49 | |
| uw | O62 → H49 | |
| msg | O65 → I49 → R28 | |
| esal | Design Data!H20 | class 1–5 → `<0.3M`, `0.3 – 3M`, `3 – 10M`, `10 – 30M`, `>30M` |
| designer | Design Data!K16 (SUBMITTED BY) | an SM ID, not a name |
| tsr_pct | O72 → TSR!G57 | "without additive"; `O73`/`N57` is "with" |
| hamburg_with | **no legacy source** | `Hamburg!H13` is the binder, not Job/Lab mix |
| hamburg_sip | Hamburg Data!J28 (left; M28 right) | `J27` is pass # at max rut, not SIP |
| rap_pct | 11.x: Recycle!K12 · 12.1: Recycle!N12 → aggregate RAP row `M` | |
| ras_pct | recycle rows whose type ∋ RAS | 11.x type `I`/pct `K`; 12.1 type `L`/pct `N` |
| virgin_ac | 11.x: Recycle!J24 · 12.1: **none** | 12.1 dropped the calculator block |
| additive | O74 + O75 | `"% — type"` |

## Repeating rows

- **Aggregate blend** — Design Data rows 23–28, stop at first blank `C`.
  producer `C`, type_size `J`, mat_code `H` (formula), pct_blend `M`, gsb `L`.
  Row 28 is normally the RAP component.
- **Gradation** — JMF column `T`: 3/4" T18, 1/2" T19, 3/8" T20, #4 T22, #8 T23,
  #50 T26, #200 T28. Labels in `S`.
- **CT specimens** — KYCT Data, 8 specimens; label in `A,C,E,G,I,K,M,O`, value
  one column right. specimen row 22, l75 14, m75 18, Gf 20, CTIndex 21. A
  specimen whose four values are all blank/zero is skipped.

## Context checks (never written to the form)

plant: `Chart Data!AO2` → `Design Data!Q14` vs the Portal's `?plant=`.
mix type: `Chart Data!W14` → `Design Data!O8` vs the chosen mix signature.
A mismatch is shown as an error in the summary line.

## Unmapped legacy values

Read and listed in the import log and in the save payload
(`legacy_import.unmapped`), never dropped. See `CONFIG.LEGACY.UNMAPPED` and
`UNMAPPED_BY_VERSION` for the full list (contract/job identifiers, binder and
mix codes, consensus properties `O52–O55`, `O58/O60/O64/O66–O71/O73`, the
Reference Information block, the seven extra sieves, WeighUp and Revised
columns, Hamburg binder/deformation/pass numbers, KYCT row 29, and the
version-specific Recycle table cells).

## Verified against the two sample files

| | Ver 11.2 sample | Ver 12.1 (migrated) sample |
|---|---|---|
| Version detection | unanimous 11.x | unanimous 12.1 |
| Sheets resolved | 7/7 by fingerprint | 7/7 by fingerprint |
| Fields found | 26 | 13 (rest `not-cached`, correctly) |
| Aggregate rows | 6 (mat codes present) | 6 (mat codes `not-cached`) |
| CT specimens | 6 (CTIndex row) | 0 (none entered) |
| Job context | plant + mix **match** | plant + mix **MISMATCH** (it is a different mix) |

---

# Addendum — `#489PA.xlsm` (Ver 12.1, MIXPACK2026), read 2026-09-03

A third real workbook (`docs/#489PA.xlsm`). `Design Data!U3 = "Ver 12.1"`,
Recycle header at `D11` → version key `12.1`. Design Data summary column
(`O56–O75`) and the TSR result cells are **formulas with no cached value**
here (the migrator gotcha above), but Gradation column T, the aggregate rows,
Recycle Data, **Performance Specimens**, **KYCT Data** and **Hamburg Data**
are all cached and real. This addendum maps the sections added in the
2026‑09‑03 DesignBook layout pass; the older map above still describes what
`CONFIG.LEGACY` currently targets.

## Contract Information section (all from `Design Data`, both versions)

| Field | Cell | Note |
|---|---|---|
| county | `K10` | `CUMBERLAND` |
| total_tons (Tonnage) | `Q12` | input, cached; "must equal sum on Project Items tab" |
| submittal_type | `R10` | e.g. `Ref. Mix Design (project change only)` — legacy wording ≠ form options |
| binder_grade | `C18` | `PG64-22`; formula, cached both versions |
| binder_supplier | `A17` | BINDER SOURCE & LOC., e.g. `ATS Asphalt Terminal @ Lexington` (label in `A16`) |
| funding | `C12` | FED/STATE #, e.g. `STP BRZ 9030(520)` |
| project_items | Project Items tab | rows from `A6/B6/C6/D6` = prj_nbr / line item / repr. qty / unit; contractor adds rows |
| project_number | `C14` | PROJ. (ITEM), e.g. `BR02900902600 (0025)` |
| depth_mm | `K20` | `0` in this file |
| rap_note | `Recycle!F18` (12.1) · `A19`→`Recycle!C27` (11.x) | e.g. `Use PG 64-22 virgin binder` |
| esal | `H20` | class 1–5 |
| designer | `K16` | SUBMITTED BY — an SM ID (`bdevore`), not a name |

Also handy on `Design Data`: CONTRACT ID `C8`, letting date `H8`,
CNTR. PROD. # `Q14` (the plant AMP number, e.g. `AMP080402`),
BIND. PROD. # `H18` (LAP number → `binder_terminals`), MIX MAT. CODE `Q16`,
BINDER CODE `C20`, MIX ID NUM `H10`.

## Gradation — full 14-sieve vertical table

`Design Data` column **T** (JMF %), sieve label in column **S**, both versions:

| Sieve | Cell | | Sieve | Cell |
|---|---|---|---|---|
| 2"     | T15 | | #4   | T22 |
| 1‑1/2" | T16 | | #8   | T23 |
| 1"     | T17 | | #16  | T24 |
| 3/4"   | T18 | | #30  | T25 |
| 1/2"   | T19 | | #50  | T26 |
| 3/8"   | T20 | | #100 | T27 |
| 1/4"   | T21 | | #200 | T28 |

An unused sieve reads `N / A` (e.g. `1/4"` on a 3/8"-nominal mix) — keep the
row, show N/A. Column `U` is "WeighUp" (batch weights), not JMF.

## Tensile Strength Ratio (TSR) box — sheet `TSR`

Header block rows 9–15 mirrors the others (MIX ID `B9`, COUNTY `H9`, TYPE OF
MIX `L9`, PROJ.# `B11`, LAB `H11`, CONTR & LOC `L11`, BIND GRADE `B13`,
**TSRs made with** `H13`, TEST METHOD `L13`, BIND SOURCE `B15`, MIX/COMP TEMP
`H15`). `% AC` label `G17`, `% ADDITIVE` `H17`, `TYPE OF ADDITIVE` `G19`.

| Form field | Cell | Formula / meaning |
|---|---|---|
| tsr_pct (without additive) | `G57` | `=H54/H55*100` |
| tsr_pct_additive (with additive) | `N57` | `=O54/O55*100` |
| tsr_wet_strength (psi) | `H54` (no-additive avg of `B54:G54`) · `O54` (with-additive) | |
| tsr_dry_strength (psi) | `H55` (avg `B55:G55`) · `O55` | |
| tsr_additive type / % | `G19` (type) + `H17`/`H19` (%) | text |

Per-specimen columns: no-additive set `B:G` (avg `H`), with-additive set
`I:N` (avg `O`); rows 30–41 conditioned-vs-dry, rows 48–55 the conditioned
break. In `#489PA` all of this is blank (TSR not run/entered for this mix).

## Performance Testing box — sheets `Performance Specimens`, `KYCT Data`, `Hamburg Data`

**Performance Specimens** — header rows 9–15 (same shape); **MADE WITH**
(binder) `H13`. Specimen table rows 32–41, Sample ID row `32` across
`B..G` (+ avg `H`) and `I..N` (+ avg `O`); first six are 95 mm (Hamburg
height), next four 62 mm (CT height):

| Row | | Row | |
|---|---|---|---|
| Diameter (mm) | 33 | Volume (cm³) | 38 |
| Thickness (mm) | 34 | Bulk Spec. Gravity | 39 |
| Dry Weight (g) | 35 | Max. Sp. Gravity | 40 |
| SSD Weight (g) | 36 | % Air Voids | 41 (avg `H41`/`O41`) |
| Wt. in Water (g) | 37 | | |

Performance Approval block rows 47–50: `A47` label, `B48/B49` date,
`D48/D49` KYTC rep, **`F48`/`F49` CT Index AVG** (111 / 112 here),
`D50` "Performance Approved Until" (auto: +36 mo for PG64-22, +24 for
PG76-22).

**KYCT Data** (`V1.03`, "850 – IDEAL-CT") — label columns `A,C,E,G,I,K,M,O`,
value one column right, up to 8 specimens:

| Field | Row | `#489PA` values (6 specimens) |
|---|---|---|
| Series Name (specimen id) | 16 | `38dcolrapct01C.ITD` … |
| Sample N ID | 22 | |
| l75 | 14 | |
| m75 | 18 | |
| Gf | 20 | |
| **CTIndex** | 21 | 120.0, 110.2, 108.1, 108.9, 108.5, 116.1 |
| Air Voids | 24 | |

Per the ask, the DesignBook KYCT rows need only **specimen # (row 16 or 22)
and CT index (row 21)**.

**Hamburg Data** — header rows 9–15 (same); **MADE WITH** `H13`, TEST METHOD
`L13` (`AASHTO T324`). The results box:

| Field | Cell(s) | `#489PA` |
|---|---|---|
| Pass Count → deformation table | `G19:G24` counts, `J19:J24` left, `M19:M24` right | 100→0.668/0.727 … 25000 |
| Max Deformation (left / right) | `J26` / `M26` | 12.802 / 11.991 |
| Pass Number at max (left / right) | `J27` / `M27` | 13468 / 20082 |
| SIP (left / right) | `J28` / `M28` | 13963 / — |
| Stripping-limit criteria | `E18:E22` | plot count, depth, count, creep-slope starts |

---

# CONFIG.LEGACY re-alignment — 2026-09-03

`CONFIG.LEGACY` was re-pointed at the restructured `CONFIG.SECTIONS`
(branch `legacy-config-realign`). Verified end-to-end against
`docs/#489PA.xlsm` (Ver 12.1, natively saved): version 12.1 detected, all
seven sheets resolved by fingerprint despite SheetJS misfiling, and every
extraction path returned real values.

## What changed

- **`CELLS`** — dead keys removed (`ac_pct`, `gmm_ini`, `av_pct`, `vma_pct`,
  `vfa_pct`, `uw`, `msg`, `hamburg_sip`, `additive_*`, `rap_pct`,
  `virgin_ac`). New keys added: `funding` → `C12`, `project_number` → `C14`,
  `tsr_pct_additive` → `tsr!N57` / `O73`, `tsr_wet_strength` → `tsr!H54`,
  `tsr_dry_strength` → `tsr!H55`, `perf_binder` → `perfSpec!H13`,
  `hamburg_left_maxdef`/`hamburg_right_maxdef` → `J26`/`M26`,
  `hamburg_left_passmax`/`hamburg_right_passmax` → `J27`/`M27`,
  `hamburg_left_sip`/`hamburg_right_sip` → `J28`/`M28`.
- **`SIEVES`** — now keyed by the new sieve keys (`s50`…`s0_075`) →
  `Design Data!T15:T28` (14 sieves). Extraction no longer routes through
  `sieveKey()`.
- **`CT.rows`** — `{ specimen: 16, index: 21 }`. Series Name (row 16) is the
  specimen id, `.ITD` stripped; l75/m75/Gf dropped (no columns on the form).
- **New `TSR_ADDITIVE`** — `tsr!H19` + `tsr!H17` (type + %), Design Data
  `O75`/`O74` fallback; skipped when the workbook says "None Required".
- **New `DESIGN_VALUES`** — Design Data column O (`O56`–`O69`). A completed
  MixPack carries no 4-point gyratory data, so on a legacy upload the
  computed Design Values section shows a read-only **"From the uploaded
  MixPack"** panel from these cells instead. Fully cached in `#489PA`
  (AC 6.2, VMA 15.6, VFA 76, Gmm 2.456, Gse 2.703, Gsb 2.63, %Gmm@Nini 85.2,
  UW 147.4, etc.).
- **New `PERF_SPECIMENS`** — `Performance Specimens` rows 35/36/37/41, one
  column per specimen (`B..N`). `#489PA`: 10 specimens.
- **New `HAMBURG_CURVE`** — the fixed 6-row pass-count table:
  `Hamburg!J19:M24` (pass counts 100/5000/10000/15000/20000/25000).
- **`FOURPOINT: null`** — placeholder. The 4 gyratory trial points that
  would seed the Four Points section are **not** in `#489PA` (not on Graphs,
  not in `t_tst_rslt_dtl` — that tab's "4-PT. GYRATORY MIX" block is a
  single design result). Some MixPacks may carry the sweep on the Graphs
  tab; wire this when a sample with it turns up.
- **`UNMAPPED`** — the seven extra sieves, Fed/State #, Proj. item, the
  Hamburg deformation/SIP cells and `% TSR with additive` moved out (now
  real fields). RAP %, RAS %, Virgin AC % moved into `UNMAPPED_BY_VERSION`
  (no field in the new form — flagged for a possible Recycle field group).

## Still open

- **11.x path** exercised only against a blank 2019 template (no completed
  Ver 11.x file to hand) — run one through when available. The 11.x/12.1
  `CELLS` differ only in `rap_note` source and the recycle table, both
  version-guarded, so the risk is low.
- `submittal_type` — KYTC's real wording ("Ref. Mix Design (project change
  only)") is not one of the three form options; reported as an off-list
  value, left blank. Widen the option list or add a mapping.
- RAP / RAS / Virgin AC have no home in the restructured form.

---

# `FOURPOINT` wired — 2026-09-04, against `CL3 0.38A 64-22 Haydon NEW.xlsm`

The `FOURPOINT: null` placeholder above was wrong to assume away — this is a
real, **approved**, natively-saved **Ver 11.3** MixPack (`Design Data!U3 =
"Ver 11.3"`), and it does carry the 4-point gyratory trial sweep. It isn't on
the Graphs tab or in a chart at all (both prior guesses); it's a plain input
table on `Design Data` itself, rows 30–43, that the Graphs-tab charts and
the `GRAPH DATA` block (`C84:F99`) both pull from.

## Where it actually lives

`Design Data!A30:P43` — one "Sample #" pair of rows per trial blend (rows
32–33, 35–36, 38–39, 41–42) plus an "Average" row per blend (34, 37, 40, 43).
Column headers, row 30/31:

| Col | Header | Meaning |
|---|---|---|
| B | `% AC` (`(Mix)`) | Pb for that trial |
| G | `BSG` (`@ Ndes`) | **this is Gmb** — KYTC's MixPack calls bulk specific gravity "BSG", not "Gmb". Pull it directly; do not derive from Unit Weight. |
| H | `Unit Wt. @ Ndes (pcf)` | `= G × 62.4` — a display-only derived column, dead end, not a separate measurement |
| I | `Max Spec. Gravity` | this is Gmm |

The four "Average" rows are the four design points:

| Trial | Pb | Gmb (BSG) | Gmm |
|---|---|---|---|
| 1 | `B34` | `G34` | `I34` |
| 2 | `B37` | `G37` | `I37` |
| 3 | `B40` | `G40` | `I40` |
| 4 | `B43` | `G43` | `I43` |

In this sample: Pb 5.5/6.0/6.5/7.0, Gmb 2.3657/2.3836/2.3939/2.4020, Gmm
2.4895/2.4710/2.4527/2.4348 — cross-checked against the sheet's own Va
column (`D86:D89` in the `GRAPH DATA` block): `(1 − Gmb/Gmm) × 100` on row 1
gives 4.97%, matching `D86 = 4.973710900626655` exactly.

## 12.1 verified — 2026-09-04, against `#492PA.xlsm`

A second real, approved workbook (`N:\MATERIAL\BITSHARE\Mxpack2026\#492\
#492PA.xlsm`, `Design Data!U3 = "Ver 12.1"`, mix `00388 CL3 ASPH SURF
0.38B PG64-22`, contract `262205`) confirms the FOURPOINT layout is
**identical** in 12.1 — same `BSG`/`Max Spec` headers at row 30/31, same
four "Average" rows (34/37/40/43):

| Trial | Pb | Gmb (BSG) | Gmm |
|---|---|---|---|
| 1 | `B34` = 5.3 | `G34` = 2.3900 | `I34` = 2.5227 |
| 2 | `B37` = 5.8 | `G37` = 2.4161 | `I37` = 2.5035 |
| 3 | `B40` = 6.3 | `G40` = 2.4300 | `I40` = 2.4846 |
| 4 | `B43` = 6.8 | `G43` = 2.4468 | `I43` = 2.4660 |

Cross-checked the same way as the 11.3 sample: `(1 − Gmb/Gmm) × 100` on
trial 1 gives 5.2579%, matching the sheet's own `%Voids @ Ndes` column
(`J34 = 5.257933766705055`) to 9 decimal places. Both versions now use
the same addresses in `CONFIG.LEGACY.FOURPOINT`, both confirmed against
real files — no longer provisional.

Bonus confirmation from the same file: this mix's nominal size reads
`"0.38B"` (letter `B`, not `A` as in the 11.3 sample) — real-world proof
the trailing letter is unrelated to NMAS, as expected from the gradation
control-points mapping logic (`controlPointsForNominalSize()`).

## Rendering bug found and fixed in the same pass

Separately from extraction: `fourpointHTML()` never read from
`state.extracted` at all — every other section (`gridHTML`, `rowsHTML`,
`sievesHTML`) seeds its initial value from extracted/saved state, but Four
Points always rendered `CONFIG.SECTIONS`' static default seed regardless of
what a legacy import or a previously **saved design** actually held. That
means before this fix, reopening *any* saved design with typed-in Four
Points data showed the default placeholder rows, not what was saved — the
data was safe in the `values.fourpoint` JSONB column the whole time, just
never displayed. Fixed via `resolveFourpointPoints()` /
`resolveFourpointConstants()` in `public/designbook.html`, which reconcile
two source shapes: a fresh import's `state.extracted.tables.fourpoint`
(array of `{pb,gmb,gmm}`, same shape as every other extracted table) and a
reopened design's `state.extracted.scalars.fourpoint` (the flat
`data-fp`-keyed object `collectForm()` has always saved into
`values.fourpoint`) — the save shape itself was left alone.
