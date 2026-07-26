// Studio-hamur RÁS-Leiksins (fullur hermir sem ákvörðunar-yfirborð): lever-katalógur + hjálp.
// HREINT — tekur baseline sem viðfang (engin env/crypto/D1). Notað client-megin (flipar/sleðar) + í S2-samantekt.

// Flokkar sleða eftir baseline.levers[k].group → flipar; röð baseline varðveitt.
export function studioCatalog(baseline) {
  const byGroup = new Map();
  for (const [key, v] of Object.entries(baseline.levers)) {
    const g = v.group || 'Annað';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push({ key, label: v.label, min: v.min, max: v.max, base: v.base, step: v.step || 0.1, unit: v.unit || '' });
  }
  const tabs = [...byGroup.entries()].map(([group, levers]) => ({ group, levers }));
  const outcomes = Object.entries(baseline.outcomes).map(([key, v]) => ({ key, label: v.label, unit: v.unit || '', polarity: v.polarity || 0 }));
  return { tabs, outcomes };
}

// Sjálfgefin sleða-staða = grunngildi hvers sleða.
export function defaultDials(baseline) {
  const d = {};
  for (const [k, v] of Object.entries(baseline.levers)) d[k] = v.base;
  return d;
}

// Breyttir sleðar (frá grunni) raðaðir eftir hlutfallslegri stærð breytingar — til samantektar/UI.
export function changedLevers(dials, baseline) {
  const out = [];
  for (const [k, v] of Object.entries(dials || {})) {
    const cfg = baseline.levers[k];
    if (cfg && +v !== cfg.base) out.push({ key: k, label: cfg.label, from: cfg.base, to: +v, unit: cfg.unit || '' });
  }
  const relMag = (it) => { const c = baseline.levers[it.key]; const span = (c.max - c.min) || 1; return Math.abs((it.to - it.from) / span); };
  return out.sort((a, b) => relMag(b) - relMag(a));
}
