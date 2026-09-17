// Þögul nótt á móti rólegri nótt — vörn gegn grænum keyrslum sem gerðu ekki neitt.
//
// 17.9.2026: næturkráðið á tengslagrunninum skrifaði NÚLL. Það slökkti á sér sjálft („3 samfelldar
// proxy-bilanir", „5 samfelldar skatturinn.is-bilanir"), prentaði sundurliðunina og hætti. Keyrslan
// var samt GRÆN og enginn hefði nokkurn tíma séð að grunnurinn hætti að stækka. Orsökin var að
// RSK-áskriftin fór að skila 403 og proxy-leiðin, sem er eina virka leiðin úr GitHub Actions
// (RSK ber fram tóma síðu fyrir gagnaversvistföng), datt út með henni.
//
// ⚠⚠ ERFIÐI HLUTINN ER GREINARMUNURINN. Nótt sem skrifar núll af því ekkert var á dagskrá er
// EÐLILEG og má ALDREI falla — annars venst maður rauðu og hættir að lesa. Nótt sem skrifar núll
// af því allt féll er BILUN. Munurinn liggur eingöngu í því hvort merki um kerfisbundna bilun
// fylgja núllinu, og prófin hér negla einmitt þau mörk.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaNott } from './nott_heilsa.mjs';

const GRUNNUR = { ok: 0, errs: 0, discovered: 0, sweepFound: 0, villur: {}, proxyDautt: false, scrapeStop: false };

test('róleg nótt — ekkert á dagskrá, engin bilunarmerki → ÞEGJANDI í lagi', () => {
  const r = metaNott(GRUNNUR);
  assert.equal(r.thogul, false);
  assert.equal(r.astaeda, null);
});

test('raunveruleg nótt 17.9.2026 — núll skrifað OG báðir varnarrofar sprungnir → BILUN', () => {
  const r = metaNott({
    ...GRUNNUR,
    villur: { 'proxy:200-ognothaeft': 3, 'beint:200-ognothaeft': 5 },
    proxyDautt: true, scrapeStop: true,
  });
  assert.equal(r.thogul, true);
  assert.ok(r.skilabod.includes('proxy'), 'skilaboðin eiga að nefna hvað féll');
});

test('vinna skilaði sér → aldrei bilun, jafnvel þótt rofi hafi sprungið', () => {
  // Seiglan vann: proxy datt út, bein leið tók við og skilaði félögum. Það er EKKI bilun.
  assert.equal(metaNott({ ...GRUNNUR, ok: 12, proxyDautt: true, villur: { 'proxy:503': 3 } }).thogul, false);
  assert.equal(metaNott({ ...GRUNNUR, discovered: 4, scrapeStop: true }).thogul, false);
  assert.equal(metaNott({ ...GRUNNUR, sweepFound: 1, villur: { x: 9 } }).thogul, false);
});

test('núll + villur án rofa telst líka þögult', () => {
  const r = metaNott({ ...GRUNNUR, villur: { 'beint:429': 6 } });
  assert.equal(r.thogul, true);
});

test('núll + þáttunarvillur telst þögult þótt skrapið hafi ekki kvartað', () => {
  assert.equal(metaNott({ ...GRUNNUR, errs: 7 }).thogul, true);
});

test('rofi sprunginn en engar villur skráðar telst samt þögult', () => {
  // Rofi springur ekki að ástæðulausu; ef hann sprakk og ekkert kom í hús er það bilun.
  assert.equal(metaNott({ ...GRUNNUR, proxyDautt: true }).thogul, true);
  assert.equal(metaNott({ ...GRUNNUR, scrapeStop: true }).thogul, true);
});

test('ástæðan er nefnd, ekki bara flaggið', () => {
  assert.equal(metaNott({ ...GRUNNUR, proxyDautt: true }).astaeda, 'proxy_dautt');
  assert.equal(metaNott({ ...GRUNNUR, scrapeStop: true }).astaeda, 'skrap_stoppad');
  assert.equal(metaNott({ ...GRUNNUR, errs: 3 }).astaeda, 'thattunarvillur');
  assert.equal(metaNott({ ...GRUNNUR, villur: { a: 1 } }).astaeda, 'skrapvillur');
  // Fleiri en eitt merki → rofinn ræður, hann er nær orsökinni en talningin.
  assert.equal(metaNott({ ...GRUNNUR, proxyDautt: true, errs: 3, villur: { a: 1 } }).astaeda, 'proxy_dautt');
});

test('rusl í inntaki fellir ekki matið og kallar ekki falskt á bilun', () => {
  for (const t of [undefined, null, {}, 'x', 7]) {
    const r = metaNott(t);
    assert.equal(typeof r.thogul, 'boolean');
    assert.equal(r.thogul, false, 'ófullnægjandi inntak má ALDREI falla — falskt rautt er verra en ekkert');
  }
});

test('skilaboðin bera tölurnar svo logg dugi til greiningar', () => {
  const r = metaNott({ ...GRUNNUR, villur: { 'proxy:200-ognothaeft': 3 }, proxyDautt: true });
  assert.ok(/proxy:200-ognothaeft/.test(r.skilabod));
  assert.ok(/0/.test(r.skilabod));
});
