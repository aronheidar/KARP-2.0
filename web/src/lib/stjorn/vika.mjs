// Vikutalning fyrir vikusamantekt starfsfólksins á /stjorn/.
// ÍSLAND ER Á UTC ALLT ÁRIÐ (engin sumartímaskipti), svo UTC-mánudagur 00:00 er íslenskur
// mánudagur 00:00. Þess vegna reiknar einingin EINGÖNGU í UTC og þarf ekkert tímabelti.
// Vikur fylgja ISO 8601: vika hefst á mánudegi, og vika 1 er vikan sem ber fyrsta fimmtudag ársins.
// Hrein eining: engin import, engin Date.now() — tíminn kemur alltaf inn sem viðfang.

const DAGUR = 86400;

/** Mánudagur 00:00 UTC vikunnar sem `ts` (unix-sekúndur) fellur í. */
export function vikuByrjun(ts) {
  const d = new Date(Math.floor(Number(ts)) * 1000);
  const dagur = (d.getUTCDay() + 6) % 7;                      // mán=0 … sun=6
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000) - dagur * DAGUR;
}

/** ISO-vika sem `ts` fellur í: { ar, vika, fra, til } — fra með, til án (hálfopið bil). */
export function isoVika(ts) {
  const fra = vikuByrjun(ts);
  const fimmtudagur = new Date((fra + 3 * DAGUR) * 1000);       // ISO-árið er ár fimmtudagsins
  const ar = fimmtudagur.getUTCFullYear();
  const fyrstiFimmtudagur = Date.UTC(ar, 0, 4) / 1000;          // 4. jan er alltaf í viku 1
  const vika = 1 + Math.round((fra - vikuByrjun(fyrstiFimmtudagur)) / (7 * DAGUR));
  return { ar, vika, fra, til: fra + 7 * DAGUR };
}

/** Síðasta FULLNAÐA vika miðað við `nu`: samantektin er föst alla vikuna og skiptir á mánudegi. */
export function sidastaFullaVika(nu) {
  return isoVika(vikuByrjun(nu) - DAGUR);
}

const MANUDIR = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];

/** „15.–21. september" eða „29. september – 5. október" — til á við síðasta dag vikunnar. */
export function vikuBil(v) {
  const a = new Date(v.fra * 1000), b = new Date((v.til - DAGUR) * 1000);
  return a.getUTCMonth() === b.getUTCMonth()
    ? a.getUTCDate() + '.–' + b.getUTCDate() + '. ' + MANUDIR[b.getUTCMonth()]
    : a.getUTCDate() + '. ' + MANUDIR[a.getUTCMonth()] + ' – ' + b.getUTCDate() + '. ' + MANUDIR[b.getUTCMonth()];
}
