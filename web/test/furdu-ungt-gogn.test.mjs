// web/test/furdu-ungt-gogn.test.mjs
// ⚠ Engin tala fer á síðuna án dagsetningar og heimildar. Numbeo-skrapið lá dautt í þrjár vikur án
// þess að nokkur tæki eftir því; tala sem segir hvenær hún var athuguð getur ekki úrelst í þögn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const U = JSON.parse(readFileSync(new URL('../src/data/furdu-ungt.json', import.meta.url), 'utf8'));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

test('hver drykkur ber verð, koffín og dagsetningu', () => {
  assert.ok(U.koffin.verdHeimild);
  for (const d of U.koffin.drykkir) {
    assert.ok(d.verd > 0 && d.mg > 0, d.id);
    assert.match(d.dags, ISO, d.id);
    assert.ok(d.athugasemd, d.id);
  }
  assert.ok(U.koffin.drykkir.some((d) => d.id === 'nocco'), 'Nocco knýr þrjár greinar');
});

test('kaffið: forsendan um g og mg í bolla stendur upphátt', () => {
  const k = U.koffin.kaffi;
  assert.ok(k.pakkiVerd > 0 && k.pakkiG > 0 && k.gBolli > 0 && k.mgBolli > 0);
  assert.match(k.dags, ISO); assert.match(k.athugasemd, /EFSA/);
});

test('íslatte: verð aðeins MEÐ dagsetningu og heimild', () => {
  const i = U.koffin.islatte;
  assert.ok(i.skot > 0 && i.mgSkot > 0);
  if (i.verd != null) { assert.ok(i.verd > 0); assert.match(i.dags, ISO); assert.ok(i.heimild); }
});

test('laun, útborgun og dósin bera heimild', () => {
  assert.match(U.laun.gildir, ISO); assert.ok(U.laun.heimild && U.laun.skatturHeimild);
  assert.equal(U.utborgun.hlutfall, 0.10, 'fyrstu kaupendur: 90% veðsetning frá lokum okt. 2025');
  assert.ok(U.utborgun.heimild);
  assert.ok(U.dosin.heimild && U.dosin.ar2024.heimild);
  assert.equal(U.dosin.skilagjald, 23);
});

test('nikótínið vísar í lagagreinina', () => {
  assert.match(U.nikotin.heimild, /96\/1995/);
  assert.match(U.nikotin.heimild, /99\/2025, 4\. gr\./);
});
