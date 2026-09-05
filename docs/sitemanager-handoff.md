# The SiteManager hand-off

What a completed MixPack actually delivers to KYTC's systems, found by taking a
real approved Ver 12.1 workbook apart on 2026-09-05. This is the map DesignBook
needs in order to produce the same thing without Excel.

The workbook here was `467PA.xlsm`, a district 07 design. **Its data is not
reproduced below** - only structure: table names, column names, field sequence
numbers, and the Design Data cell each one reads. Real MixPacks stay out of the
repo (they carry technician SM IDs and contractor pricing); this file is the
durable half.

## The short version

**The artifact is the workbook.** KYTC's own procedure documents settle it, and
they are public:

> "The user initiates the Applet and directs the application as to the location
> of the spreadsheet, and the Applet then attempts to successfully load the
> spreadsheet. If any errors are encountered, the load is aborted and the
> specific errors returned to the user. Once successfully loaded into
> SiteManager, the Applet archives a copy of the spreadsheet for audit trail
> purposes."
> - *SUPERPAVE Mix Design Window - Superpave (MIXPACK) QCQA Spreadsheet*

**MEDL is the Materials *Excel* Data Loader** - not "Electronic", as we had been
saying. It is the intranet front end (`apps.intranet.kytc.ky.gov/medl`) for the
Spreadsheet Applet, an application KYTC ITI wrote. It takes an Excel file. There
is one of these per discipline, eight in all: MIXPACK (asphalt mix design), AMAW
(asphalt mixtures acceptance), CONCMIX, CONCPVMT, CONCSTRT, AGG, DENSITY,
STRIPING - which is to say DesignBook and PlantBook are two of KYTC's eight.

So: **no CSV, and no bare XML either.** What we hand over has to be a MixPack.

That said, the workbook is a thin shell over an XML payload, and knowing the
payload is what makes generating the workbook tractable. `xl/xmlMaps.xml` inside
the file carries a complete XSD - target namespace
`http://tempuri.org/XMLSchema.xsd`, root element `MaterialDisciplines` - and a
single map, `MaterialDisciplines_Map`. Nine `veryHidden` worksheets named after
SiteManager tables are bound to that map as XML-typed ListObjects
(`tableType="xml"`), one column per XSD element, with xpaths like:

    /ns1:MaterialDisciplines/ns1:t_tst_rslt_dtl/ns1:t_tst_rslt_dtlTable/ns1:tst_fld_sn

Every cell on those sheets is a formula pointing back at `Design Data` (and the
other visible tabs). So the visible workbook is data entry; the hidden sheets are
a staging area that restates the same values in SiteManager's own column names;
and the XML map is the contract between that staging area and the Applet.

**Nothing in the VBA generates the XML.** `ThisWorkbook.Workbook_BeforeSave` runs
a long list of "Contract ID Required", "Letting Date Required", "Enter
Appropriate County" style checks and cancels the save if one fails - the same
class of check the Applet runs on load - but there is no export routine. The
binding is declarative.

Two consequences worth stating plainly:

- **KYTC's blank templates are public downloads.** `MIXPACK2026_VER12_01.xlsm`
  (Ver 12.1), `MIXPACK2019_VER11_03.xlsm` (11.3) and the AMAW workbooks all sit
  on the SiteManager page. The blank 12.1 template has the identical nine
  staging sheets with their formulas intact. So the realistic build is to fill
  KYTC's own template rather than construct a workbook from nothing.
- **Which raises the one real engineering question**: those staging cells are
  formulas, and a browser-side xlsx writer cannot evaluate them. It is the same
  "not-cached" trap already recorded in CLAUDE.md for migrated 12.1 files - a
  formula cell with no cached value reads as blank. Either the Applet
  recalculates on load, or we must write both the `Design Data` cells *and* the
  staging cells ourselves. We know all 247 mappings, so the second path is open
  either way; it just doubles the work and has to be re-checked on every template
  revision. **Ask Andrew to try loading a workbook saved by something other than
  Excel before committing to a design.**

## The schema

`MaterialDisciplines` holds fourteen child elements, each a table with an
unbounded `<...Table>` row element. Every field is `xsd:string`,
`minOccurs="1"`, `nillable="false"` - i.e. **every element must be present on
every row**, so unused fields are written as `" "` (a single space) or `0`, not
omitted. The hidden sheets say so explicitly in their comment rows:
"IF Not Used, Initialize to ' ' (i.e., space)" / "IF Not Used Initialize to 0".

