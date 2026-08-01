import test from 'node:test';
import assert from 'node:assert/strict';
import { byggjaVisitolu, flokkaNofn, samraemi, sancNorm, skima, skimunarNidurstada } from './refsilistar.mjs';

// Raunveruleg sýnishorn úr web/public/gogn/sanctions.json (2026-07-31).
const NAMES = [
  // fjöl-orða — sterka lagið
  { n: 'saddam hussein al tikriti', nafn: 'Saddam Hussein Al-Tikriti', listar: 'ESB,SÞ,OFAC' },
  // raunveruleg eins-orðs nöfn — veika lagið
  { n: 'hamas', nafn: 'Hamas', listar: 'ESB,OFAC' },
  { n: 'pkk', nafn: 'PKK', listar: 'ESB,OFAC' },
  { n: 'pij', nafn: 'PIJ', listar: 'ESB,OFAC' },
  { n: 'rosneft', nafn: 'ROSNEFT', listar: 'OFAC' },
  { n: 'nova', nafn: 'NOVA', listar: 'OFAC' },
  { n: 'ssl', nafn: 'SSL', listar: 'ESB' },
  // eitt orð í birtingu EN með tölu-viðskeyti — sancNorm hendir tölunni, svo lykillinn
  // verður berorða ('maia'). Færslan á heima í vísitölunni en má aðeins samsvara
  // stafréttri fyrirspurn, ekki berorðinu einu.
  { n: 'maia', nafn: 'MAIA-1', listar: 'OFAC' },
  { n: 'netex', nafn: 'NETEX24', listar: 'OFAC' },
  // gervifærslur — normaliseringin bjó til eins-orðs nafn úr fjöl-orða nafni
  { n: 'omega', nafn: 'полковник Omega', listar: 'ESB' },
  { n: 'department', nafn: 'Department 140/16', listar: 'ESB,OFAC' },
  { n: 'navis', nafn: 'NAVIS 6', listar: 'OFAC' },
  { n: 'kani', nafn: 'бригада Kani', listar: 'ESB' },
];
const VT = byggjaVisitolu(NAMES);

test('sancNorm: lágstafar, fjarlægir broddstafi, heldur ð/þ/æ', () => {
  assert.equal(sancNorm('Þórður Ævarsson'), 'þorður ævarsson');
  assert.equal(sancNorm('  Al-Qaida  '), 'al qaida');
  assert.equal(sancNorm(null), '');
});

test('sterka lagið: fjöl-orða lyklun óbreytt (fyrsta|síðasta)', () => {
  // vísitalan er fjölgild frá 2026-08-01 — fylki per lykli, ekki stök færsla
  assert.equal(VT.sterk.get('saddam|tikriti')[0].nafn, 'Saddam Hussein Al-Tikriti');
  const m = skima(VT, 'Saddam Hussein Al-Tikriti');
  assert.equal(m.flokkur, 'sterk');
  assert.equal(m.listar, 'ESB,SÞ,OFAC');
});

test('sterka lagið heldur millinafna-frjálsri lyklun', () => {
  // fyrsta+síðasta ræður — millinöfn skipta ekki máli (núverandi hegðun)
  assert.equal(skima(VT, 'Saddam Al Tikriti').flokkur, 'sterk');
});

test('veika lagið: raunveruleg eins-orðs nöfn finnast', () => {
  for (const [q, listi] of [['Hamas', 'Hamas'], ['PKK', 'PKK'], ['PIJ', 'PIJ'], ['Rosneft', 'ROSNEFT']]) {
    const m = skima(VT, q);
    assert.ok(m, q + ' átti að finnast');
    assert.equal(m.flokkur, 'veik');
    assert.equal(m.listi, listi);
  }
});

