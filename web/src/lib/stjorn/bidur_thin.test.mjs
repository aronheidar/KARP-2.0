import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADKALLANDI_SEK, bidurFyrir, bidurThin } from './bidur_thin.mjs';

const NU = 1_800_000_000;
const t = (id, stada, updated, auka = {}) => Object.assign({ id, stada, updated, created: updated - 60, efni: 'Efni ' + id }, auka);

test('ein lína á hverja beiðni — sértækasta ástandið ræður', () => {
  const r = bidurThin({ now: NU, tickets: {
    list: [t(1, 'stadfest', NU - 100), t(2, 'stadfest', NU - 200), t(3, 'stadfest', NU - 300)],
    moot_osent: [2], moot_bida: [3],
  } });
  assert.deepEqual(r.map((x) => [x.tegund, x.titill]), [
    ['moot', '#3 — Moot bíður atkvæðis'],
    ['moot_osent', '#2 — samþykkt svar ósent'],
    ['svar', '#1 — bíður svars'],
  ], 'elst fyrst, og hver beiðni birtist aðeins einu sinni');
  assert.equal(r.length, 3);
});

test('beiðnir Sigrúnar og verk Hrafns lenda á réttum starfsmanni', () => {
  const r = bidurThin({ now: NU, tickets: { list: [
    t(1, 'stadfest', NU - 10),
    t(2, 'tillaga', NU - 20, { cto_pr: 'https://github.com/aronheidar/KARP-2.0/pull/10' }),
    t(3, 'cto', NU - 7200),
    t(4, 'svarad', NU - 30),
    t(5, 'lokad', NU - 40),
  ] } });
  assert.deepEqual(r.map((x) => x.starfsmadur + ':' + x.tegund), ['hrafn:cto_fast', 'hrafn:tillaga', 'sigrun:svar']);
  assert.equal(bidurFyrir(r, 'sigrun').length, 1);
  assert.equal(bidurFyrir(r, 'hrafn').length, 2);
});

test('beiðni í stöðu cto telst föst fyrst eftir klukkustund', () => {
  const nyleg = bidurThin({ now: NU, tickets: { list: [t(3, 'cto', NU - 600)] } });
  assert.deepEqual(nyleg, []);
  const fost = bidurThin({ now: NU, tickets: { list: [t(3, 'cto', NU - 3601)] } });
  assert.equal(fost[0].tegund, 'cto_fast');
});

test('aðkallandi eftir 48 klst; bid er reiknað í sekúndum', () => {
  const r = bidurThin({ now: NU, tickets: { list: [t(1, 'stadfest', NU - ADKALLANDI_SEK - 1), t(2, 'stadfest', NU - 60)] } });
  assert.equal(r[0].adkallandi, true);
  assert.equal(r[0].bid, ADKALLANDI_SEK + 1);
  assert.equal(r[1].adkallandi, false);
});

test('aðeins HÁ bilun bíður þín — miðlungs og lág fara ekki á listann', () => {
  const bilanir = [
    { uppspretta: 'CI', lysing: 'main er rautt', sidan: NU - 500, alvarleiki: 'hatt', slod: '#hrafn' },
    { uppspretta: 'PR', lysing: 'PR #3 opinn í 60 daga', sidan: NU - 900, alvarleiki: 'midlungs', slod: '#hrafn' },
  ];
  const r = bidurThin({ now: NU, tickets: {}, bilanir });
  assert.equal(r.length, 1);
  assert.equal(r[0].starfsmadur, 'hrafn');
  assert.equal(r[0].titill, 'main er rautt');
  assert.equal(r[0].vidbot, 'CI');
});

test('tóm eða gölluð gögn skila tómum lista í stað þess að kasta', () => {
  assert.deepEqual(bidurThin({}), []);
  assert.deepEqual(bidurThin({ tickets: { list: null }, bilanir: null, now: NU }), []);
  assert.deepEqual(bidurThin(), []);
});
