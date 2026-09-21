import { test } from 'node:test';
import assert from 'node:assert/strict';
import { morgunkvedja, timabil, kvedjuord, nyjarSidan } from './kvedja.mjs';

const ts = (iso) => Math.floor(Date.parse(iso) / 1000);
const NU = ts('2026-09-22T08:30:00Z');   // þriðjudagur kl. 08:30
const midi = (created, o = {}) => ({ id: created, created, ...o });

test('kvedjuord: dagur og kvöld eftir klukku lesandans', () => {
  assert.equal(kvedjuord(5), 'Góðan daginn');
  assert.equal(kvedjuord(17), 'Góðan daginn');
  assert.equal(kvedjuord(18), 'Gott kvöld');
  assert.equal(kvedjuord(2), 'Gott kvöld');
});

test('timabil: nótt, gær, vikudagur, dagar — og ekkert þekkt', () => {
  assert.equal(timabil(NU, ts('2026-09-21T22:10:00Z'), 8), 'í nótt', 'í gærkvöldi og nú er morgunn');
  assert.equal(timabil(NU, ts('2026-09-21T13:00:00Z'), 8), 'síðan í gær', 'í gær um miðjan dag');
  assert.equal(timabil(NU, ts('2026-09-21T22:10:00Z'), 14), 'síðan í gær', 'síðdegis er það ekki lengur nóttin');
  assert.equal(timabil(NU, ts('2026-09-22T07:00:00Z'), 8), 'síðan þú leist við');
  assert.equal(timabil(NU, ts('2026-09-18T12:00:00Z'), 8), 'síðan á föstudaginn');
  assert.equal(timabil(NU, ts('2026-09-13T12:00:00Z'), 8), 'á síðustu 9 dögum');
  assert.equal(timabil(NU, ts('2026-09-01T12:00:00Z'), 8), 'á síðustu 21 degi', '21 tekur eintölu');
  assert.equal(timabil(NU, null, 8), 'síðasta sólarhringinn');
  assert.equal(timabil(NU, NU + 60, 8), 'síðasta sólarhringinn', 'klukkuskekkja: framtíðin er ekki síðasta heimsókn');
});

test('nyjarSidan: telur aðeins eftir síðustu heimsókn og aldrei það sem Aron samdi á /stjorn/', () => {
  const l = [midi(NU - 3600), midi(NU - 7200, { uppruni: 'stjorn' }), midi(NU - 3 * 86400), null];
  assert.equal(nyjarSidan(l, NU - 5 * 3600, NU), 1);
  assert.equal(nyjarSidan(l, null, NU), 1, 'engin heimsókn skráð: síðasti sólarhringur');
  assert.equal(nyjarSidan(l, NU - 4 * 86400, NU), 2);
});

test('morgunkvedja: allar fjórar samsetningar lesast sem íslenska', () => {
  const sidast = ts('2026-09-21T22:10:00Z');
  const tvaer = [midi(NU - 3600), midi(NU - 7200)];
  assert.equal(morgunkvedja({ nu: NU, sidast, klst: 8, listi: tvaer, bida: 3 }), 'Góðan daginn. Í nótt bárust tvær nýjar beiðnir og þrjár bíða þín.');
  assert.equal(morgunkvedja({ nu: NU, sidast, klst: 8, listi: [midi(NU - 60)], bida: 0 }), 'Góðan daginn. Í nótt barst ein ný beiðni og engin bíður þín.');
  assert.equal(morgunkvedja({ nu: NU, sidast, klst: 8, listi: [], bida: 1 }), 'Góðan daginn. Ekkert nýtt í nótt, en ein bíður þín.');
  assert.equal(morgunkvedja({ nu: NU, sidast, klst: 8, listi: [], bida: 0 }), 'Góðan daginn. Ekkert nýtt í nótt og ekkert bíður þín.');
});

test('morgunkvedja: talnasamræmi 21 og 11, og kvöldkveðja', () => {
  const mikid = (n) => Array.from({ length: n }, (_, i) => midi(NU - 60 - i));
  const a = morgunkvedja({ nu: NU, sidast: null, klst: 20, listi: mikid(21), bida: 21 });
  assert.equal(a, 'Gott kvöld. Síðasta sólarhringinn barst 21 ný beiðni og 21 bíður þín.');
  const b = morgunkvedja({ nu: NU, sidast: null, klst: 20, listi: mikid(11), bida: 11 });
  assert.equal(b, 'Gott kvöld. Síðasta sólarhringinn bárust 11 nýjar beiðnir og 11 bíða þín.');
});
