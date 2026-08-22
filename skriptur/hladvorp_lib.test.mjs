// Próf fyrir hladvorp_lib.mjs — þátta-val undir kostnaðar-þökum, lengdar-þáttun, D1-batch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { minOf, veljaThaetti, d1Stmts, HLAD_CREATE } from './hladvorp_lib.mjs';

test('minOf: HH:MM:SS, MM:SS, sekúndur, rusl', () => {
  assert.equal(minOf('1:02:30'), 63);
  assert.equal(minOf('45:00'), 45);
  assert.equal(minOf('2700'), 45);
  assert.equal(minOf(''), null);
  assert.equal(minOf('abc'), null);
  assert.equal(minOf(null), null);
});

const ep = (url, feedId, p, d, min, maxMin) => ({ url, audio: url + '.mp3', show: feedId, feedId, p, d, min, maxMin: maxMin || 90 });

test('veljaThaetti: sleppir búnum og of löngum; forgangur ræður röð; nýjast fyrst innan forgangs', () => {
  const epis = [
    ep('a', 'spegillinn', 1, '2026-08-20', 30),
    ep('b', 'spegillinn', 1, '2026-08-21', 30),
    ep('c', 'einpaeling', 2, '2026-08-22', 30),
    ep('d', 'spegillinn', 1, '2026-08-19', 200),      // of langur (maxMin 90)
    ep('e', 'spegillinn', 1, '2026-08-18', 30),       // þegar búinn
  ];
  const r = veljaThaetti(epis, new Set(['e']));
  assert.deepEqual(r.valdir.map((x) => x.url), ['b', 'a', 'c']);   // p1 nýjast fyrst, svo p2
  assert.equal(r.sleppt.buinn, 1);
  assert.equal(r.sleppt.ofLangur, 1);
  assert.equal(r.minSum, 90);
});

test('veljaThaetti: heildar-mínútuþak, þátta-þak og per-feed þak halda', () => {
  const epis = [];
  for (let i = 0; i < 10; i++) epis.push(ep('s' + i, 'spegillinn', 1, '2026-08-' + (10 + i), 50));
  for (let i = 0; i < 10; i++) epis.push(ep('b' + i, 'bylgjan', 1, '2026-08-' + (10 + i), 50));
  const r = veljaThaetti(epis, new Set(), { maxMinRun: 250, perFeed: { bylgjan: 8 } });
  assert.ok(r.minSum <= 250);
  assert.equal(r.valdir.length, 5);                                  // 250/50
  assert.ok(r.valdir.filter((x) => x.feedId === 'spegillinn').length <= 4);   // default per-feed 4
  const r2 = veljaThaetti(epis, new Set(), { maxMinRun: 5000, maxEpRun: 6 });
  assert.equal(r2.valdir.length, 6);
  const r3 = veljaThaetti(epis.filter((e) => e.feedId === 'bylgjan'), new Set(), { maxMinRun: 5000, perFeed: { bylgjan: 8 } });
  assert.equal(r3.valdir.length, 8);
  // óþekkt lengd telur 45 mín í þakinu
  const r4 = veljaThaetti([ep('x', 'f', 1, '2026-08-20', null)], new Set(), { maxMinRun: 44 });
  assert.equal(r4.valdir.length, 0);
});

test('d1Stmts: CREATE fyrst, INSERT m/bundnum breytum + 60k-klippu, trim síðast; sleppir texta-lausum', () => {
  const st = d1Stmts([
    { url: 'https://x/ep1', show: "Rauða borðið", title: "Um 'kvótann'", ts: 1755800000, dur: 55, texti: 'x'.repeat(70000) },
    { url: 'https://x/ep2', show: 'S', title: 'T', ts: 1, dur: 1, texti: '' },
  ], 1755900000);
  assert.equal(st.length, 3);
  assert.equal(st[0].sql, HLAD_CREATE);
  assert.ok(st[1].sql.startsWith('INSERT OR REPLACE INTO hladvorp'));
  assert.deepEqual(st[1].params.slice(0, 5), ['https://x/ep1', 'Rauða borðið', "Um 'kvótann'", 1755800000, 55]);   // engin escape-þörf
  assert.equal(st[1].params[5].length, 60000);
  assert.deepEqual(st[2], { sql: 'DELETE FROM hladvorp WHERE ts < ?', params: [1755900000 - 90 * 86400] });
});
