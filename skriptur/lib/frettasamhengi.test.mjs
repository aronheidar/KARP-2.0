// Bakgrunnur fréttar úr gögnum Karp. Gögnin hér eru á RAUNSNIÐI skránna (staðfest 22.9.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baetaVidBakgrunni, fyrirtaeki, stadlaNafn, erLogadili, STUDDAR_TEGUNDIR } from './frettasamhengi.mjs';

const IDAG = '2026-09-22';
export const GOGN = () => ({
  felagaskra: { felog: [
    { kt: '5501692829', nafn: 'Dagar hf.' },
    { kt: '4101690299', nafn: 'Aðalstræti 4 ehf' },
    { kt: '6001001001', nafn: 'Tvínefni ehf.' },
    { kt: '6001001002', nafn: 'Tvínefni hf.' },
    { kt: '6101001003', nafn: 'Jón Jónsson ehf.' },
  ] },
  utbod_urslit: { awards: [
    { nr: 'A1', t: 'Ræsting', buyer: 'Isavia ohf', winners: ['Dagar hf.'], value: 1000000, cur: 'ISK', d: '2026-03-01' },
    { nr: 'A2', t: 'Ræsting 2', buyer: 'Isavia ohf', winners: ['Dagar hf.', 'Annað ehf.'], value: 600000, cur: 'ISK', d: '2026-06-01' },
    { nr: 'NU', t: 'Ræsting KEF', buyer: 'Isavia ohf', winners: ['Dagar hf.'], value: 1024188084, cur: 'ISK', d: '2026-09-21' },
    { nr: 'G', t: 'Gamalt', buyer: 'Isavia ohf', winners: ['Annað ehf.'], value: 5, cur: 'ISK', d: '2025-01-01' },
  ] },
  birgjar: { fra: '2025-09', til: '2026-08-31', vendors: [{ n: 'Dagar hf.', t: 250000000, c: 40, o: 'Isavia' }] },
  styrkir: { styrkir: [
    { nafn: 'Dagar hf.', kt: null, sjodur: 'Tækniþróunarsjóður', upphaed: 20000000, ar: 2025, slug: 'dagar' },
    { nafn: 'Dagar hf.', kt: null, sjodur: 'Tækniþróunarsjóður', upphaed: 30000000, ar: 2026, slug: 'dagar' },
  ] },
  arsreikningur: (kt) => (kt === '5501692829'
    ? { kt, ar: { 2023: { kvardi: 1000, rekstur: { sala: 4000000, hagnadur: 90000 } }, 2024: { kvardi: 1000, rekstur: { sala: 5000000, hagnadur: 120000 } } } }
    : null),
});

test('stöðlun nafna og lögaðilapróf', () => {
  assert.equal(stadlaNafn('Dagar hf.'), 'dagar');
  assert.equal(stadlaNafn('Íslenska gámafélagið ehf.'), 'íslenska gámafélagið');
  assert.equal(erLogadili('5501692829'), true);
  assert.equal(erLogadili('0101801234'), false, 'einstaklingur');
});

test('fyrirtæki: útboð (utan fréttarinnar sjálfrar), ríkisgreiðslur, styrkir og ársreikningur með kvarða', () => {
  const f = fyrirtaeki('Dagar hf.', GOGN(), { utanUtbods: 'NU', idag: IDAG });
  assert.deepEqual(f, {
    utbod_unnin: { fjoldi: 2, samtals_kr: 1300000, sidast: '2026-06-01' },
    rikisgreidslur_12man: { samtals_kr: 250000000, fra: '2025-09', til: '2026-08' },
    styrkir_fyrri: { fjoldi: 2, samtals_kr: 50000000 },
    arsreikningur: { ar: 2024, sala_kr: 5000000000, hagnadur_kr: 120000000 },
  });
});

test('tvíræð eða óþekkt nafn gefur EKKERT, frekar en að giska', () => {
  assert.equal(fyrirtaeki('Tvínefni ehf.', GOGN(), { idag: IDAG }), null);
  assert.equal(fyrirtaeki('Óþekkt Erlent B.V.', GOGN(), { idag: IDAG }), null);
});

test('kennitala einstaklings stöðvar samhengið, líka þótt nafnið finnist sem félag', () => {
  assert.equal(fyrirtaeki('Jón Jónsson', GOGN(), { kt: '0101801234', idag: IDAG }), null);
});

test('útboð: sigurvegari + önnur útboð kaupandans síðustu 12 mánuði', () => {
  const e = { id: 'urslit-NU', type: 'urslit', facts: { titill: 'Ræsting KEF', kaupandi: 'Isavia ohf', sigurvegarar: ['Dagar hf.'], verdmaeti: 1024188084, dags: '2026-09-21', tedNr: 'NU' } };
  assert.equal(baetaVidBakgrunni([e], GOGN(), { idag: IDAG }), 1);
  assert.equal(e.facts.bakgrunnur.kaupandi_onnur_utbod_12man, 2);
  assert.equal(e.facts.bakgrunnur.sigurvegari.utbod_unnin.fjoldi, 2);
});

test('styrkur: fyrri styrkir án styrksins sem fréttin fjallar um', () => {
  const e = { id: 'styrkur-dagar-2026', type: 'styrkur', facts: { thegi: 'Dagar hf.', sjodur: 'Tækniþróunarsjóður', upphaed: 30000000, ar: 2026 } };
  baetaVidBakgrunni([e], GOGN(), { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur.thegi.styrkir_fyrri, { fjoldi: 1, samtals_kr: 20000000 });
});

test('vörumerki og gjaldþrot nota kennitölu atburðarins', () => {
  const vm = { id: 'vorumerki-1', type: 'vorumerki', kt: '5501692829', facts: { merki: 'DAGAR', eigandi: 'Dagar hf.' } };
  const vmEinst = { id: 'vorumerki-2', type: 'vorumerki', kt: '0101801234', facts: { merki: 'JÓN', eigandi: 'Jón Jónsson' } };
  const gj = { id: 'gjaldthrot-1', type: 'gjaldthrot', kt: '5501692829', facts: { felag: 'Dagar hf.', tegund: 'Gjaldþrotaskiptabeiðni' } };
  assert.equal(baetaVidBakgrunni([vm, vmEinst, gj], GOGN(), { idag: IDAG }), 2);
  assert.ok(vm.facts.bakgrunnur.eigandi.arsreikningur);
  assert.equal(vmEinst.facts.bakgrunnur, undefined, 'einstaklingur fær ekkert');
  assert.equal(gj.facts.bakgrunnur.felagid.arsreikningur.ar, 2024);
});

test('villa í einum atburði fellur ekki hina; óstuddar tegundir ósnertar', () => {
  const vondur = { id: 'urslit-x', type: 'urslit', facts: { sigurvegarar: ['Dagar hf.'], tedNr: 'X' } };
  const gogn = GOGN(); gogn.arsreikningur = () => { throw new Error('bilað'); };
  const domur = { id: 'domur-1', type: 'domur', facts: { domstoll: 'Hæstiréttur' } };
  const skilabod = [];
  assert.equal(baetaVidBakgrunni([vondur, domur], gogn, { idag: IDAG, skra: (m) => skilabod.push(m) }), 0);
  assert.equal(domur.facts.bakgrunnur, undefined);
  assert.match(skilabod[0], /urslit-x/);
  assert.ok(STUDDAR_TEGUNDIR.includes('gjaldthrot') && !STUDDAR_TEGUNDIR.includes('domur'));
});
