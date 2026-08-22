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
import { HANDBOOK, THOKA_HANDBOOK, SATT_HANDBOOK, RADHERRAR_HANDBOOK } from './handbook.mjs';
import { SATT_VAL, SATT_FLOKKAR, SATT_TEXTI } from './satt.mjs';
import { myndFyrirAtvik, PM_MYNDIR, PM_MYNDIR_KONA } from './myndir.mjs';
import { sagaFyrirLotu, raunKpiLotu, berSamanAkvardanir, radherraFyrirLotu, radherraTexti } from './saga.mjs';
import { kortThrep, KORT_LEVER_ID } from './kort-throp.mjs';
import { renderIslandKort } from './kort-svg.mjs';
// REALITY / YEAR2000_DIALS / SCENARIO eru EKKI lengur flutt inn hingað: raun-gögn, spólun og atburðir
// koma nú ÖLL úr sviðsmynd leiksins (svidsmyndir.mjs — sjá svOf/svidsmyndOf hér að neðan). YEAR_START
// stendur eftir AÐEINS sem sjálfgefið gildi þegar engin sviðsmynd fylgir /state (eldri þjónn).
import { YEAR_START, TAB_META, LEVER_UNLOCK, CORE_LEVERS, GOAL_SPECS, DIFFICULTY } from './game-config.mjs';
import { SVIDSMYNDIR, SVIDSMYNDA_LISTI, SVIDSMYND_SJALFGEFIN, svidsmyndOf } from './svidsmyndir.mjs';   // SVIÐSMYNDA-SKRÁ: /state sendir aðeins lýsigögn (st.svidsmynd), efnið flettist upp hér
import { RADUNEYTI, PM as RH_PM, validHandle, raduneytiLevers, raduneytiStada, leverOwner } from './radherrar.mjs';   // RÁÐHERRASKIPTING: hrein eining (sæti↔sleðar), sama uppspretta og þjónninn
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
// VERK B (leikstjóra-onboarding): stillingar sem leikstjóri valdi við stofnun (þjónninn sýnir ekki klukku/óvænt/hlutverk
// í lobby-state → vafrinn man þær), æfingalið (bot) og „vísir séður"-flaggið.
const lsFacCfg = (code) => 'leikur_faccfg_' + code;
const LS_FACCFG_LAST = 'leikur_faccfg_last';
const lsBot = (code) => 'leikur_bot_' + code;
const LS_ONB = 'lk-fac-onboarded';
const BOT_NAME = 'Æfingalið (sjálfvirkt)';
const ONB_STEPS = 4;
// Textar erfiðleikastiga (ein setning hvert) úr game-config — sama uppspretta og þjónninn notar.
const DIFF_LABEL = (k) => (DIFFICULTY[k] || DIFFICULTY.medium).label;
// GET /api/leikur/me (verk A) → { leikstjori, isAdmin, nemandi, until, source }. 404/villa (verk A ekki merge-að) → { leikstjori:false, _missing:true }.
async function fetchLeikurMe() {
  try { const { status, json } = await api('/me'); if (status === 200 && json && typeof json === 'object') return json; return { leikstjori: false, _missing: status === 404 }; } catch (e) { return { leikstjori: false, _missing: true }; }
}
// until úr /me: ISO-strengur eða epoch (sek/ms) → „d.m.yyyy"; ógilt → ''.
function fmtUntil(v) { if (v == null || v === '') return ''; const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return isNaN(d.getTime()) ? '' : d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); }   // handvirkt d.m.yyyy (is-IS locale-gögn vantar í sumum vöfrum)
// Afrita í klippiborð með sjónrænni staðfestingu; fallback = sýna textann sjálfan í hnappinum (t.d. utan https).
function copyText(text, el, ok) {
  const orig = el ? el.textContent : '';
  const done = () => { if (el) { el.textContent = ok; setTimeout(() => { if (el.isConnected) el.textContent = orig; }, 2000); } };
  const fail = () => { if (el) el.textContent = text; };
  try { const p = navigator.clipboard && navigator.clipboard.writeText(text); if (p && typeof p.then === 'function') p.then(done, fail); else done(); } catch (e) { fail(); }
}
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

// ── ÞOKA („Hagstjórn í þoku", leikstilling config.thoka) — client-hlið BIRTINGARINNAR. ───────────────
// Síunin sjálf er ÞJÓNS-MEGIN (/state, server.mjs — verk A): í decide-fasa fær lið í þoku ALDREI hörðu KPI-tölurnar
// úr lotu N-1. Þjónninn sendir í staðinn ÚTREIKNAÐ: st.thoka = { on, attir:{<kpi>:{att,vs_markmid}}, birtLota,
// fyrirsagnir:[…], stodugleiki:{approval,fell} }, kpiHistory KLIPPT við N-2 (merkt tof), deltas=null á arfleifð/
// badges, surprise.effect=null. Client teiknar ÚR ÞVÍ — hann „felur" aldrei tölur sem hann fékk (þá lækju þær í devtools).
// AFMÖRKUN (skjalfest): lifandi FORSKOÐUNIN í studio keyrir vélina í vafranum úr sleðum + eigin sögu (BASELINE/LINKS
// eru client-side) — snjall notandi getur reiknað spágildi í console. Það er ÁSÆTTANLEGT: það er æfing á OPNU líkani,
// ekki leki á leyndum gögnum annarra liða; þokan er þar BIRTINGAR-regla (áttir+styrkur, engar tölur), ekki öryggisgátt.
// Leikstjóri (fac-tákn) fær allt alltaf. ÁHORFENDA-SÝNIN (watch, tákn-laust /state) er í decide-fasa SÍUÐ EINS OG LIÐ
// á þjóni (teamId:null → kpiHistory ÖLL lið adeinsStig, kort N-2 merkt tof, surprise.effect=null, st.thoka={on,birtLota,birtAr}
// án áttta/fyrirsagna/stiga) — lokar gatinu „lið opnar watch í öðrum flipa og les N-1 tölurnar"; skjávarpinn sýnir þá þoku-
// borða og birtu stöðuna (kort N-2), ticker sýnir aðeins atvik+ákvarðanir. Results-/ended-fasi allra ÓSÍAÐUR (afhjúpunin).
const THOKA_BLURB = THOKA_HANDBOOK.blurb;   // EIN uppspretta (handbook.mjs) — sami texti í rofa, stillingaspjaldi og vísi
const thokaOn = (st) => !!(st && st.thoka && st.thoka.on);
// ── SVIÐSMYNDA-HJÁLPARAR ─────────────────────────────────────────────────────────────────────────
// /state ber AÐEINS lýsigögnin (st.svidsmynd = {id,heiti,undirtitill,yearStart,erFramtid,hefurSogu}).
// Eldri þjónn (fyrir sviðsmynda-skrána) sendir ekkert → allt fellur á sögulegu sviðsmyndinni, sem er
// nákvæmlega gamla hegðunin (YEAR_START=2000, saga+ráðherrar á, YEAR2000_DIALS í stjórnstöð).
const svOf = (st) => (st && st.svidsmynd && st.svidsmynd.id) ? st.svidsmynd : svidsmyndOf(SVIDSMYND_SJALFGEFIN);
const svAr0 = (st) => { const y = svOf(st).yearStart; return typeof y === 'number' ? y : YEAR_START; };
const svLotur = (st) => { const n = (st && st.rounds) || svidsmyndOf(svOf(st).id).rounds; return (Number.isInteger(n) && n > 0) ? n : 8; };
const svHefurSogu = (st) => svOf(st).hefurSogu !== false;   // vantar (eldri þjónn) → sögulega sviðsmyndin
const svErFramtid = (st) => svOf(st).erFramtid === true;    // AÐEINS skýrt já → engin skálduð framtíðar-nöfn
const svHeiti = (st) => svOf(st).heiti || ('Ísland ' + svAr0(st) + '–' + (svAr0(st) + svLotur(st) * 4));
const svArLok = (st) => svAr0(st) + svLotur(st) * 4;              // lokaár leiksins (2032 / 2058)
const svTimabil = (st) => svAr0(st) + '–' + svArLok(st);          // „2000–2032" / „2026–2058"
const termTxt = (r, ar0 = YEAR_START) => (r > 0 ? (ar0 + 4 * (r - 1)) + '–' + (ar0 + 4 * r) : '');
// Átta-/stöðu-gildi þjónsins normuð í föst lykilorð (þolir 'upp'/'hækkandi'/+1/'↑'/'rising' o.s.frv. — samningurinn
// við verk A er orða-lyklar; óþekkt → 'stodugt'/'innan' svo flís sýni alltaf eitthvað læsilegt).
function thokaAtt(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v > 0 ? 'upp' : v < 0 ? 'nidur' : 'stodugt';
  const s = String(v).toLowerCase();
  if (/^(upp|h[aæ]kk|\+|↑|up|ris)/.test(s)) return 'upp';
  if (/^(ni[ðd]|l[aæ]kk|-|−|↓|down|fall)/.test(s)) return 'nidur';
  return 'stodugt';
}
function thokaVs(v) {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (/^(yfir|over|above|of[ _-]?h)/.test(s)) return 'yfir';
  if (/^(undir|under|below|of[ _-]?l)/.test(s)) return 'undir';
  return 'innan';
}
const THOKA_PIL = { upp: '↑', nidur: '↓', stodugt: '→' };
const THOKA_ATT_TXT = { upp: 'hækkandi', nidur: 'lækkandi', stodugt: 'stendur í stað' };   // óbeygjanleg orðalög (öll kyn/tölur)
const THOKA_VS_TXT = { yfir: 'yfir markmiði', undir: 'undir markmiði', innan: 'innan markmiðs' };
const thokaVsCls = (vs) => (vs === 'innan' ? 'g' : vs ? 'r' : 'n');
// Áttaflís: píla + heiti + staða vs markmið — ENGAR tölur. Öll innihald esc()-uð.
function thokaChip(label, att, vs, icon) {
  const a = thokaAtt(att), v = thokaVs(vs);
  const txt = [a ? THOKA_ATT_TXT[a] : '', v ? THOKA_VS_TXT[v] : ''].filter(Boolean).join(', ') || 'engin samanburðargögn enn';
  return '<span class="lk-thoka-chip ' + thokaVsCls(v) + '"><span class="lk-thoka-pil" aria-hidden="true">' + (a ? THOKA_PIL[a] : '·') + '</span><span class="lk-thoka-chip-l">' + (icon ? icon + ' ' : '') + esc(label) + '</span><span class="lk-thoka-chip-t">' + esc(txt) + '</span></span>';
}
// Ráðgjafa-mat forskoðunar (þoka): átt + styrkur (0–3 pílur) úr |Δ| m.v. markmiðs-BAND, staða vs markmið (sama
// innan/yfir/undir-regla og gröfin/goalMeter: target±band, ≤max+band, ≥min−band) + óvissu-orð úr óvissu-bili
// vélarinnar (hi−lo)/2 með gólfi band/2 — „líklega" ef fjarlægð frá markinu fer yfir óvissuna, annars „hugsanlega".
// Skilar AÐEINS orðum/pílum; fin/ref/unc fara aldrei út úr fallinu (tölurnar enda ekki í DOM).
// Átt + styrkur (0–3) úr |fin−ref| m.v. band b: <½b → stendur í stað (→), <1½b ↑, <3b ↑↑, annars ↑↑↑.
function thokaStyrkur(fin, ref, b) {
  const d = (typeof fin === 'number' && typeof ref === 'number' && isFinite(fin) && isFinite(ref)) ? fin - ref : 0;
  const ad = Math.abs(d), bb = b > 0 ? b : 0.5;
  const styrkur = ad < bb * 0.5 ? 0 : ad < bb * 1.5 ? 1 : ad < bb * 3 ? 2 : 3;
  const att = styrkur === 0 ? 'stodugt' : d > 0 ? 'upp' : 'nidur';
  return { att, styrkur, pilar: styrkur ? THOKA_PIL[att].repeat(styrkur) : '→' };
}
function thokaMat(k, fin, ref, unc) {
  const b = k.band > 0 ? k.band : Math.max(0.5, Math.abs(+ref || 0) * 0.05);
  const s = thokaStyrkur(fin, ref, b);
  const lo = k.dir === 'max' ? -Infinity : k.dir === 'min' ? k.min - b : k.target - b;
  const hi = k.dir === 'max' ? k.max + b : k.dir === 'min' ? Infinity : k.target + b;
  const vs = fin > hi ? 'yfir' : fin < lo ? 'undir' : 'innan';
  const dist = vs === 'yfir' ? fin - hi : vs === 'undir' ? lo - fin : Math.min(hi - fin, fin - lo);
  const u = Math.max(+unc || 0, b * 0.5);
  return { att: s.att, styrkur: s.styrkur, pilar: s.pilar, vs, ord: dist > u ? 'líklega' : 'hugsanlega' };
}
// Ráðgjafa-flís í stað goalMeter (þoka): pílur + „líklega yfir markmiði" + markmiðið sjálft (það er opinbert, sjá mandateCard).
function thokaTile(k, m, refTxt) {
  const col = m.vs === 'innan' ? '#54d08a' : (m.ord === 'líklega' ? '#e78284' : '#e8c14a');
  const tgt = k.dir === 'target' ? k.target : k.dir === 'max' ? k.max : k.min;
  const aim = k.dir === 'target' ? 'sem næst ' + num(tgt) : k.dir === 'max' ? 'ekki yfir ' + num(tgt) : 'ekki undir ' + num(tgt);
  return '<div class="lk-thoka-tile ' + (m.vs === 'innan' ? 'g' : 'r') + '" title="' + esc(k.label + ' — markmiðið er ' + aim + '. Í þoku sýna ráðgjafarnir aðeins átt og styrk (fleiri pílur = meiri breyting) m.v. nýjustu birtu tölur — engar spátölur. Hið rétta kemur í ljós við uppgjör.') + '">'
    + '<div class="lk-gm-top"><span>' + (k.icon ? k.icon + ' ' : '') + esc(k.label) + (k.weight > 1 ? ' <span class="lk-kpi-w">×' + k.weight + '</span>' : '') + '</span><b class="lk-thoka-pilar" style="color:' + col + '">' + m.pilar + '</b></div>'
    + '<div class="lk-thoka-tile-s" style="color:' + col + '">' + esc(m.ord + ' ' + THOKA_VS_TXT[m.vs]) + '</div>'
    + '<div class="lk-gm-sub"><span class="lk-muted">markmið ' + (k.dir === 'max' ? '≤ ' : k.dir === 'min' ? '≥ ' : '≈ ') + num(tgt) + '</span><span class="lk-muted">' + esc(THOKA_ATT_TXT[m.att] + ' m.v. ' + refTxt) + '</span></div></div>';
}


// ── ÞJÓÐARSÁTTIN (config.satt, satt.mjs) — client-hlið: val-spjald í decide, Karphús-borði, afhjúpun í results. ──
// Þjónssamningur (verk 2, samhliða): decide-lið fær st.satt={on,lota,val,karphus:{open,until}}; decisions-POST tekur
// satt:'satt'|'saekja' (sama leið og dilemma); results/ended bera st.sattUtkoma (per lotu: valin allra, flokkur,
// perTeam effect, texti); fac-control {action:'karphus',open,minutes}; watch fær st.satt={on,lota,karphus} ÁN valsins.
// Valið er BLINT — client sýnir liðinu aðeins EIGIÐ val; afhjúpunin gerist í results (sattResultsCard).
const SATT_BLURB = SATT_HANDBOOK.blurb;   // EIN uppspretta (handbook.mjs) — sami texti í rofa, stillingaspjaldi og handbók

