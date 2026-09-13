import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FIRMA_STOP, firmaKandidatar, firmaKt, firmaNafn, sernafn } from './firma-nafn.mjs';

// ── Kennitala stuttsníður allt ────────────────────────────────────────────────
test('firmaKt: með og án bandstriks', () => {
  assert.equal(firmaKt('hver á 630780-0129?'), '6307800129');
  assert.equal(firmaKt('kt 6307800129 takk'), '6307800129');
  assert.equal(firmaKt('engin kennitala hér'), null);
});

test('firmaKt: 9 eða 11 tölustafir eru EKKI kennitala', () => {
  assert.equal(firmaKt('630780012'), null);
  assert.equal(firmaKt('63078001299'), null);
});

test('firmaKandidatar: kennitala skilar EINUM kandidat (engin auka-uppfletting)', () => {
  assert.deepEqual(firmaKandidatar('er 630780-0129 í vanskilum?'), ['6307800129']);
});

// ── Kostur 1 er óbreyttur (engin afturför í því sem virkar í dag) ─────────────
test('firmaNafn: stopporð strípuð, röð haldist', () => {
  assert.equal(firmaNafn('Er Brim hf á refsilista?'), 'brim hf');
  assert.equal(firmaNafn('hver á Alvotech?'), 'alvotech');
});

test('firmaKandidatar: kostur 1 er ALLTAF fremstur', () => {
  assert.equal(firmaKandidatar('Er Brim hf á refsilista?')[0], 'brim hf');
});

// ── Tilvikið sem brotnaði í raun (lotan 13.9.2026) ───────────────────────────
test('raun-galli: „þvingunaraðgerðir í gildi gagnvart Alvotech" nær félaginu um kost 2', () => {
  const k = firmaKandidatar('Eru þvingunaraðgerðir í gildi gagnvart Alvotech?');
  // Kostur 1 er rusl — stopporðalistinn nær ekki beygingunni. Það er einmitt forsendan.
  assert.equal(k[0], 'þvingunaraðgerðir gildi gagnvart alvotech');
  assert.equal(k[1], 'Alvotech');
});

test('sernafn sleppir fyrsta orði setningar (stafsetning, ekki sérnafn)', () => {
  assert.equal(sernafn('Eru þvingunaraðgerðir gagnvart Alvotech?'), 'Alvotech');
  assert.equal(sernafn('Hver á Brim?'), 'Brim');
});

test('sernafn: fyrsta orðið notað þegar ekkert annað hástafað orð finnst', () => {
  assert.equal(sernafn('Alvotech skuldar hvað?'), '');
  assert.equal(sernafn('Alvotech skuldar hvað?', { slepptaFyrsta: false }), 'Alvotech');
  // Hér leysir kostur 1 málið strax („skuldar"/„hvað" eru stopporð) og dedup sleppir réttilega
  // tvítekinni uppflettingu — sérnafna-varaleiðin á EKKI að bæta við öðrum kandidat að óþörfu.
  assert.deepEqual(firmaKandidatar('Alvotech skuldar hvað?'), ['alvotech']);
});

test('sérnafn nær félaginu þegar setningin byrjar á því OG kostur 1 er rusl', () => {
  // Fyrsta orðið er hástafað af stafsetningarástæðum, svo það er aðeins tekið í seinni tilraun.
  const k = firmaKandidatar('Alvotech — eru þvingunaraðgerðir gagnvart þeim?');
  assert.equal(k[k.length - 1], 'Alvotech');
});

// ── Félagsform loða við nafnið ───────────────────────────────────────────────
test('sernafn heldur félagsformi sem fylgir á eftir', () => {
  assert.equal(sernafn('Eru þvingunaraðgerðir gagnvart Alvotech hf?'), 'Alvotech hf');
  assert.equal(sernafn('Hvað með Icelandair Group hf.?'), 'Icelandair Group hf');
});

test('sernafn: lengsta runan valin', () => {
  assert.equal(sernafn('Er starfsemi Íslandsbanka hf í Reykjavík?'), 'Íslandsbanka hf');
});

