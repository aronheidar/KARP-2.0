// Söguleg bakvistun FLEIRI miðla úr Wayback (RÚV, Vísir, Viðskiptablaðið, Mannlíf) — EINN miðill per keyrslu.
// Dagsetning: úr slóð ef til (RÚV), annars article:published_time úr HTML, annars Wayback-capture-tími.
//   node skriptur/build_backfill_more.js ruv|visir|vb|mannlif   [--titles]
//   Fasi 1 (alltaf): CDX → grein-slóðir.  Fasi 2 (--titles): sækir titil+lýsingu+dagsetningu (raun-sókn).
// → gogn/backfill_<src>.json {ts,source,title,url,desc}. Skyndiminni gogn/backfill_<src>_meta.json → ENDURRÆSANLEGT.
// Síðan: node skriptur/import_backfill.js gogn/backfill_<src>.json   (upsert í wp_karp_news).
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const UA = 'Mozilla/5.0 (KARP dashboard backfill; +karp.is)';
const CONC = 6;
const WANT = process.argv.includes('--titles');
const SEL = (process.argv[2] && process.argv[2][0] !== '-') ? process.argv[2] : '';
const SINCE = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/[­​‌‍﻿]/g, '').replace(/\s+/g, ' ').trim();

const SRC = {
  ruv: {
    name: 'RÚV', prefixes: ['ruv.is/frettir/innlent/2026', 'ruv.is/frettir/erlent/2026', 'ruv.is/frettir/vidskipti/2026'],
    isArt: u => /\/frettir\/[a-z\-]+\/20\d\d-\d\d-\d\d-/.test(u),
    urlDate: u => { const m = u.match(/\/(20\d\d)-(\d\d)-(\d\d)-/); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) / 1000) : 0; }
  },
  visir: {
    name: 'Vísir', prefixes: ['visir.is/g/2026'],
    isArt: u => { const m = u.match(/\/g\/2026\w+\/([^/?#]+)/); return !!(m && m[1] && m[1] !== 'f' && (m[1].length >= 8 || m[1].indexOf('-') > -1)); },
    urlDate: u => 0
  },
  vb: {
    name: 'Viðskiptablaðið', prefixes: ['vb.is/frettir/', 'vb.is/markadir/', 'vb.is/skodun/'],
    isArt: u => /vb\.is\/[a-zà-þ]+\/[^/?#]{6,}\/?$/i.test(u) && !/\.(jpg|png|webp|css|js|svg|pdf)/i.test(u),
    urlDate: u => 0
  },
  mannlif: {
    name: 'Mannlíf', prefixes: ['mannlif.is/greinar/'],
    isArt: u => /\/greinar\/[^/?#]{6,}\/?$/.test(u) && !/\.(jpg|png|webp)/i.test(u),
    urlDate: u => 0
  }
};

function extractTitle(html) {
  let m = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i)
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return dec(m[1]).replace(/\s*[-–—|]\s*(mbl\.is|DV(?:\.is)?|V[íi]sir(?:\.is)?|R[ÚU]V(?:\.is)?|Vi[ðd]skiptabla[ðd]i[ðd](?:\.is)?|Mannl[íi]f(?:\.is)?|Heimildin|Eyjan)\s*$/i, '').trim();
}
function extractDesc(html) {
  let m = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']og:description["']/i)
    || html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return m ? dec(m[1]).slice(0, 400) : '';
}
function extractPub(html) {
  let m = html.match(/(?:article:published_time|datePublished)["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/content=["']([^"']+)["'][^>]*(?:property|name)=["']article:published_time["']/i)
    || html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (!m) return 0;
  const v = m[1].trim();
  let t = Date.parse(v); if (!isNaN(t)) return Math.floor(t / 1000);                 // ISO
  const im = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (im) return Math.floor(Date.UTC(+im[3], +im[2] - 1, +im[1], 12) / 1000); // D.M.YYYY
  return 0;
}
function capToTs(cap) { const m = String(cap).match(/^(\d{4})(\d{2})(\d{2})/); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) / 1000) : 0; }

async function cdx(prefix) {
  const out = []; let resumeKey = '';
  for (let page = 0; page < 60; page++) {
    let url = 'https://web.archive.org/cdx/search/cdx?url=' + encodeURIComponent(prefix)
      + '&matchType=prefix&from=20260101&to=20261231&collapse=urlkey&filter=statuscode:200&fl=original,timestamp&output=json&limit=20000&showResumeKey=true';
    if (resumeKey) url += '&resumeKey=' + encodeURIComponent(resumeKey);
    let rows;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (!r.ok) { console.log('  CDX HTTP', r.status); break; } rows = await r.json(); }
    catch (e) { console.log('  CDX villa', e.message); await sleep(2000); continue; }
    if (!Array.isArray(rows) || !rows.length) break;
    if (rows[0] && rows[0][0] === 'original') rows.shift();
    resumeKey = '';
    while (rows.length && (rows[rows.length - 1].length === 1 || rows[rows.length - 1][0] === '')) { const last = rows.pop(); if (last.length === 1 && last[0]) resumeKey = last[0]; }
    rows.forEach(c => { if (c[0]) out.push({ original: c[0], cap: c[1] }); });
    if (!resumeKey) break;
    await sleep(400);
  }
  return out;
}