// ── RÁÐHERRASKIPTING INNAN LIÐS (radherrar.mjs) ───────────────────────────────────────────────────────────────────────
// Þjónninn er sannleikurinn: /state?h=<handle> skilar st.radherrar = { on, stada:[{key,group,heiti,icon,lysing,taken,handle}],
// mitt: key|null, pmClaimed, lockFallback }; POST /decisions MERGE-ar per sleða og skilar hafnad:[...] (sleðar utan eigin
// ráðuneytis o.fl.) — clientinn SPEGLAR höfnunina strax (rhAfterPost) svo notandi sjái aldrei „breytingu sem hvarf".
// handle = 6 stafa [a-z0-9] dulnefni per vafra+leik (localStorage 'lk-rh-<kóði>', in-memory varaleið ef geymslan er læst) —
// EKKERT PII; fer sem body.handle í ÖLL liðs-POST (pushDraft/submitStudio/submitDecisions/sattPush/klemma) og ?h= á /state.
const RH_BLURB = RADHERRAR_HANDBOOK.blurb;   // EIN uppspretta (handbook.mjs) — sami texti í rofa, stillingaspjaldi og handbók
const lsRh = (code) => 'lk-rh-' + code;
const rhMem = {};
function rhHandle(code) {
  if (!code) return null;
  let h = null; try { h = localStorage.getItem(lsRh(code)); } catch (e) {}
  if (!validHandle(h)) h = rhMem[code] || null;
  if (!validHandle(h)) {
    const A = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = '';
    try { const b = new Uint8Array(6); crypto.getRandomValues(b); for (const x of b) s += A[x % 36]; } catch (e) { s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * 36)]; }
    h = s; rhMem[code] = h; try { localStorage.setItem(lsRh(code), h); } catch (e) {}
  }
  return h;
}
const rhInfo = (key) => RADUNEYTI.find((r) => r.key === key) || null;
const rhTabOwner = (group) => RADUNEYTI.find((r) => r.group === group) || null;   // flipi (TAB_META-hópur) → ráðuneyti
// Fac-roster: sæta-yfirlit liðs úr lockRoster[].radherrar — þolir stada-fylki [{key,taken}], {stada:[...]} EÐA {key:handle}-map.
// Handles eru ALDREI birt (nafnlaus: ✓ tekið / · laust).
function rhRosterSeats(rh) {
  if (rh == null || typeof rh !== 'object') return '';
  const arr = Array.isArray(rh) ? rh : (Array.isArray(rh.stada) ? rh.stada : null);
  const takenOf = (key) => arr ? !!((arr.find((x) => x && x.key === key) || {}).taken) : !!rh[key];
  return ' <span class="lk-rh-roster" title="Sæti ríkisstjórnarinnar: ✓ tekið · laust">' + RADUNEYTI.map((r) => { const t = takenOf(r.key); return '<span class="lk-rh-seat' + (t ? ' on' : '') + '" title="' + esc(r.heiti + (t ? ' — tekið' : ' — laust')) + '">' + r.icon + (t ? '✓' : '·') + '</span>'; }).join('') + '</span>';
}
// st.sattUtkoma þolir þrjú form (verk 2 er samhliða — varnarforritun): stakt útkomu-obj {flokkur,…}, fylki af útkomum
// (hver með lota), eða map {"3":útkoma,"6":útkoma}. Skilar alltaf röðuðu fylki [{lota,flokkur,k,n,perTeam,texti}].
function sattUtkomurAf(st) {
  const u = st && st.sattUtkoma;
  if (!u || typeof u !== 'object') return [];
  if (Array.isArray(u)) return u.filter((x) => x && x.flokkur).map((x) => ({ ...x, lota: x.lota != null ? +x.lota : null }));
  if (u.flokkur) return [{ ...u, lota: u.lota != null ? +u.lota : (st.round != null ? +st.round : null) }];
  return Object.keys(u).filter((k) => u[k] && u[k].flokkur && isFinite(+k)).map((k) => ({ ...u[k], lota: +k })).sort((a, b) => a.lota - b.lota);
}
// Leikslok-samantekt: „KT3: 🗡️ svik · KT6: 🤝 samvinna — hópurinn lærði…" (recap liðs + fac-greining + prent-skýrsla).
function sattSamantekt(st) {
  const us = sattUtkomurAf(st);
  if (!us.length) return '';
  const stutt = { samvinna: '🤝 samvinna', svik: '🗡️ svik', spirall: '🌀 spírall', einn: '🏛️ eitt lið' };
  const parts = us.map((u) => 'KT' + (u.lota != null ? u.lota : '?') + ': ' + (stutt[u.flokkur] || u.flokkur));
  let d = '';
  if (us.length >= 2) {
    const f0 = us[0].flokkur, f1 = us[us.length - 1].flokkur;
    d = f1 === 'samvinna' ? (f0 === 'samvinna' ? ' — traustið hélt allan tímann' : ' — hópurinn lærði: traustið byggðist upp')
      : (f0 === 'samvinna' ? ' — traustið brast í seinni lotunni' : ' — traustið náðist aldrei');
  }
  return parts.join(' · ') + d;
}
// Afhjúpunar-blokkin „🤝 Þjóðarsáttin — hvað gerðist" (lið+fac+watch í results/ended): tafla liða × val (dramatísk
// birting m/ animation-delay per röð), flokkur með íkoni, áhrifaflísar per lið (deltaChips — pop birtist sem fylgi)
// og kennslusetningin. opts.myTeamId merkir eigið lið; opts.debrief = auka-punktur f. leikstjóra.
function sattResultsCard(st, opts = {}) {
  // Þjónninn sendir ALLAR birtar sáttar-útkomur í hverjum fasa — í resolved sýnum við aðeins ÞESSA lotu
  // (afhjúpun lotunnar), í ended allar (loka-yfirlitið). Annars endurtæki gamla afhjúpunin sig í hverju uppgjöri.
  let us = sattUtkomurAf(st);
  if (st.phase === 'resolved') us = us.filter((u) => u.lota == null || +u.lota === +st.round);
  if (!us.length) return '';
  const nm = Object.fromEntries((st.teams || []).map((t) => [String(t.id), t.name]));
  const blocks = us.map((u) => {
    const fl = SATT_FLOKKAR[u.flokkur] || { icon: '🤝', label: u.flokkur };
    // Þjónninn sendir valin-FYLKI [{teamId,name,val,svikari,effect}]; perTeam-map (form satt.mjs) þolað sem varaleið.
    const lids = Array.isArray(u.valin)
      ? u.valin.map((r) => ({ id: r.teamId, name: r.name != null ? r.name : (nm[String(r.teamId)] || ('Lið ' + r.teamId)), val: r.val, effect: r.effect }))
      : Object.keys(u.perTeam || {}).map((id) => ({ id, name: nm[id] || ('Lið ' + id), val: (u.perTeam[id] || {}).val, effect: (u.perTeam[id] || {}).effect }));
    let i = 0;
    const rows = lids.map((pt) => {
      const v = SATT_VAL[pt.val] || SATT_VAL.saekja;
      const mine = opts.myTeamId != null && String(opts.myTeamId) === String(pt.id);
      const ch = deltaChips(pt.effect);
      return '<tr class="lk-satt-reveal" style="animation-delay:' + (i++ * 0.35) + 's"><td>' + esc(pt.name) + (mine ? ' <span class="lk-satt-mitt">þið</span>' : '') + '</td><td class="' + (pt.val === 'satt' ? 'lk-satt-c-satt' : 'lk-satt-c-saekja') + '">' + v.icon + ' ' + esc(v.label) + '</td><td>' + (ch || '<span class="lk-muted">—</span>') + '</td></tr>';
    }).join('');
    return '<div class="lk-satt-utkoma">'
      + ((us.length > 1 && u.lota != null) ? '<div class="lk-satt-lota">Kjörtímabil ' + u.lota + '</div>' : '')
      + '<div class="lk-satt-flokkur">' + fl.icon + ' ' + esc(fl.label) + '</div>'
      + (rows ? '<table class="lk-tbl lk-satt-tbl"><tr><th>Lið</th><th>Valið</th><th>Áhrif á uppgjörið</th></tr>' + rows + '</table>' : '')
      + (u.texti ? '<p class="lk-satt-kennsla">💡 ' + esc(u.texti) + '</p>' : '') + '</div>';
  }).join('');
  return '<div class="lk-card lk-satt-card lk-satt-results"><h2>' + esc(SATT_TEXTI.results) + '</h2>' + blocks
    + (opts.debrief ? '<p class="lk-muted lk-satt-debrief">🎓 Debrief: ' + esc(opts.debrief) + '</p>' : '') + '</div>';
}
// Leikslok liðs: stutt samantektar-spjald beggja sáttar-lota (fullar afhjúpanir sáust í uppgjörum lotanna).
function sattEndCard(st) {
  const line = sattSamantekt(st);
  if (!line) return '';
  return '<div class="lk-card lk-satt-card"><h2>🤝 Þjóðarsáttin — samantekt</h2><p class="lk-satt-sum">' + esc(line) + '</p></div>';
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
// Studio-forskoðunar-rit: ferill útkomu yfir ÁR (ar0+i) + BAU (punktalína) + markmiðs-lína + raun-lína (fjólublá).
// ar0 = upphafsár sviðsmyndarinnar (svidsmyndir.mjs); framtíðar-sviðsmynd sendir enga raun-línu (reality tómt).
function stChart(title, mid, bau, targetLine, color, reality, ar0 = YEAR_START) {
  const W = 320, H = 132, pl = 34, pr = 10, pt = 18, pb = 24, n = mid.length;
  const all = mid.concat((bau || []).slice(0, n), (reality || []).slice(0, n), targetLine != null ? [targetLine] : []);
  let ymin = Math.min(...all), ymax = Math.max(...all); if (ymax - ymin < 1) { ymax += 1; ymin -= 1; }
  const X = (i) => pl + (W - pl - pr) * (n <= 1 ? 0.5 : i / (n - 1));
  const Y = (v) => (H - pb) - (H - pt - pb) * (v - ymin) / (ymax - ymin);
  let g = `<text x="${pl}" y="12" font-size="11" fill="#9fb0c8">${esc(title)}</text>`;
  // ár-ás: merki á kjörtímabils-skilum (á 4 ára fresti)
  for (let i = 0; i < n; i += 4) g += `<text x="${X(i).toFixed(1)}" y="${H - 6}" font-size="9" fill="#7b879c" text-anchor="middle">${ar0 + i}</text>`;
  if (n > 1) g += `<text x="${X(n - 1).toFixed(1)}" y="${H - 6}" font-size="9" fill="#7b879c" text-anchor="end">${ar0 + n}</text>`;
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
  // ÞOKA (rýni): annarra liða raðir eru AÐEINS stig ({round,score,cumulative}, adeinsStig:true) — uppsafnadSeries myndi teikna
  // þær sem flatar línur (verðlag 100 / skuldir 0 / losun 0) = villandi „staða". Sleppa þeim úr gröfunum; eigið lið (tof) helst.
  const kh = (st.kpiHistory || []).filter((t) => t && !t.adeinsStig); if (!kh.length || !kh.some((t) => t.rounds && t.rounds.length)) return '';
  const per = kh.map((t) => ({ teamId: t.teamId, name: t.name, s: uppsafnadSeries(t.rounds) }));
  const colorOf = uppColorOf(st.kpiHistory);   // litir úr ÓSÍAÐA listanum → sami litur per lið í þoku og við uppgjör
  const marks = (st.decisionMarks || []).filter((m) => m.teamId === myTeamId).map((m) => ({ round: m.round, icon: m.icon, label: m.label }));
  let charts = '';
  for (const spec of UPP_SPECS) charts += lkLineChart(spec.label, per.map((p) => ({ teamId: p.teamId, points: p.s[spec.key] || [] })), { colorOf, widthOf: (id) => (id === myTeamId ? 3.4 : 1.3), marks });
  if (!charts) return '';
  const legend = per.map((p) => '<span class="lk-upp-leg' + (p.teamId === myTeamId ? ' me' : '') + '"><span class="lk-swatch" style="background:' + colorOf(p.teamId) + '"></span>' + esc(p.name) + (p.teamId === myTeamId ? ' (þið)' : '') + '</span>').join('');
  // ÞOKA: þjónninn klippir kpiHistory við N-2 í decide (merkt tof) — merkja spjaldið svo enginn lesi gröfin sem „nýjustu stöðu".
  const tof = (thokaOn(st) && st.phase === 'decide') || kh.some((t) => t && t.tof);
  return '<div class="lk-card"><h2>🏦 Uppsafnað — Ísland ykkar' + (tof ? ' <span class="lk-thoka-tag">🌫️ seinkað um eitt kjörtímabil</span>' : '') + '</h2>'
    + '<p class="lk-muted" style="font-size:12px;margin:0 0 6px">Uppsafnað frá 2000: vísitölur byrja í 100 og vaxa með verðbólgu/hagvexti/kaupmætti (4 ár per kjörtímabil); skuldir eru staða; losun er summa.' + (marks.length ? ' Gular strikalínur = stóru ákvarðanirnar ykkar.' : '') + (tof ? ' Í þoku enda gröfin á nýjustu birtu tölum Hagstofunnar (eins kjörtímabils töf).' : '') + '</p>'
    + '<div class="lk-upp-legend">' + legend + '</div>'
    + '<div class="lk-charts">' + charts + '</div></div>';
}
// Leikslok-blokk: „Ísland ykkar <lokaár>" — lokastöðurnar 5 í mannamáli + best-í-leik samanburður.
// Ártölin koma ÖLL úr sviðsmyndinni (svAr0/svArLok) — 2000–2032 sögulega, 2026–2058 í framtíðinni.
function uppsafnadRecap(st, myTeamId) {
  const kh = st.kpiHistory; if (!kh || !kh.length) return '';
  const mine = kh.find((t) => t.teamId === myTeamId); if (!mine || !mine.rounds || !mine.rounds.length) return '';
  const loka = uppsafnadLoka(uppsafnadSeries(mine.rounds));
  const ratio = (v) => num(Math.round(v / 100 * 10) / 10);
  const lines = [];
  if (loka.verdlag != null) lines.push('💵 Verðlag er <b>' + ratio(loka.verdlag) + '×</b> hærra en árið ' + svAr0(st) + '.');
  if (loka.vlf != null) lines.push('📈 Landsframleiðslan er <b>' + ratio(loka.vlf) + '×</b> af stærð ársins ' + svAr0(st) + (loka.vlf < 100 ? ' — hagkerfið dróst saman.' : '.'));
  if (loka.kaupmattur != null) lines.push('🛒 Kaupmáttur launa er <b>' + ratio(loka.kaupmattur) + '×</b> á við árið ' + svAr0(st) + '.');
  if (loka.skuldir != null) lines.push('🏛️ Skuldir ríkisins enda í <b>' + num(loka.skuldir) + '%</b> af VLF.');
  if (loka.losun != null) lines.push('🌱 Uppsöfnuð losun ' + svTimabil(st) + ': <b>' + num(loka.losun, 0) + '</b> vísitölu-ár.');
  if (!lines.length) return '';
  // Besta lið leiksins per stærð (aðeins ef fleiri en eitt lið hafa gögn).
  const all = kh.filter((t) => t && !t.adeinsStig && t.rounds && t.rounds.length).map((t) => ({ name: t.name, loka: uppsafnadLoka(uppsafnadSeries(t.rounds)) }));
  let bestHtml = '';
  if (all.length > 1) {
    const bits = UPP_SPECS.map((c) => {
      const cand = all.filter((a) => a.loka[c.key] != null); if (!cand.length) return '';
      const b = cand.reduce((x, y) => ((c.best === 'max' ? y.loka[c.key] > x.loka[c.key] : y.loka[c.key] < x.loka[c.key]) ? y : x));
      return esc(c.short.toLowerCase()) + ' <b>' + esc(b.name) + '</b>';
    }).filter(Boolean);
    if (bits.length) bestHtml = '<p class="lk-muted" style="font-size:12.5px;margin:8px 0 0;border-top:1px solid var(--line);padding-top:7px">🏅 Besta lið leiksins: ' + bits.join(' · ') + '</p>';
  }
  return '<div class="lk-card lk-upp-lines"><h2>🇮🇸 Ísland ykkar ' + svArLok(st) + '</h2>' + lines.map((l) => '<p>' + l + '</p>').join('') + bestHtml + '</div>';
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
function renderFacAnalytics(an, st, openDetails = new Set(), opts = {}) {
  if (!an || !an.scorecard || !an.scorecard.length) return '<p class="lk-muted">Greining birtist eftir fyrstu leystu umferð.</p>';
  // ÞOKA: merki á samantekt leikstjóra (debrief-fóður) — liðin ákváðu án nýjustu talna.
  const thokaHtml = opts.thoka ? '<p class="lk-thoka-banner lk-thoka-fac">🌫️ <b>Þoku-leikur</b> — liðin ákváðu án nýjustu talna (hagtölur með eins kjörtímabils töf, engin framtíðarspá í forskoðun). Debrief-spurning: hvað hefðu liðin gert öðruvísi með tölurnar fyrir framan sig — og hvað segir það um raunverulega hagstjórn?</p>' : '';
  // ÞJÓÐARSÁTT: leikslok-samantekt sáttar-lotanna (st.sattUtkoma fylgir results/ended) — „KT3: svik · KT6: samvinna — hópurinn lærði".
  const sattU = st ? sattUtkomurAf(st) : [];
  const sattHtml = sattU.length ? '<p class="lk-satt-fac">🤝 <b>Þjóðarsáttin:</b> ' + esc(sattSamantekt(st)) + '</p>' : '';
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
  const prompts = teachingPrompts(an, { scenarioEvents: (svidsmyndOf(svOf(st).id).events || []).map((e) => ({ round: e.round, icon: e.icon, title: e.title })), thoka: !!opts.thoka, satt: sattU.length ? sattU : false });
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
    + '<li><b>Tenging við raunveruleikann (15 mín):</b> Berið saman við „svona fór það" — hvað segir þetta um raunverulega hagstjórn Íslands ' + svTimabil(st) + '?</li>'
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
  return thokaHtml + sattHtml + guideHtml + promptsHtml
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
function lkPrintReport(st, opts = {}) {
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
  const sattU = sattUtkomurAf(st);   // ÞJÓÐARSÁTT: útkomur sáttar-lotanna (ended-state)
  const pfOf = {}; for (const t of pf) pfOf[t.teamId] = t;
  const trajOf = {}; for (const t of (st.trajectory || [])) trajOf[t.teamId] = t.points || [];
  const reviewOf = {}; for (const t of (an.teamReview || [])) reviewOf[t.teamId] = t;
  const polTeamOf = {}; for (const t of (an.policiesByTeam || [])) polTeamOf[t.teamId] = t;
  const dilOf = {}; for (const t of (an.dilemmasByTeam || [])) dilOf[t.teamId] = t;

  // 1. Haus
  const diffTxt = st.difficulty === 'easy' ? 'Létt' : st.difficulty === 'hard' ? 'Erfitt' : 'Miðlungs';
  let dags = ''; try { dags = new Date().toLocaleDateString('is-IS', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { dags = new Date().toISOString().slice(0, 10); }
  const head = '<header><h1>RÁS-Leikurinn — kennsluskýrsla</h1><p class="lkp-meta">Leikkóði <b>' + esc(st.code || '') + '</b> · ' + esc(dags) + ' · ' + teams.length + ' lið · ' + rounds + ' kjörtímabil (' + svTimabil(st) + ') · erfiðleikastig: ' + diffTxt + (st.mode === 'studio' ? ' · stjórnstöðvar-hamur' : '') + (opts.thoka ? ' · 🌫️ þoku-leikur (hagtölur með eins kjörtímabils töf, engin framtíðarspá)' : '') + (sattU.length ? ' · 🤝 þjóðarsáttin spiluð' : '') + '</p></header>';

  // 2. Loka-stigatafla + arfleifð (+ afhjúpuð umboð ef leynihlutverk voru í leiknum)
  const hasRole = teams.some((t) => roleOf[t.id]);
  let lb = '<section><h2>🏆 Loka-stigatafla</h2><table class="lkp-tbl"><tr><th>#</th><th>Lið</th>' + (hasRole ? '<th>Umboð (afhjúpað)</th>' : '') + '<th>Stig</th><th>Meðal/100</th><th>Arfleifð ' + svArLok(st) + '</th></tr>';
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
    cmp += '<h3>🏦 Uppsafnað ' + svTimabil(st) + ' (lokastöður, ' + svAr0(st) + '=100 — besta gildi hverrar súlu feitletrað grænt)</h3><table class="lkp-tbl"><tr><th>Lið</th>' + UPP_SPECS.map((c) => '<th>' + esc(c.short) + '</th>').join('') + '</tr>'
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
  try { prompts = teachingPrompts(an, { scenarioEvents: (svidsmyndOf(svOf(st).id).events || []).map((e) => ({ round: e.round, icon: e.icon, title: e.title })), thoka: !!opts.thoka, satt: sattU.length ? sattU : false }); } catch (e) {}
  const obs = lkPrintObservations(teams, lokaOf, polLast, an);
  // ÞOKA: teachingPrompts(thoka) setur tvær þoku-debrief-spurningar (THOKA_HANDBOOK) fremst í spurningarnar — hér aðeins ramma-setning.
  if (opts.thoka) obs.unshift('🌫️ Leikurinn var spilaður <b>í þoku</b>: liðin sáu hagtölur með eins kjörtímabils töf og enga framtíðarspá í forskoðun — tölurnar afhjúpuðust við hvert uppgjör.');
  // ÞJÓÐARSÁTT: samantekt sáttar-lotanna fremst í athugununum (fangaklemman er kjarna-debrief-efni).
  if (sattU.length) obs.unshift('🤝 <b>Þjóðarsáttin</b> var í leiknum: ' + esc(sattSamantekt(st)) + '.');
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

// ── ⏳ HÆGUR HAMUR (async) — „eitt kjörtímabil á dag" í stað 90 mín vinnustofu ──────────────────
// SAMNINGUR VIÐ ÞJÓNINN: /state skilar st.async = { on, cadence:'daglegt'|'2dagar'|'vikulegt',
// hour:0-23 (UTC), nextAt:epoch-sek, secondsToNext:number }. VANTAR eða on:false → ALLT eins og í dag.
// Öll async-hegðun hangir á asyncOf() (skilar null nema on===true) svo async-slökkt sé bit-identískt.
// Leikstjórinn kveikir/slekkur með POST á control-endapunktinn (sama og 'start'/'next'):
//   { action:'async', on, cadence, hour }   ← lykillinn er 'action' (staðfest í server.mjs: const act = b.action).
// Áskrift þátttakanda: POST /<code>/askrift { on } með liðs-tákninu (Bearer, sama og önnur liðs-köll).
const asyncOf = (st) => { const a = (st && st.async) || null; return (a && a.on === true) ? a : null; };
// Þjónninn STYÐUR hæga haminn (st.async er til, kveikt eða slökkt) — skilyrði fyrir uppsetningar-kassa
// leikstjórans. Eldri þjónn (enginn st.async) → kassinn birtist ALDREI og anddyrið er óbreytt.
const asyncStutt = (st) => { const a = (st && st.async) || null; return (a && typeof a.on === 'boolean') ? a : null; };
const ASYNC_TAKTAR = [
  { key: 'daglegt', label: 'Daglegt', tidni: 'á hverjum degi' },
  { key: '2dagar', label: 'Annan hvern dag', tidni: 'annan hvern dag' },
  { key: 'vikulegt', label: 'Vikulega', tidni: 'vikulega' },
];
const asyncTaktur = (k) => ASYNC_TAKTAR.find((t) => t.key === k) || ASYNC_TAKTAR[0];
const ASYNC_VIKUDAGAR = ['sunnudag', 'mánudag', 'þriðjudag', 'miðvikudag', 'fimmtudag', 'föstudag', 'laugardag'];   // þolfall — „á mánudag"
const asyncKlst = (h) => String(Math.max(0, Math.min(23, Number.isFinite(+h) ? Math.round(+h) : 0))).padStart(2, '0') + ':00';
// epoch í sek EÐA ms (sama seiglu-mynstur og Karphús-fresturinn) → ms; ógilt → null.
const asyncMs = (v) => { const n = +v; return Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : null; };
// Mannlegt bil úr sekúndum: „eftir 40 mín" / „eftir 6 klst" / „á morgun" / „eftir 3 daga".
function asyncBil(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return 'alveg að lokast';
  if (s < 3600) return 'eftir ' + Math.max(1, Math.round(s / 60)) + ' mín';
  if (s < 86400) return 'eftir ' + Math.max(1, Math.round(s / 3600)) + ' klst';
  if (s < 172800) return 'á morgun';
  return 'eftir ' + Math.round(s / 86400) + ' daga';
}
// Litakóði borðans: rólegt > 12 klst, gult 2–12 klst, rautt < 2 klst.
const asyncLitur = (sec) => (sec < 7200 ? 'lk-as-raud' : sec <= 43200 ? 'lk-as-gult' : 'lk-as-ro');
// „Lokar í dag kl. 18" / „Lokar á morgun kl. 18" / „Lokar á fimmtudag kl. 18". Ógild dagsetning → '' (þá stendur bilið eitt).
function asyncLokar(ms) {
  if (ms == null) return '';
  const d = new Date(ms); if (isNaN(d.getTime())) return '';
  const dagur = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const munur = Math.round((dagur(d) - dagur(new Date())) / 86400000);
  const kl = ' kl. ' + String(d.getHours()).padStart(2, '0') + (d.getMinutes() ? ':' + String(d.getMinutes()).padStart(2, '0') : '');
  return 'Lokar ' + (munur <= 0 ? 'í dag' : munur === 1 ? 'á morgun' : 'á ' + ASYNC_VIKUDAGAR[d.getDay()]) + kl;
}
// Leikslok: „hversu margar ákvarðanir voru sjálf-læstar". Þjónninn kann að senda þetta SÍÐAR —
// ef talan vantar er skilað '' (ALDREI „undefined"). Nokkur lyklaheiti reynd (samningurinn nefnir ekkert eitt).
function asyncSjalfLaestLina(st) {
  const a = (st && st.async) || null; if (!a) return '';
  const n = [a.sjalfLaest, a.sjalfLaestar, a.autoLocked, a.autoLockCount, st && st.sjalfLaest].find((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (typeof n !== 'number') return '';
  if (n === 0) return '<p class="lk-muted lk-async-loka">⏳ Hægur hamur: engin ákvörðun var sjálf-læst — öll lið luku í tíma.</p>';
  const eintala = (n % 10 === 1 && n % 100 !== 11);   // 1, 21, 31… = eintala; 11 = fleirtala
  return '<p class="lk-muted lk-async-loka">⏳ Hægur hamur: <b>' + n + '</b> ' + (eintala ? 'ákvörðun var sjálf-læst' : 'ákvarðanir voru sjálf-læstar') + ' við lokun lotu.</p>';
}

export function mountLeikur(root) {
  const S = { code: null, role: null, token: null, teamId: null, state: null, draft: {}, poll: null, busy: false, view: null, editDraft: null, editRoles: false, editStudio: true, studioTab: 0, dials: null, unlocked: false, stTimer: null, stRound: null, dragging: null, localTouched: new Set(), studioBuiltSig: null, pushTimer: null, timerDeadline: null, timerInt: null, user: null, openDetails: new Set(), hbRound: null, kortPrev: {}, polPrevStig: null, tickerSig: null, ktdSig: null, ktdPrev: null, sagaSeeded: false,
    // VERK B: me=/api/leikur/me (leikstjóra-leyfi), onb={step} þegar uppsetningar-vísirinn er opinn, onbSig/onbScrolled = endurteiknunar-/skrun-vörn, onbSeen = lotu-fallback ef localStorage er læst, bot-læsing f. æfingalið (varaleið).
    me: null, onb: null, onbSig: null, onbScrolled: null, onbSeen: false, botLocking: false, botLockedRound: null, joinPrefill: '',
    // ÞJÓÐARSÁTT: eigið val þessarar lotu (blint), lotu-vörður og Karphús-frestur f. niðurtalninguna.
    sattDraft: null, sattRound: null, karphusDeadline: null,
    // RÁÐHERRASKIPTING: picker opinn handvirkt (lifir poll-endurteiknun), síðasta sæti sem sást (localTouched hreinsað við skipti),
    // „sæti nýtekið"-flagg (fyrsta push ráðuneytisins) og toast-tímamælir.
    rhPickerOpen: false, rhMittSeen: undefined, rhSeatJust: false, rhToastTimer: null,
    // ⏳ HÆGUR HAMUR: asyncDeadline = algild tímamörk lotunnar (ms, sama mynstur og S.timerDeadline/S.karphusDeadline),
    // asyncDraft/asyncSig = drög leikstjórans í uppsetningar-kassanum (lifa 2,5 s poll-endurteiknun; endursett þegar
    // ÞJÓNS-gildin breytast, þ.e. eftir vistun), asyncBusy = vistun í gangi, askriftBusy = áskriftar-kall í gangi.
    asyncDeadline: null, asyncDraft: null, asyncSig: null, asyncBusy: false, askriftBusy: false };
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
  // VERK B: inngöngu-hlekkur leikstjóra (?join=KÓÐI) → lending með kóðann forfylltan (enginn leikur opnaður, engin tákn).
  S.joinPrefill = (u.searchParams.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

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
  // ÞJÓÐARSÁTT: val-hnapparnir (data-satt) — event-delegation á root (lifir innerHTML-endurteiknanir), engir inline handlers.
  root.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-satt]');
    if (!btn || !root.contains(btn) || S.role !== 'team') return;
    const st = S.state;
    if (!st || st.phase !== 'decide' || !(st.satt && st.satt.on)) return;
    if (st.you && st.you.locked && !S.unlocked) return;   // GALLI B: læst lið má ekki pushDraft-a þegjandi
    if (!rhCanPolicy(st)) return;   // RÁÐHERRASKIPTING: sáttar-valið er forsætisráðherrans (þjónn hafnar hvort eð er — ekkert sent)
    S.sattDraft = btn.dataset.satt === 'satt' ? 'satt' : 'saekja';
    sattPush(st);
    if (st.mode === 'studio') renderStudio(st); else render();
  });
  // RÁÐHERRASKIPTING: ríkisstjórnarfundurinn (sæta-flísar) + „Ríkisstjórnin"/„skipta"/„Loka" — event-delegation á root
  // (lifir innerHTML-endurteiknanir), engir inline handlers. Sæti tekið/sleppt um POST /saeti; picker-ástand í S.rhPickerOpen.
  // Nýtekið sæti → eitt pushDraft svo þjónninn fái sleða ráðuneytisins strax (byrjunar-/carry-forward-gildi) þótt enginn hreyfi þá.
  root.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest || S.role !== 'team') return;
    const take = t.closest('[data-rh-take]'), rel = t.closest('[data-rh-release]'), open = t.closest('[data-rh-open]'), close = t.closest('[data-rh-close]');
    if (take && root.contains(take)) {
      if (take.disabled) return;
      rhSaeti(take.dataset.rhTake).then(() => { if (S.rhSeatJust) { S.rhSeatJust = false; if (S.state && S.state.mode === 'studio' && S.dials && root.querySelector('#lk-st-sliders')) pushDraft(S.state); } });
      return;
    }
    if (rel && root.contains(rel)) { rhSaeti(null); return; }
    if (open && root.contains(open)) { S.rhPickerOpen = true; render(); return; }
    if (close && root.contains(close)) { S.rhPickerOpen = false; render(); }
  });
  // ⏳ HÆGUR HAMUR: delegation — uppsetning leikstjóra (#lk-as-*) og áskriftar-gátreitur liðsins (#lk-askrift).
  // Event-delegation á root svo stýringarnar lifi 2,5 s poll-endurteiknanir af; ENGIR inline handlers (CSP).
  // change bólar (ólíkt toggle) → dugir á root. Drög leikstjórans lifa í S.asyncDraft, ekki í DOM-inu.
  root.addEventListener('change', (e) => {
    const t = e.target; if (!t || !t.id) return;
    if (t.id === 'lk-as-on' || t.id === 'lk-as-cadence' || t.id === 'lk-as-hour') {
      if (S.role !== 'fac' || !S.asyncDraft) return;
      if (t.id === 'lk-as-on') S.asyncDraft.on = !!t.checked;
      else if (t.id === 'lk-as-cadence') S.asyncDraft.cadence = asyncTaktur(t.value).key;
      else S.asyncDraft.hour = Math.max(0, Math.min(23, Math.round(+t.value) || 0));
      const h = root.querySelector('#lk-as-help'); if (h) h.textContent = asyncHjalp(S.asyncDraft);
      return;
    }
    if (t.id === 'lk-askrift' && S.role === 'team') askriftSet(!!t.checked);
  });
  root.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('#lk-as-save');
    if (b && root.contains(b) && S.role === 'fac') asyncSave();
  });
  function startPoll() { stopPoll(); refresh(); S.poll = setInterval(refresh, 2500); S.timerInt = setInterval(tickTimer, 1000); }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } if (S.timerInt) { clearInterval(S.timerInt); S.timerInt = null; } }
  // #3 Umferðar-klukka (bara sjónræn): tikkar staðbundið úr S.timerDeadline; við 0 → „útrunninn" (engin auto-læsing).
  const fmtTimer = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  // ⏳ HÆGUR HAMUR: umferðar-klukkan er ÓVIRK þegar async er á — tvær misvísandi klukkur mega aldrei sjást
  // saman. Fresta-borðinn (asyncBordi) tekur við hlutverkinu. async slökkt → nákvæmlega óbreytt hegðun.
  function timerBadge(st) { if (asyncOf(st)) return ''; if (S.timerDeadline == null && st.secondsLeft == null) return ''; const rem = S.timerDeadline != null ? Math.max(0, Math.round((S.timerDeadline - Date.now()) / 1000)) : Math.max(0, st.secondsLeft); return '<span class="lk-timer" id="lk-timer">⏱️ ' + fmtTimer(rem) + '</span>'; }
  function tickTimer() {
    if (S.asyncDeadline != null) asyncBordiSync();   // ⏳ HÆGUR HAMUR: mjúk uppfærsla borðans (no-op þegar async er af — S.asyncDeadline er þá null)
    // ÞJÓÐARSÁTT: Karphús-niðurtalningin (deadline-mynstrið, sjá S.karphusDeadline í refresh) — óháð umferðar-klukkunni.
    const ke = root.querySelector('#lk-karphus-t');
    if (ke && S.karphusDeadline != null) { const rem = Math.max(0, Math.round((S.karphusDeadline - Date.now()) / 1000)); ke.textContent = fmtTimer(rem) + ' eftir'; }
    const el = root.querySelector('#lk-timer'); if (!el) return;
    if (S.timerDeadline == null) { el.style.display = 'none'; return; }
    const rem = Math.max(0, Math.round((S.timerDeadline - Date.now()) / 1000));
    if (rem <= 0) { el.textContent = '⏰ Tími útrunninn'; el.classList.add('out'); }
    else { el.textContent = '⏱️ ' + fmtTimer(rem); el.classList.toggle('out', false); el.classList.toggle('low', rem <= 30); }
  }

  async function refresh() {
    if (!S.code) return;
    // RÁÐHERRASKIPTING: ?h=<handle> á liðs-pollinu → þjónninn skilar st.radherrar.mitt (sæti ÞESSA vafra); skaðlaust þótt rofinn sé af.
    const rhH = S.role === 'team' ? rhHandle(S.code) : null;
    const { status, json } = await api('/' + S.code + '/state' + (rhH ? '?h=' + encodeURIComponent(rhH) : ''), { token: S.token });
    if (status === 404) { stopPoll(); root.innerHTML = card('Leikur fannst ekki', '<a class="lk-btn" href="/leikur/">Til baka</a>'); return; }
    S.state = json;
    // Klukka: festa á ALGILD tímamörk (epoch) → stöðug milli poll-a og reload-a (engin endur-ræsing). Fallback á secondsLeft f. eldri þjón.
    S.timerDeadline = (json.phase === 'decide' && json.deadlineTs) ? json.deadlineTs * 1000 : ((json.phase === 'decide' && json.secondsLeft != null) ? Date.now() + json.secondsLeft * 1000 : null);
    // ⏳ HÆGUR HAMUR: lokun lotunnar á ALGILDUM tímamörkum (nextAt, sek eða ms) með secondsToNext sem varaleið.
    // Umferðar-klukkan er slökkt á meðan (timerBadge skilar '' hvort eð er) svo aðeins EIN klukka sé á skjánum.
    const _as = asyncOf(json);
    S.asyncDeadline = (_as && json.phase === 'decide')
      ? (asyncMs(_as.nextAt) != null ? asyncMs(_as.nextAt) : (typeof _as.secondsToNext === 'number' ? Date.now() + Math.max(0, _as.secondsToNext) * 1000 : null))
      : null;
    if (_as) S.timerDeadline = null;
    // ÞJÓÐARSÁTT: Karphús-frestur (epoch, sek eða ms frá verk 2) → niðurtalningin í borðanum (tickTimer).
    const _kh = json.satt && json.satt.karphus;
    S.karphusDeadline = (json.phase === 'decide' && _kh && _kh.open)
      ? (_kh.until ? (+_kh.until < 1e12 ? +_kh.until * 1000 : +_kh.until) : (_kh.secondsLeft != null ? Date.now() + Math.max(0, +_kh.secondsLeft) * 1000 : null))
      : null;
    if (S.role === 'team' && S.teamId == null && json.you && json.you.teamId != null) {
      S.teamId = json.you.teamId;
      try { localStorage.setItem(lsTeam(S.code), JSON.stringify({ token: S.token, teamId: S.teamId })); } catch (e) {}
    }
    render();
    if (S.role === 'fac') botAutoLock(json);   // VERK B: æfingalið (varaleið án /bot-team) læsir hlutlausum ákvörðunum úr vafra leikstjóra
  }

  async function act(fn) { if (S.busy) return; S.busy = true; try { await fn(); } finally { S.busy = false; } await refresh(); }

  // ── Aðgerðir ──
  // VERK B: villutexti /create — 'leikstjori' (verk A) ÁSAMT eldra 'kerfisstjori' → sama skilaboð + hlekkur á sölusíðu/demo.
  function createErrHtml(err, status) {
    if (err === 'leikstjori' || err === 'kerfisstjori') return 'Aðeins leikstjórar geta stofnað leik. <a href="/leikur/leikstjori/">Sækja um leikstjóra-aðgang</a> — eða <a href="/leikur/demo/">prófa demo-ið</a> á meðan.';
    if (err === 'no-d1') return 'Þjónninn svarar ekki (gagnagrunnur). Reyndu aftur eftir andartak.';
    if (err === 'invalid') return 'Stillingar leiksins stóðust ekki villuprófun.';
    if (err === 'svidsmynd') return 'Þjónninn þekkir ekki þessa sviðsmynd (líklega eldri útgáfa af vefnum). Endurhlaðið síðuna og reynið aftur.';
    return 'Villa við að stofna leik' + (err ? ' (' + esc(err) + ')' : status ? ' (' + status + ')' : '') + '.';
  }
  // Stillingar sem valdar voru við stofnun → vafrinn man þær per leik (lobby-spjald + vísir) og „síðast notað" (forfylling lendingar).
  function rememberFacCfg(code, cfg) { try { localStorage.setItem(lsFacCfg(code), JSON.stringify(cfg)); if (!cfg.custom) localStorage.setItem(LS_FACCFG_LAST, JSON.stringify(cfg)); } catch (e) {} }
  function lastFacCfg() { try { return JSON.parse(localStorage.getItem(LS_FACCFG_LAST) || 'null'); } catch (e) { return null; } }
  async function createGame() {
    const roles = !!(root.querySelector('#lk-roles') && root.querySelector('#lk-roles').checked);
    const studio = !!(root.querySelector('#lk-studio') && root.querySelector('#lk-studio').checked);
    const timerMin = +((root.querySelector('#lk-timer-min') || {}).value || 0);
    const body = {}; if (roles) body.roles = true; if (studio) body.mode = 'studio'; if (timerMin > 0) body.timerSec = Math.round(timerMin * 60);
    // SVIÐSMYND: sent AÐEINS ef hún er ekki sjálfgefna — þá er config eldri leikja og nýrra 'island2000'-leikja eins.
    const svidsmynd = ((root.querySelector('#lk-svidsmynd') || {}).value) || SVIDSMYND_SJALFGEFIN;
    if (svidsmynd !== SVIDSMYND_SJALFGEFIN && SVIDSMYNDIR[svidsmynd]) body.svidsmynd = svidsmynd;
    const diff = (root.querySelector('#lk-difficulty') || {}).value; if (diff === 'easy' || diff === 'hard') body.difficulty = diff; // Fasi E
    const surprise = !!(root.querySelector('#lk-surprise') && root.querySelector('#lk-surprise').checked); if (surprise) body.surprise = true; // Fasi „skemmtun 3"
    const thoka = !!(root.querySelector('#lk-thoka') && root.querySelector('#lk-thoka').checked); if (thoka) body.thoka = true; // ÞOKA: config.thoka (þjónninn síar /state f. liðin)
    const satt = !!(root.querySelector('#lk-satt') && root.querySelector('#lk-satt').checked); if (satt) body.satt = true; // ÞJÓÐARSÁTT: config.satt (fangaklemma í KT3+KT6)
    const radherrar = studio && !!(root.querySelector('#lk-radherrar') && root.querySelector('#lk-radherrar').checked); if (radherrar) body.radherrar = true; // RÁÐHERRASKIPTING: config.radherrar (studio-only; þjónninn MERGE-ar per sleða)
    const errEl = root.querySelector('#lk-create-err'); if (errEl) errEl.textContent = 'Stofna leik…';
    const { status, json } = await api('/create', { method: 'POST', body });
    if (!json.code) { if (errEl) errEl.innerHTML = createErrHtml(json.error, status); return; }
    localStorage.setItem(lsFac(json.code), json.facToken);
    rememberFacCfg(json.code, { mode: studio ? 'studio' : 'classic', difficulty: body.difficulty || 'medium', timerMin: timerMin > 0 ? Math.round(timerMin) : 0, surprise, roles, thoka, satt, radherrar, svidsmynd });
    location.href = '/leikur/?g=' + json.code;
  }
  async function joinGame(joinCode, name) {
    const { status, json } = await api('/' + joinCode + '/join', { method: 'POST', body: { name } });
    if (status !== 200 || !json.teamToken) { alert(json.error === 'started' ? 'Leikur er þegar byrjaður.' : json.error === 'not-found' ? 'Kóði fannst ekki.' : json.error === 'nemandi' ? 'Aðeins nemendur (og leikstjórar) geta gengið í lið — Karp virkjar nemanda-aðgang (kennarinn sendir þátttakendalista á hjalp@karp.is).' : 'Villa við inngöngu.'); return; }
    localStorage.setItem(lsTeam(joinCode), JSON.stringify({ token: json.teamToken, teamId: json.teamId }));
    location.href = '/leikur/?g=' + joinCode;
  }
  // ── VERK B: æfingalið (bot) — leikstjóri prófar hringrásina ein/n ──
  // Þjóns-leiðin: POST /<code>/bot-team (fac-tákn) → þjónninn stofnar bot-lið (config.bots) og auto-læsir hlutlausar ákvarðanir ({})
  // við start/next/resolve (ÚTFÆRT í server.mjs, lockBots). VARALEIÐ ef þjónn er eldri (400 bad-request): venjuleg innganga um eigin
  // lotu (þjónninn hleypir nemanda/kerfisstjóra/leikstjóra inn) — vafrinn geymir liðs-táknið og botAutoLock læsir {} í hverri decide-lotu.
  // Uppgjörið sjálft þarf HVORUGT: „ósend = tómt" í resolve → sleðar óbreyttir; læsingin er aðeins svo ✅ sjáist í roster.
  function botLocal() { try { return JSON.parse(localStorage.getItem(lsBot(S.code)) || 'null'); } catch (e) { return null; } }
  // bot-merki: þjóns-flaggið (state.teams[].bot, config.bots) er sannleikurinn; localStorage = varaleið (join-fallback). EKKI nafna-heuristík — raun-lið mætti heita „Æfingalið“.
  function isBotTeam(t) { if (!t) return false; if (t.bot === true) return true; const b = botLocal(); return !!(b && b.teamId === t.id); }
  async function addBotTeam() {
    const errEl = root.querySelector('#lk-bot-err'), btn = root.querySelector('#lk-bot');
    if (btn) btn.disabled = true; if (errEl) errEl.textContent = 'Bæti við æfingaliði…';
    const r = await api('/' + S.code + '/bot-team', { method: 'POST', body: { name: BOT_NAME }, token: S.token });
    if (r.status === 200 && r.json && r.json.teamId) { try { localStorage.setItem(lsBot(S.code), JSON.stringify({ teamId: r.json.teamId, token: null })); } catch (e) {} await refresh(); return; }
    let msg;
    if (r.status === 400 || r.status === 404 || r.status === 405) {
      const j = await api('/' + S.code + '/join', { method: 'POST', body: { name: BOT_NAME } });
      if (j.status === 200 && j.json && j.json.teamToken) { try { localStorage.setItem(lsBot(S.code), JSON.stringify({ teamId: j.json.teamId, token: j.json.teamToken })); } catch (e) {} await refresh(); return; }
      const e2 = j.json && j.json.error;
      msg = e2 === 'nemandi' ? 'Skráðu þig inn sem leikstjóri (sama reikning og stofnaði leikinn) til að bæta við æfingaliði — eða bíddu þjóns-viðbótar /bot-team.' : e2 === 'started' ? 'Leikurinn er þegar byrjaður.' : 'Tókst ekki að bæta við æfingaliði' + (e2 ? ' (' + e2 + ')' : '') + '.';
    } else {
      const e1 = r.json && r.json.error;
      msg = e1 === 'auth' ? 'Leikstjóra-táknið gildir ekki fyrir þennan leik.' : e1 === 'started' ? 'Leikurinn er þegar byrjaður.' : 'Tókst ekki að bæta við æfingaliði' + (e1 ? ' (' + e1 + ')' : '') + '.';
    }
    if (errEl) errEl.textContent = msg; if (btn) btn.disabled = false;
  }
  async function botAutoLock(st) {
    if (S.role !== 'fac' || !st || st.phase !== 'decide' || S.botLocking) return;
    const b = botLocal(); if (!b || !b.token) return;   // þjóns-bot (token:null) læsir þjónninn sjálfur
    const row = (st.lockRoster || []).find((r) => r.teamId === b.teamId); if (!row || row.locked || S.botLockedRound === st.round) return;
    S.botLocking = true;
    try { const r = await api('/' + S.code + '/decisions', { method: 'POST', body: { round: st.round, decisions: {}, locked: true }, token: b.token }); if (r.status === 200) S.botLockedRound = st.round; } catch (e) {} finally { S.botLocking = false; }
  }
  const control = (action) => act(() => api('/' + S.code + '/control', { method: 'POST', body: { action }, token: S.token }));
  // PERSÓNUVERND: eyða leik strax (leikstjóri). Staðfesting → POST /<code>/erase → hreinsa vafra-lykla leiksins → lending.
  // Þjónninn svarar 409 'running' ef leikur er í gangi (stöðva fyrst), 401 ef táknið gildir ekki, 404 ef þegar eytt (idempotent).
  async function eraseGame() {
    if (S.busy) return;
    const ok = typeof confirm === 'function' ? confirm('Eyða leiknum ' + S.code + ' núna?\n\nLeikurinn, öll lið (liðsheiti), ákvarðanir og uppgjör hverfa endanlega úr gagnagrunninum. Þetta er ekki hægt að afturkalla.') : true;
    if (!ok) return;
    const errEl = root.querySelector('#lk-erase-err'), btn = root.querySelector('#lk-erase');
    if (btn) btn.disabled = true; if (errEl) errEl.textContent = 'Eyði leik…';
    S.busy = true;
    let r; try { r = await api('/' + S.code + '/erase', { method: 'POST', token: S.token }); } catch (e) { r = { status: 0, json: null }; } finally { S.busy = false; }
    if (r.status === 200 || r.status === 404) {
      stopPoll();
      try { localStorage.removeItem(lsFac(S.code)); localStorage.removeItem(lsFacCfg(S.code)); localStorage.removeItem(lsBot(S.code)); localStorage.removeItem(lsTeam(S.code)); } catch (e) {}
      root.innerHTML = card('🗑️ Leik eytt', '<p>Leiknum <b>' + esc(S.code) + '</b> og öllu sem honum tilheyrði (lið, ákvarðanir, uppgjör) hefur verið eytt úr gagnagrunninum.</p><a class="lk-btn" href="/leikur/">Til baka</a>');
      return;
    }
    const e = r.json && r.json.error;
    if (errEl) errEl.textContent = e === 'running' ? 'Leikurinn er í gangi — stöðvaðu hann fyrst (⏹️ Stöðva leik) og eyddu svo.' : e === 'auth' ? 'Leikstjóra-táknið gildir ekki fyrir þennan leik.' : 'Tókst ekki að eyða leik' + (e ? ' (' + e + ')' : '') + ' — reyndu aftur.';
    if (btn) btn.disabled = false;
  }
  // ÞJÓÐARSÁTT: viðvörun ef læst án afstöðu (telst 'saekja') + valið fylgir decisions-body (decisions.satt).
  // RÁÐHERRASKIPTING: body.handle fylgir (rofinn er studio-only svo classic-læsing er aldrei gátuð — handle samt sent, skaðlaust).
  const submitDecisions = () => { if (!sattLockCheck(S.state)) return; return act(async () => { await api('/' + S.code + '/decisions', { method: 'POST', body: { round: S.state.round, decisions: (S.state.satt && S.state.satt.on && S.state.satt.lota) ? { ...S.draft, satt: sattValAf(S.state) } : S.draft, locked: true, handle: rhHandle(S.code) }, token: S.token }); S.unlocked = false; }); };

  // ── ⏳ HÆGUR HAMUR (async) — viðmót ──────────────────────────────────────────────────────────
  // Þrennt: (1) uppsetningar-kassi leikstjóra í ANDDYRINU, (2) fresta-borði í lotu (öllum sýnilegur),
  // (3) áskriftar-val þátttakanda (opt-in, ALDREI forvalið). Allt hangir á asyncOf()/asyncStutt():
  // eldri þjónn (ekkert st.async) eða on:false → hver fall skilar '' og viðmótið er óbreytt frá í dag.
  // Engir inline handlers (CSP) — stýringarnar hanga á event-delegation á root (sjá „HÆGUR HAMUR: delegation").

  // Sekúndur til lokunar: ALGILD tímamörk (S.asyncDeadline) fyrst, secondsToNext úr /state sem varaleið.
  const asyncRem = (a) => (S.asyncDeadline != null ? Math.max(0, Math.round((S.asyncDeadline - Date.now()) / 1000)) : Math.max(0, Math.round((a && +a.secondsToNext) || 0)));
  // „<b>Lokar á morgun kl. 18</b> · eftir 20 klst" — allt vél-smíðað, esc() samt á strengjunum.
  function asyncBordiTxt(sec) {
    const lok = asyncLokar(S.asyncDeadline), bil = asyncBil(sec);
    return lok ? '<b>' + esc(lok) + '</b> <span class="lk-as-sep">·</span> ' + esc(bil) : '<b>' + esc('Lokar ' + bil) + '</b>';
  }
  // Borðinn er BYGGÐUR inn í innerHTML hvers view-s en TEXTINN uppfærður á staðnum (asyncBordiSync) svo
  // niðurtalningin lifi af Stjórnstöðina, sem endurbyggir sig aðeins þegar undirskriftin breytist.
  function asyncBordi(st, hlutverk) {
    const a = asyncOf(st); if (!a || st.phase !== 'decide') return '';
    const sec = asyncRem(a);
    const sub = hlutverk === 'team'
      ? 'Hægur hamur — þú getur breytt stillingunum þínum fram að lokun. Læsist sjálfkrafa með því sem þá stendur.'
      : hlutverk === 'fac'
        ? 'Hægur hamur — ný lota opnast sjálfkrafa ' + asyncTaktur(a.cadence).tidni + ' kl. ' + asyncKlst(a.hour) + '. Lið sem hafa ekki læst fá sínar núverandi stillingar læstar sjálfkrafa.'
        : 'Hægur hamur — lotan lokast sjálfkrafa og gerist þá upp.';
    return '<div class="lk-async-bordi ' + asyncLitur(sec) + '" id="lk-async-bordi" role="status" aria-live="polite">'
      + '<span class="lk-as-ic" aria-hidden="true">⏳</span>'
      + '<span class="lk-as-txt">' + asyncBordiTxt(sec) + '</span>'
      + '<span class="lk-as-sub">' + esc(sub) + '</span></div>';
  }
  function asyncBordiSync() {
    const el = root.querySelector('#lk-async-bordi'); if (!el) return;
    const a = asyncOf(S.state); if (!a) return;
    const sec = asyncRem(a), t = el.querySelector('.lk-as-txt');
    if (t) t.innerHTML = asyncBordiTxt(sec);
    el.classList.remove('lk-as-ro', 'lk-as-gult', 'lk-as-raud'); el.classList.add(asyncLitur(sec));
  }

  // Drög leikstjórans lifa 2,5 s pollið af; endursett AÐEINS þegar þjóns-gildin sjálf breytast (þ.e. eftir vistun).
  function asyncDraftAf(a) {
    const sig = (a.on === true ? 1 : 0) + '|' + (a.cadence || '') + '|' + (a.hour == null ? '' : a.hour);
    if (S.asyncSig !== sig || !S.asyncDraft) { S.asyncSig = sig; S.asyncDraft = { on: a.on === true, cadence: asyncTaktur(a.cadence).key, hour: Number.isInteger(a.hour) ? Math.max(0, Math.min(23, a.hour)) : 18 }; }
    return S.asyncDraft;
  }
  const asyncHjalp = (d) => d.on
    ? 'Ný lota opnast sjálfkrafa kl. ' + asyncKlst(d.hour) + ' ' + asyncTaktur(d.cadence).tidni + '. Lið sem hafa ekki læst fá sínar núverandi stillingar læstar sjálfkrafa — enginn dettur út. Þú þarft ekki að vera viðstödd/viðstaddur, og ⏱️ umferðar-klukkan er óvirk á meðan.'
    : 'Slökkt — leikurinn er keyrður í rauntíma og þú opnar hverja lotu handvirkt (venjuleg 90 mín vinnustofa).';
  function asyncFacCard(st) {
    const a = asyncStutt(st); if (!a || S.role !== 'fac') return '';   // eldri þjónn (ekkert st.async) → enginn kassi
    const d = asyncDraftAf(a);
    const taktar = ASYNC_TAKTAR.map((t) => '<option value="' + esc(t.key) + '"' + (t.key === d.cadence ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('');
    const klst = Array.from({ length: 24 }, (_, h) => '<option value="' + h + '"' + (h === d.hour ? ' selected' : '') + '>' + asyncKlst(h) + '</option>').join('');
    const stada = a.on === true
      ? '<p class="lk-as-stada">✅ <b>Virkur</b> — ný lota opnast ' + esc(asyncTaktur(a.cadence).tidni) + ' kl. ' + esc(asyncKlst(a.hour)) + '.</p>'
      : '';
    return '<div class="lk-card lk-as-fac" id="lk-async-card"><h2>⏳ Hægur hamur (async)</h2>'
      + '<p class="lk-muted lk-as-intro">Spilið eitt kjörtímabil á dag í viku í stað 90 mín vinnustofu. Loturnar opnast sjálfkrafa — þú þarft ekki að vera viðstödd/viðstaddur.</p>'
      + stada
      + '<label class="lk-as-row"><input type="checkbox" id="lk-as-on"' + (d.on ? ' checked' : '') + '/>Kveikja á hægum ham</label>'
      + '<div class="lk-as-row2">'
        + '<label>🔁 Taktur: <select id="lk-as-cadence">' + taktar + '</select></label>'
        + '<label>🕒 Klukkustund: <select id="lk-as-hour">' + klst + '</select> <span class="lk-muted">(íslenskur tími)</span></label>'
      + '</div>'
      + '<p class="lk-as-help" id="lk-as-help">' + esc(asyncHjalp(d)) + '</p>'
      + '<button class="lk-btn" id="lk-as-save">Vista hægan ham</button>'
      + '<p class="lk-muted lk-as-fine">Þátttakendur geta sjálfir valið að fá póst-áminningu þegar ný lota opnast — það er aldrei sjálfvalið.</p>'
      + '<div id="lk-as-err" class="lk-err" aria-live="polite"></div></div>';
  }
  async function asyncSave() {
    if (S.asyncBusy) return;
    const d = S.asyncDraft || { on: false, cadence: 'daglegt', hour: 18 };
    const errEl = root.querySelector('#lk-as-err'), btn = root.querySelector('#lk-as-save');
    if (btn) btn.disabled = true; if (errEl) { errEl.className = 'lk-err'; errEl.textContent = 'Vista…'; }
    S.asyncBusy = true;
    // Þjónninn les aðgerðina úr b.action (server.mjs: `const act = b.action`) — eins og start/next/resolve.
    let r; try { r = await api('/' + S.code + '/control', { method: 'POST', body: { action: 'async', on: !!d.on, cadence: d.cadence, hour: d.hour }, token: S.token }); } catch (e) { r = { status: 0, json: null }; } finally { S.asyncBusy = false; }
    if (r.status === 200) {
      S.asyncSig = null;   // næsta teikning sækir þjóns-gildin (drögin voru samþykkt)
      await refresh();
      const ok = root.querySelector('#lk-as-err');
      if (ok) { ok.className = 'lk-muted lk-as-ok'; ok.textContent = d.on ? '✅ Hægur hamur virkur — ný lota opnast kl. ' + asyncKlst(d.hour) + ' ' + asyncTaktur(d.cadence).tidni + '.' : '✅ Hægur hamur slökktur — leikurinn er aftur í rauntíma.'; }
      return;
    }
    const e = r.json && r.json.error, b2 = root.querySelector('#lk-as-save'); if (b2) b2.disabled = false;
    const e2 = root.querySelector('#lk-as-err');
    if (e2) { e2.className = 'lk-err'; e2.textContent = e === 'auth' ? 'Leikstjóra-táknið gildir ekki fyrir þennan leik.' : 'Þjónninn tók ekki við stillingunni' + (e ? ' (' + e + ')' : r.status ? ' (' + r.status + ')' : '') + ' — reyndu aftur.'; }
  }

  // Áskrift (opt-in, GDPR): birtist AÐEINS þegar hægur hamur er á OG notandinn er í liði.
  // st.askrift kemur aðeins frá þjóninum fyrir INNSKRÁÐ lið → vantar = óinnskráð(ur).
  function asyncAskriftHtml(st) {
    const a = asyncOf(st); if (!a || S.role !== 'team') return '';
    const ask = (st && st.askrift && typeof st.askrift === 'object') ? st.askrift : null;
    if (!ask) return '<div class="lk-card lk-as-askrift"><p class="lk-as-askrift-h">✉️ Póst-áminning þegar ný lota opnast</p>'
      + '<p class="lk-muted lk-as-fine">Skráðu þig inn til að fá póst-áminningu. <a href="' + esc(loginHref()) + '">Skrá inn</a></p></div>';
    const on = ask.on === true;   // ALDREI forvalið — hakað AÐEINS ef notandinn hefur sjálfur kveikt áður (þjóns-sannleikur)
    return '<div class="lk-card lk-as-askrift">'
      + '<label class="lk-as-askrift-h"><input type="checkbox" id="lk-askrift"' + (on ? ' checked' : '') + '/>✉️ Sendu mér póst þegar ný lota opnast</label>'
      + '<p class="lk-muted lk-as-fine">Þá vistum við netfangið þitt tengt þessum leik. Þú getur afskráð þig hvenær sem er; gögnunum er eytt þegar leiknum lýkur. <a href="/leikur/personuvernd/">Persónuvernd í leiknum</a></p>'
      + '<span class="lk-muted lk-as-msg" id="lk-askrift-msg" aria-live="polite"></span></div>';
  }
  async function askriftSet(on) {
    if (S.askriftBusy) return; S.askriftBusy = true;
    const m = root.querySelector('#lk-askrift-msg'); if (m) m.textContent = 'Vista…';
    let r; try { r = await api('/' + S.code + '/askrift', { method: 'POST', body: { on: !!on }, token: S.token }); } catch (e) { r = { status: 0, json: null }; } finally { S.askriftBusy = false; }
    await refresh();   // gátreiturinn speglar þjóns-stöðuna eftir kallið (mistókst → fer sjálfkrafa til baka)
    const m2 = root.querySelector('#lk-askrift-msg'); if (!m2) return;
    if (r.status === 200) { m2.textContent = on ? '✅ Skráð — þú færð póst þegar ný lota opnast.' : '✅ Afskráð — við sendum þér ekki fleiri áminningar.'; return; }
    const e = r.json && r.json.error;
    m2.textContent = e === 'login' ? 'Skráðu þig inn til að fá póst-áminningu.' : 'Tókst ekki að vista' + (e ? ' (' + e + ')' : r.status ? ' (' + r.status + ')' : '') + ' — reyndu aftur.';
    // Stjórnstöðin endurbyggir sig ekki við poll → færa gátreitinn sjálfan til baka svo hann ljúgi ekki um vistaða stöðu.
    const cb = root.querySelector('#lk-askrift'); if (cb) cb.checked = !on;
  }

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
    const ro = !rhCanPolicy(st);   // RÁÐHERRASKIPTING: stórar ákvarðanir = forsætisráðherrans; aðrir sjá valið read-only
    const popTag = (v) => (v == null || v === 0) ? '' : ' <span style="color:#b98cff;font-size:11px;white-space:nowrap">🗳️ fylgi ' + (v > 0 ? '+' : '') + v + '</span>';
    const body = P.available.map((p) => {
      const draft = S.policyDraft ? S.policyDraft[p.id] : undefined;
      if (p.kind === 'toggle') {
        const on = draft != null ? draft : (P.states[p.id] === true);
        return '<div style="margin:10px 0"><label style="cursor:pointer;font-size:13.5px;display:flex;align-items:flex-start;gap:7px"><input type="checkbox" data-pol="' + p.id + '"' + (on ? ' checked' : '') + (ro ? ' disabled' : '') + ' style="margin-top:2px"/><span><b>' + p.icon + ' ' + esc(p.onLabel || p.label) + '</b>' + (p.pop ? popTag(p.pop.on) : '') + '</span></label><p style="font-size:12px;color:var(--muted);margin:3px 0 0 24px">' + esc(p.desc) + '</p></div>';
      }
      const cur = draft != null ? draft : (P.states[p.id] || null);
      const opts = (p.options || []).map((o) => '<span class="lk-opt' + (cur === o.key ? ' sel' : '') + (ro ? ' lk-rh-ro' : '') + '" data-polc="' + p.id + '" data-polk="' + o.key + '"' + (ro ? '' : ' role="button" tabindex="0"') + '>' + esc(o.label) + (p.pop ? popTag(p.pop[o.key]) : '') + '</span>').join(' ');
      return '<div style="margin:10px 0"><b>' + p.icon + ' ' + esc(p.label) + '</b><p style="font-size:12px;color:var(--muted);margin:3px 0 6px">' + esc(p.desc) + '</p><div>' + opts + '</div></div>';
    }).join('');
    return '<div class="lk-card" style="border-left:3px solid #e8c14a"><h2>🏛️ Stórar ákvarðanir</h2><p class="lk-muted" style="font-size:12px;margin:0 0 4px">Umdeildar tvíkosta-ákvarðanir úr hagsögunni — sögulega réttilega tímasettar.</p>' + (ro ? '<p class="lk-rh-pmonly">🏛️ forsætisráðherra velur</p>' : '') + body + '</div>';
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
    // ÞOKA: þjónninn (thokaSia) skiptir deltas N-1 út fyrir deltas N-2 (tof:true, deltaLota) eða null → tooltip-inn sýnir
    // töfðu flísarnar SJÁLFUR (arfleifðar-spjaldið fær null í þoku) með skýru „birt með töf"-merki, ella „koma í ljós við uppgjör".
    const fog = thokaOn(st);
    return '<div class="lk-pb-row">' + bs.map((b) => {
      const name = esc(b.label) + (b.choice ? ': ' + esc(b.choice) : '');   // choice-ákvarðanir sýna valið („Icesave: Greiða")
      const ch = deltaChips(b.deltas);
      const fogTof = fog && (b.tof || b.deltaLota != null);
      const ahrif = fogTof
        ? (ch ? '🌫️ Áhrif birt með töf (kjörtímabil ' + (b.deltaLota != null ? +b.deltaLota : '?') + '): <span style="display:block;margin-top:3px">' + ch + '</span>Textinn er' : '🌫️ Áhrifin koma í ljós við uppgjör (þoka); textinn er')
        : (ch ? 'Áhrifin í síðustu lotu og textinn eru' : (fog && b.deltas == null ? '🌫️ Áhrifin koma í ljós við uppgjör (þoka); textinn er' : 'Textinn er'));
      const tip = '<span class="lk-pb-tip"><b>' + (b.icon || '🏛️') + ' ' + name + '</b>' +
        '<span style="display:block;margin-top:4px;color:var(--muted)">Standandi stór ákvörðun (' + esc(stageTxt(b)) + '). ' + ahrif + ' á 📋 arfleifðar-spjaldinu hér fyrir neðan.</span></span>';
      return '<span class="lk-pb' + (b.id === 'esb' ? ' lk-pb-esb' : '') + '" tabindex="0">' + (b.icon || '🏛️') + ' <b>' + name + '</b> <span class="lk-pb-stage">' + esc(stageTxt(b)) + '</span>' + tip + '</span>';
    }).join('') + '</div>';
  }
  // Arfleifð: hvernig standandi stórar ákvarðanir + óvænt atvik síðustu lotu lita ÞESSA lotu (byrjun lotu).
  function carryoverCard(st) {
    const c = st.carryover; if (!c) return '';
    const rows = [];
    // ÞOKA: deltas=null frá þjóni → „🌫️ áhrif koma í ljós við uppgjör" í stað flísanna (aldrei tómt bil). Aðeins í þoku —
    // í venjulegum leik þýðir null einfaldlega „engin töluleg áhrif" og þá er ekkert sýnt (óbreytt).
    const fog = thokaOn(st);
    const fogFx = '<div class="lk-thoka-fx">🌫️ áhrif koma í ljós við uppgjör</div>';
    if (c.event && c.event.text) rows.push('<div style="margin:3px 0">' + (c.event.icon || '🎲') + ' <b>' + esc(c.event.title) + '</b>' + (c.event.choice ? ' <span class="lk-muted">(þið völduð: ' + esc(c.event.choice) + ')</span>' : '') + ' — ' + esc(c.event.text) + '</div>');
    for (const p of (c.policies || [])) { const ch = deltaChips(p.deltas); rows.push('<div style="margin:3px 0">' + (p.icon || '🏛️') + ' <b>' + esc(p.label) + '</b> — ' + esc(p.text) + (ch ? '<div style="margin-top:3px">' + ch + '</div>' : (fog && p.deltas == null ? fogFx : '')) + '</div>'); }
    if (!rows.length) return '';
    return '<div style="background:#20242e;border:1px solid #3a4152;border-left:4px solid #8ca0c8;border-radius:10px;padding:11px 14px;margin:10px 0">' +
      '<div style="font-size:13.5px;font-weight:700;margin-bottom:5px">📋 Arfleifð síðasta kjörtímabils — hvað mótar þessa lotu</div>' +
      '<div style="font-size:12.8px;line-height:1.55">' + rows.join('') + '</div></div>';
  }
  // Fasi „skemmtun 3": óvænt atvik + klemmu-spjald. Fréttaborði efst; ef klemma → viðbragðs-val (part af ákvörðun).
  function surpriseCard(st) {
    const s = st.surprise; if (!s) return '';
    const dil = s.dilemma;
    // ÞOKA: þjónninn sendir effect=null (atvik og/eða klemmu-kostir) → „🌫️ áhrif koma í ljós við uppgjör" í stað flísanna.
    const fog = thokaOn(st);
    // F1-V3: klemmu-kostir bera áhrifa-flísar (o.effect, þ.m.t. 'pop'=fylgi) — valið verður upplýstara.
    const opts = dil ? (dil.options || []).map((o) => { const fx = deltaChips(o.effect); return '<span class="lk-opt' + (S.dilemmaDraft === o.key ? ' sel' : '') + (rhCanPolicy(st) ? '' : ' lk-rh-ro') + '" data-dil="' + o.key + '"' + (rhCanPolicy(st) ? ' role="button" tabindex="0"' : '') + '>' + esc(o.label) + (fx ? '<span class="lk-opt-fx">' + fx + '</span>' : (fog && o.effect == null ? '<span class="lk-opt-fx lk-thoka-fx">🌫️ áhrif við uppgjör</span>' : '')) + '</span>'; }).join(' ') : '';
    const fx0 = deltaChips(s.effect);
    return '<div style="background:linear-gradient(90deg,#3a1f1f,#2a2320);border:1px solid #e78284;border-left:4px solid #e78284;border-radius:10px;padding:12px 14px;margin:10px 0">' +
      '<div style="font-size:15px;font-weight:700;color:#f5b0b0">📰 ' + (s.icon || '🎲') + ' Óvænt atvik: ' + esc(s.title) + '</div>' +
      '<p style="margin:6px 0 0;font-size:13.5px;line-height:1.55">' + esc(s.text) + '</p>' +
      (fx0 ? '<div style="margin-top:6px;font-size:12.5px"><span class="lk-muted">Bein áhrif:</span> ' + fx0 + '</div>' : (fog && s.effect == null ? '<div style="margin-top:6px;font-size:12.5px"><span class="lk-muted">Bein áhrif:</span> <span class="lk-thoka-fx">🌫️ koma í ljós við uppgjör</span></div>' : '')) +
      (dil ? '<div style="margin-top:10px"><span style="font-weight:600;font-size:13px">' + esc(dil.q) + '</span><div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">' + opts + '</div>' +
        (!rhCanPolicy(st) ? '<p class="lk-rh-pmonly">🏛️ forsætisráðherra velur</p>' : (S.dilemmaDraft == null ? '<p class="lk-muted" style="font-size:11.5px;margin:6px 0 0">Veljið viðbragð — það hefur áhrif á hagkerfið og fylgi ríkisstjórnarinnar.</p>' : '')) + '</div>' : '') +   // RÁÐHERRASKIPTING: klemmu-val = forsætisráðherra
      '</div>';
  }
  // ── ÞOKA: borði + „það sem vitað er um síðasta kjörtímabil" (decide-fasi liðs; sjá skjölun við thokaOn) ──
  // Þjónninn hefur þegar síað — hér er AÐEINS teiknað úr st.thoka (áttir/fyrirsagnir/fylgi), aldrei úr hráum KPI.
  // birtLota = nýjasta kjörtímabilið sem „Hagstofan" hefur birt (N-2); null/0 (lota ≤2) → engar hagtölur enn.
  // Birt lota + tímabils-texti: st.thoka.birtLota (þjónninn; null ≤KT2) — fallback á N-2 ef svið vantar; birtAr (upphafsár
  // kjörtímabilsins úr sviðsmynd) ef það fylgir, annars YEAR_START-reikningur.
  function thokaBirt(st) {
    const t = st.thoka || {};
    const bl = t.birtLota != null ? (t.birtLota > 0 ? +t.birtLota : null) : (st.round >= 3 ? st.round - 2 : null);
    if (!bl) return { lota: null, txt: '' };
    const y0 = typeof t.birtAr === 'number' ? t.birtAr : null;
    return { lota: bl, txt: y0 != null ? y0 + '–' + (y0 + 4) : termTxt(bl, svAr0(st)) };
  }
  function thokaBanner(st) {
    if (!thokaOn(st) || st.phase !== 'decide') return '';
    const b = thokaBirt(st);
    const tail = b.lota ? 'Nýjustu staðfestu tölur: <b>' + esc(b.txt) + ' (kjörtímabil ' + b.lota + ')</b>.' : '<b>Engar hagtölur birtar enn — þið stýrið eftir tilfinningu.</b>';
    return '<div class="lk-thoka-banner" role="note">🌫️ <b>Hagstjórn í þoku</b> — Hagstofan birtir tölur með eins kjörtímabils töf. ' + tail + '</div>';
  }
  // Áhorfenda-/skjávarpa-borði: þjónninn síar watch-state í decide eins og lið (sjá skjölun við thokaOn) — hópurinn sér
  // það sama og liðin (kort N-2, engar N-1 tölur, ticker án fyrirsagna). Kveikt á st.thokaOn-flagginu EÐA thoka-blokkinni.
  function thokaBordiWatch(st) {
    if (!st || st.phase !== 'decide' || !(st.thokaOn === true || thokaOn(st))) return '';
    const b = thokaBirt(st);
    const tail = b.lota ? 'Nýjustu birtu tölur: <b>' + esc(b.txt) + ' (kjörtímabil ' + b.lota + ')</b> — kortið sýnir þá stöðu.' : '<b>Engar hagtölur birtar enn.</b>';
    return '<div class="lk-thoka-banner" role="note">🌫️ <b>Hagstjórn í þoku</b> — tölur birtast við uppgjör. ' + tail + '</div>';
  }
  // „📰 Það sem vitað er um síðasta kjörtímabil": fyrirsagnir (newsHeadlines á þjóni), fylgi-stika (+ „stjórnin féll") og
  // áttaflísar per umboðs-KPI (att + vs_markmid, reiknað á þjóni úr N-1 vs N-2) — ENGAR tölur nema fylgi%. Stigatafla óbreytt.
  function thokaPastCard(st) {
    if (!thokaOn(st) || st.phase !== 'decide' || !(st.round > 1)) return '';
    const t = st.thoka, prev = st.round - 1;
    const heads = Array.isArray(t.fyrirsagnir) ? t.fyrirsagnir.filter((h) => typeof h === 'string' && h).slice(0, 4) : [];
    const headsHtml = heads.length
      ? '<div class="lk-news">' + heads.map((h) => '<div class="lk-news-item"><span>📰</span><span>' + esc(h) + '</span></div>').join('') + '</div>'
      : '<p class="lk-muted lk-thoka-fine">Engar fyrirsagnir bárust um kjörtímabilið.</p>';
    const sb = t.stodugleiki || {};
    let stabHtml = '';
    if (typeof sb.approval === 'number' && isFinite(sb.approval)) {
      const ap = Math.max(0, Math.min(100, Math.round(sb.approval))), pcol = ap >= 55 ? '#54d08a' : ap >= 35 ? '#e8c14a' : '#e78284';
      stabHtml = '<div class="lk-pop lk-thoka-pop" title="Fylgi ríkisstjórnarinnar í lok síðasta kjörtímabils — það eina sem mælist án tafar."><div class="lk-gm-top"><span>🗳️ Fylgi ríkisstjórnar í lok kjörtímabils ' + prev + '</span><b style="color:' + pcol + '">' + ap + '%</b></div><div class="lk-gm-bar"><div class="lk-gm-fill" style="width:' + ap + '%;background:' + pcol + '"></div></div>'
        + (sb.fell ? '<div class="lk-thoka-fell">🚨 Stjórnin féll — stjórnarkreppa litar þetta kjörtímabil.</div>' : '') + '</div>';
    } else if (sb.fell) stabHtml = '<div class="lk-thoka-fell">🚨 Stjórnin féll — stjórnarkreppa litar þetta kjörtímabil.</div>';
    // Stig lotunnar N-1 (st.thoka.stig — keppnin þarf þau; stigataflan sjálf er óbreytt neðar).
    const sg = t.stig && typeof t.stig === 'object' ? t.stig : null;
    const stigHtml = (sg && typeof sg.roundScore === 'number') ? '<p class="lk-thoka-stig">🏆 Stig kjörtímabils ' + (sg.lota != null ? +sg.lota : prev) + ': <b>' + num(sg.roundScore) + '</b>' + (typeof sg.cumulative === 'number' ? ' <span class="lk-muted">(uppsafnað ' + num(sg.cumulative) + ')</span>' : '') + '</p>' : '';
    // Áttir: þjónninn reiknar aðeins þegar TVÆR mælingar eru til (N-1 og N-2) — í KT2 er attir null → útskýring í stað flísa.
    const attir = (t.attir && typeof t.attir === 'object') ? t.attir : null;
    const kpis = (st.mandate && Array.isArray(st.mandate.kpis)) ? st.mandate.kpis : [];
    let attHtml = '';
    if (attir && kpis.length) {
      const chips = kpis.map((k) => { const a = attir[k.key] || {}; return thokaChip(k.label, a.att, a.vs_markmid, k.icon); }).join('');
      attHtml = '<div class="lk-thoka-attir"><div class="lk-thoka-h">Áttir umboðs-markmiðanna <span class="lk-muted">(kjörtímabil ' + prev + ' m.v. kjörtímabil ' + (prev - 1) + ' — engar tölur)</span></div><div class="lk-thoka-chips">' + chips + '</div></div>';
    } else if (kpis.length) {
      attHtml = '<p class="lk-muted lk-thoka-fine">📐 Áttir markmiðanna (hækkandi/lækkandi, yfir/undir markmiði) birtast frá kjörtímabili 3 — þær þurfa tvær mælingar.</p>';
    }
    return '<div class="lk-card lk-thoka-past"><h2>📰 Það sem vitað er um síðasta kjörtímabil <span class="lk-muted lk-thoka-h2s">' + esc(termTxt(prev, svAr0(st))) + '</span></h2>' + headsHtml + stigHtml + stabHtml + attHtml + '</div>';
  }

  // ── ÞJÓÐARSÁTTIN — mount-innri hlutar (þurfa S): val-spjald liðs, Karphús-borði, fac-spjald, læsingar-vörn. ──
  // st.satt.on = rofinn er kveiktur (ALLAR lotur); st.satt.lota = ÞESSI lota er sáttar-lota (boolean frá þjóni).
  const sattOnSt = (st) => !!(st && st.phase === 'decide' && st.satt && st.satt.on && st.satt.lota);
  // Samstilla eigið val við þjóns-drögin (st.satt.val — liðsfélagi gæti hafa valið á öðru tæki) — einu sinni per lotu,
  // sama mynstur og S.dilRound/dilemmaDraft.
  function sattSyncDraft(st) {
    if (S.sattRound === st.round) return;
    S.sattRound = st.round;
    S.sattDraft = (st.satt && (st.satt.val === 'satt' || st.satt.val === 'saekja')) ? st.satt.val : null;
  }
  // VIRKT sáttar-val liðsins: eigið val ÞESSARAR lotu ef til, annars þjóns-drögin (liðsfélagi valdi á öðru tæki).
  // RÝNI-LAGFÆRING (fjölspilunar-gat): allir POST-ar sendu `S.sattDraft || null` — liðsfélagi sem hreyfði sleða
  // (pushDraft) eða læsti ÁN þess að hafa smellt sjálfur ÞURRKAÐI þá út val hins (INSERT OR REPLACE skiptir allri
  // röðinni út og þjónninn eyðir satt:null). Sama fall notast í sel-birtingu spjaldins svo val félagans SJÁIST á
  // báðum tækjum, í læsingar-vörninni og í öllum POST-um → vörnin og sendingin lesa alltaf sama gildið.
  const sattValAf = (st) => {
    if (S.sattRound === (st && st.round) && S.sattDraft != null) return S.sattDraft;
    const sv = st && st.satt && st.satt.val;
    return (sv === 'satt' || sv === 'saekja') ? sv : null;
  };
  // Val-spjaldið í decide (undir atviks-spjaldinu, eða efst ef ekkert atvik): tveir stórir kostir MEÐ orðalýsingu
  // á klemmunni en ÁN talna — það er klemman. Valið vistast strax (sattPush) svo fac sjái „hverjir hafa valið".
  function sattCard(st) {
    if (!sattOnSt(st) || S.role !== 'team') return '';
    sattSyncDraft(st);
    const sel = sattValAf(st);   // eigið val EÐA val liðsfélaga af öðru tæki (þjóns-drögin) — sést á báðum tækjum
    const ro = !rhCanPolicy(st);   // RÁÐHERRASKIPTING: forsætisráðherra velur — aðrir sjá valið read-only
    const opt = (v) => '<button type="button" class="lk-satt-opt' + (sel === v.key ? ' sel' : '') + (ro ? ' lk-rh-ro' : '') + '" data-satt="' + v.key + '"' + (ro ? ' disabled' : '') + '><span class="lk-satt-opt-h">' + v.icon + ' ' + esc(v.label) + '</span><span class="lk-satt-opt-b">' + esc(v.blurb) + '</span></button>';
    return '<div class="lk-card lk-satt-card"><h2>' + esc(SATT_TEXTI.titill) + ' <span class="lk-satt-tag">kjörtímabil ' + st.round + '</span></h2>'
      + '<p class="lk-satt-q">' + esc(SATT_TEXTI.spurning) + '</p>'
      + '<div class="lk-satt-opts">' + opt(SATT_VAL.satt) + opt(SATT_VAL.saekja) + '</div>'
      + '<div class="lk-satt-klemma"><b>Klemman</b> — engar tölur, og þið vitið ekki hvað hin liðin velja:<ul>'
      + '<li>Ef <b>allir halda</b>: verðbólgan hjaðnar og kaupmátturinn heldur — stöðugleikinn skilar sér til allra.</li>'
      + '<li>Ef <b>þið sækið fram meðan hin halda</b>: ábati strax fyrir ykkur — en þið kyndið eigin verðbólgu og sáttar-liðin sitja uppi með smitið.</li>'
      + '<li>Ef <b>flestir sækja fram</b>: verðbólguspírall sem étur ávinninginn af öllum.</li></ul></div>'
      + '<p class="lk-muted lk-satt-blint">🙈 ' + esc(SATT_TEXTI.blint) + '</p>'
      + (ro ? '<p class="lk-rh-pmonly">🏛️ forsætisráðherra velur</p>' : '')
      + (sel == null ? '<p class="lk-satt-warn">⚠ ' + esc(SATT_TEXTI.ekkiValid) + '</p>' : '')
      + '</div>';
  }
  // Gull-borðinn „Karphúsið er opið" — efst á ÖLLUM liðs-skjám í decide meðan fac heldur hléinu opnu; watch fær
  // stóru útgáfuna (big). Niðurtalningin (#lk-karphus-t) tikkar í tickTimer af S.karphusDeadline. Enginn chat —
  // hléið er TÍMI + leyfi til að tala saman í herberginu.
  function karphusBanner(st, big) {
    if (!sattOnSt(st)) return '';
    const kh = st.satt.karphus || {};
    if (!kh.open) return '';
    let t = '';
    if (kh.until && S.karphusDeadline != null) { const rem = Math.max(0, Math.round((S.karphusDeadline - Date.now()) / 1000)); t = ' <b class="lk-karphus-t" id="lk-karphus-t">' + fmtTimer(rem) + ' eftir</b>'; }
    return '<div class="lk-karphus-bordi' + (big ? ' lk-karphus-big' : '') + '" role="status">🏛️ <b>Karphúsið er opið — talið saman.</b> <span class="lk-karphus-sub">Leikstjórinn lokar hléinu og þá læsa liðin valinu sínu.</span>' + t + '</div>';
  }
  // Fac í decide sáttar-lotu: „hverjir hafa valið" (nafn + ✓/– og VALIÐ sjálft — aðeins fac sér það) + Karphús-hnappar.
  // Valin: st.satt.valin = { teamId: 'satt'|'saekja'|null } (eðlileg framlenging samningsins; vanti hún sýnast öll '–').
  function sattFacCard(st) {
    if (!sattOnSt(st) || S.role !== 'fac') return '';
    const kh = st.satt.karphus || {};
    // Valin: þjónninn sendir FYLKI [{teamId,name,val,locked}] (aðeins fac); eldra map-form þolað sem varaleið.
    const valin = st.satt.valin || st.sattValin || null;
    const row = (name, v, locked) => {
      const vv = (v === 'satt' || v === 'saekja') ? SATT_VAL[v] : null;
      return '<div class="lk-lb-row"><span>' + esc(name) + (locked ? ' <span class="lk-muted" title="Liðið hefur læst">🔒</span>' : '') + '</span><span>' + (vv ? '✓ ' + vv.icon + ' <b>' + esc(vv.label) + '</b>' : '<span class="lk-muted">– hefur ekki valið</span>') + '</span></div>';
    };
    const rows = Array.isArray(valin)
      ? valin.map((r) => row(r.name != null ? r.name : ('Lið ' + r.teamId), r.val, r.locked)).join('')
      : (st.teams || []).map((t) => row(t.name, valin ? (valin[t.id] != null ? valin[t.id] : valin[String(t.id)]) : undefined, false)).join('');
    const btn = kh.open
      ? '<button class="lk-btn" id="lk-karphus-close" style="background:#e8c14a;color:#0e1116;font-weight:700">🏛️ Loka Karphúsinu</button> <span class="lk-muted" style="font-size:12px">opið — liðin tala saman í herberginu' + ((kh.until && S.karphusDeadline != null) ? ' (<b id="lk-karphus-t">–:––</b>)' : '') + '</span>'
      : '<button class="lk-btn" id="lk-karphus-open">🏛️ Opna Karphús (3 mín)</button> <span class="lk-muted" style="font-size:12px">hlé þar sem öll lið sjá gull-borðann og tala saman — ekkert innbyggt spjall.</span>';
    return '<div class="lk-card lk-satt-card"><h2>🤝 Þjóðarsátt — hverjir hafa valið <span class="lk-satt-tag">aðeins þú sérð valin</span></h2>' + rows
      + '<div style="margin-top:10px">' + btn + '</div>'
      + '<p class="lk-muted" style="font-size:12px;margin:8px 0 0">Lið sem læsir án þess að velja telst „Sækja fram". Segðu liðunum EKKI áhrifatölurnar fyrirfram — fylkið er debrief-efni (sjá handbókina).</p></div>';
  }
  // Fac-blokkin eftir fasa: decide → val-yfirlit+Karphús; resolved/ended → afhjúpunin stór + debrief-punktur.
  function sattFacBlok(st) {
    if (st.phase === 'decide') return sattFacCard(st);
    if ((st.phase === 'resolved' || st.phase === 'ended') && S.role === 'fac') return sattResultsCard(st, { debrief: (SATT_HANDBOOK.debrief_spurningar || [])[0] || '' });
    return '';
  }
  // Watch í decide: „Þjóðarsátt í gangi — lið velja" (ÁN vals) + Karphús-niðurtalningin stór.
  function sattWatchBordi(st) {
    if (!sattOnSt(st)) return '';
    return karphusBanner(st, true) + '<div class="lk-satt-bordi">🤝 <b>' + esc(SATT_TEXTI.watch) + '</b> — blint tvíkosta-val: Þjóðarsátt eða Sækja fram. Valin afhjúpast í uppgjörinu.</div>';
  }
  // Viðvörun við Læsa-hnapp: engin afstaða í sáttar-lotu telst 'saekja' — confirm áður en læst er.
  function sattLockCheck(st) {
    if (!sattOnSt(st)) return true;
    const val = sattValAf(st);   // SAMA gildi og POST-inn sendir — vörnin lýgur aldrei um það sem læsist
    if (val) return true;
    return typeof confirm !== 'function' ? true : confirm(SATT_TEXTI.ekkiValid + '\n\nLæsa samt?');
  }
  // Ýta valinu á þjón strax (locked:false) svo fac sjái „hverjir hafa valið" og liðsfélagar deili valinu.
  // Studio fer um pushDraft (satt fylgir studio-drögunum); classic sendir eigin drög (S.draft-form + satt).
  function sattPush(st) {
    if (st.mode === 'studio') return pushDraft(st);
    if (!rhCanPolicy(st)) return;   // RÁÐHERRASKIPTING: sáttar-valið er forsætisráðherrans (rofinn er studio-only — vörn samt)
    const you = (S.state && S.state.you) || (st && st.you);
    if (you && you.locked && !S.unlocked) return;   // GALLI B: má ekki aflæsa þegjandi
    api('/' + S.code + '/decisions', { method: 'POST', body: { round: st.round, decisions: { ...S.draft, satt: sattValAf(st) }, locked: false, handle: rhHandle(S.code) }, token: S.token });
  }

  // ── RÁÐHERRASKIPTING INNAN LIÐS — mount-innri hlutar (þurfa S/root) ──────────────────────────────────────────────────
  // Þrjú ástönd clientsins, ÖLL leidd af st.radherrar úr /state?h= (aldrei af vafra-minni):
  //   ekkert sæti  → allt read-only, ríkisstjórnarfundurinn áberandi, ekkert POST-að;
  //   ráðherra     → eigin flipi virkur, aðrir 🔒 (lifandi gildi félaga sjást), stórar ákvarðanir/klemma/sátt read-only,
  //                  Læsa-hnappur → „⏳ forsætisráðherra læsir" (nema lockFallback: enginn PM → hver sem er læsir);
  //   forsætis     → allt virkt, læsir/aflæsir, velur stórar ákvarðanir.
  const rhOn = (st) => !!(st && st.radherrar && st.radherrar.on);
  const rhMitt = (st) => (rhOn(st) && typeof st.radherrar.mitt === 'string' && st.radherrar.mitt) ? st.radherrar.mitt : null;
  const rhIsPm = (st) => rhMitt(st) === RH_PM;
  const rhCanLock = (st) => !rhOn(st) || rhIsPm(st) || st.radherrar.lockFallback === true;   // sama regla og mergeDecisions (þjónn)
  const rhCanPolicy = (st) => !rhOn(st) || rhIsPm(st);   // stefnurofar/klemma/sátt = forsætisráðherrans
  let rhLevCache = { key: null, set: null };
  const rhCanLever = (st, k) => { if (!rhOn(st)) return true; const me = rhMitt(st); if (me === RH_PM) return true; if (!me) return false; if (rhLevCache.key !== me) rhLevCache = { key: me, set: raduneytiLevers(me, BASELINE) }; return rhLevCache.set.has(k); };
  // Sæta-staða í FASTRI RADUNEYTI-röð: AÐEINS `taken` kemur frá þjóni (stada-fylkið), icon/heiti/lysing/group úr einingunni sjálfri
  // (sama uppspretta og þjónninn) — ekkert af vírnum fer óescapað í HTML; handles eru aldrei birt.
  const rhStada = (st) => { const srv = (rhOn(st) && Array.isArray(st.radherrar.stada)) ? st.radherrar.stada : []; return raduneytiStada({}).map((r) => { const s = srv.find((x) => x && x.key === r.key); return { ...r, taken: !!(s && s.taken) }; }); };
  // Undirskrift í studio-sig: sæti mitt + hver sæti eru tekin + fallback + picker-ástand → endurbygging aðeins við raunbreytingu.
  const rhSig = (st) => rhOn(st) ? (rhMitt(st) || '-') + ':' + rhStada(st).map((r) => (r.taken ? 1 : 0)).join('') + ':' + (st.radherrar.lockFallback ? 1 : 0) + ':' + (S.rhPickerOpen ? 1 : 0) : '0';
  // Drög í POST: rofi af → allt (óbreytt hegðun). Forsætis → stefnurofar/klemma/sátt + eigin snertingar + sleðar ÓTEKINNA ráðuneyta
  // (byrjunar-/carry-forward-gildi ná til þjóns) — ósnertir sleðar TEKINNA ráðuneyta sleppt svo stöðnuð poll-gildi klobbi ekki
  // ráðherrann sem vinnur í þeim. Ráðherra → AÐEINS sleðar eigin ráðuneytis. Ekkert sæti → {}.
  function rhDecisions(st) {
    const all = { levers: S.dials, policies: S.policyDraft || {}, dilemma: S.dilemmaDraft || null, ...(st.satt && st.satt.on && st.satt.lota ? { satt: sattValAf(st) } : {}) };
    if (!rhOn(st)) return all;
    const me = rhMitt(st);
    if (!me) return {};
    const levers = {};
    if (me === RH_PM) {
      const taken = new Set(rhStada(st).filter((r) => r.taken && r.key !== RH_PM).map((r) => r.key));
      for (const k of Object.keys(S.dials || {})) { const o = leverOwner(k, BASELINE); if (S.localTouched.has(k) || !o || !taken.has(o)) levers[k] = S.dials[k]; }
      return { ...all, levers };
    }
    for (const k of Object.keys(S.dials || {})) if (rhCanLever(st, k)) levers[k] = S.dials[k];
    return { levers };
  }
  // Sæta-röð (icon✓ tekið / icon· laust) — sama form í Læsa-kassa og fac-roster (rhRosterSeats).
  const rhSeatsHtml = (st) => rhStada(st).map((r) => '<span class="lk-rh-seat' + (r.taken ? ' on' : '') + '" title="' + esc(r.heiti + ' — ' + (r.taken ? (r.key === rhMitt(st) ? 'þú' : 'tekið') : 'laust')) + '">' + r.icon + (r.taken ? '✓' : '·') + '</span>').join('');
  // Ríkisstjórnarfundurinn: 7 flísar úr stada (laust / tekið / þú), „Taka sæti" → POST /saeti. Áberandi meðan sæti vantar;
  // annars aðeins þegar opnað handvirkt (S.rhPickerOpen — lifir poll). Handles eru ALDREI sýnd (nafnlaus: bara tekið/þú).
  function rhPickerCard(st) {
    if (!rhOn(st) || S.role !== 'team') return '';
    const mitt = rhMitt(st);
    if (mitt && !S.rhPickerOpen) return '';
    const stada = rhStada(st), n = stada.filter((r) => r.taken).length;
    const tiles = stada.map((r) => {
      const mine = r.key === mitt, taken = r.taken && !mine;
      const btn = mine ? '<button type="button" class="lk-btn lk-onb-ghost lk-rh-take" data-rh-release="' + esc(r.key) + '">Sleppa sæti</button>'
        : taken ? '<button type="button" class="lk-btn lk-rh-take" disabled>Tekið</button>'
        : '<button type="button" class="lk-btn lk-rh-take" data-rh-take="' + esc(r.key) + '">' + (mitt ? 'Skipta hingað' : 'Taka sæti') + '</button>';
      return '<div class="lk-rh-tile' + (mine ? ' lk-rh-mine' : taken ? ' lk-rh-taken' : ' lk-rh-free') + (r.key === RH_PM ? ' lk-rh-pm' : '') + '">'
        + '<div class="lk-rh-tile-h"><span class="lk-rh-ic">' + r.icon + '</span><b class="lk-rh-heiti">' + esc(r.heiti) + '</b><span class="lk-rh-state">' + (mine ? '🎭 þú' : taken ? '🔒 tekið' : '· laust') + '</span></div>'
        + '<span class="lk-rh-group">' + esc(r.group || 'Öll svið · læsir kjörtímabilið') + '</span>'
        + '<p class="lk-rh-lysing">' + esc(r.lysing) + '</p>' + btn + '</div>';
    }).join('');
    const intro = mitt
      ? 'Hver situr hvar. Skiptu um sæti ef þið viljið — fyrra sætið losnar sjálfkrafa.'
      : 'Hver liðsmaður tekur EITT sæti á sínu tæki og stýrir sleðum síns ráðuneytis. Forsætisráðherrann sér allt, tekur stóru ákvarðanirnar og læsir kjörtímabilið. Veljið saman — PM-valið er pólitík!';
    return '<div class="lk-card lk-rh-card' + (mitt ? '' : ' lk-rh-urgent') + '" id="lk-rh-picker" role="region" aria-label="Ríkisstjórnarfundur"><h2>🏛️ Ríkisstjórnarfundur — ' + (mitt ? 'hver situr hvar' : 'veldu þitt sæti') + ' <span class="lk-rh-tag">' + n + '/' + stada.length + ' sæti tekin</span></h2>'
      + '<p class="lk-muted lk-rh-intro">' + esc(intro) + '</p><div class="lk-rh-grid">' + tiles + '</div>'
      + (mitt ? '<div class="lk-rh-foot"><button type="button" class="lk-btn lk-onb-ghost" data-rh-close="1">Loka</button></div>' : '') + '</div>';
  }
  // Flís í kjörtímabils-hausnum: „🎭 Þú: Fjármálaráðherra · skipta" + „🏛️ Ríkisstjórnin" (opnar fundinn hvenær sem er).
  function rhHeadChip(st) {
    if (!rhOn(st) || S.role !== 'team') return '';
    const me = rhInfo(rhMitt(st));
    return (me ? '<span class="lk-term-badge lk-rh-badge">🎭 Þú: <b>' + esc(me.heiti) + '</b> · <button type="button" class="lk-rh-link" data-rh-open="1">skipta</button></span>' : '<span class="lk-term-badge lk-rh-badge lk-rh-none">🎭 Ekkert sæti enn</span>')
      + '<button type="button" class="lk-term-badge lk-rh-badge lk-rh-gov" data-rh-open="1" title="Sjá hver situr hvar">🏛️ Ríkisstjórnin</button>';
  }
  // 🔒-borði yfir sleðum flipa sem er EKKI þitt ráðuneyti (tekið/laust + leiðsögn).
  function rhTabBanner(st, owner, mine) {
    if (!rhOn(st) || mine) return '';
    const row = owner ? rhStada(st).find((r) => r.key === owner.key) : null;
    const taken = !!(row && row.taken);
    return '<div class="lk-rh-bordi" role="note">🔒 Ráðuneyti <b>' + esc(owner ? owner.heiti : 'forsætisráðherra') + '</b> — ' + (taken ? 'tekið' : 'laust')
      + '<span class="lk-rh-bordi-sub">' + (rhMitt(st) ? 'Þú sérð lifandi gildi félaga þíns hér en breytir þeim ekki.' : 'Veldu sæti á ríkisstjórnarfundinum til að stýra sleðum.') + '</span></div>';
  }
  // Læsa-hnappurinn: PM → hnappur; lockFallback (enginn PM) → hnappur + „hver sem er læsir"; ráðherra → ⏳-kassi + sæta-yfirlit.
  function rhLockHtml(st) {
    // ⏳ HÆGUR HAMUR: læsing er ekki endanleg — liðið má opna aftur (#lk-unlock, sama flæði og í dag) fram að lokun.
    const asy = asyncOf(st);
    const btn = '<button class="lk-btn lk-lock-big" id="lk-lock"' + (asy ? ' title="Þú mátt opna aftur fram að lokun"' : '') + '>🔒 Læsa ' + (asy ? 'núna' : 'kjörtímabili ' + st.round) + '</button>'
      + (asy && rhCanLock(st) ? '<p class="lk-muted lk-as-fine">Þú mátt opna aftur og breyta fram að lokun — lotan gerist upp sjálfkrafa þá.</p>' : '');
    if (!rhOn(st)) return btn;
    if (rhIsPm(st)) return btn + '<p class="lk-muted lk-rh-fine">🏛️ Þú ert forsætisráðherra — aðeins þú læsir. Sæti: ' + rhSeatsHtml(st) + '</p>';
    if (st.radherrar.lockFallback === true) return btn + '<p class="lk-muted lk-rh-fine">Enginn forsætisráðherra — hver sem er læsir. Sæti: ' + rhSeatsHtml(st) + '</p>';
    return '<div class="lk-rh-wait" role="status">⏳ <b>Forsætisráðherra læsir kjörtímabilið</b><span class="lk-rh-seats">Sæti: ' + rhSeatsHtml(st) + '</span></div>';
  }
  // Lítill toast (hýsill = systkini root, lifir poll-endurteiknanir; textContent → engin HTML-túlkun).
  let rhToastHost = null;
  function rhToast(msg) {
    if (!rhToastHost) { rhToastHost = document.createElement('div'); rhToastHost.className = 'lk-rh-toast'; rhToastHost.setAttribute('role', 'status'); rhToastHost.setAttribute('aria-live', 'polite'); (root.parentNode || document.body).appendChild(rhToastHost); }
    rhToastHost.textContent = msg; rhToastHost.classList.add('on');
    if (S.rhToastTimer) clearTimeout(S.rhToastTimer);
    S.rhToastTimer = setTimeout(() => { S.rhToastTimer = null; if (rhToastHost) rhToastHost.classList.remove('on'); }, 3400);
  }
  // Spegla höfnun þjónsins STRAX (hafnad í POST-svari): sleðar → þjóns-gildi (st.draft, annars grunnur) í S.dials + sleða +
  // gildi-merki, localTouched sleppt (poll samstillir áfram), forskoðun endurteiknuð, toast „Tilheyrir X". Önnur svið
  // (policies/dilemma/satt) → drög endursett af þjóns-stöðu + studio endurbyggt. Svo refresh() (nema act() geri það á eftir).
  function rhAfterPost(st, r, inAct) {
    const hf = (r && r.json && Array.isArray(r.json.hafnad)) ? r.json.hafnad : [];
    if (!hf.length) return;
    const cur = S.state || st, rd = (cur && cur.draft) || {};
    const owners = new Set(); let rebuild = false;
    for (const k of hf) {
      if (BASELINE.levers[k] && S.dials) {
        S.localTouched.delete(k);
        const cfg = BASELINE.levers[k], v = rd[k] != null ? +rd[k] : cfg.base;
        S.dials[k] = v;
        const el = root.querySelector('input[data-lev="' + k + '"]'); if (el) el.value = v;
        const vs = root.querySelector('.lk-val[data-val="' + k + '"]'); if (vs) { vs.textContent = disp(cfg, v); vs.classList.toggle('moved', v !== cfg.base); }
        const o = rhInfo(leverOwner(k, BASELINE)); owners.add(o ? o.heiti : 'forsætisráðherra');
      } else if (k === 'policies') { S.policyDraft = { ...((cur && cur.policies && cur.policies.draft) || {}) }; owners.add('forsætisráðherra'); rebuild = true; }
      else if (k === 'dilemma') { S.dilemmaDraft = (cur && cur.dilemmaDraft != null) ? cur.dilemmaDraft : null; owners.add('forsætisráðherra'); rebuild = true; }
      else if (k === 'satt') { S.sattDraft = null; owners.add('forsætisráðherra'); rebuild = true; }
      else if (k === 'locked') owners.add('forsætisráðherra');
    }
    if (owners.size) rhToast('🔒 Tilheyrir ' + [...owners].join(', ') + ' — breytingin var ekki vistuð.');
    if (cur && cur.mode === 'studio' && S.role === 'team' && root.querySelector('#lk-st-sliders')) { if (rebuild) renderStudio(cur); else drawStudioPreview(cur); }
    if (!inAct) refresh();
  }
  // Taka/sleppa sæti: POST /saeti {handle, key|null} → raduneytiStaða (fylki EÐA {ok,stada}); villa → toast. act() sækir
  // /state á eftir (mitt uppfærist þar → renderTeam hreinsar localTouched + endurbyggir studio); picker lokast við árangur.
  function rhSaeti(key) {
    return act(async () => {
      let r; try { r = await api('/' + S.code + '/saeti', { method: 'POST', body: { handle: rhHandle(S.code), key: key || null }, token: S.token }); } catch (e) { r = { status: 0, json: null }; }
      const j = (r.json && typeof r.json === 'object') ? r.json : {};
      const bad = r.status !== 200 || j.ok === false || !!j.error;
      if (bad) { const why = String(j.error || j.reason || ''); rhToast(why === 'upptekid' ? '🔒 Sætið var tekið rétt á undan þér — veldu annað.' : 'Tókst ekki að ' + (key ? 'taka sæti' : 'sleppa sæti') + (why ? ' (' + why + ')' : '') + '.'); return; }
      S.rhPickerOpen = false; S.rhSeatJust = !!key;
      if (S.pushTimer) { clearTimeout(S.pushTimer); S.pushTimer = null; }
    });
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
        if (!rhCanPolicy(S.state)) { sepopClose(); return; }   // RÁÐHERRASKIPTING: klemmu-valið er forsætisráðherrans — ekkert sent
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
    const fog = thokaOn(S.state);   // ÞOKA: effect=null frá þjóni → „koma í ljós við uppgjör" (líka á watch — þjónninn síar áhorfendur eins og lið í decide)
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
      return '<button type="button" class="lk-sepop-opt' + (selDil === o.key ? ' sel' : '') + '" data-dil="' + esc(o.key) + '">' + esc(o.label) + (fx ? '<span class="lk-opt-fx">' + fx + '</span>' : (fog && o.effect == null ? '<span class="lk-opt-fx lk-thoka-fx">🌫️ áhrif við uppgjör</span>' : '')) + '</button>';
    }).join('') : '';
    sepopEnsureHost().innerHTML =
      '<div class="lk-sepop-overlay"><div class="lk-sepop-card' + (watch ? ' lk-sepop-watch' : '') + '" role="dialog" aria-modal="true" aria-label="Óvænt atvik">' +
      '<button type="button" class="lk-sepop-x" aria-label="Loka">×</button>' +
      (mynd ? '<div class="lk-sepop-img">' + mynd + '</div>' : '') +
      '<div class="lk-sepop-body">' +
      '<div class="lk-sepop-title">📰 ' + (s.icon || '🎲') + ' Óvænt atvik: ' + esc(s.title) + '</div>' +
      '<p class="lk-sepop-text">' + esc(s.text) + '</p>' +
      (fx0 ? '<div class="lk-sepop-fx"><span class="lk-muted">Bein áhrif:</span> ' + fx0 + '</div>' : (fog && s.effect == null ? '<div class="lk-sepop-fx"><span class="lk-muted">Bein áhrif:</span> <span class="lk-thoka-fx">🌫️ koma í ljós við uppgjör</span></div>' : '')) +
      (dil ? '<div class="lk-sepop-q">' + esc(dil.q) + '</div>' + (mateChose ? '<p class="lk-muted" style="font-size:12px;margin:2px 0 6px">👥 Liðsfélagi hefur þegar valið — smellur breytir vali liðsins.</p>' : '') + opts : '') +
      '</div></div></div>';
  }
  // Liðs-popup: aðeins í decide-fasa (kallað úr renderTeam á undan studio/classic-greinum). Klukkan tikkar
  // áfram á bak við; hindrar aldrei læsingu — lokanlegt (×/ESC/slæða) og birtist bara einu sinni per lotu.
  function maybeSepop(st) {
    const s = st.surprise; if (!s || st.phase !== 'decide') return;
    const k = sepopKey(st.round, false); if (sepopSeen(k)) return;
    sepopMark(k);   // við FYRSTU birtingu — poll-endurteiknun endurvekur aldrei
    sepopOpen(s, { withDil: st.mode === 'studio' && rhCanPolicy(st) });   // RÁÐHERRASKIPTING: klemmu-hnappar aðeins f. forsætisráðherra
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
    // ÞOKA (rýni): síðasta MÆLDA fylgi kemur frá þjóni (st.thoka.stodugleiki.approval — leyft svið, lifir reload) í stað
    // vafra-skyndiminnis N-1-KPI úr uppgjörsskjánum (S.debriefPrevKpis) — þokan á ekki að hvíla á því hvað vafrinn man.
    else if (thokaOn(st) && st.phase === 'decide') { const sb = st.thoka && st.thoka.stodugleiki; if (sb && typeof sb.approval === 'number') ap = sb.approval; }
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
    const fog = thokaOn(st) && st.phase === 'decide';
    if (fog) msgs.push('🌫️ Við sjáum ekki nýjustu tölurnar — treystið fyrirsögnunum og fylginu.');   // ÞOKA: auka-setning FYRST
    // RÁÐHERRASKIPTING: ein setning ef ÞÚ ert ráðherra (ekki forsætis-) — samræming áður en forsætisráðherra læsir.
    const rhMe = (rhOn(st) && rhMitt(st) && rhMitt(st) !== RH_PM) ? rhInfo(rhMitt(st)) : null;
    if (rhMe) msgs.push('🎭 Þú stýrir sviðinu „' + rhMe.group + '" sem ' + rhMe.heiti + ' — samræmdu við hina áður en forsætisráðherra læsir.');
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
    // ÞOKA (rýni): í þoku lesa ráðgjafarnir ALDREI N-1-KPI úr vafra-skyndiminni uppgjörsskjásins (S.debriefPrevKpis) —
    // studio: forskoðunar-gildin (S.pmKpis = ráðgjafa-matið); classic: almennt ráð ({} → sjálfgefin gildi).
    const kpis = (S.pmKpisRound === st.round && S.pmKpis) || (!fog && S.debriefPrevRound === st.round - 1 && S.debriefPrevKpis) || {};
    for (const a of advisors(kpis, st.round).slice(0, 2)) msgs.push(a.icon + ' ' + a.who + ': ' + a.advice);
    return msgs.slice(0, 5 + (fog ? 1 : 0) + (rhMe ? 1 : 0));   // watch-línan bættist framan við — 5 svo ráðgjafarnir kremjist ekki út (+1 f. þoku-setninguna, +1 f. ráðherra-setninguna)
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
    // RÁÐHERRA-NAFN: AÐEINS í sviðsmynd sem á raun-hagsögu. Í framtíðar-sviðsmynd (erFramtid) er
    // radh=null → nafnlaus „Forsætisráðherra" og karl-settið sjálfgefið. Við skáldum ALDREI nöfn á
    // raunverulegt fólk í framtíðar-embættum (sjá saga.mjs).
    const radh = svErFramtid(st) ? null : radherraFyrirLotu(st.round);
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
    // Framtíðar-sviðsmynd: EKKERT nafn — bara embættisheitið (persónan er nafnlaus, sjá ofar).
    const nafn = wrap.querySelector('#lk-pmh-nafn');
    const nafnTxt = svErFramtid(st) ? null : radherraTexti(st.round);
    if (nafn) nafn.innerHTML = nafnTxt ? 'Forsætisráðherra: <b>' + esc(nafnTxt) + '</b>' : '<b>Forsætisráðherra</b>';
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
    try { body = lkPrintReport(st, { thoka: facCfg(st).thoka === true }); } catch (err) { console.error('lkPrintReport villa', err); body = '<div class="lkp-doc"><p>Ekki tókst að byggja skýrsluna.</p></div>'; }
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
  // VERK B: þrjú ástönd — (a) leikstjóri (me.leikstjori úr /api/leikur/me; fallback á isAdmin meðan verk A er ómerge-að
  // og /me svarar 404) → stór „Stofna"-hnappur + vísir; (b) innskráð án leyfis → inngöngu-kóði (nemandi) + kynning fyrir
  // kennara; (c) óinnskráð → kynning + innskráningar-hvatning.
  function renderLanding() {
    const u = S.user || {}, me = S.me || {};
    const leikstjori = me.leikstjori === true || (me._missing === true && u.isAdmin === true);
    const isAdmin = me.isAdmin === true || u.isAdmin === true;
    const nemandi = me.nemandi === true || u.nemandi === true;
    const loggedIn = u.loggedIn === true || me.loggedIn === true || leikstjori || nemandi || isAdmin;
    const canJoin = nemandi || isAdmin || leikstjori;   // þjóns-gáttin á /join er nemandi|kerfisstjóri|leikstjóri (má prófa eigin leik)
    const last = lastFacCfg() || {};
    // Ártalið er sótt í sjálfgefnu sviðsmyndina svo textinn geti ekki rekið frá skránni.
    const svSjalf = svidsmyndOf(SVIDSMYND_SJALFGEFIN);
    const intro = '<div class="lk-card"><h1>🎮 RÁS-Leikurinn</h1><p>Turn-based þjóðhagfræði-hermir. Keppandi „ríkisstjórnar"-lið stýra hvert sínu Íslandi gegnum ' + svSjalf.rounds + ' kjörtímabil — sögulega (' + esc(svSjalf.heiti) + ') eða inn í framtíðina — með lifandi Íslandskorti og stigatöflu á skjávarpa.</p></div>';
    const untilTxt = fmtUntil(me.until);
    // SVIÐSMYNDA-VAL (svidsmyndir.mjs): heiti + undirtitill í valmynd, blurb valinnar sviðsmyndar undir.
    const svSel = SVIDSMYNDA_LISTI.some((s) => s.id === last.svidsmynd) ? last.svidsmynd : SVIDSMYND_SJALFGEFIN;
    const svOpts = SVIDSMYNDA_LISTI.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === svSel ? ' selected' : '') + '>' + esc(s.heiti + ' — ' + s.undirtitill) + '</option>').join('');
    const settings = '<div id="lk-settings" class="lk-onb-settings"><div class="lk-onb-settings-h">⚙️ Stillingar leiksins <span class="lk-muted">(veljast hér — læsast við stofnun)</span></div>'
      + '<label id="lk-set-svidsmynd">🗺️ Sviðsmynd: <select id="lk-svidsmynd" style="padding:4px 6px;margin-left:4px">' + svOpts + '</select></label>'
      + '<p class="lk-muted lk-sv-blurb" id="lk-svidsmynd-blurb" style="margin:2px 0 8px 22px;font-size:12.5px">' + esc(svidsmyndOf(svSel).blurb) + '</p>'
      + '<label id="lk-set-studio"><input type="checkbox" id="lk-studio"' + (last.mode === 'classic' ? '' : ' checked') + '/>🎛️ Stjórnstöð — þátttakendur fá sleða + lifandi gröf (annars einföld val)</label>'
      + '<label id="lk-set-roles"><input type="checkbox" id="lk-roles"' + (last.roles ? ' checked' : '') + '/>🎭 Leynileg hlutverk — hvert lið fær ólíkt, hulið umboð (afhjúpað í leikslok)</label>'
      + '<label id="lk-set-timer">⏱️ Umferðar-klukka: <input type="number" id="lk-timer-min" min="0" max="60" step="1" placeholder="0" value="' + (last.timerMin > 0 ? +last.timerMin : '') + '" style="width:56px;padding:4px 6px;margin:0 4px"/> mín <span class="lk-muted">(0 = engin — bara sjónræn ýting, læsir engu)</span></label>'
      + '<label id="lk-set-difficulty">🎚️ Erfiðleikastig: <select id="lk-difficulty" style="padding:4px 6px;margin-left:4px">' + ['easy', 'medium', 'hard'].map((k) => '<option value="' + k + '"' + ((last.difficulty || 'medium') === k ? ' selected' : '') + '>' + esc(DIFF_LABEL(k)) + '</option>').join('') + '</select> <span class="lk-muted">(skalar markmið, áföll og refsingar)</span></label>'
      + '<label id="lk-set-surprise"><input type="checkbox" id="lk-surprise"' + (last.surprise ? ' checked' : '') + '/>🎲 Óvænt atvik — eldgos, verkföll, hneyksli o.fl. dúkka upp með klemmu-vali <span class="lk-muted">(sama fyrir öll lið)</span></label>'
      // ÞOKA: valfrjáls leikstilling við hlið óvæntra atvika (ekki erfiðleikastig) — config.thoka, sjálfgefið slökkt.
      + '<label id="lk-set-thoka"><input type="checkbox" id="lk-thoka"' + (last.thoka ? ' checked' : '') + '/>🌫️ Hagstjórn í þoku — ' + esc(THOKA_BLURB) + ' <span class="lk-muted">(þú og skjávarpinn sjáið áfram allt)</span></label>'
      // ÞJÓÐARSÁTT: valfrjáls leikstilling (config.satt) — fangaklemma þvert á lið í sáttar-lotunum (sjálfgefið KT3+KT6).
      + '<label id="lk-set-satt"><input type="checkbox" id="lk-satt"' + (last.satt ? ' checked' : '') + '/>🤝 Þjóðarsáttin — ' + esc(SATT_BLURB) + ' <span class="lk-muted">(sáttar-lotur: KT3 „hrunið" og KT6 „verðbólguskotið")</span></label>'
      // RÁÐHERRASKIPTING: valfrjáls leikstilling (config.radherrar) — AÐEINS í Stjórnstöð (sleðar = ráðuneyti); með einföld val er rofinn óvirkur með skýringu.
      + '<label id="lk-set-radherrar"><input type="checkbox" id="lk-radherrar"' + (last.radherrar && last.mode !== 'classic' ? ' checked' : '') + (last.mode === 'classic' ? ' disabled' : '') + '/>🎭 Ráðherraskipting — ' + esc(RH_BLURB) + ' <span class="lk-muted" id="lk-radherrar-note">' + (last.mode === 'classic' ? '(þarf Stjórnstöð — kveiktu á henni fyrst)' : '(aðeins í Stjórnstöð; liðsstærð 3–7 best)') + '</span></label></div>';
    const createCard = '<div class="lk-card" id="lk-create-card"><h2>🎓 Leikstjóri</h2><div class="lk-onb-cta"><button class="lk-btn lk-onb-big" id="lk-create">🎓 Stofna nýjan leik</button><a href="#" id="lk-guide" class="lk-onb-guide">📖 Svona keyrirðu vinnustofu (5 mín)</a></div><div id="lk-create-err" class="lk-err" aria-live="polite"></div>' + settings
      + '<p class="lk-muted" style="font-size:12.5px;margin:10px 0 0">🛠️ <a href="#" id="lk-createcustom">Sérsníða leik…</a> — eigin sviðsmynd, umboð og fjöldi umferða.' + (untilTxt ? ' · Leikstjóra-aðgangur gildir til <b>' + esc(untilTxt) + '</b>.' : '') + '</p></div>';
    const joinCard = '<div class="lk-card" id="lk-join-card"><h2>Lið — ganga inn</h2><input id="lk-code" placeholder="KÓÐI" maxlength="6" value="' + esc(S.joinPrefill) + '" style="text-transform:uppercase;padding:8px;margin-right:6px" /> <input id="lk-name" placeholder="Liðsheiti (t.d. Rauða liðið)" maxlength="40" style="padding:8px;margin-right:6px" /> <button class="lk-btn" id="lk-join">Ganga inn</button><p class="lk-muted" style="font-size:12.5px;margin:8px 0 0">Kennarinn (leikstjóri) gefur þér 5 stafa kóða. Eitt tæki per lið dugar — félagar ganga í sama lið með boðs-hlekk.</p><p class="lk-muted" style="font-size:12px;margin:4px 0 0">🙈 Liðsheitið birtist á stigatöflu og skjávarpa — veljið hlutlaust heiti, ekki nöfn ykkar. Leiknum er eytt sjálfkrafa eftir 90 daga. <a href="/leikur/personuvernd/">Persónuvernd í leiknum</a></p></div>';
    const noNemandiCard = '<div class="lk-card" id="lk-join-card"><h2>Lið — ganga inn</h2><p>Þú ert innskráð/ur en reikningurinn er ekki merktur sem <b>nemandi</b>. Karp virkjar nemanda-aðgang (kennarinn sendir þátttakendalista á <a href="mailto:hjalp@karp.is">hjalp@karp.is</a>) — þá slærðu inn leikkóðann hér.</p></div>';
    const promo = '<div class="lk-card lk-onb-promo"><h2>🎓 Ertu kennari eða stjórnandi vinnustofu?</h2><p>RÁS-Leikurinn er 60–90 mín vinnustofa í þjóðhagfræði: lið stýra hvert sínu Íslandi gegnum kjörtímabilin, taka stóru ákvarðanirnar (höft, ESB, bankar…) og sjá afleiðingarnar á lifandi Íslandskorti. Þú færð leikstjóra-sýn með kennsluhandbók, uppsetningar-vísi, áhorfenda-sýn fyrir skjávarpa og prentanlega kennsluskýrslu.</p><div class="lk-onb-row"><a class="lk-btn" href="/leikur/leikstjori/">Leikstjóra-aðgangur →</a><a class="lk-btn lk-onb-ghost" href="/leikur/demo/">🕹️ Prófa demo (Lifðu af 2008)</a></div></div>';
    const loginCard = '<div class="lk-card"><p>🎮 Ertu nemandi? Skráðu þig inn — kennarinn gefur þér leikkóða.</p><a class="lk-btn" href="' + esc(loginHref()) + '">Skrá inn</a></div>';
    if (leikstjori) root.innerHTML = intro + createCard + joinCard;
    else if (loggedIn) root.innerHTML = intro + (canJoin ? joinCard : noNemandiCard) + promo;
    else root.innerHTML = intro + promo + loginCard;
    const create = root.querySelector('#lk-create'); if (create) create.onclick = () => createGame();
    const guide = root.querySelector('#lk-guide'); if (guide) guide.onclick = (e) => { e.preventDefault(); onbStart(); };
    const createCustom = root.querySelector('#lk-createcustom'); if (createCustom) createCustom.onclick = (e) => { e.preventDefault(); onbClose(false); S.view = 'editor'; render(); };
    const join = root.querySelector('#lk-join');
    if (join) join.onclick = () => {
      const c = (root.querySelector('#lk-code').value || '').trim().toUpperCase();
      const n = (root.querySelector('#lk-name').value || '').trim();
      if (c.length >= 4 && n) joinGame(c, n); else alert('Sláðu inn kóða og nafn.');
    };
    // SVIÐSMYND: lýsingin undir valmyndinni fylgir valinu (blurb úr skránni).
    const svEl = root.querySelector('#lk-svidsmynd'), svB = root.querySelector('#lk-svidsmynd-blurb');
    if (svEl && svB) svEl.addEventListener('change', () => { svB.textContent = svidsmyndOf(svEl.value).blurb; });
    // RÁÐHERRASKIPTING: rofinn fylgir Stjórnstöðinni — slökkt á henni → rofinn óvirkur (og af) með skýringu.
    const stEl = root.querySelector('#lk-studio'), rhEl = root.querySelector('#lk-radherrar'), rhNote = root.querySelector('#lk-radherrar-note');
    if (stEl && rhEl) stEl.addEventListener('change', () => { const on = stEl.checked; rhEl.disabled = !on; if (!on) rhEl.checked = false; if (rhNote) rhNote.textContent = on ? '(aðeins í Stjórnstöð; liðsstærð 3–7 best)' : '(þarf Stjórnstöð — kveiktu á henni fyrst)'; });
    if (S.joinPrefill) { const nm = root.querySelector('#lk-name'); if (nm) nm.focus(); }
    onbUpdate();   // vísir í „leiðsögu-ham" (enginn leikur) ef hann er opinn — highlight á stillingarnar hér
  }

  // 📖 Kennsluhandbók leikstjóra: ýtarleg leiðsögn per kjörtímabil (aðeins fac). Núverandi lota opin+auðkennd.
  function handbookCard(st) {
    const cur = st.round || 0;
    if (S.hbRound !== cur) { S.hbRound = cur; if (cur) S.openDetails.add('hb-' + cur); } // opna núverandi lotu sjálfkrafa við skipti
    // Atburðahausar úr SVIÐSMYND leiksins (ekki fast SCENARIO) svo ártal/titill stemmi við það sem spilað er.
    const hbEvents = svidsmyndOf(svOf(st).id).events || [];
    const evOf = (r) => hbEvents.find((e) => e.round === r) || {};
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
    // ÞOKA: leikstjóra-blað fyrir þoku-leik (THOKA_HANDBOOK, ein uppspretta): upplestrar-texti + debrief-spurningar — fac sér allt áfram.
    const TH = THOKA_HANDBOOK;
    const thokaHtml = (facCfg(st).thoka === true && TH)
      ? '<details data-keep="hb-thoka"' + (S.openDetails.has('hb-thoka') ? ' open' : '') + ' style="margin:5px 0;border:1px solid #8ca0c8;border-radius:8px;padding:8px 12px;background:rgba(140,160,200,.08)">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:13.5px">🌫️ ' + esc(TH.heiti || 'Hagstjórn í þoku') + ' — þessi leikur er í þoku</summary>'
        + '<div style="font-size:12.8px;line-height:1.55;margin-top:6px">'
        + '<p style="margin:2px 0"><b>Hvað liðin sjá:</b> ' + esc(TH.blurb || '') + ' Þú og skjávarpinn sjáið allt; tölurnar afhjúpast fyrir liðin við hvert uppgjör.</p>'
        + (TH.hvad_ad_segja_hopnum ? '<p style="margin:4px 0"><b>🗣️ Segðu hópnum:</b> ' + esc(TH.hvad_ad_segja_hopnum) + '</p>' : '')
        + (TH.hvenaer ? '<p style="margin:4px 0"><b>⏳ Hvenær:</b> ' + esc(TH.hvenaer) + '</p>' : '')
        + (Array.isArray(TH.debrief_spurningar) && TH.debrief_spurningar.length ? '<div style="margin:4px 0"><b>💬 Debrief-spurningar:</b><ul style="margin:3px 0 0;padding-left:18px">' + TH.debrief_spurningar.map((q) => '<li style="margin:2px 0">' + esc(q) + '</li>').join('') + '</ul></div>' : '')
        + '</div></details>'
      : '';
    // ÞJÓÐARSÁTT: leikstjóra-blað fyrir sáttar-leik (SATT_HANDBOOK, ein uppspretta): hvernig keyra Karphúsið,
    // debrief-spurningar og FYLKIÐ (textaútgáfa af SATT_FYLKI) — sýnt hópnum í debrief, EKKI fyrirfram.
    const SH = SATT_HANDBOOK;
    const sattHb = (facCfg(st).satt === true && SH)
      ? '<details data-keep="hb-satt"' + (S.openDetails.has('hb-satt') ? ' open' : '') + ' style="margin:5px 0;border:1px solid #e8c14a88;border-radius:8px;padding:8px 12px;background:rgba(232,193,74,.06)">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:13.5px">🤝 ' + esc(SH.heiti || 'Þjóðarsáttin') + ' — fangaklemman er í þessum leik</summary>'
        + '<div style="font-size:12.8px;line-height:1.55;margin-top:6px">'
        + '<p style="margin:2px 0"><b>Hvað gerist:</b> ' + esc(SH.blurb || '') + '</p>'
        + (SH.hvernig_keyra ? '<p style="margin:4px 0"><b>🎬 Svona keyrirðu hana:</b> ' + esc(SH.hvernig_keyra) + '</p>' : '')
        + (SH.hvers_vegna ? '<p style="margin:4px 0"><b>📚 Sagan (1990):</b> ' + esc(SH.hvers_vegna) + '</p>' : '')
        + (Array.isArray(SH.fylki_til_toflu) && SH.fylki_til_toflu.length
          ? '<div style="margin:4px 0"><b>📊 Fylkið</b> <span class="lk-muted">(sýna í debrief — EKKI fyrirfram)</span>:'
            + '<table class="lk-tbl" style="margin-top:4px"><tr><th>Útkoma</th><th>Lið</th><th>Áhrif á uppgjörs-KPI</th></tr>'
            + SH.fylki_til_toflu.map((r) => '<tr><td>' + esc(r.utkoma) + '</td><td>' + esc(r.lid) + '</td><td>' + esc(r.ahrif || '—') + '</td></tr>').join('') + '</table></div>'
          : '')
        + (Array.isArray(SH.debrief_spurningar) && SH.debrief_spurningar.length ? '<div style="margin:4px 0"><b>💬 Debrief-spurningar:</b><ul style="margin:3px 0 0;padding-left:18px">' + SH.debrief_spurningar.map((q) => '<li style="margin:2px 0">' + esc(q) + '</li>').join('') + '</ul></div>' : '')
        + '</div></details>'
      : '';
    // RÁÐHERRASKIPTING: leikstjóra-blað (RADHERRAR_HANDBOOK, ein uppspretta): hvers vegna, hvernig keyra, debrief-spurningar.
    const RH = RADHERRAR_HANDBOOK;
    const rhHb = (facCfg(st).radherrar === true && RH)
      ? '<details data-keep="hb-radherrar"' + (S.openDetails.has('hb-radherrar') ? ' open' : '') + ' style="margin:5px 0;border:1px solid #b98cff88;border-radius:8px;padding:8px 12px;background:rgba(185,140,255,.06)">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:13.5px">🎭 ' + esc(RH.heiti || 'Ráðherraskipting') + ' — liðin skipta með sér ráðuneytum</summary>'
        + '<div style="font-size:12.8px;line-height:1.55;margin-top:6px">'
        + '<p style="margin:2px 0"><b>Hvað gerist:</b> ' + esc(RH.blurb || '') + '</p>'
        + (RH.hvers_vegna ? '<p style="margin:4px 0"><b>📚 Hvers vegna:</b> ' + esc(RH.hvers_vegna) + '</p>' : '')
        + (RH.hvernig_keyra ? '<p style="margin:4px 0"><b>🎬 Svona keyrirðu hana:</b> ' + esc(RH.hvernig_keyra) + '</p>' : '')
        + (Array.isArray(RH.debrief_spurningar) && RH.debrief_spurningar.length ? '<div style="margin:4px 0"><b>💬 Debrief-spurningar:</b><ul style="margin:3px 0 0;padding-left:18px">' + RH.debrief_spurningar.map((q) => '<li style="margin:2px 0">' + esc(q) + '</li>').join('') + '</ul></div>' : '')
        + '</div></details>'
      : '';
    // VERK B: „?"-hnappur við hlið handbókar opnar uppsetningar-vísinn aftur (eftir lok/sleppingu).
    return '<div class="lk-card"><h2 class="lk-onb-h2">📖 Kennsluhandbók leikstjóra <button type="button" class="lk-onb-help" id="lk-onb-open" title="Opna uppsetningar-vísi (4 skref)" aria-label="Opna uppsetningar-vísi">?</button></h2><p class="lk-muted" style="font-size:12px;margin:0 0 6px">Leiðsögn fyrir hvert kjörtímabil — hvað ber að varast og hvaða stillingar henta best (grunduð í herminum + hagsögunni). Aðeins sýnilegt þér. Á Erfitt eru böndin þrengri og áföllin harðari — minna svigrúm fyrir mistök.</p>'
      // HANDBOOK-efnið er skrifað fyrir sögulegu sviðsmyndina — segjum það hreint út ef spilað er annað.
      + (svHefurSogu(st) ? '' : '<p class="lk-muted" style="font-size:12px;margin:0 0 6px;border-left:3px solid #8ca0c8;padding-left:8px">🔭 Þessi leikur notar sviðsmyndina <b>' + esc(svHeiti(st)) + '</b>. Kjörtímabila-leiðsögnin hér að neðan er byggð á hagsögunni ' + esc(svidsmyndOf(SVIDSMYND_SJALFGEFIN).heiti) + ' og á því aðeins við sem almenn hagstjórnar-leiðsögn.</p>')
      + thokaHtml + sattHb + rhHb + HANDBOOK.map(entry).join('') + '</div>';
  }
  // VERK B: stillingar leiksins eins og leikstjóri sér þær í lobby. Þjóns-sannleikur þar sem hann er til (mode/difficulty;
  // timerSec/surpriseOn/rolesOn EF þjónninn bætir þeim í lobby-state), annars það sem vafrinn man frá stofnun; annar vafri → „óþekkt".
  function facCfg(st) {
    let loc = null; try { loc = JSON.parse(localStorage.getItem(lsFacCfg(S.code)) || 'null'); } catch (e) {}
    const unk = 'óþekkt (stofnað í öðrum vafra)';
    const mode = st.mode || (loc && loc.mode) || 'classic';
    const difficulty = st.difficulty || (loc && loc.difficulty) || 'medium';
    const timerMin = st.timerSec != null ? Math.round(st.timerSec / 60) : (loc ? (+loc.timerMin || 0) : null);
    const surprise = typeof st.surpriseOn === 'boolean' ? st.surpriseOn : (loc ? !!loc.surprise : null);
    const roles = typeof st.rolesOn === 'boolean' ? st.rolesOn : (st.roleMap ? true : (loc ? !!loc.roles : null));
    // ÞOKA: þjóns-sannleikur ef hann fylgir fac-state (thokaOn-flagg EÐA st.thoka.on), annars það sem vafrinn man frá stofnun.
    const thoka = typeof st.thokaOn === 'boolean' ? st.thokaOn : (st.thoka && typeof st.thoka.on === 'boolean' ? st.thoka.on : (loc ? !!loc.thoka : null));
    // ÞJÓÐARSÁTT: þjóns-sannleikur ef hann fylgir (sattOn-flagg EÐA st.satt.on), annars það sem vafrinn man frá stofnun.
    const satt = typeof st.sattOn === 'boolean' ? st.sattOn : (st.satt && typeof st.satt.on === 'boolean' ? st.satt.on : (loc ? !!loc.satt : null));
    // RÁÐHERRASKIPTING: þjóns-sannleikur ef hann fylgir (radherrarOn-flagg EÐA st.radherrar.on), annars það sem vafrinn man frá stofnun.
    const radherrar = typeof st.radherrarOn === 'boolean' ? st.radherrarOn : (st.radherrar && typeof st.radherrar.on === 'boolean' ? st.radherrar.on : (loc ? !!loc.radherrar : null));
    // SVIÐSMYND: þjóns-sannleikur (st.svidsmynd úr /state) þar sem hann er til, annars minni vafrans frá stofnun.
    const svid = (st.svidsmynd && st.svidsmynd.id) ? st.svidsmynd : (loc && loc.svidsmynd ? svidsmyndOf(loc.svidsmynd) : null);
    return { mode, modeTxt: mode === 'studio' ? '🎛️ Stjórnstöð (sleðar + lifandi gröf)' : 'Einföld val', difficulty, difficultyTxt: DIFF_LABEL(difficulty),
      svidsmynd: svid, svidsmyndTxt: svid == null ? unk : (svid.heiti + ' — ' + svid.undirtitill),
      timerMin, timerTxt: timerMin == null ? unk : (timerMin > 0 ? timerMin + ' mín per lotu' : 'engin'),
      surprise, surpriseTxt: surprise == null ? unk : (surprise ? 'kveikt' : 'slökkt'), roles, rolesTxt: roles == null ? unk : (roles ? 'kveikt' : 'slökkt'),
      thoka, thokaTxt: thoka == null ? unk : (thoka ? 'kveikt — liðin sjá hagtölur með eins kjörtímabils töf' : 'slökkt'),
      satt, sattTxt: satt == null ? unk : (satt ? 'kveikt — fangaklemma þvert á lið í sáttar-lotunum (sjálfgefið KT3 og KT6)' : 'slökkt'),
      radherrar, radherrarTxt: radherrar == null ? unk : (radherrar ? 'kveikt — hver liðsmaður stýrir sínu ráðuneyti, forsætisráðherra læsir' : 'slökkt') };
  }
  function settingsCard(st) {
    const c = facCfg(st), real = (st.teams || []).filter((t) => !isBotTeam(t));
    const row = (id, k, v) => '<div class="lk-lb-row"' + (id ? ' id="' + id + '"' : '') + '><span>' + k + '</span><span><b>' + esc(v) + '</b></span></div>';
    // ⏳ HÆGUR HAMUR: umferðar-klukkan er ÓVIRK þegar hann er á (ein klukka á skjánum) + eigin lína um taktinn.
    const asy = asyncStutt(st), asyOn = asyncOf(st);
    const asyRow = asy ? row('lk-set-async', '⏳ Hægur hamur', asyOn ? ('kveikt — ný lota ' + asyncTaktur(asyOn.cadence).tidni + ' kl. ' + asyncKlst(asyOn.hour)) : 'slökkt') : '';
    return '<div class="lk-card" id="lk-settings"><h2>⚙️ Stillingar leiksins</h2>' + row('lk-set-svidsmynd', '🗺️ Sviðsmynd', c.svidsmyndTxt) + row('', '🎛️ Hamur', c.modeTxt) + row('', '🎚️ Erfiðleikastig', c.difficultyTxt) + row('', '⏱️ Umferðar-klukka', asyOn ? 'óvirk í hægum ham' : c.timerTxt) + asyRow + row('lk-set-surprise', '🎲 Óvænt atvik', c.surpriseTxt) + row('lk-set-thoka', '🌫️ Hagstjórn í þoku', c.thokaTxt) + row('lk-set-satt', '🤝 Þjóðarsáttin', c.sattTxt) + row('lk-set-radherrar', '🎭 Ráðherraskipting', c.radherrarTxt) + row('', '🎭 Leynileg hlutverk', c.rolesTxt)
      + (c.thoka ? '<p class="lk-muted" style="font-size:12px;margin:6px 0 0">🌫️ ' + esc(THOKA_BLURB) + ' Þú og skjávarpinn sjáið áfram allt; tölurnar afhjúpast fyrir liðin við hvert uppgjör.</p>' : '')
      + (c.satt ? '<p class="lk-muted" style="font-size:12px;margin:6px 0 0">🤝 ' + esc(SATT_BLURB) + '</p>' : '')
      + (c.radherrar ? '<p class="lk-muted" style="font-size:12px;margin:6px 0 0">🎭 ' + esc(RH_BLURB) + '</p>' : '')
      + '<p class="lk-muted" style="font-size:12px;margin:8px 0 0">Stillingar veljast þegar leikur er stofnaður' + (st.phase === 'lobby' && !real.length ? ' — <a href="/leikur/">stofna nýjan leik með öðrum stillingum</a> (ekkert lið komið enn)' : '') + '.</p></div>';
  }
  const joinLink = () => location.origin + '/leikur/?join=' + encodeURIComponent(S.code || '');
  const watchLink = () => location.origin + '/leikur/?g=' + encodeURIComponent(S.code || '') + '&watch=1';
  function renderFacilitator(st) {
    let controls = '';
    const stopBtn = ' <button class="lk-btn" id="lk-stop" style="background:#e78284">⏹️ Stöðva leik</button>';
    const realTeams = (st.teams || []).filter((t) => !isBotTeam(t)), hasBot = (st.teams || []).some(isBotTeam);
    if (st.phase === 'lobby') controls = '<button class="lk-btn" id="lk-start"' + (st.teams.length ? '' : ' disabled') + '>▶ Byrja leik (' + st.teams.length + ' lið)</button>' + (st.teams.length ? '' : '<p class="lk-muted" style="font-size:12.5px;margin:8px 0 0">Hnappurinn opnast þegar a.m.k. eitt lið er komið inn.</p>');
    else if (st.phase === 'decide') {
      const rl = st.lockRoster || [], ready = rl.filter((r) => r.locked).length;
      // RÁÐHERRASKIPTING: sæta-yfirlit per lið úr lockRoster[].radherrar (stada-fylki EÐA {key:handle}-map): ✓ tekið / · laust.
      const rosterList = rl.map((r) => '<span style="margin-right:12px;white-space:nowrap">' + (r.locked ? '✅' : '⏳') + ' ' + esc(r.name) + rhRosterSeats(r.radherrar) + (r.radherrar != null && r.lockFallback === true ? ' <span class="lk-muted" title="Enginn forsætisráðherra — hver sem er í liðinu læsir">· enginn PM</span>' : '') + '</span>').join('');
      controls = '<p>Kjörtímabil ' + st.round + ' — lið taka ákvarðanir. <b>' + ready + '/' + rl.length + ' tilbúin</b></p>' + (rosterList ? '<div style="margin:6px 0;font-size:13px">' + rosterList + '</div>' : '') + '<button class="lk-btn" id="lk-resolve">Leysa kjörtímabil ' + st.round + '</button>' + stopBtn;
    } else if (st.phase === 'resolved') controls = '<p><b>✅ Kjörtímabil ' + st.round + ' leyst.</b> Skoðið niðurstöður liðanna hér að neðan, ýtið svo á:</p><button class="lk-btn" id="lk-next" style="font-size:17px;padding:12px 22px;background:#54d08a;color:#0e1116;font-weight:700">' + (st.round >= svLotur(st) ? '🏁 Ljúka leik' : '▶ Næsta kjörtímabil') + '</button>' + stopBtn;
    else if (st.phase === 'ended') controls = '<p><b>🏁 Leik lokið.</b></p><button class="lk-btn" id="lk-print">🖨️ Prenta skýrslu</button> <button class="lk-btn" id="lk-newgame">🔄 Nýr leikur</button>' + asyncSjalfLaestLina(st) + '<p class="lk-muted" style="font-size:12px;margin:8px 0 0">Skýrslan er prentvæn kennslu-samantekt leiksins — stigatafla, liðin eitt af öðru, samanburður og umræðukafli (vista má sem PDF í prent-glugganum).</p>';
    // PERSÓNUVERND: „Eyða leik núna" (POST /<code>/erase, fac-tákn) — aðeins í lobby og að leik loknum (þjónninn svarar 409 í gangi).
    // Eyðir leik + liðum + ákvörðunum + uppgjöri strax án þess að bíða vikulegu grisjunarinnar (sjá /leikur/personuvernd/).
    if (st.phase === 'lobby' || st.phase === 'ended') controls += '<div class="lk-erase-row" style="margin-top:12px;border-top:1px dashed var(--line,#2a2f3a);padding-top:8px"><button class="lk-btn lk-onb-ghost" id="lk-erase" style="color:#e78284;border-color:#e7828455">🗑️ Eyða leik núna</button><span class="lk-muted" style="font-size:12px;margin-left:8px">Eyðir leiknum, liðsheitum, ákvörðunum og uppgjöri strax og endanlega (annars sjálfkrafa eftir 90 daga).' + (st.phase === 'ended' ? ' Prentaðu skýrsluna fyrst ef þú vilt halda henni.' : '') + '</span><div id="lk-erase-err" class="lk-err" aria-live="polite"></div></div>';
    const teamList = st.teams.map((t) => '<div class="lk-lb-row"><span>' + (isBotTeam(t) ? '🤖 ' : '') + esc(t.name) + '</span><span>' + num(t.cumulative || 0) + ' stig</span></div>').join('') || '<p>Bíð eftir liðum…</p>';
    // VERK B: æfingalið — aðeins í lobby og aðeins þegar ekkert raun-lið er komið (prófa uppgjörið ein/n).
    const botUi = (st.phase === 'lobby' && !realTeams.length)
      ? (hasBot
        ? '<p class="lk-onb-bot-note">🤖 Æfingalið er í leiknum — það tekur <b>hlutlausar ákvarðanir sjálfkrafa</b> (sleðar óbreyttir), svo þú getur ýtt á „Byrja leik" og „Leysa" strax til að sjá uppgjörið keyra. Raun-lið geta samt gengið inn á meðan leikurinn er í lobby.</p>'
        : '<div class="lk-onb-bot"><button class="lk-btn lk-onb-ghost" id="lk-bot">🤖 Bæta við æfingaliði</button><span class="lk-muted">Prófaðu hringrásina ein/n: æfingalið tekur hlutlausar ákvarðanir sjálfkrafa svo þú sjáir uppgjörið keyra.</span><div id="lk-bot-err" class="lk-err" aria-live="polite"></div></div>')
      : '';
    const header = '<div class="lk-card" id="lk-code-card"><h1>Leikstjóri</h1><p>Kóði til að deila (nemendur slá hann inn á <b>karp.is/leikur/</b>):</p><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div class="lk-onb-bigcode">' + esc(st.code) + '</div><button class="lk-btn" id="lk-copycode" style="background:#f6b13b;color:#0e1116;font-weight:700">📋 Afrita kóða</button><button class="lk-btn lk-onb-ghost" id="lk-joinlink">🔗 Afrita inngöngu-hlekk</button></div><button class="lk-btn" id="lk-watchlink" style="margin-top:10px;background:#5ac8e0">📺 Afrita áhorfenda-hlekk (skjávarpi)</button></div>';
    const teamsCard = '<div class="lk-card" id="lk-teams-card"><h2>Lið</h2>' + teamList + botUi + '</div>';
    const controlsCard = '<div class="lk-card" id="lk-controls-card">' + controls + '</div>';
    const eventCard = st.event ? card('📋 Umferð ' + st.round + ': ' + st.event.title, '<p>' + esc(st.event.text) + '</p>') : '';
    const analyticsCard = st.analytics ? card('📈 Greining (leikstjóri)', (() => { try { return renderFacAnalytics(st.analytics, st, S.openDetails, { thoka: facCfg(st).thoka === true }); } catch (err) { console.error('renderFacAnalytics villa', err); return '<p class="lk-muted">Greining tókst ekki að teikna (stýringar að ofan virka eðlilega).</p>'; } })()) : '';
    // Lobby: uppsetningar-röð (stillingar → lið → ræsa) ofar handbókinni; aðrir fasar: óbreytt röð (+ stillingaspjald aðeins meðan vísir er opinn).
    // ⏳ HÆGUR HAMUR: 2,5 s pollið endurbyggir innerHTML — muna hvaða async-stýring hafði fókus og skila honum
    // eftir teikningu (annars „hoppar" valmyndin úr höndum leikstjórans). Aðeins #lk-as-*; annað ósnert.
    const asFocus = (document.activeElement && ['lk-as-on', 'lk-as-cadence', 'lk-as-hour', 'lk-as-save'].indexOf(document.activeElement.id) >= 0) ? document.activeElement.id : null;
    root.innerHTML = st.phase === 'lobby'
      ? header + settingsCard(st) + asyncFacCard(st) + teamsCard + controlsCard + handbookCard(st) + roleMapCard(st) + leaderboard(st) + analyticsCard
      : header + asyncBordi(st, 'fac') + eventCard + sattFacBlok(st) + (S.onb ? settingsCard(st) : '') + handbookCard(st) + teamsCard + roleMapCard(st) + controlsCard + leaderboard(st) + analyticsCard;
    if (asFocus) { const fe = root.querySelector('#' + asFocus); if (fe) { try { fe.focus({ preventScroll: true }); } catch (err) { fe.focus(); } } }
    const b = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = fn; };
    b('#lk-start', () => { if (S.onb) onbClose(true); control('start'); }); b('#lk-resolve', () => control('resolve')); b('#lk-next', () => control('next'));
    b('#lk-stop', () => control('stop')); b('#lk-newgame', () => { location.href = '/leikur/'; });
    b('#lk-erase', () => eraseGame());
    b('#lk-print', () => printOpen(st));   // VERK 3: prentanleg kennsluskýrsla (leikslok)
    b('#lk-copycode', () => copyText(S.code, root.querySelector('#lk-copycode'), '✅ Kóði afritaður'));
    b('#lk-joinlink', () => copyText(joinLink(), root.querySelector('#lk-joinlink'), '✅ Hlekkur afritaður'));
    b('#lk-watchlink', () => copyText(watchLink(), root.querySelector('#lk-watchlink'), '✅ Áhorfenda-hlekk afritaður'));
    b('#lk-bot', () => addBotTeam());
    // ÞJÓÐARSÁTT: Karphús-hléið (fac-control 'karphus') — opna með 3 mín sjálfgefið, loka hvenær sem er.
    b('#lk-karphus-open', () => act(() => api('/' + S.code + '/control', { method: 'POST', body: { action: 'karphus', open: true, minutes: 3 }, token: S.token })));
    b('#lk-karphus-close', () => act(() => api('/' + S.code + '/control', { method: 'POST', body: { action: 'karphus', open: false }, token: S.token })));
    b('#lk-onb-open', () => onbStart());
    // VERK B: vísirinn opnast sjálfkrafa í FYRSTA lobby þessa vafra (localStorage-flagg vantar); annars aðeins um „?".
    if (st.phase === 'lobby' && !S.onb && !S.onbSeen && !onbDone()) { S.onb = { step: 0 }; S.onbScrolled = null; S.onbSig = null; }
    onbUpdate();
  }

  // ── VERK B: uppsetningar-vísir leikstjóra (4 skref) ──
  // Spjaldið býr í EIGIN hýsli (systkini #leikur-root, fast neðst t.h.) svo 2,5 s poll-endurteiknun root-sins hreyfi það ekki;
  // endurteiknast aðeins þegar undirskrift (skref/fasi/liðafjöldi) breytist. Highlight-ramminn (.lk-onb-hl) er settur á
  // viðkomandi stillingu í root eftir HVERJA teikningu (DOM-ið er nýtt) með animation-delay-fasa svo púlsinn hökti ekki.
  // Tvö hlutverk: „lifandi" í leikstjóra-sýn (raun-kóði, Ræsa-hnappur) og „leiðsögu-hamur" á lendingu (engin leikur;
  // skref 2–3 lýsa upp stillingar lendingar sem þar MÁ breyta; skref 4 býður „Stofna leik núna").
  let onbHost = null;
  function onbDone() { try { return !!localStorage.getItem(LS_ONB); } catch (e) { return S.onbSeen === true; } }
  function onbEnsureHost() {
    if (onbHost) return onbHost;
    onbHost = document.createElement('div'); onbHost.id = 'lk-onb-host';
    (root.parentNode || document.body).appendChild(onbHost);
    onbHost.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('[data-onb]'); if (!b || !onbHost.contains(b)) return;
      if (b.tagName === 'A' && b.getAttribute('href') === '#') e.preventDefault();
      const a = b.dataset.onb;
      if (a === 'next') { if (S.onb) { S.onb.step = Math.min(ONB_STEPS - 1, S.onb.step + 1); onbUpdate(); } }
      else if (a === 'prev') { if (S.onb) { S.onb.step = Math.max(0, S.onb.step - 1); onbUpdate(); } }
      else if (a === 'skip' || a === 'done') onbClose(true);
      else if (a === 'copycode') copyText(S.code || '', b, '✅ Afritað');
      else if (a === 'copylink') copyText(joinLink(), b, '✅ Afritað');
      else if (a === 'copywatch') copyText(watchLink(), b, '✅ Afritað');
      else if (a === 'start') { onbClose(true); control('start'); }
      else if (a === 'create') { onbClose(false); createGame(); }
    });
    return onbHost;
  }
  function onbStart() { S.onb = { step: 0 }; S.onbScrolled = null; S.onbSig = null; if (S.code && S.state && S.role === 'fac') render(); else onbUpdate(); }   // fac utan lobby: render() svo stillingaspjaldið birtist strax
  function onbClose(markDone) {
    S.onb = null; S.onbSig = null; S.onbScrolled = null;
    if (markDone) { S.onbSeen = true; try { localStorage.setItem(LS_ONB, String(Date.now())); } catch (e) {} }
    if (onbHost && onbHost.firstChild) onbHost.innerHTML = '';
    onbClearHl();
  }
  function onbClearHl() { root.querySelectorAll('.lk-onb-hl').forEach((el) => { el.classList.remove('lk-onb-hl'); el.style.animationDelay = ''; }); }
  // Skotmörk per skref: 1 kóða-spjaldið · 2 stillingar · 3 óvænt-atvik-röðin · 4 áhorfenda-hlekkur + Ræsa-hnappur.
  const ONB_TARGETS = [['#lk-code-card', '#lk-create-card'], ['#lk-settings'], ['#lk-set-surprise', '#lk-set-thoka', '#lk-set-satt', '#lk-set-radherrar'], ['#lk-watchlink', '#lk-start']];
  function onbApplyHl() {
    onbClearHl(); if (!S.onb) return;
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const els = (ONB_TARGETS[S.onb.step] || []).map((sel) => root.querySelector(sel)).filter(Boolean);
    els.forEach((el) => { el.classList.add('lk-onb-hl'); el.style.animationDelay = '-' + (Date.now() % 1800) + 'ms'; });
    if (els.length && S.onbScrolled !== S.onb.step) { S.onbScrolled = S.onb.step; try { els[0].scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); } catch (e) {} }
  }
  function onbUpdate() {
    if (!S.onb) { if (onbHost && onbHost.firstChild) onbHost.innerHTML = ''; onbClearHl(); return; }
    const st = (S.code && S.role === 'fac') ? S.state : null, live = !!st;
    const teams = live ? (st.teams || []) : [], real = live ? teams.filter((t) => !isBotTeam(t)) : [];
    const sig = [S.onb.step, live ? 1 : 0, st ? st.phase : '-', teams.length, real.length, S.code || ''].join('|');
    if (sig !== S.onbSig) { S.onbSig = sig; onbEnsureHost().innerHTML = onbPanel(S.onb.step, { live, st, teams, real }); }
    onbApplyHl();
  }
  function onbPanel(step, { live, st, teams, real }) {
    const cfg = live ? facCfg(st) : null;
    const dots = Array.from({ length: ONB_STEPS }, (_, i) => '<span class="lk-onb-dot' + (i === step ? ' on' : i < step ? ' done' : '') + '"></span>').join('');
    let title = '', body = '';
    if (step === 0) {
      title = '1 · Deildu kóðanum';
      body = live
        ? '<div class="lk-onb-code">' + esc(st.code) + '</div><div class="lk-onb-row"><button class="lk-btn" data-onb="copycode">📋 Afrita kóða</button><button class="lk-btn lk-onb-ghost" data-onb="copylink">🔗 Afrita inngöngu-hlekk</button></div><p>Nemendur fara á <b>karp.is/leikur/</b>, slá kóðann inn og velja liðsheiti — eða opna hlekkinn (kóðinn fyllist inn). Eitt tæki per lið dugar; félagar ganga í sama lið með „Bjóða í lið". Kóðinn er líka stór efst á síðunni.</p>'
        : '<p>Um leið og þú stofnar leik færðu <b>5 stafa kóða</b> (birtist stórt efst) ásamt <b>📋 Afrita</b>-hnappi og inngöngu-hlekk. Nemendur fara á <b>karp.is/leikur/</b>, slá kóðann inn og velja liðsheiti — eitt tæki per lið dugar, félagar ganga í sama lið með boðs-hlekk.</p>';
    } else if (step === 1) {
      title = '2 · Veldu erfiðleika og tíma';
      body = '<ul class="lk-onb-list">' + ['easy', 'medium', 'hard'].map((k) => '<li><b>' + esc(DIFFICULTY[k].label) + '</b> — ' + esc(DIFFICULTY[k].blurb) + '</li>').join('') + '</ul>'
        + '<p><b>⏱️ Umferðar-klukka:</b> 15–20 mín per lota fyrir 90 mín vinnustofu. Klukkan er sjónræn ýting — hún læsir engu; þú leysir lotuna þegar þér hentar og mátt stöðva leikinn hvenær sem er.</p>'
        + (live
          ? '<p class="lk-onb-now">Þessi leikur: <b>' + esc(cfg.difficultyTxt) + '</b> · klukka <b>' + esc(cfg.timerTxt) + '</b>.' + (st.phase === 'lobby' && !real.length ? ' Stillingar veljast við stofnun — <a href="/leikur/">stofnaðu nýjan leik</a> ef þú vilt breyta (ekkert lið er komið enn).' : '') + '</p>'
          : '<p class="lk-onb-now">Veldu í stillingunum (auðkenndar) áður en þú stofnar leikinn.</p>');
    } else if (step === 2) {
      title = '3 · Kveiktu á óvæntum atvikum?';
      body = '<p>Frá 2. kjörtímabili getur óvænt atvik dúkkað upp (um helmings líkur per lotu): 🌋 eldgos, ✊ verkföll, 🐟 makríll, 📰 spillingarmál, 🏭 gagnaver… Sama atvik fyrir öll lið; sum bjóða <b>klemmu-val</b> sem liðið þarf að taka afstöðu til — og valið sést á Íslandskortinu.</p><p><b>Ráðlegging:</b> slökkt í fyrstu keyrslu (lærið grunn-hringrásina), <b>kveikt eftir það</b> — atvikin gera umræðuna líflegri.</p>'
        + '<p>🌫️ <b>Hagstjórn í þoku</b> (valkostur við hliðina): ' + esc(THOKA_BLURB) + '</p>'
        + '<p>🤝 <b>Þjóðarsáttin</b> (valkostur við hliðina): ' + esc(SATT_BLURB) + '</p>'
        + '<p>🎭 <b>Ráðherraskipting</b> (aðeins í Stjórnstöð): ' + esc(RH_BLURB) + '</p>'
        + (live ? '<p class="lk-onb-now">Í þessum leik: óvænt atvik <b>' + esc(cfg.surpriseTxt) + '</b> · þoka <b>' + esc(cfg.thoka == null ? 'óþekkt' : cfg.thoka ? 'kveikt' : 'slökkt') + '</b>.</p>' : '');
    } else {
      title = '4 · Opnaðu skjávarpann';
      body = '<p>Áhorfenda-sýnin er fyrir skjávarpann: stigatafla, Íslandskortið og RÁS-tíðindi uppfærast sjálfkrafa. Opnaðu hana í nýjum glugga og dragðu yfir á skjávarpann — svo ræsirðu leikinn hér.</p>'
        + (live ? '<div class="lk-onb-row"><button class="lk-btn" data-onb="copywatch">📺 Afrita áhorfenda-hlekk</button><a class="lk-btn lk-onb-ghost" href="' + esc(watchLink()) + '" target="_blank" rel="noopener">↗ Opna skjávarpa</a></div>' : '')
        + (live && st.phase === 'lobby'
          ? '<p class="lk-onb-now">' + (real.length ? '<b>' + real.length + ' lið</b> komin — þú getur ræst.' : teams.length ? '<b>🤖 Æfingalið</b> er inni — þú getur ræst og prófað uppgjörið.' : 'Bíddu þar til a.m.k. 1 lið er komið inn. Vantar lið? <b>🤖 Æfingalið</b> (í Lið-spjaldinu) lætur þig prófa uppgjörið ein/n.') + '</p><div class="lk-onb-row"><button class="lk-btn" data-onb="start"' + (teams.length ? '' : ' disabled') + '>▶ Ræsa leik (' + teams.length + ' lið)</button></div>'
          : live ? '<p class="lk-onb-now">Leikurinn er í gangi ✅</p>'
            : '<div class="lk-onb-row"><button class="lk-btn" data-onb="create">🎓 Stofna leik núna</button></div>');
    }
    const nav = '<div class="lk-onb-nav">' + (step > 0 ? '<button class="lk-btn lk-onb-ghost" data-onb="prev">‹ Til baka</button>' : '<span></span>') + (step < ONB_STEPS - 1 ? '<button class="lk-btn" data-onb="next">Næsta ›</button>' : '<button class="lk-btn" data-onb="done">✅ Ljúka vísi</button>') + '</div>';
    return '<div class="lk-onb" role="dialog" aria-label="Uppsetningar-vísir leikstjóra"><div class="lk-onb-head"><span class="lk-onb-kicker">Uppsetningar-vísir · ' + (step + 1) + '/' + ONB_STEPS + '</span><span class="lk-onb-dots" aria-hidden="true">' + dots + '</span><button type="button" class="lk-onb-x" data-onb="skip" title="Sleppa vísi" aria-label="Sleppa vísi">✕</button></div><h3 class="lk-onb-title">' + esc(title) + '</h3><div class="lk-onb-body">' + body + '</div>' + nav + '<a href="#" class="lk-onb-skip" data-onb="skip">Sleppa vísi — sést ekki aftur (opna með „?" við handbókina)</a></div>';
  }

  // #5 Leikslok-samantekt: dregur lærdóm úr öllum kjörtímabilunum (eigin trajectory + raun + sleða-saga).
  function teamRecap(st) {
    const mineTraj = (st.trajectory || []).find((t) => t.teamId === S.teamId);
    const pts = mineTraj ? mineTraj.points.slice().sort((a, b) => a.round - b.round) : [];
    if (!pts.length) return '';
    const perRoundScores = pts.map((p, i) => ({ round: p.round, score: Math.round((p.value - (i ? pts[i - 1].value : 0)) * 10) / 10 }));
    // Raun-viðmið per kjörtímabil — AÐEINS ef sviðsmyndin á raungögn. Framtíðar-sviðsmynd (reality=null)
    // skilar tómum lista og buildRecap sleppir þá öllum raunveruleika-samanburði.
    const svRec = svHefurSogu(st) ? (svidsmyndOf(svOf(st).id).reality || null) : null;
    const realityPerTerm = !svRec ? [] : perRoundScores.map((p) => {
      const idx = Math.min((svRec.verdbolga || []).length - 1, p.round * 4 - 1);
      // Þolið gagnvart per-lotu markmiðum: skora raunveruleikann yfir AÐEINS þau KPI sem hafa raun-gögn (kjarninn).
      const subKpis = st.mandate.kpis.filter((kpi) => svRec[kpi.key]); const realK = {};
      for (const kpi of subKpis) realK[kpi.key] = svRec[kpi.key][idx];
      return subKpis.length ? { round: p.round, score: Math.round(scoreRound(realK, { ...st.mandate, kpis: subKpis }).composite * 10) / 10 } : { round: p.round, score: null };
    });
    const leversFull = [];
    (st.history || []).forEach((h, i) => { if (h && h.levers) leversFull.push({ round: i + 1, levers: h.levers }); });
    if (st.mode === 'studio' && st.draft && Object.keys(st.draft).length) leversFull.push({ round: (st.history || []).length + 1, levers: st.draft });
    const events = ((st.scenarioSoFar && st.scenarioSoFar.length ? st.scenarioSoFar : svidsmyndOf(svOf(st).id).events) || []).map((e) => ({ round: e.round, icon: e.icon, title: e.title }));
    const rc = buildRecap({ perRoundScores, realityPerTerm, leversFull, mandate: st.mandate, events, baseline: BASELINE, disp, finalPerKpi: st.finalPerKpi || [], avgApproval: st.avgApproval != null ? st.avgApproval : null });
    const polSum = (st.policySummary && st.policySummary.length)
      ? '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px"><b>🏛️ Stóru ákvarðanirnar ykkar á leiðinni:</b><ul style="margin:5px 0 0;padding-left:20px;line-height:1.6;font-size:13.5px">' + st.policySummary.map((p) => '<li>' + p.icon + ' ' + esc(p.label) + ': <b>' + esc(p.choice) + '</b></li>').join('') + '</ul></div>'
      : '';
    if (!rc.lines.length && !polSum) return '';
    return '<div class="lk-card lk-recap"><h2>📜 Yfirlit kjörtímabilanna ' + esc(svAr0(st) + '–' + (svAr0(st) + svLotur(st) * 4)) + '</h2>' + rc.lines.map((l) => '<p class="lk-recap-line">' + l + '</p>').join('') + polSum + '</div>';
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
    return '<div class="lk-card"><h2 title="' + esc(POL_INFO) + '">🧭 Pólitíska litrófið ' + svTimabil(st) + '</h2><div class="lk-upp-legend">' + legend + '</div>'
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
  // ÞOKA: þjónninn sendir watch í decide kort N-2 (merkt tof) — teiknað ÓBREYTT úr því sem kemur; aðeins merki í haus.
  function kortWatch(st, teams) {
    const kd = st.kort; if (!kd || !kd.length) return '';
    const tof = kd.some((k) => k && k.tof);
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
    return '<div class="lk-card lk-kort-watch"><h2>🇮🇸 ' + (pick.length === 2 ? 'Ísland liðanna' : 'Ísland efsta liðsins') + (tof ? ' <span class="lk-thoka-tag">🌫️ birt staða — eitt kjörtímabil á eftir</span>' : '') + '</h2><div class="lk-kort-grid' + (pick.length === 2 ? ' two' : '') + '">' + pick.map(one).join('') + '</div></div>';
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
    // RÁÐHERRASKIPTING: ríkisstjórnarfundurinn má hefjast í lobby (/saeti leyft þar) — liðið skiptir sætum áður en leikur byrjar.
    if (st.phase === 'lobby') { root.innerHTML = teamBanner(st) + card('Beðið eftir leikstjóra', '<p>Þú ert kominn/n inn. Leikstjórinn byrjar leikinn þegar öll lið eru tilbúin.</p>' + (rhOn(st) ? '<p class="lk-rh-lobbychip">' + rhHeadChip(st) + '</p>' : '')) + rhPickerCard(st) + leaderboard(st); return; }
    if (st.phase === 'ended') {
      const me = (st.teams || []).find((t) => t.id === S.teamId);
      const rounds = st.round || 8, cum = me ? (me.cumulative || 0) : 0, avg = rounds ? cum / rounds : 0, et = endTitle(avg);
      const rank = me ? ([...st.teams].sort((a, b) => (b.cumulative || 0) - (a.cumulative || 0)).findIndex((t) => t.id === S.teamId) + 1) : 0;
      const medals = st.medals || [];
      const shareText = '📰 RÁS-TÍÐINDI ' + svArLok(st) + ' — ' + svHeiti(st) + '\n' + et.title + '\nUppsafnað: ' + num(cum) + ' stig (meðal ' + num(avg) + '/100)' + (rank ? '\nSæti: ' + rank + '/' + st.teams.length : '') + (medals.length ? '\nTitlar: ' + medals.map((m) => m.icon + ' ' + m.title).join(', ') : '') + '\nkarp.is/leikur/';
      const medalHtml = medals.length
        ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">' + medals.map((m) => '<span title="' + esc(m.desc) + '" style="display:inline-flex;align-items:center;gap:5px;background:rgba(246,177,59,.13);border:1px solid #f6b13b55;border-radius:20px;padding:4px 11px;font-size:12.5px"><span style="font-size:15px">' + m.icon + '</span> <b>' + esc(m.title) + '</b></span>').join('') + '</div>'
        : '<p class="lk-muted" style="font-size:12px;margin:6px 0 0">Engir sérstakir verðlaunatitlar að þessu sinni — reyndu aftur og náðu markmiðunum!</p>';
      const frontPage = '<div class="lk-card" style="padding:0;overflow:hidden;border:1px solid var(--line)">'
        + '<div style="border-bottom:3px double var(--line);padding:10px 16px;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px"><b style="font-size:21px;letter-spacing:1.5px">📰 RÁS-TÍÐINDI</b><span class="lk-muted" style="font-size:12px">Reykjavík · ' + svArLok(st) + ' · lokafrétt</span></div>'
        + '<div style="padding:16px">'
        + '<div class="lk-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:1px">Arfleifð ríkisstjórnarinnar ' + svTimabil(st) + '</div>'
        + '<div class="lk-title-big" style="margin:4px 0 6px">' + esc(et.title) + '</div>'
        + '<p style="margin:0 0 8px;font-size:14px;line-height:1.5">' + esc(et.blurb) + '</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:8px 0;margin:8px 0"><span>📊 <b>' + num(cum) + '</b> stig</span><span>📈 meðal <b>' + num(avg) + '</b>/100</span>' + (rank ? '<span>🏅 sæti <b>' + rank + '/' + st.teams.length + '</b></span>' : '') + (st.avgApproval != null ? '<span>🗳️ fylgi <b>' + st.avgApproval + '%</b></span>' : '') + '</div>'
        + '<b style="font-size:13px">🏅 Verðlaunatitlar ríkisstjórnarinnar:</b>' + medalHtml
        + '<button class="lk-btn" id="lk-share" style="margin-top:12px">📋 Afrita forsíðuna</button>'
        + '</div></div>';
      // F3-V3: lokastaða kortsins við hlið „Ísland ykkar 2032"-blokkarinnar (grid 2 dálkar á breiðum skjá).
      const kortH = kortCardMitt(st), recapH = uppsafnadRecap(st, S.teamId);
      const lokaBlokk = (kortH && recapH) ? '<div class="lk-kort-loka">' + kortH + recapH + '</div>' : kortH + recapH;
      root.innerHTML = frontPage + teamBanner(st) + lokaBlokk + politikFerillCard(st) + sattEndCard(st) + teamRecap(st)
        + asyncSjalfLaestLina(st)   // ⏳ HÆGUR HAMUR: ein lína um sjálf-læstar ákvarðanir — SLEPPT hljóðlega ef talan vantar
        + '<p class="lk-muted lk-saga-loka">📜 Berðu ferilinn ykkar saman við söguna í uppgjörum lotanna.</p>'   // VERK 6: loka-línan
        + revealCard(st) + leaderboard(st);
      const sb = root.querySelector('#lk-share'); if (sb) sb.onclick = () => { try { navigator.clipboard.writeText(shareText); sb.textContent = '✅ Afritað!'; } catch (e) { sb.textContent = shareText; } };
      return;
    }
    if (st.phase === 'resolved') return renderTeamResults(st);
    // Ný umferð → núlla „breyta"-stöðu + studio-byggingu (carry-forward úr history)
    if (S.stRound !== st.round) { S.unlocked = false; S.stRound = st.round; S.dials = null; S.studioBuiltSig = null; S.localTouched = new Set(); S.rhPickerOpen = false; }
    // Læst-staða (A): eftir læsingu sýna staðfestingu + „Breyta" (aflæsa fram að resolve)
    if (st.you && st.you.locked && !S.unlocked) { if (S.pushTimer) { clearTimeout(S.pushTimer); S.pushTimer = null; } return renderLocked(st); }   // RÁÐHERRASKIPTING: læst → fella bið-push (þjónn merge-ar sleða ráðherra áfram eftir læsingu PM)
    maybeSepop(st);   // F2-V2: atviks-popup — fyrir bæði studio og classic decide-sýn (einu sinni per lotu)
    // Studio: byggja stjórnstöðina EINU SINNI per umferð; poll uppfærir Á STAÐNUM (án þess að clobber-a sleða).
    if (st.mode === 'studio') {
      // RÁÐHERRASKIPTING: sæta-skipti → localTouched hreinsað (sleðar fyrra ráðuneytis samstillast aftur frá þjóni) + bið-push fellt.
      if (rhOn(st)) { const m = rhMitt(st); if (S.rhMittSeen !== m) { if (S.rhMittSeen !== undefined) { S.localTouched = new Set(); if (S.pushTimer) { clearTimeout(S.pushTimer); S.pushTimer = null; } } S.rhMittSeen = m; } }
      // ÞJÓÐARSÁTT: Karphús-staðan er hluti undirskriftarinnar — poll uppfærir studio Á STAÐNUM (updateStudio) og
      // borðinn birtist/hverfur annars aldrei þegar leikstjórinn opnar/lokar hléinu mitt í lotu.
      // RÁÐHERRASKIPTING: sæti/picker eru líka í undirskriftinni (rhSig) → flipa-gátt, sæta-flísar og Læsa-hnappur endurbyggjast við breytingar.
      // ⏳ HÆGUR HAMUR er líka í undirskriftinni (aðeins rofinn/taktur/klukkustund — EKKI niðurtalningin) svo
      // fresta-borðinn og Læsa-textinn birtist strax ef leikstjórinn kveikir/slekkur mitt í lotu.
      const sig = 'studio|' + st.round + '|kh' + ((st.satt && st.satt.on && st.satt.karphus && st.satt.karphus.open) ? 1 : 0) + '|rh' + rhSig(st)
        + '|as' + (asyncOf(st) ? '1' + (st.async.cadence || '') + (st.async.hour == null ? '' : st.async.hour) : '0');
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
    // ⏳ HÆGUR HAMUR: umferðar-klukkan er slökkt (timerBadge skilar '') → sleppa líka umgjörðinni um hana,
    // annars stæði tómur kassi eftir. async slökkt: tb er ALLTAF ekki-tómt þegar secondsLeft != null → óbreytt.
    const tb = timerBadge(st), asyncOn = asyncOf(st);
    root.innerHTML =
      karphusBanner(st) +   // ÞJÓÐARSÁTT: Karphús-hléið efst á öllum liðs-skjám (decide)
      asyncBordi(st, 'team') +   // ⏳ HÆGUR HAMUR: fresta-borði í stað sekúndu-niðurtalningar
      '<div class="lk-pmh-solo">' + pmHeadHtml() + '</div>' +   // VERK 2: ráðherrann efst t.h., FYRIR OFAN liðs-borðann (classic hefur engan term-head)
      teamBanner(st) + roleBanner(st) +
      card('📋 Umferð ' + st.round + ': ' + ev.title, '<p>' + esc(ev.text) + '</p>' + (st.secondsLeft != null && tb ? '<div style="margin-top:6px">' + tb + '</div>' : '')) +
      thokaBanner(st) + thokaPastCard(st) +   // ÞOKA: borði undir kjörtímabils-hausnum (atburðar-spjaldið í classic) + „það sem vitað er"
      sattCard(st) +   // ÞJÓÐARSÁTT: val-spjaldið undir atviks-spjaldinu
      '<div class="lk-card"><h2>Ákvarðanir liðsins</h2>' + decHtml +
      '<button class="lk-btn" id="lk-lock"' + (ready ? '' : ' disabled') + ' style="margin-top:10px">' + (asyncOn ? '🔒 Læsa núna' : 'Læsa ákvörðunum') + '</button>' +
      (asyncOn && rhCanLock(st) ? '<p class="lk-muted lk-as-fine">Þú mátt opna aftur og breyta fram að lokun — lotan gerist upp sjálfkrafa þá.</p>' : '') +
      (ready ? '' : '<p style="color:var(--muted);font-size:13px">Veldu í öllum flokkum til að læsa.</p>') + '</div>' +
      asyncAskriftHtml(st) +   // ⏳ HÆGUR HAMUR: opt-in póst-áminning (aldrei forvalin)
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
    // SVIÐSMYND án hagsögu (hefurSogu=false, t.d. framtíðin 2026–2058): EKKERT „Svona fór það í alvöru".
    // Enginn samanburður er til — og við skáldum hann ekki. Í staðinn ein hógvær lína svo autt bil
    // í uppgjörinu líti ekki út eins og villa.
    if (!svHefurSogu(st)) return '<p class="lk-muted lk-saga-engin">🔭 Framtíðin er óskrifuð — engin raun-saga til samanburðar.</p>';
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
      // „🕰️ Svona fór það" — AÐEINS þegar sviðsmyndin á raungögn (reality). Framtíðin hefur engin → sleppt.
      const svR = svHefurSogu(st) ? (svidsmyndOf(svOf(st).id).reality || null) : null;
      const idx = svR ? Math.min((svR.verdbolga || []).length - 1, st.round * 4 - 1) : -1;
      const subKpis = svR ? st.mandate.kpis.filter((kpi) => svR[kpi.key]) : []; const realK = {};
      for (const kpi of subKpis) realK[kpi.key] = svR[kpi.key][idx];
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
      + sattResultsCard(st, { myTeamId: S.teamId })   // ÞJÓÐARSÁTT: afhjúpunin — hver valdi hvað, flokkur, áhrif, kennslusetning
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
    // Byrjunar-staða = SPÓLUN sviðsmyndarinnar aftur til upphafsárs hennar (klippt) — EN aðeins fyrir tól
    // sem eru til strax (KT1). Tól sem opnast síðar (LEVER_UNLOCK>1) byrja HLUTLAUS (á grunni) svo
    // spilarinn stilli þau sjálfur (t.d. ferðamannagjald).
    // ⚠ baseline.json ER Ísland í dag (~2026): 'island2000' þarf YEAR2000_DIALS til að komast aftur til
    // 2000, en FRAMTÍÐAR-sviðsmynd hefur dials={} → grunnurinn stendur óspólaður, sem er einmitt rétt.
    for (const [k, v] of Object.entries(svidsmyndOf(svOf(st).id).dials || {})) { if ((LEVER_UNLOCK[k] || 1) > 1) continue; const c = BASELINE.levers[k]; if (c) d[k] = Math.max(c.min, Math.min(c.max, v)); }
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
  const termYears = (r, ar0) => [ar0 + 4 * (r - 1), ar0 + 4 * r];
  // Tímalínu-borði: kjörtímabil sviðsmyndarinnar (t.d. 2000▬2032 eða 2026▬2058), núverandi gyllt,
  // liðin ✓, framtíð faint (án spillis). Upphafsár og fjöldi koma úr sviðsmyndinni, ekki fastar tölur.
  function ribbonHtml(st) {
    const cur = st.round, evs = st.scenarioSoFar || [], ar0 = svAr0(st), n = svLotur(st);
    let segs = '';
    for (let r = 1; r <= n; r++) {
      const [y0, y1] = termYears(r, ar0), cls = r < cur ? 'past' : r === cur ? 'now' : 'future';
      const ev = r <= cur ? evs[r - 1] : null, ic = ev && ev.icon ? ev.icon : (r < cur ? '✓' : '');
      const tip = ev ? y0 + '–' + y1 + ': ' + ev.title : y0 + '–' + y1 + ' (óráðið)';
      segs += `<div class="lk-term ${cls}" title="${esc(tip)}"><span class="lk-term-ic">${ic}</span><span class="lk-term-y">${y0}</span></div>`;
    }
    return `<div class="lk-ribbon">${segs}<div class="lk-term end"><span class="lk-term-ic">🏁</span><span class="lk-term-y">${ar0 + n * 4}</span></div></div>`;
  }
  // ÞOKA — viðmið ráðgjafa-matsins í forskoðun: nýjasta BIRTA kjörtímabil (st.thoka.birtLota = N-2) → loka-fjórðungur
  // þess í útkomu-slóð vélarinnar (lota r endar í mid[r*4-1]; slóðin er endurspiluð SAGA liðsins, svo gildið er nákvæmlega
  // það sem Hagstofan „birti"); engin birt lota (≤KT2) → upphafsstaða 2000 (BASELINE path[0]). Gildin sjálf fara ALDREI
  // í DOM — aðeins átt/styrkur/orð (thokaMat/thokaStyrkur). Sjá afmörkunar-skjölunina við thokaOn.
  function thokaRef(st) {
    const b = thokaBirt(st);
    return { idx: b.lota ? b.lota * 4 - 1 : -1, txt: b.lota ? 'tölur ' + b.txt : 'upphafsstöðu 2000' };
  }
  const thokaRefVal = (oc, key, ref) => (ref.idx >= 0 && ref.idx < oc.mid.length) ? oc.mid[ref.idx] : ((((BASELINE.outcomes[key] || {}).path || [])[0]) ?? oc.mid[0]);
  function drawStudioPreview(st) {
    const el = root.querySelector('#lk-st-chart'); if (!el) return;
    const sim = studioSim(st), ar0 = svAr0(st), endYear = ar0 + st.round * 4;
    const kpiVals = {}; for (const k of st.mandate.kpis) { const oc = sim.outcomes[k.key]; kpiVals[k.key] = oc ? oc.mid[oc.mid.length - 1] : 0; }
    const sc = scoreRound(kpiVals, st.mandate);
    const stab = govtStability(kpiVals), pop = stab.approval, popCol = pop >= 55 ? '#54d08a' : pop >= 35 ? '#e8c14a' : '#e78284';
    // ÞOKA: forskoðunin keyrir ÁFRAM (sama sim — kortið, pósi ráðherrans og ráðgjafarnir þurfa hana) en BIRTIST sem
    // ráðgjafa-mat: áttir + styrkur + orð per KPI, engin spátala (Þjóðarhags-mælir, goalMeter, gröf, hitakorts-tölur → falin).
    const fog = thokaOn(st) && st.phase === 'decide';
    const ref = fog ? thokaRef(st) : null;
    const mats = fog ? st.mandate.kpis.map((k) => { const oc = sim.outcomes[k.key]; if (!oc) return null; const last = oc.mid.length - 1; const unc = (oc.hi && oc.lo) ? (oc.hi[last] - oc.lo[last]) / 2 : 0; return { k, m: thokaMat(k, oc.mid[last], thokaRefVal(oc, k.key, ref), unc) }; }).filter(Boolean) : null;
    // #2 Live fórnarskipti: gult borði þegar tvö umboðs-markmið toga á móti hvort öðru við núverandi stöðu.
    // (Eigindlegur texti án talna — sýnist líka í þoku sem rödd ráðgjafanna.)
    const conflicts = detectConflicts(kpiVals, st.mandate);
    let html = '';
    if (conflicts.length) html += '<div class="lk-conflict">' + conflicts.map((c) => '<div class="lk-conflict-row"><span class="lk-conflict-ic">⚠</span><span>' + esc(c.msg) + '</span></div>').join('') + '</div>';
    if (!fog) {
      html += '<div class="lk-card lk-gauge-card"><div class="lk-gauge" title="Samsett stig 0–100 úr umboðs-markmiðunum í lok kjörtímabilsins. Hærra = betri hagstjórn.">' + arcGauge(sc.composite) + '</div><div style="flex:1"><h2 style="margin:0">Þjóðarhagur</h2><p class="lk-muted" style="font-size:12px;margin:4px 0 8px">Samsett staða m.v. umboðið í lok kjörtímabilsins (' + endYear + '). Hærra = betra.' + (sc.crisis ? ' <span style="color:#e78284">⚠ Kreppa!</span>' : '') + (stab.level !== 'stable' ? ' <span style="color:' + (stab.level === 'revolt' ? '#e78284' : '#e8c14a') + '">' + stab.icon + ' ' + esc(stab.title) + ' — stig ×' + stab.factor + '</span>' : '') + '</p><div class="lk-pop" title="Fylgi ríkisstjórnarinnar — ræðst af verðbólgu, atvinnuleysi og hagvexti. Undir 50% og þú átt á hættu að falla í kosningum."><div class="lk-gm-top"><span>🗳️ Fylgi ríkisstjórnar</span><b style="color:' + popCol + '">' + pop + '%</b></div><div class="lk-gm-bar"><div class="lk-gm-fill" style="width:' + pop + '%;background:' + popCol + '"></div></div></div></div></div>';
    } else {
      // Ráðgjafa-mat í stað Þjóðarhags-mælis: hve mörg markmið líklega innan marka (gróf heildarmynd, engin stigatala)
      // + fylgi-ÁTT m.v. síðasta MÆLDA fylgi (st.thoka.stodugleiki.approval — það er þekkt, sjá thokaPastCard); spá-% falið.
      const innan = mats.filter((x) => x.m.vs === 'innan').length;
      const known = (st.thoka.stodugleiki && typeof st.thoka.stodugleiki.approval === 'number') ? st.thoka.stodugleiki.approval : null;
      const dp = known != null ? pop - known : null;
      const fylgiTxt = dp == null ? 'ekkert fylgi mælt enn' : dp > 4 ? 'líklega hækkandi' : dp < -4 ? 'líklega lækkandi' : 'líklega svipað og síðast';
      const fylgiCol = dp == null ? '#9fb0c8' : dp > 4 ? '#54d08a' : dp < -4 ? '#e78284' : '#e8c14a';
      const warn = (sc.crisis ? ' <span style="color:#e78284">⚠ Ráðgjafar vara við kreppu-hættu.</span>' : '') + (stab.level !== 'stable' ? ' <span style="color:' + (stab.level === 'revolt' ? '#e78284' : '#e8c14a') + '">' + stab.icon + ' Hætta á ólgu — fylgið gæti brostið.</span>' : '');
      html += '<div class="lk-card lk-gauge-card lk-thoka-gauge"><div class="lk-thoka-gauge-ic" aria-hidden="true">🌫️</div><div style="flex:1"><h2 style="margin:0">Þjóðarhagur — ráðgjafa-mat</h2>'
        + '<p class="lk-muted" style="font-size:12px;margin:4px 0 8px">Engin spátala í þoku: ráðgjafarnir lesa stefnuna úr drögunum ykkar og telja <b>' + innan + ' af ' + mats.length + '</b> markmiðum líklega innan marka í lok kjörtímabilsins (' + endYear + ') — m.v. ' + esc(ref.txt) + '. Hið rétta kemur í ljós við uppgjör.' + warn + '</p>'
        + '<div class="lk-pop" title="Fylgi ríkisstjórnarinnar — ræðst af verðbólgu, atvinnuleysi og hagvexti. Í þoku sést aðeins áttin m.v. síðasta mælda fylgi."><div class="lk-gm-top"><span>🗳️ Fylgi ríkisstjórnar</span><b style="color:' + fylgiCol + '">' + esc(fylgiTxt) + '</b></div></div></div></div>';
    }
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
    if (!fog) {
      html += '<div class="lk-card"><h2 title="Hversu nálægt hverju umboðs-markmiði þú ert. Fyllri borði = betra.">🎯 Markmið</h2><div class="lk-goalmeters">';
      for (const k of st.mandate.kpis) { const p = sc.perKpi.find((x) => x.key === k.key); html += goalMeter(k, kpiVals[k.key], p ? p.score : 0); }
      html += '</div></div>';
    } else {
      // ÞOKA: ráðgjafa-flísar í stað markmiða-mæla (pílur + „líklega yfir markmiði"), engar spátölur. Gröfin (stChart) eru
      // FALIN í þoku — valið fram yfir „gröf án y-áss": lögun spákúrfu við markmiðs-/raun-línu er spá í dulargervi og
      // ás-laus sparkline býður upp á ágiskun; flísarnar bera sömu ákvörðunar-upplýsingar (átt+styrkur+vs markmið) hreint.
      html += '<div class="lk-card lk-thoka-goals"><h2 title="Í þoku sjást engar spátölur — ráðgjafarnir gefa átt, styrk og orð per markmið. Hið rétta kemur í ljós við uppgjör.">🎯 Markmið — ráðgjafa-mat</h2>'
        + '<p class="lk-muted" style="font-size:12px;margin:0 0 8px">Pílur = átt og styrkur m.v. ' + esc(ref.txt) + ' (↑ lítil, ↑↑↑ mikil breyting); orðin segja hvort stefnir yfir, undir eða innan markmiðs. Gröf og spátölur eru falin í þoku.</p>'
        + '<div class="lk-goalmeters">' + mats.map((x) => thokaTile(x.k, x.m, ref.txt)).join('') + '</div></div>';
    }
    // F2-V3: Ráðgjafa-kortið flutt ALFARIÐ í PM-blöðruna (var tvítekning) — hér geymast bara lifandi
    // forskoðunar-gildin svo pósi + ráðgjafa-línur hornsins bregðist við sleða-drögunum (pmUpdate neðst).
    S.pmApproval = pop; S.pmApprovalRound = st.round; S.pmKpis = kpiVals; S.pmKpisRound = st.round;
    if (!fog) {
      // Raun-línan (fjólublá) kemur úr sviðsmyndinni — framtíðar-sviðsmynd hefur reality=null → engin lína og engin skýring á henni.
      const svReality = svidsmyndOf(svOf(st).id).reality;
      let charts = '<div class="lk-card"><h2 title="Þróun frá ' + ar0 + ': þín braut (heil lína), grunnlína (punktar)' + (svReality ? ', raunveruleikinn (fjólublár)' : '') + ' og markmið (gult).">📈 Þróun ' + ar0 + '–' + endYear + '</h2><div class="lk-charts">';
      for (const k of st.mandate.kpis) {
        const oc = sim.outcomes[k.key]; if (!oc) continue;
        const mid = oc.mid, last = mid.length - 1, bau = (BASELINE.outcomes[k.key] || {}).path || [], reality = (svReality && svReality[k.key]) || [];
        const tgt = k.dir === 'target' ? k.target : k.dir === 'max' ? k.max : k.min, fin = mid[last], b = k.band || 0;
        const good = k.dir === 'target' ? Math.abs(fin - k.target) <= b : k.dir === 'max' ? fin <= k.max + b : fin >= k.min - b;
        charts += stChart(k.label + (k.weight > 1 ? ' ×' + k.weight : ''), mid, bau, tgt, good ? '#54d08a' : '#e78284', reality, ar0);
      }
      charts += '</div><div class="lk-muted" style="font-size:11px;margin-top:4px">– – grunnlína · ' + (svReality ? '<span style="color:#b98cff">▬ raunveruleikinn</span> · ' : '') + 'gul strikalína = markmið</div></div>';
      html += charts;
    }
    // Hitakortið: venjulega tölur allra 36 útkoma; í þoku AÐEINS pílur (átt+styrkur m.v. birtu tölurnar) — tölur hvorki í flís né tooltip.
    let grid = '<div class="lk-card' + (fog ? ' lk-thoka-heat' : '') + '"><h2 title="' + (fog ? 'Allar 36 útkomur líkansins — í þoku aðeins átt og styrkur m.v. nýjustu birtu tölur (engar spátölur). Grænt = líklega til batnaðar, rautt = til hins verra.' : 'Allar 36 útkomur líkansins í lok kjörtímabilsins. Grænt = betra en grunnlína, rautt = verra.') + '">Allar útkomur (' + endYear + ')' + (fog ? ' — áttir' : '') + '</h2><div class="lk-heat">';
    for (const o of STUDIO_CAT.outcomes) {
      const oc = sim.outcomes[o.key]; if (!oc) continue;
      const fin = oc.mid[oc.mid.length - 1];
      if (fog) {
        const rv = thokaRefVal(oc, o.key, ref);
        const s = thokaStyrkur(fin, rv, Math.max(0.5, Math.abs(rv) * 0.05));
        const val = (fin - rv) * (o.polarity || 0);
        const bg = (o.polarity === 0 || s.styrkur === 0) ? 'rgba(255,255,255,.04)' : val > 0 ? 'rgba(84,208,138,.16)' : 'rgba(231,130,132,.16)';
        const tip = esc(o.label + ': ' + THOKA_ATT_TXT[s.att] + ' m.v. ' + ref.txt + ' (engar tölur í þoku)');
        grid += `<div class="lk-heat-tile" style="background:${bg}" title="${tip}"><span>${esc(o.label)}</span><b>${s.pilar}</b></div>`;
        continue;
      }
      const bau = (BASELINE.outcomes[o.key] || {}).path || [];
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
    // RÁÐHERRASKIPTING: flipi = ráðuneyti. Eigin flipi virkur; aðrir sjást en sleðarnir eru disabled + 🔒-borði (lifandi gildi
    // félaga samstillast áfram í updateStudio). Forsætisráðherra: allt virkt. Ekkert sæti: allt read-only + picker áberandi.
    const rhA = rhOn(st), rhMe = rhMitt(st), rhPm = rhIsPm(st);
    const tabOwner = rhTabOwner(tab.group);
    const tabMine = !rhA || rhPm || !!(rhMe && tabOwner && tabOwner.key === rhMe);
    const unlocked = (k) => (LEVER_UNLOCK[k] || 1) <= st.round;
    const tabBar = STUDIO_CAT.tabs.map((t, i) => { const m = TAB_META[t.group] || { icon: '', label: t.group }; const o = rhA ? rhTabOwner(t.group) : null; const own = !rhA || rhPm || !!(o && rhMe && o.key === rhMe); return `<span class="lk-tab${i === S.studioTab ? ' sel' : ''}${rhA ? (own ? ' lk-rh-own' : ' lk-rh-other') : ''}" data-tab="${i}" role="button" tabindex="0" title="${esc(t.group + (rhA && o ? ' — ' + o.heiti + (own ? ' (þú)' : '') : ''))}"><span class="lk-tab-ic">${m.icon}</span> ${esc(m.label)}${rhA && !own ? '<span class="lk-rh-tab-lock" aria-hidden="true">🔒</span>' : ''}</span>`; }).join('');
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
      return `<div class="lk-slider-row${core ? ' lk-core' : ''}"${capLock ? ' style="opacity:.45"' : ''} title="${esc(tip)}"><label>${capLock ? '🔒 ' : (core ? '⭐ ' : '')}${esc(l.label)} <span class="lk-val${moved ? ' moved' : ''}" data-val="${l.key}">${esc(disp(cfg, v))}</span>${st.difficulty === 'easy' ? ' <span class="lk-muted" style="font-size:11px">nú ' + esc(disp(cfg, l.base)) + '</span>' : ''}</label><input type="range" min="${l.min}" max="${l.max}" step="${l.step}" value="${v}" data-lev="${l.key}"${capLock || !tabMine ? ' disabled' : ''} aria-label="${esc(l.label)}"></div>`;
    }).join('') + (lockedN ? '<p class="lk-muted" style="font-size:12px;margin-top:8px">🔒 ' + lockedN + ' stjórntæki opnast á síðari kjörtímabilum.</p>' : '');
    // Vald-mælir (Erfitt): sýnir hversu mörg svið eru virk af leyfðum.
    const capHtml = cap ? '<div style="margin:6px 0 2px;padding:7px 10px;border-radius:8px;font-size:12.5px;background:' + (capReached ? 'rgba(231,130,132,.15);border:1px solid #e78284' : 'rgba(140,160,200,.12);border:1px solid #3a4152') + '">🏛️ <b>Pólitískt vald:</b> ' + activeKeys.length + '/' + cap + ' virk svið' + (capReached ? ' — fullnýtt. Endursettu sleða (á grunn) til að opna annað.' : '') + '</div>' : '';
    // „Ný stjórntæki" sem opnuðust ÞETTA kjörtímabil
    const newTools = STUDIO_CAT.tabs.flatMap((t) => t.levers).filter((l) => (LEVER_UNLOCK[l.key] || 1) === st.round).map((l) => l.label);
    const newToolsBanner = (st.round > 1 && newTools.length) ? '<div class="lk-newtools">🆕 <b>Ný stjórntæki opnuðust:</b> ' + newTools.map(esc).join(', ') + '</div>' : '';
    // #4 Mýkri byrjun: intro-borði aðeins í umferð 1.
    const introBanner = st.round === 1 ? '<div class="lk-intro">👋 <b>Þú stýrir Íslandi frá árinu 2000.</b> Byrjaðu á kjarna-tólunum fjórum (⭐): <b>Stýrivextir, Skattar, Tilfærslur, Menntun</b>. Færðu einn sleða, sjáðu áhrifin á gröfunum — og fínstilltu hin tólin síðar.</div>' : '';
    const [y0, y1] = termYears(st.round, svAr0(st)), ev = st.event;
    // VERK 2: term-head er nú flex — texti vinstri, PM-blokkin hægri (pmHeadHtml, fyllt í pmUpdate).
    // VERK 3: ev.watch-línan er FARIN héðan — textinn er fyrsta skilaboð ráðherrans (pmMessages).
    // VERK 5: arfleifðin birtist á NÁKVÆMLEGA tveimur stöðum: stuttar badge-flísar (policyBadgesRow)
    // FYRIR OFAN liðs-borðann og EITT 📋-spjald (carryoverCard, textar+deltas) FYRIR NEÐAN hann.
    root.innerHTML =
      karphusBanner(st) +   // ÞJÓÐARSÁTT: Karphús-hléið efst á öllum liðs-skjám (decide)
      asyncBordi(st, 'team') +   // ⏳ HÆGUR HAMUR: fresta-borði (textinn uppfærður á staðnum í asyncBordiSync — Stjórnstöðin endurbyggist sjaldan)
      ribbonHtml(st) +
      `<div class="lk-term-head lk-pmh-row"><div class="lk-pmh-left"><span class="lk-term-badge">Kjörtímabil ${st.round}/${svLotur(st)} · ${y0}–${y1}</span><span class="lk-term-badge lk-sv-badge" title="${esc(svOf(st).undirtitill || '')}">🗺️ ${esc(svHeiti(st))}</span>${st.difficulty && st.difficulty !== 'medium' ? '<span class="lk-term-badge" style="background:#3a2f1a">🎚️ ' + (st.difficulty === 'hard' ? 'Erfitt' : 'Létt') + '</span>' : ''}${thokaOn(st) ? '<span class="lk-term-badge lk-thoka-badge" title="' + esc(THOKA_BLURB) + '">🌫️ Þoka</span>' : ''}${timerBadge(st)}${rhHeadChip(st)}<h1 class="lk-term-title">${ev && ev.icon ? ev.icon + ' ' : ''}${ev ? esc(ev.title) : 'Kjörtímabil ' + st.round}</h1>${ev ? '<p class="lk-term-text">' + esc(ev.text) + '</p>' : ''}</div>${pmHeadHtml()}</div>` +
      thokaBanner(st) +   // ÞOKA: borði STRAX undir kjörtímabils-hausnum (á undan badge-röð/arfleifð)
      rhPickerCard(st) +   // RÁÐHERRASKIPTING: ríkisstjórnarfundurinn (sæta-val) undir hausnum, ofan badge-raðar — áberandi meðan sæti vantar
      policyBadgesRow(st) +   // F1-V3: badge-röð STRAX undir kjörtímabils-hausnum, á undan arfleifðar-spjaldi
      teamBanner(st) + roleBanner(st) + introBanner + newToolsBanner + carryoverCard(st) + surpriseCard(st) + sattCard(st) +
      (st.stjornarkreppa ? '<div class="lk-conflict" style="border-left-color:#e78284"><div class="lk-conflict-row"><span class="lk-conflict-ic">🚨</span><span><b>Stjórnarkreppa eftir fall stjórnarinnar.</b> Ríkisstjórnin féll í fjöldamótmælum síðasta kjörtímabil — ný stjórn tekur við löskuðu búi. Stjórnarmyndun og lömun draga úr hagvexti, atvinnuleysi eykst, skuldir hækka og fylgi byrjar mun lægra. Það þarf sterka hagstjórn til að ná vopnum sínum á ný.</span></div></div>' : '') +
      '<div class="lk-studio-main">' +
        // VERK 1: graf-dálkurinn þrískiptur — efsta röðin er 2-dálka rist: forskoðunar-mælarnir
        // (#lk-st-chart: fórnarskipti+Þjóðarhagur+pólitík) VINSTRA megin og FASTI kort-hýsillinn
        // (#lk-st-kort) HÆGRA megin við þá — efst í dálknum svo kortið sjáist ÁN skruns á 1440px
        // („beint undir pólitíska mælinum" reyndist enda undir brotlínu). Hýsillinn er utan
        // forskoðunar-innerHTML svo DOM-ið lifir sleða-drög af og glow-animation klippist ekki.
        // Neðri forskoðunin (#lk-st-chart2: markmið+gröf+hitakort) fyllir svo alla breiddina.
        '<div class="lk-studio-charts">' +
          thokaPastCard(st) +   // ÞOKA: „það sem vitað er um síðasta kjörtímabil" efst í graf-dálknum — á undan ráðgjafa-matinu
          '<div class="lk-st-row">' +
            '<div id="lk-st-chart"></div>' +
            '<div class="lk-card lk-kort-decide" id="lk-st-kort"></div>' +
          '</div>' +
          '<div id="lk-st-chart2"></div>' +
        '</div>' +
        '<div class="lk-studio-controls">' +
          '<div class="lk-card"><h2>🎛️ Stjórnstöð</h2><div class="lk-tabs">' + tabBar + '</div>' + ((TAB_META[tab.group] || {}).desc ? '<p class="lk-muted" style="font-size:12px;line-height:1.5;margin:8px 0 4px">' + esc((TAB_META[tab.group] || {}).desc) + '</p>' : '') + capHtml + rhTabBanner(st, tabOwner, tabMine) + '<div id="lk-st-sliders"' + (tabMine ? '' : ' class="lk-rh-locked"') + '>' + sliders + '</div></div>' +
          mandateCard(st) +
          policiesCard(st) +
          rhLockHtml(st) +   // RÁÐHERRASKIPTING: Læsa-hnappur aðeins f. forsætisráðherra (eða lockFallback); ráðherrar sjá „⏳ forsætisráðherra læsir"
          asyncAskriftHtml(st) +   // ⏳ HÆGUR HAMUR: opt-in póst-áminning (aldrei forvalin)
        '</div>' +
      '</div>' +
      leaderboard(st);
    attachStudio(st);
    drawStudioPreview(st);
  }
  function attachStudio(st) {
    if (S.polRound !== st.round) { S.polRound = st.round; S.policyDraft = { ...((st.policies && st.policies.draft) || {}) }; }  // Fasi E: stefnu-rofa-drög endursett per kjörtímabil
    if (!S.policyDraft) S.policyDraft = {};
    root.querySelectorAll('input[data-pol]').forEach((el) => { el.onchange = () => { if (!rhCanPolicy(st)) return; S.policyDraft[el.dataset.pol] = el.checked; pushDraft(st); }; });   // RÁÐHERRASKIPTING: aðeins forsætisráðherra
    root.querySelectorAll('[data-polc]').forEach((el) => { el.onclick = () => { if (!rhCanPolicy(st)) return; S.policyDraft[el.dataset.polc] = el.dataset.polk; pushDraft(st); renderStudio(st); }; });   // RÁÐHERRASKIPTING: aðeins forsætisráðherra
    root.querySelectorAll('[data-dil]').forEach((el) => { el.onclick = () => { if (!rhCanPolicy(st)) return; S.dilemmaDraft = el.dataset.dil; pushDraft(st); renderStudio(st); }; });  // Fasi „skemmtun 3": klemmu-val (RÁÐHERRASKIPTING: aðeins forsætisráðherra)
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
  // RÁÐHERRASKIPTING: body.handle fylgir; drögin fara um rhDecisions (ráðherra → aðeins eigin sleðar, PM → sjá þar) og svarið
  // (hafnad) er speglað strax í rhAfterPost. Ekkert sæti → ekkert sent (þjónn hafnar hvort eð er — forðast ruglings-toast).
  function pushDraft(st) {
    const you = (S.state && S.state.you) || (st && st.you);
    if (you && you.locked && !S.unlocked) return;
    if (rhOn(st) && !rhMitt(st)) return;
    if (S.pushTimer) clearTimeout(S.pushTimer);
    // Þjónninn merge-ar sleða ráðherra ÁFRAM eftir að forsætisráðherra læsir → endurprófa læsingu þegar tímamælirinn fellur (poll gat
    // fært you.locked inn á biðtímanum) — ALDREI senda drög í læsta röð.
    S.pushTimer = setTimeout(() => { S.pushTimer = null; const y = S.state && S.state.you; if (y && y.locked && !S.unlocked) return; api('/' + S.code + '/decisions', { method: 'POST', body: { round: st.round, decisions: rhDecisions(st), locked: false, handle: rhHandle(S.code) }, token: S.token }).then((r) => rhAfterPost(st, r)).catch(() => {}); }, 500);
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
  // RÁÐHERRASKIPTING: læsing = forsætisráðherrans (eða hver sem er þegar enginn PM er claim-aður, lockFallback) — sama regla og
  // þjónninn; hafnad 'locked' í svari → toast, ekkert „læst" sett staðbundið. body.handle fylgir, drög um rhDecisions.
  function submitStudio(st) {
    if (!rhCanLock(st)) { rhToast('⏳ Forsætisráðherra læsir kjörtímabilið — samræmið ykkur fyrst.'); return; }
    if (!sattLockCheck(st)) return;
    if (S.pushTimer) { clearTimeout(S.pushTimer); S.pushTimer = null; }
    return act(async () => {
      const r = await api('/' + S.code + '/decisions', { method: 'POST', body: { round: st.round, decisions: rhDecisions(st), locked: true, handle: rhHandle(S.code) }, token: S.token });
      const hf = (r && r.json && Array.isArray(r.json.hafnad)) ? r.json.hafnad : [];
      if (hf.includes('locked')) { rhToast('⏳ Forsætisráðherra læsir kjörtímabilið — læsingin var ekki vistuð.'); return; }
      rhAfterPost(st, r, true);
      S.unlocked = false;
    });
  }

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
    // ÞJÓÐARSÁTT: eigin afstaða sýnd í læstu staðfestingunni (blint gagnvart hinum) — engin afstaða = telst 'saekja'.
    let sattLine = '';
    if (sattOnSt(st)) {
      const v = sattValAf(st);
      const vv = v ? SATT_VAL[v] : null;
      sattLine = '<p class="lk-satt-locked">🤝 Þjóðarsáttin: ' + (vv ? '<b>' + vv.icon + ' ' + esc(vv.label) + '</b> <span class="lk-muted">(blint þar til uppgjör)</span>' : '<b>engin afstaða</b> — telst „Sækja fram"') + '</p>';
    }
    // ⏳ HÆGUR HAMUR: enginn leikstjóri bíður — lotan gerist upp sjálfkrafa við lokun, og fram að henni má opna aftur.
    const asyL = asyncOf(st);
    const bidTxt = asyL ? 'Lotan gerist upp sjálfkrafa við lokun. Þú mátt opna aftur og breyta fram að þeim tíma.' : 'Beðið eftir hinum liðunum og að leikstjóri leysi umferðina.';
    root.innerHTML =
      karphusBanner(st) +   // ÞJÓÐARSÁTT: Karphús-hléið efst á öllum liðs-skjám (líka læstum)
      asyncBordi(st, 'team') +   // ⏳ HÆGUR HAMUR: fresta-borði líka á læstu sýninni (læsing er ekki endanleg)
      teamBanner(st) + roleBanner(st) +
      '<div class="lk-card" style="border-color:#54d08a"><h2>✅ Ákvörðunum læst — umferð ' + st.round + '</h2><p>' + esc(bidTxt) + '</p>' + sattLine + summary + (rhCanLock(st) ? '<button class="lk-btn" id="lk-unlock" style="margin-top:12px;background:#5ac8e0">✏️ Breyta ákvörðun</button>' : '<p class="lk-muted lk-rh-fine" style="margin-top:12px">🏛️ Forsætisráðherra læsti — aðeins hann aflæsir (✏️ Breyta ákvörðun).</p>') + '</div>' +   // RÁÐHERRASKIPTING: aflæsing = PM (eða lockFallback)
      asyncAskriftHtml(st) +   // ⏳ HÆGUR HAMUR: opt-in póst-áminning (aldrei forvalin)
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
    // ÞOKA (decide): þjónninn sendir watch kpiHistory ÖLL lið adeinsStig ({round,score,cumulative}) — engin KPI-svið →
    // newsHeadlines á slíka röð gæfi falska „rólegt"-fyrirsögn; síað eins og uppsafnadCard → ticker sýnir aðeins atvik+ákvarðanir.
    for (const t of (st.kpiHistory || [])) {
      if (!t || t.adeinsStig) continue;
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
    const phaseTxt = { lobby: 'Beðið eftir að leikur hefjist…', decide: 'Lið taka ákvarðanir', resolved: 'Umferð leyst — bíð eftir næsta kjörtímabili', ended: '🏁 Leik lokið — árið er ' + svArLok(st) }[st.phase] || st.phase;
    const [y0, y1] = termYears(st.round || 1, svAr0(st)), ev = st.event;
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
    const winner = (st.phase === 'ended' && teams.length) ? '<div class="lk-card" style="text-align:center;border:2px solid #f6b13b;background:linear-gradient(180deg,#2a2312,#181c24)"><div style="font-size:24px;font-weight:800;color:#f6b13b">🏆 ' + esc(teams[0].name) + ' sigraði!</div><p class="lk-muted" style="margin:4px 0 0">Hæsta uppsafnaða skor eftir ' + svLotur(st) + ' kjörtímabil · ' + esc(svHeiti(st)) + '</p></div>' : '';
    // Samhengi kjörtímabils (fyrir áhorfendur/kennslustofu): atburður + hvað þarf að huga að.
    const context = (ev && (st.phase === 'decide' || st.phase === 'resolved')) ? '<div class="lk-card"><h2>' + (ev.icon ? ev.icon + ' ' : '') + esc(ev.title) + '</h2>' + (ev.text ? '<p style="font-size:15.5px;line-height:1.6">' + esc(ev.text) + '</p>' : '') + (ev.watch ? '<p class="lk-watch">⚠ <b>Hvað þarf að huga að:</b> ' + esc(ev.watch) + '</p>' : '') + '</div>' : '';
    root.innerHTML =
      '<div class="lk-watch-head"><span class="lk-term-badge">📺 Áhorf · leikur ' + esc(st.code) + '</span>' + timerBadge(st) + '<h1 class="lk-watch-title">' + (st.phase === 'lobby' ? 'RÁS-Leikurinn — ' + esc(svHeiti(st)) : 'Kjörtímabil ' + st.round + '/' + svLotur(st) + ' · ' + y0 + '–' + y1) + (ev && ev.icon ? '  ' + ev.icon + ' ' + esc(ev.title) : '') + '</h1><p class="lk-muted">' + esc(phaseTxt) + '</p></div>' +
      asyncBordi(st, 'watch') +   // ⏳ HÆGUR HAMUR: fresta-borði á skjávarpanum líka (engin sekúndu-klukka í hægum ham)
      thokaBordiWatch(st) +    // ÞOKA: skjávarpinn sýnir þoku í decide eins og liðin (þjónninn síar tákn-laust /state)
      sattWatchBordi(st) +     // ÞJÓÐARSÁTT: „lið velja" (án vals) + Karphús-niðurtalningin stór
      winner +
      ((st.phase === 'resolved' || st.phase === 'ended') ? sattResultsCard(st) : '') +   // ÞJÓÐARSÁTT: full afhjúpun á skjávarpa
      kortWatch(st, teams) +   // F3-V3: stórt Íslandskort efsta liðs (eða 2 hlið við hlið) — síðasta uppgjör (í þoku: N-2, tof)
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
    if (status !== 200 || !json.code) { errEl.innerHTML = (json.errors ? json.errors.map(esc).join('<br>') : createErrHtml(json.error, status)); return; }
    localStorage.setItem(lsFac(json.code), json.facToken);
    rememberFacCfg(json.code, { mode: S.editStudio ? 'studio' : 'classic', difficulty: 'medium', timerMin: S.editTimerMin > 0 ? Math.round(S.editTimerMin) : 0, surprise: false, roles: !!S.editRoles, custom: true });
    location.href = '/leikur/?g=' + json.code;
  }

  // ── Ræsing ──
  if (S.code && S.token) startPoll();
  else if (S.code && S.role === 'watch') startPoll();
  else Promise.all([loadUser().catch(() => null), fetchLeikurMe()]).then(([u, me]) => { S.user = u; S.me = me; render(); });   // lending: notanda-tegund + leikstjóra-leyfi (/api/leikur/me, verk A) fyrir gátt (UX-hlið, sbr. renderLanding)
}
