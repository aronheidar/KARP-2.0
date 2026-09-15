import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARP_RASIR, dagatal, efnislina, erKarpRas, hopaFaerslur } from './markadsefni.mjs';

const LI = 'cmt92pcw000r9p20yv7b53018', FB = 'cmt92q6mr00pbmp0ykfa92r3v', EWB = 'cmpvni6bb00hpmt0yuatcjamo';
const NU = Date.UTC(2026, 8, 15) / 1000;   // 15.9.2026
const p = (id, group, rasId, dagar, state = 'QUEUE', content = 'Texti um kvóta') => ({
  id, group, state, content,
  publishDate: new Date((NU + dagar * 86400) * 1000).toISOString(),
  integration: { id: rasId, providerIdentifier: rasId === FB ? 'facebook' : 'linkedin-page', name: rasId === EWB ? 'EWB Iceland' : 'Karp' },
});

test('EWB-rásir teljast ALDREI með — reikningurinn ber fleiri rásir en Karp', () => {
  assert.equal(erKarpRas(LI), true);
  assert.equal(erKarpRas(FB), true);
  assert.equal(erKarpRas(EWB), false);
  assert.equal(erKarpRas(''), false);
  assert.equal(erKarpRas(null), false);
  assert.deepEqual(KARP_RASIR.slice().sort(), [FB, LI].sort());
});

test('ein færsla á tveimur rásum er EITT verk — hópað á group', () => {
  const verk = hopaFaerslur([p('a1', 'g1', LI, 2), p('a2', 'g1', FB, 2), p('b1', 'g2', LI, 5)]);
  assert.equal(verk.length, 2);
  assert.deepEqual(verk[0].rasir.sort(), ['facebook', 'linkedin-page']);
  assert.equal(verk[0].group, 'g1');
  assert.equal(verk[1].rasir.length, 1);
});

test('færslur á EWB-rásum eru síaðar burt áður en hópað er', () => {
  const verk = hopaFaerslur([p('e1', 'ge', EWB, 1), p('a1', 'g1', LI, 2)]);
  assert.equal(verk.length, 1);
  assert.equal(verk[0].group, 'g1');
});

test('dagatal: hve langt nær það fram í tímann — talan sem segir hvort þú sért á eftir', () => {
  const verk = hopaFaerslur([p('a', 'g1', LI, 2), p('b', 'g2', LI, 9), p('c', 'g3', LI, -3, 'PUBLISHED')]);
  const d = dagatal(verk, NU);
  assert.equal(d.iRod, 2, 'aðeins framtíðar-færslur í röðinni');
  assert.equal(d.dagarFram, 9, 'nær níu daga fram');
  assert.equal(d.naesta.group, 'g1', 'næsta er sú sem fer fyrst út');
  assert.equal(d.birtSidast.group, 'g3');
});

test('dagatal: tómt safn skilar núllum en kastar ekki', () => {
  const d = dagatal([], NU);
  assert.equal(d.iRod, 0);
  assert.equal(d.dagarFram, 0);
  assert.equal(d.naesta, null);
  assert.equal(d.birtSidast, null);
  assert.deepEqual(dagatal(null, NU).iRod, 0);
});

test('efnislina: fyrsta setning innihaldsins, klippt, án línuskila', () => {
  assert.equal(efnislina({ content: 'Fyrsta setning. Önnur setning sem má hverfa.' }), 'Fyrsta setning.');
  assert.equal(efnislina({ content: 'Lína eitt\nlína tvö' }), 'Lína eitt lína tvö');
  assert.equal(efnislina({ content: 'x'.repeat(200) }).length, 120);
  assert.equal(efnislina({}), '(enginn texti)');
  assert.equal(efnislina(null), '(enginn texti)');
});
