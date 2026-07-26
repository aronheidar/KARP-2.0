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
      leaderboard(st);
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
    root.innerHTML = card('📊 Skorkort — umferð ' + st.round, scorecard) + leaderboard(st) +
      '<div class="lk-card"><p style="color:var(--muted)">Beðið eftir að leikstjóri opni næstu umferð…</p></div>';
  }

  function renderWatch(st) { root.innerHTML = card('👀 Áhorf — leikur ' + esc(st.code), '<p>Umferð ' + (st.round || 0) + ' · ' + esc(st.phase) + '</p>') + leaderboard(st); }

  // ── Ræsing ──
  if (S.code && S.token) startPoll();
  else if (S.code && S.role === 'watch') startPoll();
  else render();
}
