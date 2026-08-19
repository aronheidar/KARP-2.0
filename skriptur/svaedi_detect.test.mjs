// Próf fyrir svaedi_detect.js — fréttavél-skynjari: fasteignaverð per matssvæði HMS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pickSvaedi, fill } = require('./svaedi_detect.js');
import { slugify } from '../src/lib/format.mjs';

const zone = (heiti, medFjol, prevFjol, nFjol, extra) => Object.assign({ heiti, n12: nFjol + 10, nFjol, nSer: 10, medFjol, prevFjol, medSer: 700, prevSer: 690, nPrev: 80, man: { fra: '2024-09', med: [600, null, 610, 620, 615, 630, 640, 650, 660, 655, 670, 680], n: [5, 2, 6, 7, 5, 8, 9, 6, 7, 5, 6, 4] } }, extra || {});
const O = { todayISO: '2026-08-19', slugify };

test('pickSvaedi: aðeins svæði með |breyting| ≥ 6%, ≥40 kaup og ≥30 fyrra tímabil; titill/texti/url/id/spark rétt', () => {
  const byZone = {
    2040: zone('Njarðvík', 662, 612, 152),          // +8,2% → atburður
    340: zone('Kópavogur: Lindir, Salir', 800, 790, 100),   // +1,3% → ekkert
    11: zone('Vesturbær', 960, 1030, 20, { n12: 25 }),     // of fá kaup (25 <40)
    5: zone('Þunnt', 500, 400, 60, { nPrev: 10 }),          // fyrra tímabil of þunnt
  };
  const ev = pickSvaedi(byZone, O);
  assert.equal(ev.length, 1);
  const e = ev[0];
  assert.equal(e.type, 'svaedi');
  assert.equal(e.id, 'svaedi-2040-2026Q3');
  assert.equal(e.url, '/fasteignaverd/njardvik/');
  assert.equal(e.title, 'Njarðvík: fasteignaverð hækkaði um 8,2% milli ára');
  assert.ok(e.text.includes('662 þúsund krónur') && e.text.includes('152 þinglýst kaup') && e.text.includes('8,2% hærra') && e.text.includes('612 þús.kr'));
  assert.ok(e.text.includes('Alls voru 162 þinglýst kaup'));
  assert.deepEqual(e.spark, [600, 600, 610, 620, 615, 630, 640, 650, 660, 655, 670, 680]);   // null brúað
  assert.equal(e.facts.breyting12, 0.082); assert.equal(e.facts.tegund, 'fjölbýli'); assert.equal(e.facts.kaup_alls_12man, 162);
  assert.equal(e.facts.hms_breyting_2027, undefined);
});

test('pickSvaedi: lækkun, sérbýli sem ráðandi hluti, HMS-samanburður þegar hms er gefið', () => {
  const byZone = { 3000: { heiti: 'Akranes', n12: 90, nFjol: 20, nSer: 60, medFjol: 500, prevFjol: 500, medSer: 560, prevSer: 620, nPrev: 70, man: null } };
  const ev = pickSvaedi(byZone, Object.assign({ hms: { 3000: { br_fjol: 0.012, br_ser: -0.031 } } }, O));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Akranes: fasteignaverð lækkaði um 9,7% milli ára');
  assert.ok(ev[0].text.includes('sérbýli') && ev[0].text.includes('9,7% lægra'));
  assert.ok(ev[0].text.includes('breytist fasteignamat 2027 í svæðinu um −3,1% (sérbýli)'));
  assert.equal(ev[0].facts.hms_breyting_2027, -0.031);
  assert.equal(ev[0].spark, undefined);
});

test('pickSvaedi: mest `max` atburðir, raðað eftir |breyting|·log(n); annar hluti nefndur þegar hann er til', () => {
  const byZone = {};
  for (let k = 1; k <= 8; k++) byZone[k] = zone('Svæði ' + k, 700 + k * 10, 600, 100 + k * 5);   // +18%..+29%
  const ev = pickSvaedi(byZone, O);
  assert.equal(ev.length, 4);
  assert.equal(ev[0].facts.svaedi, 'Svæði 8');   // stærsta breyting og flest kaup
  const z = zone('Bæði', 700, 640, 80, { nSer: 40, medSer: 900, prevSer: 850, nPrev: 100 });
  const e2 = pickSvaedi({ 9: z }, O)[0];
  assert.ok(e2.text.includes('Í sérbýli var miðgildið 900 þús.kr (+5,9%, 40 kaup)'));
  assert.deepEqual(pickSvaedi(byZone, { todayISO: '2026-08-19' }), []);   // engin slugify → ekkert (engar rangar slóðir)
  assert.deepEqual(pickSvaedi(null, O), []);
});

test('fill: brúar null fram og aftur, sleppir öllu-null', () => {
  assert.deepEqual(fill([null, 1, null, null, 4, null]), [1, 1, 1, 1, 4, 4]);
  assert.deepEqual(fill([null, null]), []);
});
