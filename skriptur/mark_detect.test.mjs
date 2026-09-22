import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './mark_detect.js';
const { pickMark } = mod;

// 40 daga gagnaröð 100..139 → hæst 139, lægst 100
const HIST = Array.from({ length: 40 }, (_, i) => 100 + i);
const B = (sym, o) => ({ sym, name: sym + ' hf', price: 120, chgPct: 0, hist: HIST, dates: ['2026-09-21', '2026-09-22'], ...o });
const MK = (...stocks) => ({ updated: '2026-09-22', stocks });

test('dagshreyfing ≥ 4% ber viðskiptadag bréfsins, ekki keyrsludaginn', () => {
  const { cand } = pickMark(MK(B('SIMINN', { chgPct: 5.88, price: 10.8, dates: ['2026-09-18', '2026-09-21'] })), {}, { idag: '2026-09-22' });
  assert.equal(cand.length, 1);
  assert.equal(cand[0].tegund, 'hreyfing');
  assert.equal(cand[0].dags, '2026-09-21');
  assert.equal(cand[0].breyting, 5.88);
});

test('hreyfing föstudags fær sama dag á laugardegi og sunnudegi (sama id, ekki þrjár fréttir)', () => {
  // 19.–20.9.2026: Alvotech +11,2% (viðskipti 18.9) birtist bæði laugardag og sunnudag sem „í dag"
  const mk = MK(B('ALVO', { chgPct: 11.15, price: 718, dates: ['2026-09-17', '2026-09-18'] }));
  const lau = pickMark(mk, {}, { idag: '2026-09-19' }).cand;
  const sun = pickMark(mk, {}, { idag: '2026-09-20' }).cand;
  assert.deepEqual([lau[0].dags, sun[0].dags], ['2026-09-18', '2026-09-18']);
});

test('bréf sem hefur ekki verslast í meira en 4 daga er ekki fréttaefni', () => {
  // 30.8–15.9.2026: VÍS „lækkaði um 20% í dag" fimmtán daga í röð; síðustu viðskipti voru 17.7
  const vis = B('VIS', { chgPct: -20.21, price: 15, dates: ['2026-07-16', '2026-07-17'] });
  assert.deepEqual(pickMark(MK(vis), {}, { idag: '2026-09-15' }).cand, []);
  const fos = B('X', { chgPct: 6, dates: ['2026-09-18'] });
  assert.equal(pickMark(MK(fos), {}, { idag: '2026-09-22' }).cand.length, 1, 'föstudagur → þriðjudagur (4 dagar) er enn nothæft');
  assert.deepEqual(pickMark(MK(fos), {}, { idag: '2026-09-23' }).cand, [], '5 dagar er of gamalt');
});

test('bréf án dagsetninga eða með viðskiptadag á eftir keyrsludegi er ekki borið saman', () => {
  assert.deepEqual(pickMark(MK(B('A', { chgPct: 9, dates: undefined })), {}, { idag: '2026-09-22' }).cand, []);
  assert.deepEqual(pickMark(MK(B('A', { chgPct: 9, dates: ['2026-09-23'] })), {}, { idag: '2026-09-22' }).cand, []);
});

test('met: nýtt hámark gagnaraðar sem er hærra en síðasta skráða hámark verður frambjóðandi með viðskiptadegi', () => {
  const { cand, rec } = pickMark(MK(B('EIM', { price: 140, chgPct: 1 })), { EIM: { hi: 139, lo: 100 } }, { idag: '2026-09-22' });
  assert.deepEqual(cand.map((c) => [c.tegund, c.met, c.dags, c.dagar]), [['met', 'hæsta', '2026-09-22', 40]]);
  assert.deepEqual(rec.EIM, { hi: 140, lo: 100, d: '2026-09-22' });
});

test('met: lágmark sem er ekki lægra en síðasta skráða lágmark endurtekur sig ekki', () => {
  const r = { ARION: { hi: 200, lo: 99 } };
  assert.deepEqual(pickMark(MK(B('ARION', { price: 100, chgPct: -0.5 })), r, { idag: '2026-09-22' }).cand, []);
});

