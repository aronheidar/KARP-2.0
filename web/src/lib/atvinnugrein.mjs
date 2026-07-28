// atvinnugrein.mjs — hrein rökvél Atvinnugreina-skýrslna (engin I/O; einingaprófuð). Sjá spec 2026-07-27.
// Deilt af SSG-síðum (/atvinnugreinar/[slug].astro), worker.js (/api/atvinnugrein) og index.astro hub.
// Samningur (breyta EKKI án þess að uppfæra báða neytendur): slugify/sectorsFromMap/vsHeild/herfindahl/
// toppNShare/fmtKr/fmtRatio/fmtPct/RATIO_META/RATIO_ORDER.

// ── slugify ─────────────────────────────────────────────────────────────────
// Label (úr sector_kpi.json .map[isat].label) → URL-öruggt slug. Röð: strípa "(ÍSAT nr. …)"-svigann
// aftast FYRST (case-insensitive — svigainnihaldið er alltaf "ÍSAT nr. …" í raungögnum), lágstafa,
// íslenska→ascii, allt sem eftir er sem ekki er a-z/0-9 → '-', hrynja/klippa strik.
// ATH (raungögn): mörg ólík ÍSAT-lyklar (t.d. 05,06,07,08,09) deila BÓKSTAFLEGA sama label-texta
// (Hagstofu-flokkun sameinar þau í eitt samanlagt gildi) → sama slug fyrir mörg map-lykla er VÆNST
// hegðun hér (slugify er hrein textafall), EKKI galli. Neytandi (getStaticPaths) þarf að hópa eftir
// slug sjálfur ef hann vill eina síðu per einkvæmt slug (sjá framvísunar-skýrslu verks 1).
const TRANSLIT = {
  þ: 'th', ð: 'd', æ: 'ae', ö: 'o', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ý: 'y',
};

export function slugify(label) {
  let s = label == null ? '' : String(label);
  s = s.replace(/\s*\([^)]*[ií]sat[^)]*\)\s*$/i, ''); // strip trailing "(ÍSAT nr. …)" parenthetical
  s = s.toLowerCase();
  s = s.replace(/[þðæöáéíóúý]/g, (c) => TRANSLIT[c] || c);
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s;
}

// ── sectorsFromMap ────────────────────────────────────────────────────────────
// sector_kpi.json .map lyklar (2/3/4-stafa ÍSAT-kóðar) → listi EINKVÆMRA atvinnugreina, ein per einkvæmt
// label. Raungögn (staðfest): 82 lyklar → 65 label, því 10 label-hópar sameina marga ÍSAT-kóða í eina
// grein (t.d. 05,06,07,08,09 = „ÍSAT nr. 05-09"; 031,102 = Sjávarútvegur). Hver grein:
//   { slug, label, kpi, isats, excl }
//   • kpi   = (sameiginlega) map-færslan fyrir hópinn (allir meðlimir eins — tökum þann fyrsta).
//   • isats = raðað fylki lykla hópsins (ÍSAT-kóðarnir sem greinin nær yfir).
//   • excl  = tölu-kóðar úr „án X[, Y]"-orðalagi í label (t.d. „Matvælaframleiðsla, án fiskvinnslu
//             (ÍSAT nr. 10, án 102)" → ['102']). ATH: hitt „án <orð>" (t.d. „án fiskvinnslu") hefur enga
//             tölustafi og er RÉTTILEGA hunsað — regexið krefst tölustafs strax á eftir „án ".
// slug = slugify(label); rekist slug á áður-útgefið slug er það aðgreint með '-' + isats[0]. Raðað eftir
// isats[0] (aðgreining ákveðin í þeirri röð svo hún sé óháð innsetningarröð map-lykla).
const SECTOR_EXCL_RX = /án\s+([\d][\d,\s]*)/i;
export function sectorsFromMap(map) {
  const groups = new Map();   // label -> [lyklar]
  for (const k of Object.keys(map || {})) {
    const lab = map[k] && map[k].label != null ? map[k].label : '';
    if (!groups.has(lab)) groups.set(lab, []);
    groups.get(lab).push(k);
  }
  const pre = [];
  for (const [label, keys] of groups) {
    const isats = keys.slice().sort();
    const m = String(label).match(SECTOR_EXCL_RX);
    const excl = m ? m[1].split(/[,\s]+/).filter((x) => /^\d+$/.test(x)) : [];
    pre.push({ label, kpi: map[keys[0]], isats, excl });
  }
  pre.sort((a, b) => (a.isats[0] < b.isats[0] ? -1 : a.isats[0] > b.isats[0] ? 1 : 0));
  const used = new Set();
  return pre.map((s) => {
    let slug = slugify(s.label);
    if (used.has(slug)) slug = slug + '-' + s.isats[0];
    used.add(slug);
    return { slug, label: s.label, kpi: s.kpi, isats: s.isats, excl: s.excl };
  });
}

// ── vsHeild ───────────────────────────────────────────────────────────────
// Hlutfallslegt frávik viðmiðs félags/greinar (val) frá hagkerfisviðmiði (heildVal).
// pct: heiltala (námunduð) % frávik. dir: 'yfir' (>2%), 'undir' (<-2%), annars 'jafnt' (±2% dead-band).
// Ver gegn ónothæfu heildVal (0/NaN/null/undefined) OG ónothæfu val (NaN) → hlutlaust {pct:0,dir:'jafnt'}.
export function vsHeild(val, heildVal) {
  if (!Number.isFinite(heildVal) || heildVal === 0 || !Number.isFinite(val)) {
    return { pct: 0, dir: 'jafnt' };
  }
  const pct = Math.round((val / heildVal - 1) * 100);
  const dir = pct > 2 ? 'yfir' : pct < -2 ? 'undir' : 'jafnt';
  return { pct, dir };
}

