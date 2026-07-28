import { HANDBOOK, handbookFor } from './handbook.mjs';
import { SCENARIO, ROUNDS } from './game-config.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

ok('handbók = ROUNDS færslur', HANDBOOK.length === ROUNDS);
ok('kjörtímabil 1..8 í röð', HANDBOOK.every((h, i) => h.round === i + 1));
ok('hver færsla með fullnægjandi efni', HANDBOOK.every((h) => h.situation && h.situation.length > 20 && h.varast && h.varast.length > 20 && h.strategy && h.strategy.length > 20 && Array.isArray(h.settings) && h.settings.length >= 2));
ok('handbook svið samsvara sviðsmynd (allar lotur til)', HANDBOOK.every((h) => SCENARIO.events.some((e) => e.round === h.round)));
ok('handbookFor skilar réttri lotu', handbookFor(3).round === 3 && handbookFor(99) === null);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
