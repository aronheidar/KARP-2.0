// skriptur/lib/sveitarfelog_pop.mjs — íbúafjöldi eftir sveitarfélagi úr Hagstofu MAN02005.
//
// Skilar SAMA flata sniði og gogn/sveitarfelog_pop.json hefur alltaf haft ({ nafn: íbúar }), því sjö
// neytendur (kort, mitt-svæði, sveitarfélagasíður, topplistar, build_atvinnuleysi, build_sveitarfelog_fin)
// lesa það beint.

/**
 * Opinber heiti Hagstofu → stuttnefnin sem ÖLL gagnasöfn Karp nota (sveitarfelog_meta, coords, rev,
 * atvinnuleysi). ⚠ Kortaskráin (sveitarfelog_adm2) notar opinberu heitin; sá munur felldi þessi tvö
 * sveitarfélög út af atvinnuleysiskortinu („19/21 mátast").
 */
export const STUTTNEFNI = { 'Hafnarfjarðarkaupstaður': 'Hafnarfjörður', 'Seltjarnarnesbær': 'Seltjarnarnes' };

/**
 * Þýðir yfir á stuttnefni og heldur aðeins sveitarfélögum sem eru á aðallista Karp (sveitarfelog_meta),
 * svo neytendur sem fletta upp í öðrum skrám fái aldrei nafn sem þær þekkja ekki.
 */
export function samraemaNofn(pop, adallisti) {
  const listi = new Set(adallisti);
  const ut = {}; const utan = [];
  for (const [nafn, v] of Object.entries(pop)) {
    const k = STUTTNEFNI[nafn] || nafn;
    if (listi.has(k)) ut[k] = v; else utan.push(nafn);
  }
  return { pop: ut, utan, vantar: adallisti.filter((k) => !(k in ut)) };
}

/** Lýsigögn + PxWeb-svar → { sveitarfélag: íbúar }. Svarið ber kóða; nöfnin koma úr lýsigögnunum. */
export function ibuarEftirSveitarfelogum(meta, svar) {
  const sv = meta.variables.find((v) => v.code === 'Sveitarfélag');
  const nafn = new Map(sv.values.map((c, i) => [c, sv.valueTexts[i]]));
  const ut = {};
  for (const d of svar.data || []) {
    const n = nafn.get(d.key[0]);
    const v = Number(d.values[0]);
    if (!n || n === 'Alls' || !Number.isFinite(v)) continue;
    ut[n] = v;
  }
  return ut;
}
