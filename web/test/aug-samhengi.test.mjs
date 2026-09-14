import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AUG, AUG_MAX, augScore } from '../worker.js';

// Þetta próf er BEIN VIÐBRÖGÐ við raunvillu (13.9.2026): FASTEIGNIR-línan í fasta samhengispakkanum
// leitaði að reitum (medM2/med/v) sem eru EKKI til í fasteignir.json — mánaðarfærslan er
// {m, hbsv, land}. Niðurstaðan var `undefined`, línan var sleppt ÞÖGULT, og Spyrðu Karp hafði enga
// fasteignatölu svo mánuðum skipti án þess að nokkuð brygðist. Ekkert próf gat gripið það af því
// enginn keyrði fn-in gegn raunverulegu gögnunum.
//
// Vörnin: fyrir HVERJA AUG-færslu, lestu skrána sem hún les í raun og keyrðu fn. Bregðist hún eða
// skili engu er það skema-rek — nákvæmlega bilunin sem er annars ósýnileg. Prófið þarf því engan
// lista yfir væntanleg gildi; það staðfestir aðeins að leiðin frá skrá til texta sé heil.

const gogn = (f) => JSON.parse(readFileSync(new URL('../public/gogn/' + f, import.meta.url), 'utf8'));

// Spurning sem kveikir örugglega á færslunni — fyrsta bókstafa-runan úr regexinu dugar.
const kveikja = (rx) => {
  const m = String(rx.source).match(/[a-záðéíóúýþæö]{5,}/i);
  return m ? 'hvað með ' + m[0] + '?' : 'hvað?';
};

test('AUG: hver færsla les skrá sem er til og skilar texta', () => {
  const tom = [];
  for (const a of AUG) {
    let j;
    assert.doesNotThrow(() => { j = gogn(a.file); }, 'gagnaskrá vantar: ' + a.file);
    let t;
    assert.doesNotThrow(() => { t = a.fn(j, kveikja(a.rx)); }, 'fn kastaði fyrir ' + a.file);
    if (!t || !String(t).trim()) tom.push(a.file);
  }
  assert.deepEqual(tom, [], 'AUG-færslur sem skiluðu TÓMU (skema-rek — sbr. FASTEIGNIR-villuna): ' + tom.join(', '));
});

test('AUG: engin færsla skilar „undefined"/„NaN" inni í textanum', () => {
  // Hin hliðin á sömu villu: reitur sem vantar skilar ekki alltaf tómu — hann lekur oft inn sem
  // strengurinn „undefined" eða „NaN" og módelið ber það fram sem staðreynd.
  const sodd = [];
  for (const a of AUG) {
    const t = String(a.fn(gogn(a.file), kveikja(a.rx)) || '');
    if (/undefined|NaN|\[object Object\]/.test(t)) sodd.push(a.file + ': ' + t.slice(0, 90));
  }
  assert.deepEqual(sodd, []);
});

