import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elinGogn } from './elin.mjs';
import { bidurThin } from './bidur_thin.mjs';

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
// ── Heildaryfirferð, atriði 3: verðrekið flutti úr eigin flís yfir í `stada` ─────────────────────
// ⚠⚠ Samþykkta hönnunin á fjórum flísum: MRR · misræmi · í fríprófun · ENDURNÝJAST. Áætlunin setti
//    „verðrek" í fjórða sætið og endurnýjunar-flísin hvarf — áskrift sem rennur út eftir 20 daga sást
//    þá HVERGI (forstofan þrengir í sjö daga). Verðrekið lifir áfram, en í `stada`-línunni.
//    ⚠ `verdrekMaelt`-vörnin VERÐUR að lifa flutninginn af: hún er SJÁLFSTÆÐUR reitur frá worker-num
//      og má ALDREI giskast af `villa` (endapunkturinn skilar aðeins EINUM kóða og `d1_hluti` þaggar
//      `verdskra_hluti` þegar bæði brotna). Prófin hér mæla þann reit, ekki villukóðann.
test('verðrek er EKKI lengur eigin flís — fjórða sætið tilheyrir endurnýjunum', () => {
  const g = elinGogn(svar(heilt()), [], NU);
  assert.deepEqual(g.tolur.map((t) => t.l), ['kr/mán rukkað', 'misræmi', 'í fríprófun', 'endurnýjast']);
});

test('verdrekMaelt: false → staðan segir að verðrek sé ómælt, ÓHÁÐ villukóðanum — d1_hluti getur falið bilaða verðskrá', () => {
  // ⚠ Þetta er nákvæmlega atriðið sem gamla ágiskunin missti af: villa er 'd1_hluti' (EKKI
  //   'verdskra_hluti'), svo skilyrði á villukóðanum hefði sagt „0 verðrek" hér þótt verðskráin hafi
  //   líka brugðist samtímis D1. Textinn fyrir `d1_hluti` nefnir verðskrána HVERGI, svo hefði vörnin
  //   fallið í flutningnum hyrfi upplýsingin alveg.
  const g = elinGogn(svar(heilt({ villa: 'd1_hluti', verdrekMaelt: false, verdrek: [] })), [], NU);
  assert.match(g.stada, /verðrek ómælt/i);
});

test('verdrekMaelt: true → staðan telur verðrekið, LÍKA þegar d1_hluti er til staðar', () => {
  // ⚠ Hin hliðin: d1_hluti þýðir ekki alltaf að verðskráin hafi brugðist — stundum brotnar AÐEINS D1
  //   og verðskráin náðist fullkomlega. Talan á að sjást þá, ekki fela sig á bak við villukóða sem
  //   tilheyrir allt öðru gati.
  const g = elinGogn(svar(heilt({ villa: 'd1_hluti', verdrekMaelt: true, verdrek: [{ vara: 'kvoti', askell: 1000, fast: 9900 }] })), [], NU);
  assert.match(g.stada, /1 verðrek/);
  assert.doesNotMatch(g.stada, /ómælt/i);
});

test('verdrekMaelt vantar (t.d. eldra svarsnið) → staðan segir ómælt, ekki „ekkert verðrek" — sjálfgefið er varkárt', () => {
  const g = elinGogn(svar(heilt({ verdrekMaelt: undefined, verdrek: [] })), [], NU);
  assert.match(g.stada, /verðrek ómælt/i);
});

test('verðrek sést í stöðunni þegar verðskráin náðist og engin villa er til staðar', () => {
  const g = elinGogn(svar(heilt({ verdrek: [{ vara: 'kvoti', askell: 1000, fast: 9900 }] })), [], NU);
  assert.match(g.stada, /1 verðrek/);
});

test('mælt verðrek sem er ENGIN — staðan þegir um það, hún fyllist ekki af núllum', () => {
  // ⚠ Hin áttin: útfærsla sem hnýtti alltaf „0 verðrek" aftan við væri græn fyrir prófin hér að ofan.
  const g = elinGogn(svar(heilt({ verdrekMaelt: true, verdrek: [] })), [], NU);
  assert.doesNotMatch(g.stada, /verðrek/i);
});

