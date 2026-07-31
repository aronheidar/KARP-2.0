import test from 'node:test';
import assert from 'node:assert/strict';
import { adiliSlug, findAdili, adiliTerms, adiliPageData, adiliDesc } from './frettaadili.mjs';

const NOW = 1800000000;
const it = (title, source, sent, daysAgo = 5) => ({ title, url: 'https://x/' + title, source, sent, ts: NOW - daysAgo * 86400, date: '2026-07-01' });
const LIST = [{ n: 'Evrópusambandið', a: ['ESB', 'Evrópusambandsins'] }, { n: 'Brim hf.', a: [] }];

test('slug meðhöndlar íslenska stafi (þ/ð/ö/æ) svo slóðin sé nothæf', () => {
  assert.equal(adiliSlug('Evrópusambandið'), 'evropusambandid');
  assert.equal(adiliSlug('Þórdís Kolbrún'), 'thordis-kolbrun');
  assert.equal(adiliSlug('Ölgerðin'), 'olgerdin');
});

test('findAdili finnur aðila og er ónæmt fyrir hástöfum', () => {
  assert.equal(findAdili('evropusambandid', LIST).n, 'Evrópusambandið');
  assert.equal(findAdili('EVROPUSAMBANDID', LIST).n, 'Evrópusambandið');
});

test('findAdili skilar null fyrir ÓÞEKKTAN slug (engar ruslsíður fyrir leitarvélar)', () => {
  assert.equal(findAdili('eitthvad-rugl', LIST), null);
  assert.equal(findAdili('', LIST), null);
  assert.equal(findAdili('x', null), null);
});

test('adiliTerms sameinar nafn og samheiti án tvítekninga', () => {
  const t = adiliTerms(LIST[0]);
  assert.ok(t.includes('Evrópusambandið') && t.includes('ESB'));
  assert.equal(new Set(t).size, t.length);
});

test('adiliTerms sleppir of stuttum orðum (of víð leit)', () => {
  assert.deepEqual(adiliTerms({ n: 'AB', a: ['AB', 'Gott nafn'] }), ['Gott nafn']);
});

test('adiliPageData reiknar miðla, tímalínu og einkunn', () => {
  const items = [it('a', 'RÚV', 1), it('b', 'RÚV', -1), it('c', 'Vísir', 0)];
  const d = adiliPageData(items, { now: NOW });
  assert.equal(d.n, 3);
  assert.deepEqual(d.sources[0], { s: 'RÚV', n: 2 });
  assert.equal(d.timeline.length, 1);
  assert.equal(d.nyjast.length, 3);
});

test('nyjast er í RÉTTRI tímaröð (nýjast fyrst)', () => {
  const d = adiliPageData([it('gamalt', 'A', 0, 40), it('nytt', 'A', 0, 1)], { now: NOW });
  assert.equal(d.nyjast[0].title, 'nytt');
});

test('tómt safn hrynur ekki og gefur enga falska einkunn', () => {
  const d = adiliPageData([], { now: NOW });
  assert.equal(d.n, 0);
  assert.equal(d.ordspor.score, null);
  assert.deepEqual(d.sources, []);
});

test('lýsingin er UPPLÝSANDI (inniheldur tölur), ekki almennt orðalag', () => {
  const d = adiliPageData([it('a', 'RÚV', 1), it('b', 'RÚV', 1)], { now: NOW });
  const desc = adiliDesc('Brim hf.', d);
  assert.match(desc, /2 fréttir um Brim hf\./);
  assert.match(desc, /orðspors-einkunn/);
  assert.ok(desc.length <= 200, 'meta description má ekki vera of löng: ' + desc.length);
});

test('lýsing án gagna er samt gild', () => {
  assert.match(adiliDesc('X', adiliPageData([], { now: NOW })), /Fréttaumfjöllun um X/);
});
