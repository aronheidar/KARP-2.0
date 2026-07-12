import { test } from 'node:test';
import assert from 'node:assert';
import { maskaKortSvar } from '../worker.js';

test('maskaKortSvar strips krossar names, adds stable tokens', () => {
  const out = {
    kt: '5555555555', holdur: true, n_felog: 3,
    felog: [{ kt: '5555555555', nafn: 'Rót ehf.' }],
    stjornendur: [{ nafn: 'Anna Ansdóttir', hlutverk_rot: ['stjórn'], onnur: [{ kt: '4444444444', nafn: 'Vala hf.', hlutverk: 'stjórn' }] }],
    krossar: [{ nafn: 'Leyni Persóna', felog: [{ kt: '4444444444', nafn: 'Vala hf.' }, { kt: '3333333333', nafn: 'Beta ehf.' }] }],
    heimild: 'x',
  };
  const m = maskaKortSvar(out);
  // krossar: name CUT, token + maskad added
  assert.equal(m.krossar[0].nafn, undefined);
  assert.equal(m.krossar[0].token, 'E1');
  assert.equal(m.krossar[0].maskad, true);
  // company names inside krossar.felog are KEPT
  assert.equal(m.krossar[0].felog[1].nafn, 'Beta ehf.');
  // root-connected stjornendur keep their names
  assert.equal(m.stjornendur[0].nafn, 'Anna Ansdóttir');
  // ⚠ PRIVACY: no distant individual name anywhere in the whole response
  assert.ok(!JSON.stringify(m).includes('Leyni Persóna'));
  assert.equal(m.kort, true);
});

test('maskaKortSvar leaves the original object untouched (pure)', () => {
  const out = { kt: '5', holdur: true, stjornendur: [], krossar: [{ nafn: 'X', felog: [] }] };
  maskaKortSvar(out);
  assert.equal(out.krossar[0].nafn, 'X'); // original not mutated
});

test('maskaKortSvar passes through holdur:false unchanged', () => {
  const out = { kt: '5555555555', holdur: false };
  assert.deepEqual(maskaKortSvar(out), out);
});
