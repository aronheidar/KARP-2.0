import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './stjorar_detect.js';
const { pickStjorar } = mod;

// sveitarstjorar.json: {updated, byName: {sveitarfélag: {stjori, stjoriTitill}}}
const ST = (updated, byName) => ({ updated, byName });
const S = (stjori, stjoriTitill = 'Sveitarstjóri') => ({ stjori, stjoriTitill });
const G = (dags, stjorar) => ({ dags, stjorar });

test('nýr sveitarstjóri gegn grunni frá deginum áður verður frétt', () => {
  const { cand, grunnur } = pickStjorar(ST('2026-08-27', { Kjósarhreppur: S('Jóhanna Hreinsdóttir'), Vogar: S('A') }),
    G('2026-08-26', { Kjósarhreppur: { stjori: 'Þorbjörg Gísladóttir', titill: 'Sveitarstjóri' }, Vogar: { stjori: 'A', titill: 'Sveitarstjóri' } }));
  assert.deepEqual(cand, [{ sveitarfelag: 'Kjósarhreppur', nafn: 'Jóhanna Hreinsdóttir', titill: 'Sveitarstjóri', fyrri: 'Þorbjörg Gísladóttir' }]);
  assert.equal(grunnur.dags, '2026-08-27');
});

test('grunnur eldri en 3 daga (skráin stóð og lifnaði) er ekki borinn saman', () => {
  const { cand, grunnur } = pickStjorar(ST('2026-09-22', { Vogar: S('B') }), G('2026-08-01', { Vogar: { stjori: 'A', titill: 'Sveitarstjóri' } }));
  assert.deepEqual(cand, []);
  assert.deepEqual(grunnur, G('2026-09-22', { Vogar: { stjori: 'B', titill: 'Sveitarstjóri' } }));
});

test('grunnur á gamla sniðinu (án dagsetningar) endurstillist í þögn', () => {
  const { cand, grunnur } = pickStjorar(ST('2026-09-22', { Vogar: S('B') }), { Vogar: { stjori: 'A', titill: 'Sveitarstjóri' } });
  assert.deepEqual(cand, []);
  assert.equal(grunnur.dags, '2026-09-22');
});

test('sveitarfélag sem var ekki í grunninum (enginn stjóri skráður áður) er ekki frétt', () => {
  assert.deepEqual(pickStjorar(ST('2026-09-22', { Vogar: S('B') }), G('2026-09-21', {})).cand, []);
});

test('tóm skrá eða skrá án dagsetningar skrifar ekki yfir grunninn', () => {
  const g0 = G('2026-09-21', { Vogar: { stjori: 'A', titill: 'Sveitarstjóri' } });
  assert.deepEqual(pickStjorar(ST('2026-09-22', {}), g0), { cand: [], grunnur: g0 });
  assert.deepEqual(pickStjorar(ST(undefined, { Vogar: S('B') }), g0), { cand: [], grunnur: g0 });
});
