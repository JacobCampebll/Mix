// A formula evaluator for exactly the shapes the MixPack and AMAW staging
// sheets use. Anything outside that grammar throws rather than guessing - a
// cell that throws is left as a formula for Excel to recompute (the evalOnly
// path), which is always safe; a wrong value banked as a literal is not.
const NUM = /^-?\d+(\.\d+)?$/;
// Excel's empty cell: compares equal to "" but reads as 0 in arithmetic. A
// lookup returns null/undefined for one of those and "" for a cell that really
// holds the empty STRING - a formula that produced "". Excel keeps the two
// apart and so must we: `=A1` is 0 for the first and "" for the second, and
// "" in arithmetic is #VALUE! where a blank is 0.
const EMPTY = Object.freeze({ __empty: true, toString: () => '', valueOf: () => 0 });
const isEmpty = v => v === EMPTY || v === '' || v === null || v === undefined;

const colNum = c => { let n = 0; for (const ch of c) n = n*26 + (ch.charCodeAt(0)-64); return n; };
const colName = n => { let s = ''; while (n > 0) { const r = (n-1)%26; s = String.fromCharCode(65+r)+s; n = (n-r-1)/26; } return s; };

// Sheet!$A$1, 'Sheet Name'!A1, or a bare A1. $ pins are dropped - we only read.
const REF = /^(?:(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_])/;
const REF2 = /^:\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_])/;
// Longest first, so '<>' and '<=' are not read as '<'.
const OPS = ['<>', '<=', '>=', '&', '+', '-', '*', '/', '=', '<', '>'];

function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { let j = i+1, s = ''; while (j < src.length) { if (src[j] === '"' && src[j+1] === '"') { s += '"'; j += 2; } else if (src[j] === '"') break; else s += src[j++]; } t.push({k:'str', v:s}); i = j+1; continue; }
    if ('(),'.includes(c)) { t.push({k:c}); i++; continue; }
    const b = /^(TRUE|FALSE)(?![A-Za-z0-9_])/.exec(src.slice(i));
    if (b) { t.push({k:'bool', v:b[1] === 'TRUE'}); i += b[0].length; continue; }
    const m = REF.exec(src.slice(i));
    if (m && src[i + m[0].length] !== '(') {
      const sheet = m[1] || m[2] || null; i += m[0].length;
      const r2 = REF2.exec(src.slice(i));
      if (r2) { t.push({k:'range', sheet, from:m[3]+m[4], to:r2[1]+r2[2]}); i += r2[0].length; }
      else t.push({k:'ref', sheet, cell:m[3]+m[4]});
      continue;
    }
    const fn = /^([A-Z]+)\s*\(/.exec(src.slice(i));
    if (fn) { t.push({k:'fn', v:fn[1]}); i += fn[1].length; continue; }
    const n = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (n) { t.push({k:'num', v:+n[0]}); i += n[0].length; continue; }
    const op = OPS.find(o => src.startsWith(o, i));
    if (op) { t.push({k:'op', v:op}); i += op.length; continue; }
    throw new Error('unexpected token at ' + JSON.stringify(src.slice(i, i+24)) + ' in ' + src);
  }
  return t;
}

