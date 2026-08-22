// Próf fyrir hladvorp_lib.mjs — þátta-val undir kostnaðar-þökum, lengdar-þáttun, D1-batch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { minOf, sqlStr, veljaThaetti, d1Batch } from './hladvorp_lib.mjs';

test('minOf: HH:MM:SS, MM:SS, sekúndur, rusl', () => {
  assert.equal(minOf('1:02:30'), 63);
  assert.equal(minOf('45:00'), 45);
  assert.equal(minOf('2700'), 45);
  assert.equal(minOf(''), null);
  assert.equal(minOf('abc'), null);
  assert.equal(minOf(null), null);
});

test('sqlStr: gæsalappir tvöfaldaðar, stýristafir/línubil verða bil', () => {
  assert.equal(sqlStr("a'b"), "'a''b'");
  assert.equal(sqlStr('a\nb\tc'), "'a b c'");
  assert.equal(sqlStr(null), "''");
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

test('d1Batch: CREATE + INSERT með escapaðri texta-klippu + trim; sleppir texta-lausum', () => {
  const sql = d1Batch([
    { url: 'https://x/ep1', show: "Rauða borðið", title: "Um 'kvótann'", ts: 1755800000, dur: 55, texti: 'x'.repeat(70000) },
    { url: 'https://x/ep2', show: 'S', title: 'T', ts: 1, dur: 1, texti: '' },
  ], 1755900000);
  assert.ok(sql.startsWith('CREATE TABLE IF NOT EXISTS hladvorp'));
  assert.ok(sql.includes("''kvótann''"));
  assert.equal((sql.match(/INSERT OR REPLACE/g) || []).length, 1);   // ep2 texta-laus → sleppt
  const ins = sql.split('\n').find((l) => l.startsWith('INSERT'));
  assert.ok(ins.length < 60600, 'texti klipptur í 60k: ' + ins.length);
  assert.ok(sql.includes('DELETE FROM hladvorp WHERE ts < ' + (1755900000 - 90 * 86400)));
});
