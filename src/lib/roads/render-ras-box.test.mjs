import { renderRasBox } from './render-ras-box.mjs';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const sim = { mode: 'sim', illustrative: false, inputLabel: 'Stýrivextir 9,00% → 8,50%', inputKey: 'vextir', horizonQuarters: 12,
  topEffects: [{ key: 'hagvoxtur', label: 'Hagvöxtur', delta: 0.4, dir: 1, unit: '%', valence: 1 }, { key: 'verdbolga', label: 'Verðbólga', delta: 0.3, dir: 1, unit: '%', valence: -1 }],
  sentence: 'Samkvæmt RÁS: hagvöxtur hækkar, verðbólga hækkar (3 ára sýn).', deepLink: '/hermir/#l.vextir=8.5', source: 'RÁS-hermir' };
const illu = { ...sim, illustrative: true };

ok('empty on null', renderRasBox(null) === '');
ok('empty on no effects', renderRasBox({ mode: 'sim', topEffects: [] }) === '');
const h = renderRasBox(sim);
ok('has header', h.includes('Samkvæmt RÁS'));
ok('has input label', h.includes('Stýrivextir 9,00% → 8,50%'));
ok('has effect label', h.includes('Hagvöxtur'));
ok('has deep link', h.includes('href="/hermir/#l.vextir=8.5"'));
ok('has disclaimer', h.includes('ekki spá'));
ok('no badge when not illustrative', !h.includes('dæmi til skýringar'));
ok('good color for +valence', h.includes('#54d08a'));
ok('bad color for -valence', h.includes('#e78284'));
ok('badge when illustrative', renderRasBox(illu).includes('dæmi til skýringar'));
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
