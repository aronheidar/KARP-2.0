// RÁS-Leikurinn — client-app (þunn; engin vél, allt ástand kemur frá worker).
// Fjórar sýnir: lending, leikstjóri, lið, niðurstöður. Poll á /api/leikur/<code>/state.
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
function renderFacAnalytics(an) {
  if (!an || !an.scorecard || !an.scorecard.length) return '<p class="lk-muted">Greining birtist eftir fyrstu leystu umferð.</p>';
  const order = an.trajectories.cumulative.map((s) => s.teamId);
  const colorOf = (teamId) => LK_PAL[((order.indexOf(teamId) % LK_PAL.length) + LK_PAL.length) % LK_PAL.length];
  const scoreCol = (v) => v == null ? '#9fb0c8' : v >= 80 ? '#54d08a' : v >= 40 ? '#e8c14a' : '#e78284';
  const kpiCols = an.scorecard[0].perKpi.map((p) => p.label);
  let sc = '<table class="lk-tbl"><tr><th>Lið</th>' + kpiCols.map((l) => '<th>' + esc(l) + '</th>').join('') + '<th>Uppsafnað</th></tr>';
  an.scorecard.forEach((row) => {
    sc += '<tr><td><span class="lk-swatch" style="background:' + colorOf(row.teamId) + '"></span>' + esc(row.name) + '</td>'
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
  const S = { code: null, role: null, token: null, teamId: null, state: null, draft: {}, poll: null, busy: false };

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
    const { json } = await api('/create', { method: 'POST', body: {} });
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
  const submitDecisions = () => act(() => api('/' + S.code + '/decisions', { method: 'POST', body: { round: S.state.round, decisions: S.draft, locked: true }, token: S.token }));

  // ── Teikning ──
  function card(title, body) { return '<div class="lk-card"><h2>' + esc(title) + '</h2>' + body + '</div>'; }
  function leaderboard(st) {
    const rows = [...st.teams].sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0))
      .map((t, i) => '<div class="lk-lb-row"><span>' + (i + 1) + '. ' + esc(t.name) + '</span><span><b>' + num(t.cumulative || 0) + '</b> stig</span></div>').join('');
    return '<div class="lk-card"><h2>🏆 Stigatafla</h2>' + (rows || '<p>Engin lið enn.</p>') + '</div>';
  }
  function mandateCard(st) {
    const rows = st.mandate.kpis.map((k) => '<div class="lk-lb-row"><span>' + esc(k.label) + '</span><span>' + (k.dir === 'target' ? 'markmið ' + num(k.target) : k.dir === 'max' ? '≤ ' + num(k.max) : '≥ ' + num(k.min)) + '</span></div>').join('');
    return '<div class="lk-card"><h2>🎯 Umboð</h2><p>Náðu markmiðunum — þau eru í togstreitu.</p>' + rows + '</div>';
  }

  function render() {
    if (!S.code) return renderLanding();
    const st = S.state; if (!st) { root.innerHTML = '<p>Hleð…</p>'; return; }
    if (S.role === 'fac') return renderFacilitator(st);
    if (S.role === 'team') return renderTeam(st);
    return renderWatch(st);
  }

  function renderLanding() {
    root.innerHTML =
      '<div class="lk-card"><h1>🎮 RÁS-Leikurinn</h1><p>Turn-based þjóðhagfræði-hermir. Keppandi „ríkisstjórnar"-lið stýra hvert sínu Íslandi gegnum 8 umferðir.</p></div>' +
      '<div class="lk-card"><h2>Leikstjóri</h2><button class="lk-btn" id="lk-create">Búa til nýjan leik</button></div>' +
      '<div class="lk-card"><h2>Lið — ganga inn</h2><input id="lk-code" placeholder="KÓÐI" maxlength="6" style="text-transform:uppercase;padding:8px;margin-right:6px" /> <input id="lk-name" placeholder="Nafn liðs" maxlength="40" style="padding:8px;margin-right:6px" /> <button class="lk-btn" id="lk-join">Ganga inn</button></div>';
    root.querySelector('#lk-create').onclick = () => createGame();
    root.querySelector('#lk-join').onclick = () => {
      const c = (root.querySelector('#lk-code').value || '').trim().toUpperCase();
      const n = (root.querySelector('#lk-name').value || '').trim();
      if (c.length >= 4 && n) joinGame(c, n); else alert('Sláðu inn kóða og nafn.');
    };
  }

  function renderFacilitator(st) {
    let controls = '';
    if (st.phase === 'lobby') controls = '<button class="lk-btn" id="lk-start"' + (st.teams.length ? '' : ' disabled') + '>Byrja leik (' + st.teams.length + ' lið)</button>';
    else if (st.phase === 'decide') controls = '<p>Umferð ' + st.round + ' — lið taka ákvarðanir.</p><button class="lk-btn" id="lk-resolve">Leysa umferð ' + st.round + '</button>';
    else if (st.phase === 'resolved') controls = '<p>Umferð ' + st.round + ' leyst.</p><button class="lk-btn" id="lk-next">' + (st.round >= 8 ? 'Ljúka leik' : 'Næsta umferð') + '</button>';
    else if (st.phase === 'ended') controls = '<p><b>🏁 Leik lokið.</b></p>';
    const teamList = st.teams.map((t) => '<div class="lk-lb-row"><span>' + esc(t.name) + '</span><span>' + num(t.cumulative || 0) + ' stig</span></div>').join('') || '<p>Bíð eftir liðum…</p>';
    root.innerHTML =
      '<div class="lk-card"><h1>Leikstjóri</h1><p>Kóði til að deila:</p><div style="font-size:38px;font-weight:800;letter-spacing:6px;color:#f6b13b">' + esc(st.code) + '</div></div>' +
      (st.event ? card('📋 Umferð ' + st.round + ': ' + st.event.title, '<p>' + esc(st.event.text) + '</p>') : '') +
      '<div class="lk-card"><h2>Lið</h2>' + teamList + '</div>' +
      '<div class="lk-card">' + controls + '</div>' +
      leaderboard(st) +
      (st.analytics ? card('📈 Greining (leikstjóri)', renderFacAnalytics(st.analytics)) : '');
    const b = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = fn; };
    b('#lk-start', () => control('start')); b('#lk-resolve', () => control('resolve')); b('#lk-next', () => control('next'));
  }

  function renderTeam(st) {
    if (st.phase === 'lobby') { root.innerHTML = card('Beðið eftir leikstjóra', '<p>Þú ert kominn/n inn. Leikstjórinn byrjar leikinn þegar öll lið eru tilbúin.</p>') + leaderboard(st); return; }
    if (st.phase === 'ended') { root.innerHTML = card('🏁 Leik lokið', '<p>Takk fyrir leikinn!</p>') + leaderboard(st); return; }
    if (st.phase === 'resolved') return renderTeamResults(st);

    // decide-fasi: atburður + 5 ákvarðanir
    const ev = st.event || { title: '', text: '', responses: [] };
    const decHtml = st.decisions.map((d) => {
      const opts = d.mode === 'response' ? (ev.responses || []) : d.options;
      const chips = opts.map((o) => '<span class="lk-opt' + (S.draft[d.id] === o.key ? ' sel' : '') + '" data-dec="' + d.id + '" data-opt="' + o.key + '">' + esc(o.label) + '</span>').join('');
      return '<div style="margin:10px 0"><b>' + esc(d.label) + '</b><br>' + (chips || '<span style="color:var(--muted)">—</span>') + '</div>';
    }).join('');
    const ready = st.decisions.every((d) => S.draft[d.id] != null);
    root.innerHTML =
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
    root.innerHTML = card('📊 Skorkort — umferð ' + st.round, scorecard)
      + (chainHtml ? card('🔗 Orsaka-keðja ákvarðana ykkar', chainHtml) : '')
      + leaderboard(st)
      + '<div class="lk-card"><p style="color:var(--muted)">Beðið eftir að leikstjóri opni næstu umferð…</p></div>';
  }

  function renderWatch(st) { root.innerHTML = card('👀 Áhorf — leikur ' + esc(st.code), '<p>Umferð ' + (st.round || 0) + ' · ' + esc(st.phase) + '</p>') + leaderboard(st); }

  // ── Ræsing ──
  if (S.code && S.token) startPoll();
  else if (S.code && S.role === 'watch') startPoll();
  else render();
}
