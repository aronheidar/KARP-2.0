// Viðhorfsgreining á fjölmiðlaumfjöllun um íslensk fyrirtæki → gogn/sentiment.json.
// Claude (Haiku) gefur hverri fyrirsögn einkunn (-1 neikvætt / 0 hlutlaust / +1 jákvætt) GAGNVART
// fyrirtækinu. Aggregat = viðhorfsvísitala per félag (-100..+100). Byggt á nýlegri RSS-umfjöllun.
// STRANGT: aðeins flokkun á RAUNVERULEGUM fyrirsögnum, enginn skáldskapur (borgaratól).
//
// KEYRSLA:
//   $env:ANTHROPIC_API_KEY='sk-ant-...'; node skriptur/build_sentiment.js  →  node build_embed.js
// SKYNDIMINNI: gogn/sentiment_cache.json (lykill = hash fyrirsagnar) → aðeins NÝjar fyrirsagnir
//   kalla API. Þannig kostar endurnýjun nær ekkert (Haiku ~nokkrar kr/keyrslu) og eldra heldur sér.
// MODEL: claude-haiku-4-5 (ódýrt, nóg fyrir flokkun). set KARP_SENTIMENT_MODEL=... til að skipta.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const MODEL = process.env.KARP_SENTIMENT_MODEL || 'claude-haiku-4-5';
const CHUNK = Math.max(8, Math.min(40, parseInt(process.env.KARP_SENTIMENT_CHUNK || '25', 10)));
const DRY = process.argv.includes('--dry'); // --dry = telja/sýna dreifingu án API-kalla
const UA = 'Mozilla/5.0 (KARP dashboard build)';

const FEEDS = [
  'https://www.mbl.is/feeds/vidskipti/', 'https://www.mbl.is/feeds/fp/', 'https://www.mbl.is/feeds/innlent/',
  'https://www.visir.is/rss/vidskipti', 'https://www.visir.is/rss/innherji', 'https://www.visir.is/rss/frettir',
  'https://www.ruv.is/rss/frettir', 'https://vb.is/rss/', 'https://heimildin.is/rss/'
];
// Sama félagalisti og FYRIRTAEKI í dashboard.html (heiti → samheiti til að passa við fyrirsagnir).
const COS = [
  { n: 'Arion banki', a: ['Arion banki', 'Arion'] }, { n: 'Íslandsbanki', a: ['Íslandsbanki', 'Islandsbanki'] },
  { n: 'Kvika banki', a: ['Kvika'] }, { n: 'Sjóvá', a: ['Sjóvá', 'Sjova'] }, { n: 'Skagi (VÍS)', a: ['Skagi hf', 'VÍS', 'Vátryggingafélag Íslands'] },
  { n: 'Síminn', a: ['Síminn hf', 'Símans', 'Símanum'] }, { n: 'Sýn', a: ['Sýn hf', 'Vodafone', 'Stöð 2'] }, { n: 'Nova', a: ['Nova'] },
  { n: 'Hagar', a: ['Hagar hf', 'Bónus', 'Hagkaup'] }, { n: 'Festi', a: ['Festi hf', 'Elko', 'Krónunni'] }, { n: 'Skel', a: ['Skel fjárfesting', 'Skeljungur', 'Orkan', 'Olís', 'Heimkaup'] },
  { n: 'Ölgerðin', a: ['Ölgerðin', 'Egils'] }, { n: 'Brim', a: ['Brim hf', 'Brim í'] }, { n: 'Síldarvinnslan', a: ['Síldarvinnslan'] },
  { n: 'Hampiðjan', a: ['Hampiðjan'] }, { n: 'Icelandair', a: ['Icelandair', 'Flugleiðir'] }, { n: 'Eimskip', a: ['Eimskip'] },
  { n: 'JBT Marel', a: ['Marel'] }, { n: 'Reitir', a: ['Reitir fasteigna'] }, { n: 'Eik', a: ['Eik fasteigna'] },
  { n: 'Alvotech', a: ['Alvotech'] }, { n: 'Amaroq', a: ['Amaroq'] },
  { n: 'Landsvirkjun', a: ['Landsvirkjun', 'Landsvirkjunar'] }, { n: 'Isavia', a: ['Isavia'] }, { n: 'Orkuveita Reykjavíkur', a: ['Orkuveit', 'Veitur', 'Orka náttúrunnar'] },
  { n: 'Landsnet', a: ['Landsnet'] }, { n: 'Samkaup', a: ['Samkaup', 'Nettó', 'Kjörbúðin'] }, { n: 'Costco', a: ['Costco'] }, { n: 'IKEA', a: ['IKEA'] },
  { n: 'Norðurál', a: ['Norðurál', 'Nordural'] }, { n: 'Rio Tinto (ISAL)', a: ['Rio Tinto', 'álverið í Straumsvík', 'ISAL'] },
  { n: 'Play', a: ['Fly Play', 'PLAY flug'] }, { n: 'CCP Games', a: ['CCP Games', 'EVE Online'] }, { n: 'Össur', a: ['Össur'] },
  { n: 'Indó', a: ['Indó banki', 'Indó'] }
];

