// Sendiráð: scrapes Wikipedia's maintained lists (sourced to the Icelandic MFA diplomatic list)
// → sendirad.json (baked). Abroad: Iceland's resident embassies. In Iceland: foreign embassies.
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
async function wt(page) { const u = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&redirects=1&page=' + encodeURIComponent(page); const r = await fetch(u, { headers: { 'User-Agent': 'KarpDashboard/1.0 (aronheidars@gmail.com)' } }); const j = await r.json(); return j.parse.wikitext['*']; }
const clean = s => s.replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[([^|\]]*\|)?([^\]]*)\]\]/g, '$2').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<[^>]*>/g, '').replace(/'''?/g, '').trim();

// English (Wikipedia {{flag|..}}) → [Icelandic name, ISO2]; geojson name == English key
const EN = { 'Malawi': ['Malaví', 'MW'], 'Sierra Leone': ['Síerra Leóne', 'SL'], 'Uganda': ['Úganda', 'UG'], 'Canada': ['Kanada', 'CA'], 'United States': ['Bandaríkin', 'US'], 'China': ['Kína', 'CN'], 'India': ['Indland', 'IN'], 'Japan': ['Japan', 'JP'], 'Austria': ['Austurríki', 'AT'], 'Belgium': ['Belgía', 'BE'], 'Denmark': ['Danmörk', 'DK'], 'Finland': ['Finnland', 'FI'], 'France': ['Frakkland', 'FR'], 'Germany': ['Þýskaland', 'DE'], 'Italy': ['Ítalía', 'IT'], 'Norway': ['Noregur', 'NO'], 'Poland': ['Pólland', 'PL'], 'Spain': ['Spánn', 'ES'], 'Sweden': ['Svíþjóð', 'SE'], 'United Kingdom': ['Bretland', 'GB'] };
// ISO3 (in-Iceland templates) → [Icelandic, ISO2, geojson name]
const I3 = { CAN: ['Kanada', 'CA', 'Canada'], CHN: ['Kína', 'CN', 'China'], DNK: ['Danmörk', 'DK', 'Denmark'], FIN: ['Finnland', 'FI', 'Finland'], FRA: ['Frakkland', 'FR', 'France'], DEU: ['Þýskaland', 'DE', 'Germany'], IND: ['Indland', 'IN', 'India'], JPN: ['Japan', 'JP', 'Japan'], NOR: ['Noregur', 'NO', 'Norway'], POL: ['Pólland', 'PL', 'Poland'], RUS: ['Rússland', 'RU', 'Russia'], SWE: ['Svíþjóð', 'SE', 'Sweden'], TUR: ['Tyrkland', 'TR', 'Turkey'], GBR: ['Bretland', 'GB', 'United Kingdom'], USA: ['Bandaríkin', 'US', 'United States'], EU: ['Evrópusambandið', 'EU', ''], FRO: ['Færeyjar', 'FO', ''], GRL: ['Grænland', 'GL', 'Greenland'] };
const CITYIS = { 'Copenhagen': 'Kaupmannahöfn', 'Oslo': 'Osló', 'Stockholm': 'Stokkhólmur', 'London': 'London', 'Berlin': 'Berlín', 'Paris': 'París', 'Rome': 'Róm', 'Vienna': 'Vín', 'Brussels': 'Brussel', 'Warsaw': 'Varsjá', 'Madrid': 'Madríd', 'Moscow': 'Moskva', 'Beijing': 'Peking', 'Tokyo': 'Tókýó', 'New Delhi': 'Nýja-Delí', 'Washington, D.C.': 'Washington', 'Ottawa': 'Ottawa', 'Helsinki': 'Helsinki' };
const MTYPE = { 'Embassy': 'Sendiráð', 'Consulate-General': 'Aðalræðisskrifstofa', 'Consulate': 'Ræðisskrifstofa', 'Delegation': 'Sendinefnd', 'Representative office': 'Sendiskrifstofa' };

(async () => {
  // ABROAD — Iceland's resident embassies (mission type == Embassy/Consulate)
  let wa = await wt('List of diplomatic missions of Iceland'); wa = wa.split(/==\s*Closed/i)[0];
  const abroad = [];
  wa.split(/\n\|-/).forEach(r => {
    const fm = r.match(/\{\{[Ff]lag\|([^}|]+)\}\}/); if (!fm) return;
    const en = fm[1].trim(); const cells = []; r.split('\n').forEach(l => { const m = l.match(/^\|\s*(.*)$/); if (m) cells.push(m[1]); });
    const city = clean(cells[0] || ''), mission = clean(cells[1] || '');
    if (!/^(Embassy|Consulate)/i.test(mission)) return; // skip permanent missions to orgs (different columns)
    const d = EN[en]; if (!d) { console.log('  ?? abroad unmapped:', en); return; }
    abroad.push({ is: d[0], cc: d[1], geo: en, city: CITYIS[city] || city, type: MTYPE[mission] || mission });
  });

  // IN ICELAND — foreign missions in Reykjavík ({{ISO3}})
  const wi = await wt('List of diplomatic missions in Iceland');
  const iceland = [];
  wi.split(/\n\|-/).forEach(r => {
    const cm = r.match(/\{\{([A-Z]{2,3})\}\}/); if (!cm) return; const code = cm[1];
    const cells = r.split('||'); const t = cells[1] ? clean(cells[1]) : 'Embassy';
    const d = I3[code]; if (!d) { console.log('  ?? iceland unmapped:', code); return; }
    iceland.push({ is: d[0], cc: d[1], geo: d[2], type: MTYPE[t] || t });
  });

  const out = { abroad: abroad, iceland: iceland };
  fs.writeFileSync(DIR + 'sendirad.json', JSON.stringify(out));
  console.log('abroad (íslensk sendiráð erlendis):', abroad.length, '| í Reykjavík:', iceland.length);
  console.log('abroad:', abroad.map(a => a.is + ' (' + a.city + ')').join(', '));
  console.log('iceland:', iceland.map(a => a.is + ' [' + a.type + ']').join(', '));
})().catch(e => console.log('ERR', e.message));
