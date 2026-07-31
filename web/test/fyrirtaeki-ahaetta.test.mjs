import { test } from 'node:test';
import assert from 'node:assert';
import { coreName, nameMatch, flakkMatches, sanctionNames, areidStig, pepNorm, pepMatch, pepScreen, FLAKK_TYPES } from '../src/lib/fyrirtaeki-ahaetta.mjs';

// ── Kjarnanafn ────────────────────────────────────────────────────────────────
test('coreName: félagsform, hljóðmerki og greinarmerki hverfa', () => {
  assert.equal(coreName('Nói Síríus hf.'), 'noi sirius');
  assert.equal(coreName('ÖSSUR ehf'), 'ossur');
  assert.equal(coreName(''), '');
  assert.equal(coreName(null), '');
});

test('coreName: þ/ð/æ eru UMRITUÐ, ekki hent (nöfn héldust heil)', () => {
  // Eldri útgáfan skilaði 'or'/'gir'/'orbjorn'/'s plast' — sjá skýringu í einingunni.
  assert.equal(coreName('Þór ehf'), 'thor');
  assert.equal(coreName('Ægir ehf'), 'aegir');
  assert.equal(coreName('Þorbjörn hf'), 'thorbjorn');
  assert.equal(coreName('Sæplast hf'), 'saeplast');
  assert.equal(coreName('Bæjarbakarí ehf'), 'baejarbakari');
  assert.equal(coreName('Naustið ehf'), 'naustid');
});

test('coreName: nöfn sem áður féllu undir 4-stafa vörnina ná henni nú', () => {
  // core.length < 4 → flakkMatches sleppir uppflettingu alveg. Þessi félög fengu ALDREI F8-athugun.
  for (const n of ['Þór ehf', 'Ægir ehf', 'Þöll ehf']) assert.ok(coreName(n).length >= 4, n + ' → ' + coreName(n));
});

test('coreName: sama félag ritað á ólíka vegu fær sama kjarnanafn', () => {
  assert.equal(coreName('Brim hf.'), coreName('BRIM  HF'));
  assert.equal(coreName('Eimskip ehf'), coreName('Eimskip'));
});

// ── Nafnasamsvörun ────────────────────────────────────────────────────────────
test('nameMatch: nákvæmlega sama kjarnanafn samsvarar', () => {
  assert.equal(nameMatch('noi sirius', 'noi sirius'), true);
  assert.equal(nameMatch('brim', 'brim'), true);
});

test('nameMatch: heilt orða-forskeyti (≥7 stafir) samsvarar', () => {
  assert.equal(nameMatch('islandshotel', 'islandshotel reykjavik'), true);
  assert.equal(nameMatch('islandshotel reykjavik', 'islandshotel'), true);
});

test('nameMatch: stutt nöfn samsvara EKKI á forskeyti (of margar tilviljanir)', () => {
  assert.equal(nameMatch('brim', 'brim fasteignir'), false);      // 4 stafir < 7
  assert.equal(nameMatch('vordur', 'vordur eignir'), false);      // 6 stafir < 7
});

test('nameMatch: forskeyti verður að enda á orðaskilum', () => {
  assert.equal(nameMatch('islandsbanki', 'islandsbankinn hf'), false);   // ekki heilt orð
});

test('nameMatch: TALA ein og sér er ekki tengsl (Vesturbyggð vs Vesturbyggð 8)', () => {
  // Eina falska samsvörunin í 2.776 nafna prófun gegn Lögbirtingar-safninu: sveitarfélagið
  // Vesturbyggð tengt við gjaldþrot óskylds „Vesturbyggð 8 ehf“ — húsnúmer, ekki félagatengsl.
  assert.equal(nameMatch('vesturbyggd', 'vesturbyggd 8'), false);
  assert.equal(nameMatch('vesturbyggd 8', 'vesturbyggd'), false);
  assert.equal(nameMatch('hverfisgata', 'hverfisgata 105'), false);
  // en orð á eftir forskeytinu telst áfram vísbending
  assert.equal(nameMatch('vesturbyggd', 'vesturbyggd eignir'), true);
});

test('nameMatch: tómt eða vantandi nafn samsvarar aldrei', () => {
  assert.equal(nameMatch('', 'brim'), false);
  assert.equal(nameMatch(null, 'brim'), false);
  assert.equal(nameMatch('brim', ''), false);
});

