// rsk_parse.mjs — HREINAR þáttunarfallar fyrir tengslagrunn-crawlerinn.
// Speglar rskClean/rskFelag í web/worker.js EN sem sjálfstæð, prófanleg Node-eining.
// Engin DOM, ekkert net. Notað af crawl_tengsl.mjs + unit-prófunum.
//
// ⚠⚠ HALDA Í TAKT VIÐ web/worker.js: `rg`, `rskErFyrirtaeki` og síu-reglurnar
// (/^(endursko.andi|stofnandi)/i, /l.st/i, dagur 41–71) eru VILJANDI afrit af sömu
// frumstæðum í worker.js (rskClean/tengslanetHandler). Þær ákvarða D1-LYKLA (person_key,
// hvaða hlutverk eru skráð). Ef þú breytir annarri hlið VERÐUR þú að breyta hinni — annars
// skrifar crawlerinn lykla sem workerinn finnur ekki við uppflettingu (þögul und-auðgun).

// ---- deildir hjálparar (sömu reglur og ubo-report.js / worker.js) ----
export const eigNorm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const personKey = ({ kt, nafn, faeding } = {}) => {
  const k = String(kt || '').replace(/\D/g, '');
  return k.length === 10 ? k : 'nm:' + eigNorm(nafn) + '|' + (faeding || '');
};
export const rskErFyrirtaeki = (kt) => { const dd = parseInt(String(kt).slice(0, 2), 10); return dd >= 41 && dd <= 71; };
// case-óháður lesari (APIð skilar PascalCase þótt skjölin sýni camelCase)
export function rg(o, name) {
  if (!o || typeof o !== 'object') return undefined;
  if (name in o) return o[name];
  const lo = name.toLowerCase();
  for (const k in o) if (k.toLowerCase() === lo) return o[k];
  return undefined;
}
export const htmlText = (s) => String(s == null ? '' : s)
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const dstr = (v) => (v ? String(v).slice(0, 10) : null);
const SLEPPA = /^(endursko.andi|stofnandi)/i;   // suð/sögulegt — ekki fyrirsvar

// ---- API (LegalEntities v2.1) ----
export function parseLegalEntity(kt, d) {
  const nafn = rg(d, 'name'), natid = rg(d, 'nationalId');
  if (!d || typeof d !== 'object' || !(nafn || natid)) return null;
  const der = rg(d, 'deregistration') || {};
  const aoa = rg(d, 'articlesOfAssociation') || {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const felag = {
    kt, nafn: nafn || null, form: (rg(rg(d, 'legalForm'), 'name')) || null,
    stada: rg(d, 'status') || null, skraning: dstr(rg(d, 'registered')),
    afskrad: rg(der, 'deregistered') ? 1 : 0, afskrad_dags: dstr(rg(der, 'deregistrationDate')),
    gjaldthrot: rg(der, 'bankrupcy') ? 1 : 0, gjaldthrot_dags: dstr(rg(der, 'bankrupcyDate')),
    gjaldthol: rg(der, 'insolvency') ? 1 : 0, gjaldthol_dags: dstr(rg(der, 'insolvencyDate')),
    isat: JSON.stringify(arr(rg(d, 'activityCode')).map((a) => ({ id: rg(a, 'id') || null, nafn: rg(a, 'name') || null })).slice(0, 6)),
    hlutafe: rg(aoa, 'shareCapital') || null, mynt: rg(aoa, 'shareCapitalCurrency') || null,
  };
  const folk = [], hlutverk = [], discovered = [];
  for (const r of arr(rg(d, 'relationships'))) {
    const rk = String(rg(r, 'nationalId') || '').replace(/\D/g, '');
    const rnafn = rg(r, 'name') || null;
    const teg = rg(r, 'type') || null;
    if (rk.length === 10 && rskErFyrirtaeki(rk)) { if (discovered.indexOf(rk) < 0) discovered.push(rk); continue; }
    if (SLEPPA.test(teg || '') || /l.st/i.test(rg(r, 'status') || '')) continue;   // sía endursko./stofn./látna
    if (rk.length !== 10) continue;   // aðeins gild persónu-kt
    const pk = personKey({ kt: rk, nafn: rnafn });
    if (!folk.some((p) => p.person_key === pk)) folk.push({ person_key: pk, kt: rk, nafn: rnafn, faeding: null });
    hlutverk.push({ felag_kt: kt, person_key: pk, hlutverk: rg(r, 'position') || teg || 'fyrirsvar', tegund: teg });
  }
  return { felag, folk, hlutverk, discovered };
}

// ---- Frítt skrap (raunverulegir eigendur af detail-síðu) ----
export function parseEigendur(html) {
  const iE = String(html || '').indexOf('Raunverulegir eigendur');
  if (iE < 0) return [];
  let eseg = html.slice(iE, iE + 9000);
  const end = eseg.slice(40).search(/Leit í fyrirtækjaskrá|<h3/i);
  if (end > 0) eseg = eseg.slice(0, end + 40);
  const out = [];
  for (const p of eseg.split(/<h4>/i).slice(1)) {
    const nafn = htmlText((p.match(/^([\s\S]*?)<\/h4>/) || [])[1] || '');
    if (!nafn) continue;
    const tb = p.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    const c = tb ? [...tb[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => htmlText(x[1])) : [];
    out.push({
      nafn, faeding: c[0] || null, buseta: (c[1] || '').replace(/\.$/, '') || null,
      rikisfang: c[2] || null, hlutur: c[3] && c[3] !== '-' ? c[3] : null,
      tegund: (c[4] || '').replace(/[,\s]+$/, '') || null,
    });
    if (out.length >= 20) break;
  }
  return out;
}
