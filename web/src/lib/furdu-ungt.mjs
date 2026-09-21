// web/src/lib/furdu-ungt.mjs — furðuhagfræði unga fólksins (21.9.2026).
//
// ⚠ Öll stærðfræði greinanna fimm býr HÉR, prófuð í web/test/furdu-ungt.test.mjs, aldrei í .astro.
// Myndböndin (markadsefni/furduhagfraedi-ungt/myndbond.cjs) flytja SÖMU föll inn, svo síða og
// myndband geta ekki sagt tvær ólíkar tölur.

/**
 * Nikótíngjald á púða, kr á hvert gramm vöru. Lög nr. 96/1995, 10. gr. d; fjárhæðirnar komu með
 * lögum nr. 99/2025, 4. gr. Mörkin eru „1 til og með 8 mg/g", „8,1 til og með 12" o.s.frv.
 * ⚠ Gjaldið leggst á UPPGEFINN styrk á umbúðum (sama grein), ekki mældan.
 */
export const NIKOTIN_THREP = [
  { fra: 1, til: 8, krG: 8.30 },
  { fra: 8.1, til: 12, krG: 12.45 },
  { fra: 12.1, til: 16, krG: 15.55 },
  { fra: 16.1, til: 20, krG: 20.75 },
];

/** Þökin þar sem gjaldið stekkur. 20 mg/g er lagalegt hámark, ekki þrep. */
export const THREPAMORK = [8, 12, 16];

/** kr á gramm fyrir styrk í mg/g, eða null utan 1–20 mg/g. */
export function gjaldPerGramm(mgG) {
  if (!(mgG >= 1) || mgG > 20) return null;
  return NIKOTIN_THREP.find((t) => mgG <= t.til).krG;
}

/** Gjald á eina dós, kr. */
export function gjaldADos(mgG, dosG) {
  const k = gjaldPerGramm(mgG);
  return k == null || !(dosG > 0) ? null : k * dosG;
}

/** Sagartönnin: kr á hvert mg nikótíns eftir styrk, í 0,1 mg/g skrefum. */
export function sagartonn({ fra = 1, til = 20 } = {}) {
  const ut = [];
  for (let i = Math.round(fra * 10); i <= Math.round(til * 10); i++) {
    const mgG = i / 10;
    ut.push({ mgG, krMg: gjaldPerGramm(mgG) / mgG });
  }
  return ut;
}

/** Fjöldi púða á hverjum styrk, algengast fyrst. */
export function hillutalning(vorur) {
  const m = new Map();
  for (const v of vorur) m.set(v.mgG, (m.get(v.mgG) || 0) + 1);
  return [...m].map(([mgG, n]) => ({ mgG, n })).sort((a, b) => b.n - a.n || a.mgG - b.mgG);
}

/** Hve margir púðar sitja nákvæmlega á þrepamörkum. Tilgátan var að þeir yrðu margir. */
export const aThrepamorkum = (vorur) => vorur.filter((v) => THREPAMORK.includes(v.mgG)).length;

/**
 * Púðar sem sitja rétt YFIR þrepamörkum (innan 1 mg/g) og hvað það kostar í gjaldi á dós miðað
 * við þakið fyrir neðan. Hópað á styrk og dósarþyngd; verð hóps = miðgildi.
 */
export function rettYfirThrepi(vorur) {
  const hopar = new Map();
  for (const v of vorur) {
    const thak = THREPAMORK.find((t) => v.mgG > t && v.mgG <= t + 1);
    if (thak == null || !(v.dosG > 0)) continue;
    const lykill = `${v.mgG}|${v.dosG}`;
    const h = hopar.get(lykill) || { mgG: v.mgG, dosG: v.dosG, thak, verdin: [] };
    h.verdin.push(v.verd);
    hopar.set(lykill, h);
  }
  return [...hopar.values()].map(({ verdin, ...h }) => {
    const verd = midgildi(verdin);
    const gjald = gjaldADos(h.mgG, h.dosG);
    const gjaldAThaki = gjaldADos(h.thak, h.dosG);
    return {
      ...h, n: verdin.length, verd, gjald, gjaldAThaki,
      aukagjald: gjald - gjaldAThaki,
      aukaNikotin: h.mgG / h.thak - 1,
      hlutfallAfVerdi: verd > 0 ? gjald / verd : null,
    };
  }).sort((a, b) => b.n - a.n);
}

/** Verð á hver 100 mg af koffíni. */
export const koffinKrona = (verd, mg) => (mg > 0 && verd >= 0 ? (verd / mg) * 100 : null);

/** Verð á bolla af uppáhelltu kaffi úr pakka. */
export const kaffibolli = ({ pakkiVerd, pakkiG, gBolli }) => pakkiVerd / (pakkiG / gBolli);

/** Nettó tímakaup þegar enginn tekjuskattur er greiddur: aðeins lífeyrir dreginn frá. */
export const nettoAnSkatts = (brutto, lifeyrir = 0.04) => brutto * (1 - lifeyrir);

/** Mánaðartekjur sem persónuafslátturinn dekkar að fullu (enginn tekjuskattur undir þeim). */
export const skattleysismork = ({ personuafslattur, skattur1, lifeyrir = 0.04 }) =>
  personuafslattur / skattur1 / (1 - lifeyrir);

/** Mínútur af vinnu fyrir vöru. */
export const minutur = (verd, timakaup) => (timakaup > 0 ? (verd / timakaup) * 60 : null);

export function midgildi(tolur) {
  const s = tolur.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/** Tólf HEILIR mánuðir á undan mánuðinum `nu` ('YYYY-MM'). */
export function tolfManudir(nu) {
  const [ar, man] = nu.split('-').map(Number);
  const aftur = (n) => {
    const i = ar * 12 + (man - 1) - n;
    return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  };
  return { fra: aftur(12), til: aftur(1) };
}

/**
 * Miðgildi kaupverðs (kr) úr fasteignaskra/<pn>.json yfir 12 heila mánuði á undan `nu`.
 * ld = 'YYYY-MM' síðustu sölu, lv = kaupverð í þús. kr.
 * ⚠ Skráin geymir SÍÐUSTU sölu hverrar eignar: eign sem seldist tvisvar telst einu sinni.
 */
export function midgildiSolu(rows, { teg, nu }) {
  const { fra, til } = tolfManudir(nu);
  const v = rows.filter((r) => r.teg === teg && r.ld >= fra && r.ld <= til && r.lv > 0).map((r) => r.lv * 1000);
  return { fra, til, n: v.length, midgildi: midgildi(v) };
}

/** Útborgunin talin í íslöttum. */
export function islattarIUtborgun({ verdIbudar, hlutfall, islatteVerd }) {
  const utborgun = verdIbudar * hlutfall;
  const fjoldi = utborgun / islatteVerd;
  return { utborgun, fjoldi, arMedEinumADag: fjoldi / 365 };
}

/** Skilagjald sem hlutfall af verði drykkjar. */
export const skilagjaldHlutfall = (skilagjald, verd) => (verd > 0 ? skilagjald / verd : null);

/** Umbúðir sem skiluðu sér ekki og skilagjaldið sem enginn sótti. */
export function oskilad({ aMarkad, skilad, gjald }) {
  const n = aMarkad - skilad;
  return { n, kr: n * gjald, skilahlutfall: skilad / aMarkad };
}
