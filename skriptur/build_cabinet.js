// Áfangi 3 (Alþingi): ríkisstjórnar-skipunarit. Fetches current cabinet from the
// Althingi ráðherralisti (authoritative, CORS *) → embætti + flokkur + photo per minister.
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const PC = { 'Samfylkingin': 'S', 'Sjálfstæðisflokkur': 'D', 'Framsóknarflokkur': 'B', 'Viðreisn': 'C', 'Miðflokkurinn': 'M', 'Flokkur fólksins': 'F', 'Píratar': 'P', 'Vinstrihreyfingin - grænt framboð': 'V' };
async function getText(u) { const r = await fetch(u.replace('http://', 'https://'), { headers: { 'User-Agent': 'Mozilla/5.0' } }); return r.text(); }
// reuse the MP photo logic: prefer the small cache thumb, else org image, else null
async function photo(id) {
  const cands = [
    'https://www.althingi.is/myndir/thingmenn-cache/' + id + '/' + id + '-220.jpg',
    'https://www.althingi.is/myndir/mynd/thingmenn/' + id + '/org/mynd.jpg'
  ];
  for (const u of cands) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (ct.startsWith('image') && buf.length > 2000) return u;
    } catch (e) {}
  }
  return null;
}
// rank ministries so the org chart reads top-down by seniority
const RANK = { 'forsætisráðherra': 0, 'fjármála- og efnahagsráðherra': 1, 'utanríkisráðherra': 2, 'dómsmálaráðherra': 3 };

(async () => {
  const list = await getText('https://www.althingi.is/altext/xml/radherrar/?lthing=157');
  const ids = [...list.matchAll(/<ráðherra id='(\d+)'>/g)].map(m => +m[1]);
  console.log('current ministers:', ids.length);

  const cab = [];
  for (const id of ids) {
    const x = await getText('https://www.althingi.is/altext/xml/radherrar/radherraseta/?nr=' + id);
    const nafn = dec((x.match(/<nafn>([^<]*)<\/nafn>/) || [])[1]);
    // only parse the <ráðherrasetur> block (avoids the URL <ráðherraseta> reference inside <xml>)
    const block = (x.match(/<ráðherrasetur>([\s\S]*?)<\/ráðherrasetur>/) || [])[1] || '';
    const setur = [...block.matchAll(/<ráðherraseta>([\s\S]*?)<\/ráðherraseta>/g)].map(m => m[1]);
    // a minister is CURRENT only if a seta has an empty <út> (still serving). The list includes
    // everyone who served during term 157, incl. those who left in the 11.01.2026 reshuffle → skip them.
    const current = setur.filter(s => /<út>\s*<\/út>/.test(s));
    if (!current.length) { console.log('  (fyrrv.)', nafn, '— sleppt'); continue; }
    const embaetti = current.map(s => dec((s.match(/<embætti[^>]*>([^<]*)<\/embætti>/) || [])[1])).filter(Boolean);
    const flokkur = dec((current[0].match(/<þingflokkur[^>]*>([^<]*)<\/þingflokkur>/) || [])[1]);
    const sidan = (current[0].match(/<inn>([^<]*)<\/inn>/) || [])[1] || '';
    const mynd = await photo(id);
    cab.push({ id, nafn, emb: embaetti, flok: PC[flokkur] || 'U', flokur: flokkur, sidan, mynd });
    console.log(' ', nafn, '—', embaetti.join(' + '), '—', flokkur, mynd ? '📷' : '∅');
  }
  // sort: PM first, then ranked ministries, then the rest alphabetically
  cab.sort((a, b) => {
    const ra = Math.min(...a.emb.map(e => RANK[e] ?? 99)), rb = Math.min(...b.emb.map(e => RANK[e] ?? 99));
    if (ra !== rb) return ra - rb;
    return a.nafn.localeCompare(b.nafn, 'is');
  });
  fs.writeFileSync(DIR + 'cabinet.json', JSON.stringify(cab));
  const byParty = cab.reduce((o, m) => (o[m.flokur] = (o[m.flokur] || 0) + 1, o), {});
  console.log('\nWROTE cabinet.json | ministers:', cab.length, '| bytes:', fs.statSync(DIR + 'cabinet.json').size);
  console.log('by party:', JSON.stringify(byParty));
})().catch(e => console.log('ERR', e.message));
