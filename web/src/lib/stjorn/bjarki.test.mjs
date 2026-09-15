import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bjarkiGogn } from './bjarki.mjs';

const NU = Date.UTC(2026, 8, 15) / 1000;
const SVAR = {
  ok: true,
  postiz: { ok: true, sott: NU, verk: [] },
  dagatal: { iRod: 4, dagarFram: 9, naesta: { ts: NU + 2 * 86400, texti: 'Kvótinn þéttist', rasir: ['linkedin-page', 'facebook'] }, birtSidast: { ts: NU - 3 * 86400, texti: 'Fjárlögin' } },
  safn: [{ id: 1, titill: 'Kvótinn þéttist', efnistok: 'Sjávarútvegur', birt: NU - 3 * 86400 }, { id: 2, titill: 'Óflokkað verk', efnistok: null, birt: null }],
  tillogur: [{ malefni: 'Verðbólga', hlutfall: 3.1, vika: 9, vara: 'Vaxtasíðan', slod: '/vextir/', tala: 'verðbólga og stýrivextir', rok: 'Umfjöllun um verðbólgu er 3,1× venjuleg þessa vikuna (9 greinar).' }],
  rofi: false,
};

test('staðan segir hve langt dagatalið nær — talan sem segir hvort þú sért á eftir', () => {
  const g = bjarkiGogn(SVAR, [], NU);
  assert.match(g.stada, /9 daga/);
  assert.match(g.stada, /4/);
});

// ⚠ Raðirnar sjálfar (dagatal að tæmast / óflokkað verk / tillögur) eru smíðaðar í bidurThin núna —
//   sjá bidur_thin.test.mjs. Hér er AÐEINS staðfest að bjarkiGogn síi bidurListi niður á Bjarka, nákvæmlega
//   eins og sigrun.mjs og hrafn.mjs gera fyrir sín spjöld.
test('bidur síar bidurListi niður í raðir Bjarka — smíð raðanna er á ábyrgð bidurThin', () => {
  const bidurListi = [
    { starfsmadur: 'bjarki', tegund: 'dagatal', titill: 'Dagatalið tæmist eftir 3 daga', vidbot: '', sidan: NU, slod: '#bjarki', bid: 0, adkallandi: false },
    { starfsmadur: 'sigrun', tegund: 'svar', titill: '#1 — bíður svars', vidbot: '', sidan: NU, slod: '#ticket-1', bid: 0, adkallandi: false },
  ];
  const g = bjarkiGogn(SVAR, bidurListi, NU);
  assert.deepEqual(g.bidur, [bidurListi[0]], 'aðeins röð Bjarka fer í gegn — hitt tilheyrir öðrum spjöldum');
});

test('Postiz óstillt, niðri eða ónáanlegt → sagt berum orðum á RÉTTU dýpi (villan er inni í svar.postiz)', () => {
  assert.match(bjarkiGogn(Object.assign({}, SVAR, { postiz: { ok: false, error: 'unconfigured' } }), [], NU).stada, /óstillt/i);
  assert.match(bjarkiGogn(Object.assign({}, SVAR, { postiz: { ok: true, villa: 'postiz' } }), [], NU).stada, /svarar ekki/i);
  assert.match(bjarkiGogn({ ok: false }, [], NU).stada, /náði ekki sambandi/i);
  // Og öfugt: flatt svar á gamla forminu má EKKI lengur lesast sem „allt í lagi"
  assert.ok(!/óstillt/i.test(bjarkiGogn(SVAR, [], NU).stada), 'eðlilegt svar er eðlilegt');
});

test('tóm gögn fella ekki spjaldið', () => {
  const g = bjarkiGogn({}, [], NU);
  assert.ok(Array.isArray(g.tolur));
  assert.equal(g.bidur.length, 0);
  assert.equal(g.rofi.lykill, 'rofi_bjarki');
});

test('heimildirnar segja skýrt að hann birti ekki sjálfur', () => {
  assert.match(bjarkiGogn(SVAR, [], NU).heimildir.join(' | '), /aldrei birta/i);
});
