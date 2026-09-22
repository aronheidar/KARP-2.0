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

// ── Task 3: markaðir, hagtölur, lyf ──────────────────────────────────────────
// ⚠ Í markadir.json er gengi DAGSINS síðasta gildið í `hist` (staðfest 22.9: 190 == price, síðasta hreyfing = chgPct).
const MARKADIR = { indices: [{ sym: '^OMXI15', chgPct: 2.014 }], stocks: [
  { sym: 'SIMINN', name: 'Siminn hf', price: 10.2, chgPct: -7.3, hist: [10, 10.5, 11, 10.8, 11, 11.2, 11, 10.2] },
] };
const pt = (y, m, v) => [`${y}-${String(m).padStart(2, '0')}-01`, v];
const SEDLABANKI = { datasets: {
  verdbolga: { series: [{ name: 'Vísitala neysluverðs', points: [pt(2025, 8, 4.0), pt(2025, 9, 4.1), pt(2025, 10, 4.2), pt(2025, 11, 4.3), pt(2025, 12, 4.5), pt(2026, 1, 4.6), pt(2026, 2, 4.8), pt(2026, 3, 4.9), pt(2026, 4, 5.0), pt(2026, 5, 5.1), pt(2026, 6, 5.2), pt(2026, 7, 5.3), pt(2026, 8, 5.6)] }] },
  vextir_si: { series: [{ name: 'Meginvextir (vextir á 7 daga bundnum innlánum)', points: [['2026-05-20', 7.5], ['2026-05-27', 7.75], ['2026-06-03', 7.75], ['2026-08-26', 8], ['2026-09-02', 8]] }] },
} };
const ATVINNULEYSI = { monthly: [{ t: '2025M08', v: 3.4 }, { t: '2026M07', v: 4 }, { t: '2026M08', v: 3.95 }] };
const LYF = { shortageCount: 241, lyf: [
  { slug: 'cotrim-1', name: 'Cotrim', atc: { code: 'J01EE01' }, shortage: true, essential: true },
  { slug: 'cotrim-2', name: 'Cotrim forte', atc: { code: 'J01EE01' }, shortage: false },
  { slug: 'bactrim', name: 'Bactrim', atc: { code: 'J01EE01' }, shortage: true },
  { slug: 'annad', name: 'Annað', atc: { code: 'N05AX12' }, shortage: false },
] };
const GOGN2 = () => ({ ...GOGN(), markadir: MARKADIR, sedlabanki: SEDLABANKI, atvinnuleysi: ATVINNULEYSI, lyf: LYF });

test('markaðir: röðin, stærsta FYRRI dagshreyfing (án dagsins) og úrvalsvísitalan', () => {
  const e = { id: 'mark-x', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur, {
    vidskiptadagar_i_rod: 8, haesta_i_rod: 11.2, laegsta_i_rod: 10,
    breyting_fra_upphafi_rodar_pct: 2, staersta_fyrri_dagshreyfing_pct: 5,
    hreyfing_dagsins_su_staersta: true, urvalsvisitala_breyting_pct: 2,
  });
});

test('verðbólga: 12 mánuðum fyrr, hámark/lágmark og markmið', () => {
  const e = { id: 'verdbolga-2026-08-01', type: 'verdbolga', facts: { verdbolga: 5.6, fyrri: 5.3, dags: '2026-08-01' } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur, { verdbolga: 5.6, maeling: '2026-08', verdbolga_12man_fyrr: 4, haesta_12man: 5.6, laegsta_12man: 4.1, verdbolgumarkmid: 2.5, fravik_fra_markmidi: 3.1 });
});

test('vextir: breytingin á undan og raunstýrivextir', () => {
  const e = { id: 'vextir-2026-08-26', type: 'vextir', facts: { nyir: 8, fyrri: 7.75, dags: '2026-08-26' } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  const b = e.facts.bakgrunnur;
  assert.deepEqual(b.sidasta_breyting, { dags: '2026-08-26', fra: 7.75, i: 8 });
  assert.deepEqual(b.breytingin_a_undan, { dags: '2026-05-27', fra: 7.5, i: 7.75 });
  assert.equal(b.raunstyrivextir, 2.4);
});

test('vikan: atvinnuleysi og verðbólga 12 mánuðum fyrr', () => {
  const e = { id: 'vika-x', type: 'vika', facts: { verdbolga: 5.6, meginvextir: 8, atvinnuleysi: 3.95 } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  assert.equal(e.facts.bakgrunnur.atvinnuleysi_12man_fyrr, 3.4);
  assert.equal(e.facts.bakgrunnur.verdbolga_12man_fyrr, 4);
});

test('lyf: önnur lyf með sama virka efni (ATC), þar af í skorti, og hvenær skortur sást fyrst', () => {
  const e = { id: 'lyfskortur-cotrim-1', type: 'lyf', facts: { lyf: 'Cotrim' } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG, state: { lyfFyrst: { 'cotrim-1': '2026-09-10' } } });
  assert.deepEqual(e.facts.bakgrunnur, { atc_kodi: 'J01EE01', onnur_lyf_sama_efni: 2, thar_af_i_skorti: 1, lyf_i_skorti_alls: 241, skortur_skradur_fra: '2026-09-10' });
  const ohekkt = { id: 'lyfskortur-cotrim-1', type: 'lyf', facts: { lyf: 'Cotrim' } };
  baetaVidBakgrunni([ohekkt], GOGN2(), { idag: IDAG, state: { lyfFyrst: { 'cotrim-1': 'ohekkt' } } });
  assert.equal(ohekkt.facts.bakgrunnur.skortur_skradur_fra, undefined, 'óþekkt upphaf er EKKI dagsetning');
});

test('vantandi gagnaskrá fellir ekki: markaðsfrétt án markadir.json fær engan bakgrunn', () => {
  const e = { id: 'mark-y', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3 } };
  assert.equal(baetaVidBakgrunni([e], { ...GOGN(), markadir: null }, { idag: IDAG }), 0);
  assert.ok(['mark', 'verdbolga', 'vextir', 'vika', 'lyf'].every((t) => STUDDAR_TEGUNDIR.includes(t)));
});
