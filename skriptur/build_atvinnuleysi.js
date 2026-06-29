// Skráð atvinnuleysi (Vinnumálastofnun) — les Talnagögn_atvinnuleysi.xlsm → gogn/atvinnuleysi.json.
// Mánaðarleg gögn, miklu ferskari en vinnumarkaðsrannsókn Hagstofu (sem gröfin notuðu áður).
// Keyra: node skriptur/build_atvinnuleysi.js  (síðan build_embed.js). Uppfæra þegar nýtt xlsm berst.
const XLSX = require('xlsx');
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/';
const wb = XLSX.readFile(DIR + 'gogn/Talnagogn_atvinnuleysi.xlsm', { cellDates: true });
const sheet = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
// "YYYYMmm" eins og Hagstofu-gögnin svo lblF/lbl/tagUpd-formatararnir virki óbreyttir
const ym = d => (d instanceof Date) ? d.getUTCFullYear() + 'M' + String(d.getUTCMonth() + 1).padStart(2, '0') : null;
const pct = v => (typeof v === 'number') ? +(v * 100).toFixed(2) : null;

// --- G1: árlegt (Ár | hlutfall) ---
const g1 = sheet('G1');
const annual = g1.filter(r => typeof r[0] === 'number' && r[0] > 1990 && typeof r[1] === 'number')
  .map(r => ({ y: r[0], v: pct(r[1]) }));

// --- G2: mánaðarlegt % (raðir eftir merkimiða í dálki A) ---
const g2 = sheet('G2');
const dateRow = g2.find(r => r[2] instanceof Date); // röð með dagsetningahausum
const months = dateRow.slice(2).map(ym);
function g2row(label) {
  const r = g2.find(x => String(x[0] || '').trim() === label);
  if (!r) return null;
  return r.slice(2).map((v, i) => ({ t: months[i], v: pct(v) })).filter(x => x.t && x.v != null);
}
const monthly = g2row('Landið allt');
function latestOf(label) { const s = g2row(label); return s && s.length ? s[s.length - 1].v : null; }
const latestT = monthly[monthly.length - 1].t;
const byCitizenship = { islenskt: latestOf('Íslenskt ríkisfang'), erlent: latestOf('Erlent ríkisfang') };
const bySex = { karlar: latestOf('Karlar'), konur: latestOf('Konur') };
const REGIONS = ['Höfuðborgarsvæði alls', 'Suðurnes alls', 'Vesturland alls', 'Vestfirðir alls', 'Norðurland vestra alls', 'Norðurland eystra alls', 'Austurland alls', 'Suðurland alls', 'Landsbyggð alls'];
const byRegion = REGIONS.map(l => ({ name: l.replace(/ alls$/, ''), v: latestOf(l) })).filter(x => x.v != null);
// líka mánaðarröð fyrir íslenskt vs erlent (sláandi munur) til að teikna feril
const citSeries = { islenskt: g2row('Íslenskt ríkisfang'), erlent: g2row('Erlent ríkisfang') };

// --- G5: eftir atvinnugreinum (fjöldi á skrá, nýjasti mánuður, "Allir"-hlutinn) ---
const g5 = sheet('G5');
const allIdx = g5.findIndex(r => String(r[0] || '').trim() === 'Allir');
const industries = [];
for (let i = allIdx + 1; i < g5.length; i++) {
  const name = String(g5[i][0] || '').trim();
  if (!name || name === 'Íslenskt ríkisfang') break; // næsti hluti = eftir ríkisfangi
  const cnt = g5[i][g5[i].length - 1];
  if (typeof cnt === 'number') industries.push({ name, n: cnt });
}
const totalReg = (() => { const r = g5[allIdx]; return typeof r[r.length - 1] === 'number' ? r[r.length - 1] : null; })();
industries.sort((a, b) => b.n - a.n);

