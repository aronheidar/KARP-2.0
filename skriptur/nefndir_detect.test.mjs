import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './nefndir_detect.js';
const { pickNefndir } = mod;

// nefndir.json er FYLKI og ber enga dagsetningu; althingi_meta.json er skrifað í sömu keyrslu og ber `updated`.
const N = (id, heiti, formadur) => ({ id, heiti, members: formadur ? [{ nafn: formadur, stada: 'formaður' }, { nafn: 'Annar', stada: 'varaformaður' }] : [{ nafn: 'Annar', stada: 'varaformaður' }] });
const META = (updated) => ({ updated, mainSeats: 130 });
const G = (dags, nefndir) => ({ dags, nefndir });

test('nýr formaður gegn grunni frá deginum áður verður frétt', () => {
  const g = G('2026-09-21', { 207: { heiti: 'fjárlaganefnd', formadur: 'Sigurjón Þórðarson', sidast: '2026-09-21' } });
  const { cand, grunnur } = pickNefndir([N(207, 'fjárlaganefnd', 'Dagur B. Eggertsson')], META('2026-09-22'), g);
  assert.deepEqual(cand, [{ id: 207, nefnd: 'fjárlaganefnd', formadur: 'Dagur B. Eggertsson', fyrri: 'Sigurjón Þórðarson' }]);
  assert.deepEqual(grunnur, G('2026-09-22', { 207: { heiti: 'fjárlaganefnd', formadur: 'Dagur B. Eggertsson', sidast: '2026-09-22' } }));
});

test('óbreyttur formaður, formannslaus nefnd og nefnd sem var ekki í grunninum eru ekki fréttir', () => {
  const g = G('2026-09-21', { 207: { heiti: 'fjárlaganefnd', formadur: 'Sigurjón Þórðarson', sidast: '2026-09-21' }, 208: { heiti: 'allsherjarnefnd', formadur: null, sidast: '2026-09-21' } });
  const { cand } = pickNefndir([N(207, 'fjárlaganefnd', 'Sigurjón Þórðarson'), N(208, 'allsherjarnefnd', 'Ný Kona'), N(209, 'ný nefnd', 'Einhver')], META('2026-09-22'), g);
  assert.deepEqual(cand, []);
});

test('grunnur eldri en 3 daga (skráin stóð og lifnaði) er ekki borinn saman: þögul endurstilling', () => {
  const g = G('2026-08-20', { 207: { heiti: 'fjárlaganefnd', formadur: 'Sigurjón Þórðarson', sidast: '2026-08-20' } });
  const { cand, grunnur } = pickNefndir([N(207, 'fjárlaganefnd', 'Dagur B. Eggertsson')], META('2026-09-22'), g);
  assert.deepEqual(cand, []);
  assert.equal(grunnur.nefndir[207].formadur, 'Dagur B. Eggertsson');
  assert.equal(grunnur.dags, '2026-09-22');
});

test('grunnur á gamla sniðinu ({id: {heiti, formadur}}) endurstillist í þögn', () => {
  const gamall = { 207: { heiti: 'fjárlaganefnd', formadur: 'Sigurjón Þórðarson' } };
  const { cand, grunnur } = pickNefndir([N(207, 'fjárlaganefnd', 'Dagur B. Eggertsson')], META('2026-09-22'), gamall);
  assert.deepEqual(cand, []);
  assert.equal(grunnur.dags, '2026-09-22');
});

test('tóm nefndaskrá (429-svör 22.8–8.9.2026) skrifar ekki yfir grunninn og breyting yfir tóma daginn finnst samt', () => {
  const g = G('2026-09-21', { 207: { heiti: 'fjárlaganefnd', formadur: 'Sigurjón Þórðarson', sidast: '2026-09-21' } });
  const tom = pickNefndir([], META('2026-09-22'), g);
  assert.deepEqual(tom, { cand: [], grunnur: g });
  const { cand } = pickNefndir([N(207, 'fjárlaganefnd', 'Dagur B. Eggertsson')], META('2026-09-23'), tom.grunnur);
  assert.deepEqual(cand.map((c) => c.formadur), ['Dagur B. Eggertsson']);
});

test('nefnd sem vantar í hálfa skrá geymist í 30 daga: formannsskipti hennar finnast þegar hún kemur aftur', () => {
  const g0 = pickNefndir([N(207, 'fjárlaganefnd', 'Sigurjón Þórðarson'), N(208, 'allsherjarnefnd', 'Formaður A')], META('2026-09-01'), null).grunnur;
  const halft = pickNefndir([N(207, 'fjárlaganefnd', 'Sigurjón Þórðarson')], META('2026-09-02'), { ...g0, dags: '2026-09-01' });
  assert.ok(halft.grunnur.nefndir[208], 'nefndin geymist þótt hún vanti í skrána');
  const aftur = pickNefndir([N(207, 'fjárlaganefnd', 'Sigurjón Þórðarson'), N(208, 'allsherjarnefnd', 'Formaður B')], META('2026-09-03'), halft.grunnur);
  assert.deepEqual(aftur.cand.map((c) => [c.nefnd, c.fyrri, c.formadur]), [['allsherjarnefnd', 'Formaður A', 'Formaður B']]);
});

test('nefnd sem hefur vantað í meira en 30 daga gleymist', () => {
  const g = G('2026-09-22', { 207: { heiti: 'fjárlaganefnd', formadur: 'S', sidast: '2026-09-22' }, 208: { heiti: 'horfin', formadur: 'A', sidast: '2026-08-20' } });
  const { grunnur } = pickNefndir([N(207, 'fjárlaganefnd', 'S')], META('2026-09-22'), g);
  assert.deepEqual(Object.keys(grunnur.nefndir), ['207']);
});

test('skrá án dagsetningar (althingi_meta án `updated`) er ekki borin saman', () => {
  const g = G('2026-09-21', { 207: { heiti: 'fjárlaganefnd', formadur: 'Sigurjón Þórðarson', sidast: '2026-09-21' } });
  assert.deepEqual(pickNefndir([N(207, 'fjárlaganefnd', 'Dagur B. Eggertsson')], { mainSeats: 130 }, g), { cand: [], grunnur: g });
  assert.deepEqual(pickNefndir([N(207, 'fjárlaganefnd', 'Dagur B. Eggertsson')], null, g).cand, []);
});
