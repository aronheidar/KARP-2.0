import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mod from './fastthr_detect.js';

const { pickFastthr, ORDALAG } = mod;
const HER = path.dirname(fileURLToPath(import.meta.url));

// ── smiðir ──────────────────────────────────────────────────────────────────
const fyrri = (m, k) => { const [a, b] = m.split('-').map(Number); const t = a * 12 + (b - 1) - k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
const MAN = (m, n) => ({ m, hbsv: { n: Math.round(n * 0.65), m2: 800 }, land: { n: n - Math.round(n * 0.65), m2: 560 } });
// FA(manudur, verdict, {n, saga, vidmidN}) → fasteignir.json-líki með `saga` viðmiðunarmánuðum á undan
const FA = (updated, verdict, o = {}) => {
  const { n = 700, chg3 = -2, chg12 = 1.2, saga = 12, vidmidN = 700 } = o;
  const months = [];
  for (let i = saga; i >= 1; i--) months.push(MAN(fyrri(updated, i), vidmidN));
  months.push(MAN(updated, n));
  return { months, direction: { chg3, chg12, verdict, updated } };
};
const G = (dags, manudur, verdict) => ({ dags, manudur, verdict });

// ── 1. grunnhegðun ──────────────────────────────────────────────────────────
test('liðinn mánuður með breyttum dómi verður frambjóðandi með orðalagi og fyrra gildi', () => {
  const { cand, grunnur } = pickFastthr(FA('2026-08', 'up', { chg3: 2.3, chg12: 5.9, n: 531 }), G('2026-08-01', '2026-07', 'cooling'), { todayISO: '2026-09-01' });
  assert.equal(cand.length, 1);
  assert.deepEqual(cand[0], { manudur: '2026-08', verdict: 'up', ordalag: 'hitnar', fyrri: 'cooling', fyrriManudur: '2026-07', chg3: 2.3, chg12: 5.9, n: 531 });
  assert.deepEqual(grunnur, { dags: '2026-09-01', manudur: '2026-08', verdict: 'up' });
});

test('óbreyttur dómur gefur engan frambjóðanda en grunnurinn færist fram á nýja mánuðinn', () => {
  const { cand, grunnur } = pickFastthr(FA('2026-08', 'cooling'), G('2026-08-01', '2026-07', 'cooling'), { todayISO: '2026-09-01' });
  assert.deepEqual(cand, []);
  assert.deepEqual(grunnur, { dags: '2026-09-01', manudur: '2026-08', verdict: 'cooling' });
});

// ── 2. kjarninn: líðandi mánuður er aldrei dæmdur ───────────────────────────
test('líðandi mánuður er aldrei dæmdur — raun-flökt júlí 2026 gefur ENGAN viðburð', () => {
  // Úr git-sögu gogn/fasteignir.json: [dagur, n(hbsv+land), dómur] meðan júlí var enn að fyllast.
  const flokt = [['2026-07-15', 331, 'flat'], ['2026-07-16', 375, 'cooling'], ['2026-07-17', 410, 'cooling'],
    ['2026-07-18', 432, 'cooling'], ['2026-07-22', 502, 'cooling'], ['2026-07-23', 516, 'flat'],
    ['2026-07-25', 588, 'down'], ['2026-07-29', 660, 'cooling'], ['2026-07-30', 699, 'cooling'], ['2026-07-31', 741, 'cooling']];
  let g = G('2026-07-05', '2026-06', 'cooling');
  for (const [todayISO, n, v] of flokt) {
    const r = pickFastthr(FA('2026-07', v, { n }), g, { todayISO });
    assert.deepEqual(r.cand, [], `${todayISO} (n=${n}, ${v}) átti ekki að gefa viðburð`);
    assert.deepEqual(r.grunnur, g, `${todayISO} mátti ekki hreyfa grunninn`);
    g = r.grunnur;
  }
  // 1.8: júlí liðinn og settur á `cooling` — sami dómur og júní, engin frétt.
  const eftir = pickFastthr(FA('2026-07', 'cooling', { n: 758, chg3: -1.8, chg12: 1.7 }), g, { todayISO: '2026-08-01' });
  assert.deepEqual(eftir.cand, []);
  assert.deepEqual(eftir.grunnur, { dags: '2026-08-01', manudur: '2026-07', verdict: 'cooling' });
});

test('mánuðurinn telst ekki liðinn fyrr en almanaksmánuðurinn er á enda', () => {
  const fa = FA('2026-07', 'down', { n: 741 });
  const g = G('2026-07-01', '2026-06', 'cooling');
  assert.deepEqual(pickFastthr(fa, g, { todayISO: '2026-07-31' }).cand, [], 'síðasti dagur mánaðarins er enn líðandi');
  assert.equal(pickFastthr(fa, g, { todayISO: '2026-08-01' }).cand.length, 1, 'fyrsti dagur næsta mánaðar dæmir');
});

// ── 3. lágmarksfjöldi kaupa ─────────────────────────────────────────────────
test('liðinn mánuður með of fá kaup er ekki dæmdur og grunnurinn helst óbreyttur', () => {
  const g = G('2026-08-01', '2026-07', 'cooling');
  // 60% af miðgildi 12 mánaða (700) = 420 kaup.
  assert.deepEqual(pickFastthr(FA('2026-08', 'up', { n: 419 }), g, { todayISO: '2026-09-01' }), { cand: [], grunnur: g });
  assert.equal(pickFastthr(FA('2026-08', 'up', { n: 420 }), g, { todayISO: '2026-09-01' }).cand.length, 1, '60% nákvæmlega er nothæft');
});

test('ágúst 2026 (531 kaup á móti 728 að miðgildi) stenst lágmarkið — raungildi', () => {
  const fa = FA('2026-08', 'up', { n: 531, saga: 12, vidmidN: 728 });
  assert.equal(pickFastthr(fa, G('2026-08-01', '2026-07', 'cooling'), { todayISO: '2026-09-01' }).cand.length, 1);
});

test('of stutt viðmiðunarsaga: enginn dómur, grunnurinn helst óbreyttur', () => {
  const g = G('2026-08-01', '2026-07', 'cooling');
  assert.deepEqual(pickFastthr(FA('2026-08', 'up', { saga: 5 }), g, { todayISO: '2026-09-01' }), { cand: [], grunnur: g });
  assert.equal(pickFastthr(FA('2026-08', 'up', { saga: 6 }), g, { todayISO: '2026-09-01' }).cand.length, 1, '6 mánuðir duga');
});

// ── 4. grunnurinn: gamla sniðið, aldur, tímaferðalög ────────────────────────
test('grunnur á gamla sniðinu (strengur) er ekki borinn saman: þögul endurstilling', () => {
  // state.fastVerdict var ber strengur, t.d. "cooling".
  const { cand, grunnur } = pickFastthr(FA('2026-08', 'up'), 'cooling', { todayISO: '2026-09-01' });
  assert.deepEqual(cand, []);
  assert.deepEqual(grunnur, { dags: '2026-09-01', manudur: '2026-08', verdict: 'up' });
});

test('enginn grunnur (fyrsta keyrsla) endurstillir í þögn', () => {
  for (const g of [null, undefined, {}, { manudur: '2026-07' }, { verdict: 'cooling' }]) {
    assert.deepEqual(pickFastthr(FA('2026-08', 'up'), g, { todayISO: '2026-09-01' }).cand, [], JSON.stringify(g));
  }
});

test('grunnur meira en 3 mánuðum eldri er ekki borinn saman', () => {
  const fa = FA('2026-08', 'up');
  assert.equal(pickFastthr(fa, G('2026-05-01', '2026-05', 'cooling'), { todayISO: '2026-09-01' }).cand.length, 1, '3 mánaða bil er enn nothæft');
  assert.deepEqual(pickFastthr(fa, G('2026-04-01', '2026-04', 'cooling'), { todayISO: '2026-09-01' }).cand, [], '4 mánaða bil spannar óséð tímabil');
});

test('grunnur á sama mánuði eða á undan skránni er ekki borinn saman', () => {
  const fa = FA('2026-08', 'up');
  assert.deepEqual(pickFastthr(fa, G('2026-09-01', '2026-08', 'cooling'), { todayISO: '2026-09-01' }).cand, [], 'sami mánuður');
  assert.deepEqual(pickFastthr(fa, G('2026-10-01', '2026-09', 'cooling'), { todayISO: '2026-10-01' }).cand, [], 'skráin færð aftur');
});

test('grunnur dagsettur Á EFTIR keyrsludeginum er ekki borinn saman', () => {
  assert.deepEqual(pickFastthr(FA('2026-08', 'up'), G('2026-09-20', '2026-07', 'cooling'), { todayISO: '2026-09-01' }).cand, []);
});

// ── 5. bilaðar skrár mega aldrei þurrka grunninn ────────────────────────────
test('biluð eða tóm skrá skilur grunninn eftir óbreyttan', () => {
  const g = G('2026-09-01', '2026-08', 'up');
  const bilad = [null, undefined, {}, { months: [] }, { direction: {}, months: [] },
    { ...FA('2026-08', 'up'), direction: { verdict: 'up', updated: '2026-08', chg3: null, chg12: 1 } },
    { ...FA('2026-08', 'up'), direction: { verdict: 'up', updated: 'ógilt', chg3: -2, chg12: 1 } },
    { ...FA('2026-08', 'nyttord'), direction: { verdict: 'nyttord', updated: '2026-08', chg3: -2, chg12: 1 } }];
  for (const fa of bilad) assert.deepEqual(pickFastthr(fa, g, { todayISO: '2026-10-01' }), { cand: [], grunnur: g }, String(JSON.stringify(fa)).slice(0, 90));
});

test('ógildur keyrsludagur dæmir ekki', () => {
  const g = G('2026-08-01', '2026-07', 'cooling');
  assert.deepEqual(pickFastthr(FA('2026-08', 'up'), g, { todayISO: 'ógilt' }), { cand: [], grunnur: g });
  assert.deepEqual(pickFastthr(FA('2026-08', 'up'), g, {}), { cand: [], grunnur: g });
});

test('mánuður skrárinnar verður að vera síðasti mánuðurinn í months', () => {
  const fa = FA('2026-08', 'up');
  fa.direction.updated = '2026-07'; // ósamræmi: direction bendir ekki á síðasta mánuðinn
  const g = G('2026-07-01', '2026-06', 'cooling');
  assert.deepEqual(pickFastthr(fa, g, { todayISO: '2026-09-01' }), { cand: [], grunnur: g });
});

// ── 6. orðaforði ────────────────────────────────────────────────────────────
test('orðalagið nær yfir allan orðaforða build_fasteignir.js og ekkert umfram hann', () => {
  const src = fs.readFileSync(path.join(HER, 'build_fasteignir.js'), 'utf8');
  const ord = new Set();
  for (const lina of src.split('\n').filter((l) => /\bverdict\s*=/.test(l))) {
    for (const m of lina.matchAll(/'([a-z]+)'/g)) ord.add(m[1]);
  }
  assert.ok(ord.size >= 4, `fann aðeins ${ord.size} dóma í build_fasteignir.js — regex úreltur?`);
  assert.deepEqual([...ord].sort(), Object.keys(ORDALAG).sort(), 'orðalagið og build_fasteignir.js verða að hafa sama orðaforða');
  for (const [v, o] of Object.entries(ORDALAG)) assert.match(o, /^[a-záðéíóúýþæö ]+$/, `${v}: orðalag á íslensku`);
});

// ── 7. aldrei flóð ──────────────────────────────────────────────────────────
test('aldrei fleiri en einn viðburður í einni keyrslu', () => {
  let g = G('2026-05-01', '2026-04', 'flat');
  for (const [m, v, t] of [['2026-05', 'up', '2026-06-01'], ['2026-06', 'down', '2026-07-01'], ['2026-07', 'cooling', '2026-08-01']]) {
    const r = pickFastthr(FA(m, v), g, { todayISO: t });
    assert.equal(r.cand.length, 1, `${m}: nákvæmlega einn`);
    g = r.grunnur;
  }
});
