import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samstemma, VIRK, erFriprofun, ktHreint, PRICE_TIER, PRICE_SVC } from './fjarmal.mjs';

const NU = Date.UTC(2026, 8, 16) / 1000;
const SEINNA = NU + 30 * 86400;

const samn = (kt, vara, state = 'active', verd = 6900) => ({
  id: 'c_' + kt + '_' + vara, customer_reference: kt, state,
  items: [{ product_reference: vara, price: verd }],
});
/** Samningur með HRÁUM liðum — til að prófa raunveruleg Áskels-snið (amount/price/quantity). */
const samnL = (kt, items, state = 'active', id = null) => ({
  id: id || ('c_' + kt + '_' + items.map((i) => i.product_reference).join('-')),
  customer_reference: kt, state, items,
});
const heim = (kt, vara, extra = {}) => Object.assign(
  { uid: 1, kt, vara, until: SEINNA, askell_id: null, free_access: 0, is_admin: 0, nemandi: 0, tegund: 'tier' },
  extra,
);
const VERD = { fyrirtaeki: 6900, grunnur: 2900, kvoti: 9900 };

test('VIRK er ORÐRÉTT sama regla og greidslur.mjs — annars reka talningarnar sig í sundur', () => {
  for (const s of ['active', 'trial', 'current', 'ACTIVE']) assert.equal(VIRK(s), true, s);
  for (const s of ['cancelled', 'failed', 'expired', 'inactive', '', null]) assert.equal(VIRK(s), false, String(s));
  assert.equal(VIRK('trial_cancelled'), false, 'neitunin vinnur yfir játunina');
});

test('samningur rukkar en engin heimild í D1 → viðskiptavinur borgar fyrir ekkert', () => {
  const r = samstemma({ samningar: [samn('1234567890', 'fyrirtaeki')], heimildir: [], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 1);
  assert.equal(r.misraemi[0].tegund, 'borgar_fyrir_ekkert');
  assert.equal(r.misraemi[0].verd, 6900);
});

test('heimild í D1 án virks samnings → við gefum vöruna', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 1);
  assert.equal(r.misraemi[0].tegund, 'gefins');
});

test('fríprófun með samningi er HVORKI misræmi NÉ rukkaðar tekjur', () => {
  // ⚠ Stærsta villan sem hönnunin gat framleitt: án þessa teldist HVER fríprófun „borgar fyrir ekkert"
  //   og listinn fylltist af fólki sem er nákvæmlega í réttri stöðu.
  const r = samstemma({
    samningar: [samn('1234567890', 'fyrirtaeki', 'trial')],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.misraemi.length, 0, 'ekkert misræmi');
  assert.equal(r.fripofanir.length, 1);
  assert.equal(r.fripofanir[0].verd, 6900, 'verður þetta virði haldi hann áfram');
  assert.equal(r.mrrAskell, 0, 'fríprófun leggur EKKERT til rukkaðra tekna');
});

test('free_access er gjafaaðgangur, ekki leki', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { free_access: 1 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
});

test('is_admin er ekki leki', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { is_admin: 1 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
});

test('nemandi er ekki leki', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { nemandi: 1 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
});

test('útrunnin heimild telst ekki með — hún er ekki virk', () => {
  const r = samstemma({ samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { until: NU - 86400 })], verdskra: VERD, now: NU });
  assert.equal(r.misraemi.length, 0);
  assert.equal(r.mrrD1, 0);
});

