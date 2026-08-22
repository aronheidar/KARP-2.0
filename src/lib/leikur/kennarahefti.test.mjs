import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDBOOK, SATT_HANDBOOK } from './handbook.mjs';
import {
  HEFTI_META, EIN_SIDA, UNDIRBUNINGUR, KEYRSLA, MIN_SAMTALS, STYTTRI_TIMI, OPNUNARORD, KJORTIMABIL,
  DEBRIEF_THREP, LOKASPURNINGAR, LOKASPURNING_ATH, HAMIR, HAEGUR_HAMUR, GRUNNTHAETTIR,
  NAMSMAT, VANDAMAL, TAKMARKANIR, PERSONUVERND, MEIRA, KAFLAR,
} from './kennarahefti.mjs';

/** Allt efni heftisins sem einn strengur — það sem síðan getur birt.
 *  ⚠ BÆTIR ÞÚ VIÐ NÝJUM ÚTFLUTNINGI VERÐUR HANN AÐ FARA HINGAÐ LÍKA — annars sleppur
 *  hann fram hjá leka-prófunum hér að neðan og svarablaðið getur ratað á opna síðu. */
const ALLT = JSON.stringify({
  HEFTI_META, EIN_SIDA, UNDIRBUNINGUR, KEYRSLA, STYTTRI_TIMI, OPNUNARORD, KJORTIMABIL, DEBRIEF_THREP,
  LOKASPURNINGAR, LOKASPURNING_ATH, HAMIR, HAEGUR_HAMUR, GRUNNTHAETTIR, NAMSMAT, VANDAMAL,
  TAKMARKANIR, PERSONUVERND, MEIRA, KAFLAR,
});

// ══════════════════════════════════════════════════════════════════════════
// MÖRKIN: heftið er OPIN síða — svarablaðið er leikstjóra-læst inni í leiknum.
// Þessi próf eru ekki formsatriði. Falli þau ertu að birta lausnina fyrir nemendum.
// ══════════════════════════════════════════════════════════════════════════
test('heftið birtir ENGAR ráðlagðar sleða-stillingar (svarablaðið)', () => {
  for (const h of HANDBOOK) {
    for (const s of h.settings) {
      assert.ok(!ALLT.includes(s), 'KT' + h.round + ': ráðlögð stilling lak í heftið → ' + s.slice(0, 60));
    }
  }
});

test('heftið birtir hvorki `strategy` né `varast` úr kennsluhandbókinni', () => {
  for (const h of HANDBOOK) {
    for (const [reitur, texti] of [['strategy', h.strategy], ['varast', h.varast]]) {
      // Berum saman á nógu löngum búti til að útiloka tilviljanakennda orðasamstæðu.
      const buti = texti.slice(0, 45);
      assert.ok(!ALLT.includes(buti), 'KT' + h.round + ': ' + reitur + ' lak í heftið → ' + buti);
    }
  }
});

test('Þjóðarsáttar-fylkið er EKKI í heftinu (það er debrief-efni úr leiknum)', () => {
  for (const r of SATT_HANDBOOK.fylki_til_toflu) {
    if (!r.ahrif) continue;
    assert.ok(!ALLT.includes(r.ahrif), 'útkomu-tölur Þjóðarsáttar láku → ' + r.ahrif);
  }
  // Engar tölur úr fylkinu í neinu formi
  assert.ok(!/sogari|svikari/i.test(ALLT), 'hugtök úr fylkinu láku í heftið');
});

test('söguleg staða KEMUR úr handbook.mjs — ein uppspretta, ekki afrit', () => {
  assert.equal(KJORTIMABIL.length, HANDBOOK.length);
  for (const k of KJORTIMABIL) {
    const h = HANDBOOK.find((x) => x.round === k.lota);
    assert.ok(h, 'KT' + k.lota + ' vantar í HANDBOOK');
    assert.equal(k.stada, h.situation, 'KT' + k.lota + ': staða víkur frá handbókinni');
  }
});

// ── Heilleiki efnisins ────────────────────────────────────────────────────
test('öll átta kjörtímabil bera kennslu-horn og spurningar', () => {
  assert.equal(KJORTIMABIL.length, 8);
  for (const k of KJORTIMABIL) {
    assert.ok(k.kennslu_horn.length > 60, 'KT' + k.lota + ': kennslu-horn of stutt');
    assert.ok(k.spurningar.length >= 2, 'KT' + k.lota + ': þarf a.m.k. 2 spurningar');
    for (const s of k.spurningar) assert.ok(s.trim().endsWith('?'), 'KT' + k.lota + ': „' + s.slice(0, 40) + '…" er ekki spurning');
  }
});

// 10 + 64 + 20 = 94. Sama tímalína og sölusíðan /leikur/leikstjori/ sýnir — hún les mínúturnar
// ÚR KEYRSLA svo þær eigi eina uppsprettu. Breytir þú fasa hér breytist tímalínan þar með.
test('keyrslan er 94 mínútur og fasarnir þrír bera efni', () => {
  assert.equal(MIN_SAMTALS, 94);
  assert.equal(KEYRSLA.length, 3);
  for (const f of KEYRSLA) {
    assert.ok(f.gera.length >= 3, f.fasi + ': of fá skref');
    assert.ok(f.varast && f.varast.length > 40, f.fasi + ': vantar „varast"');
  }
});

test('debrief-þrepin fylla debrief-fasann', () => {
  const debriefMin = KEYRSLA.find((f) => f.fasi === 'Debrief').min;
  assert.equal(DEBRIEF_THREP.reduce((s, t) => s + t.min, 0), debriefMin);
  assert.deepEqual(DEBRIEF_THREP.map((t) => t.threp), [1, 2, 3, 4]);
  assert.ok(LOKASPURNINGAR.every((s) => s.trim().endsWith('?')));
});

