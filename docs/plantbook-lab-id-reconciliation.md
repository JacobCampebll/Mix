# PlantBook lab id reconciliation — 2026-09-17

Source: `PlantBook Lab IDs.xlsx` (Andrew, from
`N:\MATERIAL\BITSHARE\Performance\AI Shit\Asphalt Documentation Task Force\`),
311 rows off SiteManager's `tsm.t_qualf_lab` (the sheet's own `SQL` tab
carries that query). Reconciled against the live `plants` table (130 rows)
before anything was written to Supabase.

**92 of 160 contractor lab codes (`C###`) went into
`supabase/producer_supplier_labs.sql` cleanly** — one code, one AMP number,
that AMP number is a real row in `plants`. **All 80 KYTC district/CO/crew
codes (`LU#####` / `DL#####`) went into `supabase/kytc_district_labs.sql`.**
Everything below was left OUT of the seed rather than guessed at. Nothing
here blocks PlantBook — it just means these specific plants/companies have
no producer/supplier lab option in the dropdown yet.

## 1. Duplicate lab codes for one AMP (8) — which is current?

Both/all codes were left out entirely (neither guessed as "the" one) until
you say which is current. If one is simply retired, say so and the other
seeds cleanly; if a plant genuinely has two active lab codes, the table
already supports more than one row per AMP.

| AMP | Codes on file |
|---|---|
| `AMP020101` (Scotty's Contracting @ Greenville) | `C384` "Road Builders Paving & Const", `C298` "Scotty's Contracting" |
| `AMP020304` (J H Rudolph @ St Croix Indiana) | `C169`, `C786` — both "J. H. Rudolph & Co." |
| `AMP040311` (Scotty's Contracting @ Upton "Rocky") | `C240`, `C171` — both "Scotty's Contracting" |
| `AMP050312` (Asphalt Supply Co @ Sellersburg, IN) | `C798` "Asphalt Supply Company", `C800` "Hall Contracting" |
| `AMP070301` (The Allen Company @ Berea) | `C199`, `C518` — both "The Allen Company" |
| `AMP080302` (L-G Materials @ Mount Vernon) | `C215`, `C222`, `C785` — all "L-G Materials" |
| `AMP100301` (Hinkle Contracting @ Cave Run Stone) | `C245`, `C250` — both "Hinkle Contracting Corp." |
| `AMP110204` (Hinkle Contracting @ Middlesboro) | `C218`, `C219` — both "Hinkle Contracting Corp." |

## 2. Excel AMP numbers not in `plants` (26) — typo, or already retired?

None of these matched a live `plants.amp_number`. Either the export has a
typo (SiteManager drifting from your cleaned-up table), or these plants were
already pruned during the original cleanup. If any of these is actually a
live plant missing from `plants`, say so and it can be added there, which
also unblocks its lab code here.

| Excel AMP | Lab code | Company |
|---|---|---|
| `AMP020103` | `C293` | Madisonville Paving |
| `AMP020104` | `C277` | Owensboro Paving |
| `AMP020106` | `C279` | Rogers Group, Inc. |
| `AMP020107` | `C280` | Rogers Group |
| `AMP030302` | `C290` | Scotty's Contracting |
| `AMP040101` | `C256` | Scotty's Contracting |
| `AMP040104` | `C243` | Nally & Haydon |
| `AMP040105` | `C170` | Qualified Paving, LLC |
| `AMP040307` | `C548` | Certified Construction Co. |
| `AMP050102` | `C266` | Shelbyville Asphalt |
| `AMP050202` | `C767` | Riverside Paving |
| `AMP050310` | `C752` | Hinkle Contracting Corp. |
| `AMP060101` | `C185` | Barrett Paving Materials |
| `AMP060102` | `C184` | Eaton Asphalt Paving Company |
| `AMP060103` | `C181` | Eaton Asphalt Paving Company |
| `AMP060301` | `C178` | Bluegrass Paving - Harper Co. |
| `AMP060305` | `C179` | Ohio Valley Asphalt |
| `AMP060401` | `C186` | Barrett Paving Materials |
| `AMP070310` | `C229` | Hamilton & Hinkle Paving |
| `AMP070501` | `C198` | The Allen Company |
| `AMP080307` | `C202` | Mago Construction |
| `AMP090101` | `C356` | Brown County Construction |
| `AMP090109` | `C801` | Freedom Asphalt |
| `AMP090305` | `C776` | MAC Construction |
| `AMP120101` | `C223` | Mountain Enterprises |
| `AMP120303` | `C281` | Mountain Enterprises |

## 3. Contractor codes with no AMP at all (25) — plant-tied field can't use these

`producer_supplier_labs` ties every row to one plant (RLS scopes visibility
by AMP access), so a code with no AMP has nowhere to go. Some of these read
as genuinely company-wide/shared codes; some read as outside testing labs
with no plant of their own; a few read as dead. None were guessed into a
specific plant.

| Lab id | Name | Likely read |
|---|---|---|
| `C203` | Hinkle Contracting Corp. | company-wide (Hinkle has 19 AMP-specific codes already) |
| `C321` | Hinkle Contract. Corp. - Tateville, KY | possibly a duplicate of `AMP080303`'s `C204` under a place name instead of an AMP |
| `C245`/`C250` dup aside, `C752` unmatched aside — see above | | |
| `C206` | Gaddie Shamrock LLC - Columbia | possibly same plant as `AMP080301`'s `C314` |
| `C214` | ATS Construction | company-wide (ATS has 4 AMP-specific codes) |
| `C254` | Bluegrass Contracting Corporation | no plant on file under this name |
| `C258` | Atlas Concrete - Mt. Sterling | no plant on file under this name |
| `C264` | Bluegrass Testing | reads as an outside testing lab, not a producer |
| `C282` | Asphalt Of Kentuckiana, LLC | no plant on file under this name |
| `C284` | Louisville Paving | company-wide (Louisville Paving has 4 AMP-specific codes) |
| `C299` | Rogers Group - Marion | possibly `AMP010306` (Rogers Group @ Marion (Drum)) — no AMP in the export's own name |
| `C300` | Brandon And Brandon Paving, Inc. | no plant on file under this name |
| `C174` | Mago Construction - Bardstown | possibly `AMP040310` (Mago Construction @ Bardstown (Drum)) — no AMP in the export's own name |
| `C175` | HAPCO, LLC - Out of Business | dead, per the export's own label |
| `C747` | Pennyrile Asphalt | no plant on file under this name |
| `C772` | Hall Contracting of Kentucky Inc. | company-wide (Hall Contracting has 2 AMP-specific codes) |
| `C773`, `C804` | S&ME, Inc. / S&ME | outside testing/engineering firm, not a producer |
| `C781` | Charles DeWeese Construction, Inc. | company-wide (Charles Deweese has 1 AMP-specific code, `AMP030310`, itself with no lab code on file) |
| `C791` | Byassee Paving - Murray | no plant on file under this name |
| `C793` | L-G Materials LLC - Lexington | possibly same company as the `AMP080302` duplicate above |
| `C789` | Bizzack Construction | company-wide (Bizzack has 1 AMP-specific code, `AMP110307`, itself with no lab code on file) |
| `C807` | Central Paving Co | possibly `AMP010201` (Central Paving Co. @ Paducah) — no AMP in the export's own name |
| `C803` | D-99 Crew 380-ORX Phase 1 | a construction-crew code under the contractor prefix, duplicating `LU99380`/`DL99380` in the KYTC list |
| `C806` | D-99 Crew 400 Market Street LPA | same pattern as above, duplicating `LU99400`/`DL99400` |
| `C808` | Cleary Construction, Inc. | company-wide (Cleary has 1 AMP-specific code, `AMP030312`, itself with no lab code on file) |

## 4. Plants with zero lab coverage (30) — informational, not a conflict

These are real rows in `plants` that simply have no contractor lab code
anywhere in the export (not because of a conflict — there's nothing to
reconcile, just nothing to seed). Listed so a gap in the dropdown doesn't
read as a bug later.

`AMP010101`, `AMP010306`, `AMP020306`, `AMP020307`, `AMP020308`, `AMP020310`,
`AMP030310`, `AMP030312`, `AMP040309`, `AMP050311`, `AMP060106`, `AMP060307`,
`AMP060310`, `AMP070201`, `AMP070311`, `AMP080103`, `AMP080304`, `AMP080305`,
`AMP080306`, `AMP080402`, `AMP090304`, `AMP100101`, `AMP110202`, `AMP110203`,
`AMP110301`, `AMP110304`, `AMP110307`, `AMP110501`, `AMP110502`, `AMP120307`.

## 5. Company mismatches surfaced by joining against `plants` (7) — wrong AMP, or the plant changed hands?

Added 2026-09-17 when the dropdown's display name was switched to read
`plants.name` (via the new `producer_supplier_labs_view`) instead of the
export's own `company_name`. That join surfaced these 7 of the 92 "clean"
rows where the export's company and the plant's current operator are
genuinely different companies — not spelling variants (`Scotty's` vs
`Scottys`, `J. H. Rudolph` vs `J H Rudolph`, and `HCC` for `Hinkle
Contracting Corp.` all filtered out as noise, not listed here). Each of
these 92 rows already passed the "AMP matches a live plant" check, so this
is a second, sharper kind of mismatch: right AMP, wrong company. Left in
the seed rather than pulled — could be a stale AMP in the export (plant
changed operators since SiteManager's record was last touched), or the
export is simply right and `plants` is the stale one. Either way it's a
real question, not a guess to make silently.

| Lab id | AMP | Export says | `plants` says |
|---|---|---|---|
| `C513` | `AMP010201` | Purchase Asphalt LLC | Central Paving Co. @ Paducah |
| `C278` | `AMP020303` | Owensboro Paving | Hinkle Contracting @ Owensboro (Drum) |
| `C226` | `AMP040301` | Irving Materials Inc. | E & B Paving @ Corydon Indiana |
| `C262` | `AMP050303` | H. G. Mays Corp | Frankfort Materials @ Frankfort |
| `C268` | `AMP050304` | Sellersburg Stone (Gohman) | E & B Paving @ Sellersburg Indiana |
| `C802` | `AMP050313` | Windham Paving | Hall Contracting @ Charlestown, IN |
| `C180` | `AMP060304` | Hinkle Contracting | Ohio Valley Asphalt @ Carrollton |

If any of these should be corrected, the fix is a one-line `update
producer_supplier_labs set amp_number = '...' where lab_id = '...'` (or
`update plants set name = '...' where amp_number = '...'`, if `plants` is
the one that's stale) — nothing structural.

## 6. Still open: LU vs DL for the AMAW's KYTC Lab ID

See the header comment in `supabase/kytc_district_labs.sql` and the CLAUDE.md
entry logged the same day. Every KYTC district/section lab has both an
`LU#####` and a `DL#####` code; DesignBook's MixPack confirms `LU00642` on a
real approved design, but neither of Jake's two real completed AMAWs fills
in `'Pay Values'!I5` at all, so nothing proves which series the AMAW wants.
The dropdown currently defaults to `lu_lab_id`. Resolve by checking a real
filled-in AMAW's I5, or asking KYTC directly, then flip the default in
`CONFIG.REFERENCE.TABLES.kytc_district_labs` (`designbook.html`) and
`PLANTBOOK_REFERENCE_TABLES` (`scripts/amaw/sections.mjs`) if it turns out
to be DL.
