import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hrafnGogn } from './hrafn.mjs';

const NU = 1_800_000_000;
const PR = 'https://github.com/aronheidar/KARP-2.0/pull/10';
const OV = { now: NU, tickets: { list: [
  { id: 1, stada: 'lokad', updated: NU - 86400, efni: 'Leirdalur', cto_pr: PR },
  { id: 2, stada: 'tillaga', updated: NU - 3600, efni: 'Önnur villa', cto_pr: PR },
  { id: 3, stada: 'cto', updated: NU - 600, efni: 'Í vinnslu', cto_pr: null },
], by: {} } };

test('staðan segir hvort main sé grænt', () => {
  assert.match(hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).stada, /main grænt/);
  assert.match(hrafnGogn(OV, { ok: true, bilanir: [{ uppspretta: 'CI', lysing: 'main er rautt', alvarleiki: 'hatt', sidan: NU - 100, slod: 'u' }] }, [], NU).stada, /main rautt/);
});

test('lagfæringar eru taldar eftir PR, ekki eftir merkingu keyrslunnar', () => {
  const t = hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).tolur.find((x) => x.l === 'skiluðu lagfæringu');
  assert.equal(t.n, '2', 'báðar beiðnir með cto_pr teljast — önnur keyrslan er merkt failure í GitHub');
});

test('bilanir sem eru ekki HÁAR birtast samt á spjaldinu', () => {
  const g = hrafnGogn(OV, { ok: true, bilanir: [
    { uppspretta: 'Bygging', lysing: 'Workers Builds: karp2 fellur á main', alvarleiki: 'midlungs', sidan: NU - 500, slod: 'u' },
  ] }, [], NU);
  assert.ok(g.vinnsla.some((v) => /karp2/.test(v.texti)), 'miðlungs bilun sést hér þótt hún trufli ekki forstofuna');
});

test('fimm efstu eru valdar EFTIR alvarleika — viðvörun um þagnaðan straum felst ekki aftan við vægari færslur', () => {
  // Upprunaröð bilanalistans er CI, bygging, CTO, vaktir, straumar, PR. Spjaldið sýnir fimm efstu, svo án röðunar
  // hvarf miðlungs straumviðvörun aftan við fimm aðrar færslur (yfirferð 21.9).
  const b = (uppspretta, alvarleiki, lysing) => ({ uppspretta, alvarleiki, lysing, sidan: NU - 100, slod: 'u' });
  const g = hrafnGogn({ now: NU, tickets: { list: [], by: {} } }, { ok: true, bilanir: [
    b('Bygging', 'midlungs', 'bygging 1'), b('Bygging', 'midlungs', 'bygging 2'), b('CTO', 'lagt', 'cto'),
    b('Bygging', 'midlungs', 'bygging 3'), b('Vakt', 'hatt', 'vakt'), b('Straumur', 'midlungs', 'VB þagnaður'),
    b('PR', 'midlungs', 'pr'),
  ] }, [], NU);
  assert.deepEqual(g.vinnsla.map((v) => v.texti), ['vakt', 'bygging 1', 'bygging 2', 'bygging 3', 'VB þagnaður'],
    'hátt fyrst, síðan miðlungs í upprunaröð, og lágt víkur');
});

test('röðunin breytir ekki listanum sem kemur inn', () => {
  const inn = [{ uppspretta: 'CTO', alvarleiki: 'lagt', lysing: 'a', sidan: 1 }, { uppspretta: 'CI', alvarleiki: 'hatt', lysing: 'b', sidan: 2 }];
  hrafnGogn({ now: NU, tickets: { list: [], by: {} } }, { ok: true, bilanir: inn }, [], NU);
  assert.deepEqual(inn.map((x) => x.lysing), ['a', 'b']);
});

test('úrelt gögn eru merkt í stað þess að þykjast fersk', () => {
  const g = hrafnGogn(OV, { ok: true, villa: 'github', bilanir: [], sott: NU - 7200 }, [], NU);
  assert.match(g.stada, /GitHub svarar ekki/);
});

test('rofinn er Hrafns, ekki Sigrúnar', () => {
  assert.equal(hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).rofi.lykill, 'rofi_hrafn');
});

test('heimildirnar nefna girðingarnar sem cto.yml framfylgir', () => {
  const h = hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).heimildir.join(' | ');
  assert.match(h, /web\//);
  assert.match(h, /prófin/);
  assert.match(h, /merge/);
});

test('tóm gögn fella ekki spjaldið', () => {
  const g = hrafnGogn({}, {}, [], NU);
  assert.ok(Array.isArray(g.tolur));
  assert.equal(g.bidur.length, 0);
});

test('rofa-staða kemur úr tickets.rofar', () => {
  const g = hrafnGogn({ tickets: { list: [], rofar: { rofi_hrafn: true } } }, {}, [], NU);
  assert.equal(g.rofi.off, true);
});

test('hlutbyggður listi er merktur ófullnægjandi og nefnir hvaða uppsprettur vantar', () => {
  const g = hrafnGogn(OV, { ok: true, villa: 'hluti', vantar: ['PR'], bilanir: [
    { uppspretta: 'CI', lysing: 'main er rautt', alvarleiki: 'hatt', sidan: NU - 100, slod: 'u' },
  ] }, [], NU);
  assert.match(g.stada, /ófullnægjandi/, 'á ekki að þykjast vera fullur listi þótt sumar uppsprettur svöruðu');
  assert.match(g.stada, /PR/, 'nefnir hvaða uppsprettu vantar — ekki bara AÐ eitthvað vanti');
  assert.notEqual(g.stada, hrafnGogn(OV, { ok: true, villa: 'github', bilanir: [], sott: NU - 7200 }, [], NU).stada,
    'hluti og github eru sitthvort ástandið — annað er gamalt, hitt er ferskt en gapað');
});

test('main-kubburinn segir óvíst þegar CI-uppsprettan svaraði ekki — en veit litinn þegar önnur uppspretta vantar', () => {
  const vantarCi = hrafnGogn(OV, { ok: true, villa: 'hluti', vantar: ['CI', 'PR'], bilanir: [] }, [], NU);
  const t1 = vantarCi.tolur.find((x) => x.l === 'main');
  assert.equal(t1.n, 'óvíst');
  assert.match(t1.s, /CI svaraði ekki/);
  const vantarPr = hrafnGogn(OV, { ok: true, villa: 'hluti', vantar: ['PR'], bilanir: [] }, [], NU);
  assert.equal(vantarPr.tolur.find((x) => x.l === 'main').n, 'grænt', 'CI svaraði — liturinn er þekktur');
});

test('ógilt svar frá bilanalista er óvissa, ekki grænt ljós', () => {
  for (const svar of [{ ok: false, error: 'unconfigured' }, { ok: false }, {}, { ok: true, villa: 'github', bilanir: [] }]) {
    const g = hrafnGogn(OV, svar, [], NU);
    assert.equal(g.tolur.find((x) => x.l === 'main').n, 'óvíst', JSON.stringify(svar));
  }
  assert.match(hrafnGogn(OV, { ok: false, error: 'unconfigured' }, [], NU).stada, /náðist ekki/);
});
