import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADKALLANDI_SEK, MANUDUR_SEK, VIKA_SEK, bidurFyrir, bidurThin, rennurUtInnan } from './bidur_thin.mjs';
import { TICKET_STODUR } from '../hjalp_agent.mjs';

const NU = 1_800_000_000;
const t = (id, stada, updated, auka = {}) => Object.assign({ id, stada, updated, created: updated - 60, efni: 'Efni ' + id }, auka);

test('ein lína á hverja beiðni — sértækasta ástandið ræður', () => {
  const r = bidurThin({ now: NU, tickets: {
    list: [t(1, 'stadfest', NU - 100), t(2, 'stadfest', NU - 200), t(3, 'stadfest', NU - 300)],
    moot_osent: [2], moot_bida: [3],
  } });
  assert.deepEqual(r.map((x) => [x.tegund, x.titill]), [
    ['moot', '#3 — Moot bíður atkvæðis'],
    ['moot_osent', '#2 — samþykkt svar ósent'],
    ['svar', '#1 — bíður svars'],
  ], 'elst fyrst, og hver beiðni birtist aðeins einu sinni');
  assert.equal(r.length, 3);
});

test('beiðnir Sigrúnar og verk Hrafns lenda á réttum starfsmanni', () => {
  const r = bidurThin({ now: NU, tickets: { list: [
    t(1, 'stadfest', NU - 10),
    t(2, 'tillaga', NU - 20, { cto_pr: 'https://github.com/aronheidar/KARP-2.0/pull/10' }),
    t(3, 'cto', NU - 7200),
    t(4, 'svarad', NU - 30),
    t(5, 'lokad', NU - 40),
  ] } });
  assert.deepEqual(r.map((x) => x.starfsmadur + ':' + x.tegund), ['hrafn:cto_fast', 'hrafn:tillaga', 'sigrun:svar']);
  assert.equal(bidurFyrir(r, 'sigrun').length, 1);
  assert.equal(bidurFyrir(r, 'hrafn').length, 2);
});

test('beiðni í stöðu cto telst föst fyrst eftir klukkustund', () => {
  const nyleg = bidurThin({ now: NU, tickets: { list: [t(3, 'cto', NU - 600)] } });
  assert.deepEqual(nyleg, []);
  const fost = bidurThin({ now: NU, tickets: { list: [t(3, 'cto', NU - 3601)] } });
  assert.equal(fost[0].tegund, 'cto_fast');
});

test('„ég þarf þig á þessari": sama röð og bíður svars, aðeins ástæðan í titlinum', () => {
  const r = bidurThin({ now: NU, tickets: { list: [
    t(1, 'stadfest', NU - 10, { hjalp: { astaeda: 'peningar', texti: 'nefnir endurgreiðslu' } }),
    t(2, 'nytt', NU - 20),
    t(3, 'svarad', NU - 30, { hjalp: { astaeda: 'peningar', texti: 'nefnir endurgreiðslu' } }),   // svarað: ekki hennar að biðja um
  ], moot_osent: [] } });
  assert.deepEqual(r.map((x) => [x.tegund, x.titill]), [['svar', '#2 — bíður svars'], ['hjalp', '#1 — nefnir endurgreiðslu']]);
  // Moot-ástand er sértækara og gengur fyrir
  const m = bidurThin({ now: NU, tickets: { list: [t(1, 'stadfest', NU - 10, { hjalp: { texti: 'nefnir endurgreiðslu' } })], moot_osent: [1] } });
  assert.equal(m[0].tegund, 'moot_osent');
});

test('aðkallandi eftir 48 klst; bid er reiknað í sekúndum', () => {
  const r = bidurThin({ now: NU, tickets: { list: [t(1, 'stadfest', NU - ADKALLANDI_SEK - 1), t(2, 'stadfest', NU - 60)] } });
  assert.equal(r[0].adkallandi, true);
  assert.equal(r[0].bid, ADKALLANDI_SEK + 1);
  assert.equal(r[1].adkallandi, false);
});

