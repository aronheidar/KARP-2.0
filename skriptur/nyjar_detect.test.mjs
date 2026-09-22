import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './nyjar_detect.js';
const { pickNyjar } = mod;

// Útboðsniðurstöður (utbod_urslit.json): lykill = TED-númer, eigin dagsetning = birtingardagur í TED
const A = (nr, d) => ({ nr, d });
const UR = { lykill: (a) => a.nr, dagsetning: (a) => a.d };
const grunnur = (dags, lyklar) => ({ dags, lyklar });

test('ný færsla gegn grunni frá deginum áður verður frétt', () => {
  const { nyjar, grunnur: g } = pickNyjar([A('1', '2026-09-20'), A('2', '2026-09-22')], grunnur('2026-09-21', ['1']), { dags: '2026-09-22', ...UR });
  assert.deepEqual(nyjar.map((a) => a.nr), ['2']);
  assert.deepEqual(g, { dags: '2026-09-22', lyklar: ['1', '2'] });
});

test('tóm skrá (11.9.2026) skrifar ekki yfir grunninn og næsta heila skrá birtir aðeins raunverulega nýtt', () => {
  const g0 = grunnur('2026-09-10', ['a', 'b', 'c']);
  const tom = pickNyjar([], g0, { dags: '2026-09-11', ...UR });
  assert.deepEqual(tom, { nyjar: [], grunnur: g0 });
  const heil = pickNyjar([A('a', '2026-09-01'), A('b', '2026-09-02'), A('c', '2026-09-03'), A('d', '2026-09-12')], tom.grunnur, { dags: '2026-09-12', ...UR });
  assert.deepEqual(heil.nyjar.map((a) => a.nr), ['d']);
});

test('færsla með eigin dagsetningu eldri en 30 daga er ekki frétt þótt hún sé ný í grunninum', () => {
  // 12.9.2026: fríhafnarsamningur úr TED 9.4.2025 birtist sem frétt dagsins
  const { nyjar } = pickNyjar([A('230934-2025', '2025-04-09'), A('x', '2026-08-23')], grunnur('2026-09-11', []), { dags: '2026-09-12', ...UR });
  assert.deepEqual(nyjar.map((a) => a.nr), ['x']);
});

test('færsla án eigin dagsetningar er ekki frétt þegar dagsetningarfall er gefið', () => {
  const { nyjar } = pickNyjar([A('x', undefined), A('y', 'óþekkt')], grunnur('2026-09-21', []), { dags: '2026-09-22', ...UR });
  assert.deepEqual(nyjar, []);
});

test('grunnur eldri en 3 daga er ekki borinn saman: þögul endurstilling sem heldur þekktum lyklum', () => {
  const { nyjar, grunnur: g } = pickNyjar([A('1', '2026-09-20'), A('2', '2026-09-22')], grunnur('2026-09-18', ['1', 'z']), { dags: '2026-09-22', ...UR });
  assert.deepEqual(nyjar, []);
  assert.deepEqual(g, { dags: '2026-09-22', lyklar: ['1', '2', 'z'] });
  assert.equal(pickNyjar([A('2', '2026-09-22')], grunnur('2026-09-19', ['1']), { dags: '2026-09-22', ...UR }).nyjar.length, 1, '3 dagar eru enn nothæfir');
});

test('grunnur á gamla sniðinu (fylki án dagsetningar) er ekki borinn saman en lyklarnir haldast', () => {
  const { nyjar, grunnur: g } = pickNyjar([A('1', '2026-09-22'), A('2', '2026-09-22')], ['1', 'z'], { dags: '2026-09-22', ...UR });
  assert.deepEqual(nyjar, []);
  assert.deepEqual(g, { dags: '2026-09-22', lyklar: ['1', '2', 'z'] });
});

test('færsla sem vantar einn dag (hálf skrá) er ekki ný þegar hún kemur aftur', () => {
  const g1 = pickNyjar([A('1', '2026-09-20')], grunnur('2026-09-20', ['1', '2']), { dags: '2026-09-21', ...UR }).grunnur;
  assert.deepEqual(g1.lyklar, ['1', '2']);
  assert.deepEqual(pickNyjar([A('1', '2026-09-20'), A('2', '2026-09-20')], g1, { dags: '2026-09-22', ...UR }).nyjar, []);
});

