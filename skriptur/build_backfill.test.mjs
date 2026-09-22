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

// ── Birtingardagsetning VB (22.9.2026) ───────────────────────────────────────
// VB ber ENGA vélræna dagsetningu, aðeins sýnilegan texta. Án hans féll hver VB-grein á dagsetningu
// Wayback-afritsins: Booking-grein frá 3.9 fékk 9.9.
test('sýnileg íslensk dagsetning MEÐ klukkutíma er lesin (VB, Fiskifréttir)', () => {
  const { extractPub } = require('./build_backfill_more.js');
  const html = '<div class="dags">3. september 2026 13:19</div><p>Samningurinn var gerður 19. september 2024 þar sem …</p>';
  assert.equal(extractPub(html), Math.floor(Date.UTC(2026, 8, 3, 13, 19) / 1000));
});

test('dagsetning í meginmáli ÁN klukkutíma er ekki tekin sem birtingartími', () => {
  const { extractPub } = require('./build_backfill_more.js');
  assert.equal(extractPub('<p>Samningurinn var gerður 19. september 2024 þar sem staðfest var …</p>'), 0);
});

test('vélræn dagsetning gengur fyrir sýnilegum texta', () => {
  const { extractPub } = require('./build_backfill_more.js');
  const html = '<meta property="article:published_time" content="2026-09-05T08:00:00Z"><div>3. september 2026 13:19</div>';
  assert.equal(extractPub(html), Math.floor(Date.UTC(2026, 8, 5, 8, 0) / 1000));
});