test('parað er á kennitölu, ekki á askell_id — id-ið rekur sig', () => {
  const r = samstemma({
    samningar: [samn('1234567890', 'fyrirtaeki')],
    heimildir: [heim('123456-7890', 'fyrirtaeki', { askell_id: 'DAUTT_ID' })],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.misraemi.length, 0, 'bandstrik í kt má ekki fella pörunina');
});

test('MRR: Áskell notar RAUNVERÐ, D1 notar föstu töfluna', () => {
  const r = samstemma({
    samningar: [samn('1234567890', 'fyrirtaeki', 'active', 5900)],
    heimildir: [heim('1234567890', 'fyrirtaeki')],
    verdskra: { fyrirtaeki: 5900 }, now: NU,
  });
  assert.equal(r.mrrAskell, 5900, 'raunverð úr Áskeli');
  assert.equal(r.mrrD1, 6900, 'fasta taflan í kóðanum');
  assert.equal(r.verdrek.length, 1);
  assert.deepEqual(r.verdrek[0], { vara: 'fyrirtaeki', askell: 5900, fast: 6900 });
});

test('þjónustuáskrift (svc) er verðlögð úr PRICE_SVC', () => {
  // ⚠ Þetta próf hét áður „...notar PRICE_SVC en ekki PRICE_TIER" en gat ekki fallið: lyklar taflnanna
  //   skarast ekki, svo `kvoti` finnst hvergi í PRICE_TIER hvort sem tegundin er lesin eða ekki.
  //   Prófið sem NEGLIR greinina er hér fyrir neðan („tegund ræður HVORRI töflu...").
  const r = samstemma({
    samningar: [samn('1234567890', 'kvoti', 'active', 9900)],
    heimildir: [heim('1234567890', 'kvoti', { tegund: 'svc' })],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrD1, 9900);
  assert.equal(r.verdrek.length, 0, 'verðið stemmir við PRICE_SVC');
});

test('tegund ræður HVORRI töflu er flett upp í — röng tafla gefur ekkert verð', () => {
  const svcMedThrepsvoru = samstemma({
    samningar: [], heimildir: [heim('1234567890', 'fyrirtaeki', { tegund: 'svc' })], verdskra: {}, now: NU,
  });
  assert.equal(svcMedThrepsvoru.mrrD1, 0, '„fyrirtaeki" er ekki til í PRICE_SVC — tegundin má ekki vera hunsuð');
  const tierMedThjonustuvoru = samstemma({
    samningar: [], heimildir: [heim('1234567890', 'kvoti', { tegund: 'tier' })], verdskra: {}, now: NU,
  });
  assert.equal(tierMedThjonustuvoru.mrrD1, 0, '„kvoti" er ekki til í PRICE_TIER');
});

test('verðtöflurnar eru ORÐRÉTT þær sem stjórnborðið reiknar MRR úr', () => {
  // ⚠ Þessar tvær töflur voru fluttar út en hvergi staðfestar. Reki þær sig frá stjornbord.mjs:56-57
  //   fer öll samstemmingin að segja að D1 „veiti" annað en stjórnborðið sýnir, og enginn sér hvers vegna.
  assert.deepEqual(PRICE_TIER, { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 });
  assert.deepEqual(PRICE_SVC, { kvoti: 9900, utbod: 1900, frettir: 3900, fasteign: 3900, thingskyrslur: 3900 });
});

test('verðrek er líka mælt á þjónustuverðum — þau eru jafn harðkóðuð og þrepaverðin', () => {
  const r = samstemma({ samningar: [], heimildir: [], verdskra: { kvoti: 11900 }, now: NU });
  assert.deepEqual(r.verdrek, [{ vara: 'kvoti', askell: 11900, fast: 9900 }]);
});

test('vara sem á sér ekkert fast verð rekur sig ekki', () => {
  const r = samstemma({ samningar: [], heimildir: [], verdskra: { eitthvad_nytt: 4900 }, now: NU });
  assert.equal(r.verdrek.length, 0);
});

test('ktHreint strípar allt sem er ekki tala', () => {
  assert.equal(ktHreint('123456-7890'), '1234567890');
  assert.equal(ktHreint(null), '');
});

test('erFriprofun þekkir trial en ekki active', () => {
  assert.equal(erFriprofun('trial'), true);
  assert.equal(erFriprofun('active'), false);
});

// ──────────────────────────────────────────────────────────────────────────────
// Upphæðin er ÓÞEKKT snið og má ekki þykjast vera þekkt.
// `greidslur.mjs` sendir INN verð-AUÐKENNI í `items[].price` (askellPriceId), svo reiturinn getur
// borið auðkenni, upphæð eða hlut. Uppsprettan er því mæld, ekki giskuð.
// ──────────────────────────────────────────────────────────────────────────────

test('it.price sem STRENGUR er verð-AUÐKENNI, aldrei upphæð — fellur á verðskrá og er SKRÁÐ', () => {
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 'price_9aBcDeF' }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrAskell, 6900, 'listaverðið, ekki rusl úr auðkenninu');
  assert.deepEqual(r.verdUppsprettur, { lidur: 0, verdskra: 1, ekkert: 0 });
  assert.equal(r.mrrAskellOvisst, false, 'verðið fannst — bara ekki á liðnum sjálfum');
});

