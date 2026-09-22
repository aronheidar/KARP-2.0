import { test } from 'node:test';
import assert from 'node:assert/strict';
import { malsgreinar } from './frettavel.mjs';

test('skipt á auðum línum; eldri texti án þeirra er ein málsgrein', () => {
  assert.deepEqual(malsgreinar('Fyrsta.\n\nÖnnur,\nsama málsgrein.\n\n\nÞriðja.'), ['Fyrsta.', 'Önnur, sama málsgrein.', 'Þriðja.']);
  assert.deepEqual(malsgreinar('Gamall texti í einni línu.'), ['Gamall texti í einni línu.']);
  assert.deepEqual(malsgreinar(''), []);
  assert.deepEqual(malsgreinar(null), []);
});
