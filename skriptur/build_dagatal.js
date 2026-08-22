// Áfangi 7: þingdagatal. Fetches plenary sittings (þingfundir) + committee meetings
// (nefndarfundir) for term 157 and aggregates by date → dagatal.json (baked).
const fs = require('fs');
// __dirname-afstætt á kanóníska gogn/ (harðkóðaða OneDrive-slóðin braust hljóðlaust á ubuntu eftir CF-flutning)
const DIR = require('path').join(__dirname, '..', 'gogn') + '/';
const OUT = DIR + 'dagatal.json';
// Seigla (22.8.2026: althingi.is svaraði HTTP 429 → 0 fundir → range:[null,null] skrifað → /althingi/ hrundi á null.slice). Sjá _seigla.js.
const { fetchText, writeJsonUnlessEmpty } = require('./_seigla.js');
const g = u => fetchText(u);
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
  // tómt = engir þingfundir EÐA engir nefndarfundir (hálf-tómt er jafn grunsamlegt) + fyrri skrá með efni → HALDA fyrri skrá
  const { kept } = writeJsonUnlessEmpty(OUT, meta, { isEmpty: d => !d || !(d.plenary > 0) || !(d.meetings > 0), label: 'dagatal.json' });
  if (kept) { process.exitCode = 1; return; }
  console.log('dagatal.json | days:', keys.length, '| range', meta.range[0], '→', meta.range[1], '| plenary', plen.length, '| cmte meetings', mtg.length);
  console.log('last 5 active days:', keys.slice(-5).map(d => d + ' (þ' + out[d].t + ' n' + out[d].n + ')'));
})().catch(e => { console.log('ERR', e.message, '— dagatal.json óbreytt'); process.exitCode = 1; });
