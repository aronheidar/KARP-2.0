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

test('nextPrefixes: unsaturated prefix is done', () => {
  const r = nextPrefixes('xq', 12, 100);
  assert.equal(r.done, true);
  assert.deepEqual(r.children, []);
});
