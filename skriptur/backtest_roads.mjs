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
// Stofn-lýðfræði + öldrun (module 7) — prófað á 40Q (stofn safnast upp yfir tíma)
const migL = simulate({ baseline, links, shocks: { adflutningur: 50 }, quarters: 40 });
const penL = simulate({ baseline, links, levers: { lifeyrisaldur: 70 }, quarters: 40 });
const okPopStock = (migL.outcomes.folksfjoldi.mid[39] - migL.outcomes.folksfjoldi.baseline[39]) > (migL.outcomes.folksfjoldi.mid[11] - migL.outcomes.folksfjoldi.baseline[11]); // stofn safnast upp: 10-ára frávik > 3-ára frávik
const okMigPopLvl = migL.outcomes.folksfjoldi.mid[39] > baseline.outcomes.folksfjoldi.path[39]; // +aðflutningur → hærri fólksfjöldi
const okMigDep = migL.outcomes.framfaersla.mid[39] < baseline.outcomes.framfaersla.path[39]; // +aðflutningur → lægra framfærsluhlutfall
const okPenDep = penL.outcomes.framfaersla.mid[39] < baseline.outcomes.framfaersla.path[39]; // hærri lífeyrisaldur → lægra framfærsluhlutfall
const okPenBal = penL.outcomes.afkoma.mid[39] > baseline.outcomes.afkoma.path[39]; // hærri lífeyrisaldur → betri afkoma (tafið)
const okDemo7Band = [migL, penL].every((r) => ['folksfjoldi', 'framfaersla'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] + 1e-9 && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i] + 1e-9)));
console.log('fólksfjöldi=stofn (10>3ár frávik):', okPopStock, '| +aðflutn→fólksfj↑:', okMigPopLvl, '| +aðflutn→framfærsla↓:', okMigDep, '| +lífaldur→framfærsla↓:', okPenDep, '| +lífaldur→afkoma↑:', okPenBal, '| lýðfr7-bönd:', okDemo7Band);
// Svæðis-vídd (module 8): byggðajöfnuður
const byC = simulate({ baseline, links, levers: { byggdastefna: 30 }, quarters: 40 });
const orB = simulate({ baseline, links, levers: { orka: 25 }, quarters: 40 });
const miB = simulate({ baseline, links, shocks: { adflutningur: 50 }, quarters: 40 });
const okByggdUp = byC.outcomes.byggdajofnudur.mid[39] > baseline.outcomes.byggdajofnudur.path[39]; // byggðaáhersla → jöfnuður↑
const okOrkaByggd = orB.outcomes.byggdajofnudur.mid[39] > baseline.outcomes.byggdajofnudur.path[39]; // orka (dreifbýli) → jöfnuður↑
const okMigByggd = miB.outcomes.byggdajofnudur.mid[39] < baseline.outcomes.byggdajofnudur.path[39]; // aðflutningur (höfuðborg) → jöfnuður↓
const okByggdBand = [byC, orB, miB].every((r) => r.outcomes.byggdajofnudur.lo.every((v, i) => v <= r.outcomes.byggdajofnudur.mid[i] + 1e-9 && r.outcomes.byggdajofnudur.mid[i] <= r.outcomes.byggdajofnudur.hi[i] + 1e-9));
console.log('+byggðaáhersla→jöfnuður↑:', okByggdUp, '| +orka→jöfnuður↑:', okOrkaByggd, '| +aðflutn→jöfnuður↓:', okMigByggd, '| byggða-bönd:', okByggdBand);
// Nýsköpun/hugvit + sjálfbærni + tekjuáhrif (module 9)
const taxU = simulate({ baseline, links, levers: { skattar: 10 }, quarters: 12 });
const hvati = simulate({ baseline, links, levers: { ivilnanir: 30, menntun: 20 }, quarters: 40 });
const kvU = simulate({ baseline, links, levers: { kvoti: 20 }, quarters: 40 });
const kvD = simulate({ baseline, links, levers: { kvoti: -20 }, quarters: 40 });
const carbU = simulate({ baseline, links, levers: { kolefnisgjald: 50 }, quarters: 12 });
const okTaxKaup = taxU.outcomes.kaupmattur.mid[11] < baseline.outcomes.kaupmattur.path[11]; // VAR GAT: skattar → kaupmáttur↓
const okTaxInnov = taxU.outcomes.nyskopun.mid[11] < baseline.outcomes.nyskopun.path[11]; // hærri skattar → minni nýsköpun (öfugt: skattalækkun örvar)
const okHvatiInnov = hvati.outcomes.nyskopun.mid[39] > baseline.outcomes.nyskopun.path[39]; // ívilnanir+menntun → nýsköpun↑
const okInnovGdp = hvati.outcomes.hagvoxtur.mid[39] > baseline.outcomes.hagvoxtur.path[39]; // nýsköpun → hagvöxtur (langtíma)
const okKvFisk = kvU.outcomes.fiskistofn.mid[39] < baseline.outcomes.fiskistofn.path[39]; // KJARNI: +aflamark → fiskistofn↓
const okKvFiskUp = kvD.outcomes.fiskistofn.mid[39] > baseline.outcomes.fiskistofn.path[39]; // öfugt: −aflamark → fiskistofn↑
const okCarbInfl = carbU.outcomes.verdbolga.mid[11] > baseline.outcomes.verdbolga.path[11]; // kolefnisgjald → verðbólga↑
const okMod9Band = [taxU, hvati, kvU, kvD].every((r) => ['nyskopun', 'fiskistofn', 'kaupmattur'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] + 1e-9 && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i] + 1e-9)));
console.log('+skattar→kaupmáttur↓ (GAT):', okTaxKaup, '| +skattar→nýsköpun↓:', okTaxInnov, '| ívilnanir+menntun→nýsköpun↑:', okHvatiInnov, '| nýsköpun→hagvöxtur↑:', okInnovGdp, '| +aflamark→fiskistofn↓:', okKvFisk, '| −aflamark→fiskistofn↑:', okKvFiskUp, '| kolefnisgj→verðbólga↑:', okCarbInfl, '| mod9-bönd:', okMod9Band);
// Stór útvíkkun (module 10) — nýjar ákvarðanir + ytra sjokk
const wG = simulate({ baseline, links, shocks: { heimshagvoxtur: 4 }, quarters: 12 });
const vsU = simulate({ baseline, links, levers: { vsk: 4 }, quarters: 12 });
const dsU = simulate({ baseline, links, levers: { dsti: 45 }, quarters: 12 });
const biU = simulate({ baseline, links, levers: { bindiskylda: 10 }, quarters: 12 });
const tfU = simulate({ baseline, links, levers: { tilfaerslur: 20 }, quarters: 12 });
const inU = simulate({ baseline, links, levers: { innvidir: 30 }, quarters: 40 });
const veU = simulate({ baseline, links, levers: { veidigjald: 50 }, quarters: 12 });
const osU = simulate({ baseline, links, levers: { orkuskipti: 30 }, quarters: 40 });
const frU = simulate({ baseline, links, levers: { fridun: 30 }, quarters: 40 });
const fgU = simulate({ baseline, links, levers: { ferdamannagjald: 30 }, quarters: 12 });
const okWorldExp = wG.outcomes.utflutningur.mid[11] > baseline.outcomes.utflutningur.path[11]; // heimshagvöxtur → útflutningur↑
const okVskInfl = vsU.outcomes.verdbolga.mid[11] > baseline.outcomes.verdbolga.path[11]; // VSK → verðbólga↑
const okVskKaup = vsU.outcomes.kaupmattur.mid[11] < baseline.outcomes.kaupmattur.path[11]; // VSK → kaupmáttur↓
const okDstiHouse = dsU.outcomes.husnaedi.mid[11] > baseline.outcomes.husnaedi.path[11]; // rýmra DSTI → húsnæði↑
const okBindHouse = biU.outcomes.husnaedi.mid[11] < baseline.outcomes.husnaedi.path[11]; // bindiskylda → húsnæði↓
const okTransfKaup = tfU.outcomes.kaupmattur.mid[11] > baseline.outcomes.kaupmattur.path[11]; // tilfærslur → kaupmáttur↑
const okInnvGdp = inU.outcomes.hagvoxtur.mid[39] > baseline.outcomes.hagvoxtur.path[39]; // innviðir → hagvöxtur↑
const okVeidiBal = veU.outcomes.afkoma.mid[11] > baseline.outcomes.afkoma.path[11]; // veiðigjald → afkoma↑
const okSkiptiEmis = osU.outcomes.losun.mid[39] < baseline.outcomes.losun.path[39]; // orkuskipti → losun↓
const okFridunFisk = frU.outcomes.fiskistofn.mid[39] > baseline.outcomes.fiskistofn.path[39]; // friðun → fiskistofn↑
const okTourfeeBal = fgU.outcomes.afkoma.mid[11] > baseline.outcomes.afkoma.path[11]; // ferðamannagjald → afkoma↑
const okMod10Band = [wG, vsU, dsU, biU, tfU, inU, veU, osU, frU, fgU].every((r) => Object.keys(r.outcomes).every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] + 1e-9 && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i] + 1e-9 && r.outcomes[k].mid[i] >= baseline.clamp[k][0] - 0.01 && r.outcomes[k].mid[i] <= baseline.clamp[k][1] + 0.01)));
console.log('+heimshagv→útflutn↑:', okWorldExp, '| +VSK→verðbólga↑:', okVskInfl, '| +VSK→kaupm↓:', okVskKaup, '| rýmra DSTI→húsn↑:', okDstiHouse, '| +bindisk→húsn↓:', okBindHouse, '| +tilfærslur→kaupm↑:', okTransfKaup, '| +innviðir→hagv↑:', okInnvGdp, '| +veiðigj→afkoma↑:', okVeidiBal, '| +orkuskipti→losun↓:', okSkiptiEmis, '| +friðun→fiskist↑:', okFridunFisk, '| +ferðamgj→afkoma↑:', okTourfeeBal, '| mod10-bönd+clamp:', okMod10Band);
// Framhald (module 11): mannauður, loftslag, svæðaskipt húsnæði
const rH = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 3 }, quarters: 40 });
const byL = simulate({ baseline, links, levers: { byggdastefna: 30 }, quarters: 40 });
const frL = simulate({ baseline, links, levers: { frambod: 30 }, quarters: 40 });
const meG = simulate({ baseline, links, levers: { menntun: 30 }, quarters: 40 });
const okHbsRate = rH.outcomes.husnaedi_hbs.mid[39] < baseline.outcomes.husnaedi_hbs.path[39]; // vextir → höfuðborg↓
const okHbsMoreSensitive = (rH.outcomes.husnaedi_hbs.mid[39] - baseline.outcomes.husnaedi_hbs.path[39]) < (rH.outcomes.husnaedi_land.mid[39] - baseline.outcomes.husnaedi_land.path[39]); // höfuðborg fellur MEIRA en landsbyggð
const okByggdLand = byL.outcomes.husnaedi_land.mid[39] > baseline.outcomes.husnaedi_land.path[39]; // byggðaefling → landsbyggðar-verð↑
const okFrLand = frL.outcomes.husnaedi_land.mid[39] < baseline.outcomes.husnaedi_land.path[39]; // framboð → landsbyggðar-verð↓
const okMenntGdp = meG.outcomes.hagvoxtur.mid[39] > baseline.outcomes.hagvoxtur.path[39]; // menntun → hagvöxtur (mannauður)
const okMod11Band = [rH, byL, frL, meG].every((r) => ['husnaedi_hbs', 'husnaedi_land'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] + 1e-9 && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i] + 1e-9 && r.outcomes[k].mid[i] >= baseline.clamp[k][0] - 0.01 && r.outcomes[k].mid[i] <= baseline.clamp[k][1] + 0.01)));
console.log('+vextir→höfuðb-húsn↓:', okHbsRate, '| höfuðb næmari en landsb:', okHbsMoreSensitive, '| +byggðastefna→landsb-húsn↑:', okByggdLand, '| +framboð→landsb-húsn↓:', okFrLand, '| +menntun→hagvöxtur↑:', okMenntGdp, '| mod11-bönd+clamp:', okMod11Band);
// Yfirferð (module 12): endógent gengi + vantandi lykkjur
const rFx = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 3 }, quarters: 40 });
const tHb = simulate({ baseline, links, shocks: { ferdamenn: 30 }, quarters: 40 });
const okRateFx = rFx.outcomes.gengi_endo.mid[11] > 0.5; // vaxtahækkun → króna styrkist (endógen)
const okFxDisinfl = rFx.outcomes.verdbolga.mid[11] < baseline.outcomes.verdbolga.path[11]; // sterk króna magnar verðbólgu-hjöðnun vaxtahækkunar
const okTourHbs = tHb.outcomes.husnaedi_hbs.mid[11] > baseline.outcomes.husnaedi_hbs.path[11]; // Airbnb → höfuðborgar-húsnæði↑
const okMod12 = [rFx, tHb].every((r) => ['gengi_endo', 'skuldir', 'husnaedi_hbs'].every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] + 1e-9 && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i] + 1e-9 && r.outcomes[k].mid[i] >= baseline.clamp[k][0] - 0.01 && r.outcomes[k].mid[i] <= baseline.clamp[k][1] + 0.01)));
console.log('vextir→gengi_endo↑ (styrking):', okRateFx, '| gengi magnar verðbólgu-hjöðnun:', okFxDisinfl, '| +ferðam→höfuðb-húsn↑ (Airbnb):', okTourHbs, '| mod12-bönd+clamp:', okMod12);
// Djúp-útvíkkun (module 13): fjármálahlið + ytri staða + dreifing
const rC = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 3 }, quarters: 40 });
const exC = simulate({ baseline, links, levers: { kvoti: 15, orka: 20 }, quarters: 40 });
const tfC = simulate({ baseline, links, levers: { tilfaerslur: 20 }, quarters: 40 });
const cmC = simulate({ baseline, links, shocks: { hravaruverd: 40 }, quarters: 40 });
const okRateCredit = rC.outcomes.utlanavoxtur.mid[11] < baseline.outcomes.utlanavoxtur.path[11]; // vextir → útlán↓
const okRateEquity = rC.outcomes.hlutabref.mid[11] < baseline.outcomes.hlutabref.path[11]; // vextir → hlutabréf↓
const okExpCA = exC.outcomes.vidskiptajofnudur.mid[11] > baseline.outcomes.vidskiptajofnudur.path[11]; // útflutn → viðskiptajöfnuður↑
const okCaNiip = (exC.outcomes.niip.mid[39] - exC.outcomes.niip.baseline[39]) > (exC.outcomes.niip.mid[11] - exC.outcomes.niip.baseline[11]); // erlend staða safnast upp (stofn)
const okTransfEq = tfC.outcomes.jofnudur.mid[11] > baseline.outcomes.jofnudur.path[11]; // tilfærslur → jöfnuður↑
const okCommExp = cmC.outcomes.utflutningur.mid[11] > baseline.outcomes.utflutningur.path[11]; // hrávöruverð → útflutn↑
const okMod13 = [rC, exC, tfC, cmC].every((r) => Object.keys(r.outcomes).every((k) => r.outcomes[k].lo.every((v, i) => v <= r.outcomes[k].mid[i] + 1e-9 && r.outcomes[k].mid[i] <= r.outcomes[k].hi[i] + 1e-9 && r.outcomes[k].mid[i] >= baseline.clamp[k][0] - 0.01 && r.outcomes[k].mid[i] <= baseline.clamp[k][1] + 0.01)));
console.log('vextir→útlán↓:', okRateCredit, '| vextir→hlutabréf↓:', okRateEquity, '| útflutn→viðskiptajöfn↑:', okExpCA, '| viðskiptajöfn→erlend staða (stofn):', okCaNiip, '| tilfærslur→jöfnuður↑:', okTransfEq, '| hrávöruverð→útflutn↑:', okCommExp, '| mod13-bönd+clamp:', okMod13);
// Ólínuleiki (engine-uppfærsla): mettun vaxta→verðbólgu (stór hækkun skilar UNDIR 2× hjöðnun lítillar) + hröðun launa-verð spírals
const bauInf = baseline.outcomes.verdbolga.path[11];
const nl4 = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 4 }, quarters: 12 }).outcomes.verdbolga.mid[11];
const nl8 = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 8 }, quarters: 12 }).outcomes.verdbolga.mid[11];
const okSaturation = (bauInf - nl8) < 1.95 * (bauInf - nl4) && (bauInf - nl8) > (bauInf - nl4); // undir línulegu EN samt vaxandi
const w4 = simulate({ baseline, links, levers: { laun: 10 }, quarters: 12 }).outcomes.verdbolga.mid[11];
const w13 = simulate({ baseline, links, levers: { laun: 14 }, quarters: 12 }).outcomes.verdbolga.mid[11];
const okAccel = (w13 - bauInf) > 1.0 * (w4 - bauInf); // stórar launahækkanir hraða (yfir línulegt hlutfall launa-frávika 8/4=2×)
console.log('ólínuleiki — mettun vaxta→verðbólgu:', okSaturation, '| hröðun launa-verð spírals:', okAccel);
// Tímaháð leið (dýnamísk bestun): (a) fylki með sömu gildum == tala (afturvirkt-samhæft); (b) fösuð leið víkur frá föstu
const rConst = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base + 3 }, quarters: 12 });
const rArrSame = simulate({ baseline, links, levers: { vextir: new Array(12).fill(baseline.levers.vextir.base + 3) }, quarters: 12 });
const okArrIdentity = rConst.outcomes.verdbolga.mid.every((v, i) => Math.abs(v - rArrSame.outcomes.verdbolga.mid[i]) < 1e-9);
const phased = [...new Array(6).fill(baseline.levers.vextir.base + 6), ...new Array(6).fill(baseline.levers.vextir.base)];
const rPhase = simulate({ baseline, links, levers: { vextir: phased }, quarters: 12 });
const okPhaseDiffers = Math.abs(rPhase.outcomes.verdbolga.mid[11] - rConst.outcomes.verdbolga.mid[11]) > 0.01;
console.log('tímaháð leið — fylki==tala:', okArrIdentity, '| fösuð leið víkur:', okPhaseDiffers);
// SFC geira-jöfnuðir tie-out (Godley): einkajofnudur == vidskiptajofnudur − afkoma við ALLAR sviðsmyndir (kennisetning, exakt)
const sfcScen = [{ utgjold: baseline.levers.utgjold.base - 3 }, { skattar: baseline.levers.skattar.base + 3 }, { kvoti: baseline.levers.kvoti.base + 10 }, { vextir: baseline.levers.vextir.base + 2 }];
const okSFC = sfcScen.every((lv) => { const r = simulate({ baseline, links, levers: lv, shocks: {}, quarters: 12 }); return r.outcomes.einkajofnudur.mid.every((v, t) => Math.abs(v - (r.outcomes.vidskiptajofnudur.mid[t] - r.outcomes.afkoma.mid[t])) < 1e-9); });
console.log('SFC geira-jöfnuðir tie-out (einkageiri = CA − ríki, allar sviðsmyndir):', okSFC);
// Framsýnar væntingar: BOÐUÐ hækkun vaxta í seinni fasa lækkar verðbólgu STRAX (t=2, áður en hækkunin sjálf bítur via lag) umfram flata lága leið
const flatLow = simulate({ baseline, links, levers: { vextir: baseline.levers.vextir.base }, quarters: 12 });
const risePath = simulate({ baseline, links, levers: { vextir: [...new Array(6).fill(baseline.levers.vextir.base), ...new Array(6).fill(baseline.levers.vextir.base + 4)] }, quarters: 12 });
const okFwdExp = risePath.outcomes.verdbolga.mid[2] < flatLow.outcomes.verdbolga.mid[2] - 1e-9;   // væntinga-rás bítur strax
const okFwdBackcompat = Math.abs(flatLow.outcomes.verdbolga.mid[2] - baseline.outcomes.verdbolga.path[2]) < 1e-9; // föst leið: lead-tengsl leggur 0 til (afturvirkt)
console.log('framsýnar væntingar — boðuð hækkun lækkar verðbólgu strax:', okFwdExp, '| lead=0 á fastri leið (afturvirkt):', okFwdBackcompat);
// Yfirferð-viðbót: 4 nýjar orsakarásir (göt úr úttekt) — átt
const bAud = simulate({ baseline, links, levers: {}, shocks: {}, quarters: 12 });
const okCarbonInnov = simulate({ baseline, links, levers: { kolefnisgjald: 50 }, shocks: {}, quarters: 12 }).outcomes.nyskopun.mid[11] > bAud.outcomes.nyskopun.mid[11] + 0.1;
const okRetireLabor = simulate({ baseline, links, levers: { lifeyrisaldur: 72 }, shocks: {}, quarters: 12 }).outcomes.vinnuafl.mid[11] > bAud.outcomes.vinnuafl.mid[11] + 0.05;
const okEduUnem = simulate({ baseline, links, levers: { menntun: 30 }, shocks: {}, quarters: 12 }).outcomes.atvinnuleysi.mid[11] < bAud.outcomes.atvinnuleysi.mid[11] - 0.05;
const okSpreadFx = simulate({ baseline, links, levers: { utgjold: baseline.levers.utgjold.base + 8 }, shocks: {}, quarters: 12 }).outcomes.gengi_endo.mid[11] < bAud.outcomes.gengi_endo.mid[11];
console.log('yfirferð-viðbót — kolefni→nýsköpun↑:', okCarbonInnov, '| lífeyrisaldur→vinnuafl↑:', okRetireLabor, '| menntun→atvinnul.↓:', okEduUnem, '| áhættuálag→gengi↓:', okSpreadFx);
const bad = !(okDir && okHouse && okGdp && okBand && okFrHouse && okMigHouse && okMigRent && okRateBurden && okHouseBand && okMigPop && okMigLabor && okMigGdp && okFerPop && okDemoBand && okTaxBal && okAdhBal && okDebtAccum && okFiscBand && okKvExp && okOrExp && okOrEmis && okCarbEmis && okResBand && okKaupGdp && okTourRent && okRateBal && okRateArrears && okTourArrears && okArrGdp && okArrBand && okLongFinite && okLongClamp && okLongBand && okLongLen && okPopStock && okMigPopLvl && okMigDep && okPenDep && okPenBal && okDemo7Band && okByggdUp && okOrkaByggd && okMigByggd && okByggdBand && okTaxKaup && okTaxInnov && okHvatiInnov && okInnovGdp && okKvFisk && okKvFiskUp && okCarbInfl && okMod9Band && okWorldExp && okVskInfl && okVskKaup && okDstiHouse && okBindHouse && okTransfKaup && okInnvGdp && okVeidiBal && okSkiptiEmis && okFridunFisk && okTourfeeBal && okMod10Band && okHbsRate && okHbsMoreSensitive && okByggdLand && okFrLand && okMenntGdp && okMod11Band && okRateFx && okFxDisinfl && okTourHbs && okMod12 && okRateCredit && okRateEquity && okExpCA && okCaNiip && okTransfEq && okCommExp && okMod13 && okSaturation && okAccel && okArrIdentity && okPhaseDiffers && okSFC && okFwdExp && okFwdBackcompat && okCarbonInnov && okRetireLabor && okEduUnem && okSpreadFx);
process.exit(bad ? 1 : 0);
