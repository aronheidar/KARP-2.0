// Orsaka-hlutnet fyrir S3-debrief. HREINT: links-grafa, engin vél/env/D1.
// Dregur út net frá VIRKUM inntökum liðs → markmiðs-KPI: hnútar/leggir á leið input→KPI, klippt.
const MAX_HOPS = 3, MAX_EDGES = 14;
const labelOf = (b, k) => (b.levers[k] && b.levers[k].label) || (b.shocks[k] && b.shocks[k].label) || (b.outcomes[k] && b.outcomes[k].label) || k;

export function activeInputsFromInputs({ levers, shocks, quarters }, baseline) {
  const last = quarters - 1, out = [];
  for (const k in levers) { const dev = levers[k].value[last] - levers[k].base; if (Math.abs(dev) > 1e-9) out.push({ key: k, kind: 'lever', dev: +dev.toFixed(4) }); }
  for (const k in shocks) { const dev = shocks[k].value[last]; if (Math.abs(dev) > 1e-9) out.push({ key: k, kind: 'shock', dev: +dev.toFixed(4) }); }
  return out;
}

export function buildChain({ baseline, links, activeInputs, kpiKeys, maxHops = MAX_HOPS, maxEdges = MAX_EDGES }) {
  const inputKeys = new Set(activeInputs.map((a) => a.key));
  const kpiSet = new Set(kpiKeys);
  const fwd = {}, bwd = {};
  for (const l of links) { if (!baseline.outcomes[l.to]) continue; (fwd[l.from] ||= []).push(l.to); (bwd[l.to] ||= []).push(l.from); }
  const reach = (starts, adj) => { const S = new Set(starts); let fr = [...starts]; for (let h = 0; h < maxHops && fr.length; h++) { const nx = []; for (const n of fr) for (const m of (adj[n] || [])) if (!S.has(m)) { S.add(m); nx.push(m); } fr = nx; } return S; };
  const F = reach([...inputKeys], fwd), B = reach([...kpiSet], bwd);
  // flow = hnútar á RAUNVERULEGRI leið input→KPI (F∩B). KPI eru sýnd sem akkeri en gera EKKI legg gjaldgengan út af fyrir sig.
  const flow = new Set(); for (const k of F) if (B.has(k)) flow.add(k);
  // leggir milli flow-hnúta, klippt eftir styrk (stöðug röðun)
  let edges = [];
  for (const l of links) { if (!baseline.outcomes[l.to] || l.from === l.to || !flow.has(l.from) || !flow.has(l.to)) continue; edges.push({ from: l.from, to: l.to, sign: l.coef >= 0 ? 1 : -1, strength: +Math.abs(l.coef).toFixed(3) }); }
  edges.sort((a, b) => b.strength - a.strength || (a.from + '>' + a.to).localeCompare(b.from + '>' + b.to));
  const clipped = edges.length > maxEdges; edges = edges.slice(0, maxEdges);
  // hnútar sem leggir snerta (+ virk inntök á leið + KPI-akkeri)
  const used = new Set(); for (const e of edges) { used.add(e.from); used.add(e.to); }
  for (const a of activeInputs) if (flow.has(a.key)) used.add(a.key);
  for (const k of kpiKeys) used.add(k);
  edges = edges.filter((e) => used.has(e.from) && used.has(e.to));
  // dýpt: BFS frá inntökum yfir notaða leggi
  const depth = {}; for (const k of used) depth[k] = 99;
  const uf = {}; for (const e of edges) (uf[e.from] ||= []).push(e.to);
  let fr = [...inputKeys].filter((k) => used.has(k)); fr.forEach((k) => (depth[k] = 0)); let d = 0;
  while (fr.length && d < maxHops + 2) { d++; const nx = []; for (const n of fr) for (const t of (uf[n] || [])) if (depth[t] > d) { depth[t] = d; nx.push(t); } fr = nx; }
  const maxD = Math.max(1, ...[...used].map((k) => (depth[k] < 99 ? depth[k] : 0)));
  for (const k of used) if (depth[k] === 99) depth[k] = kpiSet.has(k) ? maxD + 1 : 1;
  const kindOf = (k) => inputKeys.has(k) ? 'input' : (kpiSet.has(k) ? 'kpi' : 'mid');
  const nodes = [...used].map((k) => ({ key: k, label: labelOf(baseline, k), kind: kindOf(k), depth: depth[k] }));
  return { nodes, edges, clipped };
}
