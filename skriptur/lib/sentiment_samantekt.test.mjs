// skriptur/lib/sentiment_samantekt.test.mjs
// ⚠ 22.9.2026: gogn/sentiment.json stóð frá 28.6. Framleiðandinn (build_sentiment.js, eigið Haiku-mat
// á RSS með skyndiminni á vél Arons) var aldrei í daglegu keyrslunni, og lifandi /api/firma reiknaði
// tón annars staðar. Nú bakast skráin úr sama tónmati (D1 news.sent_ai) og /api/firma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faersla } from './sentiment_samantekt.mjs';

const f = (ts, _t, source = 'RÚV') => ({ title: 'T' + ts, url: 'https://x.is/' + ts, source, ts, _t });

test('færsla: sama snið og síðurnar lesa (idx, n, pos, neu, neg, recent)', () => {
  const r = faersla([f(1, 1), f(2, -1), f(3, -1), f(4, 0)], 180);
  assert.equal(r.idx, -33);            // (1 - 2) / 3 greindar
  assert.equal(r.n, 3);                // greindar, ekki allar
  assert.deepEqual([r.pos, r.neu, r.neg], [1, 1, 2]);
  assert.deepEqual(r.recent.map((x) => x.t), ['T4', 'T3', 'T2', 'T1'], 'nýjast fyrst');
  assert.deepEqual(r.recent[0], { t: 'T4', l: 'https://x.is/4', s: 0 });
});

test('ekkert greint → null (síðan sýnir þá ekkert í stað 0)', () => {
  assert.equal(faersla([f(1, 0)], 180), null);
  assert.equal(faersla([], 180), null);
});

test('recent: aðeins átta nýjustu', () => {
  const r = faersla(Array.from({ length: 12 }, (_, i) => f(i, 1)), 180);
  assert.equal(r.recent.length, 8);
  assert.equal(r.recent[0].t, 'T11');
});