// Raunverulegar spurningar → færslan sem á að vinna. Þetta er verðmætara en að prófa regexið gegn
// streng sem er dreginn úr regexinu sjálfu (hringur sem sannar ekkert): hér er skjalfest HVAÐ hver
// færsla er fyrir, og röðunin prófuð á orðalagi sem fólk notar í raun.
const SPURNINGAR = [
  ['hver er hagvöxturinn?', 'hagvoxtur.json'],
  ['hvað hefur launavísitalan hækkað?', 'vinnumarkadur.json'],
  ['hvað búa margir á Íslandi?', 'mannfjoldi.json'],
  ['er skortur á lyfjum?', 'lyf_index.json'],
  ['hver vann útboðið hjá Landspítalanum?', 'utbod_urslit.json'],
  ['hver er framlegðin í sjávarútvegi?', 'sector_kpi.json'],
  ['hvað flytjum við mest út?', 'vidskipti.json'],
  ['hvernig kaus Kristrún Frostadóttir?', 'atkvaedi.json'],
  ['hvaða fjölmiðill er hlutdrægastur?', 'midlavog.json'],
  ['hver er þyngsti liðurinn í vísitölu neysluverðs?', 'verdlag.json'],
  // AUG-lota 2 (14.9)
  ['hvað eru margir með háskólamenntun?', 'menntun.json'],
  ['hvað komu margir ferðamenn?', 'audlindir.json'],
  ['hvaða reglugerðir voru birtar nýlega?', 'stjornartidindi.json'],
  ['hver er formaður fjárlaganefndar?', 'nefndir.json'],
  ['hvar rekur Ísland sendiráð?', 'sendirad.json'],
  ['hversu margir rafbílar eru á Íslandi?', 'rafbilar.json'],
  ['hvað fóru margir farþegar um Keflavíkurflugvöll?', 'umferd.json'],
  ['hvað hefur hækkað mest síðan 2000?', 'furduhagfraedi.json'],
  ['hver talaði um fjárlögin?', 'raedur_nylegar.json'],
  // Sveitarfélaga-fjárhagur: NAFNGREINT sveitarfélag — orðalagið sem féll ígegn í fyrstu atrennu
  ['hvað skuldar Kópavogsbær á hvern íbúa?', 'sveitarfelog_fin.json'],
  ['hvernig stendur Reykjavíkurborg fjárhagslega?', 'sveitarfelog_fin.json'],
  ['hvaða sveitarfélög eru skuldsettust?', 'sveitarfelog_fin.json'],
  // Eldri færslur — vörn gegn því að nýju regexin steli spurningum frá þeim.
  ['hverjir eru stýrivextirnir?', 'sedlabanki.json'],
  ['hvert er atvinnuleysið?', 'atvinnuleysi.json'],
  ['hvað kostar fermetrinn í Reykjavík?', 'fasteignir.json'],
];

test('raunspurningar rata á rétta færslu', () => {
  const rangt = [];
  for (const [q, vaentur] of SPURNINGAR) {
    const rod = AUG.map((a, i) => ({ f: a.file, i, s: augScore(a.rx, q) })).filter((x) => x.s > 0)
      .sort((x, y) => (y.s - x.s) || (x.i - y.i));
    if (!rod.length || rod[0].f !== vaentur) rangt.push(q + ' → ' + (rod[0] ? rod[0].f : 'ENGIN') + ' (vænt: ' + vaentur + ')');
  }
  assert.deepEqual(rangt, []);
});

test('raunspurningar: rétta færslan kemst innan þaksins og skilar texta', () => {
  for (const [q, vaentur] of SPURNINGAR) {
    const topp = AUG.map((a, i) => ({ a, i, s: augScore(a.rx, q) })).filter((x) => x.s > 0)
      .sort((x, y) => (y.s - x.s) || (x.i - y.i)).slice(0, AUG_MAX);
    assert.ok(topp.some((x) => x.a.file === vaentur), 'datt út fyrir þakið: ' + q);
    const vald = topp.find((x) => x.a.file === vaentur);
    const t = vald.a.fn(gogn(vaentur), q);
    assert.ok(t && String(t).trim().length > 20, 'tómt/of stutt svar við „' + q + '"');
  }
});

test('AUG: hver færsla hefur síðu og skráarnafn', () => {
  for (const a of AUG) {
    assert.ok(a.pg && a.pg.startsWith('/') && a.pg.endsWith('/'), 'ógild síða: ' + a.file + ' → ' + a.pg);
    assert.ok(a.file && a.file.endsWith('.json'), 'ógilt skráarnafn: ' + a.file);
  }
});

// ── Skorun og þak ────────────────────────────────────────────────────────────
test('augScore: löng/margendurtekin samsvörun skorar hærra en stutt', () => {
  const langt = augScore(/atvinnuleys/i, 'hvert er atvinnuleysið?');
  const stutt = augScore(/\bvlf\b/i, 'hvert er atvinnuleysið?');
  assert.ok(langt > 0 && stutt === 0);
  assert.ok(augScore(/laun/i, 'laun og laun og laun') > augScore(/laun/i, 'laun einu sinni'));
});

