// demo-logic.test.mjs — próf fyrir „Lifðu af 2008" demo-eininguna (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEMO_ROUND, DEMO_YEAR_FROM, DEMO_YEAR_TO, DEMO_EVENT, DEMO_LEVERS, DEMO_POLICIES, DEMO_KPIS,
  demoScenario, resolveDemo, reality2012, vsReality,
} from './demo-logic.mjs';
import { REALITY, SCENARIO } from './game-config.mjs';
import { policyAvailable } from './policies.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json');
const run = (levers = {}, policies = {}) => resolveDemo({ baseline, links, levers, policies });

// — Fastar ————————————————————————————————————————————————————————————

test('DEMO_EVENT er bankahrunið 2008 (KT3) með gengissjokki', () => {
  assert.equal(DEMO_EVENT, SCENARIO.events[DEMO_ROUND - 1]);
  assert.equal(DEMO_EVENT.year, DEMO_YEAR_FROM);
  assert.ok(DEMO_EVENT.title.includes('hrun') || DEMO_EVENT.title.includes('Banka'));
  assert.ok(DEMO_EVENT.shocks.gengi < 0, 'gengið hrynur í sviðsmyndinni');
});

test('demoScenario: eini atburðurinn lendir á umferð 1 (events[0])', () => {
  const sc = demoScenario();
  assert.equal(sc.events.length, 1);
  assert.equal(sc.events[0], DEMO_EVENT);
});

test('DEMO_LEVERS eru til í baseline.levers (7 sleðar)', () => {
  assert.equal(DEMO_LEVERS.length, 7);
  for (const k of DEMO_LEVERS) assert.ok(baseline.levers[k], 'vantar lever í baseline: ' + k);
});

test('DEMO_POLICIES eru í boði í KT3 (from/to virt)', () => {
  assert.equal(DEMO_POLICIES.length, 2);
  for (const p of DEMO_POLICIES) {
    assert.ok(p && p.id, 'policy fannst ekki');
    assert.ok(policyAvailable(p, DEMO_ROUND, {}), p.id + ' ekki í boði í KT3');
  }
});

// — resolveDemo: grunnhegðun ————————————————————————————————————————————

test('hlutlaus stjórn: endanleg KPI, stig ∈ [0,100], kort-þrep 0–3, ≤3 fyrirsagnir', () => {
  const r = run();
  for (const k of ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur', 'kaupmattur']) {
    assert.ok(Number.isFinite(r.kpis[k]), 'KPI vantar: ' + k);
  }
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(r.composite >= 0 && r.composite <= 100);
  assert.ok(Array.isArray(r.headlines) && r.headlines.length >= 1 && r.headlines.length <= 3);
  for (const t of ['byggd', 'menntun', 'fiskur', 'losun']) {
    assert.ok(Number.isInteger(r.threp[t]) && r.threp[t] >= 0 && r.threp[t] <= 3, 'þrep ' + t);
  }
  assert.equal(typeof r.survived, 'boolean');
  assert.ok(['stable', 'unrest', 'revolt'].includes(r.stability.level));
});

test('determinismi: sama inntak → sama úttak', () => {
  const h = { levers: { vextir: 9, utgjold: 6 }, policies: { hoft: true, bankar: 'thjod' } };
  assert.equal(
    JSON.stringify(resolveDemo({ baseline, links, ...h })),
    JSON.stringify(resolveDemo({ baseline, links, ...h }))
  );
});

test('2008-sjokkið bítur: verðbólga hlutlausrar stjórnar langt yfir markmiði', () => {
  const r = run();
  assert.ok(r.kpis.verdbolga > 6, 'gengishrun −35 á að keyra verðbólguna upp (fékk ' + r.kpis.verdbolga + ')');
});

// — Sleðar hafa rétta stefnu ——————————————————————————————————————————

test('hærri stýrivextir → lægri verðbólga en lægri hagvöxtur', () => {
  const hike = run({ vextir: 12 }), cut = run({ vextir: 2 });
  assert.ok(hike.kpis.verdbolga < cut.kpis.verdbolga);
  assert.ok(hike.kpis.hagvoxtur < cut.kpis.hagvoxtur);
});

test('örvun (útgjöld↑) → hærri hagvöxtur en hlutlaust', () => {
  const stim = run({ utgjold: 10 }), base = run();
  assert.ok(stim.kpis.hagvoxtur > base.kpis.hagvoxtur);
});

test('sleðagildi klippt í [min,max] (engin NaN við öfgagildi)', () => {
  const r = run({ vextir: 999, utgjold: -999, skattar: 'rusl' });
  assert.ok(Number.isFinite(r.kpis.verdbolga) && Number.isFinite(r.kpis.hagvoxtur));
});

test('óþekktir sleðar hunsaðir (aðeins DEMO_LEVERS fara í gegn)', () => {
  const a = run({ kolefnisgjald: 100, veidigjald: 100 }), b = run();
  assert.equal(JSON.stringify(a.kpis), JSON.stringify(b.kpis));
});

// — Stóru ákvarðanirnar ————————————————————————————————————————————————

test('höft: draga verðbólgu að grunni en kosta hagvöxt', () => {
  const med = run({}, { hoft: true }), an = run();
  assert.ok(med.kpis.verdbolga < an.kpis.verdbolga);
  assert.ok(med.kpis.hagvoxtur < an.kpis.hagvoxtur);
  assert.equal(med.policyStates.hoft, true);
  assert.ok(med.threp.taknmyndir.includes('hoft'), 'höft birtast sem lás á kortinu');
});

test('bankar: þjóðnýting → hærri skuldir en einkavæðing', () => {
  const thjod = run({}, { bankar: 'thjod' }), einka = run({}, { bankar: 'einka' });
  assert.ok(thjod.kpis.skuldir > einka.kpis.skuldir);
});

test('ógild stefnu-gildi hreinsuð burt', () => {
  const r = run({}, { hoft: 'ja', bankar: 'brenna', icesave: 'pay' });
  assert.deepEqual(r.policyStates, {});
});

// — Raun-samanburðurinn ————————————————————————————————————————————————

test('reality2012: gildin á vísitölu 12 (2012) úr REALITY', () => {
  const real = reality2012();
  for (const k of DEMO_KPIS) assert.equal(real[k], REALITY[k][12]);
});

test('vsReality: röð per KPI með delta = þú − raun (rúnnuð á 1 aukastaf)', () => {
  const rows = vsReality({ verdbolga: 7.25, atvinnuleysi: 4.0, skuldir: 45, hagvoxtur: 2.0 });
  assert.equal(rows.length, DEMO_KPIS.length);
  const vb = rows.find((r) => r.key === 'verdbolga');
  assert.equal(vb.you, 7.3);
  assert.equal(vb.real, REALITY.verdbolga[12]);
  assert.equal(vb.delta, Math.round((7.25 - REALITY.verdbolga[12]) * 10) / 10);
  assert.ok(vb.label.length > 0);
});

test('vsReality: KPI sem vantar er sleppt (engin NaN-röð)', () => {
  const rows = vsReality({ verdbolga: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'verdbolga');
});
