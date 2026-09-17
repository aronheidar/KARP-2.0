// Stjórnendahólfið í endanlegra-eigenda-skýrslunni — sameining BYGGÐRA gagna og LIFANDI auðgunar.
//
// Af hverju þessi eining er til (17.9.2026): hólfið sótti stjórnina EINGÖNGU úr /api/tengslanet, sem
// fer á gjaldskylda RSK-vefþjónustu. Þegar áskriftarlykillinn fór að skila 403 hvarf allt hólfið í
// þögn — engin fyrirsögn, engin skilaboð — þótt sama stjórn lægi fullbyggð í gogn/stjorn/<kt>.json,
// byggð samdægurs af ÓKEYPIS skrapinu sem er alveg óháð lyklinum.
//
// Tvennt sem prófin verja:
//   1. BYGGÐA skráin er grunnurinn. Lifandi kallið AUÐGAR aðeins (hlutverk í öðrum félögum).
//   2. Fjarvera er ALDREI borin fram sem staðfest núll. Vanti auðgunina segir `krossVantar` það,
//      svo viðmótið geti sagt „vitum ekki" í stað þess að þegja og láta líta út eins og engin
//      krosstengsl séu til. Sama villa og gerði 403-ið ósýnilegt í fyrsta lagi.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nafnLykill, sameinaStjornendur } from '../src/lib/stjornendur.mjs';

const BYGGD = {
  kt: '4812080920',
  nafn: 'Expectus ehf.',
  firmaritun: 'Tveir stjórnarmenn saman',
  stjorn: [
    { nafn: 'Ragnar Þórir Guðgeirsson', hlutverk: 'Stjórnarformaður' },
    { nafn: 'Hrund Rudolfsdóttir', hlutverk: 'Meðstjórnandi' },
    { nafn: 'Reynir Ingi Árnason', hlutverk: 'Framkvæmdastjóri' },
    { nafn: 'Ragnar Þórir Guðgeirsson', hlutverk: 'Prókúruhafi' },
    { nafn: 'Reynir Ingi Árnason', hlutverk: 'Prókúruhafi' },
  ],
};

const LIFANDI = {
  holdur: true,
  n_felog: 3,
  stjornendur: [
    { nafn: 'Ragnar Þórir Guðgeirsson', hlutverk_rot: ['Stjórnarformaður'], onnur: [{ kt: '5502692919', nafn: 'Annað félag ehf.', hlutverk: 'Meðstjórnandi' }] },
  ],
  krossar: [{ nafn: 'Jón Jónsson', felog: [{ kt: '1', nafn: 'A ehf.' }, { kt: '2', nafn: 'B ehf.' }] }],
};

test('nafnLykill jafnar hástöfum, aukabilum og punktum', () => {
  assert.equal(nafnLykill('  Ragnar  Þórir Guðgeirsson '), nafnLykill('ragnar þórir guðgeirsson'));
  assert.equal(nafnLykill('Hrund Rudolfsdóttir'), nafnLykill('HRUND RUDOLFSDÓTTIR'));
  assert.notEqual(nafnLykill('Jón Jónsson'), nafnLykill('Jón Jónsdóttir'));
});

test('byggða skráin ein og sér ber hólfið uppi þegar RSK svarar ekki', () => {
  const r = sameinaStjornendur(BYGGD, null);
  assert.equal(r.grunnur, 'byggd');
  assert.ok(r.rows.length, 'stjórnin á að birtast þótt lifandi kallið falli');
  assert.equal(r.astaeda, 'rsk_svarar_ekki');
  // ⚠ Kjarninn: við megum ALDREI bera fram „engin krosstengsl" þegar við vitum það ekki.
  assert.equal(r.krossVantar, true);
});

test('hlutverk sama manns renna saman í eina línu', () => {
  const r = sameinaStjornendur(BYGGD, null);
  const ragnar = r.rows.find((p) => nafnLykill(p.nafn) === nafnLykill('Ragnar Þórir Guðgeirsson'));
  assert.ok(ragnar, 'Ragnar á að vera í listanum');
  assert.deepEqual(ragnar.hlutverk, ['Stjórnarformaður', 'Prókúruhafi']);
  assert.equal(r.rows.filter((p) => nafnLykill(p.nafn) === nafnLykill('Ragnar Þórir Guðgeirsson')).length, 1);
});

