// „Af hverju?"-debrief fyrir RÁS-Leikinn: mannamáls-útskýring á niðurstöðu umferðar.
// HREINT — engin env/D1. Notar leverEffects (flavor) til að finna fórnir. Skilar { lines: string[] }
// með einföldum <b>-merkjum (client sér um umgjörð). changes = changedLevers() [{key,label,from,to,unit}],
// perKpi = scoreRound().perKpi [{key,label,value,score,weight}]. disp (valfrjálst) = raun-gildis-birting.
import { leverEffects } from './flavor.mjs';

const n1 = (v) => (typeof v === 'number' ? (Math.round(v * 10) / 10).toString().replace('.', ',') : '–');

// Versnaði KPI frá prev→now? null ef óþekkt.
function isWorse(key, now, prev, mandate) {
  const spec = mandate && mandate.kpis.find((k) => k.key === key);
  if (!spec || now == null || prev == null) return null;
  if (spec.dir === 'max') return now > prev;
  if (spec.dir === 'min') return now < prev;
  return Math.abs(now - spec.target) > Math.abs(prev - spec.target);
}

export function explainRound({ changes = [], perKpi = [], kpisNow = {}, kpisPrev = null, mandate, links, baseline, disp } = {}) {
  const lines = [];
  const dot = (s) => (/\.$/.test(s) ? s : s + '.'); // forðast tvöfaldan punkt þegar gildi endar á '.' (t.d. „ma.kr.")
  const fmt = (c) => ((disp && baseline && baseline.levers[c.key]) ? disp(baseline.levers[c.key], c.to) : n1(c.to));

  // 1) Aðal-aðgerð (stærsta hlutfallslega hreyfing = changes[0])
  if (changes.length) {
    let s = 'Stærsta aðgerð ykkar: <b>' + changes[0].label + '</b> → ' + fmt(changes[0]);
    const rest = changes.length - 1;
    if (rest > 0) s += ' (og ' + rest + (rest === 1 ? ' önnur breyting)' : ' aðrar breytingar)');
    lines.push(dot(s));
  } else {
    lines.push('Þið gerðuð engar stefnu-breytingar þessa umferð — kyrrstaða frá fyrra kjörtímabili.');
  }

  // 2) Sterkast / veikast markmið (+ Δ frá fyrri umferð ef til)
  const scored = perKpi.filter((p) => p && p.score != null);
  if (scored.length) {
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
    if (best.key === worst.key) lines.push('Markmiðið <b>' + best.label + '</b> skoraði ' + best.score + '/100.');
    else lines.push('Sterkast: <b>' + best.label + '</b> (' + best.score + '/100). Veikast: <b>' + worst.label + '</b> (' + worst.score + '/100).');
    if (kpisPrev) {
      const now = kpisNow[worst.key], prev = kpisPrev[worst.key];
      if (now != null && prev != null && Math.abs(now - prev) >= 0.1) {
        const worse = isWorse(worst.key, now, prev, mandate);
        lines.push('↝ ' + worst.label + ' fór úr ' + n1(prev) + ' í ' + n1(now) + (worse == null ? '' : worse ? ' (versnaði)' : ' (batnaði)') + '.');
      }
    }
  }

  // 3) Fórnin: aðal-sleðinn togar tvö umboðs-markmið í öfuga átt (úr leverEffects)
  if (changes.length && links && baseline && mandate) {
    const kpiKeys = new Set(mandate.kpis.map((k) => k.key));
    const eff = leverEffects(changes[0].key, baseline, links).filter((e) => kpiKeys.has(e.key));
    const up = eff.find((e) => e.dir > 0), down = eff.find((e) => e.dir < 0);
    if (up && down) lines.push('⚖️ Fórnin: <b>' + changes[0].label + '</b> togar <b>' + up.label + '</b> upp en <b>' + down.label + '</b> niður — ekki hægt að laga bæði í einu með þessari aðgerð.');
  }

  return { lines };
}
