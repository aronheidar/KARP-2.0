import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meginmal, berSaman, samantektLaerdoms, stillFra, hreinsaDrog, laerdomsTexti, brot } from './laerdomur.mjs';
import * as laerdomur from './laerdomur.mjs';

const DROG = 'Sæl/Sæll Jón,\n\nTakk fyrir að hafa samband. Aðgangurinn þinn hefur verið endurstilltur og þú getur skráð þig inn aftur. Ef það gengur ekki máttu svara þessum pósti og við skoðum málið betur saman.\n\nBestu kveðjur,';

test('meginmal: ávarp og kveðja eru ekki efni — Aron velur Sæll eða Sæl, hún giskar ekki', () => {
  assert.equal(meginmal('Sæll Jón,\n\nHæ þetta er efnið.\n\nBestu kveðjur,\nAron'), 'Hæ þetta er efnið.');
  assert.equal(meginmal(DROG).startsWith('Takk fyrir'), true);
  assert.equal(berSaman(DROG, DROG.replace('Sæl/Sæll Jón,', 'Sæll Jón,')).obreytt, true, 'aðeins ávarpinu breytt');
});

test('berSaman: tekið út, bætt við og orðafjöldi', () => {
  const sent = 'Sæll Jón,\n\nAðgangurinn þinn hefur verið endurstilltur og þú getur skráð þig inn aftur.\n\nKveðja,\nAron';
  const r = berSaman(DROG, sent);
  assert.equal(r.obreytt, false);
  assert.deepEqual(r.tekidUt, ['Takk fyrir að hafa samband.', 'Ef það gengur ekki máttu svara þessum pósti og við skoðum málið betur saman.']);
  assert.deepEqual(r.baettVid, []);
  assert.ok(r.sentOrd < r.drogOrd / 2);
});

// Þrjú svör þar sem Aron tók út sömu kurteisissetninguna og stytti
const pars = [1, 2, 3].map((id) => ({ id, drog: DROG, sent: 'Sæll,\n\nAðgangurinn þinn hefur verið endurstilltur og þú getur skráð þig inn aftur.\n\nKveðja' }))
  .concat([{ id: 4, drog: DROG, sent: DROG }, { id: 5, drog: '', sent: 'x' }]);

test('samantektLaerdoms: telur, miðgildi lengdar, og aðeins setningar sem endurtóku sig í ólíkum beiðnum', () => {
  const l = samantektLaerdoms(pars);
  assert.equal(l.fjoldi, 4, 'beiðni án draga telst ekki');
  assert.equal(l.obreytt, 1);
  assert.equal(l.breytt, 3);
  assert.ok(l.lengd > 0.3 && l.lengd < 0.5, String(l.lengd));
  assert.deepEqual(l.tekidUtOft[0], { setning: 'Takk fyrir að hafa samband', n: 3 });
  assert.deepEqual(l.baettVidOft, []);
  // sama beiðni tvisvar er EIN beiðni: setning sem Aron tók út tvisvar úr sama svari kennir ekkert almennt
  const einn = samantektLaerdoms([{ id: 9, drog: 'A a. B b.', sent: 'C c.' }, { id: 9, drog: 'A a. B b.', sent: 'C c.' }]);
  assert.deepEqual(einn.tekidUtOft.map((x) => x.n), [], 'sama id telst einu sinni');
});

test('stillFra: orðaþak og setningar, en aðeins með nægum gögnum', () => {
  const s = stillFra(samantektLaerdoms(pars));
  assert.equal(s.ordHamark, 40, 'miðgildið er undir 40 orðum, þakið fer ekki neðar');
  assert.deepEqual(s.sleppa, ['Takk fyrir að hafa samband', 'Ef það gengur ekki máttu svara þessum pósti og við skoðum málið betur saman']);
  assert.ok(!('nota' in s), 'því sem Aron bætir við er ekki bætt sjálfkrafa í drög');
  assert.equal(stillFra(samantektLaerdoms(pars.slice(0, 2))), null, 'tvö svör eru of fá');
  // Rýnin 22.9: 150 orða drög stytt í 118 gáfu þak upp á 120 — sama og áður — en textinn lofaði styttingu
  const langt = { fjoldi: 4, obreytt: 0, breytt: 4, lengd: 0.79, sentOrdMidgildi: 118, tekidUtOft: [], baettVidOft: [] };
  assert.equal(stillFra(langt), null, 'þak sem breytir engu er ekkert þak');
  assert.ok(!laerdomsTexti({ vika: langt, still: stillFra(langt) }).join(' ').includes('svo nú'));
});

