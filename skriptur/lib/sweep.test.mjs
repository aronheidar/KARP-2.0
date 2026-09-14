import { test } from 'node:test';
import assert from 'node:assert';
import { extractKts, nextPrefixes, SWEEP_ALPHABET } from './sweep.mjs';

test('extractKts: dedupes kennitala links', () => {
  const html = 'x<a href="/fyrirtaekjaskra/leit/kennitala/5920190799">A</a> <a href="/fyrirtaekjaskra/leit/kennitala/5920190799">dup</a> <a href="/fyrirtaekjaskra/leit/kennitala/4808221610">B</a>';
  assert.deepEqual(extractKts(html).sort(), ['4808221610', '5920190799']);
});

test('nextPrefixes: saturated prefix deepens', () => {
  const r = nextPrefixes('a', 100, 100);
  assert.equal(r.done, false);
  assert.equal(r.children.length, SWEEP_ALPHABET.length);
  assert.ok(r.children.every((c) => c.startsWith('a') && c.length === 2));
});

// ⚠ Mælt 14.9 á 6.522 sóttum nöfnum: greinarmerki koma fyrir í ÖÐRU sæti félagsnafna
// (. 113 · - 45 · & 3 · / 2 · , 2). Vantaði þau í stafrófið duttu heilar greinar úr
// dýpkuninni — „a.“ eitt og sér skilar 99 félögum sem sweepið hefði aldrei séð.
test('SWEEP_ALPHABET nær greinarmerkjunum sem sjást í félagsnöfnum', () => {
  for (const c of ['.', ',', '-', '&', '/', "'", '(', '+', '%']) {
    assert.ok(SWEEP_ALPHABET.includes(c), `stafrófið vantar ${JSON.stringify(c)}`);
  }
});

test('SWEEP_ALPHABET heldur bókstöfum, tölum og bili — og er án tvítekninga', () => {
  for (const c of ['a', 'ö', 'þ', 'æ', 'ð', 'á', '0', '9', ' ']) {
    assert.ok(SWEEP_ALPHABET.includes(c), `stafrófið vantar ${JSON.stringify(c)}`);
  }
  assert.equal(new Set(SWEEP_ALPHABET).size, SWEEP_ALPHABET.length, 'tvítekinn stafur í stafrófinu');
});

test('nextPrefixes: unsaturated prefix is done', () => {
  const r = nextPrefixes('xq', 12, 100);
  assert.equal(r.done, true);
  assert.deepEqual(r.children, []);
});
