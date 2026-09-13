// Ver ársskila-vörnina í Kvótavaktinni. Villan sem þessi próf festa var ÞÖGUL: breytingavaktin
// bar saman 2025/26 við 2026/27 og tilkynnti áskrifendum margra-milljóna kg „tap" hjá stærstu
// útgerðum landsins, sem aldrei átti sér stað. Fannst aðeins af tilviljun 13.9.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erArskil, erIUthlutun, naestaVidmid, arFmt } from './lib/kvoti_arskil.mjs';

test('erArskil: ólík tímabil = ársskil', () => {
  assert.equal(erArskil('2526', '2627'), true);
  assert.equal(erArskil('2627', '2526'), true, 'líka afturábak — hvor áttin sem er er ósambærileg');
});

test('erArskil: sama tímabil er venjuleg vikuleg mæling', () => {
  assert.equal(erArskil('2627', '2627'), false);
});

test('erArskil: fyrsta keyrsla (engin fyrri gögn) telst EKKI ársskil', () => {
  assert.equal(erArskil(null, '2627'), false);
  assert.equal(erArskil(undefined, '2627'), false);
  assert.equal(erArskil('', '2627'), false);
});

test('erIUthlutun: raunverulegu tölurnar frá 7.9.2026 kveikja flaggið', () => {
  // 268 handhafar nýs árs á móti 475 í lok þess fyrra → samþjöppun ofmetin
  assert.equal(erIUthlutun(268, { timabil: '2526', nHafar: 475 }), true);
});

test('erIUthlutun: slekkur á sér sjálft þegar úthlutun nær fyrra ári', () => {
  // þröskuldur = 475 x 0,9 = 427,5
  assert.equal(erIUthlutun(427, { timabil: '2526', nHafar: 475 }), true, '427 < 427,5 → enn ólokið');
  assert.equal(erIUthlutun(428, { timabil: '2526', nHafar: 475 }), false, '428 > 427,5 → þröskuldi náð');
  assert.equal(erIUthlutun(500, { timabil: '2526', nHafar: 475 }), false, 'fleiri en í fyrra → klárlega lokið');
});

test('erIUthlutun: ekkert viðmið → ekkert flagg (aldrei falskt jákvætt)', () => {
  assert.equal(erIUthlutun(268, null), false);
  assert.equal(erIUthlutun(268, {}), false);
  assert.equal(erIUthlutun(268, { nHafar: 0 }), false);
});

test('naestaVidmid: ársskil festa lokastöðu fyrra árs', () => {
  const fyrra = { timabil: '2526', heild: { nHafar: 475, ti_kg: 332328599 } };
  assert.deepEqual(naestaVidmid(fyrra, '2627'), { timabil: '2526', nHafar: 475, ti_kg: 332328599 });
});

test('naestaVidmid: viðmiðið berst áfram innan sama árs', () => {
  const fyrra = { timabil: '2627', arskilVidmid: { timabil: '2526', nHafar: 475, ti_kg: 1 } };
  assert.deepEqual(naestaVidmid(fyrra, '2627'), { timabil: '2526', nHafar: 475, ti_kg: 1 });
});

test('naestaVidmid: engin fyrri gögn → ekkert viðmið', () => {
  assert.equal(naestaVidmid(null, '2627'), null);
  assert.equal(naestaVidmid({ timabil: '2627' }, '2627'), null, 'sama ár en ekkert viðmið geymt');
});

test('arFmt: gilt tímabil verður læsilegt, ógilt verður tómt', () => {
  assert.equal(arFmt('2526'), '2025/2026');
  assert.equal(arFmt('2627'), '2026/2027');
  assert.equal(arFmt(''), '', 'ógilt á að hverfa, ekki sýna rusl í notandatexta');
  assert.equal(arFmt('26'), '');
  assert.equal(arFmt(null), '');
});
