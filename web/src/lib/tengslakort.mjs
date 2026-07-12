// tengslakort.mjs — eigenda- & stjórnarnet (cytoscape.js, client-side eyja).
// -------------------------------------------------------------------------
// Sama mynstur og choropleth.mjs: lazy CDN-hleðsla af graf-lib (cytoscape),
// ENGIN ný npm-ávöxun, sprautar eigin dökka CSS einu sinni. Notað í eigenda-
// skýrslunni (ubo-report.js) undir „🕸️ Tengslakort"-flipanum. Byggir TVÆR
// tegundir leggja, aðgreindar sjónrænt:
//   • eignarhald (UBO-tré úr gogn/eigendur/<kt>.json) — heil lína + %,
//   • stjórn/fyrirsvar (úr /api/tengslanet?kort=1) — brotalína + hlutverk.
// PERSÓNUVERND: fjarlægir (grímuklæddir) einstaklingar koma NAFNLAUSIR frá
// server (token 'E'+n). buildElements gerir ENGA af-grímun.
// ─────────────────────────────────────────────────────────────

const GOLD = '#f6b13b', COFELAG = '#3f6ea5', PERSON = '#cfe3ff', MASK = '#5b6b82';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ0-9]+/g, ' ').trim();
const pct = (n) => (n == null ? '' : Number(n).toFixed(0) + '%');
const ktFmt = (kt) => { const s = String(kt || '').replace(/\D/g, ''); return s.length === 10 ? s.slice(0, 6) + '-' + s.slice(6) : s; };

// ---------- id-lyklar (samræming milli eignar- og stjórnar-gagna) ----------
const felagId = (kt) => 'c:' + String(kt || '').replace(/\D/g, '');
const nafnPersonId = (nafn, kt) => (kt ? 'p:' + String(kt).replace(/\D/g, '') : 'p:nm:' + norm(nafn));
const maskPersonId = (token) => 'p:tok:' + token;

/**
 * Byggir cytoscape-element-fylki úr eignarhaldi (eignData) + stjórn (stjornData).
 * HREIN fall (engin DOM) — prófanleg. Skilar [{data:{...}}] (hnútar + leggir).
 */
