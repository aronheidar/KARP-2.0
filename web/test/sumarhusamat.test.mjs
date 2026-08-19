// Próf fyrir sumarhusamat.mjs — matsvél sumarhúsa (svæðis-miðgildi, tímaleiðrétt, hiti/eignarlóð, bakpróf).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SUM, arsVisitala, visitalaAr, leidrettPpm, veljaSumarhus, metaSumarhus, bakprofSumarhus, svaedaYfirlit, landshluti, nothaef } from '../src/lib/sumarhusamat.mjs';

const NOW = new Date('2026-03-01T00:00:00').getTime();
// N sölur í svæði hv á ári ar með m²-verði ppm (+ smá dreifing), stærð m2.
function solur(hv, ar, n, ppm, extra) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const m2 = 40 + (i % 5) * 10;
    const p = ppm * (1 + ((i % 7) - 3) * 0.02);
    out.push(Object.assign({ d: `${ar}-${String(1 + (i % 12)).padStart(2, '0')}-10`, hv, kv: Math.round(p * m2 / 1000), m2, ar: 2000, lod: 3000, eign: 0, vatn: 0, hiti: 0, raf: 1, ppm: p }, extra || {}));
  }
  return out;
}

test('landshluti: rót þúsundsins, 999 fyrir höfuðborgarsvæðið', () => {
  assert.equal(landshluti(3200), 3000);
  assert.equal(landshluti(8315), 8000);
  assert.equal(landshluti(999), 999);
  assert.equal(landshluti(2000), 2000);
});

test('nothaef: síar útlaga og óraunhæfar stærðir', () => {
  assert.ok(nothaef({ d: '2025-01-01', ppm: 400000, m2: 60 }));
  assert.ok(!nothaef({ d: '2025-01-01', ppm: 10000, m2: 60 }));      // of lágt m²-verð (hlutasala/lóð)
  assert.ok(!nothaef({ d: '2025-01-01', ppm: 400000, m2: 10 }));     // geymsla
  assert.ok(!nothaef({ d: '', ppm: 400000, m2: 60 }));
});

test('arsVisitala: ár með ≥visitalaMin sölur fá miðgildi; þunn ár erfa fyrra ár, fyrsta þunna árið erfir næsta', () => {
  const S = [...solur(3200, 2022, 25, 300000), ...solur(3200, 2023, 25, 360000), ...solur(3200, 2024, 3, 999999), ...solur(3200, 2021, 2, 500000)];
  const idx = arsVisitala(S);
  assert.ok(Math.abs(idx[2022] - 300000) < 1);
  assert.ok(Math.abs(idx[2023] - 360000) < 1);
  assert.equal(idx[2024], idx[2023]);   // 3 sölur → erfir 2023, EKKI 999999
  assert.equal(idx[2021], idx[2022]);   // fyrsta þunna árið erfir næsta fulla
  assert.equal(visitalaAr(S, idx), 2023);   // nýjasta FULLA árið, ekki 2024
});

test('leidrettPpm: tímaleiðrétting með vísitöluhlutfalli; hiti/eignarlóð aðeins þegar eign gefur upp OG er ólík sölunni', () => {
  const idx = { 2022: 300000, 2024: 600000 };
  const s = { d: '2022-05-01', ppm: 400000, hiti: 0, eign: 0 };
  assert.ok(Math.abs(leidrettPpm(s, null, idx, 2024, SUM) - 800000) < 1);                        // ×2
  assert.ok(Math.abs(leidrettPpm(s, { hiti: null, eign: undefined }, idx, 2024, SUM) - 800000) < 1);   // óþekkt → engin leiðrétting
  const medHita = leidrettPpm(s, { hiti: true }, idx, 2024, SUM);
  assert.ok(Math.abs(medHita / 800000 - Math.exp(SUM.hiti)) < 1e-9);                              // eign m/hita vs sala án → upp
  const sHiti = { d: '2022-05-01', ppm: 400000, hiti: 1, eign: 1 };
  assert.ok(Math.abs(leidrettPpm(sHiti, { hiti: true, eign: true }, idx, 2024, SUM) - 800000) < 1); // sama staða → engin leiðrétting
  const anEign = leidrettPpm(sHiti, { eign: false }, idx, 2024, SUM);
  assert.ok(Math.abs(anEign / 800000 - Math.exp(-SUM.eign)) < 1e-9);                              // eign á leigulóð vs sala á eignarlóð → niður
});

test('veljaSumarhus: svæði → landshluti → land eftir því sem grunnur þynnist; strangt sleppir sölum á/eftir now og sleppa-sölunni', () => {
  const S = [...solur(3200, 2025, 8, 500000), ...solur(3500, 2025, 8, 700000), ...solur(8300, 2025, 8, 900000)];
  assert.equal(veljaSumarhus(S, { hv: 3200 }, { now: NOW }).stig, 'svaedi');
  const lh = veljaSumarhus(S, { hv: 3110 }, { now: NOW });            // ekkert í 3110 → Vesturland (3xxx) = 16 sölur
  assert.equal(lh.stig, 'landshluti'); assert.equal(lh.comps.length, 16);
  const land = veljaSumarhus(S, { hv: 6010 }, { now: NOW });          // ekkert á Norðurlandi → landið allt
  assert.equal(land.stig, 'land'); assert.equal(land.comps.length, 24);
  const t = S[0];
  const str = veljaSumarhus(S, { hv: 3200 }, { now: new Date(t.d).getTime(), strangt: true, sleppa: t });
  assert.ok(str.comps.every((s) => s !== t && new Date(s.d).getTime() < new Date(t.d).getTime()));
  // gamlar sölur utan gluggans teljast ekki
  assert.equal(veljaSumarhus(solur(3200, 2015, 20, 500000), { hv: 3200 }, { now: NOW }).stig, 'land');
});

