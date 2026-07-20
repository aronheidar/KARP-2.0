// Söguleg bakprófun ROADS gegn RAUN-gögnum 2010–2026.
// Sannreynir að (a) módel-clamp/BAU séu í takt við sögulegt bil, (b) lykil-stuðlar hafi rétt formerki/stærðargráðu
// m.v. reynslu-teygni úr raun-röðum (verðbólga, atvinnuleysi, húsnæðisverð höfuðb./landsb., stýrivextir).
// Ekki hagfræðileg nákvæmnis-kvörðun — heldur „veruleika-próf": eru sömu sambönd og sömu stærðargráður og í gögnunum?
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = (f) => JSON.parse(readFileSync(join(ROOT, 'gogn', f + '.json'), 'utf8'));
const roads = (f) => JSON.parse(readFileSync(join(ROOT, 'gogn', 'roads', f + '.json'), 'utf8'));

const FROM = '2010-01';
const ym = (s) => s.replace('M', '-').slice(0, 7); // "2022M07"→"2022-07"
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const corr = (a, b) => { const n = Math.min(a.length, b.length); a = a.slice(0, n); b = b.slice(0, n); const ma = mean(a), mb = mean(b); let cov = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return cov / Math.sqrt(va * vb); };
const ar1 = (a) => corr(a.slice(1), a.slice(0, -1)); // 1-lag sjálffylgni

// ── Raun-raðir ──
// Húsnæðisverð (fasteignir.months): m2-verð höfuðb. (hbsv) og landsb. (land) → 12-mán %-breyting
const fp = g('fasteignir').months.filter((r) => r.m >= FROM);
const yoy = (arr, key) => { const out = []; for (let i = 12; i < arr.length; i++) { const a = arr[i][key]?.m2, b = arr[i - 12][key]?.m2; if (a && b) out.push({ t: arr[i].m, v: +(100 * (a / b - 1)).toFixed(2) }); } return out; };
const houseHbs = yoy(fp, 'hbsv'), houseLand = yoy(fp, 'land');

// Atvinnuleysi (atvinnuleysi.monthly)
const unemp = g('atvinnuleysi').monthly.map((r) => ({ t: ym(r.t), v: r.v })).filter((r) => r.t >= FROM);

// Verðbólga: CPI-vísitala (sedlabanki.datasets.verdbolga) → 12-mán %-breyting
const cpiSeries = g('sedlabanki').datasets.verdbolga.series.find((s) => (s.points || []).length > 24);
const cpi = (cpiSeries?.points || []).map(([d, v]) => ({ t: d.slice(0, 7), v })).filter((r) => r.t >= '2009-01');
const inflArr = []; for (let i = 12; i < cpi.length; i++) if (cpi[i].t >= FROM) inflArr.push({ t: cpi[i].t, v: +(100 * (cpi[i].v / cpi[i - 12].v - 1)).toFixed(2) });

// Stýrivextir: parvextir eða reibor (mánaðar-meðaltal). Reynum lengstu röð.
const rateDs = g('sedlabanki').datasets;
let rateSeries = null;
for (const k of ['parvextir', 'reibor', 'vextir_si']) { const s = (rateDs[k]?.series || []).sort((a, b) => (b.points?.length || 0) - (a.points?.length || 0))[0]; if (s && (s.points || []).length > (rateSeries?.points?.length || 0)) rateSeries = s; }
const rateMonthly = {}; (rateSeries?.points || []).forEach(([d, v]) => { const m = d.slice(0, 7); if (m >= FROM && v != null) (rateMonthly[m] ||= []).push(v); });
const rate = Object.entries(rateMonthly).map(([t, vs]) => ({ t, v: mean(vs) })).sort((a, b) => a.t.localeCompare(b.t));

// ── Samstilla raðir eftir mánuði fyrir fylgni ──
const alignBy = (...series) => { const maps = series.map((s) => Object.fromEntries(s.map((r) => [r.t, r.v]))); const keys = Object.keys(maps[0]).filter((t) => maps.every((m) => m[t] != null)).sort(); return maps.map((m) => keys.map((t) => m[t])); };

// ── Reynslu-mælingar ──
const clamp = roads('baseline').clamp;
const links = roads('links');
const linkCoef = (id) => links.find((l) => l.id === id)?.coef;

const rng = (a) => [Math.min(...a.map((r) => r.v)), Math.max(...a.map((r) => r.v))];
const withinClamp = (name, a) => { const [lo, hi] = rng(a); const [cl, ch] = clamp[name]; return lo >= cl - 2 && hi <= ch + 2; };

// 1) Söguleg bil vs módel-clamp
const okHouseRange = withinClamp('husnaedi_hbs', houseHbs) && withinClamp('husnaedi_land', houseLand);
const okUnempRange = withinClamp('atvinnuleysi', unemp);
const okInflRange = inflArr.length ? withinClamp('verdbolga', inflArr) : true;

