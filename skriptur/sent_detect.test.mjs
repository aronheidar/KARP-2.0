import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './sent_detect.js';
const { pickSent } = mod;

const SE = (updated, companies) => ({ updated, companies });
const F = (idx, n = 20) => ({ idx, n });

test('sveifla ≥ 40 gegn grunni frá deginum áður verður frambjóðandi, stærsta fyrst', () => {
  const grunnur = { dags: '2026-09-22', idx: { IKEA: -20, Skel: 10, Hagar: 0 } };
  const { cand } = pickSent(SE('2026-09-23', { IKEA: F(29), Skel: F(-45), Hagar: F(30) }), grunnur);
  assert.deepEqual(cand.map((c) => [c.nafn, c.fra, c.i]), [['Skel', 10, -45], ['IKEA', -20, 29]]);
  assert.equal(cand[0].n, 20);
});

test('grunnur á gamla sniðinu (án dagsetningar) er ekki borinn saman: þögul endurstilling', () => {
  // 22.9.2026: state.sent geymdi júnígildi (IKEA -100) og sentiment.json lifnaði við sama dag
  const { cand, grunnur } = pickSent(SE('2026-09-22', { IKEA: F(29, 14) }), { IKEA: -100, Skel: -100 });
  assert.deepEqual(cand, []);
  assert.deepEqual(grunnur, { dags: '2026-09-22', idx: { IKEA: 29 } });
});

test('grunnur eldri en 3 daga er ekki borinn saman', () => {
  const g = { dags: '2026-06-28', idx: { IKEA: -100 } };
  assert.deepEqual(pickSent(SE('2026-09-22', { IKEA: F(29) }), g).cand, []);
  const g3 = { dags: '2026-09-19', idx: { IKEA: -100 } };
  assert.equal(pickSent(SE('2026-09-22', { IKEA: F(29) }), g3).cand.length, 1, '3 dagar eru enn nothæfir');
});

test('grunnurinn geymir aðeins félög með a.m.k. 5 fréttum', () => {
  const { grunnur } = pickSent(SE('2026-09-22', { A: F(-100, 2), B: F(40, 5), C: { idx: null, n: 30 } }), null);
  assert.deepEqual(grunnur.idx, { B: 40 });
});

test('núverandi gildi á færri en 5 fréttum verður ekki frétt', () => {
  const g = { dags: '2026-09-22', idx: { A: -60 } };
  assert.deepEqual(pickSent(SE('2026-09-23', { A: F(40, 4) }), g).cand, []);
});

test('grunnur með dagsetningu Á EFTIR skránni (skrá færð aftur) er ekki borinn saman', () => {
  const g = { dags: '2026-09-24', idx: { A: -60 } };
  assert.deepEqual(pickSent(SE('2026-09-23', { A: F(40) }), g).cand, []);
});

test('þak: sjálfgefið 3 frambjóðendur', () => {
  const g = { dags: '2026-09-22', idx: { A: 0, B: 0, C: 0, D: 0 } };
  const { cand } = pickSent(SE('2026-09-23', { A: F(50), B: F(60), C: F(70), D: F(80) }), g);
  assert.deepEqual(cand.map((c) => c.nafn), ['D', 'C', 'B']);
});

test('skrá án dagsetningar eða félaga gefur enga frambjóðendur og tóman grunn', () => {
  assert.deepEqual(pickSent(null, { dags: '2026-09-22', idx: { A: 0 } }), { cand: [], grunnur: { dags: null, idx: {} } });
  assert.deepEqual(pickSent(SE(undefined, { A: F(90) }), { dags: '2026-09-22', idx: { A: 0 } }).cand, []);
});
