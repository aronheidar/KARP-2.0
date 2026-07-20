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
// Húsnæðis-eining (module 2)
const frH = simulate({ baseline, links, levers: { frambod: 20 }, quarters: 12 });
const migH = simulate({ baseline, links, shocks: { adflutningur: 40 }, quarters: 12 });
const rtB = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 3 }, quarters: 12 });
const okFrHouse = frH.outcomes.husnaedi.mid[q] < baseline.outcomes.husnaedi.path[q];
const okMigHouse = migH.outcomes.husnaedi.mid[q] > baseline.outcomes.husnaedi.path[q];
const okMigRent = migH.outcomes.leiga.mid[q] > baseline.outcomes.leiga.path[q];
const okRateBurden = rtB.outcomes.greidslubyrdi.mid[q] > baseline.outcomes.greidslubyrdi.path[q];
const okHouseBand = [frH, migH, rtB].every((r) => ['leiga', 'greidslubyrdi'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('+framboð→húsnæði↓:', okFrHouse, '| +aðflutn→húsnæði↑:', okMigHouse, '| +aðflutn→leiga↑:', okMigRent, '| +vextir→greiðslubyrði↑:', okRateBurden, '| húsnæðis-bönd gild:', okHouseBand);
// Lýðfræði-eining (module 3)
const migD = simulate({ baseline, links, shocks: { adflutningur: 40 }, quarters: 12 });
const ferD = simulate({ baseline, links, shocks: { frjosemi: 30 }, quarters: 12 });
const okMigPop = migD.outcomes.mannfjoldi.mid[q] > baseline.outcomes.mannfjoldi.path[q];
const okMigLabor = migD.outcomes.vinnuafl.mid[q] > baseline.outcomes.vinnuafl.path[q];
const okMigGdp = migD.outcomes.hagvoxtur.mid[q] > baseline.outcomes.hagvoxtur.path[q];
const okFerPop = ferD.outcomes.mannfjoldi.mid[q] > baseline.outcomes.mannfjoldi.path[q];
const okDemoBand = [migD, ferD].every((r) => ['mannfjoldi', 'vinnuafl'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('+aðflutn→mannfj↑:', okMigPop, '| →vinnuafl↑:', okMigLabor, '| →hagvöxtur↑:', okMigGdp, '| +frjós→mannfj↑:', okFerPop, '| lýðfr-bönd gild:', okDemoBand);
// Ríkisfjármála-eining (module 4)
const taxC = simulate({ baseline, links, levers: { skattar: -10 }, quarters: 12 });
const expC = simulate({ baseline, links, levers: { utgjold: -10 }, quarters: 12 });
const okTaxBal = taxC.outcomes.afkoma.mid[q] < baseline.outcomes.afkoma.path[q];
const okAdhBal = expC.outcomes.afkoma.mid[q] > baseline.outcomes.afkoma.path[q];
const okDebtAccum = (taxC.outcomes.skuldir.mid[11] - taxC.outcomes.skuldir.baseline[11]) > (taxC.outcomes.skuldir.mid[3] - taxC.outcomes.skuldir.baseline[3]); // aukaskuldir v/hallans vaxa (frávik frá BAU)
const okFiscBand = [taxC, expC].every((r) => ['afkoma', 'skuldir'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('skattalækkun→afkoma↓:', okTaxBal, '| aðhald→afkoma↑:', okAdhBal, '| halli→skuldir vaxandi:', okDebtAccum, '| ríkis-bönd:', okFiscBand);
const bad = !(okDir && okHouse && okGdp && okBand && okFrHouse && okMigHouse && okMigRent && okRateBurden && okHouseBand && okMigPop && okMigLabor && okMigGdp && okFerPop && okDemoBand && okTaxBal && okAdhBal && okDebtAccum && okFiscBand);
process.exit(bad ? 1 : 0);
