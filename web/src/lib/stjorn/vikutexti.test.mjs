import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eintala, svartimi, vikutexti } from './vikutexti.mjs';

test('eintala: tala sem endar á 1 en ekki 11 — íslenska samræmisreglan', () => {
  for (const n of [1, 21, 31, 101, 121]) assert.ok(eintala(n), n + ' er eintala');
  for (const n of [0, 2, 5, 10, 11, 12, 111, 211]) assert.ok(!eintala(n), n + ' er fleirtala');
});

test('vikutexti: sögnin og nafnorðið fylgja tölunni, líka 21 og 11', () => {
  assert.equal(vikutexti({ barust: 1 })[0], '1 beiðni barst í vikunni.');
  assert.equal(vikutexti({ barust: 21 })[0], '21 beiðni barst í vikunni.');
  assert.equal(vikutexti({ barust: 11 })[0], '11 beiðnir bárust í vikunni.');
  assert.equal(vikutexti({ barust: 0 })[0], 'Engin beiðni barst í vikunni.');
  assert.ok(vikutexti({ barust: 3, opnir: 1 }).includes('1 er enn opin.'));
  assert.ok(vikutexti({ barust: 3, opnir: 4 }).includes('4 eru enn opnar.'));
  assert.ok(vikutexti({ barust: 3, tilHrafns: 1 }).some((x) => x.includes('1 fór áfram til Hrafns')));
  assert.ok(vikutexti({ barust: 3, tilHrafns: 2 }).some((x) => x.includes('2 fóru áfram til Hrafns')));
});

test('vikutexti: hver hluti birtist aðeins ef talan er til — engin „0 svaraði ég"', () => {
  const t = vikutexti({ barust: 5, svaradHenni: 4, svaradAroni: 0, tilHrafns: 1, opnir: 0 });
  assert.equal(t[1], 'Ég svaraði 4 og 1 fór áfram til Hrafns.');
  assert.ok(!t.join(' ').includes('þú svaraðir'));
  assert.equal(t[t.length - 1], 'Engin er opin núna.');
  // kynhlutlaust: hvorki „sjálfur" né „sjálf" um lesandann
  assert.equal(vikutexti({ barust: 8, svaradHenni: 3, svaradAroni: 4, tilHrafns: 1 })[1], 'Ég svaraði 3, þú svaraðir 4 og 1 fór áfram til Hrafns.');
});

test('vikutexti: ein athugasemd að hámarki, valin eftir reglu', () => {
  const med = vikutexti({ barust: 10, algengastFlokkur: { heiti: 'innskráningu', hlutfall: 0.5 }, lengstOpinn: { id: 42, dagar: 5 } });
  assert.ok(med.includes('Flestar snerust um innskráningu.'));
  assert.ok(!med.some((x) => x.includes('#42')), 'flokkurinn gengur fyrir, aðeins ein athugasemd');
  const an = vikutexti({ barust: 10, algengastFlokkur: { heiti: 'x', hlutfall: 0.2 }, lengstOpinn: { id: 42, dagar: 5 } });
  assert.ok(an.includes('Lengst hefur #42 beðið, í 5 daga.'));
});

test('svartimi: mannlegt mál og rétt beyging á sólarhring', () => {
  assert.equal(svartimi(0.4), 'undir klukkustund');
  assert.equal(svartimi(3.2), '3 klst.');
  assert.equal(svartimi(24), '24 klst.');
  assert.equal(svartimi(60), '3 sólarhringar');
  assert.equal(svartimi(22 * 24), '22 sólarhringar');
  assert.equal(svartimi(21 * 24), '21 sólarhringur');
  assert.equal(svartimi(NaN), '');
});

test('vikutexti: rusl-inntak skilar samt heilum setningum og kastar aldrei', () => {
  for (const x of [undefined, null, {}, { barust: 'abc' }, { barust: -3 }]) {
    const t = vikutexti(x);
    assert.ok(Array.isArray(t) && t.length >= 2);
    t.forEach((s) => assert.match(s, /\.$/));
  }
});

test('vikutexti: styttingarpunktur verður ekki tvöfaldur (3 klst. en ekki 3 klst..)', () => {
  const t = vikutexti({ barust: 4, svartimiKlst: 3.2 });
  assert.ok(t.includes('Miðgildi svartíma var 3 klst.'));
  assert.ok(!t.join(' ').includes('..'), 'enginn tvöfaldur punktur í neinni setningu');
  assert.ok(vikutexti({ barust: 4, svartimiKlst: 60 }).includes('Miðgildi svartíma var 3 sólarhringar.'));
  assert.ok(vikutexti({ barust: 4, svartimiKlst: 0.3 }).includes('Miðgildi svartíma var undir klukkustund.'));
});

test('vikutexti: rýnin 21.9 — sögnin stendur einu sinni, og „var" þegar engu var lokað', () => {
  assert.ok(vikutexti({ barust: 5, lokad: 6, hafnad: 1 }).includes('6 var lokað og 1 hafnað.'));
  assert.ok(vikutexti({ barust: 5, lokad: 0, hafnad: 3 }).includes('3 var hafnað.'), 'ekki „3 hafnað."');
  assert.ok(vikutexti({ barust: 5, lokad: 4 }).includes('4 var lokað.'));
});

test('vikutexti: lengst beðið — í 21 dag, í 22 daga', () => {
  assert.ok(vikutexti({ barust: 1, lengstOpinn: { id: 9, dagar: 21 } }).includes('Lengst hefur #9 beðið, í 21 dag.'));
  assert.ok(vikutexti({ barust: 1, lengstOpinn: { id: 9, dagar: 22 } }).includes('Lengst hefur #9 beðið, í 22 daga.'));
});

test('vikutexti: áætlaðar tölur eru sagðar áætlaðar, ekki sýndar sem staðreynd', () => {
  const t = vikutexti({ barust: 5, svaradHenni: 3, tilHrafns: 1, lokad: 6, hafnad: 1, aaetlad: true });
  assert.ok(t.includes('Um það bil 6 var lokað og 1 hafnað.'));
  assert.ok(t.some((x) => x.includes('um það bil 1 fór áfram til Hrafns')));
  const n = vikutexti({ barust: 5, lokad: 6, aaetlad: false });
  assert.ok(!n.join(' ').toLowerCase().includes('um það bil'));
});
