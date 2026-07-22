import { test } from 'node:test';
import assert from 'node:assert';
import { leidrettFor, sortedLeidrett } from './leidrettingar.mjs';

const DATA = { items: [
  { slug: 'a', titill: 'A', dags: '2026-07-10', hvad: 'x' },
  { slug: 'b', titill: 'B', dags: '2026-07-15', hvad: 'y' },
  { slug: 'a', titill: 'A', dags: '2026-07-20', hvad: 'newer' },
] };

test('leidrettFor returns the entry for a slug; newest when multiple; null when absent', () => {
  assert.equal(leidrettFor('b', DATA).titill, 'B');
  assert.equal(leidrettFor('a', DATA).hvad, 'newer');
  assert.equal(leidrettFor('zzz', DATA), null);
  assert.equal(leidrettFor('', DATA), null);
});

test('sortedLeidrett orders by dags desc and tolerates empty/missing items', () => {
  assert.deepEqual(sortedLeidrett(DATA).map((c) => c.dags), ['2026-07-20', '2026-07-15', '2026-07-10']);
  assert.deepEqual(sortedLeidrett({}), []);
  assert.deepEqual(sortedLeidrett({ items: [] }), []);
  assert.deepEqual(sortedLeidrett(null), []);
});