test('augScore: engin samsvörun = 0 (færslan er síuð burt áður en gögn eru sótt)', () => {
  assert.equal(augScore(/hagvöxt/i, 'hvað kostar Kvótavaktin?'), 0);
});

test('augScore: núll-lengdar samsvörun frýs ekki (lastIndex-gildran)', () => {
  // /x*/g getur samsvarað tómum streng að eilífu ef lastIndex er ekki fært áfram.
  assert.equal(typeof augScore(/a*/i, 'bbb'), 'number');
});

test('AUG_MAX er 5 og fylkið er stærra en þakið (röðun skiptir því máli)', () => {
  assert.equal(AUG_MAX, 5);
  assert.ok(AUG.length > AUG_MAX);
});

test('röðun: sérhæfðari færsla vinnur almennari við sömu spurningu', () => {
  // „launavísitalan" á að draga vinnumarkadur fram fyrir almennu seðlabanka-færsluna.
  const q = 'hvað hefur launavísitalan hækkað?';
  const rod = AUG.map((a, i) => ({ file: a.file, i, s: augScore(a.rx, q) })).filter((x) => x.s > 0)
    .sort((x, y) => (y.s - x.s) || (x.i - y.i));
  assert.ok(rod.length, 'engin færsla kveikti');
  assert.equal(rod[0].file, 'vinnumarkadur.json');
});

test('röðun er stöðug: jafntefli heldur upphaflegri röð', () => {
  const q = 'hvað með laun og hagvöxt og verðbólgu og útflutning og lyf og útboð?';
  const keyra = () => AUG.map((a, i) => ({ f: a.file, i, s: augScore(a.rx, q) })).filter((x) => x.s > 0)
    .sort((x, y) => (y.s - x.s) || (x.i - y.i)).slice(0, AUG_MAX).map((x) => x.f);
  assert.deepEqual(keyra(), keyra());
});

// ── Tölusnið (íslenskt — workerd-ICU má ekki lauma enskum aðskiljurum inn) ────
test('AUG-textar nota íslenska kommu, ekki enskan aukastafapunkt', () => {
  // Á íslensku er PUNKTUR þúsundaaðskiljari. „kaup 115.164" las því sem 115 þúsund þegar átt var
  // við 115,16 — sniðvilla sem skeikar þremur stærðargráðum, ekki bara útliti.
  // Greiningin: þúsundahópur er ALLTAF nákvæmlega 3 tölustafir („1.409"), aukastafur er 1–2
  // („74.4", „2539.97"). Þess vegna \d\.\d{1,2}(?!\d) — annars flagga réttar tölur sem villur.
  const sodd = [];
  for (const a of AUG) {
    const t = String(a.fn(gogn(a.file), kveikja(a.rx)) || '');
    const m = t.match(/\d\.\d{1,2}(?!\d)/g);
    if (m) sodd.push(a.file + ': ' + m.join(', ') + ' — „' + t.slice(0, 80) + '"');
  }
  assert.deepEqual(sodd, []);
});

