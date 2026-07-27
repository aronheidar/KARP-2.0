import { detectConflicts } from './tradeoffs.mjs';
import { MANDATE } from './game-config.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// MANDATE: verðbólga target 2.5 band 1; atvinnuleysi max 4.5 band 1; skuldir max 40 band 5; hagvöxtur min 2 band 1.

// Phillips: verðbólga OG atvinnuleysi bæði of há
const c1 = detectConflicts({ verdbolga: 8, atvinnuleysi: 8, skuldir: 30, hagvoxtur: 2.5 }, MANDATE);
ok('Phillips greint', c1.some((c) => c.key1 === 'verdbolga' && c.key2 === 'atvinnuleysi'));

// Örvun vs verðbólga: kröftugur vöxtur EN verðbólga of há
const c2 = detectConflicts({ verdbolga: 8, atvinnuleysi: 3, skuldir: 30, hagvoxtur: 6 }, MANDATE);
ok('örvunar-spenna greind', c2.some((c) => c.key1 === 'hagvoxtur' && c.key2 === 'verdbolga'));

// Skuldir vs vöxtur: skuldir of háar OG vöxtur of veikur
const c3 = detectConflicts({ verdbolga: 2.5, atvinnuleysi: 3, skuldir: 60, hagvoxtur: 0.5 }, MANDATE);
ok('skulda/vaxtar-spenna greind', c3.some((c) => c.key1 === 'skuldir' && c.key2 === 'hagvoxtur'));

// Allt í jafnvægi → engin spenna
const c0 = detectConflicts({ verdbolga: 2.5, atvinnuleysi: 3.5, skuldir: 35, hagvoxtur: 2.8 }, MANDATE);
ok('jafnvægi → engin spenna', c0.length === 0);

// Vantar gildi → hrynur ekki
ok('vantar gildi → tómt', detectConflicts({}, MANDATE).length === 0);
ok('ekkert mandate → tómt', detectConflicts({ verdbolga: 8, atvinnuleysi: 8 }, null).length === 0);

// Skila-form
ok('hver spenna hefur msg', c1.every((c) => typeof c.msg === 'string' && c.msg.length > 10));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
