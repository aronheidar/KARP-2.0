// kort-throp.test.mjs — próf fyrir vörpunareininguna kort-throp.mjs og SVG-teiknarann kort-svg.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { kortThrep, KORT_LEVER_ID } from './kort-throp.mjs';
import { renderIslandKort } from './kort-svg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));

// — kortThrep: mörk ————————————————————————————————————————————————

test('byggd: þrepamörk (hálf-opin bil)', () => {
  assert.equal(kortThrep({ kpis: { byggdajofnudur: 91.9 } }).byggd, 0);
  assert.equal(kortThrep({ kpis: { byggdajofnudur: 92 } }).byggd, 1);
  assert.equal(kortThrep({ kpis: { byggdajofnudur: 98.9 } }).byggd, 1);
  assert.equal(kortThrep({ kpis: { byggdajofnudur: 99 } }).byggd, 2);
  assert.equal(kortThrep({ kpis: { byggdajofnudur: 105.9 } }).byggd, 2);
  assert.equal(kortThrep({ kpis: { byggdajofnudur: 106 } }).byggd, 3);
  // öfgagildi klemmast í 0-3
  assert.equal(kortThrep({ kpis: { byggdajofnudur: 500 } }).byggd, 3);
  assert.equal(kortThrep({ kpis: { byggdajofnudur: -50 } }).byggd, 0);
});

test('fiskur: þrepamörk', () => {
  assert.equal(kortThrep({ kpis: { fiskistofn: 89.9 } }).fiskur, 0);
  assert.equal(kortThrep({ kpis: { fiskistofn: 90 } }).fiskur, 1);
  assert.equal(kortThrep({ kpis: { fiskistofn: 100 } }).fiskur, 2);
  assert.equal(kortThrep({ kpis: { fiskistofn: 109.9 } }).fiskur, 2);
  assert.equal(kortThrep({ kpis: { fiskistofn: 110 } }).fiskur, 3);
});

test('losun: öfug röð — lægra gildi = lægra mengunar-þrep', () => {
  assert.equal(kortThrep({ kpis: { losun: 60 } }).losun, 0);
  assert.equal(kortThrep({ kpis: { losun: 84.9 } }).losun, 0);
  assert.equal(kortThrep({ kpis: { losun: 85 } }).losun, 1);
  assert.equal(kortThrep({ kpis: { losun: 94.9 } }).losun, 1);
  assert.equal(kortThrep({ kpis: { losun: 95 } }).losun, 2);
  assert.equal(kortThrep({ kpis: { losun: 104.9 } }).losun, 2);
  assert.equal(kortThrep({ kpis: { losun: 105 } }).losun, 3);
  assert.equal(kortThrep({ kpis: { losun: 118 } }).losun, 3);
});

test('menntun: sleða-frávik á bilinu -1..1', () => {
  assert.equal(kortThrep({ kpis: { menntun: -0.5 } }).menntun, 0);
  assert.equal(kortThrep({ kpis: { menntun: -0.15 } }).menntun, 0);
  assert.equal(kortThrep({ kpis: { menntun: 0 } }).menntun, 1);
  assert.equal(kortThrep({ kpis: { menntun: 0.15 } }).menntun, 1);
  assert.equal(kortThrep({ kpis: { menntun: 0.3 } }).menntun, 2);
  assert.equal(kortThrep({ kpis: { menntun: 0.5 } }).menntun, 2);
  assert.equal(kortThrep({ kpis: { menntun: 0.6 } }).menntun, 3);
});

test('menntun: vísitala ~100 notar byggða-mörkin, og mennt er varaleið', () => {
  assert.equal(kortThrep({ kpis: { menntun: 91 } }).menntun, 0);
  assert.equal(kortThrep({ kpis: { menntun: 95 } }).menntun, 1);
  assert.equal(kortThrep({ kpis: { menntun: 103 } }).menntun, 2);
  assert.equal(kortThrep({ kpis: { menntun: 110 } }).menntun, 3);
  // varaleiðin kpis.mennt
  assert.equal(kortThrep({ kpis: { mennt: 0.6 } }).menntun, 3);
  assert.equal(kortThrep({ kpis: { mennt: 107 } }).menntun, 3);
  // menntun gengur fyrir mennt
  assert.equal(kortThrep({ kpis: { menntun: -0.5, mennt: 110 } }).menntun, 0);
});

test('null/vantandi KPI fá sjálfgefin þrep (byggd 1, fiskur 1, losun 2, menntun 1)', () => {
  const t = kortThrep({ kpis: {} });
  assert.equal(t.byggd, 1);
  assert.equal(t.fiskur, 1);
  assert.equal(t.losun, 2);
  assert.equal(t.menntun, 1);
  // null og ótölugildi meðhöndluð eins og vantandi
  const t2 = kortThrep({ kpis: { byggdajofnudur: null, fiskistofn: NaN, losun: 'x', menntun: undefined } });
  assert.equal(t2.byggd, 1);
  assert.equal(t2.fiskur, 1);
  assert.equal(t2.losun, 2);
  assert.equal(t2.menntun, 1);
});

test('tóm inntök hrynja ekki og skila gildu formi', () => {
  for (const t of [kortThrep(), kortThrep({}), kortThrep(undefined)]) {
    assert.deepEqual(Object.keys(t).sort(),
      ['atvik', 'byggd', 'ferdamenn', 'fiskur', 'gamaskip', 'kranar', 'kviar', 'ljos', 'losun', 'menntun', 'taknmyndir', 'togarar', 'vindmyllur']);
    for (const k of ['byggd', 'menntun', 'fiskur', 'losun', 'ljos', 'togarar', 'kranar', 'kviar', 'vindmyllur', 'ferdamenn', 'gamaskip']) {
      assert.ok(Number.isInteger(t[k]) && t[k] >= 0 && t[k] <= 3, `${k} er heiltölu-þrep 0-3`);
    }
    assert.equal(t.atvik, null);
    assert.ok(Array.isArray(t.taknmyndir));
    assert.equal(t.taknmyndir.length, 0);
  }
});

// — kortThrep: næturljós (ljos) ————————————————————————————————————