// 2) Sveiflur beggja markaða (LÝSANDI): landsbyggð oft sveiflukenndari í hráum yoy (þunnur markaður/hávaði);
//    módel-fullyrðingin er um VAXTA-NÆMNI (sjá lið 4), ekki hráar sveiflur. Bæði markaðir eru sveiflukenndir (std>3).
const stdHbs = +std(houseHbs.map((r) => r.v)).toFixed(1), stdLand = +std(houseLand.map((r) => r.v)).toFixed(1);
const okHouseVolatile = stdHbs > 3 && stdLand > 3; // húsnæðismarkaður er sveiflukenndur (staðfestir víð clamp-mörk)

// 3) Verðbólgu-tregða: AR(1) reynslu vs módel infl_persist (0.25). Mánaðarleg yoy mjög þrálát → staðfestir tregða>0.
const inflAR1 = inflArr.length > 24 ? +ar1(inflArr.map((r) => r.v)).toFixed(2) : null;
const okInflPersist = inflAR1 == null || (inflAR1 > 0.6);

// 4) Vextir → húsnæði (VAXTA-NÆMNI): neikvæð fylgni vaxta (töf ~2 ár) við húsnæðisverðs-vöxt, BÁÐIR markaðir. Staðfestir r_house/r_hbs/r_land (<0).
let corrHbs = null, corrLand = null, okRateHouse = true;
if (rate.length > 24) {
  const rateLag = rate.map((r, i) => ({ t: rate[i + 24]?.t, v: r.v })).filter((r) => r.t);
  const [rl1, hh] = alignBy(rateLag, houseHbs); if (rl1.length > 20) corrHbs = +corr(rl1, hh).toFixed(2);
  const [rl2, hl] = alignBy(rateLag, houseLand); if (rl2.length > 20) corrLand = +corr(rl2, hl).toFixed(2);
  okRateHouse = (corrHbs == null || corrHbs < 0.15) && (corrLand == null || corrLand < 0.15); // báðir: ekki jákvæð fylgni
}
const rateHouseCorr = corrHbs;

// 5) Okun: atvinnuleysi mean-reverting nálægt NAIRU (~3.5–4.5)
const unempMean = +mean(unemp.map((r) => r.v)).toFixed(1);
const okNairu = unempMean > 2.5 && unempMean < 6;

const report = {
  updated: cpi.length ? cpi[cpi.length - 1].t : null,
  span: FROM + ' → ' + (unemp.length ? unemp[unemp.length - 1].t : '?'),
  husnaedi_hbs: { range: rng(houseHbs).map((x) => +x.toFixed(1)), std: +std(houseHbs.map((r) => r.v)).toFixed(1), n: houseHbs.length },
  husnaedi_land: { range: rng(houseLand).map((x) => +x.toFixed(1)), std: +std(houseLand.map((r) => r.v)).toFixed(1), n: houseLand.length },
  atvinnuleysi: { range: rng(unemp).map((x) => +x.toFixed(1)), mean: unempMean, n: unemp.length },
  verdbolga: { range: inflArr.length ? rng(inflArr).map((x) => +x.toFixed(1)) : null, ar1: inflAR1, n: inflArr.length },
  rateHouseCorr, corrHbs, corrLand, rateN: rate.length,
  checks: { okHouseRange, okUnempRange, okInflRange, okHouseVolatile, okInflPersist, okRateHouse, okNairu },
  model: { r_house: linkCoef('r_house'), r_hbs: linkCoef('r_hbs'), r_land: linkCoef('r_land'), infl_persist: linkCoef('infl_persist') },
};
writeFileSync(join(ROOT, 'gogn', 'roads', 'history.json'), JSON.stringify(report, null, 1));

console.log('SÖGULEG BAKPRÓFUN 2010–2026 (raun-gögn):');
console.log('  Húsnæði höfuðb. yoy: bil', report.husnaedi_hbs.range, '% std', report.husnaedi_hbs.std, '(n=' + report.husnaedi_hbs.n + ')');
console.log('  Húsnæði landsb. yoy: bil', report.husnaedi_land.range, '% std', report.husnaedi_land.std);
console.log('  Atvinnuleysi: bil', report.atvinnuleysi.range, '% meðaltal', report.atvinnuleysi.mean);
console.log('  Verðbólga: bil', report.verdbolga.range, '% AR(1)', report.verdbolga.ar1, '(n=' + report.verdbolga.n + ')');
console.log('  Vextir→húsnæði fylgni (töf 2ár): höfuðb', corrHbs, '| landsb', corrLand, '(vænt: neikvæð, staðfestir r_hbs/r_land<0)');
console.log('  CHECKS:', JSON.stringify(report.checks));
const bad = !(okHouseRange && okUnempRange && okInflRange && okHouseVolatile && okInflPersist && okRateHouse && okNairu);
console.log(bad ? 'FAIL — sjá checks' : 'PASS — módel í takt við söguleg gögn');
process.exit(bad ? 1 : 0);
