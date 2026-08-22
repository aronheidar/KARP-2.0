import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hreinsaFaersla, frestTexti, leikHlekkur, postVerk, postVerkOll, tilMs } from './postur.mjs';

// 2026-08-27 09:00:00 UTC = fimmtudagur
const FIM = Date.UTC(2026, 7, 27, 9, 0, 0) / 1000;

const FAERSLA = { code: 'ab3k9', round: 2, naestaLota: 3, nextAt: FIM, lokid: 4, laest: 1, phase: 'decide' };

test('hreinsaFaersla hleypir AÐEINS hvítlistanum í gegn (persónuverndar-vörn)', () => {
  const skitug = Object.assign({}, FAERSLA, {
    teams: [{ id: 1, name: 'Jón og Gunna' }],   // liðsheiti — MÁ ALDREI fljóta með
    lidsheiti: 'Rauða liðið', stig: 87, kpis: { vlf: 3.2 }, decisions: { skattur: 5 },
  });
  const h = hreinsaFaersla(skitug);
  assert.deepEqual(Object.keys(h).sort(), ['code', 'laest', 'lokid', 'naestaLota', 'nextAt', 'phase', 'round']);
  const json = JSON.stringify(h);
  for (const bannad of ['Jón', 'Gunna', 'Rauða', 'stig', 'kpis', 'decisions', 'teams']) {
    assert.ok(!json.includes(bannad), 'lak: ' + bannad);
  }
});

test('hreinsaFaersla þolir rusl', () => {
  assert.deepEqual(hreinsaFaersla(null), {});
  assert.deepEqual(hreinsaFaersla('nei'), {});
  assert.deepEqual(hreinsaFaersla(undefined), {});
});

test('tilMs tekur bæði sekúndur og millisekúndur', () => {
  assert.equal(tilMs(FIM), FIM * 1000);
  assert.equal(tilMs(FIM * 1000), FIM * 1000);
  assert.equal(tilMs(0), null);
  assert.equal(tilMs(-5), null);
  assert.equal(tilMs('rugl'), null);
  assert.equal(tilMs(null), null);
});

test('frestTexti er íslenskur og aldrei „undefined"', () => {
  assert.equal(frestTexti(FIM), 'fimmtudag 27. ágúst kl. 09');
  assert.equal(frestTexti(FIM * 1000), 'fimmtudag 27. ágúst kl. 09');
  assert.equal(frestTexti(Date.UTC(2026, 7, 27, 9, 30) / 1000), 'fimmtudag 27. ágúst kl. 09:30');
  for (const rusl of [null, undefined, 0, -1, 'nei', NaN]) {
    const t = frestTexti(rusl);
    assert.equal(t, 'þegar fresturinn rennur út');
    assert.ok(!/undefined|NaN|Invalid/.test(t));
  }
});

test('leikHlekkur hreinsar leikkóðann', () => {
  assert.equal(leikHlekkur('ab3k9'), 'https://karp.is/leikur/?kodi=AB3K9');
  assert.equal(leikHlekkur('a b/3?k', 'https://karp.is/'), 'https://karp.is/leikur/?kodi=AB3K');
  assert.equal(leikHlekkur('', 'https://x.is'), 'https://x.is/leikur/');
  assert.ok(!leikHlekkur('<script>').includes('<'), 'engin slóðar-innspýting');
});

test('postVerk: þátttakandi fær NÝJU lotuna, leikstjóri þá sem var gerð upp', () => {
  const v = postVerk(FAERSLA);
  assert.equal(v.code, 'AB3K9');
  assert.equal(v.thatttakandi.id, 'leikur_lota');
  assert.deepEqual(v.thatttakandi.vars, {
    kodi: 'AB3K9', lota: 3, frestur: 'fimmtudag 27. ágúst kl. 09', hlekkur: 'https://karp.is/leikur/?kodi=AB3K9',
  });
  assert.equal(v.leikstjori.id, 'leikur_uppgjor');
  assert.deepEqual(v.leikstjori.vars, {
    kodi: 'AB3K9', lota: 2, lokid: 4, laest: 1, hlekkur: 'https://karp.is/leikur/?kodi=AB3K9',
  });
});

test('postVerk: leikslok → enginn þátttakenda-póstur, leikstjóri fær samt uppgjörið', () => {
  const v = postVerk(Object.assign({}, FAERSLA, { phase: 'ended', naestaLota: null }));
  assert.equal(v.thatttakandi, null);
  assert.equal(v.leikstjori.vars.lota, 2);
});

test('postVerk: vantar naestaLota → enginn þátttakenda-póstur (ekki „lota undefined")', () => {
  const v = postVerk({ code: 'AB3K9', round: 2, lokid: 3, laest: 0 });
  assert.equal(v.thatttakandi, null);
  assert.equal(v.leikstjori.vars.lokid, 3);
  assert.equal(v.leikstjori.vars.laest, 0);
});

test('postVerk: ónothæf færsla → null (ekki hálfur póstur)', () => {
  assert.equal(postVerk(null), null);
  assert.equal(postVerk({ round: 2 }), null, 'enginn leikkóði');
  assert.equal(postVerk({ code: 'AB3K9' }), null, 'engin lota');
  assert.equal(postVerk({ code: '???', round: 1 }), null, 'kóði hreinsast í tómt');
});

test('postVerk: óþekktar tölur verða 0, aldrei undefined í pósti', () => {
  const v = postVerk({ code: 'AB3K9', round: 1, naestaLota: 2, nextAt: FIM });
  assert.equal(v.leikstjori.vars.lokid, 0);
  assert.equal(v.leikstjori.vars.laest, 0);
  for (const vars of [v.thatttakandi.vars, v.leikstjori.vars]) {
    for (const [k, x] of Object.entries(vars)) assert.ok(x != null && !Number.isNaN(x), k + ' er ógilt');
  }
});

test('postVerkOll sleppir ónothæfum án þess að fella hinar', () => {
  const oll = postVerkOll([FAERSLA, null, { round: 9 }, Object.assign({}, FAERSLA, { code: 'ZZ111' })]);
  assert.equal(oll.length, 2);
  assert.deepEqual(oll.map((v) => v.code), ['AB3K9', 'ZZ111']);
  assert.deepEqual(postVerkOll(null), []);
  assert.deepEqual(postVerkOll('nei'), []);
});

// ⚠ Þetta próf er persónuverndar-vörn, ekki formsatriði — sjá DPIA Viðbót 1 (V1.3).
test('ENGIN póst-breyta fer út fyrir leyfðu mengin (DPIA Viðbót 1, V1.3)', () => {
  const v = postVerk(Object.assign({}, FAERSLA, { lidsheiti: 'Jón og Gunna', stig: 91, kpis: { vlf: 1 } }));
  assert.deepEqual(Object.keys(v.thatttakandi.vars).sort(), ['frestur', 'hlekkur', 'kodi', 'lota']);
  assert.deepEqual(Object.keys(v.leikstjori.vars).sort(), ['hlekkur', 'kodi', 'laest', 'lokid', 'lota']);
  const json = JSON.stringify(v);
  for (const bannad of ['Jón', 'Gunna', 'stig', 'kpis', 'lidsheiti']) {
    assert.ok(!json.includes(bannad), 'lak í póst-verk: ' + bannad);
  }
});