const dec = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const hash = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);

function parseRss(xml) {
  const items = []; const re = /<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/g; let m;
  while ((m = re.exec(xml))) {
    const it = m[0];
    const title = dec((it.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    let link = dec((it.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1] || '');
    if (!link) { const lm = it.match(/<link[^>]*href="([^"]+)"/); if (lm) link = lm[1]; }
    const desc = dec((it.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1] || '');
    const dt = dec((it.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/) || [])[1] || '');
    let ts = dt ? Math.floor(Date.parse(dt) / 1000) : 0; if (!ts || isNaN(ts)) ts = Math.floor(Date.now() / 1000);
    if (title && link) items.push({ title, link, hay: (title + ' ' + desc).toLowerCase(), ts });
  }
  return items;
}
async function fetchFeed(u) { try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (!r.ok) return []; return parseRss(await r.text()); } catch (e) { return []; } }
// Orðamarka-samsvörun: samheiti verður að vera HEILT orð (ekki hluti af lengra orði) — kemur í veg fyrir
// "vís"→"vísir/vísitala", "sýn"→"sýnir", "festi"→"festir" o.s.frv. (\p{L}\p{N} = bókstafur/tölustafur).
function reB(a) { return new RegExp('(?:^|[^\\p{L}\\p{N}])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^\\p{L}\\p{N}]|$)', 'u'); }
function matchAny(hay, aliasesLc) { return aliasesLc.some(a => a.length >= 3 && reB(a).test(hay)); }

const SYSTEM = 'Þú metur tón frétta-fyrirsagna GAGNVART tilteknu fyrirtæki fyrir hlutlausa fjölmiðlavöktun. '
  + 'Gefðu hverri fyrirsögn: -1 ef hún er neikvæð fyrir fyrirtækið (tap, gagnrýni, rannsókn, uppsagnir, lögbrot, sektir, slys), '
  + '+1 ef jákvæð (hagnaður, vöxtur, verðlaun, ný viðskipti, fjárfesting, ráðningar), 0 ef hlutlaus/fréttnæm án skýrrar afstöðu. '
  + 'Svaraðu AÐEINS með JSON-fylki af tölum (-1, 0 eða 1), einni fyrir hverja fyrirsögn í sömu röð. Ekkert annað.';
async function scoreBatch(client, company, titles) {
  const user = 'Fyrirtæki: ' + company + '\nFyrirsagnir:\n' + titles.map((h, i) => (i + 1) + '. ' + h).join('\n');
  const msg = await client.messages.create({ model: MODEL, max_tokens: 800, system: SYSTEM, messages: [{ role: 'user', content: user }] });
  const txt = ((msg.content || []).find(x => x.type === 'text') || {}).text || '';
  const arr = JSON.parse((txt.match(/\[[\s\S]*\]/) || ['[]'])[0]);
  return arr.map(x => Math.max(-1, Math.min(1, Math.round(+x || 0))));
}

