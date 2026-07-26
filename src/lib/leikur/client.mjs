// RÁS-Leikurinn — client-app. Ástand/stig koma frá worker (þjóns-megin=ófölsuð).
// Studio-hamur: vélin keyrir client-megin AÐEINS til FORSKOÐUNAR á eigin drögum (blind commit haldið).
// Sýnir: lending, leikstjóri, lið (classic-kubbar / studio-stjórnstöð), niðurstöður.
import { simulate } from '../roads/engine.mjs';
import { buildInputs } from './resolve.mjs';
import { scoreRound } from './scoring.mjs';
import { studioCatalog, defaultDials, changedLevers } from './studio.mjs';
import { leverEffects, newsHeadlines, popularity, endTitle } from './flavor.mjs';
import { YEAR_START, REALITY, YEAR2000_DIALS } from './game-config.mjs';
import BASELINE from '../../../gogn/roads/baseline.json';
import LINKS from '../../../gogn/roads/links.json';
const STUDIO_CAT = studioCatalog(BASELINE);
const API = '/api/leikur';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v, d = 1) => (typeof v === 'number' ? v.toLocaleString('is-IS', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, '') : '–');

async function api(path, { method = 'GET', body, token } = {}) {
  const h = {}; if (body) h['content-type'] = 'application/json'; if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, json: j };
}
const lsFac = (code) => 'leikur_fac_' + code;
const lsTeam = (code) => 'leikur_team_' + code;

