# Rounding conventions: where they stand

Started 2026-09-24 (Andrew), for a follow-up with Tate. This is the
working record: what each book rounds, what it holds, what it calculates
on, and what is still open. The narrative of how we got here is in
CLAUDE.md; this file is the place to check a convention.

## The rule underneath all of it

**KYTC's workbooks round for display, not for arithmetic.** A cell
formatted `0.00` shows 2.70 and calculates on 2.696848. The page does the
same wherever the workbook does:

- a box **shows** the figure at its `CONFIG.DP` precision;
- a box **holds** the full value in `data-raw` (`heldValue()` in
  `designbook.html`), and everything that calculates or saves reads that;
- clicking into a held box shows the full value, the way Excel's formula
  bar does, and leaving it rounds the display again.

Rounding a figure before it is used again rounds it twice. That can move a
pay band: a Va of 3.849 is 3.85 at two places and then 3.9 at one, where
the workbook rounds it once, to 3.8.

## Evidence

| File | What it is | What it showed |
|---|---|---|
| `docs/#489PA.xlsm` | Approved MixPack, Type D | No typed input holds hidden digits; the JMF is whole |
| `N:\MATERIAL\BITSHARE\Mxpack2026\#486\#486PA.xlsm` | Approved MixPack, Type B | Polish gradations and the RAP Gsb hold full floats under rounded formats |
| `N:\EVERYONE\materialsProductionRepository\District 7\AMAW\07210RMC260017.xlsm` | Completed AMAW, Volumetrics | Sublot % passing shown to 0.0; JMF whole |
| `N:\EVERYONE\materialsProductionRepository\District 7\AMAW\07210SKH260261.xlsm` | Completed AMAW, Volumetrics | Same |
| `public/MIXPACK2026_VER12_01.xlsm`, `public/AMAW_VER14_01.xlsm` | Blank templates | Number formats and the formulas that read each cell |

## Gradations

| Where | Shows | Holds / calculates on | Source |
|---|---|---|---|
| JMF, both books (DesignBook gradation, a lot's JMF column) | #200 to 0.1, every other sieve whole | The same: a typed value is **rounded** when the box loses focus, and a saved one when it reopens | Andrew; KM 64-421 §1.2 defines a JMF as whole numbers. Every real file's JMF is whole |
| Polish-Resistant component gradations | #200 to 0.1, every other sieve whole | **Full value**, as imported or typed | MixPack `Polish-Resistant Data!B21:G33` (format `0`/`0.0`); #486PA's natural sand holds 97.39233962919593 on the #4, and rows 35-37 calculate on it |
| A lot's computed sublot % passing | **0.1 on every sieve** | Full quotient (`state.gradPassing`), never rounded | AMAW `Gradation!D` is formatted `0.0` over the unrounded quotient |
| Deviation from the JMF (sublot tabs) | 0.1 | The sign is decided on the rounded figure | Follows the sublot % passing |
| Lot Pay gradation breakdown | #200 to 0.1, every other sieve whole | What `'Accept. Grad.'` scores | AMAW `'Accept. Grad.'!C` is formatted `0` |

**Gradation pay** reproduces the sheet's two-step rounding. `Gradation!D`
stores the quotient rounded to a tenth when the quotient rounded to a whole
falls outside the control points, and `'Accept. Grad.'!C` then rounds that
to a whole. So 89.45 is 89.5 and then 90 on the sheet, where a single round
gives 89. See `sievePay()` in `scripts/amaw/pay.mjs`.

## Everything else

| Figure | Shows | Holds / calculates on | Source |
|---|---|---|---|
| Component Gsb (Aggregate Structure) | 0.01 | Full value on import (`CONFIG.HELD_IMPORT`) | #486PA's RAP row holds 2.696848; `Design Data!O23` reads it unrounded |
| Combined Gsb (Four Points) | 0.01 | Full blend | `Design Data!O23` (`0.00`) feeds every VMA unrounded. **This reverses** an earlier "KY practice rounds it to 0.01 first"; that put #486PA's first trial VMA at 16.88 against the workbook's 16.93 |
| A lot's sublot Gsb (`blend_gsb`) | 0.01 | Full blend | AMAW `Superpave!R9` (`0.00`), read unrounded by the sublot VMA |
| A lot's computed volumetrics (%AC, Gmb, Gmm, Va, VMA, VFA, Pbe, D/A, core bsg / density / % solid) | `CONFIG.DP` | Full value (`putCell()`) | The AMAW pays on the unrounded figures and rounds once, in the pay schedule |
| Any other tenth-precision box | 0.1; a whole number is padded ("5" -> "5.0") | As typed: more places are kept, never rounded away | Andrew |
| Figures the workbook itself rounds (bulk volume to 0.1, BSG and MSG to 0.001) | As rounded | As rounded, because the workbook's formula rounds (`volumetrics.mjs`) | `Superpave` F/G, row 41 |

## Not changed, on purpose

- **Rail warning sentences** quote figures in their own words.
- **Review, approval and lot PDFs** have their own formatting path
  (`hdNum()` at `CONFIG.DP`), which does not use the held-value mechanism.
- **Workbook cells** we generate are written as numbers. Excel's own
  format does the display, and text would break the formulas that read them.

## Open for Tate

1. **Combined Gsb.** The page now calculates on the unrounded blend, like
   the workbook. The code used to round it to 0.01 first, calling that "KY
   practice" so the calculator would match a reviewer working by hand. Which
   does KYTC want a design judged on?
2. **Sublot % passing on the lot.** Andrew's rule is whole numbers with the
   #200 to 0.1; the AMAW itself shows every sieve to 0.1. The page follows
   the AMAW for now. Confirm.
3. **Gradation pay rounding.** It matches the sheet's formulas, but no real
   gradation-accepted lot exists to check it against. Both District 7 lots
   and Jake's two are Volumetrics. A leveling-and-wedging AMAW would settle it.
4. **JMF.** A typed JMF value is rounded to the rule when the box loses
   focus. KM 64-421 supports it, and every file seen has a whole JMF. Is
   there any case where a JMF legitimately carries more places?

## Found on the way, not about rounding

- `check_payview.mjs` asserts figures from Jake's two lots ("+26.25 tons",
  "+$1,312.50"), so it fails on any other lot. It fails the same way on
  the untouched code. It needs lot-specific expectations or a general form.
- `check_mapper.mjs` reports 33 and 53 unexplained cells on the two
  District 7 lots (4 on Jake's), identical before and after this change.
  They are real differences between those lots and what the mapper
  reproduces, and they deserve their own look.
