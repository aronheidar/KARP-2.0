// RÁS-Leikurinn — client-app. Ástand/stig koma frá worker (þjóns-megin=ófölsuð).
// Studio-hamur: vélin keyrir client-megin AÐEINS til FORSKOÐUNAR á eigin drögum (blind commit haldið).
// Sýnir: lending, leikstjóri, lið (classic-kubbar / studio-stjórnstöð), niðurstöður.
import { simulate } from '../roads/engine.mjs';
import { buildInputs } from './resolve.mjs';
import { scoreRound } from './scoring.mjs';
import { studioCatalog, defaultDials, changedLevers } from './studio.mjs';
import { leverEffects, newsHeadlines, popularity, endTitle, govtStability, advisors } from './flavor.mjs';
import { explainRound } from './debrief.mjs';
import { detectConflicts } from './tradeoffs.mjs';
import { buildRecap } from './recap.mjs';
import { teachingPrompts } from './analytics.mjs';
import { YEAR_START, REALITY, YEAR2000_DIALS, TAB_META, LEVER_UNLOCK, CORE_LEVERS, SCENARIO } from './game-config.mjs';
import BASELINE from '../../../gogn/roads/baseline.json';
import LINKS from '../../../gogn/roads/links.json';
// ATH: þessi skrá býr í src/lib/leikur/ (EKKI web/src/lib/leikur/) — auth.js er undir web/src/lib/, því 3 stig upp.
import { loadUser, loginHref } from '../../../web/src/lib/auth.js';
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
// Raun-gildi sleða (flutt úr hermir): 'mult' = realBase×(1+frávik%/100)+realUnit; annars realBase+frávik+unit; enginn realBase → frávikið sjálft. Vélin notar áfram frávikið.
const decOf = (cfg) => (cfg && (cfg.step < 1 || (cfg.realBase != null && cfg.realBase % 1 !== 0))) ? 2 : 0;
function disp(cfg, v, d) {
  if (cfg && cfg.realBase != null && cfg.realMode === 'mult') return num(cfg.realBase * (1 + v / 100), d != null ? d : (cfg.realDec != null ? cfg.realDec : 0)) + (cfg.realUnit || cfg.unit || '');
  return num((cfg && cfg.realBase != null ? cfg.realBase + v : v), d != null ? d : decOf(cfg)) + (cfg ? (cfg.unit || '') : '');
}

// Teiknar orsaka-keðju (SVG) úr {nodes:[{key,label,kind,depth}], edges:[{from,to,sign,strength}], clipped}.
function renderChain(chain) {
  if (!chain || !Array.isArray(chain.edges) || !chain.edges.length) return '<p class="lk-muted">Engin virk áhrif á markmiðin þessa umferð.</p>';
  const nodes = chain.nodes, edges = chain.edges;
  const maxD = Math.max(1, ...nodes.map((n) => n.depth));
  const cols = {}; for (const n of nodes) (cols[n.depth] ||= []).push(n);
  const NW = 146, NH = 30, COLW = 212, VG = 26, M = 14;
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
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x - 8, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;   // enda 8px FYRIR hnút → örvaroddur sýnilegur í bilinu (ekki falinn undir kassa)
    const col = ed.sign > 0 ? '#54d08a' : '#e78284', w = +(1.7 + Math.min(3.3, ed.strength * 2.3)).toFixed(1);
    const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    // dökkur hjúpur undir → leggur stendur út frá bakgrunni + öðrum leggjum; svo feit lituð lína m/stórum oddi
    e += `<path d="${d}" fill="none" stroke="rgba(6,9,14,.7)" stroke-width="${(w + 2.4).toFixed(1)}" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="0.96" marker-end="url(#lk-ah-${ed.sign > 0 ? 'p' : 'n'})"/>`;
  }
  let nd = '';
  for (const n of nodes) {
    const p = pos[n.key]; if (!p) continue;
    let la = n.label; if (la.length > 20) la = la.slice(0, 19) + '…';
    nd += `<g><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="7" fill="${COL[n.kind] || '#9fb0c8'}" opacity="0.92"/><text x="${p.x + 9}" y="${p.y + NH / 2 + 4}" font-size="12" fill="#12161f" font-weight="600">${esc(la)}</text></g>`;
  }
  const defs = '<defs><marker id="lk-ah-p" markerUnits="userSpaceOnUse" markerWidth="15" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L11,6 L0,12 Z" fill="#54d08a"/></marker><marker id="lk-ah-n" markerUnits="userSpaceOnUse" markerWidth="15" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L11,6 L0,12 Z" fill="#e78284"/></marker></defs>';
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
  let sc = '<table class="lk-tbl"><tr><th>Lið</th>' + (hasRole ? '<th>Hlutverk</th>' : '') + kpiCols.map((l) => '<th>' + esc(l) + '</th>').join('') + '<th>Uppsafnað</th><th title="Meðal-fylgi ríkisstjórnar yfir kjörtímabilin">🗳️ Fylgi</th></tr>';
  an.scorecard.forEach((row) => {
    sc += '<tr><td><span class="lk-swatch" style="background:' + colorOf(row.teamId) + '"></span>' + esc(row.name) + '</td>'
      + (hasRole ? '<td style="font-size:12px">' + esc(row.role || '–') + '</td>' : '')
      + row.perKpi.map((p) => '<td style="color:' + scoreCol(p.score) + ';font-weight:600">' + (p.score == null ? '–' : p.score) + '</td>').join('')
      + '<td><b>' + num(row.cumulative) + '</b></td><td style="color:' + (row.avgApproval == null ? 'var(--faint)' : row.avgApproval >= 50 ? '#54d08a' : row.avgApproval >= 35 ? '#e8c14a' : '#e78284') + '">' + (row.avgApproval != null ? row.avgApproval + '%' : '–') + '</td></tr>';
  });
  sc += '</table>';
  // Studio-hamur: raðir hafa {studio,summary} (sleða-yfirlit), EKKI choices — sér-tafla (annars kastaði row.choices.map).
  let dt;
  if (an.decisionsTable[0] && an.decisionsTable[0].studio) {
    dt = '<table class="lk-tbl"><tr><th>Lið</th><th>Stillingar (breytt frá grunni)</th></tr>'
      + an.decisionsTable.map((row) => '<tr><td>' + esc(row.name) + '</td><td style="font-size:12px">' + esc(row.summary || '—') + '</td></tr>').join('') + '</table>';
  } else {
    const decHeads = an.decisionsTable[0] ? an.decisionsTable[0].choices.map((c) => c.decLabel) : [];
    dt = '<table class="lk-tbl"><tr><th>Lið</th>' + decHeads.map((l) => '<th>' + esc(l) + '</th>').join('') + '</tr>';
    an.decisionsTable.forEach((row) => { dt += '<tr><td>' + esc(row.name) + '</td>' + (row.choices || []).map((c) => '<td>' + esc(c.optLabel) + '</td>').join('') + '</tr>'; });
    dt += '</table>';
  }
  let charts = '<div class="lk-charts">' + lkLineChart('Uppsafnað stig', an.trajectories.cumulative, { colorOf });
  for (const k of Object.keys(an.trajectories.byKpi)) { const b = an.trajectories.byKpi[k]; charts += lkLineChart(b.label + ' (stig)', b.series, { min: 0, max: 100, colorOf }); }
  charts += '</div>';
  // #6 Kennslu-vísbendingar: sjálfvirkar umræðu-spurningar úr mynstrum (birt efst — leiðbeinandi f. leikstjóra).
  const prompts = teachingPrompts(an, { scenarioEvents: SCENARIO.events.map((e) => ({ round: e.round, icon: e.icon, title: e.title })) });
  const promptsHtml = prompts.length ? '<h3 style="font-size:14px;margin:4px 0">💡 Kennslu-vísbendingar (umræðu-spurningar)</h3><ul class="lk-prompts">' + prompts.map((p) => '<li>' + p + '</li>').join('') + '</ul>' : '';
  // Stórar stefnu-ákvarðanir hvers liðs (leikstjóra-samantekt).
  const polHtml = (an.policiesByTeam && an.policiesByTeam.length)
    ? '<h3 style="font-size:14px;margin:12px 0 4px">🏛️ Stórar ákvarðanir liða</h3><table class="lk-tbl"><tr><th>Lið</th><th>Ákvarðanir</th></tr>' + an.policiesByTeam.map((t) => '<tr><td>' + esc(t.name) + '</td><td style="font-size:12.5px">' + t.policies.map((p) => p.icon + ' ' + esc(p.label) + ': <b>' + esc(p.choice) + '</b>').join(' · ') + '</td></tr>').join('') + '</table>'
    : '';
  // Fasi „skemmtun 3": klemmu-viðbrögð liða við óvæntum atvikum (leikstjóra-samantekt).
  const dilHtml = (an.dilemmasByTeam && an.dilemmasByTeam.length)
    ? '<h3 style="font-size:14px;margin:12px 0 4px">🎲 Óvænt atvik — viðbrögð liða</h3><table class="lk-tbl"><tr><th>Lið</th><th>Klemmu-val</th></tr>' + an.dilemmasByTeam.map((t) => '<tr><td>' + esc(t.name) + '</td><td style="font-size:12.5px">' + t.items.map((it) => (it.icon || '🎲') + ' ' + esc(it.title) + ': <b>' + esc(it.choice || '— ekkert valið') + '</b>').join(' · ') + '</td></tr>').join('') + '</table>'
    : '';
  return promptsHtml
    + '<h3 style="font-size:14px;margin:12px 0 4px">Staða liða</h3>' + sc
    + '<h3 style="font-size:14px;margin:12px 0 4px">Ákvarðanir umferðar</h3>' + dt
    + polHtml
    + dilHtml
    + '<h3 style="font-size:14px;margin:12px 0 4px">Þróun yfir umferðir</h3>' + charts;
}

