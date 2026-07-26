import { test } from 'node:test';
import assert from 'node:assert';
import { accountId, tierFields } from './account.mjs';

const NOW = 1000;
const active = (tier) => ({ tier, tier_until: NOW + 1 });
const expired = (tier) => ({ tier, tier_until: NOW - 1 });

test('accountId: eigandi = eigið id', () => {
  assert.equal(accountId({ id: 5, parent_account_id: null }), 5);
});
test('accountId: meðlimur = parent', () => {
  assert.equal(accountId({ id: 7, parent_account_id: 5 }), 5);
});
test('tierFields: sjálfstæður virkur = sama tier/effectiveTier', () => {
  const r = tierFields(active('fyrirtaeki_plus'), active('fyrirtaeki_plus'), NOW);
  assert.deepEqual(r, { tier: 'fyrirtaeki_plus', effectiveTier: 'fyrirtaeki_plus' });
});
test('tierFields: meðlimur án eigin þreps erfir account', () => {
  const r = tierFields({ tier: null, tier_until: null }, active('fyrirtaeki_plus'), NOW);
  assert.equal(r.tier, null);
  assert.equal(r.effectiveTier, 'fyrirtaeki_plus');
});
test('tierFields: meðlimur með eigin hærra þrep heldur því', () => {
  const r = tierFields(active('fyrirtaeki'), active('grunnur'), NOW);
  assert.equal(r.effectiveTier, 'fyrirtaeki');
});
test('tierFields: útrunnið = null', () => {
  const r = tierFields(expired('fyrirtaeki_plus'), expired('fyrirtaeki_plus'), NOW);
  assert.deepEqual(r, { tier: null, effectiveTier: null });
});
