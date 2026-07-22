import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projectRas } from './frett-ras.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json'), scenarios = rj('scenarios.json');
const ctx = { baseline, links, scenarios };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const eff = (p, key) => (p.topEffects.find((e) => e.key === key) || null);

// 1) sim: vaxtalækkun (lægri vextir) → hagvöxtur upp
{
  const now = baseline.levers.vextir.base;
  const p = projectRas({ kind: 'lever', key: 'vextir', value: now - 1 }, ctx);
  ok('rate cut → sim projection', p && p.mode === 'sim');
  ok('rate cut → vanskil dir < 0 (ríkjandi áhrif: lægri vextir → minni vanskil)', p && eff(p, 'vanskil') && eff(p, 'vanskil').dir < 0);
  ok('rate cut → topEffects ≤ 4', p && p.topEffects.length <= 4);
  ok('rate cut → deepLink lever-hash', p && p.deepLink === '/hermir/#l.vextir=' + (now - 1));
}
// 2) sim: olíu-sjokk → verðbólga upp
{
  const p = projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx);
  ok('oil shock → verdbolga dir > 0', p && eff(p, 'verdbolga') && eff(p, 'verdbolga').dir > 0);
  ok('oil shock → deepLink shock-hash', p && p.deepLink === '/hermir/#s.olia=40');
}
// 3) links: verðbólga (Type B) → kaupmáttur niður, greiðslubyrði upp
{
  const p = projectRas({ kind: 'outcome', key: 'verdbolga' }, ctx);
  ok('verdbolga → links mode', p && p.mode === 'links');
  ok('verdbolga → illustrative', p && p.illustrative === true);
  ok('verdbolga → kaupmattur dir < 0', p && eff(p, 'kaupmattur') && eff(p, 'kaupmattur').dir < 0);
  ok('verdbolga → greidslubyrdi dir > 0', p && eff(p, 'greidslubyrdi') && eff(p, 'greidslubyrdi').dir > 0);
  ok('verdbolga → deepLink model tab', p && p.deepLink === '/hermir/#tb=model');
}
// 4) links á útkomu án niðurstreymis (leiga) → null
{
  ok('leiga (engin niðurstreymis-tengsl) → null', projectRas({ kind: 'outcome', key: 'leiga' }, ctx) === null);
}
// 5) null-tilfelli
{
  ok('óþekktur lever → null', projectRas({ kind: 'lever', key: 'ekki_til', value: 1 }, ctx) === null);
  ok('óþekkt kind → null', projectRas({ kind: 'blah' }, ctx) === null);
}
// 6) valence = dir * polarity
{
  const p = projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx);
  const e = eff(p, 'verdbolga');   // verðbólga upp, polarity -1 → valence -1 (slæmt)
  ok('valence = dir*polarity', e && e.valence === -1);
}
// 7) determinismi
{
  const a = JSON.stringify(projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx));
  const b = JSON.stringify(projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx));
  ok('determinismi', a === b);
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
