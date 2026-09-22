// Bakgrunnur fréttar úr gögnum Karp. Gögnin hér eru á RAUNSNIÐI skránna (staðfest 22.9.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baetaVidBakgrunni, fyrirtaeki, stadlaNafn, erLogadili, nafnaskra, ktFraNafni, STUDDAR_TEGUNDIR } from './frettasamhengi.mjs';

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
});

test('stöðlun nafna og lögaðilapróf', () => {
  assert.equal(stadlaNafn('Dagar hf.'), 'dagar');
  assert.equal(stadlaNafn('Íslenska gámafélagið ehf.'), 'íslenska gámafélagið');
  assert.equal(erLogadili('5501692829'), true);
  assert.equal(erLogadili('0101801234'), false, 'einstaklingur');
});

test('fyrirtæki: útboð (utan fréttarinnar sjálfrar), ríkisgreiðslur og styrkir, hvert með heimild', () => {
  const f = fyrirtaeki('Dagar hf.', GOGN(), { utanUtbods: 'NU', dags: IDAG });
  assert.deepEqual(f, {
    utbod_unnin: { fjoldi: 2, samtals_kr: 1300000, sidast: '2026-06-01', gogn_fra: '2025-01-01', heimild: 'samningstilkynningar í TED' },
    rikisgreidslur_12man: { samtals_kr: 250000000, fra: '2025-09', til: '2026-08', heimild: 'opnir reikningar ríkisins' },
    styrkir_fyrri: { fjoldi: 2, samtals_kr: 50000000, heimild: 'úthlutunarskrár styrkjasjóða í gagnasafni Karp' },
  });
});

test('útboð dagsett eftir fréttinni teljast ekki með (sýnishorn úr safninu fá ekki framtíðargögn)', () => {
  const e = { id: 'urslit-X', type: 'urslit', facts: { kaupandi: 'Isavia ohf', sigurvegarar: ['Dagar hf.'], dags: '2026-05-01', tedNr: 'X' } };
  baetaVidBakgrunni([e], GOGN(), { idag: IDAG });
  assert.equal(e.facts.bakgrunnur.sigurvegari.utbod_unnin.fjoldi, 1, 'A1 (1.3.) en ekki A2 (1.6.) né NU (21.9.)');
  assert.equal(e.facts.bakgrunnur.sigurvegari.utbod_unnin.sidast, '2026-03-01');
});

