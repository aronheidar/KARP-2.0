import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samstemma, VIRK, erFriprofun, ktHreint } from './fjarmal.mjs';

const NU = Date.UTC(2026, 8, 16) / 1000;
const SEINNA = NU + 30 * 86400;

const samn = (kt, vara, state = 'active', verd = 6900) => ({
  id: 'c_' + kt + '_' + vara, customer_reference: kt, state,
  items: [{ product_reference: vara, price: verd }],
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

test('þjónustuáskrift (svc) notar PRICE_SVC en ekki PRICE_TIER', () => {
  const r = samstemma({
    samningar: [samn('1234567890', 'kvoti', 'active', 9900)],
    heimildir: [heim('1234567890', 'kvoti', { tegund: 'svc' })],
    verdskra: VERD, now: NU,
  });
  assert.equal(r.mrrD1, 9900);
  assert.equal(r.verdrek.length, 0, 'verðið stemmir við PRICE_SVC');
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
