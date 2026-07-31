import test from 'node:test';
import assert from 'node:assert/strict';
import { reputationScore, toneAlert, scoreLabel, FULL_N } from './ordspor.mjs';

const NOW = 1800000000;
const d = (daysAgo) => NOW - daysAgo * 86400;
const mk = (n, sent, daysAgo = 10) => Array.from({ length: n }, () => ({ ts: d(daysAgo), sent }));

test('engin umfjöllun → score null (EKKI 50, svo UI sýni „—" en ekki falskt hlutleysi)', () => {
  const r = reputationScore([], { now: NOW });
  assert.equal(r.score, null);
  assert.equal(r.n, 0);
});

test('eintóm jákvæð umfjöllun (nóg gögn) gefur háa einkunn', () => {
  const r = reputationScore(mk(FULL_N, 1), { now: NOW });
  assert.ok(r.score >= 80, 'fékk ' + r.score);
  assert.equal(r.tone, 1);
});

test('eintóm neikvæð umfjöllun gefur lága einkunn', () => {
  const r = reputationScore(mk(FULL_N, -1), { now: NOW });
  assert.ok(r.score <= 20, 'fékk ' + r.score);
});

test('hlutlaus umfjöllun situr við 50', () => {
  assert.equal(reputationScore(mk(FULL_N, 0), { now: NOW }).score, 50);
});

test('FÁAR fréttir draga einkunn að 50 (loforð aldrei stærra en gögnin)', () => {
  const fatt = reputationScore(mk(3, 1), { now: NOW });
  const margt = reputationScore(mk(FULL_N, 1), { now: NOW });
  assert.ok(fatt.score < margt.score, 'fátt=' + fatt.score + ' margt=' + margt.score);
  assert.ok(fatt.score < 60, '3 jákvæðar fréttir mega ekki gefa háa einkunn: ' + fatt.score);
  assert.ok(fatt.conf < 0.2);
});

test('mikil umfjöllun ein og sér hækkar EKKI einkunn', () => {
  const lítið = reputationScore(mk(FULL_N, 0), { now: NOW });
  const mikið = reputationScore(mk(FULL_N * 5, 0), { now: NOW });
  assert.equal(lítið.score, mikið.score);
});

test('versnandi þróun lækkar einkunn miðað við sama meðaltón', () => {
  // fyrri helmingur jákvæður, seinni neikvæður
  const versnar = [...mk(15, 1, 80), ...mk(15, -1, 10)];
  const jafnt = [...mk(15, 1, 80), ...mk(15, -1, 80)];
  const a = reputationScore(versnar, { now: NOW, days: 90 });
  const b = reputationScore(jafnt, { now: NOW, days: 90 });
  assert.ok(a.trend < 0, 'trend=' + a.trend);
  assert.ok(a.score < b.score, 'versnar=' + a.score + ' jafnt=' + b.score);
});

test('fréttir utan gluggans teljast ekki með', () => {
  const r = reputationScore(mk(20, -1, 200), { now: NOW, days: 90 });
  assert.equal(r.n, 0);
  assert.equal(r.score, null);
});

test('scoreLabel segir frá óvissu þegar gögnin eru fá', () => {
  assert.equal(scoreLabel(90, 0.1), 'of lítil umfjöllun til að meta');
  assert.equal(scoreLabel(70, 1), 'mjög jákvætt');
  assert.equal(scoreLabel(50, 1), 'hlutlaust');
  assert.equal(scoreLabel(20, 1), 'mjög neikvætt');
});

test('öryggisstuðull KVARÐAST með glugga (annars þagði vaktin á 7 dögum)', () => {
  // 10 fréttir eru MIKIÐ á 7 dögum en lítið á 90 → conf á að vera hærri í stutta glugganum
  const stutt = reputationScore(mk(10, -1, 1), { now: NOW, days: 7 });
  const langt = reputationScore(mk(10, -1, 1), { now: NOW, days: 90 });
  assert.equal(stutt.conf, 1, 'stuttur gluggi á að ná fullri vigt');
  assert.ok(langt.conf < 0.4, 'langur gluggi á að vera óviss: ' + langt.conf);
  assert.ok(stutt.score < langt.score, 'stutt=' + stutt.score + ' langt=' + langt.score);
});

// ── orðsporsvakt ──
test('vakt þegir þegar umfjöllun er of lítil (engar falsviðvaranir)', () => {
  const a = toneAlert(mk(2, -1, 1), { now: NOW });
  assert.equal(a.alert, false);
});

test('vakt vaknar við SNARPT FALL milli vikna', () => {
  const items = [...mk(10, 1, 10), ...mk(10, -1, 1)];   // góð vika → slæm vika
  const a = toneAlert(items, { now: NOW, windowDays: 7 });
  assert.equal(a.alert, true);
  assert.equal(a.reason, 'fall');
  assert.ok(a.drop >= 25, 'drop=' + a.drop);
});

test('vakt vaknar við ALGERT lágmark þótt ekkert fall sé (viðvarandi neikvætt)', () => {
  const a = toneAlert(mk(10, -1, 1), { now: NOW, windowDays: 7 });
  assert.equal(a.alert, true);
  assert.ok(['lagt', 'fall'].includes(a.reason));
});

test('vakt þegir við stöðuga jákvæða umfjöllun', () => {
  const items = [...mk(10, 1, 10), ...mk(10, 1, 1)];
  assert.equal(toneAlert(items, { now: NOW, windowDays: 7 }).alert, false);
});