test('röð byggðu skrárinnar helst (stjórn á undan prókúru)', () => {
  const r = sameinaStjornendur(BYGGD, null);
  assert.deepEqual(r.rows.map((p) => p.nafn), ['Ragnar Þórir Guðgeirsson', 'Hrund Rudolfsdóttir', 'Reynir Ingi Árnason']);
});

test('lifandi auðgun leggst ofan á byggðu skrána, ekki í staðinn fyrir hana', () => {
  const r = sameinaStjornendur(BYGGD, LIFANDI);
  assert.equal(r.grunnur, 'byggd');
  assert.equal(r.astaeda, 'i_lagi');
  assert.equal(r.krossVantar, false);
  assert.equal(r.n_felog, 3);
  const ragnar = r.rows.find((p) => nafnLykill(p.nafn) === nafnLykill('Ragnar Þórir Guðgeirsson'));
  assert.equal(ragnar.onnur.length, 1);
  assert.equal(ragnar.onnur[0].nafn, 'Annað félag ehf.');
  // Hrund er í byggðu skránni en ekki í lifandi svarinu — hún má ekki detta út.
  assert.ok(r.rows.some((p) => nafnLykill(p.nafn) === nafnLykill('Hrund Rudolfsdóttir')));
  assert.deepEqual(r.krossar, LIFANDI.krossar);
});

test('maður sem er aðeins í lifandi svarinu dettur ekki út', () => {
  const lif = { ...LIFANDI, stjornendur: [...LIFANDI.stjornendur, { nafn: 'Ný Stjórnarkona', hlutverk_rot: ['Meðstjórnandi'], onnur: [] }] };
  const r = sameinaStjornendur(BYGGD, lif);
  assert.ok(r.rows.some((p) => nafnLykill(p.nafn) === nafnLykill('Ný Stjórnarkona')));
});

test('lifandi eitt og sér dugar þegar engin byggð skrá er til', () => {
  const r = sameinaStjornendur(null, LIFANDI);
  assert.equal(r.grunnur, 'lifandi');
  assert.equal(r.astaeda, 'i_lagi');
  assert.equal(r.krossVantar, false);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0].hlutverk, ['Stjórnarformaður']);
});

test('hvorugt til — tómt en MEÐ ástæðu, aldrei þögn', () => {
  const r = sameinaStjornendur(null, null);
  assert.equal(r.rows.length, 0);
  assert.equal(r.grunnur, null);
  assert.ok(r.astaeda, 'ástæða verður alltaf að fylgja svo viðmótið geti sagt hvað gerðist');
});

test('ástæður aðgreindar — innskráning, óstillt og RSK-bilun mega ekki renna saman', () => {
  assert.equal(sameinaStjornendur(BYGGD, { holdur: false, error: 'login' }).astaeda, 'innskraning');
  assert.equal(sameinaStjornendur(BYGGD, { holdur: false, unconfigured: true }).astaeda, 'ostillt');
  assert.equal(sameinaStjornendur(BYGGD, { holdur: false }).astaeda, 'rsk_svarar_ekki');
  assert.equal(sameinaStjornendur(BYGGD, LIFANDI).astaeda, 'i_lagi');
});

test('byggð skrá með tómri stjórn telst ekki grunnur', () => {
  const r = sameinaStjornendur({ kt: '1', stjorn: [] }, null);
  assert.equal(r.grunnur, null);
  assert.equal(r.rows.length, 0);
});

test('firmaritun fylgir með úr byggðu skránni', () => {
  assert.equal(sameinaStjornendur(BYGGD, null).firmaritun, 'Tveir stjórnarmenn saman');
  assert.equal(sameinaStjornendur(null, LIFANDI).firmaritun, null);
});

test('rusl í inntaki fellir ekki sameininguna', () => {
  for (const [b, l] of [[undefined, undefined], [{}, {}], [{ stjorn: null }, { stjornendur: null }], ['x', 7]]) {
    const r = sameinaStjornendur(b, l);
    assert.ok(Array.isArray(r.rows));
    assert.ok(Array.isArray(r.krossar));
  }
});
