// ─────────────────────────────────────────────────────────────
// build_styrkir.js — „Styrkir sem félagið hefur fengið" → gogn/styrkir.json
// DRÖG (eftir LOTA 91 — bíður samþykkis Arons). Fullt ID-kort: memory/iceland-styrkir-api.md
//
// KEYRSLA: node skriptur/build_styrkir.js     (svo build_ragcopy.js + endurbygging)
//   • Umhverfisbreyta STYRKIR_OUT=slóð → skrifar annað en gogn/styrkir.json (til prófunar).
//
// OPNAR, óauðkenndar úthlutana-veitur (staðfestar með raun-svörum við smíði þessa).
// ⚠⚠ ENGIN uppspretta birtir KENNITÖLU viðtakanda. Tengingin við /fyrirtaeki/ (sem er
//    kt-lyklað) fer því fram Í WORKER á view-tíma: kt → opinbert nafn úr RSK-leit → nmBest
//    beygingaþolin samsvörun við `byNafn` hér. ⚠ ALDREI fjöldakall á RSK í þessari skriptu
//    (RSK hraðatakmarkar hart — sjá [[karp-virdisvegvisir]]); nafn→kt er EITT fyrirtæki í einu.
//
//   1. Kvikmyndasjóður   — Payload REST API  (kmi.payload.is/api/grants)     — 1 kall, allt
//   2. Matvælasjóður     — SSR HTML-töflur   (stjornarradid.is)              — 1 síða, öll ár
//   3. Orkusjóður        — Prismic API → Infogram window.infographicData      — ~7 embeds
//   4. Uppbyggingarsj. Vesturlands (SSV) — HTML-töflur /veittir-styrkir/YYYY-2/
//   5. Uppbyggingarsj. Suðurnesja (SSS)  — HTML-texti  /uthlutun-YYYY/
//   6. Tækniþróunarsjóður — HTML-töflur    (gamli.rannis.is)                 — AÐEINS 2019 & 2020
//
// ⚠ ÍSLENSK þúsundapunkta-tala „1.200.000" → strjúka allt nema tölustafi → heiltala (ISK).
// ⚠ Kurteis ~1,2s töf milli kalla á sama hýsil. Moya/WordPress-síður uppbyggingarsjóða
//   (ssv.is, sss.is) loka á hraðar endurteknar sóknir frá einni IP → build-time, aldrei batch.
//
// BÍÐUR (PDF/headless — sjá minnisnótu, ekki útfært hér):
//   • Uppbyggingarsjóðir SSNE / Vestfjarða / Austurbrú / SSNV  — 1 PDF/ár (Moya/WP) → pypdf
//   • SASS (Suðurland)        — Next.js, þarf headless-render (Playwright/claude-in-chrome)
//   • Loftslagssjóður         — PDF (frosinn, 2020–2023), lítið vægi
//   • ESA State-Aid gagnsæisskrá — R&Þ-SKATTFRÁDRÁTTUR: EINA kt-berandi opinbera veitan
//     (viðtakandi + national ID + upphæð, öll styrkjakerfi > €100k), en Angular-SPA án opins
//     REST → þarf headless XHR-njósn. HÆSTA vægi til framtíðar (sjá minnisnótu).
// ─────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const OUT = process.env.STYRKIR_OUT || path.join(__dirname, '..', 'gogn', 'styrkir.json');
const UA = { 'User-Agent': 'KARP dashboard build (karp.is; aronheidars@gmail.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── textahjálp ────────────────────────────────────────────────
const decode = s => String(s == null ? '' : s)
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
const strip = s => decode(String(s == null ? '' : s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// ⚠ blönduð talnasnið í heimildum: „42.559.000,00" (IS: komma=aukastafir) EN líka „150,000" (US: komma=þúsund).
//   Regla: komma + 1–2 tölustafir í enda = aukastafir (henda); komma + 3 = þúsundaskil (haldast, strokið sem almennt).
const toInt = s => parseInt(String(s == null ? '' : s).replace(/,\d{1,2}\s*$/, '').replace(/[^\d]/g, ''), 10) || 0;
const cellsOf = tr => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => strip(c[1]));
const tablesOf = html => [...String(html).matchAll(/<table[\s\S]*?<\/table>/gi)].map(x => x[0]);
const rowsOf = tbl => [...String(tbl).matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(x => x[0]);

async function getText(u) { const r = await fetch(u, { headers: UA }); return { s: r.status, ok: r.ok, t: await r.text() }; }
async function getJson(u) { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); }

// félaga-viðskeyti → merkja lögaðila vs einstakling (sía/flögg, ekki hörð útilokun)
const SUFFIX = /(?:^|\s)(ehf|hf|ohf|slf|s\.f|sf|ses|hses|bs|svf)\.?(?=\s|$)/i;
const isFelag = n => SUFFIX.test(' ' + String(n) + ' ');
// samsvörunar-lykill: lágstafir, burt viðskeyti + greinarmerki (íslenskir stafir haldast)
const normNafn = n => String(n || '').toLowerCase()
  .replace(/\b(ehf|ohf|hf|slf|sf|ses|hses|bs|svf)\.?/g, '')
  .replace(/[.,;:()"'/\-–]/g, ' ')
  .replace(/\s+/g, ' ').trim();

// ── söfnun ────────────────────────────────────────────────────
const REC = [];
function push(r) {
  const nafn = String(r.nafn == null ? '' : r.nafn).replace(/\s+/g, ' ').trim();
  const nafnNorm = normNafn(nafn);
  // sleppa auðum/samtölu-röðum + tölu-/greinarmerkja-„nöfnum" (t.d. „22" úr frjáls-texta pörun)
  if (!nafnNorm || nafn.length < 2 || /^[\d\s.,\-–]+$/.test(nafn) || !r.upphaed || !r.ar) return;
  REC.push({
    nafn,
    nafnNorm,
    felag: isFelag(nafn),          // true = lögaðili (ehf./hf./…); false = einstaklingur/óformlegt
    kt: null,                      // engin uppspretta birtir kt — leyst í worker á view-tíma
    sjodur: r.sjodur,
    flokkur: r.flokkur || null,
    upphaed: r.upphaed,            // ISK, heiltala
    ar: r.ar,
    verkefni: r.verkefni || null,
    ...(r.extra || {}),
    heimild: r.heimild,
  });
}

// 1) ── KVIKMYNDASJÓÐUR — opinn Payload REST API ────────────────
//    GET kmi.payload.is/api/grants?limit=100&depth=1&page=N (síður), applicant.relationTo=companies.
//    year=ISO-dags; type.type=flokkur; project.title/composedTitle=verkefni; concession=vilyrði (óútgreitt).
async function kvikmyndasjodur() {
  let page = 1, pages = 1;
  do {
    const d = await getJson(`https://kmi.payload.is/api/grants?limit=100&depth=1&page=${page}`);
    pages = d.totalPages || 1;
    for (const g of (d.docs || [])) {
      const ap = g.applicant && g.applicant[0];
      if (!ap || ap.relationTo !== 'companies') continue;   // sleppa einstaklingum (handritsstyrkir) — persónuleg kt
      const val = ap.value || {}; if (!val.name) continue;
      const addr = val.address && (val.address.city || val.address.postalCode) ? val.address : null;
      push({
        nafn: val.name, sjodur: 'Kvikmyndasjóður',
        flokkur: (g.type && g.type.type) || null,           // Framleiðslu-/Þróunar-/Handritsstyrkur
        upphaed: g.amount,
        ar: g.year ? new Date(g.year).getUTCFullYear() : null,
        verkefni: (g.project && g.project.title) || g.composedTitle || null,
        extra: { vilyrdi: !!g.concession, slug: val.slug || null,
                 postnr: (addr && addr.postalCode) || null, stadur: (addr && addr.city) || null },
        heimild: 'kmi.payload.is/api/grants',
      });
    }
    await sleep(300); page++;
  } while (page <= pages);
}

// 2) ── MATVÆLASJÓÐUR — SSR HTML-töflur á einni síðu ────────────
//    <h3>ÁR</h3> setur núgildandi ár; hver <table>: eins-reits-röð = flokkur (Bára/Kelda/Afurð/
//    Fjársjóður), hausröð Umsækjandi|Heiti verkefnis|Styrkupphæð, gagnaraðir = [nafn, verkefni, upphæð].
async function matvaelasjodur() {
  const { t: html } = await getText('https://www.stjornarradid.is/verkefni/atvinnuvegir/matvaeli-og-matvaelaoryggi/matvaelasjodur/');
  const tokRe = /(<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>)|(<table[\s\S]*?<\/table>)/gi;
  let m, curYear = null;
  while ((m = tokRe.exec(html))) {
    if (m[1]) { const y = (strip(m[1]).match(/\b(20\d\d)\b/) || [])[1]; if (y) curYear = +y; continue; }
    let flokkur = null;
    for (const row of rowsOf(m[2])) {
      const cells = cellsOf(row), nonEmpty = cells.filter(Boolean);
      if (nonEmpty.length === 1) { flokkur = nonEmpty[0]; continue; }               // flokka-fyrirsögn
      if (cells.some(c => /Umsækjandi|Styrkupphæð|Heiti verkefnis/i.test(c))) continue; // hausröð
      if (nonEmpty.length < 2) continue;
      const nafn = cells[0], verkefni = cells[1], upphaed = toInt(cells[cells.length - 1]);
      if (!nafn || !upphaed) continue;
      push({ nafn, sjodur: 'Matvælasjóður', flokkur, upphaed, ar: curYear, verkefni, heimild: 'stjornarradid.is/Matvælasjóður' });
    }
  }
}

// 3) ── ORKUSJÓÐUR — Prismic (skrár) → Infogram (window.infographicData) ──
//    Prismic-leit skilar öllum „pages"; síur uid ~ /^uthlutanir-20\d\d$/ (staka-árs; sleppa 2000–2018
//    bunkum sem vantar per-raðar ár). Hver síða → data_id → Infogram-embed → töflu-grid.
//    Grid-haus: Átaksheiti|Heiti verkefnis|Umsækjandi|Samþykkt upphæð|…|Styrkhlutfall|Landshluti.
//    ⚠ Gögnin dreifast á MÖRG grid (per flokk) + eitt kort-grid (án Umsækjanda) → safna öllum m/ Umsækjanda.
function infogramUrl(id) {
  const m = String(id).match(/^infogram_0_(.+)$/); if (!m) return null;
  const tok = m[1];
  return tok.startsWith('_/') ? 'https://e.infogram.com/_/' + tok.slice(2)   // stutt-tóki (2024/2025)
                              : 'https://e.infogram.com/' + tok;             // UUID (2019–2023)
}
const cellText = c => (c && typeof c === 'object') ? (c.value != null ? String(c.value) : '') : String(c == null ? '' : c);
// brace-jöfnuð útdráttur á window.infographicData = {...} (traustari en regex — les allan hlutinn burtséð frá eftirfarandi JS)
function extractInfographic(html) {
  const a = String(html).indexOf('window.infographicData'); if (a < 0) return null;
  const b = html.indexOf('{', a); if (b < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = b; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; }
    else { if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}') { if (--depth === 0) return html.slice(b, i + 1); } }
  }
  return null;
}
function collectGrids(data) {   // öll array-af-röðum „data"-grid í infographicData
  const grids = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.data)) for (const g of o.data) if (Array.isArray(g) && g.length > 1 && Array.isArray(g[0])) grids.push(g);
    for (const k in o) if (k !== 'data') { try { walk(o[k]); } catch (e) {} }
  })(data);
  return grids;
}
async function orkusjodur() {
  const api = await getJson('https://neasite.cdn.prismic.io/api/v2');
  const ref = (api.refs.find(x => x.isMasterRef) || api.refs[0]).ref;
  const q = encodeURIComponent('[[at(document.type,"pages")]]');
  const uidToId = {};
  let page = 1, pages = 1;
  do {
    const d = await getJson(`https://neasite.cdn.prismic.io/api/v2/documents/search?ref=${ref}&q=${q}&pageSize=100&lang=is&page=${page}`);
    pages = d.total_pages || 1;
    for (const doc of (d.results || [])) {
      if (!/^uthlutanir-20\d\d$/.test(doc.uid || '')) continue;
      const body = (doc.data && (doc.data.body || doc.data.slices)) || [];
      const info = (Array.isArray(body) ? body : []).find(s => /infogram/i.test(s.slice_type || ''));
      const raw = info && info.primary && info.primary.data_id;
      const idStr = typeof raw === 'string' ? raw : (raw && (raw.text || raw.url)) || '';
      if (idStr) uidToId[doc.uid] = idStr;
    }
    page++;
  } while (page <= pages);

  for (const uid of Object.keys(uidToId).sort()) {
    const ar = +uid.slice(-4), url = infogramUrl(uidToId[uid]);
    if (!url) { console.log('   ! Orku', uid, 'óþekkt data_id', uidToId[uid]); continue; }
    try {
      const { t: html } = await getText(url);
      const js = extractInfographic(html);
      if (!js) { console.log('   ! Orku', uid, 'engin infographicData'); continue; }
      const data = JSON.parse(js); const seen = new Set();
      const cl = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
      for (const grid of collectGrids(data)) {
        const hdr = grid[0].map(h => cl(cellText(h)));
        // ⚠ FJÖGUR ólík sniðmát yfir árin (2019–2025) → dálkar fundnir á HEITI, ekki fastri stöðu:
        //   viðtakandi = „Umsækjandi" (2022+) / „Styrkhafi" (2019–21) — nákvæmt heiti umfram samsett („Umsóknarflokkur / umsækjandi").
        //   upphæð     = „Styrkur" / „Styrkur [kr.]" / „Styrkupphæð" / „Samþykkt upphæð" — EKKI Styrkhlutfall né Heildarkostnaður.
        let iU = hdr.findIndex(h => /^(umsækjandi|styrkhafi)$/i.test(h));
        if (iU < 0) iU = hdr.findIndex(h => /umsækjandi|styrkhafi/i.test(h));
        if (iU < 0) continue;                                            // ekki viðtakenda-grid (t.d. kort-grid)
        const iA = hdr.findIndex(h => /styrkupph|samþykkt upphæð|^styrkur\b/i.test(h) && !/hlutfall|hlufall|heildarkost/i.test(h));
        if (iA < 0) continue;
        const iP  = hdr.findIndex(h => /heiti\s*verkefnis/i.test(h));    // 2024: „HeitiVerkefnis" (án bils)
        const iAt = hdr.findIndex(h => /átaksheiti|umsóknarflokkur/i.test(h));
        const iH  = hdr.findIndex(h => /styrk(hlutfall|tarhlu)/i.test(h));
        const iL  = hdr.findIndex(h => /landshluti/i.test(h));
        const iPn = hdr.findIndex(h => /póstnúmer/i.test(h));
        const iAr = hdr.findIndex(h => /^ártal$/i.test(h));              // aðeins gamla sniðið (2019–21) hefur ár per röð
        for (const row of grid.slice(1)) {
          const c = row.map(cellText), nafn = cl(c[iU]), upphaed = toInt(c[iA]);
          if (!nafn || !upphaed) continue;
          const rowAr = iAr >= 0 && /^20\d\d$/.test(cl(c[iAr])) ? +cl(c[iAr]) : ar;
          const verkefni = iP >= 0 ? cl(c[iP]) : null;
          const key = normNafn(nafn) + '|' + rowAr + '|' + upphaed + '|' + (verkefni || '');
          if (seen.has(key)) continue; seen.add(key);
          push({ nafn, sjodur: 'Orkusjóður', flokkur: iAt >= 0 ? cl(c[iAt]) : null, upphaed, ar: rowAr, verkefni,
                 extra: { hlutfall: iH >= 0 ? cl(c[iH]) : null, landshluti: iL >= 0 ? cl(c[iL]) : null, postnr: iPn >= 0 ? cl(c[iPn]) : null },
                 heimild: 'orkustofnun.is/Orkusjóður (Infogram)' });
        }
      }
      await sleep(1200);
    } catch (e) { console.log('   ! Orku', uid, String(e.message || e).slice(0, 90)); }
  }
}