export function evaluate(formula, lookup) {
  const t = tokenize(formula.replace(/^=/, ''));
  let p = 0;
  // Set while the argument of an INDIRECT is being evaluated. Under it an
  // empty operand is refused instead of reading as 0 - see num().
  let strict = false;
  const peek = () => t[p], next = () => t[p++];
  const isOp = (...v) => peek() && peek().k === 'op' && v.includes(peek().v);
  // Excel's precedence: comparison < concatenation < +- < */ < unary minus.
  function expr() {
    let l = cat();
    while (isOp('=', '<>', '<', '<=', '>', '>=')) { const o = next().v; l = cmp(o, l, cat()); }
    return l;
  }
  function cat() { let l = add(); while (isOp('&')) { next(); l = str(l) + str(add()); } return l; }
  function add() { let l = mul(); while (isOp('+', '-')) { const o = next().v; const r = mul(); l = o === '+' ? num(l)+num(r) : num(l)-num(r); } return l; }
  function mul() { let l = unary(); while (isOp('*', '/')) { const o = next().v; const r = unary(); l = o === '*' ? num(l)*num(r) : num(l)/num(r); } return l; }
  function unary() { if (isOp('-')) { next(); return -num(unary()); } if (isOp('+')) { next(); return unary(); } return atom(); }
  function atom() {
    const tok = next();
    if (!tok) throw new Error('unexpected end: ' + formula);
    if (tok.k === 'str' || tok.k === 'num' || tok.k === 'bool') return tok.v;
    if (tok.k === 'ref') return cell(tok.sheet, tok.cell);
    if (tok.k === 'range') return range(tok);
    if (tok.k === 'fn') {
      if (next().k !== '(') throw new Error('expected ( after ' + tok.v);
      // INDIRECT builds a reference out of its argument, so an operand we had
      // to guess at becomes a reference to the wrong cell - silently. Refuse
      // inside its argument what we would tolerate anywhere else.
      const outer = strict; if (tok.v === 'INDIRECT') strict = true;
      const args = [];
      if (peek() && peek().k !== ')') { args.push(expr()); while (peek() && peek().k === ',') { next(); args.push(expr()); } }
      if (!peek() || next().k !== ')') throw new Error('expected ) in ' + formula);
      strict = outer;
      return call(tok.v, args);
    }
    if (tok.k === '(') { const v = expr(); if (next().k !== ')') throw new Error('expected )'); return v; }
    throw new Error('unexpected ' + tok.k + ' in ' + formula);
  }
  function cell(sheet, ref) { const v = lookup(sheet, ref); return (v === undefined || v === null) ? EMPTY : v; }
  // Row-major, so a range is a block rather than a bag of cells - VLOOKUP needs
  // to know which column a value sat in.
  function range(tok) {
    const c1 = colNum(/^([A-Z]+)/.exec(tok.from)[1]), c2 = colNum(/^([A-Z]+)/.exec(tok.to)[1]);
    const r1 = +/(\d+)$/.exec(tok.from)[1], r2 = +/(\d+)$/.exec(tok.to)[1];
    const out = [];
    for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++) {
      const row = [];
      for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++) row.push(cell(tok.sheet, colName(c)+r));
      out.push(row);
    }
    return out;
  }
  // A number for arithmetic. Excel reads a blank cell as 0 here; text is
  // #VALUE!, which we raise as a throw so the cell falls back to Excel rather
  // than banking a guess.
  function num(v) {
    if (Array.isArray(v)) throw new Error('arithmetic on a range in ' + formula);
    if (v === EMPTY) {
      if (strict) throw new Error('INDIRECT index reads an empty cell in ' + formula);
      return 0;
    }
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    if (NUM.test(String(v))) return +v;
    throw new Error('#VALUE! - arithmetic on ' + JSON.stringify(String(v)) + ' in ' + formula);
  }
  function str(v) { return isEmpty(v) ? '' : String(v); }
  function cmp(op, a, b) {
    if (op === '=') return eqv(a, b);
    if (op === '<>') return !eqv(a, b);
    // Excel orders a blank as 0 against a number, and text above any number.
    const an = isEmpty(a) || typeof a === 'number' || NUM.test(String(a));
    const bn = isEmpty(b) || typeof b === 'number' || NUM.test(String(b));
    const [x, y] = an && bn ? [+num(a), +num(b)] : an ? [0, 1] : bn ? [1, 0] : [String(a), String(b)];
    switch (op) { case '<': return x < y; case '<=': return x <= y; case '>': return x > y; default: return x >= y; }
  }
  function eqv(a, b) {
    // Deliberately asymmetric, and it has to stay that way: a blank cell on the
    // left equals "" and 0, but a real 0 on the left does NOT equal a literal
    // "" on the right - which is exactly what IF(x="","",ROUND(x,0)) asks.
    if (isEmpty(a)) return isEmpty(b) || b === 0;
    if (NUM.test(String(a)) && NUM.test(String(b))) return +a === +b;
    return String(a) === String(b);
  }
  function call(name, a) {
    switch (name) {
      case 'IF':      return a[0] ? a[1] : (a.length > 2 ? a[2] : false);
      // A non-numeric argument is #VALUE! in Excel. KYTC's own template hits this
      // (its formula tests "N /A" against a cell holding "N / A") and the resulting
      // #VALUE! uploaded fine - but the discipline's rule is "if not used, 0", so
      // emit that rather than carrying an error into a numeric column.
      case 'ROUND':   { if (isEmpty(a[0])) return 0; const n = +a[0]; if (Number.isNaN(n)) return 0; const f = 10 ** a[1];
                        return Math.sign(n) * Math.round(Math.abs(n) * f + Number.EPSILON * Math.abs(n) * f) / f; }
      case 'LEFT':    return String(a[0]).slice(0, a[1]);
      case 'RIGHT':   return String(a[0]).slice(-a[1]);
      case 'CONCATENATE': return a.map(x => x === '' ? '' : String(x)).join('');
      case 'CHAR':    { const n = num(a[0]); if (!(n >= 1 && n <= 255)) throw new Error('CHAR out of range: ' + n); return String.fromCharCode(n); }
      // Excel's COUNT counts numbers only - text and blanks do not count.
      case 'COUNT':   return a.flat(Infinity).filter(x => typeof x === 'number' || (!isEmpty(x) && typeof x !== 'boolean' && NUM.test(String(x)))).length;
      // AMAW builds 28 references out of one "which sublot" control cell, in two
      // shapes: INDIRECT("G"&'Super Verify'!B5+8) and
      // INDIRECT("'Superpave'!"&CHAR(81+'Super Verify'!B5)&"9"). Both come down
      // to one A1 reference, with or without a sheet prefix, so that is all this
      // resolves - a range, an R1C1 form or anything else throws.
      case 'INDIRECT': {
        if (a.length > 1 && a[1] === false) throw new Error('INDIRECT: R1C1 form is not supported');
        const s = str(a[0]).trim();
        const m = /^(?:(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_. ]*))!)?\$?([A-Z]{1,3})\$?(\d+)$/.exec(s);
        if (!m) throw new Error('INDIRECT: not a single-cell reference: ' + JSON.stringify(s));
        return cell(m[1] || m[2] || null, m[3] + m[4]);
      }
      // Exact match only. AMAW's seven uses are all one lookup - the binder
      // grade, VLOOKUP(Calculations!$D$147,Calculations!$A$147:$B$161,2,FALSE)
      // - and unlike the MixPack's VLOOKUPs, which sit on the visible tabs
      // where evalOnly can supply their answer, these are ON the staging
      // sheets: decline them and the payload loses its binder grade on all
      // seven test records. An approximate match (TRUE, or the argument
      // omitted) is a different algorithm and is not implemented, so it throws.
      case 'VLOOKUP': {
        const [key, tbl, col, exact] = a;
        if (!Array.isArray(tbl) || !Array.isArray(tbl[0])) throw new Error('VLOOKUP: second argument is not a range');
        if (exact !== false) throw new Error('VLOOKUP: only the exact-match form is supported');
        if (!(col >= 1 && col <= tbl[0].length)) throw new Error('VLOOKUP: column ' + col + ' is outside the range');
        const hit = tbl.find(row => eqv(row[0], key));
        if (!hit) throw new Error('VLOOKUP: no match for ' + JSON.stringify(String(key)));
        return hit[col - 1];
      }
      case 'TEXT':    return '__TEXT__';        // only used for NOW(); caller substitutes
      case 'NOW':     return '__NOW__';
      default: throw new Error('unsupported function ' + name);
    }
  }
  let out = expr();
  if (p !== t.length) throw new Error('trailing tokens in ' + formula);
  if (out === EMPTY) out = 0;            // a bare reference to an empty cell reads as 0
  if (out === false) out = '';           // IF with no else branch
  if (Array.isArray(out)) throw new Error('a range is not a value in ' + formula);
  return out;
}
