import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mod from './sent_detect.js';
const { pickSent } = mod;
const HER = path.dirname(fileURLToPath(import.meta.url));

const SE = (updated, companies) => ({ updated, companies });
const F = (idx, n = 20) => ({ idx, n });
const G = (dags, idx, birt) => ({ dags, idx, birt: birt || {} });

// ── hegðun sem var þegar vörðuð (22.9.2026) ─────────────────────────────────
test('sveifla ≥ 40 gegn grunni frá deginum áður verður frambjóðandi, stærsta fyrst', () => {
  const grunnur = G('2026-09-22', { IKEA: -20, Skel: 10, Hagar: 0 });
  const { cand } = pickSent(SE('2026-09-23', { IKEA: F(29), Skel: F(-45), Hagar: F(30) }), grunnur);
  assert.deepEqual(cand.map((c) => [c.nafn, c.fra, c.i]), [['Skel', 10, -45], ['IKEA', -20, 29]]);
  assert.equal(cand[0].n, 20);
});

test('grunnur á gamla sniðinu (án dagsetningar) er ekki borinn saman: þögul endurstilling', () => {
  // 22.9.2026: state.sent geymdi júnígildi (IKEA -100) og sentiment.json lifnaði við sama dag
  const { cand, grunnur } = pickSent(SE('2026-09-22', { IKEA: F(29, 14) }), { IKEA: -100, Skel: -100 });
  assert.deepEqual(cand, []);
  assert.deepEqual(grunnur, { dags: '2026-09-22', idx: { IKEA: 29 }, birt: {} });
});

test('grunnur eldri en 3 daga er ekki borinn saman', () => {
  const g = G('2026-06-28', { IKEA: -100 });
  assert.deepEqual(pickSent(SE('2026-09-22', { IKEA: F(29) }), g).cand, []);
  const g3 = G('2026-09-19', { IKEA: -100 });
  assert.equal(pickSent(SE('2026-09-22', { IKEA: F(29) }), g3).cand.length, 1, '3 dagar eru enn nothæfir');
});

test('grunnurinn geymir aðeins félög með a.m.k. 5 fréttum', () => {
  const { grunnur } = pickSent(SE('2026-09-22', { A: F(-100, 2), B: F(40, 5), C: { idx: null, n: 30 } }), null);
  assert.deepEqual(grunnur.idx, { B: 40 });
});

test('núverandi gildi á færri en 5 fréttum verður ekki frétt', () => {
  const g = G('2026-09-22', { A: -60 });
  assert.deepEqual(pickSent(SE('2026-09-23', { A: F(40, 4) }), g).cand, []);
});

test('grunnur með dagsetningu Á EFTIR skránni (skrá færð aftur) er ekki borinn saman', () => {
  const g = G('2026-09-24', { A: -60 });
  assert.deepEqual(pickSent(SE('2026-09-23', { A: F(40) }), g).cand, []);
});

test('þak: sjálfgefið 3 frambjóðendur', () => {
  const g = G('2026-09-22', { A: 0, B: 0, C: 0, D: 0 });
  const { cand } = pickSent(SE('2026-09-23', { A: F(50), B: F(60), C: F(70), D: F(80) }), g);
  assert.deepEqual(cand.map((c) => c.nafn), ['D', 'C', 'B']);
});

// ── NÝTT: tóm eða hálf skrá má ekki þurrka grunninn ─────────────────────────
test('⭐ dagsett TÓM skrá þurrkar ekki grunninn — build_sentiment.js skrifaði án seiglu', () => {
  // build_sentiment.js skrifaði skilyrðislaust: bili fréttasafnið eða skorunin verður `companies` tómt og
  // `updated` samt dagurinn í dag. Grunnurinn varð þá DAGSETT TÓM vörpun — lítur gild út en geymir ekkert.
  const g = G('2026-09-21', { 'Arion banki': -25, Nova: 56, Hagar: 10 });
  const r = pickSent(SE('2026-09-22', {}), g);
  assert.deepEqual(r.cand, []);
  assert.deepEqual(r.grunnur, g, 'grunnurinn verður að standa ÓBREYTTUR');
});