(async () => {
  const cfg = SRC[SEL];
  if (!cfg) { console.error('Veldu miðil: node build_backfill_more.js <ruv|visir|vb|mannlif> [--titles]'); process.exit(1); }
  console.log('Miðill:', cfg.name, '(' + SEL + ')', WANT ? '— sæki titla' : '— bara CDX');

  const recs = []; const seen = {};
  for (const pre of cfg.prefixes) {
    console.log('CDX:', pre, '…');
    const rows = await cdx(pre);
    let kept = 0;
    rows.forEach(rec => {
      let u = rec.original.replace(/^http:/, 'https:');
      if (!/^https?:/.test(u)) return;
      if (!cfg.isArt(u)) return;
      const key = u.toLowerCase().replace(/\/$/, ''); if (seen[key]) return;
      seen[key] = 1; recs.push({ url: u, cap: rec.cap, ud: cfg.urlDate(u) }); kept++;
    });
    console.log('  →', kept, 'grein-slóðir (af', rows.length, 'föngum)');
    await sleep(500);
  }
  console.log('CDX alls:', recs.length, 'grein-slóðir');

  const mpath = DIR + 'backfill_' + SEL + '_meta.json';
  let meta = {}; if (fs.existsSync(mpath)) { try { meta = JSON.parse(fs.readFileSync(mpath, 'utf8')); } catch (e) {} }
  if (WANT) {
    const todo = recs.filter(r => meta[r.url] == null);
    console.log('Sæki titil+lýsingu+dags:', todo.length, 'eftir (', (recs.length - todo.length), 'í minni)…');
    let done = 0, okT = 0, i = 0;
    async function worker() {
      while (i < todo.length) {
        const r = todo[i++];
        let title = '', desc = '', pub = 0;
        for (let a = 0; a < 3; a++) {
          try {
            const resp = await fetch('https://web.archive.org/web/' + r.cap + 'id_/' + r.url, { headers: { 'User-Agent': UA } });
            if (resp.status === 429 || resp.status === 503) { await sleep(2500 * (a + 1)); continue; }
            if (!resp.ok) break;
            const html = await resp.text(); title = extractTitle(html); desc = extractDesc(html); pub = extractPub(html); break;
          } catch (e) { await sleep(1200); }
        }
        const ts = r.ud || pub || capToTs(r.cap);
        meta[r.url] = { t: title || '', d: desc || '', ts: ts };
        done++; if (title) okT++;
        if (done % 200 === 0) { fs.writeFileSync(mpath, JSON.stringify(meta)); console.log('  ', done, '/', todo.length, '(', okT, 'með titil)…'); }
        await sleep(120);
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker));
    fs.writeFileSync(mpath, JSON.stringify(meta));
    console.log('Sótt. Með titil:', okT, '/', todo.length);
  }

  // Skrifa út: aðeins greinar með titil OG dagsetningu í 2026.
  const out = [];
  recs.forEach(r => {
    const m = meta[r.url]; if (!m || !m.t || m.t.length < 4) return;
    const ts = m.ts || r.ud || capToTs(r.cap);
    if (!ts || ts < SINCE) return;
    out.push({ ts: ts, source: cfg.name, title: m.t, url: r.url, desc: m.d || '' });
  });
  out.sort((a, b) => a.ts - b.ts);
  fs.writeFileSync(DIR + 'backfill_' + SEL + '.json', JSON.stringify(out));
  const real = out.filter(x => /[áéíóúýþæðöÁÉÍÓÚÝÞÆÐÖ]/.test(x.title)).length, wd = out.filter(x => x.desc && x.desc.length > 10).length;
  console.log('\nbackfill_' + SEL + '.json:', out.length, 'greinar |', (out.length ? (fs.statSync(DIR + 'backfill_' + SEL + '.json').size / 1048576).toFixed(1) : 0), 'MB | ísl. titlar:', real, '| með lýsingu:', wd);
  if (out.length) { console.log('elsta:', new Date(out[0].ts * 1000).toISOString().slice(0, 10), '· nýjasta:', new Date(out[out.length - 1].ts * 1000).toISOString().slice(0, 10)); console.log('dæmi:', JSON.stringify(out[Math.floor(out.length / 2)]).slice(0, 200)); }
})().catch(e => { console.error('ERR', e); process.exit(1); });
