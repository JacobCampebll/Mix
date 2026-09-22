/* Lot n -> lot n+1: does the frame carry, and does NOT ONE measurement?
 *
 *   node scripts/amaw/check_rollforward.mjs
 *
 * The important assertion here is the negative one, and it is deliberately
 * not written as a list of tables to look at. A list is what rots - this file
 * already records two of them rotting on two separate merges in one day - so
 * the universe of "things that must not survive" is ENUMERATED FROM THE
 * SCHEMA: every scalar field and every row column that frameFields() does not
 * call frame is stuffed with a sentinel, the lot is rolled forward, and the
 * whole resulting envelope is searched for that sentinel. A measurement table
 * added to sections.mjs next year is covered the day it is added, without
 * anyone remembering this file exists.
 *
 * Both directions matter and both are asserted. A surviving measurement would
 * let a technician submit lot 8 carrying lot 7's numbers with nothing on
 * screen saying so; a frame value wrongly dropped only makes them retype it.
 * They are not equally bad, which is why the default is clear - but a frame
 * that quietly stopped carrying would make this door pointless, so it is
 * checked too.
 */
import PLANTBOOK_SECTIONS, { LOT_LEVEL_ROW_TABLES, LOT_LEVEL_ROW_COLUMNS } from './sections.mjs';
import { rollForwardLot, frameFields, ROLL_FORWARD_EXCEPTIONS, lotFromApproval } from './intake.mjs';
import { blankLot } from './storage.mjs';

