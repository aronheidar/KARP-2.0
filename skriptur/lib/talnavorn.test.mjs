// Talnavörnin er tryggingin fyrir reglunni „aðeins úr facts". Dæmin eru RAUNFRÉTTIR úr straumnum 22.9.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { athugaTolur, talnaTokar, leyfd } from './talnavorn.mjs';

const SIMINN = { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 };
const DAGAR = { felag: 'Dagar hf.', kaupandi: 'Isavia ohf', sigurvegarar: ['Dagar hf.'], verdmaeti: 1024188084, dags: '2026-09-21', tedNr: '649909-2026' };
const THEMA = { manudur: '2026-08', rikisgreidslur: 17698591083, staersti_birgir: 'Distica hf.', ny_utbod_30d: 42, styrkir_alls: 11318801491 };
const DOMUR = { domstoll: 'Hæstiréttur', malsnr: '28/2026', svid: 'Einkamál', dags: '2026-09-17' };

test('raunfréttir úr straumnum standast', () => {
  assert.deepEqual(athugaTolur('Síminn lækkar um 7,3%\nHlutabréf í Símanum hf. lækkuðu um 7,3% og stóð gengið í 10,2.', SIMINN), { ok: true, rangar: [] });
  assert.equal(athugaTolur('Dagar hf. varð hlutskarpast með tilboði að verðmæti 1.024.188.084 krónur. Niðurstaðan var birt 21. september 2026. Útboðið er skráð undir tilkynningarnúmerinu 649909-2026.', DAGAR).ok, true);
  assert.equal(athugaTolur('Í ágúst 2026 námu ríkisgreiðslur 17,7 milljörðum króna. Á síðustu 30 dögum voru 42 ný útboð birt. Styrkir námu samtals 11,3 milljörðum króna.', { ...THEMA, dagar: 30 }).ok, true);
  assert.equal(athugaTolur('Hæstiréttur vísaði frá einkamáli nr. 28/2026 þann 17. september 2026.', DOMUR).ok, true);
});

test('uppspunnin tala, ártal og rangt námundað gildi falla', () => {
  assert.deepEqual(athugaTolur('Hlutabréf í Símanum lækkuðu um 7,5%.', SIMINN).rangar, ['7,5%']);
  assert.deepEqual(athugaTolur('Málið hófst árið 2025.', DOMUR).rangar, ['2025']);
  assert.deepEqual(athugaTolur('Ríkisgreiðslur námu 17,9 milljörðum.', THEMA).rangar, ['17,9 milljörðum']);
  assert.deepEqual(athugaTolur('Mál nr. 29/2026.', DOMUR).rangar, ['29/2026']);
});

test('námundun innan birtrar nákvæmni er leyfð, líka með einingum', () => {
  assert.equal(athugaTolur('um 18 milljarðar', THEMA).ok, true);            // 17,7 ma → 18 ma (nákvæmni 1 ma)
  assert.equal(athugaTolur('1.024 m.kr.', DAGAR).ok, true);                 // 1.024.188.084 → 1.024 milljónir
  assert.equal(athugaTolur('atvinnuleysi 4%', { atvinnuleysi: 3.95 }).ok, true);
  assert.equal(athugaTolur('1,5 prósentustig', { breyting: 1.5 }).ok, true);
});

test('hreiðruð gildi í bakgrunni og dagsetningar í strengjum teljast', () => {
  const f = { felag: 'Dagar hf.', bakgrunnur: { sigurvegari: { utbod_unnin: { fjoldi: 3, sidast: '2026-06-01' } } } };
  assert.equal(athugaTolur('Félagið hefur unnið 3 útboð, síðast 1. júní 2026.', f).ok, true);
  assert.equal(athugaTolur('Atvinnuleysi í ágúst 2026', { manudur: '2026M08' }).ok, true);
});

test('táknun: númer, hlutföll og einingar greinast rétt', () => {
  const t = talnaTokar('nr. 28/2026 · 7,3% · 17,7 milljörðum · 1.024.188.084 kr.');
  assert.deepEqual(t.map((x) => x.tegund), ['numer', 'hlutfall', 'tala', 'tala']);
  assert.equal(t[2].gildi, 17.7e9);
  assert.equal(t[3].gildi, 1024188084);
  assert.ok(leyfd({ d: '2026-09-21' }).gildi.includes(21));
});

test('samsett orð er ekki eining', () => {
  assert.equal(athugaTolur('Á svæðinu voru 5 milljarðamæringar.', { fjoldi: 5 }).ok, true);
  assert.deepEqual(athugaTolur('Talan var 5 milljarðamæringar.', { x: 5000000000 }).rangar, ['5']);
});

test('einingar þekkjast í öllum beygingarmyndum sem heil orð', () => {
  assert.equal(athugaTolur('3 milljónum', { a: 3e6 }).ok, true);
  assert.equal(athugaTolur('2 þúsund', { a: 2000 }).ok, true);
  assert.equal(athugaTolur('um 1,3 milljarða', { a: 1334522008 }).ok, true);
  assert.equal(athugaTolur('4 milljarðar', { a: 4e9 }).ok, true);
});

test('hlutfall verður að passa beint, ekki ×100', () => {
  assert.equal(athugaTolur('hlutfallið var 50%', { hlutfall: 0.5 }).ok, false);
  assert.equal(athugaTolur('hlutfallið var 50%', { hlutfall: 50 }).ok, true);
});
