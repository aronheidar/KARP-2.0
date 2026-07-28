import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROUNDS, QUARTERS_PER_ROUND, DECISIONS, MANDATE, SCENARIO, mandateFor } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
const LEV = new Set(Object.keys(baseline.levers)), SHK = new Set(Object.keys(baseline.shocks)), OUT = new Set(Object.keys(baseline.outcomes));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

ok('8 umferðir', ROUNDS === 8 && QUARTERS_PER_ROUND === 4);
ok('5 ákvarðanir', DECISIONS.length === 5);
for (const d of DECISIONS) {
  ok('decision lever gildur: ' + d.id, !d.lever || LEV.has(d.lever));
  ok('decision hefur options: ' + d.id, d.mode === 'response' || (Array.isArray(d.options) && d.options.length >= 2)); // vidbragd (response) fyllist per atburði → tómt OK
  for (const o of d.options) ok('option lever gildur: ' + d.id + '/' + o.key, !o.lever || LEV.has(o.lever));
}
for (const k of MANDATE.kpis) ok('mandate KPI gild útkoma: ' + k.key, OUT.has(k.key));
for (const c of MANDATE.crisis) ok('crisis KPI gild útkoma: ' + c.key, OUT.has(c.key));
// Hagur fólks: kaupmáttur + þjóðhags-kjarni metinn í HVERJU kjörtímabili (vörn gegn „besta ríkið á kostnað fólks").
for (let r = 1; r <= ROUNDS; r++) {
  const keys = mandateFor(r).kpis.map((k) => k.key);
  ok('kaupmáttur metinn í KT' + r, keys.includes('kaupmattur'));
  ok('þjóðhags-kjarni metinn í KT' + r, ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur'].every((k) => keys.includes(k)));
  ok('mandateFor KT' + r + ' allar KPI gildar', keys.every((k) => OUT.has(k)));
}
ok('scenario = ROUNDS atburðir', SCENARIO.events.length === ROUNDS);
for (const e of SCENARIO.events) {
  ok('atburður shocks gild: r' + e.round, Object.keys(e.shocks || {}).every((k) => SHK.has(k) || LEV.has(k)));
  ok('atburður hefur viðbrögð: r' + e.round, Array.isArray(e.responses) && e.responses.length >= 2);
  for (const r of e.responses) {
    const eff = r.effect || {};
    ok('viðbragð lever gild: r' + e.round, Object.keys(eff.lever || {}).every((k) => LEV.has(k)));
    ok('viðbragð shock gild: r' + e.round, Object.keys(eff.shock || {}).every((k) => SHK.has(k)));
  }
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
