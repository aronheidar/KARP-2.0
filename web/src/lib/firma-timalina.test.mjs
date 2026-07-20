import { test } from 'node:test';
import assert from 'node:assert';
import { buildTimalina } from './firma-timalina.mjs';

const SRC = {
  logbirting: [{ type: 'gjaldthrot_beidni', date: '2026-05-10', court: 'Héraðsdómur Reykjavíkur', url: '/lbl/x' }],
  vorumerki: [{ titill: 'GO WITH JAN', tegund: 'orðmerki', skrad: '2026-07-06' }],
  styrkir: [{ sjodur: 'Kvikmyndasjóður', upphaed: 130000000, ar: 2027, verkefni: 'Hafið' }],
  frettir: [{ id: 'gjaldthrot-þor', date: '2026-06-01', title: 'Frétt um félagið' }],
};

test('normalizes each source into events with the right flokkur/slod', () => {
  const ev = buildTimalina(SRC);
  const by = Object.fromEntries(ev.map((e) => [e.flokkur, e]));
  assert.equal(by.gjaldthrot.titill, 'Gjaldþrotaskiptabeiðni');
  assert.equal(by.gjaldthrot.slod, '/lbl/x');
  assert.ok(by.vorumerki.titill.includes('GO WITH JAN'));
  assert.ok(by.styrkur.lysing.includes('130.000.000'));      // þúsundapunktar
  assert.equal(by.frett.slod, '/frettavel/gjaldthrot-thor/');  // asciiId permalink (þ→th)
});

test('sorts newest-first across sources', () => {
  const ev = buildTimalina(SRC);
  const dates = ev.map((e) => e.dags);
  assert.deepEqual(dates, [...dates].sort((a, b) => b.localeCompare(a)));
  assert.equal(ev[0].dags, '2027-01-01');                     // styrkur 2027 newest
});

test('arGrof styrkur shows "Árið <ar>"; frett/logbirting show dd.mm.yyyy', () => {
  const ev = buildTimalina(SRC);
  assert.equal(ev.find((e) => e.flokkur === 'styrkur').birt, 'Árið 2027');
  assert.equal(ev.find((e) => e.flokkur === 'gjaldthrot').birt, '10.5.2026');
});

test('drops events without a date; empty sources → []', () => {
  assert.equal(buildTimalina({ logbirting: [{ type: 'x' }] }).length, 0);   // no date
  assert.deepEqual(buildTimalina({}), []);
});

test('respects max cap', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ id: 'g' + i, date: '2026-01-01', title: 't' }));
  assert.equal(buildTimalina({ frettir: many }, { max: 60 }).length, 60);
});
