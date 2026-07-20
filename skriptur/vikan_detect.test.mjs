import { test } from 'node:test';
import assert from 'node:assert';
import mod from './vikan_detect.js';
const { pickVikan } = mod;

const W = { vextir: 10, gjaldthrot: 9, verdbolga: 8, domur: 7, styrkur: 6, mark: 3, vika: 5, thema: 8 };
const weightOf = (t) => W[t] || 4;
const catOf = (t) => ({ label: 'L-' + t, emoji: 'E' });
const asciiId = (s) => 'slug-' + String(s);
const BASE = { todayISO: '2026-07-20', weightOf, catOf, asciiId };
const mk = (id, type, date, title = 't', text = 'x') => ({ id, type, date, title, text });

test('excludes digest/meta types and items outside the 7-day window', () => {
  const items = [
    mk('a', 'gjaldthrot', '2026-07-19'), mk('b', 'vextir', '2026-07-18'), mk('c', 'domur', '2026-07-17'),
    mk('m1', 'vika', '2026-07-19'), mk('m2', 'thema', '2026-07-19'), mk('old', 'mark', '2026-07-01'),
  ];
  const slugs = pickVikan(items, BASE).facts.mal.map((m) => m.slug);
  assert.deepEqual(slugs.sort(), ['slug-a', 'slug-b', 'slug-c']);
});

test('ranks by weightOf desc, then date desc', () => {
  const items = [
    mk('low-new', 'mark', '2026-07-19'), mk('high-old', 'vextir', '2026-07-15'), mk('mid', 'domur', '2026-07-18'),
  ];
  const v = pickVikan(items, { ...BASE, min: 1 });
  assert.deepEqual(v.facts.mal.map((m) => m.slug), ['slug-high-old', 'slug-mid', 'slug-low-new']);
});

test('caps at 2 items per type', () => {
  const items = [
    mk('g1', 'gjaldthrot', '2026-07-19'), mk('g2', 'gjaldthrot', '2026-07-18'), mk('g3', 'gjaldthrot', '2026-07-17'),
    mk('d1', 'domur', '2026-07-16'), mk('s1', 'styrkur', '2026-07-15'),
  ];
  const slugs = pickVikan(items, BASE).facts.mal.map((m) => m.slug);
  assert.equal(slugs.filter((s) => s === 'slug-g1' || s === 'slug-g2' || s === 'slug-g3').length, 2);
  assert.ok(!slugs.includes('slug-g3'));
  assert.ok(slugs.includes('slug-d1') && slugs.includes('slug-s1'));
});

test('returns null when fewer than min candidates', () => {
  const items = [mk('a', 'gjaldthrot', '2026-07-19'), mk('b', 'domur', '2026-07-18')];
  assert.equal(pickVikan(items, BASE), null);
});

test('caps at n=5 and produces the vikan item shape', () => {
  const longText = 'Þetta er langur texti sem ætti að styttast töluvert í níutíu stafi eða svo, halló halló halló halló meira meira';
  const items = [
    mk('a', 'vextir', '2026-07-19', 'Vaxtafrétt', longText), mk('b', 'gjaldthrot', '2026-07-18'),
    mk('c', 'domur', '2026-07-17'), mk('d', 'styrkur', '2026-07-16'),
    mk('e', 'verdbolga', '2026-07-15'), mk('f', 'mark', '2026-07-14'),
  ];
  const v = pickVikan(items, BASE);
  assert.equal(v.id, 'vikan-2026-07-20');
  assert.equal(v.type, 'vikan');
  assert.equal(v.noai, true);
  assert.equal(v.title, '5 mál vikunnar');
  assert.equal(v.facts.mal.length, 5);
  const first = v.facts.mal[0];
  assert.equal(first.slug, 'slug-a');
  assert.equal(first.cat, 'L-vextir');
  assert.equal(first.emoji, 'E');
  assert.equal(first.dags, '2026-07-19');
  assert.equal(first.title, 'Vaxtafrétt');
  assert.ok(first.hook.length <= 90);
});
