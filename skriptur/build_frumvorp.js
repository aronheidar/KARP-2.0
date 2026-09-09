// Áfangi 1 (Alþingi): frumvörp + atkvæði flokka. Fetches þingmál + every vote,
// aggregates per-party support/opposition per bill + status → frumvorp.json (baked).
const fs = require('fs');
// __dirname-afstætt á kanóníska gogn/ (harðkóðaða OneDrive-slóðin braust hljóðlaust á ubuntu eftir CF-flutning)
const DIR = require('path').join(__dirname, '..', 'gogn') + '/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
const party = {}, ids = new Set(); mps.forEach(m => { party[m.id] = m.flokkur; ids.add(m.id); });
// short party codes to keep the JSON small
const PC = { 'Samfylkingin': 'S', 'Sjálfstæðisflokkur': 'D', 'Framsóknarflokkur': 'B', 'Viðreisn': 'C', 'Miðflokkurinn': 'M', 'Flokkur fólksins': 'F', 'Píratar': 'P', 'Vinstrihreyfingin - grænt framboð': 'V', 'utan þingflokka': 'U' };
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
// ⚠⚠ 9.9.2026: hér stóð ber `fetch` án r.ok. Þessi skripta gerir ~2.000 köll og keyrir FYRST í
//   Alþingis-þum — hún framkallaði 429-ið sem felldi build_votes/votemap/committees á eftir sér,
//   og holaði sjálfa sig í HELMING (frumvorp.json sveiflaðist 30962/45040/57945 milli daga).
//   Samhliðni lækkuð 12 → 4 og fetchText hendir á non-2xx í stað þess að skila villuboðum sem gögnum.
const { fetchText, writeJsonUnlessEmpty, thingListi } = require('./_seigla.js');
const getText = (u) => fetchText(u);
const CONC = 4;
async function pool(items, n, fn) { let i = 0; async function w() { while (i < items.length) { const k = i++; await fn(items[k], k); } } await Promise.all(Array.from({ length: n }, w)); }
function parseVote(x) { const o = {}; x.split('<þingmaður id=').slice(1).forEach(b => { const id = +(b.match(/^'(\d+)'/) || [])[1]; const a = (b.match(/<atkvæði>([^<]*)<\/atkvæði>/) || [])[1]; if (id && a) o[id] = a; }); return o; }

