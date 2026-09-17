// gogn-gatt.mjs — hvaða greiddu heimild þarf til að sækja /gogn/{eigendur,arsreikningar,stjorn}/<kt>.json.
//
// ⚠⚠ ÞETTA ER GREIÐSLUVEGGUR OG PII-VÖRN Í EINU. Þessi gögn voru einu sinni borin fram ÓGÁTUÐ og
// lóku fullri eigenda-PII framhjá 990-veggnum (sjá [[karp-cloudflare-auth-migration]], F8). Dregið
// hingað út úr worker.js svo reglan sé prófanleg í stað þess að liggja inni í leiðarvalinu.
//
// ⚠ `gognGattLyklar` skilar NULL fyrir óþekkta tegund, ekki tómu fylki. Tómt fylki þýðir „engin
// skilyrði" og kallandi sem lykkjar yfir það hleypir öllum í gegn. Null neyðir hann til að hafna.

/** Nákvæmlega þær þrjár möppur sem eru gátaðar. Sýnishorn (_synishorn.json) falla viljandi utan. */
export const GOGN_GATT_MYNSTUR = /^\/gogn\/(eigendur|arsreikningar|stjorn)\/(\d{6,10})\.json$/;

/**
 * Heimildir sem DUGA fyrir gagnasettið (OR-samband — ein þeirra nægir).
 *
 * `stjorn` tekur BÁÐAR skýrslurnar. Fyrirtækjaskýrslan hefur alltaf borið stjórnina, en
 * endanlegra-eigenda-skýrslan ber líka stjórnendahluta og þarf því sömu skrá. Fram að 17.9.2026
 * krafðist hún `fyrirtaeki:<kt>` einnar, svo sá sem keypti eigendaskýrsluna fékk 403 á stjórnina
 * í sinni eigin skýrslu. Það sást ekki fyrr en lifandi RSK-kallið féll, því þangað til sótti
 * skýrslan stjórnina þaðan og leit aldrei á skrána.
 *
 * Þetta víkkar ekki aðganginn í reynd: `/api/tengslanet` ber sömu stjórn fram við hvern innskráðan
 * notanda sem er, svo greidd heimild er þrengra skilyrði en það sem þegar gilti.
 *
 * @returns {string[]|null} lyklar sem duga, eða null sé tegundin óþekkt (kallandi VERÐUR að hafna).
 */
export function gognGattLyklar(tegund, kt) {
  const id = String(kt == null ? '' : kt).trim();
  if (!id) return null;
  if (tegund === 'eigendur') return ['eigendur:' + id];
  if (tegund === 'arsreikningar') return ['fyrirtaeki:' + id];
  if (tegund === 'stjorn') return ['fyrirtaeki:' + id, 'eigendur:' + id];
  return null;
}