test('TÖLUSTRENGUR í it.price er líka auðkenni, ekki upphæð — typeof ræður, ekki Number()', () => {
  // ⚠ Þetta er gildran: `Number('5900')` gefur 5900 og lítur út eins og rétt svar. Auðkenni Áskels
  //   eru ekki hreinar tölur, en reglan verður að vera á SNIÐINU, ekki á því hvort strengurinn þáttast.
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: '5900' }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrAskell, 6900, 'verðskráin, ekki strengurinn');
  assert.deepEqual(r.verdUppsprettur, { lidur: 0, verdskra: 1, ekkert: 0 });
});

test('upphæð 0 er GILD upphæð — fullur afsláttur má ALDREI falla á listaverðið', () => {
  const medAmount = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', amount: 0 }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(medAmount.mrrAskell, 0, '0 er talan sem Áskell rukkar, ekki „vantar"');
  assert.deepEqual(medAmount.verdUppsprettur, { lidur: 1, verdskra: 0, ekkert: 0 });
  const medPrice = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 0 }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(medPrice.mrrAskell, 0);
  assert.deepEqual(medPrice.verdUppsprettur, { lidur: 1, verdskra: 0, ekkert: 0 });
});

test('verdskra á verðinu 0 er GILT verð — 0 er ekki „ekkert"', () => {
  // ⚠ Sama gildran og gamla `Number(it.price) || verdskra[vara] || 0` lestrin, bara á VERÐSKRÁR-þrepinu
  //   í lidVerd(): liðurinn ber enga eigin upphæð, svo fallið VERÐUR að falla niður á verðskrána — og
  //   0 þar er svar sem fannst, ekki „ekkert fannst". `== null`-prófið á `skra`, ALDREI `||` eða `if (skra)`.
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki' }])],
    heimildir: [], verdskra: { fyrirtaeki: 0 }, now: NU,
  });
  assert.deepEqual(r.verdUppsprettur, { lidur: 0, verdskra: 1, ekkert: 0 }, 'uppsprettan er verdskra, ekki ekkert');
  assert.equal(r.mrrAskellOvisst, false, '0 er þekkt verð — engin óvissa');
});

test('amount hefur FORGANG yfir price', () => {
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', amount: 4900, price: 'price_9aBcDeF' }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrAskell, 4900);
  assert.deepEqual(r.verdUppsprettur, { lidur: 1, verdskra: 0, ekkert: 0 });
});

test('it.price sem HLUTUR → price.amount er lesið', () => {
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: { id: 'price_9aBcDeF', amount: 4500 } }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrAskell, 4500);
  assert.deepEqual(r.verdUppsprettur, { lidur: 1, verdskra: 0, ekkert: 0 });
});

test('ekkert verð neins staðar → mrrAskellOvisst, talan er EKKI tæmandi', () => {
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'ny_vara' }])],
    heimildir: [], verdskra: {}, now: NU,
  });
  assert.equal(r.mrrAskellOvisst, true, 'efra lagið á að segja „óvíst", ekki tölu');
  assert.deepEqual(r.verdUppsprettur, { lidur: 0, verdskra: 0, ekkert: 1 });
  assert.equal(r.mrrAskell, 0);
});

