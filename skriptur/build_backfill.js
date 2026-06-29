// EITT-SKIPTI bakvistun fréttasafnsins úr Wayback Machine (archive.org).
// Fasi 1 (alltaf): CDX → fréttaslóðir 2026 (mbl+dv, dags úr slóð, capture-tími fyrir titil-sókn).
// Fasi 2 (--titles): sækir RAUNVERULEGA titilinn (með íslenskum stöfum, úr og:title) fyrir hverja grein
//   af archive.org — slóða-slug er ASCII-foldaður svo þetta þarf til að fá rétta titla.
//   Skyndiminni gogn/backfill_titles.json → ENDURRÆSANLEGT (ef stöðvast/rate-limit, keyrðu aftur).
// → gogn/backfill.json ({ts,source,title,url}). Síðan: flytja inn gegnum POST /wp-json/karp/v1/newsimport.
//
// KEYRA:  node skriptur/build_backfill.js            (bara CDX, foldaðir titlar, fljótt)
//         node skriptur/build_backfill.js --titles   (sækir raun-titla — ~45–75 mín, endurræsanlegt)
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const UA = 'Mozilla/5.0 (KARP dashboard backfill; +karp.is)';
const YEAR = '2026';
const WANT_TITLES = process.argv.includes('--titles');
const CONC = 6;

const SRC = [
  { prefixes: ['mbl.is/frettir/innlent/' + YEAR, 'mbl.is/frettir/erlent/' + YEAR, 'mbl.is/vidskipti/' + YEAR], name: 'mbl.is' },
  { prefixes: ['dv.is/frettir/' + YEAR, 'dv.is/eyjan/' + YEAR], name: 'dv.is' }
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\s+/g, ' ').trim();

async function cdx(prefix) {
  const out = []; let resumeKey = '';
  for (let page = 0; page < 40; page++) {
    let url = 'https://web.archive.org/cdx/search/cdx?url=' + encodeURIComponent(prefix)
      + '&matchType=prefix&collapse=urlkey&filter=statuscode:200&fl=original,timestamp&output=json&limit=20000&showResumeKey=true';
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
function titleFromUrl(u) { const m = u.match(/\/\d{4}\/\d{2}\/\d{2}\/([^?#]+?)\/?$/); if (!m) return ''; let s = decodeURIComponent((m[1].split('/').pop() || '').replace(/\.html?$/, '')).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); return s.length < 4 ? '' : s.charAt(0).toUpperCase() + s.slice(1); }
function tsFromUrl(u) { const m = u.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) / 1000) : null; }
function extractTitle(html) {
  let m = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i)
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return dec(m[1]).replace(/\s*[-–—|]\s*(mbl\.is|DV(?:\.is)?|Vísir|RÚV|Viðskiptablaðið|Eyjan)\s*$/i, '').trim();
}
// Lýsing/inngangur (lead) — þar nefnast oft FLEIRI fyrirtæki en í fyrirsögn → ríkara tengslanet + leit.
function extractDesc(html) {
  let m = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']og:description["']/i)
    || html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return m ? dec(m[1]).slice(0, 400) : '';
}

(async () => {
  // Fasi 1: CDX
  const recs = []; const seen = {};
  for (const s of SRC) {
    let cnt = 0;
    for (const pre of s.prefixes) {
      console.log('CDX:', pre, '…');
      const rows = await cdx(pre);
      rows.forEach(rec => {
        let u = rec.original.replace(/^http:/, 'https:').replace(/\/+$/, '/');
        if (!/^https?:/.test(u)) return;
        const key = u.toLowerCase(); if (seen[key]) return;
        const ts = tsFromUrl(u), st = titleFromUrl(u); if (!ts || !st) return;
        seen[key] = 1; recs.push({ url: u, cap: rec.cap, ts: ts, source: s.name, slug: st });
        cnt++;
      });
      await sleep(500);
    }
    console.log('  →', s.name, cnt, 'greinar');
  }
  console.log('CDX alls:', recs.length, 'greinar');

  // Fasi 2: raun-titlar + LÝSING (valfrjálst). Meta-skyndiminni: { url: {t, d} } → endurræsanlegt.
  const tpath = DIR + 'backfill_titles.json';                 // gamalt (bara titlar) — fallback
  const mpath = DIR + 'backfill_meta.json';                   // nýtt: titill + lýsing
  let tcache = {}; if (fs.existsSync(tpath)) { try { tcache = JSON.parse(fs.readFileSync(tpath, 'utf8')); } catch (e) {} }
  let meta = {}; if (fs.existsSync(mpath)) { try { meta = JSON.parse(fs.readFileSync(mpath, 'utf8')); } catch (e) {} }
  if (WANT_TITLES) {
    const todo = recs.filter(r => meta[r.url] == null);
    console.log('Sæki titil+lýsingu:', todo.length, 'eftir (', (recs.length - todo.length), 'í minni) — þetta tekur dágóða stund…');
    let done = 0, okT = 0, okD = 0, i = 0;
    async function worker() {
      while (i < todo.length) {
        const r = todo[i++];
        let title = '', desc = '';
        for (let a = 0; a < 3; a++) {
          try {
            const resp = await fetch('https://web.archive.org/web/' + r.cap + 'id_/' + r.url, { headers: { 'User-Agent': UA } });
            if (resp.status === 429 || resp.status === 503) { await sleep(2500 * (a + 1)); continue; }
            if (!resp.ok) break;
            const html = await resp.text(); title = extractTitle(html); desc = extractDesc(html); break;
          } catch (e) { await sleep(1200); }
        }
        meta[r.url] = { t: title || (tcache[r.url] || ''), d: desc || '' };
        done++; if (meta[r.url].t) okT++; if (meta[r.url].d) okD++;
        if (done % 200 === 0) { fs.writeFileSync(mpath, JSON.stringify(meta)); console.log('  ', done, '/', todo.length, '(', okT, 'titlar,', okD, 'lýsingar)…'); }
        await sleep(120);
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker));
    fs.writeFileSync(mpath, JSON.stringify(meta));
    console.log('Sótt. Titlar:', okT, '· lýsingar:', okD, '/', todo.length);
  }

  // Skrifa backfill.json — titill (meta→gamalt cache→slug) + lýsing (desc).
  const out = recs.map(r => {
    const m = meta[r.url] || {};
    const title = (m.t && m.t.length > 3) ? m.t : ((tcache[r.url] && tcache[r.url].length > 3) ? tcache[r.url] : r.slug);
    return { ts: r.ts, source: r.source, title: title, url: r.url, desc: (m.d || '') };
  });
  out.sort((a, b) => a.ts - b.ts);
  fs.writeFileSync(DIR + 'backfill.json', JSON.stringify(out));
  const real = out.filter(x => /[áéíóúýþæðöÁÉÍÓÚÝÞÆÐÖ]/.test(x.title)).length;
  const withDesc = out.filter(x => x.desc && x.desc.length > 10).length;
  console.log('\nbackfill.json:', out.length, 'greinar |', (fs.statSync(DIR + 'backfill.json').size / 1048576).toFixed(1), 'MB | ísl. stafir í titli:', real, '| með lýsingu:', withDesc);
  if (out.length) console.log('dæmi:', JSON.stringify(out[Math.floor(out.length / 2)]));
})().catch(e => { console.error('ERR', e); process.exit(1); });
