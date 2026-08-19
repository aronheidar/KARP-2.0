import { test } from 'node:test';
import assert from 'node:assert';
import { midgildi, hundradsmark, tsOf, veljaSamberilegar, metaUrSolusogu, bakprof, OUTLO, OUTHI, MAT } from '../src/lib/fasteignamat.mjs';

const NU = tsOf('2026-08-19');
const D = (dagarAftur) => new Date(NU - dagarAftur * 864e5).toISOString().slice(0, 10);
const sala = (o) => Object.assign({ a: 'Gata 1', d: D(30), kv: 50000, fm: 100, teg: 'Fjölbýli', herb: 3, ar: 2000, ppm: 500000 }, o);

// ── Tölfræði ──────────────────────────────────────────────────────────────────
test('midgildi: oddatala, jöfn tala, tómt', () => {
  assert.equal(midgildi([3, 1, 2]), 2);
  assert.equal(midgildi([4, 1, 3, 2]), 2.5);
  assert.equal(midgildi([]), null);
  assert.equal(midgildi(null), null);
});

test('hundradsmark: línuleg brúun milli gilda', () => {
  assert.equal(hundradsmark([10, 20, 30, 40], 0.25), 17.5);
  assert.equal(hundradsmark([10, 20, 30, 40], 0.75), 32.5);
  assert.equal(hundradsmark([7], 0.5), 7);
  assert.equal(hundradsmark([], 0.5), null);
});

// ── Val á sambærilegum ────────────────────────────────────────────────────────
test('veljaSamberilegar: sama tegund, ±30% stærð, innan útlagamarka, innan 18 mán', () => {
  const sales = [
    sala({ a: 'ok' }),
    sala({ a: 'önnur tegund', teg: 'Sérbýli' }),
    sala({ a: 'of lítil', fm: 60 }),            // 60 < 70
    sala({ a: 'of stór', fm: 140 }),            // 140 > 130
    sala({ a: 'útlagi lágur', ppm: OUTLO - 1 }),
    sala({ a: 'útlagi hár', ppm: OUTHI + 1 }),
    sala({ a: 'of gömul', d: D(600) }),          // > 560 dagar
    sala({ a: 'á mörkum', fm: 70 }),             // 70 = mörk, með
    sala({ a: 'á mörkum', fm: 130 }),
  ];
  const { comps } = veljaSamberilegar(sales, { teg: 'Fjölbýli', fm: 100 }, { now: NU });
  assert.deepEqual(comps.map((s) => s.a).sort(), ['ok', 'á mörkum', 'á mörkum'].sort());
});

test('veljaSamberilegar: byggingarárs-sía beitt AÐEINS þegar ≥min standa eftir', () => {
  const gamlar = Array.from({ length: 6 }, (_, i) => sala({ a: 'g' + i, ar: 1960 }));
  const nyjar5 = Array.from({ length: 5 }, (_, i) => sala({ a: 'n' + i, ar: 2018 }));
  // 5 nálægar + 6 fjarlægar: sían skildi aðeins 5 eftir → EKKI beitt, allar 11 notaðar
  let r = veljaSamberilegar([...gamlar, ...nyjar5], { teg: 'Fjölbýli', fm: 100, ar: 2020 }, { now: NU });
  assert.equal(r.arSia, false);
  assert.equal(r.comps.length, 11);
  // 6 nálægar → beitt
  r = veljaSamberilegar([...gamlar, ...nyjar5, sala({ a: 'n5', ar: 2015 })], { teg: 'Fjölbýli', fm: 100, ar: 2020 }, { now: NU });
  assert.equal(r.arSia, true);
  assert.equal(r.comps.length, 6);
  assert.ok(r.comps.every((s) => Math.abs(s.ar - 2020) <= 15));
});

test('veljaSamberilegar: án byggingarárs á eigninni er sían ekki beitt', () => {
  const sales = Array.from({ length: 8 }, (_, i) => sala({ a: 's' + i, ar: 1950 + i * 10 }));
  const r = veljaSamberilegar(sales, { teg: 'Fjölbýli', fm: 100 }, { now: NU });
  assert.equal(r.arSia, false);
  assert.equal(r.comps.length, 8);
});

test('veljaSamberilegar: sölur án byggingarárs detta út þegar sían er virk', () => {
  const med = Array.from({ length: 6 }, (_, i) => sala({ a: 'm' + i, ar: 2010 }));
  const an = Array.from({ length: 4 }, (_, i) => sala({ a: 'a' + i, ar: null }));
  const r = veljaSamberilegar([...med, ...an], { teg: 'Fjölbýli', fm: 100, ar: 2012 }, { now: NU });
  assert.equal(r.arSia, true);
  assert.equal(r.comps.length, 6);
});

test('veljaSamberilegar: `strangt` útilokar sölur á `now` og síðar, `sleppa` útilokar eina sölu', () => {
  const t = sala({ a: 'sjálf', d: D(10) });
  const sales = [t, sala({ a: 'fyrr', d: D(20) }), sala({ a: 'sama dag', d: D(10) }), sala({ a: 'síðar', d: D(5) })];
  const r = veljaSamberilegar(sales, { teg: 'Fjölbýli', fm: 100 }, { now: tsOf(t.d), strangt: true, sleppa: t });
  assert.deepEqual(r.comps.map((s) => s.a), ['fyrr']);
});

