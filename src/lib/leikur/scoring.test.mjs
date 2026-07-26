import { scoreKpi, scoreRound } from './scoring.mjs';
import { MANDATE } from './game-config.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const spec = (k) => MANDATE.kpis.find((x) => x.key === k);

// target (verðbólga 2,5 ±1,0, zeroAt 4,0)
ok('verðbólga á markmiði → 100', scoreKpi(2.5, spec('verdbolga')) === 100);
ok('verðbólga á band-jaðri → 100', scoreKpi(3.5, spec('verdbolga')) === 100);
ok('verðbólga utan bands rýrnar', scoreKpi(5.0, spec('verdbolga')) < 100 && scoreKpi(5.0, spec('verdbolga')) >= 0);
ok('verðbólga langt frá → 0', scoreKpi(9.0, spec('verdbolga')) === 0);
// max (atvinnuleysi ≤4,5, band→5,5, zeroAt 4,0 fyrir ofan band)
ok('atvinnuleysi undir marki → 100', scoreKpi(4.0, spec('atvinnuleysi')) === 100);
ok('atvinnuleysi á band-jaðri → 100', scoreKpi(5.5, spec('atvinnuleysi')) === 100);
ok('atvinnuleysi hátt → lægra', scoreKpi(8.0, spec('atvinnuleysi')) < 100);
// min (hagvöxtur ≥2,0, band→1,0, zeroAt 3,0 fyrir neðan band)
ok('hagvöxtur yfir marki → 100', scoreKpi(3.0, spec('hagvoxtur')) === 100);
ok('hagvöxtur á band-jaðri → 100', scoreKpi(1.0, spec('hagvoxtur')) === 100);
ok('samdráttur → lágt', scoreKpi(-3.0, spec('hagvoxtur')) < 50);
// scoreRound + kreppa
{
  const good = scoreRound({ verdbolga: 2.5, atvinnuleysi: 4.0, skuldir: 38, hagvoxtur: 2.5 });
  ok('gott umboð → hátt samsett', good.composite > 90 && !good.crisis);
  const crisis = scoreRound({ verdbolga: 14, atvinnuleysi: 4, skuldir: 38, hagvoxtur: 2 });
  ok('kreppa → merkt + refsað', crisis.crisis === true && crisis.composite < scoreRound({ verdbolga: 9.9, atvinnuleysi: 4, skuldir: 38, hagvoxtur: 2 }).composite);
  ok('perKpi 4 stök', good.perKpi.length === 4);
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
