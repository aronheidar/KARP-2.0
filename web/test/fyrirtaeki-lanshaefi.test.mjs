import { test } from 'node:test';
import assert from 'node:assert';
import { FS_LH_ORDER, lhScore, lhColor, lhBand, lhEffect, lhAldur, lhSkilLate } from '../src/lib/fyrirtaeki-lanshaefi.mjs';

const lh = (base, factors) => ({ base, factors: factors || {} });

// ── Einkunnin ─────────────────────────────────────────────────────────────────
test('lhScore: ekkert mat → null', () => {
  assert.equal(lhScore(null), null);
  assert.equal(lhScore(lh(null)), null);                       // hvorki grunnur né þak
});

test('lhScore: grunnur án þátta stendur óbreyttur', () => {
  assert.equal(lhScore(lh(72)), 72);
});

test('lhScore: þættir leggjast við grunninn', () => {
  assert.equal(lhScore(lh(72, { aldur: { delta: 4 }, skil: { delta: -5 } })), 71);
  assert.equal(lhScore(lh(72, { sector: {} })), 72);            // þáttur án delta breytir engu
});

test('lhScore: þak lækkar einkunn óháð sterkum fjárhag', () => {
  assert.equal(lhScore(lh(95, { stada: { cap: 20 } })), 20);
  assert.equal(lhScore(lh(95, { logbirting: { cap: 25 } })), 25);
});

test('lhScore: mörg þök → það lægsta gildir', () => {
  assert.equal(lhScore(lh(95, { logbirting: { cap: 25 }, sanction: { cap: 20 } })), 20);
});

test('lhScore: ÞAK ÁN GRUNNS gefur samt einkunn (gjaldþrot → E, ekki „–“)', () => {
  // Raunlegt: félag í gjaldþroti þar sem efnahagsreikningur þáttaðist ekki úr ársreikningnum.
  // Áður skilaði fallið null hér og gjaldþrotið hvarf úr einkunninni.
  const gjaldthrota = lh(null, { fjarhagur: { base: true }, stada: { cap: 20 } });
  assert.equal(lhScore(gjaldthrota), 20);
  assert.equal(lhBand(lhScore(gjaldthrota)), 'Veik staða');
  assert.equal(lhScore(lh(null, { sanction: { cap: 20 }, logbirting: { cap: 25 } })), 20);
});

test('lhScore: deltar án grunns búa EKKI til einkunn', () => {
  // +4 fyrir starfsaldur segir ekkert eitt og sér — aðeins hörð þök standa án fjárhagsgrunns.
  assert.equal(lhScore(lh(null, { aldur: { delta: 4 }, skil: { delta: 2 } })), null);
});

test('lhScore: klemmt í 0–100 og námundað', () => {
  assert.equal(lhScore(lh(10, { logbirting: { delta: -45 } })), 0);
  assert.equal(lhScore(lh(98, { aldur: { delta: 4 } })), 100);
  assert.equal(lhScore(lh(72.6)), 73);
});

// ── Framsetning ───────────────────────────────────────────────────────────────
test('lhColor: litur fylgir flokkamörkum', () => {
  assert.equal(lhColor(null), '#6b7688');
  assert.equal(lhColor(65), '#42d086');
  assert.equal(lhColor(50), '#e8b84b');
  assert.equal(lhColor(49), '#ef6a6a');
});

test('lhBand: orðalag fylgir sömu mörkum og liturinn', () => {
  assert.equal(lhBand(null), 'Ófullnægjandi fjárhagsgögn');
  assert.equal(lhBand(65), 'Sterk staða');
  assert.equal(lhBand(64), 'Í meðallagi');
  assert.equal(lhBand(50), 'Í meðallagi');
  assert.equal(lhBand(49), 'Veik staða');
});

test('lhEffect: grunnur, þak, stig og stöðutákn', () => {
  assert.equal(lhEffect({ base: true, delta: 0 }), 'grunnur');
  assert.equal(lhEffect({ cap: 20 }), '→ E');
  assert.equal(lhEffect({ cap: 25 }), '→ E');
  assert.equal(lhEffect({ delta: 4 }), '+4');
  assert.equal(lhEffect({ delta: -12 }), '−12');
  assert.equal(lhEffect({ delta: 0, status: 'g' }), '✓');
  assert.equal(lhEffect({ delta: 0, status: 'n' }), '·');
  assert.equal(lhEffect({ delta: 0, status: 'b' }), '⚑');
  assert.equal(lhEffect({ status: 'n' }), '·');                 // delta vantar alveg
});

test('FS_LH_ORDER: fjárhagsgrunnurinn fremst, hörðu merkin skráð', () => {
  assert.equal(FS_LH_ORDER[0], 'fjarhagur');
  for (const k of ['stada', 'logbirting', 'sanction']) assert.ok(FS_LH_ORDER.includes(k), k + ' vantar í röðina');
});

// ── Áhættuþættir úr félagsgögnum ──────────────────────────────────────────────
const NU = new Date(2026, 6, 31).getTime();   // 31.7.2026 — fast viðmið svo prófin eldist ekki

test('lhAldur: ár frá skráningu, null ef dagsetning óþekkt', () => {
  assert.equal(lhAldur('01.01.2009', NU), 17);
  assert.equal(lhAldur('1.6.2025', NU), 1);
  assert.equal(lhAldur('01.09.2025', NU), 0);
  assert.equal(lhAldur('', NU), null);
  assert.equal(lhAldur(null, NU), null);
  assert.equal(lhAldur('vantar', NU), null);
});

test('lhSkilLate: 31.8-frestur árið eftir reikningsár', () => {
  assert.equal(lhSkilLate({ arsreikningar: [{ ar: '2024', skil: '15.05.2025' }] }), false);
  assert.equal(lhSkilLate({ arsreikningar: [{ ar: '2024', skil: '31.08.2025' }] }), false);   // á frestinum
  assert.equal(lhSkilLate({ arsreikningar: [{ ar: '2024', skil: '01.09.2025' }] }), true);    // degi of seint
});

test('lhSkilLate: eitt seint ár nægir; engin skil → null', () => {
  assert.equal(lhSkilLate({ arsreikningar: [{ ar: '2024', skil: '10.05.2025' }, { ar: '2023', skil: '20.11.2024' }] }), true);
  assert.equal(lhSkilLate({ arsreikningar: [] }), null);
  assert.equal(lhSkilLate({ arsreikningar: [{ ar: '2024' }] }), null);                        // ár án skiladags
  assert.equal(lhSkilLate({}), null);
  assert.equal(lhSkilLate(null), null);
});
