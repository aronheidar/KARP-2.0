// isn93.mjs — WGS84 (lat, lng) → ISN93 / Lambert 1993 (EPSG:3057), hnitakerfið sem HMS, Þjóðskrá og
// Landmælingar nota (x=austur, y=norður í metrum). Lambert keiluvörpun með tveimur staðalbreiddum (Snyder 1987,
// jöfnur 15-7…15-10). GRS80-sporvala. Notað í build_hnit.js til að varpa heimilisföngum (WGS84 úr staðfangaskrá)
// í sama kerfi og sölu-úrtak HMS (x/y ISN93) fyrir k-NN vörpun heimilisfangs → matssvæði.
//
// Prófað gegn staðfangaskrá (sama röð ber bæði HNIT „POINT (359665 402849)" og N/E_HNIT_WGS84 64.09987002,-21.87914013):
// frávik < 1 m. ISN93↔ISN2016 skekkja er ≤ ~0,3 m á landinu — skiptir engu fyrir k-NN á 100 m grind.

const A = 6378137, F_INV = 298.257222101;            // GRS80
const E2 = 2 / F_INV - 1 / (F_INV * F_INV), E = Math.sqrt(E2);
const D2R = Math.PI / 180;
const LAT0 = 65 * D2R, LON0 = -19 * D2R, LAT1 = 64.25 * D2R, LAT2 = 65.75 * D2R, FE = 500000, FN = 500000;

const mOf = (p) => Math.cos(p) / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
const tOf = (p) => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - E * Math.sin(p)) / (1 + E * Math.sin(p)), E / 2);
const M1 = mOf(LAT1), M2 = mOf(LAT2), T1 = tOf(LAT1), T2 = tOf(LAT2), T0 = tOf(LAT0);
const N = (Math.log(M1) - Math.log(M2)) / (Math.log(T1) - Math.log(T2));
const FF = M1 / (N * Math.pow(T1, N));
const RHO0 = A * FF * Math.pow(T0, N);

/** @returns {[number, number]} [x, y] í metrum (ISN93), eða null ef inntak ógilt */
export function isn93(lat, lng) {
  if (!(lat > 60 && lat < 70 && lng > -30 && lng < -10)) return null;
  const p = lat * D2R, l = lng * D2R;
  const rho = A * FF * Math.pow(tOf(p), N), th = N * (l - LON0);
  return [FE + rho * Math.sin(th), FN + RHO0 - rho * Math.cos(th)];
}
