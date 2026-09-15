#!/usr/bin/env node
// Does the LOT PAY READOUT actually say what the lot pays?
//
//   node scripts/amaw/check_payview.mjs path/to/lot1.xlsm path/to/lot2.xlsm
//
// payview.mjs does no arithmetic - check_pay.mjs is what proves the numbers,
// 127/127 cells against these same two workbooks. What can still go wrong here
// is a presentation bug that loses money: a figure formatted to the wrong
// precision, a sign dropped, an MCL rendered as a zero, a partial lot rendered
// as a 100%. So this renders five lots and asserts the headline figures are
// present in the HTML, then prints the readout as text so a person can read
// what a contractor would see.
//
// The five: both real lots (contract 252112, AMAW 13.3), a partial lot
// truncated to two sublots, a lot driven to MCL, and an empty one.
//
// The workbook reader below is a copy of check_pay.mjs's. That file is a CLI
// whose top level runs on import - it cannot be imported for its reader
// without also running its own checks - and it is the ground truth for the
// port, so it is left exactly as it is rather than refactored to suit this.
import { execFileSync } from 'child_process';
import { lotPay, MCL } from './pay.mjs';
import { payViewHTML, payExplainHTML, payWarnings, payHeadline } from './payview.mjs';

// ---------------------------------------------------------------------------
// A minimal xlsx reader: sheet name -> Map(ref -> cached value)
// ---------------------------------------------------------------------------
function openWorkbook(file) {
  const part = (p) => {
    try { return execFileSync('unzip', ['-p', file, p], { maxBuffer: 1 << 28 }).toString('utf8'); }
    catch { return null; }
  };
  const rels = {};
  for (const m of part('xl/_rels/workbook.xml.rels').matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, '');
  }
  const sheetPath = {};
  for (const m of part('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g)) {
    sheetPath[unesc(m[1])] = 'xl/' + rels[m[2]];
  }
  const ssXml = part('xl/sharedStrings.xml') || '';
  const shared = [...ssXml.matchAll(/<si>((?:(?!<\/si>)[\s\S])*)<\/si>/g)]
    .map((m) => unesc(m[1].replace(/<[^>]*>/g, '')));
  const cache = new Map();
  return function cells(name) {
    if (cache.has(name)) return cache.get(name);
    const out = new Map();
    const xml = sheetPath[name] ? part(sheetPath[name]) : null;
    if (xml) {
      // Cell-bounded: a greedy <v>...</v> runs past </c> on these sheets.
      for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>((?:(?!<\/c>)[\s\S])*)<\/c>)/g)) {
        const attrs = c[2] || '', body = c[3] || '';
        const v = /<v>([^<]*)<\/v>/.exec(body);
        if (!v) continue;
        out.set(c[1], /t="s"/.test(attrs) ? shared[+v[1]] : unesc(v[1]));
      }
    }
    cache.set(name, out);
    return out;
  };
}
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

