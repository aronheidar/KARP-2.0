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
import { uppsafnadSeries, uppsafnadLoka } from './uppsafnad.mjs';
import { politikStada } from './politik.mjs';
import { teachingPrompts } from './analytics.mjs';
import { HANDBOOK } from './handbook.mjs';
import { myndFyrirAtvik, PM_MYNDIR, PM_MYNDIR_KONA } from './myndir.mjs';
import { sagaFyrirLotu, raunKpiLotu, berSamanAkvardanir, radherraFyrirLotu, radherraTexti } from './saga.mjs';
import { kortThrep, KORT_LEVER_ID } from './kort-throp.mjs';
import { renderIslandKort } from './kort-svg.mjs';
import { YEAR_START, REALITY, YEAR2000_DIALS, TAB_META, LEVER_UNLOCK, CORE_LEVERS, SCENARIO, GOAL_SPECS } from './game-config.mjs';
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

// F1-V3: KPI-delta-flísar — litlar pill-flísar („Verðbólga −0,4") með lit eftir því hvort breytingin er GÓÐ.
// GOAL_SPECS.dir: 'max' (haltu undir marki) → lækkun græn; 'min' (haltu yfir) → hækkun græn;
// 'target' (verdbolga) → einfaldað: lækkun græn. 'pop' = fylgi (hærra betra). KPI utan korts → hlutlaus grá (.n).
// Íslenskt tölusnið (komma), + fyrir jákvætt og − (U+2212) fyrir neikvætt; 1-2 aukastafir eftir stærð, núll-halar klipptir.
const deltaFmt = (v) => { const a = Math.abs(v); const s = num(a, a >= 1 ? 1 : 2).replace(/(,\d*?)0+$/, '$1').replace(/,$/, ''); return (v > 0 ? '+' : '−') + s; };
// GALLI G: policyDeltas ber innri KPI-lykla úr vélinni (gengi_endo = innri tvífari gengis → tvítalning;
// gengi/vanskil vantar í GOAL_SPECS). Sía + label-fallback DEILD milli deltaChips og PM-blöðrunnar.
const deltaSkip = (k) => /_endo$/.test(k);   // innri tvífarar — aldrei birtir
const DELTA_LABELS = { gengi: 'gengi', vanskil: 'vanskil' };   // þekktir auka-lyklar utan GOAL_SPECS (íslensk lágstafaheiti)
const deltaLabel = (k) => k === 'pop' ? 'fylgi' : (GOAL_SPECS[k] ? GOAL_SPECS[k].label : (DELTA_LABELS[k] || k));
function deltaChips(deltas) {
  if (!deltas || typeof deltas !== 'object') return '';
  return Object.keys(deltas).map((k) => {
    if (deltaSkip(k)) return '';
    const v = +deltas[k];
    if (!isFinite(v) || Math.abs(v) < 0.005) return '';
    const spec = GOAL_SPECS[k];
    let cls = 'n';
    if (k === 'pop') cls = v > 0 ? 'g' : 'r';
    else if (spec) cls = ((v < 0) === (spec.dir === 'max' || spec.dir === 'target')) ? 'g' : 'r';
    return '<span class="lk-chip ' + cls + '">' + esc(deltaLabel(k)) + ' ' + deltaFmt(v) + '</span>';
  }).join('');
}