test('aðeins HÁ bilun bíður þín — miðlungs og lág fara ekki á listann', () => {
  const bilanir = [
    { uppspretta: 'CI', lysing: 'main er rautt', sidan: NU - 500, alvarleiki: 'hatt', slod: '#hrafn' },
    { uppspretta: 'PR', lysing: 'PR #3 opinn í 60 daga', sidan: NU - 900, alvarleiki: 'midlungs', slod: '#hrafn' },
  ];
  const r = bidurThin({ now: NU, tickets: {}, bilanir });
  assert.equal(r.length, 1);
  assert.equal(r[0].starfsmadur, 'hrafn');
  assert.equal(r[0].titill, 'main er rautt');
  assert.equal(r[0].vidbot, 'CI');
});

test('tóm eða gölluð gögn skila tómum lista í stað þess að kasta', () => {
  assert.deepEqual(bidurThin({}), []);
  assert.deepEqual(bidurThin({ tickets: { list: null }, bilanir: null, now: NU }), []);
  assert.deepEqual(bidurThin(), []);
});

test('samþykkt beiðni sem situr föst: merge skilaði sér ekki → bíður Arons eftir klukkustund', () => {
  const nyleg = bidurThin({ now: NU, tickets: { list: [t(4, 'samthykkt', NU - 600)] } });
  assert.deepEqual(nyleg, [], 'merge er nýræst — ekkert að gera');
  const fost = bidurThin({ now: NU, tickets: { list: [t(4, 'samthykkt', NU - 3601)] } });
  assert.equal(fost.length, 1);
  assert.equal(fost[0].starfsmadur, 'hrafn');
  assert.equal(fost[0].tegund, 'merge_fast');
  assert.match(fost[0].titill, /samþykkt en merge/);
});

test('skörun moot_osent og moot_bida: samþykkt-en-ósent vinnur og beiðnin birtist einu sinni', () => {
  const r = bidurThin({ now: NU, tickets: { list: [t(5, 'stadfest', NU - 100)], moot_osent: [5], moot_bida: [5] } });
  assert.equal(r.length, 1);
  assert.equal(r[0].tegund, 'moot_osent');
});

test('ástandsheitin sem listinn byggir á eru raunveruleg — samstillist ástandsvélinni', () => {
  for (const stada of ['nytt', 'stadfest', 'tillaga', 'cto', 'samthykkt']) {
    assert.ok(TICKET_STODUR.includes(stada), stada + ' er ekki lengur til í TICKET_STODUR — bidurThin þagnar þegjandi');
  }
});

test('markaðsefni skilar sér í sameiginlega listann — annars sæi forstofan hvorki tæmt dagatal né tillögur', () => {
  const r = bidurThin({ now: NU, markads: {
    dagatal: { dagarFram: 5 },
    safn: [{ efnistok: null }, { efnistok: 'Sjávarútvegur' }],
    tillogur: [{ malefni: 'Verðbólga', rok: 'þrefalt venjulegt' }],
  } });
  assert.deepEqual(r.map((x) => x.tegund).sort(), ['dagatal', 'oflokkad', 'tillaga']);
  assert.ok(r.every((x) => x.starfsmadur === 'bjarki'));
  assert.deepEqual(bidurThin({ now: NU, markads: { dagatal: { dagarFram: 20 }, safn: [], tillogur: [] } }), [], 'rúmt dagatal og ekkert óflokkað = ekkert bíður');
});

// ── Elín: fjórða uppsprettan ────────────────────────────────────────────────────────────────────
// ⚠ Raðirnar VERÐA að smíðast HÉR en ekki í elin.mjs — annars sér forstofan þær ekki og talan á
//   andlitinu verður núll þótt eitthvað bíði. Bjarki féll nákvæmlega á þessu.
const NU_E = Date.UTC(2026, 8, 16) / 1000;

