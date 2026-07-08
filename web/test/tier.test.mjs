import { test } from 'node:test';
import assert from 'node:assert';
import { tierLevelOf, TIER_LVL } from '../src/data/lausnir.js';

test('tierLevelOf maps slugs to levels', () => {
  assert.equal(tierLevelOf('grunnur', false), 1);
  assert.equal(tierLevelOf('fyrirtaeki', false), 2);
  assert.equal(tierLevelOf('fyrirtaeki_plus', false), 3);
});
test('tierLevelOf: none/unknown = 0', () => {
  assert.equal(tierLevelOf(null, false), 0);
  assert.equal(tierLevelOf('bogus', false), 0);
  assert.equal(tierLevelOf(undefined, false), 0);
});
test('tierLevelOf: admin = 99 regardless of tier', () => {
  assert.equal(tierLevelOf(null, true), 99);
  assert.equal(tierLevelOf('grunnur', true), 99);
});
test('TIER_LVL is the ordered map', () => {
  assert.deepEqual(TIER_LVL, { grunnur: 1, fyrirtaeki: 2, fyrirtaeki_plus: 3 });
});
