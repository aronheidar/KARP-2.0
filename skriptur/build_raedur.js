// ─────────────────────────────────────────────────────────────
// build_raedur.js — Ræðugreining Alþingis (LOTA 16, liður 4)
// Les ræðulista þingsins 157 (XML, ~15þ ræður) og reiknar TÖLFRÆÐILEGT
// „málróf" hvers þingmanns: fjöldi/mínútur eftir tegund ræðu (ræða,
// andsvar, um fundarstjórn…), topp-málefni eftir ræðutíma, lengsta ræða.
// ENGIN gervigreind — hrein talning úr opinberu XML-i Alþingis.
// Keyrsla: node skriptur/build_raedur.js  →  gogn/raedugreining.json
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const URL = 'https://www.althingi.is/altext/xml/raedulisti/?lthing=157';
const OUT = path.join(__dirname, '..', 'gogn', 'raedugreining.json');

const grab = (xml, tag) => {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1].trim() : '';
};

(async () => {
  console.log('Sæki ræðulista 157…');
  const r = await fetch(URL, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const xml = await r.text();
  const chunks = xml.split('<ræða>').slice(1);
  console.log('Ræður í skrá:', chunks.length);

  const mp = {}; // id → safn
  let skipped = 0;
  for (const c of chunks) {
    const idm = c.match(/<ræðumaður id='(\d+)'/);
    if (!idm) { skipped++; continue; }
    const id = +idm[1];
    // forseti Íslands og gestir eru ekki þingmenn — síast út við samsvörun við althingi.json síðar
    const teg = grab(c, 'tegundræðu') || 'ræða';
    const heiti = grab(c, 'málsheiti');
    const t0 = grab(c, 'ræðahófst'), t1 = grab(c, 'ræðulauk');
    let min = 0;
    if (t0 && t1) {
      const d = (new Date(t1) - new Date(t0)) / 60000;
      if (d > 0 && d < 180) min = d;
    }
    const e = (mp[id] = mp[id] || { n: 0, min: 0, teg: {}, mal: {}, longest: 0, longestHeiti: '' });
    e.n++;
    e.min += min;
    e.teg[teg] = (e.teg[teg] || 0) + 1;
    if (heiti && !/^ávarp|^þingsetning/i.test(heiti)) {
      const m2 = (e.mal[heiti] = e.mal[heiti] || { n: 0, min: 0 });
      m2.n++;
      m2.min += min;
    }
    if (min > e.longest) { e.longest = min; e.longestHeiti = heiti; }
  }

  const out = { updated: new Date().toISOString().slice(0, 10), thing: 157, total: chunks.length, mp: {} };
  Object.keys(mp).forEach((id) => {
    const e = mp[id];
    const fundarstj = e.teg['um fundarstjórn'] || 0;
    const andsvor = (e.teg['andsvar'] || 0) + (e.teg['svar'] || 0);
    out.mp[id] = {
      n: e.n,
      min: Math.round(e.min),
      raedur: e.teg['ræða'] || 0,
      andsvor,
      fundarstj,
      flutn: e.teg['flutningsræða'] || 0,
      topMal: Object.entries(e.mal).sort((a, b) => b[1].min - a[1].min).slice(0, 5)
        .map(([h, v]) => ({ h: h.length > 80 ? h.slice(0, 77) + '…' : h, n: v.n, min: Math.round(v.min) })),
      longest: Math.round(e.longest),
      longestHeiti: e.longestHeiti.length > 80 ? e.longestHeiti.slice(0, 77) + '…' : e.longestHeiti,
    };
  });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('Þingmenn/ræðumenn m/gögn:', Object.keys(out.mp).length, '· sleppt (án id):', skipped);
  console.log('Skrifað:', OUT);
})();
