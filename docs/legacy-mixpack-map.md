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
