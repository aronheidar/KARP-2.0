import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './build_atkvaedi.js';
const { malasponn } = mod;

const MAL = (nr, thing, vs2 = [1]) => ({ nr, thing, vs2 });

test('malasponn: aðeins mál MEÐ atkvæðagreiðslu telja — hin eru aldrei sótt', () => {
  const r = malasponn([MAL(1, 157), MAL(2, 158, []), { nr: 3, thing: 158 }]);
  assert.deepEqual(r.thingin, [157], 'mál án vs2 dregur ekki 158 inn í spönnina');
});

test('malasponn: spönnin er öll þing sem málin ná yfir, í hækkandi röð', () => {
  assert.deepEqual(malasponn([MAL(4, 158), MAL(1, 157), MAL(9, 158)]).thingin, [157, 158]);
  assert.deepEqual(malasponn([MAL(1, 157)]).thingin, [157]);
  assert.deepEqual(malasponn([]).thingin, []);
});

// ⚠⚠ atkvaedi.json er lyklað á BERT málsnúmer. Mál nr. 1 á 158 eru fjárlögin en allt annað
//   á 157, svo um leið og frumvorp.json spannar tvö þing rekast lyklarnir á og `if (mal[b.nr])
//   continue` heldur því sem kom fyrst — hitt málið fær RANGT nafnakall undir sig, þögult.
//   Skráin getur ekki borið bæði, svo hér er aðeins greint og varað; lagfæringin er ný lykling.
test('malasponn: sama málsnúmer á tveimur þingum er skráð sem árekstur', () => {
  const r = malasponn([MAL(1, 157), MAL(1, 158), MAL(2, 157)]);
  assert.equal(r.arekstrar.length, 1);
  assert.deepEqual(r.arekstrar[0], { nr: 1, thing: [157, 158] });
});

test('malasponn: sama málsnúmer á SAMA þingi er ekki árekstur', () => {
  assert.deepEqual(malasponn([MAL(1, 157), MAL(1, 157)]).arekstrar, []);
});

test('malasponn: eitt þing getur aldrei framkallað árekstur', () => {
  assert.deepEqual(malasponn([MAL(1, 157), MAL(2, 157), MAL(3, 157)]).arekstrar, []);
});