test('metaSumarhus: miðgildi × m² með fjórðungsbili; null ef færri en min; leiðréttir hita/eign', () => {
  const S = [...solur(3200, 2024, 30, 500000), ...solur(3200, 2025, 30, 500000)];
  const r = metaSumarhus(S, { hv: 3200, m2: 60 }, { now: NOW });
  assert.ok(r && r.n === 60 && r.stig === 'svaedi');
  assert.ok(Math.abs(r.m - 500000) < 1 && Math.abs(r.verd - 30000000) < 1);
  assert.ok(r.lo <= r.m && r.m <= r.hi && r.verdLo <= r.verd && r.verd <= r.verdHi);
  assert.deepEqual(r.leidr, { hiti: false, eign: false });
  assert.equal(r.comps[0].d >= r.comps[r.comps.length - 1].d, true);   // nýjustu fyrst
  const rh = metaSumarhus(S, { hv: 3200, m2: 60, hiti: true }, { now: NOW });
  assert.ok(Math.abs(rh.m / r.m - Math.exp(SUM.hiti)) < 1e-9 && rh.leidr.hiti);
  assert.equal(metaSumarhus(solur(3200, 2025, 4, 500000), { hv: 3200, m2: 60 }, { now: NOW }), null);   // 4 < min=5
});

test('metaSumarhus: eldri sölur eru færðar til verðlags nýjasta fulla ársins', () => {
  const S = [...solur(3200, 2023, 30, 300000), ...solur(8300, 2025, 30, 600000), ...solur(8300, 2023, 30, 300000)];
  // vísitala: 2023 = 300k, 2025 = 600k → 2023-sölur í 3200 tvöfaldast
  const r = metaSumarhus(S, { hv: 3200, m2: 50 }, { now: NOW });
  assert.equal(r.tilAr, 2025);
  assert.ok(Math.abs(r.m - 600000) < 1, 'm=' + r.m);
});

test('bakprofSumarhus: notar AÐEINS sölur á undan hverri sölu — verðstökk framtíðar lekur ekki aftur í tímann', () => {
  // 2023–2024: 400k · frá 2025: 800k (stökk). Sala 2025-01 á að vera metin ~400k úr fortíðinni → skekkja ~50%.
  const S = [...solur(3200, 2023, 30, 400000), ...solur(3200, 2024, 30, 400000), ...solur(3200, 2025, 40, 800000)];
  const b = bakprofSumarhus(S, { now: NOW, manudir: 14, minN: 10 });
  assert.ok(b && b.n >= 10);
  const fyrsta = S.filter((s) => s.d.startsWith('2025-01'))[0];
  const r = metaSumarhus(S.filter((s) => new Date(s.d) < new Date(fyrsta.d)), { hv: 3200, m2: fyrsta.m2 }, { now: new Date(fyrsta.d).getTime(), strangt: true });
  assert.ok(Math.abs(r.m - 400000) / 400000 < 0.1, 'fortíðarmat ' + r.m);   // ~400k, ekki 800k
  assert.ok(b.midgildi > 0.05);   // aðferðin lagar sig hægt að stökki — ekki „fullkomin" með kíki
  assert.equal(bakprofSumarhus(solur(3200, 2025, 5, 500000), { now: NOW, minN: 30 }), null);   // of fáar til að birta tölu
});

test('svaedaYfirlit: fjöldi, tímaleiðrétt miðgildi (null undir min), rót-flagg landshluta', () => {
  const svaedi = { 3000: { heiti: 'Vesturland', studull: 1, br: 0.02, m2: 500 }, 3200: { heiti: 'Skorradalur', studull: 0.95, br: 0.03, m2: 619 }, 4300: { heiti: 'Hornstrandir' } };
  const S = [...solur(3200, 2025, 30, 600000), ...solur(3200, 2019, 10, 200000), ...solur(4300, 2025, 3, 300000)];
  const y = svaedaYfirlit(S, svaedi, { now: NOW });
  const sk = y.find((z) => z.nr === 3200), hs = y.find((z) => z.nr === 4300), ve = y.find((z) => z.nr === 3000);
  assert.equal(sk.n, 40); assert.equal(sk.n3, 30); assert.equal(sk.nWin, 30);
  assert.ok(Math.abs(sk.ppm - 600000) < 1 && sk.m2 > 0 && sk.kv > 0);
  assert.equal(sk.m2hms, 619); assert.equal(sk.rot, false);
  assert.equal(hs.ppm, null); assert.equal(hs.n, 3);       // 3 < min → ekkert miðgildi birt
  assert.equal(ve.rot, true); assert.equal(ve.n, 0);
});
