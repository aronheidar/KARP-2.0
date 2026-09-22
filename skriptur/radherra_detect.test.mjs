import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './radherra_detect.js';
const { pickRadherra } = mod;

// cabinet.json: [{id, nafn, emb: [...], flok, flokur, sidan: 'dd.mm.yyyy'}]
const R = (id, nafn, emb, sidan = '08.09.2026', flok = 'S') => ({ id, nafn, emb, flok, flokur: 'Samfylkingin', sidan });
const G = (...rr) => ({ radherrar: Object.fromEntries(rr.map((r) => [String(r.id), { nafn: r.nafn, emb: r.emb, flokkur: r.flok }])) });
const LOGI = R(1128, 'Logi Einarsson', ['menningar-, nýsköpunar- og háskólaráðherra', 'ráðherra norrænna samstarfsmála']);
const THKG = R(632, 'Þorgerður Katrín Gunnarsdóttir', ['utanríkisráðherra'], '09.09.2025', 'C');

test('ráðherra sem skiptir um embætti verður frétt með fyrra embætti', () => {
  const nu = [R(1332, 'Inga Sæland', ['mennta- og barnamálaráðherra'], '11.01.2026', 'F')];
  const { cand } = pickRadherra(nu, G(R(1332, 'Inga Sæland', ['félags- og húsnæðismálaráðherra'], '09.09.2025', 'F')), { idag: '2026-01-12' });
  assert.deepEqual(cand, [{ nafn: 'Inga Sæland', embaetti: 'mennta- og barnamálaráðherra', flokkur: 'F', adur: 'félags- og húsnæðismálaráðherra' }]);
});

test('embætti í nýrri röð eru ekki frétt (8.9.2026: Logi „tók við" embætti sem hann gegndi)', () => {
  const nu = [{ ...LOGI, emb: [LOGI.emb[1], LOGI.emb[0]] }];
  assert.deepEqual(pickRadherra(nu, G(LOGI), { idag: '2026-09-08' }).cand, []);
});

test('tóm ráðherraskrá (22.8.2026) skrifar ekki yfir grunninn og næsta heila skrá er þögul', () => {
  const g0 = G(LOGI, THKG);
  const tom = pickRadherra([], g0, { idag: '2026-08-22' });
  assert.deepEqual(tom, { cand: [], grunnur: g0 });
  assert.deepEqual(pickRadherra([LOGI, THKG], tom.grunnur, { idag: '2026-08-23' }).cand, []);
});

test('nýr ráðherra verður frétt ef seta hans hófst á síðustu 14 dögum', () => {
  const ny = R(1600, 'Nýr Ráðherra', ['innviðaráðherra'], '15.09.2026', 'F');
  const { cand } = pickRadherra([LOGI, ny], G(LOGI), { idag: '2026-09-22' });
  assert.deepEqual(cand, [{ nafn: 'Nýr Ráðherra', embaetti: 'innviðaráðherra', flokkur: 'F', adur: null }]);
});

test('ráðherra sem vantar í grunninn en hefur setið lengi er ekki nýr ráðherra', () => {
  // 23.8.2026: Þorgerður Katrín „tók við sem utanríkisráðherra" (seta frá 9.9.2025) eftir að grunnurinn tæmdist
  assert.deepEqual(pickRadherra([LOGI, THKG], G(LOGI), { idag: '2026-08-23' }).cand, []);
  assert.deepEqual(pickRadherra([LOGI, { ...THKG, sidan: '' }], G(LOGI), { idag: '2026-08-23' }).cand, [], 'ódagsett seta');
  assert.deepEqual(pickRadherra([LOGI, { ...THKG, sidan: '30.09.2026' }], G(LOGI), { idag: '2026-09-22' }).cand, [], 'seta á eftir keyrsludegi');
});

test('viðbótarembætti er frétt; afsal embættis er það ekki', () => {
  const einn = R(1128, 'Logi Einarsson', ['menningar-, nýsköpunar- og háskólaráðherra']);
  assert.deepEqual(pickRadherra([LOGI], G(einn), { idag: '2026-09-22' }).cand, [{ nafn: 'Logi Einarsson', embaetti: 'ráðherra norrænna samstarfsmála', flokkur: 'S', adur: null }]);
  assert.deepEqual(pickRadherra([einn], G(LOGI), { idag: '2026-09-22' }).cand, []);
});

test('grunnur á gamla sniðinu ({id: {emb: strengur}}) er ekki borinn saman: þögul endurstilling', () => {
  const gamall = { 1128: { nafn: 'Logi Einarsson', emb: 'ráðherra norrænna samstarfsmála', flokkur: 'S' } };
  const { cand, grunnur } = pickRadherra([LOGI], gamall, { idag: '2026-09-22' });
  assert.deepEqual(cand, []);
  assert.deepEqual(Object.keys(grunnur.radherrar), ['1128']);
  assert.deepEqual(grunnur.radherrar['1128'].emb, LOGI.emb);
});

test('ráðherrar sem vantaði í hálfa skrá eru ekki nýir þegar þeir koma aftur, líka fyrstu 14 daga þings', () => {
  // seta allra hefst við þingsetningu (8.9.2026), svo dagsetningarvörnin ein dugar ekki fyrstu 14 dagana
  const heil = [LOGI, { ...THKG, sidan: '08.09.2026' }, R(1276, 'Hanna Katrín Friðriksson', ['atvinnuvegaráðherra'], '08.09.2026', 'C')];
  const d14 = pickRadherra(heil, null, { idag: '2026-09-14' }).grunnur;
  const d15 = pickRadherra([LOGI], { ...d14 }, { idag: '2026-09-15' });
  assert.deepEqual(d15.cand, []);
  assert.deepEqual(pickRadherra(heil, d15.grunnur, { idag: '2026-09-16' }).cand, []);
});

test('ráðherra sem hefur verið horfinn úr skránni í meira en 30 daga gleymist', () => {
  const g0 = pickRadherra([LOGI, THKG], null, { idag: '2026-08-01' }).grunnur;
  const g1 = pickRadherra([LOGI], g0, { idag: '2026-08-15' }).grunnur;
  assert.ok(g1.radherrar['632'], 'horfinn í 14 daga: geymdur');
  assert.equal(pickRadherra([LOGI], g1, { idag: '2026-09-01' }).grunnur.radherrar['632'], undefined);
});

test('nýr ráðherra með tvö embætti fær bæði, og nýtt embætti í stað annars ber fyrra embættið', () => {
  const ny = R(1600, 'Nýr Ráðherra', ['innviðaráðherra', 'ráðherra norrænna samstarfsmála'], '20.09.2026', 'F');
  assert.equal(pickRadherra([LOGI, ny], G(LOGI), { idag: '2026-09-22' }).cand[0].embaetti, 'innviðaráðherra og ráðherra norrænna samstarfsmála');
  const skipt = [{ ...LOGI, emb: ['utanríkisráðherra', 'ráðherra norrænna samstarfsmála'] }];
  assert.deepEqual(pickRadherra(skipt, G(LOGI), { idag: '2026-09-22' }).cand,
    [{ nafn: 'Logi Einarsson', embaetti: 'utanríkisráðherra', flokkur: 'S', adur: 'menningar-, nýsköpunar- og háskólaráðherra' }]);
});
