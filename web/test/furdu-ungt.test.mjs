// web/test/furdu-ungt.test.mjs
// Furðuhagfræði unga fólksins. ⚠ Öll stærðfræðin er hér, aldrei í .astro (sjá karp-lanshaefismat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NIKOTIN_THREP, gjaldPerGramm, gjaldADos, sagartonn, hillutalning, aThrepamorkum, rettYfirThrepi,
  koffinKrona, kaffibolli, nettoAnSkatts, skattleysismork, minutur, midgildi, tolfManudir,
  midgildiSolu, islattarIUtborgun, skilagjaldHlutfall, oskilad,
} from '../src/lib/furdu-ungt.mjs';

const naer = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('þrepin eru orðrétt úr 10. gr. d laga 96/1995', () => {
  assert.deepEqual(NIKOTIN_THREP.map((t) => t.krG), [8.30, 12.45, 15.55, 20.75]);
  for (const [mg, kr] of [[1, 8.30], [8, 8.30], [8.1, 12.45], [12, 12.45], [12.1, 15.55], [16, 15.55], [16.1, 20.75], [20, 20.75]]) {
    assert.equal(gjaldPerGramm(mg), kr, `${mg} mg/g`);
  }
});

test('utan þrepa er ekkert gjald skilgreint', () => {
  assert.equal(gjaldPerGramm(0.5), null);
  assert.equal(gjaldPerGramm(20.1), null);
  assert.equal(gjaldPerGramm(NaN), null);
});

test('frá 8,0 í 8,1 mg/g hækkar gjaldið á gramm um 50%', () => {
  naer(gjaldPerGramm(8.1) / gjaldPerGramm(8), 1.5);
});

test('gjald á 14 g dós: 290,5 kr á 16,5 mg/g en 217,7 á 16,0', () => {
  naer(gjaldADos(16.5, 14), 290.5);
  naer(gjaldADos(16, 14), 217.7);
  assert.equal(gjaldADos(16.5, 0), null);
});

test('sagartönnin: kr á hvert mg, 0,1 skref', () => {
  const t = sagartonn({ fra: 4, til: 20 });
  assert.equal(t.length, 161);
  assert.deepEqual(t[0], { mgG: 4, krMg: 8.30 / 4 });
  naer(t.find((q) => q.mgG === 8.1).krMg, 12.45 / 8.1);
  naer(sagartonn()[0].krMg, 8.30);
});

const PUDAR = [
  ...Array.from({ length: 9 }, (_, i) => ({ nafn: 'A' + i, mgG: 16.5, dosG: 14, verd: 1245 })),
  { nafn: 'B1', mgG: 16, dosG: 14, verd: 1100 },
  { nafn: 'B2', mgG: 16, dosG: 14, verd: 1100 },
  { nafn: 'C', mgG: 12.5, dosG: 10, verd: 900 },
  { nafn: 'D', mgG: 8, dosG: 10, verd: 800 },
  { nafn: 'E', mgG: 20, dosG: 10, verd: 800 },
];

test('hillutalning: algengast fyrst', () => {
  assert.deepEqual(hillutalning(PUDAR).slice(0, 2), [{ mgG: 16.5, n: 9 }, { mgG: 16, n: 2 }]);
});

test('á þrepamörkum 8, 12 og 16 (20 er lagalegt hámark, ekki þrep)', () => {
  assert.equal(aThrepamorkum(PUDAR), 3);
});

test('rétt yfir þrepi: 73 kr meira á dós fyrir 3% meira nikótín', () => {
  const [h] = rettYfirThrepi(PUDAR);
  assert.equal(h.mgG, 16.5); assert.equal(h.n, 9); assert.equal(h.thak, 16); assert.equal(h.verd, 1245);
  naer(h.aukagjald, 72.8);
  naer(h.aukaNikotin, 0.03125);
  naer(h.hlutfallAfVerdi, 290.5 / 1245);
  assert.ok(!rettYfirThrepi(PUDAR).some((g) => g.mgG === 16), 'á þakinu sjálfu er ekki yfir þrepi');
});

test('koffínkrónan: kr á hver 100 mg', () => {
  naer(koffinKrona(304, 105), 289.5238095, 1e-6);
  naer(koffinKrona(233, 80), 291.25);
  assert.equal(koffinKrona(100, 0), null);
});

test('kaffibolli úr 500 g pakka á 1.298 kr, 8 g í bolla', () => {
  naer(kaffibolli({ pakkiVerd: 1298, pakkiG: 500, gBolli: 8 }), 20.768);
});

test('16 ára í hlutastarfi: enginn tekjuskattur, 4% lífeyrir', () => {
  naer(nettoAnSkatts(2410.52, 0.04), 2314.0992);
  assert.equal(Math.round(skattleysismork({ personuafslattur: 72492, skattur1: 0.3149, lifeyrir: 0.04 })), 239798);
});

test('mínútur af vinnu', () => {
  assert.equal(minutur(300, 1800), 10);
  assert.ok(Math.abs(minutur(304, 2314.0992) - 7.88) < 0.01);
  assert.equal(minutur(304, 0), null);
});

test('miðgildi', () => {
  assert.equal(midgildi([3, 1, 2]), 2);
  assert.equal(midgildi([4, 1, 3, 2]), 2.5);
  assert.equal(midgildi([]), null);
});

test('tólf HEILIR mánuðir á undan líðandi mánuði', () => {
  assert.deepEqual(tolfManudir('2026-09'), { fra: '2025-09', til: '2026-08' });
  assert.deepEqual(tolfManudir('2026-01'), { fra: '2025-01', til: '2025-12' });
});

test('miðgildi sölu: aðeins réttur flokkur og gluggi, lv í þús. kr', () => {
  const rows = [
    { teg: 'Fjölbýli', ld: '2025-08', lv: 100 }, { teg: 'Fjölbýli', ld: '2025-09', lv: 200 },
    { teg: 'Fjölbýli', ld: '2026-08', lv: 400 }, { teg: 'Fjölbýli', ld: '2026-09', lv: 900 },
    { teg: 'Einbýli', ld: '2026-01', lv: 999 }, { teg: 'Fjölbýli', ld: '2026-02', lv: 0 },
  ];
  assert.deepEqual(midgildiSolu(rows, { teg: 'Fjölbýli', nu: '2026-09' }), { fra: '2025-09', til: '2026-08', n: 2, midgildi: 300000 });
});

test('íslattar í útborgun', () => {
  const r = islattarIUtborgun({ verdIbudar: 54500000, hlutfall: 0.10, islatteVerd: 1100 });
  naer(r.utborgun, 5450000);
  naer(r.fjoldi, 4954.545454, 1e-5);
  naer(r.arMedEinumADag, 4954.545454 / 365, 1e-6);
});

test('dósin', () => {
  naer(skilagjaldHlutfall(23, 304), 23 / 304);
  const o = oskilad({ aMarkad: 240e6, skilad: 211e6, gjald: 20 });
  assert.equal(o.n, 29e6); assert.equal(o.kr, 580e6); naer(o.skilahlutfall, 211 / 240);
});
