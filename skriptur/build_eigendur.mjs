#!/usr/bin/env node
// build_eigendur.mjs — endurkvæmt UBO-tré fyrir eitt félag -> gogn/eigendur/<kt>.json
// On-demand (GH Action). Speglar build_arsreikningar.mjs. Sjá spec 2026-07-08.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeUbo } from './lib/ubo.mjs';
import * as rsk from './lib/rsk.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = path.join(__dirname, '..', 'web', 'public', 'gogn', 'eigendur');
const pct = (s) => { const m = String(s ?? '').replace(',', '.').match(/(-?[\d.]+)/); return m ? Math.min(100, Math.abs(parseFloat(m[1]))) : null; };
const bandOf = (hl) => (hl == null ? 'lt25' : hl >= 51 ? '51' : hl >= 25 ? '25' : 'lt25');

// Byggja eignarhaldsnet: endurkvæmt niður hluthafa-keðjur; fallback á raunverulega eigendur.
export async function buildGraph(rootKt, deps) {
  const { fetchHluthafar, fetchRaunverulegir, log = () => {}, MAX_DEPTH = 5, MAX_NODES = 60 } = deps;
  const nodes = [];
  const edges = [];
  const idByKt = new Map();
  const visited = new Set();
  let afmarkad = false, dypt = 0;

  const ensureNode = (kt, nafn, tegund, extra = {}) => {
    if (kt && idByKt.has(kt)) { const n = nodes[idByKt.get(kt)]; if (nafn && !n.nafn) n.nafn = nafn; return n.id; }
    const id = kt ? 'kt' + kt : 'n' + nodes.length;
    const node = { id, kt: kt || null, nafn: nafn || '—', tegund, ...extra };
    if (kt) idByKt.set(kt, nodes.length);
    nodes.push(node);
    return id;
  };
  const erFelag = (h) => !!h.kt || /(^|\s)(ehf|hf|ohf|slhf|slf|sf|svf|bs|incorporation|investments|international|ltd|inc|holding)\.?\s*$/i.test(String(h.nafn || ''));

  const rootInfo = await fetchHluthafar(rootKt).catch(() => ({ nafn: null, hluthafar: [], ar: null }));
  const rootId = ensureNode(rootKt, rootInfo.nafn, 'felag', { er_rot: true });

  async function recurse(kt, nodeId, depth) {
    if (depth > MAX_DEPTH || nodes.length >= MAX_NODES || visited.has(kt)) { if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) afmarkad = true; return; }
    visited.add(kt);
    dypt = Math.max(dypt, depth);
    const info = kt === rootKt ? rootInfo : await fetchHluthafar(kt).catch(() => ({ hluthafar: [] }));
    for (const h of info.hluthafar || []) {
      const felag = erFelag(h);
      const childId = ensureNode(h.kt, h.nafn, felag ? 'felag' : 'einst', felag ? {} : { faeding: h.faeding || null });
      const hl = pct(h.hlutur);
      edges.push({ fra: childId, til: nodeId, hlutur: hl, band: bandOf(hl), heimild: info.ar ? `Ársreikningur ${info.ar}` : 'Ársreikningaskrá (RSK)' });
      if (felag && h.kt && nodes.length < MAX_NODES) { await new Promise((r) => setTimeout(r, deps.delay ?? 1200)); await recurse(h.kt, childId, depth + 1); }
    }
  }
  await recurse(rootKt, rootId, 0);

  const rv = await fetchRaunverulegir(rootKt).catch(() => ({ eigendur: [], tomt: false }));
  // Fallback: engar hluthafa-keðjur en til raunverulegir eigendur -> beinir leggir á rót svo net/UBO birtist.
  if (edges.length === 0 && rv.eigendur.length) {
    for (const e of rv.eigendur) {
      const felag = /(ehf|hf|ohf|slf|sf)\.?\s*$/i.test(String(e.nafn || ''));
      const id = ensureNode(null, e.nafn, felag ? 'felag' : 'einst', { faeding: e.faeding || null });
      const hl = pct(e.hlutur);
      edges.push({ fra: id, til: rootId, hlutur: hl, band: bandOf(hl), heimild: 'Raunverulegir eigendur (Skatturinn)' });
    }
  }
  return {
    kt: rootKt, nafn: rootInfo.nafn || rootKt, net: { nodes, edges },
    raunverulegir: rv.eigendur, raunverulegirTomt: !!rv.tomt,
    hluthafar: rootInfo.hluthafar || [], hluthafarUppspretta: rootInfo.ar ? `Ársreikningur ${rootInfo.ar}` : null,
    dypt, hnutar_alls: nodes.length, afmarkad, rootId,
  };
}

export async function assembleReport(rootKt, deps) {
  const g = await buildGraph(rootKt, deps);
  const sott = deps.sott || null;                    // dagsetning sett af CLI (Date bannað í prófum)
  if (g.net.edges.length === 0 && g.raunverulegir.length === 0) {
    return { kt: rootKt, nafn: g.nafn, sott, engin: true, astaeda: 'Hvorki skráðir hluthafar (ársreikningur) né raunverulegir eigendur fundust — ekki hægt að byggja eignarhaldsnet.' };
  }
  const { endanlegir, othekkt } = computeUbo(g.net.nodes, g.net.edges, g.rootId);
  return {
    kt: rootKt, nafn: g.nafn, sott,
    heimildir: ['Hlutafélagaskrá (RSK)', 'Ársreikningaskrá (RSK)', 'Raunverulegir eigendur (Skatturinn)'],
    dypt: g.dypt, hnutar_alls: g.hnutar_alls, afmarkad: g.afmarkad,
    net: { nodes: g.net.nodes.map(({ id, kt, nafn, tegund, faeding, land, er_rot }) => ({ id, kt, nafn, tegund, ...(faeding ? { faeding } : {}), ...(land ? { land } : {}), ...(er_rot ? { er_rot } : {}) })), edges: g.net.edges },
    endanlegir, othekkt,
    raunverulegir: g.raunverulegir, raunverulegirTomt: g.raunverulegirTomt,
    hluthafar: g.hluthafar, hluthafarUppspretta: g.hluthafarUppspretta,
  };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build_eigendur.mjs')) {
  const kts = process.argv.slice(2).map((a) => a.replace(/\D/g, '')).filter((a) => /^\d{10}$/.test(a));
  if (!kts.length) { console.log('Notkun: node build_eigendur.mjs <kt> [<kt> ...]'); process.exit(0); }
  fs.mkdirSync(OUTDIR, { recursive: true });
  const sott = new Date().toISOString().slice(0, 10);
  for (const kt of kts) {
    try {
      const rep = await assembleReport(kt, { fetchHluthafar: rsk.fetchHluthafar, fetchRaunverulegir: rsk.fetchRaunverulegir, log: console.log, sott });
      fs.writeFileSync(path.join(OUTDIR, `${kt}.json`), JSON.stringify(rep, null, 1));
      console.log(`  -> gogn/eigendur/${kt}.json (${rep.engin ? 'engin gögn' : rep.endanlegir.length + ' endanlegir, ' + rep.hnutar_alls + ' hnútar'})`);
    } catch (e) { console.error(`  ${kt}: VILLA — ${e.message}`); }
  }
}
