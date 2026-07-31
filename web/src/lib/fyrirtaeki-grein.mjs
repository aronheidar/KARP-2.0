// Samanburður félags við atvinnugrein (F2) — hrein lógík, notuð BÆÐI af lánshæfis-þættinum
// (±4/−5 í [fyrirtaeki-lanshaefi.mjs]) og af samanburðar-kassanum á fyrirtækjaprófílnum.
// Áður var lengsta-forskeytis-lykkjan og samanburðarreglan afrituð í báðum stöðum í fyrirtaeki.astro.
import { sectorsFromMap, sectorForIsat } from './atvinnugrein.mjs';

// Greinar-viðmið fyrir ÍSAT-kóða. Byggir á prófaða `sectorForIsat` (virðir „án X"-útilokanir) og
// skilar sama hráa KPI-hlut og áður (label/ar + lykiltölur). Fellur á heildar-viðmið hagkerfisins.
export function veljaGrein(map, heild, isat) {
  const digits = String(isat == null ? '' : isat).replace(/\D/g, '');
  if (!digits || !map) return null;
  const s = sectorForIsat(sectorsFromMap(map), digits);
  return s ? s.kpi : (heild || null);
}

// Er gildi félagsins betra en greinar-viðmiðið? null ef annað hvort vantar.
// ⚠ Fyrir „lægra er betra" (skuldir/eigið fé) telst NEIKVÆTT gildi ALDREI betra: neikvætt D/E
// merkir neikvætt eigið fé — versta staða sem til er — en reiknaðist áður sem „langt undir viðmiði"
// og gaf félaginu bæði grænt strik í kassanum og stig upp í lánshæfismatinu.
export function betriEnGrein(gildi, vidmid, haerraBetra) {
  if (gildi == null || vidmid == null) return null;
  return haerraBetra ? gildi >= vidmid : (gildi >= 0 && gildi <= vidmid);
}

// Mælikvarðarnir sem lánshæfis-þátturinn telur: [lykill í KPI félagsins, lykill í greinar-viðmiði, hærra-betra].
// Kassinn á prófílnum sýnir fleiri raðir (EBIT-hlutfall, tekjur á starfsmann) — þátturinn telur þessa fimm,
// og skýringartextinn hans telur þá upp, svo munurinn er ætlaður.
export const GREIN_MAELIKVARDAR = [
  ['framlegd', 'framlegd', true],
  ['hagnhlutf', 'hagnadarhlutfall', true],
  ['eiginfjarhlutf', 'eiginfjarhlutfall', true],
  ['eignavelta', 'eignavelta', true],
  ['de', 'skuldahlutfall_DE', false],
];

// F2-stig: hlutfall mælikvarða yfir greinar-viðmiði → +4 / 0 / −5. null ef of fáir samanburðarhæfir.
export function greinStig(k, S) {
  if (!k || !S) return null;
  const cmp = GREIN_MAELIKVARDAR.map(([kk, sk, hi]) => [k[kk], S[sk], hi]).filter((x) => x[0] != null && x[1] != null);
  if (cmp.length < 3) return null;          // of þunnur grunnur til að álykta nokkuð
  const better = cmp.filter((x) => betriEnGrein(x[0], x[1], x[2])).length;
  const ratio = better / cmp.length;
  const delta = ratio >= 0.6 ? 4 : ratio <= 0.34 ? -5 : 0;
  return { better, alls: cmp.length, ratio, delta, status: delta > 0 ? 'g' : delta < 0 ? 'o' : 'n' };
}