test('misræmi Elínar rata á forstofuna', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, misraemi: [
    { tegund: 'borgar_fyrir_ekkert', kt: '1234567890', vara: 'fyrirtaeki', verd: 6900, sidan: NU_E - 100 },
    { tegund: 'gefins', kt: '9876543210', vara: 'kvoti', verd: 9900, sidan: NU_E - 200 },
  ] } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 2);
  assert.ok(elin.every((x) => x.slod === '#elin'));
  assert.ok(elin.some((x) => x.tegund === 'borgar_fyrir_ekkert'));
  assert.ok(elin.some((x) => x.tegund === 'gefins'));
});

test('full kennitala fer ALDREI í rað-titilinn — hvorki á misræmi né á rennur_ut', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true,
    misraemi: [{ tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 9900, sidan: NU_E }],
    rennurUt: [{ kt: '5556667770', vara: 'fyrirtaeki', until: NU_E + 3 * 86400 }],
  } } });
  assert.equal(r.length, 2, 'báðar raðtegundir Elínar skiluðu sér — annars sannar prófið ekkert');
  assert.ok(!r.some((x) => String(x.titill + x.vidbot).includes('1234567890')), 'misræmi: full kt fer ekki í titil/vidbot');
  assert.ok(!r.some((x) => String(x.titill + x.vidbot).includes('5556667770')), 'rennur_ut: full kt fer ekki í titil/vidbot heldur — ein raðtegund ein og sér nægir ekki');
});

test('áskrift sem rennur út innan viku bíður þín, sú sem rennur út eftir mánuð ekki', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, rennurUt: [
    { kt: '1234567890', vara: 'fyrirtaeki', until: NU_E + 3 * 86400 },
    { kt: '9876543210', vara: 'kvoti', until: NU_E + 25 * 86400 },
  ] } } });
  const ut = r.filter((x) => x.tegund === 'rennur_ut');
  assert.equal(ut.length, 1);
});

// ── Yfirferð Verks 4: fjögur atriði sem yrðu sýnileg um leið og Verk 5 tengir þetta við forstofuna ──
// Öll fjögur snúast um STÖÐNAÐA mynd: það sem `bidurThin` fær frá /api/admin/fjarmal er ekki alltaf
// ferskt (varabraut, rofi_elin=1, eða einfaldlega innan _FJ_FYRNING). Misræmi og rennur_ut verða að
// haga sér rétt líka þá — sjá viðbótina í .superpowers/sdd/elin/verk-4-report.md.

test('misræmi Elínar er ALDREI aðkallandi — sidan er alltaf NÚNA, ekki sóknartími workersins', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, misraemi: [
    { tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 9900, sidan: NU_E - 3 * 86400 },
  ] } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 1);
  assert.equal(elin[0].sidan, NU_E, 'sidan er núið sem bidurThin fékk, ekki gamla m.sidan úr geymdu myndinni');
  assert.equal(elin[0].bid, 0);
  assert.equal(elin[0].adkallandi, false, 'misræmi er ekki "beðið lengi" — það er "kostar peninga", og verður aldrei aðkallandi af aldri einum saman');
});

test('misræmi og rennur_ut Elínar bera sömu sidan innan sama svars — raðtegundirnar reka ekki í sundur', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true,
    misraemi: [{ tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 9900, sidan: NU_E - 5 * 86400 }],
    rennurUt: [{ kt: '9876543210', vara: 'fyrirtaeki', until: NU_E + 3 * 86400 }],
  } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 2);
  assert.ok(elin.every((x) => x.sidan === NU_E), 'báðar raðtegundir eiga að nota sama núið — tvær ólíkar klukkur í sama svari er sjálft gallinn');
});

test('áskrift sem er ÞEGAR útrunnin sleppur ekki inn sem „innan viku" úr stöðnaðri mynd', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, rennurUt: [
    { kt: '1234567890', vara: 'fyrirtaeki', until: NU_E - 10 * 86400 },
  ] } } });
  assert.equal(r.filter((x) => x.tegund === 'rennur_ut').length, 0, 'útrunnið fyrir tíu dögum er farið, ekki „innan viku"');
});

