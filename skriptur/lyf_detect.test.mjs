import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './lyf_detect.js';
const { pickLyf } = mod;

// lyf.json: {updated, lyf: [{slug, name, shortage: bool, essential: bool}]}
const L = (slug, essential = true) => ({ slug, name: slug, shortage: true, essential });
const LYF = (updated, ...lyf) => ({ updated, lyf });
const G = (dags, sidast) => ({ dags, n: Object.keys(sidast).length, sidast });

test('nýr skortur á nauðsynlegu lyfi gegn grunni frá deginum áður verður frétt; upphafsdagur er dagsetning skrárinnar', () => {
  const { cand, grunnur, fyrst } = pickLyf(LYF('2026-09-22', L('a'), L('b')), G('2026-09-21', { a: '2026-09-21' }), { a: '2026-09-01' });
  assert.deepEqual(cand.map((x) => x.slug), ['b']);
  assert.deepEqual(fyrst, { a: '2026-09-01', b: '2026-09-22' });
  assert.deepEqual(grunnur, { dags: '2026-09-22', n: 2, sidast: { a: '2026-09-22', b: '2026-09-22' } });
});

test('nýr skortur á lyfi sem er ekki nauðsynlegt er ekki frétt en er skráður', () => {
  const { cand, fyrst } = pickLyf(LYF('2026-09-22', L('a'), L('c', false)), G('2026-09-21', { a: '2026-09-21' }), { a: 'ohekkt' });
  assert.deepEqual(cand, []);
  assert.equal(fyrst.c, '2026-09-22');
});

test('skortur sem hvarf í nokkra daga er ekki nýr þegar hann kemur aftur og heldur upphafsdegi sínum', () => {
  // 15.8.2026: myfenax birtist sem „nýr" skortur eftir að hafa vantað í skrána einn dag
  const d14 = pickLyf(LYF('2026-08-14', L('a')), G('2026-08-13', { a: '2026-08-13', myfenax: '2026-08-13' }), { a: 'ohekkt', myfenax: '2026-08-02' });
  assert.equal(d14.fyrst.myfenax, '2026-08-02', 'upphafsdagur geymist meðan lyfið er horfið');
  const d15 = pickLyf(LYF('2026-08-15', L('a'), L('myfenax')), d14.grunnur, d14.fyrst);
  assert.deepEqual(d15.cand, []);
  assert.equal(d15.fyrst.myfenax, '2026-08-02');
});

test('skortur sem hefur verið horfinn í meira en 30 daga er nýr þegar hann kemur aftur', () => {
  const { cand, grunnur } = pickLyf(LYF('2026-09-22', L('a'), L('x')), G('2026-09-21', { a: '2026-09-21', x: '2026-08-21' }), {});
  assert.deepEqual(cand.map((x) => x.slug), ['x']);
  assert.deepEqual(Object.keys(grunnur.sidast).sort(), ['a', 'x']);
  const eldri = pickLyf(LYF('2026-09-22', L('a')), G('2026-09-21', { a: '2026-09-21', y: '2026-08-22' }), {}).grunnur;
  assert.deepEqual(Object.keys(eldri.sidast), ['a'], 'færsla eldri en 30 daga gleymist');
});

test('tóm eða hálf skortsmynd er gagnabilun: engar fréttir, grunnur og upphafsdagar óbreytt', () => {
  const g0 = G('2026-09-21', { a: '2026-09-21', b: '2026-09-21', c: '2026-09-21', d: '2026-09-21' });
  const f0 = { a: '2026-09-01', b: 'ohekkt', c: 'ohekkt', d: 'ohekkt' };
  const tom = pickLyf(LYF('2026-09-22'), g0, f0);
  assert.deepEqual([tom.cand, tom.grunnur, tom.fyrst], [[], g0, f0]);
  assert.match(tom.vidvorun, /gagnabilun/);
  const halft = pickLyf(LYF('2026-09-22', L('a')), g0, f0);
  assert.deepEqual([halft.cand, halft.grunnur, halft.fyrst], [[], g0, f0]);
  assert.match(halft.vidvorun, /gagnabilun/);
  // næsti heili dagur: gamall skortur birtist ekki aftur og nýr fær upphafsdag
  const heil = pickLyf(LYF('2026-09-23', L('a'), L('b'), L('c'), L('d'), L('e')), tom.grunnur, tom.fyrst);
  assert.deepEqual(heil.cand.map((x) => x.slug), ['e']);
  assert.equal(heil.fyrst.e, '2026-09-23');
});