test('ljos: mörk á summu hagvaxtar + kaupmáttar (báðar brúnir)', () => {
  const lj = (hagvoxtur, kaupmattur) => kortThrep({ kpis: { hagvoxtur, kaupmattur } }).ljos;
  // summa < 0 -> 0 (kreppa-dimma)
  assert.equal(lj(-2, 1.9), 0);      // summa -0.1
  assert.equal(lj(-3, -1), 0);       // djúp kreppa
  // 0 <= summa < 2.5 -> 1
  assert.equal(lj(0, 0), 1);         // summa 0 (neðra markið telst með efra þrepi)
  assert.equal(lj(1.5, 0.9), 1);     // summa 2.4
  // 2.5 <= summa < 5 -> 2
  assert.equal(lj(1.5, 1), 2);       // summa 2.5
  assert.equal(lj(2.5, 2.4), 2);     // summa 4.9
  // summa >= 5 -> 3 (góðæris-glóð)
  assert.equal(lj(2.5, 2.5), 3);     // summa 5
  assert.equal(lj(4, 3), 3);         // summa 7
});

test('ljos: annað gildið null → hitt eitt með helmings-mörkum (0 / 1.25 / 2.5)', () => {
  const bara = (kpis) => kortThrep({ kpis }).ljos;
  // aðeins hagvöxtur
  assert.equal(bara({ hagvoxtur: -0.1 }), 0);
  assert.equal(bara({ hagvoxtur: 0 }), 1);
  assert.equal(bara({ hagvoxtur: 1.24 }), 1);
  assert.equal(bara({ hagvoxtur: 1.25 }), 2);
  assert.equal(bara({ hagvoxtur: 2.49 }), 2);
  assert.equal(bara({ hagvoxtur: 2.5 }), 3);
  // aðeins kaupmáttur (hagvöxtur ógildur telst null)
  assert.equal(bara({ kaupmattur: -1 }), 0);
  assert.equal(bara({ hagvoxtur: NaN, kaupmattur: 1.3 }), 2);
  assert.equal(bara({ hagvoxtur: 'x', kaupmattur: 3 }), 3);
});

test('ljos: bæði null → 2 (hlutlaus-björt sjálfgefin staða)', () => {
  assert.equal(kortThrep({ kpis: {} }).ljos, 2);
  assert.equal(kortThrep().ljos, 2);
  assert.equal(kortThrep({ kpis: { hagvoxtur: null, kaupmattur: NaN } }).ljos, 2);
});

// — kortThrep: togarar & kranar (levers) ————————————————————————————

test('togarar: þrepamörk á levers.kvoti (báðar brúnir)', () => {
  const tog = (kvoti) => kortThrep({ levers: { kvoti } }).togarar;
  assert.equal(tog(-1), 0);          // hert aflaregla — flotinn í höfn
  assert.equal(tog(-0.35), 0);       // markið sjálft telst með þrepi 0
  assert.equal(tog(-0.349), 1);
  assert.equal(tog(0), 1);           // grunnfloti
  assert.equal(tog(0.15), 1);        // markið telst með þrepi 1
  assert.equal(tog(0.151), 2);
  assert.equal(tog(0.55), 2);        // markið telst með þrepi 2
  assert.equal(tog(0.551), 3);
  assert.equal(tog(1), 3);           // stórsókn
});

test('kranar: þrepamörk á levers.lodaframbod (báðar brúnir)', () => {
  const kr = (lodaframbod) => kortThrep({ levers: { lodaframbod } }).kranar;
  assert.equal(kr(-1), 0);
  assert.equal(kr(-0.35), 0);
  assert.equal(kr(-0.349), 1);
  assert.equal(kr(0), 1);
  assert.equal(kr(0.15), 1);
  assert.equal(kr(0.151), 2);
  assert.equal(kr(0.55), 2);
  assert.equal(kr(0.551), 3);
  assert.equal(kr(1), 3);
});

test('togarar/kranar: null, vantandi levers og rusl → 1 (grunnstaða)', () => {
  const nulls = kortThrep({ levers: { kvoti: null, lodaframbod: null } });
  assert.equal(nulls.togarar, 1);
  assert.equal(nulls.kranar, 1);
  // levers vantar alveg
  assert.equal(kortThrep({}).togarar, 1);
  assert.equal(kortThrep({}).kranar, 1);
  assert.equal(kortThrep().togarar, 1);
  assert.equal(kortThrep().kranar, 1);
  // tómt levers-object og ótölu-rusl
  assert.equal(kortThrep({ levers: {} }).togarar, 1);
  assert.equal(kortThrep({ levers: {} }).kranar, 1);
  const rusl = kortThrep({ levers: { kvoti: NaN, lodaframbod: 'x' } });
  assert.equal(rusl.togarar, 1);
  assert.equal(rusl.kranar, 1);
  // levers=null hrynur ekki
  assert.equal(kortThrep({ levers: null }).togarar, 1);
  assert.equal(kortThrep({ levers: null }).kranar, 1);
});

test('togarar (sókn) og fiskur (stofn) eru aðskildar víddir — kennslupunkturinn', () => {
  // stórsókn ofan í hruninn stofn: margir togarar, fáir fiskar á sama korti
  const t = kortThrep({ kpis: { fiskistofn: 82 }, levers: { kvoti: 0.9 } });
  assert.equal(t.togarar, 3);
  assert.equal(t.fiskur, 0);
});

// — kortThrep: atvinnuvega-þrepin fjögur (kviar/vindmyllur/ferdamenn/gamaskip) ——————

test('lever-id kortsins eru raunverulegir sleðar í gogn/roads/baseline.json', () => {
  // Ver gegn endurnefningu í baseline: KORT_LEVER_ID er EINA uppsprettan sem kortThrep les úr.
  const ids = Object.values(KORT_LEVER_ID);
  assert.deepEqual(ids, ['kvoti', 'lodaframbod', 'fiskeldi', 'orka', 'orkuskipti', 'ferdamannagjald']);
  for (const id of ids) assert.ok(baseline.levers[id], `${id} er raunverulegur sleði í baseline.levers`);
  // og kortThrep les í raun þessa lykla (ekki afrit undir öðru nafni)
  assert.equal(kortThrep({ levers: { [KORT_LEVER_ID.kviar]: 1 } }).kviar, 3);
  assert.equal(kortThrep({ levers: { [KORT_LEVER_ID.vindmyllur]: 1 } }).vindmyllur, 3);
  assert.equal(kortThrep({ levers: { [KORT_LEVER_ID.ferdamenn]: 1 } }).ferdamenn, 1);
  assert.equal(kortThrep({ levers: { [KORT_LEVER_ID.togarar]: 1 } }).togarar, 3);
  assert.equal(kortThrep({ levers: { [KORT_LEVER_ID.kranar]: 1 } }).kranar, 3);
});