test('grunnur með dagsetningu á eftir skránni eða skrá án dagsetningar er ekki borin saman', () => {
  assert.deepEqual(pickNyjar([A('2', '2026-09-22')], grunnur('2026-09-24', []), { dags: '2026-09-22', ...UR }).nyjar, []);
  assert.deepEqual(pickNyjar([A('2', '2026-09-22')], grunnur('2026-09-21', []), { dags: undefined, ...UR }).nyjar, []);
});

test('dagsetning skráar má vera tímastimpill (updated í utbod_urslit.json)', () => {
  const { nyjar, grunnur: g } = pickNyjar([A('2', '2026-09-22')], grunnur('2026-09-21', []), { dags: '2026-09-22T12:11:48.588Z', ...UR });
  assert.equal(nyjar.length, 1);
  assert.equal(g.dags, '2026-09-22');
});

test('þak á geymda lykla: lyklar skráarinnar fyrst, svo þeir eldri', () => {
  const { grunnur: g } = pickNyjar([A('c', '2026-09-22')], grunnur('2026-09-21', ['a', 'b']), { dags: '2026-09-22', ...UR, hamark: 2 });
  assert.deepEqual(g.lyklar, ['c', 'a']);
});

// Styrkir (styrkir.json): engin eigin dagsetning; hópur = sjóður
const S = (k, sjodur) => ({ k, sjodur });
const ST = { lykill: (s) => s.k, hopur: (s) => s.sjodur };

test('sjóður sem vantaði í grunninn er ekki borinn saman: styrkir hans eru ekki fréttir þegar hann kemur aftur', () => {
  // 8.–10.8.2026 vantaði Tækniþróunarsjóð í skrána; 11.8 birtust styrkir frá 2019 og 2020 sem fréttir
  const g1 = pickNyjar([S('k1', 'Kvikmyndasjóður')], { dags: '2026-08-10', lyklar: ['k1'], hopar: ['Kvikmyndasjóður'] }, { dags: '2026-08-10', ...ST }).grunnur;
  const { nyjar, grunnur: g2 } = pickNyjar([S('k1', 'Kvikmyndasjóður'), S('t2019', 'Tækniþróunarsjóður'), S('k2', 'Kvikmyndasjóður')], g1, { dags: '2026-08-11', ...ST });
  assert.deepEqual(nyjar.map((s) => s.k), ['k2']);
  assert.deepEqual(g2.hopar, ['Kvikmyndasjóður', 'Tækniþróunarsjóður']);
});

test('hópar grunnsins eru þeir sem voru í skránni síðast (sjóður sem dettur út fer úr hópunum)', () => {
  const { grunnur: g } = pickNyjar([S('k1', 'A')], { dags: '2026-09-21', lyklar: ['k1', 'b1'], hopar: ['A', 'B'] }, { dags: '2026-09-22', ...ST });
  assert.deepEqual(g, { dags: '2026-09-22', lyklar: ['k1', 'b1'], hopar: ['A'] });
});

test('tvær nýjar færslur með sama lykil gefa eina (styrkir án slug deila lykli)', () => {
  const { nyjar } = pickNyjar([S('undefined-2026-50000000', 'A'), S('undefined-2026-50000000', 'A')], { dags: '2026-09-21', lyklar: [], hopar: ['A'] }, { dags: '2026-09-22', ...ST });
  assert.equal(nyjar.length, 1);
});

test('færsla með eigið ár (`ar`) meira en ári á undan skránni er ekki frétt; næsta ár er leyft', () => {
  // styrkir bera aðeins úthlutunarár; breytist lyklarnir (1707 af 1950 styrkjum án slug) mega gamlir styrkir ekki birtast
  const Y = (k, ar) => ({ k, sjodur: 'A', ar });
  const { nyjar } = pickNyjar([Y('a', 2019), Y('b', 2025), Y('c', 2026), Y('d', 2027), Y('e', undefined)],
    { dags: '2026-09-21', lyklar: [], hopar: ['A'] }, { dags: '2026-09-22', ...ST, ar: (s) => s.ar });
  assert.deepEqual(nyjar.map((s) => s.k), ['b', 'c', 'd']);
});

test('grunnur án hópa er ekki borinn saman þegar hópfall er gefið', () => {
  assert.deepEqual(pickNyjar([S('k2', 'A')], { dags: '2026-09-21', lyklar: [] }, { dags: '2026-09-22', ...ST }).nyjar, []);
});
