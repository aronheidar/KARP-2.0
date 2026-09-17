import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elinGogn } from './elin.mjs';

const NU = Date.UTC(2026, 8, 16) / 1000;
// ⚠ HREIÐRAÐ eins og raunsvarið. bjarkiGogn las `svar.error` þegar raunsvarið bar `svar.postiz.error`
//   — „óstillt" hefði ALDREI birst, með sjö græn próf, af því fixtures voru flöt.
const svar = (fjarmal, rofi = false) => ({ ok: true, fjarmal, rofi });
const heilt = (yfir = {}) => Object.assign({ ok: true, sott: NU, misraemi: [], fripofanir: [], mrrAskell: 120000, mrrD1: 120000, verdrek: [] }, yfir);

test('MRR úr Áskeli er efsta talan þegar allt stemmir', () => {
  const g = elinGogn(svar(heilt()), [], NU);
  assert.equal(g.tolur[0].n, '120.000');
  assert.equal(g.tolur[0].s, '', 'enginn mismunur, engin undirlína');
});

test('finnist engin upphæð á virku staki stendur óvíst — hálf tala lítur eins út og heil', () => {
  const g = elinGogn(svar(heilt({ mrrAskellOvisst: true })), [], NU);
  assert.equal(g.tolur[0].n, 'óvíst');
});

test('vinnslulistinn raðar eftir PENINGUM, ekki tíma', () => {
  const m = (kt, verd) => ({ tegund: 'gefins', kt, vara: 'kvoti', verd, sidan: NU });
  const g = elinGogn(svar(heilt({ misraemi: [m('1111111111', 1000), m('2222222222', 99000)] })), [], NU);
  assert.match(g.vinnsla[0].texti, /99\.000/, 'dýrasta misræmið er efst');
});

test('náist ekki í Áskel stendur óvíst — ALDREI D1-talan ein', () => {
  // ⚠ Beinn lærdómur af hrafn.mjs: þrjú ástönd sýndu öll „main grænt" þegar ekkert svar barst.
  const g = elinGogn(svar(heilt({ villa: 'askell' })), [], NU);
  assert.equal(g.tolur[0].n, 'óvíst');
});

test('óstillt Áskell sést — villan er HREIÐRUÐ, ekki á toppstigi', () => {
  const g = elinGogn(svar({ ok: false, error: 'unconfigured' }), [], NU);
  assert.equal(g.tolur[0].n, 'óvíst');
  assert.match(g.stada, /óstillt/i);
});

test('mismunur á MRR birtist undir tölunni', () => {
  const g = elinGogn(svar(heilt({ mrrAskell: 100000, mrrD1: 120000 })), [], NU);
  assert.match(g.tolur[0].s, /20\.000/);
});

