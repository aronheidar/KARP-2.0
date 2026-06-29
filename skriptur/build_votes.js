// Phase 2: fetches every þing-157 vote, computes per-MP party loyalty, rebellion
// (cross-party votes) and absence ("skróp"), and merges them into althingi.json.
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
const party = {}; const ids157 = new Set();
mps.forEach(m => { party[m.id] = m.flokkur; ids157.add(m.id); });

function parseVote(x) {
  const out = {};
  x.split('<þingmaður id=').slice(1).forEach(b => {
    const id = +(b.match(/^'(\d+)'/) || [])[1];
    const a = (b.match(/<atkvæði>([^<]*)<\/atkvæði>/) || [])[1];
    if (id && a) out[id] = a;
  });
  return out;
}
async function getText(u) { const r = await fetch(u); return await r.text(); }
async function pool(items, n, fn) { let i = 0; async function w() { while (i < items.length) { const k = i++; await fn(items[k]); } } await Promise.all(Array.from({ length: n }, w)); }

(async () => {
  const listXml = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/?lthing=157');
  const voteIds = [...listXml.matchAll(/atkvæðagreiðslunúmer=.(\d+)./g)].map(m => m[1]);
  console.log('votes to fetch:', voteIds.length);

  const T = {}; mps.forEach(m => T[m.id] = { greidd: 0, loyal: 0, rebel: 0, fjarverandi: 0, bodadi: 0, recorded: 0 });
  let recordedCount = 0, done = 0;

  await pool(voteIds, 10, async (vid) => {
    let x; try { x = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/atkvaedagreidsla/?numer=' + vid); } catch (e) { return; }
    if (++done % 300 === 0) console.log('  ...', done);
    const votes = parseVote(x);
    const keys = Object.keys(votes).map(Number).filter(id => ids157.has(id));
    if (!keys.some(id => votes[id] === 'já' || votes[id] === 'nei')) return; // not a recorded já/nei vote
    recordedCount++;
    const pj = {};
    keys.forEach(id => { const v = votes[id]; if (v === 'já' || v === 'nei') { const p = party[id]; (pj[p] = pj[p] || { 'já': 0, nei: 0 })[v]++; } });
    keys.forEach(id => {
      const v = votes[id], t = T[id]; t.recorded++;
      if (v === 'fjarverandi') t.fjarverandi++;
      else if (v === 'boðaði fjarvist') t.bodadi++;
      if (v === 'já' || v === 'nei') {
        t.greidd++;
        const c = pj[party[id]];
        const ja = c['já'] - (v === 'já' ? 1 : 0), nei = c.nei - (v === 'nei' ? 1 : 0); // party majority excl. self
        if (ja !== nei) { (v === (ja > nei ? 'já' : 'nei')) ? t.loyal++ : t.rebel++; }
      }
    });
  });
  console.log('recorded já/nei votes:', recordedCount);

  mps.forEach(m => {
    const t = T[m.id], denom = t.loyal + t.rebel;
    m.hollusta = denom >= 5 ? Math.round(t.loyal / denom * 1000) / 10 : null;
    m.uppreisn = t.rebel;
    m.greidd = t.greidd;
    m.skrop = t.recorded ? Math.round(t.fjarverandi / t.recorded * 1000) / 10 : null;
    m.fjarvist = t.recorded ? Math.round((t.fjarverandi + t.bodadi) / t.recorded * 1000) / 10 : null;
    m.recVotes = t.recorded;
  });
  fs.writeFileSync(DIR + 'althingi.json', JSON.stringify(mps, null, 0));

  const wl = mps.filter(m => m.hollusta != null && m.greidd >= 20);
  console.log('REBELS (least loyal):', wl.slice().sort((a, b) => a.hollusta - b.hollusta).slice(0, 6).map(m => m.nafn + ' ' + m.hollusta + '% (' + m.uppreisn + ' kross)'));
  console.log('MOST loyal:', wl.slice().sort((a, b) => b.hollusta - a.hollusta).slice(0, 4).map(m => m.nafn + ' ' + m.hollusta + '%'));
  const pa = {}; mps.forEach(m => { if (m.skrop != null) (pa[m.flokkur] = pa[m.flokkur] || []).push(m.skrop); });
  console.log('PARTY skróp% (most first):', JSON.stringify(Object.keys(pa).map(p => [p, Math.round(pa[p].reduce((a, b) => a + b, 0) / pa[p].length * 10) / 10]).sort((a, b) => b[1] - a[1])));
})().catch(e => console.log('ERR', e.message));
