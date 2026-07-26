import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildChain, activeInputsFromInputs } from './chain.mjs';
import { buildInputs } from './resolve.mjs';
import { SCENARIO } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json');
const KPI = ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur'];
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// 1) buildChain: vextir active → net að KPI
{
  const c = buildChain({ baseline, links, activeInputs: [{ key: 'vextir', kind: 'lever', dev: 1 }], kpiKeys: KPI });
  ok('vextir er input-hnútur', c.nodes.some((n) => n.key === 'vextir' && n.kind === 'input'));
  ok('a.m.k. eitt KPI í neti', c.nodes.some((n) => n.kind === 'kpi'));
  ok('leggir til og formerktir', c.edges.length > 0 && c.edges.every((e) => e.sign === 1 || e.sign === -1));
  ok('≤ maxEdges (14)', c.edges.length <= 14);
  ok('input depth 0', c.nodes.find((n) => n.key === 'vextir').depth === 0);
  ok('eitthvert KPI depth > 0', c.nodes.filter((n) => n.kind === 'kpi').some((n) => n.depth > 0));
}
// 2) tómt activeInputs → aðeins KPI, engir leggir
{
  const c = buildChain({ baseline, links, activeInputs: [], kpiKeys: KPI });
  ok('tómt → 4 KPI hnútar', c.nodes.length === 4 && c.nodes.every((n) => n.kind === 'kpi'));
  ok('tómt → engir leggir', c.edges.length === 0);
}
// 3) activeInputsFromInputs úr buildInputs
{
  const set = { peningastefna: 'slaka2', utgjold: 'orvun2', skattar: 'obreytt', fjarfesting: 'innvidir', vidbragd: '' };
  const act = activeInputsFromInputs(buildInputs([set], { baseline, scenario: SCENARIO }), baseline);
  ok('virk inntök innihalda vextir+utgjold+innvidir', ['vextir', 'utgjold', 'innvidir'].every((k) => act.some((a) => a.key === k)));
  ok('skattar (obreytt) EKKI virkt', !act.some((a) => a.key === 'skattar'));
  ok('vextir dev < 0 (slaka)', act.find((a) => a.key === 'vextir').dev < 0);
}
// 4) determinismi
{
  const mk = () => JSON.stringify(buildChain({ baseline, links, activeInputs: [{ key: 'vextir', kind: 'lever', dev: 1 }], kpiKeys: KPI }));
  ok('determinismi', mk() === mk());
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
