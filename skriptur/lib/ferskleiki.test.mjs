// skriptur/lib/ferskleiki.test.mjs
// ⚠⚠ 21.9.2026: fimm gagnasöfn stóðu í allt að þrjá mánuði (atvinnuleysi á forsíðu í maí, kannanir í
// júní, afbrot og orka í 2024) meðan dagleg keyrsla var græn. Útgangskóði mælir það ekki; aldur
// NÝJASTA TÍMABILSINS gerir það.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timabilLok, aldurDaga, metaFerskleika, GAGNASOFN } from './ferskleiki.mjs';

test('öll sjö snið tímabila sem gagnasöfn Karp nota', () => {
  assert.equal(timabilLok('2026M08'), '2026-08-31');
  assert.equal(timabilLok('2026M02'), '2026-02-28');
  assert.equal(timabilLok('2026 F2'), '2026-06-30');
  assert.equal(timabilLok('2026Q4'), '2026-12-31');
  assert.equal(timabilLok('júl 2026'), '2026-07-31');
  assert.equal(timabilLok('september 2025'), '2025-09-30');
  assert.equal(timabilLok('2025'), '2025-12-31');
  assert.equal(timabilLok('2024-2025'), '2025-06-30');
  assert.equal(timabilLok('2026-08-31'), '2026-08-31');
  assert.equal(timabilLok('óljóst'), null);
  assert.equal(timabilLok(null), null);
});

test('aldur í dögum frá lokum tímabils', () => {
  assert.equal(aldurDaga('2026-08-31', '2026-09-22'), 22);
});

test('maí-atvinnuleysið hefði verið flaggað: 2026M05 á 22.9 er 114 daga gamalt, hámark 50', () => {
  const [r] = metaFerskleika([{ ...GAGNASOFN.find((g) => g.skra === 'atvinnuleysi'), json: { updated: '2026M05' } }], '2026-09-22');
  assert.equal(r.stada, 'gamalt');
  assert.equal(r.aldur, 114);
  assert.equal(r.timabil, '2026M05');
});

test('ágúst-atvinnuleysið er í lagi', () => {
  const [r] = metaFerskleika([{ ...GAGNASOFN.find((g) => g.skra === 'atvinnuleysi'), json: { updated: '2026M08' } }], '2026-09-22');
  assert.equal(r.stada, 'ok');
});

test('skrá sem vantar eða sniðið breyttist → „olesanlegt", aldrei þögul', () => {
  const g = GAGNASOFN.find((x) => x.skra === 'polls');
  assert.equal(metaFerskleika([{ ...g, json: null }], '2026-09-22')[0].stada, 'olesanlegt');
  assert.equal(metaFerskleika([{ ...g, json: { polls: [] } }], '2026-09-22')[0].stada, 'olesanlegt');
});

test('hvert vaktað gagnasafn hefur nafn, skrá, lesfall og jákvætt hámark', () => {
  for (const g of GAGNASOFN) {
    assert.ok(g.nafn && g.skra && typeof g.les === 'function' && g.hamark > 0 && g.takt, g.skra);
  }
});

test('gjaldþrot: ársfjórðungsleg útgáfa, júní-tölur í lagi 20.10 en gamlar 15.11', () => {
  const g = GAGNASOFN.find((x) => x.skra === 'gjaldthrot');
  assert.equal(metaFerskleika([{ ...g, json: { nyjasti: '2026M06' } }], '2026-10-20')[0].stada, 'ok');       // 112 d
  assert.equal(metaFerskleika([{ ...g, json: { nyjasti: '2026M06' } }], '2026-11-15')[0].stada, 'gamalt');   // 138 d
});
