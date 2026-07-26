import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveTeam, buildInputs } from './resolve.mjs';
import { SCENARIO } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json');
const ctx = { baseline, links, scenario: SCENARIO };
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const setAll = (o) => ({ peningastefna: 'obreytt', utgjold: 'obreytt', skattar: 'obreytt', fjarfesting: 'engin', vidbragd: '', ...o });

// 1) Óbreytt í 2 umferðir → KPI ≈ grunnferill (lítið frávik)
{
  const r = resolveTeam({ ...ctx, history: [setAll({}), setAll({})] });
  ok('quarters = 8', r.quarters === 8);
  ok('skilar KPI-lyklum', ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur'].every((k) => typeof r.kpis[k] === 'number' && Number.isFinite(r.kpis[k])));
}
// 2) Slaka á vöxtum + örva → hagvöxtur upp, verðbólga upp (vs óbreytt) við sömu umferð
{
  const base = resolveTeam({ ...ctx, history: [setAll({})] });
  const stim = resolveTeam({ ...ctx, history: [setAll({ peningastefna: 'slaka2', utgjold: 'orvun2' })] });
  ok('örvun → hagvöxtur hærri', stim.kpis.hagvoxtur > base.kpis.hagvoxtur);
  ok('örvun → verðbólga hærri (eða jöfn)', stim.kpis.verdbolga >= base.kpis.verdbolga - 1e-9);
}
// 3) Uppsöfnun: ákvörðun í umferð 1 hefur enn áhrif í umferð 3
{
  const a = resolveTeam({ ...ctx, history: [setAll({ peningastefna: 'slaka2' }), setAll({}), setAll({})] });
  const b = resolveTeam({ ...ctx, history: [setAll({ peningastefna: 'obreytt' }), setAll({}), setAll({})] });
  ok('umferð-1 ákvörðun bergmálar í umferð 3', Math.abs(a.kpis.verdbolga - b.kpis.verdbolga) > 1e-6);
}
// 4) buildInputs: fylki-lengd = umferðir × 4
{
  const { levers } = buildInputs([setAll({ peningastefna: 'herda' }), setAll({})], { baseline, scenario: SCENARIO });
  ok('vextir-fylki lengd 8', Array.isArray(levers.vextir.value) && levers.vextir.value.length === 8);
}
// 5) determinismi
{
  const h = [setAll({ peningastefna: 'slaka', fjarfesting: 'innvidir' }), setAll({ utgjold: 'orvun' })];
  ok('determinismi', JSON.stringify(resolveTeam({ ...ctx, history: h })) === JSON.stringify(resolveTeam({ ...ctx, history: h })));
}
// 6) STUDIO: sleða-stilling skilar KPI; hærri vextir → lægri verðbólga en base-run
{
  const sctx = { ...ctx, mode: 'studio' };
  const base = resolveTeam({ ...sctx, history: [{ levers: {} }] });
  const hike = resolveTeam({ ...sctx, history: [{ levers: { vextir: baseline.levers.vextir.base + 3 } }] });
  ok('studio skilar KPI-lyklum', ['verdbolga', 'hagvoxtur'].every((k) => Number.isFinite(hike.kpis[k])));
  ok('studio: hærri vextir → lægri verðbólga', hike.kpis.verdbolga < base.kpis.verdbolga);
}
// 7) STUDIO carry-forward: umferð-1 sleði heldur gildi í umferð 2 (án nýrra sleða)
{
  const sctx = { ...ctx, mode: 'studio' };
  const { levers } = buildInputs([{ levers: { vextir: 9.5 } }, { levers: {} }], { baseline, scenario: SCENARIO, mode: 'studio' });
  ok('studio carry-forward: vextir 9.5 í öllum 8 fjórðungum', levers.vextir.value.length === 8 && levers.vextir.value.every((v) => v === 9.5));
}
// 8) STUDIO clamp: gildi út fyrir max klippt (ekki NaN)
{
  const { levers } = buildInputs([{ levers: { vextir: 999 } }], { baseline, scenario: SCENARIO, mode: 'studio' });
  ok('studio clamp í max', levers.vextir.value[0] === baseline.levers.vextir.max);
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