| Element | Cols | Rows in an AMMIXPACK | What it is |
| --- | --- | --- | --- |
| `discipline` | 5 | 1 | Which template this is, and the filename |
| `t_smpl` | 54 | 1 | The sample record |
| `t_cont_smpl` | 7 | 1 | Sample to contract |
| `t_cont_smpl_itm` | 3 | - | Not used by AMMIXPACK |
| `t_rmrks_dtl` | 6 | 1 | Free-text remark |
| `t_smpl_tst` | 10 | 1 | The test performed |
| `t_smpl_tstr` | 6 | 1 | Who tested |
| `t_tst_rslt_hdr` | 7 | 1 | Result header |
| `t_tst_rslt_dtl` | 8 | **247** | **The whole design, one row per field** |
| `t_pcc` | 23 | - | Concrete. Not used by AMMIXPACK |
| `t_pcc_blnd` | 15 | - | Concrete. Not used by AMMIXPACK |
| `t_mix_dsn_grdn` | 10 | - | Not used - gradation rides in `t_tst_rslt_dtl` |
| `t_superpave` | 35 | 1 | The mix design summary row |
| `t_bit_conc_mixblnd` | 11 | **7** | Binder + up to 6 aggregates |

Note the worksheet is named `t_rmks_dtl` but its own "SM Table" row and the XSD
both say **`t_rmrks_dtl`**. The sheet name is a typo; the XML element is not.

## `discipline` - one row

| Column | Value in the sample | Notes |
| --- | --- | --- |
| `discipline_id` | `AMMIXPACK` | The template |
| `discipline_version` | `v3.0` | |
| `replace_allowed_indicator` | `Y` | |
| `district` | `07` | Two digits |
| `Filename` | `07640AMD260467` | See below |

`Filename` is the same string as `t_smpl.smpl_id`, and it decomposes exactly the
way we guessed when we built the approval number:

    07      640      AMD      26      0467
    ^^      ^^^      ^^^      ^^      ^^^^
    district lab     sample   letting sequence
             (LU00642 minus   type    year    within the year
              the LU/leading)

and `t_superpave.mix_id` / `t_smpl.smpl_mix_id` is **`00260467`** - which is not
a `00` prefix at all. KYTC's own procedure spells the format out:

> "KYTC Central Office Mix Designs will use DDYYSSSS: DD is the District
> (**Central Office is 00**), YY is the Year, SSSS is the Mix ID."

So the leading `00` is the district, and it is `00` because Central Office
approves these - a district-approved design would carry that district's number.
That closes the open "verify the `00` prefix" question; no second workbook
needed. That is the number
printed on the sheet as `MIX ID NUM.`, and `#467PA` is how KYTC refers to it in
conversation - sequence `467`, `PA` because it was performance-reviewed. This
independently confirms the decomposition already built into
`netlify/functions/_canonical.mjs`.

## `t_tst_rslt_dtl` - the design itself

This is where the design lives. 247 rows, one per field, keyed by
`tst_fld_sn` (1-254 with gaps), and each row carries **either** a string
(`tst_strg_fld_val`) **or** a number (`tst_numrc_fld_val`) - the unused one is
`" "` or `0`.

`tst_fld_sn` 1-7 are template plumbing:

| sn | Field |
| --- | --- |
| 1 | Comment (not used) |
| 2 | Template Status - code table `TEMPSTAT`, `ISPC` on an approved design |
| 3 | GenericString2 (not used) |
| 4-7 | GenericNum1-4 (not used) |

`tst_fld_sn` **8 through 254 are exactly the `F8`-`F254` rows of the hidden
`AMMIXPACK` sheet**, which is the template's own field dictionary: SM field
number, the `Design Data` cell it reads, its type, its label, its length
(`3.1` = three digits, one decimal), and its unit. That table is reproduced in
full at the end of this file - it *is* the mapping DesignBook has to reproduce.

Rows whose Type is `Label` are the section headings; they carry no value
(`" "` / `0`) and exist so SiteManager can render the sheet back. They still
have to be present.

Two things worth knowing before trusting the format too hard: the real approved
file has `#VALUE!` sitting in `tst_numrc_fld_val` for sn 82, 115 and 116
(WeighUp - 1/4", % TSR with additive, % Additive - all cases where the source
cell is legitimately empty), and one row (sn 92, Notes) holds an unevaluated
formula string. **It uploaded and was approved anyway**, so MEDL is evidently
not strict about those. Do not copy the behaviour; do not assume a clean payload
will be rejected for being cleaner.

## `t_superpave` - one row, the summary

The design's headline numbers, in SiteManager's names. Sample values omitted;
the shape is what matters.

