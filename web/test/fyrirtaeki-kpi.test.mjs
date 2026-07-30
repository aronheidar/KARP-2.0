import { test } from 'node:test';
import assert from 'node:assert';
import { fsThou, fsMkr, fsPct1, fsRat, fsKpiCalc, fsMapArs, fsHealthScore, fsLhGrade, FS_LH_SKALI } from '../src/lib/fyrirtaeki-kpi.mjs';

// ── Snið ──────────────────────────────────────────────────────────────────────
test('fsThou: þúsundapunktar að íslenskum sið', () => {
  assert.equal(fsThou(1234567), '1.234.567');
  assert.equal(fsThou(999), '999');
  assert.equal(fsThou(-4200), '4.200');        // formerkið kemur frá fsMkr, ekki fsThou
});

test('fsMkr: null → þankastrik, neikvætt fær mínus (U+2212) og myntin er stillanleg', () => {
  assert.equal(fsMkr(null), '–');
  assert.equal(fsMkr(1500), '1.500 m.kr');
  assert.equal(fsMkr(-1500), '−1.500 m.kr');
  assert.equal(fsMkr(90, 'm. EUR'), '90 m. EUR');
});

test('fsPct1: eitt aukastafs-prósent með kommu', () => {
  assert.equal(fsPct1(null), '–');
  assert.equal(fsPct1(0.1234), '12,3%');
  assert.equal(fsPct1(-0.055), '−5,5%');
  assert.equal(fsPct1(0), '0,0%');             // núll er gild mæling, ekki „vantar“
});

test('fsRat: tveir aukastafir með kommu', () => {
  assert.equal(fsRat(null), '–');
  assert.equal(fsRat(1.456), '1,46');
  assert.equal(fsRat(0), '0,00');
});

// ── Kennitölur ────────────────────────────────────────────────────────────────
const ar2024 = {
  tekjur: 1000, kostnadarverd: 600, rekstrargjold: 200, afskriftir: 50, fjarmagn: 20, hagnadur: 100,
  eignir: 2000, eigidfe: 800, skuldir: 1200, veltufjarmunir: 500, birgdir: 150, skammtimaskuldir: 400,
};

test('fsKpiCalc: rekstrarkeðjan framlegð → EBITDA → EBIT', () => {
  const k = fsKpiCalc(ar2024);
  assert.equal(k._ebitda, 200);                // 1000 − 600 − 200
  assert.equal(k._ebit, 150);                  // − 50 afskriftir
  assert.equal(k.framlegd, 0.4);
  assert.equal(k.rekstrarhlutf, 0.15);
  assert.equal(k.hagnhlutf, 0.1);
});

test('fsKpiCalc: efnahags-hlutföll', () => {
  const k = fsKpiCalc(ar2024);
  assert.equal(k.roe, 0.125);                  // 100/800
  assert.equal(k.roa, 0.05);                   // 100/2000
  assert.equal(k.veltufjar, 1.25);             // 500/400
  assert.equal(k.lausafjar, 0.875);            // (500−150)/400 — birgðir dregnar frá
  assert.equal(k.eiginfjarhlutf, 0.4);
  assert.equal(k.de, 1.5);
  assert.equal(k.vaxtathekja, 7.5);            // EBIT/|fjármagnsgjöld|
  assert.equal(k.eignavelta, 0.5);
});

test('fsKpiCalc: nefnari 0 eða vantar → null (aldrei Infinity eða NaN)', () => {
  const k = fsKpiCalc({ tekjur: 0, hagnadur: 50, eigidfe: 0, eignir: null, skammtimaskuldir: 0 });
  for (const key of ['framlegd', 'rekstrarhlutf', 'hagnhlutf', 'roe', 'roa', 'veltufjar', 'eiginfjarhlutf', 'de', 'eignavelta']) {
    assert.equal(k[key], null, key + ' á að vera null');
  }
});

test('fsKpiCalc: vöxtur aðeins þegar fyrra ár er til og ekki núll', () => {
  assert.equal(fsKpiCalc(ar2024, { tekjur: 800, hagnadur: 50 }).tekjuvoxtur, 0.25);
  assert.equal(fsKpiCalc(ar2024, { tekjur: 800, hagnadur: 50 }).hagnvoxtur, 1);
  assert.equal(fsKpiCalc(ar2024).tekjuvoxtur, null);
  assert.equal(fsKpiCalc(ar2024, { tekjur: 0 }).tekjuvoxtur, null);
});