test('hamirnir þrír koma úr handbook.mjs og bera EKKI fylkið', () => {
  assert.equal(HAMIR.length, 3);
  assert.deepEqual(HAMIR.map((h) => h.heiti), ['Hagstjórn í þoku', 'Þjóðarsáttin', 'Ráðherraskipting']);
  for (const h of HAMIR) {
    assert.ok(h.hvers_vegna.length > 200, h.heiti + ': hvers vegna of stutt');
    assert.ok(h.spurningar.length >= 3, h.heiti + ': of fáar spurningar');
    assert.ok(!('fylki_til_toflu' in h), h.heiti + ': fylkið fylgdi með');
  }
});

test('grunnþættirnir sex eru allir með', () => {
  assert.equal(GRUNNTHAETTIR.length, 6);
  const heiti = GRUNNTHAETTIR.map((g) => g.thattur);
  for (const t of ['Sjálfbærni', 'Lýðræði og mannréttindi', 'Jafnrétti', 'Læsi', 'Sköpun', 'Heilbrigði og velferð']) {
    assert.ok(heiti.includes(t), 'vantar grunnþáttinn ' + t);
  }
  // Engin áfangaheiti/-númer — þau eru mismunandi milli skóla og myndu eldast illa.
  assert.ok(!/[A-ZÁÉÍÓÚÝÐÞÆÖ]{4}\d[A-Z]?\d{2}/.test(JSON.stringify(GRUNNTHAETTIR)), 'áfangakóði læddist inn');
});

test('námsmat samræmist DPIA: stig fara ALDREI í einkunn', () => {
  assert.ok(/engar einkunnir/i.test(NAMSMAT.regla));
  assert.ok(/eiga ekki heima í námsmati|ekki heima í námsmati/i.test(NAMSMAT.regla));
  assert.ok(NAMSMAT.tillogur.length >= 3);
  assert.ok(PERSONUVERND.atridi.some((a) => /metur ekki einstaka nemendur/i.test(a)));
});

test('takmarkana-kaflinn er til staðar og heiðarlegur', () => {
  assert.ok(TAKMARKANIR.atridi.length >= 5);
  assert.ok(/ekki spálíkan/i.test(TAKMARKANIR.inngangur), 'verður að segja berum orðum að þetta sé ekki spálíkan');
  for (const a of TAKMARKANIR.atridi) assert.ok(a.txt.length > 80, a.heiti + ': of rýrt');
});

test('„ef þú lest bara eina síðu" stendur ein og sér utan kaflatalsins', () => {
  assert.equal(EIN_SIDA.length, 10);
  for (const l of EIN_SIDA) {
    assert.ok(l.length > 55, 'of stutt til að standa eitt: ' + l);
    assert.ok(/[.!?]$/.test(l.trim()), 'á að vera heil setning: ' + l);
  }
  // Er ekki kafli — það er blaðið sem kennarinn tekur með sér inn í stofuna.
  assert.ok(!KAFLAR.some((k) => /eina síðu/i.test(k.heiti)));
});

test('„meira efni" vísar aðeins á innri slóðir sem eru til', () => {
  const TIL = ['/hermir/', '/leikur/personuvernd/', '/leikur/leikstjori/'];
  assert.ok(MEIRA.length >= 3);
  for (const m of MEIRA) {
    assert.ok(TIL.includes(m.slod), 'óþekkt slóð: ' + m.slod);
    assert.ok(m.txt.length > 60, m.heiti + ': of rýr lýsing');
  }
  assert.ok(LOKASPURNING_ATH.length > 80);
});

test('styttri tími: ráðin virða að rundafjöldi sé EKKI einfaldlega stillanlegur', () => {
  assert.ok(STYTTRI_TIMI.leidir.length >= 3);
  for (const l of STYTTRI_TIMI.leidir) assert.ok(l.txt.length > 90, l.heiti + ': of rýrt');
  // Rundafjöldi er aðeins stillanlegur í sérsniðinni sviðsmynd (server.mjs: cb.custom).
  // Ráðleggðu því ALDREI „stílltu færri kjörtímabil“ — kennari finnur þann rofa ekki.
  const t = JSON.stringify(STYTTRI_TIMI);
  assert.ok(!/færri kjörtímabil|fækka(ðu)? kjörtímabil/i.test(t), 'ráðleggðu ekki stillingu sem er falin í sérsniðinni sviðsmynd');
  assert.ok(/tvær kennslustundir/i.test(t), 'tveggja-tíma leiðin er aðalráðið og má ekki hverfa');
});

test('kaflaskráin er heil og einkvæm', () => {
  assert.equal(KAFLAR.length, 12);
  assert.equal(new Set(KAFLAR.map((k) => k.id)).size, 12, 'id verða að vera einkvæm');
  assert.deepEqual(KAFLAR.map((k) => k.nr), Array.from({ length: 12 }, (_, i) => i + 1));
});

test('enginn texti er tómur eða „undefined"', () => {
  assert.ok(!/undefined|\[object Object\]/.test(ALLT));
  assert.ok(HEFTI_META.inngangur.length > 100);
  assert.ok(OPNUNARORD.length >= 3 && OPNUNARORD.every((o) => o.length > 40));
  assert.ok(HAEGUR_HAMUR.hvernig_keyra.length >= 4);
  assert.ok(VANDAMAL.length >= 6 && VANDAMAL.every((v) => v.vandi && v.lausn.length > 60));
  assert.ok(UNDIRBUNINGUR.length >= 5 && UNDIRBUNINGUR.every((u) => u.hvad && u.hvernig.length > 50));
});
