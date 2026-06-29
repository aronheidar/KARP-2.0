// Raunvirði / verðkennitölur skráðra félaga — markaðsvirði vs bókfært eigið fé.
// Yahoo quoteSummary (þarf crumb+cookie handshake) → markaðsvirði, V/H, hagnaður, ROE.
// V/I (P/B) frá Yahoo er RÉTT fyrir félög sem gera upp í ISK, en RANGT fyrir EUR/USD-uppgjör
// (Yahoo blandar gjaldmiðlum) → fyrir þau reiknum við V/I = markaðsvirði_ISK / (eigið fé × gengi)
// með staðfestu eigin fé úr uppgjörum. Build-time (Yahoo CORS-læst í vafra).
// Keyra: node skriptur/build_raunvirdi.js  →  svo node build_embed.js
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Skráð félög á aðalmarkaði (ticker → nafn). OLGERD sleppt í bili (Yahoo 404 eftir nafnabreytingu í Bera hf.).
const COS = [
  ['ARION', 'Arion banki'], ['ISB', 'Íslandsbanki'], ['KVIKA', 'Kvika banki'], ['SJOVA', 'Sjóvá'], ['SKAGI', 'Skagi'],
  ['SIMINN', 'Síminn'], ['SYN', 'Sýn'], ['NOVA', 'Nova'], ['HAGA', 'Hagar'], ['FESTI', 'Festi'], ['SKEL', 'Skel'],
  ['BRIM', 'Brim'], ['SVN', 'Síldarvinnslan'], ['HAMP', 'Hampiðjan'], ['ICEAIR', 'Icelandair'], ['EIM', 'Eimskip'],
  ['REITIR', 'Reitir'], ['EIK', 'Eik'], ['ALVO', 'Alvotech'], ['AMRQ', 'Amaroq']
];
// Erlend uppgjör → staðfest eigið fé (úr ársreikningum, í uppgjörsgjaldmiðli). Notað til að leiðrétta V/I.
// Þau sem ekki eru hér og gera upp í ISK nota Yahoo-V/I beint.
const FOREIGN = {
  BRIM: { ccy: 'EUR', equity: 521.32e6 }, SVN: { ccy: 'EUR', equity: 625.86e6 }, EIM: { ccy: 'EUR', equity: 297.95e6 },
  HAMP: { ccy: 'EUR' }, ICEAIR: { ccy: 'USD' }, AMRQ: { ccy: 'GBP' }, ALVO: { ccy: 'USD' } // án equity → V/I sleppt
};

const num = x => (x && typeof x.raw === 'number') ? x.raw : (typeof x === 'number' ? x : null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function yahooAuth() {
  let cookie = '';
  try {
    const r0 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const sc = r0.headers.get('set-cookie');
    if (sc) cookie = sc.split(/,(?=\s*[A-Za-z0-9_]+=)/).map(s => s.split(';')[0].trim()).join('; ');
  } catch (e) {}
  const rc = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, 'Cookie': cookie } });
  const crumb = (await rc.text()).trim();
  return { cookie, crumb };
}

async function fetchFund(tk, auth) {
  const url = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + tk + '.IC'
    + '?modules=defaultKeyStatistics,financialData,price,summaryDetail&crumb=' + encodeURIComponent(auth.crumb);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': auth.cookie } });
  if (!r.ok) return { _err: r.status };
  const j = await r.json();
  const res = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
  if (!res) return { _err: 'no-result' };
  const ks = res.defaultKeyStatistics || {}, fd = res.financialData || {}, pr = res.price || {}, sd = res.summaryDetail || {};
  return {
    mcap: num(pr.marketCap), shares: num(ks.sharesOutstanding),
    pe: num(sd.trailingPE), eps: num(ks.trailingEps), ni: num(ks.netIncomeToCommon),
    pbYahoo: num(ks.priceToBook), bvpsYahoo: num(ks.bookValue), roe: num(fd.returnOnEquity), rev: num(fd.totalRevenue)
  };
}

