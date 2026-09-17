// verdbil.mjs — verðbil fyrir allt.is-gluggann. Engin I/O.
//
// ⚠⚠ ÞETTA ER EINA LEIÐIN AÐ BILINU. Freistingin er að nota `lo`/`hi` úr metaUrSolusogu því þau
// líta út eins og bil. Þau eru það ekki. Þau eru fjórðungsbil SAMBÆRILEGRA eigna, 8,2% breitt að
// miðgildi, og raunverulegt söluverð lendir innan þeirra í aðeins 35,4% tilvika (mælt 17.9.2026).
// Bil sem er rangt tvisvar af hverjum þremur má ekki standa á vef fasteignasala.
//
// Bilið hér er punktmat ± 10%, kvarðað úr bakprófi á Reykjanesi (580 sölur, miðgildisskekkja 4,8%).
// ±10% hittir 79,3%, og þess vegna má orðalagið segja „fjórum af hverjum fimm".
//
// ⚠ Fallið skilar ENGRI miðgildistölu. Það er viljandi. Aron valdi bil en ekkert punktmat, því ein
// ákveðin tala á vef fasteignasala festir væntingar seljanda og svo þarf fasteignasalinn að rífast
// við okkar tölu. Ef talan er ekki í svarinu getur viðmótið ekki sýnt hana fyrir slysni síðar.

export const BIL_HLUTFALL = 0.10;
export const BIL_ORDALAG = 'Rétt í fjórum af hverjum fimm tilvikum.';

/**
 * @param {number} ppm  áætlað verð á fermetra (úr metaUrSolusogu `.m`)
 * @param {number} fm   stærð eignarinnar
 * @returns {{lagt:number, hatt:number, ordalag:string}|null}
 */
export function verdbil(ppm, fm) {
  const p = Number(ppm), f = Number(fm);
  if (!Number.isFinite(p) || !Number.isFinite(f) || p <= 0 || f <= 0) return null;
  const heild = p * f;
  return {
    lagt: Math.round(heild * (1 - BIL_HLUTFALL)),
    hatt: Math.round(heild * (1 + BIL_HLUTFALL)),
    ordalag: BIL_ORDALAG,
  };
}