test('leiga: AUG-lagið og fasti pakkinn segja EKKI sitt hvað um líðandi leiguverð', () => {
  // Lögin tvö berast í SÖMU hvatningu. Segi annað 3.086 kr/m² og hitt 3.960 velur módelið — og
  // það er nákvæmlega áreksturinn sem stýrivaxta-lagfæringin snerist um. Bæði nota nú `nu`.
  const j = gogn('leiga.json');
  const t = String(AUG.find((a) => a.file === 'leiga.json').fn(j, 'hvað er leiguverðið?'));
  assert.ok(j.nu && j.nu.medM2, 'leiga.json hefur ekki lengur `nu` — AUG-færslan fellur þá á `latest`');
  assert.ok(t.includes(String(j.nu.medM2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')), 'AUG birtir ekki framreiknuðu töluna');
  assert.ok(/EKKI bein mæling|framreikn/i.test(t), 'framreikningurinn er ekki merktur sem slíkur');
});

// ── Síðukort fasta samhengispakkans ──────────────────────────────────────────
// Kortið er eina leiðin sem módelið hefur til að vita hvað er til á vefnum þegar engin AUG-kveikja
// grípur. Það var 26 síður af 114, og afleiðingin var ekki bara fátækleg vísun heldur RÖNG NEITUN:
// „Hvað kostar Parkódín?" fékk svarið „Karp fjallar um íslensk hagvísi, ekki lyfjaverð" þótt /lyf/
// geymi 3.040 lyf með verði. Dauð slóð í kortinu er sama tegund villu á hinn veginn — Karp sendir
// fólk á 404. Prófið ver hvort tveggja: hver slóð verður að eiga síðu í repo-inu.
test('síðukort: hver slóð á sér raunverulega síðu', () => {
  const ctx = JSON.parse(readFileSync(new URL('../public/gogn/spyrdu_context.json', import.meta.url), 'utf8'));
  const slodir = String(ctx.pages || '').split('\n').filter(Boolean).map((l) => l.split(' — ')[0]);
  assert.ok(slodir.length >= 50, 'kortið er óvænt rýrt: ' + slodir.length + ' síður');
  const rot = new URL('../src/pages/', import.meta.url);
  const daudar = slodir.filter((u) => {
    const s = u.replace(/^\/|\/$/g, '');
    return !existsSync(new URL(s + '.astro', rot)) && !existsSync(new URL(s + '/index.astro', rot)) && !existsSync(new URL(s, rot));
  });
  assert.deepEqual(daudar, [], 'slóðir í síðukortinu sem eiga enga síðu (Karp vísar á 404)');
});

test('síðukort: engar tvíteknar slóðir', () => {
  const ctx = JSON.parse(readFileSync(new URL('../public/gogn/spyrdu_context.json', import.meta.url), 'utf8'));
  const slodir = String(ctx.pages || '').split('\n').filter(Boolean).map((l) => l.split(' — ')[0]);
  const tvi = slodir.filter((u, i) => slodir.indexOf(u) !== i);
  assert.deepEqual([...new Set(tvi)], []);
});

// ── Vísun á fyrirtækjaskýrsluna (sölurás, ekki auglýsing) ────────────────────
// firmaLookup þarf lifandi veitur og verður ekki keyrt hér; prófum textann sem er fastur í
// einingunni. Tvennt má ekki reka: orðalagið um lánshæfi, og að vísunin sé klippt af slice().
test('vísunin lofar ekki formlegu lánshæfismati', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  const i = src.indexOf('const visun =');
  assert.ok(i > 0, 'vísunin fannst ekki í worker.js');
  const blokk = src.slice(i, i + 900);
  assert.match(blokk, /lánshæfisvísbending/, 'á að segja „lánshæfisvísbending"');
  assert.match(blokk, /ekki formlegt lánshæfismat/, 'fyrirvarinn verður að fylgja');
  // /fyrirtaeki/ segir sjálf að einkunnin sé EKKI formlegt lánshæfismat — sölutextinn má ekki
  // segja annað. Leyfum orðið aðeins innan fyrirvarans.
  const utanFyrirvara = blokk.replace(/ekki formlegt lánshæfismat/g, '');
  assert.equal(/lánshæfismat/.test(utanFyrirvara), false, '„lánshæfismat" utan fyrirvarans');
});

test('vísunin ber ekki verð — það á eina uppsprettu í KB-inu', () => {
  // Tvær verðskrár í sama svari verða ósamstiga við fyrstu verðbreytingu.
  const { AUG } = { AUG: null };   // (ekki notað — lesum skrána beint)
  const src = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  const i = src.indexOf('const visun =');
  const blokk = src.slice(i, i + 900);
  assert.equal(/\d{3,}\s*kr|990|1\.900|3\.900|9\.900/.test(blokk), false, 'verð á ekki að standa í vísuninni');
});

test('vísunin er bætt við EFTIR slice — má ekki ýta staðreyndum út', () => {
  const src = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  assert.match(src, /\.slice\(0, 1800\) \+ ' \(sjá \/fyrirtaeki\/\)' \+ visun/,
    'vísunin verður að koma á eftir slice(), ekki inni í bits');
});