test('fríprófanir fá eigin flís — annars lítur bilið út eins og villa', () => {
  const g = elinGogn(svar(heilt({ mrrAskell: 0, mrrD1: 13800, fripofanir: [{ kt: '1', vara: 'fyrirtaeki', verd: 6900 }, { kt: '2', vara: 'fyrirtaeki', verd: 6900 }] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'í fríprófun');
  assert.equal(flis.n, '2');
  assert.match(flis.s, /13\.800/);
});

test('misræmi eru talin og sundurliðuð', () => {
  const g = elinGogn(svar(heilt({ misraemi: [
    { tegund: 'borgar_fyrir_ekkert', kt: '1234567890', vara: 'fyrirtaeki', verd: 6900, sidan: NU },
    { tegund: 'gefins', kt: '9876543210', vara: 'kvoti', verd: 9900, sidan: NU },
  ] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'misræmi');
  assert.equal(flis.n, '2');
  assert.match(flis.s, /1 borgar fyrir ekkert/);
  assert.match(flis.s, /1 fær gefins/);
});

test('raðir koma ÚR bidurListi, þær eru ekki smíðaðar hér', () => {
  // ⚠ Bjarki féll á þessu: raðirnar lágu utan bidurThin og sáust hvorki á forstofunni né á andlitinu.
  const bidur = [{ starfsmadur: 'elin', tegund: 'gefins', titill: 'x' }, { starfsmadur: 'hrafn', tegund: 'bilun', titill: 'y' }];
  const g = elinGogn(svar(heilt()), bidur, NU);
  assert.equal(g.bidur.length, 1);
  assert.equal(g.bidur[0].starfsmadur, 'elin');
});

test('kennitala er grímuð í vinnslulistanum', () => {
  const g = elinGogn(svar(heilt({ misraemi: [{ tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 9900, sidan: NU }] })), [], NU);
  assert.ok(!g.vinnsla.some((v) => v.texti.includes('1234567890')), 'full kennitala fer ALDREI í viðmótið');
  assert.ok(g.vinnsla.some((v) => v.texti.includes('123456')), 'fyrri hlutinn dugar til að þekkja');
});

test('rofinn skilar sér', () => {
  const g = elinGogn(svar(heilt(), true), [], NU);
  assert.deepEqual(g.rofi, { lykill: 'rofi_elin', off: true });
});

// ⚠⚠ Punktur 4 — ambiguity sem verk-3-brief.md nefnir EKKI: `verdrek: []` fer út óbreytt hvort sem
//   ekkert verðrek fannst EÐA verðskráin náðist aldrei (villa: 'verdskra_hluti'). Sama gildran og
//   allt verkefnið snýst um — tóma fylkið lítur eins út hvort sem mælingin er hrein núll eða vantar.
//   Úrlausnin sem valin var: AÐEINS `verdskra_hluti` (ekki `d1_hluti`) fær 'óvíst' á þessari flís,
//   af því `d1_hluti` segir ekkert um hvort verðskráin sjálf náðist (sjá athugasemdina við `villa =`
//   í worker/fjarmal.mjs: „EINN kóði fer út; Verk 3 les einn streng" — d1_hluti hylur mögulega
//   samhliða verðskrárbilun þegar bæði bregðast, svo ekkert ÖRUGGT má álykta af honum um verðrek).
test('verðskráin náðist ekki → verðrek-flísin sýnir óvíst, ekki 0 — annars lítur ómælt út eins og hreint', () => {
  const g = elinGogn(svar(heilt({ villa: 'verdskra_hluti', verdrek: [] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'verðrek');
  assert.equal(flis.n, 'óvíst');
});

test('verðrek sýnir raunverulega tölu þegar engin villa hindraði mælinguna', () => {
  const g = elinGogn(svar(heilt({ verdrek: [{ vara: 'kvoti', askell: 1000, fast: 9900 }] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'verðrek');
  assert.equal(flis.n, '1');
});

test('d1_hluti breytir EKKI verðrek-flísinni — aðeins verdskra_hluti gerir það', () => {
  // ⚠ d1_hluti þýðir að D1-heimildalistarnir brugðust, ótengt verðskránni. Að láta hann líka fella
  //   verðrek í óvíst væri ágiskun sem briefið og verk-3 umboðið tóku EKKI afstöðu til — halda þröngt.
  const g = elinGogn(svar(heilt({ villa: 'd1_hluti', verdrek: [] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'verðrek');
  assert.equal(flis.n, '0');
});

// ⚠⚠ Punktur 2 — KRÍTÍSKT: falli toppstigs-girðingin í worker/fjarmal.mjs (`admin`, `method`, `origin`,
//   `adgerd`, `lota`, `rofi`, `verk`, `dispatch`) er ENGINN `fjarmal`-reitur í svarinu — aðeins
//   `{ ok:false, error }` á toppstigi. Mutation-próf staðfesti að ENGIN af ofangreindum 14 prófum grípi
//   það ef hreiðrunar-gátunin (`(s.fjarmal && typeof s.fjarmal==='object') ? s.fjarmal : {}`) er fjarlægð
//   — af því sérhver önnur fixture ber alltaf skilgreindan `fjarmal`-hlut. Þetta próf lokar þeirri glufu.
test('fjarmal-reitur vantar alveg (toppstigs-girðing féll) — spjaldið fellur ekki', () => {
  // ⚠ Punktur 2 krefst þess að `f.error`/`f.villa` séu ALDREI lesin af `undefined` — það er kjarni
  //   þessa prófs, ekki hvaða tala nákvæmlega birtist. Til upplýsingar: af því `f` verður `{}` reiknast
  //   `naest` SATT hér (`f.ok !== false` er hverfandi satt þegar `f.ok` er `undefined`), svo talan sem
  //   birtist er '0', ekki 'óvíst' — crash-vörnin virkar, en hún gerir enga afstöðu til hvort 0 sé rétt
  //   framsetning á „við vitum ekkert því allt svarið vantaði". Það er UTAN þeirra fjögurra atriða sem
  //   þetta verk var sett fyrir (punktur 4 nefnir aðeins verðrek/verdskra_hluti) og er ekki lagfært hér
  //   — flaggað í sjálfsrýni verk-3-report.md fremur en giskað á.
  assert.doesNotThrow(() => elinGogn({ ok: false, error: 'admin' }, [], NU));
  const g = elinGogn({ ok: false, error: 'admin' }, [], NU);
  assert.ok(Array.isArray(g.tolur) && g.tolur.length === 4);
  assert.equal(typeof g.stada, 'string');
});

test('svar er tómt, null eða undefined — spjaldið fellur ekki', () => {
  assert.doesNotThrow(() => elinGogn(undefined, [], NU));
  assert.doesNotThrow(() => elinGogn(null, [], NU));
  assert.doesNotThrow(() => elinGogn({}, [], NU));
  const g = elinGogn({}, [], NU);
  assert.ok(Array.isArray(g.tolur) && g.tolur.length === 4);
  assert.equal(g.bidur.length, 0);
  assert.equal(g.rofi.lykill, 'rofi_elin');
});

// ⚠ Mutation-próf staðfesti að ENGIN af upprunalegu 14 prófunum lesi `stada`-textann fyrir villukóðana
//   fjóra sem búa í VILLUTEXTI — aðeins 'unconfigured' (sem fer ekki gegnum þá töflu) var athugað.
//   Væri einn lykill í VILLUTEXTI ritvilla hefði spjaldið sagt „óþekkt villa: …" án þess að nokkurt próf
//   tæki eftir því — nákvæmlega það sem athugasemdin við VILLUTEXTI í briefinu varar við.
test('villa: askell — sagt berum orðum í stöðunni, ekki bara í tölunni', () => {
  const g = elinGogn(svar(heilt({ villa: 'askell' })), [], NU);
  assert.match(g.stada, /Áskel/i);
});

test('villa: d1_hluti — sagt berum orðum í stöðunni', () => {
  const g = elinGogn(svar(heilt({ villa: 'd1_hluti' })), [], NU);
  assert.match(g.stada, /heimildalista/i);
});

test('villa: verdskra_hluti — sagt berum orðum í stöðunni', () => {
  const g = elinGogn(svar(heilt({ villa: 'verdskra_hluti' })), [], NU);
  assert.match(g.stada, /verðskrá/i);
});

test('villa: rofi — sagt berum orðum í stöðunni', () => {
  const g = elinGogn(svar(heilt({ villa: 'rofi' })), [], NU);
  assert.match(g.stada, /slökkt/i);
});

test('óþekktur villukóði er ALDREI þögull — hrái kóðinn sést frekar en tómt eða rangt', () => {
  const g = elinGogn(svar(heilt({ villa: 'eitthvad-sem-verk-2-bickar-vid-seinna' })), [], NU);
  assert.match(g.stada, /eitthvad-sem-verk-2-bickar-vid-seinna/);
  assert.equal(g.tolur[0].n, 'óvíst', 'óþekkt villa er samt villa — talan á að falla');
});

// ⚠ Mutation-próf staðfesti að hvorki greinin „allt stemmir" né misræmis-talningin í `stada` væri
//   varin af neinu af upprunalegu prófunum — bæði lesa `tolur`/`vinnsla`, aldrei `stada` sjálfa hér.
test('staðan segir að allt stemmi þegar engin misræmi eru og engin villa', () => {
  const g = elinGogn(svar(heilt()), [], NU);
  assert.match(g.stada, /stemma/i);
});

test('staðan telur misræmin þegar þau eru til staðar', () => {
  const g = elinGogn(svar(heilt({ misraemi: [{ tegund: 'gefins', kt: '1111111111', vara: 'kvoti', verd: 100, sidan: NU }] })), [], NU);
  assert.match(g.stada, /1 misræmi/);
});

// ⚠ `sidast` var ekki athugað af neinu af upprunalegu prófunum — `f.sott` hefði mátt víxlast við
//   hvaða annan tímastimpil sem er án þess að nokkuð félli.
test('sidast endurspeglar sott-tímastimpilinn úr fjarmal', () => {
  const g = elinGogn(svar(heilt({ sott: NU })), [], NU);
  assert.match(g.sidast, /kl\./);
  assert.equal(g.sidast, elinGogn(svar(heilt({ sott: NU })), [], NU).sidast, 'stöðugt fyrir sama inntak');
  // ólíkir sott-tímar gefa ólíkan texta — annars er reiturinn ekki í raun tengdur sott
  const annar = elinGogn(svar(heilt({ sott: NU - 3600 })), [], NU).sidast;
  assert.notEqual(g.sidast, annar);
});

// ⚠⚠ Ein af Altæku girðingunum: „Elín hreyfir aldrei peninga." Þetta próf pinnir að setningin sé
//   raunverulega í `heimildir`-listanum — ekki bara í athugasemd í kóðanum.
test('heimildirnar segja skýrt að Elín hreyfi aldrei peninga', () => {
  const g = elinGogn(svar(heilt()), [], NU);
  assert.match(g.heimildir.join(' | '), /hreyfir aldrei peninga/i);
});

// ⚠ Upprunalega prófið um kennitölugrímu athugar aðeins að FYRSTU 6 stafir SÉU til staðar og að
//   FULL kennitala vanti — það grípur ekki ef gríman lekur t.d. sjöunda stafnum líka. Kennitala er
//   persónuupplýsing, svo lengdin sjálf á að vera nákvæm, ekki „a.m.k. 6 stafir".
test('kennitala-gríman sýnir NÁKVÆMLEGA fyrstu 6 stafina — hvorki fleiri né færri', () => {
  const g = elinGogn(svar(heilt({ misraemi: [{ tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 100, sidan: NU }] })), [], NU);
  assert.match(g.vinnsla[0].texti, /(?:^|\D)123456-••••/, 'fyrstu 6 stafir + grímumerki');
  assert.ok(!g.vinnsla[0].texti.includes('1234567'), 'sjöundi stafurinn má ALDREI leka út');
});

// ⚠ Ekkert af upprunalegu prófunum setti fleiri en tvö misræmi í einu — fimm-sæta þakið (sama
//   mynstur og bjarki.mjs notar fyrir „í vinnslu") var því aldrei æft.
test('vinnslulistinn er takmarkaður við fimm efstu færslurnar, dýrasta fyrst', () => {
  const mm = Array.from({ length: 8 }, (_, i) => ({ tegund: 'gefins', kt: String(1000000000 + i), vara: 'kvoti', verd: (i + 1) * 1000, sidan: NU }));
  const g = elinGogn(svar(heilt({ misraemi: mm })), [], NU);
  assert.equal(g.vinnsla.length, 5);
  assert.match(g.vinnsla[0].texti, /8\.000/, 'dýrasta af öllum átta er efst, þótt aðeins fimm rúmist');
});

// ⚠⚠ Upprunalega prófið „misræmi eru talin og sundurliðuð" notar EITT stak af hvorri tegund — ef
//   `borga`- og `gefins`-talningin víxlaðist (læsi hin á ranga `tegund`-strengsstöðu) sýndi útkoman
//   samt „1 borgar fyrir ekkert · 1 fær gefins" af tilviljun, af því 1 = 1. Ósamhverfar tölur þarf til
//   að ljóstra upp víxlun.
test('misræmis-sundurliðunin víxlast ekki þegar fjöldi tegundanna er ÓLÍKUR', () => {
  const g = elinGogn(svar(heilt({ misraemi: [
    { tegund: 'borgar_fyrir_ekkert', kt: '1111111111', vara: 'fyrirtaeki', verd: 6900, sidan: NU },
    { tegund: 'borgar_fyrir_ekkert', kt: '2222222222', vara: 'fyrirtaeki', verd: 6900, sidan: NU },
    { tegund: 'gefins', kt: '3333333333', vara: 'kvoti', verd: 9900, sidan: NU },
  ] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'misræmi');
  assert.equal(flis.n, '3');
  assert.match(flis.s, /2 borgar fyrir ekkert/);
  assert.match(flis.s, /1 fær gefins/);
});
