// Morgunkveðja Sigrúnar — EIN setning þegar Aron opnar spjaldið hennar: hvað barst síðan hann leit
// síðast við og hvað bíður hans. Sniðin úr tölum eins og vikusamantektin, aldrei skrifuð af líkani.
// Hrein eining: tíminn, klukkustundin og síðasta heimsókn koma inn sem viðföng.
//
// ÍSLAND ER Á UTC ALLT ÁRIÐ, svo almanaksdagar eru reiknaðir í UTC (sama forsenda og vika.mjs).
// Klukkustundin fyrir kveðjuorðið kemur hins vegar úr vafranum — hún á við þann sem les.

import { eintala } from './vikutexti.mjs';

const DAGUR = 86400;
// Kvenkyn, nefnifall: „beiðni" er kvenkynsorð. Hærri tölur standa sem tölustafir.
const KVK = ['engin', 'ein', 'tvær', 'þrjár', 'fjórar'];
const kvk = (n) => (n >= 0 && n < KVK.length ? KVK[n] : String(n));
// „á mánudaginn": þolfall með greini. getUTCDay(): sun=0 … lau=6.
const VIKUDAGAR = ['sunnudaginn', 'mánudaginn', 'þriðjudaginn', 'miðvikudaginn', 'fimmtudaginn', 'föstudaginn', 'laugardaginn'];
const dagsNr = (ts) => Math.floor(Number(ts) / DAGUR);

/** Kveðjuorð eftir klukkustund lesandans. */
export function kvedjuord(klst) {
  const h = Number(klst);
  return h >= 5 && h < 18 ? 'Góðan daginn' : 'Gott kvöld';
}

/**
 * Tímabilið frá síðustu heimsókn, í lágstöfum svo það standi bæði fremst og aftast:
 * „Í nótt bárust…" og „Ekkert nýtt í nótt".
 */
export function timabil(nu, sidast, klst) {
  const s = Number(sidast);
  if (!Number.isFinite(s) || s <= 0 || s >= nu) return 'síðasta sólarhringinn';
  const bil = dagsNr(nu) - dagsNr(s);
  if (bil <= 0) return 'síðan þú leist við';
  if (bil === 1) {
    // Í gærkvöldi eða seinna og nú er morgunn: það sem barst á milli barst „í nótt".
    const hs = new Date(s * 1000).getUTCHours();
    return Number(klst) < 12 && hs >= 17 ? 'í nótt' : 'síðan í gær';
  }
  if (bil < 7) return 'síðan á ' + VIKUDAGAR[new Date(s * 1000).getUTCDay()];
  return 'á síðustu ' + bil + ' ' + (eintala(bil) ? 'degi' : 'dögum');
}

/** Beiðnir sem bárust eftir `sidast`. Það sem Aron samdi á /stjorn/ er ekki beiðni. */
export function nyjarSidan(listi, sidast, nu) {
  const fra = Number(sidast) > 0 && Number(sidast) < nu ? Number(sidast) : nu - DAGUR;
  return (Array.isArray(listi) ? listi : []).filter((t) => t && Number(t.created) > fra && t.uppruni !== 'stjorn').length;
}

const fyrstiStor = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);

/**
 * @param {{nu:number, sidast:number|null, klst:number, listi:Array, bida:number}} a
 *   sidast = síðasta heimsókn (unix-sek) eða null · klst = klukkustund lesandans
 *   bida = fjöldi raða hennar í „bíður þín" (EIN uppspretta, bidur_thin.mjs)
 */
export function morgunkvedja({ nu, sidast = null, klst = 9, listi = [], bida = 0 } = {}) {
  const n = nyjarSidan(listi, sidast, nu);
  const b = Math.max(0, Math.trunc(Number(bida) || 0));
  const tb = timabil(nu, sidast, klst);
  let s;
  if (!n) {
    s = 'Ekkert nýtt ' + tb + (b ? ', en ' + kvk(b) + ' ' + (eintala(b) ? 'bíður' : 'bíða') + ' þín' : ' og ekkert bíður þín');
  } else {
    s = fyrstiStor(tb) + ' ' + (eintala(n) ? 'barst' : 'bárust') + ' ' + kvk(n) + ' ' + (eintala(n) ? 'ný beiðni' : 'nýjar beiðnir')
      + ' og ' + (b ? kvk(b) + ' ' + (eintala(b) ? 'bíður' : 'bíða') : 'engin bíður') + ' þín';
  }
  return kvedjuord(klst) + '. ' + s + '.';
}
