import { test } from 'node:test';
import assert from 'node:assert/strict';
import mod from './raeduval.cjs';
const { safnaEfnisraedum, raeduTextaSlod, thingOrdalag } = mod;

// ── fixtures: snið raedulisti-XML (sbr. build_raedur_nylegar.test.mjs) ─────
const RAEDA = (o = {}) => {
  const { id = '1417', teg = 'ræða', heiti = 'prufumál', t0 = '2026-09-10T10:00:00', t1 = '2026-09-10T10:10:00',
    thing = '158', slod = 'http://www.althingi.is/xml/158/raedur/rad20260910T100000.xml' } = o;
  const lth = thing === null ? '' : ` <löggjafarþing>${thing}</löggjafarþing>`;
  const sl = slod === null ? '' : ` <slóðir> <xml>${slod}</xml> </slóðir>`;
  return `<ræða> <ræðumaður id='${id}'> <nafn>X</nafn> </ræðumaður>${lth} <ræðahófst>${t0}</ræðahófst>`
    + ` <ræðulauk>${t1}</ræðulauk> <tegundræðu>${teg}</tegundræðu> <mál> <málsheiti>${heiti}</málsheiti> </mál>${sl} </ræða>`;
};
const SKRA = (thing, ...c) => ({ thing, xml: `<?xml version="1.0" encoding="UTF-8"?> <ræðulisti>${c.join('')}</ræðulisti>` });

// ── safnaEfnisraedum ──────────────────────────────────────────────────────
test('safnaEfnisraedum: aðeins efnisræður (ræða/flutningsræða) — andsvör og fundarstjórn falla út', () => {
  const r = safnaEfnisraedum([SKRA(158,
    RAEDA({ teg: 'ræða' }), RAEDA({ teg: 'flutningsræða' }),
    RAEDA({ teg: 'andsvar' }), RAEDA({ teg: 'svar' }), RAEDA({ teg: 'um fundarstjórn' }),
  )]);
  assert.equal(r['1417'].length, 2);
  assert.deepEqual(r['1417'].map((s) => s.teg).sort(), ['flutningsræða', 'ræða']);
});

test('safnaEfnisraedum: ávörp, þingsetning, minningarorð og fundarstjórn síast út eftir málsheiti', () => {
  const r = safnaEfnisraedum([SKRA(158,
    RAEDA({ heiti: 'ávarp forseta' }), RAEDA({ heiti: 'þingsetning' }),
    RAEDA({ heiti: 'minning látinna' }), RAEDA({ heiti: 'um fundarstjórn forseta' }),
    RAEDA({ heiti: 'fjárlög 2027' }),
  )]);
  assert.deepEqual(r['1417'].map((s) => s.heiti), ['fjárlög 2027']);
});

test('safnaEfnisraedum: of stuttar ræður falla út og þröskuldurinn er stillanlegur', () => {
  const skra = SKRA(158,
    RAEDA({ heiti: 'stutt', t0: '2026-09-10T10:00:00', t1: '2026-09-10T10:01:00' }),   // 1 mín
    RAEDA({ heiti: 'long', t0: '2026-09-10T11:00:00', t1: '2026-09-10T11:09:00' }),    // 9 mín
  );
  assert.deepEqual(safnaEfnisraedum([skra], { lagmarkMin: 2 })['1417'].map((s) => s.heiti), ['long']);
  assert.deepEqual(safnaEfnisraedum([skra], { lagmarkMin: 0.5 })['1417'].map((s) => s.heiti), ['stutt', 'long']);
});

test('safnaEfnisraedum: ræða án upphafstíma er sleppt (ekkert að tímasetja né sækja texta eftir)', () => {
  const r = safnaEfnisraedum([SKRA(158, RAEDA({ t0: '' }), RAEDA({ heiti: 'gilt' }))]);
  assert.deepEqual(r['1417'].map((s) => s.heiti), ['gilt']);
});

// ⚠⚠ KJARNINN: hver ræða VERÐUR að bera sitt eigið þing. Textaslóðin er /xml/<þing>/raedur/…
//   og var harðkóðuð 157 í báðum AI-skriftunum. Rangt þing skilar 200 með NÚLL bætum (ekki
//   404), svo ræðan hefði dottið út á lengdarprófi og þingmaðurinn orðið „of lítill texti".
test('safnaEfnisraedum: hver ræða ber SITT löggjafarþing, og skrár tveggja þinga sameinast', () => {
  const r = safnaEfnisraedum([
    SKRA(158, RAEDA({ heiti: 'nytt', thing: '158' })),
    SKRA(157, RAEDA({ heiti: 'gamalt', thing: '157' })),
  ]);
  assert.equal(r['1417'].length, 2, 'bæði þing undir sama þingmanni');
  assert.deepEqual(r['1417'].map((s) => [s.heiti, s.thing]), [['nytt', 158], ['gamalt', 157]]);
});

test('safnaEfnisraedum: vanti <löggjafarþing> í ræðuna er þing skrárinnar notað', () => {
  const r = safnaEfnisraedum([SKRA(157, RAEDA({ thing: null }))]);
  assert.equal(r['1417'][0].thing, 157);
});

test('safnaEfnisraedum: slóð ræðutextans lesin úr <xml> og &amp; afkóðað', () => {
  const r = safnaEfnisraedum([SKRA(158, RAEDA({ slod: 'http://www.althingi.is/xml/158/raedur/rad20260910T100000.xml?a=1&amp;b=2' }))]);
  assert.equal(r['1417'][0].url, 'http://www.althingi.is/xml/158/raedur/rad20260910T100000.xml?a=1&b=2');
});

// ── raeduTextaSlod ────────────────────────────────────────────────────────
test('raeduTextaSlod: notar beinu slóðina úr ræðulistanum þegar hún er til', () => {
  assert.equal(
    raeduTextaSlod({ t0: '2026-09-10T10:00:00', thing: 158, url: 'https://www.althingi.is/xml/158/raedur/rad20260910T100000.xml' }),
    'https://www.althingi.is/xml/158/raedur/rad20260910T100000.xml');
});

test('raeduTextaSlod: án beinnar slóðar er hún byggð á ÞINGI RÆÐUNNAR, ekki 157', () => {
  assert.equal(raeduTextaSlod({ t0: '2026-09-10T10:00:00', thing: 158, url: null }),
    'https://www.althingi.is/xml/158/raedur/rad20260910T100000.xml');
  assert.equal(raeduTextaSlod({ t0: '2026-06-19T16:16:48', thing: 157, url: null }),
    'https://www.althingi.is/xml/157/raedur/rad20260619T161648.xml');
});

// ── thingOrdalag ──────────────────────────────────────────────────────────
// Orðalagið fer í `note` SELDU skýrslunnar og inn í promptið sjálft, svo það verður að
// fallbeygjast rétt og telja þingin sem gögnin ná raunverulega yfir.
test('thingOrdalag: eitt þing í eintölu, fleiri í fleirtölu og í hækkandi röð', () => {
  assert.equal(thingOrdalag([158]), 'þingi 158');
  assert.equal(thingOrdalag([158, 157]), 'þingum 157–158');
  assert.equal(thingOrdalag([157, 158]), 'þingum 157–158', 'röðin í fylkinu ræður ekki lestrinum');
});
