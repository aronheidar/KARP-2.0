import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, spjald, bidurRod } from './spjald.mjs';

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

test('EIGINDI: gögn geta ekki brotist út úr href, data- eða class-eigindum', () => {
  const arás = '" onmouseover="alert(1)" x="';
  const h = spjald(Object.assign({}, GRUNNUR, {
    id: arás,
    bidur: [{ titill: 'x', vidbot: arás, slod: '#t' + arás, bid: 0, adkallandi: false, tegund: arás }],
    vinnsla: [{ texti: 'y', hvenaer: arás }],
    tolur: [{ n: arás, l: arás, s: arás }],
    heimildir: [arás],
    rofi: { lykill: arás, off: false },
  }));
  // Vörnin er sú að gæsalöpp komist ekki út úr eigindi — ekki að orðið „onmouseover" hverfi.
  // Rétt escape-uð gögn bera áfram textann `onmouseover=` sem MEINLAUSAN texta inni í eigindinu.
  assert.ok(!/\son[a-z]+=["'][^"']*["']/i.test(h), 'ekkert VIRKT atburða-eigind varð til');
  assert.ok(!h.includes('" onmouseover'), 'engin hrá gæsalöpp braut út úr eigindi');
  assert.ok(h.includes('&quot;'), 'gæsalappirnar eru escape-aðar, ekki fjarlægðar');
  assert.ok(h.includes('onmouseover=&quot;'), 'árásartextinn stendur eftir sem meinlaus texti — það er rétt hegðun');
});

test('SLÓÐIR: aðeins kjölfestur og https komast í href', () => {
  const rod = (slod) => ({ titill: 't', vidbot: '', slod, bid: 0, adkallandi: false, tegund: 'svar' });
  const h = spjald(Object.assign({}, GRUNNUR, { bidur: [rod('javascript:alert(1)'), rod('data:text/html,<script>'), rod('#ticket-4'), rod('https://github.com/x/y/pull/1')] }));
  assert.ok(!h.includes('javascript:'), 'javascript-slóð stöðvuð');
  assert.ok(!h.includes('data:text/html'), 'data-slóð stöðvuð');
  assert.match(h, /href="#ticket-4"/);
  assert.match(h, /href="https:\/\/github\.com\/x\/y\/pull\/1"/);
});

test('GÖLLUÐ GÖGN: spjaldið teiknast áfram þótt listaviðfang sé rangrar tegundar', () => {
  for (const rusl of ['strengur', {}, 42, true]) {
    const h = spjald(Object.assign({}, GRUNNUR, { bidur: rusl, vinnsla: rusl, tolur: rusl, heimildir: rusl }));
    assert.match(h, /Sigrún/, String(rusl));
    assert.ok(!h.includes('Bíður þín'), 'ónothæf gögn birtast ekki sem tómt hólf');
  }
  const meðRusli = spjald(Object.assign({}, GRUNNUR, { bidur: [null, { titill: 'gild', vidbot: '', slod: '#a', bid: 0, adkallandi: false, tegund: 'svar' }], heimildir: [null, 'gild heimild', 42] }));
  assert.match(meðRusli, /gild/);
  assert.match(meðRusli, /gild heimild/);
});

test('bidurRod er EIN uppspretta — slóðavörnin fylgir hvort sem andlit er með eða ekki', () => {
  const r = { titill: 't', vidbot: '', slod: 'javascript:alert(1)', bid: 60, adkallandi: false, tegund: 'svar', starfsmadur: 'hrafn' };
  for (const andlit of ['', 'Hrafn']) {
    const h = bidurRod(r, { andlit });
    assert.ok(!h.includes('javascript:'), 'slóðin stöðvuð (andlit: ' + (andlit || 'ekkert') + ')');
    assert.match(h, /href="#"/);
  }
  assert.match(bidurRod(r, { andlit: 'Hrafn' }), /stj-bidur-hver/);
  assert.ok(!bidurRod(r).includes('stj-bidur-hver'), 'ekkert andlit þegar það er ekki beðið um það');
});
