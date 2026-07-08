import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeUbo, round2 } from '../lib/ubo.mjs';

test('direct individual owner', () => {
  const nodes = [
    { id: 'root', kt: '1', nafn: 'Félag', tegund: 'felag', er_rot: true },
    { id: 'p', kt: null, nafn: 'Jón', tegund: 'einst', faeding: '1970' },
  ];
  const edges = [{ fra: 'p', til: 'root', hlutur: 60 }];
  const { endanlegir, othekkt } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir.length, 1);
  assert.deepEqual(endanlegir[0], { nafn: 'Jón', kt: null, faeding: '1970', tegund: 'einst', hlutur: 60, gegnum: [] });
  assert.equal(othekkt, 40);
});

test('chain through intermediates multiplies and lists gegnum owner-first', () => {
  const nodes = [
    { id: 'root', kt: 'G', nafn: 'Gervi', tegund: 'felag', er_rot: true },
    { id: 'vala', kt: 'V', nafn: 'Vala hf.', tegund: 'felag' },
    { id: 'leggir', kt: 'L', nafn: 'Leggir ehf.', tegund: 'felag' },
    { id: 'njall', kt: null, nafn: 'Njáll', tegund: 'einst', faeding: '1972' },
  ];
  const edges = [
    { fra: 'vala', til: 'root', hlutur: 80 },
    { fra: 'leggir', til: 'vala', hlutur: 84.25 },
    { fra: 'njall', til: 'leggir', hlutur: 100 },
  ];
  const { endanlegir } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir[0].nafn, 'Njáll');
  assert.equal(endanlegir[0].hlutur, 67.4);            // 0.8*0.8425*1 = 0.674
  assert.deepEqual(endanlegir[0].gegnum, ['Leggir ehf.', 'Vala hf.']);
});

test('same owner via two paths aggregates', () => {
  const nodes = [
    { id: 'root', kt: 'R', nafn: 'R', tegund: 'felag', er_rot: true },
    { id: 'a', kt: 'A', nafn: 'A', tegund: 'felag' },
    { id: 'p', kt: 'P', nafn: 'P', tegund: 'einst' },
  ];
  const edges = [
    { fra: 'p', til: 'root', hlutur: 30 },   // direct 30
    { fra: 'a', til: 'root', hlutur: 40 },   // via A
    { fra: 'p', til: 'a', hlutur: 50 },      // P owns 50% of A -> 20
  ];
  const { endanlegir } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir.length, 1);
  assert.equal(endanlegir[0].hlutur, 50);  // 30 + 20
});

test('unresolvable company is a terminal ultimate owner', () => {
  const nodes = [
    { id: 'root', kt: 'R', nafn: 'R', tegund: 'felag', er_rot: true },
    { id: 'foreign', kt: 'F', nafn: 'Cranberry Investments', tegund: 'felag' },
  ];
  const edges = [{ fra: 'foreign', til: 'root', hlutur: 9.96 }]; // no owners of `foreign`
  const { endanlegir, othekkt } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir[0].nafn, 'Cranberry Investments');
  assert.equal(endanlegir[0].tegund, 'felag');
  assert.equal(othekkt, round2(100 - 9.96));
});

test('cycle does not infinite-loop', () => {
  const nodes = [
    { id: 'root', kt: 'R', nafn: 'R', tegund: 'felag', er_rot: true },
    { id: 'a', kt: 'A', nafn: 'A', tegund: 'felag' },
  ];
  const edges = [{ fra: 'a', til: 'root', hlutur: 50 }, { fra: 'root', til: 'a', hlutur: 50 }];
  const { endanlegir } = computeUbo(nodes, edges, 'root');
  assert.equal(endanlegir[0].nafn, 'A'); // A terminal (its only owner is root, on-path -> skipped)
});
