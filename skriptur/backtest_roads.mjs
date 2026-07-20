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
// Auðlinda-eining (module 5)
const kvC = simulate({ baseline, links, levers: { kvoti: 10 }, quarters: 12 });
const orC = simulate({ baseline, links, levers: { orka: 20 }, quarters: 12 });
const caC = simulate({ baseline, links, levers: { kolefnisgjald: 50 }, quarters: 12 });
const okKvExp = kvC.outcomes.utflutningur.mid[q] > baseline.outcomes.utflutningur.path[q];
const okOrExp = orC.outcomes.utflutningur.mid[q] > baseline.outcomes.utflutningur.path[q];
const okOrEmis = orC.outcomes.losun.mid[q] > baseline.outcomes.losun.path[q];
const okCarbEmis = caC.outcomes.losun.mid[q] < baseline.outcomes.losun.path[q];
const okResBand = [kvC, orC, caC].every((r) => ['utflutningur', 'losun'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i])));
console.log('+kvóti→útflutn↑:', okKvExp, '| +orka→útflutn↑:', okOrExp, '| +orka→losun↑:', okOrEmis, '| +kolefnisgj→losun↓:', okCarbEmis, '| auðlinda-bönd:', okResBand);
// Dýpkun (lota 1)
const wageC = simulate({ baseline, links, levers: { laun: 10 }, quarters: 12 });
const tourC = simulate({ baseline, links, shocks: { ferdamenn: 30 }, quarters: 12 });
const rateC = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 3 }, quarters: 12 });
const okKaupGdp = wageC.outcomes.hagvoxtur.mid[q] > baseline.outcomes.hagvoxtur.path[q]; // +laun → kaupmáttur → neysla → hagvöxtur
const okTourRent = tourC.outcomes.leiga.mid[q] > baseline.outcomes.leiga.path[q];
const okRateBal = rateC.outcomes.afkoma.mid[q] < baseline.outcomes.afkoma.path[q]; // hærri vextir → vaxtabyrði → verri afkoma
console.log('+laun→hagvöxtur↑ (neysla):', okKaupGdp, '| +ferðam→leiga↑:', okTourRent, '| +vextir→afkoma↓ (vaxtabyrði):', okRateBal);
// Fjármálastöðugleiki (module 6): vanskil drifin af vöxtum/atvinnuleysi/greiðslubyrði
const tourA = simulate({ baseline, links, shocks: { ferdamenn: -25 }, quarters: 12 });
const okRateArrears = rateC.outcomes.vanskil.mid[q] > baseline.outcomes.vanskil.path[q]; // háir vextir → þyngri byrði → vanskil↑
const okTourArrears = tourA.outcomes.vanskil.mid[q] > baseline.outcomes.vanskil.path[q]; // samdráttur → atvinnuleysi↑ → vanskil↑
const okArrGdp = rateC.outcomes.hagvoxtur.mid[q] < baseline.outcomes.hagvoxtur.path[q]; // fjármála-hraðall magnar hagvaxtar-drag vaxtahækkunar
const okArrBand = [rateC, tourA].every((r) => r.outcomes.vanskil.lo.every((v, i) => v <= r.outcomes.vanskil.mid[i] && r.outcomes.vanskil.mid[i] <= r.outcomes.vanskil.hi[i]));
console.log('+vextir→vanskil↑:', okRateArrears, '| +samdráttur→vanskil↑:', okTourArrears, '| vanskil→hagvöxtur-drag:', okArrGdp, '| vanskil-bönd:', okArrBand);
// Langtíma-hamur (40 ársfj. = 10 ár): viðvarandi útgjöld — allt endanlegt, innan clamp, gild bönd
const long = simulate({ baseline, links, levers: { utgjold: 8 }, shocks: {}, quarters: 40 });
const okLongFinite = Object.values(long.outcomes).every((o) => [o.mid, o.lo, o.hi].every((s) => s.every((v) => Number.isFinite(v))));
const okLongClamp = Object.keys(long.outcomes).every((k) => { const cl = baseline.clamp[k]; return long.outcomes[k].mid.every((v) => v >= cl[0] - 0.01 && v <= cl[1] + 0.01); });
const okLongBand = Object.values(long.outcomes).every((o) => o.lo.every((v, i) => v <= o.mid[i] + 1e-9 && o.mid[i] <= o.hi[i] + 1e-9));
const okLongLen = long.outcomes.skuldir.mid.length === 40;
console.log('langtími(40Q) endanlegt:', okLongFinite, '| innan clamp:', okLongClamp, '| lo≤mið≤hi:', okLongBand, '| lengd 40:', okLongLen);
const bad = !(okDir && okHouse && okGdp && okBand && okFrHouse && okMigHouse && okMigRent && okRateBurden && okHouseBand && okMigPop && okMigLabor && okMigGdp && okFerPop && okDemoBand && okTaxBal && okAdhBal && okDebtAccum && okFiscBand && okKvExp && okOrExp && okOrEmis && okCarbEmis && okResBand && okKaupGdp && okTourRent && okRateBal && okRateArrears && okTourArrears && okArrGdp && okArrBand && okLongFinite && okLongClamp && okLongBand && okLongLen);
process.exit(bad ? 1 : 0);