// ── F8: kennitöluflakk ────────────────────────────────────────────────────────
const safn = {
  '4901234567': { name: 'Fönix ehf', notices: [{ type: 'skiptalok', date: '2026-03-01' }, { type: 'skiptalok', date: '2026-05-01' }] },
  '4907654321': { name: 'Fönix ehf', notices: [] },                                        // sama nafn, engin þrota-tilkynning
  '4900000001': { name: 'Óskylt félag ehf', notices: [{ type: 'felagsslit', date: '2026-01-01' }] },
  '4900000002': { name: 'Fönix Reykjavík ehf', notices: [{ type: 'gjaldthrot_beidni', date: '2026-02-01' }] },
  '4900000003': { name: 'Fönix 3 ehf', notices: [{ type: 'skiptabeidni', date: '2026-02-01' }] },
  '4900000004': { name: 'Fönix ehf', notices: [{ type: 'adalfundur', date: '2026-02-01' }] },   // ótengd tilkynning
};

test('flakkMatches: engin gögn → null, ekki tómt (ólíkt „engin samsvörun“)', () => {
  assert.equal(flakkMatches(null, '4900000009', 'Fönix ehf'), null);
});

test('flakkMatches: of stutt nafn skilar engu án þess að fletta upp', () => {
  assert.deepEqual(flakkMatches(null, '1', 'Ás ehf'), []);
});

test('flakkMatches: finnur samnefnt félag með þrota-tilkynningu', () => {
  const m = flakkMatches(safn, '4900000009', 'Fönix ehf');
  assert.deepEqual(m.map((x) => x.kt).sort(), ['4901234567']);
});

test('flakkMatches: „Fönix“ (5 stafir) tengist EKKI „Fönix Reykjavík“ — undir 7-stafa forskeytisreglu', () => {
  assert.ok(!flakkMatches(safn, '4900000009', 'Fönix ehf').map((x) => x.kt).includes('4900000002'));
});

test('flakkMatches: sleppir sjálfu sér, tilkynningalausum og ótengdum tegundum', () => {
  const m = flakkMatches(safn, '4901234567', 'Fönix ehf');
  const kts = m.map((x) => x.kt);
  assert.ok(!kts.includes('4901234567'), 'á ekki að tengja félag við sjálft sig');
  assert.ok(!kts.includes('4907654321'), 'samnefnt án þrota-tilkynningar');
  assert.ok(!kts.includes('4900000004'), 'aðalfundur er ekki þrot');
  assert.ok(!kts.includes('4900000001'), 'óskylt nafn');
});

test('flakkMatches: kennitala með bandstriki telst sama félag', () => {
  const m = flakkMatches(safn, '490123-4567', 'Fönix ehf');
  assert.ok(!m.map((x) => x.kt).includes('4901234567'));
});

test('flakkMatches: tölu-viðbót tengist ekki (Fönix vs Fönix 3)', () => {
  assert.ok(!flakkMatches(safn, '4900000009', 'Fönix ehf').map((x) => x.kt).includes('4900000003'));
});

test('flakkMatches: skilar NÝJUSTU tilkynningunni', () => {
  const m = flakkMatches(safn, '4900000009', 'Fönix ehf').find((x) => x.kt === '4901234567');
  assert.equal(m.date, '2026-05-01');
  assert.equal(m.name, 'Fönix ehf');
});

test('FLAKK_TYPES: aðeins þrot/slit teljast', () => {
  for (const t of ['felagsslit', 'gjaldthrot_beidni', 'skiptabeidni', 'skiptalok']) assert.ok(FLAKK_TYPES[t]);
  for (const t of ['adalfundur', 'innkollun', 'naudungarsala']) assert.ok(!FLAKK_TYPES[t]);
});

// ── F9: refsilista-nöfn ───────────────────────────────────────────────────────
test('sanctionNames: félag + eigendur + ráðamenn, „ - “-viðhengi burt', () => {
  const r = sanctionNames('Brim', [{ nafn: 'Jón Jónsson - 50%' }], ['Anna Ansdóttir - stjórnarformaður']);
  assert.deepEqual(r.names, ['Brim', 'Jón Jónsson', 'Anna Ansdóttir']);
  assert.equal(r.alls, 3);
  assert.equal(r.skorid, 0);
});