test('óstilltur Áskell nefnir ekki verðrek — ekkert kall var gert, staðan segir það í heilu lagi', () => {
  // ⚠ `unconfigured` og „`fjarmal` vantar alveg" eru sami flokkur: ENGIN mæling fór fram og staðan
  //   segir það berum orðum. Að hnýta „verðrek ómælt" þar aftan við er hávaði, ekki upplýsing —
  //   ólíkt `d1_hluti`, þar sem köll VORU gerð og verðskráin ein kann að hafa brugðist.
  const g = elinGogn(svar({ ok: false, error: 'unconfigured' }), [], NU);
  assert.doesNotMatch(g.stada, /verðrek/i);
  assert.doesNotMatch(elinGogn({ ok: false, error: 'admin' }, [], NU).stada, /verðrek/i);
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
  // ⚠⚠ ENDURSKOÐAÐ AFTUR (yfirferð samþykkti kröfurnar en felldi gæðin): `typeof g.stada === 'string'`
  //   er tómleg fullyrðing — hún er græn fyrir SÉRHVERJA mögulega útfærslu, líka ranga, því hún mælir
  //   tegundina en aldrei innihaldið. Hún sat nákvæmlega við hliðina á gallanum: án greinar fyrir
  //   „ekkert svar" segir `stada` hér „Áskell og réttindin stemma" — ekkert barst, en fyrirsögnin segir
  //   allt í lagi. Sami lærdómur og `svarOgilt` í hrafn.mjs og `ekkertSvar` í bjarki.mjs; `elin.mjs` var
  //   eina spjaldið án greinarinnar. Mælir nú STRENGINN SJÁLFAN, ekki tegund hans.
  assert.doesNotMatch(g.stada, /stemma/i, '"stemma" segir að allt sé í lagi — ekkert svar barst, svo þetta má ALDREI birtast');
  assert.match(g.stada, /náðust ekki/i, 'stada verður að segja berum orðum að ekkert svar barst');
  assert.equal(g.tolur[0].n, 'óvíst', 'ekkert svar barst yfirhöfuð — talan má ekki líta út eins og mæld núll');
  // ⚠ Sama gildra endurtekin á tveimur flísum til viðbótar: `misraemi.length` og `frip.length` eru `0`
  //   af því `f` er tómur hlutur (sjálfgefið hér að ofan), EKKI af því neitt var í raun talið. Núll-af-
  //   því-ekkert-var-mælt lítur nákvæmlega eins út og núll-af-því-ekkert-fannst án þessarar greinar.
  const misraemiFlis = g.tolur.find((t) => t.l === 'misræmi');
  const fripFlis = g.tolur.find((t) => t.l === 'í fríprófun');
  assert.equal(misraemiFlis.n, 'óvíst', 'ekkert var í raun talið — 0 væri mæld tala sem aldrei var mæld');
  assert.equal(fripFlis.n, 'óvíst', 'sama gildra og misræmis-flísin hér að ofan');
});