test('fríprófun án verðs gerir töluna líka óvissa — við vitum ekki hvað hún verður virði', () => {
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'ny_vara' }], 'trial')],
    heimildir: [], verdskra: {}, now: NU,
  });
  assert.equal(r.mrrAskellOvisst, true);
  assert.equal(r.fripofanir.length, 1);
  assert.equal(r.fripofanir[0].verd, 0, 'óþekkt virði er 0, EKKI ágiskun');
});

test('quantity er margfaldari — fimm sæti eru ekki eitt sæti', () => {
  const r = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 6900, quantity: 3 }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrAskell, 20700, '3 × 6900');
  const anQty = samstemma({
    samningar: [samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 6900 }])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(anQty.mrrAskell, 6900, 'ekkert quantity = 1, ekki 0');
});

// ──────────────────────────────────────────────────────────────────────────────
// Röð inntaksins má ekki ráða niðurstöðunni.
// ──────────────────────────────────────────────────────────────────────────────

test('tvö stök á SÖMU vöru í sama samningi LEGGJAST SAMAN, yfirskrifa ekki', () => {
  const r = samstemma({
    samningar: [samnL('1234567890', [
      { product_reference: 'fyrirtaeki', price: 6900 },
      { product_reference: 'fyrirtaeki', price: 2900 },
    ])],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrAskell, 9800, 'helmingur upphæðarinnar má ekki hverfa');
});

test('tveir samningar á sömu kt+vöru leggjast saman OG teljast — tvírukkun má ekki vera ósýnileg', () => {
  const r = samstemma({
    samningar: [
      samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 6900 }], 'active', 'c_A'),
      samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 6900 }], 'active', 'c_B'),
    ],
    heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrAskell, 13800, 'viðskiptavinurinn er rukkaður tvisvar og talan á að sýna það');
  assert.deepEqual(r.tvirukkun, [{ kt: '1234567890', vara: 'fyrirtaeki', fjoldi: 2, verd: 13800 }]);
});

test('ekki-fríprófun VINNUR alltaf — óháð röð samninganna', () => {
  const fri = samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 6900 }], 'trial', 'c_trial');
  const virkur = samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 6900 }], 'active', 'c_active');
  for (const [nafn, rod] of [['fríprófun fyrst', [fri, virkur]], ['virkur fyrst', [virkur, fri]]]) {
    const r = samstemma({ samningar: rod, heimildir: [heim('1234567890', 'fyrirtaeki')], verdskra: VERD, now: NU });
    assert.equal(r.fripofanir.length, 0, nafn + ': sá sem borgar ER að borga');
    assert.equal(r.mrrAskell, 6900, nafn + ': aðeins greiðandi stakið telur, fríprófunin rukkar 0');
    assert.equal(r.misraemi.length, 0, nafn);
  }
});

test('tvær fríprófanir á SÖMU kt+vöru LEGGJAST SAMAN í fripofanir[].verd, yfirskrifa ekki', () => {
  // ⚠ Prófið hér fyrir ofan („ekki-fríprófun VINNUR alltaf") nær þessu EKKI: þar er virkur samningur á
  //   sömu kt+vöru, svo b.fri verður false og fripofanir verður tómt fyrir þann lykil. Hér er ENGINN
  //   virkur samningur á kt+vöru — bara tvær fríprófanir sem eiga að safnast saman, ekki yfirskrifast.
  const r = samstemma({
    samningar: [
      samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 2900 }], 'trial', 'c_ein'),
      samnL('1234567890', [{ product_reference: 'fyrirtaeki', price: 6900 }], 'trial', 'c_tvo'),
    ],
    heimildir: [], verdskra: VERD, now: NU,
  });
  assert.equal(r.fripofanir.length, 1, 'einn lykill, kt+vara');
  assert.equal(r.fripofanir[0].verd, 9800, '2900 + 6900, ekki síðasta gildið eitt og sér');
});

