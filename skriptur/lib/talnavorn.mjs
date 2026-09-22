// talnavorn.mjs — hver tala í vélskrifaðri frétt verður að finnast í staðreyndunum (facts).
//
// AF HVERJU (22.9.2026): fréttavélin fær lengri texta með bakgrunni úr gögnum Karp. Meiri texti eykur hættuna á
// uppspuna. Reglan „aðeins úr facts" í fyrirmælunum er ósk; þessi athugun er tryggingin. Fréttin fellur ef tala
// í titli eða texta á sér ekki stoð í facts, að teknu tilliti til námundunar og eininga.

const RE_NUMER = /\d+(?:[/-]\d+)+/g;                             // 28/2026 · 649909-2026 · 80/400 · 2026-09-21
const RE_TALA = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;   // 1.024.188.084 · 17,7 · 42

// einingar — AÐEINS sem HEIL orð (sjá yfirferð 22.9.2026): forskeytis-samsvörun las „milljarðamæringar" sem
// milljarður-eining. Samsett orð eiga aldrei að passa, því orðið sem er dregið út hér að neðan er ALLT
// samfellda stafarunan (t.d. „milljónamæringur" í heilu lagi), ekki bara byrjunin.
const EININGAR_MA = new Set(['milljarður', 'milljarð', 'milljarði', 'milljarðs', 'milljarðar', 'milljarða', 'milljörðum']);
const EININGAR_M = new Set(['milljón', 'milljónir', 'milljóna', 'milljónum', 'milljónar']);
const EININGAR_TH = new Set(['þúsund', 'þúsundir', 'þúsunda', 'þúsundum']);