test('sanctionNames: KOMMA er klippt burt — annars klofnar nafnið á þjóninum', () => {
  // Þjónninn tekur við kommu-aðgreindum lista; „Jón Jónsson, Hverfisgötu 5“ hefði orðið
  // að tveimur gervinöfnum og hvorugt skimast rétt.
  const r = sanctionNames('Brim', [{ nafn: 'Jón Jónsson, Hverfisgötu 5' }], []);
  assert.deepEqual(r.names, ['Brim', 'Jón Jónsson']);
  for (const n of r.names) assert.ok(!n.includes(','), 'ekkert nafn má innihalda kommu');
});

test('sanctionNames: tvítekningar (sami maður eigandi OG ráðamaður) telja einu sinni', () => {
  const r = sanctionNames('Brim', [{ nafn: 'Jón Jónsson - 50%' }], ['jón jónsson', 'Anna Ansdóttir']);
  assert.deepEqual(r.names, ['Brim', 'Jón Jónsson', 'Anna Ansdóttir']);
  assert.equal(r.alls, 3);
});

test('sanctionNames: stytting er TALIN og sýnileg, ekki þögul', () => {
  const eig = Array.from({ length: 45 }, (_, i) => ({ nafn: 'Eigandi ' + i }));
  const r = sanctionNames('Brim', eig, []);
  assert.equal(r.names.length, 40);
  assert.equal(r.alls, 46);
  assert.equal(r.skorid, 6);
});

test('sanctionNames: tóm/vantandi gögn skila engu án þess að falla', () => {
  const r = sanctionNames('', null, undefined);
  assert.deepEqual(r.names, []);
  assert.equal(r.alls, 0);
  assert.equal(r.skorid, 0);
  assert.deepEqual(sanctionNames('Brim', [{}, { nafn: '' }, null], [null, '']).names, ['Brim']);
});

// ── KYC-samantektarmerki ──────────────────────────────────────────────────────
test('areidStig: ENGINN úrskurður meðan reitir bíða svars', () => {
  // Kjarninn: græn „engin neikvæð stöðumerki“ mátti ekki birtast áður en refsilista-
  // og PEP-skimun skiluðu sér. lvl === null þýðir að merkið er falið (.fs-ar-stig.n).
  const s = areidStig(['g', 'g', 'u', 'u', 'u']);
  assert.equal(s.lvl, null);
  assert.equal(s.lokid, false);
  assert.equal(s.label, 'Athuganir í vinnslu…');
  assert.equal(s.bidur, 3);
});

test('areidStig: reitur sem svaraði ÁN merkis er kláraður, ekki „bíður“', () => {
  // „Engir aðilar“ / „Í fullri fyrirtækjaskýrslu →“ eru niðurstöður. Eldri útgáfan taldi þær
  // sem óklárað, svo merkið sat fast í „(í vinnslu…)“ að eilífu — lánshæfis-reiturinn er ALLTAF 'n'.
  const s = areidStig(['g', 'g', 'n', 'n']);
  assert.equal(s.lokid, true);
  assert.equal(s.bidur, 0);
  assert.equal(s.tomar, 2);
  assert.equal(s.skilad, 2);
  assert.equal(s.lvl, 'g');
});

test('areidStig: úrskurður fylgir alvarlegasta merkinu', () => {
  assert.equal(areidStig(['g', 'g', 'g']).label, 'Engin neikvæð stöðumerki');
  assert.equal(areidStig(['g', 'o']).label, 'Minniháttar athugunarefni');
  assert.equal(areidStig(['g', 'o', 'o']).label, 'Nokkur athugunarefni');
  assert.equal(areidStig(['g', 'o', 'o', 'b']).label, 'Alvarleg stöðumerki');
  assert.equal(areidStig(['g', 'o', 'o', 'b']).lvl, 'b');
});

test('areidStig: tímamörk með ósvöruðum reitum segja það BEINT (ekki grænt)', () => {
  const s = areidStig(['g', 'g', 'u'], true);
  assert.equal(s.label, 'Athuganir kláruðust ekki');
  assert.equal(s.lvl, 'o');
  assert.notEqual(s.lvl, 'g');
  assert.equal(s.bidur, 1);
});

