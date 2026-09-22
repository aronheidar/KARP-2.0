import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mod from './radherra_detect.js';
const { pickRadherra } = mod;
const HER = path.dirname(fileURLToPath(import.meta.url));

// cabinet.json: [{id, nafn, emb: [...], flok, flokur, sidan: 'dd.mm.yyyy'}] — FYLKI, ber enga dagsetningu.
// `sott` (sóknardagur) kemur úr cabinet_meta.json, systkinaskjali sem build_cabinet.js skrifar í sömu keyrslu.
const R = (id, nafn, emb, sidan = '08.09.2026', flok = 'S') => ({ id, nafn, emb, flok, flokur: 'Samfylkingin', sidan });
const G = (dags, ...rr) => ({ dags, radherrar: Object.fromEntries(rr.map((r) => [String(r.id), { nafn: r.nafn, emb: r.emb, flokkur: r.flok, sidast: dags }])) });
const O = (idag, sott) => ({ idag, sott: sott || idag });
const LOGI = R(1128, 'Logi Einarsson', ['menningar-, nýsköpunar- og háskólaráðherra', 'ráðherra norrænna samstarfsmála']);
const THKG = R(632, 'Þorgerður Katrín Gunnarsdóttir', ['utanríkisráðherra'], '09.09.2025', 'C');

// ── hegðun sem var þegar vörðuð (22.9.2026) ─────────────────────────────────
test('ráðherra sem skiptir um embætti verður frétt með fyrra embætti', () => {
  const nu = [R(1332, 'Inga Sæland', ['mennta- og barnamálaráðherra'], '11.01.2026', 'F')];
  const { cand } = pickRadherra(nu, G('2026-01-11', R(1332, 'Inga Sæland', ['félags- og húsnæðismálaráðherra'], '09.09.2025', 'F')), O('2026-01-12'));
  assert.deepEqual(cand, [{ nafn: 'Inga Sæland', embaetti: 'mennta- og barnamálaráðherra', flokkur: 'F', adur: 'félags- og húsnæðismálaráðherra' }]);
});

test('embætti í nýrri röð eru ekki frétt (8.9.2026: Logi „tók við" embætti sem hann gegndi)', () => {
  const nu = [{ ...LOGI, emb: [LOGI.emb[1], LOGI.emb[0]] }];
  assert.deepEqual(pickRadherra(nu, G('2026-09-07', LOGI), O('2026-09-08')).cand, []);
});

test('tóm ráðherraskrá (22.8.2026) skrifar ekki yfir grunninn og næsta heila skrá er þögul', () => {
  const g0 = G('2026-08-21', LOGI, THKG);
  const tom = pickRadherra([], g0, O('2026-08-22'));
  assert.deepEqual(tom, { cand: [], grunnur: g0 });
  assert.deepEqual(pickRadherra([LOGI, THKG], tom.grunnur, O('2026-08-23')).cand, []);
});

test('nýr ráðherra verður frétt ef seta hans hófst á síðustu 14 dögum', () => {
  const ny = R(1600, 'Nýr Ráðherra', ['innviðaráðherra'], '15.09.2026', 'F');
  const { cand } = pickRadherra([LOGI, ny], G('2026-09-21', LOGI), O('2026-09-22'));
  assert.deepEqual(cand, [{ nafn: 'Nýr Ráðherra', embaetti: 'innviðaráðherra', flokkur: 'F', adur: null }]);
});

test('ráðherra sem vantar í grunninn en hefur setið lengi er ekki nýr ráðherra', () => {
  // 23.8.2026: Þorgerður Katrín „tók við sem utanríkisráðherra" (seta frá 9.9.2025) eftir að grunnurinn tæmdist
  assert.deepEqual(pickRadherra([LOGI, THKG], G('2026-08-22', LOGI), O('2026-08-23')).cand, []);
  assert.deepEqual(pickRadherra([LOGI, { ...THKG, sidan: '' }], G('2026-08-22', LOGI), O('2026-08-23')).cand, [], 'ódagsett seta');
  assert.deepEqual(pickRadherra([LOGI, { ...THKG, sidan: '30.09.2026' }], G('2026-09-21', LOGI), O('2026-09-22')).cand, [], 'seta á eftir keyrsludegi');
});

test('viðbótarembætti er frétt; afsal embættis er það ekki', () => {
  const einn = R(1128, 'Logi Einarsson', ['menningar-, nýsköpunar- og háskólaráðherra']);
  assert.deepEqual(pickRadherra([LOGI], G('2026-09-21', einn), O('2026-09-22')).cand, [{ nafn: 'Logi Einarsson', embaetti: 'ráðherra norrænna samstarfsmála', flokkur: 'S', adur: null }]);
  assert.deepEqual(pickRadherra([einn], G('2026-09-21', LOGI), O('2026-09-22')).cand, []);
});