// 4) ── UPPBYGGINGARSJÓÐUR VESTURLANDS (SSV) — HTML-töflur per ár ─
//    Vísasíða /veittir-styrkir/ → ártöl (veittir-styrkir/YYYY-2/). Hvert ár: nokkrar töflur;
//    AÐEINS þær með haus „Umsækjandi" eru viðtakendalistar (hinar eru samantektir → sleppa).
//    Haus: Nafn verkefnis | Umsækjandi | Verkefnisstjóri | Styrkveiting.
async function ssvVesturland() {
  const base = 'https://ssv.is/uppbyggingarsjodur-vesturlands/veittir-styrkir/';
  let years = [];
  try { const idx = await getText(base); years = [...new Set([...idx.t.matchAll(/veittir-styrkir\/(\d{4})-2\//g)].map(m => m[1]))]; } catch (e) {}
  if (!years.length) years = ['2018','2019','2020','2021','2022','2023','2024','2025']; // varafall
  for (const y of years.sort()) {
    try {
      const { t } = await getText(`${base}${y}-2/`);
      for (const tbl of tablesOf(t)) {
        const trs = rowsOf(tbl).map(cellsOf);
        const hi = trs.findIndex(r => r.some(c => /Umsækjandi/i.test(c))); if (hi < 0) continue;
        const hdr = trs[hi];
        const iU = hdr.findIndex(c => /Umsækjandi/i.test(c));
        const iA = hdr.findIndex(c => /Styrk(veiting|upphæð)/i.test(c));
        const iP = hdr.findIndex(c => /Nafn verkefnis|Heiti/i.test(c));
        if (iA < 0) continue;   // engin skýr upphæðar-dálkur (t.d. 2015-snið) → sleppa töflu (forðast rangan dálk)
        for (const r of trs.slice(hi + 1)) {
          const nafn = r[iU], upphaed = toInt(r[iA]);
          if (!nafn || !upphaed) continue;
          push({ nafn, sjodur: 'Uppbyggingarsjóður Vesturlands', upphaed, ar: +y,
                 verkefni: iP >= 0 ? r[iP] : null, heimild: 'ssv.is' });
        }
      }
      await sleep(1200);
    } catch (e) { console.log('   ! SSV', y, String(e.message || e).slice(0, 80)); }
  }
}

// 5) ── UPPBYGGINGARSJÓÐUR SUÐURNESJA (SSS) — HTML-texti per ár ──
//    Vísasíða → /uthlutun-YYYY/ (2024+ hreinar síður). Textamynstur per styrk:
//    „… Umsækjandi: <nafn>. … Verkefnið hlýtur styrk að fjárhæð kr. <upphæð>."
//    ⚠ verkefni ekki fangað áreiðanlega í frjálsum texta → null (betrumbæta síðar).
async function sssSudurnes() {
  let years = [];
  try {
    const idx = await getText('https://sss.is/verkefni/uppbyggingarsjodur/uthlutanir-uppbyggingarsjods/');
    years = [...new Set([...idx.t.matchAll(/\/uthlutun-(\d{4})\//g)].map(m => m[1]))];
  } catch (e) {}
  if (!years.length) years = ['2024','2025','2026'];
  for (const y of years.sort()) {
    try {
      const { s, t } = await getText(`https://sss.is/uthlutun-${y}/`);
      if (s !== 200) continue;
      const main = (t.match(/<main[\s\S]*?<\/main>/i) || [t])[0];
      const text = strip(main);
      const re = /Umsækjandi\s*:?\s*([^.]{2,110}?)\.[\s\S]{0,900}?fjárhæð kr\.?\s*([\d.]+)/gi;
      let m, n = 0; const anchors = (text.match(/fjárhæð kr/gi) || []).length;
      while ((m = re.exec(text))) { push({ nafn: m[1].trim(), sjodur: 'Uppbyggingarsjóður Suðurnesja', upphaed: toInt(m[2]), ar: +y, heimild: 'sss.is' }); n++; }
      if (anchors && n < anchors) console.log('   · SSS', y + ':', n + '/' + anchors, 'pöruð (afgangur án skýrs „Umsækjandi:")');
      await sleep(1200);
    } catch (e) { console.log('   ! SSS', y, String(e.message || e).slice(0, 80)); }
  }
}

// 6) ── TÆKNIÞRÓUNARSJÓÐUR — HTML-töflur (AÐEINS 2019 & 2020) ────
//    5 dálkar: Númer | Heiti verkefnis | Styrkþegi | Flokkur | Samningsupphæð fyrsta árs (ÞÚS.kr.).
//    ⚠ upphæð × 1000. 2021+ birta AÐEINS samtölufræði (engin nöfn) → ekki hægt.
async function taeknithrounarsjodur() {
  const PAGES = { 2019: 'veittir-styrkir-2019', 2020: 'veittir-styrkir-2020' };
  for (const ar of Object.keys(PAGES)) {
    try {
      const { t } = await getText(`https://gamli.rannis.is/sjodir/rannsoknir/taeknithrounarsjodur/uthlutanir/${PAGES[ar]}`);
      const tbl = (t.match(/<table[\s\S]*?<\/table>/i) || [''])[0];
      for (const row of rowsOf(tbl)) {
        const c = cellsOf(row); if (c.length < 5) continue;
        if (/Heiti verkefnis|Styrkþegi|Samnings/i.test((c[1] || '') + (c[2] || '') + (c[4] || ''))) continue; // hausröð
        const nafn = c[2], verkefni = c[1], flokkur = c[3], upphaed = toInt(c[4]) * 1000;
        if (!nafn || !upphaed) continue;
        push({ nafn, sjodur: 'Tækniþróunarsjóður', flokkur, upphaed, ar: +ar, verkefni, heimild: 'gamli.rannis.is/Tækniþróunarsjóður' });
      }
      await sleep(1200);
    } catch (e) { console.log('   ! Tækni', ar, String(e.message || e).slice(0, 80)); }
  }
}

// ── keyrsla ───────────────────────────────────────────────────
async function main() {
  const SOURCES = [
    ['Kvikmyndasjóður', kvikmyndasjodur],
    ['Matvælasjóður', matvaelasjodur],
    ['Orkusjóður', orkusjodur],
    ['Uppbyggingarsjóður Vesturlands', ssvVesturland],
    ['Uppbyggingarsjóður Suðurnesja', sssSudurnes],
    ['Tækniþróunarsjóður', taeknithrounarsjodur],
  ];
  for (const [name, fn] of SOURCES) {
    const before = REC.length;
    try { await fn(); console.log('✓', name, '→', REC.length - before, 'styrkir'); }
    catch (e) { console.log('✗', name, '—', String(e.message || e).slice(0, 140)); }
  }

  // afrita-hreinsun (nafnNorm|sjóður|ár|upphæð|verkefni)
  const seen = new Set(), styrkir = [];
  for (const r of REC) {
    const k = r.nafnNorm + '|' + r.sjodur + '|' + r.ar + '|' + r.upphaed + '|' + (r.verkefni || '');
    if (seen.has(k)) continue; seen.add(k); styrkir.push(r);
  }
  styrkir.sort((a, b) => b.ar - a.ar || b.upphaed - a.upphaed);

  // yfirlit per sjóð + nafna-vísir fyrir /fyrirtaeki/-uppflettingu
  const sjodir = {};
  for (const r of styrkir) {
    const s = sjodir[r.sjodur] || (sjodir[r.sjodur] = { count: 0, total: 0, minAr: 9999, maxAr: 0 });
    s.count++; s.total += r.upphaed; s.minAr = Math.min(s.minAr, r.ar); s.maxAr = Math.max(s.maxAr, r.ar);
  }
  const byNafn = {};
  styrkir.forEach((r, i) => { (byNafn[r.nafnNorm] = byNafn[r.nafnNorm] || []).push(i); });

  const out = {
    updated: new Date().toISOString().slice(0, 10),
    count: styrkir.length,
    sjodir,
    styrkir,   // [{nafn, nafnNorm, felag, kt:null, sjodur, flokkur, upphaed, ar, verkefni, …extra, heimild}]
    byNafn,    // nafnNorm → [index] (worker: normNafn(RSK-nafn) → styrkir)
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('\nSkrifað', OUT);
  // DUAL-WRITE: workerinn (Spyrðu Karp / #fs-styrkir) les AÐEINS úr ASSETS = web/public/gogn.
  // (build_ragcopy.js afritar líka í næturkeyrslu — dual-write tryggir ferskt eintak strax héðan.)
  if (!process.env.STYRKIR_OUT) {
    const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn', 'styrkir.json');
    try { fs.mkdirSync(path.dirname(PUB), { recursive: true }); fs.writeFileSync(PUB, JSON.stringify(out)); console.log('Skrifað', PUB); }
    catch (e) { console.log('  ! dual-write í public brást:', String(e.message || e).slice(0, 80)); }
  }
  console.log('  ', out.count, 'styrkir ·', Object.keys(byNafn).length, 'einstök nöfn ·',
              Object.keys(sjodir).length, 'sjóðir');
  for (const [s, v] of Object.entries(sjodir).sort((a, b) => b[1].count - a[1].count))
    console.log('   -', s, ':', v.count, 'styrkir,', Math.round(v.total / 1e6), 'm.kr.,', v.minAr + '–' + v.maxAr);
}

main().catch(e => { console.error('VILLA', e); process.exit(1); });