test('areidStig: talning skilar sér til framsetningar', () => {
  const s = areidStig(['g', 'g', 'o', 'b', 'n']);
  assert.equal(s.alls, 5);
  assert.equal(s.skilad, 4);
  assert.equal(s.tomar, 1);
  assert.deepEqual(s.merki, { g: 2, o: 1, b: 1 });
});

test('areidStig: engir reitir → ekkert merki', () => {
  assert.equal(areidStig([]), null);
  assert.equal(areidStig(null), null);
});

test('areidStig: óþekktur stöðustafur telst BÍÐA (varlegast)', () => {
  const s = areidStig(['g', 'x']);
  assert.equal(s.bidur, 1);
  assert.equal(s.lvl, null);
});

// ── PEP-skimun ────────────────────────────────────────────────────────────────
const FOLK = [
  { n: 'jon jonsson', hlutverk: 'alþingismaður' },
  { n: 'anna d ansdottir', hlutverk: 'ráðherra' },
  { n: 'sigurdur thorsson', hlutverk: 'sveitarstjóri' },
];

test('pepNorm: lágstafað, hljóðmerki burt, en ð/þ/æ haldast', () => {
  assert.equal(pepNorm('Jón Jónsson'), 'jon jonsson');
  assert.equal(pepNorm('Sigurður Þórsson'), 'sigurður þorsson');
  assert.equal(pepNorm('Anna D. Ansdóttir'), 'anna d ansdottir');
  assert.equal(pepNorm(null), '');
});

test('pepMatch: fornafn + eftirnafn ráða, millinafn skiptir ekki máli', () => {
  assert.equal(pepMatch('Jón Jónsson', FOLK).hlutverk, 'alþingismaður');
  assert.equal(pepMatch('Anna Dóra Ansdóttir', FOLK).hlutverk, 'ráðherra');
  assert.equal(pepMatch('Jón Sigurðsson', FOLK), null);
});

test('pepMatch: eitt nafn samsvarar aldrei (of veikt)', () => {
  assert.equal(pepMatch('Jón', FOLK), null);
  assert.equal(pepMatch('', FOLK), null);
});

test('pepScreen: LISTI EKKI TILTÆKUR skilar null, ekki „hreinu“', () => {
  // Kjarninn: fsPep() skilaði [] bæði þegar sóknin brást OG þegar hún tókst, og reiturinn
  // fór í grænt „Engin þekkt“ — hrein PEP-niðurstaða út á gögn sem aldrei hlóðust.
  assert.equal(pepScreen(null, [{ nafn: 'Jón Jónsson' }], []), null);
  assert.equal(pepScreen([], [{ nafn: 'Jón Jónsson' }], []), null);
  assert.equal(pepScreen(undefined, [], []), null);
});

test('pepScreen: ekkert til að skima er ekki hrein niðurstaða heldur', () => {
  const r = pepScreen(FOLK, [], []);
  assert.equal(r.skimad, 0);
  assert.deepEqual(r.hits, []);
});

test('pepScreen: finnur eigendur og ráðamenn með hlutverki', () => {
  const r = pepScreen(FOLK, [{ nafn: 'Jón Jónsson - 60%', hlutur: '60%' }], ['Anna Dóra Ansdóttir - Stjórnarformaður']);
  assert.equal(r.skimad, 2);
  assert.equal(r.hits.length, 2);
  assert.equal(r.hits[0].nafn, 'Jón Jónsson');
  assert.ok(r.hits[0].felagshlutverk.includes('eigandi'));
  assert.equal(r.hits[1].felagshlutverk, 'stjórnarformaður');
  assert.equal(r.hits[1].pep.hlutverk, 'ráðherra');
});

test('pepScreen: sami PEP tvisvar telst einu sinni', () => {
  const r = pepScreen(FOLK, [{ nafn: 'Jón Jónsson' }], ['Jón Jónsson - framkvæmdastjóri']);
  assert.equal(r.skimad, 2);
  assert.equal(r.hits.length, 1);
});

test('pepScreen: engin samsvörun með raunverulegri skimun er hrein niðurstaða', () => {
  const r = pepScreen(FOLK, [{ nafn: 'Ólafur Ólafsson' }], ['Björk Björnsdóttir - stjórn']);
  assert.equal(r.skimad, 2);
  assert.deepEqual(r.hits, []);
});
