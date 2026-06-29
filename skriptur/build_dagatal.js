// Áfangi 7: þingdagatal. Fetches plenary sittings (þingfundir) + committee meetings
// (nefndarfundir) for term 157 and aggregates by date → dagatal.json (baked).
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const g = async u => (await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

(async () => {
  const dates = {}; // "YYYY-MM-DD" -> { t: plenaryCount, c: {committee: count} }
  const day = d => (dates[d] = dates[d] || { t: 0, c: {} });

  // 1) plenary sittings — <dagur>DD.MM.YYYY</dagur>
  const tf = await g('https://www.althingi.is/altext/xml/thingfundir/?lthing=157');
  const plen = tf.split('<þingfundur').slice(1);
  plen.forEach(b => {
    const d = (b.match(/<dagur>([^<]*)<\/dagur>/) || [])[1];
    if (!d) return; const m = d.match(/(\d{2})\.(\d{2})\.(\d{4})/); if (!m) return;
    day(m[3] + '-' + m[2] + '-' + m[1]).t++;
  });

  // 2) committee meetings — <nefnd>Name</nefnd> ... <dagur>YYYY-MM-DD</dagur>
  const nf = await g('https://www.althingi.is/altext/xml/nefndarfundir/?lthing=157');
  const mtg = nf.split('<nefndarfundur').slice(1);
  mtg.forEach(b => {
    const nefnd = dec((b.match(/<nefnd[^>]*>([^<]*)<\/nefnd>/) || [])[1]);
    const d = (b.match(/<dagur>(\d{4}-\d{2}-\d{2})<\/dagur>/) || [])[1];
    if (!d || !nefnd) return;
    const D = day(d); D.c[nefnd] = (D.c[nefnd] || 0) + 1;
  });

  // compact: store committee list (names) + counts per day
  const out = {};
  Object.keys(dates).forEach(d => { const x = dates[d]; out[d] = { t: x.t, n: Object.values(x.c).reduce((a, b) => a + b, 0), c: Object.keys(x.c).sort((a, b) => x.c[b] - x.c[a]) }; });
  const keys = Object.keys(out).sort();
  const meta = { range: [keys[0], keys[keys.length - 1]], days: keys.length, plenary: plen.length, meetings: mtg.length, dates: out };
  fs.writeFileSync(DIR + 'dagatal.json', JSON.stringify(meta));
  console.log('dagatal.json | days:', keys.length, '| range', meta.range[0], '→', meta.range[1], '| plenary', plen.length, '| cmte meetings', mtg.length);
  console.log('last 5 active days:', keys.slice(-5).map(d => d + ' (þ' + out[d].t + ' n' + out[d].n + ')'));
})().catch(e => console.log('ERR', e.message));
