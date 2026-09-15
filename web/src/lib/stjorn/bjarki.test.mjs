import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bjarkiGogn } from './bjarki.mjs';

const NU = Date.UTC(2026, 8, 15) / 1000;
const SVAR = {
  ok: true,
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

test('dagatalið að tæmast er ÁBENDING, ekki þögn', () => {
  const brátt = bjarkiGogn(Object.assign({}, SVAR, { dagatal: Object.assign({}, SVAR.dagatal, { dagarFram: 6 }) }), [], NU);
  assert.ok(brátt.bidur.some((r) => /dagatalið/i.test(r.titill)), 'sex dagar eftir → ábending');
  const nog = bjarkiGogn(SVAR, [], NU);
  assert.ok(!nog.bidur.some((r) => /dagatalið/i.test(r.titill)), 'níu dagar eru nóg');
});

test('óflokkuð verk bíða þín — annars veit hann ekki um hvað þau fjölluðu', () => {
  const g = bjarkiGogn(SVAR, [], NU);
  assert.ok(g.bidur.some((r) => /óflokk/i.test(r.titill)));
});

test('tillögur birtast með rökunum sínum', () => {
  const g = bjarkiGogn(SVAR, [], NU);
  assert.ok(g.bidur.some((r) => /Verðbólga/.test(r.titill)));
  assert.ok(g.bidur.some((r) => /3,1×/.test(r.vidbot)));
});

test('Postiz óstillt eða niðri → sagt berum orðum, engin ágiskun', () => {
  assert.match(bjarkiGogn({ ok: false, error: 'unconfigured' }, [], NU).stada, /óstillt/i);
  assert.match(bjarkiGogn({ ok: true, villa: 'postiz', dagatal: SVAR.dagatal }, [], NU).stada, /svarar ekki/i);
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