(async () => {
  const all = []; const seen = {};
  for (const f of FEEDS) { const items = await fetchFeed(f); items.forEach(it => { if (!seen[it.link]) { seen[it.link] = 1; all.push(it); } }); }
  console.log('RSS fréttir:', all.length);

  // Fréttasafn (Wayback-bakvistun) → skora ALLA söguna (jan–jún), ekki bara nýlega RSS.
  const bfPath = DIR + 'backfill.json';
  if (fs.existsSync(bfPath)) {
    let bf = []; try { bf = JSON.parse(fs.readFileSync(bfPath, 'utf8')); } catch (e) {}
    let added = 0;
    bf.forEach(r => { const link = r.url; if (!link || seen[link]) return; seen[link] = 1; all.push({ title: r.title, link, hay: String(r.title || '').toLowerCase(), ts: r.ts }); added++; });
    console.log('Fréttasafn backfill.json:', bf.length, '(+' + added + ' ný) → pool alls:', all.length);
  } else { console.log('(backfill.json fannst ekki — aðeins RSS.)'); }

  const cachePath = DIR + 'sentiment_cache.json';
  let cache = {}; if (fs.existsSync(cachePath)) { try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {} }

  const perCo = {};
  COS.forEach(c => { const al = c.a.map(x => x.toLowerCase()); const matched = all.filter(it => matchAny(it.hay, al)); if (matched.length) perCo[c.n] = matched; });
  const totalMatched = Object.keys(perCo).reduce((a, n) => a + perCo[n].length, 0);

  const need = []; Object.keys(perCo).forEach(n => { perCo[n].forEach(it => { const h = hash(it.title); if (cache[h] == null) need.push(h); }); });
  console.log('Fyrirtæki með umfjöllun:', Object.keys(perCo).length, '| fyrirsagnir sem passa:', totalMatched, '| nýjar að skora:', need.length, '| model:', MODEL, '| chunk:', CHUNK);

  if (DRY) {
    console.log('\n--dry: engin API-köll. Dreifing per félag (fjöldi fyrirsagna):');
    Object.keys(perCo).sort((a, b) => perCo[b].length - perCo[a].length).forEach(n => console.log('  ' + String(perCo[n].length).padStart(5) + '  ' + n));
  } else if (need.length && !process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠ ANTHROPIC_API_KEY vantar — sleppi skorun (eldra skyndiminni heldur). Settu lykilinn og keyrðu aftur. (EKKI villa.)');
  } else if (need.length) {
    let Anthropic; try { const p = require('@anthropic-ai/sdk'); Anthropic = p.Anthropic || p.default || p; }
    catch (e) { console.error('Vantar @anthropic-ai/sdk: npm install @anthropic-ai/sdk'); process.exit(1); }
    const client = new Anthropic();
    let scored = 0;
    for (const n of Object.keys(perCo)) {
      const todo = perCo[n].filter(it => cache[hash(it.title)] == null);
      if (!todo.length) continue;
      for (let i = 0; i < todo.length; i += CHUNK) {
        const batch = todo.slice(i, i + CHUNK);
        try { const scores = await scoreBatch(client, n, batch.map(x => x.title)); batch.forEach((x, j) => { cache[hash(x.title)] = (scores[j] != null ? scores[j] : 0); }); }
        catch (e) { batch.forEach(x => { cache[hash(x.title)] = 0; }); console.log('  ✗', n, e.message); }
        scored += batch.length;
      }
      fs.writeFileSync(cachePath, JSON.stringify(cache));
      console.log('  ✓ ' + n + ' (' + todo.length + ' nýjar, ' + perCo[n].length + ' alls)  [' + scored + '/' + need.length + ']');
    }
  }

  const out = {};
  Object.keys(perCo).forEach(n => {
    const items = perCo[n]; let sum = 0, cnt = 0, pos = 0, neu = 0, neg = 0;
    items.forEach(it => { const s = cache[hash(it.title)]; if (s == null) return; sum += s; cnt++; if (s > 0) pos++; else if (s < 0) neg++; else neu++; });
    const recent = items.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).filter(it => cache[hash(it.title)] != null).slice(0, 8).map(it => ({ t: it.title, l: it.link, s: cache[hash(it.title)] }));
    if (cnt) out[n] = { idx: Math.round(sum / cnt * 100), n: cnt, pos: pos, neu: neu, neg: neg, recent: recent };
  });
  if (DRY) { console.log('\n--dry: skrifa EKKI sentiment.json (engin ný skor). Heildar-fyrirsagnir:', totalMatched); return; }
  const data = { updated: new Date().toISOString().slice(0, 10), model: MODEL, scope: 'frettasafn-2026', companies: out };
  fs.writeFileSync(DIR + 'sentiment.json', JSON.stringify(data));
  console.log('\nsentiment.json:', Object.keys(out).length, 'félög | bytes', fs.statSync(DIR + 'sentiment.json').size);
  Object.keys(out).sort((a, b) => out[b].n - out[a].n).slice(0, 8).forEach(n => console.log('  ' + n + '  idx ' + (out[n].idx > 0 ? '+' : '') + out[n].idx + '  (n=' + out[n].n + ', ' + out[n].pos + '+ ' + out[n].neu + '~ ' + out[n].neg + '-)'));
})().catch(e => { console.error('ERR', e); process.exit(1); });