// ── herfindahl (HHI) ────────────────────────────────────────────────────────
// Herfindahl-Hirschman samþjöppunarstuðull (0–10000) úr veltu-fylki: Σ(hlutdeild-í-%)².
// Sleppir ≤0 og ógildum (NaN/±Infinity) gildum — þau eru ekki þátttakendur á markaði hér.
// Tómt (eða ekkert nothæft gildi eftir) → 0. Skilar ónámunduðu gildi — birting námundar sjálf.
export function herfindahl(salaArr) {
  const vals = (Array.isArray(salaArr) ? salaArr : []).filter((v) => Number.isFinite(v) && v > 0);
  const total = vals.reduce((a, v) => a + v, 0);
  if (!vals.length || total <= 0) return 0;
  return vals.reduce((sum, v) => {
    const pct = (v / total) * 100;
    return sum + pct * pct;
  }, 0);
}

// ── toppNShare ──────────────────────────────────────────────────────────────
// % (0–100) af heildarveltu sem topp-N stærstu félögin (eftir sala) eiga. Raðar SJÁLFT eftir sala
// (gengur ekki út frá forröðuðu inntaki). Sleppir ≤0/ógildum sala-gildum (sama regla og herfindahl).
// Tómt/ógilt heildar-sala (<=0) → 0.
export function toppNShare(felog, n) {
  const vals = (Array.isArray(felog) ? felog : [])
    .map((f) => (f ? Number(f.sala) : NaN))
    .filter((v) => Number.isFinite(v) && v > 0);
  const total = vals.reduce((a, v) => a + v, 0);
  if (!vals.length || total <= 0) return 0;
  const top = vals.slice().sort((a, b) => b - a).slice(0, Math.max(0, Math.trunc(n) || 0));
  const topSum = top.reduce((a, v) => a + v, 0);
  return (topSum / total) * 100;
}

// ── fmtKr / fmtRatio / fmtPct — íslensk talnasnið ────────────────────────────
// fmtKr: x = HRÁ KRÓNUTALA (ekki m.kr — sama eining og D1 fj.sala/hagnadur/eignir/eigid_fe).
// <1000 m.kr → "N m.kr" (þúsundapunktar skv. is-IS ef við á); >=1000 m.kr → "N,d ma.kr" (1 aukastafur).
export function fmtKr(x) {
  if (x == null || typeof x !== 'number' || !Number.isFinite(x)) return '–';
  const mkr = x / 1e6;
  if (Math.abs(mkr) >= 1000) {
    return (mkr / 1000).toFixed(1).replace('.', ',') + ' ma.kr';
  }
  return Math.round(mkr).toLocaleString('is-IS') + ' m.kr';
}

// fmtRatio: almennt margfeldis-/hlutfallssnið (t.d. skuldahlutfall_DE, eignavelta) — 2 aukastafir,
// komma. EKKI einingu-merkt (kallandi ákveður hvort birt sé sem "x" eða annað — sjá RATIO_META.fmt).
export function fmtRatio(x) {
  if (x == null || typeof x !== 'number' || !Number.isFinite(x)) return '–';
  return x.toFixed(2).replace('.', ',');
}

// fmtPct: brotatala (0.4177) → prósentustrengur ("41,8%"), 1 aukastafur, komma.
export function fmtPct(x) {
  if (x == null || typeof x !== 'number' || !Number.isFinite(x)) return '–';
  return (x * 100).toFixed(1).replace('.', ',') + '%';
}

// ── RATIO_META / RATIO_ORDER ────────────────────────────────────────────────
// 8 viðmiðin úr sector_kpi.json (.map[isat] og .heild deila sömu 8 lyklum). fmt segir kallanda
// hvaða sniðfall á við: 'pct'→fmtPct, 'num'→fmtRatio, 'kr_mkr'→gildið er ÞEGAR í milljónum króna
// (Hagstofu-eining) — EKKI fmtKr (sem tekur hráar krónur); birtu t.d. Math.round(x)+' m.kr' beint.
// betra: 'haerra'|'laegra' — hvor átt er æskilegri (fyrir örvar/lit í viðmótinu).
export const RATIO_META = {
  framlegd: { heiti: 'Framlegð', fmt: 'pct', betra: 'haerra' },
  hagnadarhlutfall: { heiti: 'Hagnaðarhlutfall', fmt: 'pct', betra: 'haerra' },
  ebit_hlutfall: { heiti: 'EBIT-hlutfall', fmt: 'pct', betra: 'haerra' },
  eiginfjarhlutfall: { heiti: 'Eiginfjárhlutfall', fmt: 'pct', betra: 'haerra' },
  skuldahlutfall_DE: { heiti: 'Skuldir/eigið fé', fmt: 'num', betra: 'laegra' },
  eignavelta: { heiti: 'Eignavelta', fmt: 'num', betra: 'haerra' },
  launahlutfall: { heiti: 'Launahlutfall', fmt: 'pct', betra: 'laegra' },
  tekjur_pr_starfsm_mkr: { heiti: 'Tekjur á starfsmann', fmt: 'kr_mkr', betra: 'haerra' },
};

export const RATIO_ORDER = [
  'framlegd', 'hagnadarhlutfall', 'ebit_hlutfall', 'eiginfjarhlutfall',
  'skuldahlutfall_DE', 'eignavelta', 'launahlutfall', 'tekjur_pr_starfsm_mkr',
];
