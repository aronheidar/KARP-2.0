import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRecap } from './recap.mjs';
import { MANDATE } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const perRoundScores = [{ round: 1, score: 70 }, { round: 2, score: 90 }, { round: 3, score: 30 }];
const realityPerTerm = [{ round: 1, score: 60 }, { round: 2, score: 95 }, { round: 3, score: 50 }];
const events = [{ round: 1, icon: '💻', title: 'Netbólan' }, { round: 2, icon: '🚀', title: 'Útrásin' }, { round: 3, icon: '🏦', title: 'Bankahrunið' }];
const vk = Object.keys(baseline.levers)[0];
const leversFull = [
  { round: 1, levers: { [vk]: baseline.levers[vk].base } },
  { round: 2, levers: { [vk]: baseline.levers[vk].max } },
];

const r = buildRecap({ perRoundScores, realityPerTerm, leversFull, mandate: MANDATE, events, baseline });
ok('skilar lines-fylki', Array.isArray(r.lines) && r.lines.length >= 3);
ok('besta = umferð 2 (90)', r.bestTerm.round === 2 && r.bestTerm.score === 90);
ok('erfiðasta = umferð 3 (30)', r.worstTerm.round === 3 && r.worstTerm.score === 30);
ok('besta lína nefnir Útrásin', r.lines.some((l) => l.includes('Útrásin')));
ok('vsReality beat=1 (r1), trailed=2 (r2,r3)', r.vsReality.beat === 1 && r.vsReality.trailed === 2);
ok('stærsta frávik = umferð 3 (-20)', r.vsReality.biggest.round === 3 && r.vsReality.biggest.diff === -20);
ok('defining = sleði með stærstu frávik (max)', r.defining && r.defining.key === vk && r.defining.value === baseline.levers[vk].max);

// disp-callback notað
const rd = buildRecap({ perRoundScores, realityPerTerm, leversFull, mandate: MANDATE, events, baseline, disp: () => 'RAUN' });
ok('defining notar disp', rd.defining.disp === 'RAUN' && rd.lines.some((l) => l.includes('RAUN')));

// Classic (engir leversFull) → ekkert defining, en samt best/worst
const rc = buildRecap({ perRoundScores, realityPerTerm, leversFull: [], mandate: MANDATE, events });
ok('classic: ekkert defining', rc.defining === null);
ok('classic: samt best/worst', rc.bestTerm && rc.worstTerm);

// Tómt → hrynur ekki
ok('tómt → tómar lines', buildRecap({}).lines.length === 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
