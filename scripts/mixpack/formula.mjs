// A formula evaluator for exactly the 13 shapes the MixPack staging sheets use.
// Anything outside that grammar throws rather than guessing.
const NUM = /^-?\d+(\.\d+)?$/;
// Excel's empty cell: compares equal to "" but reads as 0 in arithmetic.
const EMPTY = Object.freeze({ __empty: true, toString: () => '', valueOf: () => 0 });
const isEmpty = v => v === EMPTY || v === '' || v === null || v === undefined;

function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { let j = i+1, s = ''; while (j < src.length) { if (src[j] === '"' && src[j+1] === '"') { s += '"'; j += 2; } else if (src[j] === '"') break; else s += src[j++]; } t.push({k:'str', v:s}); i = j+1; continue; }
    if ('(),'.includes(c)) { t.push({k:c}); i++; continue; }
    if (c === '=') { t.push({k:'='}); i++; continue; }
    // Sheet!$A$1, 'Sheet Name'!A1, or a bare A1. $ pins are dropped - we only read.
    const m = /^(?:(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_])/.exec(src.slice(i));
    if (m && src[i + m[0].length] !== '(') {
      t.push({k:'ref', sheet:(m[1]||m[2]||null), cell:m[3]+m[4]}); i += m[0].length; continue;
    }
    const fn = /^([A-Z]+)\s*\(/.exec(src.slice(i));
    if (fn) { t.push({k:'fn', v:fn[1]}); i += fn[1].length; continue; }
    const n = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (n) { t.push({k:'num', v:+n[0]}); i += n[0].length; continue; }
    throw new Error('unexpected token at ' + JSON.stringify(src.slice(i, i+24)) + ' in ' + src);
  }
  return t;
}

export function evaluate(formula, lookup) {
  const t = tokenize(formula.replace(/^=/, ''));
  let p = 0;
  const peek = () => t[p], next = () => t[p++];
  function expr() {
    let l = atom();
    if (peek() && peek().k === '=') { next(); const r = atom(); return eqv(l, r); }
    return l;
  }
  function atom() {
    const tok = next();
    if (!tok) throw new Error('unexpected end: ' + formula);
    if (tok.k === 'str') return tok.v;
    if (tok.k === 'num') return tok.v;
    if (tok.k === 'ref') { const v = lookup(tok.sheet, tok.cell); return (v === undefined || v === null || v === '') ? EMPTY : v; }
    if (tok.k === 'fn') {
      if (next().k !== '(') throw new Error('expected ( after ' + tok.v);
      const args = [];
      if (peek() && peek().k !== ')') { args.push(expr()); while (peek() && peek().k === ',') { next(); args.push(expr()); } }
      if (!peek() || next().k !== ')') throw new Error('expected ) in ' + formula);
      return call(tok.v, args);
    }
    if (tok.k === '(') { const v = expr(); if (next().k !== ')') throw new Error('expected )'); return v; }
    throw new Error('unexpected ' + tok.k + ' in ' + formula);
  }
  function eqv(a, b) {
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
      case 'TEXT':    return '__TEXT__';        // only used for NOW(); caller substitutes
      case 'NOW':     return '__NOW__';
      default: throw new Error('unsupported function ' + name);
    }
  }
  let out = expr();
  if (p !== t.length) throw new Error('trailing tokens in ' + formula);
  if (out === EMPTY) out = 0;            // a bare reference to an empty cell reads as 0
  if (out === false) out = '';           // IF with no else branch
  return out;
}
