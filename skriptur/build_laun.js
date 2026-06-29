// Áfangi 5: laun þingmanna. Scrapes Alþingi's published fixed monthly salaries
// (þingfararkaup + álag; ministers incl. ráðherralaun) and bakes per-MP `laun` into althingi.json.
// Source: https://www.althingi.is/altext/cv/is/laun_og_greidslur/ (officially published, forsætisnefnd 2018).
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
const norm = s => String(s || '').replace(/­/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const key = s => norm(s).toLowerCase();

(async () => {
  const r = await fetch('https://www.althingi.is/altext/cv/is/laun_og_greidslur/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  const html = await r.text();
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)];
  // table index 1 = "Fastar mánaðarlegar launagreiðslur" (fixed monthly salary)
  const t = tables[1] ? tables[1][0] : tables[0][0];
  const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/g)];
  const salByName = {};
  rows.forEach(row => {
    const cells = [...row[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => norm(c[1].replace(/<[^>]+>/g, '')));
    if (cells.length < 2 || /Nafn/i.test(cells[0])) return;
    const laun = parseInt(cells[1].replace(/[^\d]/g, ''), 10);
    const kostn = cells[2] ? parseInt(cells[2].replace(/[^\d]/g, ''), 10) : null;
    if (cells[0] && laun) salByName[key(cells[0])] = { laun: laun, kostn: isNaN(kostn) ? null : kostn };
  });
  console.log('salary rows parsed:', Object.keys(salByName).length);

  let matched = 0; const unmatched = [];
  mps.forEach(m => {
    const s = salByName[key(m.nafn)];
    if (s) { m.laun = s.laun; m.kostn = s.kostn; matched++; }
    else { m.laun = null; unmatched.push(m.nafn); }
  });
  fs.writeFileSync(DIR + 'althingi.json', JSON.stringify(mps, null, 0));
  console.log('matched', matched, '/', mps.length);
  if (unmatched.length) console.log('UNMATCHED MPs:', JSON.stringify(unmatched));
  // salary table names not matched to a sitting MP (e.g. substitutes / former)
  const mpKeys = new Set(mps.map(m => key(m.nafn)));
  const extra = Object.keys(salByName).filter(k => !mpKeys.has(k));
  if (extra.length) console.log('salary names w/o sitting MP:', extra.length, JSON.stringify(extra.slice(0, 20)));
  // party averages (sanity)
  const byP = {}; mps.forEach(m => { if (m.laun) (byP[m.flokkur] = byP[m.flokkur] || []).push(m.laun); });
  console.log('\nmeðallaun eftir flokki:');
  Object.keys(byP).sort((a, b) => (byP[b].reduce((x, y) => x + y, 0) / byP[b].length) - (byP[a].reduce((x, y) => x + y, 0) / byP[a].length))
    .forEach(p => { const a = byP[p]; console.log('  ', p, Math.round(a.reduce((x, y) => x + y, 0) / a.length).toLocaleString('is-IS'), 'kr (' + a.length + ')'); });
})().catch(e => console.log('ERR', e.message));
