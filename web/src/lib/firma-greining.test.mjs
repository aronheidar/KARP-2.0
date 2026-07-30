import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFirma } from './firma-greining.mjs';

const it = (source, _t) => ({ title: 't', source, _t, ts: 1 });

test('scored er TALNING tón-greindra frétta — ekki bólskt gildi (villan „true tón-greindar")', () => {
  const r = aggregateFirma([it('RÚV', 1), it('RÚV', -1), it('Vísir', 0)]);
  assert.equal(typeof r.sentiment.scored, 'number');
  assert.equal(r.sentiment.scored, 2);        // hlutlausa fréttin telst ekki greind
  assert.equal(r.total, 3);
});

test('stats.sources er til og telur miðlana (Miðla-KPI sýndi 0)', () => {
  const r = aggregateFirma([it('RÚV', 1), it('RÚV', 1), it('Vísir', -1), it('mbl', 0)]);
  assert.equal(r.stats.sourceCount, 3);
  assert.deepEqual(r.stats.sources[0], { s: 'RÚV', n: 2 });   // raðað eftir fjölda
  assert.equal(r.stats.sources.length, 3);
});

test('sentiment.bySource gefur tón per miðil (vogin birti alltaf „of lítil umfjöllun")', () => {
  const r = aggregateFirma([it('RÚV', 1), it('RÚV', 1), it('Vísir', -1), it('Vísir', -1)]);
  assert.equal(r.sentiment.bySource.length, 2);
  const ruv = r.sentiment.bySource.find((x) => x.s === 'RÚV');
  const vis = r.sentiment.bySource.find((x) => x.s === 'Vísir');
  assert.equal(ruv.idx, 100);
  assert.equal(vis.idx, -100);
});

test('miðill án tón-greindra frétta fer EKKI í vogina en telst samt í sources', () => {
  const r = aggregateFirma([it('RÚV', 1), it('Hlutlaus', 0), it('Hlutlaus', 0)]);
  assert.equal(r.stats.sourceCount, 2);
  assert.deepEqual(r.sentiment.bySource.map((x) => x.s), ['RÚV']);
});

test('tónvísitala byggir á GREINDUM fréttum (hlutlausar þynna hana ekki)', () => {
  // 2 jákvæðar + 8 hlutlausar: idx á að vera +100, ekki +20
  const arr = [it('A', 1), it('A', 1), ...Array.from({ length: 8 }, () => it('A', 0))];
  assert.equal(aggregateFirma(arr).sentiment.idx, 100);
});

test('perDay reiknast af raunverulegum daga-glugga', () => {
  const arr = Array.from({ length: 90 }, () => it('A', 0));
  assert.equal(aggregateFirma(arr, { days: 180 }).stats.perDay, 0.5);
});

test('capped-merkið berst svo framendinn geti sagt „800+" en ekki „800"', () => {
  const arr = Array.from({ length: 800 }, () => it('A', 0));
  assert.equal(aggregateFirma(arr, { capped: true }).capped, true);
  assert.equal(aggregateFirma(arr, { capped: false }).capped, false);
});

test('tómt safn hrynur ekki og skilar núllum', () => {
  const r = aggregateFirma([]);
  assert.equal(r.total, 0);
  assert.equal(r.sentiment.scored, 0);
  assert.equal(r.sentiment.idx, 0);
  assert.deepEqual(r.sentiment.bySource, []);
  assert.deepEqual(r.stats.sources, []);
});

test('þolir rusl-inntak (null, vantandi source/_t)', () => {
  const r = aggregateFirma([null, {}, { source: 'A' }]);
  assert.equal(r.total, 3);
  assert.equal(r.sentiment.scored, 0);
  assert.ok(r.stats.sourceCount >= 1);
});