test('VÖRN: eins-orðs samsvörun er ALDREI sterk', () => {
  // Þetta er prófið sem ver söluvöruna — Nova hf. má aldrei verða krítísk.
  const m = skima(VT, 'Nova');
  assert.equal(m.flokkur, 'veik');
  assert.equal(VT.sterk.size, 1, 'aðeins fjöl-orða færslan á heima í sterku vísitölunni');
});

test('VÖRN: normaliserunar-gervifærslur komast ekki í veiku vísitöluna', () => {
  for (const t of ['omega', 'department', 'navis', 'kani']) {
    assert.equal(VT.veik.has(t), false, t + ' er gervifærsla og á ekki heima í vísitölunni');
  }
  assert.equal(skima(VT, 'Omega'), null);
  assert.equal(skima(VT, 'Kani'), null);
});

test('VÖRN: fyrirspurn verður að vera stafrétt sama nafn og færslan', () => {
  assert.equal(skima(VT, 'SSL25'), null, '"SSL25" má ekki styttast í "ssl" og samsvara SSL');
  assert.equal(skima(VT, 'Maia'), null, '"Maia" má ekki samsvara "MAIA-1"');
  assert.equal(skima(VT, 'Netex'), null, '"Netex" má ekki samsvara "NETEX24"');
  assert.equal(skima(VT, 'Hamas.').flokkur, 'veik', 'greinarmerki eitt og sér má ekki fella samsvörun');
});

test('stafrétt fyrirspurn með tölu-viðskeyti samsvarar sinni færslu', () => {
  // Öfuga hliðin á vörninni: færslan má ekki verða ófinnanleg með SÍNU EIGIN nafni.
  assert.equal(skima(VT, 'MAIA-1').listi, 'MAIA-1');
  assert.equal(skima(VT, 'NETEX24').listi, 'NETEX24');
});

test('alnum (um skima): há-/lágstafir, broddstafir og greinarmerki hunsuð — en ð/þ/æ varðveitast', () => {
  // alnum er óflutt (unexported) hjálparfall — sjá regex-samræmingu 31.7.2026 (alnum skrifaði
  // broddstafa-bilið á annan hátt en sancNorm; hér er lykillinn 'þorðarbær' HANDSKRIFAÐUR
  // (ekki reiknaður með sancNorm/alnum sjálfum), svo prófið grípi raunverulega stökkbreytingu
  // í hvorri fallinu sem er — nafnið ber öll þrjú séríslensku stafina (ð/þ/æ) auk broddstafs.
  const vt = byggjaVisitolu([{ n: 'þorðarbær', nafn: 'Þórðarbær', listar: 'ESB' }]);
  for (const q of ['Þórðarbær', 'ÞÓRÐARBÆR', 'þórðarbær.', 'þorðarbær']) {
    const m = skima(vt, q);
    assert.ok(m, q + ' átti að samsvara Þórðarbær');
    assert.equal(m.flokkur, 'veik');
    assert.equal(m.listi, 'Þórðarbær');
  }
  // ef æ félli brott í normaliseringunni (í stað þess að varðveitast) yrði "þorðarbr"
  // sama tóken og lykillinn — staðfestum að svo er EKKI: séríslensku stafirnir eru
  // merkingarbærir stafir í samanburðinum, ekki skraut sem hverfur.
  assert.equal(skima(vt, 'þorðarbr'), null, 'orð sem vantar æ er annað orð — á ekki að samsvara');
});

test('hver færsla í veiku vísitölunni samsvarar sínu eigin birtingarnafni', () => {
  for (const [, gildi] of VT.veik) {
    const m = skima(VT, gildi.nafn);
    assert.ok(m, gildi.nafn + ' fann ekki sjálfa sig');
    assert.equal(m.listi, gildi.nafn);
  }
});

test('krossuppfletting er ekki leyfð', () => {
  assert.equal(skima(VT, 'Hamas Hamas'), null, 'fjöl-orða fyrirspurn nær ekki í veiku vísitöluna');
  assert.equal(skima(VT, 'Saddam'), null, 'eins-orðs fyrirspurn nær ekki í sterku vísitöluna');
});

