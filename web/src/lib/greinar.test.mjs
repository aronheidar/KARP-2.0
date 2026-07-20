import { test } from 'node:test';
import assert from 'node:assert';
import { GREINAR, greinaBySlug, greinaSql } from './greinar.mjs';

test('GREINAR includes island (no filter) and sjavarutvegur', () => {
  assert.ok(GREINAR.find((g) => g.slug === 'island' && g.isat === null));
  assert.deepEqual(greinaBySlug('sjavarutvegur').isat, ['03']);
});

test('greinaSql: island → no filter (empty)', () => {
  assert.equal(greinaSql('island'), '');
});

test('greinaSql: sector → substr(isat_primary,1,2) IN (...)', () => {
  assert.equal(greinaSql('sjavarutvegur'), "substr(f.isat_primary,1,2) IN ('03')");
  assert.equal(greinaSql('verslun'), "substr(f.isat_primary,1,2) IN ('45','46','47')");
});

test('greinaSql: unknown slug → null', () => {
  assert.equal(greinaSql('bogus'), null);
});