test('kviar: þrepamörk á levers.fiskeldi (sömu mörk og togarar, báðar brúnir) + null → 1', () => {
  const kv = (fiskeldi) => kortThrep({ levers: { fiskeldi } }).kviar;
  assert.equal(kv(-1), 0);           // engar kvíar
  assert.equal(kv(-0.35), 0);        // markið sjálft telst með þrepi 0
  assert.equal(kv(-0.349), 1);
  assert.equal(kv(0), 1);
  assert.equal(kv(0.15), 1);
  assert.equal(kv(0.151), 2);
  assert.equal(kv(0.55), 2);
  assert.equal(kv(0.551), 3);
  assert.equal(kv(1), 3);
  assert.equal(kv(null), 1);
  assert.equal(kv(NaN), 1);
  assert.equal(kortThrep({}).kviar, 1);
  assert.equal(kortThrep({ levers: null }).kviar, 1);
});

test('vindmyllur: þrepamörk á levers.orka + orkuskipti > 0,3 gefur +1 (hámark 3)', () => {
  const vm = (orka, orkuskipti) => kortThrep({ levers: { orka, orkuskipti } }).vindmyllur;
  // grunn-mörkin (án orkuskipta)
  assert.equal(vm(-1, null), 0);
  assert.equal(vm(-0.35, null), 0);
  assert.equal(vm(-0.349, null), 1);
  assert.equal(vm(0.15, null), 1);
  assert.equal(vm(0.151, null), 2);
  assert.equal(vm(0.55, null), 2);
  assert.equal(vm(0.551, null), 3);
  // orkuskipta-bónusinn: > 0,3 (ekki >=) bætir einu þrepi við
  assert.equal(vm(0, 0.3), 1, '0,3 sjálft er EKKI bónus');
  assert.equal(vm(0, 0.301), 2);
  assert.equal(vm(-1, 1), 1, 'bónus lyftir þrepi 0 í 1');
  assert.equal(vm(0.4, 0.5), 3);
  assert.equal(vm(1, 1), 3, 'þakið helst 3');
  assert.equal(vm(0, -0.5), 1, 'neikvæð orkuskipti gefa engan bónus (og draga ekki frá)');
  // null/vantar
  assert.equal(vm(null, null), 1);
  assert.equal(vm(null, 0.9), 2, 'orka vantar (→1) + bónus');
  assert.equal(kortThrep({}).vindmyllur, 1);
  assert.equal(kortThrep({ levers: { orka: 'x', orkuskipti: NaN } }).vindmyllur, 1);
});

test('ferdamenn: ferdamannagjald er álagsstýring — >0,3 → 1, <-0,3 → 3, annars 2 (líka null)', () => {
  const fm = (ferdamannagjald) => kortThrep({ levers: { ferdamannagjald } }).ferdamenn;
  assert.equal(fm(1), 1);            // hátt gjald þynnir
  assert.equal(fm(0.301), 1);
  assert.equal(fm(0.3), 2, '0,3 sjálft er grunnstaða');
  assert.equal(fm(0), 2);
  assert.equal(fm(-0.3), 2, '-0,3 sjálft er grunnstaða');
  assert.equal(fm(-0.301), 3);       // lágt/neikvætt magnar
  assert.equal(fm(-1), 3);
  assert.equal(fm(null), 2);
  assert.equal(fm(NaN), 2);
  assert.equal(kortThrep({}).ferdamenn, 2);
  assert.equal(kortThrep().ferdamenn, 2);
  assert.equal(kortThrep({ levers: null }).ferdamenn, 2);
});

test('ferdamenn: vlf_ferda (ferðaþjónustu-vísitalan) ræður straumnum með byggða-mörkum; hátt gjald dregur 1 frá', () => {
  const fm = (vlf_ferda, ferdamannagjald = null) => kortThrep({ kpis: { vlf_ferda }, levers: { ferdamannagjald } }).ferdamenn;
  // vísitölu-mörkin (hálf-opin, sömu og byggð): grunnlína 100 → 2
  assert.equal(fm(100), 2);
  assert.equal(fm(91.9), 0, 'COVID-hrun (~88) tæmir náttúruperlurnar');
  assert.equal(fm(92), 1);
  assert.equal(fm(98.9), 1);
  assert.equal(fm(99), 2);
  assert.equal(fm(105.9), 2);
  assert.equal(fm(106), 3, 'Ferðamannasprengjan (~108) fyllir þær — þrep 3 NÆST í leiknum (gjald-sleðinn er min=base=0 og getur aldrei lyft)');
  assert.equal(fm(108.2), 3);
  // gjald-sleðinn þynnir: > 0,3 → −1 þrep (lágmark 0); ≤ 0,3 breytir engu
  assert.equal(fm(108, 0.5), 2);
  assert.equal(fm(100, 0.5), 1, 'sama og sleða-eina reglan gefur við grunnlínu');
  assert.equal(fm(100, 0.3), 2);
  assert.equal(fm(93, 1), 0);
  assert.equal(fm(88, 1), 0, 'klemmt við 0');
  assert.equal(fm(108, -0.5), 3, 'neikvætt frávik lyftir EKKI ofan á vísitöluna (þakið er 3 hvort eð er)');
  assert.equal(fm(100, -0.5), 2, 'með vlf_ferda til staðar ræður vísitalan — sleðinn lyftir aldrei');
  // ógild vísitala → sleða-eina reglan (eins og vlf_ferda vanti)
  assert.equal(fm(NaN), 2);
  assert.equal(fm('x', 0.5), 1);
  assert.equal(fm(null, -0.5), 3);
  // baseline-gildrunni lýst: ferdamannagjald hefur min=0=base → normað frávik er aldrei < 0 í leiknum
  assert.equal(baseline.levers.ferdamannagjald.min, 0);
  assert.equal(baseline.levers.ferdamannagjald.base || 0, 0);
  // og vlf_ferda er raunveruleg útkoma í baseline (ekki uppfundinn lykill)
  assert.ok(baseline.outcomes.vlf_ferda, 'vlf_ferda er útkoma í baseline.outcomes');
});

