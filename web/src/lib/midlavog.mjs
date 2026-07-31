// midlavog.mjs — HREIN aðferð til að mæla tón-hlutdrægni fjölmiðla, leiðrétt fyrir efnisvali.
// -----------------------------------------------------------------------------------------
// ⚠ KJARNAVANDINN sem þessi eining leysir:
//   Hrár meðaltónn per miðli mælir EKKI hlutdrægni — hann mælir hvað miðillinn fjallar um.
//   Íþróttamiðill lítur jákvæður út (sigrar), sakamálamiðill neikvæður (glæpir). Að birta
//   hráan tón sem „hlutdrægni" væri einfaldlega rangt.
//
// AÐFERÐ (fastáhrif á efni / within-subject deviation):
//   Fyrir hvert EFNI (aðila) sem ≥2 miðlar fjalla um:
//     frávik(miðill, efni) = meðaltónn miðilsins um efnið − meðaltónn ALLRA um sama efni
//   Vog miðilsins = vegið meðaltal fráviks hans yfir öll efni sem hann fjallar um.
//   Þannig er borið saman EPLI VIÐ EPLI: hvernig fjallar miðillinn um sama efni og hinir?
//
// VARÚÐARREGLUR (svo talan sé ekki hávaði):
//   • lágmark frétta í hverri (miðill, efni)-frumu — annars sveiflast frávikið villt
//   • lágmark ólíkra efna per miðli — annars er vogin byggð á einu máli
//   • efni sem aðeins EINN miðill fjallar um gefur ekkert frávik (ekkert til að bera við)

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {Array<{source:string, entity:string, n:number, tone:number}>} cells
 *        ein lína per (miðill, efni): fjöldi frétta + meðaltónn (−1..1)
 * @param {{minCell?:number, minEntities?:number}} opts
 * @returns {{outlets:Array, entities:number, method:string}}
 *          outlets: [{ s, bias, rawTone, n, entities, sample:[{entity, dev, n}] }]
 *          bias/rawTone eru á kvarða −100..+100 (auðlesnara en −1..1)
 */
export function outletBias(cells, opts = {}) {
  const minCell = opts.minCell > 0 ? opts.minCell : 3;
  const minEntities = opts.minEntities > 0 ? opts.minEntities : 5;
  const rows = (Array.isArray(cells) ? cells : []).filter(
    (c) => c && c.source && c.entity && Number.isFinite(c.n) && Number.isFinite(c.tone) && c.n >= minCell,
  );

  // Efnis-meðaltal: VEGIÐ með fjölda frétta hvers miðils (annars fengi smæsti miðillinn sama vægi).
  const byEnt = new Map();
  for (const c of rows) {
    const e = byEnt.get(c.entity) || { sumW: 0, sumN: 0, srcs: new Set() };
    e.sumW += c.tone * c.n; e.sumN += c.n; e.srcs.add(c.source);
    byEnt.set(c.entity, e);
  }

  const bySrc = new Map();
  let nyttEfni = 0;
  for (const [entity, e] of byEnt) {
    if (e.srcs.size < 2) continue;              // ekkert að bera saman við → sleppt
    nyttEfni++;
    const entMean = e.sumN ? e.sumW / e.sumN : 0;
    for (const c of rows) {
      if (c.entity !== entity) continue;
      const b = bySrc.get(c.source) || { s: c.source, devW: 0, toneW: 0, n: 0, ents: [] };
      b.devW += (c.tone - entMean) * c.n;       // vegið frávik
      b.toneW += c.tone * c.n;                  // hrár tónn (til samanburðar)
      b.n += c.n;
      b.ents.push({ entity, dev: round2((c.tone - entMean) * 100), n: c.n });
      bySrc.set(c.source, b);
    }
  }

  const outlets = [...bySrc.values()]
    .filter((b) => b.ents.length >= minEntities)
    .map((b) => ({
      s: b.s,
      bias: Math.round((b.devW / b.n) * 100),       // −100..+100, leiðrétt fyrir efnisvali
      rawTone: Math.round((b.toneW / b.n) * 100),   // óleiðrétt — sýnir hversu mikið efnisval skekkir
      n: b.n,
      entities: b.ents.length,
      sample: b.ents.slice().sort((x, y) => Math.abs(y.dev) - Math.abs(x.dev)).slice(0, 5),
    }))
    .sort((a, b) => b.bias - a.bias);

  return {
    outlets,
    entities: nyttEfni,
    method: 'Frávik frá meðaltóni allra miðla um SAMA efni, vegið með fjölda frétta. Leiðréttir fyrir ólíku efnisvali miðla.',
  };
}
