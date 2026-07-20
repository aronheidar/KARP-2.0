// Econometrísk kvörðun ROADS — metur lykil-stuðla módelsins með OLS-aðhvarfi á RAUN-röðum 2010–2026
// (í stað handsettra gilda). Ársfjórðungsleg tíðni (samræmist vélinni). Skrifar gogn/roads/calibration.json:
// fyrir hvert tengsl → metinn stuðull, staðalvilla, 95% öryggisbil, R², n + handsett módel-gildi til samanburðar.
// Vélin/módelið er EKKI endurskrifað hér — þetta grundar óvissu-böndin (ci) og sýnir hversu nálægt handsettu
// gildin eru gögnunum. Frelsi frá „bara stílfært": nú stendur talan á reynslu.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = (f) => JSON.parse(readFileSync(join(ROOT, 'gogn', f + '.json'), 'utf8'));
const roads = (f) => JSON.parse(readFileSync(join(ROOT, 'gogn', 'roads', f + '.json'), 'utf8'));
const FROM = '2010-01';
const ym = (s) => s.replace('M', '-').slice(0, 7);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// ── OLS (venjulegar minnstu kvaðrat) með Gauss-Jordan andhverfu → stuðlar + staðalvillur + R² ──
function matInv(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null; // sérstætt
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
function ols(y, X) {
  const n = y.length, k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  const inv = matInv(XtX); if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  let rss = 0; for (let i = 0; i < n; i++) { const yh = X[i].reduce((s, v, j) => s + v * beta[j], 0); rss += (y[i] - yh) ** 2; }
  const my = mean(y); let tss = 0; for (const v of y) tss += (v - my) ** 2;
  const sigma2 = rss / Math.max(1, n - k);
  const se = beta.map((_, j) => Math.sqrt(Math.max(0, sigma2 * inv[j][j])));
  return { beta, se, r2: tss > 0 ? 1 - rss / tss : 0, n, k };
}

// ── Raun-raðir (dagsettar) → ársfjórðungsleg tíðni (samræmist 12-skrefa vélinni) ──
const qi = (ymStr) => { const [Y, M] = ymStr.split('-').map(Number); return Y * 4 + Math.floor((M - 1) / 3); }; // heiltölu-ársfjórðungur
const qlabel = (q) => Math.floor(q / 4) + '.' + ((q % 4) + 1); // "2015.3"
function toQuarterly(series) { // [{t:'YYYY-MM', v}] → Map(qi → meðaltal ársfj.)
  const bins = {}; for (const r of series) if (r.t >= FROM && r.v != null) (bins[qi(r.t)] ||= []).push(r.v);
  const m = new Map(); for (const q in bins) m.set(+q, mean(bins[q])); return m;
}
// aðhvarf: y[q] á regressora (fylki af {map, lag}); skilar OLS + merki
function regress(yMap, regs) {
  const qs = [...yMap.keys()].sort((a, b) => a - b), Y = [], X = [];
  for (const q of qs) {
    const row = [1], xs = regs.map((r) => r.map.get(q - (r.lag || 0)));
    if (xs.some((v) => v == null)) continue;
    row.push(...xs); Y.push(yMap.get(q)); X.push(row);
  }
  if (Y.length < 12) return null;
  return { ...ols(Y, X), span: [qlabel(qs[0]), qlabel(qs[qs.length - 1])] };
}

// Verðbólga (mán yoy úr CPI)
const cpiSeries = g('sedlabanki').datasets.verdbolga.series.find((s) => (s.points || []).length > 24);
const cpi = (cpiSeries?.points || []).map(([d, v]) => ({ t: d.slice(0, 7), v })).filter((r) => r.t >= '2009-01');
const inflArr = []; for (let i = 12; i < cpi.length; i++) if (cpi[i].t >= FROM) inflArr.push({ t: cpi[i].t, v: 100 * (cpi[i].v / cpi[i - 12].v - 1) });
// Atvinnuleysi
const unemp = g('atvinnuleysi').monthly.map((r) => ({ t: ym(r.t), v: r.v })).filter((r) => r.t >= FROM);
// Húsnæðisverð höfuðb./landsb. (mán yoy úr m2)
const fp = g('fasteignir').months.filter((r) => r.m >= FROM);
const yoyH = (key) => { const out = []; for (let i = 12; i < fp.length; i++) { const a = fp[i][key]?.m2, b = fp[i - 12][key]?.m2; if (a && b) out.push({ t: fp[i].m, v: 100 * (a / b - 1) }); } return out; };
const houseHbs = yoyH('hbsv'), houseLand = yoyH('land');
// Stýrivextir (mán meðaltal, lengsta röð)
const rateDs = g('sedlabanki').datasets; let rateSeries = null;
for (const k of ['parvextir', 'reibor', 'vextir_si']) { const s = (rateDs[k]?.series || []).sort((a, b) => (b.points?.length || 0) - (a.points?.length || 0))[0]; if (s && (s.points || []).length > (rateSeries?.points?.length || 0)) rateSeries = s; }
const rateMonthly = {}; (rateSeries?.points || []).forEach(([d, v]) => { const m = d.slice(0, 7); if (m >= FROM && v != null) (rateMonthly[m] ||= []).push(v); });
const rate = Object.entries(rateMonthly).map(([t, vs]) => ({ t, v: mean(vs) }));
// Laun (mán yoy) — dagsett úr vinnumarkadur; mánaðar-merki eru íslensk ("jún 2023") → "2023-06"
const ISM = { jan: '01', feb: '02', mar: '03', apr: '04', 'maí': '05', mai: '05', 'jún': '06', jun: '06', 'júl': '07', jul: '07', 'ágú': '08', agu: '08', sep: '09', okt: '10', 'nóv': '11', nov: '11', des: '12' };
const parseIsMonth = (s) => { const m = String(s).toLowerCase().match(/([a-záíúóéö]+)\s*(\d{4})/); if (!m) return null; const mm = ISM[m[1]]; return mm ? `${m[2]}-${mm}` : null; };
let wages = [];
const wm = g('vinnumarkadur');
if (Array.isArray(wm.WAGE?.months) && Array.isArray(wm.WAGE?.laun)) wages = wm.WAGE.months.map((mo, i) => ({ t: parseIsMonth(mo), v: wm.WAGE.laun[i] })).filter((r) => r.t && r.t >= FROM && r.v != null);

const Q = { infl: toQuarterly(inflArr), unemp: toQuarterly(unemp), hbs: toQuarterly(houseHbs), land: toQuarterly(houseLand), rate: toQuarterly(rate), wage: wages.length ? toQuarterly(wages) : null };

// ── Módel-tengsl til samanburðar ──
const links = roads('links');
const linkOf = (id) => links.find((l) => l.id === id);
const ci95 = (b, se) => [+(b - 1.96 * se).toFixed(3), +(b + 1.96 * se).toFixed(3)];

const out = [];
const add = (id, label, r, coefIdx, modelId, note) => {
  if (!r) { out.push({ id, label, ok: false, note: 'ófullnægjandi gögn' }); return; }
  const b = r.beta[coefIdx], se = r.se[coefIdx], t = se > 0 ? b / se : 0, ml = modelId ? linkOf(modelId) : null;
  const ci = ci95(b, se), mc = ml ? ml.coef : null;
  // dómur: fellur handsett módel-gildi innan 95% öryggisbils matsins? (gögn hafna EKKI gildinu)
  const validated = mc == null ? null : (mc >= ci[0] && mc <= ci[1]);
  out.push({ id, label, coef: +b.toFixed(3), se: +se.toFixed(3), t: +t.toFixed(2), ci, r2: +r.r2.toFixed(2), n: r.n, span: r.span,
    modelId: modelId || null, modelCoef: mc, sig: Math.abs(t) >= 1.96, validated, note });
};

// 1) Verðbólgu-tregða (AR1 ársfj.): π_t = α + ρ·π_{t−1}
add('infl_persist', 'Verðbólgu-tregða (AR1, ársfj.)', regress(Q.infl, [{ map: Q.infl, lag: 1 }]), 1, 'infl_persist',
  'ρ = ársfjórðungsleg sjálffylgni verðbólgu; réttlætir verðbólguvæntinga-lykkjuna.');
// 2) Vextir → húsnæði höfuðb. (töf 8 ársfj. = 2 ár): hbs_t = α + β·rate_{t−8}
add('r_hbs', 'Vextir → húsnæði höfuðb. (semi-teygni, töf 2 ár)', regress(Q.hbs, [{ map: Q.rate, lag: 8 }]), 1, 'r_hbs',
  'β = %-breyting húsnæðisverðs á hverja pp í stýrivöxtum, 2 ára töf. Vænt: neikvætt.');
// 3) Vextir → húsnæði landsb.
add('r_land', 'Vextir → húsnæði landsb. (semi-teygni, töf 2 ár)', regress(Q.land, [{ map: Q.rate, lag: 8 }]), 1, 'r_land',
  'β = %-breyting húsnæðisverðs landsb. á hverja pp í vöxtum, 2 ára töf.');
// 4) Phillips: π_t = α + β·u_t (samtíma) — vænt neikvætt
add('phillips', 'Phillips (verðbólga ~ atvinnuleysi)', regress(Q.infl, [{ map: Q.unemp, lag: 0 }]), 1, null,
  'β = pp verðbólgu á hvert pp atvinnuleysis; halli Phillips-kúrfunnar (til hliðsjónar við launa-svörun).');
// 5) Laun → verðbólga (töf 2 ársfj., stýrt f. tregðu): π_t = α + ρ·π_{t−1} + β·wage_{t−2}
if (Q.wage) add('w_infl', 'Laun → verðbólga (töf 2 ársfj., stýrt f. tregðu)', regress(Q.infl, [{ map: Q.infl, lag: 1 }, { map: Q.wage, lag: 2 }]), 2, 'w_infl',
  'β = pp verðbólgu á hvert pp launavaxtar, 2 ársfj. töf, að teknu tilliti til verðbólgu-tregðu.');
else out.push({ id: 'w_infl', label: 'Laun → verðbólga', ok: false, note: 'engin dagsett launaröð' });

const report = { updated: cpi.length ? cpi[cpi.length - 1].t : null, method: 'OLS á ársfjórðungslegum raun-röðum (Seðlabanki CPI/vextir, VMST atvinnuleysi, Þjóðskrá fasteignaverð, Hagstofa laun)',
  note: 'Til hliðsjónar/grundunar — ekki full kerfis-kvörðun (einstök jöfnu-aðhvörf, mögulegar innbyrðis-tengingar). Grundar óvissu-bönd (ci) og sýnir handsett vs metið.', regressions: out };
writeFileSync(join(ROOT, 'gogn', 'roads', 'calibration.json'), JSON.stringify(report, null, 1));

console.log('ECONOMETRÍSK KVÖRÐUN (OLS, ársfj. 2010–2026):');
for (const r of out) {
  if (r.ok === false) { console.log(`  ${r.id}: — (${r.note})`); continue; }
  console.log(`  ${r.label}: β=${r.coef} (se ${r.se}, t=${r.t}${r.sig ? ' *' : ''}) 95%CI[${r.ci}] R²=${r.r2} n=${r.n}${r.modelCoef != null ? ` | módel=${r.modelCoef}` : ''}`);
}