test('gamaskip: hagvoxtur + gengi með ljós-mörkunum (0 / 2,5 / 5), hagvöxtur null → 1', () => {
  const gs = (kpis) => kortThrep({ kpis }).gamaskip;
  // án gengis (gengi vantar → 0)
  assert.equal(gs({ hagvoxtur: -0.1 }), 0);
  assert.equal(gs({ hagvoxtur: 0 }), 1);
  assert.equal(gs({ hagvoxtur: 2.49 }), 1);
  assert.equal(gs({ hagvoxtur: 2.5 }), 2);
  assert.equal(gs({ hagvoxtur: 4.99 }), 2);
  assert.equal(gs({ hagvoxtur: 5 }), 3);
  // gengis-frávikið bætist við summuna
  assert.equal(gs({ hagvoxtur: 2, gengi: 1 }), 2, '2+1=3 → þrep 2');
  assert.equal(gs({ hagvoxtur: 2, gengi: 3 }), 3, '2+3=5 → þrep 3');
  assert.equal(gs({ hagvoxtur: 1, gengi: -1.5 }), 0, '1-1,5 < 0 → höfnin tóm');
  assert.equal(gs({ hagvoxtur: -6, gengi: -35 }), 0, 'bankahrun');
  // varaleið gengi_endo, gengi gengur fyrir
  assert.equal(gs({ hagvoxtur: 2, gengi_endo: 3 }), 3);
  assert.equal(gs({ hagvoxtur: 2, gengi: 0, gengi_endo: 3 }), 1);
  // hagvöxtur vantar → 1 óháð gengi
  assert.equal(gs({}), 1);
  assert.equal(gs({ gengi: 10 }), 1);
  assert.equal(gs({ hagvoxtur: null, gengi: 10 }), 1);
  assert.equal(gs({ hagvoxtur: 'x', gengi: NaN }), 1);
  assert.equal(kortThrep().gamaskip, 1);
});

// — kortThrep: atvik ————————————————————————————————————————————————

test('atvik: gild id fara óbreytt í gegn', () => {
  for (const id of ['eldgos', 'makrill', 'verkfall', 'gagnaver', 'spilling', 'tsunami', 'nyskopun', 'jafnretti']) {
    assert.equal(kortThrep({ atvik: id }).atvik, id);
  }
});

test('atvik: rusl og óþekkt gildi verða null', () => {
  assert.equal(kortThrep({ atvik: 'bull' }).atvik, null);
  assert.equal(kortThrep({ atvik: 'ELDGOS' }).atvik, null);   // hástafir teljast óþekkt
  assert.equal(kortThrep({ atvik: '' }).atvik, null);
  assert.equal(kortThrep({ atvik: 42 }).atvik, null);
  assert.equal(kortThrep({ atvik: null }).atvik, null);
  assert.equal(kortThrep({}).atvik, null);
});

// — kortThrep: taknmyndir ——————————————————————————————————————————

test('taknmyndir koma úr policyStates og eventChoices', () => {
  const t = kortThrep({
    policyStates: { stjoridja: 'reisa', esb: true, audlindasjodur: true, hoft: true },
    eventChoices: { gagnaver: 'ja' },
  });
  assert.deepEqual(t.taknmyndir, ['alver', 'gagnaver', 'esb', 'sjodur', 'hoft']);
});

test('taknmyndir: neikvæð/röng gildi kveikja EKKI á táknum', () => {
  const t = kortThrep({
    policyStates: { stjoridja: 'hafna', esb: false, audlindasjodur: 'ja', hoft: 1 },
    eventChoices: { gagnaver: 'nei' },
  });
  // stjoridja='hafna' → ekkert álver; esb=false → enginn fáni;
  // audlindasjodur/hoft krefjast === true; gagnaver krefst === 'ja'
  assert.deepEqual(t.taknmyndir, []);
});

test('taknmyndir: esb er truthy-próf (t.d. "umsokn" telur)', () => {
  assert.deepEqual(kortThrep({ policyStates: { esb: 'umsokn' } }).taknmyndir, ['esb']);
});

// — renderIslandKort ———————————————————————————————————————————————

test('renderIslandKort skilar SVG-streng með lögunum', () => {
  const svg = renderIslandKort(kortThrep({ kpis: {} }));
  assert.ok(svg.startsWith('<svg'), 'byrjar á <svg');
  assert.ok(svg.includes('kt-byggd'), 'inniheldur kt-byggd');
  assert.ok(svg.includes('kt-fiskur'), 'inniheldur kt-fiskur');
  assert.ok(svg.includes('kt-losun'), 'inniheldur kt-losun');
  assert.ok(svg.includes('kt-menntun'), 'inniheldur kt-menntun');
  assert.ok(svg.includes('viewBox="0 0 640 400"'));
  assert.ok(!svg.includes('<text'), 'engin <text>-element');
  assert.ok(!/\son[a-z]+=/i.test(svg), 'engir event-handlerar');
});

test('renderIslandKort teiknar umbeðnar táknmyndir', () => {
  const svg = renderIslandKort({ byggd: 2, menntun: 1, fiskur: 1, losun: 1, taknmyndir: ['alver', 'esb'] });
  assert.ok(svg.includes('kt-takn-alver'), 'inniheldur kt-takn-alver');
  assert.ok(svg.includes('kt-takn-esb'), 'inniheldur kt-takn-esb');
  assert.ok(!svg.includes('kt-takn-hoft'), 'hoft ekki teiknað án beiðni');
  // óþekkt tákn hunsuð án hruns
  assert.ok(renderIslandKort({ taknmyndir: ['bull'] }).startsWith('<svg'));
});

test('þrep 0 og 3 skila ólíkum strengjum', () => {
  const lagt = renderIslandKort({ byggd: 0, menntun: 0, fiskur: 0, losun: 0, taknmyndir: [] });
  const hatt = renderIslandKort({ byggd: 3, menntun: 3, fiskur: 3, losun: 3, taknmyndir: [] });
  assert.notEqual(lagt, hatt);
  assert.ok(hatt.length > lagt.length, 'þrep 3 teiknar meira en þrep 0');
  assert.ok(lagt.includes('data-throp="0"'));
  assert.ok(hatt.includes('data-throp="3"'));
});

test('compact-útgáfan er styttri en full (færri fiskar, ekkert mistur)', () => {
  const threp = { byggd: 3, menntun: 3, fiskur: 3, losun: 3, taknmyndir: ['alver'] };
  const full = renderIslandKort(threp);
  const compact = renderIslandKort(threp, { compact: true });
  assert.ok(compact.length < full.length);
  assert.ok(!compact.includes('kt-blur)'), 'compact sleppir mistrinu');
  assert.ok(compact.includes('kt-losun'), 'losunar-lagið er samt til staðar');
});

test('idPrefix: öll defs-id bera forskeytið og strengurinn er deterministic', () => {
  const th = { byggd: 2, menntun: 1, fiskur: 2, losun: 1, taknmyndir: ['sjodur'] };
  // sjálfgefið forskeyti 'kt' á öll id og allar url(#...)-tilvísanir leysast innan skjalsins
  const svg = renderIslandKort(th);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0 && ids.every((id) => id.startsWith('kt-')), 'öll id byrja á kt-');
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `url(#${ref}) leysist`);
  // sér-forskeyti (tvö kort á sömu síðu) — engin kt-id eftir
  const svg2 = renderIslandKort(th, { idPrefix: 'x9' });
  assert.ok([...svg2.matchAll(/ id="([^"]+)"/g)].every((m) => m[1].startsWith('x9-')));
  assert.ok(!svg2.includes('#kt-'), 'engin kt-tilvísun með idPrefix=x9');
  // deterministic: sama threp → nákvæmlega sami strengur (client endurteiknar við sleða-drög)
  assert.equal(renderIslandKort(th), svg);
});

