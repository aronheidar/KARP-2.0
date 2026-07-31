import { test } from 'node:test';
import assert from 'node:assert';
import { veljaGrein, betriEnGrein, greinStig, GREIN_MAELIKVARDAR } from '../src/lib/fyrirtaeki-grein.mjs';

const kpi = (label, o) => ({ label, ar: 2024, framlegd: 0.4, hagnadarhlutfall: 0.05, eiginfjarhlutfall: 0.4, eignavelta: 1.2, skuldahlutfall_DE: 1.5, ...o });
const MAP = {
  '10': kpi('Matvælaframleiðsla, án fiskvinnslu (ÍSAT nr. 10, án 102)', { framlegd: 0.42 }),
  '62': kpi('Upplýsingatækni (ÍSAT nr. 62)', { framlegd: 0.55 }),
  '6201': kpi('Hugbúnaðargerð (ÍSAT nr. 6201)', { framlegd: 0.61 }),
};
const HEILD = kpi('Hagkerfið', { framlegd: 0.33 });

// ── Val á grein ───────────────────────────────────────────────────────────────
test('veljaGrein: lengsta forskeytið vinnur', () => {
  assert.equal(veljaGrein(MAP, HEILD, '62010').label, MAP['6201'].label);
  assert.equal(veljaGrein(MAP, HEILD, '62090').label, MAP['62'].label);
});

test('veljaGrein: óþekkt grein fellur á hagkerfis-viðmið', () => {
  assert.equal(veljaGrein(MAP, HEILD, '99999').label, 'Hagkerfið');
  assert.equal(veljaGrein(MAP, null, '99999'), null);
});

test('veljaGrein: ekkert ÍSAT eða ekkert kort → null', () => {
  assert.equal(veljaGrein(MAP, HEILD, ''), null);
  assert.equal(veljaGrein(MAP, HEILD, null), null);
  assert.equal(veljaGrein(MAP, HEILD, 'engar tölur'), null);
  assert.equal(veljaGrein(null, HEILD, '62010'), null);
});

test('veljaGrein: ÍSAT með bandstrikum/bilum er hreinsað', () => {
  assert.equal(veljaGrein(MAP, HEILD, '62.01.0').label, MAP['6201'].label);
});

test('veljaGrein: „án X“ í merkingu útilokar félagið úr greininni', () => {
  // Fiskvinnsla (102) á ekki heima í „Matvælaframleiðsla, án fiskvinnslu“. Gamla inline-lykkjan
  // las bara lyklana og hefði skilað grein 10; hér er farið eftir útilokuninni.
  assert.equal(veljaGrein(MAP, HEILD, '10200').label, 'Hagkerfið');
  assert.equal(veljaGrein(MAP, HEILD, '10100').label, MAP['10'].label);   // önnur matvælaframleiðsla helst
});

// ── Samanburðarreglan ─────────────────────────────────────────────────────────
test('betriEnGrein: hærra-betra mælikvarðar', () => {
  assert.equal(betriEnGrein(0.5, 0.4, true), true);
  assert.equal(betriEnGrein(0.4, 0.4, true), true);      // jafnt telst betra (viðmiðið er meðaltal)
  assert.equal(betriEnGrein(0.3, 0.4, true), false);
});

test('betriEnGrein: lægra-betra mælikvarðar (skuldir/eigið fé)', () => {
  assert.equal(betriEnGrein(1.0, 1.5, false), true);
  assert.equal(betriEnGrein(1.5, 1.5, false), true);
  assert.equal(betriEnGrein(2.0, 1.5, false), false);
  assert.equal(betriEnGrein(0, 1.5, false), true);        // skuldlaust félag
});

test('betriEnGrein: NEIKVÆTT D/E er aldrei betra (neikvætt eigið fé)', () => {
  // −3 er ekki „langt undir viðmiði“ heldur gjaldþrotamerki. Áður taldist það betra en greinin,
  // gaf grænt strik í samanburðarkassanum OG hjálpaði félaginu upp í lánshæfismatinu.
  assert.equal(betriEnGrein(-3, 1.5, false), false);
  assert.equal(betriEnGrein(-0.01, 1.5, false), false);
});

test('betriEnGrein: gildi sem vantar → null (ekki false)', () => {
  assert.equal(betriEnGrein(null, 1.5, false), null);
  assert.equal(betriEnGrein(1.0, null, false), null);
  assert.equal(betriEnGrein(undefined, undefined, true), null);
});

// ── F2-stigin ─────────────────────────────────────────────────────────────────
const S = { framlegd: 0.4, hagnadarhlutfall: 0.05, eiginfjarhlutfall: 0.4, eignavelta: 1.2, skuldahlutfall_DE: 1.5 };

test('greinStig: meirihluti yfir viðmiði → +4', () => {
  const r = greinStig({ framlegd: 0.5, hagnhlutf: 0.08, eiginfjarhlutf: 0.5, eignavelta: 1.0, de: 2.0 }, S);
  assert.equal(r.better, 3);
  assert.equal(r.alls, 5);
  assert.equal(r.delta, 4);
  assert.equal(r.status, 'g');
});

test('greinStig: nánast allt undir viðmiði → −5', () => {
  const r = greinStig({ framlegd: 0.2, hagnhlutf: 0.01, eiginfjarhlutf: 0.1, eignavelta: 0.5, de: 3.0 }, S);
  assert.equal(r.better, 0);
  assert.equal(r.delta, -5);
});

test('greinStig: 2 af 5 → hlutlaust', () => {
  const r = greinStig({ framlegd: 0.5, hagnhlutf: 0.08, eiginfjarhlutf: 0.1, eignavelta: 0.5, de: 3.0 }, S);
  assert.equal(r.better, 2);
  assert.equal(r.delta, 0);
  assert.equal(r.status, 'n');
});

test('greinStig: færri en 3 samanburðarhæfir → engin ályktun', () => {
  assert.equal(greinStig({ framlegd: 0.5, hagnhlutf: 0.08 }, S), null);
  assert.equal(greinStig({}, S), null);
  assert.equal(greinStig(null, S), null);
  assert.equal(greinStig({ framlegd: 0.5 }, null), null);
});

test('greinStig: neikvætt eigið fé hjálpar félaginu EKKI upp fyrir viðmiðið', () => {
  // Félag með neikvætt eigið fé: eiginfjárhlutfall neikvætt (verra) og D/E neikvætt.
  // Áður taldist D/E-liðurinn „betri en greinin“ og lyfti félaginu úr 2/5 í 3/5 → úr 0 í +4.
  const gjaldthrota = { framlegd: 0.5, hagnhlutf: 0.08, eiginfjarhlutf: -0.2, eignavelta: 0.5, de: -3 };
  const r = greinStig(gjaldthrota, S);
  assert.equal(r.better, 2);
  assert.equal(r.delta, 0);
  assert.notEqual(r.delta, 4);
});

test('GREIN_MAELIKVARDAR: fimm mælikvarðar, aðeins D/E er lægra-betra', () => {
  assert.equal(GREIN_MAELIKVARDAR.length, 5);
  const laegra = GREIN_MAELIKVARDAR.filter((m) => !m[2]);
  assert.deepEqual(laegra.map((m) => m[0]), ['de']);
});
