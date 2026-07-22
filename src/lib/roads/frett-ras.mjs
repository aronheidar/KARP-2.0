// Isomorphic (node bygging + vafri). Varpar frétta/þingmáls-„trigger" í tilbúið RÁS-spjald.
// Sim-hamur (lever/shock/preset): keyrir simulate → stærstu áhrif eftir 3 ár.
// Links-hamur (outcome, Type B): les fyrsta-stigs niðurstreymis-tengsl (útkoma er EKKI inntak).
import { simulate } from './engine.mjs';

const HORIZON = 12;                                        // 3 ár (ársfjórðungar)
const EPS = { '%': 0.05, 'pp': 0.05, '% VLF': 0.05, '': 0.3 };  // hverfandi-þröskuldur per einingu
const TOP_N = 4;
const epsFor = (u) => EPS[u] ?? 0.05;
const polarityOf = (baseline, k) => (baseline.outcomes[k] && typeof baseline.outcomes[k].polarity === 'number') ? baseline.outcomes[k].polarity : 0;

function deepLinkSim(levers, shocks) {
  const parts = [];
  for (const k in levers) parts.push('l.' + k + '=' + levers[k]);
  for (const k in shocks) parts.push('s.' + k + '=' + shocks[k]);
  return '/hermir/#' + parts.join('&');
}
function matchScenario(scenarios, levers, shocks) {
  if (!scenarios) return null;
  const eq = (a, b) => { const ak = Object.keys(a), bk = Object.keys(b); return ak.length === bk.length && ak.every((k) => b[k] === a[k]); };
  return scenarios.find((s) => eq(s.levers || {}, levers) && eq(s.shocks || {}, shocks)) || null;
}
function composeSentence(top) {
  const t = top.slice(0, 3).map((e) => e.label.toLowerCase() + ' ' + (e.dir > 0 ? 'hækkar' : 'lækkar'));
  return 'Samkvæmt RÁS: ' + t.join(', ') + ' (3 ára sýn).';
}
function composeLinksSentence(label, top) {
  const t = top.slice(0, 3).map((e) => e.label.toLowerCase() + ' ' + (e.dir > 0 ? '↑' : '↓'));
  return 'Breyting á «' + label + '» tengist skv. RÁS: ' + t.join(', ') + '.';
}

function simProjection(levers, shocks, ctx, opts) {
  const { baseline, links, scenarios } = ctx;
  let r;
  try { r = simulate({ baseline, links, levers, shocks, quarters: HORIZON }); }
  catch (e) { return null; }
  const last = HORIZON - 1, effects = [];
  for (const k in r.outcomes) {
    const o = r.outcomes[k], delta = o.mid[last] - o.baseline[last];
    if (!Number.isFinite(delta) || Math.abs(delta) < epsFor(o.unit)) continue;
    const dir = Math.sign(delta);
    effects.push({ key: k, label: o.label, delta: +delta.toFixed(3), dir, unit: o.unit, valence: dir * polarityOf(baseline, k) });
  }
  if (!effects.length) return null;
  effects.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topEffects = effects.slice(0, TOP_N);
  const sc = opts.sentence ? null : matchScenario(scenarios, levers, shocks);
  return {
    mode: 'sim', illustrative: !!opts.illustrative,
    inputLabel: opts.inputLabel || null,
    inputKey: opts.inputKey || Object.keys(levers)[0] || Object.keys(shocks)[0] || null,
    horizonQuarters: HORIZON, topEffects,
    sentence: opts.sentence || (sc && sc.sentence) || composeSentence(topEffects),
    deepLink: deepLinkSim(levers, shocks), source: 'RÁS-hermir',
  };
}

function linksProjection(key, bump, ctx) {
  const { baseline, links } = ctx;
  const down = links.filter((l) => l.from === key && l.to !== key && baseline.outcomes[l.to]);
  const effects = [];
  for (const l of down) {
    const delta = l.coef * bump;
    if (!Number.isFinite(delta) || delta === 0) continue;
    const dir = Math.sign(delta);
    effects.push({ key: l.to, label: baseline.outcomes[l.to].label, delta: +delta.toFixed(3), dir, unit: baseline.outcomes[l.to].unit, valence: dir * polarityOf(baseline, l.to), lag: l.lag || 0 });
  }
  if (!effects.length) return null;
  effects.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    mode: 'links', illustrative: true,
    inputLabel: baseline.outcomes[key].label, inputKey: key, perUnit: baseline.outcomes[key].unit,
    horizonQuarters: HORIZON, topEffects: effects.slice(0, TOP_N),
    sentence: composeLinksSentence(baseline.outcomes[key].label, effects.slice(0, TOP_N)),
    deepLink: '/hermir/#tb=model', source: 'RÁS-hermir',
  };
}

export function projectRas(trigger, ctx) {
  if (!trigger || !ctx || !ctx.baseline || !ctx.links) return null;
  const { baseline, scenarios } = ctx;
  if (trigger.kind === 'preset') {
    const sc = (scenarios || []).find((s) => s.id === trigger.id);
    if (!sc) return null;
    return simProjection(sc.levers || {}, sc.shocks || {}, ctx, { illustrative: false, sentence: sc.sentence, inputLabel: sc.label });
  }
  if (trigger.kind === 'lever') {
    if (!baseline.levers[trigger.key]) return null;
    return simProjection({ [trigger.key]: trigger.value }, {}, ctx, { illustrative: !!trigger.illustrative, inputKey: trigger.key });
  }
  if (trigger.kind === 'shock') {
    if (!baseline.shocks[trigger.key]) return null;
    return simProjection({}, { [trigger.key]: trigger.value }, ctx, { illustrative: !!trigger.illustrative, inputKey: trigger.key });
  }
  if (trigger.kind === 'outcome') {
    if (!baseline.outcomes[trigger.key]) return null;
    return linksProjection(trigger.key, trigger.bump ?? 1, ctx);
  }
  return null;
}
