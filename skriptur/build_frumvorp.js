// Áfangi 1 (Alþingi): frumvörp + atkvæði flokka. Fetches þingmál + every vote,
// aggregates per-party support/opposition per bill + status → frumvorp.json (baked).
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
const party = {}, ids = new Set(); mps.forEach(m => { party[m.id] = m.flokkur; ids.add(m.id); });
// short party codes to keep the JSON small
const PC = { 'Samfylkingin': 'S', 'Sjálfstæðisflokkur': 'D', 'Framsóknarflokkur': 'B', 'Viðreisn': 'C', 'Miðflokkurinn': 'M', 'Flokkur fólksins': 'F', 'Píratar': 'P', 'Vinstrihreyfingin - grænt framboð': 'V', 'utan þingflokka': 'U' };
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
async function getText(u) { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); return r.text(); }
async function pool(items, n, fn) { let i = 0; async function w() { while (i < items.length) { const k = i++; await fn(items[k], k); } } await Promise.all(Array.from({ length: n }, w)); }
function parseVote(x) { const o = {}; x.split('<þingmaður id=').slice(1).forEach(b => { const id = +(b.match(/^'(\d+)'/) || [])[1]; const a = (b.match(/<atkvæði>([^<]*)<\/atkvæði>/) || [])[1]; if (id && a) o[id] = a; }); return o; }

(async () => {
  // 1) þingmál → type (heiti2: lagafrumvarp / þingsályktunartillaga / ...)
  const tml = await getText('https://www.althingi.is/altext/xml/thingmalalisti/?lthing=157');
  const types = {};
  [...tml.matchAll(/<mál [^>]*málsnúmer='(\d+)'[^>]*>([\s\S]*?)<\/mál>/g)].forEach(m => { types[+m[1]] = dec((m[2].match(/<heiti2>([^<]*)<\/heiti2>/) || [])[1] || ''); });
  console.log('þingmál:', Object.keys(types).length);

  // 2) vote list → per-vote meta (malnr, title, date, subject)
  const vl = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/?lthing=157');
  const meta = [...vl.matchAll(/<atkvæðagreiðsla [^>]*atkvæðagreiðslunúmer='(\d+)'[^>]*>([\s\S]*?)<\/atkvæðagreiðsla>/g)].map(e => {
    const inner = e[2];
    return {
      vnum: +e[1],
      malnr: +(inner.match(/<mál málsnúmer='(\d+)'/) || [])[1],
      title: dec((inner.match(/<málsheiti>([^<]*)<\/málsheiti>/) || [])[1]),
      date: ((inner.match(/<tími>([^<T]*)/) || [])[1]) || '',
      subj: dec((inner.match(/<tegund[^>]*>([^<]*)<\/tegund>/) || [])[1])
    };
  }).filter(v => v.malnr);
  console.log('atkvæðagreiðslur:', meta.length);

  // 3) per-vote detail → per-party já/nei
  let done = 0;
  await pool(meta, 12, async (v) => {
    let x; try { x = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/atkvaedagreidsla/?numer=' + v.vnum); } catch (e) { return; }
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
  recorded.forEach(v => { (bills[v.malnr] = bills[v.malnr] || { nr: v.malnr, titill: v.title, teg: types[v.malnr] || '', vs: [] }).vs.push(v); });
  const arr = Object.values(bills);
  arr.forEach(b => { b.vs.sort((a, c) => a.date < c.date ? -1 : 1); const h = b.vs[b.vs.length - 1]; b.nv = b.vs.length; b.d = h.date; b.hs = h.subj; b.ja = h.ja; b.nei = h.nei; b.fj = h.fjr; b.P = h.P; b.vs2 = b.vs.map(v => v.vnum); delete b.vs; });
  console.log('bills with recorded votes:', arr.length);

  // 5) status + sponsor party per bill
  done = 0;
  await pool(arr, 12, async (b) => {
    try {
      const x = await getText('https://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=157&malnr=' + b.nr);
      if (++done % 200 === 0) console.log('  status', done, '/', arr.length);
      b.stada = dec((x.match(/<staðamáls>([^<]*)<\/staðamáls>/) || [])[1]);
      const fm = x.match(/<flutningsmaður[^>]*id='(\d+)'/);
      if (fm && party[+fm[1]]) b.flok = PC[party[+fm[1]]] || 'U';
    } catch (e) {}
  });

  arr.sort((a, b) => a.d < b.d ? 1 : -1); // most recent first
  fs.writeFileSync(DIR + 'frumvorp.json', JSON.stringify(arr));
  console.log('\nWROTE frumvorp.json | bills:', arr.length, '| bytes:', fs.statSync(DIR + 'frumvorp.json').size);
  console.log('statuses:', JSON.stringify([...new Set(arr.map(b => b.stada))]));
  console.log('sample:', JSON.stringify(arr.slice(0, 3)).slice(0, 600));
})().catch(e => console.log('ERR', e.message));
