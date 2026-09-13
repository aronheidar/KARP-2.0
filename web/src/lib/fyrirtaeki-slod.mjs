// fyrirtaeki-slod.mjs — EIN uppspretta fyrir slóð á fyrirtækjaprófíl.
//
// ⚠ Bakgrunnur (SEO-úttekt 13.9.2026): tenglar á félög voru handskrifaðir sem
// '/fyrirtaeki/?q=<kt>' á ~20 stöðum. Sú slóð er LEITARSÍÐAN — hún ber canonical
// '/fyrirtaeki/' fyrir öll félög og flutti því ekkert leitarvægi á prófílana
// (/fyrirtaeki/<kt>/), sem sátu munaðarlausir með núll innri tengla. Hér er slóðin
// smíðuð á einum stað svo hún geti ekki reikað aftur.
//
// Hafa í huga: /fyrirtaeki/<kt>/ er worker-SSR og skilar 404 fyrir kt sem RSK
// þekkir ekki. Þess vegna fer allt sem er EKKI gild lögaðila-kennitala (nöfn,
// einstaklings-kt) áfram á leitarsíðuna — felagHref sér um það fallback.

export const ktTolur = (kt) => String(kt ?? '').replace(/\D/g, '');

// Lögaðila-kennitala: 10 tölustafir og fyrstu tveir í 41–71 (dagur + 40).
// Sama regla og í skriptur/build_sitemap_fyrirtaeki.mjs og web/src/worker/felag.mjs.
export const erLogadili = (kt) => {
  const d = ktTolur(kt);
  return d.length === 10 && +d.slice(0, 2) >= 41 && +d.slice(0, 2) <= 71;
};

const vidmotHali = (vidmot, fyrstaStafur) => (vidmot ? fyrstaStafur + 'vidmot=' + encodeURIComponent(vidmot) : '');

// Kanónísk prófílslóð — eða null ef kt dugar ekki (kallandinn á þá að nota leitina).
export const felagSlod = (kt, { vidmot } = {}) =>
  (erLogadili(kt) ? '/fyrirtaeki/' + ktTolur(kt) + '/' + vidmotHali(vidmot, '?') : null);

// Örugg slóð fyrir öll köll: prófíll þegar kt dugar, annars leitarsíðan með fyrirspurninni.
export const felagHref = (ktEdaNafn, opts = {}) => {
  const beint = felagSlod(ktEdaNafn, opts);
  if (beint) return beint;
  const q = String(ktEdaNafn ?? '').trim();
  if (!q) return '/fyrirtaeki/' + vidmotHali(opts.vidmot, '?');
  return '/fyrirtaeki/?q=' + encodeURIComponent(q) + vidmotHali(opts.vidmot, '&');
};

// ── Spegill fyrir define:vars-skriftur ────────────────────────────────────────
// Astro inline-ar <script define:vars={...}> og Vite bundlar hana því ekki → `import`
// er ekki í boði þar. Þrjár síður (logbirting, loftfor, eftirlit-byggingar) smíða
// tengla í runtime-innerHTML og þurfa regluna á staðnum. Hér er hún geymd sem strengur
// svo hún eigi sér EINA uppsprettu; fyrirtaeki-slod.test.mjs les síðurnar, keyrir
// spegilinn úr þeim og ber saman við felagHref — rek stöðvar prófin.
export const FELAGHREF_INLINE =
  "const felagHref = (kt) => { const s = String(kt == null ? '' : kt).trim(), d = s.replace(/\\D/g, ''); return (d.length === 10 && +d.slice(0, 2) >= 41 && +d.slice(0, 2) <= 71) ? '/fyrirtaeki/' + d + '/' : (s ? '/fyrirtaeki/?q=' + encodeURIComponent(s) : '/fyrirtaeki/'); };";

// ── Stafrófshólf fyrir /fyrirtaeki/skra/ ──────────────────────────────────────
// Broddstafir falla í grunnstafinn (Á→a, Ð→d …) — annars yrðu tugir örhólfa.
// Þ, Æ og Ö eru sérstakir bókstafir í íslenskri stafrófsröð og fá eigin hólf;
// slóðirnar nota ASCII-nöfnin th/ae/oe svo þær séu læsilegar og URL-öruggar.
const FELLING = {
  á: 'a', à: 'a', â: 'a', ä: 'a', å: 'a',
  ð: 'd',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  ñ: 'n', ç: 'c',
  þ: 'th', æ: 'ae', ö: 'oe',
};

export const HOLF = [
  '0-9',
  ...'abcdefghijklmnopqrstuvwxyz',
  'th', 'ae', 'oe',
  'annad',
];

export const HOLF_TITLAR = { '0-9': '0–9', th: 'Þ', ae: 'Æ', oe: 'Ö', annad: 'Annað' };

export const holfTitill = (h) => HOLF_TITLAR[h] || String(h || '').toUpperCase();

export const stafHolf = (nafn) => {
  const c = String(nafn ?? '').trim().toLowerCase().slice(0, 1);
  if (!c) return 'annad';
  if (c >= '0' && c <= '9') return '0-9';
  const f = FELLING[c] || c;
  return HOLF.includes(f) ? f : 'annad';
};