test('rennurUt-stak án dagsetningar (until: undefined) sleppur ekki inn sem „innan viku"', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, rennurUt: [
    { kt: '1234567890', vara: 'fyrirtaeki', until: undefined },
  ] } } });
  assert.equal(r.filter((x) => x.tegund === 'rennur_ut').length, 0, '`NaN > x` er ósatt — stak án dagsetningar má ekki lauma sér framhjá efra markinu');
});

test('starfsmadur og slod eru "elin"/"#elin" fyrir BÁÐAR raðtegundir Elínar, ekki bara misræmi', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true,
    misraemi: [{ tegund: 'gefins', kt: '1234567890', vara: 'kvoti', verd: 9900, sidan: NU_E }],
    rennurUt: [{ kt: '9876543210', vara: 'fyrirtaeki', until: NU_E + 3 * 86400 }],
  } } });
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.starfsmadur === 'elin'), 'annars hverfur röðin af spjaldi Elínar og úr andlitstölunni hennar þótt forstofan sýni hana');
  assert.ok(r.every((x) => x.slod === '#elin'));
});

test('ekkert fjarmal-svar fellir ekki listann', () => {
  assert.doesNotThrow(() => bidurThin({ now: NU_E }));
  assert.doesNotThrow(() => bidurThin({ now: NU_E, fjarmal: null }));
  assert.doesNotThrow(() => bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: false, error: 'unconfigured' } } }));
});

// ── Heildaryfirferð, atriði 2: hálfur samanburður smíðar EKKI misræmis-raðir ─────────────────────
// ⚠⚠ Bregðist D1-lesturinn meðan Áskell svarar verður `heimildir` tómt og HVER EINASTI virki
//    samningur að `borgar_fyrir_ekkert`. `elin.mjs` fellur rétt og segir „náði í Áskel en ekki alla
//    heimildalista" — en `bidurThin` las `fj.villa` HVERGI og ýtti einni röð á hvern borgandi
//    viðskiptavin inn á forstofuna. D1-lestrarbilanir eru þekkt, endurtekið ástand í þessu kerfi
//    (free-tier lestrarþak), svo þetta er ekki jaðartilvik heldur venjuleg þriðjudagsstaða.

const misr = (kt, tegund = 'borgar_fyrir_ekkert') => ({ tegund, kt, vara: 'fyrirtaeki', verd: 6900, sidan: NU_E });

test('villa d1_hluti: ENGIN misræmis-röð smíðuð — hálfur samanburður er enginn samanburður', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: {
    ok: true, villa: 'd1_hluti', misraemi: [misr('1111111111'), misr('2222222222'), misr('3333333333')],
  } } });
  assert.equal(r.filter((x) => x.starfsmadur === 'elin').length, 0,
    'þrír borgandi viðskiptavinir hefðu ratað á forstofuna sem „borgar fyrir ekkert" — þeir gera það ekki');
});

test('óauðkennd virk stök fella líka misræmis-raðirnar — draugurinn „fær gefins" fer ekki á forstofuna', () => {
  // Hin hliðin á sama peningi: þegar Áskels-megin var ekki hægt að auðkenna stak stendur D1-heimildin
  // ein eftir og verður að `gefins`. Samanburðurinn var jafn ófullkominn og í d1_hluti, bara á hinum
  // endanum, og röðin jafn tilhæfulaus.
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: {
    ok: true, misraemi: [misr('1111111111', 'gefins')],
    verdUppsprettur: { lidur: 0, verdskra: 0, ekkert: 0, oaudkennt: 1 }, mrrAskellOvisst: true,
  } } });
  assert.equal(r.filter((x) => x.starfsmadur === 'elin').length, 0);
});

test('heill samanburður smíðar raðirnar ÁFRAM — sían má ekki éta réttmæt misræmi', () => {
  // ⚠ Hin áttin, sem verður að standast samhliða: þögn er ekki markmiðið, RÉTTMÆTI er það.
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: {
    ok: true, misraemi: [misr('1111111111'), misr('2222222222', 'gefins')],
    verdUppsprettur: { lidur: 2, verdskra: 0, ekkert: 0, oaudkennt: 0 }, mrrAskellOvisst: false,
  } } });
  assert.equal(r.filter((x) => x.starfsmadur === 'elin').length, 2);
});

