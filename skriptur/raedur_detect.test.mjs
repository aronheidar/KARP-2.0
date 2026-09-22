import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './raedur_detect.js';
const { pickRaedur } = mod;

// raedugreining.json: {updated, thing, mp: {id: {min}}} — uppsafnaðar ræðumínútur þingsins
const RA = (updated, mins, thing = 158) => ({ updated, thing, mp: Object.fromEntries(Object.entries(mins).map(([id, min]) => [id, { min }])) });
const SNAP = (dags, min, thing = 158) => ({ thing, dags, min });
const NOFN = { 1: 'Anna', 2: 'Bjarni', 3: 'Dóra', 4: 'Egill' };

test('vika milli skráa: mestu ræðumínútur vikunnar, dagsetningar skránna í fra/til', () => {
  const r = pickRaedur(RA('2026-10-08', { 1: 300, 2: 150, 3: 100, 4: 20 }), SNAP('2026-10-01', { 1: 100, 2: 80, 3: 40 }), { nafnAf: NOFN });
  assert.deepEqual(r.listi, [{ nafn: 'Anna', minutur: 200 }, { nafn: 'Bjarni', minutur: 70 }, { nafn: 'Dóra', minutur: 60 }]);
  assert.deepEqual([r.fra, r.til], ['2026-10-01', '2026-10-08']);
  assert.deepEqual(r.snap, SNAP('2026-10-08', { 1: 300, 2: 150, 3: 100, 4: 20 }));
});

test('innan við 6 dagar milli skráa: beðið, grunnur óbreyttur', () => {
  const s = SNAP('2026-10-01', { 1: 100 });
  const r = pickRaedur(RA('2026-10-06', { 1: 400 }), s, { nafnAf: NOFN });
  assert.deepEqual([r.listi, r.snap], [[], s]);
});

test('meira en 8 dagar milli skráa (skráin stóð og lifnaði): ekki „vika", þögul endurstilling', () => {
  const r = pickRaedur(RA('2026-10-21', { 1: 900 }), SNAP('2026-10-01', { 1: 100 }), { nafnAf: NOFN });
  assert.deepEqual(r.listi, []);
  assert.deepEqual(r.snap, SNAP('2026-10-21', { 1: 900 }));
  assert.equal(pickRaedur(RA('2026-10-09', { 1: 300 }), SNAP('2026-10-01', { 1: 100 }), { nafnAf: NOFN }).listi.length, 1, '8 dagar eru enn vika');
});

test('grunnur á gamla sniðinu (keyrsludagur í `date`) endurstillist í þögn', () => {
  const r = pickRaedur(RA('2026-10-08', { 1: 300 }), { thing: 158, date: '2026-10-01', min: { 1: 100 } }, { nafnAf: NOFN });
  assert.deepEqual(r.listi, []);
  assert.deepEqual(r.snap, SNAP('2026-10-08', { 1: 300 }));
});

test('nýtt þing endurstillir grunninn', () => {
  const r = pickRaedur(RA('2026-10-08', { 1: 30 }, 158), SNAP('2026-10-01', { 1: 5000 }, 157), { nafnAf: NOFN });
  assert.deepEqual([r.listi, r.snap], [[], SNAP('2026-10-08', { 1: 30 }, 158)]);
});

test('innan við 60 mínútur hjá þeim efsta: engin frétt en grunnurinn færist', () => {
  const r = pickRaedur(RA('2026-10-08', { 1: 150 }), SNAP('2026-10-01', { 1: 100 }), { nafnAf: NOFN });
  assert.deepEqual([r.listi, r.snap.dags], [[], '2026-10-08']);
});

test('ræðumenn sem eru ekki þingmenn (ekki í nafnaskrá) eru ekki taldir', () => {
  const r = pickRaedur(RA('2026-10-08', { 1: 170, 99: 900 }), SNAP('2026-10-01', { 1: 100, 99: 0 }), { nafnAf: NOFN });
  assert.deepEqual(r.listi, [{ nafn: 'Anna', minutur: 70 }]);
});

test('tóm skrá (mp: {}) verður aldrei grunnur, hvorki eftir viku né eftir lengra bil', () => {
  const s = SNAP('2026-10-01', { 1: 100, 2: 80 });
  assert.deepEqual(pickRaedur(RA('2026-10-08', {}), s, { nafnAf: NOFN }), { listi: [], fra: null, til: null, snap: s });
  assert.deepEqual(pickRaedur(RA('2026-10-20', {}), s, { nafnAf: NOFN }).snap, s);
});

test('hálf skrá (uppsafnaðar mínútur lækka) verður ekki grunnur; næsta heila skrá er borin saman við síðasta heila grunn', () => {
  // styttur listi: þingmenn sem vantar fengju allt þingið sem „vikuna" eftir viku
  const s = SNAP('2026-10-01', { 1: 1000, 2: 800, 3: 600 });
  const halft = pickRaedur(RA('2026-10-07', { 1: 1050 }), s, { nafnAf: NOFN });
  assert.deepEqual([halft.listi, halft.snap], [[], s]);
  const heil = pickRaedur(RA('2026-10-08', { 1: 1100, 2: 820, 3: 610 }), halft.snap, { nafnAf: NOFN });
  assert.deepEqual(heil.listi, [{ nafn: 'Anna', minutur: 100 }, { nafn: 'Bjarni', minutur: 20 }, { nafn: 'Dóra', minutur: 10 }]);
  assert.deepEqual(pickRaedur(RA('2026-10-20', { 1: 1050 }), s, { nafnAf: NOFN }).snap, s, 'líka þegar grunnurinn er orðinn eldri en vika');
  assert.equal(pickRaedur(RA('2026-10-08', { 1: 995, 2: 800, 3: 600 }), s, { nafnAf: NOFN }).snap.dags, '2026-10-08', 'smáleiðréttingar Alþingis (< 2%) eru ekki hálf skrá');
});

test('skrá án dagsetningar eða grunnur á eftir skránni: engin frétt', () => {
  const s = SNAP('2026-10-01', { 1: 100 });
  assert.deepEqual(pickRaedur(RA(undefined, { 1: 900 }), s, { nafnAf: NOFN }), { listi: [], fra: null, til: null, snap: s });
  assert.deepEqual(pickRaedur(RA('2026-09-24', { 1: 900 }), s, { nafnAf: NOFN }).listi, []);
});