test('grunnur á gamla sniðinu ({id: {emb: strengur}}) er ekki borinn saman: þögul endurstilling', () => {
  const gamall = { 1128: { nafn: 'Logi Einarsson', emb: 'ráðherra norrænna samstarfsmála', flokkur: 'S' } };
  const { cand, grunnur } = pickRadherra([LOGI], gamall, O('2026-09-22'));
  assert.deepEqual(cand, []);
  assert.deepEqual(Object.keys(grunnur.radherrar), ['1128']);
  assert.deepEqual(grunnur.radherrar['1128'].emb, LOGI.emb);
});

test('ráðherrar sem vantaði í hálfa skrá eru ekki nýir þegar þeir koma aftur, líka fyrstu 14 daga þings', () => {
  // seta allra hefst við þingsetningu (8.9.2026), svo dagsetningarvörnin ein dugar ekki fyrstu 14 dagana
  const heil = [LOGI, { ...THKG, sidan: '08.09.2026' }, R(1276, 'Hanna Katrín Friðriksson', ['atvinnuvegaráðherra'], '08.09.2026', 'C')];
  const d14 = pickRadherra(heil, null, O('2026-09-14')).grunnur;
  const d15 = pickRadherra([LOGI], { ...d14 }, O('2026-09-15'));
  assert.deepEqual(d15.cand, []);
  assert.deepEqual(pickRadherra(heil, d15.grunnur, O('2026-09-16')).cand, []);
});

test('ráðherra sem hefur verið horfinn úr skránni í meira en 30 daga gleymist', () => {
  const g0 = pickRadherra([LOGI, THKG], null, O('2026-08-01')).grunnur;
  const g1 = pickRadherra([LOGI], g0, O('2026-08-15')).grunnur;
  assert.ok(g1.radherrar['632'], 'horfinn í 14 daga: geymdur');
  assert.equal(pickRadherra([LOGI], g1, O('2026-09-01')).grunnur.radherrar['632'], undefined);
});

test('nýr ráðherra með tvö embætti fær bæði, og nýtt embætti í stað annars ber fyrra embættið', () => {
  const ny = R(1600, 'Nýr Ráðherra', ['innviðaráðherra', 'ráðherra norrænna samstarfsmála'], '20.09.2026', 'F');
  assert.equal(pickRadherra([LOGI, ny], G('2026-09-21', LOGI), O('2026-09-22')).cand[0].embaetti, 'innviðaráðherra og ráðherra norrænna samstarfsmála');
  const skipt = [{ ...LOGI, emb: ['utanríkisráðherra', 'ráðherra norrænna samstarfsmála'] }];
  assert.deepEqual(pickRadherra(skipt, G('2026-09-21', LOGI), O('2026-09-22')).cand,
    [{ nafn: 'Logi Einarsson', embaetti: 'utanríkisráðherra', flokkur: 'S', adur: 'menningar-, nýsköpunar- og háskólaráðherra' }]);
});

// ── NÝTT: dagsettur grunnur ─────────────────────────────────────────────────
test('⭐ grunnur eldri en 3 daga er ekki borinn saman — embættabreyting sitjandi ráðherra spannaði annars gatið', () => {
  // build_cabinet.js heldur fyrri skrá þegar Alþingi svarar 429 (writeJsonUnlessEmpty). Standi skráin í tvær vikur
  // og lifni síðan með uppstokkun, var mengjamunur sitjandi ráðherra birtur skilyrðislaust sem frétt dagsins.
  const skipt = [{ ...LOGI, emb: ['utanríkisráðherra'] }];
  assert.equal(pickRadherra(skipt, G('2026-09-19', LOGI), O('2026-09-22')).cand.length, 1, '3 dagar eru enn nothæfir');
  const gamall = pickRadherra(skipt, G('2026-09-18', LOGI), O('2026-09-22'));
  assert.deepEqual(gamall.cand, [], '4 dagar: þögul endurstilling');
  assert.deepEqual(gamall.grunnur.radherrar['1128'].emb, ['utanríkisráðherra'], 'grunnurinn uppfærist samt');
  assert.equal(gamall.grunnur.dags, '2026-09-22');
});

test('grunnur dagsettur Á EFTIR skránni (skrá færð aftur) er ekki borinn saman', () => {
  const skipt = [{ ...LOGI, emb: ['utanríkisráðherra'] }];
  assert.deepEqual(pickRadherra(skipt, G('2026-09-24', LOGI), O('2026-09-22')).cand, []);
});