| Column | Long description | Source |
| --- | --- | --- |
| `mix_id` | Mix ID | `00` + letting year + 4-digit sequence |
| `dsn_t` | Design Type | `SUP` |
| `matl_cd` | Material Code | the mix's own MAT code (not an aggregate's) |
| `prodr_supp_cd` | Producer Supplier Code | `Design Data!Q14` - the AMP |
| `dsnr_nm` | Designer Name | designer's SM ID |
| `asph_cem_t` | AC Type | binder grade digits, e.g. PG 64-22 -> `6422` |
| `mix_dsn_txt_t` | Mix Type | e.g. `M335` |
| `effdt` / `apprd_dt` | Effective / Approved Date | Excel date serials |
| `term_dt` | Termination Date | `0` |
| `apprd_by_uid` | Approved By User ID | **must hold an active "SUPERPAVE MIX DESIGN TECHNOLOGIST" sampler qualification for material category "ASPHALT-MIX DESIGN"** |
| `init_n_dnsty_m` / `max_n_dnsty_m` / `dsn_n_dnsty_m` | N-initial / N-max / N-design | Ndes is constrained: only 50, 75, 100, 125 or blank |
| `init_n_gmm_p` / `max_n_gmm_p` | % Gmm @ Nini / Nmax | |
| `esals_nbr` | ESAL class | numeric; "N/A"/blank translate to 0 |
| `opt_ac_pct_tot_wt` | Optimum AC % | |
| `dust_proprtn_p`, `vma_p`, `vfa_p`, `air_voids_p` | D/A, VMA, VFA, air voids | |
| `lotmn_tsr_m` | Lottman TSR | whole number |
| `sand_equiv_tst` | Sand Equivalent | rounded to whole |
| `max_spc_gr` | Gmm | |
| `bulk_spc_gr_m` | **Unit weight in lb/ft3**, not Gmb | see below |
| `mix_temp` / `cmpct_temp` | free text, e.g. `300/265 (deg. F)`, with `_unt` = `DEGF` |
| `high_air_temp`, `high_air_temp_unt` | not used - space |
| `rmrks_id` | not used here - space |
| `last_modfd_uid` / `last_modfd_dt` | approver's SM ID / current system date |

`bulk_spc_gr_m` is worth flagging: on `t_superpave` it carries the **unit weight
in pcf** (a ~147 value), not the bulk specific gravity. On
`t_bit_conc_mixblnd` the identically-named column really is a specific gravity
(~2.66). Same column name, two meanings, one workbook.

KYTC's own procedure carries the same contradiction and confirms it is
deliberate: it describes the field as "Bulk specific gravity of the SUPERPAVE mix
design @ optimum AC %. (Unit Weight (lb/ft3) divided by 62.4.)" and then gives
its source as `<Design Data.Design Property.Unit Weight (lb/ft3)>` - the pcf
value, undivided. Load the unit weight.

