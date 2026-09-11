# LAM Polish-Resistant Aggregate Source List (pp. 37–51)

Extracted 2026-09-11 from `LAM.pdf` (KYTC List of Approved Materials), pages
37–51, "POLISH-RESISTANT AGGREGATE SOURCE LIST AND GUIDELINES." The Class
A+/A/B lists on these pages are dated **12/22/2025** on their own footer —
this list revises on its own schedule, independent of the Standard
Specifications / AASHTO cycle, so per the CONFIG-vs-Supabase dividing line in
`CLAUDE.md` it belongs in Supabase (like `aggregates`/`aggregate_types`), not
hardcoded in a page.

**This is a working extraction, not yet seeded anywhere.** No schema exists
for it yet (`polish_resistant_sources` is proposed, not built) — see the
open questions at the bottom before turning this into a migration.

## Key mechanism (page 37 intro, plus Andrew's confirmation 2026-09-11)

- Class A+, Class A, and Class B here are **producer + bench/ledge specific**
  for crushed stone (dolomite, quartzite, siltstone, granite, sandstone,
  slag) and crushed/dredged gravel — a quarry can have benches that qualify
  and benches that don't (e.g. Haydon Airport Rd. qualifies only from
  "BENCH B"). This is finer-grained than either `aggregates` (keyed on
  producer/AGP only) or `aggregate_types` (keyed on generic type name only)
  can represent alone.
- **Natural sand (river sand) is automatically Class A polish-resistant** —
  no bench restriction, not tied to appearing in this lettered list at all.
  Page 37's own text: "Polish-Resistant Fine Aggregate includes (but is not
  limited to) natural sands, conglomerate sands and crushed gravel sands
  which are on the Aggregate Source List" (i.e. the general approved-producer
  list, not this Class A/B list). Confirmed by Andrew 2026-09-11. Whether
  conglomerate sand and crushed gravel sand (`Gravel Sand-Crushed` in
  `aggregate_types`) get the same automatic treatment is NOT yet confirmed —
  open question below.
