// Áfalla-viðbragðs-próf fyrir RÁS-herminn: ber saman SPÁÐ viðbragð líkansins (topp-frávik við sögulegt sjokk)
// við RAUN-breytingu. HREINT — engin vél/env. predicted/actual: {kpiKey: tala (frávik/breyting)}.
// Dómur per KPI: átt (sama formerki) + stærðargráða (hlutfall innan [1/3, 3] = trúverðugt). Ekki nákvæmnis-spá.
export function scoreEpisode(predicted = {}, actual = {}) {
  const rows = Object.keys(actual).map((k) => {
    const p = predicted[k], a = actual[k];
    if (p == null || a == null) return { kpi: k, predicted: p, actual: a, dirHit: null, ratio: null, verdict: 'na' };
    const bothTiny = Math.abs(p) < 0.15 && Math.abs(a) < 0.15;         // bæði nálægt núlli → átt telst rétt
    const dirHit = bothTiny || Math.sign(p) === Math.sign(a);
    const ratio = Math.abs(a) < 1e-6 ? null : Math.abs(p) / Math.abs(a);
    const magOk = ratio == null || (ratio >= 1 / 3 && ratio <= 3);
    const verdict = !dirHit ? 'dir-miss' : magOk ? 'good' : (ratio < 1 / 3 ? 'under' : 'over');
    return { kpi: k, predicted: p, actual: a, dirHit, ratio, verdict };
  });
  const scored = rows.filter((r) => r.dirHit != null);
  return {
    rows,
    dirHits: scored.filter((r) => r.dirHit).length,
    goodMag: scored.filter((r) => r.verdict === 'good').length,
    total: scored.length,
  };
}