(async () => {
  console.log('Yahoo auth (crumb)…');
  const auth = await yahooAuth();
  console.log('  crumb:', JSON.stringify(auth.crumb).slice(0, 24), '| cookie len:', auth.cookie.length);
  if (!auth.crumb || auth.crumb.length > 40 || /Unauthorized|error/i.test(auth.crumb)) {
    console.error('CRUMB FAIL — gat ekki sótt crumb:', auth.crumb); process.exit(2);
  }
  // gengi til að leiðrétta erlent eigið fé
  let eurIsk = null, usdIsk = null, gbpIsk = null;
  try {
    const fx = await (await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=ISK,USD,GBP')).json();
    eurIsk = fx.rates.ISK; usdIsk = eurIsk / fx.rates.USD; gbpIsk = eurIsk / fx.rates.GBP;
    console.log('FX EUR/ISK', Math.round(eurIsk), 'USD/ISK', Math.round(usdIsk));
  } catch (e) { console.log('FX sókn mistókst'); }
  const fxOf = c => c === 'EUR' ? eurIsk : c === 'USD' ? usdIsk : c === 'GBP' ? gbpIsk : null;

  const out = {};
  let ok = 0, fail = 0;
  for (const [tk, name] of COS) {
    const f = await fetchFund(tk, auth);
    if (f._err) { console.log('  ✗', tk, f._err); fail++; await sleep(250); continue; }
    const fo = FOREIGN[tk];
    let pb = null, pbBasis = 'yahoo';
    if (!fo) { pb = f.pbYahoo; }                              // ISK-uppgjör → Yahoo V/I rétt
    else if (fo.equity && f.mcap && fxOf(fo.ccy)) { pb = f.mcap / (fo.equity * fxOf(fo.ccy)); pbBasis = 'reiknað'; }
    else { pb = null; pbBasis = 'gjaldmiðill'; }              // erlent án staðfests eigin fjár → sleppa
    // bókfært virði á hlut (ISK) — fyrir „reiknað virði"-línu á kertaritinu
    let bvps = null;
    if (!fo && f.bvpsYahoo) bvps = Math.round(f.bvpsYahoo);                                    // ISK-uppgjör → Yahoo bókfært virði/hlut
    else if (fo && fo.equity && f.shares && fxOf(fo.ccy)) bvps = Math.round(fo.equity * fxOf(fo.ccy) / f.shares); // erlent → reikna í ISK
    out[tk] = {
      name: name, mcap: f.mcap, shares: f.shares,
      pe: (f.pe && f.pe > 0 && f.pe < 200) ? +f.pe.toFixed(1) : null,
      pb: (pb && pb > 0 && pb < 50) ? +pb.toFixed(2) : null, pbBasis: pbBasis,
      bvps: (bvps && bvps > 0) ? bvps : null,
      roe: (f.roe != null) ? +(f.roe * 100).toFixed(1) : null,
      ni: f.ni, rev: f.rev, ccy: fo ? fo.ccy : 'ISK'
    };
    console.log('  ✓', tk, 'mcap', f.mcap ? Math.round(f.mcap / 1e9) + 'ma' : '—', 'V/H', out[tk].pe || '—', 'V/I', out[tk].pb || '—');
    ok++;
    await sleep(250);
  }
  const data = { updated: new Date().toISOString().slice(0, 10), source: 'Yahoo Finance + uppgjör félaga', eurIsk: eurIsk ? Math.round(eurIsk) : null, companies: out };
  fs.writeFileSync(DIR + 'gogn/raunvirdi.json', JSON.stringify(data));
  console.log('raunvirdi.json:', ok, 'félög OK,', fail, 'vantar | bytes', fs.statSync(DIR + 'gogn/raunvirdi.json').size);
})().catch(e => { console.error('ERR', e); process.exit(1); });
