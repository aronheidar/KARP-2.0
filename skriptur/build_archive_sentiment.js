// Skorar TÓN hverrar fréttar í fréttasafninu (wp_karp_news.sentiment = -1/0/1) með Claude Haiku,
// svo viðhorf reiknist fyrir HVAÐA leit sem er (ekki bara fyrirfram skráð félög).
// Sækir óskorað gegnum GET /newsunscored → skorar → ýtir til baka með POST /newsscore.
// ENDURRÆSANLEGT (sækir bara það sem er enn NULL) + skyndiminni (gogn/archive_sentiment_cache.json).
//
// FORSENDA: uppfærð karp-frettir.php (sentiment-dálkur + /newsunscored + /newsscore) komin í loftið.
// KEYRSLA (PowerShell):
//   $env:ANTHROPIC_API_KEY='sk-ant-...'; $env:KARP_IMPORT_KEY='<lykill>'; node skriptur/build_archive_sentiment.js
//   (valfrjálst) $env:KARP_WP_URL='https://karp.is'
// Lyklar AÐEINS úr umhverfisbreytum — aldrei í skrá.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const BASE = (process.env.KARP_WP_URL || 'https://karp.is').replace(/\/+$/, '');
const KEY = process.env.KARP_IMPORT_KEY || '';
const MODEL = process.env.KARP_SENTIMENT_MODEL || 'claude-haiku-4-5';
const CHUNK = 25, CONC = 4, PAGE = 500;
const hash = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SYSTEM = 'Þú metur heildartón íslenskra frétta-fyrirsagna fyrir hlutlausa fjölmiðlavöktun. '
  + 'Gefðu hverri fyrirsögn: +1 ef JÁKVÆÐ frétt (vöxtur, hagnaður, árangur, verðlaun, samningar, opnun, framfarir, sigrar), '
  + '-1 ef NEIKVÆÐ (tap, gagnrýni, rannsókn, uppsagnir, slys, glæpur, sektir, deilur, hörmungar, andlát, veikindi), '
  + '0 ef HLUTLAUS/fréttnæm án skýrrar afstöðu. '
  + 'Svaraðu AÐEINS með JSON-fylki af tölum (-1, 0 eða 1), einni fyrir hverja fyrirsögn í sömu röð. Ekkert annað.';

async function scoreChunk(client, titles) {
  const user = 'Fyrirsagnir:\n' + titles.map((h, i) => (i + 1) + '. ' + h).join('\n');
  for (let a = 0; a < 4; a++) {
    try {
      const msg = await client.messages.create({ model: MODEL, max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content: user }] });
      const txt = ((msg.content || []).find(x => x.type === 'text') || {}).text || '';
      const arr = JSON.parse((txt.match(/\[[\s\S]*\]/) || ['[]'])[0]);
      return titles.map((_, i) => Math.max(-1, Math.min(1, Math.round(+arr[i] || 0))));
    } catch (e) { if (a === 3) throw e; await sleep(1500 * (a + 1)); }
  }
}

async function api(method, pathq, body) {
  const resp = await fetch(BASE + pathq, {
    method, headers: { 'Content-Type': 'application/json', 'X-Karp-Import-Key': KEY },
    body: body ? JSON.stringify(body) : undefined
  });
  if (resp.status === 401 || resp.status === 403) { console.error('HEIMILD HAFNAÐ (' + resp.status + ') — er ný karp-frettir.php (/newsscore) komin í loftið og lykillinn réttur?'); process.exit(2); }
  const txt = await resp.text();
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + txt.slice(0, 160));
  return JSON.parse(txt);
}

(async () => {
  if (!KEY) { console.error('Vantar KARP_IMPORT_KEY.'); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Vantar ANTHROPIC_API_KEY.'); process.exit(1); }
  let Anthropic; try { const p = require('@anthropic-ai/sdk'); Anthropic = p.Anthropic || p.default || p; }
  catch (e) { console.error('Vantar @anthropic-ai/sdk: npm install @anthropic-ai/sdk'); process.exit(1); }
  const client = new Anthropic();

  const cachePath = DIR + 'archive_sentiment_cache.json';
  let cache = {}; if (fs.existsSync(cachePath)) { try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {} }

  let totalScored = 0, page = 0, apiCalls = 0;
  while (true) {
    const d = await api('GET', '/wp-json/karp/v1/newsunscored?limit=' + PAGE);
    const items = d.items || [];
    if (!items.length) { console.log('Allt skorað. Eftir óskorað:', d.remaining); break; }
    page++;
    const need = items.filter(it => cache[hash(it.title)] == null);
    for (let i = 0; i < need.length; i += CHUNK * CONC) {
      const group = [];
      for (let j = 0; j < CONC && i + j * CHUNK < need.length; j++) {
        const batch = need.slice(i + j * CHUNK, i + (j + 1) * CHUNK);
        if (batch.length) { apiCalls++; group.push(scoreChunk(client, batch.map(x => x.title)).then(scores => { batch.forEach((x, k) => { cache[hash(x.title)] = (scores[k] != null ? scores[k] : 0); }); })); }
      }
      await Promise.all(group);
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    const scores = items.map(it => ({ id: it.id, s: cache[hash(it.title)] != null ? cache[hash(it.title)] : 0 }));
    const r = await api('POST', '/wp-json/karp/v1/newsscore', { scores });
    totalScored += r.updated || 0;
    console.log('Síða ' + page + ': ' + items.length + ' (' + need.length + ' ný via API) · uppfært ' + r.updated + ' · óskorað eftir ~' + Math.max(0, d.remaining - items.length) + ' · API-köll alls ' + apiCalls);
    await sleep(150);
  }
  console.log('\nLOKIÐ. Uppfærðar (þessi keyrsla):', totalScored, '· API-köll:', apiCalls);
  console.log('Prófaðu: ' + BASE + '/wp-json/karp/v1/firma?q=' + encodeURIComponent('Reykjavík') + '&days=200  → sjá "sentiment" svæðið');
})().catch(e => { console.error('ERR', e); process.exit(1); });
