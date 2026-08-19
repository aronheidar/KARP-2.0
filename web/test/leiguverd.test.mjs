// Próf fyrir leiguverd.mjs — leiguverðmat úr framreiknuðum þinglýstum leigusamningum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEIGA, veljaLeigu, metaLeigu, leidrettPpm, avoxtun, bakprofLeiga, nothaef } from '../src/lib/leiguverd.mjs';

// n samningar í svæði z með leigu/m² ppm (framreiknað vi), stærð 60..100
const mk = (z, n, ppm, d0, extra) => Array.from({ length: n }, (_, i) => Object.assign({ d: d0 || `2023-${String(1 + (i % 12)).padStart(2, '0')}-10`, st: 60 + (i % 5) * 10, teg: 'Fjölbýli', z }, extra || {}, { vi: Math.round(ppm * (60 + (i % 5) * 10) * (1 + ((i % 7) - 3) * 0.01)), verd: 1 }));

test('nothaef: síar stærð/verð/dags', () => {
  assert.ok(nothaef({ d: '2023-01-01', st: 60, vi: 200000 }));
  assert.ok(!nothaef({ d: '2023-01-01', st: 10, vi: 200000 }));
  assert.ok(!nothaef({ d: '', st: 60, vi: 200000 }));
  assert.ok(!nothaef({ d: '2023-01-01', st: 60, vi: 0 }));
});

test('veljaLeigu: svæði fyrst (±30% stærð), fellur á allt pn-safnið ef <min; strangt sleppir d≥now og sleppa', () => {
  const C = [...mk(11, 10, 4000), ...mk(12, 10, 3000)];
  const a = veljaLeigu(C, { fm: 80, zone: 11 });
  assert.equal(a.stig, 'svaedi'); assert.ok(a.comps.every((c) => c.z === 11 && c.st >= 56 && c.st <= 104));
  const b = veljaLeigu(C, { fm: 80, zone: 99 });       // ekkert í svæði 99 → pn
  assert.equal(b.stig, 'pn'); assert.equal(b.comps.length, 20);
  const c0 = C[0];
  const s = veljaLeigu(C, { fm: 80, zone: 11 }, { now: new Date('2023-06-01').getTime(), strangt: true, sleppa: c0 });
  assert.ok(s.comps.every((c) => c !== c0 && c.d < '2023-06-01'));
  assert.equal(veljaLeigu(mk(11, 3, 4000), { fm: 80, zone: 11 }).stig, 'pn');   // 3 < min → pn (sama safn)
});

test('leidrettPpm: stærðarleiðrétting með teygni; engin leiðrétting þegar teygni=0', () => {
  const c = { st: 100, vi: 300000 };   // 3000 kr/m²
  assert.ok(Math.abs(leidrettPpm(c, 100, -0.52) - 3000) < 1e-9);
  assert.ok(leidrettPpm(c, 50, -0.52) > 3000);        // minni eign → hærra m²-verð
  assert.ok(Math.abs(leidrettPpm(c, 50, -0.52) / 3000 - Math.pow(2, 0.52)) < 1e-9);
  assert.ok(Math.abs(leidrettPpm(c, 50, 0) - 3000) < 1e-9);
});

test('metaLeigu: miðgildi × m², fjórðungsbil, n, stig; null undir min', () => {
  const C = mk(11, 30, 4000);
  const r = metaLeigu(C, { fm: 80, zone: 11 });
  assert.ok(r && r.n >= 6 && r.stig === 'svaedi' && r.staerdLeidr);
  assert.ok(r.m > 3800 && r.m < 4300, 'm=' + r.m);
  assert.ok(Math.abs(r.leiga - r.m * 80) < 1e-6 && r.leigaLo <= r.leiga && r.leiga <= r.leigaHi);
  assert.equal(metaLeigu(mk(11, 4, 4000), { fm: 80, zone: 11 }), null);
  const r0 = metaLeigu(C, { fm: 80, zone: 11 }, { teygni: 0 });
  assert.ok(!r0.staerdLeidr);
});

test('avoxtun: brúttó = ársleiga/verð; pr = verð/ársleiga; null án talna', () => {
  const a = avoxtun(200000, 60e6);
  assert.equal(a.arleg, 2400000); assert.ok(Math.abs(a.brutto - 0.04) < 1e-12); assert.ok(Math.abs(a.pr - 25) < 1e-9);
  assert.equal(avoxtun(0, 60e6), null); assert.equal(avoxtun(200000, 0), null);
});

test('bakprofLeiga: strangt — metur nýjustu samninga úr eldri; null undir minBak', () => {
  const C = [...mk(11, 40, 4000, null), ...mk(11, 30, 4000, '2024-03-10')];
  const b = bakprofLeiga(C, { manudir: 6, minBak: 10 });
  assert.ok(b && b.n >= 10 && b.midgildi >= 0 && b.innan20 >= 0 && b.innan20 <= 1);
  assert.equal(bakprofLeiga(mk(11, 5, 4000), { minBak: 20 }), null);
  // leki-próf: verðstökk í nýjustu samningum má ekki sjást í matinu á þeim sjálfum
  const C2 = [...mk(11, 40, 4000, null), ...mk(11, 30, 8000, '2024-03-10')];
  const b2 = bakprofLeiga(C2, { manudir: 1, minBak: 10 });
  assert.ok(b2.midgildi > 0.3, 'skekkja ' + b2.midgildi);   // nýju 8000-samningarnir metnir úr gömlu 4000 → ~50%
});

test('LEIGA: stillingar', () => { assert.deepEqual(LEIGA, { staerd: 0.3, teygni: -0.52, min: 6, minBak: 20 }); });