export function buildElements({ rotKt, eignData, stjornData } = {}) {
  const nodes = new Map();   // id -> data
  const edges = new Map();   // id -> data
  const rkt = String(rotKt || (eignData && eignData.kt) || '').replace(/\D/g, '');
  const put = (d) => {
    const ex = nodes.get(d.id);
    if (!ex) { nodes.set(d.id, d); return; }
    if (d.nafn && !ex.nafn) { ex.nafn = d.nafn; ex.label = d.label || ex.label; }
    if (d.kt && !ex.kt) ex.kt = d.kt;
    if (d.rot) ex.rot = true;
    if (d.maskad) ex.maskad = true;
    if (d.hlutverk_rot && !ex.hlutverk_rot) ex.hlutverk_rot = d.hlutverk_rot;
  };
  const putEdge = (d) => { if (!edges.has(d.id)) edges.set(d.id, d); };

  // ---- 1) eignarhald (UBO-tré) ----
  const local = new Map();   // rep.net staðbundið id -> graf-id
  const net = (eignData && eignData.net) || { nodes: [], edges: [] };
  for (const n of (net.nodes || [])) {
    if (n.tegund === 'felag') {
      const id = felagId(n.kt);
      local.set(n.id, id);
      put({ id, tegund: 'felag', kt: (n.kt ? String(n.kt).replace(/\D/g, '') : null), nafn: n.nafn || null, rot: !!n.er_rot, label: n.nafn || '' });
    } else {
      const id = nafnPersonId(n.nafn, n.kt);
      local.set(n.id, id);
      put({ id, tegund: 'einst', kt: (n.kt ? String(n.kt).replace(/\D/g, '') : null), nafn: n.nafn || null, maskad: false, faeding: n.faeding || null, label: n.nafn || '' });
    }
  }
  for (const e of (net.edges || [])) {
    const s = local.get(e.fra), t = local.get(e.til);
    if (!s || !t) continue;
    putEdge({ id: 'eign:' + s + '>' + t, source: s, target: t, tegund: 'eign', hlutfall: (e.hlutur == null ? 0 : e.hlutur), label: pct(e.hlutur) });
  }

  // ---- 2) stjórn / fyrirsvar ----
  if (stjornData && stjornData.holdur) {
    const rootCid = felagId(rkt);
    if (rkt) { if (!nodes.has(rootCid)) put({ id: rootCid, tegund: 'felag', kt: rkt, nafn: null, rot: true, label: '' }); else nodes.get(rootCid).rot = true; }
    const felagNode = (kt, nafn) => { const k = String(kt || '').replace(/\D/g, ''); if (!k) return null; const id = felagId(k); put({ id, tegund: 'felag', kt: k, nafn: nafn || null, rot: k === rkt, label: nafn || '' }); return id; };
    for (const f of (stjornData.felog || [])) felagNode(f.kt, f.nafn);
    // nafngreindir stjórnendur (rót-tengt fólk) — heil nöfn
    for (const p of (stjornData.stjornendur || [])) {
      const pid = nafnPersonId(p.nafn, null);
      const hr = (p.hlutverk_rot || []).join(' · ');
      put({ id: pid, tegund: 'einst', kt: null, nafn: p.nafn || null, maskad: false, label: p.nafn || '', hlutverk_rot: hr });
      if (rkt) putEdge({ id: 'stjorn:' + pid + '>' + rootCid, source: pid, target: rootCid, tegund: 'stjorn', hlutverk: hr || 'fyrirsvar', label: hr || 'fyrirsvar' });
      for (const o of (p.onnur || [])) {
        const cid = felagNode(o.kt, o.nafn); if (!cid) continue;
        putEdge({ id: 'stjorn:' + pid + '>' + cid, source: pid, target: cid, tegund: 'stjorn', hlutverk: o.hlutverk || '', label: o.hlutverk || '' });
      }
    }
    // grímuklæddir krossatengsl — NAFNLAUSIR (token frá server)
    (stjornData.krossar || []).forEach((p, i) => {
      const token = p.token || ('E' + (i + 1));
      const pid = maskPersonId(token);
      put({ id: pid, tegund: 'einst', kt: null, nafn: null, maskad: true, label: token });
      for (const f of (p.felog || [])) {
        const cid = felagNode(f.kt, f.nafn); if (!cid) continue;
        putEdge({ id: 'stjorn:' + pid + '>' + cid, source: pid, target: cid, tegund: 'stjorn', hlutverk: '', label: '' });
      }
    });
  }

  const out = [];
  for (const d of nodes.values()) out.push({ data: d });
  for (const d of edges.values()) if (nodes.has(d.source) && nodes.has(d.target)) out.push({ data: d });
  return out;
}

// ---------- cytoscape-hleðsla (lazy, af CDN — sama mynstur og withLeaflet) ----------
function withCytoscape(cb) {
  if (window.cytoscape) return cb(window.cytoscape);
  let s = document.getElementById('cytoscape-js');
  if (!s) { s = document.createElement('script'); s.id = 'cytoscape-js'; s.src = 'https://unpkg.com/cytoscape@3/dist/cytoscape.min.js'; document.head.appendChild(s); }
  if (window.cytoscape) return cb(window.cytoscape);
  s.addEventListener('load', () => cb(window.cytoscape), { once: true });
  s.addEventListener('error', () => cb(null), { once: true });
}