Two more fields the procedure settles: **`air_voids_p` is not used** ("Applet
will not use this field for this discipline"), which is why the sample workbook
has a space in it despite air voids being a headline number. And
`t_mix_dsn_grdn` is marked **"NOT USED BY THE APPLET"**, with the reason - each
material code can have a different set of sieves with different Sieve Size Serial
Numbers, so the mapping was impossible. That is why gradation rides in
`t_tst_rslt_dtl` instead.

## `t_bit_conc_mixblnd` - seven rows

Row 1 is the binder, rows 2-7 the aggregates (all six slots emitted whether or
not they are used).

| Column | Binder row | Aggregate row |
| --- | --- | --- |
| `mix_id`, `dsn_t` | as `t_superpave` | as `t_superpave` |
| `matl_cd` | binder material code | the aggregate's MAT code |
| `prodr_supp_cd` | `LAP` + terminal number | `AGP` + producer number (or an `AMP` for RAP) |
| `brnd_nm` | space | space |
| `blnd_p` | design AC % | the aggregate's blend % |
| `bulk_spc_gr_m` | binder specific gravity | the aggregate's Gsb |
| `aprnt_spc_gr_m` | `N/A` | `Design Data!M113:M118` |
| `smpl_id` | `Design Data!N127` | `Design Data!N113:N118` |
| `last_modfd_uid` / `last_modfd_dt` | approver's SM ID / date | same |

The producer/supplier codes are the `AGP`/`LAP` numbers already keying Andrew's
`aggregates` and `binder_terminals` tables, written as the prefix, the four-digit
producer number, and a two-digit source suffix (`AGP` + `0000` + `00`). RAP comes
in as the plant's own `AMP` number.

## `t_smpl`, `t_cont_smpl`, `t_rmrks_dtl`, `t_smpl_tst`, `t_smpl_tstr`, `t_tst_rslt_hdr`

One row each, and mostly constant or derivable:

- `t_smpl`: `smpl_id` = the `Filename` above, `acpt_meth_t` = `MDA`,
  `smpl_t` = `MDA`, `smpl_dsn_t` = `SUP`, `stat_t` = `COMP`, `geog_area_t` =
  district, `matl_cd` = the mix MAT code, `prodr_supp_cd` = `Design Data!Q14`,
  `unt_t` = `TON`, `repr_qty` = total tons, `smpld_by` = designer's SM ID,
  `cms_uid` / `auth_by_cms_uid` / `last_modfd_uid` = approver's SM ID,
  `smpl_dt` / `auth_dt` = approval date serial, `log_dt` = submission date
  serial, `rmrks_id` = see below. Everything else is `" "`.
- `t_rmrks_dtl`: `rmrks_id` is built as **approver SM ID + `YYYYMMDDHHMMSS` +
  4-digit sequence** (`adenmark` + timestamp + `0467`), `rmrks_t` = `GEN`,
  `rmrks_sn` = `1`, and `rmrks_txt_fld` is the free-text aggregate note. The
  same `rmrks_id` is referenced from `t_smpl.rmrks_id`.
- `t_cont_smpl`: `smpl_id`, `cont_id` = the KYTC contract ID; `prj_nbr`,
  `ln_itm_nbr`, `repr_qty` were all literal `N/A` on the sample.
- `t_smpl_tst`: `tst_meth` = `AMMIXPACK`, `smpl_tst_nbr` = `1`, `lab_id` =
  `LU00642` (the district lab), `chrg_amt` = the total unit test cost from
  `Design Data!M32`, `strt_dt` = submission date, `actl_cmpl_dt` = approval
  date, `est_cmpl_dt` = `0`.
- `t_smpl_tstr`: `tst_id` = the designer's SM ID.
- `t_tst_rslt_hdr`: `smpl_id` / `tst_meth` / `smpl_tst_nbr`, `rmrks_id` = space,
  `effdt` = `0`.

## What this means for DesignBook

Everything above is computable from what DesignBook already holds, plus five
things it does not yet:

1. **The lab ID** (`LU00642`) - per district, needs a small table or CONFIG map.
2. **`matl_cd` for the mix itself** and `mix_dsn_txt_t` (`M335`) - a per-mix-type
   lookup, the same shape as the aggregate MAT codes.
3. **`asph_cem_t`** - the binder grade's digits. `binder_grades` already carries
   a `sitemanager_code`; check whether it is this or something else.
4. **The chargeable test cost** and the district-lab charge basis.
5. **A SiteManager user ID for the approver that carries the right sampler
   qualification** - which KYTC controls, not us.

There is no longer an open question about *which* artifact: it is the workbook.
What is still open is how we produce one whose staging sheets carry values rather
than uncomputed formulas - see the short version above.

Two of the five gaps above may already be closed by KYTC's published procedure
documents, which give a source for every `t_superpave` and `t_smpl` field as a
*label* reference (`<Design Data.MIX MAT. CODE>`, `<Design Data.BINDER GRADE>`)
rather than a cell address. Read those before hand-deriving anything:

- [SUPERPAVE (MIXPACK) Mix Design Hand Out for Applet](https://transportation.ky.gov/Materials/Documents/SUPERPAVE%20_MIXPACK_%20Mix%20Design%20Hand%20OUt%20for%20Applet%20FINAL.pdf) - 16 pages, `t_superpave` and `t_bit_conc_mixblnd` field by field
- [SUPERPAVE (MIXPACK) QCQA Sample Information Field Hand Out for Applet](https://transportation.ky.gov/Materials/Documents/SUPERPAVE%20_MIXPACK_%20QCQA%20Sample%20Information%20Field%20Hand%20OUT%20for%20Applet%20FINAL.pdf) - 28 pages, `t_smpl` and the rest
- [KYTC SiteManager page](https://transportation.ky.gov/Materials/Pages/SiteManager.aspx) - the blank templates, MEDL, and the equivalent documents for the other seven disciplines

## Appendix: the AMMIXPACK field dictionary

`tst_fld_sn` 8-254, verbatim from the hidden `AMMIXPACK` sheet. "Cell" is the
`Design Data` cell each field reads. Length `3.1` means three digits and one
decimal.

| SM Field | Cell | Type | Label | Length | English unit |
| --- | --- | --- | --- | --- | --- |
| F8 | B2 | Label | PROJECT INFORMATION | N/A | N/A |
| F9 | B8 | Alphanumeric | RAP Note | 50 | N/A |
| F10 | D3 | Alphanumeric | SUBMITTAL TYPE: | 40 | N/A |
| F11 | D4 | Alphanumeric | COUNTY: | 50 | N/A |
| F12 | D5 | Numeric | TOTAL TONS: | 6.0 | Tons |
| F13 | D6 | Numeric | DEPTH (mm): | 3.0 | mm |
| F14 | D7 | Alphanumeric | BINDER GRADE | 10 | N/A |
| F15 | B10 | Label | 4-PT. GYRATORY MIX DESIGN INFORMATION | N/A | N/A |
| F16 | C11 | Numeric | AC | 1.1 | % |
| F17 | C12 | Numeric | Gmmini | 2.1 | % |
| F18 | C13 | Numeric | AV | 2.1 | % |
| F19 | C14 | Numeric | VMA | 2.1 | % |
| F20 | C15 | Numeric | VFA | 2.1 | % |
| F21 | C16 | Numeric | UW | 3.1 | lbs/ft3 |
| F22 | C17 | Numeric | MSG | 1.3 | (no units) |
| F23 | C18 | Numeric | Eff. AC | 1.1 | % |
| F24 | C19 | Numeric | Film Th | 2.1 | (µm) |
| F25 | C20 | Numeric | D/A | 1.1 | (no units) |
| F26 | D11 | Numeric | Point 2 - AC | 1.1 | % |
| F27 | D12 | Numeric | Point 2 - Gmmini | 2.1 | % |
| F28 | D13 | Numeric | Point 2 - AV | 2.1 | % |
| F29 | D14 | Numeric | Point 2 - VMA | 2.1 | % |
| F30 | D15 | Numeric | Point 2 - VFA | 2.1 | % |
| F31 | D16 | Numeric | Point 2 - UW | 3.1 | lbs/ft3 |
| F32 | D17 | Numeric | Point 2 - MSG | 1.3 | (no units) |
| F33 | D18 | Numeric | Point 2 - Eff. AC | 1.1 | % |
| F34 | D19 | Numeric | Point 2 - Film Th | 2.1 | (µm) |
| F35 | D20 | Numeric | Point 2 - D/A | 1.1 | (no units) |
| F36 | E11 | Numeric | Point 3 - AC | 1.1 | % |
| F37 | E12 | Numeric | Point 3 - Gmmini | 2.1 | % |
| F38 | E13 | Numeric | Point 3 - AV | 2.1 | % |
| F39 | E14 | Numeric | Point 3 - VMA | 2.1 | % |
| F40 | E15 | Numeric | Point 3 - VFA | 2.1 | % |
| F41 | E16 | Numeric | Point 3 - UW | 3.1 | lbs/ft3 |
| F42 | E17 | Numeric | Point 3 - MSG | 1.3 | (no units) |
| F43 | E18 | Numeric | Point 3 - Eff. AC | 1.1 | % |
| F44 | E19 | Numeric | Point 3 - Film Th | 2.1 | (µm) |
| F45 | E20 | Numeric | Point 3 - D/A | 1.1 | (no units) |
| F46 | F11 | Numeric | Point 4 - AC | 1.1 | % |
| F47 | F12 | Numeric | Point 4 - Gmmini | 2.1 | % |
| F48 | F13 | Numeric | Point 4 - AV | 2.1 | % |
| F49 | F14 | Numeric | Point 4 - VMA | 2.1 | % |
| F50 | F15 | Numeric | Point 4 - VFA | 2.1 | % |
| F51 | F16 | Numeric | Point 4 - UW | 3.1 | lbs/ft3 |
| F52 | F17 | Numeric | Point 4 - MSG | 1.3 | (no units) |
| F53 | F18 | Numeric | Point 4 - Eff. AC | 1.1 | % |
| F54 | F19 | Numeric | Point 4 - Film Th | 2.1 | (µm) |
| F55 | F20 | Numeric | Point 4 - D/A | 1.1 | (no units) |
| F56 | H2 | Label | Template Name:  AMMIXPACK | N/A | N/A |
| F57 | H3 | Label | Descrip.:  MIX DESIGN SPREADSHEET | N/A | N/A |
| F58 | H5 | Label | GRADATION INFORMATION | N/A | N/A |
| F59 | H6 | Label | Sieve | N/A | N/A |
| F60 | I6 | Label | JMF | N/A | N/A |
| F61 | I7 | Numeric | 2 | 3.0 | % |
| F62 | I8 | Numeric | 1 1/2 | 3.0 | % |
| F63 | I9 | Numeric | 1 | 3.0 | % |
| F64 | I10 | Numeric | 3/4 | 3.0 | % |
| F65 | I11 | Numeric | 1/2 | 3.0 | % |
| F66 | I12 | Numeric | 3/8 | 3.0 | % |
| F67 | I13 | Numeric | 1/4 | 3.0 | % |
| F68 | I14 | Numeric | #4 | 3.0 | % |
| F69 | I15 | Numeric | #8 | 3.0 | % |
| F70 | I16 | Numeric | #16 | 3.0 | % |
| F71 | I17 | Numeric | #30 | 3.0 | % |
| F72 | I18 | Numeric | #50 | 3.0 | % |
| F73 | I19 | Numeric | #100 | 3.0 | % |
| F74 | I20 | Numeric | #200 | 2.1 | % |
| F75 | J6 | Label | WeighUp | N/A | N/A |
| F76 | J7 | Numeric | WeighUp - 2 | 3.0 | % |
| F77 | J8 | Numeric | WeighUp - 1 1/2 | 3.0 | % |
| F78 | J9 | Numeric | WeighUp - 1 | 3.0 | % |
| F79 | J10 | Numeric | WeighUp - 3/4 | 3.0 | % |
| F80 | J11 | Numeric | WeighUp - 1/2 | 3.0 | % |
| F81 | J12 | Numeric | WeighUp - 3/8 | 3.0 | % |
| F82 | J13 | Numeric | WeighUp - 1/4 | 3.0 | % |
| F83 | J14 | Numeric | WeighUp - #4 | 3.0 | % |
| F84 | J15 | Numeric | WeighUp - #8 | 3.0 | % |
| F85 | J16 | Numeric | WeighUp - #16 | 3.0 | % |
| F86 | J17 | Numeric | WeighUp - #30 | 3.0 | % |
| F87 | J18 | Numeric | WeighUp - #50 | 3.0 | % |
| F88 | J19 | Numeric | WeighUp - #100 | 3.0 | % |
| F89 | J20 | Numeric | WeighUp - #200 | 2.1 | % |
| F90 | M2 | Label | MIXTURE DESIGN APPROVAL INFORMATION | N/A | N/A |
| F91 | M3 | Label | Design Property | N/A | N/A |
| F92 | N28 | Alphanumeric | Notes | 256 | N/A |
| F93 | P3 | Label | Design Value | N/A | N/A |
| F94 | P4 | Alphanumeric | Coarse Aggregate Angularity (%) | 10 | % / % |
| F95 | P5 | Numeric | Fine Aggregate Angularity (%) | 2.0 | % |
| F96 | P6 | Numeric | Flat & Elongated Particles (%) | 2.0 | % |
| F97 | P7 | Numeric | Clay Content (SE) (%) | 2.0 | % |
| F98 | P8 | Numeric | % VFA | 2.1 | % |
| F99 | P9 | Numeric | % VMA | 2.1 | % |
| F100 | P10 | Numeric | D/A Ratio | 1.1 | (no units) |
| F101 | P11 | Numeric | % Gmm @ Ninitial | 2.1 | % |
| F102 | P12 | Numeric | % Gmm @ Nmax | 2.1 | % |
| F103 | P13 | Numeric | % Air Voids | 2.1 | % |
| F104 | P14 | Numeric | Unit Weight (lb/ft3) | 3.1 | lbs/ft3 |
| F105 | P15 | Numeric | % AC | 2.1 | % |
| F106 | P16 | Numeric | % Effective AC | 2.1 | % |
| F107 | P17 | Numeric | Maximum Specific Gravity | 1.3 | (no units) |
| F108 | P18 | Numeric | % Absorbed AC (Mix) | 1.2 | % |
| F109 | P19 | Numeric | Gsb | 1.2 | (no units) |
| F110 | P20 | Numeric | Gse | 1.3 | (no units) |
| F111 | P21 | Numeric | Film Thickness (µm) | 2.1 | (µm) |
| F112 | P22 | Numeric | Specimen Weight (g) | 4.0 | grams |
| F113 | P23 | Numeric | TSR Weight (g) | 4.0 | grams |
| F114 | P24 | Numeric | % TSR without additive | 2.0 | % |
| F115 | P25 | Numeric | % TSR with additive | 2.0 | % |
| F116 | P26 | Numeric | % Additive | 1.2 | % |
| F117 | P27 | Alphanumeric | Type of Additive | 15 | N/A |
| F118 | Q3 | Label | Criteria | 20 | N/A |
| F119 | Q4 | Alphanumeric | Criteria - Coarse Aggregate Angularity (%) | 20 | N/A |
| F120 | Q5 | Alphanumeric | Criteria - Fine Aggregate Angularity (%) | 20 | N/A |
| F121 | Q6 | Alphanumeric | Criteria - Flat & Elongated Particles (%) | 20 | N/A |
| F122 | Q7 | Alphanumeric | Criteria - Clay Content (SE) (%) | 20 | N/A |
| F123 | Q8 | Alphanumeric | Criteria - % VFA | 20 | N/A |
| F124 | Q9 | Alphanumeric | Criteria - % VMA | 20 | N/A |
| F125 | Q10 | Alphanumeric | Criteria - D/A Ratio | 20 | N/A |
| F126 | Q11 | Alphanumeric | Criteria - % Gmm @ Ninitial | 20 | N/A |
| F127 | Q12 | Alphanumeric | Criteria - % Gmm @ Nmax | 20 | N/A |
| F128 | Q13 | Alphanumeric | Criteria - % Air Voids | 20 | N/A |
| F129 | Q15 | Alphanumeric | Criteria - % AC | 20 | N/A |
| F130 | Q24 | Alphanumeric | Criteria - % TSR without additive | 20 | N/A |
| F131 | Q25 | Alphanumeric | Criteria - % TSR with additive | 20 | N/A |
| F132 | B22 | Label | Reference Information | N/A | N/A |
| F133 | B29 | Alphanumeric | Additional Reference Information | 60 | N/A |
| F134 | C23 | Alphanumeric | COUNTY: | 50 | N/A |
| F135 | C24 | Alphanumeric | ID#: | 50 | N/A |
| F136 | C25 | Alphanumeric | Binder: | 50 | N/A |
| F137 | D26 | Numeric | Date Released: | 8.0 | N/A |
| F138 | D27 | Alphanumeric | Design AC%: | 5 | % |
| F139 | D28 | Alphanumeric | Job Complete? | 5 | N/A |
| F140 | B31 | Label | RAP Information | N/A | N/A |
| F141 | D32 | Numeric | % AC in RAP: | 2.1 | % |
| F142 | D33 | Numeric | % Virgin AC in mix: | 2.1 | % |
| F143 | D34 | Numeric | % RAP AC in mix: | 2.1 | % |
| F144 | D35 | Numeric | Total % AC in mix: | 2.1 | % |
| F145 | C36 | Alphanumeric | RAP MSG's | 5 | N/A |
| F254 | C37 | Alphanumeric | RAP Gsb field label | 9 | N/A |
| F146 | D36 | Alphanumeric | RAP MSG's (2) | 5 | N/A |
| F147 | D37 | Numeric | RAP Gsb = | 1.2 | N/A |
| F148 | F22 | Label | APPROVAL INFORMATION | N/A | N/A |
| F149 | H23 | Alphanumeric | Complete SGC Des. | 1 | N/A |
| F150 | H24 | Alphanumeric | App.-New Design | 1 | N/A |
| F151 | H25 | Alphanumeric | MCL Design | 1 | N/A |
| F152 | K23 | Alphanumeric | 1-Pt. SGC Des. | 1 | N/A |
| F153 | K24 | Alphanumeric | App.-Ref. Mix | 1 | N/A |
| F154 | K25 | Alphanumeric | Contr. Design | 1 | N/A |
| F155 | K26 | Alphanumeric | Revised Asphalt Content (+ or - 0.3%): | 5 | % |
| F156 | F29 | Label | TSR INFORMATION | N/A | N/A |
| F157 | F31 | Numeric | %AC: | 2.1 | % |
| F158 | G31 | Alphanumeric | % ADDITIVE: | 5 | % |
| F159 | I31 | Alphanumeric | TYPE OF ADDITIVE: | 30 | N/A |
| F160 | H32 | Numeric | % Air Voids w/o add. | 2.1 | % |
| F161 | H33 | Numeric | % Initial Saturation w/o Add. | 2.1 | % |
| F162 | H34 | Numeric | % Final Saturation w/o Add. | 3.1 | % |
| F163 | H35 | Numeric | Wet Strength w/o add. (psi) | 3.1 | % |
| F164 | H36 | Numeric | Dry Strength w/o add. (psi) | 3.1 | psi |
| F165 | H37 | Numeric | % TSR w/o Add. = | 2.0 | psi |
| F166 | K32 | Numeric | % Air Voids with add. | 2.1 | % |
| F167 | K33 | Numeric | % Initial Saturation with Add. | 2.1 | % |
| F168 | K34 | Numeric | % Final Saturation with Add. | 3.1 | % |
| F169 | K35 | Numeric | Wet Strength with add. (psi) | 3.1 | psi |
| F170 | K36 | Numeric | Dry Strength with add. (psi) | 3.1 | psi |
| F171 | K37 | Numeric | % TSR with Add. = | 2.0 | % |
| F172 | B39 | Label | MIX DESIGN AGGREGATE INFORMATION | N/A | N/A |
| F173 | B41 | Alphanumeric | AGG. PROD. NO. | 10 | N/A |
| F174 | B42 | Alphanumeric | AGG. PROD. NO. #2 | 10 | N/A |
| F175 | B43 | Alphanumeric | AGG. PROD. NO. #3 | 10 | N/A |
| F176 | B44 | Alphanumeric | AGG. PROD. NO. #4 | 10 | N/A |
| F177 | B45 | Alphanumeric | AGG. PROD. NO. #5 | 10 | N/A |
| F178 | B46 | Alphanumeric | AGG. PROD. NO. #6 | 10 | N/A |
| F179 | D41 | Alphanumeric | PRODUCER NAME | 75 | N/A |
| F180 | D42 | Alphanumeric | PRODUCER NAME #2 | 75 | N/A |
| F181 | D43 | Alphanumeric | PRODUCER NAME #3 | 75 | N/A |
| F182 | D44 | Alphanumeric | PRODUCER NAME #4 | 75 | N/A |
| F183 | D45 | Alphanumeric | PRODUCER NAME #5 | 75 | N/A |
| F184 | D46 | Alphanumeric | PRODUCER NAME #6 | 75 | N/A |
| F185 | I41 | Alphanumeric | MAT.CODE | 10 | N/A |
| F186 | I42 | Alphanumeric | MAT.CODE #2 | 10 | N/A |
| F187 | I43 | Alphanumeric | MAT.CODE #3 | 10 | N/A |
| F188 | I44 | Alphanumeric | MAT.CODE #4 | 10 | N/A |
| F189 | I45 | Alphanumeric | MAT.CODE #5 | 10 | N/A |
| F190 | I46 | Alphanumeric | MAT.CODE #6 | 10 | N/A |
| F191 | K41 | Alphanumeric | AGG. TYPE | 25 | N/A |
| F192 | K42 | Alphanumeric | AGG. TYPE #2 | 25 | N/A |
| F193 | K43 | Alphanumeric | AGG. TYPE #3 | 25 | N/A |
| F194 | K44 | Alphanumeric | AGG. TYPE #4 | 25 | N/A |
| F195 | K45 | Alphanumeric | AGG. TYPE #5 | 25 | N/A |
| F196 | K46 | Alphanumeric | AGG. TYPE #6 | 25 | N/A |
| F197 | M41 | Numeric | Gsb | 1.2 | N/A |
| F198 | M42 | Numeric | Gsb #2 | 1.2 | N/A |
| F199 | M43 | Numeric | Gsb #3 | 1.2 | N/A |
| F200 | M44 | Numeric | Gsb #4 | 1.2 | N/A |
| F201 | M45 | Numeric | Gsb #5 | 1.2 | N/A |
| F202 | M46 | Numeric | Gsb #6 | 1.2 | N/A |
| F203 | N41 | Numeric | % | 3.0 | % |
| F204 | N42 | Numeric | % #2 | 3.0 | % |
| F205 | N43 | Numeric | % #3 | 3.0 | % |
| F206 | N44 | Numeric | % #4 | 3.0 | % |
| F207 | N45 | Numeric | % #5 | 3.0 | % |
| F208 | N46 | Numeric | % #6 | 3.0 | % |
| F209 | O41 | Alphanumeric | S/C | 1 | N/A |
| F210 | O42 | Alphanumeric | AGG S/C #2 | 1 | N/A |
| F211 | O43 | Alphanumeric | AGG S/C #3 | 1 | N/A |
| F212 | O44 | Alphanumeric | AGG S/C #4 | 1 | N/A |
| F213 | O45 | Alphanumeric | AGG S/C #5 | 1 | N/A |
| F214 | O46 | Alphanumeric | AGG S/C #6 | 1 | N/A |
| F215 | P41 | Alphanumeric | SiteManager Agg. Sample ID # | 18 | N/A |
| F216 | P42 | Alphanumeric | SiteManager Agg. Sample ID #2 | 18 | N/A |
| F217 | P43 | Alphanumeric | SiteManager Agg. Sample ID #3 | 18 | N/A |
| F218 | P44 | Alphanumeric | SiteManager Agg. Sample ID #4 | 18 | N/A |
| F219 | P45 | Alphanumeric | SiteManager Agg. Sample ID #5 | 18 | N/A |
| F220 | P46 | Alphanumeric | SiteManager Agg. Sample ID #6 | 18 | N/A |
| F221 | B48 | Label | 1-Pt. CHECK PROPERTIES | N/A | N/A |
| F222 | D49 | Numeric | Unit Wt. (lb/ft3) = | 3.1 | lbs/ft3 |
| F223 | D50 | Numeric | % Air Voids = | 2.1 | % |
| F224 | D51 | Numeric | % VFA = | 2.1 | % |
| F225 | D52 | Numeric | Gsb = | 1.2 | N/A |
| F226 | F49 | Numeric | D/A Ratio = | 1.1 | N/A |
| F227 | F50 | Numeric | Gmm = | 1.3 | N/A |
| F228 | F51 | Numeric | % Eff. AC = | 2.1 | % |
| F229 | F52 | Numeric | Gse = | 1.3 | N/A |
| F230 | I49 | Numeric | AC (%) = | 2.1 | % |
| F231 | I50 | Numeric | % VMA = | 2.1 | % |
| F232 | I51 | Numeric | % Abs. AC (Mix) = | 1.2 | % |
| F233 | I52 | Alphanumeric | ESAL Class | 5 | N/A |
| F234 | L48 | Label | MCL CONSENSUS (& ADDITIONAL) VERIFICATION INFORMATION | N/A | N/A |
| F235 | L50 | Alphanumeric | TEST TYPE | 50 | N/A |
| F236 | L51 | Alphanumeric | TEST TYPE #2 | 50 | N/A |
| F237 | L52 | Alphanumeric | TEST TYPE #3 | 50 | N/A |
| F238 | L53 | Alphanumeric | TEST TYPE #4 | 50 | N/A |
| F239 | L54 | Alphanumeric | TEST TYPE #5 | 50 | N/A |
| F240 | L55 | Alphanumeric | TEST TYPE #6 | 50 | N/A |
| F241 | O50 | Alphanumeric | S/C | 1 | N/A |
| F242 | O51 | Alphanumeric | MCL S/C #2 | 1 | N/A |
| F243 | O52 | Alphanumeric | MCL S/C #3 | 1 | N/A |
| F244 | O53 | Alphanumeric | MCL S/C #4 | 1 | N/A |
| F245 | O54 | Alphanumeric | MCL S/C #5 | 1 | N/A |
| F246 | O55 | Alphanumeric | MCL S/C #6 | 1 | N/A |
| F247 | P50 | Alphanumeric | SiteManager Sample ID # | 18 | N/A |
| F248 | P51 | Alphanumeric | SiteManager Sample ID #2 | 18 | N/A |
| F249 | P52 | Alphanumeric | SiteManager Sample ID #3 | 18 | N/A |
| F250 | P53 | Alphanumeric | SiteManager Sample ID #4 | 18 | N/A |
| F251 | P54 | Alphanumeric | SiteManager Sample ID #5 | 18 | N/A |
| F252 | P55 | Alphanumeric | SiteManager Sample ID #6 | 18 | N/A |
| F253 | M32 | Numeric | TOTAL UNIT TEST COST | 11.2 | $ |