const num = (map, ref) => {
  const raw = map.get(ref);
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const LANE_ROWS = [[10, 11, 12, 13], [15, 16, 17, 18], [20, 21, 22, 23], [25, 26, 27, 28]];
const JOINT_ROWS = [[33, 34], [36, 37], [39, 40], [42, 43]];

// Everything lotPay needs, plus the context payview.mjs wants for its sentence.
function readLot(file) {
  const cells = openWorkbook(file);
  const PV = cells('Pay Values'), C = cells('Calculations'), CO = cells('Cores');
  return {
    sublots: [13, 14, 15, 16].map((r) => ({
      jmfAC: num(PV, 'A' + r), ac: num(PV, 'B' + r),
      targetAV: num(PV, 'E' + r), av: num(PV, 'F' + r),
      minVMA: num(PV, 'H' + r), vma: num(PV, 'I' + r),
    })),
    laneCores: LANE_ROWS.map((rows) => rows.map((r) => num(CO, 'I' + r)).filter((v) => v !== null)),
    jointCores: JOINT_ROWS.map((rows) => rows.map((r) => num(CO, 'I' + r)).filter((v) => v !== null)),
    mixTypeCode: num(C, 'J1'),
    esalClass: num(C, 'D15'),
    jointDensityFlag: num(C, 'H11'),
    densityOption: num(C, 'H12'),
    acceptanceOption: num(C, 'H13'),
    lotNumber: num(PV, 'F3'),
    tonnage: num(PV, 'F4'),
    unitPrice: num(PV, 'F5'),
    wedgeTons: num(PV, 'J20') ?? 0,
  };
}

// ---------------------------------------------------------------------------
// HTML -> the text a person would see, for both the assertions and the print.
// ---------------------------------------------------------------------------
function toText(html) {
  return html
    // A .prsub under a value is a second line on screen, so it has to become
    // one here too - otherwise "100" and "dev -0.22" run together and the
    // printout misrepresents what a person actually sees.
    .replace(/<(div|span)\b[^>]*class="[^"]*\bprsub\b[^"]*"[^>]*>/g, ' · ')
    .replace(/<\/(tr|div|li|table|ul)>/g, '\n')
    .replace(/<\/(th|td)>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .split('\n').map((l) => l.replace(/[ \t]+$/, '').replace(/^\s+/, '')).filter((l) => l.trim())
    .join('\n');
}

// A currency symbol is decoration between the sign and the figure, so
// "-$4,125.00" is the rendered form of "-4,125". The normaliser drops it so
// the assertion can be written the way a person says the number out loud.
const norm = (s) => s.replace(/\$/g, '');

const fails = [];
function shows(where, text, needle) {
  const ok = norm(text).includes(norm(needle));
  if (!ok) fails.push(`${where}: expected to see "${needle}"`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  shows ${JSON.stringify(needle)}`);
  return ok;
}
function refutes(where, text, needle) {
  const ok = !norm(text).includes(norm(needle));
  if (!ok) fails.push(`${where}: must NOT show "${needle}"`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  does not show ${JSON.stringify(needle)}`);
  return ok;
}

function render(name, input, extra = {}) {
  const result = lotPay(input);
  const ctx = { label: name, ...input, ...extra };
  const html = payViewHTML(result, ctx);
  const text = toText(html);
  const warns = payWarnings(result, ctx);
  return { result, html, text, warns, head: payHeadline(result, ctx) };
}

function print(name, r) {
  console.log(`\n${'-'.repeat(72)}\n${name}\n${'-'.repeat(72)}`);
  console.log(r.text);
  console.log(`\n  rail warnings (${r.warns.length}), all kind="${[...new Set(r.warns.map((w) => w.kind))].join(',') || '-'}":`);
  r.warns.forEach((w) => console.log(`    · ${w.text}`));
}

// ---------------------------------------------------------------------------
const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('usage: check_payview.mjs <lot1.xlsm> <lot2.xlsm>');
  process.exit(2);
}

// ---- the two real lots, with the figures the workbooks themselves carry ----
const EXPECT = [
  { pct: '97.9375%', tons: '-82.5', money: '-4,125', word: 'Penalty' },
  { pct: '100.65625%', tons: '+26.25', money: '+1,312.50', word: 'Bonus' },
];

const real = files.slice(0, 2).map((f, i) => {
  const input = readLot(f);
  const r = render(`Lot ${input.lotNumber}`, input);
  print(`REAL LOT ${i + 1} — ${f}`, r);
  console.log('');
  shows(`lot ${i + 1}`, r.text, EXPECT[i].pct);
  shows(`lot ${i + 1}`, r.text, EXPECT[i].tons);
  shows(`lot ${i + 1}`, r.text, EXPECT[i].money);
  shows(`lot ${i + 1}`, r.text, EXPECT[i].word);
  // Every rail warning about a computed penalty or bonus must be non-blocking.
  const bad = r.warns.filter((w) => w.kind !== 'warn');
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '}  every rail warning is kind="warn" (${r.warns.length} item(s))`);
  if (bad.length) fails.push(`lot ${i + 1}: ${bad.length} warning(s) are not kind="warn"`);
  // The shape the page consumes.
  const shapeOK = r.warns.every((w) => w.id && w.label && w.kind && typeof w.text === 'string');
  console.log(`  ${shapeOK ? 'ok  ' : 'FAIL'}  every warning is { id, label, kind, text }`);
  if (!shapeOK) fails.push(`lot ${i + 1}: a warning is missing a field`);
  return { input, r };
});

// ---- a partial lot: two sublots of four ----
{
  const base = real[0].input;
  const input = {
    ...base,
    sublots: base.sublots.slice(0, 2),
    laneCores: base.laneCores.slice(0, 2),
    jointCores: base.jointCores.slice(0, 2),
  };
  const r = render('Partial lot', input);
  print('PARTIAL LOT — the first two sublots of lot 1', r);
  console.log('');
  shows('partial', r.text, '2 sublots');
  // It has a real answer, not a blank and not a 100 - a part-filled AMAW is
  // normal, not an error state.
  const ok = Number.isFinite(r.result.finalPct);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  a real final pay value (${r.result.finalPct})`);
  if (!ok) fails.push('partial: no final pay value on a two-sublot lot');
}

// ---- one sublot, and three ----
{
  const base = real[0].input;
  for (const n of [1, 3]) {
    const input = {
      ...base,
      sublots: base.sublots.slice(0, n),
      laneCores: base.laneCores.slice(0, n),
      jointCores: base.jointCores.slice(0, n),
    };
    let r;
    try { r = render(`${n}-sublot lot`, input); }
    catch (e) { console.log(`\n  FAIL  ${n} sublot(s): threw ${e.message}`); fails.push(`${n} sublot(s) threw`); continue; }
    console.log(`\n  ok    ${n} sublot(s): ${r.head.word} · ${toText(r.html).split('\n')[0]} · `
      + `final ${r.result.finalPct} · ${r.warns.length} warning(s)`);
  }
}

// ---- an MCL lot ----
// Air voids of 7.5 are past the ESAL Class 3 upper edge (> 6.0), so that
// sublot is MCL and the lot average carries it. Lot 2 on purpose: the
// sublot-1 allowance only ever applies to lot 1, and it would forgive this.
{
  const base = real[1].input;
  const sublots = base.sublots.map((s, i) => (i === 1 ? { ...s, av: 7.5 } : s));
  const r = render('MCL lot', { ...base, sublots });
  print('MCL LOT — sublot 2 at 7.5% air voids, ESAL Class 3', r);
  console.log('');
  shows('MCL', r.text, 'MCL');
  refutes('MCL', r.text, 'Penalty');
  const ok = r.result.finalPct === null && r.head.state === 'warn';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  no final pay value, and the state is "warn" not "bad" (${r.head.state})`);
  if (!ok) fails.push('MCL: rendered as something other than the MCL state');
  // The one thing that must never happen: MCL becoming a number.
  const zeroed = /Final pay value\s*\t*\s*0(\D|$)/.test(r.text);
  console.log(`  ${zeroed ? 'FAIL' : 'ok  '}  MCL is not rendered as a 0`);
  if (zeroed) fails.push('MCL: rendered as 0');
}