(async () => {
  // 1) þingmál → type (heiti2: lagafrumvarp / þingsályktunartillaga / ...)
  // ⚠ BÆÐI þing: nýtt þing er nær tómt fyrstu vikurnar (158 hafði 1 mál móti 1.070 hjá 157).
  //   Lykill BER ÞING — mál 1 á 158 (fjárlögin) og mál 1 á 157 eru sítt hvað.
  const THING = await thingListi({ fallback: 158 });
  const types = {};
  for (const th of THING) {
    const tml = await getText('https://www.althingi.is/altext/xml/thingmalalisti/?lthing=' + th);
    [...tml.matchAll(/<mál [^>]*málsnúmer='(\d+)'[^>]*>([\s\S]*?)<\/mál>/g)]
      .forEach(m => { types[th + '_' + m[1]] = dec((m[2].match(/<heiti2>([^<]*)<\/heiti2>/) || [])[1] || ''); });
  }
  console.log('þingmál:', Object.keys(types).length);

  // 2) vote list → per-vote meta (malnr, title, date, subject)
  const meta = [];
  for (const th of THING) {
  const vl = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/?lthing=' + th);
  meta.push(...[...vl.matchAll(/<atkvæðagreiðsla [^>]*atkvæðagreiðslunúmer='(\d+)'[^>]*>([\s\S]*?)<\/atkvæðagreiðsla>/g)].map(e => {
    const inner = e[2];
    return {
      vnum: +e[1],
      malnr: +(inner.match(/<mál málsnúmer='(\d+)'/) || [])[1],
      title: dec((inner.match(/<málsheiti>([^<]*)<\/málsheiti>/) || [])[1]),
      date: ((inner.match(/<tími>([^<T]*)/) || [])[1]) || '',
      subj: dec((inner.match(/<tegund[^>]*>([^<]*)<\/tegund>/) || [])[1]),
      thing: th
    };
  }).filter(v => v.malnr));
  }
  console.log('atkvæðagreiðslur:', meta.length);

  // 3) per-vote detail → per-party já/nei
  let done = 0;
  let mistokst = 0;
  await pool(meta, CONC, async (v) => {
    let x; try { x = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/atkvaedagreidsla/?numer=' + v.vnum); } catch (e) { mistokst++; return; }
    if (++done % 300 === 0) console.log('  ...', done, '/', meta.length);
    const votes = parseVote(x);
    let ja = 0, nei = 0, fjr = 0; const P = {};
    Object.keys(votes).map(Number).filter(id => ids.has(id)).forEach(id => {
      const a = votes[id], code = PC[party[id]] || 'U';
      if (a === 'já' || a === 'nei') { if (a === 'já') ja++; else nei++; const c = (P[code] = P[code] || [0, 0]); c[a === 'já' ? 0 : 1]++; }
      else fjr++;
    });
    if (ja + nei === 0) return;
    v.ja = ja; v.nei = nei; v.fjr = fjr; v.P = P; v.rec = true;
  });
  const recorded = meta.filter(v => v.rec);
  console.log('recorded já/nei votes:', recorded.length);

  // 4) group by bill, keep the headline (last/decisive) vote tally only
  const bills = {};
  recorded.forEach(v => { const K = v.thing + '_' + v.malnr;
    (bills[K] = bills[K] || { nr: v.malnr, thing: v.thing, titill: v.title, teg: types[K] || '', vs: [] }).vs.push(v); });
  const arr = Object.values(bills);
  arr.forEach(b => { b.vs.sort((a, c) => a.date < c.date ? -1 : 1); const h = b.vs[b.vs.length - 1]; b.nv = b.vs.length; b.d = h.date; b.hs = h.subj; b.ja = h.ja; b.nei = h.nei; b.fj = h.fjr; b.P = h.P; b.vs2 = b.vs.map(v => v.vnum); delete b.vs; });
  console.log('bills with recorded votes:', arr.length);

  // 5) status + sponsor party per bill
  done = 0;
  await pool(arr, CONC, async (b) => {
    try {
      const x = await getText('https://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=' + b.thing + '&malnr=' + b.nr);
      if (++done % 200 === 0) console.log('  status', done, '/', arr.length);
      b.stada = dec((x.match(/<staðamáls>([^<]*)<\/staðamáls>/) || [])[1]);
      const fm = x.match(/<flutningsmaður[^>]*id='(\d+)'/);
      if (fm && party[+fm[1]]) b.flok = PC[party[+fm[1]]] || 'U';
    } catch (e) { mistokst++; }
  });

  arr.sort((a, b) => a.d < b.d ? 1 : -1); // most recent first
  // ⚠ HOLUNARVÖRN: þessi skrá hollast í HELMING, ekki núll — stakar sóknir detta út þegjandi og
  //   engin tómleika-gát grípur það. Bregðist meira en 5% köllum er útkoman ómarktæk.
  const hlutfall = meta.length ? mistokst / (meta.length + arr.length) : 0;
  console.log('mistókst:', mistokst, '(' + (hlutfall * 100).toFixed(1) + '%)');
  writeJsonUnlessEmpty(DIR + 'frumvorp.json', arr,
    { isEmpty: (d) => !d || d.length < 20 || hlutfall > 0.05, label: 'frumvorp.json' });
  console.log('\nWROTE frumvorp.json | bills:', arr.length, '| bytes:', fs.statSync(DIR + 'frumvorp.json').size);
  console.log('statuses:', JSON.stringify([...new Set(arr.map(b => b.stada))]));
  console.log('sample:', JSON.stringify(arr.slice(0, 3)).slice(0, 600));
})().catch(e => console.log('ERR', e.message));