- Some sources carry a restriction beyond the bench (e.g. "NOT PERMITTED AS
  THE POLISH-RESISTANT PORTION OF CLASS B BLENDS. NOT PERMITTED AS THE
  POLISH-RESISTANT PORTION OF OGFC.") — these are usage restrictions on an
  otherwise-qualifying source, not a reason to drop the row.
- Class B sources may be used only when the bid item / proposal permits.

---

## CLASS A+ (MODIFIED) POLISH-RESISTANT SOURCES

Meets all Class A requirements plus 40% min acid insoluble residue (KM 64-625).

### Crushed Gravel (50% min acid insoluble residue, KM 64-265, at source)
| AGP | Producer | Restriction |
|---|---|---|
| AGP000702 | Hinkle Contracting @ Owensboro | Not permitted as PR portion of Class B blends or OGFC |
| AGP002302 | Nugent Sand Company | Dredge |
| AGP009702 | Northern Kentucky Aggregates | Dredge/dry bank |
| AGP026202 | Rogers Group @ Knox Co., IN | Dredge |

### Crushed Quartzite
| AGP | Producer | Restriction |
|---|---|---|
| AGP001004 | Martin Marietta @ Elizabethton | Class A aggregate from quartzite benches |

### Siltstone
| AGP | Producer | Restriction |
|---|---|---|
| AGP000111 | Vulcan Materials Co. (Springfield, TN) | High insol ledges only |
| AGP000611 | Rogers Group, Inc. (Cross Plains, TN) | High insol ledge only |
| AGP000711 | Vulcan Materials Co. — Clarksville Quarry | Benches D and E |
| AGP000811 | Vulcan @ Dickson, TN | Bench B and C |
| AGP004401 | Haydon Materials, LLC @ Greensburg | Bench C |
| AGP025301 | Winn Materials, LLC | Bench F, high insol |

### Crushed Granite
| AGP | Producer | Restriction |
|---|---|---|
| AGP000107 | Vulcan Materials (Enka, NC) | None |
| AGP000207 | Vulcan Materials (Hendersonville, NC) | None |
| AGP000307 | Maymead Materials, Inc. | None |
| AGP000607 | Harrison Construction @ Waynesville | None |

### Sandstone
| AGP | Producer | Restriction |
|---|---|---|
| AGP004009 | Rogers Group Allons Pit @ Allons, TN | None |
| AGP012301 | Mountain Aggregates @ Elkhorn City | High insoluble ledges only |
| AGP029901 | Hastie Mining | Sandstone bench |

### Traprock
| AGP | Producer | Restriction |
|---|---|---|
| AGP000606 | Ontario Traprock | None |

---

## CLASS A POLISH-RESISTANT SOURCES

### Crushed Gravel (50% min acid insoluble residue, KM 64-265, at source)
| AGP | Producer | Restriction |
|---|---|---|
| AGP000702 | Hinkle Contracting @ Owensboro | Not permitted as PR portion of Class B blends or OGFC |
| AGP002302 | Nugent Sand Company | — |
| AGP003202 | Hilltop Basic Resources, Inc. (plant: Patriot, IN) | Dredge/dry bank |
| AGP009702 | Northern Kentucky Aggregates | Dredge/dry bank |
| AGP020102 | River Sand and Gravel | Dry bank only; not permitted as PR portion of Class B blends or OGFC |
| AGP026202 | Rogers Group @ Knox Co., IN | Dredge |

### Crushed Slag
| AGP | Producer | Restriction |
|---|---|---|
| AGP000303 | Mountain Enterprises Slag (Stein Inc.) | Blast furnace slag and steel slag; raw blast furnace slag from this plant processed exclusively by Mountain Slag @ Greenup, KY |

### Crushed Quartzite
| AGP | Producer | Restriction |
|---|---|---|
| AGP001004 | Martin Marietta @ Elizabethton | Class A aggregate from quartzite benches |

### Siltstone
| AGP | Producer | Restriction |
|---|---|---|
| AGP000111 | Vulcan Materials Co. | High insol ledges only |
| AGP000611 | Rogers Group, Inc. | High insol ledge only |
| AGP000711 | Vulcan Materials Co. — Clarksville Quarry | Benches D and E |
| AGP000811 | Vulcan @ Dickson, TN | Bench B and C |
| AGP004401 | Haydon Materials, LLC @ Greensburg | Bench C |
| AGP025301 | Winn Materials, LLC | Bench F, high insol |

### Dolomite (37% min magnesium carbonate, KM 64-224, at source)
| AGP | Producer | Restriction |
|---|---|---|
| AGP005701 | Quality Crushed Stone | Laurel — Ledges 6, 7, 8; Louisville — Ledges 2-4 |
| AGP005801 | Bullitt County Stone Company | Laurel — Ledges 6, 7, 8; Louisville — Ledges 1A-4 |
| AGP009201 | Heidelberg Materials / Midwest Agg, Inc. @ Peebles (plant: Peebles, OH) | Ledges 2-13, 2-3B, 4-6 |
| AGP012701 | Oldham County Stone | Laurel — Ledges 1M, 2M, 3M |
| AGP017001 | IMI-Sellersburg Stone | Laurel — Ledges 18 & 19 |
| AGP019201 | Mulzer Crushed Stone | Laurel — Ledges 4, 5; Louisville — Ledges 1-3 |
| AGP022701 | Melvin Stone Co. | Ledges 1-3 |
| AGP026701 | Latham Stone, Inc. | Bench A; not permitted as PR portion of Class B blends or OGFC |
| **AGP027501** | **Haydon Materials, LLC — Airport Rd. @ Bardstown** | **Bench B** |
| AGP029301 | Bizzack Construction | Not permitted as PR portion of Class B blends or OGFC |
| AGP029601 | Midsouth Agg — Goins Hollow Quarry @ Tazewell, TN | Not permitted as PR portion of Class B blends or OGFC |
| AGP030601 | Martin Marietta @ Phillipsburg, OH | Bench A; not permitted as PR portion of Class B blends or OGFC |
| AGP016701 | E Dillon | All dolomitic benches; not permitted as PR portion of Class B blends or OGFC |

### Limestone
| AGP | Producer | Restriction |
|---|---|---|
| AGP004301 | Haydon Materials, LLC (Lebanon, KY — 1270 Hwy 208) | Ledges 1, 2A, 2B, 3 |

### Crushed Granite
| AGP | Producer | Restriction |
|---|---|---|
| AGP000107 | Vulcan Materials (Enka, NC) | None |
| AGP000207 | Vulcan Materials (Hendersonville, NC) | None |
| AGP000307 | Maymead Materials, Inc. | None |
| AGP000607 | Harrison Construction @ Waynesville | None |

### Sandstone
| AGP | Producer | Restriction |
|---|---|---|
| AGP004009 | Rogers Group Allons Pit @ Allons, TN | None |
| AGP012301 | Mountain Aggregates @ Elkhorn City | High insoluble ledges only |
| AGP020901 | LaFarge @ Cave-in-Rock | Sandstone bench |
| AGP029901 | Hastie Mining | Sandstone bench |

### Traprock
| AGP | Producer | Restriction |
|---|---|---|
| AGP000606 | Ontario Traprock | None |

---

## CLASS B POLISH-RESISTANT SOURCES

Usable only where the bid item / proposal permits.

### Crushed Gravel (15% min acid insoluble residue, KM 64-265, at source)
| AGP | Producer | Restriction |
|---|---|---|
| AGP002302 | Nugent Sand Company | Dredge/dry bank |
| AGP009502 | Martin Marietta @ Fairfield, OH | Dredge |

### Crushed Slag
| AGP | Producer | Restriction |
|---|---|---|
| AGP002403 | Nucor Steel – Gallatin (Phoenix Services) | Steel slag from this plant processed by Nucor Steel @ Ghent, KY |
| AGP016701 | E Dillon | Bench A |

### Limestone (15% min acid insoluble residue, KM 64-265, at source)
| AGP | Producer | Restriction |
|---|---|---|
| AGP000301 | Vulcan Materials — Reed Quarry | Ledges 18-28 |
| AGP000701 | Hopkinsville Aggregate | Bench G |
| AGP011001 | Menifee Stone (Walker Construction Co., plant: Frenchburg, KY) | Ledge 1 |
| AGP015201 | Shawnee Stone | Bench D |
| AGP016501 | Gaddie Shamrock | Bench C |
| AGP026801 | Rogers Group @ Caryville | Bench A |

---

## Open questions before building `polish_resistant_sources`

1. **Does the automatic-Class-A rule extend to conglomerate sand and crushed
   gravel sand** (`Gravel Sand-Crushed` in `aggregate_types`), matching the
   page 37 wording, or is it natural/river sand only? Andrew confirmed
   natural/river sand; the other two are unconfirmed.
2. **Bench granularity has nowhere to live on the DesignBook form today.**
   Aggregate Structure captures Producer + Type & size, not which
   bench/ledge. A `(agp_number, lithology)` table gets correct answers for
   every source above where the restriction is "None" or covers the whole
   operation, and can still *print* the bench restriction as a note for the
   ones that don't (Haydon dolomite, Vulcan siltstone, the Class B limestone
   sources, etc.) — but can't verify bench-level truth without a new field.
   Worth deciding whether that note-only treatment is good enough for now.
3. Several producers appear more than once under different lithologies or
   classes with different AGP numbers per location (e.g. Haydon has three:
   AGP027501 Airport Rd./dolomite Class A, AGP004401 Greensburg/siltstone
   Class A+ & A, AGP004301 Lebanon/limestone Class A) — matches how
   `aggregates` already treats one AGP per physical plant location, so no
   change needed there.
4. This extraction stops at the Class A/B lettered lists (pp. 37–51) per the
   original scope. It does not cover natural-sand-specific pages elsewhere
   in the 233-page LAM, if any exist — not searched yet.
