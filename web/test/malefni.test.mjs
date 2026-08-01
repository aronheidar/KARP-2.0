// malefni.test.mjs — GÁTT á web/src/data/malefni.json, sem er EIN uppspretta bæði fyrir
// málefna-flísarnar á /frettir/ og /frettir/<slug>/-síðurnar. Villa í þessari skrá birtist
// ekki sem hrun heldur sem ÞÖGUL bilun (flís hverfur, síða verður 404, fyrirsögn rangbeygð),
// svo hún er prófuð beint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adiliSlug } from '../src/lib/frettaadili.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MALEFNI = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'malefni.json'), 'utf8'));

test('hvert málefni hefur nafn, flokk, þolfallsmynd og leitarorð', () => {
  assert.ok(MALEFNI.length >= 100, 'málefnin eiga ekki að fækka óvart: ' + MALEFNI.length);
  for (const m of MALEFNI) {
    assert.ok(m.n && typeof m.n === 'string', 'nafn vantar: ' + JSON.stringify(m));
    // ⚠ FLOKKUR ER SKYLDA: flísin birtist AÐEINS undir sínum flokki. Flokkslaust málefni
    //   fær enga flís og verður ósýnilegt á /frettir/ þótt síðan sjálf virki.
    assert.ok(m.f && typeof m.f === 'string', 'flokk vantar á „' + m.n + '"');
    assert.ok(m.um && typeof m.um === 'string', 'þolfallsmynd vantar á „' + m.n + '"');
    assert.ok(Array.isArray(m.a) && m.a.length, 'leitarorð vantar á „' + m.n + '"');
    for (const a of m.a) assert.ok(String(a).length >= 3, 'leitarorð undir 3 stöfum í „' + m.n + '" er hunsað af leitinni: ' + a);
  }
});

test('slug hvers málefnis er einkvæmt og passar við leið workersins', () => {
  // Sama mynstur og /frettir/<slug>/ í worker.js — annars svarar síðan 404 þótt hún sé í skránni.
  const LEID = /^[a-z0-9][a-z0-9-]{2,60}$/;
  const sedd = new Set();
  for (const m of MALEFNI) {
    const s = adiliSlug(m.n);
    assert.match(s, LEID, '„' + m.n + '" gefur ógilt slug: ' + s);
    assert.ok(!sedd.has(s), 'tvítekið slug: ' + s);
    sedd.add(s);
  }
});

test('flokkar eru fáir og skráin flokka-röðuð (flísaröðin les hana beint)', () => {
  const flokkar = [...new Set(MALEFNI.map((m) => m.f))];
  assert.ok(flokkar.length >= 4 && flokkar.length <= 12, 'flokkafjöldi utan marka: ' + flokkar.length);
  // Skráin á að vera flokka-röðuð svo `[...new Set(...)]` í frettir.astro gefi rétta röð
  // OG allar flísar flokks liggi saman. Flokkur sem birtist tvisvar = brotin röðun.
  const rod = MALEFNI.map((m) => m.f);
  const fyrstaSaeti = new Map();
  rod.forEach((f, i) => { if (!fyrstaSaeti.has(f)) fyrstaSaeti.set(f, i); });
  for (const [f, i] of fyrstaSaeti) {
    const sidasta = rod.lastIndexOf(f);
    const fjoldi = rod.filter((x) => x === f).length;
    assert.equal(sidasta - i + 1, fjoldi, 'flokkurinn „' + f + '" er ekki samfelldur í skránni');
  }
});

test('þolfallsmyndin er ekki bara afrit af nefnifalli þegar hún á að beygjast', () => {
  // „Umfjöllun um Verðbólga" er ekki íslenska. Þessi orð VERÐA að hafa aðra mynd.
  const VERDA_AD_BEYGJAST = ['Verðbólga', 'Ferðaþjónusta', 'Krónan', 'Spilling', 'Sjávarútvegur'];
  for (const n of VERDA_AD_BEYGJAST) {
    const m = MALEFNI.find((x) => x.n === n);
    if (!m) continue;
    assert.notEqual(m.um, m.n, '„' + n + "\" þarf þolfallsmynd — „Umfjöllun um " + n + '" er rangt mál');
  }
});
