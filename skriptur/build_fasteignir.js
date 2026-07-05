// Fasteignaverð — vinnur HMS kaupskrá (öll þinglýst kaup frá 2006, endurnýjuð næturlega) í
// mánaðarlega samantekt: miðgildi kaupverðs + verð á m² + fjöldi kaupsamninga, höfuðborgarsvæði
// vs landsbyggð. → gogn/fasteignir.json (bakað).
//
// KEYRSLA: node skriptur/build_fasteignir.js   (sækir ~45MB → tekur 1–2 mín) → svo node build_embed.js
//
// GÖGN: kaupskra.csv er `;`-aðskilið, ISO-8859-1 (latin1), \r\n. Aðeins NOTHÆFIR samningar
//   (ONOTHAEFUR_SAMNINGUR="0") og íbúðarhúsnæði (Fjölbýli/Sérbýli/Einbýli) — atvinnu-/sumarhús sleppt.
//   Verð (KAUPVERD) er í þús.kr. Miðgildi notað (robust gegn útlögum).

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const URL = 'https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/kaupskra.csv';
const CAPITAL = new Set(['Reykjavíkurborg', 'Kópavogsbær', 'Hafnarfjarðarkaupstaður', 'Garðabær', 'Mosfellsbær', 'Seltjarnarnesbær', 'Kjósarhreppur']);
const RESID = new Set(['Fjölbýli', 'Sérbýli', 'Einbýli']);
function median(a) { if (!a.length) return null; a.sort((x, y) => x - y); var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function pctl(a, q) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); }
function summ(a) { return a.length ? { m2: Math.round(median(a.slice())), p25: pctl(a, .25), p75: pctl(a, .75), n: a.length } : null; }

