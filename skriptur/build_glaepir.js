// Afbrotatölfræði (Ríkislögreglustjóri) — les FJOLDI_BROTA...xlsx → gogn/glaepir.json.
// Eftir UMDÆMI (≈ landshluta), brot á 10.000 íbúa. Headline = hegningarlagabrot (án umferðarlaga).
// Keyra: node skriptur/build_glaepir.js  (síðan build_embed.js).
const XLSX = require('xlsx');
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/';
const fname = fs.readdirSync(DIR + 'gogn').find(x => /FJOLDI_BROTA/i.test(x) && !/^~\$/.test(x));
const wb = XLSX.readFile(DIR + 'gogn/' + fname);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Landid_brotá íbúa_P.inhab'], { header: 1, blankrows: false });
const hdr = rows[0];
const yearCols = hdr.map((h, i) => ({ y: h, i })).filter(x => typeof x.y === 'number' && x.y > 2000);
const lastYr = yearCols[yearCols.length - 1].y, lastI = yearCols[yearCols.length - 1].i;
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

const REGIONS = ['Höfuðborgarsvæðið', 'Suðurnes', 'Vesturland', 'Vestfirðir', 'Norðurland vestra', 'Norðurland eystra', 'Austurland', 'Suðurland', 'Vestmannaeyjar', 'Öll embætti'];
// headline-yfirflokkar fyrir card-brot (lykill -> samtals-merki í gögnum)
const CATS = {
  hegn:   'Hegningarlagabrot',      // heildar-hegningarlög (án umferðar)
  ofbeldi:'Manndráp og líkamsmeiðingar',
  audgun: 'Auðgunarbrot',
  fikni:  'Fíkniefnabrot',
  kynf:   'Kynferðisbrot',
  eignsp: 'Eignaspjöll',
  umferd: 'Umferðarlagabrot'
};
function rowFor(region, yfir) {
  return rows.find(r => norm(r[0]) === region && norm(r[2]) === yfir && /samtals/i.test(norm(r[3])));
}
function val(r, i) { return (r && typeof r[i] === 'number') ? +r[i].toFixed(1) : null; }

const byRegion = {};
REGIONS.forEach(reg => {
  const hegnRow = rowFor(reg, 'Hegningarlagabrot');
  if (!hegnRow) { return; }
  const cats = {};
  Object.keys(CATS).forEach(k => { const r = rowFor(reg, CATS[k]); cats[k] = val(r, lastI); });
  // tímaröð fyrir hegningarlög (brot á 10þ)
  const series = yearCols.map(yc => ({ y: yc.y, v: val(hegnRow, yc.i) })).filter(p => p.v != null);
  byRegion[reg] = { hegn: val(hegnRow, lastI), cats, series };
});

const out = {
  source: 'Ríkislögreglustjóri', sourceUrl: 'https://www.logreglan.is/log-og-tolfraedi/tolfraedi/',
  note: 'Staðfest afbrot á 10.000 íbúa eftir lögregluumdæmi. Hegningarlagabrot = brot gegn hegningarlögum (án umferðarlagabrota).',
  unit: 'brot á 10.000 íbúa', year: lastYr,
  national: byRegion['Öll embætti'] || null,
  byRegion
};
delete out.byRegion['Öll embætti'];
fs.writeFileSync(DIR + 'gogn/glaepir.json', JSON.stringify(out));
console.log('glaepir.json: ár', lastYr, '| umdæmi', Object.keys(out.byRegion).length, '| national hegn', out.national && out.national.hegn);
Object.keys(out.byRegion).forEach(r => console.log('  ' + r.padEnd(20), 'hegn', out.byRegion[r].hegn, '| ofbeldi', out.byRegion[r].cats.ofbeldi, '| fíkn', out.byRegion[r].cats.fikni));
