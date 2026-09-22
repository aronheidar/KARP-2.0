import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mod from './sendirad_detect.js';

const { pickSendirad } = mod;
const HER = path.dirname(fileURLToPath(import.meta.url));

// ── smiðir ──────────────────────────────────────────────────────────────────
// SR(dags, {land: nafn|null}, aukalond) → sendirad.json-líki. null = sendiráð án skráðs sendiherra.
const SR = (updated, nofn, aukalond = []) => ({
  updated,
  abroad: [...Object.entries(nofn).map(([is, sendiherra]) => (sendiherra ? { is, cc: is.slice(0, 2), sendiherra } : { is, cc: is.slice(0, 2) })),
    ...aukalond.map((is) => ({ is, cc: is.slice(0, 2) }))],
  iceland: [],
});
const G = (dags, nofn, sidast) => ({ dags, sendiherrar: Object.fromEntries(Object.entries(nofn).map(([k, v]) => [k, { nafn: v, sidast: sidast || dags }])) });
const NOFN = (r) => Object.fromEntries(Object.entries(r.grunnur.sendiherrar).map(([k, v]) => [k, v.nafn]));

// ── 1. grunnhegðun ──────────────────────────────────────────────────────────
test('nýr sendiherra í landi sem var í grunninum verður frambjóðandi', () => {
  const g = G('2026-09-21', { Kanada: 'Hlynur Guðjónsson', Japan: 'Stefán Haukur Jóhannesson' });
  const { cand, grunnur } = pickSendirad(SR('2026-09-22', { Kanada: 'Nýi Maðurinn', Japan: 'Stefán Haukur Jóhannesson' }), g);
  assert.deepEqual(cand, [{ land: 'Kanada', nafn: 'Nýi Maðurinn', fyrri: 'Hlynur Guðjónsson' }]);
  assert.equal(grunnur.dags, '2026-09-22');
  assert.deepEqual(NOFN({ grunnur }), { Kanada: 'Nýi Maðurinn', Japan: 'Stefán Haukur Jóhannesson' });
});

test('óbreytt nafn gefur engan frambjóðanda', () => {
  const g = G('2026-09-21', { Kanada: 'Hlynur Guðjónsson' });
  assert.deepEqual(pickSendirad(SR('2026-09-22', { Kanada: 'Hlynur Guðjónsson' }), g).cand, []);
});

test('land sem var ekki í grunninum er ekki frétt (nýtt sendiráð ≠ nýr sendiherra)', () => {
  const g = G('2026-09-21', { Kanada: 'Hlynur Guðjónsson' });
  const { cand, grunnur } = pickSendirad(SR('2026-09-22', { Kanada: 'Hlynur Guðjónsson', Malaví: 'Davíð Bjarnason' }), g);
  assert.deepEqual(cand, []);
  assert.deepEqual(NOFN({ grunnur }), { Kanada: 'Hlynur Guðjónsson', Malaví: 'Davíð Bjarnason' });
});

// ── 2. kjarninn: tóm/hálf skrá má ALDREI þurrka grunninn ────────────────────
test('⭐ skrá án nokkurs sendiherranafns þurrkar ekki grunninn — raun-atvikið 29.7.2026', () => {
  // 29.7.2026 skrifaði build_sendirad.js (Wikipedia, engin nöfn) yfir ritstýrðu skrána og
  // skynjarinn setti state.sendirad = {} — 20 nöfn töpuðust og grunnurinn hefur verið tómur síðan.
  const g = G('2026-07-28', { Malaví: 'Davíð Bjarnason', Kanada: 'Hlynur Guðjónsson', Japan: 'Stefán Haukur Jóhannesson' });
  const tom = SR('2026-07-29', {}, ['Malaví', 'Kanada', 'Japan', 'Bretland']);
  const r = pickSendirad(tom, g);
  assert.deepEqual(r.cand, []);
  assert.deepEqual(r.grunnur, g, 'grunnurinn verður að standa ÓBREYTTUR');
});

