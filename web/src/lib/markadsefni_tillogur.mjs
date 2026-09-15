// markadsefni_tillogur.mjs — HREIN eining: hvað er óvenju fyrirferðarmikið í umfjöllun vikunnar, og
// hvaða KARP-tala talar inn í það.
//
// ⚠ Mælikvarðinn er HLUTFALL, ekki fjöldi. „Þrjátíu greinar um verðbólgu" er venjuleg vika og engin
//   frétt; „þrefalt venjulegt um sjávarútveg" er tilefni. Fjöldi einn og sér myndi alltaf skila sömu
//   fjórum málefnum og tillagan yrði gagnslaus.
import { matchNews } from './lobbyvakt.mjs';

/** Málefni → KARP-vara sem á RAUNVERULEGA tölu um það. Málefni sem vantar hér fær enga tillögu —
 *  betra að þegja en að stinga upp á efni sem við getum ekki stutt með okkar eigin gögnum. */
export const VORUKORT = {
  'Sjávarútvegur': { vara: 'Kvótavaktin', slod: '/kvotavaktin/', tala: 'samþjöppun aflamarks — hlutur tíu stærstu' },
  'Fiskveiðar': { vara: 'Kvótavaktin', slod: '/kvotavaktin/', tala: 'samþjöppun aflamarks — hlutur tíu stærstu' },
  'Ríkisfjármál': { vara: 'Fjárlagagögnin', slod: '/rikisfjarmal/', tala: 'afkoma ríkissjóðs og skuldaþróun' },
  'Fjárlög': { vara: 'Fjárlagagögnin', slod: '/rikisfjarmal/', tala: 'afkoma ríkissjóðs og skuldaþróun' },
  'Skattar': { vara: 'Skattasíðan', slod: '/skattar/', tala: 'skattbyrði eftir tekjuhópum' },
  'Verðbólga': { vara: 'Vaxtasíðan', slod: '/vextir/', tala: 'verðbólga og stýrivextir í samhengi' },
  'Húsnæðismál': { vara: 'Fasteignavaktin', slod: '/fasteignaverd/', tala: 'fermetraverð eftir hverfum' },
  'Fasteignamarkaður': { vara: 'Fasteignavaktin', slod: '/fasteignaverd/', tala: 'fermetraverð eftir hverfum' },
  'Opinber innkaup': { vara: 'Útboðsvaktin', slod: '/utbod/', tala: 'umfang útboða og hverjir hreppa þau' },
  'Vinnumarkaður': { vara: 'Vinnumarkaðssíðan', slod: '/vinnumarkadur/', tala: 'atvinnuleysi eftir landshlutum' },
};
export function pararVidVoru(nafn) {
  return (typeof nafn === 'string' && Object.prototype.hasOwnProperty.call(VORUKORT, nafn)) ? VORUKORT[nafn] : null;
}

/** Hvaða málefni eru óvenju fyrirferðarmikil í glugganum miðað við eigin grunnlínu safnsins.
 *  `lagmark` ver gegn hávaða: þrjár greinar sem stökkva úr einni eru ekki tilefni. */
export function heitMalefni(frettir, malefni, { nu = 0, gluggi = 7, vidmid = 90, lagmark = 5 } = {}) {
  const f = Array.isArray(frettir) ? frettir : [];
  const m = Array.isArray(malefni) ? malefni : [];
  if (!f.length || !m.length) return [];
  const nuS = Number(nu) || 0;
  const fraGluggi = nuS - gluggi * 86400, fraVidmid = nuS - vidmid * 86400;
  const ut = [];
  for (const mal of m) {
    if (!mal || !Array.isArray(mal.a) || !mal.a.length) continue;
    let vika = 0, allt = 0;
    for (const frett of f) {
      const ts = Number(frett && frett.ts) || 0;
      if (ts < fraVidmid || ts > nuS) continue;
      if (!matchNews(frett, mal.a)) continue;
      allt++;
      if (ts >= fraGluggi) vika++;
    }
    if (vika < lagmark) continue;
    // Grunnlína = meðalvika yfir viðmiðunartímann. Gólf á 0,5 svo nýtt málefni (engin saga) verði ekki
    // með óendanlegt hlutfall og troðist alltaf efst.
    const grunnlina = Math.max(0.5, (allt / vidmid) * gluggi);
    ut.push({ malefni: mal.n, flokkur: mal.f, um: mal.um, vika, allt, hlutfall: Math.round((vika / grunnlina) * 10) / 10 });
  }
  return ut.sort((a, b) => b.hlutfall - a.hlutfall);
}

/** Heit málefni → áþreifanlegar tillögur. Sleppir því sem við höfum þegar birt um nýlega. */
export function tillogur(heitt, safn, nu, { nylegtDagar = 30, mest = 3 } = {}) {
  const h = Array.isArray(heitt) ? heitt : [];
  const s = Array.isArray(safn) ? safn : [];
  const nuS = Number(nu) || 0;
  const nylegt = new Set(s.filter((v) => v && v.efnistok && Number(v.birt) > nuS - nylegtDagar * 86400).map((v) => v.efnistok));
  const ut = [];
  for (const x of h) {
    if (!x || nylegt.has(x.malefni)) continue;
    const vara = pararVidVoru(x.malefni);
    if (!vara) continue;   // engin tala = engin tillaga
    ut.push({
      malefni: x.malefni, hlutfall: x.hlutfall, vika: x.vika,
      vara: vara.vara, slod: vara.slod, tala: vara.tala,
      rok: 'Umfjöllun um ' + (x.um || x.malefni) + ' er ' + String(x.hlutfall).replace('.', ',') + '× venjuleg þessa vikuna ('
        + x.vika + ' greinar). Við eigum töluna: ' + vara.tala + '.',
    });
    if (ut.length >= mest) break;
  }
  return ut;
}
