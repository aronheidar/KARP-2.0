// Fasi C — Gjaldeyrishöft (LEIK-LAG, snertir EKKI deilda líkanið/hermi). Söguleg hliðstæða: höft sett nóv. 2008,
// afnumin 2015–17. Í leiknum: sjálfkrafa á í KT3 (2008-hrun), afnemanleg frá KT5. Áhrif beitt á uppgjörs-KPI:
//   stöðugleiki (dregur gengi/verðbólgu-öfgar að grunni — hindrar fjármagnsflótta/gengishrun) EN vaxtar-drag
//   (fælir frá erlendri fjárfestingu). Klassísk fórn: öryggi í kreppu vs lokað hagkerfi.
export const HOFT = { autoRound: 3, liftableFrom: 5, growthDrag: -0.5, stabilizeFrac: 0.4 };

// Eru höft virk í tiltekinni umferð? Virk frá autoRound, nema liðið hafi AFNUMIÐ þau í umferð >= liftableFrom.
export function hoftActive(round, liftedAt) {
  if (round < HOFT.autoRound) return false;
  if (liftedAt != null && round >= liftedAt) return false;
  return true;
}

// Fyrsta umferð (>= liftableFrom) þar sem liðið valdi að afnema höft, úr ákvörðunasögu. null ef aldrei.
export function liftedAtRound(history) {
  for (let r = 0; r < history.length; r++) {
    const h = history[r];
    if (h && h.hoftLift && (r + 1) >= HOFT.liftableFrom) return r + 1;
  }
  return null;
}

// Beita höft-áhrifum á uppgjörs-KPI (levels). baselineLevels = grunn-gildi hvers hagvísis (path í lok umferðar).
export function applyHoft(kpis, baselineLevels = {}) {
  const out = { ...kpis };
  const stab = (k) => { if (out[k] != null && baselineLevels[k] != null) out[k] += HOFT.stabilizeFrac * (baselineLevels[k] - out[k]); };
  stab('gengi'); stab('gengi_endo'); stab('verdbolga');   // hindra gengishrun + innflutta verðbólgu
  if (out.hagvoxtur != null) out.hagvoxtur += HOFT.growthDrag;   // fæling fjárfestingar
  return out;
}
