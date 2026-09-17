// rsk-kvoti.mjs — EIN regla, ein uppspretta: hvað þýðir 403 frá api.skattur.cloud?
//
// Azure APIM skilar 403 í TVEIMUR ÓSKYLDUM tilvikum og þau má ALDREI rugla saman:
//
//   1) LOKAÐ LÖGFORM — 403 á STAKT félag (t.d. Z3, „not accessible via the Public Api").
//      Eðlilegt svar: félagið er raunverulega lokað. Sleppa því og halda áfram.
//   2) KVÓTI UPPURINN — 403 á ÖLL köll, með „Out of call volume quota" í svarbolnum.
//      Ekkert var mælt. Hvert kall í viðbót er sóun og hver ályktun af svarinu er ósannindi.
//
// ⚠⚠ STAÐAN EIN GREINIR EKKI Á MILLI — aðeins SVARBOLURINN gerir það. Kallandi sem ályktar
//    af stöðunni einni fellir tilvikin saman, og sú samfelling er nákvæmlega bilunin sem
//    kostaði mánaðarkvótann 17.9.2026 (og hefði mengað tengslagrunninn með „ekki til").
//
// Raunmælt svar 17.9.2026, orðrétt:
//   {"statusCode":403,"message":"Out of call volume quota. Quota will be replenished in 14.07:13:56."}
//
// Tveir neytendur, sitt hvorum megin við keyrsluumhverfis-skilin:
//   · web/src/worker/veitur.mjs  (Cloudflare Worker) — varaleið á RSK_KEY2 + merking svars
//   · skriptur/lib/rsk_api.mjs   (Node, nætur-skriðan) — kvóti er banvænn eins og 401

const KVOTA_MERKI = /out of call volume quota|quota will be replenished/i;

/**
 * Satt AÐEINS þegar svarið er uppurinn mánaðarkvóti.
 * Lokað lögform, tóm svör og hraðatakmörkun (429) skila ÖLL ósönnu.
 * @param {number|string} status HTTP-staða svarsins
 * @param {string|null|undefined} body svarbolurinn ÓLESINN — hann er eina sönnunargagnið
 */
export function erKvotaSvar(status, body) {
  if (Number(status) !== 403) return false;
  return KVOTA_MERKI.test(String(body == null ? '' : body));
}