test('jaðartilvik: tómt, rusl, gölluð gögn', () => {
  assert.equal(skima(VT, ''), null);
  assert.equal(skima(VT, '123 456'), null, 'normaliserast í tóman streng — engin tóken');
  assert.equal(skima(VT, 'Zzz Qqq'), null, 'tvö tóken sem hvergi finnast → sterka leiðin skilar null');
  assert.equal(skima(VT, null), null);
  const tom = byggjaVisitolu(null);
  assert.equal(tom.sterk.size, 0);
  assert.equal(tom.veik.size, 0);
  assert.equal(skima(tom, 'Hamas'), null);
});

test('fyrsta færsla vinnur við árekstur — bæði lögin', () => {
  const vt = byggjaVisitolu([
    { n: 'alfa', nafn: 'Alfa', listar: 'ESB' },
    { n: 'alfa', nafn: 'ALFA', listar: 'OFAC' },
    { n: 'jon jonsson', nafn: 'Jón Jónsson', listar: 'ESB' },
    { n: 'jon jonsson', nafn: 'Jon Jonsson', listar: 'OFAC' },
  ]);
  assert.equal(vt.veik.get('alfa').listar, 'ESB', 'veika lagið heldur fyrsta-vinnur reglunni');
  // Sterka lagið hendir ENGU lengur (spec 2026-08-01) — báðar færslurnar varðveitast.
  assert.equal(vt.sterk.get('jon|jonsson').length, 2);
  // Séu frambjóðendur jafngóðir vinnur sá fyrsti, svo birt niðurstaða helst óbreytt.
  assert.equal(skima(vt, 'Jón Jónsson').listar, 'ESB');
});

// flokkaNofn — sameiginlega leiðin sem sanctionsHandler og kycScreenKt (worker/veitur.mjs)
// kalla nú bæði á, í stað þess að afrita flokkunar-lúkkuna hvor í sínu lagi (Viðauki A,
// 2026-07-31). Þetta er nákvæmlega lúkkan sem stökkbreytingarprófið á Task 3 sýndi að var
// óvarin: að sameina bæði lögin í "sterkar" lét öll 336 eldri prófin standast.

test('flokkaNofn: sterk samsvörun lendir í sterkar, aldrei í veikar', () => {
  const { sterkar, veikar } = flokkaNofn(VT, ['Saddam Hussein Al-Tikriti']);
  assert.equal(sterkar.length, 1);
  assert.equal(veikar.length, 0);
  assert.deepEqual(sterkar[0], { nafn: 'Saddam Hussein Al-Tikriti', listi: 'Saddam Hussein Al-Tikriti', listar: 'ESB,SÞ,OFAC', tegund: 'fjolords' });
});

test('flokkaNofn: veik samsvörun lendir í veikar, aldrei í sterkar', () => {
  const { sterkar, veikar } = flokkaNofn(VT, ['Hamas']);
  assert.equal(veikar.length, 1);
  assert.equal(sterkar.length, 0);
  assert.deepEqual(veikar[0], { nafn: 'Hamas', listi: 'Hamas', listar: 'ESB,OFAC', tegund: 'einsords' });
});

test('flokkaNofn: bæði lögin í einu kalli — hvort lendir á sínum stað, engin lekur yfir', () => {
  const { sterkar, veikar } = flokkaNofn(VT, ['Saddam Hussein Al-Tikriti', 'Hamas', 'Rosneft']);
  assert.equal(sterkar.length, 1, 'aðeins fjöl-orða nafnið á heima í sterkar');
  assert.equal(veikar.length, 2, 'bæði eins-orðs nöfnin eiga heima í veikar');
  assert.ok(!sterkar.some((x) => x.nafn === 'Hamas' || x.nafn === 'Rosneft'), 'VÖRN: veik samsvörun má ALDREI leka í sterkar');
  assert.ok(!veikar.some((x) => x.nafn === 'Saddam Hussein Al-Tikriti'), 'sterk samsvörun á ekki heima í veikar');
});

