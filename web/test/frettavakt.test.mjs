import { test } from 'node:test';
import assert from 'node:assert';
import { frettavaktMatch, frettavaktDue } from '../worker.js';

const FEED = [
  { id: 'gjaldthrot-1', date: '2026-07-20', type: 'gjaldthrot', title: 'Gjaldþrot Alfa ehf.', text: 'Beiðni birt', url: '/logbirting/' },
  { id: 'utbod-1', date: '2026-07-20', type: 'utbod', title: 'Nýtt útboð', text: 'Vegagerðin', url: '/utbod/' },
  { id: 'mark-1', date: '2026-07-19', type: 'mark', title: 'Marel hækkar', text: 'Kauphöll', url: '/markadir/' },
];
const NEWS = [
  { url: 'https://mbl.is/a', title: 'Marel kynnir uppgjör', body: 'gott ár', source: 'mbl.is', ts: 1 },
];

test('flokkar: matches feed items whose type is subscribed', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: ['gjaldthrot', 'utbod'], ord: [], seenIds: [] });
  assert.deepEqual(r.map((x) => x.id).sort(), ['gjaldthrot-1', 'utbod-1']);
});

test('ord: matches title+text of feed AND news (case-insensitive)', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: [], ord: ['marel'], seenIds: [] });
  assert.deepEqual(r.map((x) => x.id).sort(), ['https://mbl.is/a', 'mark-1']);
});

test('dedup: excludes ids already in seenIds', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: ['gjaldthrot'], ord: [], seenIds: ['gjaldthrot-1'] });
  assert.equal(r.length, 0);
});

test('union: an item matched by BOTH flokkar and ord appears once', () => {
  const r = frettavaktMatch(FEED, NEWS, { flokkar: ['mark'], ord: ['marel'], seenIds: [] });
  assert.equal(r.filter((x) => x.id === 'mark-1').length, 1);
});

test('cap: never returns more than 30', () => {
  const big = Array.from({ length: 50 }, (_, i) => ({ id: 'g' + i, date: '2026-07-20', type: 'gjaldthrot', title: 't', text: '', url: '/x/' }));
  const r = frettavaktMatch(big, [], { flokkar: ['gjaldthrot'], ord: [], seenIds: [] });
  assert.equal(r.length, 30);
});

test('empty: no subscription → no matches', () => {
  assert.equal(frettavaktMatch(FEED, NEWS, { flokkar: [], ord: [], seenIds: [] }).length, 0);
});

const NOW = 1_000_000;
const H = 3600;
const D = 86400;

test('strax: always due', () => {
  assert.equal(frettavaktDue('strax', NOW - 1, NOW), true);
  assert.equal(frettavaktDue('strax', NOW, NOW), true);
});

test('daglegt: due only after ~20h', () => {
  assert.equal(frettavaktDue('daglegt', NOW - 19 * H, NOW), false);
  assert.equal(frettavaktDue('daglegt', NOW - 21 * H, NOW), true);
});

test('vikulegt: due only after ~6.5d', () => {
  assert.equal(frettavaktDue('vikulegt', NOW - 6 * D, NOW), false);
  assert.equal(frettavaktDue('vikulegt', NOW - 7 * D, NOW), true);
});

test('never sent (falsy lastSent): due', () => {
  assert.equal(frettavaktDue('daglegt', 0, NOW), true);
  assert.equal(frettavaktDue('vikulegt', undefined, NOW), true);
});
