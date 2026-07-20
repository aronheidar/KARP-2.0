import { simulate } from '../src/lib/roads/engine.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const R = join(dirname(fileURLToPath(import.meta.url)), '..', 'gogn', 'roads');
const baseline = JSON.parse(readFileSync(join(R, 'baseline.json')));
const links = JSON.parse(readFileSync(join(R, 'links.json')));
let bad = 0;
const outArr = Object.keys(baseline.outcomes);
const outKeys = new Set(outArr);
// (a) útkoma→útkoma með lag 0: bannað EF það myndar lag-0 hringrás; og uppspretta verður á undan
//     neytanda í outcome-lyklaröð (vélin reiknar í þeirri röð). lag ≥ 1 er alltaf öruggt.
const oo0 = links.filter((l) => outKeys.has(l.from) && outKeys.has(l.to) && (l.lag || 0) === 0);
const adj = {}; for (const l of oo0) (adj[l.from] ||= []).push(l.to);
const GREY = 1, BLACK = 2, color = {};
const hasCycle = (n) => { color[n] = GREY; for (const m of (adj[n] || [])) { if (color[m] === GREY) return true; if (color[m] === undefined && hasCycle(m)) return true; } color[n] = BLACK; return false; };
for (const n of Object.keys(adj)) if (color[n] === undefined && hasCycle(n)) { console.log('⚠ lag-0 hringrás um', n); bad++; }
for (const l of oo0) if (outArr.indexOf(l.from) >= outArr.indexOf(l.to)) { console.log('⚠ lag-0 útkoma-röð röng (uppspretta ekki á undan neytanda):', l.id); bad++; }
// (b) hver stuðull ber heimild + ci
for (const l of links) if (!l.source || l.ci_lo === undefined || l.ci_hi === undefined) { console.log('⚠ tengsl vantar source/ci:', l.id); bad++; }
// (c) grunn-keyrsla: engin breyting → mið == grunnur
const r0 = simulate({ baseline, links, levers: {}, shocks: {}, quarters: baseline.quarters });
for (const k in r0.outcomes) if (!r0.outcomes[k].mid.every((v, i) => Math.abs(v - r0.outcomes[k].baseline[i]) < 1e-9)) { console.log('⚠ BAU ≠ mið fyrir', k); bad++; }
// (d) vaxtahækkun → verðbólga lækkar tafið (átt)
const r1 = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 1 }, quarters: baseline.quarters });
if (!(r1.outcomes.verdbolga.mid[baseline.quarters - 1] < r0.outcomes.verdbolga.mid[baseline.quarters - 1])) { console.log('⚠ +1pp vextir lækkar ekki verðbólgu í lok'); bad++; }
console.log(bad ? `\n${bad} vandamál` : '\n✓ módel heilbrigt: feedback-regla, heimildir/ci, BAU, átt vaxta→verðbólgu');
process.exit(bad ? 1 : 0);
