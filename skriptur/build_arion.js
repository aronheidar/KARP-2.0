// Arion banki opin gögn → gjaldmidlar.json (gengistöflur, 7 veitur) + sjodir.json (Stefnir-sjóðir m/sögu)
//
// KEYRSLA: node skriptur/build_arion.js
// Lyklar: ARION_OPENDATA_API_KEY / _CLIENT_ID / _CLIENT_SECRET — úr umhverfi (CI: GitHub secrets),
//   annars úr .env í rót repossins (gitignored). Skráning: developer.arionbanki.is
//
// Gjaldmiðlar: apigw.arionbanki.is/opendata/currency — krefst subscription-lykils + Curity-bearer
//   (client_credentials, token gildir í 300s). dateFrom/dateTo eru samþykkt en HUNSUÐ af bakenda
//   (staðfest 4.7.2026) → aðeins nýjasta skráða gengi; saga kemur áfram frá öðrum veitum.
// Stefnir: apigw.arionbanki.is/investments — subscription-lykillinn dugar einn; söguleg verð VIRKA.

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn') + path.sep;

// ── lyklar: process.env fyrst, svo .env í rót ──
function loadEnv() {
  const need = ['ARION_OPENDATA_API_KEY', 'ARION_OPENDATA_CLIENT_ID', 'ARION_OPENDATA_CLIENT_SECRET'];
  if (need.every(k => process.env[k])) return process.env;
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return process.env;
  const env = { ...process.env };
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !l.trim().startsWith('#') && !env[m[1]]) env[m[1]] = m[2];
  });
  return env;
}
const ENV = loadEnv();
const KEY = ENV.ARION_OPENDATA_API_KEY;
if (!KEY) { console.error('✗ ARION_OPENDATA_API_KEY vantar (umhverfi eða .env)'); process.exit(1); }

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
const round = (v, d) => { if (v == null || isNaN(v)) return null; const f = Math.pow(10, d); return Math.round(v * f) / f; };
async function pool(items, n, fn) { const out = []; let i = 0; async function w() { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } } await Promise.all(Array.from({ length: n }, w)); return out; }
async function getJson(url, extra) {
  const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': KEY, 'X-Request-ID': uuid(), 'Accept': 'application/json', 'User-Agent': 'KARP dashboard build (karp.is)', ...(extra || {}) } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url.replace(/\?.*/, ''));
  return r.json();
}

