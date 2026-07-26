import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateGameConfig } from './game-validate.mjs';
import { SCENARIO, MANDATE, ROUNDS } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const clone = (o) => JSON.parse(JSON.stringify(o));

ok('sjálfgefið er gilt', validateGameConfig({ scenario: SCENARIO, mandate: MANDATE, rounds: ROUNDS }, baseline).ok === true);
{ const s = clone(SCENARIO); s.events[1].shocks = { ekki_til: 10 }; const v = validateGameConfig({ scenario: s, mandate: MANDATE, rounds: ROUNDS }, baseline); ok('ógilt sjokk → error', !v.ok && v.errors.some((e) => e.includes('ekki_til'))); }
{ const v = validateGameConfig({ scenario: SCENARIO, mandate: MANDATE, rounds: 5 }, baseline); ok('events≠rounds → error', !v.ok && v.errors.some((e) => e.includes('umferðir'))); }
{ const s = clone(SCENARIO); s.events[0].responses = []; ok('0 viðbrögð → error', !validateGameConfig({ scenario: s, mandate: MANDATE, rounds: ROUNDS }, baseline).ok); }
{ const m = clone(MANDATE); m.kpis[0].key = 'ekki_til'; ok('ógild KPI → error', !validateGameConfig({ scenario: SCENARIO, mandate: m, rounds: ROUNDS }, baseline).ok); }
{ ok('rounds 0 → error', !validateGameConfig({ scenario: SCENARIO, mandate: MANDATE, rounds: 0 }, baseline).ok); }
{ const s = clone(SCENARIO); s.events[0].responses[1] = { key: 'x', label: 'X', effect: { lever: { ekki_til: 3 } } }; ok('ógildur viðbragðs-lever → error', !validateGameConfig({ scenario: s, mandate: MANDATE, rounds: ROUNDS }, baseline).ok); }
{ const s = { id: 'custom', events: [ { round: 1, title: 'T1', text: '', shocks: {}, responses: [{ key: 'a', label: 'A', effect: {} }] }, { round: 2, title: 'T2', text: '', shocks: { olia: 20 }, responses: [{ key: 'a', label: 'A', effect: { lever: { utgjold: 5 } } }] } ] };
  ok('gilt sérsniðið → ok', validateGameConfig({ scenario: s, mandate: MANDATE, rounds: 2 }, baseline).ok === true); }
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
