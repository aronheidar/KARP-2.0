// skriptur/lib/islandis_skra.test.mjs
// ⚠ 21.9.2026: atvinnuleysið á forsíðunni stóð í maí. build_atvinnuleysi.js las skrá sem var sett í
// repo-ið 30.7 og sótti aldrei neitt. Síður stofnana á island.is bera slóð skrárinnar í HTML-inu,
// en Contentful skiptir um slóð í hvert sinn sem skránni er skipt út, svo hún er lesin í hvert sinn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finnaCtfSlod } from './islandis_skra.mjs';

const HTML = `<a href="https://assets.ctfassets.net/8k0h54kbe6bj/32tm/9631/fdbf3332.pdf">Mánaðarskýrsla</a>
<a href="https://assets.ctfassets.net/8k0h54kbe6bj/26z9/86ec/Talnagogn_atvinnuleysi_.xlsm">Helstu talnagögn</a>
{"file":{"url":"//downloads.ctfassets.net/8k0h54kbe6bj/5TZq/c825/Sk%C3%BDrsla_2026.xlsx"}}`;

test('finnur rétta skrá eftir heiti innan um aðrar', () => {
  assert.equal(finnaCtfSlod(HTML, /^Talnagogn_atvinnuleysi.*\.xlsm$/i),
    'https://assets.ctfassets.net/8k0h54kbe6bj/26z9/86ec/Talnagogn_atvinnuleysi_.xlsm');
});

test('slóð án samskiptareglu (úr Next-gögnum) fær https og heitið er afkóðað fyrir samanburð', () => {
  assert.equal(finnaCtfSlod(HTML, /^Skýrsla_2026\.xlsx$/),
    'https://downloads.ctfassets.net/8k0h54kbe6bj/5TZq/c825/Sk%C3%BDrsla_2026.xlsx');
});

test('engin samsvörun → null', () => {
  assert.equal(finnaCtfSlod(HTML, /Afbrot.*\.xlsx$/), null);
});
