// Google Search Console → leitarvel.json (LOTA 45) — hvaða Google-leitir skila fólki á karp.is:
// topp-fyrirspurnir, topp-síður og dagleg þróun síðustu 28 daga. Fóður í SEO-hringinn og Greiningu.
//
// AUÐKENNI (service account, engin npm-dep — JWT undirritað með node crypto):
//   1) Search Console: karp.is staðfest sem Domain property (DNS TXT í Cloudflare)
//   2) Google Cloud: Search Console API virkjað + service account + JSON-lykill
//   3) Search Console → Users → bæta service-account-netfanginu við (Restricted dugar)
//   4) Lykillinn: skrá .sc-key.json í rót repossins (gitignored) EÐA env GOOGLE_SC_KEY_JSON (innihald)
// Án lykils: sleppt með skýringu (CI-öruggt, ekki villa).
//
// KEYRSLA: node skriptur/build_leitarvel.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
// Property-tegundin skiptir máli: Domain-property = sc-domain:karp.is, URL-prefix = https://karp.is/.
// Skriptan prófar þessar í röð (fyrsta sem service-accountið hefur aðgang að vinnur); KARP_SC_SITE yfirskrifar.
const SITES = process.env.KARP_SC_SITE ? [process.env.KARP_SC_SITE] : ['sc-domain:karp.is', 'https://karp.is/', 'https://www.karp.is/'];
let SITE = SITES[0];

function loadKey() {
  if (process.env.GOOGLE_SC_KEY_JSON) { try { return JSON.parse(process.env.GOOGLE_SC_KEY_JSON); } catch (e) { return null; } }
  const p = path.join(__dirname, '..', '.sc-key.json');
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
  return null;
}

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: key.token_uri, iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  const jwt = header + '.' + claims + '.' + b64u(signer.sign(key.private_key));
  const r = await fetch(key.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!r.ok) throw new Error('token HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return (await r.json()).access_token;
}

async function scQuery(tok, body, site) {
  const u = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site || SITE) + '/searchAnalytics/query';
  const r = await fetch(u, { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('SC HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return ((await r.json()).rows) || [];
}

// Finna fyrsta property sem service-accountið hefur aðgang að (403/404 = rangt/óheimilt → næsta)
async function pickSite(tok, range) {
  for (const s of SITES) {
    try { await scQuery(tok, { ...range, dimensions: ['date'], rowLimit: 1 }, s); console.log('property fannst:', s); return s; }
    catch (e) { console.log('  …', s, 'svarar ekki (' + e.message.slice(0, 40) + ')'); }
  }
  throw new Error('ekkert property aðgengilegt — er service-account-netfangið komið inn undir Users í Search Console?');
}

(async () => {
  const key = loadKey();
  if (!key || !key.client_email || !key.private_key) {
    console.log('⚠ Enginn Search Console lykill (.sc-key.json / GOOGLE_SC_KEY_JSON) — sleppt. Þetta er EKKI villa.');
    return;
  }
  const tok = await accessToken(key);
  const end = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);   // SC-gögn berast með ~2 daga töf
  const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const range = { startDate: start, endDate: end };
  SITE = await pickSite(tok, range);
  const [queries, pages, daily] = await Promise.all([
    scQuery(tok, { ...range, dimensions: ['query'], rowLimit: 50 }, SITE),
    scQuery(tok, { ...range, dimensions: ['page'], rowLimit: 30 }, SITE),
    scQuery(tok, { ...range, dimensions: ['date'], rowLimit: 30 }, SITE),
  ]);
  const rnd = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
  const mk = (r, kName) => ({ [kName]: r.keys[0], clicks: r.clicks, impr: r.impressions, ctr: rnd(r.ctr * 100, 1), pos: rnd(r.position, 1) });
  const out = {
    updated: new Date().toISOString(), site: SITE, range,
    source: 'Google Search Console API',
    totals: daily.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions }), { clicks: 0, impr: 0 }),
    daily: daily.map((r) => ({ d: r.keys[0], clicks: r.clicks, impr: r.impressions })).sort((a, b) => a.d.localeCompare(b.d)),
    queries: queries.map((r) => mk(r, 'q')),
    pages: pages.map((r) => mk(r, 'p')),
  };
  const s = JSON.stringify(out);
  fs.writeFileSync(DIR + 'leitarvel.json', s);
  fs.mkdirSync(PUB, { recursive: true });
  fs.writeFileSync(path.join(PUB, 'leitarvel.json'), s);
  console.log('leitarvel.json:', out.queries.length, 'fyrirspurnir |', out.totals.clicks, 'smellir /', out.totals.impr, 'birtingar (' + start + '–' + end + ')');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