test('renderIslandKort þolir tóm/ógild þrep', () => {
  for (const svg of [renderIslandKort(), renderIslandKort({}), renderIslandKort(null), renderIslandKort({ byggd: 99, fiskur: -2 })]) {
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  }
});

// — renderIslandKort: næturljós ————————————————————————————————————

test('byggða-lagið ber data-ljos og ljos 0 vs 3 skila ólíkum strengjum', () => {
  const grunn = { byggd: 2, menntun: 1, fiskur: 1, losun: 1, taknmyndir: [] };
  const dimmt = renderIslandKort({ ...grunn, ljos: 0 });
  const bjart = renderIslandKort({ ...grunn, ljos: 3 });
  assert.ok(dimmt.includes('data-ljos="0"'), 'data-ljos="0" á kreppu-korti');
  assert.ok(bjart.includes('data-ljos="3"'), 'data-ljos="3" á góðæris-korti');
  assert.notEqual(dimmt, bjart, 'ljos-víddin breytir strengnum');
  // ljos=0 notar kalda glóð, ljos=3 hlýja + úthverfa-ljós (fleiri element)
  assert.ok(dimmt.includes('-baer-kalt)'), 'kreppa-dimma notar köldu glóðina');
  assert.ok(bjart.includes('-baer-hlytt)'), 'góðæris-glóð notar hlýju glóðina');
  assert.ok(bjart.length > dimmt.length, 'ljos=3 teiknar meira (halo + úthverfi)');
  // vantandi ljos → sjálfgefið hlutlaust 1
  assert.ok(renderIslandKort(grunn).includes('data-ljos="1"'));
});

test('ljos breytir AÐEINS byggða-laginu — hin lögin haldast eins', () => {
  const grunn = { byggd: 2, menntun: 2, fiskur: 2, losun: 1, taknmyndir: ['alver'] };
  const lag = (svg, kl) => svg.match(new RegExp(`<g class="kt-lag ${kl}"[^>]*>.*?</g>`, 's'))[0];
  const a = renderIslandKort({ ...grunn, ljos: 0 });
  const b = renderIslandKort({ ...grunn, ljos: 3 });
  for (const kl of ['kt-fiskur', 'kt-menntun', 'kt-losun']) {
    assert.equal(lag(a, kl), lag(b, kl), `${kl} óbreytt milli ljos 0 og 3`);
  }
});

// — renderIslandKort: atviks-lagið ——————————————————————————————————

test('kt-atvik-eldgos birtist með atvik: eldgos — og ekkert kt-atvik án', () => {
  const grunn = { byggd: 1, menntun: 1, fiskur: 1, losun: 1, taknmyndir: [] };
  const med = renderIslandKort({ ...grunn, atvik: 'eldgos' });
  assert.ok(med.includes('class="kt-atvik kt-atvik-eldgos"'), 'eldgos-lagið birtist');
  const an = renderIslandKort(grunn);
  assert.ok(!an.includes('kt-atvik'), 'ekkert atviks-lag án atviks');
  // óþekkt atvik (á að vera síað í kort-throp) teiknar heldur ekkert — líka arf-lyklar
  for (const rusl of ['bull', 'constructor', 'toString', null, 7]) {
    assert.ok(!renderIslandKort({ ...grunn, atvik: rusl }).includes('kt-atvik'), `ekkert lag fyrir ${String(rusl)}`);
  }
});

test('öll átta atvikin teikna sitt lag, deterministic og án <text>/handlera', () => {
  const grunn = { byggd: 2, menntun: 1, fiskur: 1, losun: 1, taknmyndir: [] };
  for (const id of ['eldgos', 'makrill', 'verkfall', 'gagnaver', 'spilling', 'tsunami', 'nyskopun', 'jafnretti']) {
    const svg = renderIslandKort({ ...grunn, atvik: id });
    assert.ok(svg.includes(`kt-atvik-${id}`), `kt-atvik-${id} birtist`);
    assert.ok(!svg.includes('<text'), 'engin <text>-element');
    assert.ok(!/\son[a-z]+=/i.test(svg), 'engir event-handlerar');
    assert.equal(renderIslandKort({ ...grunn, atvik: id }), svg, `${id} er deterministic`);
    // compact: aðal-formið eitt → lagið er til staðar en styttra
    const compact = renderIslandKort({ ...grunn, atvik: id }, { compact: true });
    assert.ok(compact.includes(`kt-atvik-${id}`), `kt-atvik-${id} líka í compact`);
  }
});

test('compact-atvik er einfaldað (eldgos: engir neistar, sprungan ein)', () => {
  const grunn = { byggd: 1, menntun: 1, fiskur: 1, losun: 1, taknmyndir: [], atvik: 'eldgos' };
  const full = renderIslandKort(grunn);
  const compact = renderIslandKort(grunn, { compact: true });
  const lagUr = (svg) => svg.match(/<g class="kt-atvik kt-atvik-eldgos">.*?<\/g>/s)[0];
  assert.ok(lagUr(compact).length < lagUr(full).length, 'compact-lagið er styttra');
  assert.ok(!lagUr(compact).includes('<ellipse'), 'enginn öskumökkur í compact');
});

// — renderIslandKort: togarar & kranar ——————————————————————————————

// Talningar-nálar: opacity="0.78" er sér-kenni togara-hópsins, #b8842c mótvægis
// kranans, 'M1.15 -7.2' troll-vírsins og 'M5.3 -11.8' krókvírsins.
const telja = (svg, nal) => svg.split(nal).length - 1;

test('kt-togarar og kt-kranar birtast með réttum data-throp (vantandi → 1)', () => {
  const svg = renderIslandKort({ byggd: 1, menntun: 0, fiskur: 1, losun: 1, togarar: 2, kranar: 3, taknmyndir: [] });
  assert.ok(svg.includes('<g class="kt-lag kt-togarar" data-throp="2">'), 'kt-togarar með data-throp=2');
  assert.ok(svg.includes('<g class="kt-lag kt-kranar" data-throp="3">'), 'kt-kranar með data-throp=3');
  const sjalfgefid = renderIslandKort({});
  assert.ok(sjalfgefid.includes('<g class="kt-lag kt-togarar" data-throp="1">'), 'vantandi togarar → 1');
  assert.ok(sjalfgefid.includes('<g class="kt-lag kt-kranar" data-throp="1">'), 'vantandi kranar → 1');
});