// ── Íslenskir stafir (\b og \w virka ekki á þá — þess vegna þetta próf) ──────
test('sernafn þekkir hástafi með broddi/séríslenska stafi', () => {
  assert.equal(sernafn('Hver rekur Ölgerðina?'), 'Ölgerðina');
  assert.equal(sernafn('Hvað með Þorbjörn?'), 'Þorbjörn');
  assert.equal(sernafn('Hvað með Árvakur?'), 'Árvakur');
});

// ── Vörn gegn nákvæmlega þeirri lagfæringu sem hefði verið röng ─────────────
test('„gildi" er EKKI stopporð — Gildi lífeyrissjóður má finnast', () => {
  assert.equal(FIRMA_STOP.has('gildi'), false);
  assert.equal(firmaNafn('hver á Gildi?'), 'gildi');
});

// ── Engir tómir/tvíteknir kandidatar (hver kostar uppflettingu) ─────────────
test('firmaKandidatar: engin tvítekning þegar kostirnir fara saman', () => {
  const k = firmaKandidatar('hver á Alvotech?');
  assert.deepEqual(k, ['alvotech']);
});

test('firmaKandidatar: aldrei fleiri en tveir, aldrei tómir', () => {
  for (const q of ['Er Brim hf á refsilista?', 'Eru þvingunaraðgerðir í gildi gagnvart Alvotech?',
    'hvað?', '', 'Hver á Íslandsbanka hf og Arion banka hf?']) {
    const k = firmaKandidatar(q);
    assert.ok(k.length <= 2, q);
    assert.ok(k.every((x) => x && x.trim().length >= 2), q);
  }
});

test('firmaKandidatar: tóm/gagnslaus spurning skilar engu nothæfu', () => {
  assert.deepEqual(firmaKandidatar(''), []);
});

test('spurnarorð leiða ekki í félagaleit („Hvar finn ég…" → Hvar ehf)', () => {
  // Raunverulegt tilvik úr lifandi verifun: „Hvar finn ég upplýsingar um eigendur fyrirtækja?"
  // skilaði félaginu Hvar ehf., sem spjallið bar fram sem dæmi. „hvar" var ekki stopporð.
  // (Skilaði 'fyrirtækja' þegar þetta próf var skrifað; eignarfallið varð líka stopporð í
  //  næstu lotu því það fann Fyrirtækjaárshátíð Tálknafjarða. Nú stendur ekkert eftir — rétt.)
  assert.equal(firmaNafn('Hvar finn ég upplýsingar um eigendur fyrirtækja?'), '');
  assert.equal(FIRMA_STOP.has('hvar'), true);
});

test('félagið Hvar ehf. finnst SAMT þegar spurt er um það', () => {
  // Vörnin gegn of víðum stopporðalista: sérnafna-varaleiðin grípur félagið þótt „hvar" sé strípað.
  // Þetta er einmitt ástæðan fyrir tveggja-kandidata hönnuninni.
  const k = firmaKandidatar('Hver á Hvar ehf?');
  assert.ok(k.some((x) => /hvar ehf/i.test(x)), 'Hvar ehf. týndist: ' + JSON.stringify(k));
});

test('beygingar kjarnaorðanna eru allar stopporð (fyrirtæki/félag)', () => {
  // Listinn hafði fyrirtæki/fyrirtækið/fyrirtækinu en EKKI eignarfallið „fyrirtækja" — svo
  // „…um eigendur fyrirtækja?" leitaði að „fyrirtækja" og fann Fyrirtækjaárshátíð Tálknafjarða.
  for (const o of ['fyrirtæki', 'fyrirtækja', 'fyrirtækjum', 'félag', 'félaga', 'félögum', 'félög']) {
    assert.equal(FIRMA_STOP.has(o), true, 'vantar stopporð: ' + o);
  }
  assert.equal(firmaNafn('Hvar finn ég upplýsingar um eigendur fyrirtækja?'), '');
});