// Teiknar orsaka-keðju (SVG) úr {nodes:[{key,label,kind,depth}], edges:[{from,to,sign,strength}], clipped}.
function renderChain(chain) {
  if (!chain || !Array.isArray(chain.edges) || !chain.edges.length) return '<p class="lk-muted">Engin virk áhrif á markmiðin þessa umferð.</p>';
  const nodes = chain.nodes, edges = chain.edges;
  const maxD = Math.max(1, ...nodes.map((n) => n.depth));
  const cols = {}; for (const n of nodes) (cols[n.depth] ||= []).push(n);
  const NW = 128, NH = 24, COLW = 178, VG = 12, M = 12;
  const rows = Math.max(1, ...Object.values(cols).map((c) => c.length));
  const W = M * 2 + maxD * COLW + NW, H = M * 2 + rows * (NH + VG) - VG;
  const pos = {};
  Object.keys(cols).map(Number).sort((a, b) => a - b).forEach((d) => {
    const list = cols[d], colH = list.length * (NH + VG) - VG, y0 = M + (H - 2 * M - colH) / 2;
    list.forEach((n, i) => { pos[n.key] = { x: M + d * COLW, y: y0 + i * (NH + VG) }; });
  });
  const COL = { input: '#6ea8fe', mid: '#9fb0c8', kpi: '#f6b13b' };
  let e = '';
  for (const ed of edges) {
    const a = pos[ed.from], b = pos[ed.to]; if (!a || !b) continue;
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
    const col = ed.sign > 0 ? '#54d08a' : '#e78284', w = (1 + Math.min(4, ed.strength * 3)).toFixed(1);
    e += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${col}" stroke-width="${w}" opacity="0.75" marker-end="url(#lk-ah-${ed.sign > 0 ? 'p' : 'n'})"/>`;
  }
  let nd = '';
  for (const n of nodes) {
    const p = pos[n.key]; if (!p) continue;
    let la = n.label; if (la.length > 17) la = la.slice(0, 16) + '…';
    nd += `<g><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="6" fill="${COL[n.kind] || '#9fb0c8'}" opacity="0.92"/><text x="${p.x + 8}" y="${p.y + NH / 2 + 4}" font-size="11" fill="#12161f" font-weight="600">${esc(la)}</text></g>`;
  }
  const defs = '<defs><marker id="lk-ah-p" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#54d08a"/></marker><marker id="lk-ah-n" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#e78284"/></marker></defs>';
  return `<div class="lk-chain"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${e}${nd}</svg></div>`
    + '<p class="lk-muted" style="font-size:12px;margin-top:6px">🟦 ákvörðun · ⬜ milliliður · 🟨 markmið · <span style="color:#54d08a">grænt</span>=eykur · <span style="color:#e78284">rautt</span>=dregur úr'
    + (chain.clipped ? ' · <i>(sýni sterkustu tengslin)</i>' : '') + '</p>';
}

// Leikstjóra-greiningarmælaborð: skorkort-tafla + ákvarðanir + ferla-gröf. Lit per lið (samræmt).
const LK_PAL = ['#6ea8fe', '#f6b13b', '#54d08a', '#e78284', '#b98cff', '#5ac8e0', '#f0a3c8', '#a0d468'];
function lkLineChart(title, series, opts = {}) {
  const W = 320, H = 150, pl = 34, pr = 10, pt = 22, pb = 22;
  const allPts = series.flatMap((s) => s.points);
  if (!allPts.length) return '';
  const rounds = [...new Set(allPts.map((p) => p.round))].sort((a, b) => a - b);
  const xmin = rounds[0], xmax = rounds[rounds.length - 1] > xmin ? rounds[rounds.length - 1] : xmin + 1;
  let ymin = opts.min != null ? opts.min : Math.min(...allPts.map((p) => p.value));
  let ymax = opts.max != null ? opts.max : Math.max(...allPts.map((p) => p.value));
  if (ymax - ymin < 1) { ymax += 1; ymin -= 1; }
  const X = (r) => pl + (W - pl - pr) * (xmax === xmin ? 0.5 : (r - xmin) / (xmax - xmin));
  const Y = (v) => (H - pb) - (H - pt - pb) * (v - ymin) / (ymax - ymin);
  const col = (s, i) => opts.colorOf ? opts.colorOf(s.teamId) : LK_PAL[i % LK_PAL.length];
  let g = `<text x="${pl}" y="14" font-size="11" fill="#9fb0c8">${esc(title)}</text>`;
  for (let i = 0; i <= 2; i++) { const v = ymin + (ymax - ymin) * i / 2, y = Y(v); g += `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.07)"/><text x="${pl - 4}" y="${(y + 3).toFixed(1)}" font-size="9" fill="#7b879c" text-anchor="end">${num(v, 0)}</text>`; }
  series.forEach((s, i) => {
    const c = col(s, i), pts = s.points.slice().sort((a, b) => a.round - b.round);
    const d = pts.map((p, j) => (j ? 'L' : 'M') + X(p.round).toFixed(1) + ',' + Y(p.value).toFixed(1)).join(' ');
    g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2"/>`;
    for (const p of pts) g += `<circle cx="${X(p.round).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="2.5" fill="${c}"/>`;
  });
  for (const r of rounds) g += `<text x="${X(r).toFixed(1)}" y="${H - 7}" font-size="9" fill="#7b879c" text-anchor="middle">${r}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
}
// Studio-forskoðunar-rit: ferill útkomu yfir ÁR (2000+i) + BAU (punktalína) + markmiðs-lína + raun-lína (fjólublá).
function stChart(title, mid, bau, targetLine, color, reality) {
  const W = 320, H = 132, pl = 34, pr = 10, pt = 18, pb = 24, n = mid.length;
  const all = mid.concat((bau || []).slice(0, n), (reality || []).slice(0, n), targetLine != null ? [targetLine] : []);
  let ymin = Math.min(...all), ymax = Math.max(...all); if (ymax - ymin < 1) { ymax += 1; ymin -= 1; }
  const X = (i) => pl + (W - pl - pr) * (n <= 1 ? 0.5 : i / (n - 1));
  const Y = (v) => (H - pb) - (H - pt - pb) * (v - ymin) / (ymax - ymin);
  let g = `<text x="${pl}" y="12" font-size="11" fill="#9fb0c8">${esc(title)}</text>`;
  // ár-ás: merki á kjörtímabils-skilum (á 4 ára fresti)
  for (let i = 0; i < n; i += 4) g += `<text x="${X(i).toFixed(1)}" y="${H - 6}" font-size="9" fill="#7b879c" text-anchor="middle">${YEAR_START + i}</text>`;
  if (n > 1) g += `<text x="${X(n - 1).toFixed(1)}" y="${H - 6}" font-size="9" fill="#7b879c" text-anchor="end">${YEAR_START + n}</text>`;
  if (bau && bau.length) { const d = bau.slice(0, n).map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' '); g += `<path d="${d}" fill="none" stroke="#6b7280" stroke-width="1" stroke-dasharray="3 3"/>`; }
  if (reality && reality.length) { const d = reality.slice(0, n).map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' '); g += `<path d="${d}" fill="none" stroke="#b98cff" stroke-width="1.4" opacity="0.85"/>`; }
  if (targetLine != null) { const y = Y(targetLine).toFixed(1); g += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="#f6b13b" stroke-width="1" stroke-dasharray="4 2" opacity="0.55"/>`; }
  const d = mid.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>`;
  g += `<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(mid[n - 1]).toFixed(1)}" r="2.5" fill="${color}"/>`;
  g += `<text x="${W - pr}" y="${(Y(mid[n - 1]) - 4).toFixed(1)}" font-size="10" fill="${color}" text-anchor="end">${num(mid[n - 1])}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
}
// „Þjóðarhagur"-heildarmælir: hálfhringur 0–100, valens-litur.
function arcGauge(score) {
  const s = Math.max(0, Math.min(100, score)), W = 200, H = 116, cx = W / 2, cy = 104, r = 84;
  const col = s >= 70 ? '#54d08a' : s >= 40 ? '#e8c14a' : '#e78284';
  const ang = Math.PI * (1 - s / 100), x = cx + r * Math.cos(ang), y = cy - r * Math.sin(ang);
  const bg = `<path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="13"/>`;
  const fg = `<path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="13" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bg}${fg}<text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="42" font-weight="800" fill="${col}">${Math.round(s)}</text><text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="12" fill="#9fb0c8">/ 100</text></svg>`;
}
// Markmiðs-mælir: núgildi vs markmið + stig-fylltur borði.
function goalMeter(kpi, value, scoreVal) {
  const dir = kpi.dir, tgt = dir === 'target' ? kpi.target : dir === 'max' ? kpi.max : kpi.min;
  const col = scoreVal >= 80 ? '#54d08a' : scoreVal >= 40 ? '#e8c14a' : '#e78284';
  const aim = dir === 'target' ? 'sem næst ' + num(tgt) : dir === 'max' ? 'ekki yfir ' + num(tgt) : 'ekki undir ' + num(tgt);
  const tip = kpi.label + ' — markmiðið er ' + aim + '. Stig 100 = innan marka; lækkar eftir því sem fjær dregur.' + (kpi.weight > 1 ? ' (vegur ×' + kpi.weight + ' í þínu umboði.)' : '');
  return `<div class="lk-goalmeter" title="${esc(tip)}"><div class="lk-gm-top"><span>${esc(kpi.label)}${kpi.weight > 1 ? ' <span class="lk-kpi-w">×' + kpi.weight + '</span>' : ''}</span><b style="color:${col}">${num(value)}</b></div><div class="lk-gm-bar"><div class="lk-gm-fill" style="width:${Math.max(2, Math.min(100, scoreVal))}%;background:${col}"></div></div><div class="lk-gm-sub"><span class="lk-muted">markmið ${dir === 'max' ? '≤ ' : dir === 'min' ? '≥ ' : ''}${num(tgt)}</span><span style="color:${col}">${scoreVal}/100</span></div></div>`;
}
function renderFacAnalytics(an) {
  if (!an || !an.scorecard || !an.scorecard.length) return '<p class="lk-muted">Greining birtist eftir fyrstu leystu umferð.</p>';
  const order = an.trajectories.cumulative.map((s) => s.teamId);
  const colorOf = (teamId) => LK_PAL[((order.indexOf(teamId) % LK_PAL.length) + LK_PAL.length) % LK_PAL.length];
  const scoreCol = (v) => v == null ? '#9fb0c8' : v >= 80 ? '#54d08a' : v >= 40 ? '#e8c14a' : '#e78284';
  const hasRole = an.scorecard.some((r) => r.role);
  const kpiCols = an.scorecard[0].perKpi.map((p) => p.label);
  let sc = '<table class="lk-tbl"><tr><th>Lið</th>' + (hasRole ? '<th>Hlutverk</th>' : '') + kpiCols.map((l) => '<th>' + esc(l) + '</th>').join('') + '<th>Uppsafnað</th></tr>';
  an.scorecard.forEach((row) => {
    sc += '<tr><td><span class="lk-swatch" style="background:' + colorOf(row.teamId) + '"></span>' + esc(row.name) + '</td>'
      + (hasRole ? '<td style="font-size:12px">' + esc(row.role || '–') + '</td>' : '')
      + row.perKpi.map((p) => '<td style="color:' + scoreCol(p.score) + ';font-weight:600">' + (p.score == null ? '–' : p.score) + '</td>').join('')
      + '<td><b>' + num(row.cumulative) + '</b></td></tr>';
  });
  sc += '</table>';
  const decHeads = an.decisionsTable[0] ? an.decisionsTable[0].choices.map((c) => c.decLabel) : [];
  let dt = '<table class="lk-tbl"><tr><th>Lið</th>' + decHeads.map((l) => '<th>' + esc(l) + '</th>').join('') + '</tr>';
  an.decisionsTable.forEach((row) => { dt += '<tr><td>' + esc(row.name) + '</td>' + row.choices.map((c) => '<td>' + esc(c.optLabel) + '</td>').join('') + '</tr>'; });
  dt += '</table>';
  let charts = '<div class="lk-charts">' + lkLineChart('Uppsafnað stig', an.trajectories.cumulative, { colorOf });
  for (const k of Object.keys(an.trajectories.byKpi)) { const b = an.trajectories.byKpi[k]; charts += lkLineChart(b.label + ' (stig)', b.series, { min: 0, max: 100, colorOf }); }
  charts += '</div>';
  return '<h3 style="font-size:14px;margin:4px 0">Staða liða</h3>' + sc
    + '<h3 style="font-size:14px;margin:12px 0 4px">Ákvarðanir umferðar</h3>' + dt
    + '<h3 style="font-size:14px;margin:12px 0 4px">Þróun yfir umferðir</h3>' + charts;
}

export function mountLeikur(root) {
  const S = { code: null, role: null, token: null, teamId: null, state: null, draft: {}, poll: null, busy: false, view: null, editDraft: null, editRoles: false, editStudio: true, studioTab: 0, dials: null, unlocked: false, stTimer: null, stRound: null };
  let model = {}; try { model = JSON.parse(document.getElementById('leikur-model')?.textContent || '{}'); } catch (e) {}

  // Endurheimt úr URL + localStorage (endurtenging)
  const u = new URL(location.href);
  const code = (u.searchParams.get('g') || '').toUpperCase();
  if (code) {
    const fac = localStorage.getItem(lsFac(code));
    const team = localStorage.getItem(lsTeam(code));
    if (fac) { S.code = code; S.role = 'fac'; S.token = fac; }
    else if (team) { try { const t = JSON.parse(team); S.code = code; S.role = 'team'; S.token = t.token; S.teamId = t.teamId; } catch (e) {} }
    else { S.code = code; S.role = 'watch'; }
  }

  function startPoll() { stopPoll(); refresh(); S.poll = setInterval(refresh, 2500); }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }

  async function refresh() {
    if (!S.code) return;
    const { status, json } = await api('/' + S.code + '/state', { token: S.token });
    if (status === 404) { stopPoll(); root.innerHTML = card('Leikur fannst ekki', '<a class="lk-btn" href="/leikur/">Til baka</a>'); return; }
    S.state = json;
    render();
  }

  async function act(fn) { if (S.busy) return; S.busy = true; try { await fn(); } finally { S.busy = false; } await refresh(); }

  // ── Aðgerðir ──
  async function createGame() {
    const roles = !!(root.querySelector('#lk-roles') && root.querySelector('#lk-roles').checked);
    const studio = !!(root.querySelector('#lk-studio') && root.querySelector('#lk-studio').checked);
    const body = {}; if (roles) body.roles = true; if (studio) body.mode = 'studio';
    const { json } = await api('/create', { method: 'POST', body });
    if (!json.code) return;
    localStorage.setItem(lsFac(json.code), json.facToken);
    location.href = '/leikur/?g=' + json.code;
  }
  async function joinGame(joinCode, name) {
    const { status, json } = await api('/' + joinCode + '/join', { method: 'POST', body: { name } });
    if (status !== 200 || !json.teamToken) { alert(json.error === 'started' ? 'Leikur er þegar byrjaður.' : json.error === 'not-found' ? 'Kóði fannst ekki.' : 'Villa við inngöngu.'); return; }
    localStorage.setItem(lsTeam(joinCode), JSON.stringify({ token: json.teamToken, teamId: json.teamId }));
    location.href = '/leikur/?g=' + joinCode;
  }
  const control = (action) => act(() => api('/' + S.code + '/control', { method: 'POST', body: { action }, token: S.token }));
  const submitDecisions = () => act(async () => { await api('/' + S.code + '/decisions', { method: 'POST', body: { round: S.state.round, decisions: S.draft, locked: true }, token: S.token }); S.unlocked = false; });

  // ── Teikning ──
  function card(title, body) { return '<div class="lk-card"><h2>' + esc(title) + '</h2>' + body + '</div>'; }
  function leaderboard(st) {
    const rows = [...st.teams].sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0))
      .map((t, i) => '<div class="lk-lb-row"><span>' + (i + 1) + '. ' + esc(t.name) + '</span><span><b>' + num(t.cumulative || 0) + '</b> stig</span></div>').join('');
    return '<div class="lk-card"><h2>🏆 Stigatafla</h2>' + (rows || '<p>Engin lið enn.</p>') + '</div>';
  }
  function mandateCard(st) {
    const rows = st.mandate.kpis.map((k) => '<div class="lk-lb-row"><span>' + esc(k.label) + (k.weight && k.weight !== 1 ? ' <span class="lk-kpi-w">×' + k.weight + '</span>' : '') + '</span><span>' + (k.dir === 'target' ? 'markmið ' + num(k.target) : k.dir === 'max' ? '≤ ' + num(k.max) : '≥ ' + num(k.min)) + '</span></div>').join('');
    return '<div class="lk-card"><h2>🎯 Umboð</h2><p>Náðu markmiðunum — þau eru í togstreitu.</p>' + rows + '</div>';
  }
  // S5 — hlutverk (roles): borði fyrir eigið hlutverk, roleMap-tafla (fac), afhjúpun í leikslok.
  function roleBanner(st) { return st.role ? '<div class="lk-role-banner">🎭 Þitt umboð: <b>' + esc(st.role.label) + '</b> — ' + esc(st.role.blurb) + '</div>' : ''; }
  function roleMapCard(st) { if (!st.roleMap || !st.roleMap.length) return ''; const nm = Object.fromEntries((st.teams || []).map((t) => [t.id, t.name])); return '<div class="lk-card"><h2>🎭 Hlutverk liða (leynileg)</h2>' + st.roleMap.map((r) => '<div class="lk-lb-row"><span>' + esc(nm[r.teamId] || ('Lið ' + r.teamId)) + '</span><span>' + esc(r.label) + '</span></div>').join('') + '</div>'; }
  function revealCard(st) { if (!st.rolesReveal || !st.rolesReveal.length) return ''; const nm = Object.fromEntries((st.teams || []).map((t) => [t.id, t.name])); return '<div class="lk-card"><h2>🎭 Umboð afhjúpuð</h2>' + st.rolesReveal.map((r) => '<div class="lk-lb-row"><span>' + esc(nm[r.teamId] || ('Lið ' + r.teamId)) + '</span><span><b>' + esc(r.label) + '</b></span></div><div style="font-size:12px;color:var(--muted);margin:-2px 0 6px">' + esc(r.blurb) + '</div>').join('') + '</div>'; }

  function render() {
    if (!S.code) { if (S.view === 'editor') return renderEditor(); return renderLanding(); }
    const st = S.state; if (!st) { root.innerHTML = '<p>Hleð…</p>'; return; }
    if (S.role === 'fac') return renderFacilitator(st);
    if (S.role === 'team') return renderTeam(st);
    return renderWatch(st);
  }

  function renderLanding() {
    root.innerHTML =
      '<div class="lk-card"><h1>🎮 RÁS-Leikurinn</h1><p>Turn-based þjóðhagfræði-hermir. Keppandi „ríkisstjórnar"-lið stýra hvert sínu Íslandi gegnum 8 umferðir.</p></div>' +
      '<div class="lk-card"><h2>Leikstjóri</h2><button class="lk-btn" id="lk-create">Búa til nýjan leik</button> <button class="lk-btn" id="lk-createcustom" style="background:#5ac8e0">Sérsníða leik…</button><label style="display:block;margin-top:10px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="lk-studio" checked style="vertical-align:middle;margin-right:6px"/>🎛️ Stjórnstöð — þátttakendur fá sleða + lifandi gröf (annars einföld val)</label><label style="display:block;margin-top:6px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="lk-roles" style="vertical-align:middle;margin-right:6px"/>🎭 Leynileg hlutverk — hvert lið fær ólíkt, hulið umboð (afhjúpað í leikslok)</label></div>' +
      '<div class="lk-card"><h2>Lið — ganga inn</h2><input id="lk-code" placeholder="KÓÐI" maxlength="6" style="text-transform:uppercase;padding:8px;margin-right:6px" /> <input id="lk-name" placeholder="Nafn liðs" maxlength="40" style="padding:8px;margin-right:6px" /> <button class="lk-btn" id="lk-join">Ganga inn</button></div>';
    root.querySelector('#lk-create').onclick = () => createGame();
    root.querySelector('#lk-createcustom').onclick = () => { S.view = 'editor'; render(); };
    root.querySelector('#lk-join').onclick = () => {
      const c = (root.querySelector('#lk-code').value || '').trim().toUpperCase();
      const n = (root.querySelector('#lk-name').value || '').trim();
      if (c.length >= 4 && n) joinGame(c, n); else alert('Sláðu inn kóða og nafn.');
    };
  }

  function renderFacilitator(st) {
    let controls = '';
    const stopBtn = ' <button class="lk-btn" id="lk-stop" style="background:#e78284">⏹️ Stöðva leik</button>';
    if (st.phase === 'lobby') controls = '<button class="lk-btn" id="lk-start"' + (st.teams.length ? '' : ' disabled') + '>Byrja leik (' + st.teams.length + ' lið)</button>';
    else if (st.phase === 'decide') {
      const rl = st.lockRoster || [], ready = rl.filter((r) => r.locked).length;
      const rosterList = rl.map((r) => '<span style="margin-right:12px">' + (r.locked ? '✅' : '⏳') + ' ' + esc(r.name) + '</span>').join('');
      controls = '<p>Umferð ' + st.round + ' — lið taka ákvarðanir. <b>' + ready + '/' + rl.length + ' tilbúin</b></p>' + (rosterList ? '<div style="margin:6px 0;font-size:13px">' + rosterList + '</div>' : '') + '<button class="lk-btn" id="lk-resolve">Leysa umferð ' + st.round + '</button>' + stopBtn;
    } else if (st.phase === 'resolved') controls = '<p>Umferð ' + st.round + ' leyst.</p><button class="lk-btn" id="lk-next">' + (st.round >= 8 ? 'Ljúka leik' : 'Næsta umferð') + '</button>' + stopBtn;
    else if (st.phase === 'ended') controls = '<p><b>🏁 Leik lokið.</b></p><button class="lk-btn" id="lk-newgame">🔄 Nýr leikur</button>';
    const teamList = st.teams.map((t) => '<div class="lk-lb-row"><span>' + esc(t.name) + '</span><span>' + num(t.cumulative || 0) + ' stig</span></div>').join('') || '<p>Bíð eftir liðum…</p>';
    root.innerHTML =
      '<div class="lk-card"><h1>Leikstjóri</h1><p>Kóði til að deila:</p><div style="font-size:38px;font-weight:800;letter-spacing:6px;color:#f6b13b">' + esc(st.code) + '</div></div>' +
      (st.event ? card('📋 Umferð ' + st.round + ': ' + st.event.title, '<p>' + esc(st.event.text) + '</p>') : '') +
      '<div class="lk-card"><h2>Lið</h2>' + teamList + '</div>' +
      roleMapCard(st) +
      '<div class="lk-card">' + controls + '</div>' +
      leaderboard(st) +
      (st.analytics ? card('📈 Greining (leikstjóri)', renderFacAnalytics(st.analytics)) : '');
    const b = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = fn; };
    b('#lk-start', () => control('start')); b('#lk-resolve', () => control('resolve')); b('#lk-next', () => control('next'));
    b('#lk-stop', () => control('stop')); b('#lk-newgame', () => { location.href = '/leikur/'; });
  }

  function renderTeam(st) {
    if (st.phase === 'lobby') { root.innerHTML = card('Beðið eftir leikstjóra', '<p>Þú ert kominn/n inn. Leikstjórinn byrjar leikinn þegar öll lið eru tilbúin.</p>') + leaderboard(st); return; }
    if (st.phase === 'ended') {
      const me = (st.teams || []).find((t) => t.id === S.teamId);
      const rounds = st.round || 8, cum = me ? (me.cumulative || 0) : 0, avg = rounds ? cum / rounds : 0, et = endTitle(avg);
      const rank = me ? ([...st.teams].sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0)).findIndex((t) => t.id === S.teamId) + 1) : 0;
      const shareText = 'RÁS-Leikurinn — Ísland 2000–2032\n' + et.title + '\nUppsafnað: ' + num(cum) + ' stig (meðal ' + num(avg) + '/100)' + (rank ? '\nSæti: ' + rank + '/' + st.teams.length : '') + '\nkarp.is/leikur/';
      root.innerHTML = card('🏁 Leik lokið — árið er 2032',
        '<div class="lk-title-card"><div class="lk-muted">Arfleifð ríkisstjórnarinnar 2000–2032</div><div class="lk-title-big">' + esc(et.title) + '</div><p>' + esc(et.blurb) + '</p><p><b>' + num(cum) + '</b> stig uppsafnað · meðal <b>' + num(avg) + '</b>/100' + (rank ? ' · sæti <b>' + rank + '/' + st.teams.length + '</b>' : '') + '</p><button class="lk-btn" id="lk-share" style="margin-top:8px">📋 Afrita niðurstöðu</button></div>')
        + revealCard(st) + leaderboard(st);
      const sb = root.querySelector('#lk-share'); if (sb) sb.onclick = () => { try { navigator.clipboard.writeText(shareText); sb.textContent = '✅ Afritað!'; } catch (e) { sb.textContent = shareText; } };
      return;
    }
    if (st.phase === 'resolved') return renderTeamResults(st);
    // Ný umferð → núlla „breyta"-stöðu
    if (S.stRound !== st.round) { S.unlocked = false; S.stRound = st.round; }
    // Læst-staða (A): eftir læsingu sýna staðfestingu + „Breyta" (aflæsa fram að resolve)
    if (st.you && st.you.locked && !S.unlocked) return renderLocked(st);
    if (st.mode === 'studio') return renderStudio(st);

    // decide-fasi (classic): atburður + 5 ákvarðanir
    const ev = st.event || { title: '', text: '', responses: [] };
    const decHtml = st.decisions.map((d) => {
      const opts = d.mode === 'response' ? (ev.responses || []) : d.options;
      const chips = opts.map((o) => '<span class="lk-opt' + (S.draft[d.id] === o.key ? ' sel' : '') + '" data-dec="' + d.id + '" data-opt="' + o.key + '">' + esc(o.label) + '</span>').join('');
      return '<div style="margin:10px 0"><b>' + esc(d.label) + '</b><br>' + (chips || '<span style="color:var(--muted)">—</span>') + '</div>';
    }).join('');
    const ready = st.decisions.every((d) => S.draft[d.id] != null);
    root.innerHTML =
      roleBanner(st) +
      card('📋 Umferð ' + st.round + ': ' + ev.title, '<p>' + esc(ev.text) + '</p>') +
      '<div class="lk-card"><h2>Ákvarðanir liðsins</h2>' + decHtml +
      '<button class="lk-btn" id="lk-lock"' + (ready ? '' : ' disabled') + ' style="margin-top:10px">Læsa ákvörðunum</button>' +
      (ready ? '' : '<p style="color:var(--muted);font-size:13px">Veldu í öllum flokkum til að læsa.</p>') + '</div>' +
      mandateCard(st) + leaderboard(st);
    root.querySelectorAll('.lk-opt').forEach((el) => { el.onclick = () => { S.draft[el.dataset.dec] = el.dataset.opt; render(); }; });
    const lock = root.querySelector('#lk-lock'); if (lock) lock.onclick = () => submitDecisions();
  }

  function renderTeamResults(st) {
    const mine = (st.results || []).find((r) => r.teamId === S.teamId);
    let scorecard = '<p>Beðið eftir niðurstöðum…</p>';
    if (mine && mine.detail && mine.detail.perKpi) {
      const rows = mine.detail.perKpi.map((p) => {
        const col = p.score >= 80 ? '#54d08a' : p.score >= 40 ? '#e8c14a' : '#e78284';
        return '<div class="lk-lb-row"><span>' + esc(p.label) + ' <span style="color:var(--muted)">(' + num(p.value) + ')</span></span>'
          + '<span style="color:' + col + ';font-weight:700">' + p.score + '/100</span></div>';
      }).join('');
      scorecard = rows + '<div class="lk-lb-row" style="border-top:2px solid #f6b13b;margin-top:6px"><span><b>Umferðar-stig</b></span><span><b>' + num(mine.roundScore) + '</b></span></div>'
        + (mine.detail.crisis ? '<p style="color:#e78284;font-weight:700;margin-top:8px">⚠ Kreppa — stig skert.</p>' : '');
    }
    const chainHtml = (mine && mine.detail && mine.detail.chain) ? renderChain(mine.detail.chain) : '';
    // Flavor: fréttir, „svona fór það" (vs raunveruleikinn), fylgi/endurkjör
    let extras = '';
    if (mine && mine.detail && mine.detail.kpis) {
      const kp = mine.detail.kpis;
      const heads = newsHeadlines(kp);
      extras += '<div class="lk-card"><h2>📰 Fréttir kjörtímabilsins</h2><div class="lk-news">' + heads.map((h) => '<div class="lk-news-item"><span>📰</span><span>' + esc(h) + '</span></div>').join('') + '</div></div>';
      const idx = Math.min((REALITY.verdbolga || []).length - 1, st.round * 4 - 1);
      const realK = {}; let haveReal = true;
      for (const kpi of st.mandate.kpis) { const arr = REALITY[kpi.key]; if (arr) realK[kpi.key] = arr[idx]; else haveReal = false; }
      if (haveReal) {
        const realComp = scoreRound(realK, st.mandate).composite, you = mine.roundScore, diff = Math.round((you - realComp) * 10) / 10;
        const dcol = diff >= 0 ? '#54d08a' : '#e78284', dtxt = 'þú stóðst þig ' + num(Math.abs(diff)) + ' stigum ' + (diff >= 0 ? 'BETUR' : 'VERR') + ' en raunveruleg ríkisstjórn';
        extras += '<div class="lk-card"><h2 title="Þín stig þessa kjörtímabils borin saman við hvernig raunveruleg útkoma Íslands skoraði á sömu markmið (stílfært viðmið).">🕰️ Svona fór það</h2><div class="lk-vs"><div><div class="lk-muted" style="font-size:12px">Þú</div><div class="lk-vs-num" style="color:#6ea8fe">' + num(you) + '</div></div><div class="lk-muted">vs</div><div><div class="lk-muted" style="font-size:12px">Raunveruleikinn</div><div class="lk-vs-num" style="color:#b98cff">' + num(realComp) + '</div></div><div style="color:' + dcol + ';font-weight:700;flex:1;min-width:180px">' + dtxt + '</div></div></div>';
      }
      const pop = popularity(kp), reElect = pop >= 50, pcol = pop >= 55 ? '#54d08a' : pop >= 35 ? '#e8c14a' : '#e78284';
      extras += '<div class="lk-card"><h2>🗳️ Kosningar</h2><p>Fylgi ríkisstjórnar: <b style="color:' + pcol + '">' + pop + '%</b> → <b>' + (reElect ? 'Endurkjörin ✅' : 'Féll í kosningum ❌') + '</b></p></div>';
    }
    root.innerHTML = roleBanner(st) + card('📊 Skorkort — umferð ' + st.round, scorecard)
      + extras
      + (chainHtml ? card('🔗 Orsaka-keðja ákvarðana ykkar', chainHtml) : '')
      + leaderboard(st)
      + '<div class="lk-card"><p style="color:var(--muted)">Beðið eftir að leikstjóri opni næsta kjörtímabil…</p></div>';
  }

  // ── Studio-stjórnstöð (fullur hermir sem ákvörðunar-yfirborð; forskoðun keyrir vélina á eigin drögum) ──
  function initDials(st) {
    const d = defaultDials(BASELINE);
    // Byrjunar-staða = besta-nálgun á 2000-stefnu (klippt); læstar umferðir bera svo á milli.
    for (const [k, v] of Object.entries(YEAR2000_DIALS)) { const c = BASELINE.levers[k]; if (c) d[k] = Math.max(c.min, Math.min(c.max, v)); }
    for (const set of (st.history || [])) if (set && set.levers) for (const [k, v] of Object.entries(set.levers)) d[k] = v;
    return d;
  }
  function studioSim(st) {
    const history = [...(st.history || []), { levers: S.dials }];
    const scenario = { events: st.scenarioSoFar || [] };
    const inp = buildInputs(history, { baseline: BASELINE, scenario, mode: 'studio' });
    const levOv = {}, shkOv = {};
    for (const k in inp.levers) levOv[k] = inp.levers[k].value;
    for (const k in inp.shocks) shkOv[k] = inp.shocks[k].value;
    return simulate({ baseline: BASELINE, links: LINKS, levers: levOv, shocks: shkOv, quarters: inp.quarters });
  }
  const termYears = (r) => [YEAR_START + 4 * (r - 1), YEAR_START + 4 * r];
  // Tímalínu-borði: 8 kjörtímabil 2000▬2032, núverandi gyllt, liðin ✓, framtíð faint (án spillis).
  function ribbonHtml(st) {
    const cur = st.round, evs = st.scenarioSoFar || [];
    let segs = '';
    for (let r = 1; r <= 8; r++) {
      const [y0, y1] = termYears(r), cls = r < cur ? 'past' : r === cur ? 'now' : 'future';
      const ev = r <= cur ? evs[r - 1] : null, ic = ev && ev.icon ? ev.icon : (r < cur ? '✓' : '');
      const tip = ev ? y0 + '–' + y1 + ': ' + ev.title : y0 + '–' + y1 + ' (óráðið)';
      segs += `<div class="lk-term ${cls}" title="${esc(tip)}"><span class="lk-term-ic">${ic}</span><span class="lk-term-y">${y0}</span></div>`;
    }
    return `<div class="lk-ribbon">${segs}<div class="lk-term end"><span class="lk-term-ic">🏁</span><span class="lk-term-y">2032</span></div></div>`;
  }
  function drawStudioPreview(st) {
    const el = root.querySelector('#lk-st-chart'); if (!el) return;
    const sim = studioSim(st), endYear = YEAR_START + st.round * 4;
    const kpiVals = {}; for (const k of st.mandate.kpis) { const oc = sim.outcomes[k.key]; kpiVals[k.key] = oc ? oc.mid[oc.mid.length - 1] : 0; }
    const sc = scoreRound(kpiVals, st.mandate);
    const pop = popularity(kpiVals), popCol = pop >= 55 ? '#54d08a' : pop >= 35 ? '#e8c14a' : '#e78284';
    let html = '<div class="lk-card lk-gauge-card"><div class="lk-gauge" title="Samsett stig 0–100 úr umboðs-markmiðunum í lok kjörtímabilsins. Hærra = betri hagstjórn.">' + arcGauge(sc.composite) + '</div><div style="flex:1"><h2 style="margin:0">Þjóðarhagur</h2><p class="lk-muted" style="font-size:12px;margin:4px 0 8px">Samsett staða m.v. umboðið í lok kjörtímabilsins (' + endYear + '). Hærra = betra.' + (sc.crisis ? ' <span style="color:#e78284">⚠ Kreppa!</span>' : '') + '</p><div class="lk-pop" title="Fylgi ríkisstjórnarinnar — ræðst af verðbólgu, atvinnuleysi og hagvexti. Undir 50% og þú átt á hættu að falla í kosningum."><div class="lk-gm-top"><span>🗳️ Fylgi ríkisstjórnar</span><b style="color:' + popCol + '">' + pop + '%</b></div><div class="lk-gm-bar"><div class="lk-gm-fill" style="width:' + pop + '%;background:' + popCol + '"></div></div></div></div></div>';
    html += '<div class="lk-card"><h2 title="Hversu nálægt hverju umboðs-markmiði þú ert. Fyllri borði = betra.">🎯 Markmið</h2><div class="lk-goalmeters">';
    for (const k of st.mandate.kpis) { const p = sc.perKpi.find((x) => x.key === k.key); html += goalMeter(k, kpiVals[k.key], p ? p.score : 0); }
    html += '</div></div>';
    let charts = '<div class="lk-card"><h2 title="Þróun frá 2000: þín braut (heil lína), grunnlína (punktar), raunveruleikinn (fjólublár) og markmið (gult).">📈 Þróun 2000–' + endYear + '</h2><div class="lk-charts">';
    for (const k of st.mandate.kpis) {
      const oc = sim.outcomes[k.key]; if (!oc) continue;
      const mid = oc.mid, last = mid.length - 1, bau = (BASELINE.outcomes[k.key] || {}).path || [], reality = REALITY[k.key] || [];
      const tgt = k.dir === 'target' ? k.target : k.dir === 'max' ? k.max : k.min, fin = mid[last], b = k.band || 0;
      const good = k.dir === 'target' ? Math.abs(fin - k.target) <= b : k.dir === 'max' ? fin <= k.max + b : fin >= k.min - b;
      charts += stChart(k.label + (k.weight > 1 ? ' ×' + k.weight : ''), mid, bau, tgt, good ? '#54d08a' : '#e78284', reality);
    }
    charts += '</div><div class="lk-muted" style="font-size:11px;margin-top:4px">– – grunnlína · <span style="color:#b98cff">▬ raunveruleikinn</span> · gul strikalína = markmið</div></div>';
    html += charts;
    let grid = '<div class="lk-card"><h2 title="Allar 36 útkomur líkansins í lok kjörtímabilsins. Grænt = betra en grunnlína, rautt = verra.">Allar útkomur (' + endYear + ')</h2><div class="lk-heat">';
    for (const o of STUDIO_CAT.outcomes) {
      const oc = sim.outcomes[o.key]; if (!oc) continue;
      const fin = oc.mid[oc.mid.length - 1], bau = (BASELINE.outcomes[o.key] || {}).path || [];
      const bf = bau.length ? bau[Math.min(bau.length - 1, oc.mid.length - 1)] : fin;
      const dev = fin - bf, val = dev * (o.polarity || 0);
      const bg = (o.polarity === 0 || Math.abs(dev) < 1e-6) ? 'rgba(255,255,255,.04)' : val > 0 ? 'rgba(84,208,138,.16)' : 'rgba(231,130,132,.16)';
      const tip = esc(o.label) + ': ' + num(fin) + (o.unit ? ' ' + o.unit : '') + ' (grunnlína ' + num(bf) + ')';
      grid += `<div class="lk-heat-tile" style="background:${bg}" title="${tip}"><span>${esc(o.label)}</span><b>${num(fin)}${o.unit ? ' ' + esc(o.unit) : ''}</b></div>`;
    }
    grid += '</div></div>';
    html += grid;
    el.innerHTML = html;
  }
  function renderStudio(st) {
    if (!S.dials) S.dials = initDials(st);
    const tab = STUDIO_CAT.tabs[S.studioTab] || STUDIO_CAT.tabs[0];
    const tabBar = STUDIO_CAT.tabs.map((t, i) => `<span class="lk-tab${i === S.studioTab ? ' sel' : ''}" data-tab="${i}" role="button" tabindex="0" title="Stefnu-svið: ${esc(t.group)} (${t.levers.length} sleðar)">${esc(t.group)}</span>`).join('');
    const sliders = tab.levers.map((l) => {
      const v = S.dials[l.key] != null ? S.dials[l.key] : l.base, moved = +v !== l.base;
      const eff = leverEffects(l.key, BASELINE, LINKS);
      const effTxt = eff.length ? ' → hefur áhrif á: ' + eff.map((e) => e.label + (e.dir > 0 ? '↑' : '↓')).join(', ') : '';
      const tip = l.label + (l.unit ? ' (' + l.unit + ')' : '') + '.' + effTxt;
      return `<div class="lk-slider-row" title="${esc(tip)}"><label>${esc(l.label)} <span class="lk-val${moved ? ' moved' : ''}" data-val="${l.key}">${num(v)}${l.unit ? ' ' + esc(l.unit) : ''}</span> <span class="lk-muted" style="font-size:11px">grunnur ${num(l.base)}</span></label><input type="range" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" data-lev="${l.key}" aria-label="${esc(l.label)}"></div>`;
    }).join('');
    const [y0, y1] = termYears(st.round), ev = st.event;
    root.innerHTML =
      ribbonHtml(st) +
      `<div class="lk-term-head"><span class="lk-term-badge">Kjörtímabil ${st.round}/8 · ${y0}–${y1}</span><h1 class="lk-term-title">${ev && ev.icon ? ev.icon + ' ' : ''}${ev ? esc(ev.title) : 'Kjörtímabil ' + st.round}</h1>${ev ? '<p class="lk-term-text">' + esc(ev.text) + '</p>' : ''}${ev && ev.watch ? '<p class="lk-watch">⚠ <b>Hvað þarf að huga að:</b> ' + esc(ev.watch) + '</p>' : ''}</div>` +
      roleBanner(st) +
      '<div class="lk-studio-main">' +
        '<div class="lk-studio-charts" id="lk-st-chart"></div>' +
        '<div class="lk-studio-controls">' +
          '<div class="lk-card"><h2>🎛️ Stjórnstöð</h2><div class="lk-tabs">' + tabBar + '</div><div id="lk-st-sliders">' + sliders + '</div></div>' +
          mandateCard(st) +
          '<button class="lk-btn lk-lock-big" id="lk-lock">🔒 Læsa kjörtímabili ' + st.round + '</button>' +
        '</div>' +
      '</div>' +
      leaderboard(st);
    attachStudio(st);
    drawStudioPreview(st);
  }
  function attachStudio(st) {
    root.querySelectorAll('.lk-tab').forEach((el) => { el.onclick = () => { S.studioTab = +el.dataset.tab; renderStudio(st); }; });
    root.querySelectorAll('input[data-lev]').forEach((el) => el.oninput = () => {
      const k = el.dataset.lev; S.dials[k] = +el.value;
      const cfg = BASELINE.levers[k], vs = root.querySelector('.lk-val[data-val="' + k + '"]');
      if (vs) { vs.textContent = num(+el.value) + (cfg && cfg.unit ? ' ' + cfg.unit : ''); vs.classList.toggle('moved', +el.value !== cfg.base); }
      if (S.stTimer) return; S.stTimer = setTimeout(() => { S.stTimer = null; drawStudioPreview(st); }, 60);
    });
    const lock = root.querySelector('#lk-lock'); if (lock) lock.onclick = () => submitStudio(st);
  }
  function submitStudio(st) { return act(async () => { await api('/' + S.code + '/decisions', { method: 'POST', body: { round: st.round, decisions: { levers: S.dials }, locked: true }, token: S.token }); S.unlocked = false; }); }

  // Læst-staða (A): staðfesting + samantekt + „Breyta" (aflæsa fram að resolve).
  function renderLocked(st) {
    let summary = '';
    if (st.mode === 'studio') {
      const ch = S.dials ? changedLevers(S.dials, BASELINE) : [];
      summary = ch.length
        ? '<h3 style="font-size:13px;margin:8px 0 2px">Þín stefna:</h3><ul style="margin:2px 0 0;padding-left:18px">' + ch.slice(0, 8).map((c) => '<li>' + esc(c.label) + ': <b>' + num(c.to) + (c.unit ? ' ' + esc(c.unit) : '') + '</b></li>').join('') + '</ul>'
        : '<p class="lk-muted">Engar breytingar frá grunnstefnu.</p>';
    } else {
      const rows = (st.decisions || []).map((d) => { const k = S.draft[d.id]; const opts = d.mode === 'response' ? ((st.event && st.event.responses) || []) : d.options; const o = (opts || []).find((x) => x.key === k); return o ? '<li>' + esc(d.label) + ': <b>' + esc(o.label) + '</b></li>' : ''; }).filter(Boolean).join('');
      summary = rows ? '<h3 style="font-size:13px;margin:8px 0 2px">Þínar ákvarðanir:</h3><ul style="margin:2px 0 0;padding-left:18px">' + rows + '</ul>' : '';
    }
    root.innerHTML =
      roleBanner(st) +
      '<div class="lk-card" style="border-color:#54d08a"><h2>✅ Ákvörðunum læst — umferð ' + st.round + '</h2><p>Beðið eftir hinum liðunum og að leikstjóri leysi umferðina.</p>' + summary + '<button class="lk-btn" id="lk-unlock" style="margin-top:12px;background:#5ac8e0">✏️ Breyta ákvörðun</button></div>' +
      leaderboard(st);
    const u = root.querySelector('#lk-unlock'); if (u) u.onclick = () => { S.unlocked = true; render(); };
  }

  function renderWatch(st) { root.innerHTML = card('👀 Áhorf — leikur ' + esc(st.code), '<p>Umferð ' + (st.round || 0) + ' · ' + esc(st.phase) + '</p>') + leaderboard(st) + revealCard(st); }

  // ── Sviðsmynda-/umboðs-ritill (S4) ──
  function renderEditor() {
    if (!model.defaultScenario) { root.innerHTML = card('Ritill', '<p class="lk-muted">Líkan hleðst ekki. <a href="/leikur/">Til baka</a></p>'); return; }
    if (!S.editDraft) S.editDraft = { rounds: model.rounds || 8, mandate: JSON.parse(JSON.stringify(model.defaultMandate)), scenario: { id: 'custom', events: JSON.parse(JSON.stringify(model.defaultScenario.events)) } };
    const d = S.editDraft;
    const shockOpt = (sel, blank) => (blank ? '<option value="">ekkert</option>' : '') + (model.shocks || []).map((s) => `<option value="${s.key}"${s.key === sel ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
    const leverOpt = (sel) => (model.levers || []).map((s) => `<option value="${s.key}"${s.key === sel ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
    let mh = '<table class="lk-tbl"><tr><th>Markmið</th><th>Gildi</th><th>Band</th></tr>';
    d.mandate.kpis.forEach((k, i) => {
      const cur = k.dir === 'target' ? k.target : k.dir === 'max' ? k.max : k.min;
      mh += `<tr><td>${esc(k.label)} <span style="color:var(--muted)">(${k.dir === 'max' ? '≤' : k.dir === 'min' ? '≥' : '≈'})</span></td><td><input type="number" step="0.1" value="${cur}" data-mk="${i}" data-mf="val" style="width:80px"/></td><td><input type="number" step="0.1" value="${k.band}" data-mk="${i}" data-mf="band" style="width:70px"/></td></tr>`;
    });
    mh += '</table>';
    let rh = '';
    d.scenario.events.forEach((e, r) => {
      const resp = e.responses.map((rp, j) => {
        const type = (rp.effect && rp.effect.lever) ? 'lever' : (rp.effect && rp.effect.shock) ? 'shock' : 'none';
        const effKey = type === 'lever' ? Object.keys(rp.effect.lever)[0] : type === 'shock' ? Object.keys(rp.effect.shock)[0] : '';
        const effVal = type === 'lever' ? rp.effect.lever[effKey] : type === 'shock' ? rp.effect.shock[effKey] : '';
        const keySel = type === 'lever' ? `<select data-r="${r}" data-resp="${j}" data-rf="effkey">${leverOpt(effKey)}</select>` : type === 'shock' ? `<select data-r="${r}" data-resp="${j}" data-rf="effkey">${shockOpt(effKey, false)}</select>` : '';
        return `<div style="margin:4px 0;padding:6px;border:1px solid rgba(255,255,255,.06);border-radius:6px"><input value="${esc(rp.label)}" placeholder="Heiti viðbragðs" data-r="${r}" data-resp="${j}" data-rf="label" style="width:170px"/> <select data-r="${r}" data-resp="${j}" data-rf="efftype"><option value="none"${type === 'none' ? ' selected' : ''}>engin áhrif</option><option value="lever"${type === 'lever' ? ' selected' : ''}>sleði</option><option value="shock"${type === 'shock' ? ' selected' : ''}>sjokk</option></select> ${keySel}${type !== 'none' ? ` <input type="number" step="0.5" value="${effVal}" data-r="${r}" data-resp="${j}" data-rf="effval" style="width:70px"/>` : ''} <button data-r="${r}" data-delresp="${j}" style="background:none;border:0;color:#e78284;cursor:pointer">✕</button></div>`;
      }).join('');
      rh += `<div class="lk-ed-round"><b>Umferð ${r + 1}</b> <button data-delround="${r}" style="background:none;border:0;color:#e78284;cursor:pointer;font-size:12px">✕ eyða</button><input value="${esc(e.title)}" placeholder="Titill atburðar" data-r="${r}" data-ef="title" style="width:100%;margin:4px 0"/><input value="${esc(e.text || '')}" placeholder="Lýsing" data-r="${r}" data-ef="text" style="width:100%;margin:4px 0"/><div>Sjokk: <select data-r="${r}" data-ef="shockkey">${shockOpt(Object.keys(e.shocks || {})[0] || '', true)}</select> <input type="number" step="1" value="${Object.values(e.shocks || {})[0] ?? ''}" placeholder="gildi" data-r="${r}" data-ef="shockval" style="width:70px"/></div><div style="margin-top:6px;color:var(--muted)">Viðbrögð:</div>${resp}<button class="lk-btn" data-addresp="${r}" style="font-size:12px;padding:4px 10px;margin-top:4px">+ viðbragð</button></div>`;
    });
    root.innerHTML = card('🛠️ Sérsníða leik', '<h3 style="font-size:14px;margin:2px 0">Umboð (markmið)</h3>' + mh + '<h3 style="font-size:14px;margin:10px 0 2px">Umferðir (' + d.scenario.events.length + ')</h3>' + rh + '<button class="lk-btn" id="ed-addround" style="margin-top:6px">+ Bæta umferð</button><div id="ed-err" class="lk-err" style="margin-top:8px"></div><label style="display:block;margin-top:10px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="ed-studio"' + (S.editStudio ? ' checked' : '') + ' style="vertical-align:middle;margin-right:6px"/>🎛️ Stjórnstöð — sleðar + lifandi gröf</label><label style="display:block;margin-top:6px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="ed-roles"' + (S.editRoles ? ' checked' : '') + ' style="vertical-align:middle;margin-right:6px"/>🎭 Leynileg hlutverk — hvert lið fær ólíkt, hulið umboð</label><div style="margin-top:14px"><button class="lk-btn" id="ed-create">Búa til leik</button> <button id="ed-back" style="background:none;border:1px solid var(--line,#2a2f3a);color:var(--ink,#e8ecf3);border-radius:8px;padding:9px 16px;cursor:pointer">Til baka</button></div>');
    attachEditor();
  }
  function attachEditor() {
    const d = S.editDraft;
    const setRespEff = (r, j) => {
      const rp = d.scenario.events[r].responses[j];
      const type = root.querySelector(`select[data-r="${r}"][data-resp="${j}"][data-rf="efftype"]`).value;
      const keyEl = root.querySelector(`select[data-r="${r}"][data-resp="${j}"][data-rf="effkey"]`);
      const valEl = root.querySelector(`input[data-r="${r}"][data-resp="${j}"][data-rf="effval"]`);
      const key = keyEl ? keyEl.value : '', val = valEl && valEl.value !== '' ? +valEl.value : 0;
      rp.effect = type === 'lever' ? { lever: { [key]: val } } : type === 'shock' ? { shock: { [key]: val } } : {};
    };
    root.querySelectorAll('[data-ef]').forEach((el) => el.addEventListener('input', () => {
      const r = +el.dataset.r, f = el.dataset.ef, e = d.scenario.events[r];
      if (f === 'title') e.title = el.value; else if (f === 'text') e.text = el.value;
      else if (f === 'shockval') { const k = Object.keys(e.shocks || {})[0]; if (k) e.shocks[k] = el.value === '' ? 0 : +el.value; }
    }));
    root.querySelectorAll('select[data-ef="shockkey"]').forEach((el) => el.addEventListener('change', () => {
      const r = +el.dataset.r, e = d.scenario.events[r], vi = root.querySelector(`input[data-r="${r}"][data-ef="shockval"]`);
      e.shocks = el.value ? { [el.value]: vi && vi.value !== '' ? +vi.value : 0 } : {};
    }));
    root.querySelectorAll('[data-rf="label"]').forEach((el) => el.addEventListener('input', () => { d.scenario.events[+el.dataset.r].responses[+el.dataset.resp].label = el.value; }));
    root.querySelectorAll('[data-rf="effval"]').forEach((el) => el.addEventListener('input', () => setRespEff(+el.dataset.r, +el.dataset.resp)));
    root.querySelectorAll('[data-rf="effkey"]').forEach((el) => el.addEventListener('change', () => setRespEff(+el.dataset.r, +el.dataset.resp)));
    root.querySelectorAll('[data-rf="efftype"]').forEach((el) => el.addEventListener('change', () => {
      const rp = d.scenario.events[+el.dataset.r].responses[+el.dataset.resp];
      rp.effect = el.value === 'none' ? {} : el.value === 'lever' ? { lever: { [model.levers[0].key]: 0 } } : { shock: { [model.shocks[0].key]: 0 } };
      renderEditor();
    }));
    root.querySelectorAll('[data-mk]').forEach((el) => el.addEventListener('input', () => {
      const k = d.mandate.kpis[+el.dataset.mk], v = el.value === '' ? 0 : +el.value;
      if (el.dataset.mf === 'band') k.band = v; else if (k.dir === 'target') k.target = v; else if (k.dir === 'max') k.max = v; else k.min = v;
    }));
    root.querySelectorAll('[data-delround]').forEach((el) => el.onclick = () => { d.scenario.events.splice(+el.dataset.delround, 1); d.rounds = d.scenario.events.length; renderEditor(); });
    root.querySelectorAll('[data-addresp]').forEach((el) => el.onclick = () => { const e = d.scenario.events[+el.dataset.addresp]; e.responses.push({ key: 'r' + (e.responses.length + 1), label: '', effect: {} }); renderEditor(); });
    root.querySelectorAll('[data-delresp]').forEach((el) => el.onclick = () => { d.scenario.events[+el.dataset.r].responses.splice(+el.dataset.delresp, 1); renderEditor(); });
    const ar = root.querySelector('#ed-addround'); if (ar) ar.onclick = () => { const n = d.scenario.events.length + 1; d.scenario.events.push({ round: n, title: 'Umferð ' + n, text: '', shocks: {}, responses: [{ key: 'r1', label: 'Ekkert', effect: {} }] }); d.rounds = d.scenario.events.length; renderEditor(); };
    const bk = root.querySelector('#ed-back'); if (bk) bk.onclick = () => { S.view = null; render(); };
    const rolesEl = root.querySelector('#ed-roles'); if (rolesEl) rolesEl.onchange = () => { S.editRoles = rolesEl.checked; };
    const studioEl = root.querySelector('#ed-studio'); if (studioEl) studioEl.onchange = () => { S.editStudio = studioEl.checked; };
    const cr = root.querySelector('#ed-create'); if (cr) cr.onclick = () => submitEditor();
  }
  async function submitEditor() {
    const d = S.editDraft, errEl = root.querySelector('#ed-err');
    d.scenario.events.forEach((e, i) => { e.round = i + 1; e.responses.forEach((rp, j) => { rp.key = 'r' + (j + 1); }); });
    d.rounds = d.scenario.events.length;
    const errs = [];
    if (d.rounds < 1) errs.push('a.m.k. 1 umferð');
    d.scenario.events.forEach((e, i) => { if (!e.title.trim()) errs.push('Umferð ' + (i + 1) + ': titil vantar'); if (!e.responses.length) errs.push('Umferð ' + (i + 1) + ': a.m.k. 1 viðbragð'); e.responses.forEach((rp, j) => { if (!rp.label.trim()) errs.push('Umferð ' + (i + 1) + ' viðbragð ' + (j + 1) + ': heiti vantar'); }); });
    if (errs.length) { errEl.innerHTML = errs.map(esc).join('<br>'); return; }
    errEl.textContent = 'Bý til leik…';
    const { status, json } = await api('/create', { method: 'POST', body: { scenario: d.scenario, mandate: d.mandate, rounds: d.rounds, ...(S.editRoles ? { roles: true } : {}), ...(S.editStudio ? { mode: 'studio' } : {}) } });
    if (status !== 200 || !json.code) { errEl.innerHTML = (json.errors ? json.errors.map(esc).join('<br>') : 'Villa við að búa til leik.'); return; }
    localStorage.setItem(lsFac(json.code), json.facToken);
    location.href = '/leikur/?g=' + json.code;
  }

  // ── Ræsing ──
  if (S.code && S.token) startPoll();
  else if (S.code && S.role === 'watch') startPoll();
  else render();
}