test('togarar: þrep 0 → höfn-skipið eitt (kyrrstætt, án vírs); 1/2/3 → 2/4/7 skip', () => {
  const grunn = { byggd: 1, menntun: 0, fiskur: 0, losun: 1, kranar: 0, taknmyndir: [] };
  const hofn = renderIslandKort({ ...grunn, togarar: 0 });
  assert.ok(hofn.includes('kt-togari-hofn'), 'höfn-skipið ber class kt-togari-hofn');
  assert.equal(telja(hofn, 'opacity="0.78"'), 1, 'eitt skip á þrepi 0');
  assert.ok(!hofn.includes('M1.15 -7.2'), 'kyrrstætt skip togar ekki — enginn troll-vír');
  assert.equal(telja(renderIslandKort({ ...grunn, togarar: 1 }), 'opacity="0.78"'), 2);
  assert.equal(telja(renderIslandKort({ ...grunn, togarar: 2 }), 'opacity="0.78"'), 4);
  const stor = renderIslandKort({ ...grunn, togarar: 3 });
  assert.ok(!stor.includes('kt-togari-hofn'), 'ekkert höfn-skip í stórsókn');
  assert.equal(telja(stor, 'opacity="0.78"'), 7, 'sjö skip á þrepi 3');
  assert.equal(telja(stor, 'M1.15 -7.2'), 7, 'troll-vír á hverju skipi í fullri útgáfu');
});

test('kranar: fjöldi per þrep (0/1/3/5) og kranaljós á toppi hvers', () => {
  const grunn = { byggd: 1, menntun: 0, fiskur: 0, losun: 1, togarar: 0, taknmyndir: [] };
  assert.equal(telja(renderIslandKort({ ...grunn, kranar: 0 }), '#b8842c'), 0, 'þrep 0 = enginn krani');
  assert.equal(telja(renderIslandKort({ ...grunn, kranar: 1 }), '#b8842c'), 1);
  assert.equal(telja(renderIslandKort({ ...grunn, kranar: 2 }), '#b8842c'), 3);
  const bola = renderIslandKort({ ...grunn, kranar: 3 });
  assert.equal(telja(bola, '#b8842c'), 5);
  assert.equal(telja(bola, 'cy="-13.9"'), 5, 'kranaljós á hverjum krana');
  assert.equal(telja(bola, 'M5.3 -11.8'), 5, 'krókvír á hverjum krana í fullri útgáfu');
});

test('togarar/kranar compact: helmingi færri einingar og engir vírar', () => {
  const threp = { byggd: 1, menntun: 0, fiskur: 0, losun: 1, togarar: 3, kranar: 3, taknmyndir: [] };
  const c = renderIslandKort(threp, { compact: true });
  assert.equal(telja(c, 'opacity="0.78"'), 4, 'togarar: ceil(7/2)=4 í compact');
  assert.equal(telja(c, '#b8842c'), 3, 'kranar: ceil(5/2)=3 í compact');
  assert.ok(!c.includes('M1.15 -7.2'), 'engir troll-vírar í compact');
  assert.ok(!c.includes('M5.3 -11.8'), 'enginn krókvír í compact');
  // höfn-skipið birtist líka á þrepi 0 í compact
  const c0 = renderIslandKort({ ...threp, togarar: 0 }, { compact: true });
  assert.ok(c0.includes('kt-togari-hofn'), 'höfn-skipið líka í compact');
});

test('togarar/kranar: determinismi gegnum kortThrep og engin defs-id án prefix', () => {
  const inntak = { kpis: { fiskistofn: 85 }, levers: { kvoti: 0.9, lodaframbod: 0.6 } };
  const th = kortThrep(inntak);
  assert.equal(th.togarar, 3);
  assert.equal(th.kranar, 3);
  assert.equal(th.fiskur, 0); // sókn og stofn segja sitt hvora söguna
  const svg = renderIslandKort(th);
  assert.equal(renderIslandKort(kortThrep(inntak)), svg, 'sama inntak → nákvæmlega sami strengur');
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0 && ids.every((id) => id.startsWith('kt-')), 'engin defs-id án prefix');
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `url(#${ref}) leysist`);
  assert.ok(!svg.includes('<text'), 'engin <text>-element');
  assert.ok(!/\son[a-z]+=/i.test(svg), 'engir event-handlerar');
});

test('determinismi helst með ljos + atvik saman', () => {
  const th = kortThrep({
    kpis: { byggdajofnudur: 104, fiskistofn: 108, losun: 88, menntun: 0.3, hagvoxtur: 3, kaupmattur: 2.4 },
    policyStates: { esb: true },
    atvik: 'nyskopun',
  });
  assert.equal(th.ljos, 3);
  assert.equal(th.atvik, 'nyskopun');
  const svg = renderIslandKort(th);
  assert.equal(renderIslandKort(kortThrep({
    kpis: { byggdajofnudur: 104, fiskistofn: 108, losun: 88, menntun: 0.3, hagvoxtur: 3, kaupmattur: 2.4 },
    policyStates: { esb: true },
    atvik: 'nyskopun',
  })), svg, 'sama inntak → nákvæmlega sami strengur');
});

// — renderIslandKort: atvinnuvega-lögin fjögur (kviar/vindmyllur/ferdamenn/gamaskip) ————————

