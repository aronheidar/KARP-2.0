import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elinGogn } from './elin.mjs';

const NU = Date.UTC(2026, 8, 16) / 1000;
// ⚠ HREIÐRAÐ eins og raunsvarið. bjarkiGogn las `svar.error` þegar raunsvarið bar `svar.postiz.error`
//   — „óstillt" hefði ALDREI birst, með sjö græn próf, af því fixtures voru flöt.
const svar = (fjarmal, rofi = false) => ({ ok: true, fjarmal, rofi });
// ⚠ `verdrekMaelt: true` er hluti af „heilt": raunverulegt svar frá worker/fjarmal.mjs setur reitinn
//   á ÖLLUM leiðum (sjá _fjTomt þar), svo sjálfgefið hér á að vera true — annars þyrfti nánast hvert
//   próf í skránni sem alls ekki fjallar um verðrek að nefna hann sérstaklega til að halda áfram að
//   sýna rétta tölu á þeirri flís.
const heilt = (yfir = {}) => Object.assign({ ok: true, sott: NU, misraemi: [], fripofanir: [], mrrAskell: 120000, mrrD1: 120000, verdrek: [], verdrekMaelt: true }, yfir);

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

// ⚠⚠ Punktur 4 (ENDURSKOÐAÐ — sjá verk-3-report.md „Áhyggjur"): upprunalega útfærslan giskaði á
//   `f.villa === 'verdskra_hluti'` til að greina hvort verðrek væri mælt, og þrengdi vísvitandi svo
//   `d1_hluti` breytti engu. Sú ágiskun stóðst EKKI: endapunkturinn skilar AÐEINS EINUM villukóða og
//   `d1_hluti` ÞAGGAR `verdskra_hluti` þegar bæði D1 og verðskráin bregðast samtímis (sjá
//   athugasemdina við `villa =` í worker/fjarmal.mjs) — svo „`villa` er ekki verdskra_hluti" sannar
//   EKKI að verðskráin hafi náðst. Verkefnisstjórinn svaraði því: hætta að giska í spjaldinu og láta
//   worker-inn segja það beint með sjálfstæðum reit, `f.verdrekMaelt` (Verk 2/3-lag, sett af
//   `saekjaFjarmal`). Prófin hér mæla ÞANN reit — ekki `villa` — og sanna sérstaklega að hann ræður
//   ÓHÁÐ því hvaða villukóði (ef nokkur) fylgir með.
test('verdrekMaelt: false → verðrek-flísin sýnir óvíst, ÓHÁÐ villukóðanum — d1_hluti getur falið bilaða verðskrá', () => {
  // ⚠ Þetta er nákvæmlega atriðið sem gamla ágiskunin missti af: villa er 'd1_hluti' (EKKI
  //   'verdskra_hluti'), svo gamla skilyrðið (`f.villa === 'verdskra_hluti'`) hefði sýnt '0' hér þótt
  //   verðskráin hafi líka brugðist samtímis D1.
  const g = elinGogn(svar(heilt({ villa: 'd1_hluti', verdrekMaelt: false, verdrek: [] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'verðrek');
  assert.equal(flis.n, 'óvíst');
});

test('verdrekMaelt: true → verðrek sýnir raunverulega tölu, LÍKA þegar d1_hluti er til staðar', () => {
  // ⚠ Hin hliðin: d1_hluti þýðir ekki alltaf að verðskráin hafi brugðist — stundum brotnar AÐEINS D1
  //   og verðskráin náðist fullkomlega. Talan á að sjást þá, ekki fela sig á bak við villukóða sem
  //   tilheyrir allt öðru gati.
  const g = elinGogn(svar(heilt({ villa: 'd1_hluti', verdrekMaelt: true, verdrek: [{ vara: 'kvoti', askell: 1000, fast: 9900 }] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'verðrek');
  assert.equal(flis.n, '1');
});

test('verdrekMaelt vantar (t.d. eldra svarsnið) → verðrek-flísin sýnir óvíst, ekki 0 — sjálfgefið er varkárt', () => {
  const g = elinGogn(svar(heilt({ verdrekMaelt: undefined, verdrek: [] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'verðrek');
  assert.equal(flis.n, 'óvíst');
});

test('verðrek sýnir raunverulega tölu þegar verðskráin náðist og engin villa er til staðar', () => {
  const g = elinGogn(svar(heilt({ verdrek: [{ vara: 'kvoti', askell: 1000, fast: 9900 }] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'verðrek');
  assert.equal(flis.n, '1');
});

// ⚠⚠ Punktur 2 — KRÍTÍSKT: falli toppstigs-girðingin í worker/fjarmal.mjs (`admin`, `method`, `origin`,
//   `adgerd`, `lota`, `rofi`, `verk`, `dispatch`) er ENGINN `fjarmal`-reitur í svarinu — aðeins
//   `{ ok:false, error }` á toppstigi. Mutation-próf staðfesti að ENGIN af ofangreindum 14 prófum grípi
//   það ef hreiðrunar-gátunin (`(s.fjarmal && typeof s.fjarmal==='object') ? s.fjarmal : {}`) er fjarlægð
//   — af því sérhver önnur fixture ber alltaf skilgreindan `fjarmal`-hlut. Þetta próf lokar þeirri glufu.
test('fjarmal-reitur vantar alveg (toppstigs-girðing féll) — spjaldið fellur ekki', () => {
  // ⚠ LAGFÆRT (var flaggað í sjálfsrýni verk-3-report.md fremur en giskað á þá): áður sýndi MRR-flísin
  //   '0' hér af því `f` verður `{}` og `f.ok !== false` er þá hverfandi SATT (`f.ok` er `undefined`) —
  //   núll þar sem ekkert var mælt leit út eins og staðfest núll, nákvæmlega sama gildran og punktur 1
  //   í þessu verki fjallar um, bara á öðrum stað. `fjarmalVantar` er nú sjálfstæð athugun á `s.fjarmal`
  //   SJÁLFU, reiknuð Á UNDAN `f`-sjálfgildinu — hvorki `f.ok` né neitt annað innan `f` getur falsað hana.
  assert.doesNotThrow(() => elinGogn({ ok: false, error: 'admin' }, [], NU));
  const g = elinGogn({ ok: false, error: 'admin' }, [], NU);
  assert.ok(Array.isArray(g.tolur) && g.tolur.length === 4);
  assert.equal(typeof g.stada, 'string');
  assert.equal(g.tolur[0].n, 'óvíst', 'ekkert svar barst yfirhöfuð — talan má ekki líta út eins og mæld núll');
});

// ⚠ Hin áttin, sem verður að standast SAMHLIÐA prófinu að ofan: `f.ok === true` með raunverulega
//   mældri núll-tölu (t.d. enginn borgandi viðskiptavinur) á ÁFRAM að sýna '0'. Þetta er EKKI sama
//   tilvik og "ekkert svar barst" — bæði mega ekki renna saman í eitt, hvorug leiðin má vinna yfir hina.
test('mrrAskell raunverulega núll (mælt, ok:true) sýnir 0 — núllið ER mælingin, ekki fjarvera hennar', () => {
  const g = elinGogn(svar(heilt({ mrrAskell: 0, mrrD1: 0 })), [], NU);
  assert.equal(g.tolur[0].n, '0');
});

// ⚠ `fjarmalVantar` gátar bæði FJARVERU og RANGT SNIÐ (`typeof !== 'object'`) — sami varnagli og
//   upprunalega hreiðrunar-athugunin (`s.fjarmal && typeof s.fjarmal === 'object'`) bar áður en hún
//   var dregin út í eigið nafn. Handahófskenndur strengur í stað hlutar er ólíklegt en EKKI ómögulegt
//   (t.d. skemmd JSON-tenging) og á að meðhöndlast nákvæmlega eins og fjarveru, ekki kastað.
test('fjarmal er til staðar en EKKI hlutur (t.d. strengur) → meðhöndlað eins og fjarmal vanti', () => {
  const g = elinGogn({ ok: false, fjarmal: 'eitthvad-undarlegt' }, [], NU);
  assert.equal(g.tolur[0].n, 'óvíst');
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
