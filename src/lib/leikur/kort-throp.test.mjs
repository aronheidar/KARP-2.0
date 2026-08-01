// kort-throp.test.mjs — próf fyrir vörpunareininguna kort-throp.mjs og SVG-teiknarann kort-svg.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kortThrep } from './kort-throp.mjs';
import { renderIslandKort } from './kort-svg.mjs';

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
    assert.deepEqual(Object.keys(t).sort(), ['atvik', 'byggd', 'fiskur', 'ljos', 'losun', 'menntun', 'taknmyndir']);
    for (const k of ['byggd', 'menntun', 'fiskur', 'losun', 'ljos']) {
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