// Sker EITT lag út úr strengnum: frá '<g class="kt-lag <kl>"' að næsta lagi/tákni/atviki/enda
// (lögin innihalda nestuð <g> svo non-greedy .*?</g> dugar ekki til talningar).
const lagStr = (svg, kl) => {
  const i = svg.indexOf(`<g class="kt-lag ${kl}"`);
  assert.ok(i >= 0, `lagið ${kl} finnst`);
  const rest = svg.slice(i + 1);
  const j = rest.search(/<g class="kt-(lag|takn|atvik) |<\/svg>/);
  return svg.slice(i, i + 1 + j);
};
// Talningar-nálar: r="2.6" = ytri kvía-hringur · 'M-3.4 -0.8' = fóðurprammi · cy="-11" r="0.9" = nöf
// vindmyllu · 'M-5.5 1.2 Q0 -4.6' = stíflu-bogi · r="2.4" fill="none" = ferða-hringur · cy="-3.2" r="1" =
// höfuð fólks-tákns · rotate(-28) = flugvél · 'M-11.5 -2 L12.4 -2' = gámaskips-skrokkur ·
// 'L-19 -0.4' = kjölvatn · y="-3.9" = gámur.
const GRUNN_AV = { byggd: 1, menntun: 0, fiskur: 0, losun: 1, ljos: 1, togarar: 0, kranar: 0, taknmyndir: [] };

test('öll fjögur atvinnuvega-lögin birtast með réttu data-throp (vantandi → kviar 1, vindmyllur 1, ferdamenn 2, gamaskip 1)', () => {
  const svg = renderIslandKort({ ...GRUNN_AV, kviar: 2, vindmyllur: 3, ferdamenn: 0, gamaskip: 1 });
  assert.ok(svg.includes('<g class="kt-lag kt-kviar" data-throp="2">'), 'kt-kviar með data-throp=2');
  assert.ok(svg.includes('<g class="kt-lag kt-vindmyllur" data-throp="3">'), 'kt-vindmyllur með data-throp=3');
  assert.ok(svg.includes('<g class="kt-lag kt-ferdamenn" data-throp="0">'), 'kt-ferdamenn með data-throp=0');
  assert.ok(svg.includes('<g class="kt-lag kt-gamaskip" data-throp="1">'), 'kt-gamaskip með data-throp=1');
  const sjalfgefid = renderIslandKort({});
  assert.ok(sjalfgefid.includes('<g class="kt-lag kt-kviar" data-throp="1">'), 'vantandi kviar → 1');
  assert.ok(sjalfgefid.includes('<g class="kt-lag kt-vindmyllur" data-throp="1">'), 'vantandi vindmyllur → 1');
  assert.ok(sjalfgefid.includes('<g class="kt-lag kt-ferdamenn" data-throp="2">'), 'vantandi ferdamenn → 2 (grunn-straumur)');
  assert.ok(sjalfgefid.includes('<g class="kt-lag kt-gamaskip" data-throp="1">'), 'vantandi gamaskip → 1');
  // öfgagildi klemmast
  assert.ok(renderIslandKort({ kviar: 9, gamaskip: -4 }).includes('kt-kviar" data-throp="3"'));
  assert.ok(renderIslandKort({ kviar: 9, gamaskip: -4 }).includes('kt-gamaskip" data-throp="0"'));
});

test('kviar: 0/2/4/6 kvíar per þrep, fóðurprammi aðeins á þrepi 3', () => {
  const n = (th) => telja(lagStr(renderIslandKort({ ...GRUNN_AV, kviar: th }), 'kt-kviar'), 'r="2.6"');
  assert.equal(n(0), 0);
  assert.equal(n(1), 2);
  assert.equal(n(2), 4);
  assert.equal(n(3), 6);
  assert.ok(!lagStr(renderIslandKort({ ...GRUNN_AV, kviar: 2 }), 'kt-kviar').includes('M-3.4 -0.8'), 'enginn prammi á þrepi 2');
  assert.equal(telja(lagStr(renderIslandKort({ ...GRUNN_AV, kviar: 3 }), 'kt-kviar'), 'M-3.4 -0.8'), 1, 'einn prammi á þrepi 3');
});

test('vindmyllur: 0/2/4/7 myllur, stífla frá þrepi 1, hvert snúnings-horn ólíkt', () => {
  const lag = (th) => lagStr(renderIslandKort({ ...GRUNN_AV, vindmyllur: th }), 'kt-vindmyllur');
  assert.equal(telja(lag(0), 'cy="-11" r="0.9"'), 0);
  assert.equal(telja(lag(1), 'cy="-11" r="0.9"'), 2);
  assert.equal(telja(lag(2), 'cy="-11" r="0.9"'), 4);
  assert.equal(telja(lag(3), 'cy="-11" r="0.9"'), 7);
  assert.ok(!lag(0).includes('M-5.5 1.2 Q0 -4.6'), 'engin stífla á þrepi 0');
  for (const th of [1, 2, 3]) assert.equal(telja(lag(th), 'M-5.5 1.2 Q0 -4.6'), 1, `stífla á þrepi ${th}`);
  // spaðarnir snúa mis-mikið: 7 ólík rotate(...) horn á nöfinni (enginn stimpill)
  const horn = [...lag(3).matchAll(/translate\(0 -11\) rotate\((\d+)\)/g)].map((m) => m[1]);
  assert.equal(horn.length, 7);
  assert.equal(new Set(horn).size, 7, 'engin tvö eins horn');
});

test('háspennulína AÐEINS með vindmyllur 3 — til álversins ef alver er í taknmyndir, annars til RVK', () => {
  const an = renderIslandKort({ ...GRUNN_AV, vindmyllur: 3 });
  assert.ok(an.includes('kt-haspenna'), 'lína á þrepi 3');
  assert.ok(an.includes('L210 276'), 'án álvers endar hún NA við RVK (kranaþyrpinguna)');
  assert.ok(!an.includes('L548 197'), 'án álvers fer hún ekki austur');
  const med = renderIslandKort({ ...GRUNN_AV, vindmyllur: 3, taknmyndir: ['alver'] });
  assert.ok(med.includes('kt-haspenna') && med.includes('L548 197'), 'með álveri endar hún við Reyðarfjörð');
  assert.ok(!med.includes('L210 276'));
  // þrep 0-2 → engin lína þó álver sé til
  for (const th of [0, 1, 2]) {
    assert.ok(!renderIslandKort({ ...GRUNN_AV, vindmyllur: th, taknmyndir: ['alver'] }).includes('kt-haspenna'), `engin lína á þrepi ${th}`);
  }
  // línan situr í vindmyllu-laginu (undir álvers-tákninu, sem kemur á eftir)
  assert.ok(lagStr(med, 'kt-vindmyllur').includes('kt-haspenna'));
  assert.ok(med.indexOf('kt-haspenna') < med.indexOf('kt-takn-alver'), 'línan teiknast á undan (undir) álverinu');
});

test('ferdamenn: 0/2/4/7 deplar með fólks-tákni, flugvél alltaf (stækkar), tvær vélar á þrepi 3', () => {
  const lag = (th) => lagStr(renderIslandKort({ ...GRUNN_AV, ferdamenn: th }), 'kt-ferdamenn');
  assert.equal(telja(lag(0), 'r="2.4" fill="none"'), 0);
  assert.equal(telja(lag(1), 'r="2.4" fill="none"'), 2);
  assert.equal(telja(lag(2), 'r="2.4" fill="none"'), 4);
  assert.equal(telja(lag(3), 'r="2.4" fill="none"'), 7);
  assert.equal(telja(lag(3), 'cy="-3.2" r="1"'), 7, 'fólks-tákn við hvern depil');
  assert.equal(telja(lag(0), 'rotate(-28)'), 1, 'ein lítil flugvél líka á þrepi 0');
  assert.equal(telja(lag(2), 'rotate(-28)'), 1);
  assert.equal(telja(lag(3), 'rotate(-28)'), 2, 'tvær vélar á þrepi 3');
  assert.ok(lag(0).includes('scale(0.7)') && lag(3).includes('scale(1.15)'), 'vélin stækkar með þrepi');
});

test('gamaskip: 0/1/2/4 skip, 3-5 gámar á hverju, kjölvatn aðeins á þrepi 3, enginn troll-vír', () => {
  const lag = (th) => lagStr(renderIslandKort({ ...GRUNN_AV, gamaskip: th }), 'kt-gamaskip');
  assert.equal(telja(lag(0), 'M-11.5 -2 L12.4 -2'), 0);
  assert.equal(telja(lag(1), 'M-11.5 -2 L12.4 -2'), 1);
  assert.equal(telja(lag(2), 'M-11.5 -2 L12.4 -2'), 2);
  assert.equal(telja(lag(3), 'M-11.5 -2 L12.4 -2'), 4);
  assert.equal(telja(lag(3), 'y="-3.9"'), 4 + 5 + 3 + 4, 'gámafjöldi 4/5/3/4');
  assert.ok(!lag(2).includes('L-19 -0.4'), 'ekkert kjölvatn á þrepi 2');
  assert.equal(telja(lag(3), 'L-19 -0.4'), 4, 'kjölvatn á öllum fjórum á þrepi 3');
  assert.ok(!lag(3).includes('M1.15 -7.2'), 'gámaskip hafa engan troll-vír');
});

test('atvinnuvega-lög: þrep 0 og 3 skila ólíkum strengjum, þrep 3 teiknar meira', () => {
  for (const kl of ['kviar', 'vindmyllur', 'ferdamenn', 'gamaskip']) {
    const lagt = renderIslandKort({ ...GRUNN_AV, [kl]: 0 });
    const hatt = renderIslandKort({ ...GRUNN_AV, [kl]: 3 });
    assert.notEqual(lagt, hatt, `${kl} 0 ≠ 3`);
    assert.ok(hatt.length > lagt.length, `${kl} þrep 3 teiknar meira`);
    assert.ok(lagStr(lagt, 'kt-' + kl).includes('data-throp="0"'));
    assert.ok(lagStr(hatt, 'kt-' + kl).includes('data-throp="3"'));
  }
});

test('atvinnuvega-lög: compact er styttra (helmingi færri einingar, engin smáatriði)', () => {
  const th = { ...GRUNN_AV, kviar: 3, vindmyllur: 3, ferdamenn: 3, gamaskip: 3, taknmyndir: ['alver'] };
  const full = renderIslandKort(th);
  const c = renderIslandKort(th, { compact: true });
  assert.ok(c.length < full.length);
  for (const kl of ['kt-kviar', 'kt-vindmyllur', 'kt-ferdamenn', 'kt-gamaskip']) {
    assert.ok(c.includes(kl), `${kl} er samt til staðar í compact`);
    assert.ok(lagStr(c, kl).length < lagStr(full, kl).length, `${kl} styttra í compact`);
  }
  assert.equal(telja(lagStr(c, 'kt-kviar'), 'r="2.6"'), 3, 'kvíar: ceil(6/2)=3');
  assert.ok(!lagStr(c, 'kt-kviar').includes('M-3.4 -0.8'), 'enginn prammi í compact');
  assert.equal(telja(lagStr(c, 'kt-vindmyllur'), 'cy="-11" r="0.9"'), 4, 'myllur: ceil(7/2)=4');
  assert.ok(!c.includes('kt-haspenna'), 'engin háspennulína í compact');
  assert.equal(telja(lagStr(c, 'kt-ferdamenn'), 'r="2.4" fill="none"'), 4, 'deplar: ceil(7/2)=4');
  assert.ok(!lagStr(c, 'kt-ferdamenn').includes('cy="-3.2" r="1"'), 'engin fólks-tákn í compact');
  assert.equal(telja(lagStr(c, 'kt-ferdamenn'), 'rotate(-28)'), 1, 'ein vél í compact');
  assert.equal(telja(lagStr(c, 'kt-gamaskip'), 'M-11.5 -2 L12.4 -2'), 2, 'skip: ceil(4/2)=2');
  assert.ok(!lagStr(c, 'kt-gamaskip').includes('L-19 -0.4'), 'ekkert kjölvatn í compact');
});

test('atvinnuvega-lög: determinismi gegnum kortThrep, engin <text>, og tvö prefix deila engu id', () => {
  const inntak = {
    kpis: { hagvoxtur: 3, gengi: 2.5, fiskistofn: 95 },
    levers: { fiskeldi: 0.8, orka: 0.2, orkuskipti: 0.6, ferdamannagjald: -0.5, kvoti: 0.2 },
    policyStates: { stjoridja: 'reisa' },
  };
  const th = kortThrep(inntak);
  assert.deepEqual([th.kviar, th.vindmyllur, th.ferdamenn, th.gamaskip], [3, 3, 3, 3]);
  const svg = renderIslandKort(th);
  assert.equal(renderIslandKort(kortThrep(inntak)), svg, 'sama inntak → nákvæmlega sami strengur');
  assert.ok(svg.includes('kt-haspenna') && svg.includes('L548 197'), 'alver + vindmyllur 3 → lína austur');
  assert.ok(!svg.includes('<text'), 'engin <text>-element');
  assert.ok(!/\son[a-z]+=/i.test(svg), 'engir event-handlerar');
  // tvö kort á sömu síðu: engin sameiginleg id, allar url(#)-tilvísanir leysast innan hvors
  const a = renderIslandKort(th, { idPrefix: 'ka' });
  const b = renderIslandKort(th, { idPrefix: 'kb' });
  const idsA = [...a.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const idsB = [...b.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(idsA.length > 0 && idsA.every((id) => id.startsWith('ka-')));
  assert.ok(idsB.every((id) => id.startsWith('kb-')));
  assert.equal(idsA.filter((id) => idsB.includes(id)).length, 0, 'engin id sameiginleg');
  for (const [, ref] of a.matchAll(/url\(#([^)]+)\)/g)) assert.ok(idsA.includes(ref), `url(#${ref}) leysist í ka`);
  assert.ok(!a.includes('#kb-') && !b.includes('#ka-'));
});