test('flokkaNofn: dedup:true fellir saman endurtekningar — sjálfgefið heldur þeim öllum', () => {
  const nofn = ['Hamas', 'Hamas', 'Saddam Hussein Al-Tikriti', 'Saddam Hussein Al-Tikriti'];
  const an = flokkaNofn(VT, nofn);
  assert.equal(an.veikar.length, 2, 'sjálfgefið (dedup=false) heldur báðum Hamas-endurtekningunum');
  assert.equal(an.sterkar.length, 2, 'sjálfgefið heldur báðum Saddam-endurtekningunum');
  const dd = flokkaNofn(VT, nofn, { dedup: true });
  assert.equal(dd.veikar.length, 1, 'dedup:true fellir Hamas-endurtekninguna saman');
  assert.equal(dd.sterkar.length, 1, 'dedup:true fellir Saddam-endurtekninguna saman');
});

test('flokkaNofn: færslu-lögunin er { nafn, listi, listar } og nafn er upprunalegi kallstrengurinn', () => {
  const { veikar } = flokkaNofn(VT, ['HAMAS']);
  assert.equal(veikar.length, 1);
  assert.deepEqual(Object.keys(veikar[0]).sort(), ['listar', 'listi', 'nafn', 'tegund']);
  assert.equal(veikar[0].nafn, 'HAMAS', 'nafn á að vera kallstrengurinn nákvæmlega eins og hann kom inn, ekki normaliseraður');
  assert.equal(veikar[0].listi, 'Hamas', 'listi er birtingarnafn skráarfærslunnar, ekki kallstrengurinn');
});

test('flokkaNofn: tómt/null nofn skilar tveimur tómum fylkjum', () => {
  assert.deepEqual(flokkaNofn(VT, []), { sterkar: [], veikar: [] });
  assert.deepEqual(flokkaNofn(VT, null), { sterkar: [], veikar: [] });
});

// skimunarNidurstada — lögunin sem kycScreenKt (worker/veitur.mjs) setur beint í
// sanctions-sviðið (Viðauki A2, 2026-07-31). Áður voru þessar tvær .map-línur óprófanlegt
// glue inni í kycScreenKt sjálfu; stökkbreyting sem sameinaði lögin þar lét öll 342 prófin
// standast. Þetta er prófið sem á að grípa þá stökkbreytingu núna, á einum stað.

test('skimunarNidurstada: sterk samsvörun lendir í hits sem { name }, aldrei í veikar', () => {
  const { hits, veikar } = skimunarNidurstada(VT, ['Saddam Hussein Al-Tikriti']);
  assert.deepEqual(hits, [{ name: 'Saddam Hussein Al-Tikriti' }]);
  assert.equal(veikar.length, 0, 'VÖRN: sterk samsvörun má ALDREI leka í veikar');
});

test('skimunarNidurstada: veik samsvörun lendir í veikar sem { name, listi, listar }, aldrei í hits', () => {
  const { hits, veikar } = skimunarNidurstada(VT, ['Hamas']);
  assert.equal(hits.length, 0, 'VÖRN: veik samsvörun má ALDREI leka í hits (critical-atburður, Há-áhætta, póstur)');
  assert.deepEqual(veikar, [{ name: 'Hamas', listi: 'Hamas', listar: 'ESB,OFAC', tegund: 'einsords' }]);
});