// ── Kortlagning ársreiknings ──────────────────────────────────────────────────
const ars = {
  ar: {
    2023: { kvardi: 1000, rekstur: { sala: 800000, hagnadur: 40000 }, efnahagur: { eignir: 2000000, eigid_fe: 700000 } },
    2024: { kvardi: 1000, rekstur: { sala: 1000000, adrar_tekjur: 50000, kostnadarverd: -600000, laun: -150000, annar_rekstur: -50000, afskriftir: -30000, fjarmagnsgjold: -20000, hagnadur: 100000 },
      efnahagur: { eignir: 2500000, eigid_fe: 900000, skuldir: 1600000, birgdir: 100000, vidskiptakrofur: 200000, handbaert: 150000, skammtimaskuldir: 300000 },
      starfsmenn: 42, kpi: { framlegd: 0.4, ROE: 0.11, eiginfjarhlutfall: 0.36 } },
  },
};

test('fsMapArs: engin gögn → null', () => {
  assert.equal(fsMapArs(null), null);
  assert.equal(fsMapArs({}), null);
  assert.equal(fsMapArs({ ar: {} }), null);
});

test('fsMapArs: raðar nýjasta ári fyrst og kvarðar í milljónir', () => {
  const rows = fsMapArs(ars);
  assert.deepEqual(rows.map((r) => r.ar), ['2024', '2023']);
  assert.equal(rows[0].tekjur, 1050);          // (1.000.000 + 50.000) × 1000 / 1e6
  assert.equal(rows[0].eignir, 2500);
  assert.equal(rows[0].starfsmenn, 42);
  assert.equal(rows[0]._cur, 'm.kr');
});

test('fsMapArs: gjöld verða jákvæð tala óháð formerki í PDF', () => {
  const r = fsMapArs(ars)[0];
  assert.equal(r.kostnadarverd, 600);
  assert.equal(r.rekstrargjold, 200);          // laun + annar rekstur
  assert.equal(r.afskriftir, 30);
  assert.equal(r.fjarmagn, 20);
});

test('fsMapArs: erlend mynt merkist í _cur', () => {
  const r = fsMapArs({ ar: { 2024: { kvardi: 1, mynt: 'EUR', rekstur: { sala: 5e6 } } } })[0];
  assert.equal(r._cur, 'm. EUR');
});

test('fsMapArs: vöxtur reiknast úr fjölærs-gögnum, aðeins frá jákvæðum grunni', () => {
  const rows = fsMapArs(ars);
  assert.ok(Math.abs(rows[0]._kpi.tekjuvoxtur - 0.3125) < 1e-9);   // 1050/800
  assert.ok(Math.abs(rows[0]._kpi.hagnvoxtur - 1.5) < 1e-9);       // 100/40
  assert.equal(rows[1]._kpi, undefined);                            // elsta ár: enginn kpi-blokk í gögnunum
});

test('fsMapArs: neikvæð fyrri-árs tekja gefur engan vöxt (bankaþáttun skilar rusli)', () => {
  const rows = fsMapArs({ ar: {
    2023: { kvardi: 1, rekstur: { sala: -5e6, hagnadur: -1e6 } },
    2024: { kvardi: 1, rekstur: { sala: 10e6, hagnadur: 2e6 }, kpi: { ROE: 0.1 } },
  } });
  assert.equal(rows[0]._kpi.tekjuvoxtur, null);
  assert.equal(rows[0]._kpi.hagnvoxtur, null);
});

// ── Heilsueinkunn ─────────────────────────────────────────────────────────────
test('fsLhGrade: mörk skalans', () => {
  assert.equal(fsLhGrade(null), '–');
  assert.equal(fsLhGrade(80), 'A');
  assert.equal(fsLhGrade(79), 'B');
  assert.equal(fsLhGrade(65), 'B');
  assert.equal(fsLhGrade(64), 'C');
  assert.equal(fsLhGrade(50), 'C');
  assert.equal(fsLhGrade(49), 'D');
  assert.equal(fsLhGrade(35), 'D');
  assert.equal(fsLhGrade(34), 'E');
  assert.equal(fsLhGrade(0), 'E');
});

test('fsLhGrade: mörkin í kóðanum passa við skalann sem notandinn les', () => {
  for (const [s, g] of [[80, 'A'], [65, 'B'], [50, 'C'], [35, 'D'], [0, 'E']]) {
    assert.ok(FS_LH_SKALI.includes(g + ' ' + s + (s === 80 ? '–100' : '')) || FS_LH_SKALI.includes(g + ' ' + s), 'skalatexti nefnir ' + g + ' ' + s);
    assert.equal(fsLhGrade(s), g);
  }
});

