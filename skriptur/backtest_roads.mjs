// Fróðleiks-sannreyning: gefið raun-vaxtaferil sögulegs tímabils, spáir vélin verðbólgu-átt innan bands?
// Ekki nákvæmnis-krafa — sannreynir að viðbrögð séu í rétta átt og stærðargráðu.
import { simulate } from '../src/lib/roads/engine.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const R = join(dirname(fileURLToPath(import.meta.url)), '..', 'gogn', 'roads');
const baseline = JSON.parse(readFileSync(join(R, 'baseline.json')));
const links = JSON.parse(readFileSync(join(R, 'links.json')));
// Sögulegt: 2021→2023 hækkaði SÍ vexti mikið (~+7pp). Spá vélarinnar: verðbólga ætti á endanum að lækka m.v. enga hækkun.
const hi = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 5 }, quarters: 12 });
const lo = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base - 5 }, quarters: 12 });
const q = 11;
const okDir = hi.outcomes.verdbolga.mid[q] < lo.outcomes.verdbolga.mid[q];
const okHouse = hi.outcomes.husnaedi.mid[q] < lo.outcomes.husnaedi.mid[q];
const okGdp = hi.outcomes.hagvoxtur.mid[q] < lo.outcomes.hagvoxtur.mid[q];
const okBand = Object.values(hi.outcomes).every((o) => o.lo.every((v, i) => v <= o.mid[i] && o.mid[i] <= o.hi[i]));
console.log('hærri vextir → lægri verðbólga:', okDir, '| lægra húsnæðisverð:', okHouse, '| lægri hagvöxtur:', okGdp, '| lo≤mið≤hi:', okBand);
const bad = !(okDir && okHouse && okGdp && okBand);
process.exit(bad ? 1 : 0);