// ── Matið ─────────────────────────────────────────────────────────────────────
test('metaUrSolusogu: miðgildi + fjórðungsbil, null undir min', () => {
  const sales = [500000, 520000, 480000, 510000, 490000, 530000].map((ppm, i) => sala({ a: 's' + i, ppm }));
  const r = metaUrSolusogu(sales, { teg: 'Fjölbýli', fm: 100 }, { now: NU });
  assert.equal(r.n, 6);
  assert.equal(r.m, 505000);
  assert.ok(r.lo < r.m && r.m < r.hi);
  assert.equal(metaUrSolusogu(sales.slice(0, 5), { teg: 'Fjölbýli', fm: 100 }, { now: NU }), null);
});

test('metaUrSolusogu: tóm/ógild sölusaga → null, ekki villa', () => {
  assert.equal(metaUrSolusogu(null, { teg: 'Fjölbýli', fm: 100 }), null);
  assert.equal(metaUrSolusogu([], { teg: 'Fjölbýli', fm: 100 }), null);
  assert.equal(metaUrSolusogu([null, undefined, {}], { teg: 'Fjölbýli', fm: 100 }), null);
});

// ── Bakprófið ─────────────────────────────────────────────────────────────────
test('bakprof: einsleitur markaður → 0% skekkja', () => {
  const sales = Array.from({ length: 60 }, (_, i) => sala({ a: 's' + i, d: D(i * 8), ppm: 500000 }));
  const r = bakprof(sales, { now: NU });
  assert.ok(r, 'nóg af sölum til að mæla');
  assert.equal(r.midgildi, 0);
  assert.equal(r.innan10, 1);
});

test('bakprof: notar AÐEINS sölur á undan hverri sölu (ekkert kíkt fram í tímann)', () => {
  // 30 sölur á 400.000 í glugganum + 30 sölur á 800.000 dagsettar EFTIR `now` (framtíð).
  // Rétt bakpróf: hver 400.000-sala sér aðeins 400.000-sölur á undan sér → 0% skekkja, og
  // framtíðarsölurnar eru hvorki prófaðar né notaðar sem sambærilegar.
  // Vél sem kíkti fram í tímann sæi 800.000-sölurnar (þær eru innan 560 daga í tíma) og miðgildið
  // hlypi upp — skekkjan yrði langt yfir 0.
  const i_glugga = Array.from({ length: 30 }, (_, i) => sala({ a: 'g' + i, d: D(1 + i * 5), ppm: 400000 }));
  const framtid = Array.from({ length: 30 }, (_, i) => sala({ a: 'f' + i, d: D(-(1 + i)), ppm: 800000 }));
  const r = bakprof([...i_glugga, ...framtid], { now: NU, manudir: 6 });
  assert.ok(r, 'nóg af sölum');
  assert.equal(r.midgildi, 0);
  assert.equal(r.innan10, 1);
  assert.ok(r.profad <= 30, 'framtíðarsölur eru ekki prófaðar');
});

test('bakprof: 18 mán gluggi LAGAR SIG HÆGT að verðhoppi — og segir það (engin fegrun)', () => {
  // Markaður hoppar úr 400.000 í 800.000 fyrir 60 dögum. Sölurnar eftir hoppið eru metnar út frá
  // miðgildi sem 18 mán af gömlum sölum ráða → kerfisbundið vanmat. Bakprófið á að sýna ÞAÐ,
  // ekki 0%. Þetta er eiginleiki aðferðarinnar sem notandinn á rétt á að sjá.
  const gamlar = Array.from({ length: 40 }, (_, i) => sala({ a: 'g' + i, d: D(61 + i * 10), ppm: 400000 }));
  const nyjar = Array.from({ length: 25 }, (_, i) => sala({ a: 'n' + i, d: D(1 + i * 2), ppm: 800000 }));
  const r = bakprof([...gamlar, ...nyjar], { now: NU, manudir: 6 });
  assert.ok(r);
  assert.ok(r.midgildi > 0.3, 'skekkjan sést: ' + r.midgildi);
});

test('bakprof: of fáar metanlegar sölur → null (enga tölu úr þunnu úrtaki)', () => {
  const sales = Array.from({ length: 12 }, (_, i) => sala({ a: 's' + i, d: D(i * 10) }));
  assert.equal(bakprof(sales, { now: NU }), null);
  assert.ok(bakprof(sales, { now: NU, minN: 3 }), 'lægri þröskuldur gefur niðurstöðu');
});

test('bakprof: tómt → null', () => {
  assert.equal(bakprof([], { now: NU }), null);
  assert.equal(bakprof(null, { now: NU }), null);
});

test('MAT: stillingarnar sem matið og bakprófið deila', () => {
  assert.deepEqual(MAT, { dagar: 560, staerd: 0.3, arBil: 15, min: 6 });
});
