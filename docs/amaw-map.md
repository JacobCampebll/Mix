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

## The workbook's own field dictionary

**The `AMAMAW` sheet (A1:U124) documents its own input cells** — columns M–R
are `Cell | Type | Label | Length | English unit | Comment`. This is the thing
that took manual derivation for the MixPack (`docs/legacy-mixpack-map.md`),
handed over for free.

Rows 2–86 carry real cell references and are the typed inputs — all on the
`Superpave` sheet:

| Cells | What |
|---|---|
| `E5` | County |
| `H8` | Gsb |
| `C10:C15` | Aggr. Pro. Codes ×6 — note the comment: **"P/S Code is 15 on SM (not 7)"** |
| `E10:E15` | Type & Size ×6 |
| `G10:G15` | % ×6 |
| `H10:H15` | B.O.D. Sp. Gravity ×6 |
| `D19` `E19` `F19` `G19` | Date (MMDDYYYY), Time (HHMM 24-hr), Truck #, Tons |
| `D24:D34` | Acceptance Method, % Binder, Unit Weight, Max Sp. Gravity, Air Voids, % Eff. Binder, VMA, VFA, D/A Ratio, Hand Mixed % Binder, H.M. Max Sp. Gravity |
| `I25:I38` | Gradation % passing, 2" down to #200 (14 sieves — includes a 1/4" the MixPack has no field for) |
| `B39:B44` `C39:C44` `D39:D44` `E39:E44` | Core #, Sta/Offset, Core Density (PCF), % Sol. Den. — six cores |
| `H42` | Test Charges ($) |

Rows 87–124 have **no cell reference** — column L holds field names (`f93`…
`f129`) instead. These are the computed outputs: ESAL Class, Density Option,
JMF %AC, and the pay values (AC, AV, VMA, JD, LD, Gradation, Final Pay Value
Mainline, Lot Pay Adjustment), then PG binder lot/grade/producer, additive,
and the full JMF target gradation. The `f`-numbers look like they correspond to
`t_tst_rslt_dtl`'s `tst_fld_sn`, and the `VI01 -` prefix on the JMF comments
looks like a verification-record tag — **neither is confirmed**, and both are
worth pinning down before anyone maps against them.

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