test('skimunarNidurstada: bæði lögin í einu kalli — hvort í sínu sviði, engin lekur yfir', () => {
  const { hits, veikar } = skimunarNidurstada(VT, ['Saddam Hussein Al-Tikriti', 'Hamas', 'Rosneft']);
  assert.equal(hits.length, 1, 'aðeins fjöl-orða nafnið á heima í hits');
  assert.equal(veikar.length, 2, 'bæði eins-orðs nöfnin eiga heima í veikar');
  assert.ok(!hits.some((x) => x.name === 'Hamas' || x.name === 'Rosneft'), 'VÖRN: veik samsvörun má ALDREI leka í hits');
  assert.ok(!veikar.some((x) => x.name === 'Saddam Hussein Al-Tikriti'), 'sterk samsvörun á ekki heima í veikar');
});

test('skimunarNidurstada: engin samruni á endurtekningum — kycScreenKt-leiðin dedup-ar aldrei', () => {
  const nofn = ['Hamas', 'Hamas', 'Saddam Hussein Al-Tikriti', 'Saddam Hussein Al-Tikriti'];
  const { hits, veikar } = skimunarNidurstada(VT, nofn);
  assert.equal(veikar.length, 2, 'báðar Hamas-endurtekningarnar eiga að haldast (dedup:false)');
  assert.equal(hits.length, 2, 'báðar Saddam-endurtekningarnar eiga að haldast (dedup:false)');
});