test('villa verdskra_hluti fellir EKKI misræmin — verðskráin snertir verdrek, ekki pörunina', () => {
  // ⚠ Nákvæmni skiptir máli: að slökkva á öllum villukóðum í einu væri jafn ómarkviss og að slökkva
  //   á engum. Báðir listarnir náðust hér, svo samanburðurinn sjálfur ER heill.
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: {
    ok: true, villa: 'verdskra_hluti', misraemi: [misr('1111111111')],
  } } });
  assert.equal(r.filter((x) => x.starfsmadur === 'elin').length, 1);
});

test('rennur_ut stendur áfram þótt misræmin falli — ófullkominn listi er ekki UPPLOGINN listi', () => {
  // Hálfur heimildalisti gefur FÆRRI „rennur út"-raðir, ekki raðir sem eiga sér enga stoð. Þær eru
  // því áfram réttar svo langt sem þær ná; misræmin voru það aldrei.
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: {
    ok: true, villa: 'd1_hluti',
    misraemi: [misr('1111111111')],
    rennurUt: [{ kt: '9876543210', vara: 'fyrirtaeki', until: NU_E + 3 * 86400 }],
  } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 1);
  assert.equal(elin[0].tegund, 'rennur_ut');
});

// ── Heildaryfirferð, atriði 1: tvírukkun var reiknuð, geymd, send — og enginn las hana ──────────
// ⚠⚠ `samstemma()` skilar `tvirukkun` (kt+vara sem TVEIR ólíkir samningar borga fyrir) og
//    worker/fjarmal.mjs ber reitinn út alla leið. Hvorki `bidur_thin.mjs` né `elin.mjs` snerti hann:
//    mælt gaf viðskiptavinur sem var rukkaður tvisvar fyrir sömu vöru „Áskell og réttindin stemma",
//    núll misræmi og núll raðir. Tvírukkun er peningar sem viðskiptavinurinn á INNI HJÁ OKKUR.
const tvir = (kt, fjoldi = 2, verd = 13800) => ({ kt, vara: 'fyrirtaeki', fjoldi, verd });

test('tvírukkun Elínar ratar á forstofuna — eigin tegund, ekki falin inni í misræmunum', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, tvirukkun: [tvir('1234567890')] } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 1);
  assert.equal(elin[0].tegund, 'tvirukkun', 'tvírukkun er ekki misræmi — hún þarf eigin tegund svo hægt sé að telja hana sér');
  assert.equal(elin[0].slod, '#elin');
});

test('tvírukkunar-röðin segir að VIÐ rukkum of mikið, ekki að við séum ósammála Áskeli', () => {
  // ⚠ Orðalagið er kjarni atriðisins: misræmi = „við og Áskell erum ósammála"; tvírukkun = „við erum
  //   að rukka of mikið". Röð sem les eins og misræmi sendir lesandann að leita að röngum galla.
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, tvirukkun: [tvir('1234567890', 2, 13800)] } } });
  const rod0 = r.find((x) => x.tegund === 'tvirukkun');
  assert.match(rod0.titill, /tvírukkun/i);
  assert.match(rod0.vidbot, /rukkum/i, 'vidbot verður að segja hver er að rukka — við');
  assert.match(rod0.vidbot, /13\.800/, 'upphæðin sem um ræðir sést');
  assert.match(String(rod0.titill + rod0.vidbot), /2/, 'fjöldi greiðenda sést — tvisvar er annað en þrisvar');
});

test('full kennitala fer ALDREI í tvírukkunar-röðina', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, tvirukkun: [tvir('1234567890')] } } });
  const rod0 = r.find((x) => x.tegund === 'tvirukkun');
  assert.ok(!String(rod0.titill + rod0.vidbot).includes('1234567890'), 'full kennitala fer ALDREI í titil/vidbot');
  assert.match(rod0.titill, /123456-••••/, 'fyrri hlutinn dugar til að þekkja manneskjuna');
});