// ---------- dökkur CSS (sprautað einu sinni) ----------
function injectCss() {
  if (document.getElementById('tk-styles')) return;
  const st = document.createElement('style');
  st.id = 'tk-styles';
  st.textContent = `
  .tk-wrap{position:relative;height:560px;border-radius:12px;border:1px solid rgba(255,255,255,.08);overflow:hidden;background:#0b0f17}
  @media (max-width:560px){.tk-wrap{height:440px}}
  .tk-cy{position:absolute;inset:0}
  .tk-legend{position:absolute;left:12px;top:12px;z-index:6;background:rgba(9,14,26,.86);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;font-size:11.5px;color:#cdd6e6;max-width:240px;pointer-events:none}
  .tk-legend .tk-lt{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#7e8ca6;font-weight:700;margin-bottom:6px}
  .tk-legend .tk-row{display:flex;align-items:center;gap:7px;margin:3px 0;line-height:1.2}
  .tk-legend .tk-sw{width:14px;height:14px;border-radius:50%;flex:none}
  .tk-legend .tk-ln{width:18px;height:0;flex:none;border-top:2px solid #8fb7e8}
  .tk-legend .tk-ln.dash{border-top-style:dashed;border-top-color:#b48ad6}
  .tk-panel{position:absolute;right:12px;top:12px;z-index:7;width:232px;max-width:calc(100% - 24px);background:rgba(9,14,26,.96);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:11px 13px;font-size:12.5px;color:#eaf1fb;box-shadow:0 8px 28px rgba(0,0,0,.55);display:none}
  .tk-panel.on{display:block}
  .tk-panel h5{margin:0 24px 6px 0;font-size:13.5px;color:#f6b13b}
  .tk-panel .tk-kt{color:#9fb0c8;font-size:11.5px;line-height:1.4}
  .tk-panel ul{margin:7px 0 0;padding-left:16px}
  .tk-panel li{margin:2px 0;line-height:1.35}
  .tk-panel .tk-x{position:absolute;right:8px;top:7px;cursor:pointer;color:#9fb0c8;border:none;background:none;font-size:15px;line-height:1}
  .tk-src{position:absolute;left:12px;bottom:10px;z-index:6;font-size:10.5px;color:#7e8ca6;pointer-events:none}
  .tk-err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9fb0c8;font-size:13px;padding:20px;text-align:center}
  @media (max-width:560px){.tk-panel{width:180px;font-size:11.5px}.tk-legend{font-size:10.5px;max-width:180px}}`;
  document.head.appendChild(st);
}

const CY_STYLE = [
  { selector: 'node', style: { 'label': 'data(label)', 'color': '#dfe8f5', 'font-size': '11px', 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '92px', 'min-zoomed-font-size': 7 } },
  { selector: 'node[tegund = "felag"]', style: { 'shape': 'round-rectangle', 'background-color': COFELAG, 'border-color': 'rgba(255,255,255,.25)', 'border-width': 1, 'width': 'label', 'height': 26, 'padding': '8px', 'color': '#eaf1fb' } },
  { selector: 'node[tegund = "felag"][?rot]', style: { 'background-color': GOLD, 'color': '#1a1205', 'font-weight': 'bold', 'border-color': '#ffd479', 'border-width': 2, 'height': 34, 'font-size': '13px' } },
  { selector: 'node[tegund = "einst"]', style: { 'shape': 'ellipse', 'background-color': PERSON, 'color': '#0b0f17', 'width': 42, 'height': 42, 'text-max-width': '78px' } },
  { selector: 'node[tegund = "einst"][?maskad]', style: { 'background-color': '#0b0f17', 'border-color': MASK, 'border-width': 2, 'border-style': 'dashed', 'color': '#9fb0c8' } },
  { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.9, 'font-size': '10px', 'color': '#cdd6e6', 'text-background-color': '#0b0f17', 'text-background-opacity': 0.75, 'text-background-padding': '2px', 'min-zoomed-font-size': 8 } },
  { selector: 'edge[tegund = "eign"]', style: { 'line-color': '#8fb7e8', 'target-arrow-color': '#8fb7e8', 'width': 'mapData(hlutfall, 0, 100, 1.4, 4.5)', 'label': 'data(label)' } },
  { selector: 'edge[tegund = "stjorn"]', style: { 'line-color': '#b48ad6', 'target-arrow-color': '#b48ad6', 'line-style': 'dashed', 'width': 1.6, 'label': 'data(label)' } },
  { selector: 'node:selected', style: { 'border-color': '#19d3c5', 'border-width': 3 } },
];

/**
 * Teiknar tengslakortið í hostEl. Lazy CDN-hleðsla; skilar Promise<cy|null>.
 * @param {HTMLElement} hostEl
 * @param {object} opts { rotKt, eignData, stjornData }
 */