// Leikstjóra-greiningarmælaborð: skorkort-tafla + ákvarðanir + ferla-gröf. Lit per lið (samræmt).
const LK_PAL = ['#6ea8fe', '#f6b13b', '#54d08a', '#e78284', '#b98cff', '#5ac8e0', '#f0a3c8', '#a0d468'];
function lkLineChart(title, series, opts = {}) {
  const W = 320, H = 150, pl = 34, pr = 10, pt = 22, pb = 22;
  // VERK 3: opts.light → prent-litir (dökkur texti + dökkar hjálparlínur á hvítum pappír; SVG-fill
  // er attribút sem CSS nær ekki að yfirskrifa, þess vegna valkostur hér en ekki í prent-CSS).
  const cTitle = opts.light ? '#3d4757' : '#9fb0c8', cTick = opts.light ? '#5c6779' : '#7b879c', cGrid = opts.light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.07)';
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
  let g = `<text x="${pl}" y="14" font-size="11" fill="${cTitle}">${esc(title)}</text>`;
  for (let i = 0; i <= 2; i++) { const v = ymin + (ymax - ymin) * i / 2, y = Y(v); g += `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}" stroke="${cGrid}"/><text x="${pl - 4}" y="${(y + 3).toFixed(1)}" font-size="9" fill="${cTick}" text-anchor="end">${num(v, 0)}</text>`; }
  series.forEach((s, i) => {
    const c = col(s, i), pts = s.points.slice().sort((a, b) => a.round - b.round);
    const sw = opts.widthOf ? opts.widthOf(s.teamId) : 2;   // F1-V4: mitt lið þykkast í uppsafnað-gröfum
    const d = pts.map((p, j) => (j ? 'L' : 'M') + X(p.round).toFixed(1) + ',' + Y(p.value).toFixed(1)).join(' ');
    g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
    for (const p of pts) g += `<circle cx="${X(p.round).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="${sw >= 3 ? 3 : 2.5}" fill="${c}"/>`;
  });
  // F1-V4: ákvarðana-pinnar — lóðrétt strikalína + íkon á lotu-x; <title> = label (native SVG-tooltip).
  if (opts.marks && opts.marks.length) {
    const byRound = {};
    for (const m of opts.marks) (byRound[m.round] || (byRound[m.round] = [])).push(m);
    for (const rd of Object.keys(byRound)) {
      const x = X(+rd);
      g += `<line x1="${x.toFixed(1)}" y1="${pt}" x2="${x.toFixed(1)}" y2="${H - pb}" stroke="#e8c14a" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>`;
      byRound[rd].forEach((m, j) => { g += `<g><title>${esc(m.label)}</title><text x="${(x + (j - (byRound[rd].length - 1) / 2) * 13).toFixed(1)}" y="${pt + 9}" font-size="10" text-anchor="middle">${m.icon || '🏛️'}</text></g>`; });
    }
  }
  for (const r of rounds) g += `<text x="${X(r).toFixed(1)}" y="${H - 7}" font-size="9" fill="${cTick}" text-anchor="middle">${r}</text>`;
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
// F1-V4: uppsafnaðar stærðir — sameiginlegar skilgreiningar fyrir results-kort, fac-töflu og leikslok-blokk.
const UPP_SPECS = [
  { key: 'verdlag', label: 'Verðlag (vísitala, 2000=100)', short: 'Verðlag', best: 'min' },
  { key: 'vlf', label: 'VLF (vísitala, 2000=100)', short: 'VLF-vísitala', best: 'max' },
  { key: 'kaupmattur', label: 'Kaupmáttur (vísitala, 2000=100)', short: 'Kaupmáttarvísitala', best: 'max' },
  { key: 'skuldir', label: 'Skuldir ríkis (% af VLF)', short: 'Skuldir %', best: 'min' },
  { key: 'losun', label: 'Uppsöfnuð losun (vísitölu-ár)', short: 'Losun-summa', best: 'min' },
];
const uppColorOf = (kh) => (id) => { const i = kh.findIndex((t) => t.teamId === id); return LK_PAL[((i % LK_PAL.length) + LK_PAL.length) % LK_PAL.length]; };
// Results-kort: 5 smá-gröf, ÖLL lið saman (lína per lið, mitt lið þykkast) + ákvarðana-pinnar MÍNS liðs.
function uppsafnadCard(st, myTeamId) {
  const kh = st.kpiHistory; if (!kh || !kh.length || !kh.some((t) => t.rounds && t.rounds.length)) return '';
  const per = kh.map((t) => ({ teamId: t.teamId, name: t.name, s: uppsafnadSeries(t.rounds) }));
  const colorOf = uppColorOf(kh);
  const marks = (st.decisionMarks || []).filter((m) => m.teamId === myTeamId).map((m) => ({ round: m.round, icon: m.icon, label: m.label }));
  let charts = '';
  for (const spec of UPP_SPECS) charts += lkLineChart(spec.label, per.map((p) => ({ teamId: p.teamId, points: p.s[spec.key] || [] })), { colorOf, widthOf: (id) => (id === myTeamId ? 3.4 : 1.3), marks });
  if (!charts) return '';
  const legend = per.map((p) => '<span class="lk-upp-leg' + (p.teamId === myTeamId ? ' me' : '') + '"><span class="lk-swatch" style="background:' + colorOf(p.teamId) + '"></span>' + esc(p.name) + (p.teamId === myTeamId ? ' (þið)' : '') + '</span>').join('');
  return '<div class="lk-card"><h2>🏦 Uppsafnað — Ísland ykkar</h2>'
    + '<p class="lk-muted" style="font-size:12px;margin:0 0 6px">Uppsafnað frá 2000: vísitölur byrja í 100 og vaxa með verðbólgu/hagvexti/kaupmætti (4 ár per kjörtímabil); skuldir eru staða; losun er summa.' + (marks.length ? ' Gular strikalínur = stóru ákvarðanirnar ykkar.' : '') + '</p>'
    + '<div class="lk-upp-legend">' + legend + '</div>'
    + '<div class="lk-charts">' + charts + '</div></div>';
}
// Leikslok-blokk: „Ísland ykkar 2032" — lokastöðurnar 5 í mannamáli + best-í-leik samanburður.
function uppsafnadRecap(st, myTeamId) {
  const kh = st.kpiHistory; if (!kh || !kh.length) return '';
  const mine = kh.find((t) => t.teamId === myTeamId); if (!mine || !mine.rounds || !mine.rounds.length) return '';
  const loka = uppsafnadLoka(uppsafnadSeries(mine.rounds));
  const ratio = (v) => num(Math.round(v / 100 * 10) / 10);
  const lines = [];
  if (loka.verdlag != null) lines.push('💵 Verðlag er <b>' + ratio(loka.verdlag) + '×</b> hærra en árið 2000.');
  if (loka.vlf != null) lines.push('📈 Landsframleiðslan er <b>' + ratio(loka.vlf) + '×</b> af stærð ársins 2000' + (loka.vlf < 100 ? ' — hagkerfið dróst saman.' : '.'));
  if (loka.kaupmattur != null) lines.push('🛒 Kaupmáttur launa er <b>' + ratio(loka.kaupmattur) + '×</b> á við árið 2000.');
  if (loka.skuldir != null) lines.push('🏛️ Skuldir ríkisins enda í <b>' + num(loka.skuldir) + '%</b> af VLF.');
  if (loka.losun != null) lines.push('🌱 Uppsöfnuð losun 2000–2032: <b>' + num(loka.losun, 0) + '</b> vísitölu-ár.');
  if (!lines.length) return '';
  // Besta lið leiksins per stærð (aðeins ef fleiri en eitt lið hafa gögn).
  const all = kh.filter((t) => t.rounds && t.rounds.length).map((t) => ({ name: t.name, loka: uppsafnadLoka(uppsafnadSeries(t.rounds)) }));
  let bestHtml = '';
  if (all.length > 1) {
    const bits = UPP_SPECS.map((c) => {
      const cand = all.filter((a) => a.loka[c.key] != null); if (!cand.length) return '';
      const b = cand.reduce((x, y) => ((c.best === 'max' ? y.loka[c.key] > x.loka[c.key] : y.loka[c.key] < x.loka[c.key]) ? y : x));
      return esc(c.short.toLowerCase()) + ' <b>' + esc(b.name) + '</b>';
    }).filter(Boolean);
    if (bits.length) bestHtml = '<p class="lk-muted" style="font-size:12.5px;margin:8px 0 0;border-top:1px solid var(--line);padding-top:7px">🏅 Besta lið leiksins: ' + bits.join(' · ') + '</p>';
  }
  return '<div class="lk-card lk-upp-lines"><h2>🇮🇸 Ísland ykkar 2032</h2>' + lines.map((l) => '<p>' + l + '</p>').join('') + bestHtml + '</div>';
}
// ── VERK 1: Pólitíski mælirinn — HLUTLAUS vörpun stefnublöndu á vinstri-hægri ás (politik.mjs). ──
// Litirnir eru merkingar, ekki dómar: rautt=vinstri, blátt=hægri (íslensk hefð); ⓘ-textinn fylgir alls staðar.
const POL_INFO = 'Einföld vörpun stefnublöndu á vinstri-hægri ás — kennslutæki, ekki dómur.';
const POL_STUTT = { vinstri: 'Vinstri', midja: 'Miðja', haegri: 'Hægri' };
const polColor = (flokkur) => flokkur === 'vinstri' ? '#e78284' : flokkur === 'haegri' ? '#6ea8fe' : '#cbd3e1';
const polStig = (stig) => (stig > 0 ? '+' : '') + stig;
// Lárétt braut: gradient rauður↔grár↔blár + nál á stig-staðsetningu (-100..100 → 0..100% frá vinstri).
function politikBraut(stig, nalId) {
  return '<div class="lk-pol-track"><div class="lk-pol-nal"' + (nalId ? ' id="' + nalId + '"' : '') + ' style="left:' + (50 + stig / 2).toFixed(1) + '%"></div></div>'
    + '<div class="lk-pol-labels"><span>Vinstri</span><span>Miðja</span><span>Hægri</span></div>';
}
// „Togar"-listarnir: stærstu framlögin hvora átt („Til vinstri: Veiðigjald ↑ (+2,1) …").
function politikTogar(p) {
  const list = (arr, heiti) => (arr && arr.length)
    ? '<div class="lk-pol-tog"><b>' + heiti + ':</b> ' + arr.map((t) => esc(t.label) + ' (+' + num(t.framlag) + ')').join(' · ') + '</div>' : '';
  return list(p.togar && p.togar.vinstri, 'Til vinstri') + list(p.togar && p.togar.haegri, 'Til hægri');
}
function renderFacAnalytics(an, st, openDetails = new Set()) {
  if (!an || !an.scorecard || !an.scorecard.length) return '<p class="lk-muted">Greining birtist eftir fyrstu leystu umferð.</p>';
  const order = an.trajectories.cumulative.map((s) => s.teamId);
  const colorOf = (teamId) => LK_PAL[((order.indexOf(teamId) % LK_PAL.length) + LK_PAL.length) % LK_PAL.length];
  const scoreCol = (v) => v == null ? '#9fb0c8' : v >= 80 ? '#54d08a' : v >= 40 ? '#e8c14a' : '#e78284';
  const hasRole = an.scorecard.some((r) => r.role);
  // VERK 1c: pólitíski ásinn í leikslok — lokastaða per lið (dálkur í skorkorti) + ferill-graf (debrief-fóður).
  const polBy = {};
  for (const t of ((st && st.politikFerill) || [])) { const last = (t.ferill || [])[(t.ferill || []).length - 1]; if (last) polBy[t.teamId] = last; }
  const hasPol = Object.keys(polBy).length > 0;
  const kpiCols = an.scorecard[0].perKpi.map((p) => p.label);
  let sc = '<table class="lk-tbl"><tr><th>Lið</th>' + (hasRole ? '<th>Hlutverk</th>' : '') + kpiCols.map((l) => '<th>' + esc(l) + '</th>').join('') + '<th>Uppsafnað</th><th title="Meðal-fylgi ríkisstjórnar yfir kjörtímabilin">🗳️ Fylgi</th>' + (hasPol ? '<th title="' + esc(POL_INFO) + '">🧭 Ás</th>' : '') + '</tr>';
  an.scorecard.forEach((row) => {
    sc += '<tr><td><span class="lk-swatch" style="background:' + colorOf(row.teamId) + '"></span>' + esc(row.name) + '</td>'
      + (hasRole ? '<td style="font-size:12px">' + esc(row.role || '–') + '</td>' : '')
      + row.perKpi.map((p) => '<td style="color:' + scoreCol(p.score) + ';font-weight:600">' + (p.score == null ? '–' : p.score) + '</td>').join('')
      + '<td><b>' + num(row.cumulative) + '</b></td><td style="color:' + (row.avgApproval == null ? 'var(--faint)' : row.avgApproval >= 50 ? '#54d08a' : row.avgApproval >= 35 ? '#e8c14a' : '#e78284') + '">' + (row.avgApproval != null ? row.avgApproval + '%' : '–') + '</td>'
      + (hasPol ? '<td style="color:' + polColor((polBy[row.teamId] || {}).flokkur) + ';font-weight:600">' + (polBy[row.teamId] ? esc(POL_STUTT[polBy[row.teamId].flokkur] || polBy[row.teamId].flokkur) + ' (' + polStig(polBy[row.teamId].stig) + ')' : '–') + '</td>' : '') + '</tr>';
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
  // Frammistöðu-yfirlit per lið: hvað gerðu vel (sterk svið) / hvað mátti bæta (veik svið) + fylgi + föll.
  const reviewHtml = (an.teamReview && an.teamReview.length)
    ? '<h3 style="font-size:14px;margin:12px 0 4px">🏅 Frammistaða liða — hvað gekk vel, hvað mátti bæta</h3>' + an.teamReview.map((t) => {
        const strong = t.strong.length ? t.strong.map((d) => esc(d.label) + ' <span class="lk-muted">(' + d.avg + ')</span>').join(', ') : '—';
        const weak = t.weak.length ? t.weak.map((d) => esc(d.label) + ' <span class="lk-muted">(' + d.avg + ')</span>').join(', ') : 'engin veik svið — sterk heildar-frammistaða';
        const meta = '· fylgi ' + (t.avgApproval != null ? t.avgApproval + '%' : '–') + (t.fell ? ' · 🚨 stjórnin féll ' + t.fell + '×' : '');
        return '<div style="border:1px solid #2a3040;border-left:3px solid ' + colorOf(t.teamId) + ';border-radius:8px;padding:9px 12px;margin:6px 0">'
          + '<b>' + esc(t.name) + '</b> <span class="lk-muted" style="font-size:12px">' + meta + '</span>'
          + '<div style="font-size:12.5px;margin-top:4px">✅ <b>Gerðu vel:</b> ' + strong + '</div>'
          + '<div style="font-size:12.5px;margin-top:2px">⚠ <b>Mátti bæta:</b> ' + weak + '</div></div>';
      }).join('')
    : '';
  // Ákvarðanaferill liða yfir kjörtímabilin (samanbrjótanlegt per lið).
  const arcHtml = (an.decisionArc && an.decisionArc.length)
    ? '<h3 style="font-size:14px;margin:12px 0 4px">📋 Ákvarðanaferill liða (kjörtímabil fyrir kjörtímabil)</h3>' + an.decisionArc.map((t) =>
        '<details data-keep="arc-' + t.teamId + '"' + (openDetails.has('arc-' + t.teamId) ? ' open' : '') + ' style="margin:4px 0"><summary style="cursor:pointer;font-weight:600;font-size:13px"><span class="lk-swatch" style="background:' + colorOf(t.teamId) + '"></span> ' + esc(t.name) + '</summary>'
        + '<table class="lk-tbl" style="margin-top:4px"><tr><th>Kjörtímabil</th><th>Það sem liðið breytti</th></tr>'
        + t.rows.map((r) => '<tr><td style="font-size:12px;white-space:nowrap">' + esc(r.event) + '</td><td style="font-size:12px">' + esc(r.summary) + '</td></tr>').join('')
        + '</table></details>').join('')
    : '';
  // Leiðbeiningar fyrir 1–2 klst umræðu (föst kennslu-uppbygging).
  const guideHtml = '<details data-keep="guide"' + (openDetails.has('guide') ? ' open' : '') + ' style="margin:4px 0 8px;border:1px solid #2a3040;border-radius:8px;padding:8px 12px"><summary style="cursor:pointer;font-weight:700;font-size:13.5px">🎓 Leiðbeiningar fyrir umræðu (1–2 klst)</summary><ol class="lk-prompts" style="font-size:12.8px;margin-top:6px">'
    + '<li><b>Yfirferð niðurstaðna (15 mín):</b> Farið yfir lokastöðu og þróunar-gröfin — hvaða lið náði bestum árangri og hvers vegna?</li>'
    + '<li><b>Stefna hvers liðs (20 mín):</b> Látið hvert lið kynna sína leið út frá ákvarðanaferlinum — hver var stóra hugmyndin, og breyttist hún með áföllum?</li>'
    + '<li><b>Stóru ákvarðanirnar (20 mín):</b> Berið saman Icesave/ESB/stóriðju o.fl. — rökin, fylgið og afleiðingarnar umfram þjóðhags-tölurnar.</li>'
    + '<li><b>Fórnarskipti & það sem mátti bæta (20 mín):</b> Notið „gerðu vel / mátti bæta" — af hverju var erfitt að ná öllum markmiðum í einu?</li>'
    + '<li><b>Tenging við raunveruleikann (15 mín):</b> Berið saman við „svona fór það" — hvað segir þetta um raunverulega hagstjórn Íslands 2000–2032?</li>'
    + '</ol></details>';
  // F1-V4: uppsafnað eftir liðum — lokastöður 5 uppsafnaðra stærða, besta gildi hverrar súlu grænt.
  let uppHtml = '';
  const kh = st && st.kpiHistory;
  if (kh && kh.some((t) => t.rounds && t.rounds.length)) {
    const rowsU = kh.map((t) => ({ teamId: t.teamId, name: t.name, loka: uppsafnadLoka(uppsafnadSeries(t.rounds)) }));
    const bestOf = {};
    for (const c of UPP_SPECS) { const vals = rowsU.map((r) => r.loka[c.key]).filter((v) => v != null); bestOf[c.key] = vals.length ? (c.best === 'max' ? Math.max(...vals) : Math.min(...vals)) : null; }
    uppHtml = '<h3 style="font-size:14px;margin:12px 0 4px">🏦 Uppsafnað eftir liðum (lokastöður, 2000=100)</h3><table class="lk-tbl"><tr><th>Lið</th>' + UPP_SPECS.map((c) => '<th>' + esc(c.short) + '</th>').join('') + '</tr>'
      + rowsU.map((r) => '<tr><td><span class="lk-swatch" style="background:' + colorOf(r.teamId) + '"></span>' + esc(r.name) + '</td>' + UPP_SPECS.map((c) => { const v = r.loka[c.key]; const best = v != null && bestOf[c.key] != null && v === bestOf[c.key]; return '<td' + (best ? ' class="lk-upp-best" title="Besta gildi súlunnar"' : '') + '>' + (v == null ? '–' : num(v, c.key === 'losun' ? 0 : 1)) + '</td>'; }).join('') + '</tr>').join('')
      + '</table>';
  }
  // VERK 1c: ferill pólitíska ássins yfir lotur (aðeins þegar st.politikFerill fylgir — leikslok).
  let polChart = '';
  if (hasPol) {
    const series = (st.politikFerill || []).map((t) => ({ teamId: t.teamId, points: (t.ferill || []).map((f) => ({ round: f.round, value: f.stig })) }));
    polChart = '<h3 style="font-size:14px;margin:12px 0 4px" title="' + esc(POL_INFO) + '">🧭 Pólitíska litrófið yfir kjörtímabilin (vinstri −100 ↔ hægri +100)</h3>'
      + lkLineChart('Vinstri ↔ Hægri', series, { min: -100, max: 100, colorOf })
      + '<p class="lk-muted" style="font-size:11px;margin:2px 0 0">ⓘ ' + esc(POL_INFO) + '</p>';
  }
  return guideHtml + promptsHtml
    + '<h3 style="font-size:14px;margin:12px 0 4px">Staða liða</h3>' + sc
    + uppHtml
    + polChart
    + reviewHtml
    + arcHtml
    + polHtml
    + dilHtml
    + '<h3 style="font-size:14px;margin:12px 0 4px">Ákvarðanir umferðar</h3>' + dt
    + '<h3 style="font-size:14px;margin:12px 0 4px">Þróun yfir umferðir</h3>' + charts;
}

// ── VERK 3: Prentanleg kennsluskýrsla (leikslok — leikstjóri) ────────────────
// Byggir ljósa, A4-væna skýrslu úr því sem ÞEGAR er í ended-/state: stigatafla+arfleifð,
// per-lið blokkir (stiga-ferill/uppsafnað/pólitík/stórar ákvarðanir/frammistaða/klemmur),
// samanburðarsíða þvert á lið og umræðukafli (teachingPrompts + sjálfvirkar athuganir).
// ATH: medals reiknast þjóns-megin AÐEINS fyrir liðs-tákn (server.mjs: you.role==='team') —
// stigataflan ber því arfleifðar-titil hvers liðs (endTitle, það sama og liðin sáu sjálf).
// 2–3 sjálfvirkar umræðu-athuganir úr RAUN-mun liðanna (hreint fall af leikslok-gögnum).
function lkPrintObservations(teams, lokaOf, polLast, an) {
  const out = [];
  const nb = (t) => '<b>' + esc(t.name) + '</b>';
  const sidTxt = (f) => f === 'haegri' ? 'hægra megin' : f === 'vinstri' ? 'vinstra megin' : 'á miðjunni';
  const wp = teams.filter((t) => polLast[t.id] && lokaOf[t.id] && lokaOf[t.id].skuldir != null);
  // a) Sama hlið pólitíska ássins en gjörólík skuldastaða → hugmyndafræði ein ræður ekki skuldum.
  let pair = null;
  for (let i = 0; i < wp.length; i++) for (let j = i + 1; j < wp.length; j++) {
    if (polLast[wp[i].id].flokkur !== polLast[wp[j].id].flokkur) continue;
    const gap = Math.abs(lokaOf[wp[i].id].skuldir - lokaOf[wp[j].id].skuldir);
    if (!pair || gap > pair.gap) pair = { a: wp[i], b: wp[j], gap, flokkur: polLast[wp[i].id].flokkur };
  }
  if (pair && pair.gap >= 15) out.push(nb(pair.a) + ' og ' + nb(pair.b) + ' enduðu bæði ' + sidTxt(pair.flokkur) + ' á pólitíska ásnum en með gjörólíka skuldastöðu (munar ' + num(pair.gap, 0) + ' prósentustigum af VLF) — hvers vegna? Hvað annað en hugmyndafræðin réð skuldaþróuninni?');
  // b) Ólíkir flokkar með svipuð stig → fleiri en ein leið að sama árangri.
  let close = null;
  const maxCum = Math.max(1, ...teams.map((t) => t.cumulative || 0));
  for (let i = 0; i < wp.length; i++) for (let j = i + 1; j < wp.length; j++) {
    if (polLast[wp[i].id].flokkur === polLast[wp[j].id].flokkur) continue;
    const d = Math.abs((wp[i].cumulative || 0) - (wp[j].cumulative || 0));
    if (!close || d < close.d) close = { a: wp[i], b: wp[j], d };
  }
  if (close && close.d <= Math.max(10, maxCum * 0.05)) out.push(nb(close.a) + ' (' + esc(POL_STUTT[polLast[close.a.id].flokkur] || '') + ') og ' + nb(close.b) + ' (' + esc(POL_STUTT[polLast[close.b.id].flokkur] || '') + ') enduðu með nánast jafn mörg stig en fóru gjörólíkar pólitískar leiðir — er til „ein rétt“ hagstjórn?');
  // c) Kaupmáttar-meistarinn er ekki stiga-meistarinn → eitt markmið vs. heildar-umboðið.
  const wk = teams.filter((t) => lokaOf[t.id] && lokaOf[t.id].kaupmattur != null);
  if (wk.length > 1 && teams.length) {
    const best = wk.reduce((x, y) => (lokaOf[y.id].kaupmattur > lokaOf[x.id].kaupmattur ? y : x));
    if (best.id !== teams[0].id) out.push(nb(best) + ' skilaði mesta kaupmættinum en ' + nb(teams[0]) + ' vann á stigum — hvað segir það um muninn á einu markmiði og heildar-umboðinu?');
  }
  // d) Mesta skulda-bilið yfirhöfuð (aðeins ef a-athugunin greip það ekki þegar).
  const ws = teams.filter((t) => lokaOf[t.id] && lokaOf[t.id].skuldir != null);
  if (ws.length > 1 && !(pair && pair.gap >= 15)) {
    const hi = ws.reduce((x, y) => (lokaOf[y.id].skuldir > lokaOf[x.id].skuldir ? y : x));
    const lo = ws.reduce((x, y) => (lokaOf[y.id].skuldir < lokaOf[x.id].skuldir ? y : x));
    const gap = lokaOf[hi.id].skuldir - lokaOf[lo.id].skuldir;
    if (gap >= 20) out.push(nb(hi) + ' endaði með ' + num(lokaOf[hi.id].skuldir, 0) + '% skuldir af VLF en ' + nb(lo) + ' ' + num(lokaOf[lo.id].skuldir, 0) + '% — hvað keyptu liðin fyrir skuldirnar (eða spöruðu sér)?');
  }
  // e) Vinsælasta liðið vann ekki → fylgi og árangur haldast ekki alltaf í hendur.
  const ap = ((an && an.scorecard) || []).filter((r) => r.avgApproval != null);
  if (ap.length > 1 && teams.length) {
    const top = ap.reduce((x, y) => (y.avgApproval > x.avgApproval ? y : x));
    if (top.teamId !== teams[0].id) out.push('<b>' + esc(top.name) + '</b> naut mesta fylgisins (' + top.avgApproval + '%) en vann ekki á stigum — kaupa vinsælar ákvarðanir árangur, eða kosta þær hann?');
  }
  return out.slice(0, 3);
}
function lkPrintReport(st) {
  const teams = [...(st.teams || [])].sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0));
  if (!teams.length) return '<div class="lkp-doc"><p>Engin lið í leiknum — engin skýrsla.</p></div>';
  const ids = teams.map((t) => t.id);
  const colorOf = (id) => LK_PAL[((ids.indexOf(id) % LK_PAL.length) + LK_PAL.length) % LK_PAL.length];
  const rounds = st.round || 8;
  const an = st.analytics || {};
  const kh = st.kpiHistory || [], pf = st.politikFerill || [], marks = st.decisionMarks || [];
  const lokaOf = {}; for (const t of kh) if (t.rounds && t.rounds.length) lokaOf[t.teamId] = uppsafnadLoka(uppsafnadSeries(t.rounds));
  const polLast = {}; for (const t of pf) { const l = (t.ferill || [])[(t.ferill || []).length - 1]; if (l) polLast[t.teamId] = l; }
  const roleOf = {}; for (const r of (st.rolesReveal || [])) roleOf[r.teamId] = r;
  const pfOf = {}; for (const t of pf) pfOf[t.teamId] = t;
  const trajOf = {}; for (const t of (st.trajectory || [])) trajOf[t.teamId] = t.points || [];
  const reviewOf = {}; for (const t of (an.teamReview || [])) reviewOf[t.teamId] = t;
  const polTeamOf = {}; for (const t of (an.policiesByTeam || [])) polTeamOf[t.teamId] = t;
  const dilOf = {}; for (const t of (an.dilemmasByTeam || [])) dilOf[t.teamId] = t;

  // 1. Haus
  const diffTxt = st.difficulty === 'easy' ? 'Létt' : st.difficulty === 'hard' ? 'Erfitt' : 'Miðlungs';
  let dags = ''; try { dags = new Date().toLocaleDateString('is-IS', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { dags = new Date().toISOString().slice(0, 10); }
  const head = '<header><h1>RÁS-Leikurinn — kennsluskýrsla</h1><p class="lkp-meta">Leikkóði <b>' + esc(st.code || '') + '</b> · ' + esc(dags) + ' · ' + teams.length + ' lið · ' + rounds + ' kjörtímabil (2000–2032) · erfiðleikastig: ' + diffTxt + (st.mode === 'studio' ? ' · stjórnstöðvar-hamur' : '') + '</p></header>';

  // 2. Loka-stigatafla + arfleifð (+ afhjúpuð umboð ef leynihlutverk voru í leiknum)
  const hasRole = teams.some((t) => roleOf[t.id]);
  let lb = '<section><h2>🏆 Loka-stigatafla</h2><table class="lkp-tbl"><tr><th>#</th><th>Lið</th>' + (hasRole ? '<th>Umboð (afhjúpað)</th>' : '') + '<th>Stig</th><th>Meðal/100</th><th>Arfleifð 2032</th></tr>';
  teams.forEach((t, i) => {
    const avg = rounds ? (t.cumulative || 0) / rounds : 0, et = endTitle(avg);
    lb += '<tr><td>' + (i + 1) + '</td><td><span class="lk-swatch" style="background:' + colorOf(t.id) + '"></span>' + esc(t.name) + '</td>'
      + (hasRole ? '<td>' + (roleOf[t.id] ? esc(roleOf[t.id].label) : '–') + '</td>' : '')
      + '<td><b>' + num(t.cumulative || 0) + '</b></td><td>' + num(avg) + '</td><td>' + esc(et.title) + '</td></tr>';
  });
  lb += '</table><p class="lkp-fine">Verðlaunatitlar (🏅 medals) reiknast aðeins á liðs-aðgöngum og birtast á leikslok-skjá hvers liðs — arfleifðar-titillinn hér er sami titill og liðið sá á forsíðu RÁS-TÍÐINDA.</p></section>';

  // 3. Per lið — blokk hvert (page-break-inside: avoid í prent-CSS)
  const polBand = (ferill) => (ferill && ferill.length)
    ? '<span class="lkp-polband">' + ferill.map((f) => '<span class="lkp-polseg" style="background:' + polColor(f.flokkur) + '" title="KT' + f.round + ': ' + polStig(f.stig) + '">' + f.round + '</span>').join('') + '</span>' : '';
  let teamsHtml = '<h2 class="lkp-break">📋 Liðin — eitt af öðru</h2>';
  teams.forEach((t, i) => {
    const myMarks = marks.filter((m) => m.teamId === t.id).map((m) => ({ round: m.round, icon: m.icon, label: m.label }));
    const chart = (trajOf[t.id] && trajOf[t.id].length)
      ? lkLineChart('Uppsafnað stig eftir kjörtímabilum', [{ teamId: t.id, points: trajOf[t.id] }], { light: true, colorOf, marks: myMarks }) : '';
    const loka = lokaOf[t.id];
    const lokaHtml = loka ? '<table class="lkp-tbl lkp-mini"><tr>' + UPP_SPECS.map((c) => '<th>' + esc(c.short) + '</th>').join('') + '</tr><tr>' + UPP_SPECS.map((c) => '<td>' + (loka[c.key] == null ? '–' : num(loka[c.key], c.key === 'losun' ? 0 : 1)) + '</td>').join('') + '</tr></table>' : '';
    const pl = polLast[t.id];
    const polHtml = pfOf[t.id] ? '<div class="lkp-kv"><b>🧭 Pólitíski ferillinn:</b> ' + polBand(pfOf[t.id].ferill) + (pl ? ' lokastaða: <b style="color:' + polColor(pl.flokkur) + '">' + esc(POL_STUTT[pl.flokkur] || pl.flokkur) + ' (' + polStig(pl.stig) + ')</b>' : '') + '</div>' : '';
    const decHtml = myMarks.length
      ? '<div class="lkp-kv"><b>🏛️ Stórar ákvarðanir:</b> ' + myMarks.map((m) => 'KT' + m.round + ' ' + (m.icon || '🏛️') + ' ' + esc(m.label)).join(' · ') + '</div>'
      : (polTeamOf[t.id] ? '<div class="lkp-kv"><b>🏛️ Stórar ákvarðanir:</b> ' + polTeamOf[t.id].policies.map((p) => p.icon + ' ' + esc(p.label) + ': ' + esc(p.choice)).join(' · ') + '</div>' : '');
    const rv = reviewOf[t.id];
    const rvHtml = rv
      ? '<div class="lkp-kv"><b>✅ Gerðu vel:</b> ' + (rv.strong.length ? rv.strong.map((d) => esc(d.label) + ' (' + d.avg + ')').join(', ') : '—') + '</div>'
      + '<div class="lkp-kv"><b>⚠ Mátti bæta:</b> ' + (rv.weak.length ? rv.weak.map((d) => esc(d.label) + ' (' + d.avg + ')').join(', ') : 'engin veik svið — sterk heildar-frammistaða') + '</div>'
      + '<div class="lkp-kv"><b>🗳️ Meðal-fylgi:</b> ' + (rv.avgApproval != null ? rv.avgApproval + '%' : '–') + (rv.fell ? ' · 🚨 stjórnin féll ' + rv.fell + '×' : '') + '</div>' : '';
    const dil = dilOf[t.id];
    const dilHtml = (dil && dil.items && dil.items.length)
      ? '<div class="lkp-kv"><b>🎲 Óvænt atvik — viðbrögð:</b> ' + dil.items.map((it) => 'KT' + (it.round != null ? it.round : '?') + ' ' + (it.icon || '🎲') + ' ' + esc(it.title) + ': ' + esc(it.choice || '— ekkert valið')).join(' · ') + '</div>' : '';
    teamsHtml += '<section class="lkp-team" style="border-left:4px solid ' + colorOf(t.id) + '">'
      + '<h3>' + (i + 1) + '. ' + esc(t.name) + ' — ' + num(t.cumulative || 0) + ' stig</h3>'
      + (roleOf[t.id] ? '<p class="lkp-fine">🎭 Umboð: <b>' + esc(roleOf[t.id].label) + '</b> — ' + esc(roleOf[t.id].blurb || '') + '</p>' : '')
      + (chart ? '<div class="lkp-chart">' + chart + '</div>' : '')
      + lokaHtml + polHtml + decHtml + rvHtml + dilHtml + '</section>';
  });

  // 4. Samanburðarsíða
  let cmp = '<section class="lkp-break"><h2>⚖️ Samanburður liðanna</h2>';
  const rowsU = teams.filter((t) => lokaOf[t.id]).map((t) => ({ id: t.id, name: t.name, loka: lokaOf[t.id] }));
  if (rowsU.length) {
    const bestOf = {};
    for (const c of UPP_SPECS) { const vals = rowsU.map((r) => r.loka[c.key]).filter((v) => v != null); bestOf[c.key] = vals.length ? (c.best === 'max' ? Math.max(...vals) : Math.min(...vals)) : null; }
    cmp += '<h3>🏦 Uppsafnað 2000–2032 (lokastöður, 2000=100 — besta gildi hverrar súlu feitletrað grænt)</h3><table class="lkp-tbl"><tr><th>Lið</th>' + UPP_SPECS.map((c) => '<th>' + esc(c.short) + '</th>').join('') + '</tr>'
      + rowsU.map((r) => '<tr><td><span class="lk-swatch" style="background:' + colorOf(r.id) + '"></span>' + esc(r.name) + '</td>' + UPP_SPECS.map((c) => { const v = r.loka[c.key]; const best = v != null && bestOf[c.key] != null && v === bestOf[c.key]; return '<td' + (best ? ' class="lkp-best"' : '') + '>' + (v == null ? '–' : num(v, c.key === 'losun' ? 0 : 1)) + '</td>'; }).join('') + '</tr>').join('') + '</table>';
  }
  if (an.scorecard && an.scorecard.length) {
    const kpiCols = an.scorecard[0].perKpi.map((p) => p.label);
    cmp += '<h3>🎯 Markmiða-skorkort (stig 0–100 í lokaumferð)</h3><table class="lkp-tbl"><tr><th>Lið</th>' + kpiCols.map((l) => '<th>' + esc(l) + '</th>').join('') + '<th>Uppsafnað</th><th>🗳️ Fylgi</th></tr>'
      + an.scorecard.map((row) => '<tr><td>' + esc(row.name) + '</td>' + row.perKpi.map((p) => '<td>' + (p.score == null ? '–' : p.score) + '</td>').join('') + '<td><b>' + num(row.cumulative) + '</b></td><td>' + (row.avgApproval != null ? row.avgApproval + '%' : '–') + '</td></tr>').join('') + '</table>';
  }
  if (an.trajectories && an.trajectories.cumulative && an.trajectories.cumulative.some((s) => s.points && s.points.length)) {
    cmp += '<div class="lkp-chart">' + lkLineChart('Uppsafnað stig — öll lið', an.trajectories.cumulative, { light: true, colorOf }) + '</div>';
  }
  const polSeries = pf.map((t) => ({ teamId: t.teamId, points: (t.ferill || []).map((f) => ({ round: f.round, value: f.stig })) }));
  if (polSeries.some((s) => s.points.length)) {
    cmp += '<h3>🧭 Pólitíska litrófið — allir ferlar saman</h3><div class="lkp-chart">' + lkLineChart('Vinstri (−100) ↔ Hægri (+100)', polSeries, { light: true, min: -100, max: 100, colorOf }) + '</div><p class="lkp-fine">ⓘ ' + esc(POL_INFO) + '</p>';
  }
  cmp += '<p class="lkp-fine">' + teams.map((t) => '<span class="lk-swatch" style="background:' + colorOf(t.id) + '"></span>' + esc(t.name)).join(' &nbsp; ') + '</p></section>';

  // 5. Umræðukaflinn: sjálfvirkar athuganir úr raun-mun liða + teachingPrompts
  let prompts = [];
  try { prompts = teachingPrompts(an, { scenarioEvents: SCENARIO.events.map((e) => ({ round: e.round, icon: e.icon, title: e.title })) }); } catch (e) {}
  const obs = lkPrintObservations(teams, lokaOf, polLast, an);
  let disc = '';
  if (prompts.length || obs.length) {
    disc = '<section class="lkp-break"><h2>💬 Umræðukaflinn</h2>'
      + (obs.length ? '<h3>Athuganir úr þessum leik</h3><ul class="lkp-list">' + obs.map((o) => '<li>' + o + '</li>').join('') + '</ul>' : '')
      + (prompts.length ? '<h3>Umræðu-spurningar</h3><ul class="lkp-list">' + prompts.map((p) => '<li>' + p + '</li>').join('') + '</ul>' : '')
      + '</section>';
  }

  // 6. Fótur
  const foot = '<footer class="lkp-foot">Búið til með RÁS-Leiknum · karp.is/leikur — Líkanið að baki er einfölduð kennslu-hermun; niðurstöðurnar eru umræðugrundvöllur, ekki hagspá né dómur um raunverulega hagstjórn.</footer>';
  return '<div class="lkp-doc">' + head + lb + teamsHtml + cmp + disc + foot + '</div>';
}

export function mountLeikur(root) {
  const S = { code: null, role: null, token: null, teamId: null, state: null, draft: {}, poll: null, busy: false, view: null, editDraft: null, editRoles: false, editStudio: true, studioTab: 0, dials: null, unlocked: false, stTimer: null, stRound: null, dragging: null, localTouched: new Set(), studioBuiltSig: null, pushTimer: null, timerDeadline: null, timerInt: null, user: null, openDetails: new Set(), hbRound: null, kortPrev: {}, polPrevStig: null, tickerSig: null, ktdSig: null, ktdPrev: null, sagaSeeded: false };
  let model = {}; try { model = JSON.parse(document.getElementById('leikur-model')?.textContent || '{}'); } catch (e) {}

  // Endurheimt úr URL + localStorage (endurtenging)
  const u = new URL(location.href);
  const code = (u.searchParams.get('g') || '').toUpperCase();
  const invToken = u.searchParams.get('t');
  if (code) {
    const wantWatch = u.searchParams.get('watch') === '1';
    if (wantWatch) {
      // Áhorfenda-/skjávarpa-hlekkur → ALLTAF útsendingar-sýn, óháð geymdum liðs-/leikstjóra-táknum í vafranum.
      S.code = code; S.role = 'watch';
    } else if (invToken) {
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

  // Samanbrjótanleg <details data-keep="ID"> halda opnu/lokuðu stöðu yfir endur-teikningar (poll rebygg-ir innerHTML).
  // toggle bólar EKKI → nota capture-fasa á root. Stjórnar handbók + ákvarðanaferil o.fl.
  root.addEventListener('toggle', (e) => {
    const d = e.target; if (!d || d.tagName !== 'DETAILS' || !d.dataset || !d.dataset.keep) return;
    if (d.open) S.openDetails.add(d.dataset.keep); else S.openDetails.delete(d.dataset.keep);
  }, true);
  // Boðs-hlekkur: afrita hlekk sem félagar opna til að ganga í SAMA lið (deilt lið-tákn). Event-delegation → lifir af endur-teikningar.
  root.addEventListener('click', (e) => {
    const inv = e.target && e.target.closest && e.target.closest('#lk-invite'); if (!inv || !S.code || !S.token) return;
    const link = location.origin + '/leikur/?g=' + S.code + '&t=' + encodeURIComponent(S.token) + (S.teamId != null ? '&tid=' + S.teamId : '');
    try { navigator.clipboard.writeText(link); inv.textContent = '✅ Hlekkur afritaður!'; setTimeout(() => { inv.textContent = '🔗 Bjóða í lið'; }, 2000); } catch (err) { inv.textContent = link; }
  });
  // VERK 2: PM-blokkin er inni í root → smellur á hana flettir skilaboðum. Event-delegation á root
  // (lifir allar innerHTML-endurteiknanir af) — engir inline handlers.
  root.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#lk-pmh')) pmNext();
  });
  function startPoll() { stopPoll(); refresh(); S.poll = setInterval(refresh, 2500); S.timerInt = setInterval(tickTimer, 1000); }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } if (S.timerInt) { clearInterval(S.timerInt); S.timerInt = null; } }
  // #3 Umferðar-klukka (bara sjónræn): tikkar staðbundið úr S.timerDeadline; við 0 → „útrunninn" (engin auto-læsing).
  const fmtTimer = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  function timerBadge(st) { if (S.timerDeadline == null && st.secondsLeft == null) return ''; const rem = S.timerDeadline != null ? Math.max(0, Math.round((S.timerDeadline - Date.now()) / 1000)) : Math.max(0, st.secondsLeft); return '<span class="lk-timer" id="lk-timer">⏱️ ' + fmtTimer(rem) + '</span>'; }
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
    // Klukka: festa á ALGILD tímamörk (epoch) → stöðug milli poll-a og reload-a (engin endur-ræsing). Fallback á secondsLeft f. eldri þjón.
    S.timerDeadline = (json.phase === 'decide' && json.deadlineTs) ? json.deadlineTs * 1000 : ((json.phase === 'decide' && json.secondsLeft != null) ? Date.now() + json.secondsLeft * 1000 : null);
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
  // F1-V3: stefnu-badge-röð undir kjörtímabils-hausnum — flís per STAÐFESTA stóra ákvörðun (st.policyBadges).
  // Tooltip er HREINT CSS (:hover/:focus-within, flís tabindex=0) — poll endurteiknar innerHTML svo ekkert JS-ástand má bera það.
  function policyBadgesRow(st) {
    const bs = st.policyBadges; if (!bs || !bs.length) return '';
    // VERK 5: tooltip-inn endurtók arfleifðar-TEXTANN + delta-flísarnar orðrétt úr 📋-spjaldinu fyrir
    // neðan liðs-borðann (sama uppspretta: carryover.policies) → arfleifðar-meldingar birtust BÆÐI fyrir
    // ofan og neðan „Þitt lið". Nú: flísarnar hér eru STUTTAR (heiti+val+staða) og tooltip-inn aðeins
    // samhengi + vísun; textarnir og deltas búa á EINUM stað — arfleifðar-spjaldinu (carryoverCard).
    const stageTxt = (b) => b.stage === 'umsokn' ? 'umsókn í ferli' : b.stage === 'adild' ? 'aðild' : b.stage === 'ursogn' ? 'úrsögn í ferli' : 'frá KT' + (b.sinceRound != null ? b.sinceRound : '?');
    return '<div class="lk-pb-row">' + bs.map((b) => {
      const name = esc(b.label) + (b.choice ? ': ' + esc(b.choice) : '');   // choice-ákvarðanir sýna valið („Icesave: Greiða")
      const tip = '<span class="lk-pb-tip"><b>' + (b.icon || '🏛️') + ' ' + name + '</b>' +
        '<span style="display:block;margin-top:4px;color:var(--muted)">Standandi stór ákvörðun (' + esc(stageTxt(b)) + '). ' +
        (deltaChips(b.deltas) ? 'Áhrifin í síðustu lotu og textinn eru' : 'Textinn er') + ' á 📋 arfleifðar-spjaldinu hér fyrir neðan.</span></span>';
      return '<span class="lk-pb' + (b.id === 'esb' ? ' lk-pb-esb' : '') + '" tabindex="0">' + (b.icon || '🏛️') + ' <b>' + name + '</b> <span class="lk-pb-stage">' + esc(stageTxt(b)) + '</span>' + tip + '</span>';
    }).join('') + '</div>';
  }
  // Arfleifð: hvernig standandi stórar ákvarðanir + óvænt atvik síðustu lotu lita ÞESSA lotu (byrjun lotu).
  function carryoverCard(st) {
    const c = st.carryover; if (!c) return '';
    const rows = [];
    if (c.event && c.event.text) rows.push('<div style="margin:3px 0">' + (c.event.icon || '🎲') + ' <b>' + esc(c.event.title) + '</b>' + (c.event.choice ? ' <span class="lk-muted">(þið völduð: ' + esc(c.event.choice) + ')</span>' : '') + ' — ' + esc(c.event.text) + '</div>');
    for (const p of (c.policies || [])) { const ch = deltaChips(p.deltas); rows.push('<div style="margin:3px 0">' + (p.icon || '🏛️') + ' <b>' + esc(p.label) + '</b> — ' + esc(p.text) + (ch ? '<div style="margin-top:3px">' + ch + '</div>' : '') + '</div>'); }
    if (!rows.length) return '';
    return '<div style="background:#20242e;border:1px solid #3a4152;border-left:4px solid #8ca0c8;border-radius:10px;padding:11px 14px;margin:10px 0">' +
      '<div style="font-size:13.5px;font-weight:700;margin-bottom:5px">📋 Arfleifð síðasta kjörtímabils — hvað mótar þessa lotu</div>' +
      '<div style="font-size:12.8px;line-height:1.55">' + rows.join('') + '</div></div>';
  }
  // Fasi „skemmtun 3": óvænt atvik + klemmu-spjald. Fréttaborði efst; ef klemma → viðbragðs-val (part af ákvörðun).
  function surpriseCard(st) {
    const s = st.surprise; if (!s) return '';
    const dil = s.dilemma;
    // F1-V3: klemmu-kostir bera áhrifa-flísar (o.effect, þ.m.t. 'pop'=fylgi) — valið verður upplýstara.
    const opts = dil ? (dil.options || []).map((o) => { const fx = deltaChips(o.effect); return '<span class="lk-opt' + (S.dilemmaDraft === o.key ? ' sel' : '') + '" data-dil="' + o.key + '" role="button" tabindex="0">' + esc(o.label) + (fx ? '<span class="lk-opt-fx">' + fx + '</span>' : '') + '</span>'; }).join(' ') : '';
    const fx0 = deltaChips(s.effect);
    return '<div style="background:linear-gradient(90deg,#3a1f1f,#2a2320);border:1px solid #e78284;border-left:4px solid #e78284;border-radius:10px;padding:12px 14px;margin:10px 0">' +
      '<div style="font-size:15px;font-weight:700;color:#f5b0b0">📰 ' + (s.icon || '🎲') + ' Óvænt atvik: ' + esc(s.title) + '</div>' +
      '<p style="margin:6px 0 0;font-size:13.5px;line-height:1.55">' + esc(s.text) + '</p>' +
      (fx0 ? '<div style="margin-top:6px;font-size:12.5px"><span class="lk-muted">Bein áhrif:</span> ' + fx0 + '</div>' : '') +
      (dil ? '<div style="margin-top:10px"><span style="font-weight:600;font-size:13px">' + esc(dil.q) + '</span><div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">' + opts + '</div>' +
        (S.dilemmaDraft == null ? '<p class="lk-muted" style="font-size:11.5px;margin:6px 0 0">Veljið viðbragð — það hefur áhrif á hagkerfið og fylgi ríkisstjórnarinnar.</p>' : '') + '</div>' : '') +
      '</div>';
  }
  // ── F2-V2: atviks-popup með mynd ──────────────────────────────────────────
  // Modal-hýsillinn er SYSTKINI #leikur-root (inni í main[data-pg=leikur] svo leik-CSS nái til hans).
  // render()/poll skrifar AÐEINS root.innerHTML og snertir hýsilinn því aldrei — popup lifir öll poll af.
  // Einu sinni per (kóði, lota) per vafra: seen-lykill settur við FYRSTU birtingu (ekki lokun) svo
  // poll-endurteiknun endurveki hann aldrei; localStorage-brestur → in-memory fallback (sama session).
  let sepopHost = null;
  const sepopSeenMem = new Set();
  const sepopKey = (round, watch) => 'lk-sepop-' + S.code + '-' + round + (watch ? '-watch' : '');
  const sepopSeen = (k) => { try { if (localStorage.getItem(k)) return true; } catch (e) {} return sepopSeenMem.has(k); };
  // GALLI D: hreinsa lk-sepop-* lykla ANNARRA leikja um leið og þessi leikur markar sinn fyrsta —
  // annars safnast lyklarnir endalaust milli leikja. Afturábak-ítrun (removeItem hliðrar vísitölum).
  const sepopMark = (k) => {
    sepopSeenMem.add(k);
    try {
      localStorage.setItem(k, '1');
      const keep = 'lk-sepop-' + S.code + '-';
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.indexOf('lk-sepop-') === 0 && key.indexOf(keep) !== 0) localStorage.removeItem(key);
      }
    } catch (e) {}
  };
  function sepopClose() {
    if (S.sepopTimer) { clearTimeout(S.sepopTimer); S.sepopTimer = null; }
    if (sepopHost && sepopHost.firstChild) sepopHost.innerHTML = '';
  }
  function sepopEnsureHost() {
    if (sepopHost) return sepopHost;
    sepopHost = document.createElement('div');
    (root.parentNode || document.body).appendChild(sepopHost);
    // Event-delegation Á HÝSLINUM: attachStudio bindur data-dil aðeins innan root, svo modalið þarf
    // eigin delegation. Val hér fer NÁKVÆMLEGA sömu leið og inline-spjaldið: S.dilemmaDraft + pushDraft
    // (POST /decisions locked:false) + renderStudio → inline surpriseCard sýnir valið áfram.
    sepopHost.addEventListener('click', (e) => {
      const t = e.target;
      const dil = t.closest && t.closest('[data-dil]');
      if (dil && sepopHost.contains(dil)) {
        // GALLI B: liðið er LÆST (og ekki í „Breyta ákvörðun"-flæði, S.unlocked=false) → smellur má
        // EKKI pushDraft-a (locked:false myndi aflæsa liðið þegjandi og klobba læst drög). Bara loka.
        if (S.state && S.state.you && S.state.you.locked && !S.unlocked) { sepopClose(); return; }
        S.dilemmaDraft = dil.dataset.dil;
        if (S.state) pushDraft(S.state);
        sepopClose();   // sjálfkrafa lokun við val á klemmu-kosti
        if (S.state && S.state.mode === 'studio' && S.role === 'team') renderStudio(S.state); else render();
        return;
      }
      if (t.closest && t.closest('.lk-sepop-x')) { sepopClose(); return; }
      if (t.classList && t.classList.contains('lk-sepop-overlay')) sepopClose();   // klikk á slæðuna sjálfa
    });
    return sepopHost;
  }
  // withDil: klemmu-hnappar AÐEINS í studio (inline surpriseCard + dilemma-POST-leiðin er studio-flæði).
  function sepopOpen(s, { watch = false, withDil = false } = {}) {
    if (S.sepopTimer) { clearTimeout(S.sepopTimer); S.sepopTimer = null; }   // GALLI C: munaðarlaus 8s-timer fyrri watch-lotu má ekki loka nýja popup-inu
    const mynd = myndFyrirAtvik(s.id);   // traust innbyggt SVG-safn → fer ÓESCAPAÐ inn; null → ekkert mynd-svæði
    const fx0 = deltaChips(s.effect);
    const dil = withDil && !watch ? s.dilemma : null;
    // GALLI I: liðsfélagi gæti ÞEGAR hafa valið (server-samstillt st.dilemmaDraft; nýtt tæki hefur ekkert
    // localStorage/S.dilemmaDraft) → merkja valinn kost 'sel' + lína svo smellur yfirskrifi ekki þegjandi.
    // S.dilemmaDraft er aðeins marktækt ef það tilheyrir ÞESSARI lotu (renderStudio samstillir eftir á).
    const st0 = S.state || {};
    const srvDil = st0.dilemmaDraft != null ? st0.dilemmaDraft : null;
    const localDil = (S.dilRound === st0.round && S.dilemmaDraft != null) ? S.dilemmaDraft : null;
    const selDil = localDil != null ? localDil : srvDil;
    const mateChose = dil && srvDil != null && localDil == null;
    const opts = dil ? (dil.options || []).map((o) => {
      const fx = deltaChips(o.effect);
      return '<button type="button" class="lk-sepop-opt' + (selDil === o.key ? ' sel' : '') + '" data-dil="' + esc(o.key) + '">' + esc(o.label) + (fx ? '<span class="lk-opt-fx">' + fx + '</span>' : '') + '</button>';
    }).join('') : '';
    sepopEnsureHost().innerHTML =
      '<div class="lk-sepop-overlay"><div class="lk-sepop-card' + (watch ? ' lk-sepop-watch' : '') + '" role="dialog" aria-modal="true" aria-label="Óvænt atvik">' +
      '<button type="button" class="lk-sepop-x" aria-label="Loka">×</button>' +
      (mynd ? '<div class="lk-sepop-img">' + mynd + '</div>' : '') +
      '<div class="lk-sepop-body">' +
      '<div class="lk-sepop-title">📰 ' + (s.icon || '🎲') + ' Óvænt atvik: ' + esc(s.title) + '</div>' +
      '<p class="lk-sepop-text">' + esc(s.text) + '</p>' +
      (fx0 ? '<div class="lk-sepop-fx"><span class="lk-muted">Bein áhrif:</span> ' + fx0 + '</div>' : '') +
      (dil ? '<div class="lk-sepop-q">' + esc(dil.q) + '</div>' + (mateChose ? '<p class="lk-muted" style="font-size:12px;margin:2px 0 6px">👥 Liðsfélagi hefur þegar valið — smellur breytir vali liðsins.</p>' : '') + opts : '') +
      '</div></div></div>';
  }
  // Liðs-popup: aðeins í decide-fasa (kallað úr renderTeam á undan studio/classic-greinum). Klukkan tikkar
  // áfram á bak við; hindrar aldrei læsingu — lokanlegt (×/ESC/slæða) og birtist bara einu sinni per lotu.
  function maybeSepop(st) {
    const s = st.surprise; if (!s || st.phase !== 'decide') return;
    const k = sepopKey(st.round, false); if (sepopSeen(k)) return;
    sepopMark(k);   // við FYRSTU birtingu — poll-endurteiknun endurvekur aldrei
    sepopOpen(s, { withDil: st.mode === 'studio' });
  }
  // Watch-sýn (skjávarpi): sama spjald ÁN klemmu-hnappa (áhorfendur velja ekki), stærri mynd,
  // sjálf-lokun eftir 8 sek með fade-út. Sami seen-lykill með -watch viðskeyti.
  function maybeSepopWatch(st) {
    const s = st.surprise; if (!s || st.phase !== 'decide') return;
    const k = sepopKey(st.round, true); if (sepopSeen(k)) return;
    sepopMark(k);
    sepopOpen(s, { watch: true });
    S.sepopTimer = setTimeout(() => {
      const ov = sepopHost && sepopHost.querySelector('.lk-sepop-overlay');
      if (ov) { ov.classList.add('out'); setTimeout(sepopClose, 450); } else sepopClose();
    }, 8000);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sepopClose(); });

  // ── VERK 2: Forsætisráðherrann í kjörtímabils-hausnum ─────────────────────
  // Fasta hornið (lk-pm-card fixed + fab-collapse) er FARIÐ — blokkin býr nú INNI í root-innerHTML:
  // hægra megin í .lk-term-head (studio) / .lk-pmh-solo (classic), FYRIR OFAN liðs-borðann.
  // Portrett + NAFNSKILTI: „Forsætisráðherra: <radherraTexti(lotu)>" — nafnið er SÖGU-STAÐREYND
  // (saga.mjs), blaðran er áfram rödd ráðgjafans (ALDREI orð lögð í munn nafngreindri manneskju,
  // engar gæsalappir við nafnið). Persóna valin eftir kyni radandi (kona → PM_MYNDIR_KONA, annars
  // PM_MYNDIR; kyn null = L8 → karl-settið sem hlutlaus framtíðar-fígúra).
  // Af því blokkin er inni í root: pmUpdate skrifar innihaldið POST-RENDER og AÐEINS þegar
  // undirskriftin (pósi|kyn|vísitala|lota|skilaboð) breytist — wrap.dataset.sig greinir ferskt DOM
  // eftir poll-innerHTML (þá er endur-skrifað; þegar-vélrituð skilaboð birtast strax um S.pmTypedSet).
  const pmReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  // Statískt skjal-grind blokkinnar (innihald fyllt í pmUpdate) — föst id svo post-render uppfærsla
  // skipti aðeins innihaldi, ekki elementum (typewriter-mynstur lifir).
  const pmHeadHtml = () => '<div class="lk-pmh" id="lk-pmh" role="complementary" aria-label="Forsætisráðherrann">'
    + '<div class="lk-pmh-bubble"><span class="lk-pmh-text" id="lk-pmh-text"></span><span class="lk-pmh-count" id="lk-pmh-count"></span></div>'
    + '<div class="lk-pmh-right"><div class="lk-pmh-avatar" id="lk-pmh-avatar"></div><div class="lk-pmh-nafn" id="lk-pmh-nafn"></div></div></div>';
  function pmNext() {
    const n = (S.pmMsgs || []).length; if (n < 2) return;
    S.pmIdx = ((S.pmIdx || 0) + 1) % n; S.pmSig = null;
    if (S.state) pmUpdate(S.state);
  }
  // Pósi: stjórnarkreppa → kreppa; annars fylgi — studio: lifandi úr forskoðun (drawStudioPreview
  // geymir S.pmApproval), classic: popularity() á KPI síðasta uppgjörs; ekkert til → hlutlaus.
  function pmPose(st) {
    if (st.stjornarkreppa) return 'kreppa';
    let ap = null;
    if (S.pmApprovalRound === st.round && S.pmApproval != null) ap = S.pmApproval;
    else if (S.debriefPrevRound === st.round - 1 && S.debriefPrevKpis) ap = popularity(S.debriefPrevKpis);
    if (ap == null) return 'hlutlaus';
    return ap > 55 ? 'bjartsynn' : ap < 35 ? 'ahyggjufullur' : 'hlutlaus';
  }
  // Skilaboð per lotu: a) VERK 3: „⚠ Hvað þarf að huga að" (ev.watch) FYRST — línan úr lk-term-head
  // varð fyrsta skilaboð ráðherrans; b) sterkasta arfleifðar-áhrifið (stærsta |delta|, EIN setning —
  // spjaldið sjálft er carryoverCard); c) atviks-áminning; d) 1–2 ráðgjafa-línur.
  // e) handbók er VILJANDI sleppt: hún er leikstjóra-efni („Aðeins sýnilegt þér"; „Besta leiðin" spillir leiknum).
  function pmMessages(st) {
    const msgs = [];
    if (st.event && st.event.watch) msgs.push('⚠ Hvað þarf að huga að: ' + st.event.watch);   // VERK 3
    let top = null;
    for (const p of ((st.carryover && st.carryover.policies) || [])) {
      for (const k in (p.deltas || {})) {
        if (deltaSkip(k)) continue;   // GALLI G: sama sía og deltaChips — PM vélritar aldrei „gengi_endo"
        const v = +p.deltas[k];
        if (isFinite(v) && Math.abs(v) >= 0.005 && (!top || Math.abs(v) > Math.abs(top.v))) top = { label: p.label, k, v };
      }
    }
    if (top) msgs.push((top.label || '') + ': ' + deltaLabel(top.k) + ' ' + deltaFmt(top.v) + ' í síðustu lotu.');
    if (st.surprise) msgs.push((st.surprise.icon || '🎲') + ' ' + (st.surprise.title || 'Óvænt atvik') + ' — skoðið áhrifin áður en þið læsið.');
    const kpis = (S.pmKpisRound === st.round && S.pmKpis) || (S.debriefPrevRound === st.round - 1 && S.debriefPrevKpis) || {};
    for (const a of advisors(kpis, st.round).slice(0, 2)) msgs.push(a.icon + ' ' + a.who + ': ' + a.advice);
    return msgs.slice(0, 5);   // watch-línan bættist framan við — 5 svo ráðgjafarnir kremjist ekki út
  }
  function pmUpdate(st) {
    const wrap = root.querySelector('#lk-pmh');
    if (!st || S.role !== 'team' || st.phase !== 'decide' || !wrap) {
      if (S.pmTimer) { clearInterval(S.pmTimer); S.pmTimer = null; }
      S.pmSig = null; return;   // blokkin býr í root — utan decide er hún einfaldlega ekki til
    }
    if (S.pmRound !== st.round) { S.pmRound = st.round; S.pmIdx = 0; S.pmTypedSet = new Set(); S.pmSig = null; }
    const msgs = pmMessages(st); S.pmMsgs = msgs;
    S.pmIdx = (S.pmIdx || 0) >= msgs.length ? 0 : (S.pmIdx || 0);
    const radh = radherraFyrirLotu(st.round);
    const kona = !!(radh && radh.radandi && radh.radandi.kyn === 'kona');   // kyn null (L8) → karl-settið
    const pose = pmPose(st), msg = msgs[S.pmIdx] || '';
    const sig = pose + '|' + (kona ? 'k' : 'm') + '|' + S.pmIdx + '|' + st.round + '|' + msgs.join('¦');
    // Óbreytt undirskrift OG dataset.sig til staðar = DOM-ið er ÓSNERT frá síðustu skrifun →
    // EKKI klobba typewriter-inn. Poll-innerHTML endurbyggir wrap ÁN dataset.sig → skrifum aftur
    // (þegar-vélrituð skilaboð birtast þá strax um S.pmTypedSet — textinn hoppar aldrei).
    if (sig === S.pmSig && wrap.dataset.sig === sig) return;
    S.pmSig = sig; wrap.dataset.sig = sig;
    if (S.pmTimer) { clearInterval(S.pmTimer); S.pmTimer = null; }
    const SETT = kona ? PM_MYNDIR_KONA : PM_MYNDIR;
    const svgP = SETT[pose] || SETT.hlutlaus;   // traust innbyggt SVG-safn → fer ÓESCAPAÐ inn (sama regla og sepop-myndir)
    const av = wrap.querySelector('#lk-pmh-avatar');
    if (av) { av.innerHTML = svgP; av.style.setProperty('--pm-bd', '-' + (Math.random() * 4.9).toFixed(2) + 's'); }   // slembinn blikk-fasi
    // Nafnskiltið: sögu-staðreynd í gulli (L8 sýnir „Framtíðin — óskrifað" beint úr radherraTexti).
    const nafn = wrap.querySelector('#lk-pmh-nafn');
    if (nafn) nafn.innerHTML = 'Forsætisráðherra: <b>' + esc(radherraTexti(st.round) || '') + '</b>';
    const cnt = wrap.querySelector('#lk-pmh-count');
    if (cnt) cnt.textContent = msgs.length > 1 ? (S.pmIdx + 1) + '/' + msgs.length + ' · smelltu til að fletta' : '';
    const el = wrap.querySelector('#lk-pmh-text'); if (!el) return;
    if (!S.pmTypedSet) S.pmTypedSet = new Set();
    const msgKey = S.pmIdx + '·' + msg;
    const instant = pmReduced() || S.pmTypedSet.has(msgKey);   // reduced-motion → engin vélritun (texti birtist strax)
    if (instant) { el.textContent = msg; S.pmTypedSet.add(msgKey); return; }
    el.textContent = '';
    const chars = Array.from(msg);   // code-points, ekki UTF-16 einingar — klýfur aldrei emoji í tvennt
    let i = 0;
    S.pmTimer = setInterval(() => {   // textContent → engin HTML-túlkun meðan vélritað er
      if (!el.isConnected) { clearInterval(S.pmTimer); S.pmTimer = null; return; }
      i += 2; el.textContent = chars.slice(0, i).join('');
      if (i >= chars.length) { clearInterval(S.pmTimer); S.pmTimer = null; S.pmTypedSet.add(msgKey); }
    }, 24);
  }

  // ── VERK 3: Prent-sýn kennsluskýrslunnar (leikslok, leikstjóri) ───────────
  // Hýsillinn #lk-print-root er SYSTKINI #leikur-root (sama mynstur og sepop/pm) svo
  // poll-innerHTML klobbar hann aldrei. body.lk-print togglar: á skjá kemur ljós forskoðun
  // í stað leiksins (Prenta/Loka efst, .lkp-noprint); @media print (index.astro) felur allt
  // nema #lk-print-root. Engir inline handlers — delegation eins og sepop/pm.
  let printHost = null;
  function printEnsureHost() {
    if (printHost) return printHost;
    printHost = document.createElement('div');
    printHost.id = 'lk-print-root';
    (root.parentNode || document.body).appendChild(printHost);
    printHost.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest && t.closest('#lkp-print')) { try { window.print(); } catch (err) {} return; }
      if (t.closest && t.closest('#lkp-close')) printClose();
    });
    return printHost;
  }
  function printClose() {
    document.body.classList.remove('lk-print');
    if (printHost && printHost.firstChild) printHost.innerHTML = '';
  }
  function printOpen(st) {
    let body = '';
    try { body = lkPrintReport(st); } catch (err) { console.error('lkPrintReport villa', err); body = '<div class="lkp-doc"><p>Ekki tókst að byggja skýrsluna.</p></div>'; }
    printEnsureHost().innerHTML =
      '<div class="lkp-bar lkp-noprint"><button type="button" class="lk-btn" id="lkp-print">🖨️ Prenta / vista PDF</button><button type="button" class="lk-btn" id="lkp-close" style="background:#3a4152;color:#e8ecf3">✕ Loka forskoðun</button></div>' + body;
    document.body.classList.add('lk-print');
    try { window.scrollTo(0, 0); } catch (e) {}
    // Beint í prent-gluggann; forskoðunin stendur EFTIR prentun (onafterprint lokar viljandi ekki —
    // „Hætta við“ í prent-glugganum má ekki henda kennaranum út úr forskoðuninni; Loka/ESC lokar).
    setTimeout(() => { try { window.print(); } catch (e) {} }, 150);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') printClose(); });

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
    if (!S.code) { pmUpdate(null); tickerHide(); if (S.view === 'editor') return renderEditor(); return renderLanding(); }
    const st = S.state; if (!st) { root.innerHTML = '<p>Hleð…</p>'; return; }
    if (st.phase !== 'decide') sepopClose();   // F2-V2: ekkert modal í control/results/ended-fasa — má aldrei hindra uppgjör
    if (st.you && st.you.locked && !S.unlocked) sepopClose();   // GALLI B: liðsfélagi læsti → modalið má ekki lifa læsinguna af (klemmu-smellur í því myndi aflæsa)
    pmUpdate(st);   // VERK 2: teardown utan decide (blokkin býr í root); í decide er þetta no-op í kyrrstöðu og view-renderinn kallar aftur post-render
    if (S.role !== 'watch') tickerHide();   // VERK 2: RÁS-TÍÐINDI-ræman er aðeins á áhorfenda-sýninni
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

  // 📖 Kennsluhandbók leikstjóra: ýtarleg leiðsögn per kjörtímabil (aðeins fac). Núverandi lota opin+auðkennd.
  function handbookCard(st) {
    const cur = st.round || 0;
    if (S.hbRound !== cur) { S.hbRound = cur; if (cur) S.openDetails.add('hb-' + cur); } // opna núverandi lotu sjálfkrafa við skipti
    const evOf = (r) => SCENARIO.events.find((e) => e.round === r) || {};
    const entry = (h) => {
      const e = evOf(h.round), isCur = h.round === cur, isOpen = S.openDetails.has('hb-' + h.round);
      return '<details data-keep="hb-' + h.round + '"' + (isOpen ? ' open' : '') + ' style="margin:5px 0;border:1px solid ' + (isCur ? '#f6b13b' : '#2a3040') + ';border-radius:8px;padding:8px 12px' + (isCur ? ';background:rgba(246,177,59,.06)' : '') + '">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:13.5px">' + (e.icon ? e.icon + ' ' : '') + 'KT' + h.round + ' · ' + (e.year || '') + ' — ' + esc(e.title || '') + (isCur ? ' <span style="color:#f6b13b">◀ núna</span>' : '') + '</summary>'
        + '<div style="font-size:12.8px;line-height:1.55;margin-top:6px">'
        + '<p style="margin:2px 0"><b>Staðan:</b> ' + esc(h.situation) + '</p>'
        + '<p style="margin:4px 0"><b>⚠ Varastu:</b> ' + esc(h.varast) + '</p>'
        + '<p style="margin:4px 0"><b>✅ Besta leiðin:</b> ' + esc(h.strategy) + '</p>'
        + '<div style="margin:4px 0"><b>🎚️ Ráðlagðar stillingar:</b><ul style="margin:3px 0 0;padding-left:18px">' + h.settings.map((s) => '<li style="margin:2px 0">' + esc(s) + '</li>').join('') + '</ul></div>'
        + '</div></details>';
    };
    return card('📖 Kennsluhandbók leikstjóra', '<p class="lk-muted" style="font-size:12px;margin:0 0 6px">Leiðsögn fyrir hvert kjörtímabil — hvað ber að varast og hvaða stillingar henta best (grunduð í herminum + hagsögunni). Aðeins sýnilegt þér. Á Erfitt eru böndin þrengri og áföllin harðari — minna svigrúm fyrir mistök.</p>' + HANDBOOK.map(entry).join(''));
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
    else if (st.phase === 'ended') controls = '<p><b>🏁 Leik lokið.</b></p><button class="lk-btn" id="lk-print">🖨️ Prenta skýrslu</button> <button class="lk-btn" id="lk-newgame">🔄 Nýr leikur</button><p class="lk-muted" style="font-size:12px;margin:8px 0 0">Skýrslan er prentvæn kennslu-samantekt leiksins — stigatafla, liðin eitt af öðru, samanburður og umræðukafli (vista má sem PDF í prent-glugganum).</p>';
    const teamList = st.teams.map((t) => '<div class="lk-lb-row"><span>' + esc(t.name) + '</span><span>' + num(t.cumulative || 0) + ' stig</span></div>').join('') || '<p>Bíð eftir liðum…</p>';
    root.innerHTML =
      '<div class="lk-card"><h1>Leikstjóri</h1><p>Kóði til að deila (nemendur slá hann inn):</p><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div style="font-size:38px;font-weight:800;letter-spacing:6px;color:#f6b13b">' + esc(st.code) + '</div><button class="lk-btn" id="lk-copycode" style="background:#f6b13b;color:#0e1116;font-weight:700">📋 Afrita kóða</button></div><button class="lk-btn" id="lk-watchlink" style="margin-top:10px;background:#5ac8e0">📺 Afrita áhorfenda-hlekk (skjávarpi)</button></div>' +
      (st.event ? card('📋 Umferð ' + st.round + ': ' + st.event.title, '<p>' + esc(st.event.text) + '</p>') : '') +
      handbookCard(st) +
      '<div class="lk-card"><h2>Lið</h2>' + teamList + '</div>' +
      roleMapCard(st) +
      '<div class="lk-card">' + controls + '</div>' +
      leaderboard(st) +
      (st.analytics ? card('📈 Greining (leikstjóri)', (() => { try { return renderFacAnalytics(st.analytics, st, S.openDetails); } catch (err) { console.error('renderFacAnalytics villa', err); return '<p class="lk-muted">Greining tókst ekki að teikna (stýringar að ofan virka eðlilega).</p>'; } })()) : '');
    const b = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = fn; };
    b('#lk-start', () => control('start')); b('#lk-resolve', () => control('resolve')); b('#lk-next', () => control('next'));
    b('#lk-stop', () => control('stop')); b('#lk-newgame', () => { location.href = '/leikur/'; });
    b('#lk-print', () => printOpen(st));   // VERK 3: prentanleg kennsluskýrsla (leikslok)
    b('#lk-copycode', () => { const el = root.querySelector('#lk-copycode'); try { navigator.clipboard.writeText(S.code); if (el) { el.textContent = '✅ Kóði afritaður'; setTimeout(() => { if (root.querySelector('#lk-copycode') === el) el.textContent = '📋 Afrita kóða'; }, 2000); } } catch (e) { if (el) el.textContent = S.code; } });
    b('#lk-watchlink', () => { const el = root.querySelector('#lk-watchlink'); const link = location.origin + '/leikur/?g=' + S.code + '&watch=1'; try { navigator.clipboard.writeText(link); if (el) el.textContent = '✅ Áhorfenda-hlekk afritaður'; } catch (e) { if (el) el.textContent = link; } });
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

  // VERK 1c: pólitíski ásinn í leikslok liðs-sýnar — lína per lið (mitt lið þykkast), lokastaða í legend.
  // Gögn = st.politikFerill (server reiknar með politikFerill úr ákvörðunum + geymdri policy-stöðu í ended-fasa).
  function politikFerillCard(st) {
    const pf = st.politikFerill; if (!pf || !pf.length) return '';
    const series = pf.map((t) => ({ teamId: t.teamId, points: (t.ferill || []).map((f) => ({ round: f.round, value: f.stig })) }));
    if (!series.some((s) => s.points.length)) return '';
    const colorOf = (id) => { const i = pf.findIndex((t) => t.teamId === id); return LK_PAL[((i % LK_PAL.length) + LK_PAL.length) % LK_PAL.length]; };
    const legend = pf.map((t) => {
      const last = (t.ferill || [])[(t.ferill || []).length - 1];
      return '<span class="lk-upp-leg' + (t.teamId === S.teamId ? ' me' : '') + '"><span class="lk-swatch" style="background:' + colorOf(t.teamId) + '"></span>' + esc(t.name) + (t.teamId === S.teamId ? ' (þið)' : '') + (last ? ' — <b style="color:' + polColor(last.flokkur) + '">' + esc(POL_STUTT[last.flokkur] || last.flokkur) + ' (' + polStig(last.stig) + ')</b>' : '') + '</span>';
    }).join('');
    return '<div class="lk-card"><h2 title="' + esc(POL_INFO) + '">🧭 Pólitíska litrófið 2000–2032</h2><div class="lk-upp-legend">' + legend + '</div>'
      + lkLineChart('Vinstri (−100) ↔ Hægri (+100)', series, { min: -100, max: 100, colorOf, widthOf: (id) => (id === S.teamId ? 3.4 : 1.3) })
      + '<p class="lk-muted lk-pol-info">ⓘ ' + esc(POL_INFO) + '</p></div>';
  }

  // ── F3-V3: Lifandi Íslandskortið (hönnunarskjal E) ────────────────────────
  // Þrep reiknuð client-megin með kortThrep úr SETTLUÐUM uppgjörs-gögnum og teiknuð með
  // renderIslandKort — traust prófuð eining, SVG-strengurinn fer ÓESCAPAÐUR inn (sama regla
  // og sepop-/PM-myndir). Gögn: results-sýn = mine.detail; watch/leikslok = st.kort (nýjasta
  // uppgjör per lið, opinbert eins og stigatafla); atviks-val = st.eventChoices (server-viðbót).
  const kortCompact = () => { try { return window.innerWidth < 700; } catch (e) { return false; } };   // farsími → compact + engin animation
  // Sleða-lög kortsins lesa SLEÐANA (menntun/kvoti/lodaframbod eru ekki engine-útkomur): nýjasta
  // gildi úr draft (læsta gildi lotunnar) eða sögunni, normað á -1..1 sem kort-throp túlkar sem
  // sleða-frávik (jákvætt frávik deilt með (max-base), neikvætt með (base-min)). Aðeins EIGIÐ lið.
  // Deild normalisering sleða á -1..1 — notuð bæði af kortLever (settluð gögn) og lifandi
  // decide-kortinu (S.dials, VERK 1). SAMA fallið fyrir ÖLL sleða-lög kortsins: menntun (kt-menntun)
  // + sleðarnir í KORT_SLEDAR hér fyrir neðan (togarar/kranar/kvíar/vindmyllur/ferðamenn).
  function leverNorm(id, v) {
    const cfg = BASELINE.levers[id]; if (!cfg || v == null || !isFinite(+v)) return null;
    const base = cfg.base || 0, dev = +v - base;
    const skali = dev >= 0 ? ((cfg.max - base) || 1) : ((base - cfg.min) || 1);
    return Math.max(-1, Math.min(1, dev / skali));
  }
  // Læst/settlað sleða-gildi EIGIN liðs, normað: draft (læsta gildi lotunnar) fyrst, annars
  // síðasta lota sögunnar sem hreyfði sleðann — sama uppspretta fyrir menntun og alla KORT_SLEDAR.
  function kortLever(st, id) {
    let v = null;
    if (st.draft && st.draft[id] != null) v = +st.draft[id];
    else { const hs = st.history || []; for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (h && h.levers && h.levers[id] != null) { v = +h.levers[id]; break; } } }
    return leverNorm(id, v);
  }
  // Sleðarnir sem kortThrep les úr inp.levers — EIN uppspretta (KORT_LEVER_ID í kort-throp.mjs,
  // prófið þar staðfestir hvert id gegn baseline.levers): kvoti (kt-togarar) · lodaframbod (kt-kranar)
  // · fiskeldi (kt-kviar) · orka + orkuskipti (kt-vindmyllur, orkuskipti=+1 bónus) · ferdamannagjald
  // (kt-ferdamenn). Lyklarnir í levers-hlutnum eru lever-id-in SJÁLF (ekki lags-nöfnin).
  const KORT_SLEDAR = [...new Set(Object.values(KORT_LEVER_ID))];
  // Normaður levers-hlutur fyrir kortThrep úr gildis-lesara (id → hrátt sleða-gildi eða null):
  // results/watch lesa um kortLever (draft/saga), decide um leverNorm(S.dials) — sama lykla-mengi.
  const kortLevers = (les) => { const o = {}; for (const id of KORT_SLEDAR) o[id] = les(id); return o; };
  function kortThrepUr(st, teamId, kpis, policies) {
    const kk = { ...(kpis || {}) };
    let levers;
    if (teamId === S.teamId) {
      const m = kortLever(st, 'menntun'); if (m != null) kk.menntun = m;
      // Sleða-lögin (results/leikslok): togarar/kranar/kvíar/vindmyllur/ferðamenn úr læstu gildi
      // lotunnar í draft/sögu — sama uppspretta og menntunar-lagið (kortLever). kortLever skilar
      // null ef sleðinn var aldrei hreyfður → kortThrep gefur grunnstöðu (1, ferðamenn 2).
      levers = kortLevers((id) => kortLever(st, id));
    }
    // ÖNNUR lið (watch/skjávarpi): engin lever-gögn annarra liða berast client → levers SLEPPT
    // (kortThrep gefur þá grunnstöðu á ÖLL sleða-lögin: togarar/kranar/kvíar/vindmyllur 1, ferðamenn 2)
    // — sama takmörkun og menntunar-lagið hefur þar. gamaskip er KPI-lag (hagvoxtur+gengi) og ferdamenn
    // les vlf_ferda: bæði fylgja kpis-undirmenginu sem server sendir í st.kort (án hagvoxtur/vlf_ferda →
    // grunnstaða 1 / 2 á skjávarpa; results les mine.detail.kpis = allar útkomur).
    // Atvik lotunnar (sama fyrir öll lið, sjá surprise.mjs): í resolved-fasa er st.surprise atvikið
    // sem var að leysast → eldgosið o.fl. sést á landinu í results (kortCardMitt) OG á skjávarpanum
    // (kortWatch). kortThrep validerar id-ið sjálft (óþekkt → null → ekkert atviks-lag).
    return kortThrep({ kpis: kk, policyStates: policies || {}, eventChoices: (st.eventChoices || {})[teamId] || {}, levers, atvik: (st.surprise && st.surprise.id) || null });
  }
  const kortDot = (n) => '●●●'.slice(0, n) + '○○○'.slice(0, 3 - n);
  // Einn liður skýringalínunnar: .lk-ks er nowrap (index.astro) svo tákn+heiti+punktar slitni aldrei
  // í sundur þegar línan brotnar (decide-hýsillinn er ~490px á 1440px, watch-ristin ~690px).
  const kortLidur = (takn, heiti, n, title) => '<span class="lk-ks"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + takn + ' ' + heiti + ' ' + kortDot(n) + '</span>';
  // Tvær raðir (<br>): LAND (byggð/menntun/fiskistofn/sókn/losun/uppbygging/ljós) og ATVINNUVEGIR
  // (eldi/orka/ferðamenn/útflutningur). Mælt á 1440px: ein röð með 11 liðum er ~1170px — kæmist fyrir
  // á results-spjaldinu (~1366px) en brotnar ÓFYRIRSJÁANLEGA í decide-hýslinum (~460px) og watch-
  // ristinni (~680px); raðaskiptingin gefur fast brot (land 1–2 línur, atvinnuvegir alltaf 1 lína).
  // Tákn VILJANDI ólík þeim sem fyrir eru: 🐠 eldi (ekki 🐟=stofninn), 📦 útflutningur (ekki 🚢=sókn).
  function kortSkyring(threp) {
    return '<p class="lk-kort-skyr" title="Þrep 0–3 laganna á kortinu — fleiri fylltir punktar = meira af laginu (losun: fleiri punktar = meiri mengun).">'
      + kortLidur('🏘️', 'Byggð', threp.byggd) + ' · ' + kortLidur('🎓', 'Menntun', threp.menntun) + ' · ' + kortLidur('🐟', 'Fiskistofn', threp.fiskur)
      + ' · ' + kortLidur('🚢', 'Sókn', threp.togarar, 'Togaraflotinn — fylgir kvóta-stefnunni; stofninn er sér vídd')
      + ' · ' + kortLidur('🏭', 'Losun', threp.losun)
      + ' · ' + kortLidur('🏗️', 'Uppbygging', threp.kranar, 'Byggingakranar — fylgja lóðaframboði')
      + ' · ' + kortLidur('💡', 'Ljós', threp.ljos, 'Næturljós landsins — glóa í góðæri, dofna í kreppu')
      + '<br>'
      + kortLidur('🐠', 'Eldi', threp.kviar, 'Sjókvíaeldi í fjörðunum — fylgir fiskeldis-sleðanum; villti stofninn er sér vídd')
      + ' · ' + kortLidur('💨', 'Orka', threp.vindmyllur, 'Vindmyllur á heiðunum — fylgja orku-sleðanum (+1 við orkuskipta-hvata)')
      + ' · ' + kortLidur('✈️', 'Ferðamenn', threp.ferdamenn, 'Ferðamannastraumur við náttúruperlurnar — fylgir ferðaþjónustu-vísitölunni (sprengja fyllir, faraldur tæmir); hærra gistináttagjald þynnir hann (grunnstaða 2)')
      + ' · ' + kortLidur('📦', 'Útflutningur', threp.gamaskip, 'Gámaskip í höfnunum — hagvöxtur + gengi (fullar hafnir í uppsveiflu, tómar í kreppu)')
      + '</p>';
  }
  // Þrep-animation: síðasta teiknaða threp geymt í S.kortPrev (per lið+lota). Klasarnir fara AÐEINS
  // á fyrstu teiknun NÝRRAR lotu (prev.round !== round) — poll-endurteiknanir innan sömu lotu fá þá
  // ekki (annars spilaðist poppið á 2,5s fresti). String-injection á class-attribút SVG-hópanna
  // (einkvæm per kort → replace snertir réttan hóp). Farsími/prefers-reduced-motion → engin animation.
  // Lögin sem fá kt-breytt glow við þrepbreytingu — deilt af kortMedAnim (results/watch) og
  // kortDecideDraw (lifandi). togarar/kranar og atvinnuvega-lögin fjögur (kviar/vindmyllur/
  // ferdamenn/gamaskip) eru VENJULEG lög og fá glowið eins og hin fjögur;
  // atvik og ljos eru VILJANDI EKKI hér (atviks-lagið hefur eigin CSS-lúppu, ljos býr í byggða-laginu).
  const KORT_ANIM_LOG = { byggd: 'kt-byggd', menntun: 'kt-menntun', fiskur: 'kt-fiskur', losun: 'kt-losun', togarar: 'kt-togarar', kranar: 'kt-kranar', kviar: 'kt-kviar', vindmyllur: 'kt-vindmyllur', ferdamenn: 'kt-ferdamenn', gamaskip: 'kt-gamaskip' };
  function kortMedAnim(svg, threp, teamId, round) {
    const prev = S.kortPrev[teamId];
    S.kortPrev[teamId] = { round, threp };
    if (kortCompact() || pmReduced() || !prev || prev.round === round) return svg;
    let ut = svg;
    // VILJANDI aðeins lögin 10 (KORT_ANIM_LOG) + taknmyndir í anim-diffinu: atvik og ljos fá ALDREI
    // kt-breytt/kt-nytt — ekkert popp á hverjum polli.
    // ATH: results/watch endurbyggja innerHTML á hverju polli → kt-atvik-lúppan ENDURRÆSIST þar;
    // keyframes hennar eru því restart-þolnar (opacity-hvíldarstaða á 0%/100%, ekkert transform-drift).
    for (const k in KORT_ANIM_LOG) if (prev.threp[k] !== threp[k]) ut = ut.replace('class="kt-lag ' + KORT_ANIM_LOG[k] + '"', 'class="kt-lag ' + KORT_ANIM_LOG[k] + ' kt-breytt"');
    const adur = new Set(prev.threp.taknmyndir || []);
    for (const t of (threp.taknmyndir || [])) if (!adur.has(t)) ut = ut.replace('class="kt-takn kt-takn-' + t + '"', 'class="kt-takn kt-takn-' + t + ' kt-nytt"');
    return ut;
  }
  // Kort MÍNS liðs: results-sýn (uppgjör lotunnar) + leikslok (lokastaða). mine.detail fyrst,
  // annars st.kort (leikslok/reload — results er null í ended-fasa).
  function kortCardMitt(st) {
    const mine = (st.results || []).find((r) => r.teamId === S.teamId);
    let kpis = null, policies = null, round = st.round;
    if (mine && mine.detail && mine.detail.kpis) { kpis = mine.detail.kpis; policies = mine.detail.policies || {}; }
    else { const k = (st.kort || []).find((x) => x.teamId === S.teamId); if (k) { kpis = k.kpis || {}; policies = k.policies || {}; round = k.round; } }
    if (!kpis) return '';
    const threp = kortThrepUr(st, S.teamId, kpis, policies);
    const svg = kortMedAnim(renderIslandKort(threp, { compact: kortCompact() }), threp, S.teamId, round);
    return '<div class="lk-card"><h2>🇮🇸 Ísland ykkar</h2><div class="lk-kort">' + svg + '</div>' + kortSkyring(threp) + '</div>';
  }
  // Watch (skjávarpi): STÓRT kort efsta liðsins — eða tvö hlið við hlið þegar liðin eru nákvæmlega 2.
  // Gögn = st.kort (nýjasta UPPGJÖR per lið) → í decide-fasa sést síðasta uppgjör ef til (ekkert
  // kort fyrr en fyrsta uppgjör — engin drög lotu í gangi sjást á korti). compact aðeins undir 700px.
  function kortWatch(st, teams) {
    const kd = st.kort; if (!kd || !kd.length) return '';
    const byId = {}; for (const k of kd) byId[k.teamId] = k;
    const med = teams.filter((t) => byId[t.id]);
    if (!med.length) return '';
    const pick = med.length === 2 ? med : [med[0]];
    const one = (t) => {
      const k = byId[t.id];
      const threp = kortThrepUr(st, t.id, k.kpis, k.policies);
      const svg = kortMedAnim(renderIslandKort(threp, { compact: kortCompact() }), threp, t.id, k.round);
      return '<div><div class="lk-kort-nafn">' + esc(t.name) + '</div><div class="lk-kort">' + svg + '</div>' + kortSkyring(threp) + '</div>';
    };
    return '<div class="lk-card lk-kort-watch"><h2>🇮🇸 ' + (pick.length === 2 ? 'Ísland liðanna' : 'Ísland efsta liðsins') + '</h2><div class="lk-kort-grid' + (pick.length === 2 ? ' two' : '') + '">' + pick.map(one).join('') + '</div></div>';
  }
  // ── VERK 1: Lifandi Íslandskort í decide-sýn studio ────────────────────────
  // Kallað úr drawStudioPreview (þ.e. við hvert 60ms-þrottlað sleða-drag OG hvert poll) en teiknar
  // AÐEINS þegar ÞREP-UNDIRSKRIFTIN breytist: kortThrep er ódýrt (nokkrar samanburðar-greinar) og
  // undirskriftar-strengurinn ódýr — renderIslandKort (dýra SVG-byggingin) keyrir bara á þröskuld-
  // skiptum. idPrefix 'ktd' svo defs-id rekist ekki á results-kortið ('kt') ef bæði enda á síðu.
  // Hýsillinn #lk-st-kort er FASTUR í renderStudio-grindinni (ekki hluti af forskoðunar-innerHTML)
  // → .kt-breytt-glowið (600ms, sama og í results) klippist ekki þó dregið sé áfram.
  // Inntak: kpis = forskoðunar-KPI + kort-lags-útkomur úr herminum; menntun + KORT_SLEDAR (kvoti/
  // lodaframbod/fiskeldi/orka/orkuskipti/ferdamannagjald) úr LIFANDI S.dials;
  // policyStates = staðfest + drög lotunnar; eventChoices = val MÍNS liðs.
  function kortDecideDraw(st, kpis) {
    const holder = root.querySelector('#lk-st-kort'); if (!holder) return;
    const kk = { ...(kpis || {}) };
    const m = leverNorm('menntun', S.dials ? S.dials.menntun : null); if (m != null) kk.menntun = m;
    const threp = kortThrep({
      kpis: kk,
      policyStates: { ...((st.policies && st.policies.states) || {}), ...(S.policyDraft || {}) },
      eventChoices: (st.eventChoices || {})[S.teamId] || {},
      // Sleða-lögin (togarar/kranar/kvíar/vindmyllur/ferðamenn) bregðast LIFANDI við sleða-drögum:
      // normuð frávik beint úr S.dials (sama leverNorm og menntun) — leverNorm skilar null á
      // óhreyfðum/vantandi sleða → grunnstaða (1, ferðamenn 2). Lyklar = lever-id úr KORT_LEVER_ID.
      levers: kortLevers((id) => leverNorm(id, S.dials ? S.dials[id] : null)),
      // Atvik lotunnar sést á landinu um leið og lotan opnast — parast við atviks-popupið (sepop).
      atvik: (st.surprise && st.surprise.id) || null,
    });
    // ljos og atvik VERÐA að vera í undirskriftinni: ljos-þrepaskipti og atviks-koma triggera þá
    // nákvæmlega EINA endurteiknun (næstu poll með sömu sig sleppa — CSS-lúppan á kt-atvik lifir).
    // togarar/kranar/kviar/vindmyllur/ferdamenn/gamaskip SÖMULEIÐIS — annars endurteiknaðist kortið
    // aldrei við kvóta-/lóða-/fiskeldis-/orku-/ferðamanna-drög (né gámaskipin við hagvaxtar-/gengis-skipti).
    const sig = threp.byggd + '|' + threp.menntun + '|' + threp.fiskur + '|' + threp.losun + '|' + threp.ljos + '|' + threp.togarar + '|' + threp.kranar
      + '|' + threp.kviar + '|' + threp.vindmyllur + '|' + threp.ferdamenn + '|' + threp.gamaskip
      + '|' + (threp.atvik || '') + '|' + (threp.taknmyndir || []).join(',');
    const changed = sig !== S.ktdSig;
    if (!changed && holder.firstChild) return;   // ódýra undirskriftar-tékkið — EKKI endurteikna á hverju draggi
    const prev = changed ? S.ktdPrev : null;     // óbreytt sig en tómur hýsill (renderStudio endurbyggði) → teikna ÁN glows
    S.ktdSig = sig; S.ktdPrev = threp;
    let svg = renderIslandKort(threp, { compact: kortCompact(), idPrefix: 'ktd' });
    if (prev && !kortCompact() && !pmReduced()) {   // .kt-breytt á lagið sem breyttist (600ms glow eins og í results)
      for (const k in KORT_ANIM_LOG) if (prev[k] !== threp[k]) svg = svg.replace('class="kt-lag ' + KORT_ANIM_LOG[k] + '"', 'class="kt-lag ' + KORT_ANIM_LOG[k] + ' kt-breytt"');
      const adur = new Set(prev.taknmyndir || []);
      for (const t of (threp.taknmyndir || [])) if (!adur.has(t)) svg = svg.replace('class="kt-takn kt-takn-' + t + '"', 'class="kt-takn kt-takn-' + t + ' kt-nytt"');
    }
    holder.innerHTML = '<h2 title="Kortið bregst LIFANDI við drögunum ykkar — sleðar, stórar ákvarðanir og atviks-val breyta landinu áður en þið læsið.">🇮🇸 Ísland ykkar — lifandi forskoðun</h2>'
      + '<div class="lk-kort">' + svg + '</div>' + kortSkyring(threp);
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
      // F3-V3: lokastaða kortsins við hlið „Ísland ykkar 2032"-blokkarinnar (grid 2 dálkar á breiðum skjá).
      const kortH = kortCardMitt(st), recapH = uppsafnadRecap(st, S.teamId);
      const lokaBlokk = (kortH && recapH) ? '<div class="lk-kort-loka">' + kortH + recapH + '</div>' : kortH + recapH;
      root.innerHTML = frontPage + teamBanner(st) + lokaBlokk + politikFerillCard(st) + teamRecap(st)
        + '<p class="lk-muted lk-saga-loka">📜 Berðu ferilinn ykkar saman við söguna í uppgjörum lotanna.</p>'   // VERK 6: loka-línan
        + revealCard(st) + leaderboard(st);
      const sb = root.querySelector('#lk-share'); if (sb) sb.onclick = () => { try { navigator.clipboard.writeText(shareText); sb.textContent = '✅ Afritað!'; } catch (e) { sb.textContent = shareText; } };
      return;
    }
    if (st.phase === 'resolved') return renderTeamResults(st);
    // Ný umferð → núlla „breyta"-stöðu + studio-byggingu (carry-forward úr history)
    if (S.stRound !== st.round) { S.unlocked = false; S.stRound = st.round; S.dials = null; S.studioBuiltSig = null; S.localTouched = new Set(); }
    // Læst-staða (A): eftir læsingu sýna staðfestingu + „Breyta" (aflæsa fram að resolve)
    if (st.you && st.you.locked && !S.unlocked) return renderLocked(st);
    maybeSepop(st);   // F2-V2: atviks-popup — fyrir bæði studio og classic decide-sýn (einu sinni per lotu)
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
      '<div class="lk-pmh-solo">' + pmHeadHtml() + '</div>' +   // VERK 2: ráðherrann efst t.h., FYRIR OFAN liðs-borðann (classic hefur engan term-head)
      teamBanner(st) + roleBanner(st) +
      card('📋 Umferð ' + st.round + ': ' + ev.title, '<p>' + esc(ev.text) + '</p>' + (st.secondsLeft != null ? '<div style="margin-top:6px">' + timerBadge(st) + '</div>' : '')) +
      '<div class="lk-card"><h2>Ákvarðanir liðsins</h2>' + decHtml +
      '<button class="lk-btn" id="lk-lock"' + (ready ? '' : ' disabled') + ' style="margin-top:10px">Læsa ákvörðunum</button>' +
      (ready ? '' : '<p style="color:var(--muted);font-size:13px">Veldu í öllum flokkum til að læsa.</p>') + '</div>' +
      mandateCard(st) + leaderboard(st);
    root.querySelectorAll('.lk-opt').forEach((el) => { el.onclick = () => { S.draft[el.dataset.dec] = el.dataset.opt; render(); }; });
    const lock = root.querySelector('#lk-lock'); if (lock) lock.onclick = () => submitDecisions();
    pmUpdate(st);   // VERK 2: fylla PM-blokkina POST-render (innerHTML var að endurbyggja hana)
  }

  // ── VERK 6: „📜 Svona fór það í alvöru" — raun-hagsaga lotunnar í uppgjörinu ──
  // Frásögn + ríkisstjórnir (sagaFyrirLotu), ákvarðana-samanburður (berSamanAkvardanir á settluð
  // policy-ástönd lotunnar: ✓ sama og Ísland / ✗ hin leiðin / — óráðið) og KPI-tafla þið vs raun
  // þar sem raun er til (raunKpiLotu; kaupmattur er ekki í REALITY → dettur sjálfkrafa út).
  // Í <details data-keep="saga"> svo opið/lokað lifi poll (S.openDetails) og spjaldið þrengi ekki
  // skjáinn; opið sjálfgefið í FYRSTA uppgjöri leiksins (seed einu sinni), munað eftir það.
  function sagaCard(st) {
    const saga = sagaFyrirLotu(st.round); if (!saga) return '';
    if (!S.sagaSeeded) { S.sagaSeeded = true; if (st.round === 1) S.openDetails.add('saga'); }
    const mine = (st.results || []).find((r) => r.teamId === S.teamId);
    const polStates = (mine && mine.detail && mine.detail.policies) || {};
    const cmp = berSamanAkvardanir(st.round, polStates).filter((c) => !(c.thitt == null && c.raun == null));
    const chips = cmp.map((c) => {
      const cls = c.eins == null ? 'n' : c.eins ? 'g' : 'r';
      const mark = c.eins == null ? '—' : c.eins ? '✓' : '✗';
      const txt = c.eins == null ? (c.raun == null ? 'ekkert raun-val til samanburðar' : 'þið hafið ekki tekið afstöðu')
        : c.eins ? 'sama og Ísland gerði' : 'Ísland fór hina leið';
      return '<span class="lk-saga-chip ' + cls + '">' + mark + ' ' + (c.icon || '🏛️') + ' ' + esc(c.label) + ' <span class="lk-saga-chip-t">' + txt + '</span></span>';
    }).join('');
    const raun = raunKpiLotu(st.round) || {};
    const kk = (mine && mine.detail && mine.detail.kpis) || null;
    let kpiHtml = '';
    if (kk) {
      const rows = ['verdbolga', 'hagvoxtur', 'atvinnuleysi', 'skuldir']
        .filter((k) => raun[k] != null && typeof kk[k] === 'number' && isFinite(kk[k]))
        .map((k) => '<tr><td>' + esc((GOAL_SPECS[k] || {}).label || k) + '</td><td>' + num(kk[k]) + '</td><td>' + num(raun[k]) + '</td></tr>').join('');
      if (rows) kpiHtml = '<div class="lk-saga-kpi"><b>Staðan í lok tímabils — þið vs raunin:</b>'
        + '<table class="lk-tbl lk-saga-tbl"><tr><th></th><th>Þið</th><th>Raunin</th></tr>' + rows + '</table></div>';
    }
    return '<div class="lk-card lk-saga"><details data-keep="saga"' + (S.openDetails.has('saga') ? ' open' : '') + '>'
      + '<summary>📜 <b>Svona fór það í alvöru</b> <span class="lk-muted">' + esc(saga.timabil) + '</span></summary>'
      + '<p class="lk-saga-frasogn">' + esc(saga.frasogn) + '</p>'
      + '<p class="lk-saga-stj"><b>🏛️ Ríkisstjórnir tímabilsins:</b><br>' + saga.rikisstjornir.map(esc).join('<br>') + '</p>'
      + (chips ? '<div class="lk-saga-chips"><b>Stóru ákvarðanirnar — þið vs Ísland:</b><div>' + chips + '</div></div>' : '')
      + kpiHtml
      + '</details></div>';
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
      // VERK 1b: pólitísk staða lotunnar + breyting frá síðustu lotu — hlutlaus lýsing (politik.mjs).
      // Levers = læst gildi lotunnar (st.draft, reload-öruggt eins og í debrief); policy-staða = staðfest+drög lotunnar.
      if (st.mode === 'studio') {
        const polLevers = (st.draft && Object.keys(st.draft).length) ? st.draft : (S.dials || {});
        const polStates = (st.policies && st.policies.states) || {};
        const polNow = politikStada(polLevers, { ...polStates, ...((st.policies && st.policies.draft) || {}) });
        const hist = st.history || [], prevSet = hist.length ? hist[hist.length - 1] : null;
        let br = '';
        if (prevSet && prevSet.levers) {
          const polPrev = politikStada(prevSet.levers, polStates);
          const d = polNow.stig - polPrev.stig;
          br = d > 4 ? 'hallar til hægri frá síðustu lotu' : d < -4 ? 'hallar til vinstri frá síðustu lotu' : 'svipuð staða og síðustu lotu';
          if (polPrev.flokkur !== polNow.flokkur) br = esc(polPrev.lysing) + ' → ' + esc(polNow.lysing) + ' — ' + br;
        }
        extras += '<div class="lk-card"><div class="lk-pol-head"><h2 style="margin:0" title="' + esc(POL_INFO) + '">🧭 Pólitíska litrófið</h2><b style="color:' + polColor(polNow.flokkur) + '">' + esc(polNow.lysing) + ' (' + polStig(polNow.stig) + ')</b></div>'
          + politikBraut(polNow.stig)
          + (br ? '<p style="font-size:13px;margin:8px 0 0">↔ ' + br + '</p>' : '')
          + '<p class="lk-muted lk-pol-info">ⓘ ' + esc(POL_INFO) + '</p></div>';
      }
    }
    root.innerHTML = teamBanner(st) + fellBanner + roleBanner(st)
      + kortCardMitt(st)   // F3-V3: „🇮🇸 Ísland ykkar" efst í results (plássið sem orsaka-keðjan hafði)
      + sagaCard(st)   // VERK 6: „📜 Svona fór það í alvöru" — strax eftir Íslandskortið
      + debriefHtml + card('📊 Skorkort — umferð ' + st.round, scorecard)
      + extras
      + leaderboard(st)
      + uppsafnadCard(st, S.teamId)   // F1-V4: uppsafnað yfir allan leikinn + samanburður liða + ákvarðana-pinnar
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
    const inp = buildInputs(history, { baseline: BASELINE, scenario, mode: 'studio', leverCap: st.leverCap || null });
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
    // VERK 1a: pólitíski mælirinn — lifandi úr sleða-drögum (S.dials) + stefnu-stöðu (staðfest+drög þessarar
    // lotu). HLUTLAUST kennslutæki (politik.mjs): braut + nál + „togar"-listar í <details data-keep>
    // (opið/lokað lifir endurteiknun af um S.openDetails, sama mynstur og handbókin). Situr við Þjóðarhags-mælinn.
    const pol = politikStada(S.dials || {}, { ...((st.policies && st.policies.states) || {}), ...(S.policyDraft || {}) });
    const polTog = politikTogar(pol);
    html += '<div class="lk-card" title="' + esc(POL_INFO) + '"><div class="lk-pol-head"><h2 style="margin:0">🧭 Pólitíska litrófið</h2><b style="color:' + polColor(pol.flokkur) + '">' + esc(pol.lysing) + ' (' + polStig(pol.stig) + ')</b></div>'
      + politikBraut(pol.stig, 'lk-pol-nal')
      + '<details data-keep="pol-togar" class="lk-pol-details"' + (S.openDetails.has('pol-togar') ? ' open' : '') + '><summary>Hvað togar?</summary>' + (polTog || '<p class="lk-muted" style="font-size:12px;margin:4px 0 0">Ekkert togar enn — stefnan er öll á grunni.</p>') + '</details>'
      + '<p class="lk-muted lk-pol-info">ⓘ ' + esc(POL_INFO) + '</p></div>';
    // VERK 1: efri hlutinn skrifaður STRAX — kort-hýsillinn (#lk-st-kort) situr á milli hlutanna í
    // renderStudio-grindinni og er EKKI endurbyggður hér (þess vegna klippist glow-animation aldrei).
    el.innerHTML = html;
    html = '';
    html += '<div class="lk-card"><h2 title="Hversu nálægt hverju umboðs-markmiði þú ert. Fyllri borði = betra.">🎯 Markmið</h2><div class="lk-goalmeters">';
    for (const k of st.mandate.kpis) { const p = sc.perKpi.find((x) => x.key === k.key); html += goalMeter(k, kpiVals[k.key], p ? p.score : 0); }
    html += '</div></div>';
    // F2-V3: Ráðgjafa-kortið flutt ALFARIÐ í PM-blöðruna (var tvítekning) — hér geymast bara lifandi
    // forskoðunar-gildin svo pósi + ráðgjafa-línur hornsins bregðist við sleða-drögunum (pmUpdate neðst).
    S.pmApproval = pop; S.pmApprovalRound = st.round; S.pmKpis = kpiVals; S.pmKpisRound = st.round;
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
    const el2 = root.querySelector('#lk-st-chart2'); if (el2) el2.innerHTML = html;   // VERK 1: neðri hlutinn
    // VERK 1a: nálin hreyfist MJÚKT þótt innerHTML sé endurbyggt við hvert sleða-drag: byrja nýja nál á
    // FYRRI stöðu → þvinga reflow → færa á nýju stöðuna (CSS transition á left tekur við). pmReduced → sleppt.
    const polNal = el.querySelector('#lk-pol-nal');
    if (polNal && !pmReduced() && S.polPrevStig != null && S.polPrevStig !== pol.stig) {
      polNal.style.left = (50 + S.polPrevStig / 2).toFixed(1) + '%';
      void polNal.offsetWidth;
      polNal.style.left = (50 + pol.stig / 2).toFixed(1) + '%';
    }
    S.polPrevStig = pol.stig;
    // VERK 1: lifandi Íslandskortið — kort-lags-KPI beint úr forskoðunar-herminum (allar útkomur til,
    // óháð umboði lotunnar) svo byggð/fiskur/losun bregðist alltaf við sleða-drögum. hagvoxtur +
    // gengi_endo SÖMULEIÐIS fyrir gámaskipa-lagið (kortThrep: hagvoxtur + gengi??gengi_endo) — annars
    // stæði höfnin í grunnstöðu 1 í lifandi forskoðun nema hagvöxtur væri í umboði lotunnar. vlf_ferda
    // (ferðaþjónustu-vísitalan) fyrir ferðamanna-lagið — straumurinn (sviðsmyndar-áföll/gengi) sést lifandi,
    // gjald-sleðinn þynnir hann.
    const mapK = { ...kpiVals };
    for (const mk of ['byggdajofnudur', 'fiskistofn', 'losun', 'hagvoxtur', 'gengi_endo', 'vlf_ferda']) { const oc = sim.outcomes[mk]; if (oc && oc.mid.length) mapK[mk] = oc.mid[oc.mid.length - 1]; }
    kortDecideDraw(st, mapK);
    pmUpdate(st);   // VERK 2: pósi/ráðgjafar haussins fylgja nýjustu forskoðuninni (no-op ef undirskrift óbreytt)
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
    // Pólitískt vald (Erfitt): hámark VIRKRA sleða (frá grunni) → læsa sleða sem eru á grunni þegar þakið er náð.
    const cap = st.leverCap || 0;
    const activeKeys = cap ? Object.keys(S.dials || {}).filter((k) => BASELINE.levers[k] && unlocked(k) && S.dials[k] !== BASELINE.levers[k].base) : [];
    const capReached = cap && activeKeys.length >= cap;
    const sliders = visLevers.map((l) => {
      const cfg = BASELINE.levers[l.key];
      const v = S.dials[l.key] != null ? S.dials[l.key] : l.base, moved = +v !== l.base, core = isCore(l.key);
      const capLock = capReached && +v === l.base;   // á grunni + vald fullnýtt → læst
      const eff = leverEffects(l.key, BASELINE, LINKS);
      const effTxt = eff.length ? ' → hefur áhrif á: ' + eff.map((e) => e.label + (e.dir > 0 ? '↑' : '↓')).join(', ') : '';
      const tip = capLock ? 'Pólitískt vald fullnýtt — endursettu annan sleða til að opna þennan.' : l.label + '. Núgildi ' + disp(cfg, v) + '.' + effTxt + (core ? ' ⭐ Kjarna-stjórntæki — góður staður að byrja.' : '');
      return `<div class="lk-slider-row${core ? ' lk-core' : ''}"${capLock ? ' style="opacity:.45"' : ''} title="${esc(tip)}"><label>${capLock ? '🔒 ' : (core ? '⭐ ' : '')}${esc(l.label)} <span class="lk-val${moved ? ' moved' : ''}" data-val="${l.key}">${esc(disp(cfg, v))}</span>${st.difficulty === 'easy' ? ' <span class="lk-muted" style="font-size:11px">nú ' + esc(disp(cfg, l.base)) + '</span>' : ''}</label><input type="range" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" data-lev="${l.key}"${capLock ? ' disabled' : ''} aria-label="${esc(l.label)}"></div>`;
    }).join('') + (lockedN ? '<p class="lk-muted" style="font-size:12px;margin-top:8px">🔒 ' + lockedN + ' stjórntæki opnast á síðari kjörtímabilum.</p>' : '');
    // Vald-mælir (Erfitt): sýnir hversu mörg svið eru virk af leyfðum.
    const capHtml = cap ? '<div style="margin:6px 0 2px;padding:7px 10px;border-radius:8px;font-size:12.5px;background:' + (capReached ? 'rgba(231,130,132,.15);border:1px solid #e78284' : 'rgba(140,160,200,.12);border:1px solid #3a4152') + '">🏛️ <b>Pólitískt vald:</b> ' + activeKeys.length + '/' + cap + ' virk svið' + (capReached ? ' — fullnýtt. Endursettu sleða (á grunn) til að opna annað.' : '') + '</div>' : '';
    // „Ný stjórntæki" sem opnuðust ÞETTA kjörtímabil
    const newTools = STUDIO_CAT.tabs.flatMap((t) => t.levers).filter((l) => (LEVER_UNLOCK[l.key] || 1) === st.round).map((l) => l.label);
    const newToolsBanner = (st.round > 1 && newTools.length) ? '<div class="lk-newtools">🆕 <b>Ný stjórntæki opnuðust:</b> ' + newTools.map(esc).join(', ') + '</div>' : '';
    // #4 Mýkri byrjun: intro-borði aðeins í umferð 1.
    const introBanner = st.round === 1 ? '<div class="lk-intro">👋 <b>Þú stýrir Íslandi frá árinu 2000.</b> Byrjaðu á kjarna-tólunum fjórum (⭐): <b>Stýrivextir, Skattar, Tilfærslur, Menntun</b>. Færðu einn sleða, sjáðu áhrifin á gröfunum — og fínstilltu hin tólin síðar.</div>' : '';
    const [y0, y1] = termYears(st.round), ev = st.event;
    // VERK 2: term-head er nú flex — texti vinstri, PM-blokkin hægri (pmHeadHtml, fyllt í pmUpdate).
    // VERK 3: ev.watch-línan er FARIN héðan — textinn er fyrsta skilaboð ráðherrans (pmMessages).
    // VERK 5: arfleifðin birtist á NÁKVÆMLEGA tveimur stöðum: stuttar badge-flísar (policyBadgesRow)
    // FYRIR OFAN liðs-borðann og EITT 📋-spjald (carryoverCard, textar+deltas) FYRIR NEÐAN hann.
    root.innerHTML =
      ribbonHtml(st) +
      `<div class="lk-term-head lk-pmh-row"><div class="lk-pmh-left"><span class="lk-term-badge">Kjörtímabil ${st.round}/8 · ${y0}–${y1}</span>${st.difficulty && st.difficulty !== 'medium' ? '<span class="lk-term-badge" style="background:#3a2f1a">🎚️ ' + (st.difficulty === 'hard' ? 'Erfitt' : 'Létt') + '</span>' : ''}${timerBadge(st)}<h1 class="lk-term-title">${ev && ev.icon ? ev.icon + ' ' : ''}${ev ? esc(ev.title) : 'Kjörtímabil ' + st.round}</h1>${ev ? '<p class="lk-term-text">' + esc(ev.text) + '</p>' : ''}</div>${pmHeadHtml()}</div>` +
      policyBadgesRow(st) +   // F1-V3: badge-röð STRAX undir kjörtímabils-hausnum, á undan arfleifðar-spjaldi
      teamBanner(st) + roleBanner(st) + introBanner + newToolsBanner + carryoverCard(st) + surpriseCard(st) +
      (st.stjornarkreppa ? '<div class="lk-conflict" style="border-left-color:#e78284"><div class="lk-conflict-row"><span class="lk-conflict-ic">🚨</span><span><b>Stjórnarkreppa eftir fall stjórnarinnar.</b> Ríkisstjórnin féll í fjöldamótmælum síðasta kjörtímabil — ný stjórn tekur við löskuðu búi. Stjórnarmyndun og lömun draga úr hagvexti, atvinnuleysi eykst, skuldir hækka og fylgi byrjar mun lægra. Það þarf sterka hagstjórn til að ná vopnum sínum á ný.</span></div></div>' : '') +
      '<div class="lk-studio-main">' +
        // VERK 1: graf-dálkurinn þrískiptur — efsta röðin er 2-dálka rist: forskoðunar-mælarnir
        // (#lk-st-chart: fórnarskipti+Þjóðarhagur+pólitík) VINSTRA megin og FASTI kort-hýsillinn
        // (#lk-st-kort) HÆGRA megin við þá — efst í dálknum svo kortið sjáist ÁN skruns á 1440px
        // („beint undir pólitíska mælinum" reyndist enda undir brotlínu). Hýsillinn er utan
        // forskoðunar-innerHTML svo DOM-ið lifir sleða-drög af og glow-animation klippist ekki.
        // Neðri forskoðunin (#lk-st-chart2: markmið+gröf+hitakort) fyllir svo alla breiddina.
        '<div class="lk-studio-charts">' +
          '<div class="lk-st-row">' +
            '<div id="lk-st-chart"></div>' +
            '<div class="lk-card lk-kort-decide" id="lk-st-kort"></div>' +
          '</div>' +
          '<div id="lk-st-chart2"></div>' +
        '</div>' +
        '<div class="lk-studio-controls">' +
          '<div class="lk-card"><h2>🎛️ Stjórnstöð</h2><div class="lk-tabs">' + tabBar + '</div>' + ((TAB_META[tab.group] || {}).desc ? '<p class="lk-muted" style="font-size:12px;line-height:1.5;margin:8px 0 4px">' + esc((TAB_META[tab.group] || {}).desc) + '</p>' : '') + capHtml + '<div id="lk-st-sliders">' + sliders + '</div></div>' +
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
      el.addEventListener('change', () => { clearDrag(); pushDraft(st); if (st.leverCap) renderStudio(st); });  // vald-þak: uppfæra læsingar þegar sleði fer á/af grunn
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
  // GALLI B: læst lið (og EKKI í „Breyta ákvörðun"-flæðinu — S.unlocked táknar viljandi aflæsingu
  // um #lk-unlock) má ALDREI pushDraft-a: locked:false myndi aflæsa liðið þegjandi.
  function pushDraft(st) {
    const you = (S.state && S.state.you) || (st && st.you);
    if (you && you.locked && !S.unlocked) return;
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

  // ── VERK 2: „RÁS-TÍÐINDI"-ticker á watch-sýninni (lower-third fyrir skjávarpa) ──────────────
  // Hýsillinn er SYSTKINI #leikur-root (sama mynstur og sepop/pm) svo poll-endurteiknun root.innerHTML
  // slökkvi ekki á marquee-animationinni; innihaldið er AÐEINS endurbyggt þegar undirskriftin breytist
  // (lotu-skipti/nýtt uppgjör). Uppsprettur — allt þegar í watch-state: atviks-titill lotunnar (st.event),
  // stórar ákvarðanir nýjustu lotu (st.decisionMarks) og newsHeadlines á nýjasta uppgjör hvers liðs
  // (st.kpiHistory — server sendir nú líka atvinnuleysi svo atvinnu-fyrirsagnirnar virki).
  // esc() á ÖLL liðsheiti+fyrirsagnir við samsetningu; engir inline handlers (pása-á-hover er hreint CSS).
  let tickerHost = null;
  function tickerItems(st) {
    const items = [];
    if (!st || st.phase === 'lobby') return items;
    const nameOf = Object.fromEntries((st.teams || []).map((t) => [t.id, t.name]));
    if (st.event && st.event.title) items.push((st.event.icon ? st.event.icon + ' ' : '') + st.event.title);
    const marks = st.decisionMarks || [];
    if (marks.length) {
      const maxR = Math.max(...marks.map((m) => m.round));
      for (const m of marks) if (m.round === maxR) items.push((m.icon || '🏛️') + ' ' + (nameOf[m.teamId] || ('Lið ' + m.teamId)) + ': ' + m.label + '!');
    }
    for (const t of (st.kpiHistory || [])) {
      const rs = t.rounds || []; if (!rs.length) continue;
      for (const h of newsHeadlines(rs[rs.length - 1]).slice(0, 2)) items.push('[' + t.name + '] ' + h);
    }
    return items;
  }
  function tickerHide() { if (tickerHost) tickerHost.style.display = 'none'; const m = root.closest('main'); if (m) m.classList.remove('lk-ticker-on'); }
  function tickerUpdate(st) {
    const items = tickerItems(st);
    if (!items.length) return tickerHide();
    const sig = st.phase + '|' + st.round + '|' + items.join('~');
    const m = root.closest('main'); if (m) m.classList.add('lk-ticker-on');   // pláss neðst svo ræman skyggi ekki á kort/stigatöflu
    if (tickerHost && S.tickerSig === sig) { tickerHost.style.display = ''; return; }
    S.tickerSig = sig;
    if (!tickerHost) { tickerHost = document.createElement('div'); tickerHost.className = 'lk-ticker'; (root.parentNode || document.body).appendChild(tickerHost); }
    tickerHost.style.display = '';
    const line = items.map((x) => esc(x)).join(' <span class="lk-ticker-sep">·•·</span> ');
    // Textinn TVÍTEKINN → translateX(-50%) er nákvæmlega ein umferð = saumlaus hringur (~60s, pása á hover).
    // prefers-reduced-motion: CSS felur skrunið og sýnir .lk-ticker-static (2 fyrirsagnir skiptast á með fade).
    tickerHost.innerHTML = '<span class="lk-ticker-brand">📰 RÁS-TÍÐINDI</span>'
      + '<div class="lk-ticker-vp"><div class="lk-ticker-scroll"><span class="lk-ticker-txt">' + line + '</span><span class="lk-ticker-txt" aria-hidden="true">' + line + '</span></div>'
      + '<div class="lk-ticker-static">' + items.slice(0, 2).map((x, i) => '<span class="lk-ticker-st s' + i + '">' + esc(x) + '</span>').join('') + '</div></div>';
  }

  // S6 — áhorfenda-sýn (útsending fyrir skjávarpa): stór stigatafla + kjörtímabil + þróunar-graf.
  function renderWatch(st) {
    maybeSepopWatch(st);   // F2-V2: atviks-spjald á skjávarpa í 8 sek við nýja lotu (sjálf-lokun, engir valkostir)
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
    // Sigurvegari í leikslok (efst raðað).
    const winner = (st.phase === 'ended' && teams.length) ? '<div class="lk-card" style="text-align:center;border:2px solid #f6b13b;background:linear-gradient(180deg,#2a2312,#181c24)"><div style="font-size:24px;font-weight:800;color:#f6b13b">🏆 ' + esc(teams[0].name) + ' sigraði!</div><p class="lk-muted" style="margin:4px 0 0">Hæsta uppsafnaða skor eftir 8 kjörtímabil · Ísland 2000–2032</p></div>' : '';
    // Samhengi kjörtímabils (fyrir áhorfendur/kennslustofu): atburður + hvað þarf að huga að.
    const context = (ev && (st.phase === 'decide' || st.phase === 'resolved')) ? '<div class="lk-card"><h2>' + (ev.icon ? ev.icon + ' ' : '') + esc(ev.title) + '</h2>' + (ev.text ? '<p style="font-size:15.5px;line-height:1.6">' + esc(ev.text) + '</p>' : '') + (ev.watch ? '<p class="lk-watch">⚠ <b>Hvað þarf að huga að:</b> ' + esc(ev.watch) + '</p>' : '') + '</div>' : '';
    root.innerHTML =
      '<div class="lk-watch-head"><span class="lk-term-badge">📺 Áhorf · leikur ' + esc(st.code) + '</span>' + timerBadge(st) + '<h1 class="lk-watch-title">' + (st.phase === 'lobby' ? 'RÁS-Leikurinn — Ísland 2000–2032' : 'Kjörtímabil ' + st.round + '/8 · ' + y0 + '–' + y1) + (ev && ev.icon ? '  ' + ev.icon + ' ' + esc(ev.title) : '') + '</h1><p class="lk-muted">' + esc(phaseTxt) + '</p></div>' +
      winner +
      kortWatch(st, teams) +   // F3-V3: stórt Íslandskort efsta liðs (eða 2 hlið við hlið) — síðasta uppgjör
      '<div class="lk-card"><h2>🏆 Stigatafla</h2><div class="lk-watch-board">' + board + '</div></div>' +
      context + chart + revealCard(st);
    tickerUpdate(st);   // VERK 2: RÁS-TÍÐINDI lower-third (hýsill utan root → marquee lifir poll-endurteiknanir af)
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
