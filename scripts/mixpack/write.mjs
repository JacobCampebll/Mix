// Writes values into a MixPack and fills its SiteManager staging sheets.
//
// Two constraints shape this. The workbook must survive intact - vbaProject.bin,
// xmlMaps.xml and the XML-typed ListObjects are what make it loadable at all, and
// no xlsx library can even open these files - so edits are made at the zip level,
// rewriting only the worksheet parts we touch. And no writer recalculates, so
// after setting the inputs we evaluate every staging formula ourselves and bank
// the result as a literal.
import fs from 'fs';
import { execSync } from 'child_process';
import { cellsOf, sheetXml, sharedStrings, STAGING, SOURCE, colNum, rowNum } from './xlsx.mjs';
import { evaluate } from './formula.mjs';

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const NUMRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
// Deliberately type-driven, not shape-driven: a JS string stays text even when
// it looks numeric. Mix ids like "00260467" carry the district in their leading
// zeros, and writing them as <v> silently destroys that.
const isNum = v => typeof v === 'number';

/**
 * Replace one cell in a worksheet's XML, keeping its style so the sheet still
 * reads like a MixPack. A formula on that cell is dropped: we are writing the
 * answer, and a stale <f> would be recalculated by Excel on open and could
 * overwrite it.
 */
export function setCell(xml, ref, value) {
  const re = new RegExp(`<c r="${ref}"((?:\\s+[a-zA-Z:]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  const style = m ? /\ss="(\d+)"/.exec(m[1])?.[1] : undefined;
  const s = style !== undefined ? ` s="${style}"` : '';
  const cell = value === '' || value === null || value === undefined
    ? `<c r="${ref}"${s}/>`
    : isNum(value)
      ? `<c r="${ref}"${s}><v>${+value}</v></c>`
      : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  if (m) return xml.replace(re, cell);
  return insertCell(xml, ref, cell);
}

// The cell isn't in the sheet yet - splice it into its row in column order,
// creating the row if the sheet has never had one.
function insertCell(xml, ref, cell) {
  const r = rowNum(ref), c = colNum(ref);
  const rowRe = new RegExp(`<row[^>]*\\sr="${r}"[^>]*(?:/>|>[\\s\\S]*?</row>)`);
  const rm = rowRe.exec(xml);
  if (!rm) {
    const row = `<row r="${r}">${cell}</row>`;
    const after = [...xml.matchAll(/<row[^>]*\sr="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)]
      .filter(m => +m[1] < r).pop();
    if (after) return xml.slice(0, after.index + after[0].length) + row + xml.slice(after.index + after[0].length);
    return xml.replace(/(<sheetData[^>]*>)/, `$1${row}`);
  }
  let rowXml = rm[0];
  if (/\/>$/.test(rowXml)) rowXml = rowXml.replace(/\/>$/, `>${cell}</row>`);
  else {
    const cells = [...rowXml.matchAll(/<c r="([A-Z]+\d+)"(?:[^>]*)(?:\/>|>[\s\S]*?<\/c>)/g)];
    const before = cells.filter(m => colNum(m[1]) < c).pop();
    rowXml = before
      ? rowXml.slice(0, before.index + before[0].length) + cell + rowXml.slice(before.index + before[0].length)
      : rowXml.replace(/(<row[^>]*>)/, `$1${cell}`);
  }
  return xml.replace(rowRe, rowXml);
}

/**
 * @param {object} opts
 * @param {string} opts.template  path to the blank KYTC .xlsm
 * @param {object} opts.values    { "Design Data!K10": "Madison", ... }
 * @param {Date}   opts.now       stamp for TEXT(NOW(),...) in the remarks id
 * @returns {Map<string,string>}  worksheet part path -> new XML
 */
export function fillWorkbook({ template, values, now = new Date() }) {
  const SST = sharedStrings(template);
  const sheetsByName = { ...SOURCE, ...STAGING };
  const xml = new Map();          // sheet name -> current XML
  const cells = new Map();        // sheet name -> parsed cells
  const read = name => {
    if (!xml.has(name)) {
      const n = sheetsByName[name];
      if (n === undefined) return null;
      xml.set(name, sheetXml(template, n));
      cells.set(name, cellsOf(xml.get(name), SST));
    }
    return name;
  };

  // 1. the inputs
  const overrides = new Map();
  for (const [k, v] of Object.entries(values)) {
    const [sheet, ref] = k.split('!');
    if (!read(sheet)) throw new Error('unknown sheet: ' + sheet);
    xml.set(sheet, setCell(xml.get(sheet), ref, v));
    overrides.set(k, v);
  }

  // 2. resolve a cell: an override wins, then the template's own cached value
  const valueOf = (sheet, ref) => {
    const k = `${sheet}!${ref}`;
    if (overrides.has(k)) { const v = overrides.get(k); return v === null || v === undefined ? '' : v; }
    if (!read(sheet)) return '';
    const c = cells.get(sheet).get(ref);
    if (!c || c.v == null) return '';
    return (c.t === 's' || c.t === 'str' || c.t === 'inlineStr') ? c.v : (NUMRE.test(c.v) ? +c.v : c.v);
  };

  // 3. the staging sheets, evaluated and banked as literals
  const stamp = now.toISOString().slice(0,10).replace(/-/g,'') +
                String(now.getUTCHours()).padStart(2,'0') +
                String(now.getUTCMinutes()).padStart(2,'0') +
                String(now.getUTCSeconds()).padStart(2,'0');
  const report = { written: 0, failed: [], passes: 0, stamp };
  const todo = [];
  for (const name of Object.keys(STAGING)) {
    read(name);
    for (const [ref, c] of cells.get(name))
      if (rowNum(ref) >= 8 && c.f) todo.push({ name, ref, f: c.f.replace(/TEXT\(NOW\(\)[^)]*\)/g, JSON.stringify(stamp)) });
  }

  // Staging cells reference each other (t_smpl reads t_rmks_dtl; several
  // t_bit_conc_mixblnd columns gate on their own row), and document order is not
  // dependency order. Iterate to a fixed point rather than trying to sort.
  const results = new Map();
  for (let pass = 1; pass <= 8; pass++) {
    let changed = 0;
    report.passes = pass;
    for (const t of todo) {
      let out;
      try { out = evaluate(t.f, (sh, cell) => valueOf(sh || t.name, cell)); }
      catch (e) { if (pass === 1) report.failed.push([`${t.name}!${t.ref}`, t.f, e.message]); continue; }
      const k = `${t.name}!${t.ref}`;
      if (!results.has(k) || results.get(k) !== out) { changed++; results.set(k, out); overrides.set(k, out); }
    }
    if (!changed) break;
  }
  for (const [k, out] of results) {
    const [name, ref] = k.split('!');
    xml.set(name, setCell(xml.get(name), ref, out));
    report.written++;
  }

  const parts = new Map();
  for (const [name, x] of xml) parts.set(`xl/worksheets/sheet${sheetsByName[name]}.xml`, x);
  return { parts, report };
}

/**
 * Repack a template with replaced worksheet parts. Node-side; the browser does
 * the same thing with JSZip. Every part we did not touch is copied through
 * byte-identical, which is the point - vbaProject.bin, xmlMaps.xml, the
 * ListObject definitions and the activeX blobs all have to survive.
 */
export function packWorkbook({ template, parts, out, tmp }) {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execSync(`cd ${tmp} && unzip -q -o ${JSON.stringify(fs.realpathSync(template))}`);
  for (const [p, xml] of parts) fs.writeFileSync(`${tmp}/${p}`, xml);
  fs.rmSync(out, { force: true });
  const abs = JSON.stringify(out.startsWith('/') ? out : `${process.cwd()}/${out}`);
  // -D drops directory entries (a real .xlsm has none) and [Content_Types].xml
  // goes in first, which is what OOXML readers expect to find.
  execSync(`cd ${tmp} && zip -q -X -D ${abs} '[Content_Types].xml' && ` +
           `zip -q -X -D -r ${abs} . -x '[Content_Types].xml' -x '.*'`);
  return out;
}
