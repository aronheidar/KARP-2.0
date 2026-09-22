// skriptur/lib/glaepir_hausar.test.mjs
// ⚠ 21.9.2026: /afbrot/ sýndi 2024 þótt skjal Ríkislögreglustjóra næði til 2025. Síðasti árshausinn er
// STRENGURINN „2025*" (stjarna = bráðabirgðatölur) en hin árin tölur, og gamla síun leyfði aðeins tölur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { artalsdalkar } = require('./glaepir_hausar.cjs');

test('„2025*" telst með sem ár og er merkt bráðabirgða', () => {
  const d = artalsdalkar(['Umdæmi', 'Flokkur', 'Yfirflokkur', 'Tegund', 2023, 2024, '2025*']);
  assert.deepEqual(d.at(-1), { y: 2025, i: 6, bradabirgda: true });
  assert.deepEqual(d.at(-2), { y: 2024, i: 5, bradabirgda: false });
  assert.equal(d.length, 3);
});

test('ár sem strengir án stjörnu og tölur jafnt', () => {
  assert.deepEqual(artalsdalkar(['2022', 2023]).map((x) => x.y), [2022, 2023]);
});

test('textadálkar og ártöl fyrir 2001 eru ekki ár gagnanna', () => {
  assert.deepEqual(artalsdalkar(['Umdæmi', 1999, 'Categories in english', 2001]).map((x) => x.y), [2001]);
});