// ── 1) Gjaldmiðlar: token + allar 7 gengistöflur ──
async function buildGjaldmidlar() {
  const id = ENV.ARION_OPENDATA_CLIENT_ID, sec = ENV.ARION_OPENDATA_CLIENT_SECRET;
  if (!id || !sec) throw new Error('client_id/secret vantar fyrir gjaldmiðla');
  const tr = await fetch('https://curity.arionbanki.is/oauth/v2/oauth-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + Buffer.from(id + ':' + sec).toString('base64') },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });
  if (!tr.ok) throw new Error('token HTTP ' + tr.status);
  const tok = (await tr.json()).access_token;

  const SOURCES = ['Bank', 'CentralBank', 'Credit', 'Debit', 'Notes', 'Exchange', 'Toll'];
  const ORDER = ['USD', 'EUR', 'GBP', 'DKK', 'NOK', 'SEK', 'CHF', 'JPY', 'CAD', 'AUD', 'PLN'];
  const out = {};
  for (const s of SOURCES) {
    try {
      const j = await getJson(`https://apigw.arionbanki.is/opendata/currency/api/v1/currencies/ISK/rates?currencySourceQuery=${s}`, { 'Authorization': 'Bearer ' + tok });
      const rows = (j.currencyRates || []).map(r => ({ c: r.quoteCurrency, buy: round(parseFloat(r.buy), 4), sell: round(parseFloat(r.sell), 4) }))
        .sort((a, b) => { const ia = ORDER.indexOf(a.c), ib = ORDER.indexOf(b.c); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.c.localeCompare(b.c); });
      out[s] = { date: (j.currencyRates || [])[0]?.date || null, rates: rows };
      console.log('  gengistafla', s.padEnd(12), rows.length, 'gjaldmiðlar,', out[s].date);
    } catch (e) { console.log('  ⚠', s, e.message); }
  }
  if (!Object.keys(out).length) throw new Error('engin gengistafla náðist');
  return { fetched: new Date().toISOString(), source: 'Arion banki — opin gögn', sourceUrl: 'https://arionbanki.gitbook.io/arion-banki/', note: 'Nýjasta skráða gengi. Bank=almennt, CentralBank=Seðlabanki, Credit/Debit=kortagengi, Notes=seðlar, Toll=tollgengi.', sources: out };
}

// ── 2) Stefnir-sjóðir: listi + söguleg verð (~13 mán) ──
async function buildSjodir() {
  const info = await getJson('https://apigw.arionbanki.is/investments/api/v1/funds/info');
  if (!Array.isArray(info) || !info.length) throw new Error('funds/info tómt');
  console.log('  sjóðir í boði:', info.length);
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const funds = (await pool(info, 4, async f => {
    try {
      const hist = await getJson(`https://apigw.arionbanki.is/investments/api/v1/funds/${f.fundId}/historicalprices?dateFrom=${from}&dateTo=${to}`);
      if (!Array.isArray(hist) || hist.length < 2) return null;
      hist.sort((a, b) => a.date.localeCompare(b.date));
      const last = hist[hist.length - 1], lastT = new Date(last.date).getTime();
      const at = (days) => { const t = lastT - days * 864e5; let best = null; for (const h of hist) { if (new Date(h.date).getTime() <= t) best = h; else break; } return best; };
      const pct = (then) => (then && then.price ? round((last.price / then.price - 1) * 100, 2) : null);
      const y0 = hist.find(h => h.date.slice(0, 4) === last.date.slice(0, 4));
      // sparkline: ~vikuleg þynning frá endanum svo nýjasti punktur haldist alltaf
      const spark = []; for (let i = hist.length - 1; i >= 0; i -= 5) spark.push(round(hist[i].price, 2)); spark.reverse();
      // ATH: priceChangeInPercentage frá API er uppsöfnuð breyting yfir UMBEÐNA tímabilið — ekki dagsbreyting
      return {
        id: f.fundId, name: (f.name || '').replace(/^Stefnir[\s-–]*/i, '').trim() || f.name, cur: f.currency || 'ISK',
        price: round(last.price, 2), date: last.date.slice(0, 10),
        chg1d: pct(hist[hist.length - 2]), chg1y: pct(at(365)), chgYtd: y0 && y0 !== last ? pct(y0) : null,
        hist: spark
      };
    } catch (e) { console.log('  ⚠ sjóður', f.fundId, (f.name || '').slice(0, 30), e.message); return null; }
  })).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'is'));
  if (!funds.length) throw new Error('engin sjóðasaga náðist');
  console.log('  sjóðir með sögu:', funds.length, '| saga frá', from);
  return { fetched: new Date().toISOString(), source: 'Arion banki / Stefnir — opin gögn', sourceUrl: 'https://www.stefnir.is/', note: 'Gengi og ávöxtun sjóða Stefnis. hist = ~vikuleg gildi síðustu ~13 mánuði.', funds };
}

// ── keyrsla: skrifa bæði í gogn/ og web/public/gogn/ ──
(async () => {
  let ok = 0, fail = 0;
  for (const [name, fn] of [['gjaldmidlar', buildGjaldmidlar], ['sjodir', buildSjodir]]) {
    try {
      console.log(name + '…');
      const data = await fn();
      const s = JSON.stringify(data);
      fs.writeFileSync(DIR + name + '.json', s);
      fs.writeFileSync(PUB + name + '.json', s);
      console.log('✓', name + '.json |', (s.length / 1024).toFixed(1), 'KB');
      ok++;
    } catch (e) { console.error('✗', name, '—', e.message); fail++; }
  }
  if (!ok) process.exit(1);
  if (fail) console.log('⚠ lauk með', fail, 'hluta í villu —', ok, 'skrifaður');
})().catch(e => { console.error('ERR', e); process.exit(1); });
