import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleReport } from '../build_eigendur.mjs';

// Gervi-RSK: Gervifélag (rót) á Vala hf. (80%); Vala á Leggir ehf. (84,25%); Leggir á Njáll (100%, einst).
const HLUT = {
  '1000000000': { nafn: 'Gervifélag ehf.', ar: '2019', hluthafar: [{ nafn: 'Vala hf.', kt: '2000000000', hlutur: 80 }] },
  '2000000000': { nafn: 'Vala hf.', ar: '2019', hluthafar: [{ nafn: 'Leggir ehf.', kt: '3000000000', hlutur: 84.25 }] },
  '3000000000': { nafn: 'Leggir ehf.', ar: '2019', hluthafar: [{ nafn: 'Njáll Þorgeirsson', kt: null, hlutur: 100 }] },
};
const deps = {
  delay: 0,   // engin RSK-hófsemi-töf í prófum
  fetchHluthafar: async (kt) => HLUT[kt] || { nafn: null, hluthafar: [], ar: null },
  fetchRaunverulegir: async () => ({ eigendur: [{ nafn: 'Njáll Þorgeirsson', faeding: '1972-FEBRÚAR', hlutur: '69%', tegund: 'Óbeint eignarhald á hlutafé' }], tomt: false }),
};

test('assembleReport builds tree + UBO from injected chains', async () => {
  const r = await assembleReport('1000000000', deps);
  assert.equal(r.kt, '1000000000');
  assert.equal(r.nafn, 'Gervifélag ehf.');
  const njall = r.endanlegir.find((e) => e.nafn === 'Njáll Þorgeirsson');
  assert.ok(njall, 'Njáll er endanlegur eigandi');
  assert.equal(njall.hlutur, 67.4);
  assert.deepEqual(njall.gegnum, ['Leggir ehf.', 'Vala hf.']);
  assert.equal(r.raunverulegir[0].nafn, 'Njáll Þorgeirsson');
  assert.equal(r.hluthafar[0].nafn, 'Vala hf.');
  assert.ok(r.net.nodes.some((n) => n.er_rot));
});

test('no shareholders but has beneficial owners -> fallback edges to root', async () => {
  const r = await assembleReport('9', {
    delay: 0,
    fetchHluthafar: async () => ({ nafn: 'Dreift ehf.', hluthafar: [], ar: null }),
    fetchRaunverulegir: async () => ({ eigendur: [{ nafn: 'Anna', faeding: '1980', hlutur: '55%', tegund: 'Bein' }], tomt: false }),
  });
  assert.equal(r.endanlegir[0].nafn, 'Anna');
  assert.equal(r.endanlegir[0].hlutur, 55);
});

test('no data anywhere -> engin merki', async () => {
  const r = await assembleReport('0', {
    delay: 0,
    fetchHluthafar: async () => ({ nafn: 'Tómt ehf.', hluthafar: [], ar: null }),
    fetchRaunverulegir: async () => ({ eigendur: [], tomt: true }),
  });
  assert.equal(r.engin, true);
  assert.ok(r.astaeda);
});
