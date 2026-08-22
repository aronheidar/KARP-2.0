import { test } from 'node:test';
import assert from 'node:assert';
import { parseRaedulisti, extractBrot, sidustuDagar } from './build_raedur_nylegar.mjs';

// ── fixtures: raunveruleg snið úr althingi.is/altext/xml/raedulisti (staðfest 22.8.2026) ──
const CHUNK_KRISTRUN = `<ræða> <ræðumaður id='1417'> <ráðherra>forsætisráðherra</ráðherra> <nafn >Kristrún Frostadóttir</nafn><nánar>http://www.althingi.is/altext/xml/thingmenn/thingmadur/?nr=1417</nánar> </ræðumaður> <dagur>19.06.2026</dagur> <löggjafarþing>157</löggjafarþing> <fundur>131</fundur> <ræðahófst>2026-06-19T16:16:48</ræðahófst> <ræðulauk>2026-06-19T16:19:23</ræðulauk> <tegundræðu>ræða</tegundræðu> <umræða>*</umræða> <mál> <málsflokkur>B</málsflokkur> <málsnúmer>864</málsnúmer> <málsheiti>þingfrestun &amp; þinglok</málsheiti> <slóðir> <xml>http://www.althingi.is/altext/xml/thingmalalisti/bmal/?lthing=157&amp;malnr=864</xml> </slóðir></mál> <slóðir> <hljóð>http://www.althingi.is/raedur/play.mp3?start=2026-06-19T16:16:48&amp;end=2026-06-19T16:19:23</hljóð><xml>http://www.althingi.is/xml/157/raedur/rad20260619T161648.xml</xml> <html>http://www.althingi.is/altext/raeda/157/rad20260619T161648.html</html></slóðir> </ræða>`;
const CHUNK_AN_HTML = `<ræða> <ræðumaður id='999'> <nafn >Nafnlaus Prufa</nafn> </ræðumaður> <dagur>18.06.2026</dagur> <ræðahófst>2026-06-18T10:00:00</ræðahófst> <tegundræðu>andsvar</tegundræðu> <mál> <málsnúmer>1</málsnúmer> <málsheiti>prufumál</málsheiti> </mál> </ræða>`;
const XML = `<?xml version="1.0" encoding="UTF-8"?> <ræðulisti>${CHUNK_KRISTRUN}${CHUNK_AN_HTML}</ræðulisti>`;

// ── parseRaedulisti ───────────────────────────────────────────────────────
test('parseRaedulisti: les nafn, embætti, dags (ISO), tegund, málsheiti (afkóðuð) og hlekki', () => {
  const r = parseRaedulisti(XML, '157');
  assert.equal(r.length, 1);                                   // ræða án <html>-slóðar sleppt (ekkert að tengja á)
  const k = r[0];
  assert.equal(k.nafn, 'Kristrún Frostadóttir');
  assert.equal(k.embaetti, 'forsætisráðherra');
  assert.equal(k.dags, '2026-06-19');
  assert.equal(k.hofst, '2026-06-19T16:16:48');
  assert.equal(k.teg, 'ræða');
  assert.equal(k.malsheiti, 'þingfrestun & þinglok');          // &amp; → &
  assert.equal(k.malnr, 864);
  assert.equal(k.hlekkur, 'https://www.althingi.is/altext/raeda/157/rad20260619T161648.html');
});
test('parseRaedulisti: id einkvæmt úr rad-skráarheiti + löggjafarþingi', () => {
  const r = parseRaedulisti(XML, '157');
  assert.equal(r[0].id, 'raeda-157-rad20260619T161648');
});
test('parseRaedulisti: ræðutexta-XML-slóðin er sú undir /raedur/ (ekki bmal-slóð málsins)', () => {
  const r = parseRaedulisti(XML, '157');
  assert.equal(r[0].xmlSlod, 'http://www.althingi.is/xml/157/raedur/rad20260619T161648.xml');
});
test('parseRaedulisti: tómur listi og rusl → tómt fylki (hrun-laust)', () => {
  assert.deepEqual(parseRaedulisti('<?xml version="1.0"?> <ræðulisti> </ræðulisti>', '158'), []);
  assert.deepEqual(parseRaedulisti('', '158'), []);
});

// ── extractBrot ───────────────────────────────────────────────────────────
const SPEECH_XML = `<?xml version="1.0" encoding="UTF-8"?> <ns:ræða xmlns:ns="http://skema.althingi.is/skema"> <ns:umsýsla fundur="131" lgþ="157"/> <ns:ræðutexti> <ns:mgr>Virðulegi forseti.</ns:mgr> <ns:mgr>Fundum Alþingis, 157. löggjafarþings, er frestað &amp; lokið.</ns:mgr> <ns:línubil/> <ns:mgr jöfnun="miðja">Gjört á Bessastöðum.</ns:mgr> </ns:ræðutexti> </ns:ræða>`;
test('extractBrot: sameinar málsgreinar, strípar tögg, afkóðar entities, fellir bil saman', () => {
  assert.equal(extractBrot(SPEECH_XML), 'Virðulegi forseti. Fundum Alþingis, 157. löggjafarþings, er frestað & lokið. Gjört á Bessastöðum.');
});
test('extractBrot: klippt í ≤800 stafi með ellipsu', () => {
  const long = `<ns:ræðutexti><ns:mgr>${'orð '.repeat(400)}</ns:mgr></ns:ræðutexti>`;
  const b = extractBrot(long);
  assert.ok(b.length <= 800);
  assert.ok(b.endsWith('…'));
});
test('extractBrot: enginn ræðutexti / rusl → tómur strengur', () => {
  assert.equal(extractBrot('<ns:ræða></ns:ræða>'), '');
  assert.equal(extractBrot(''), '');
});

// ── sidustuDagar ──────────────────────────────────────────────────────────
const NOW = Date.parse('2026-06-22T12:00:00Z');
test('sidustuDagar: aðeins ræður innan gluggans (hofst fremur en dags)', () => {
  const raedur = [
    { id: 'a', hofst: '2026-06-19T16:16:48', dags: '2026-06-19' },
    { id: 'b', hofst: '2026-06-10T10:00:00', dags: '2026-06-10' },
    { id: 'c', dags: '2026-06-21' },                            // vantar hofst → dags dugar
  ];
  assert.deepEqual(sidustuDagar(raedur, 7, NOW).map((x) => x.id), ['a', 'c']);
});
test('sidustuDagar: ógildar dagsetningar síast burt (hrun-laust)', () => {
  assert.deepEqual(sidustuDagar([{ id: 'x', dags: 'rusl' }, null], 7, NOW), []);
});