// --- G3: per-sveitarfélag (fjöldi á skrá, nýjasti mánuður) → ÁÆTLAÐ hlutfall með íbúafjölda ---
// Gögnin eru fjöldi, ekki hlutfall; reiknum áætlað hlutfall kvarðað þannig að landsmeðaltal stemmi.
const g3 = sheet('G3');
const g3HeadRow = g3.find(r => String(r[0] || '').trim() === 'Landið allt' && r[1] === 'Allir');
const G3LI = g3HeadRow ? g3HeadRow.length - 1 : -1;
const natCount = g3HeadRow ? +g3HeadRow[G3LI] : null;
const NAMEMAP = {
  'Reykjavík': 'Reykjavíkurborg', 'Kópavogur': 'Kópavogsbær', 'Seltjarnarnes': 'Seltjarnarnes',
  'Garðabær': 'Garðabær', 'Hafnarfjörður': 'Hafnarfjörður', 'Mosfellsbær': 'Mosfellsbær',
  'Reykjanesbær': 'Reykjanesbær', 'Vogar': 'Sveitarfélagið Vogar', 'Suðurnesjabær': 'Suðurnesjabær',
  'Akranes': 'Akraneskaupstaður', 'Borgarbyggð': 'Borgarbyggð', 'Ísafjörður': 'Ísafjarðarbær',
  'Akureyri': 'Akureyrarbær', 'Norðurþing': 'Norðurþing', 'Fjarðabyggð': 'Fjarðabyggð',
  'Múlaþing': 'Múlaþing', 'Vestmannaeyjar': 'Vestmannaeyjabær', 'Árborg': 'Sveitarfélagið Árborg',
  'Hornafjörður': 'Sveitarfélagið Hornafjörður', 'Hveragerði': 'Hveragerðisbær', 'Ölfus': 'Sveitarfélagið Ölfus'
};
let SVPOP = {}; try { SVPOP = JSON.parse(fs.readFileSync(DIR + 'gogn/sveitarfelog_pop.json', 'utf8')); } catch (e) {}
const natPop = Object.values(SVPOP).reduce((a, b) => a + (+b || 0), 0);
const natRate = monthly[monthly.length - 1].v; // %
const partRatio = (natCount && natRate && natPop) ? (natCount / (natRate / 100)) / natPop : null; // vinnuafl sem hlutfall af íbúum
const byMuni = {};
if (partRatio) Object.keys(NAMEMAP).forEach(short => {
  const row = g3.find(x => String(x[0] || '').trim() === short && x[1] === 'Allir');
  const full = NAMEMAP[short], pop = SVPOP[full];
  if (!row || !pop) { console.log('  ⚠ per-muni vantar:', short, '→', full, pop ? '' : '(engin íbúatala)'); return; }
  const cnt = +row[G3LI]; if (!(cnt >= 0)) return;
  byMuni[full] = { rate: +(cnt / (pop * partRatio) * 100).toFixed(1), n: cnt };
});

const out = {
  source: 'Vinnumálastofnun', sourceUrl: 'https://vinnumalastofnun.is/um-okkur/tolulegar-upplysingar',
  note: 'Skráð atvinnuleysi (% af áætluðu vinnuafli) og fjöldi á atvinnuleysisskrá í lok mánaðar.',
  updated: latestT, latest: monthly[monthly.length - 1].v, totalRegistered: totalReg,
  annual, monthly, bySex, byCitizenship, byRegion, citSeries, industries, byMuni
};
fs.writeFileSync(DIR + 'gogn/atvinnuleysi.json', JSON.stringify(out));
console.log('atvinnuleysi.json: monthly', monthly.length, 'mán (til', latestT + '), latest', out.latest + '%');
console.log('  annual', annual.length, '| ríkisfang ísl', byCitizenship.islenskt + '% erl', byCitizenship.erlent + '%');
console.log('  regions', byRegion.length, '| industries', industries.length, '| total á skrá', totalReg);
console.log('  top industries:', industries.slice(0, 4).map(i => i.name + ' ' + i.n).join(', '));