// ⚠ Hin áttin, sem verður að standast SAMHLIÐA prófinu að ofan: `fjarmal` til staðar og MÆLT (`ok:true`,
//   tóm fylki) á ÁFRAM að sýna '0' á báðum flísum — núllið ER mælingin þar, ekki fjarvera hennar. Hvorug
//   leiðin má vinna yfir hina — sama krafa og er þegar gerð til MRR-flísarinnar annars staðar í þessari
//   skrá (prófið um `mrrAskell raunverulega núll`), endurtekin hér fyrir misræmi og fríprófun.
test('engin misræmi og engin í fríprófun ÞEGAR MÆLT (fjarmal til staðar, ok:true) sýnir 0, ekki óvíst', () => {
  const g = elinGogn(svar(heilt()), [], NU);
  const misraemiFlis = g.tolur.find((t) => t.l === 'misræmi');
  const fripFlis = g.tolur.find((t) => t.l === 'í fríprófun');
  assert.equal(misraemiFlis.n, '0');
  assert.equal(fripFlis.n, '0');
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
// ── Heildaryfirferð, atriði 3: flísar 2 og 3 sögðu ÖRUGGA `0` á ÖLLUM villuleiðum ───────────────
// ⚠⚠ `fjarmalVantar` náði AÐEINS yfir það þegar `fjarmal`-reiturinn vantaði alveg. Óstillt Áskell,
//    `villa:'askell'`, `villa:'rofi'`, `villa:'d1_hluti'`, `villa:'verdskra_hluti'` og óauðkennd
//    virk stök (`mrrAskellOvisst`) sluppu allar í gegn: mælt gaf óstilltur Áskell
//    `óvíst kr/mán | 0 misræmi | 0 í fríprófun | óvíst verðrek`. Flísar 1 og 4 gerðu þetta rétt,
//    2 og 3 ekki — nú hlíta þær sömu reglu og flís 1 (`naest`).
//
// ⚠ Fixtures BERA gögn (tvö misræmi, ein fríprófun) svo prófin geti fallið: væru fylkin tóm sýndi
//   biluð útfærsla „0" og rétt útfærsla „óvíst", en með gögnum sýnir hún „2"/"1" — munur sem sést.
const medGognum = (yfir = {}) => heilt(Object.assign({
  misraemi: [
    { tegund: 'borgar_fyrir_ekkert', kt: '1111111111', vara: 'fyrirtaeki', verd: 6900, sidan: NU },
    { tegund: 'gefins', kt: '2222222222', vara: 'kvoti', verd: 9900, sidan: NU },
  ],
  fripofanir: [{ kt: '3333333333', vara: 'fyrirtaeki', verd: 6900 }],
  // ⚠ TVÖ stök og annað INNAN VIKU: undirlínan („z innan viku") er sjálfstæð fullyrðing frá tölunni
  //   á flísinni og gæti annars haldið áfram að telja á villuleiðum meðan talan sjálf segir óvíst.
  rennurUt: [{ kt: '4444444444', vara: 'fyrirtaeki', until: NU + 20 * 86400 }, { kt: '6666666666', vara: 'kvoti', until: NU + 3 * 86400 }],
  // ⚠ Tvírukkun BER líka gögn: hún ratar í vinnslulistann eins og misræmin, svo „listinn er tómur"-
  //   prófin hér að neðan yrðu tómleg fullyrðing um hana ef fylkið væri autt.
  tvirukkun: [{ kt: '5555555555', vara: 'fyrirtaeki', fjoldi: 2, verd: 13800 }],
}, yfir));

const VILLULEIDIR = [
  ['óstillt Áskell', { ok: false, error: 'unconfigured', misraemi: medGognum().misraemi, fripofanir: medGognum().fripofanir, rennurUt: medGognum().rennurUt, tvirukkun: medGognum().tvirukkun }],
  ['villa: askell', medGognum({ villa: 'askell' })],
  ['villa: rofi', medGognum({ villa: 'rofi' })],
  ['villa: d1_hluti', medGognum({ villa: 'd1_hluti' })],
  ['villa: verdskra_hluti', medGognum({ villa: 'verdskra_hluti' })],
  ['óauðkennd virk stök', medGognum({ mrrAskellOvisst: true })],
  ['óþekktur villukóði', medGognum({ villa: 'eitthvad-alveg-nytt' })],
];

for (const [nafn, f] of VILLULEIDIR) {
  test('villuleið „' + nafn + '": ALLAR FJÓRAR talna-flísarnar segja óvíst, engin þeirra mælda tölu', () => {
    const g = elinGogn(svar(f), [], NU);
    // ⚠ „endurnýjast" gengur í hópinn: hún hlítir sömu einu reglunni (`naest`) og hinar þrjár. Eina
    //   undantekningin í spjaldinu er verðrekið, og hún á sér stoð í sjálfstæðum reit frá worker-num
    //   (`verdrekMaelt`) — flís sem giskar á eigin áreiðanleika væri önnur gerð af sömu gildru.
    for (const merki of ['kr/mán rukkað', 'misræmi', 'í fríprófun', 'endurnýjast']) {
      const flis = g.tolur.find((t) => t.l === merki);
      assert.equal(flis.n, 'óvíst', merki + ': tala sem var aldrei mæld má aldrei líta út eins og mæld tala');
    }
    // ⚠ Undirlínurnar eru SJÁLFSTÆÐAR fullyrðingar frá tölunni fyrir ofan þær — flís sem segir „óvíst"
    //   með „1 innan viku" undir sér er enn að fullyrða um mælingu sem fór aldrei fram.
    for (const merki of ['misræmi', 'í fríprófun', 'endurnýjast']) {
      assert.equal(g.tolur.find((t) => t.l === merki).s, '', merki + ': undirlínan má ekki telja það sem talan segir óvíst um');
    }
  });

  test('villuleið „' + nafn + '": vinnslulistinn er tómur — nafngreind misræmi OG tvírukkanir eru fullyrðing', () => {
    // ⚠ Flísin segir „óvíst" en vinnslulistinn nefndi samt fólk með upphæð. Það er verri fullyrðing
    //   en talan: hún bendir á tiltekna manneskju og segir hvað hún skuldi — eða hvað VIÐ skuldum henni.
    const g = elinGogn(svar(f), [], NU);
    assert.deepEqual(g.vinnsla, []);
  });

  test('villuleið „' + nafn + '": staðan fullyrðir hvorki um misræmi né tvírukkun', () => {
    const g = elinGogn(svar(f), [], NU);
    assert.doesNotMatch(g.stada, /tvírukk/i, 'talning úr mynd sem mældist ekki er ekki mæling');
    assert.doesNotMatch(g.stada, /stemma/i);
  });
}

test('mælt svar heldur ÁFRAM að sýna tölur og vinnslulista — óvissan má ekki éta mælinguna', () => {
  // ⚠ Hin áttin. Öll prófin hér að ofan yrðu græn fyrir útfærslu sem segði alltaf „óvíst".
  const g = elinGogn(svar(medGognum()), [], NU);
  assert.equal(g.tolur.find((t) => t.l === 'misræmi').n, '2');
  assert.equal(g.tolur.find((t) => t.l === 'í fríprófun').n, '1');
  assert.equal(g.tolur.find((t) => t.l === 'endurnýjast').n, '2');
  assert.equal(g.tolur.find((t) => t.l === 'endurnýjast').s, '1 innan viku');
  assert.equal(g.vinnsla.length, 3, 'tvö misræmi + ein tvírukkun');
  assert.match(g.stada, /1 tvírukkun/);
});

test('staðan segir ALDREI „stemma" þegar virkt stak mældist ekki', () => {
  // ⚠ Sama gildra og `fjarmalVantar` lokaði einu lagi ofar, nú fyrir óauðkennd stök: engin misræmi
  //   fundust AF ÞVÍ að samningurinn var aldrei borinn saman. „Áskell og réttindin stemma" er þá
  //   grænt ljós á mælingu sem fór aldrei fram.
  const g = elinGogn(svar(heilt({ mrrAskellOvisst: true })), [], NU);
  assert.doesNotMatch(g.stada, /stemma/i);
});

// ── Heildaryfirferð, atriði 1: tvírukkun sást hvergi á spjaldinu ────────────────────────────────
// ⚠⚠ Mælt: viðskiptavinur sem er rukkaður TVISVAR fyrir sömu vöru gaf `stada` „Áskell og réttindin
//    stemma" og núll misræmi. Tvírukkun er ekki „við og Áskell erum ósammála" heldur „VIÐ ERUM AÐ
//    RUKKA OF MIKIГ — peningar sem viðskiptavinurinn á inni hjá okkur. Grænt ljós yfir því er verra
//    en engin fyrirsögn.
const tvirStak = (kt, fjoldi = 2, verd = 13800) => ({ kt, vara: 'fyrirtaeki', fjoldi, verd });

test('staðan segir ALDREI „stemma" þegar við erum að tvírukka', () => {
  const g = elinGogn(svar(heilt({ tvirukkun: [tvirStak('1111111111')] })), [], NU);
  assert.doesNotMatch(g.stada, /stemma/i, '„stemma" yfir tvírukkun er grænt ljós á peningum sem við skuldum');
});

test('staðan telur tvírukkanirnar og segir hver rukkar of mikið', () => {
  const g = elinGogn(svar(heilt({ tvirukkun: [tvirStak('1111111111'), tvirStak('2222222222')] })), [], NU);
  assert.match(g.stada, /2 tvírukkanir/);
  assert.match(g.stada, /of mikið/i, 'orðalagið verður að segja að VIÐ rukkum of mikið, ekki að listarnir séu ósammála');
});

test('ein tvírukkun beygist rétt — „1 tvírukkun", ekki „1 tvírukkanir"', () => {
  const g = elinGogn(svar(heilt({ tvirukkun: [tvirStak('1111111111')] })), [], NU);
  assert.match(g.stada, /1 tvírukkun(?!ir)/);
});

test('misræmi OG tvírukkun sjást bæði í stöðunni — hvorugt étur hitt', () => {
  const g = elinGogn(svar(heilt({
    misraemi: [{ tegund: 'gefins', kt: '1111111111', vara: 'kvoti', verd: 9900, sidan: NU }],
    tvirukkun: [tvirStak('2222222222')],
  })), [], NU);
  assert.match(g.stada, /1 misræmi/);
  assert.match(g.stada, /1 tvírukkun/);
});

test('engin tvírukkun → staðan nefnir hana ekki (hin áttin)', () => {
  const g = elinGogn(svar(heilt({ tvirukkun: [] })), [], NU);
  assert.doesNotMatch(g.stada, /tvírukk/i);
  assert.match(g.stada, /stemma/i);
  // ⚠ Stökkbreytingapróf: „stemma"-leggurinn EINN dugar ekki. Sé tvírukkunartextinn smíðaður líka
  //   þegar fjöldinn er núll („0 tvírukkanir") er hann ósýnilegur á þeim legg — en hnýtist beint inn
  //   um leið og eitt einasta misræmi finnst. Leggurinn MEÐ misræmi verður því að mælast líka.
  const medMisraemi = elinGogn(svar(heilt({ misraemi: [{ tegund: 'gefins', kt: '1111111111', vara: 'kvoti', verd: 100, sidan: NU }], tvirukkun: [] })), [], NU);
  assert.match(medMisraemi.stada, /1 misræmi/);
  assert.doesNotMatch(medMisraemi.stada, /tvírukk/i, '„0 tvírukkanir" er ekki upplýsing — staðan fyllist ekki af núllum');
});

test('tvírukkunin fær nafngreinda línu í vinnslulistanum, ekki bara tölu í stöðunni', () => {
  // ⚠ Talan segir hve margar; línan segir HVER og HVE MIKIÐ — það er munurinn á mælingu og
  //   einhverju sem hægt er að vinna með.
  const g = elinGogn(svar(heilt({ tvirukkun: [tvirStak('1234567890', 2, 13800)] })), [], NU);
  assert.equal(g.vinnsla.length, 1);
  assert.match(g.vinnsla[0].texti, /123456-••••/);
  assert.match(g.vinnsla[0].texti, /rukkað 2 sinnum/);
  assert.match(g.vinnsla[0].texti, /13\.800/);
  assert.ok(!g.vinnsla[0].texti.includes('1234567890'), 'full kennitala fer ALDREI í viðmótið');
});

test('tvírukkun og misræmi raðast saman eftir PENINGUM í vinnslulistanum', () => {
  const g = elinGogn(svar(heilt({
    misraemi: [{ tegund: 'gefins', kt: '1111111111', vara: 'kvoti', verd: 1000, sidan: NU }],
    tvirukkun: [tvirStak('2222222222', 2, 99000)],
  })), [], NU);
  assert.equal(g.vinnsla.length, 2);
  assert.match(g.vinnsla[0].texti, /99\.000/, 'dýrasta stakið er efst, hvorrar tegundar sem það er');
});

test('tvírukkun er ALDREI talin þegar ekkert var mælt — óvissan gildir hana eins og hinar tölurnar', () => {
  const g = elinGogn(svar(heilt({ villa: 'askell', tvirukkun: [tvirStak('1111111111')] })), [], NU);
  assert.doesNotMatch(g.stada, /tvírukk/i, 'stöðnuð mynd má ekki fullyrða um tvírukkun sem enginn mældi núna');
});

// ── Heildaryfirferð, atriði 3: „endurnýjast"-flísin úr samþykktu hönnuninni ──────────────────────
// ⚠⚠ Mælt gat: áskrift sem rennur út eftir 20 daga sást HVERGI — hvorki á spjaldi né forstofu, því
//    `bidur_thin` þrengir vísvitandi í sjö daga. Spjaldið svaraði aldrei spurningunni „hvað
//    endurnýjast í þessum mánuði", sem var ein af fjórum ástæðum þess að það var byggt.
const rUt = (kt, dagar) => ({ kt, vara: 'fyrirtaeki', until: NU + dagar * 86400 });

test('áskrift sem rennur út eftir 20 daga SÉST á spjaldinu — hún sést hvergi annars staðar', () => {
  const g = elinGogn(svar(heilt({ rennurUt: [rUt('1111111111', 20)] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'endurnýjast');
  assert.equal(flis.n, '1');
});

test('endurnýjast-flísin telur allt innan 30 daga, undirlínan aðeins vikuna', () => {
  const g = elinGogn(svar(heilt({ rennurUt: [rUt('1111111111', 2), rUt('2222222222', 5), rUt('3333333333', 20)] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'endurnýjast');
  assert.equal(flis.n, '3');
  assert.match(flis.s, /2 innan viku/);
});

test('enginn innan viku → undirlínan þegir, hún segir ekki „0 innan viku"', () => {
  const g = elinGogn(svar(heilt({ rennurUt: [rUt('1111111111', 20)] })), [], NU);
  assert.equal(g.tolur.find((t) => t.l === 'endurnýjast').s, '');
});

test('áskrift sem er ÞEGAR útrunnin telst ekki „endurnýjast" — stöðnuð mynd ber gamlar dagsetningar', () => {
  // ⚠ Sama gildra og `bidur_thin` lokaði fyrir vikugluggann: geymda myndin er allt að 15 mín gömul
  //   (_FJ_FYRNING) og getur í stöðnuðu tilviki verið mun eldri, svo `until` úr henni má vera liðið.
  const g = elinGogn(svar(heilt({ rennurUt: [rUt('1111111111', -3), rUt('2222222222', 10)] })), [], NU);
  assert.equal(g.tolur.find((t) => t.l === 'endurnýjast').n, '1');
});

test('rennurUt-stak án dagsetningar telst hvorki með í flísinni né í vikunni', () => {
  const g = elinGogn(svar(heilt({ rennurUt: [{ kt: '1111111111', vara: 'kvoti', until: undefined }] })), [], NU);
  const flis = g.tolur.find((t) => t.l === 'endurnýjast');
  assert.equal(flis.n, '0');
  assert.equal(flis.s, '');
});

test('endurnýjast-talan og „bíður þín"-raðirnar eru EIN uppspretta — þær reka ekki í sundur', () => {
  // ⚠ Segði flísin „3 innan viku" meðan Bíður-þín-hólfið sýnir tvær raðir væri spjaldið ósamkvæmt
  //   sjálfu sér á sama skjá. Báðar hliðar nota `rennurUtInnan` úr bidur_thin.mjs.
  const rad = [rUt('1111111111', 2), rUt('2222222222', 5), rUt('3333333333', 20), rUt('4444444444', -1)];
  const fj = { fjarmal: heilt({ rennurUt: rad }) };
  const bidur = bidurThin({ now: NU, fjarmal: fj });
  const g = elinGogn(svar(heilt({ rennurUt: rad })), bidur, NU);
  const flis = g.tolur.find((t) => t.l === 'endurnýjast');
  assert.match(flis.s, new RegExp(bidur.filter((x) => x.tegund === 'rennur_ut').length + ' innan viku'));
});

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