test('hálf skrá (færri en 60% nafna miðað við grunninn) þurrkar ekki grunninn', () => {
  const g = G('2026-09-21', { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' });
  const halft = pickSendirad(SR('2026-09-22', { A: 'nýr', B: 'b' }, ['C', 'D', 'E']), g);   // 2 af 5 = 40%
  assert.deepEqual(halft.cand, [], 'hálf skrá er ekki marktæk');
  assert.deepEqual(halft.grunnur, g);
  const nogu = pickSendirad(SR('2026-09-22', { A: 'nýr', B: 'b', C: 'c' }, ['D', 'E']), g);  // 3 af 5 = 60%
  assert.deepEqual(nogu.cand, [{ land: 'A', nafn: 'nýr', fyrri: 'a' }], '60% nákvæmlega er nothæft');
});

// ── 3. land sem vantar tímabundið ───────────────────────────────────────────
test('land sem vantar í skrána geymist í 30 daga og gleymist síðan', () => {
  const g = G('2026-09-01', { Kanada: 'Hlynur Guðjónsson', Japan: 'Stefán Haukur Jóhannesson', Kína: 'Þórir Ibsen' });
  // Japan dettur út úr skránni en Kanada/Kína halda henni marktækri.
  const innan = pickSendirad(SR('2026-09-02', { Kanada: 'Hlynur Guðjónsson', Kína: 'Þórir Ibsen' }), g);
  assert.equal(innan.grunnur.sendiherrar.Japan.nafn, 'Stefán Haukur Jóhannesson', 'Japan geymist');
  assert.equal(innan.grunnur.sendiherrar.Japan.sidast, '2026-09-01', 'sidast helst óbreytt meðan landið vantar');
  // …og kemur aftur með nýjan sendiherra 20 dögum síðar: það er frétt.
  const aftur = pickSendirad(SR('2026-09-21', { Kanada: 'Hlynur Guðjónsson', Kína: 'Þórir Ibsen', Japan: 'Nýr Maður' }), { ...innan.grunnur, dags: '2026-09-20' });
  assert.deepEqual(aftur.cand, [{ land: 'Japan', nafn: 'Nýr Maður', fyrri: 'Stefán Haukur Jóhannesson' }]);
  // Eftir 30 daga gleymist landið.
  const gamalt = pickSendirad(SR('2026-10-05', { Kanada: 'Hlynur Guðjónsson', Kína: 'Þórir Ibsen' }), { ...G('2026-10-04', { Kanada: 'Hlynur Guðjónsson', Kína: 'Þórir Ibsen' }), sendiherrar: { ...G('2026-10-04', { Kanada: 'Hlynur Guðjónsson', Kína: 'Þórir Ibsen' }).sendiherrar, Japan: { nafn: 'Stefán Haukur Jóhannesson', sidast: '2026-09-01' } } });
  assert.equal(gamalt.grunnur.sendiherrar.Japan, undefined, 'eldra en 30 dagar gleymist');
});

// ── 4. dagsettur grunnur ────────────────────────────────────────────────────
test('grunnur eldri en 3 daga er ekki borinn saman (skráin stóð og lifnaði)', () => {
  const sr = SR('2026-09-22', { Kanada: 'Nýi Maðurinn', Japan: 'Stefán Haukur Jóhannesson' });
  assert.equal(pickSendirad(sr, G('2026-09-19', { Kanada: 'Hlynur Guðjónsson', Japan: 'Stefán Haukur Jóhannesson' })).cand.length, 1, '3 dagar eru enn nothæfir');
  const gamall = pickSendirad(sr, G('2026-09-18', { Kanada: 'Hlynur Guðjónsson', Japan: 'Stefán Haukur Jóhannesson' }));
  assert.deepEqual(gamall.cand, [], '4 dagar: þögul endurstilling');
  assert.deepEqual(NOFN(gamall), { Kanada: 'Nýi Maðurinn', Japan: 'Stefán Haukur Jóhannesson' }, 'grunnurinn er samt uppfærður');
});

test('grunnur dagsettur Á EFTIR skránni (skrá færð aftur) er ekki borinn saman', () => {
  assert.deepEqual(pickSendirad(SR('2026-09-22', { Kanada: 'Nýi Maðurinn' }), G('2026-09-24', { Kanada: 'Hlynur Guðjónsson' })).cand, []);
});

test('grunnur á gamla sniðinu ({land: nafn}) er ekki borinn saman: þögul endurstilling', () => {
  // state.sendirad var ber vörpun án dagsetningar og án sidast.
  const { cand, grunnur } = pickSendirad(SR('2026-09-22', { Kanada: 'Nýi Maðurinn', Japan: 'Stefán Haukur Jóhannesson' }), { Kanada: 'Hlynur Guðjónsson', Japan: 'Stefán Haukur Jóhannesson' });
  assert.deepEqual(cand, []);
  assert.deepEqual(NOFN({ grunnur }), { Kanada: 'Nýi Maðurinn', Japan: 'Stefán Haukur Jóhannesson' });
  assert.equal(grunnur.dags, '2026-09-22');
});

test('enginn grunnur (fyrsta keyrsla) endurstillir í þögn', () => {
  for (const g of [null, undefined, {}, { dags: '2026-09-21' }]) {
    assert.deepEqual(pickSendirad(SR('2026-09-22', { Kanada: 'Hlynur Guðjónsson' }), g).cand, [], JSON.stringify(g));
  }
});

// ── 5. bilaðar skrár ────────────────────────────────────────────────────────
test('skrá án dagsetningar, án abroad eða tóm skilur grunninn eftir óbreyttan', () => {
  const g = G('2026-09-21', { Kanada: 'Hlynur Guðjónsson' });
  const bilad = [null, undefined, {}, { abroad: [] }, { updated: '2026-09-22', abroad: [] },
    { abroad: [{ is: 'Kanada', sendiherra: 'Nýi Maðurinn' }] },                       // enga dagsetningu
    { updated: 'ógilt', abroad: [{ is: 'Kanada', sendiherra: 'Nýi Maðurinn' }] }];
  for (const sr of bilad) assert.deepEqual(pickSendirad(sr, g), { cand: [], grunnur: g }, String(JSON.stringify(sr)).slice(0, 80));
});

test('færsla án lands eða með ótæku nafni er hunsuð', () => {
  // Nógu mörg gild nöfn til að hlutfallsvörnin sé ekki það sem stöðvar — hér er prófað að ótækar færslur hverfi.
  const g = G('2026-09-21', { Kanada: 'Hlynur Guðjónsson', Japan: 'Stefán Haukur Jóhannesson', Noregur: 'n', Svíþjóð: 's' });
  const sr = { updated: '2026-09-22', abroad: [{ is: 'Kanada', sendiherra: 'Nýi Maðurinn' }, { is: 'Noregur', sendiherra: 'n' }, { is: 'Svíþjóð', sendiherra: 's' },
    { sendiherra: 'Nafnlaust land' }, { is: 'Japan', sendiherra: '   ' }, { is: 'Kína', sendiherra: 42 }] };
  const { cand, grunnur } = pickSendirad(sr, g);
  assert.deepEqual(cand, [{ land: 'Kanada', nafn: 'Nýi Maðurinn', fyrri: 'Hlynur Guðjónsson' }]);
  assert.equal(grunnur.sendiherrar.Kína, undefined);
  assert.equal(grunnur.sendiherrar.Japan.nafn, 'Stefán Haukur Jóhannesson', 'Japan geymist, tómt nafn þurrkar ekki');
});

// ── 6. aldrei flóð ──────────────────────────────────────────────────────────
test('þak: mest 3 frambjóðendur þótt fleiri breytist', () => {
  const g = G('2026-09-21', { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' });
  const { cand } = pickSendirad(SR('2026-09-22', { A: '1', B: '2', C: '3', D: '4', E: '5' }), g);
  assert.equal(cand.length, 3);
  assert.deepEqual(cand.map((c) => c.land), ['A', 'B', 'C']);
});

// ── 7. samræmi við build_sendirad.js ────────────────────────────────────────
test('build_sendirad.js dagsetur skrána og varðveitir ritstýrðu reitina', () => {
  // ⚠ Prófið sem hefði gripið 29.7.2026: skriftan skrifaði { abroad, iceland } og henti `sendiherra`
  //   sem enginn skrapari framleiðir — 20 ritstýrð nöfn hurfu og skynjarinn hefur verið dauður síðan.
  const src = fs.readFileSync(path.join(HER, 'build_sendirad.js'), 'utf8');
  const ut = src.match(/const out = \{[^}]*\}/);
  assert.ok(ut, 'fann ekki úttaksobjektið í build_sendirad.js');
  assert.match(ut[0], /updated/, 'úttakið verður að bera dagsetningu, annars getur skynjarinn ekki dagsett grunninn');
  assert.match(src, /sendiherra/, 'skriftan verður að varðveita ritstýrða sendiherra-reitinn');
});
