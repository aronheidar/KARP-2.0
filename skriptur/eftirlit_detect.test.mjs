import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './eftirlit_detect.js';
const { pickEftirlit } = mod;

// eftirlit.json: {updated, count, dist: [einkunn 0..5]}; „stöðvaðir eða takmarkaðir" = einkunn 0–1
const E = (updated, count, d0, d1) => ({ updated, count, dist: [d0, d1, 100, 200, 300, count - 600 - d0 - d1] });
const G = (dags, bad, fjoldi) => ({ dags, bad, fjoldi });

test('breyting á fjölda stöðvaðra/takmarkaðra gegn grunni frá deginum áður verður frétt', () => {
  const r = pickEftirlit(E('2026-09-22T11:48:51.290Z', 699, 6, 18), G('2026-09-21', 21, 699));
  assert.deepEqual([r.bad, r.fyrri], [24, 21]);
  assert.deepEqual(r.grunnur, G('2026-09-22', 24, 699));
});

test('óbreyttur fjöldi er ekki frétt', () => {
  assert.equal(pickEftirlit(E('2026-09-22', 699, 5, 16), G('2026-09-21', 21, 699)).fyrri, null);
});

test('grunnur eldri en 3 daga er ekki borinn saman („borið saman við 21 áður" yfir mánaðabil)', () => {
  const r = pickEftirlit(E('2026-09-22', 699, 10, 20), G('2026-07-16', 21, 699));
  assert.equal(r.fyrri, null);
  assert.deepEqual(r.grunnur, G('2026-09-22', 30, 699));
});

test('grunnur á gamla sniðinu (tala) endurstillist í þögn', () => {
  const r = pickEftirlit(E('2026-09-22', 699, 10, 20), 21);
  assert.equal(r.fyrri, null);
  assert.deepEqual(r.grunnur, G('2026-09-22', 30, 699));
});

test('hálf skrá (fyrirspurnir brugðust) er ekki borin saman og skrifar ekki yfir grunninn', () => {
  const g0 = G('2026-09-21', 21, 699);
  const halft = pickEftirlit(E('2026-09-22', 500, 4, 11), g0);
  assert.deepEqual([halft.fyrri, halft.grunnur], [null, g0]);
  const heil = pickEftirlit(E('2026-09-23', 699, 6, 16), halft.grunnur);
  assert.deepEqual([heil.bad, heil.fyrri], [22, 21], 'næsta heila skrá er borin saman við síðustu heilu');
});

test('fjölgun staða um meira en 5% endurstillir í þögn (annað þýði)', () => {
  const r = pickEftirlit(E('2026-09-22', 760, 6, 20), G('2026-09-21', 21, 699));
  assert.equal(r.fyrri, null);
  assert.deepEqual(r.grunnur, G('2026-09-22', 26, 760));
});

test('skrá án dagsetningar, dreifingar eða staða: engin frétt og grunnur óbreyttur', () => {
  const g0 = G('2026-09-21', 21, 699);
  assert.deepEqual(pickEftirlit(E(undefined, 699, 9, 9), g0), { bad: 18, fyrri: null, grunnur: g0 });
  assert.deepEqual(pickEftirlit({ updated: '2026-09-22', count: 0, dist: [] }, g0), { bad: null, fyrri: null, grunnur: g0 });
});
