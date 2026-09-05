// Minimal xlsx reader/writer pieces the MixPack generator needs.
// Shared formulas are expanded, because 1281 of the staging cells use them.
import { execSync } from 'child_process';

const dec = s => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
                  .replace(/&apos;/g,"'").replace(/&amp;/g,'&');

export const colNum = ref => { const c=/^([A-Z]+)/.exec(ref)[1]; let n=0; for(const ch of c) n=n*26+(ch.charCodeAt(0)-64); return n; };
export const rowNum = ref => +/(\d+)$/.exec(ref)[1];
export const colName = n => { let s=''; while(n>0){const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=(n-r-1)/26;} return s; };

// Shift every relative reference in a formula by (dc, dr). $ pins stay put.
export function translate(formula, dc, dr) {
  return formula.replace(/(\$?)([A-Z]{1,3})(\$?)(\d{1,7})\b/g, (m, dollarC, col, dollarR, row, off, str) => {
    // Don't touch anything that is part of a longer identifier (e.g. LOG10)
    const prev = str[off-1];
    if (prev && /[A-Za-z0-9_]/.test(prev) && prev !== '!' ) return m;
    const c = dollarC ? col : colName(colNum(col + '1') + dc);
    const r = dollarR ? row : String(+row + dr);
    return `${dollarC}${c}${dollarR}${r}`;
  });
}

export function sharedStrings(xlsm) {
  let xml;
  try { xml = execSync(`unzip -p ${xlsm} xl/sharedStrings.xml`, {maxBuffer:1<<28}).toString(); }
  catch { return []; }
  const out = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g))
    out.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => dec(x[1])).join(''));
  return out;
}

// `sst` is the shared-string table; without it a t="s" cell reads back as its index.
export function cellsOf(xml, sst) {
  const out = new Map();
  const shared = new Map();                       // si -> {formula, ref}
  const re = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1], body = m[2] || '';
    const r = /r="([A-Z]+\d+)"/.exec(attrs); if (!r) continue;
    const ref = r[1];
    const t = /t="([^"]+)"/.exec(attrs)?.[1];
    const s = /\ss="(\d+)"/.exec(attrs)?.[1];
    const v = /<v>([\s\S]*?)<\/v>/.exec(body);
    const fm = /<f\s*([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(body);
    let f = null, si = null;
    if (fm) {
      const fAttrs = fm[1] || '', text = fm[2];
      si = /si="(\d+)"/.exec(fAttrs)?.[1] ?? null;
      const isShared = /t="shared"/.test(fAttrs);
      if (text != null && text !== '') {
        f = dec(text);
        if (isShared && si != null) shared.set(si, { formula: f, anchor: ref });
      } else if (isShared && si != null) {
        f = { __si: si, ref };                    // resolve in a second pass
      }
    }
    let val = v ? dec(v[1]) : null;
    if (t === 's' && val != null) val = sst ? (sst[+val] ?? null) : null;
    else if (t === 'inlineStr') val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => dec(x[1])).join('');
    out.set(ref, { f, v: val, t, s, raw: v ? dec(v[1]) : null });
  }
  // second pass: expand shared-formula instances
  for (const [ref, c] of out) {
    if (c.f && typeof c.f === 'object') {
      const master = shared.get(c.f.__si);
      if (!master) { c.f = null; continue; }
      c.f = translate(master.formula,
                      colNum(ref) - colNum(master.anchor),
                      rowNum(ref) - rowNum(master.anchor));
    }
  }
  return out;
}

export const sheetXml = (xlsm, n) =>
  execSync(`unzip -p ${xlsm} xl/worksheets/sheet${n}.xml`, {maxBuffer:1<<28}).toString();

export const STAGING = {t_smpl:17, t_cont_smpl:18, t_rmks_dtl:19, t_smpl_tst:20, t_smpl_tstr:21,
                        t_tst_rslt_hdr:22, t_tst_rslt_dtl:23, t_superpave:24, t_bit_conc_mixblnd:25,
                        discipline:15};

// First data row per staging sheet. The t_* sheets carry a seven-row header
// block (SM Table, SM Column, Logical Validation, Comment, Long Description,
// Column Name); `discipline` has one header row and its data on row 2.
export const FIRST_DATA_ROW = name => name === 'discipline' ? 2 : 8;
export const SOURCE = {'Design Data':1, 'Recycle Data':4, 'Project Items':5, '1-Pt. Check':6,
                       'Graphs':7, 'TSR':8, 'Performance Specimens':9, 'KYCT Data':10,
                       'Hamburg Data':11, 'Chart Data':13, 'Workbook Edits':14};