test('sóknardagur sem vantar eða er ógildur: engin frétt, en grunnurinn dagsettur þegar hann fæst', () => {
  const skipt = [{ ...LOGI, emb: ['utanríkisráðherra'] }];
  for (const sott of [undefined, null, '', 'ógilt', '22.09.2026']) {
    const r = pickRadherra(skipt, G('2026-09-21', LOGI), { idag: '2026-09-22', sott });
    assert.deepEqual(r.cand, [], String(sott));
    assert.equal(r.grunnur.dags, null, 'ódagsettur grunnur svo næsta keyrsla beri sig ekki saman við hann');
  }
  // …og undanfarandi ódagsettur grunnur er ekki borinn saman heldur.
  assert.deepEqual(pickRadherra(skipt, { dags: null, radherrar: G('2026-09-21', LOGI).radherrar }, O('2026-09-22')).cand, []);
});

// ── NÝTT: aldrei flóð ───────────────────────────────────────────────────────
test('⭐ fleiri en 3 „nýir" ráðherrar í einni keyrslu = endurstilling, ekki fréttir (þingsetning 8.9.2026)', () => {
  // 8.9.2026 endurstillti Alþingi `sidan` ALLRA ráðherra á þingsetningardaginn. Hefði grunnurinn verið gleymdur
  // (>30 daga stopp) hefðu öll 11 ráðuneytin litið út fyrir að vera ný samdægurs.
  const raduneyti = ['forsætis', 'utanríkis', 'fjármála', 'atvinnuvega', 'innviða', 'heilbrigðis', 'mennta', 'dóms', 'umhverfis', 'félags', 'menningar'];
  const allir = raduneyti.map((r, i) => R(1600 + i, `Ráðherra ${i}`, [`${r}ráðherra`], '08.09.2026', 'S'));
  const r = pickRadherra(allir, G('2026-09-07'), O('2026-09-08'));
  assert.deepEqual(r.cand, [], '11 í einu er endurstilling');
  assert.equal(Object.keys(r.grunnur.radherrar).length, 11, 'grunnurinn er samt fylltur');
  // Þrír í einu er trúverðug uppstokkun og er birt.
  const thrir = pickRadherra(allir.slice(0, 3), G('2026-09-07'), O('2026-09-08'));
  assert.equal(thrir.cand.length, 3);
});

test('þakið nær líka yfir embættabreytingar sitjandi ráðherra', () => {
  const fyrir = [1, 2, 3, 4].map((i) => R(1600 + i, `Ráðherra ${i}`, [`gamalt${i}`], '09.09.2025', 'S'));
  const eftir = fyrir.map((r) => ({ ...r, emb: [`nytt${r.id}`] }));
  assert.deepEqual(pickRadherra(eftir, G('2026-09-21', ...fyrir), O('2026-09-22')).cand, [], '4 í einu er endurstilling');
  assert.equal(pickRadherra(eftir.slice(0, 3), G('2026-09-21', ...fyrir), O('2026-09-22')).cand.length, 3);
});

// ── NÝTT: samræmi við build_cabinet.js og build_frettavel.js ────────────────
test('build_cabinet.js skrifar sóknardag í cabinet_meta.json aðeins þegar sóknin heppnaðist', () => {
  const src = fs.readFileSync(path.join(HER, 'build_cabinet.js'), 'utf8');
  assert.match(src, /cabinet_meta\.json/, 'cabinet.json er FYLKI og ber enga dagsetningu — systkinaskjalið geymir hana');
  assert.match(src, /kept/, 'dagsetningin má aðeins skrifast þegar writeJsonUnlessEmpty skrifaði í raun (kept === false)');
});

test('fréttin ber EKKI keyrsludaginn í auðkenni sínu (seen-dedup)', () => {
  // gogn/frettavel_seen.json lyklar á id. `radherra-${TODAY}-…` gefur sama atburði nýtt id á nýjum degi,
  // svo flöktandi embættafylki gæti birt sömu frétt aftur. Auðkennið verður að lýsa atburðinum, ekki deginum.
  const src = fs.readFileSync(path.join(HER, 'build_frettavel.js'), 'utf8');
  const lina = src.split('\n').find((l) => l.includes("type: 'radherra'"));
  assert.ok(lina, 'fann ekki radherra-atburðinn í build_frettavel.js');
  assert.doesNotMatch(lina, /id: `radherra-\$\{TODAY\}/, 'keyrsludagur má ekki vera í id');
  assert.match(lina, /id: `radherra-/);
});