test('fækkun sem varir lengur en 3 daga er tekin gild í þögn (vörnin festist ekki)', () => {
  const g0 = G('2026-09-18', { a: '2026-09-18', b: '2026-09-18', c: '2026-09-18', d: '2026-09-18' });
  const r = pickLyf(LYF('2026-09-22', L('a')), g0, { a: 'ohekkt', b: 'ohekkt' });
  assert.deepEqual([r.cand, r.vidvorun, r.grunnur.dags, r.grunnur.n], [[], null, '2026-09-22', 1]);
  assert.deepEqual(r.fyrst, { a: 'ohekkt', b: 'ohekkt' }, 'horfinn skortur heldur upphafsdegi innan 30 daga');
});

test('grunnur eldri en 3 daga (skrá stóð óbreytt) er ekki borinn saman og nýr skortur fær óþekktan upphafsdag', () => {
  // lyf.json stóð frá 7.7 til 25.7.2026; 26.7 birtist skortur sem hófst einhvern tíma á bilinu
  const { cand, fyrst } = pickLyf(LYF('2026-07-25', L('a'), L('cinacalcet')), G('2026-07-07', { a: '2026-07-07' }), { a: '2026-07-01' });
  assert.deepEqual(cand, []);
  assert.deepEqual(fyrst, { a: '2026-07-01', cinacalcet: 'ohekkt' });
  assert.equal(pickLyf(LYF('2026-09-22', L('a'), L('b')), G('2026-09-19', { a: '2026-09-19' }), {}).cand.length, 1, '3 dagar eru enn nothæfir');
});

test('grunnur á gamla sniðinu (fylki) og fyrsta keyrsla eru þögul; upphaf óþekkt nema það sé þegar skráð', () => {
  const gamall = pickLyf(LYF('2026-09-22', L('a'), L('b')), ['a'], { a: '2026-09-10' });
  assert.deepEqual(gamall.cand, []);
  assert.deepEqual(gamall.fyrst, { a: '2026-09-10', b: 'ohekkt' });
  assert.deepEqual(gamall.grunnur, { dags: '2026-09-22', n: 2, sidast: { a: '2026-09-22', b: '2026-09-22' } });
  const fyrsta = pickLyf(LYF('2026-09-22', L('a')), undefined, undefined);
  assert.deepEqual([fyrsta.cand, fyrsta.fyrst, fyrsta.vidvorun], [[], { a: 'ohekkt' }, null]);
});

test('enginn skortur, hvorki nú né síðast, er ekki gagnabilun', () => {
  const r = pickLyf(LYF('2026-09-22'), G('2026-09-21', {}), {});
  assert.deepEqual([r.cand, r.fyrst, r.vidvorun], [[], {}, null]);
});

test('grunnur á eftir skránni eða skrá án dagsetningar: engar fréttir', () => {
  assert.deepEqual(pickLyf(LYF('2026-09-22', L('a'), L('b')), G('2026-09-24', { a: '2026-09-24' }), {}).cand, []);
  const g0 = G('2026-09-21', { a: '2026-09-21' });
  const r = pickLyf(LYF(undefined, L('a'), L('b')), g0, { a: 'ohekkt' });
  assert.deepEqual([r.cand, r.grunnur, r.fyrst], [[], g0, { a: 'ohekkt' }]);
});

test('þak: sjálfgefið 2 nýir skortir', () => {
  const { cand } = pickLyf(LYF('2026-09-22', L('a'), L('b'), L('c')), G('2026-09-21', {}), {});
  assert.equal(cand.length, 2);
});
