// Bakvistunin úr Wayback verður að merkja hvern miðil EINS og lifandi innlesturinn (`NEWS_FEEDS`).
// 21.9.2026 bar DV tvö merki í `news`: 'dv.is' úr build_backfill.js (3.276 raðir, 1.1–18.7) og 'DV'
// úr straumnum (frá 20.8), svo fjölmiðlavogin og tóngreiningin á /frettir/ töldu einn miðil sem tvo.
// Raðirnar voru sameinaðar í D1 sama dag; þessi próf halda merkjunum saman framvegis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NEWS_FEEDS } from '../web/src/worker/cron.mjs';

const require = createRequire(import.meta.url);
const vefur = (slod) => new URL(/^https?:\/\//.test(slod) ? slod : 'https://' + slod).host.replace(/^www\./, '');

// Merkin sem lifandi innlesturinn gefur hverjum vef. vb.is ber tvö (Viðskiptablaðið + Fiskifréttir).
const LIFANDI = new Map();
for (const [slod, merki] of NEWS_FEEDS) {
  if (!LIFANDI.has(vefur(slod))) LIFANDI.set(vefur(slod), new Set());
  LIFANDI.get(vefur(slod)).add(merki);
}

test('DV er bakvistað undir merkinu DV, ekki dv.is', () => {
  const { SRC } = require('./build_backfill.js');
  const dv = SRC.find((s) => s.prefixes.every((p) => vefur(p) === 'dv.is'));
  assert.ok(dv, 'build_backfill.js sækir ekki lengur DV');
  assert.equal(dv.name, 'DV');
});

for (const skra of ['./build_backfill.js', './build_backfill_more.js']) {
  test(`${skra} merkir hvern miðil eins og NEWS_FEEDS`, () => {
    let borid = 0;
    for (const s of Object.values(require(skra).SRC)) {
      for (const p of s.prefixes) {
        const lifandi = LIFANDI.get(vefur(p));
        if (!lifandi) continue;   // enginn lifandi straumur (t.d. Mannlíf) → ekkert að bera saman við
        assert.ok(lifandi.has(s.name), `${p}: bakvistunin merkir '${s.name}' en straumurinn ${[...lifandi].join(' / ')}`);
        borid++;
      }
    }
    assert.ok(borid > 0, 'ekkert borið saman, svo prófið gætir einskis');
  });
}
