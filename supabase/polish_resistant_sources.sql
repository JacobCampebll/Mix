-- polish_resistant_sources -- LAM (List of Approved Materials) pages 37-51,
-- Class A+/A/B Polish-Resistant Aggregate Source List, dated 12/22/2025 on
-- its own footer (revises on its own schedule, independent of the spec/
-- AASHTO cycle -- same CONFIG-vs-Supabase reasoning as the other four
-- reference tables in reference_tables.sql).
--
-- STAGED ONLY as of 2026-09-11 (Andrew). Table exists live and is seeded,
-- but designbook.html does not query it yet -- polishFactsFor() still reads
-- only aggregate_types. See docs/lam-polish-resistant-sources.md for the
-- full extraction, the open questions, and why this table exists at all:
-- aggregate_types keys polish class on generic type_name only, but the LAM
-- certifies class per PRODUCER (Haydon's Airport Rd. dolomite is Class A;
-- its Greensburg and Lebanon locations carry different AGP numbers and
-- different classes/lithologies entirely), at a bench/ledge grain finer
-- than either `aggregates` or `aggregate_types` can represent. Confirmed
-- 2026-09-11 against the live table.
--
-- Natural/river sand is NOT in this table -- confirmed by Andrew 2026-09-11
-- that it is automatically Class A polish-resistant for any approved
-- producer, no bench check, independent of this list (LAM p.37's own text).
-- Whether conglomerate sand / crushed gravel sand get the same automatic
-- treatment is unconfirmed -- open question in the docs file.
--
-- agp_number is NOT a foreign key to aggregates.agp_number: several sources
-- here are out-of-state quarries (TN, OH, IN, NC, IL, VA) that may not
-- appear in the 178-row aggregates table at all.
--
-- Where a producer+lithology appeared in BOTH the Class A+ and Class A
-- sections of the LAM (every case checked was an identical entry in both
-- places), this table carries only the higher class -- A+ implies A per the
-- LAM's own text on p.39 ("Aggregates on this list shall meet all
-- requirements of Class A aggregates and meet the additional requirement
-- of..."). 45 rows live; run against a fresh LAM export whenever KYTC
-- reissues the list.

create table if not exists polish_resistant_sources (
  agp_number       text not null,
  lithology        text not null
                   check (lithology in ('crushed_gravel', 'crushed_quartzite', 'siltstone',
                                         'crushed_granite', 'sandstone', 'traprock',
                                         'crushed_slag', 'dolomite', 'limestone')),
  class            text not null check (class in ('A+', 'A', 'B')),
  producer_name    text not null,
  restriction_note text,
  created_at       timestamptz not null default now(),
  primary key (agp_number, lithology)
);

alter table polish_resistant_sources enable row level security;

create policy "polish_resistant_sources_select_authenticated"
  on polish_resistant_sources for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Seed rows, from LAM pp. 37-51. Idempotent via ON CONFLICT DO NOTHING so
-- this can be re-run without duplicating rows already live.
-- ---------------------------------------------------------------------

insert into polish_resistant_sources (agp_number, producer_name, lithology, class, restriction_note) values
  ('AGP000702', 'Hinkle Contracting @ Owensboro', 'crushed_gravel', 'A+', 'Not permitted as PR portion of Class B blends or OGFC'),
  ('AGP002302', 'Nugent Sand Company', 'crushed_gravel', 'A+', 'Dredge'),
  ('AGP009702', 'Northern Kentucky Aggregates', 'crushed_gravel', 'A+', 'Dredge/dry bank'),
  ('AGP026202', 'Rogers Group @ Knox Co., IN', 'crushed_gravel', 'A+', 'Dredge'),
  ('AGP003202', 'Hilltop Basic Resources, Inc. (plant: Patriot, IN)', 'crushed_gravel', 'A', 'Dredge/dry bank'),
  ('AGP020102', 'River Sand and Gravel', 'crushed_gravel', 'A', 'Dry bank only; not permitted as PR portion of Class B blends or OGFC'),

  ('AGP001004', 'Martin Marietta @ Elizabethton', 'crushed_quartzite', 'A+', 'Class A aggregate from quartzite benches'),

  ('AGP000111', 'Vulcan Materials Co. (Springfield, TN)', 'siltstone', 'A+', 'High insol ledges only'),
  ('AGP000611', 'Rogers Group, Inc. (Cross Plains, TN)', 'siltstone', 'A+', 'High insol ledge only'),
  ('AGP000711', 'Vulcan Materials Co. -- Clarksville Quarry', 'siltstone', 'A+', 'Benches D and E'),
  ('AGP000811', 'Vulcan @ Dickson, TN', 'siltstone', 'A+', 'Bench B and C'),
  ('AGP004401', 'Haydon Materials, LLC @ Greensburg', 'siltstone', 'A+', 'Bench C'),
  ('AGP025301', 'Winn Materials, LLC', 'siltstone', 'A+', 'Bench F, high insol'),

  ('AGP000107', 'Vulcan Materials (Enka, NC)', 'crushed_granite', 'A+', null),
  ('AGP000207', 'Vulcan Materials (Hendersonville, NC)', 'crushed_granite', 'A+', null),
  ('AGP000307', 'Maymead Materials, Inc.', 'crushed_granite', 'A+', null),
  ('AGP000607', 'Harrison Construction @ Waynesville', 'crushed_granite', 'A+', null),

  ('AGP004009', 'Rogers Group Allons Pit @ Allons, TN', 'sandstone', 'A+', null),
  ('AGP012301', 'Mountain Aggregates @ Elkhorn City', 'sandstone', 'A+', 'High insoluble ledges only'),
  ('AGP029901', 'Hastie Mining', 'sandstone', 'A+', 'Sandstone bench'),
  ('AGP020901', 'LaFarge @ Cave-in-Rock', 'sandstone', 'A', 'Sandstone bench'),

  ('AGP000606', 'Ontario Traprock', 'traprock', 'A+', null),

  ('AGP000303', 'Mountain Enterprises Slag (Stein Inc.)', 'crushed_slag', 'A',
   'Blast furnace slag and steel slag; raw blast furnace slag from this plant processed exclusively by Mountain Slag @ Greenup, KY'),
  ('AGP002403', 'Nucor Steel - Gallatin (Phoenix Services)', 'crushed_slag', 'B',
   'Steel slag from this plant processed by Nucor Steel @ Ghent, KY'),
  ('AGP016701', 'E Dillon', 'crushed_slag', 'B', 'Bench A'),

  ('AGP005701', 'Quality Crushed Stone', 'dolomite', 'A', 'Laurel - Ledges 6, 7, 8; Louisville - Ledges 2-4'),
  ('AGP005801', 'Bullitt County Stone Company', 'dolomite', 'A', 'Laurel - Ledges 6, 7, 8; Louisville - Ledges 1A-4'),
  ('AGP009201', 'Heidelberg Materials / Midwest Agg, Inc. @ Peebles (plant: Peebles, OH)', 'dolomite', 'A', 'Ledges 2-13, 2-3B, 4-6'),
  ('AGP012701', 'Oldham County Stone', 'dolomite', 'A', 'Laurel - Ledges 1M, 2M, 3M'),
  ('AGP017001', 'IMI-Sellersburg Stone', 'dolomite', 'A', 'Laurel - Ledges 18 & 19'),
  ('AGP019201', 'Mulzer Crushed Stone', 'dolomite', 'A', 'Laurel - Ledges 4, 5; Louisville - Ledges 1-3'),
  ('AGP022701', 'Melvin Stone Co.', 'dolomite', 'A', 'Ledges 1-3'),
  ('AGP026701', 'Latham Stone, Inc.', 'dolomite', 'A', 'Bench A; not permitted as PR portion of Class B blends or OGFC'),
  ('AGP027501', 'Haydon Materials, LLC -- Airport Rd. @ Bardstown', 'dolomite', 'A', 'Bench B'),
  ('AGP029301', 'Bizzack Construction', 'dolomite', 'A', 'Not permitted as PR portion of Class B blends or OGFC'),
  ('AGP029601', 'Midsouth Agg -- Goins Hollow Quarry @ Tazewell, TN', 'dolomite', 'A', 'Not permitted as PR portion of Class B blends or OGFC'),
  ('AGP030601', 'Martin Marietta @ Phillipsburg, OH', 'dolomite', 'A', 'Bench A; not permitted as PR portion of Class B blends or OGFC'),
  ('AGP016701', 'E Dillon', 'dolomite', 'A', 'All dolomitic benches; not permitted as PR portion of Class B blends or OGFC'),

  ('AGP004301', 'Haydon Materials, LLC (Lebanon, KY)', 'limestone', 'A', 'Ledges 1, 2A, 2B, 3'),
  ('AGP000301', 'Vulcan Materials -- Reed Quarry', 'limestone', 'B', 'Ledges 18-28'),
  ('AGP000701', 'Hopkinsville Aggregate', 'limestone', 'B', 'Bench G'),
  ('AGP011001', 'Menifee Stone (Walker Construction Co., plant: Frenchburg, KY)', 'limestone', 'B', 'Ledge 1'),
  ('AGP015201', 'Shawnee Stone', 'limestone', 'B', 'Bench D'),
  ('AGP016501', 'Gaddie Shamrock', 'limestone', 'B', 'Bench C'),
  ('AGP026801', 'Rogers Group @ Caryville', 'limestone', 'B', 'Bench A')
on conflict (agp_number, lithology) do nothing;
