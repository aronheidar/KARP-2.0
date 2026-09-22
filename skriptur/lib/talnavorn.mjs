// talnavorn.mjs — hver tala í vélskrifaðri frétt verður að finnast í staðreyndunum (facts).
//
// AF HVERJU (22.9.2026): fréttavélin fær lengri texta með bakgrunni úr gögnum Karp. Meiri texti eykur hættuna á
// uppspuna. Reglan „aðeins úr facts" í fyrirmælunum er ósk; þessi athugun er tryggingin. Fréttin fellur ef tala
// í titli eða texta á sér ekki stoð í facts, að teknu tilliti til námundunar og eininga.

const RE_NUMER = /\d+(?:[/-]\d+)+/g;                             // 28/2026 · 649909-2026 · 80/400 · 2026-09-21
const RE_TALA = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;   // 1.024.188.084 · 17,7 · 42

function margfaldari(eftir) {
  const s = eftir.toLowerCase();
  if (/^\s*(milljar[ðd]|milljör[ðd])/.test(s) || /^\s*m[aö]\.\s?kr/.test(s)) return 1e9;
  if (/^\s*millj[óo]n/.test(s) || /^\s*m\.\s?kr/.test(s)) return 1e6;
  if (/^\s*(þúsund|þús\.|þ\.\s?kr)/.test(s)) return 1e3;
  return 1;
}
const erHlutfall = (eftir) => /^\s*(%|prósent)/i.test(eftir);
const stadlaStrik = (s) => String(s).replace(/[‐‑‒–—]/g, '-');
const hreinsa = (s) => s.replace(/[.,:;!?\'"»«]/g, '');

/** Tölur í texta: { hratt, tegund: 'numer'|'tala'|'hlutfall', gildi?, nakvaemni? } */
export function talnaTokar(texti) {
  const s = stadlaStrik(texti || '');
  const tokar = [], numerSvid = [];
  for (const m of s.matchAll(RE_NUMER)) { tokar.push({ hratt: m[0], tegund: 'numer' }); numerSvid.push([m.index, m.index + m[0].length]); }
  for (const m of s.matchAll(RE_TALA)) {
    const a = m.index, b = a + m[0].length;
    if (numerSvid.some(([x, y]) => a >= x && b <= y)) continue;   // hluti af númeri, þegar talið
    const [heil, brot = ''] = m[0].split(',');
    const eftir = s.slice(b, b + 16);
    const marg = margfaldari(eftir), hlutfall = erHlutfall(eftir);
    const unit = marg > 1 ? hreinsa(eftir.trim().split(/\s+/)[0]) : '';
    tokar.push({
      hratt: m[0] + (hlutfall ? '%' : marg > 1 ? ' ' + unit : ''),
      tegund: hlutfall ? 'hlutfall' : 'tala',
      gildi: Number(heil.replace(/\./g, '') + (brot ? '.' + brot : '')) * marg,
      nakvaemni: Math.pow(10, -brot.length) * marg,
    });
  }
  return tokar;
}

/** Leyfileg gildi úr facts: allar tölur (líka inni í strengjum) + dagur, mánuður og ár úr dagsetningum. */
export function leyfd(facts) {
  const gildi = [], strengir = [];
  const ganga = (v) => {
    if (v == null || typeof v === 'boolean') return;
    if (typeof v === 'number') { if (Number.isFinite(v)) gildi.push(v); return; }
    if (typeof v === 'string') {
      const s = stadlaStrik(v);
      strengir.push(s);
      for (const m of s.matchAll(/(\d{4})M(\d{2})/g)) gildi.push(+m[1], +m[2]);   // 2026M08 (Hagstofa)
      for (const t of talnaTokar(s)) {
        if (t.tegund === 'numer') for (const p of t.hratt.split(/[/-]/)) gildi.push(Number(p));
        else gildi.push(t.gildi);
      }
      return;
    }
    if (Array.isArray(v)) { v.forEach(ganga); return; }
    if (typeof v === 'object') Object.values(v).forEach(ganga);
  };
  ganga(facts);
  return { gildi, texti: strengir.join('  ') };
}

/** { ok, rangar } — rangar = tölur í textanum sem eiga sér ekki stoð í facts. */
export function athugaTolur(texti, facts) {
  const { gildi, texti: fstr } = leyfd(facts);
  const rangar = [];
  for (const t of talnaTokar(texti)) {
    if (t.tegund === 'numer') { if (!fstr.includes(t.hratt)) rangar.push(t.hratt); continue; }
    const g = Math.abs(t.gildi), tol = t.nakvaemni / 2 + 1e-9;
    const passar = gildi.some((v) => {
      const a = Math.abs(v);
      return Math.abs(g - a) <= tol || (t.tegund === 'hlutfall' && Math.abs(g - a * 100) <= tol);
    });
    if (!passar) rangar.push(t.hratt);
  }
  return { ok: rangar.length === 0, rangar: [...new Set(rangar)] };
}