test('hálf skrá (færri en 50% félaga) þurrkar ekki grunninn', () => {
  const g = G('2026-09-21', { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
  const halft = pickSent(SE('2026-09-22', { A: F(60), B: F(60) }), g);   // 2 af 6 = 33%
  assert.deepEqual(halft.cand, []);
  assert.deepEqual(halft.grunnur, g);
  const nogu = pickSent(SE('2026-09-22', { A: F(60), B: F(0), C: F(0) }), g);   // 3 af 6 = 50%
  assert.deepEqual(nogu.cand.map((c) => c.nafn), ['A'], '50% nákvæmlega er nothæft');
  assert.deepEqual(Object.keys(nogu.grunnur.idx), ['A', 'B', 'C']);
});

test('engin, ódagsett eða ógild skrá heldur grunninum óbreyttum', () => {
  const g = G('2026-09-21', { A: 0 });
  for (const se of [null, undefined, {}, SE(undefined, { A: F(90) }), SE('ógilt', { A: F(90) })]) {
    assert.deepEqual(pickSent(se, g), { cand: [], grunnur: g }, String(JSON.stringify(se)).slice(0, 60));
  }
});

test('tómur grunnur er ekki verndaður (fyrsta keyrsla fyllir hann)', () => {
  const { grunnur } = pickSent(SE('2026-09-22', { A: F(10), B: F(20) }), G('2026-09-21', {}));
  assert.deepEqual(Object.keys(grunnur.idx), ['A', 'B']);
});

// ── NÝTT: kæling per félag (flökt-vörn) ─────────────────────────────────────
test('⭐ sama félag fær ekki tvær tónfréttir innan 30 daga þótt vísitalan sveiflist til baka', () => {
  // idx = round(meðaltal skora × 100). Hjá litlu félagi (n=6–7) geta TVÆR nýjar fréttir fært vísitöluna um 40+
  // stig, og til baka daginn eftir. Án kælingar varð hver sveifla ný frétt — og `sent-${TODAY}-…` gaf henni nýtt
  // id svo seen-dedup stöðvaði hana ekki.
  const g0 = G('2026-09-22', { 'CCP Games': -20 });
  const d1 = pickSent(SE('2026-09-23', { 'CCP Games': F(29, 6) }), g0);
  assert.equal(d1.cand.length, 1, 'fyrsta sveiflan er frétt');
  assert.equal(d1.grunnur.birt['CCP Games'], '2026-09-23', 'birtingin er skráð');
  const d2 = pickSent(SE('2026-09-24', { 'CCP Games': F(-20, 6) }), d1.grunnur);
  assert.deepEqual(d2.cand, [], 'sveiflan til baka daginn eftir er ekki ný frétt');
  assert.equal(d2.grunnur.idx['CCP Games'], -20, 'grunnurinn fylgir samt vísitölunni');
  assert.equal(d2.grunnur.birt['CCP Games'], '2026-09-23', 'birtingardagurinn helst');
});

test('kælingin rennur út eftir 30 daga', () => {
  const g = { dags: '2026-10-22', idx: { A: -20 }, birt: { A: '2026-09-23' } };
  assert.equal(pickSent(SE('2026-10-23', { A: F(40) }), g).cand.length, 1, '30 dagar liðnir: ný frétt leyfð');
  const g29 = { dags: '2026-10-21', idx: { A: -20 }, birt: { A: '2026-09-23' } };
  assert.deepEqual(pickSent(SE('2026-10-22', { A: F(40) }), g29).cand, [], '29 dagar: enn í kælingu');
});

test('kælingarskráin vex ekki endalaust: útrunnar færslur falla út', () => {
  const g = { dags: '2026-10-22', idx: { A: 0, B: 0 }, birt: { A: '2026-09-01', B: '2026-10-22' } };
  const { grunnur } = pickSent(SE('2026-10-23', { A: F(0), B: F(0) }), g);
  assert.deepEqual(Object.keys(grunnur.birt), ['B'], 'útrunnin kæling er hreinsuð');
});

// ── NÝTT: samræmi við byggiskriftu og fréttavél ─────────────────────────────
test('build_sentiment_samantekt.mjs skrifar ekki tóma skrá — en hálfa skrá ver hún ekki', () => {
  // Skriftan sem bakar sentiment.json daglega (build_sentiment.js er leyst af hólmi og neitar að keyra).
  // Hún stöðvar TÓMA niðurstöðu við upptökin; HÁLFA skrá (fá félög með tón) skrifar hún hins vegar, og
  // þess vegna verður hlutfallsvörnin hér að ofan að vera í skynjaranum líka.
  const src = fs.readFileSync(path.join(HER, 'build_sentiment_samantekt.mjs'), 'utf8');
  assert.match(src, /skrifa EKKI/, 'tóm niðurstaða má ekki fara á disk');
  assert.match(src, /!Object\.keys\(companies\)\.length/, 'ekkert félag með tón → engin ritun');
  const gamla = fs.readFileSync(path.join(HER, 'build_sentiment.js'), 'utf8');
  assert.match(gamla, /LEYST AF HÓLMI/, 'gamla skriftan má ekki skrifa yfir þá nýju');
});

test('fréttin ber dagsetningu SKRÁRINNAR í auðkenni sínu, ekki keyrsludaginn', () => {
  // seen-dedup lyklar á id: keyrsludagur í id gefur óbreyttri skrá nýtt id á hverjum degi.
  const src = fs.readFileSync(path.join(HER, 'build_frettavel.js'), 'utf8');
  const lina = src.split('\n').find((l) => l.includes("type: 'sent'"));
  assert.ok(lina, 'fann ekki sent-atburðinn í build_frettavel.js');
  assert.doesNotMatch(lina, /id: `sent-\$\{TODAY\}/, 'keyrsludagur má ekki vera í id');
  assert.match(lina, /id: `sent-/);
});
