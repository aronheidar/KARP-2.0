import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './malalyklar.cjs';
const { malLykill, flettaLykil, finnaMal, faeraLykla } = mod;

const RC = (n) => ({ ja: Array(n).fill('x'), nei: [], hja: [], fjar: [] });

// ── malLykill ─────────────────────────────────────────────────────────────
test('malLykill: <þing>-<nr>; án þings fellur hann aftur í bert númer', () => {
  assert.equal(malLykill(157, 712), '157-712');
  assert.equal(malLykill('158', '1'), '158-1');
  assert.equal(malLykill(null, 712), '712', 'munaðarlaus færsla heldur bera lyklinum');
  assert.equal(malLykill(undefined, 712), '712');
});

// ── flettaLykil ───────────────────────────────────────────────────────────
test('flettaLykil: les þing og númer úr nýja lyklinum og þolir þann gamla', () => {
  assert.deepEqual(flettaLykil('157-712'), { thing: 157, nr: 712 });
  assert.deepEqual(flettaLykil('712'), { thing: null, nr: 712 });
  assert.deepEqual(flettaLykil('rusl'), { thing: null, nr: null });
});

// ── finnaMal: umskiptaþol ─────────────────────────────────────────────────
// ⚠ Skráin og síðan fara í loftið hvor í sínu lagi. Uppfletting VERÐUR að þola að skráin sé
//   enn á gamla sniðinu (bert númer) — annars hverfur nafnakallið þangað til CI endurbyggir.
test('finnaMal: nýi lykillinn fyrst, gamli sem varaleið', () => {
  assert.equal(finnaMal({ '157-712': RC(3) }, 157, 712).ja.length, 3, 'nýtt snið');
  assert.equal(finnaMal({ 712: RC(5) }, 157, 712).ja.length, 5, 'gamalt snið enn í loftinu');
  assert.equal(finnaMal({ '157-712': RC(3), 712: RC(5) }, 157, 712).ja.length, 3, 'nýtt snið hefur forgang');
  assert.equal(finnaMal({ '157-712': RC(3) }, 158, 712), null, 'annað þing, ekkert bert til vara');
  assert.equal(finnaMal(null, 157, 712), null);
});

// ⚠⚠ Þetta er villan sem lyklunin lagar: mál nr. 1 á 158 eru fjárlögin, allt annað á 157.
test('finnaMal: sama númer á tveimur þingum skilar SÍNU nafnakalli hvoru', () => {
  const mal = { '157-1': RC(2), '158-1': RC(9) };
  assert.equal(finnaMal(mal, 157, 1).ja.length, 2);
  assert.equal(finnaMal(mal, 158, 1).ja.length, 9);
});

// ── faeraLykla: flutningur gamla skráarinnar ──────────────────────────────
test('faeraLykla: ber lykill fær þing sitt úr málaskránni — engin endursókn', () => {
  const r = faeraLykla({ 712: RC(2), 719: RC(3) }, [{ nr: 712, thing: 157 }, { nr: 719, thing: 157 }]);
  assert.deepEqual(Object.keys(r.mal).sort(), ['157-712', '157-719']);
  assert.equal(r.faerd, 2);
  assert.equal(r.mal['157-712'].ja.length, 2);
});

test('faeraLykla: er sjálfhverf — annað kall breytir engu (tvöfaldar ekki forskeytið)', () => {
  const einu = faeraLykla({ 712: RC(2) }, [{ nr: 712, thing: 157 }]);
  const tvisvar = faeraLykla(einu.mal, [{ nr: 712, thing: 157 }]);
  assert.deepEqual(Object.keys(tvisvar.mal), ['157-712']);
  assert.equal(tvisvar.faerd, 0);
});

test('faeraLykla: lykill sem finnst ekki í málaskránni helst óbreyttur og er talinn', () => {
  const r = faeraLykla({ 999: RC(1) }, [{ nr: 712, thing: 157 }]);
  assert.deepEqual(Object.keys(r.mal), ['999'], 'engu hent — færslan er bara óvirk');
  assert.equal(r.oraedanleg, 1);
});

// Tvíræður ber lykill: málið er til á BÁÐUM þingum og ekkert segir hvoru nafnakallið tilheyrir.
// Þá má EKKI giska — færslan helst ber og er talin svo hún sjáist.
test('faeraLykla: tvírætt bert númer (á tveimur þingum) er ekki giskað á', () => {
  const r = faeraLykla({ 1: RC(4) }, [{ nr: 1, thing: 157 }, { nr: 1, thing: 158 }]);
  assert.deepEqual(Object.keys(r.mal), ['1']);
  assert.equal(r.oraedanleg, 1);
  assert.equal(r.faerd, 0);
});
