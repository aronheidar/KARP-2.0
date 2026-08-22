// postur.mjs — breytir `tilkynna`-færslum úr leikurAsyncCron í tilbúin póst-verk.
// HREIN modúla: engin I/O, enginn D1, enginn Gmail — svo hún sé prófanleg (node:test)
// og svo worker.js sé aðeins límið (sækja netföng → sendGmail).
//
// ⚠⚠ PERSÓNUVERND — LESTU ÁÐUR EN ÞÚ BREYTIR:
// DPIA Viðbót 1 (V1.3) og skóla-DPA (skilmalar.json, dpa-kafli „RÁS-Leikurinn í skólum")
// FULLYRÐA gagnvart skólum að þessir póstar beri:
//   • til ÞÁTTTAKANDA — aðeins leikkóða, umferð, frest og hlekk;
//   • til LEIKSTJÓRA  — það sama + SAMTÖLUR um leikinn (fjölda liða).
// Aldrei liðsheiti, stig, uppgjör né ákvarðanir. `hreinsaFaersla` hendir öllu öðru
// þegjandi svo mistök uppstreymis geti ekki lekið — og prófin festa það.

// Lögun `tilkynna`-færslu úr leikurAsyncCron:
//   { code, round, lokid, laest, phase, naestaLota, nextAt }
//   • round      = lotan sem var GERÐ UPP  → leikstjóra-pósturinn
//   • naestaLota = lotan sem OPNAÐIST      → þátttakenda-pósturinn
//   • nextAt     = frestur nýju lotunnar
/** Leyfðir reitir. Allt annað er hunsað (hvítlisti, ekki svartlisti). */
const LEYFDIR = ['code', 'round', 'naestaLota', 'nextAt', 'lokid', 'laest', 'phase'];

const heilt = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : null);

/** Skilar færslu sem ber EINGÖNGU leyfða reiti — vörn gegn því að liðsheiti/stig fljóti með. */
export function hreinsaFaersla(f) {
  const out = {};
  if (!f || typeof f !== 'object') return out;
  for (const k of LEYFDIR) if (f[k] != null) out[k] = f[k];
  return out;
}

const VIKUDAGAR = ['sunnudag', 'mánudag', 'þriðjudag', 'miðvikudag', 'fimmtudag', 'föstudag', 'laugardag'];
const MANUDIR = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];

/** epoch í sek EÐA ms → ms; ógilt → null. (Sama seiglu-mynstur og í client.mjs.) */
export const tilMs = (v) => { const n = +v; return Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : null; };

/**
 * Frestur á mannamáli fyrir póst: „fimmtudag 28. ágúst kl. 09".
 * Ísland er UTC allt árið (engin sumartímabreyting) svo UTC-reitir eru rétt staðartími.
 * Ógild dagsetning → 'þegar fresturinn rennur út' (ALDREI „undefined" eða „Invalid Date").
 */
export function frestTexti(deadline) {
  const ms = tilMs(deadline);
  if (ms == null) return 'þegar fresturinn rennur út';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return 'þegar fresturinn rennur út';
  const kl = String(d.getUTCHours()).padStart(2, '0') + (d.getUTCMinutes() ? ':' + String(d.getUTCMinutes()).padStart(2, '0') : '');
  return VIKUDAGAR[d.getUTCDay()] + ' ' + d.getUTCDate() + '. ' + MANUDIR[d.getUTCMonth()] + ' kl. ' + kl;
}

/** Hlekkur inn í leikinn. Leikkóði er hreinsaður í A–Z/0–9 svo hann geti ekki borið slóðar-rusl. */
export function leikHlekkur(code, grunnur) {
  const c = String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const g = String(grunnur || 'https://karp.is').replace(/\/+$/, '');
  return g + '/leikur/' + (c ? '?kodi=' + c : '');
}

/**
 * Breytir EINNI `tilkynna`-færslu í póst-verk.
 * Skilar: { code, round, thatttakandi: {id, vars} | null, leikstjori: {id, vars} }
 * — `thatttakandi` er null þegar leiknum lauk (engin ný umferð til að minna á) eða
 *   þegar `naestaLota` vantar; þá fær aðeins leikstjórinn póst um lokauppgjörið.
 */
export function postVerk(faersla, valkostir) {
  const f = hreinsaFaersla(faersla);
  const o = valkostir || {};
  const kodi = String(f.code == null ? '' : f.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const lota = heilt(f.round);
  if (!kodi || lota == null) return null;                 // ónothæf færsla — sleppt, ekki hálfur póstur
  const hlekkur = leikHlekkur(kodi, o.grunnur);
  const lokid = heilt(f.lokid);
  const laest = heilt(f.laest);
  const naesta = heilt(f.naestaLota);
  const endad = f.phase === 'ended';

  return {
    code: kodi,
    round: lota,
    // Þátttakandi: NÝJA umferðin sem opnaðist. Engar samtölur, ekkert um önnur lið.
    thatttakandi: (endad || naesta == null) ? null : {
      id: 'leikur_lota',
      vars: { kodi, lota: naesta, frestur: frestTexti(f.nextAt), hlekkur },
    },
    // Leikstjóri: umferðin sem var GERÐ UPP + samtölur um leikinn.
    leikstjori: {
      id: 'leikur_uppgjor',
      vars: { kodi, lota, lokid: lokid == null ? 0 : lokid, laest: laest == null ? 0 : laest, hlekkur },
    },
  };
}

/** Öll verk úr cron-skilum. Ónothæfar færslur detta út (ekki villa — ein færsla fellir ekki hinar). */
export function postVerkOll(tilkynna, valkostir) {
  if (!Array.isArray(tilkynna)) return [];
  return tilkynna.map((f) => postVerk(f, valkostir)).filter(Boolean);
}