test('hreinsaDrog: rýnin 22.9 — setningin fer úr drögunum hjá þjóninum og kemst aldrei í promptið', () => {
  const still = { sleppa: ['Takk fyrir að hafa samband'] };
  assert.equal(hreinsaDrog(DROG, still),
    'Sæl/Sæll Jón,\n\nAðgangurinn þinn hefur verið endurstilltur og þú getur skráð þig inn aftur. Ef það gengur ekki máttu svara þessum pósti og við skoðum málið betur saman.\n\nBestu kveðjur,');
  assert.equal(hreinsaDrog('Sæll,\n\nTakk fyrir að hafa samband.\n\nKveðja', still), 'Sæll,\n\nTakk fyrir að hafa samband.\n\nKveðja', 'tóm drög væru verri en of löng');
  assert.equal(hreinsaDrog(DROG, null), DROG);
  assert.equal(hreinsaDrog('', still), '');
  assert.equal(typeof laerdomur.stillPrompt, 'undefined', 'engin leið fyrir setningar inn í promptið');
});

test('laerdomsTexti: í hennar rödd, með talnasamræmi, og lofar aðeins því sem stíllinn gerir í raun', () => {
  const l = samantektLaerdoms(pars);
  const s = stillFra(l);
  assert.deepEqual(laerdomsTexti({ vika: l, still: s }), [
    'Þú sendir 4 svör þar sem ég hafði skrifað drög.',
    'Eitt fór óbreytt og þú breyttir þremur.',
    'Þú styttir þau að jafnaði um ' + brot(1 - l.lengd) + ', svo nú hef ég drögin styttri.',
    'Þrisvar tókstu út „Takk fyrir að hafa samband“ og ég er hætt að skrifa það.',
  ]);
  const anStils = laerdomsTexti({ vika: l, still: null });
  assert.ok(!anStils.join(' ').includes('svo nú') && !anStils.join(' ').includes('hætt'), 'engin loforð án stíls');
  assert.deepEqual(laerdomsTexti({ vika: { fjoldi: 1, obreytt: 1, breytt: 0, lengd: null, tekidUtOft: [], baettVidOft: [] } }),
    ['Þú sendir 1 svar þar sem ég hafði skrifað drög.', 'Það fór óbreytt.']);
  assert.deepEqual(laerdomsTexti({ vika: { fjoldi: 21, obreytt: 0, breytt: 21, lengd: 1.5, tekidUtOft: [], baettVidOft: [] } }),
    ['Þú sendir 21 svar þar sem ég hafði skrifað drög.', 'Þú breyttir þeim öllum.', 'Þú lengdir þau að jafnaði um helming.']);
  assert.deepEqual(laerdomsTexti({ vika: { fjoldi: 0 } }), []);
  // rýnin 22.9: „21 sinni", ekki „21 sinnum"; og viðbót Arons er aðeins sögð, aldrei lofuð
  const tuttugu = laerdomsTexti({ vika: { fjoldi: 30, obreytt: 9, breytt: 21, lengd: 1, tekidUtOft: [{ setning: 'A b', n: 21 }], baettVidOft: [{ setning: 'C d', n: 2 }] }, still: { sleppa: ['A b'] } });
  assert.ok(tuttugu.includes('21 sinni tókstu út „A b“ og ég er hætt að skrifa það.'), tuttugu.join(' | '));
  assert.ok(tuttugu.includes('Þú bætir oft við „C d“.'));
});

test('brot: nálæg brot fá heiti, annars prósenta', () => {
  assert.equal(brot(0.5), 'helming');
  assert.equal(brot(0.31), 'þriðjung');
  assert.equal(brot(0.15), '15%');
});