test('fyrri styrkir: aðeins úthlutunarár ≤ fréttarár og án styrksins sjálfs', () => {
  const g = GOGN();
  g.styrkir.styrkir.push({ nafn: 'Dagar hf.', kt: null, sjodur: 'Kvikmyndasjóður', upphaed: 90000000, ar: 2027, vilyrdi: true });
  const e = { id: 'styrkur-dagar-2026', type: 'styrkur', facts: { thegi: 'Dagar hf.', sjodur: 'Tækniþróunarsjóður', upphaed: 30000000, ar: 2026 } };
  baetaVidBakgrunni([e], g, { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur.thegi.styrkir_fyrri, { fjoldi: 1, samtals_kr: 20000000, heimild: 'úthlutunarskrár styrkjasjóða í gagnasafni Karp' });
});

test('bakgrunnur inniheldur aldrei ársreikning — ver greiddu 990 kr mörkin', () => {
  // Jafnvel þótt gagnasafnið bjóði ársreikningsaðgang (eins og gognBakgrunns gerði áður) má hann hvorki lesast né birtast.
  const g = GOGN();
  let lesid = 0;
  g.arsreikningur = (kt) => { lesid++; return { kt, ar: { 2024: { kvardi: 1000, rekstur: { sala: 5000000, hagnadur: 120000 } } } }; };
  const ev = [
    { id: 'urslit-NU', type: 'urslit', facts: { kaupandi: 'Isavia ohf', sigurvegarar: ['Dagar hf.'], dags: '2026-09-21', tedNr: 'NU' } },
    { id: 'styrkur-dagar-2026', type: 'styrkur', facts: { thegi: 'Dagar hf.', sjodur: 'Tækniþróunarsjóður', upphaed: 30000000, ar: 2026 } },
    { id: 'vorumerki-1', type: 'vorumerki', kt: '5501692829', facts: { merki: 'DAGAR', eigandi: 'Dagar hf.' } },
    { id: 'gjaldthrot-1', type: 'gjaldthrot', kt: '5501692829', facts: { felag: 'Dagar hf.', tegund: 'Gjaldþrotaskiptabeiðni' } },
  ];
  assert.equal(baetaVidBakgrunni(ev, g, { idag: IDAG }), 4, 'allir fá bakgrunn, svo prófið er ekki tómt');
  assert.equal(lesid, 0, 'ársreikningsaðgangurinn er aldrei kallaður');
  for (const e of ev) assert.doesNotMatch(JSON.stringify(e.facts.bakgrunnur), /arsreikn|sala_kr|hagnadur/);
});

// I6 (yfirferð 22.9): nákvæmt nafn MEÐ félagaformi ræður fyrst, svo „Tvínefni ehf." er nú ótvírætt. Tvírætt er nafn
// sem aðeins staðlaða samsvörunin nær og hún gefur tvær kt — þá fæst ekkert, jafnvel þótt gögn finnist undir nafninu.
test('tvíræð eða óþekkt nafn gefur EKKERT, frekar en að giska', () => {
  const g = GOGN();
  g.utbod_urslit.awards.push({ nr: 'T1', buyer: 'Vegagerðin', winners: ['Tvínefni'], value: 7000000, cur: 'ISK', d: '2026-02-01' });
  assert.equal(fyrirtaeki('Tvínefni', g, { dags: IDAG }), null);
  assert.equal(fyrirtaeki('Óþekkt Erlent B.V.', g, { dags: IDAG }), null);
  assert.equal(fyrirtaeki('Tvínefni ehf.', g, { dags: IDAG }), null, 'ótvírætt nafn, en útboðið „Tvínefni" gæti átt við hvort félagið sem er');
});

test('nafn → kt: fyrst nákvæm samsvörun með félagaformi, síðan stöðluð sem gefur eina kt', () => {
  const skra = nafnaskra(GOGN().felagaskra);
  assert.equal(ktFraNafni('Tvínefni ehf.', skra), '6001001001');
  assert.equal(ktFraNafni('Tvínefni hf', skra), '6001001002');
  assert.equal(ktFraNafni('Tvínefni', skra), null, 'staðlað nafn á tvær kt');
  assert.equal(ktFraNafni('Aðalstræti 4', skra), '4101690299', 'staðlað nafn á eina kt');
});

// Félag með sama grunnnafn og annað félagaform („Dagar ehf.") má hvorki fá né gefa útboð nafna síns.
const MED_DOGUM_EHF = () => {
  const g = GOGN();
  g.felagaskra.felog.push({ kt: '6001001009', nafn: 'Dagar ehf.' });
  g.utbod_urslit.awards.push({ nr: 'E1', buyer: 'Vegagerðin', winners: ['Dagar ehf.'], value: 4000000, cur: 'ISK', d: '2026-04-01' });
  return g;
};

test('„Dagar hf." leysist nákvæmt þótt „Dagar ehf." sé líka til, og fær aðeins sín eigin útboð', () => {
  const f = fyrirtaeki('Dagar hf.', MED_DOGUM_EHF(), { dags: IDAG });
  assert.equal(f.utbod_unnin.fjoldi, 3, 'A1, A2 og NU, ekki E1');
  const d = fyrirtaeki('Dagar ehf.', MED_DOGUM_EHF(), { kt: '6001001009', dags: IDAG });
  assert.equal(d.utbod_unnin.fjoldi, 1, 'aðeins E1');
  assert.equal(d.rikisgreidslur_12man, undefined, 'birgirinn „Dagar hf." er hitt félagið');
  assert.equal(d.styrkir_fyrri, undefined, 'styrkirnir eru skráðir á „Dagar hf."');
});

test('kt-leið: nafn sem vísar á aðra kt fær EKKI útboð, greiðslur né styrki nafna síns', () => {
  assert.equal(fyrirtaeki('Dagar ehf', GOGN(), { kt: '6001001009', dags: IDAG }), null);
  // nafnabundnar uppsprettur aðeins ef NAFNIÐ vísar ótvírætt á einmitt þessa kt
  assert.equal(fyrirtaeki('Allt annað nafn ehf.', GOGN(), { kt: '5501692829', dags: IDAG }), null);
});

test('kt-leið: styrkur skráður á kt félagsins telst alltaf, þótt nafnið vísi annað', () => {
  const g = GOGN();
  g.styrkir.styrkir.push({ nafn: 'Dagar rannsóknir', kt: '6001001009', sjodur: 'Rannsóknasjóður', upphaed: 8000000, ar: 2025 });
  assert.deepEqual(fyrirtaeki('Dagar ehf', g, { kt: '6001001009', dags: IDAG }), {
    styrkir_fyrri: { fjoldi: 1, samtals_kr: 8000000, heimild: 'úthlutunarskrár styrkjasjóða í gagnasafni Karp' },
  });
});

test('vörumerki og gjaldþrot án kennitölu fá engan bakgrunn (nafnaleit gæti hitt félag nafna einstaklings)', () => {
  const vm = { id: 'vorumerki-x', type: 'vorumerki', facts: { merki: 'DAGAR', eigandi: 'Dagar hf.' } };
  const gj = { id: 'gjaldthrot-x', type: 'gjaldthrot', facts: { felag: 'Dagar hf.' } };
  assert.equal(baetaVidBakgrunni([vm, gj], GOGN(), { idag: IDAG }), 0);
});

test('kaupandi: „Isavia ohf" og „Isavia ohf." teljast einn kaupandi', () => {
  const e = { id: 'urslit-NU', type: 'urslit', facts: { kaupandi: 'Isavia ohf.', sigurvegarar: ['Dagar hf.'], dags: '2026-09-21', tedNr: 'NU' } };
  baetaVidBakgrunni([e], GOGN(), { idag: IDAG });
  assert.equal(e.facts.bakgrunnur.kaupandi_onnur_utbod_12man, 2);
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
  assert.deepEqual(e.facts.bakgrunnur.thegi.styrkir_fyrri, { fjoldi: 1, samtals_kr: 20000000, heimild: 'úthlutunarskrár styrkjasjóða í gagnasafni Karp' });
});

test('vörumerki og gjaldþrot nota kennitölu atburðarins', () => {
  const vm = { id: 'vorumerki-1', type: 'vorumerki', kt: '5501692829', facts: { merki: 'DAGAR', eigandi: 'Dagar hf.' } };
  const vmEinst = { id: 'vorumerki-2', type: 'vorumerki', kt: '0101801234', facts: { merki: 'JÓN', eigandi: 'Jón Jónsson' } };
  const gj = { id: 'gjaldthrot-1', type: 'gjaldthrot', kt: '5501692829', facts: { felag: 'Dagar hf.', tegund: 'Gjaldþrotaskiptabeiðni' } };
  assert.equal(baetaVidBakgrunni([vm, vmEinst, gj], GOGN(), { idag: IDAG }), 2);
  assert.equal(vm.facts.bakgrunnur.eigandi.utbod_unnin.fjoldi, 3);
  assert.equal(vmEinst.facts.bakgrunnur, undefined, 'einstaklingur fær ekkert');
  assert.equal(gj.facts.bakgrunnur.felagid.rikisgreidslur_12man.samtals_kr, 250000000);
});

test('villa í einum atburði fellur ekki hina; óstuddar tegundir ósnertar', () => {
  const vondur = { id: 'urslit-x', type: 'urslit', facts: { sigurvegarar: ['Dagar hf.'], tedNr: 'X' } };
  const gogn = GOGN(); Object.defineProperty(gogn, 'birgjar', { get() { throw new Error('bilað'); } });
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

// Sviðaheitin lýsa sér sjálf (yfirferð 22.9): „hæsta" er hæsta í gagnaröð Karp, ekki sögulegt hámark.
test('markaðir: röðin, stærsta FYRRI dagshreyfing (án dagsins) og úrvalsvísitalan, með sjálflýsandi heitum', () => {
  const e = { id: 'mark-x', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur, {
    gagnarod: 'lokagengi síðustu 8 viðskiptadaga í gagnasafni Karp',
    vidskiptadagar_i_gagnarod_karp: 8, haesta_i_gagnarod_karp: 11.2, laegsta_i_gagnarod_karp: 10,
    breyting_yfir_gagnarod_karp_pct: 2, staersta_fyrri_dagshreyfing_i_gagnarod_karp_pct: 5,
    hreyfing_dagsins_su_staersta_i_gagnarod_karp: true, urvalsvisitala_breyting_pct: 2,
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
  assert.deepEqual(e.facts.bakgrunnur, { atc_kodi: 'J01EE01', onnur_lyf_sama_efni: 2, thar_af_i_skorti: 1, lyf_i_skorti_a_serlyfjaskra: 241, skortur_skradur_fra: '2026-09-10' });
  const ohekkt = { id: 'lyfskortur-cotrim-1', type: 'lyf', facts: { lyf: 'Cotrim' } };
  baetaVidBakgrunni([ohekkt], GOGN2(), { idag: IDAG, state: { lyfFyrst: { 'cotrim-1': 'ohekkt' } } });
  assert.equal(ohekkt.facts.bakgrunnur.skortur_skradur_fra, undefined, 'óþekkt upphaf er EKKI dagsetning');
});

test('vantandi gagnaskrá fellir ekki: markaðsfrétt án markadir.json fær engan bakgrunn', () => {
  const e = { id: 'mark-y', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3 } };
  assert.equal(baetaVidBakgrunni([e], { ...GOGN(), markadir: null }, { idag: IDAG }), 0);
  assert.ok(['mark', 'verdbolga', 'vextir', 'vika', 'lyf'].every((t) => STUDDAR_TEGUNDIR.includes(t)));
});
