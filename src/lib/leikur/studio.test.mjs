import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { studioCatalog, defaultDials, changedLevers } from './studio.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const cat = studioCatalog(baseline);
// (1) flipar = hópar baseline
ok('tabs = 6 hópar', cat.tabs.length === 6);
ok('tabs group-heiti úr baseline', cat.tabs.every((t) => typeof t.group === 'string' && t.group.length > 0));
// (2) heildar-lever-fjöldi = 32
ok('heildar sleða-fjöldi 32', cat.tabs.reduce((a, t) => a + t.levers.length, 0) === 32);
// (3) hver lever-meta heil
ok('lever-meta heil', cat.tabs.every((t) => t.levers.every((l) => l.key && l.label && Number.isFinite(l.min) && Number.isFinite(l.max) && Number.isFinite(l.base) && Number.isFinite(l.step))));
// (4) outcomes með polarity
ok('outcomes 36 með polarity', cat.outcomes.length === 36 && cat.outcomes.every((o) => o.key && typeof o.polarity === 'number'));
// (5) defaultDials = base f. alla
const dd = defaultDials(baseline);
ok('defaultDials = base', Object.keys(dd).length === 32 && Object.entries(dd).every(([k, v]) => v === baseline.levers[k].base));
// (6) changedLevers diff
const dials = { ...dd, vextir: 9.0 };
const ch = changedLevers(dials, baseline);
ok('changedLevers 1 færsla', ch.length === 1 && ch[0].key === 'vextir' && ch[0].to === 9.0 && ch[0].from === baseline.levers.vextir.base);
ok('changedLevers tóm ef engin breyting', changedLevers(dd, baseline).length === 0);
// (7) changedLevers raðar eftir hlutfallslegri stærð (stærsta breyting fyrst)
const dials2 = { ...dd, vextir: baseline.levers.vextir.base + 0.25, utgjold: baseline.levers.utgjold.max };
const ch2 = changedLevers(dials2, baseline);
ok('changedLevers raðar stærstu fyrst', ch2[0].key === 'utgjold');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