test('tvírukkunar-röðin notar sama nú og hinar raðir Elínar — verður aldrei aðkallandi af aldri', () => {
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true,
    tvirukkun: [tvir('1234567890')],
    misraemi: [misr('2222222222')],
  } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 2);
  assert.ok(elin.every((x) => x.sidan === NU_E), 'tvær ólíkar klukkur í sama svari er sjálft gallinn');
  assert.ok(elin.every((x) => x.adkallandi === false));
});

test('tvírukkun stendur ÁFRAM þótt misræmin falli — hún er mæld Áskels-megin, ekki í pöruninni', () => {
  // ⚠⚠ `d1_hluti` og `oaudkennt` gera PÖRUNINA hálfa og framleiða misræmi sem eiga sér enga stoð.
  //    Tvírukkun er hins vegar talin innan Áskels-listans EINS (tveir samningar á sama kt+vöru) og
  //    snertir heimildalistann hvergi. Stak sem vantar gefur FÆRRI tvírukkanir, aldrei uppspunnar —
  //    nákvæmlega sama rök og halda `rennur_ut` inni hér að ofan.
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: {
    ok: true, villa: 'd1_hluti',
    misraemi: [misr('1111111111')],
    tvirukkun: [tvir('9876543210')],
    verdUppsprettur: { lidur: 0, verdskra: 0, ekkert: 0, oaudkennt: 3 }, mrrAskellOvisst: true,
  } } });
  const elin = r.filter((x) => x.starfsmadur === 'elin');
  assert.equal(elin.length, 1);
  assert.equal(elin[0].tegund, 'tvirukkun');
});

test('ekkert tvirukkun-fylki fellir ekki listann', () => {
  assert.doesNotThrow(() => bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true } } }));
  assert.equal(bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, tvirukkun: null } } }).length, 0);
  assert.equal(bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, tvirukkun: [null, undefined] } } }).length, 0);
});

// ── Heildaryfirferð, atriði 3: EIN uppspretta fyrir viku-gluggann ────────────────────────────────
// ⚠ `elin.mjs` telur „z innan viku" undir „endurnýjast"-flísinni. Afriti hún regluna í stað þess að
//   flytja hana inn reka talan á flísinni og fjöldi raðanna í sundur við fyrstu breytingu — og þá
//   segir spjaldið „3 innan viku" meðan „Bíður þín" sýnir tvær.
test('rennurUtInnan er EIN uppspretta viku-/mánaðargluggans — bæði mörk og endanleg tala', () => {
  assert.equal(rennurUtInnan({ until: NU_E + 3 * 86400 }, NU_E, VIKA_SEK), true);
  assert.equal(rennurUtInnan({ until: NU_E + 10 * 86400 }, NU_E, VIKA_SEK), false, 'utan viku');
  assert.equal(rennurUtInnan({ until: NU_E + 10 * 86400 }, NU_E, MANUDUR_SEK), true, 'innan mánaðar');
  assert.equal(rennurUtInnan({ until: NU_E - 86400 }, NU_E, MANUDUR_SEK), false, 'þegar útrunnið er farið, ekki „endurnýjast"');
  assert.equal(rennurUtInnan({ until: undefined }, NU_E, MANUDUR_SEK), false, '`NaN > x` er ósatt — stak án dagsetningar má ekki lauma sér framhjá');
  assert.equal(rennurUtInnan(null, NU_E, MANUDUR_SEK), false);
});

test('vikuröðin í bidurThin notar SAMA fall — ekki afrit af reglunni', () => {
  const rad = [
    { kt: '1111111111', vara: 'kvoti', until: NU_E + 2 * 86400 },
    { kt: '2222222222', vara: 'kvoti', until: NU_E + 20 * 86400 },
    { kt: '3333333333', vara: 'kvoti', until: NU_E - 86400 },
  ];
  const r = bidurThin({ now: NU_E, fjarmal: { fjarmal: { ok: true, rennurUt: rad } } });
  assert.equal(r.filter((x) => x.tegund === 'rennur_ut').length, rad.filter((x) => rennurUtInnan(x, NU_E, VIKA_SEK)).length);
});
