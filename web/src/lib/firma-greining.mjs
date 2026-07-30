// firma-greining.mjs — HREIN samantekt á fréttaleit um aðila fyrir /api/firma.
// -----------------------------------------------------------------------------
// Til varð vegna þess að `firmaHandler` skilaði ÓFULLKOMNUM samningi: framendinn
// (frettir.astro) les `stats.sources`, `stats.perDay` og `sentiment.bySource` sem
// vörðurinn sendi ALDREI, og `sentiment.scored` kom sem BÓLSKT gildi þar sem
// framendinn birtir talningu („true tón-greindar"). Það felldi fjögur atriði:
//   • Miðla-KPI sýndi 0 og valkökuritið teiknaðist aldrei (gamla heildarritið sat eftir)
//   • Vog fjölmiðla („bias") birti alltaf „Of lítil umfjöllun"
//   • PDF-skýrslan missti „Dreifing miðla" og tón-per-miðil töfluna þegjandi
// Hér er reikningurinn á EINUM stað, hreinn og prófanlegur.

/** Tónn einnar fréttar telst greindur ef hann er ekki hlutlaus (0). */
const erGreind = (t) => typeof t === 'number' && t !== 0;

/**
 * @param {Array<{title?:string,source?:string,ts?:number,_t?:number}>} items
 * @param {{days?:number, capped?:boolean, limit?:number}} opts
 *        capped=true þýðir að leitin rakst á þakið → `total` er LÁGMARK, ekki heild.
 * @returns {{total:number, capped:boolean, sentiment:object, stats:object}}
 */
export function aggregateFirma(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const days = opts.days > 0 ? opts.days : 180;
  let pos = 0, neg = 0, scored = 0;
  const bySrc = new Map();
  for (const it of list) {
    const t = it && typeof it._t === 'number' ? it._t : 0;
    if (t > 0) pos++; else if (t < 0) neg++;
    if (erGreind(t)) scored++;
    const s = (it && it.source) || '—';
    const b = bySrc.get(s) || { s, n: 0, pos: 0, neg: 0, scored: 0 };
    b.n++;
    if (t > 0) b.pos++; else if (t < 0) b.neg++;
    if (erGreind(t)) b.scored++;
    bySrc.set(s, b);
  }
  // Tónvísitala: byggð á GREINDUM fréttum (hlutlausar þynna hana ekki út).
  const idx = scored ? Math.max(-100, Math.min(100, Math.round((pos - neg) / scored * 100))) : 0;
  const sources = [...bySrc.values()].sort((a, b) => b.n - a.n)
    .map((b) => ({ s: b.s, n: b.n }));
  // bySource: aðeins miðlar með a.m.k. eina tón-greinda frétt → vogin verður marktæk.
  const bySource = [...bySrc.values()]
    .filter((b) => b.scored > 0)
    .sort((a, b) => b.n - a.n)
    .map((b) => ({ s: b.s, n: b.n, scored: b.scored, idx: Math.max(-100, Math.min(100, Math.round((b.pos - b.neg) / b.scored * 100))) }));
  const perDay = days > 0 ? Math.round((list.length / days) * 10) / 10 : null;
  // ⚠ `neu` VERÐUR að fylgja: framendinn reiknar tot = pos + neu + neg. Vantaði það varð
  //   tot = NaN → féll í `|| 1` → súlubreiddir margfalt of stórar OG „undefined hlutlausar".
  //   pos + neu + neg = STÆRÐ SÝNISINS (ekki `total`, sem getur verið hærra við þak).
  const neu = list.length - pos - neg;
  return {
    total: list.length,
    capped: !!opts.capped,
    sentiment: { idx, scored, pos, neg, neu, bySource },
    stats: { sources, perDay, days, sourceCount: sources.length },
  };
}
