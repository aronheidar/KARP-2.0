// Gáttin á greiddu skýrslugögnin (/gogn/{eigendur,arsreikningar,stjorn}/<kt>.json).
//
// ⚠⚠ ÞESSI GÁTT VER PII OG 990-VÖRUNA. Hún var einu sinni opin og lak eigenda-PII óauðkennt
// (sjá karp-cloudflare-auth-migration). Prófin hér eiga að falla HÁTT ef einhver víkkar hana
// óvart. Reglan er: enginn aðgangur án greiddrar heimildar eða admin, aldrei.
//
// 17.9.2026 — ein leiðrétting: `stjorn` krafðist EINGÖNGU `fyrirtaeki:<kt>`. Sá sem keypti
// endanlega-eigenda-skýrsluna fékk því 403 á stjórn félagsins sem hann var að skoða, þótt
// skýrslan lofi stjórnendahluta. Það kom ekki í ljós fyrr en hólfið hætti að fyllast úr
// lifandi RSK-kallinu, því þangað til sótti skýrslan stjórnina aldrei úr skránni.
//
// Að hleypa `eigendur:<kt>` að stjórninni VÍKKAR EKKI aðganginn í reynd: /api/tengslanet ber
// nákvæmlega sömu stjórn fram við HVERN innskráðan notanda sem er. Þetta er því þrengra en
// staðan sem fyrir var, ekki rýmra.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gognGattLyklar, GOGN_GATT_MYNSTUR } from '../src/lib/gogn-gatt.mjs';

const KT = '4812080920';

test('eigendur krefst eigenda-heimildar', () => {
  assert.deepEqual(gognGattLyklar('eigendur', KT), ['eigendur:' + KT]);
});

test('arsreikningar krefjast fyrirtækja-heimildar', () => {
  assert.deepEqual(gognGattLyklar('arsreikningar', KT), ['fyrirtaeki:' + KT]);
});

test('stjorn opnast fyrir BÁÐAR keyptu skýrslurnar', () => {
  const l = gognGattLyklar('stjorn', KT);
  assert.ok(l.includes('fyrirtaeki:' + KT), 'fyrirtækjaskýrslan á áfram að ná stjórninni');
  assert.ok(l.includes('eigendur:' + KT), 'eigendaskýrslan ber stjórnendahluta og þarf skrána');
});

test('engin heimild er nokkurn tíma tóm — tómur listi myndi hleypa öllum inn', () => {
  for (const t of ['eigendur', 'arsreikningar', 'stjorn']) {
    assert.ok(gognGattLyklar(t, KT).length > 0, t + ' má aldrei skila tómum lyklalista');
  }
});

test('óþekkt tegund skilar ENGRI heimild sem hægt er að uppfylla', () => {
  // null → kallandinn verður að hafna. Tómt fylki væri hættulegt (ekkert að athuga = hleypa í gegn).
  assert.equal(gognGattLyklar('eitthvad', KT), null);
  assert.equal(gognGattLyklar('', KT), null);
  assert.equal(gognGattLyklar(undefined, KT), null);
});

test('kennitalan fer ÓBREYTT í lykilinn (engin normalísering sem gæti víxlað félögum)', () => {
  assert.deepEqual(gognGattLyklar('eigendur', '1234567890'), ['eigendur:1234567890']);
  assert.equal(gognGattLyklar('eigendur', ''), null);
  assert.equal(gognGattLyklar('eigendur', null), null);
});

test('mynstrið tekur nákvæmlega þrjár möppur og .json-endingu', () => {
  assert.ok(GOGN_GATT_MYNSTUR.test('/gogn/eigendur/4812080920.json'));
  assert.ok(GOGN_GATT_MYNSTUR.test('/gogn/stjorn/4812080920.json'));
  assert.ok(GOGN_GATT_MYNSTUR.test('/gogn/arsreikningar/4812080920.json'));
  // Sýnishorn og önnur gagnasöfn fara EKKI um gáttina.
  assert.equal(GOGN_GATT_MYNSTUR.test('/gogn/eigendur/_synishorn.json'), false);
  assert.equal(GOGN_GATT_MYNSTUR.test('/gogn/kvoti.json'), false);
  assert.equal(GOGN_GATT_MYNSTUR.test('/gogn/eigendur/4812080920.json.bak'), false);
});