test('fsHealthScore: sterkt félag fær háa einkunn, veikt lága', () => {
  const sterkt = fsHealthScore({ hagnhlutf: 0.12, roe: 0.2, eiginfjarhlutf: 0.55, de: 0.5, veltufjar: 1.8, tekjuvoxtur: 0.15 });
  assert.equal(sterkt.score, 100);
  assert.equal(sterkt.grade, 'A');
  const veikt = fsHealthScore({ hagnhlutf: -0.1, roe: -0.3, eiginfjarhlutf: 0.02, de: 6, veltufjar: 0.4, tekjuvoxtur: -0.2 });
  assert.equal(veikt.score, 0);
  assert.equal(veikt.grade, 'E');
});

test('fsHealthScore: stoð sem vantar dettur út og vogir normaliserast', () => {
  const adeinsEfnahagur = fsHealthScore({ eiginfjarhlutf: 0.55, de: 0.5, veltufjar: 1.8 });
  assert.equal(adeinsEfnahagur.pillars.ard, null);
  assert.equal(adeinsEfnahagur.pillars.voxt, null);
  assert.equal(adeinsEfnahagur.score, 100);    // 0,3+0,2 af vogum → normaliserað upp, ekki refsað
});

test('fsHealthScore: engin gögn → engin einkunn', () => {
  const t = fsHealthScore({});
  assert.equal(t.score, null);
  assert.equal(t.grade, '–');
  assert.equal(t.color, '#6b7688');
});

test('fsHealthScore: einkunn og litur haldast í hendur', () => {
  assert.equal(fsHealthScore({ hagnhlutf: 0.12, roe: 0.2, eiginfjarhlutf: 0.55, de: 0.5, veltufjar: 1.8, tekjuvoxtur: 0.15 }).color, '#42d086');
  assert.equal(fsHealthScore({ hagnhlutf: -0.1, roe: -0.3, eiginfjarhlutf: 0.02, de: 6, veltufjar: 0.4, tekjuvoxtur: -0.2 }).color, '#ef6a6a');
});

test('fsHealthScore: D/E sem vantar refsar ekki — stoðin hvílir þá á eiginfjárhlutfallinu einu', () => {
  const vantar = fsHealthScore({ eiginfjarhlutf: 0.3, veltufjar: 1.2 });
  const haattSkuldsett = fsHealthScore({ eiginfjarhlutf: 0.3, de: 3, veltufjar: 1.2 });
  assert.ok(vantar.score > haattSkuldsett.score, 'félag án skuldatölu má ekki fá sömu einkunn og félag með D/E 3');
  assert.equal(vantar.pillars.skuld, fsHealthScore({ eiginfjarhlutf: 0.3 }).pillars.skuld);
});

test('fsHealthScore: án efnahagsreiknings er ENGIN einkunn gefin (rekstur einn dugar ekki)', () => {
  // Raundæmi: Síldarvinnslan 2025 — þáttarinn náði rekstrarreikningi en engum efnahagsreikningi.
  const adeinsRekstur = fsHealthScore({ hagnhlutf: 0.1687, tekjuvoxtur: 0.164 });
  assert.equal(adeinsRekstur.score, null);
  assert.equal(adeinsRekstur.grade, '–');
  assert.equal(adeinsRekstur.pillars.ard, 100);          // stoðirnar reiknast áfram fyrir UI-ið
  assert.equal(adeinsRekstur.pillars.skuld, null);
  // ein efnahagsvísbending nægir til að einkunn fáist
  assert.ok(fsHealthScore({ hagnhlutf: 0.1687, tekjuvoxtur: 0.164, veltufjar: 1.2 }).score != null);
  assert.ok(fsHealthScore({ hagnhlutf: 0.1687, tekjuvoxtur: 0.164, eiginfjarhlutf: 0.4 }).score != null);
});

test('fsHealthScore: neikvætt eigið fé fær VERSTA skuldastig (áður reiknaðist það sem best)', () => {
  const gjaldthrota = fsHealthScore({ eiginfjarhlutf: -0.2, de: -3, veltufjar: 0.5 });
  assert.equal(gjaldthrota.pillars.skuld, 0);
  assert.equal(gjaldthrota.grade, 'E');
});