(async () => {
  console.log('sæki HMS kaupskrá (~45MB)…');
  const r = await fetch(URL, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = Buffer.from(await r.arrayBuffer()).toString('latin1');
  const lines = txt.split(/\r?\n/);
  const H = lines[0].split(';').map(s => s.trim());
  const iSv = H.indexOf('SVEITARFELAG'), iDt = H.indexOf('THINGLYSTDAGS'), iKv = H.indexOf('KAUPVERD'),
    iFlm = H.indexOf('EINFLM'), iTeg = H.indexOf('TEGUND'), iOn = H.indexOf('ONOTHAEFUR_SAMNINGUR'),
    iId = H.indexOf('FAERSLUNUMER'), iHf = H.indexOf('HEIMILISFANG'), iPn = H.indexOf('POSTNR'),
    // LOTA 62: fasteignamat + brunabótamat eru ÞEGAR í kaupskránni (þús.kr) — nýtum þau
    iMat = H.indexOf('FASTEIGNAMAT_GILDANDI'), iMatN = H.indexOf('FYRIRHUGAD_FASTEIGNAMAT'),
    iBruna = H.indexOf('BRUNABOTAMAT_GILDANDI'), iAr = H.indexOf('BYGGAR'), iHerb = H.indexOf('FJHERB');

  const G = {}; // month -> {hbsv:{p:[],m:[]}, land:{p:[],m:[]}}
  const MUNI = {}; // sveitarfélag -> [{d:'YYYY-MM', v:verð/m²}]  (fyrir per-sveitarfélags verð)
  // Fasteignavaktin (LOTA 43): einstök viðskipti síðustu 180 daga m/heimilisfangi
  const NYJAST_FRA = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const nyjast = [];
  // Markaðsvísar (LOTA 66): kaupverð/fasteignamat hlutfall síðustu 12 mán (landsvísa/landshluti/sveitarfélag) + 6-mán skipting fyrir þróun
  const RAT_FRA = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const RAT_MID = new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10);
  const RAT = { nat: [], hbsv: [], land: [], muni: {}, recent: [], prior: [] };
  let total = 0, kept = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(';'); if (c.length < H.length) continue; total++;
    if ((c[iOn] || '').trim() !== '0') continue;                       // aðeins nothæfir samningar
    if (!RESID.has((c[iTeg] || '').trim())) continue;                 // aðeins íbúðarhúsnæði
    const kv = +c[iKv], flm = parseFloat((c[iFlm] || '').replace(',', '.'));
    if (!(kv > 0) || !(flm > 10)) continue;
    const dt = (c[iDt] || '').slice(0, 7); if (!/^\d{4}-\d{2}$/.test(dt) || dt < '2006-01') continue;
    const ppm2 = kv / flm; if (ppm2 < 20 || ppm2 > 5000) continue;     // sía út augljóst rugl (þús.kr/m²)
    const reg = CAPITAL.has((c[iSv] || '').trim()) ? 'hbsv' : 'land';
    const g = (G[dt] = G[dt] || { hbsv: { p: [], m: [] }, land: { p: [], m: [] } });
    g[reg].p.push(kv / 1000); g[reg].m.push(ppm2);                     // verð → m.kr, verð/m² → þús.kr
    const svn = (c[iSv] || '').trim(); if (svn) (MUNI[svn] = MUNI[svn] || []).push({ d: dt, v: ppm2, t: (c[iTeg] || '').trim(), r: reg });
    kept++;
    // Fasteignavaktin: full dagsetning + heimilisfang fyrir nýjustu viðskipti
    const dFull = (c[iDt] || '').slice(0, 10);
    // markaðsvísir: hlutfall kaupverðs/gildandi fasteignamats (síðustu 12 mán)
    if (dFull >= RAT_FRA) {
      const matG = +c[iMat] || 0;
      if (matG > 0) { const ratio = kv / matG; if (ratio > 0.2 && ratio < 5) { RAT.nat.push(ratio); RAT[reg].push(ratio); if (svn) (RAT.muni[svn] = RAT.muni[svn] || []).push(ratio); (dFull >= RAT_MID ? RAT.recent : RAT.prior).push(ratio); } }
    }
    if (dFull >= NYJAST_FRA) {
      const mat = +c[iMat] || null, matN = +c[iMatN] || null, bruna = +c[iBruna] || null, ar = +c[iAr] || null, herb = +c[iHerb] || null;
      nyjast.push({
        id: (c[iId] || '').trim(), d: dFull, a: (c[iHf] || '').trim(), pn: (c[iPn] || '').trim(),
        sv: svn, v: kv, fm: Math.round(flm * 10) / 10, t: (c[iTeg] || '').trim(),
        mat, matN, bruna, ar, herb,   // fasteignamat (gildandi/fyrirhugað), brunabótamat, byggingarár, herbergi — allt þús.kr / ár
      });
    }
  }

  const months = Object.keys(G).sort().map(dt => {
    const h = G[dt].hbsv, l = G[dt].land;
    return {
      m: dt,
      hbsv: { n: h.p.length, vp: Math.round(median(h.p.slice()) * 10) / 10, m2: Math.round(median(h.m.slice())) },
      land: { n: l.p.length, vp: Math.round(median(l.p.slice()) * 10) / 10, m2: Math.round(median(l.m.slice())) }
    };
  });
  // sleppa allra-nýjasta mánuði ef hann er hálfur (fáir samningar enn þinglýstir) → forðast falska dýfu
  if (months.length > 2) {
    const lastN = months[months.length - 1], avgN = months.slice(-13, -1).reduce((a, x) => a + x.hbsv.n + x.land.n, 0) / 12;
    if ((lastN.hbsv.n + lastN.land.n) < avgN * 0.4) { console.log('sleppi hálfum nýjasta mánuði', lastN.m); months.pop(); }
  }

  // per-sveitarfélag + per-tegund: miðgildi/fjórðungar verð/m² síðustu 12 mánaða → verðmat. .m2 efst = öll íbúð. (samhæft við svHouse)
  const lastM = months[months.length - 1].m, lp = lastM.split('-'), lastIdx = (+lp[0]) * 12 + (+lp[1]) - 1, startIdx = lastIdx - 11;
  const inWin = d => { const p = d.split('-'), idx = (+p[0]) * 12 + (+p[1]) - 1; return idx >= startIdx && idx <= lastIdx; };
  const TYPES = ['Fjölbýli', 'Sérbýli', 'Einbýli'];
  const byMuni = {};
  Object.keys(MUNI).forEach(sv => {
    const recs = MUNI[sv].filter(x => inWin(x.d)), all = recs.map(x => x.v);
    if (all.length < 8) return;
    const o = summ(all), types = {};
    TYPES.forEach(tp => { const tv = recs.filter(x => x.t === tp).map(x => x.v); if (tv.length >= 5) types[tp] = summ(tv); });
    o.types = types; byMuni[sv] = o;
  });
  // landshluta-fallback per tegund (nóg gögn alltaf) — notað þegar sveitarfélag/tegund hefur of fá kaup
  const byRegionType = { hbsv: {}, land: {} };
  ['hbsv', 'land'].forEach(rg => {
    const recs = [];
    Object.keys(MUNI).forEach(sv => MUNI[sv].forEach(x => { if (x.r === rg && inWin(x.d)) recs.push(x); }));
    byRegionType[rg].all = summ(recs.map(x => x.v));
    TYPES.forEach(tp => { const s = summ(recs.filter(x => x.t === tp).map(x => x.v)); if (s) byRegionType[rg][tp] = s; });
  });

  // ── Markaðsvísar (LOTA 66): yfir/undir fasteignamati + verðþróun (upp/niður) ──
  const pctAbove = (arr) => (arr.length ? Math.round((median(arr.slice()) - 1) * 1000) / 10 : null); // % yfir(+)/undir(−) mati
  const matStats = {
    updated: lastM, window: '12 mán',
    national: { pct: pctAbove(RAT.nat), n: RAT.nat.length },
    hbsv: { pct: pctAbove(RAT.hbsv), n: RAT.hbsv.length },
    land: { pct: pctAbove(RAT.land), n: RAT.land.length },
    // þróun hlutfallsins: nýrri 6 mán vs eldri 6 mán (prósentustig) → er markaðurinn að hitna?
    trend: (RAT.recent.length >= 20 && RAT.prior.length >= 20) ? Math.round((median(RAT.recent.slice()) - median(RAT.prior.slice())) * 1000) / 10 : null,
    byMuni: {},
  };
  Object.keys(RAT.muni).forEach(sv => { if (RAT.muni[sv].length >= 8) matStats.byMuni[sv] = { pct: pctAbove(RAT.muni[sv]), n: RAT.muni[sv].length }; });
  // verðþróun: 3 og 12 mán breyting á vegnu miðgildi verðs/m² (hbsv+land vegið eftir fjölda kaupa)
  const wM2 = (m) => { const tot = m.hbsv.n + m.land.n || 1; return (m.hbsv.m2 * m.hbsv.n + m.land.m2 * m.land.n) / tot; };
  const mLast = months[months.length - 1], m3 = months[months.length - 4], m12 = months[months.length - 13];
  const chgP = (from, to) => (from && to ? Math.round((wM2(to) / wM2(from) - 1) * 1000) / 10 : null);
  const chg3 = chgP(m3, mLast), chg12 = chgP(m12, mLast);
  let verdict = 'flat';
  if (chg3 != null) { if (chg3 >= 1) verdict = 'up'; else if (chg3 <= -1) verdict = (chg12 != null && chg12 > 1) ? 'cooling' : 'down'; }
  const direction = { chg3, chg12, verdict, updated: lastM };

  const out = {
    source: 'Húsnæðis- og mannvirkjastofnun (HMS) — kaupskrá',
    sourceUrl: 'https://www.hms.is',
    note: 'Miðgildi þinglýstra kaupsamninga um íbúðarhúsnæði (fjölbýli/sérbýli/einbýli), nothæfir samningar. Verð á m² í þús.kr, heildarverð í m.kr.',
    months: months,
    byMuni: byMuni, byRegionType: byRegionType, byMuniWindow: months[Math.max(0, months.length - 12)].m + '–' + lastM,
    matStats, direction
  };
  fs.writeFileSync(DIR + 'fasteignir.json', JSON.stringify(out));
  // public-afrit (LOTA 51): verðmatið á /vaktir/ og Spyrðu-Karp-RAG sækja skrána á keyrslutíma
  fs.mkdirSync(path.join(__dirname, '..', 'web', 'public', 'gogn'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'web', 'public', 'gogn', 'fasteignir.json'), JSON.stringify(out));
  console.log('skrár alls:', total, '| nothæf íbúðakaup:', kept, '| mánuðir:', months.length, '| bytes:', fs.statSync(DIR + 'fasteignir.json').size);
  console.log('nýjasti mánuður:', JSON.stringify(months[months.length - 1]));

  // ── Fasteignavaktin (LOTA 43): kaupskra_nyjast.json — einstök viðskipti m/heimilisfangi ──
  nyjast.sort((a, b) => b.d.localeCompare(a.d) || a.a.localeCompare(b.a, 'is'));
  const outN = {
    updated: new Date().toISOString(), from: NYJAST_FRA, n: nyjast.length,
    source: 'HMS — kaupskrá (þinglýst kaup, íbúðarhúsnæði, nothæfir samningar)',
    note: 'v = kaupverð í þús.kr. Þinglýsing berst með nokkurra daga/vikna töf.',
    rows: nyjast,
  };
  const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(PUB, { recursive: true });
  const sN = JSON.stringify(outN);
  fs.writeFileSync(DIR + 'kaupskra_nyjast.json', sN);
  fs.writeFileSync(path.join(PUB, 'kaupskra_nyjast.json'), sN);
  console.log('kaupskra_nyjast.json:', nyjast.length, 'viðskipti frá', NYJAST_FRA, '|', (sN.length / 1024).toFixed(0), 'KB');
})().catch(e => { console.error('ERR', e); process.exit(1); });
