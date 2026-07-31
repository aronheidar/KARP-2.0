// sanctions-handler.test.mjs — próf á sjálfri LEIÐAR-ákvörðuninni í sanctionsHandler
// (worker/veitur.mjs): hvort fylki (hits eða veikar) samsvörun lendir í.
//
// src/lib/kyc.test.mjs prófar EINGÖNGU samning kyc.mjs með hits/veikar-fylkjum sem
// prófið sjálft smíðar í höndunum — það keyrir aldrei router-kóðann sem raunverulega
// ákveður hvort samsvörun endi í hits eða veikar. Gagnrýnandi sýndi fram á að ef
// leiðar-ternary-inn í sanctionsHandler væri á hvolfi (allt lenti í hits), myndi
// eins-orðs nafn eins og "Rosneft" framkalla falska critical-viðvörun — og öll þrjú
// kyc.test.mjs-prófin féllu samt EKKI, því þau sjá aldrei router-kóðann. Þessi skrá
// flytur sanctionsHandler beint inn og keyrir hann með tilbúnu env til að loka því gati.
//
// ⚠ MINNISVARI: sanctionsIndex() í veitur.mjs geymir niðurstöðu sína í einingar-breytu
// (SANCTIONS_IDX) og augGet() í felag.mjs gerir slíkt hið sama (AUG_CACHE) — HVORT
// TVEGGJA er per-ferli, ekki per-próf. Fyrsta fixture sem nær í gegn er notuð það sem
// eftir lifir af keyrslunni, óháð því hvaða env er sent í síðari köll. Þess vegna: EIN
// sameiginleg fixture fyrir skrána alla, notuð í hverju prófi — EKKI reyna að skipta um
// fixture milli prófa (það yrði hljóðlaust hunsað og myndi fela villur frekar en finna).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanctionsHandler } from '../src/worker/veitur.mjs';

// Ein sameiginleg fixture: 1 fjöl-orða (sterk) færsla + 1 eins-orðs (veik) færsla.
// 'n' er lyklunarformið sem byggjaVisitolu klýfur beint á orðabil (sjá refsilistar.mjs);
// 'nafn' er birtingarnafnið sem endar í listi-svæði svarsins. Fyrir veika samsvörun
// krefst skima() þess að fyrirspurnin sé stafrétt sama (án tillits til há-/lágstafa og
// broddstafa) og 'nafn' — því er veik-færslan 'Rosneft' með fyrirspurnina 'Rosneft'.
const FIXTURE = {
  updated: '2026-07-30',
  names: [
    { n: 'saddam hussein', nafn: 'SADDAM HUSSEIN AL-TIKRITI', listar: ['OFAC SDN'] },
    { n: 'rosneft', nafn: 'Rosneft', listar: ['EU 269/2014'] },
  ],
};

// env.ASSETS.fetch hunsar Request-hlutinn sem augGet smíðar og skilar alltaf sömu
// fixture — enda skiptir innihald hennar ekki máli eftir fyrsta kall (sjá minnisvara).
const fakeEnv = () => ({ ASSETS: { fetch: async () => ({ json: async () => FIXTURE }) } });

function mkReq(namesCsv) {
  const u = new URL('https://karp.internal/api/refsilistar');
  u.searchParams.set('names', namesCsv);
  return { url: u.toString() };
}

async function call(namesCsv) {
  const res = await sanctionsHandler(mkReq(namesCsv), fakeEnv(), {});
  return res.json();
}

test('fjöl-orða (sterk) samsvörun lendir í hits — EKKI í veikar', async () => {
  const j = await call('Saddam Hussein');
  assert.deepEqual(j.hits, [{ nafn: 'Saddam Hussein', listi: 'SADDAM HUSSEIN AL-TIKRITI', listar: ['OFAC SDN'] }]);
  assert.deepEqual(j.veikar, []);
});

test('eins-orðs (veik) samsvörun lendir í veikar — EKKI í hits, og hits er tómt', async () => {
  const j = await call('Rosneft');
  assert.deepEqual(j.veikar, [{ nafn: 'Rosneft', listi: 'Rosneft', listar: ['EU 269/2014'] }]);
  assert.deepEqual(j.hits, []);
});

test('bæði í sömu fyrirspurn: hvor samsvörun lendir í sínu fylki, hvorug lekur yfir í hina', async () => {
  const j = await call('Saddam Hussein,Rosneft');
  assert.deepEqual(j.hits, [{ nafn: 'Saddam Hussein', listi: 'SADDAM HUSSEIN AL-TIKRITI', listar: ['OFAC SDN'] }]);
  assert.deepEqual(j.veikar, [{ nafn: 'Rosneft', listi: 'Rosneft', listar: ['EU 269/2014'] }]);
});

test('nafn sem samsvarar engu er hvorki í hits né veikar', async () => {
  const j = await call('Jón Jónsson');
  assert.deepEqual(j.hits, []);
  assert.deepEqual(j.veikar, []);
});

test('svarið ber hits, veikar, updated, n og nVeik', async () => {
  const j = await call('Jón Jónsson');
  assert.deepEqual(Object.keys(j).sort(), ['hits', 'n', 'nVeik', 'updated', 'veikar']);
  assert.equal(j.updated, '2026-07-30');
  assert.equal(j.n, 1);
  assert.equal(j.nVeik, 1);
});

test('hits-færslur hafa lögunina { nafn, listi, listar }', async () => {
  const j = await call('Saddam Hussein');
  assert.equal(j.hits.length, 1);
  assert.deepEqual(Object.keys(j.hits[0]).sort(), ['listar', 'listi', 'nafn']);
});
