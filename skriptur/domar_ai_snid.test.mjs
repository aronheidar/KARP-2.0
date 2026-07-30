// Sniðs-samningur domar_ai.json — TVÖ TRÉ, TVÖ ÓLÍK SNIÐ (sjá haus build_domar_ai.js).
// build_domar_ai.js skrifar bæði tréin í sömu keyrslu og HVORUGT er afleiða hins:
//   gogn/domar_ai.json            = bert skyndiminni  → domar.astro (@gogn, SSG) + build_frettavel.js
//   web/public/gogn/domar_ai.json = {updated,n,note,byNr} → vaktir.astro (fetch) + build_heilsa.mjs
// Þessi próf falla ef einhver „samstillir" tréin — t.d. dual-write á web-sniðinu í rótina, eða
// speglun rót→web með því að taka domar_ai.json af VEF_KANONISKT-lista build_ragcopy.js.
// Hvort tveggja er raunveruleg regression: það fyrra þaggar /domar/ niður í NÚLL dóma, það
// síðara sviptir web-eintakið byNr+updated og brýtur Dómavaktina og gagnaheilsu-mælinn.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const les = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const rot = les('gogn/domar_ai.json');
const web = les('web/public/gogn/domar_ai.json');

// Hermir lesturinn í domar.astro og build_frettavel.js: Object.entries beint, sía á `einfalt`.
const reifadir = (o) => Object.entries(o).filter(([, v]) => v && v.einfalt).length;

test('root copy is a bare cache the SSG page can map directly', () => {
  assert.ok(reifadir(rot) > 0, 'domar.astro fengi 0 dóma — rótin má aldrei bera umbúðir');
  for (const umbud of ['updated', 'n', 'note', 'byNr']) {
    assert.ok(!(umbud in rot), 'rótin má ekki hafa umbúða-lykilinn ' + umbud);
  }
  assert.ok(Object.keys(rot).every((k) => /^(hr|lr):/.test(k)), 'lyklar eiga að vera hr:/lr: + málsnr.');
});

test('web copy is wrapped with byNr and an updated timestamp', () => {
  assert.ok(web.byNr && typeof web.byNr === 'object', 'vaktir.astro les (ai && ai.byNr)');
  assert.ok(reifadir(web.byNr) > 0, 'Dómavaktin fengi engar AI-reifanir');
  assert.ok(!Number.isNaN(Date.parse(web.updated)), 'build_heilsa.mjs les `updated` fyrir ferskleika');
});

test('both trees hold the same rulings', () => {
  assert.deepEqual(Object.keys(rot).sort(), Object.keys(web.byNr).sort(),
    'tréin eru ósamstillt — keyrsla build_domar_ai.js hefur líklega brotnað hálfnuð');
});