let pass = 0, fail = 0;
const ok = (cond, what, detail) => {
  if (cond) { pass++; return true; }
  fail++; console.log(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`);
  return false;
};
const head = (s) => console.log(`\n${s}`);

const SENTINEL = '__MEASURED__';
const frame = frameFields();

/* ---- the schema's own inventory ---- */
const allFields = new Set(), rowCols = new Map(), lotHostedTables = new Set();
for (const s of PLANTBOOK_SECTIONS) {
  const host = s.into || s.id;
  for (const f of s.fields || []) if (f.key) allFields.add(f.key);
  for (const sv of s.sieves || [])
    for (const c of s.columns || [{ key: null }]) allFields.add(c.key ? `${c.key}_${sv.key}` : sv.key);
  const rs = Array.isArray(s.rows) ? s.rows : s.rows ? [s.rows] : [];
  for (const r of rs) {
    rowCols.set(r.key, (r.columns || []).map((c) => c.key));
    if (host === 'lot') lotHostedTables.add(r.key);
  }
}

head('the exception list names fields that really exist');
for (const k of Object.keys(ROLL_FORWARD_EXCEPTIONS))
  ok(allFields.has(k), `ROLL_FORWARD_EXCEPTIONS["${k}"] is a real schema field`,
     'a name that matches nothing is the quietest failure there is');
for (const k of Object.keys(ROLL_FORWARD_EXCEPTIONS))
  ok(!frame.has(k), `${k} is excluded from the frame`);

head('the lock lists this reuses still name real things');
for (const t of LOT_LEVEL_ROW_TABLES)
  ok(rowCols.has(t), `LOT_LEVEL_ROW_TABLES "${t}" is a real row table`);
for (const p of LOT_LEVEL_ROW_COLUMNS) {
  const [t, c] = p.split('.');
  ok(rowCols.has(t) && rowCols.get(t).includes(c), `LOT_LEVEL_ROW_COLUMNS "${p}" resolves`);
}

/* ---- build a previous lot with EVERY non-frame cell poisoned ---- */
const prev = blankLot({ contract_id: '262120', amp_number: 'AMP070301',
                        mix_id: '00260467', lot_number: 7 },
                      { mix_signature: 'CL3 ASPH SURF 0.38B PG64-22', plant_name: 'Boonesboro' });
prev.values = {};
for (const k of allFields) prev.values[k] = frame.has(k) ? `FRAME_${k}` : SENTINEL;
prev.values.lot_number = 7;
prev.values.design = { source: 'DesignBook approval #467', jmf_ac: 5.9, target_va: 3.5, min_vma: 15,
  approval: { mix_id: '00260467', verification: { state: 'verified' } } };
prev.rows = {};
for (const [t, cols] of rowCols) {
  const keepWhole = lotHostedTables.has(t) || LOT_LEVEL_ROW_TABLES.includes(t);
  const keepCols = LOT_LEVEL_ROW_COLUMNS.filter((p) => p.startsWith(`${t}.`)).map((p) => p.slice(t.length + 1));
  prev.rows[t] = [0, 1].map((i) => {
    const row = {};
    for (const c of cols) row[c] = (keepWhole || keepCols.includes(c)) ? `FRAME_${c}_${i}` : SENTINEL;
    if (cols.includes('design_pct')) row.design_pct = 30 + i;
    if (cols.includes('pct')) row.pct = keepWhole ? 30 + i : SENTINEL;
    return row;
  });
}
prev.extracted_from = { lot_ps_lab: 'plants.ps_lab_id', lot_gse: SENTINEL };
prev.status = 'Submitted';
prev.history = [{ action: 'Submitted to KYTC', sm_id: 'jcampbell' }];

const r = rollForwardLot(prev, { sm_id: 'adenmark', name: 'Andrew Denmark', now: '2026-09-16T19:00:00Z' });

head('it rolls forward at all');
ok(r.ok, 'rollForwardLot succeeded', r.error);
if (!r.ok) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
const lot = r.lot;

head('NOT ONE measured cell survives (schema-enumerated, not a list)');
const dump = JSON.stringify(lot);
const hits = (dump.match(new RegExp(SENTINEL, 'g')) || []).length;
ok(hits === 0, 'the sentinel appears nowhere in the rolled lot',
   hits ? `${hits} occurrence(s); leaked keys: ` + JSON.stringify(
     Object.keys(lot.values).filter((k) => lot.values[k] === SENTINEL)
       .concat(Object.keys(lot.rows).filter((t) => JSON.stringify(lot.rows[t]).includes(SENTINEL)))) : '');
ok(!JSON.stringify(lot.extracted_from).includes(SENTINEL),
   'provenance for a cleared field is dropped with it');

head('the frame carries');
const wantFrame = [...frame].filter((k) => k !== 'lot_number');
const dropped = wantFrame.filter((k) => lot.values[k] !== `FRAME_${k}`);
ok(dropped.length === 0, `all ${wantFrame.length} frame scalars carried`,
   dropped.length ? `dropped: ${dropped.join(', ')}` : '');
ok(lot.values.design && lot.values.design.jmf_ac === 5.9,
   'the design block travels whole (JMF %AC, target Va, minimum VMA)');
ok(lot.values.design.approval.verification.state === 'verified',
   'the approval verification state is carried, not re-derived');
ok([...frame].filter((k) => k.startsWith('jmf_')).length === 13,
   'all 13 JMF sieve targets are frame');

head('the lot number is derived, not typed');
ok(lot.lot_number === 8 && lot.values.lot_number === 8, 'lot 7 -> lot 8');
// The key is the six-part natural one, so the lot number is a FIELD in it
// rather than its tail - two identity parts (the line item, the compaction
// option) sit after it and either may legitimately be empty.
ok(lot.key.split('|')[4] === '8', 'the storage key carries the new number', lot.key);
ok(rollForwardLot({ ...prev, lot_number: 3 }).lot.lot_number === 4, 'lot 3 -> lot 4');
ok(rollForwardLot(prev, { lotNumber: 12 }).lot.lot_number === 12, 'an explicit lotNumber wins');
// The setup allowance is what makes this matter, so say so in the check.
ok(lot.values.lot_number !== 1,
   'the next lot can never come out numbered 1 (the sublot-1 pay allowance)');

head('row tables');
ok((lot.rows.project_items || []).length === 2, 'project items carry whole');
ok((lot.rows.blend_gsb || []).length === 2, 'blend_gsb carries whole');
ok((lot.rows.blend_pct || []).length === 2, 'blend_pct carries its identity columns');
ok(lot.rows.blend_pct.every((x) => x.pct === x.design_pct),
   'blend_pct.pct is re-seeded from design_pct, not carried and not blank',
   JSON.stringify(lot.rows.blend_pct));
const measuredTables = [...rowCols.keys()].filter((t) =>
  !lotHostedTables.has(t) && !LOT_LEVEL_ROW_TABLES.includes(t)
  && !LOT_LEVEL_ROW_COLUMNS.some((p) => p.startsWith(`${t}.`)));
ok(measuredTables.every((t) => !(lot.rows[t] || []).length),
   `all ${measuredTables.length} measurement tables are empty`,
   measuredTables.filter((t) => (lot.rows[t] || []).length).join(', '));
ok(measuredTables.includes('handmix_msg'),
   'the hand-mixed check sample counts as a MEASUREMENT here, though the sublot lock treats it as lot-level');

head('the new lot is open, and says where it came from');
ok(lot.status === 'Open', 'status resets to Open (the previous lot was Submitted)');
ok(lot.history.length === 1 && lot.history[0].from_lot === 7,
   'history is replaced by one entry naming the lot it came from');
ok(lot.revision === 0 && !lot.saved_at, 'revision and save stamps reset');
ok(Object.keys(lot.records || {}).length === 0, 'the MEDL per-block records are dropped');

head('refusals');
ok(!rollForwardLot({ ...prev, lot_number: 0 }).ok, 'a lot numbered 0 is refused');
ok(!rollForwardLot({ ...prev, lot_number: 'x' }).ok, 'an unreadable lot number is refused');
ok(!rollForwardLot(null).ok, 'null is refused rather than throwing');
ok(!rollForwardLot({ format: 'something-else' }).ok, 'a non-lot envelope is refused');

head('a rolled lot has the same SHAPE as one straight from an approval');
const fresh = blankLot({ contract_id: 'x', amp_number: 'y', mix_id: 'z', lot_number: 1 }, {});
ok(Object.keys(lot).sort().join() === Object.keys(fresh).sort().join(),
   'same envelope keys as blankLot()');
ok(Object.keys(lot.values).filter((k) => k !== 'design').length === allFields.size,
   'every schema field is present, null where cleared - absent and empty must not look the same',
   `${Object.keys(lot.values).length - 1} vs ${allFields.size}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