test('skimunarNidurstada: tómt/null nofn skilar tveimur tómum fylkjum', () => {
  assert.deepEqual(skimunarNidurstada(VT, []), { hits: [], veikar: [] });
  assert.deepEqual(skimunarNidurstada(VT, null), { hits: [], veikar: [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// SAMRÆMIS-PRÓFIÐ Á STERKA LAGINU (spec 2026-08-01)
//
// Sterki lykillinn er 'fyrsta|síðasta' og hunsar allt þar á milli. Mæling 1.8.2026
// á 6.803 raun-íslenskum nöfnum gaf 3 sterkar samsvaranir — allar 3 falskar.
// samraemi() ákveður hvort samsvörunin er efnislega samrýmanleg; sé hún það ekki
// er hún LÆKKUÐ í veika lagið (tegund:'jadar'), ekki hent.
// ─────────────────────────────────────────────────────────────────────────────

// Raunveruleg sýnishorn — þau þrjú sem mælingin fann, auk árekstra-lykils.
const NAMES2 = [
  // falsjákvæðurnar þrjár úr mælingunni
  { n: 'the niru battery company', nafn: 'The Niru Battery Company', listar: 'ESB,OFAC' },
  { n: 'alejandra salazar hernandez', nafn: 'Alejandra SALAZAR HERNANDEZ', listar: 'OFAC' },
  { n: 'the earth eye co', nafn: 'THE EARTH EYE CO', listar: 'OFAC' },
  // umritunar-tilfelli: mið-tóken með 1 stafs mun
  { n: 'mohammad abdul rahman', nafn: 'Mohammad Abdul Rahman', listar: 'OFAC' },
  // árekstra-lykill 'joint|plant' — tvær AÐGREINDAR færslur undir sama lykli.
  // Í dag heldur byggjaVisitolu aðeins þeirri fyrstu; 9.728 færslur (16,5%) falla
  // þannig í skuggann og worker birtir nafn ANNARS aðila sem samsvörunina.
  { n: 'joint stock company alpha plant', nafn: 'JSC Alpha Plant', listar: 'ESB' },
  { n: 'joint stock company beta plant', nafn: 'JSC Beta Plant', listar: 'OFAC' },
];
const VT2 = byggjaVisitolu(NAMES2);

test('samraemi: eins tóken-runa → nakvaemt', () => {
  assert.equal(samraemi(['a', 'b', 'c'], ['a', 'b', 'c']), 'nakvaemt');
});

test('samraemi: sleppt/aukið millinafn → innihald', () => {
  assert.equal(samraemi(['jon', 'jonsson'], ['jon', 'gunnar', 'jonsson']), 'innihald');
  assert.equal(samraemi(['jon', 'gunnar', 'jonsson'], ['jon', 'jonsson']), 'innihald');
});

test('samraemi: víxluð millinöfn → innihald (mengja-samanburður, ekki röð-heldur)', () => {
  assert.equal(samraemi(['a', 'x', 'y', 'z'], ['a', 'y', 'x', 'z']), 'innihald');
});

test('samraemi: umritað mið-tóken (lev<=2) → namunda', () => {
  assert.equal(samraemi(['mohammad', 'abdel', 'rahman'], ['mohammad', 'abdul', 'rahman']), 'namunda');
});

test('samraemi: ótengd mið-tóken → null (lækkun)', () => {
  assert.equal(samraemi(['the', 'basic', 'cookbook', 'company'], ['the', 'niru', 'battery', 'company']), null);
  assert.equal(samraemi(['mohammad', 'reza', 'rahman'], ['mohammad', 'abdul', 'rahman']), null);
});

test('mældu falsjákvæðurnar þrjár LÆKKA í veika lagið', () => {
  for (const q of ['The Basic Cookbook Company', 'Alejandra Gabriela Soto Hernandez', 'The Iceland Tour Co. / Tour Co.']) {
    const m = skima(VT2, q);
    assert.ok(m, q + ' á enn að finnast — engu er hent');
    assert.equal(m.flokkur, 'veik', q + ' má ALDREI vera sterk (critical, Há-áhætta, póstur, E-þak)');
    assert.equal(m.tegund, 'jadar');
  }
});

test('raunhæf nafna-afbrigði haldast STERK — engin endurheimtar-fórn', () => {
  // sleppt millinafn, aukið millinafn, víxluð röð, umritun
  for (const q of ['Joint Company Alpha Plant', 'Joint Stock Trading Company Alpha Plant',
    'Joint Company Stock Alpha Plant', 'Mohammad Abdel Rahman']) {
    const m = skima(VT2, q);
    assert.ok(m, q + ' átti að finnast');
    assert.equal(m.flokkur, 'sterk', q + ' á að haldast sterk');
  }
});

test('EIGNUN: fjöl-færslu lykill skilar RÉTTA aðilanum, ekki þeim fyrsta', () => {
  // Báðar færslurnar liggja undir 'joint|plant'. Fyrirspurnin er stafrétt seinni færslan.
  const m = skima(VT2, 'Joint Stock Company Beta Plant');
  assert.equal(m.flokkur, 'sterk');
  assert.equal(m.listi, 'JSC Beta Plant', 'á að birta þann aðila sem raunverulega passar');
  assert.equal(m.listar, 'OFAC', 'listarnir eiga að fylgja RÉTTU færslunni');
});

test('vísitalan heldur ÖLLUM færslum undir sama lykli (9.728 földu færslurnar)', () => {
  assert.equal(VT2.sterk.get('joint|plant').length, 2, 'báðar færslurnar eiga að varðveitast');
});

test('VÖRN: lækkuð samsvörun (jadar) lendir í veikar — ALDREI í hits', () => {
  const { hits, veikar } = skimunarNidurstada(VT2, ['The Basic Cookbook Company']);
  assert.equal(hits.length, 0, 'VÖRN: jadar má ALDREI drífa critical-atburð/póst/E-þak');
  assert.equal(veikar.length, 1);
  assert.equal(veikar[0].name, 'The Basic Cookbook Company');
});

test('VÖRN: flokkaNofn setur jadar í veikar, aldrei í sterkar', () => {
  const { sterkar, veikar } = flokkaNofn(VT2, ['The Basic Cookbook Company']);
  assert.equal(sterkar.length, 0);
  assert.equal(veikar.length, 1);
});

test('tegund fylgir hverri samsvörun svo F9 geti birt rétt orðalag', () => {
  assert.equal(skima(VT2, 'Joint Stock Company Beta Plant').tegund, 'fjolords');
  assert.equal(skima(VT2, 'The Basic Cookbook Company').tegund, 'jadar');
  assert.equal(skima(VT, 'Hamas').tegund, 'einsords');
});
