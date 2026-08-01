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
    assert.deepEqual(Object.keys(t).sort(), ['byggd', 'fiskur', 'losun', 'menntun', 'taknmyndir']);
    for (const k of ['byggd', 'menntun', 'fiskur', 'losun']) {
      assert.ok(Number.isInteger(t[k]) && t[k] >= 0 && t[k] <= 3, `${k} er heiltölu-þrep 0-3`);
    }
    assert.ok(Array.isArray(t.taknmyndir));
    assert.equal(t.taknmyndir.length, 0);
  }
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
