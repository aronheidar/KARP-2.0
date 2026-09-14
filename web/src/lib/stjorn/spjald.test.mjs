import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, spjald } from './spjald.mjs';

const GRUNNUR = { id: 'sigrun', nafn: 'Sigrún', hlutverk: 'þjónustufulltrúi', avatar: '<svg id="a"></svg>', stada: '1 opin beiðni', sidast: 'í dag 18:00' };

test('esc: gerir < > & " og einkvæmt úrfellingarmerki skaðlaus', () => {
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(esc("O'Brien & co"), 'O&#39;Brien &amp; co');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
});

test('haus ber nafn, hlutverk og stöðu — og avatarinn fer ÓBREYTTUR inn (fast SVG)', () => {
  const h = spjald(GRUNNUR);
  assert.match(h, /Sigrún/);
  assert.match(h, /þjónustufulltrúi/);
  assert.match(h, /1 opin beiðni/);
  assert.ok(h.includes('<svg id="a"></svg>'), 'avatar er ekki esc-aður');
  assert.match(h, /data-starfsmadur="sigrun"/);
});

test('tómt hólf birtist EKKI — engin núll til að fylla formið', () => {
  const h = spjald(GRUNNUR);
  assert.ok(!h.includes('Bíður þín'));
  assert.ok(!h.includes('Í vinnslu'));
  assert.ok(!h.includes('Tölur sem ég vakta'));
  assert.ok(!h.includes('Það sem ég má gera'));
});

test('hólf birtast þegar þau hafa innihald, og talan fylgir fyrirsögninni', () => {
  const h = spjald(Object.assign({}, GRUNNUR, {
    bidur: [{ titill: '#1 — bíður svars', vidbot: 'Villa á síma', slod: '#ticket-1', bid: 7200, adkallandi: false, tegund: 'svar' }],
    vinnsla: [{ texti: 'Staðfesting send á #2', hvenaer: 'í gær' }],
    tolur: [{ n: '3', l: 'opnar beiðnir', s: '1 ný' }],
    heimildir: ['sendir staðfestingu sjálf', 'aldrei AI-saminn texta'],
  }));
  assert.match(h, /Bíður þín <span[^>]*>1<\/span>/);
  assert.match(h, /#1 — bíður svars/);
  assert.match(h, /Villa á síma/);
  assert.match(h, /href="#ticket-1"/);
  assert.match(h, /Staðfesting send á #2/);
  assert.match(h, /opnar beiðnir/);
  assert.match(h, /aldrei AI-saminn texta/);
});

test('allt módel-/notendatengt er esc-að', () => {
  const h = spjald(Object.assign({}, GRUNNUR, {
    nafn: '<b>x</b>',
    bidur: [{ titill: '<script>a()</script>', vidbot: '"gæsalappir"', slod: '#t', bid: 0, adkallandi: false, tegund: 'svar' }],
  }));
  assert.ok(!h.includes('<script>a()</script>'));
  assert.ok(!h.includes('<b>x</b>'));
  assert.match(h, /&lt;script&gt;/);
});

test('aðkallandi lína fær merkingu sem hægt er að stílsetja', () => {
  const h = spjald(Object.assign({}, GRUNNUR, { bidur: [{ titill: 'gamalt', vidbot: '', slod: '#a', bid: 200000, adkallandi: true, tegund: 'svar' }] }));
  assert.match(h, /stj-bidur-rod--adkallandi/);
});

test('rofi birtist aðeins þegar lykill fylgir, og textinn segir hvað smellur gerir', () => {
  assert.ok(!spjald(GRUNNUR).includes('stj-rofi'));
  const a = spjald(Object.assign({}, GRUNNUR, { rofi: { lykill: 'hjalp_agent_off', off: false } }));
  assert.match(a, /data-rofi="hjalp_agent_off"/);
  assert.match(a, /slökkva/);
  const b = spjald(Object.assign({}, GRUNNUR, { rofi: { lykill: 'hjalp_agent_off', off: true } }));
  assert.match(b, /kveikja/);
});
