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
  assert.deepEqual(MAT, { dagar: 560, staerd: 0.3, arBil: 15, min: 6, teygni: -0.31 });
});

// ── Stærðarleiðrétting ────────────────────────────────────────────────────────
test('metaUrSolusogu: sambærileg er sköluð að stærð eignarinnar (teygni −0,31)', () => {
  // Sex sambærilegar, allar 130 m² á 500.000 kr/m² — eignin er 100 m². Stærri eignir hafa lægra m²-verð,
  // svo 100 m² eign á að meta HÆRRA á fermetrann: 500.000 × (130/100)^0,31 ≈ 542.600.
  const sales = Array.from({ length: 6 }, (_, i) => sala({ a: 's' + i, fm: 130, ppm: 500000 }));
  const r = metaUrSolusogu(sales, { teg: 'Fjölbýli', fm: 100 }, { now: NU });
  assert.equal(r.staerdLeidr, true);
  assert.ok(Math.abs(r.m - 500000 * Math.pow(1.3, 0.31)) < 1, 'm: ' + r.m);
  // og öfugt: minni sambærilegar (70 m²) → lækkað að 100 m²
  const r2 = metaUrSolusogu(Array.from({ length: 6 }, (_, i) => sala({ a: 'l' + i, fm: 70, ppm: 500000 })), { teg: 'Fjölbýli', fm: 100 }, { now: NU });
  assert.ok(r2.m < 500000, 'minni sambærilegar → lægra: ' + r2.m);
});

test('metaUrSolusogu: teygni 0 slekkur á leiðréttingunni (gamla hegðunin)', () => {
  const sales = Array.from({ length: 6 }, (_, i) => sala({ a: 's' + i, fm: 130, ppm: 500000 }));
  const r = metaUrSolusogu(sales, { teg: 'Fjölbýli', fm: 100 }, { now: NU, teygni: 0 });
  assert.equal(r.m, 500000);
  assert.equal(r.staerdLeidr, false);
});

test('metaUrSolusogu: sama stærð → engin breyting þótt teygni sé á', () => {
  const sales = Array.from({ length: 6 }, (_, i) => sala({ a: 's' + i, fm: 100, ppm: 500000 }));
  assert.equal(metaUrSolusogu(sales, { teg: 'Fjölbýli', fm: 100 }, { now: NU }).m, 500000);
});

test('MAT: teygnin er hluti af deildu stillingunum', () => {
  assert.equal(MAT.teygni, -0.31);
});

// ── Fasteignamats-leiðin ──
import { veljaMatHlutfall, metaUrFasteignamati, matDomur, tegLykill, MATHL } from '../src/lib/fasteignamat.mjs';
const HL = {
  byZone: { 2040: { g: { a: [1.011, 0.972, 1.057, 208], f: [1.011, 0.972, 1.056, 152], s: [1.01, 0.974, 1.066, 56] }, n: { a: [1.004, 0.965, 1.054, 208], f: [1.001, 0.964, 1.047, 152], s: [1.007, 0.97, 1.063, 56] } },
    7: { g: { a: [1.2, 1.1, 1.3, 12], f: [1.25, 1.2, 1.3, 4], s: null }, n: { a: null, f: null, s: null } } },
  byPn: { 260: { g: { a: [1.02, 0.98, 1.06, 300], f: [1.02, 0.98, 1.06, 220], s: [1.03, 0.99, 1.07, 80] }, n: { a: [1.01, 0.97, 1.05, 300], f: null, s: null } } },
  land: { g: { a: [1.037, 0.978, 1.108, 8862], f: [1.04, 0.98, 1.1, 6000], s: [1.03, 0.97, 1.1, 2800] }, n: { a: [1.027, 0.971, 1.094, 8863], f: [1.03, 0.97, 1.09, 6000], s: [1.02, 0.96, 1.09, 2800] } },
};
test('tegLykill: fjölbýli→f, sérbýlis-tegundir→s, annað→null', () => {
  assert.equal(tegLykill('Fjölbýli'), 'f'); assert.equal(tegLykill('Einbýli'), 's'); assert.equal(tegLykill('Raðhús'), 's'); assert.equal(tegLykill('Atvinnuhúsnæði'), null);
});
test('veljaMatHlutfall: svæði+tegund fyrst; þunn tegund (n<10) → svæði allt; ekkert svæði → pn → land; argerd n', () => {
  const a = veljaMatHlutfall(HL, { zone: 2040, pn: '260', teg: 'Fjölbýli' });
  assert.deepEqual([a.stig, a.teg, a.h[0]], ['svaedi', true, 1.011]);
  const b = veljaMatHlutfall(HL, { zone: 7, pn: '260', teg: 'Fjölbýli' });          // f n=4 <10 → svæði allt (n=12)
  assert.deepEqual([b.stig, b.teg, b.h[0]], ['svaedi', false, 1.2]);
  const c = veljaMatHlutfall(HL, { zone: 999, pn: '260', teg: 'Einbýli' });         // ekkert svæði → pn+s
  assert.deepEqual([c.stig, c.teg, c.h[0]], ['pn', true, 1.03]);
  const d = veljaMatHlutfall(HL, { zone: null, pn: '999', teg: 'Einbýli' });        // ekkert pn → land+s
  assert.deepEqual([d.stig, d.teg, d.h[0]], ['land', true, 1.03]);
  const e = veljaMatHlutfall(HL, { zone: 7, pn: '260', teg: 'Fjölbýli', argerd: 'n' });   // svæði 7 hefur ekkert n → pn n.a (f null)
  assert.deepEqual([e.stig, e.teg, e.h[0]], ['pn', false, 1.01]);
  assert.equal(veljaMatHlutfall(null, { zone: 2040 }), null);
  assert.equal(veljaMatHlutfall({ byZone: {}, byPn: {}, land: null }, { zone: 2040, pn: '260', teg: 'Fjölbýli' }), null);
});
test('metaUrFasteignamati: mat × miðgildi, bil q25..q75, null án mats/hlutfalls', () => {
  const r = metaUrFasteignamati(47000, [1.011, 0.972, 1.057, 208]);
  assert.ok(Math.abs(r.m - 47517) < 1 && Math.abs(r.lo - 45684) < 1 && Math.abs(r.hi - 49679) < 1 && r.n === 208);
  assert.equal(metaUrFasteignamati(0, [1, 1, 1, 5]), null); assert.equal(metaUrFasteignamati(47000, null), null);
});
test('matDomur: frávik = (mat×hlutfall)/est − 1 með þröskuldum ±10%/±20%; matVaent = est/hlutfall', () => {
  const h = [1.05, 1.0, 1.1, 100];
  const a = matDomur(100, 90, h);      // est 100, mat 90 → est2 94,5 → −5,5% → í takt
  assert.equal(a.domur, 'i_takt'); assert.ok(Math.abs(a.fravik + 0.055) < 1e-9); assert.ok(Math.abs(a.matVaent - 100 / 1.05) < 1e-9);
  assert.equal(matDomur(100, 110, h).domur, 'hatt');        // 115,5 → +15,5%
  assert.equal(matDomur(100, 120, h).domur, 'mjog_hatt');   // 126 → +26%
  assert.equal(matDomur(100, 82, h).domur, 'lagt');         // 86,1 → −13,9%
  assert.equal(matDomur(100, 70, h).domur, 'mjog_lagt');    // 73,5 → −26,5%
  assert.equal(matDomur(0, 90, h), null); assert.equal(matDomur(100, 0, h), null);
  assert.deepEqual(Object.keys(MATHL).sort(), ['hatt', 'min', 'mjog']);
});