export function mountLeikur(root) {
  const S = { code: null, role: null, token: null, teamId: null, state: null, draft: {}, poll: null, busy: false, view: null, editDraft: null, editRoles: false, editStudio: true, studioTab: 0, dials: null, unlocked: false, stTimer: null, stRound: null, dragging: null, localTouched: new Set(), studioBuiltSig: null, pushTimer: null, timerDeadline: null, timerInt: null, user: null };
  let model = {}; try { model = JSON.parse(document.getElementById('leikur-model')?.textContent || '{}'); } catch (e) {}

  // Endurheimt úr URL + localStorage (endurtenging)
  const u = new URL(location.href);
  const code = (u.searchParams.get('g') || '').toUpperCase();
  const invToken = u.searchParams.get('t');
  if (code) {
    if (invToken) {
      // Boðs-hlekkur → ganga í BEFANDI lið (deilt lið-tákn); teamId úr tid eða síðar úr /state.you.
      const tid = u.searchParams.get('tid');
      localStorage.setItem(lsTeam(code), JSON.stringify({ token: invToken, teamId: tid ? +tid : null }));
      S.code = code; S.role = 'team'; S.token = invToken; S.teamId = tid ? +tid : null;
      history.replaceState(null, '', '/leikur/?g=' + code);
    } else {
      const fac = localStorage.getItem(lsFac(code));
      const team = localStorage.getItem(lsTeam(code));
      if (fac) { S.code = code; S.role = 'fac'; S.token = fac; }
      else if (team) { try { const t = JSON.parse(team); S.code = code; S.role = 'team'; S.token = t.token; S.teamId = t.teamId; } catch (e) {} }
      else { S.code = code; S.role = 'watch'; }
    }
  }

  // Boðs-hlekkur: afrita hlekk sem félagar opna til að ganga í SAMA lið (deilt lið-tákn). Event-delegation → lifir af endur-teikningar.
  root.addEventListener('click', (e) => {
    const inv = e.target && e.target.closest && e.target.closest('#lk-invite'); if (!inv || !S.code || !S.token) return;
    const link = location.origin + '/leikur/?g=' + S.code + '&t=' + encodeURIComponent(S.token) + (S.teamId != null ? '&tid=' + S.teamId : '');
    try { navigator.clipboard.writeText(link); inv.textContent = '✅ Hlekkur afritaður!'; setTimeout(() => { inv.textContent = '🔗 Bjóða í lið'; }, 2000); } catch (err) { inv.textContent = link; }
  });
  function startPoll() { stopPoll(); refresh(); S.poll = setInterval(refresh, 2500); S.timerInt = setInterval(tickTimer, 1000); }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } if (S.timerInt) { clearInterval(S.timerInt); S.timerInt = null; } }
  // #3 Umferðar-klukka (bara sjónræn): tikkar staðbundið úr S.timerDeadline; við 0 → „útrunninn" (engin auto-læsing).
  const fmtTimer = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  function timerBadge(st) { return st.secondsLeft == null ? '' : '<span class="lk-timer" id="lk-timer">⏱️ ' + fmtTimer(Math.max(0, st.secondsLeft)) + '</span>'; }
  function tickTimer() {
    const el = root.querySelector('#lk-timer'); if (!el) return;
    if (S.timerDeadline == null) { el.style.display = 'none'; return; }
    const rem = Math.max(0, Math.round((S.timerDeadline - Date.now()) / 1000));
    if (rem <= 0) { el.textContent = '⏰ Tími útrunninn'; el.classList.add('out'); }
    else { el.textContent = '⏱️ ' + fmtTimer(rem); el.classList.toggle('out', false); el.classList.toggle('low', rem <= 30); }
  }

  async function refresh() {
    if (!S.code) return;
    const { status, json } = await api('/' + S.code + '/state', { token: S.token });
    if (status === 404) { stopPoll(); root.innerHTML = card('Leikur fannst ekki', '<a class="lk-btn" href="/leikur/">Til baka</a>'); return; }
    S.state = json;
    S.timerDeadline = (json.secondsLeft != null && json.phase === 'decide') ? Date.now() + json.secondsLeft * 1000 : null;
    if (S.role === 'team' && S.teamId == null && json.you && json.you.teamId != null) {
      S.teamId = json.you.teamId;
      try { localStorage.setItem(lsTeam(S.code), JSON.stringify({ token: S.token, teamId: S.teamId })); } catch (e) {}
    }
    render();
  }

  async function act(fn) { if (S.busy) return; S.busy = true; try { await fn(); } finally { S.busy = false; } await refresh(); }

  // ── Aðgerðir ──
  async function createGame() {
    const roles = !!(root.querySelector('#lk-roles') && root.querySelector('#lk-roles').checked);
    const studio = !!(root.querySelector('#lk-studio') && root.querySelector('#lk-studio').checked);
    const timerMin = +((root.querySelector('#lk-timer-min') || {}).value || 0);
    const body = {}; if (roles) body.roles = true; if (studio) body.mode = 'studio'; if (timerMin > 0) body.timerSec = Math.round(timerMin * 60);
    const diff = (root.querySelector('#lk-difficulty') || {}).value; if (diff === 'easy' || diff === 'hard') body.difficulty = diff; // Fasi E
    if (root.querySelector('#lk-surprise') && root.querySelector('#lk-surprise').checked) body.surprise = true; // Fasi „skemmtun 3"
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
    const CORE = ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur'];
    const rows = st.mandate.kpis.map((k) => {
      const themed = !CORE.includes(k.key);
      const aim = k.dir === 'target' ? 'markmið ' + num(k.target) : k.dir === 'max' ? '≤ ' + num(k.max) : '≥ ' + num(k.min);
      return '<div class="lk-lb-row"><span>' + (k.icon ? k.icon + ' ' : '') + esc(k.label)
        + (themed ? ' <span class="lk-kpi-w" style="background:#2f4a33;color:#8fe0a0">þema</span>' : '')
        + (k.weight && k.weight !== 1 ? ' <span class="lk-kpi-w">×' + k.weight + '</span>' : '') + '</span><span>' + aim + '</span></div>';
    }).join('');
    const intro = (st.event && st.event.focus) ? '<p style="font-size:13px;line-height:1.5">' + esc(st.event.focus) + '</p>' : '';
    return '<div class="lk-card"><h2>🎯 Umboð — kjörtímabil ' + st.round + '</h2>' + intro + rows + '</div>';
  }
  // Fasi E — Stefnu-rofar: stórar tvíkosta-ákvarðanir í boði þetta kjörtímabil (rofar á/af + varanleg val).
  function policiesCard(st) {
    const P = st.policies; if (!P || !P.available || !P.available.length) return '';
    const popTag = (v) => (v == null || v === 0) ? '' : ' <span style="color:#b98cff;font-size:11px;white-space:nowrap">🗳️ fylgi ' + (v > 0 ? '+' : '') + v + '</span>';
    const body = P.available.map((p) => {
      const draft = S.policyDraft ? S.policyDraft[p.id] : undefined;
      if (p.kind === 'toggle') {
        const on = draft != null ? draft : (P.states[p.id] === true);
        return '<div style="margin:10px 0"><label style="cursor:pointer;font-size:13.5px;display:flex;align-items:flex-start;gap:7px"><input type="checkbox" data-pol="' + p.id + '"' + (on ? ' checked' : '') + ' style="margin-top:2px"/><span><b>' + p.icon + ' ' + esc(p.onLabel || p.label) + '</b>' + (p.pop ? popTag(p.pop.on) : '') + '</span></label><p style="font-size:12px;color:var(--muted);margin:3px 0 0 24px">' + esc(p.desc) + '</p></div>';
      }
      const cur = draft != null ? draft : (P.states[p.id] || null);
      const opts = (p.options || []).map((o) => '<span class="lk-opt' + (cur === o.key ? ' sel' : '') + '" data-polc="' + p.id + '" data-polk="' + o.key + '" role="button" tabindex="0">' + esc(o.label) + (p.pop ? popTag(p.pop[o.key]) : '') + '</span>').join(' ');
      return '<div style="margin:10px 0"><b>' + p.icon + ' ' + esc(p.label) + '</b><p style="font-size:12px;color:var(--muted);margin:3px 0 6px">' + esc(p.desc) + '</p><div>' + opts + '</div></div>';
    }).join('');
    return '<div class="lk-card" style="border-left:3px solid #e8c14a"><h2>🏛️ Stórar ákvarðanir</h2><p class="lk-muted" style="font-size:12px;margin:0 0 4px">Umdeildar tvíkosta-ákvarðanir úr hagsögunni — sögulega réttilega tímasettar.</p>' + body + '</div>';
  }
  // Arfleifð: hvernig standandi stórar ákvarðanir + óvænt atvik síðustu lotu lita ÞESSA lotu (byrjun lotu).
  function carryoverCard(st) {
    const c = st.carryover; if (!c) return '';
    const rows = [];
    if (c.event && c.event.text) rows.push('<div style="margin:3px 0">' + (c.event.icon || '🎲') + ' <b>' + esc(c.event.title) + '</b>' + (c.event.choice ? ' <span class="lk-muted">(þið völduð: ' + esc(c.event.choice) + ')</span>' : '') + ' — ' + esc(c.event.text) + '</div>');
    for (const p of (c.policies || [])) rows.push('<div style="margin:3px 0">' + (p.icon || '🏛️') + ' <b>' + esc(p.label) + '</b> — ' + esc(p.text) + '</div>');
    if (!rows.length) return '';
    return '<div style="background:#20242e;border:1px solid #3a4152;border-left:4px solid #8ca0c8;border-radius:10px;padding:11px 14px;margin:10px 0">' +
      '<div style="font-size:13.5px;font-weight:700;margin-bottom:5px">📋 Arfleifð síðasta kjörtímabils — hvað mótar þessa lotu</div>' +
      '<div style="font-size:12.8px;line-height:1.55">' + rows.join('') + '</div></div>';
  }
  // Fasi „skemmtun 3": óvænt atvik + klemmu-spjald. Fréttaborði efst; ef klemma → viðbragðs-val (part af ákvörðun).
  function surpriseCard(st) {
    const s = st.surprise; if (!s) return '';
    const dil = s.dilemma;
    const opts = dil ? (dil.options || []).map((o) => '<span class="lk-opt' + (S.dilemmaDraft === o.key ? ' sel' : '') + '" data-dil="' + o.key + '" role="button" tabindex="0">' + esc(o.label) + '</span>').join(' ') : '';
    return '<div style="background:linear-gradient(90deg,#3a1f1f,#2a2320);border:1px solid #e78284;border-left:4px solid #e78284;border-radius:10px;padding:12px 14px;margin:10px 0">' +
      '<div style="font-size:15px;font-weight:700;color:#f5b0b0">📰 ' + (s.icon || '🎲') + ' Óvænt atvik: ' + esc(s.title) + '</div>' +
      '<p style="margin:6px 0 0;font-size:13.5px;line-height:1.55">' + esc(s.text) + '</p>' +
      (dil ? '<div style="margin-top:10px"><span style="font-weight:600;font-size:13px">' + esc(dil.q) + '</span><div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">' + opts + '</div>' +
        (S.dilemmaDraft == null ? '<p class="lk-muted" style="font-size:11.5px;margin:6px 0 0">Veljið viðbragð — það hefur áhrif á hagkerfið og fylgi ríkisstjórnarinnar.</p>' : '') + '</div>' : '') +
      '</div>';
  }
  // S5 — hlutverk (roles): borði fyrir eigið hlutverk, roleMap-tafla (fac), afhjúpun í leikslok.
  function roleBanner(st) { return st.role ? '<div class="lk-role-banner">🎭 Þitt umboð: <b>' + esc(st.role.label) + '</b> — ' + esc(st.role.blurb) + '</div>' : ''; }
  // Fastur liðs-borði — þátttakandi sér alltaf í hvaða liði hann er.
  function teamBanner(st) {
    if (!st.you || st.you.role !== 'team') return '';
    const me = (st.teams || []).find((t) => t.id === st.you.teamId);
    return '<div class="lk-team-banner"><span>🏛️ Þitt lið: <b>' + esc(me ? me.name : ('Lið ' + st.you.teamId)) + '</b></span> <button id="lk-invite" class="lk-invite-btn" title="Afrita hlekk sem félagar opna til að ganga í SAMA lið">🔗 Bjóða í lið</button></div>';
  }
  function roleMapCard(st) { if (!st.roleMap || !st.roleMap.length) return ''; const nm = Object.fromEntries((st.teams || []).map((t) => [t.id, t.name])); return '<div class="lk-card"><h2>🎭 Hlutverk liða (leynileg)</h2>' + st.roleMap.map((r) => '<div class="lk-lb-row"><span>' + esc(nm[r.teamId] || ('Lið ' + r.teamId)) + '</span><span>' + esc(r.label) + '</span></div>').join('') + '</div>'; }
  function revealCard(st) { if (!st.rolesReveal || !st.rolesReveal.length) return ''; const nm = Object.fromEntries((st.teams || []).map((t) => [t.id, t.name])); return '<div class="lk-card"><h2>🎭 Umboð afhjúpuð</h2>' + st.rolesReveal.map((r) => '<div class="lk-lb-row"><span>' + esc(nm[r.teamId] || ('Lið ' + r.teamId)) + '</span><span><b>' + esc(r.label) + '</b></span></div><div style="font-size:12px;color:var(--muted);margin:-2px 0 6px">' + esc(r.blurb) + '</div>').join('') + '</div>'; }

  function render() {
    if (!S.code) { if (S.view === 'editor') return renderEditor(); return renderLanding(); }
    const st = S.state; if (!st) { root.innerHTML = '<p>Hleð…</p>'; return; }
    if (S.role === 'fac') return renderFacilitator(st);
    if (S.role === 'team') return renderTeam(st);
    return renderWatch(st);
  }

  // Aðgangsstýrt eftir notanda-tegund (SERVER er raun-gáttin á /create og /join — þetta er bara UX
  // svo fólk sjái ekki takka sem 403-a). S.user er sótt EINU SINNI í ræsingu (sjá „Ræsing" neðst).
  function renderLanding() {
    const u = S.user;
    const intro = '<div class="lk-card"><h1>🎮 RÁS-Leikurinn</h1><p>Turn-based þjóðhagfræði-hermir. Keppandi „ríkisstjórnar"-lið stýra hvert sínu Íslandi gegnum 8 umferðir.</p></div>';
    const createCard = '<div class="lk-card"><h2>Leikstjóri</h2><button class="lk-btn" id="lk-create">Búa til nýjan leik</button> <button class="lk-btn" id="lk-createcustom" style="background:#5ac8e0">Sérsníða leik…</button><label style="display:block;margin-top:10px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="lk-studio" checked style="vertical-align:middle;margin-right:6px"/>🎛️ Stjórnstöð — þátttakendur fá sleða + lifandi gröf (annars einföld val)</label><label style="display:block;margin-top:6px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="lk-roles" style="vertical-align:middle;margin-right:6px"/>🎭 Leynileg hlutverk — hvert lið fær ólíkt, hulið umboð (afhjúpað í leikslok)</label><label style="display:block;margin-top:6px;font-size:13.5px">⏱️ Umferðar-klukka: <input type="number" id="lk-timer-min" min="0" max="60" step="1" placeholder="0" style="width:56px;padding:4px 6px;margin:0 4px"/> mín <span class="lk-muted">(0 = engin — bara sjónræn ýting, læsir engu)</span></label><label style="display:block;margin-top:8px;font-size:13.5px">🎚️ Erfiðleikastig: <select id="lk-difficulty" style="padding:4px 6px;margin-left:4px"><option value="easy">Létt</option><option value="medium" selected>Miðlungs</option><option value="hard">Erfitt</option></select> <span class="lk-muted">(skalar markmið, áföll og refsingar)</span></label><label style="display:block;margin-top:8px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="lk-surprise" style="vertical-align:middle;margin-right:6px"/>🎲 Óvænt atvik — eldgos, verkföll, hneyksli o.fl. dúkka upp með klemmu-vali <span class="lk-muted">(sama fyrir öll lið)</span></label></div>';
    const joinCard = '<div class="lk-card"><h2>Lið — ganga inn</h2><input id="lk-code" placeholder="KÓÐI" maxlength="6" style="text-transform:uppercase;padding:8px;margin-right:6px" /> <input id="lk-name" placeholder="Nafn liðs" maxlength="40" style="padding:8px;margin-right:6px" /> <button class="lk-btn" id="lk-join">Ganga inn</button></div>';
    const noticeCard = '<div class="lk-card"><p>🎮 Leikurinn er fyrir nemendur og kennara. Skráðu þig inn — kennarinn (leikstjóri) gefur þér leikkóða.</p><a class="lk-btn" href="' + esc(loginHref()) + '">Skrá inn</a></div>';
    if (u && u.isAdmin) root.innerHTML = intro + createCard + joinCard;
    else if (u && u.nemandi) root.innerHTML = intro + joinCard;
    else root.innerHTML = intro + noticeCard;
    const create = root.querySelector('#lk-create'); if (create) create.onclick = () => createGame();
    const createCustom = root.querySelector('#lk-createcustom'); if (createCustom) createCustom.onclick = () => { S.view = 'editor'; render(); };
    const join = root.querySelector('#lk-join');
    if (join) join.onclick = () => {
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
      controls = '<p>Kjörtímabil ' + st.round + ' — lið taka ákvarðanir. <b>' + ready + '/' + rl.length + ' tilbúin</b></p>' + (rosterList ? '<div style="margin:6px 0;font-size:13px">' + rosterList + '</div>' : '') + '<button class="lk-btn" id="lk-resolve">Leysa kjörtímabil ' + st.round + '</button>' + stopBtn;
    } else if (st.phase === 'resolved') controls = '<p><b>✅ Kjörtímabil ' + st.round + ' leyst.</b> Skoðið niðurstöður liðanna hér að neðan, ýtið svo á:</p><button class="lk-btn" id="lk-next" style="font-size:17px;padding:12px 22px;background:#54d08a;color:#0e1116;font-weight:700">' + (st.round >= 8 ? '🏁 Ljúka leik' : '▶ Næsta kjörtímabil') + '</button>' + stopBtn;
    else if (st.phase === 'ended') controls = '<p><b>🏁 Leik lokið.</b></p><button class="lk-btn" id="lk-newgame">🔄 Nýr leikur</button>';
    const teamList = st.teams.map((t) => '<div class="lk-lb-row"><span>' + esc(t.name) + '</span><span>' + num(t.cumulative || 0) + ' stig</span></div>').join('') || '<p>Bíð eftir liðum…</p>';
    root.innerHTML =
      '<div class="lk-card"><h1>Leikstjóri</h1><p>Kóði til að deila:</p><div style="font-size:38px;font-weight:800;letter-spacing:6px;color:#f6b13b">' + esc(st.code) + '</div><button class="lk-btn" id="lk-watchlink" style="margin-top:10px;background:#5ac8e0">📺 Afrita áhorfenda-hlekk (skjávarpi)</button></div>' +
      (st.event ? card('📋 Umferð ' + st.round + ': ' + st.event.title, '<p>' + esc(st.event.text) + '</p>') : '') +
      '<div class="lk-card"><h2>Lið</h2>' + teamList + '</div>' +
      roleMapCard(st) +
      '<div class="lk-card">' + controls + '</div>' +
      leaderboard(st) +
      (st.analytics ? card('📈 Greining (leikstjóri)', (() => { try { return renderFacAnalytics(st.analytics); } catch (err) { console.error('renderFacAnalytics villa', err); return '<p class="lk-muted">Greining tókst ekki að teikna (stýringar að ofan virka eðlilega).</p>'; } })()) : '');
    const b = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = fn; };
    b('#lk-start', () => control('start')); b('#lk-resolve', () => control('resolve')); b('#lk-next', () => control('next'));
    b('#lk-stop', () => control('stop')); b('#lk-newgame', () => { location.href = '/leikur/'; });
    b('#lk-watchlink', () => { const el = root.querySelector('#lk-watchlink'); try { navigator.clipboard.writeText(location.origin + '/leikur/?g=' + S.code); if (el) el.textContent = '✅ Áhorfenda-hlekk afritaður'; } catch (e) { if (el) el.textContent = location.origin + '/leikur/?g=' + S.code; } });
  }

  // #5 Leikslok-samantekt: dregur lærdóm úr öllum kjörtímabilunum (eigin trajectory + raun + sleða-saga).
  function teamRecap(st) {
    const mineTraj = (st.trajectory || []).find((t) => t.teamId === S.teamId);
    const pts = mineTraj ? mineTraj.points.slice().sort((a, b) => a.round - b.round) : [];
    if (!pts.length) return '';
    const perRoundScores = pts.map((p, i) => ({ round: p.round, score: Math.round((p.value - (i ? pts[i - 1].value : 0)) * 10) / 10 }));
    const realityPerTerm = perRoundScores.map((p) => {
      const idx = Math.min((REALITY.verdbolga || []).length - 1, p.round * 4 - 1);
      // Þolið gagnvart per-lotu markmiðum: skora raunveruleikann yfir AÐEINS þau KPI sem hafa REALITY-gögn (kjarninn).
      const subKpis = st.mandate.kpis.filter((kpi) => REALITY[kpi.key]); const realK = {};
      for (const kpi of subKpis) realK[kpi.key] = REALITY[kpi.key][idx];
      return subKpis.length ? { round: p.round, score: Math.round(scoreRound(realK, { ...st.mandate, kpis: subKpis }).composite * 10) / 10 } : { round: p.round, score: null };
    });
    const leversFull = [];
    (st.history || []).forEach((h, i) => { if (h && h.levers) leversFull.push({ round: i + 1, levers: h.levers }); });
    if (st.mode === 'studio' && st.draft && Object.keys(st.draft).length) leversFull.push({ round: (st.history || []).length + 1, levers: st.draft });
    const events = ((st.scenarioSoFar && st.scenarioSoFar.length ? st.scenarioSoFar : SCENARIO.events) || []).map((e) => ({ round: e.round, icon: e.icon, title: e.title }));
    const rc = buildRecap({ perRoundScores, realityPerTerm, leversFull, mandate: st.mandate, events, baseline: BASELINE, disp, finalPerKpi: st.finalPerKpi || [], avgApproval: st.avgApproval != null ? st.avgApproval : null });
    const polSum = (st.policySummary && st.policySummary.length)
      ? '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px"><b>🏛️ Stóru ákvarðanirnar ykkar á leiðinni:</b><ul style="margin:5px 0 0;padding-left:20px;line-height:1.6;font-size:13.5px">' + st.policySummary.map((p) => '<li>' + p.icon + ' ' + esc(p.label) + ': <b>' + esc(p.choice) + '</b></li>').join('') + '</ul></div>'
      : '';
    if (!rc.lines.length && !polSum) return '';
    return '<div class="lk-card lk-recap"><h2>📜 Yfirlit kjörtímabilanna 2000–2032</h2>' + rc.lines.map((l) => '<p class="lk-recap-line">' + l + '</p>').join('') + polSum + '</div>';
  }

  function renderTeam(st) {
    if (st.phase === 'lobby') { root.innerHTML = teamBanner(st) + card('Beðið eftir leikstjóra', '<p>Þú ert kominn/n inn. Leikstjórinn byrjar leikinn þegar öll lið eru tilbúin.</p>') + leaderboard(st); return; }
    if (st.phase === 'ended') {
      const me = (st.teams || []).find((t) => t.id === S.teamId);
      const rounds = st.round || 8, cum = me ? (me.cumulative || 0) : 0, avg = rounds ? cum / rounds : 0, et = endTitle(avg);
      const rank = me ? ([...st.teams].sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0)).findIndex((t) => t.id === S.teamId) + 1) : 0;
      const medals = st.medals || [];
      const shareText = '📰 RÁS-TÍÐINDI 2032 — Ísland 2000–2032\n' + et.title + '\nUppsafnað: ' + num(cum) + ' stig (meðal ' + num(avg) + '/100)' + (rank ? '\nSæti: ' + rank + '/' + st.teams.length : '') + (medals.length ? '\nTitlar: ' + medals.map((m) => m.icon + ' ' + m.title).join(', ') : '') + '\nkarp.is/leikur/';
      const medalHtml = medals.length
        ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">' + medals.map((m) => '<span title="' + esc(m.desc) + '" style="display:inline-flex;align-items:center;gap:5px;background:rgba(246,177,59,.13);border:1px solid #f6b13b55;border-radius:20px;padding:4px 11px;font-size:12.5px"><span style="font-size:15px">' + m.icon + '</span> <b>' + esc(m.title) + '</b></span>').join('') + '</div>'
        : '<p class="lk-muted" style="font-size:12px;margin:6px 0 0">Engir sérstakir verðlaunatitlar að þessu sinni — reyndu aftur og náðu markmiðunum!</p>';
      const frontPage = '<div class="lk-card" style="padding:0;overflow:hidden;border:1px solid var(--line)">'
        + '<div style="border-bottom:3px double var(--line);padding:10px 16px;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px"><b style="font-size:21px;letter-spacing:1.5px">📰 RÁS-TÍÐINDI</b><span class="lk-muted" style="font-size:12px">Reykjavík · 2032 · lokafrétt</span></div>'
        + '<div style="padding:16px">'
        + '<div class="lk-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:1px">Arfleifð ríkisstjórnarinnar 2000–2032</div>'
        + '<div class="lk-title-big" style="margin:4px 0 6px">' + esc(et.title) + '</div>'
        + '<p style="margin:0 0 8px;font-size:14px;line-height:1.5">' + esc(et.blurb) + '</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:8px 0;margin:8px 0"><span>📊 <b>' + num(cum) + '</b> stig</span><span>📈 meðal <b>' + num(avg) + '</b>/100</span>' + (rank ? '<span>🏅 sæti <b>' + rank + '/' + st.teams.length + '</b></span>' : '') + (st.avgApproval != null ? '<span>🗳️ fylgi <b>' + st.avgApproval + '%</b></span>' : '') + '</div>'
        + '<b style="font-size:13px">🏅 Verðlaunatitlar ríkisstjórnarinnar:</b>' + medalHtml
        + '<button class="lk-btn" id="lk-share" style="margin-top:12px">📋 Afrita forsíðuna</button>'
        + '</div></div>';
      root.innerHTML = frontPage + teamBanner(st) + teamRecap(st) + revealCard(st) + leaderboard(st);
      const sb = root.querySelector('#lk-share'); if (sb) sb.onclick = () => { try { navigator.clipboard.writeText(shareText); sb.textContent = '✅ Afritað!'; } catch (e) { sb.textContent = shareText; } };
      return;
    }
    if (st.phase === 'resolved') return renderTeamResults(st);
    // Ný umferð → núlla „breyta"-stöðu + studio-byggingu (carry-forward úr history)
    if (S.stRound !== st.round) { S.unlocked = false; S.stRound = st.round; S.dials = null; S.studioBuiltSig = null; S.localTouched = new Set(); }
    // Læst-staða (A): eftir læsingu sýna staðfestingu + „Breyta" (aflæsa fram að resolve)
    if (st.you && st.you.locked && !S.unlocked) return renderLocked(st);
    // Studio: byggja stjórnstöðina EINU SINNI per umferð; poll uppfærir Á STAÐNUM (án þess að clobber-a sleða).
    if (st.mode === 'studio') {
      const sig = 'studio|' + st.round;
      if (S.studioBuiltSig === sig && root.querySelector('#lk-st-sliders')) return updateStudio(st);
      S.studioBuiltSig = sig; S.localTouched = new Set();
      return renderStudio(st);
    }

    // decide-fasi (classic): atburður + 5 ákvarðanir
    const ev = st.event || { title: '', text: '', responses: [] };
    const decHtml = st.decisions.map((d) => {
      const opts = d.mode === 'response' ? (ev.responses || []) : d.options;
      const chips = opts.map((o) => '<span class="lk-opt' + (S.draft[d.id] === o.key ? ' sel' : '') + '" data-dec="' + d.id + '" data-opt="' + o.key + '">' + esc(o.label) + '</span>').join('');
      return '<div style="margin:10px 0"><b>' + esc(d.label) + '</b><br>' + (chips || '<span style="color:var(--muted)">—</span>') + '</div>';
    }).join('');
    const ready = st.decisions.every((d) => S.draft[d.id] != null);
    root.innerHTML =
      teamBanner(st) + roleBanner(st) +
      card('📋 Umferð ' + st.round + ': ' + ev.title, '<p>' + esc(ev.text) + '</p>' + (st.secondsLeft != null ? '<div style="margin-top:6px">' + timerBadge(st) + '</div>' : '')) +
      '<div class="lk-card"><h2>Ákvarðanir liðsins</h2>' + decHtml +
      '<button class="lk-btn" id="lk-lock"' + (ready ? '' : ' disabled') + ' style="margin-top:10px">Læsa ákvörðunum</button>' +
      (ready ? '' : '<p style="color:var(--muted);font-size:13px">Veldu í öllum flokkum til að læsa.</p>') + '</div>' +
      mandateCard(st) + leaderboard(st);
    root.querySelectorAll('.lk-opt').forEach((el) => { el.onclick = () => { S.draft[el.dataset.dec] = el.dataset.opt; render(); }; });
    const lock = root.querySelector('#lk-lock'); if (lock) lock.onclick = () => submitDecisions();
  }

  function renderTeamResults(st) {
    const mine = (st.results || []).find((r) => r.teamId === S.teamId);
    // Áberandi melding EF ríkisstjórnin féll (revolt) þetta kjörtímabil — efst svo hún fari ekki framhjá neinum.
    const myStab = mine && mine.detail && mine.detail.stability;
    const fellBanner = (myStab && myStab.level === 'revolt')
      ? '<div style="background:linear-gradient(90deg,#5a1a1a,#3a1520);border:2px solid #e78284;border-radius:12px;padding:14px 16px;margin:10px 0;text-align:center">' +
        '<div style="font-size:19px;font-weight:800;color:#ff9d9d;letter-spacing:.5px">🚨 RÍKISSTJÓRNIN ÞÍN FÉLL</div>' +
        '<p style="margin:6px 0 0;font-size:13.5px;line-height:1.5">🍳 Búsáhaldabyltingin — fylgið hrundi í <b>' + myStab.approval + '%</b> og fjöldamótmæli felldu stjórnina. Stig þessa kjörtímabils skerðast (×' + myStab.factor + '), og <b>stjórnarkreppa</b> berst yfir á næsta kjörtímabil: minni hagvöxtur, hærra atvinnuleysi, hærri skuldir og lægra byrjunar-fylgi.</p></div>'
      : '';
    // #1 „Af hverju?"-debrief: mannamáls-útskýring efst. finalLevers úr st.draft (reload-öruggt) → S.dials.
    let debriefHtml = '';
    if (mine && mine.detail && mine.detail.perKpi) {
      const finalLevers = (st.draft && Object.keys(st.draft).length) ? st.draft : (S.dials || {});
      const changes = st.mode === 'studio' ? changedLevers(finalLevers, BASELINE) : [];
      const prevKpis = (S.debriefPrevRound === st.round - 1) ? S.debriefPrevKpis : null;
      const { lines } = explainRound({ changes, perKpi: mine.detail.perKpi, kpisNow: mine.detail.kpis || {}, kpisPrev: prevKpis, mandate: st.mandate, links: LINKS, baseline: BASELINE, disp });
      if (lines.length) debriefHtml = '<div class="lk-card lk-debrief"><h2>🧭 Hvað gerðist — og af hverju</h2>' + lines.map((l) => '<p class="lk-debrief-line">' + l + '</p>').join('') + '</div>';
      S.debriefPrevKpis = mine.detail.kpis; S.debriefPrevRound = st.round;
    }
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
      const subKpis = st.mandate.kpis.filter((kpi) => REALITY[kpi.key]); const realK = {};
      for (const kpi of subKpis) realK[kpi.key] = REALITY[kpi.key][idx];
      if (subKpis.length) {
        const realComp = scoreRound(realK, { ...st.mandate, kpis: subKpis }).composite, you = mine.roundScore, diff = Math.round((you - realComp) * 10) / 10;
        const dcol = diff >= 0 ? '#54d08a' : '#e78284', dtxt = 'þú stóðst þig ' + num(Math.abs(diff)) + ' stigum ' + (diff >= 0 ? 'BETUR' : 'VERR') + ' en raunveruleg ríkisstjórn';
        extras += '<div class="lk-card"><h2 title="Þín stig þessa kjörtímabils borin saman við hvernig raunveruleg útkoma Íslands skoraði á sömu markmið (stílfært viðmið).">🕰️ Svona fór það</h2><div class="lk-vs"><div><div class="lk-muted" style="font-size:12px">Þú</div><div class="lk-vs-num" style="color:#6ea8fe">' + num(you) + '</div></div><div class="lk-muted">vs</div><div><div class="lk-muted" style="font-size:12px">Raunveruleikinn</div><div class="lk-vs-num" style="color:#b98cff">' + num(realComp) + '</div></div><div style="color:' + dcol + ';font-weight:700;flex:1;min-width:180px">' + dtxt + '</div></div></div>';
      }
      const stab = (mine.detail && mine.detail.stability) || govtStability(kp);
      const reElect = stab.approval >= 50, pcol = stab.approval >= 55 ? '#54d08a' : stab.approval >= 35 ? '#e8c14a' : '#e78284';
      const uprising = stab.level !== 'stable' ? '<div style="margin-top:8px;padding:8px 12px;border-radius:6px;background:rgba(' + (stab.level === 'revolt' ? '231,130,132,.16);border-left:3px solid #e78284' : '232,193,74,.12);border-left:3px solid #e8c14a') + '"><b>' + stab.icon + ' ' + esc(stab.title) + '</b> — ' + esc(stab.blurb) + '</div>' : '';
      extras += '<div class="lk-card"><h2>🗳️ Kosningar &amp; fylgi</h2><p>Fylgi ríkisstjórnar: <b style="color:' + pcol + '">' + stab.approval + '%</b> → <b>' + (reElect ? 'Endurkjörin ✅' : 'Féll í kosningum ❌') + '</b></p>' + uprising + '</div>';
    }
    root.innerHTML = teamBanner(st) + fellBanner + roleBanner(st) + debriefHtml + card('📊 Skorkort — umferð ' + st.round, scorecard)
      + extras
      + (chainHtml ? card('🔗 Orsaka-keðja ákvarðana ykkar', chainHtml) : '')
      + leaderboard(st)
      + '<div class="lk-card"><p style="color:var(--muted)">Beðið eftir að leikstjóri opni næsta kjörtímabil…</p></div>';
  }

  // ── Studio-stjórnstöð (fullur hermir sem ákvörðunar-yfirborð; forskoðun keyrir vélina á eigin drögum) ──
  function initDials(st) {
    const d = defaultDials(BASELINE);
    // Byrjunar-staða = besta-nálgun á 2000-stefnu (klippt) — EN aðeins fyrir tól sem eru til strax (KT1).
    // Tól sem opnast síðar (LEVER_UNLOCK>1) byrja HLUTLAUS (á grunni) svo spilarinn stilli þau sjálfur (t.d. ferðamannagjald).
    for (const [k, v] of Object.entries(YEAR2000_DIALS)) { if ((LEVER_UNLOCK[k] || 1) > 1) continue; const c = BASELINE.levers[k]; if (c) d[k] = Math.max(c.min, Math.min(c.max, v)); }
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
    const stab = govtStability(kpiVals), pop = stab.approval, popCol = pop >= 55 ? '#54d08a' : pop >= 35 ? '#e8c14a' : '#e78284';
    // #2 Live fórnarskipti: gult borði þegar tvö umboðs-markmið toga á móti hvort öðru við núverandi stöðu.
    const conflicts = detectConflicts(kpiVals, st.mandate);
    let html = '';
    if (conflicts.length) html += '<div class="lk-conflict">' + conflicts.map((c) => '<div class="lk-conflict-row"><span class="lk-conflict-ic">⚠</span><span>' + esc(c.msg) + '</span></div>').join('') + '</div>';
    html += '<div class="lk-card lk-gauge-card"><div class="lk-gauge" title="Samsett stig 0–100 úr umboðs-markmiðunum í lok kjörtímabilsins. Hærra = betri hagstjórn.">' + arcGauge(sc.composite) + '</div><div style="flex:1"><h2 style="margin:0">Þjóðarhagur</h2><p class="lk-muted" style="font-size:12px;margin:4px 0 8px">Samsett staða m.v. umboðið í lok kjörtímabilsins (' + endYear + '). Hærra = betra.' + (sc.crisis ? ' <span style="color:#e78284">⚠ Kreppa!</span>' : '') + (stab.level !== 'stable' ? ' <span style="color:' + (stab.level === 'revolt' ? '#e78284' : '#e8c14a') + '">' + stab.icon + ' ' + esc(stab.title) + ' — stig ×' + stab.factor + '</span>' : '') + '</p><div class="lk-pop" title="Fylgi ríkisstjórnarinnar — ræðst af verðbólgu, atvinnuleysi og hagvexti. Undir 50% og þú átt á hættu að falla í kosningum."><div class="lk-gm-top"><span>🗳️ Fylgi ríkisstjórnar</span><b style="color:' + popCol + '">' + pop + '%</b></div><div class="lk-gm-bar"><div class="lk-gm-fill" style="width:' + pop + '%;background:' + popCol + '"></div></div></div></div></div>';
    html += '<div class="lk-card"><h2 title="Hversu nálægt hverju umboðs-markmiði þú ert. Fyllri borði = betra.">🎯 Markmið</h2><div class="lk-goalmeters">';
    for (const k of st.mandate.kpis) { const p = sc.perKpi.find((x) => x.key === k.key); html += goalMeter(k, kpiVals[k.key], p ? p.score : 0); }
    html += '</div></div>';
    // 🗣️ Ráðgjafar: andstæð hagsmuna-ráð sem uppfærast með drögunum (ráðgefandi, engin bein áhrif).
    const adv = advisors(kpiVals, st.round);
    html += '<div class="lk-card"><h2 title="Hagsmuna-raddir gefa ólík ráð eftir stöðunni — þau uppfærast þegar þú færir sleða.">🗣️ Ráðgjafar</h2>' + adv.map((a) => '<div style="display:flex;gap:9px;margin:7px 0"><span style="font-size:19px;flex:none">' + a.icon + '</span><div><b style="font-size:12.5px">' + esc(a.who) + '</b><div style="font-size:12.5px;color:var(--muted);line-height:1.45">' + esc(a.advice) + '</div></div></div>').join('') + '</div>';
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
    if (S.dilRound !== st.round) { S.dilRound = st.round; S.dilemmaDraft = (st.dilemmaDraft != null ? st.dilemmaDraft : null); }  // klemmu-val endursett/samstillt per kjörtímabil
    // Seed deilanleg liðs-drög (nema það sem ÞÚ hefur breytt) → síð-innkominn félagi sér núverandi drög.
    if (st.draft) for (const [k, v] of Object.entries(st.draft)) { if (BASELINE.levers[k] && !S.localTouched.has(k)) S.dials[k] = +v; }
    const tab = STUDIO_CAT.tabs[S.studioTab] || STUDIO_CAT.tabs[0];
    const unlocked = (k) => (LEVER_UNLOCK[k] || 1) <= st.round;
    const tabBar = STUDIO_CAT.tabs.map((t, i) => { const m = TAB_META[t.group] || { icon: '', label: t.group }; return `<span class="lk-tab${i === S.studioTab ? ' sel' : ''}" data-tab="${i}" role="button" tabindex="0" title="${esc(t.group)}"><span class="lk-tab-ic">${m.icon}</span> ${esc(m.label)}</span>`; }).join('');
    const visLevers = tab.levers.filter((l) => unlocked(l.key)), lockedN = tab.levers.length - visLevers.length;
    const isCore = (k) => st.round === 1 && CORE_LEVERS.includes(k);
    const sliders = visLevers.map((l) => {
      const cfg = BASELINE.levers[l.key];
      const v = S.dials[l.key] != null ? S.dials[l.key] : l.base, moved = +v !== l.base, core = isCore(l.key);
      const eff = leverEffects(l.key, BASELINE, LINKS);
      const effTxt = eff.length ? ' → hefur áhrif á: ' + eff.map((e) => e.label + (e.dir > 0 ? '↑' : '↓')).join(', ') : '';
      const tip = l.label + '. Núgildi ' + disp(cfg, v) + '.' + effTxt + (core ? ' ⭐ Kjarna-stjórntæki — góður staður að byrja.' : '');
      return `<div class="lk-slider-row${core ? ' lk-core' : ''}" title="${esc(tip)}"><label>${core ? '⭐ ' : ''}${esc(l.label)} <span class="lk-val${moved ? ' moved' : ''}" data-val="${l.key}">${esc(disp(cfg, v))}</span>${st.difficulty === 'easy' ? ' <span class="lk-muted" style="font-size:11px">nú ' + esc(disp(cfg, l.base)) + '</span>' : ''}</label><input type="range" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" data-lev="${l.key}" aria-label="${esc(l.label)}"></div>`;
    }).join('') + (lockedN ? '<p class="lk-muted" style="font-size:12px;margin-top:8px">🔒 ' + lockedN + ' stjórntæki opnast á síðari kjörtímabilum.</p>' : '');
    // „Ný stjórntæki" sem opnuðust ÞETTA kjörtímabil
    const newTools = STUDIO_CAT.tabs.flatMap((t) => t.levers).filter((l) => (LEVER_UNLOCK[l.key] || 1) === st.round).map((l) => l.label);
    const newToolsBanner = (st.round > 1 && newTools.length) ? '<div class="lk-newtools">🆕 <b>Ný stjórntæki opnuðust:</b> ' + newTools.map(esc).join(', ') + '</div>' : '';
    // #4 Mýkri byrjun: intro-borði aðeins í umferð 1.
    const introBanner = st.round === 1 ? '<div class="lk-intro">👋 <b>Þú stýrir Íslandi frá árinu 2000.</b> Byrjaðu á kjarna-tólunum fjórum (⭐): <b>Stýrivextir, Skattar, Tilfærslur, Menntun</b>. Færðu einn sleða, sjáðu áhrifin á gröfunum — og fínstilltu hin tólin síðar.</div>' : '';
    const [y0, y1] = termYears(st.round), ev = st.event;
    root.innerHTML =
      ribbonHtml(st) +
      `<div class="lk-term-head"><span class="lk-term-badge">Kjörtímabil ${st.round}/8 · ${y0}–${y1}</span>${st.difficulty && st.difficulty !== 'medium' ? '<span class="lk-term-badge" style="background:#3a2f1a">🎚️ ' + (st.difficulty === 'hard' ? 'Erfitt' : 'Létt') + '</span>' : ''}${timerBadge(st)}<h1 class="lk-term-title">${ev && ev.icon ? ev.icon + ' ' : ''}${ev ? esc(ev.title) : 'Kjörtímabil ' + st.round}</h1>${ev ? '<p class="lk-term-text">' + esc(ev.text) + '</p>' : ''}${ev && ev.watch ? '<p class="lk-watch">⚠ <b>Hvað þarf að huga að:</b> ' + esc(ev.watch) + '</p>' : ''}</div>` +
      teamBanner(st) + roleBanner(st) + introBanner + newToolsBanner + carryoverCard(st) + surpriseCard(st) +
      (st.stjornarkreppa ? '<div class="lk-conflict" style="border-left-color:#e78284"><div class="lk-conflict-row"><span class="lk-conflict-ic">🚨</span><span><b>Stjórnarkreppa eftir fall stjórnarinnar.</b> Ríkisstjórnin féll í fjöldamótmælum síðasta kjörtímabil — ný stjórn tekur við löskuðu búi. Stjórnarmyndun og lömun draga úr hagvexti, atvinnuleysi eykst, skuldir hækka og fylgi byrjar mun lægra. Það þarf sterka hagstjórn til að ná vopnum sínum á ný.</span></div></div>' : '') +
      '<div class="lk-studio-main">' +
        '<div class="lk-studio-charts" id="lk-st-chart"></div>' +
        '<div class="lk-studio-controls">' +
          '<div class="lk-card"><h2>🎛️ Stjórnstöð</h2><div class="lk-tabs">' + tabBar + '</div>' + ((TAB_META[tab.group] || {}).desc ? '<p class="lk-muted" style="font-size:12px;line-height:1.5;margin:8px 0 4px">' + esc((TAB_META[tab.group] || {}).desc) + '</p>' : '') + '<div id="lk-st-sliders">' + sliders + '</div></div>' +
          mandateCard(st) +
          policiesCard(st) +
          '<button class="lk-btn lk-lock-big" id="lk-lock">🔒 Læsa kjörtímabili ' + st.round + '</button>' +
        '</div>' +
      '</div>' +
      leaderboard(st);
    attachStudio(st);
    drawStudioPreview(st);
  }
  function attachStudio(st) {
    if (S.polRound !== st.round) { S.polRound = st.round; S.policyDraft = { ...((st.policies && st.policies.draft) || {}) }; }  // Fasi E: stefnu-rofa-drög endursett per kjörtímabil
    if (!S.policyDraft) S.policyDraft = {};
    root.querySelectorAll('input[data-pol]').forEach((el) => { el.onchange = () => { S.policyDraft[el.dataset.pol] = el.checked; pushDraft(st); }; });
    root.querySelectorAll('[data-polc]').forEach((el) => { el.onclick = () => { S.policyDraft[el.dataset.polc] = el.dataset.polk; pushDraft(st); renderStudio(st); }; });
    root.querySelectorAll('[data-dil]').forEach((el) => { el.onclick = () => { S.dilemmaDraft = el.dataset.dil; pushDraft(st); renderStudio(st); }; });  // Fasi „skemmtun 3": klemmu-val
    root.querySelectorAll('.lk-tab').forEach((el) => { el.onclick = () => { S.studioTab = +el.dataset.tab; renderStudio(st); }; });
    const clearDrag = () => { S.dragging = null; };
    root.querySelectorAll('input[data-lev]').forEach((el) => {
      el.addEventListener('pointerdown', () => { S.dragging = el.dataset.lev; });
      el.addEventListener('pointerup', clearDrag);
      el.addEventListener('change', () => { clearDrag(); pushDraft(st); });
      el.oninput = () => {
        const k = el.dataset.lev; S.dials[k] = +el.value; S.dragging = k; S.localTouched.add(k);
        const cfg = BASELINE.levers[k], vs = root.querySelector('.lk-val[data-val="' + k + '"]');
        if (vs) { vs.textContent = disp(cfg, +el.value); vs.classList.toggle('moved', +el.value !== cfg.base); }
        if (S.stTimer) clearTimeout(S.stTimer); S.stTimer = setTimeout(() => { S.stTimer = null; drawStudioPreview(st); }, 60);
        pushDraft(st);
      };
    });
    const lock = root.querySelector('#lk-lock'); if (lock) lock.onclick = () => submitStudio(st);
  }
  // Ýtir deilanlegum liðs-drögum á þjón (locked:false, debounce) → félagar samstilla.
  function pushDraft(st) {
    if (S.pushTimer) clearTimeout(S.pushTimer);
    S.pushTimer = setTimeout(() => { S.pushTimer = null; api('/' + S.code + '/decisions', { method: 'POST', body: { round: st.round, decisions: { levers: S.dials, policies: S.policyDraft || {}, dilemma: S.dilemmaDraft || null }, locked: false }, token: S.token }); }, 500);
  }
  // Poll-uppfærsla Á STAÐNUM: samstillir fjar-drög í sleða sem ÞÚ ert ekki að draga/hefur ekki breytt; endurteiknar gröf. ENGIN sleða-endurbygging.
  function updateStudio(st) {
    const rd = st.draft || {};
    root.querySelectorAll('input[data-lev]').forEach((el) => {
      const k = el.dataset.lev;
      if (k === S.dragging || S.localTouched.has(k)) return;
      if (rd[k] != null && +rd[k] !== +S.dials[k]) {
        S.dials[k] = +rd[k];
        const cfg = BASELINE.levers[k], vs = root.querySelector('.lk-val[data-val="' + k + '"]');
        el.value = rd[k];
        if (vs) { vs.textContent = disp(cfg, +rd[k]); vs.classList.toggle('moved', +rd[k] !== cfg.base); }
      }
    });
    drawStudioPreview(st);
  }
  function submitStudio(st) { if (S.pushTimer) { clearTimeout(S.pushTimer); S.pushTimer = null; } return act(async () => { await api('/' + S.code + '/decisions', { method: 'POST', body: { round: st.round, decisions: { levers: S.dials, policies: S.policyDraft || {}, dilemma: S.dilemmaDraft || null }, locked: true }, token: S.token }); S.unlocked = false; }); }

  // Læst-staða (A): staðfesting + samantekt + „Breyta" (aflæsa fram að resolve).
  function renderLocked(st) {
    let summary = '';
    if (st.mode === 'studio') {
      const ch = S.dials ? changedLevers(S.dials, BASELINE) : [];
      summary = ch.length
        ? '<h3 style="font-size:13px;margin:8px 0 2px">Þín stefna:</h3><ul style="margin:2px 0 0;padding-left:18px">' + ch.slice(0, 8).map((c) => '<li>' + esc(c.label) + ': <b>' + esc(disp(BASELINE.levers[c.key], c.to)) + '</b></li>').join('') + '</ul>'
        : '<p class="lk-muted">Engar breytingar frá grunnstefnu.</p>';
    } else {
      const rows = (st.decisions || []).map((d) => { const k = S.draft[d.id]; const opts = d.mode === 'response' ? ((st.event && st.event.responses) || []) : d.options; const o = (opts || []).find((x) => x.key === k); return o ? '<li>' + esc(d.label) + ': <b>' + esc(o.label) + '</b></li>' : ''; }).filter(Boolean).join('');
      summary = rows ? '<h3 style="font-size:13px;margin:8px 0 2px">Þínar ákvarðanir:</h3><ul style="margin:2px 0 0;padding-left:18px">' + rows + '</ul>' : '';
    }
    root.innerHTML =
      teamBanner(st) + roleBanner(st) +
      '<div class="lk-card" style="border-color:#54d08a"><h2>✅ Ákvörðunum læst — umferð ' + st.round + '</h2><p>Beðið eftir hinum liðunum og að leikstjóri leysi umferðina.</p>' + summary + '<button class="lk-btn" id="lk-unlock" style="margin-top:12px;background:#5ac8e0">✏️ Breyta ákvörðun</button></div>' +
      leaderboard(st);
    const u = root.querySelector('#lk-unlock'); if (u) u.onclick = () => { S.unlocked = true; render(); };
  }

  // S6 — áhorfenda-sýn (útsending fyrir skjávarpa): stór stigatafla + kjörtímabil + þróunar-graf.
  function renderWatch(st) {
    const phaseTxt = { lobby: 'Beðið eftir að leikur hefjist…', decide: 'Lið taka ákvarðanir', resolved: 'Umferð leyst — bíð eftir næsta kjörtímabili', ended: '🏁 Leik lokið — árið er 2032' }[st.phase] || st.phase;
    const [y0, y1] = termYears(st.round || 1), ev = st.event;
    const teams = [...(st.teams || [])].sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0));
    const maxCum = Math.max(1, ...teams.map((t) => t.cumulative || 0));
    const board = teams.map((t, i) => {
      const w = Math.max(3, Math.round(100 * (t.cumulative || 0) / maxCum));
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      const col = i === 0 ? '#f6b13b' : LK_PAL[i % LK_PAL.length];
      return '<div class="lk-watch-row"><span class="lk-watch-rank">' + medal + '</span><span class="lk-watch-name">' + esc(t.name) + '</span><div class="lk-watch-bar"><div class="lk-watch-fill" style="width:' + w + '%;background:' + col + '"></div></div><b class="lk-watch-score">' + num(t.cumulative || 0) + '</b></div>';
    }).join('') || '<p class="lk-muted">Engin lið gengin inn enn.</p>';
    const chart = (st.trajectory && st.trajectory.some((s) => s.points && s.points.length))
      ? '<div class="lk-card"><h2>📈 Þróun stiga</h2>' + lkLineChart('Uppsafnað stig', st.trajectory, {}) + '</div>' : '';
    root.innerHTML =
      '<div class="lk-watch-head"><span class="lk-term-badge">📺 Áhorf · leikur ' + esc(st.code) + '</span><h1 class="lk-watch-title">' + (st.phase === 'lobby' ? 'RÁS-Leikurinn — Ísland 2000–2032' : 'Kjörtímabil ' + st.round + '/8 · ' + y0 + '–' + y1) + (ev && ev.icon ? '  ' + ev.icon + ' ' + esc(ev.title) : '') + '</h1><p class="lk-muted">' + esc(phaseTxt) + '</p></div>' +
      '<div class="lk-card"><h2>🏆 Stigatafla</h2><div class="lk-watch-board">' + board + '</div></div>' +
      chart + revealCard(st);
  }

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
    root.innerHTML = card('🛠️ Sérsníða leik', '<h3 style="font-size:14px;margin:2px 0">Umboð (markmið)</h3>' + mh + '<h3 style="font-size:14px;margin:10px 0 2px">Umferðir (' + d.scenario.events.length + ')</h3>' + rh + '<button class="lk-btn" id="ed-addround" style="margin-top:6px">+ Bæta umferð</button><div id="ed-err" class="lk-err" style="margin-top:8px"></div><label style="display:block;margin-top:10px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="ed-studio"' + (S.editStudio ? ' checked' : '') + ' style="vertical-align:middle;margin-right:6px"/>🎛️ Stjórnstöð — sleðar + lifandi gröf</label><label style="display:block;margin-top:6px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="ed-roles"' + (S.editRoles ? ' checked' : '') + ' style="vertical-align:middle;margin-right:6px"/>🎭 Leynileg hlutverk — hvert lið fær ólíkt, hulið umboð</label><label style="display:block;margin-top:6px;font-size:13.5px">⏱️ Umferðar-klukka: <input type="number" id="ed-timer-min" min="0" max="60" step="1" value="' + (S.editTimerMin || '') + '" placeholder="0" style="width:56px;padding:4px 6px;margin:0 4px"/> mín <span class="lk-muted">(0 = engin)</span></label><div style="margin-top:14px"><button class="lk-btn" id="ed-create">Búa til leik</button> <button id="ed-back" style="background:none;border:1px solid var(--line,#2a2f3a);color:var(--ink,#e8ecf3);border-radius:8px;padding:9px 16px;cursor:pointer">Til baka</button></div>');
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
    const timerEl = root.querySelector('#ed-timer-min'); if (timerEl) timerEl.onchange = () => { S.editTimerMin = +timerEl.value || 0; };
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
    const { status, json } = await api('/create', { method: 'POST', body: { scenario: d.scenario, mandate: d.mandate, rounds: d.rounds, ...(S.editRoles ? { roles: true } : {}), ...(S.editStudio ? { mode: 'studio' } : {}), ...(S.editTimerMin > 0 ? { timerSec: Math.round(S.editTimerMin * 60) } : {}) } });
    if (status !== 200 || !json.code) { errEl.innerHTML = (json.errors ? json.errors.map(esc).join('<br>') : 'Villa við að búa til leik.'); return; }
    localStorage.setItem(lsFac(json.code), json.facToken);
    location.href = '/leikur/?g=' + json.code;
  }

  // ── Ræsing ──
  if (S.code && S.token) startPoll();
  else if (S.code && S.role === 'watch') startPoll();
  else loadUser().catch(() => null).then((u) => { S.user = u; render(); });   // lending: sækja notanda-tegund fyrir gátt (UX-hlið, sbr. renderLanding)
}