test('sömu gögn í ÖFUGRI röð gefa sömu niðurstöðu', () => {
  const s1 = samnL('1111111111', [{ product_reference: 'fyrirtaeki', price: 6900 }], 'trial', 'c1');
  const s2 = samnL('1111111111', [{ product_reference: 'fyrirtaeki', price: 5900 }], 'active', 'c2');
  const s3 = samnL('2222222222', [{ product_reference: 'kvoti', price: 9900 }], 'active', 'c3');
  const h1 = heim('2222222222', 'kvoti', { tegund: 'svc' });
  const h2 = heim('3333333333', 'grunnur');
  const keyra = (ss, hh) => samstemma({ samningar: ss, heimildir: hh, verdskra: VERD, now: NU });
  const fram = keyra([s1, s2, s3], [h1, h2]);
  const aftur = keyra([s3, s2, s1], [h2, h1]);
  assert.equal(fram.mrrAskell, aftur.mrrAskell, 'mrrAskell');
  assert.equal(fram.mrrD1, aftur.mrrD1, 'mrrD1');
  assert.equal(fram.misraemi.length, aftur.misraemi.length, 'misraemi.length');
  assert.equal(fram.fripofanir.length, aftur.fripofanir.length, 'fripofanir.length');
  assert.deepEqual(fram.verdUppsprettur, aftur.verdUppsprettur, 'verdUppsprettur');
});

// ──────────────────────────────────────────────────────────────────────────────
// Kennitalan VERÐUR að vera hluti af pörunarlyklinum, og mrrD1 telur eins og stjórnborðið.
// ──────────────────────────────────────────────────────────────────────────────

test('tveir ÓLÍKIR viðskiptavinir — hvor sitt misræmið, hvort í sínum flokki', () => {
  // ⚠ Allt prófasafnið notaði áður EINA kennitölu. Væri `kt` tekið út úr pörunarlyklinum hefði
  //   ekkert próf fallið — og samstemmingin hefði parað saman ótengda viðskiptavini.
  const r = samstemma({
    samningar: [samn('1111111111', 'fyrirtaeki')],
    heimildir: [heim('2222222222', 'fyrirtaeki')],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.misraemi.length, 2, 'sitt hvor kennitalan → tvö ÓSKYLD misræmi');
  const eftirTegund = Object.fromEntries(r.misraemi.map((m) => [m.tegund, m]));
  assert.equal(eftirTegund.borgar_fyrir_ekkert.kt, '1111111111');
  assert.equal(eftirTegund.gefins.kt, '2222222222');
});

test('mrrD1 telur PER RÖÐ eins og stjórnborðið — tveir notendur á sömu kt eru TVÆR raðir', () => {
  // ⚠ `users.kt` hefur ÓEINKVÆMAN index og `parent_account_id` gerir marga notendur á einni kt að
  //   hannaðri stöðu. stjornbord.mjs:59-60 leggur saman per röð; geri þessi eining það ekki eru
  //   tölurnar tvær ósamanburðarhæfar og misræmið sem þær áttu að finna verður að þeim sjálfum.
  const r = samstemma({
    samningar: [],
    heimildir: [heim('1234567890', 'fyrirtaeki', { uid: 1 }), heim('1234567890', 'fyrirtaeki', { uid: 2 })],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrD1, 13800, 'tvær raðir = tvisvar 6900');
  assert.equal(r.misraemi.length, 1, 'en misræmið er EITT — sama kt+vara');
  assert.equal(r.misraemi[0].verd, 13800, 'verðið sem er gefið er samtala beggja raðanna');
});

test('sidan er ALLTAF „núna", aldrei D1-heimildarinnar `until` — hvort sem misræmið er gefins eða borgar_fyrir_ekkert', () => {
  const r = samstemma({
    samningar: [samn('1111111111', 'fyrirtaeki')],
    heimildir: [heim('2222222222', 'fyrirtaeki')],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.misraemi.length, 2);
  for (const m of r.misraemi) {
    assert.equal(m.sidan, NU, m.tegund + ': „þetta sáum við núna" er það eina sem er satt');
  }
});
