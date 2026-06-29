// Phase 2b: committees. Per-MP committee count, opposition weight of committee
// seats, and total committee meetings (þing 157). Merges into althingi.json + althingi_meta.json.
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
const party = {}; mps.forEach(m => party[m.id] = m.flokkur);
const GOV = new Set(['Samfylkingin', 'Viðreisn', 'Flokkur fólksins']); // 2024 coalition
// current ministers don't sit on committees; the Althingi feed can lag (e.g. Ragnar Þór after
// the 11.01.2026 reshuffle still shows as fjárlaganefnd formaður) → drop them from committees.
let ministerIds = new Set();
try { JSON.parse(fs.readFileSync(DIR + 'cabinet.json', 'utf8')).forEach(c => ministerIds.add(c.id)); } catch (e) {}

(async () => {
  const nm = await (await fetch('https://www.althingi.is/altext/xml/nefndir/nefndarmenn/?lthing=157')).text();
  const nafnById = {}; mps.forEach(m => nafnById[m.id] = m.nafn);
  const perMP = {}, listMP = {}, stada = {}, committees = {}; let mainSeats = 0, oppSeats = 0;
  nm.split('<nefnd ').slice(1).forEach(c => {
    const heiti = ((c.match(/<heiti>([^<]*)<\/heiti>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const nid = +((c.match(/id='(\d+)'/) || [])[1]) || null;
    const com = committees[heiti] = committees[heiti] || { heiti: heiti, id: nid, members: [] };
    c.split('<nefndarmaður ').slice(1).forEach(b => {
      const id = +(b.match(/id='(\d+)'/) || [])[1];
      const st = ((b.match(/<staða>([^<]*)<\/staða>/) || [])[1] || '').trim();
      const nafn = ((b.match(/<nafn>([^<]*)<\/nafn>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
      if (st === 'Q' || !id || ministerIds.has(id)) return;
      stada[st] = (stada[st] || 0) + 1;
      com.members.push({ id: id, nafn: nafn || nafnById[id] || '', flokkur: party[id] || null, stada: st });
      const main = st && !/varamaður|áheyrn/i.test(st);
      if (main && party[id]) {
        perMP[id] = (perMP[id] || 0) + 1; mainSeats++; if (!GOV.has(party[id])) oppSeats++;
        (listMP[id] = listMP[id] || []).push([heiti, st]);
      }
    });
  });
  console.log('staða dist:', JSON.stringify(stada));
  // sort each MP's committees: leadership roles first, then alphabetically
  const rank = s => /^formaður/.test(s) ? 0 : /varaformaður/.test(s) ? 1 : 2;
  mps.forEach(m => {
    m.nefndir = perMP[m.id] || 0;
    m.nefndalisti = (listMP[m.id] || []).sort((a, b) => rank(a[1]) - rank(b[1]) || a[0].localeCompare(b[0], 'is'));
  });

  const nf = await (await fetch('https://www.althingi.is/altext/xml/nefndarfundir/?lthing=157')).text();
  const meetings = nf.split('<nefndarfundur').slice(1);
  const perC = {}; meetings.forEach(b => { const n = ((b.match(/<nefnd[^>]*>([^<]*)<\/nefnd>/) || [])[1] || '').replace(/\s+/g, ' ').trim(); if (n) perC[n] = (perC[n] || 0) + 1; });
  const busiest = Object.entries(perC).sort((a, b) => b[1] - a[1])[0];

  const meta = { nefndarfundir: meetings.length, busiestNefnd: busiest ? busiest[0].trim() : null, busiestN: busiest ? busiest[1] : 0, oppWeight: Math.round(oppSeats / mainSeats * 1000) / 10, mainSeats };
  fs.writeFileSync(DIR + 'althingi.json', JSON.stringify(mps, null, 0));
  fs.writeFileSync(DIR + 'althingi_meta.json', JSON.stringify(meta));

  // per-committee dataset → nefndir.json (members sorted leadership-first, meeting counts merged)
  const rolerank = s => /^formaður/.test(s) ? 0 : /1\. varaformaður/.test(s) ? 1 : /varaformaður/.test(s) ? 2 : /varamaður/.test(s) ? 4 : /áheyrn/.test(s) ? 5 : 3;
  const nefndir = Object.values(committees).map(c => {
    c.members.sort((a, b) => rolerank(a.stada) - rolerank(b.stada) || a.nafn.localeCompare(b.nafn, 'is'));
    c.fundir = perC[c.heiti] || 0;
    c.fastir = c.members.filter(m => !/varamaður|áheyrn/i.test(m.stada)).length;
    return c;
  }).sort((a, b) => b.fundir - a.fundir || a.heiti.localeCompare(b.heiti, 'is'));
  fs.writeFileSync(DIR + 'nefndir.json', JSON.stringify(nefndir));

  console.log('meetings:', meetings.length, '| busiest:', busiest, '| oppWeight%:', meta.oppWeight, '(' + oppSeats + '/' + mainSeats + ')');
  console.log('nefndir:', nefndir.length, '| with meetings:', nefndir.filter(n => n.fundir).length);
  console.log('top nefndir:', nefndir.slice(0, 6).map(n => n.heiti + ' (' + n.fastir + ' menn, ' + n.fundir + ' fundir)'));
})().catch(e => console.log('ERR', e.message));