export function renderTengslakort(hostEl, opts) {
  return new Promise((resolve) => {
    if (!hostEl || hostEl.dataset.tkDone) return resolve(null);
    hostEl.dataset.tkDone = '1';
    injectCss();
    const elements = buildElements(opts || {});
    const wrap = document.createElement('div');
    wrap.className = 'tk-wrap';
    const cyEl = document.createElement('div');
    cyEl.className = 'tk-cy';
    wrap.appendChild(cyEl);
    wrap.insertAdjacentHTML('beforeend',
      '<div class="tk-legend"><div class="tk-lt">Skýring</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:' + GOLD + '"></span>Rót-félag</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:' + COFELAG + '"></span>Tengt félag</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:' + PERSON + '"></span>Nafngreindur einstaklingur</div>'
      + '<div class="tk-row"><span class="tk-sw" style="background:#0b0f17;border:2px dashed ' + MASK + '"></span>Grímuklæddur (fjarlægur)</div>'
      + '<div class="tk-row"><span class="tk-ln"></span>Eignarhald (%)</div>'
      + '<div class="tk-row"><span class="tk-ln dash"></span>Stjórn / fyrirsvar</div></div>');
    wrap.insertAdjacentHTML('beforeend', '<div class="tk-src">heimild: Fyrirtækjaskrá Skattsins (opinbert API)</div>');
    const panel = document.createElement('div');
    panel.className = 'tk-panel';
    wrap.appendChild(panel);
    hostEl.appendChild(wrap);

    if (!elements.length) { cyEl.insertAdjacentHTML('beforeend', '<div class="tk-err">Engin tengsl til að teikna.</div>'); return resolve(null); }

    withCytoscape((cytoscape) => {
      if (!cytoscape) { cyEl.insertAdjacentHTML('beforeend', '<div class="tk-err">Ekki tókst að hlaða kort-einingu (cytoscape).</div>'); return resolve(null); }
      const cy = cytoscape({
        container: cyEl, elements, style: CY_STYLE,
        layout: { name: 'cose', animate: false, padding: 30, nodeRepulsion: 9000, idealEdgeLength: 95, gravity: 0.3, nestingFactor: 0.9 },
        wheelSensitivity: 0.2, minZoom: 0.2, maxZoom: 2.5,
      });
      const showPanel = (n) => {
        const d = n.data();
        const ce = n.connectedEdges();
        let html = '<button type="button" class="tk-x" aria-label="Loka">✕</button>';
        const rows = [];
        if (d.tegund === 'felag') {
          html += '<h5>' + esc(d.nafn || 'Félag') + '</h5>';
          if (d.kt) html += '<div class="tk-kt">kt. ' + esc(ktFmt(d.kt)) + (d.rot ? ' — rót-félag' : '') + '</div>';
          ce.forEach((e) => { if (e.data('tegund') === 'eign' && e.target().id() === d.id) { const s = e.source().data(); rows.push(esc(s.nafn || s.label) + ' á ' + esc(e.data('label'))); } });
          ce.forEach((e) => { if (e.data('tegund') === 'stjorn' && e.target().id() === d.id) { const s = e.source().data(); rows.push((s.maskad ? esc(s.label) : esc(s.nafn || s.label)) + (e.data('hlutverk') ? ' — ' + esc(e.data('hlutverk')) : ' — fyrirsvar')); } });
        } else {
          if (d.maskad) html += '<h5>Grímuklæddur aðili · ' + esc(d.label) + '</h5><div class="tk-kt">Nafn hulið skv. persónuverndarstefnu — aðeins hlutverk sýnt.</div>';
          else { html += '<h5>' + esc(d.nafn || 'Einstaklingur') + '</h5>'; if (d.hlutverk_rot) html += '<div class="tk-kt">' + esc(d.hlutverk_rot) + '</div>'; }
          ce.forEach((e) => { if (e.source().id() !== d.id) return; const t = e.target().data(); const role = e.data('tegund') === 'eign' ? ('á ' + e.data('label')) : (e.data('hlutverk') || 'fyrirsvar'); rows.push(esc(t.nafn || 'félag') + ' — ' + esc(role)); });
        }
        if (rows.length) html += '<ul><li>' + rows.join('</li><li>') + '</li></ul>';
        panel.innerHTML = html;
        panel.classList.add('on');
        panel.querySelector('.tk-x').onclick = () => panel.classList.remove('on');
      };
      cy.on('tap', 'node', (evt) => showPanel(evt.target));
      cy.on('tap', (evt) => { if (evt.target === cy) panel.classList.remove('on'); });
      setTimeout(() => { try { cy.resize(); cy.fit(undefined, 40); } catch (e) {} }, 60);
      resolve(cy);
    });
  });
}
