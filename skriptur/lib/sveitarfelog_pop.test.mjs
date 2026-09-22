// skriptur/lib/sveitarfelog_pop.test.mjs
// ⚠ 21.9.2026: gogn/sveitarfelog_pop.json hafði aldrei verið endurgerð síðan 29.6 (61 sveitarfélag,
// 394.252). Hagstofa MAN02005 1.1.2026: 62 sveitarfélög, 394.324. Sjö síður og skriptur lesa skrána.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ibuarEftirSveitarfelogum, samraemaNofn } from './sveitarfelog_pop.mjs';

test('opinber nöfn Hagstofu → stuttnefni Karp; aðeins sveitarfélög á aðallistanum', () => {
  const r = samraemaNofn(
    { 'Hafnarfjarðarkaupstaður': 32000, 'Seltjarnarnesbær': 4600, 'Kópavogsbær': 40500, 'Skorradalshreppur': 60 },
    ['Hafnarfjörður', 'Seltjarnarnes', 'Kópavogsbær', 'Grindavíkurbær'],
  );
  assert.deepEqual(r.pop, { 'Hafnarfjörður': 32000, 'Seltjarnarnes': 4600, 'Kópavogsbær': 40500 });
  assert.deepEqual(r.utan, ['Skorradalshreppur']);
  assert.deepEqual(r.vantar, ['Grindavíkurbær']);
});

const META = { variables: [
  { code: 'Sveitarfélag', values: ['9999', '0000', '1000'], valueTexts: ['Alls', 'Reykjavíkurborg', 'Kópavogsbær'] },
  { code: 'Aldur', values: ['-1'], valueTexts: ['Alls'] },
  { code: 'Ár', time: true, values: ['2026'], valueTexts: ['2026'] },
  { code: 'Kyn', values: ['0'], valueTexts: ['Alls'] },
] };
const SVAR = { data: [
  { key: ['9999', '-1', '2026', '0'], values: ['394324'] },
  { key: ['0000', '-1', '2026', '0'], values: ['140200'] },
  { key: ['1000', '-1', '2026', '0'], values: ['40500'] },
] };

test('kóðar → nöfn úr lýsigögnum, „Alls" fellur út', () => {
  assert.deepEqual(ibuarEftirSveitarfelogum(META, SVAR), { 'Reykjavíkurborg': 140200, 'Kópavogsbær': 40500 });
});

test('ótölulegt gildi (t.d. „..") fellur út í stað þess að verða NaN', () => {
  const svar = { data: [{ key: ['0000', '-1', '2026', '0'], values: ['..'] }] };
  assert.deepEqual(ibuarEftirSveitarfelogum(META, svar), {});
});
