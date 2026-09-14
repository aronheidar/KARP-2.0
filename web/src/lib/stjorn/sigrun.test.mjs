import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sigrunGogn } from './sigrun.mjs';

const NU = 1_800_000_000;
const OV = {
  now: NU,
  tickets: {
    open: 3, off: false, sjalfvirk: 2,
    by: { stadfest: 2, svarad: 4, lokad: 1 },
    list: [
      { id: 1, stada: 'stadfest', created: NU - 7200, updated: NU - 3600, efni: 'Villa á síma', ack_sent: NU - 7100, svar_sent: null },
      { id: 2, stada: 'svarad', created: NU - 172800, updated: NU - 86400, efni: 'Tvírukkun', ack_sent: NU - 172700, svar_sent: NU - 86400 },
      { id: 3, stada: 'lokad', created: NU - 864000, updated: NU - 800000, efni: 'Gamalt', ack_sent: NU - 863900, svar_sent: NU - 860000 },
    ],
  },
};

test('staða og tölur eru reiknaðar úr yfirlitinu', () => {
  const g = sigrunGogn(OV, [], NU);
  assert.match(g.stada, /3 opnar beiðnir/);
  const merkin = g.tolur.map((t) => t.l);
  assert.ok(merkin.includes('opnar beiðnir'));
  assert.ok(merkin.includes('miðgildi svartíma'));
  assert.ok(merkin.includes('leyst án þín'));
  assert.ok(merkin.includes('nýjar 7 daga'));
});

test('miðgildi svartíma er reiknað úr svar_sent − created, aðeins af svöruðum beiðnum', () => {
  const g = sigrunGogn(OV, [], NU);
  const t = g.tolur.find((x) => x.l === 'miðgildi svartíma');
  // Svöruðu beiðnirnar eru #2 (86.400 sek) og #3 (4.000 sek). Miðgildi tveggja gilda = meðaltal
  // þeirra = 45.200 sek ⇒ round(45200/3600) = 13 klst. #1 er ósvarað og telur ekki með.
  assert.equal(t.n, '13 klst');
  assert.equal(t.s, '2 svöruð');
});

test('engin svöruð beiðni → miðgildi sýnir striklu en fellur ekki', () => {
  const g = sigrunGogn({ now: NU, tickets: { open: 0, by: {}, list: [{ id: 9, stada: 'nytt', created: NU, updated: NU, efni: 'x' }] } }, [], NU);
  assert.equal(g.tolur.find((x) => x.l === 'miðgildi svartíma').n, '—');
});

test('bíður þín-raðir eru síaðar á Sigrúnu', () => {
  const listi = [
    { starfsmadur: 'sigrun', tegund: 'svar', titill: 'a', vidbot: '', slod: '#t1', bid: 10, adkallandi: false },
    { starfsmadur: 'hrafn', tegund: 'tillaga', titill: 'b', vidbot: '', slod: '#t2', bid: 10, adkallandi: false },
  ];
  assert.deepEqual(sigrunGogn(OV, listi, NU).bidur.map((r) => r.titill), ['a']);
});

test('rofinn ber lykil Sigrúnar og núverandi stöðu', () => {
  assert.deepEqual(sigrunGogn(OV, [], NU).rofi, { lykill: 'hjalp_agent_off', off: false });
  assert.deepEqual(sigrunGogn({ tickets: { off: true, list: [], by: {} } }, [], NU).rofi, { lykill: 'hjalp_agent_off', off: true });
});

test('heimildirnar segja skýrt hvað hún má EKKI', () => {
  const h = sigrunGogn(OV, [], NU).heimildir.join(' | ');
  assert.match(h, /aldrei/i);
  assert.match(h, /KB-svar/);
});

test('tóm gögn fella ekki spjaldið', () => {
  const g = sigrunGogn({}, [], NU);
  assert.equal(g.bidur.length, 0);
  assert.ok(Array.isArray(g.tolur));
});