function margfaldari(eftir) {
  const s = eftir.toLowerCase();
  if (/^\s*m[aö]\.\s?kr/.test(s)) return 1e9;
  if (/^\s*m\.\s?kr/.test(s)) return 1e6;
  if (/^\s*(þús\.|þ\.\s?kr)/.test(s)) return 1e3;
  const ord = (/^\s*([a-záðéíóúýþæö]+)/.exec(s) || [])[1] || '';
  if (EININGAR_MA.has(ord)) return 1e9;
  if (EININGAR_M.has(ord)) return 1e6;
  if (EININGAR_TH.has(ord)) return 1e3;
  return 1;
}
const erHlutfall = (eftir) => /^\s*(%|prósent)/i.test(eftir);
// Stefnuorð (prufukeyrsla 22.9): „tæpa 1,6 milljarða" stóðst námundun þótt samningurinn væri 1.619 milljónir. Aðeins
// ótvíræð NÁMUNDUNARorð gefa stefnu. Samanburðarorð („meiri en", „yfir", „undir") vísa oft í viðmið sem stendur sjálft í
// facts („meiri en 7,3%" = fyrri metdagur, „yfir 40 viðskiptadaga" = tímabil) og gefa því enga stefnu.
const STAFUR = 'a-záðéíóúýþæö';
const RE_UNDIR = new RegExp(`(?:^|[^${STAFUR}])(tæp(?:lega|a|an|ar|ir|um|u|t|ri|rar|s|ur)?|nærri|næstum|hátt í)\\s+$`);
const RE_YFIR = new RegExp(`(?:^|[^${STAFUR}])(rúm(?:lega|a|an|ar|ir|um|u|t|ri|rar|s|ur)?|ríflega|liðlega)\\s+$`);
function stefna(fyrir) {
  const s = fyrir.toLowerCase();
  const u = RE_UNDIR.exec(s);
  if (u) return { att: 'undir', ord: u[1] };
  const y = RE_YFIR.exec(s);
  return y ? { att: 'yfir', ord: y[1] } : null;
}
const stadlaStrik = (s) => String(s).replace(/[‐‑‒–—]/g, '-');
const hreinsa = (s) => s.replace(/[.,:;!?'"»«„“”]+$/, '');   // AÐEINS í enda strengs — hratt-birting, ekki úrskurður

// Sviðaheiti (yfirferð 22.9): vörnin hafnaði réttum texta af því að talan sat í HEITINU, ekki gildinu. AÐEINS tímabil
// (skiptitala + man/d/ar/ara, t.d. `ny_utbod_30d`, `verdbolga_12man_fyrr`) eða fjögurra stafa ártal (`kosningar2024`)
// teljast — ekki hvaða tölustafur sem er í heitinu. Áður las lykilTolur ALLA tölustafi hráð (t.d. `verd_m2` hleypti „2"
// í gegn sem gilda tölu); yfirferð 22.9 (síðari lota) þrengdi þetta að einingum sem fréttin má raunverulega nefna.
const lykilTolur = (k) => {
  const tolur = [];
  for (const hluti of String(k).split('_')) {
    const timabil = /^(\d+)(?:man|d|ar|ara)$/.exec(hluti);
    if (timabil) tolur.push(Number(timabil[1]));
    const artal = /(19|20)\d{2}/.exec(hluti);
    if (artal) tolur.push(Number(artal[0]));
  }
  return tolur;
};
// `_thus` = gildið er í þúsundum (fermetraverd_thus: 824 → „824 þúsund krónur"). Líka sem hluti heitis: midgildi_thus_m2.
const erThusLykill = (k) => /(^|_)thus(_|$)/.test(k);
// ×100 AÐEINS á allowlista sviða sem geyma raunverulegt BROT (0–1): breytingN (svæðaskynjarinn, t.d. breyting12) og
// hms_breyting_ÁÁÁÁ (HMS-spá, t.d. hms_breyting_2027). Yfirferð 22.9 (síðari lota): laustengd samsvörun á „breyting"
// eða „hlutfall" hvar sem er í heitinu hleypti óskyldu PRÓSENTUSTIGI í gegn sem prósentu — vaxtabreytingin úr
// vextir-skynjaranum (`breyting: 0,25`, þ.e. 0,25 prósentustig) stóðst ranglega á móti uppspunninni „25%".
const erBrotLykill = (k) => /^breyting\d+$/.test(k) || /^hms_breyting_\d{4}$/.test(k);
const hreint = (x) => Number(x.toPrecision(12));   // fleytitölusuð: 0,29 × 100 = 28,999999999999996 → 29

/** Tölur í texta: { hratt, tegund: 'numer'|'tala'|'hlutfall', gildi?, nakvaemni?, hrein? } */
export function talnaTokar(texti) {
  const s = stadlaStrik(texti || '');
  const tokar = [], numerSvid = [];
  for (const m of s.matchAll(RE_NUMER)) { tokar.push({ hratt: m[0], tegund: 'numer' }); numerSvid.push([m.index, m.index + m[0].length]); }
  for (const m of s.matchAll(RE_TALA)) {
    const a = m.index, b = a + m[0].length;
    if (numerSvid.some(([x, y]) => a >= x && b <= y)) continue;   // hluti af númeri, þegar talið
    const [heil, brot = ''] = m[0].split(',');
    const eftir = s.slice(b, b + 24);
    const marg = margfaldari(eftir), hlutfall = erHlutfall(eftir);
    const unit = marg > 1 ? hreinsa(eftir.trim().split(/\s+/)[0]) : '';
    const st = stefna(s.slice(0, a));
    tokar.push({
      hratt: (st ? st.ord + ' ' : '') + m[0] + (hlutfall ? '%' : marg > 1 ? ' ' + unit : ''),
      tegund: hlutfall ? 'hlutfall' : 'tala',
      gildi: Number(heil.replace(/\./g, '') + (brot ? '.' + brot : '')) * marg,
      nakvaemni: Math.pow(10, -brot.length) * marg,
      hrein: !brot && marg === 1 && !hlutfall,   // hrein heiltala: enginn aukastafur, engin eining, ekki %
      ...(st ? { att: st.att } : {}),            // 'undir' (tæplega …) eða 'yfir' (rúmlega …)
    });
  }
  return tokar;
}

/** Leyfileg gildi úr facts: allar tölur (líka inni í strengjum) + dagur, mánuður og ár úr dagsetningum, tímabil/ártal í
 *  sviðaheitum, ×1000 á `_thus`-sviðum og ×100 á brotum á breytingN/hms_breyting_ÁÁÁÁ-sviðum. */
export function leyfd(facts) {
  const gildi = [], strengir = [];
  const ganga = (v, lykill = '') => {
    if (v == null || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return;
      gildi.push(v);
      if (erThusLykill(lykill)) gildi.push(hreint(v * 1000));
      if (Math.abs(v) <= 1 && erBrotLykill(lykill)) gildi.push(hreint(v * 100));
      return;
    }
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
    if (Array.isArray(v)) { v.forEach((x) => ganga(x, lykill)); return; }   // stök fylkis erfa heiti þess
    if (typeof v === 'object') for (const [k, x] of Object.entries(v)) { gildi.push(...lykilTolur(k)); ganga(x, k); }
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
    // Hrein heiltala verður að passa NÁKVÆMLEGA (yfirferð 22.9): „3 útboð" má ekki standast á móti 2,6 í facts, það er
    // önnur tala en ekki námundun. Námundun gildir aðeins þar sem textinn sýnir nákvæmnina (17,7 · 18 milljarðar · 4%).
    // Hlutfall passar beint við gildi, eða ×100 við brot á breyting/hlutfall-sviði (sjá leyfd).
    // Stefnuorð þrengja bilið að annarri hliðinni: „tæplega 1,6 milljarðar" krefst gildis UNDIR 1,6 milljörðum.
    const g = Math.abs(t.gildi), tol = t.hrein ? 1e-9 : t.nakvaemni / 2 + 1e-9;
    const passar = gildi.some((v) => {
      const d = g - Math.abs(v);   // jákvætt: gildið liggur undir birtri tölu
      if (Math.abs(d) > tol) return false;
      return t.att === 'undir' ? d > 1e-9 : t.att === 'yfir' ? d < -1e-9 : true;
    });
    if (!passar) rangar.push(t.hratt);
  }
  return { ok: rangar.length === 0, rangar: [...new Set(rangar)] };
}