test('fyrsta keyrsla (engin met-skrá) er þögul um met en skráir gildin', () => {
  const { cand, rec } = pickMark(MK(B('EIM', { price: 140, chgPct: 1 })), null, { idag: '2026-09-22' });
  assert.deepEqual(cand, []);
  assert.deepEqual(rec, { EIM: { hi: 140, lo: 140 } });
});

test('úrelt bréf uppfærir ekki met-skrána', () => {
  const r = { VIS: { hi: 16, lo: 15.2 } };
  const { rec } = pickMark(MK(B('VIS', { price: 15, chgPct: -1, dates: ['2026-07-17'] })), r, { idag: '2026-09-22' });
  assert.deepEqual(rec, { VIS: { hi: 16, lo: 15.2 } });
});

test('frambjóðandi sem þegar var tilkynntur fyrir sama viðskiptadag tekur ekki pláss (27.–28.8.2026)', () => {
  // röð sem er degi á eftir sýnir hreyfingu gærdagsins aftur; hún mátti ekki ýta nýju meti NOVA út úr þakinu
  const solid = B('SOLID', { chgPct: 41.67, price: 0.17, dates: ['2026-08-27'] });
  const nova = B('NOVA', { price: 99, chgPct: -1, dates: ['2026-08-28'] });
  const eim = B('EIM', { chgPct: 5, dates: ['2026-08-28'] });
  const r0 = { SOLID: { d: '2026-08-27' }, NOVA: { hi: 139, lo: 100 } };
  const { cand } = pickMark(MK(solid, nova, eim), r0, { idag: '2026-08-28' });
  assert.deepEqual(cand.map((c) => c.sym), ['EIM', 'NOVA']);
});

test('met sem kviknar aftur sama viðskiptadag (lokagengi undir innandagsgengi) tekur ekki pláss (11.–12.9.2026)', () => {
  const d1 = pickMark(MK(B('ARION', { price: 99.5, chgPct: -1, dates: ['2026-09-11'] })), { ARION: { hi: 139, lo: 100 } }, { idag: '2026-09-11' });
  assert.equal(d1.cand.length, 1);
  assert.equal(d1.rec.ARION.d, '2026-09-11', 'tilkynntur viðskiptadagur geymist');
  const mk2 = MK(B('ARION', { price: 99.2, chgPct: -1.2, dates: ['2026-09-11'] }), B('BRIM', { price: 98, chgPct: -2, dates: ['2026-09-11'] }), B('X', { chgPct: 6, dates: ['2026-09-11'] }));
  const d2 = pickMark(mk2, { ...d1.rec, BRIM: { hi: 139, lo: 100 } }, { idag: '2026-09-12' });
  assert.deepEqual(d2.cand.map((c) => c.sym), ['X', 'BRIM']);
  assert.equal(d2.rec.ARION.lo, 99.2, 'verðið skráist þótt metið sé ekki tilkynnt aftur');
});

test('frambjóðandi sem féll utan þaks er ekki merktur tilkynntur', () => {
  const mk = MK(B('A', { chgPct: 9 }), B('B', { chgPct: 8 }), B('C', { chgPct: 7 }));
  const { rec } = pickMark(mk, {}, { idag: '2026-09-22' });
  assert.deepEqual([rec.A && rec.A.d, rec.B && rec.B.d, rec.C && rec.C.d], ['2026-09-22', '2026-09-22', undefined]);
});

test('þak: sjálfgefið 2 frambjóðendur, stærsta hreyfing fyrst og met vega 3', () => {
  const mk = MK(B('A', { chgPct: 4.5 }), B('B', { chgPct: -9 }), B('C', { price: 140, chgPct: 1 }), B('D', { chgPct: 2.9 }));
  const { cand } = pickMark(mk, { C: { hi: 139, lo: 100 } }, { idag: '2026-09-22' });
  assert.deepEqual(cand.map((c) => c.sym), ['B', 'A']);
});