// ---- an empty lot ----
// Lot 2 again: on lot 1 the first sublot's densities are 100 whether or not
// anybody cored it, which would make an empty lot look half-tested.
{
  const base = real[1].input;
  const r = render('Empty lot', {
    ...base, sublots: [], laneCores: [[], [], [], []], jointCores: [[], [], [], []],
  });
  print('EMPTY LOT — nothing tested yet', r);
  console.log('');
  const ok = r.result.finalPct === null;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  no final pay value`);
  if (!ok) fails.push('empty: invented a final pay value');
  shows('empty', r.text, 'no pay value');
  refutes('empty', r.text, 'Penalty');
  refutes('empty', r.text, 'Bonus');
  // "never a 0 or a 100": neither may appear as the headline figure.
  const headline = r.text.split('\n').slice(0, 8).join('\n');
  const faked = /Final pay value\s*\t*\s*(0|100)%/.test(headline);
  console.log(`  ${faked ? 'FAIL' : 'ok  '}  the headline is not a 0% or a 100%`);
  if (faked) fails.push('empty: headline shows a fabricated 0% or 100%');
}

// ---- escaping ----
// A lot number, a plant name, a note - all of it reaches innerHTML, and a lot
// has been through somebody else's browser by the time a reviewer opens it.
// The lot number is the context value the readout actually prints, so that is
// what gets the hostile string.
{
  const base = real[0].input;
  const hostile = '<img src=x onerror=alert(1)>';
  const r = render('escaping', base, { lotNumber: hostile });
  // Only the raw angle bracket is the leak. "onerror=" survives escaping as
  // ordinary text and is harmless there, so testing for it would fail on a
  // correctly escaped string.
  const leaked = /<img\b/.test(r.html);
  const escaped = r.html.includes('&lt;img src=x onerror=alert(1)&gt;');
  console.log(`\n  ${leaked ? 'FAIL' : 'ok  '}  a hostile lot number is escaped, not interpolated`);
  console.log(`  ${escaped ? 'ok  ' : 'FAIL'}  and it is still shown, escaped, rather than dropped`);
  if (leaked) fails.push('escaping: a hostile lot number reached the HTML raw');
  if (!escaped) fails.push('escaping: a hostile lot number was dropped instead of escaped');
  // Warnings are data, not HTML: the page escapes an `outstanding` item's text
  // on the way into the rail, the same as every other one. Prove they are NOT
  // pre-escaped here, or the rail would double-escape them.
  const pre = r.warns.some((x) => /&lt;|&amp;/.test(x.text));
  console.log(`  ${pre ? 'FAIL' : 'ok  '}  warning text is plain data, not pre-escaped (the rail escapes it)`);
  if (pre) fails.push('escaping: warning text is pre-escaped and would double-escape in the rail');
}

// ---------------------------------------------------------------------------
// The layered readout - payExplainHTML()
// ---------------------------------------------------------------------------
//
// Layers 1 and 2 must say what lotPay() decided, in the schedule's words; the
// third layer must print the weighings it is handed and not be offered when
// it is handed none. Rendered off real lot 1 with a synthetic trace, because
// a completed AMAW carries the weighings only in cells this reader does not
// read - the figures here are checked for being PRINTED, not for being the
// lot's (check_volumetrics.mjs is what checks the arithmetic behind them).
{
  console.log(`\n${'-'.repeat(72)}\nLayered readout (payExplainHTML) on real lot 1`);
  const base = real[0].input;
  const result = lotPay(base);
  const spec = (k) => ({ air: 4785.2 + k, water: 2771.4, ssd: 4793.6, volume: 2022.2, bsg: 2.366 });
  const det = (k) => ({ mix: 2000 + k, calibration: 7400, finalWeight: 8590, absorbedWater: 0, msg: 2.469 });
  const trace = {
    handmix: { binderPct: 5.9, gmm: 2.4809, gse: 2.7212, dets: [det(0), det(10)] },
    sublots: base.sublots.map((sub, i) => ({
      specimens: [spec(0), spec(5)], dets: [det(0), det(5)], gmb: 2.366, gmm: 2.469, gse: 2.7212,
      moisture: { before: 1500, after: 1492, pan: 300, pct: 0.6667 },
      backCalc: 6.2, binderPct: sub.ac, gsb: 2.66, va: sub.av, vma: sub.vma, absorbedAC: 0.5, pbe: sub.ac - 0.5,
    })),
    lane: base.laneCores.map((cores, i) => cores.map((pct, k) => ({ id: `${base.lotNumber}-${i + 1}-${'ABCD'[k]}`, air: 1250, water: 720, ssd: 1255, bsg: 2.336, density: 145.8, msg: 2.469, pctSolid: pct }))),
    joint: base.jointCores.map((cores, i) => cores.map((pct, k) => ({ id: `${base.lotNumber}-${i + 1}-J${k + 1}`, air: 1250, water: 690, ssd: 1255, bsg: 2.212, density: 138.0, msg: 2.469, pctSolid: pct }))),
  };
  const open = ['prop.av', 'sub.av.1', 'prop.laneDensity', 'core.laneDensity.1', 'final', 'money'];
  const html = payExplainHTML(result, { ...base, trace, open });
  const text = toText(html);
  const W = 'layered';
  // layer 1: every property line, with its cell
  for (const cell of ["'Pay Values'!B21", "'Pay Values'!B22", "'Pay Values'!D17", "'Pay Values'!G17", "'Pay Values'!K17", "'Pay Values'!J21", "'Pay Values'!J23", "'Pay Values'!J24"]) shows(W, text, cell);
  // layer 2: the band each sublot's air void landed on, in the schedule's words, and the roll-up
  const av1 = result.perSublot[0].av;
  shows(W, text, av1.bands.map((b) => b.band).join(''));
  shows(W, text, `average(${result.perSublot.map((x) => x.av.pay).join(', ')}) = ${result.byProperty.av.value}`);
  shows(W, text, `${result.byProperty.av.value} x ${result.weights.av}% = `);
  // the final line writes the weighted sum out in full
  shows(W, text, `x ${result.weights.laneDensity}% + `);
  shows(W, text, `= ${result.finalPct}`);
  shows(W, text, "'Pay Values'!F5");           // the $50 is explained where the dollars are
  // layer 3: the weighings, the formula and the cell
  shows(W, text, '4785.2 g in air / (4793.6 SSD - 2771.4 in water = 2022.2) = 2.366');
  shows(W, text, '2000.0 g mix / (2000.0 + 7400.0 calibration - 8590.0 final + 0.0 absorbed) = 2.469');
  shows(W, text, '(2.469 - 2.366) / 2.469 x 100 = ');
  shows(W, text, '1.03 x (2.7212 - 2.469)'.replace('2.7212', '2.721'));
  shows(W, text, '((1500.0 - 300.0) - (1492.0 - 300.0)) / (1500.0 - 300.0) x 100 = 0.67%');
  shows(W, text, '1250.0 g in air / (1255.0 SSD - 720.0 in water) = 2.336');
  shows(W, text, '145.8 / (2.469 sublot Gmm x 62.4) x 100 = ');
  shows(W, text, `${base.lotNumber}-2-A`);      // a core is named by its own id
  // open state is honoured, and nothing else is open
  const opened = [...html.matchAll(/<details class="payx-d[^"]*" data-key="([^"]+)" open>/g)].map((m) => m[1]).sort();
  const wantOpen = open.slice().sort();
  const openOK = JSON.stringify(opened) === JSON.stringify(wantOpen);
  console.log(`  ${openOK ? 'ok  ' : 'FAIL'}  exactly the requested panels render open (${opened.join(', ')})`);
  if (!openOK) fails.push(`${W}: open panels were ${opened.join(',')} not ${wantOpen.join(',')}`);
  // no trace -> no third layer is offered, and layers 1-2 are unchanged
  // (A density sublot still opens - its nested layer is the per-core band,
  // which lotPay() knows without any weighing; only the volumetric sublots'
  // third layer is weighings alone.)
  const bare = payExplainHTML(result, { ...base });
  const bareSubs = (bare.match(/class="payx-d payx-sub" data-key="sub\./g) || []).length;
  const bareCores = (bare.match(/class="payx-d payx-sub" data-key="core\./g) || []).length;
  console.log(`  ${bareSubs === 0 ? 'ok  ' : 'FAIL'}  without a trace no volumetric sublot offers a third layer (${bareSubs} did)`);
  console.log(`  ${bareCores > 0 ? 'ok  ' : 'FAIL'}  but a density sublot still opens to its per-core bands (${bareCores} do)`);
  if (bareSubs) fails.push(`${W}: ${bareSubs} sublot(s) offered figures with no trace to show`);
  if (!bareCores) fails.push(`${W}: density sublots lost their per-core layer without a trace`);
  shows(W, toText(bare), `% solid -> rounded ${result.laneDetail.cores[1][0].rounded} -> `);
  shows(W, toText(bare), `average(${result.perSublot.map((x) => x.av.pay).join(', ')}) = ${result.byProperty.av.value}`);
  // escaping: a hostile core id is data
  const hostile = '<img src=x onerror=alert(1)>';
  const evil = { ...trace, lane: trace.lane.map((cs) => cs.map((c) => ({ ...c, id: hostile }))) };
  const h2 = payExplainHTML(result, { ...base, trace: evil, open: ['prop.laneDensity', 'core.laneDensity.1'] });
  const leaked = /<img\b/.test(h2), escaped = h2.includes('&lt;img src=x onerror=alert(1)&gt;');
  console.log(`  ${leaked ? 'FAIL' : 'ok  '}  a hostile core id is escaped, not interpolated`);
  console.log(`  ${escaped ? 'ok  ' : 'FAIL'}  and still shown, escaped`);
  if (leaked) fails.push(`${W}: a hostile core id reached the HTML raw`);
  if (!escaped) fails.push(`${W}: a hostile core id was dropped instead of escaped`);
  // MCL stays text in every layer
  const mclRes = lotPay({ ...base, sublots: base.sublots.map((x, i) => (i === 1 ? { ...x, av: 7.5 } : x)) });
  const mclText = toText(payExplainHTML(mclRes, { ...base, trace, open: ['prop.av', 'final'] }));
  shows(W, mclText, '< 2.0 or > 6.0 (Class 3-4)');
  shows(W, mclText, 'a sublot is MCL, so the lot value is MCL');
  shows(W, mclText, 'MCL x 25%');
  if (process.argv.includes('--print')) console.log('\n' + text);
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(72)}`);
if (fails.length) {
  console.log(`${fails.length} FAILURE(S):`);
  fails.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}
console.log('All readout assertions passed.');
