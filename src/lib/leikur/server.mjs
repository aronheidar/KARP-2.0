// Worker-jaðar RÁS-Leiksins: HTTP + HMAC-tákn + D1 + kallar hreinu módúlana.
// Bundlast inn í web/worker.js. crypto.subtle + env.SESSION_SECRET (sama og lotu-kaka worker).
import { DECISIONS, MANDATE, SCENARIO, ROUNDS, YEAR_START, THOKA, mandateFor, difficultyOf, scaleMandate } from './game-config.mjs';
import { SVIDSMYND_SJALFGEFIN, gildSvidsmynd, svidsmyndOf, svidsmyndMeta } from './svidsmyndir.mjs';
import { resolveTeam } from './resolve.mjs';
import { scoreRound } from './scoring.mjs';
import { buildAnalytics, teamReview } from './analytics.mjs';
import { validateGameConfig } from './game-validate.mjs';
import { ROLES, mandateForRole, assignRoles, roleById, revealRoles } from './roles.mjs';
import { govtStability, newsHeadlines } from './flavor.mjs';
import { POLICIES, policyAvailable, policyStatesMeta, policyStage, applyPolicies, policyDeltas, policyApproval, POLICY_POP, describePolicies } from './policies.mjs';
import { awardMedals } from './medals.mjs';
import { rollSurprise, applySurprise, dilemmaChoiceLabel } from './surprise.mjs';
import { carryover } from './aftermath.mjs';
import { politikFerill } from './politik.mjs';
import { sattLota, sattUtkoma, applySatt } from './satt.mjs';
import { PM, mergeDecisions, claimRaduneyti, releaseRaduneyti, raduneytiStaða, raduneytiOf, validHandle, radherrarOn, tilGeymslu, normMap } from './radherrar.mjs';
import BASELINE from '../../../gogn/roads/baseline.json' with { type: 'json' };
import LINKS from '../../../gogn/roads/links.json' with { type: 'json' };

const _te = new TextEncoder();
const _b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const _fromB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const sjson = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'https://karp.is' } });

async function _hmac(env, msg) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET missing');
  const k = await crypto.subtle.importKey('raw', _te.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return _b64u(await crypto.subtle.sign('HMAC', k, _te.encode(msg)));
}
export async function signToken(env, obj) { const p = _b64u(_te.encode(JSON.stringify(obj))); return p + '.' + await _hmac(env, p); }
export async function verifyToken(env, token) {
  try { const [p, sig] = String(token).split('.'); if (!p || !sig || (await _hmac(env, p)) !== sig) return null; return JSON.parse(new TextDecoder().decode(_fromB64u(p))); } catch (e) { return null; }
}
function bearer(request) { const h = request.headers.get('authorization') || ''; const m = h.match(/^Bearer\s+(.+)$/i); return m ? m[1] : ''; }
function gameCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(5))].map((x) => a[x % a.length]).join(''); }

export async function ensureTables(env) {
  const S = [
    "CREATE TABLE IF NOT EXISTS leikur_games (code TEXT PRIMARY KEY, config TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'lobby', current_round INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS leikur_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, game_code TEXT NOT NULL, name TEXT NOT NULL, joined INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS leikur_decisions (game_code TEXT NOT NULL, round INTEGER NOT NULL, team_id INTEGER NOT NULL, decisions TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0, submitted_at INTEGER NOT NULL, PRIMARY KEY (game_code, round, team_id))",
    "CREATE TABLE IF NOT EXISTS leikur_results (game_code TEXT NOT NULL, round INTEGER NOT NULL, team_id INTEGER NOT NULL, kpis TEXT NOT NULL, round_score REAL NOT NULL, cumulative REAL NOT NULL, PRIMARY KEY (game_code, round, team_id))",
    "CREATE INDEX IF NOT EXISTS idx_leikur_teams_game ON leikur_teams (game_code)",
  ];
  for (const s of S) await env.TENGSL.prepare(s).run().catch(() => null);
}

const now = () => Math.floor(Date.now() / 1000);
// SVIÐSMYND (svidsmyndir.mjs): config.svidsmynd → skráar-færsla; vantar/rusl → 'island2000' (sjálfgefna).
// Sérsniðnir leikir (config.scenario úr leikja-ritlinum) TRUMPA sviðsmyndinni á atburðunum — sviðsmyndin
// skilar þá enn ártölum/heiti; fyrir 'island2000' er sv.scenario NÁKVÆMLEGA SCENARIO svo hegðun er óbreytt.
function gameCfg(game) { let c = {}; try { c = JSON.parse(game.config || '{}'); } catch (e) {} const customMandate = (c.mandate && Array.isArray(c.mandate.kpis)); const sv = svidsmyndOf(c.svidsmynd); return { svidsmynd: sv, scenario: (c.scenario && Array.isArray(c.scenario.events)) ? c.scenario : sv.scenario, mandate: customMandate ? c.mandate : MANDATE, perRound: !customMandate, rounds: c.rounds || sv.rounds || ROUNDS, roles: !!c.roles, roleMap: c.roleMap || null, mode: c.mode === 'studio' ? 'studio' : 'classic', timerSec: (c.timerSec > 0 ? c.timerSec : null), deadline: (c.deadline || null), difficulty: c.difficulty || 'medium', surprise: !!c.surprise, thoka: c.thoka === true, satt: c.satt === true, sattLotur: Array.isArray(c.sattLotur) ? c.sattLotur : null, karphus: (c.karphus && typeof c.karphus === 'object') ? c.karphus : null, bots: Array.isArray(c.bots) ? c.bots.map(Number).filter((n) => n > 0) : [], radherrar: (c.mode === 'studio' && radherrarOn(c)) }; }
// Æfingalið (bot, sjá POST /<code>/bot-team): tekur ALDREI ákvarðanir sjálft — við start/next/resolve fær hvert bot-lið
// sem á enga LÆSTA röð í umferðinni sjálfkrafa óbreytt drög ({} = sleðar óbreyttir, engin stefnu-breyting) + locked=1,
// svo roster leikstjóra sýni ✅ og uppgjörið keyri án þess að nokkur þurfi að sitja við liðið. Fyrirliggjandi ólæst drög haldast.
async function lockBots(env, code, round, botIds) {
  for (const tid of botIds || []) {
    const row = await env.TENGSL.prepare('SELECT decisions, locked FROM leikur_decisions WHERE game_code=? AND round=? AND team_id=?').bind(code, round, tid).first().catch(() => null);
    if (row && row.locked) continue;
    await env.TENGSL.prepare('INSERT OR REPLACE INTO leikur_decisions (game_code, round, team_id, decisions, locked, submitted_at) VALUES (?,?,?,?,?,?)')
      .bind(code, round, tid, (row && row.decisions) || '{}', 1, now()).run().catch(() => null);
  }
}
// ── RÁÐHERRASKIPTING INNAN LIÐS (config.radherrar, AÐEINS studio; reglan sjálf er HREIN í radherrar.mjs) ───────────────
// Sæta-map liðs { raduneyti: handle } býr í decisions-JSON lotunnar undir lyklinum 'radherrar' (ekkert schema). handle =
// nafnlaust dulnefni liðsmanns úr vafra (4–8 [a-z0-9], ekkert PII). Map-ið LIFIR LEIKINN: carryRadherrar afritar það úr lotu
// N í drög lotu N+1 við start (lobby = lota 0, sæti má velja fyrir start) og next — ný röð {radherrar:map} ef engin, annars
// bætt í fyrirliggjandi drög sem eiga ekkert map (idempotent). Æfingalið (bots) eru sleppt: þau velja aldrei sæti (lockBots).
const SEL_DEC = 'SELECT decisions, locked FROM leikur_decisions WHERE game_code=? AND round=? AND team_id=?';
const INS_DEC = 'INSERT OR REPLACE INTO leikur_decisions (game_code, round, team_id, decisions, locked, submitted_at) VALUES (?,?,?,?,?,?)';
const parseDec = (row) => { try { const d = JSON.parse((row && row.decisions) || '{}'); return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; } catch (e) { return {}; } };
const readDec = (env, code, round, teamId) => env.TENGSL.prepare(SEL_DEC).bind(code, round, teamId).first().catch(() => null);
const writeDec = (env, code, round, teamId, decisions, locked) => env.TENGSL.prepare(INS_DEC).bind(code, round, teamId, JSON.stringify(decisions), locked ? 1 : 0, now()).run().catch(() => null);
const radherrarMapOf = (row) => normMap(parseDec(row).radherrar);   // normalíserað sæta-map raðar ({} ef engin röð / ekkert map)
// ── HANDLE = BERA-SKILRÍKI SÆTISINS: fer ALDREI á vírinn ───────────────────────────────────────────────────────────────
// Þjónninn leiðir sætið af geymda map-inu + b.handle, svo sá sem HEFUR handle-ið ER ráðherrann gagnvart þjóninum — handle-ið
// er í reynd lykilorð sætisins. Sendi /state (eða /saeti) handles félaga með gæti hver liðsmaður sem er lesið PM-handle-ið úr
// JSON-inu í devtools og hermt eftir forsætisráðherra (læst/aflæst, stefnurofar, klemma, sátt, ALLIR sleðar) eða sparkað
// félaga úr sæti með POST /saeti {handle:<þeirra>, key:null} — nákvæmlega það sem skiptingin á að hindra. Enginn notandi
// þarf handle félaga: picker-inn sýnir aðeins tekið/laust/þú (client birtir þau hvergi) og fac-roster aðeins ✓/·.
// Sama gildir um fac: leikstjóra-skjárinn er oft í skjávarpa fyrir framan bekkinn — handle á vegg = frjáls PM-aðgangur.
// LIÐ: stada án handle-lykils. FAC: {raduneyti: true} (sama lögun og rhRosterSeats les: !!rh[key]) — hver á sætið er
// nafnlaust hvort eð er, svo ekkert upplýsingatap. Sætis-EIGN er alltaf staðfest ÞJÓNS-megin, aldrei af því sem sést.
const staðaAnHandles = (map) => raduneytiStaða(map).map(({ handle, ...r }) => r);
const mapAnHandles = (map) => Object.fromEntries(Object.keys(map).map((k) => [k, true]));
// ── KAPPHLAUPS-VÖRN (read-modify-write) ────────────────────────────────────────────────────────────────────────────────
// Merge-leiðin les röðina, reiknar og skrifar hana ALLA aftur. Sjö liðsmenn á sjö símum deila EINNI D1-röð og hver
// sleða-hreyfing sendir POST (client debounce-ar 500ms) — tvö POST í sömu D1-lotu er því EÐLILEGT ástand, ekki jaðartilvik.
// Væri skrifað blint (INSERT OR REPLACE) þurrkaði síðari skrifin breytingu þess fyrri út, ÞÓTT sleðarnir tilheyri sitt hvoru
// ráðuneytinu: B byggir á prev sem hann las ÁÐUR en A skrifaði. Verst er að tapið er ÞÖGULT — client heldur sínu gildi á
// skjánum og uppgjörið keyrir á öðru. submitted_at dugar EKKI sem CAS-tákn (sekúndu-upplausn: tvö skrif í sömu sekúndu fá
// sama gildi) → CAS á NÁKVÆMLEGA þá bæti sem við lásum: decisions-textann + locked.
//   engin röð lesin → INSERT OR IGNORE (frum-lykillinn (game_code,round,team_id) hafnar kapphlaupinu; changes=0 = einhver varð á undan)
//   röð lesin       → UPDATE ... WHERE decisions=? AND locked=?  (changes=0 = einhver skrifaði á milli)
// changes=0 → köllarinn LES UPP Á NÝTT og merge-ar aftur (casRitun hér að neðan). Merge-ið er hreint og idempotent svo
// endurtekning er hættulaus. Eftir RETRIES árangurslausar tilraunir er skrifað blint = nákvæmlega gamla hegðunin (aldrei verri).
const UPD_CAS = 'UPDATE leikur_decisions SET decisions=?, locked=?, submitted_at=? WHERE game_code=? AND round=? AND team_id=? AND decisions=? AND locked=?';
const INS_CAS = 'INSERT OR IGNORE INTO leikur_decisions (game_code, round, team_id, decisions, locked, submitted_at) VALUES (?,?,?,?,?,?)';
const breyttar = (r) => !!(r && r.meta && r.meta.changes > 0);
async function casDec(env, code, round, teamId, decisions, locked, was) {
  const json = JSON.stringify(decisions), lk = locked ? 1 : 0;
  const r = was
    ? await env.TENGSL.prepare(UPD_CAS).bind(json, lk, now(), code, round, teamId, was.decisions, was.locked).run().catch(() => null)
    : await env.TENGSL.prepare(INS_CAS).bind(code, round, teamId, json, lk, now()).run().catch(() => null);
  return breyttar(r);
}
// Les → reiknar (bygg) → CAS-skrifar; endurtekur á fersku prev-i ef einhver skrifaði á milli. bygg(row) skilar
// { decisions, locked, svar } (eða null = ekkert að skrifa, svarið er samt sent). Skilar svari síðustu tilraunar.
const RETRIES = 4;
async function casRitun(env, code, round, teamId, bygg) {
  let ut = null;
  for (let i = 0; i <= RETRIES; i++) {
    const row = await readDec(env, code, round, teamId);
    ut = await bygg(row, i);
    if (!ut || !ut.skrifa) return ut ? ut.svar : null;
    if (await casDec(env, code, round, teamId, ut.decisions, ut.locked, row)) return ut.svar;
    if (i === RETRIES) await writeDec(env, code, round, teamId, ut.decisions, ut.locked);   // uppgjöf: blind skrif (gamla hegðunin)
  }
  return ut ? ut.svar : null;
}
async function nonBotTeamIds(env, code, cfg) {
  const rows = ((await env.TENGSL.prepare('SELECT id FROM leikur_teams WHERE game_code=? ORDER BY id').bind(code).all().catch(() => ({ results: [] }))).results) || [];
  const bots = new Set(cfg.bots || []);
  return rows.map((t) => t.id).filter((id) => !bots.has(id));
}
// Carry-forward þarf EKKI CAS (ólíkt /decisions og /saeti): hún keyrir aðeins í fac-aðgerðunum start/next og skrifar í lotu
// N+1 sem ENGINN liðs-POST nær í — /decisions krefst phase='decide' og /saeti skrifar í game.current_round (= N; fasa-UPDATE-ið
// kemur á eftir). Eina samhliða-tilvikið er /saeti-claim sem lendir örfáum ms á eftir lestrinum hér: sætið berst þá ekki áfram
// og leikmaðurinn velur það aftur í nýju lotunni (sjálf-leiðréttandi, engin gagnaskemmd).
async function carryRadherrar(env, code, fromRound, toRound, teamIds) {
  for (const tid of teamIds || []) {
    const map = radherrarMapOf(await readDec(env, code, fromRound, tid));
    if (!Object.keys(map).length) continue;                         // ekkert sæti valið → ekkert að bera áfram
    const cur = await readDec(env, code, toRound, tid), d = parseDec(cur);
    if (Object.keys(normMap(d.radherrar)).length) continue;         // nýja lotan á þegar map (idempotent)
    await writeDec(env, code, toRound, tid, { ...d, radherrar: map }, cur && cur.locked);
  }
}
// Fasi A: markmið per kjörtímabil f. sjálfgefna leiki; sérsniðnir leikir halda föstu mandate úr config.
function mandateAt(cfg, round) { return cfg.perRound ? mandateFor(round) : cfg.mandate; }
const LEVER_LABELS = Object.fromEntries(Object.entries(BASELINE.levers).map(([k, v]) => [k, v.label]));
const LEVER_BASE = Object.fromEntries(Object.entries(BASELINE.levers).map(([k, v]) => [k, v.base]));

// ── GAGNATÖF — „hagstjórn í þoku" (config.thoka) ─────────────────────────────────────────────────────────────────
// Leikstilling (EKKI erfiðleikastig): LIÐ í decide-fasa lotu N sér harðar KPI-tölur með EINS KJÖRTÍMABILS TÖF — nýjasta
// „birta" lotan er N-2 („Hagstofan birtir með töf") — og enga framtíðarspá. Um lotu N-1 fær liðið AÐEINS: fyrirsagnir
// (newsHeadlines), fylgi/stjórnarstöðugleika, stig lotunnar (stigataflan helst — keppnin þarf hana) og ÁTT per KPI.
// ÖRYGGISREGLA: síunin er ÞJÓNS-MEGIN (hér, á /state-svarinu) — client fær ALDREI N-1 tölurnar til að „fela" þær
// (annars lækju þær í devtools). Allt sem client þarf til að teikna þoku-sýn er sent ÚTREIKNAÐ (áttir, merki, fyrirsagnir).
// AFMÖRKUN (meðvituð): lifandi FORSKOÐUN í decide (simulate úr sleðum) keyrir í vafranum úr BASELINE/LINKS sem eru
// client-megin hvort eð er — snjall notandi getur reiknað spágildin í console. Það er ÁSÆTTANLEGT: það er æfing fyrir
// hann, ekki leki á leyndum gögnum (engin uppgjörs-tala liggur þar). Client birtir forskoðunina sem „ráðgjafar-mat"
// (átt+styrkur) án talna. Leikstjóri (fac-tákn) sér ALLT alltaf; results-/ended-fasi ALLRA (lið+watch) er ÓSÍAÐUR — hörðu
// tölurnar koma í ljós VIÐ UPPGJÖR (afhjúpunin/kennslustundin). Stigagjöf + engine ÓSNERT: þetta er síun á sendingu.
// WATCH (tákn-laust /state, skjávarpa-sýn) er í decide-fasa þoku-leiks SÍAÐ EINS OG LIÐ (teamId:null → ÖLL lið adeinsStig
// í kpiHistory, kort N-2 allra, surprise.effect falið, thoka-blokk AÐEINS {on, birtLota, birtAr} — engar áttir/fyrirsagnir/
// stig per lið). Ástæða: lið sem þekkir leikkóðann gat opnað watch-sýnina í öðrum flipa og séð N-1 tölurnar (rýni-gat,
// LOKAÐ) — nú sér hópurinn á skjávarpanum NÁKVÆMLEGA það sama og liðin meðan ákveðið er, tölurnar birtast við uppgjör.
// ANDSTÆÐINGS-RÝNI (leka-leit, sjá server.test.mjs „ANDSTÆÐINGS-RÝNI"): ÖLL óheil talnagildi úr FULLU uppgjöri N-1
// (kpis/perKpi/policyDeltas/crisis, beggja liða) leituð í JSON liðs- OG watch-state decide lotu 2/3/4 (studio/classic/roles)
// → 0 fundin; þoku-laus tvíburi: fac-state í öllum fösum + results-state liðs/watch IDENTICAL (utan code/thokaOn).
// ÞEKKT AFMÖRKUN (hönnunar-ákvörðun, EKKI lagað):
//  · Results-fasi lotu N-1 SÝNDI liðinu N-1 tölurnar (afhjúpunin) — þokan í decide N felur það sem liðið sá lotu fyrr
//    (skjáskot/minni); hún kemur í veg fyrir að tölurnar séu Á SKJÁNUM meðan ákveðið er, ekki að liðið hafi séð þær.
// Vísitölu-KPI (unit '' í baseline.outcomes) fá þröskuld THOKA.stodugtVisitala (1), aðrar (%, % VLF, pp) THOKA.stodugtProsent (0,15).
const THOKA_VISITOLUR = new Set(Object.entries(BASELINE.outcomes).filter(([, v]) => !v.unit).map(([k]) => k));

/** ÁTT per KPI milli lotu N-2 (prevPrevKpis) og N-1 (prevKpis) + staða gagnvart markmiði lotu N-1 — án talna.
 *  Skilar { kpi: { att: 'upp'|'nidur'|'stodugt'|null, vs_markmid: 'yfir'|'undir'|'innan'|null } } fyrir hvern tölu-KPI í
 *  prevKpis; att=null ef N-2 vantar fyrir þann KPI, vs_markmid=null ef KPI er ekki í goalSpecs. „stöðugt" = |Δ| < 0,15
 *  fyrir %-stærðir, < 1 fyrir vísitölur (opts.visitolur = Set af vísitölu-lyklum; sjálfgefið úr baseline.outcomes.unit).
 *  goalSpecs = mandate.kpis-fylki (eða {key: spec}-kort): target/band, max/band eða min/band — „innan" = innan bands. */
export function thokaAttir(prevKpis, prevPrevKpis, goalSpecs, opts = {}) {
  if (!prevKpis || typeof prevKpis !== 'object') return null;
  const specs = Array.isArray(goalSpecs) ? goalSpecs : Object.values(goalSpecs || {});
  const specOf = {}; for (const sp of specs) if (sp && sp.key) specOf[sp.key] = sp;
  const visit = opts.visitolur instanceof Set ? opts.visitolur : THOKA_VISITOLUR;
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);
  const out = {};
  for (const k of Object.keys(prevKpis)) {
    const v = prevKpis[k]; if (!fin(v)) continue;
    const pv = (prevPrevKpis && fin(prevPrevKpis[k])) ? prevPrevKpis[k] : null;
    let att = null;
    if (pv != null) { const d = v - pv, thr = visit.has(k) ? THOKA.stodugtVisitala : THOKA.stodugtProsent; att = Math.abs(d) < thr ? 'stodugt' : (d > 0 ? 'upp' : 'nidur'); }
    let vs = null; const sp = specOf[k];
    if (sp) { const band = sp.band || 0;
      if (sp.dir === 'target' && fin(sp.target)) vs = Math.abs(v - sp.target) <= band ? 'innan' : (v > sp.target ? 'yfir' : 'undir');
      else if (sp.dir === 'max' && fin(sp.max)) vs = v <= sp.max + band ? 'innan' : 'yfir';
      else if (sp.dir === 'min' && fin(sp.min)) vs = v >= sp.min - band ? 'innan' : 'undir'; }
    out[k] = { att, vs_markmid: vs };
  }
  return out;
}

/** Síar /state-svar LIÐS (eða WATCH, teamId:null) í decide-fasa lotu N skv. þoku-hönnun; skilar SÍUÐU AFRITI (out ósnert).
 *  ctx = { teamId (null = watch/tákn-laust), round: N, rows: [{round, teamId, d: <uppgjörs-detail>, roundScore, cumulative}]
 *         (ÖLL lið, úr leikur_results), goalSpecs: mandate.kpis lotu N-1 (f. vs_markmid), arLotu?: (lota) => upphafsár kjörtímabils }.
 *  Síað (N-1 harðar tölur fara ALDREI út):
 *   · kpiHistory: eigið lið klippt við N-2 (tof:true, birtLota); önnur lið AÐEINS {round, score, cumulative} (engin KPI)
 *   · kort: ÖLL lið → uppgjör N-2 (tof:true); lið án N-2 sleppt (kortið er „opinbert" — í þoku er það birta kortið)
 *   · policyBadges[].deltas → deltas N-2 (eða null) + tof:true/deltaLota · carryover.policies[].deltas → null + carryover.thoka
 *   · surprise.effect + dilemma.options[].effect → null + surprise.thoka (atvikið sést, áhrifin ekki)
 *   · finalPerKpi → perKpi N-2 (eða []) · medals → reiknuð á lotum ≤ N-2 (leikslok-svið sem server reiknar í öllum fösum)
 *   · sattUtkoma (Þjóðarsáttin) → aðeins sáttar-lotur ≤ N-2 (afhjúpun N-1 — hver valdi hvað/flokkur/áhrif — bíður uppgjörs)
 *   · out.thoka = { on, birtLota, birtAr, attir, fyrirsagnir, stodugleiki, stig } (lota 1–2: birtLota/attir null → „Engar hagtölur birtar enn")
 *  WATCH (teamId null): „eigið lið" er ekkert → ÖLL lið adeinsStig, kort N-2 allra, thoka-blokk = {on, birtLota, birtAr} + attir/
 *  fyrirsagnir/stodugleiki/stig null (engin per-liðs þoku-gögn á skjávarpa — client sýnir aðeins borðann). Sama sía, ekkert sér-tilvik.
 *  ÓSNERT: teams/trajectory (stig), decisionMarks/eventChoices/policies/history/draft (ákvarðanir), stjornarkreppa/avgApproval (fylgi). */
export function thokaSia(out, ctx = {}) {
  const N = +ctx.round || 0, teamId = ctx.teamId ?? null, rows = Array.isArray(ctx.rows) ? ctx.rows : [];
  const birt = N - 2 >= 1 ? N - 2 : null;                                    // nýjasta „birta" lotan (Hagstofu-töf)
  const rowOf = (tid, r) => (tid == null) ? null : (rows.find((x) => x.teamId === tid && x.round === r) || null);
  const my1 = rowOf(teamId, N - 1), my2 = birt ? rowOf(teamId, birt) : null; // watch (teamId null) → engin „eigin" röð
  const d1 = my1 ? (my1.d || {}) : null, d2 = my2 ? (my2.d || {}) : null;
  const o = { ...out };                                                     // grunnt afrit; síuð svið endursmíðuð, aldrei in-place
  if (Array.isArray(out.kpiHistory)) o.kpiHistory = out.kpiHistory.map((t) => (teamId != null && t.teamId === teamId)
    ? { teamId: t.teamId, name: t.name, tof: true, birtLota: birt, rounds: (t.rounds || []).filter((r) => birt != null && r.round <= birt) }
    : { teamId: t.teamId, name: t.name, adeinsStig: true, rounds: rows.filter((x) => x.teamId === t.teamId).sort((a, b) => a.round - b.round).map((x) => ({ round: x.round, score: x.roundScore, cumulative: x.cumulative })) });
  if (Array.isArray(out.kort)) o.kort = out.kort.map((k) => {
    const r = birt ? rowOf(k.teamId, birt) : null; if (!r) return null;
    const kk = (r.d || {}).kpis || {};
    return { teamId: k.teamId, round: birt, tof: true, kpis: { byggdajofnudur: kk.byggdajofnudur ?? null, fiskistofn: kk.fiskistofn ?? null, losun: kk.losun ?? null }, policies: (r.d || {}).policies || {} };
  }).filter(Boolean);
  if (Array.isArray(out.policyBadges)) { const dl = (d2 && d2.policyDeltas) || null; o.policyBadges = out.policyBadges.map((b) => { const dd = (dl && dl[b.id]) || null; return { ...b, tof: true, deltas: dd, deltaLota: dd ? birt : null }; }); }
  if (out.carryover) o.carryover = { ...out.carryover, thoka: true, policies: (out.carryover.policies || []).map((p) => ({ ...p, deltas: null })) };
  if (out.surprise) o.surprise = { ...out.surprise, thoka: true, effect: null, dilemma: out.surprise.dilemma ? { ...out.surprise.dilemma, options: (out.surprise.dilemma.options || []).map((op) => ({ ...op, effect: null })) } : null };
  if (out.finalPerKpi !== undefined) o.finalPerKpi = (d2 && Array.isArray(d2.perKpi)) ? d2.perKpi : [];
  if (Array.isArray(out.sattUtkoma)) o.sattUtkoma = out.sattUtkoma.filter((su) => birt != null && su.lota <= birt); // Þjóðarsáttin: afhjúpun lotu N-1 FALIN (val+flokkur+áhrif) eins og annað — sést við uppgjör
  if (out.medals !== undefined) o.medals = awardMedals(rows.filter((x) => x.teamId === teamId && birt != null && x.round <= birt).map((x) => ({ round: x.round, kpis: (x.d || {}).kpis || {}, roundScore: x.roundScore, stability: (x.d || {}).stability, policies: (x.d || {}).policies, crisis: (x.d || {}).crisis })));
  const k1 = (d1 && d1.kpis) || null, k2 = (d2 && d2.kpis) || null, st1 = (d1 && d1.stability) || null;
  const ar = typeof ctx.arLotu === 'function' ? ctx.arLotu : ((r) => YEAR_START + (r - 1) * 4);
  o.thoka = { on: true, birtLota: birt, birtAr: birt ? ar(birt) : null,
    attir: (k1 && k2) ? thokaAttir(k1, k2, ctx.goalSpecs) : null,
    fyrirsagnir: k1 ? newsHeadlines(k1) : null,
    stodugleiki: st1 ? { approval: (typeof st1.approval === 'number') ? st1.approval : null, level: st1.level || null, fell: st1.level === 'revolt' } : null,
    stig: my1 ? { lota: N - 1, roundScore: my1.roundScore, cumulative: my1.cumulative } : null };
  return o;
}

export async function leikurHandler(request, env, ctx, gameUser = { uid: 0, isAdmin: false, nemandi: false, leikstjori: false }) {
  if (!env.TENGSL) return sjson({ error: 'no-d1' }, 503);
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/leikur\/?/, '').split('/').filter(Boolean); // [] | ['create'] | ['<code>','join'|'state'|'decisions'|'control']
  const method = request.method;

  // GET /me — leikstjóra-staða innskráðs notanda f. onboarding-vísi + sölusíðu (client). uid=0 → leikstjori:false.
  // gameUser.leikstjori/leikstjoriSource/leikstjoriUntil eru leidd í worker-dispatch (leikstjoriOf í auth.mjs):
  // source 'admin' (is_admin) | 'free' (free_access) | 'service' (virk 'leikur'-áskrift á account-eiganda, until=epoch-sek).
  if (parts[0] === 'me' && method === 'GET') {
    if (!(gameUser.uid > 0)) return sjson({ leikstjori: false, isAdmin: false, nemandi: false, until: null, source: null, loggedIn: false });
    const lk = !!gameUser.leikstjori;
    return sjson({ leikstjori: lk, isAdmin: !!gameUser.isAdmin, nemandi: !!gameUser.nemandi,
      until: (lk && gameUser.leikstjoriUntil > 0) ? new Date(gameUser.leikstjoriUntil * 1000).toISOString() : null,
      source: lk ? (gameUser.leikstjoriSource || null) : null, loggedIn: true });
  }

  // POST /create — aðeins leikstjóri (kerfisstjóri/frí-aðgangur EÐA virk 'leikur'-þjónustu-áskrift; sjá leikstjoriOf) má stofna leik.
  if (parts[0] === 'create' && method === 'POST') {
    if (!gameUser.leikstjori) return sjson({ error: 'leikstjori' }, 403);
    await ensureTables(env);
    const cb = await request.json().catch(() => ({}));
    let config = { rounds: ROUNDS, scenarioId: SCENARIO.id };
    if (cb && cb.scenario && cb.mandate) {
      const v = validateGameConfig({ scenario: cb.scenario, mandate: cb.mandate, rounds: cb.rounds }, BASELINE);
      if (!v.ok) return sjson({ error: 'invalid', errors: v.errors }, 400);
      config = { custom: true, rounds: +cb.rounds, scenario: cb.scenario, mandate: cb.mandate };
    } else if (cb && cb.svidsmynd != null && cb.svidsmynd !== SVIDSMYND_SJALFGEFIN) {
      // SVIÐSMYNDA-VAL (svidsmyndir.mjs): aðeins auðkenni sem er TIL í skránni er tekið gilt — annað er
      // hafnað í stað þess að falla þegjandi á sjálfgefnu (leikstjóri á að sjá að valið misfórst).
      // Sjálfgefna sviðsmyndin er EKKI skrifuð í config → eldri leikir og nýir 'island2000'-leikir eru eins.
      if (!gildSvidsmynd(cb.svidsmynd)) return sjson({ error: 'svidsmynd' }, 400);
      const sv = svidsmyndOf(cb.svidsmynd);
      config.svidsmynd = sv.id; config.scenarioId = sv.id; config.rounds = sv.rounds || ROUNDS;
    }
    if (cb && cb.roles) config.roles = true;
    if (cb && cb.mode === 'studio') config.mode = 'studio';
    if (cb && +cb.timerSec > 0) config.timerSec = Math.max(30, Math.min(3600, Math.round(+cb.timerSec))); // #3 valfrjáls umferðar-klukka (sek)
    if (cb && ['easy', 'hard'].includes(cb.difficulty)) config.difficulty = cb.difficulty; // Fasi E: erfiðleikastig (medium=sjálfgefið)
    if (cb && cb.surprise) config.surprise = true; // Fasi „skemmtun 3": óvænt atvik + klemmu-spjöld (valfrjálst)
    if (cb && (cb.thoka === true || cb.thoka === 'true' || cb.thoka === 1)) config.thoka = true; // Gagnatöf „hagstjórn í þoku" (valfrjáls leikstilling; sjá thokaSia) — aðeins skýrt JÁ kveikir, allt annað = false
    // ÞJÓÐARSÁTTIN (valfrjáls leikstilling, sjá satt.mjs + SÁTTAR-blokkina í /state): config.satt=true + valfrjálst lotusett
    // config.sattLotur (fylki eða strengur „3,6" → normalíserað í fylki jákvæðra heiltalna ≤ rounds; tómt/rusl → sjálfgefið KT3+KT6).
    if (cb && (cb.satt === true || cb.satt === 'true' || cb.satt === 1)) {
      config.satt = true;
      const rawL = cb.sattLotur; const arrL = Array.isArray(rawL) ? rawL : (typeof rawL === 'string' ? rawL.split(/[\s,;]+/) : []);
      const lot = [...new Set(arrL.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0 && x <= config.rounds))].sort((a, b) => a - b);
      if (lot.length) config.sattLotur = lot;
    }
    // RÁÐHERRASKIPTING INNAN LIÐS (radherrar.mjs): config.radherrar=true — AÐEINS í studio-ham (classic HUNSAR: þar eru engir
    // sleðar að skipta milli ráðherra, ákvarðanir eru 5 valmyndir); aðeins skýrt JÁ (true/'true'/1) kveikir, eins og thoka/satt.
    // gameCfg les rofann líka aðeins í studio svo eldri/handvirk config með radherrar í classic hafi engin áhrif.
    if (cb && config.mode === 'studio' && (cb.radherrar === true || cb.radherrar === 'true' || cb.radherrar === 1)) config.radherrar = true;
    let code = gameCode();
    // tryggja einstæðni (5 tilraunir)
    for (let i = 0; i < 5; i++) { const ex = await env.TENGSL.prepare('SELECT code FROM leikur_games WHERE code=?').bind(code).first().catch(() => null); if (!ex) break; code = gameCode(); }
    await env.TENGSL.prepare('INSERT INTO leikur_games (code, config, phase, current_round, created) VALUES (?,?,?,?,?)').bind(code, JSON.stringify(config), 'lobby', 0, now()).run().catch(() => null);
    return sjson({ code, facToken: await signToken(env, { code, role: 'fac' }) });
  }

  const code = (parts[0] || '').toUpperCase();
  const action = parts[1];
  const game = await env.TENGSL.prepare('SELECT code, config, phase, current_round FROM leikur_games WHERE code=?').bind(code).first().catch(() => null);
  if (!game) return sjson({ error: 'not-found' }, 404);
  const cfg = gameCfg(game);

  // POST /<code>/join (aðeins í lobby) — nemandi, kerfisstjóri eða leikstjóri (má prófa eigin leik), innskráð/ur.
  if (action === 'join' && method === 'POST') {
    if (!(gameUser.isAdmin || gameUser.nemandi || gameUser.leikstjori)) return sjson({ error: 'nemandi' }, 403);
    if (game.phase !== 'lobby') return sjson({ error: 'started' }, 409);
    const b = await request.json().catch(() => ({}));
    // PERSÓNUVERND: liðsheitið er FRJÁLS TEXTI þátttakenda (≤40 stafir) og EINA sviðið í leikur_*-töflunum sem
    // getur borið persónuupplýsingar (t.d. „Jón og Gunna"). Engin nafna-sía af ásettu ráði — hún væri brothætt og
    // falskt öryggi. Mótvægið er varðveislutakmörkun (leikurPruneOld, vikul. cron) + eyðing á beiðni (leikurEraseGame,
    // POST /<code>/erase) + leiðbeining til leikstjóra um hlutlaus liðsheiti. uid/netfang er ALDREI skrifað hér.
    const name = String(b.name || '').trim().slice(0, 40) || 'Lið';
    const res = await env.TENGSL.prepare('INSERT INTO leikur_teams (game_code, name, joined) VALUES (?,?,?)').bind(code, name, now()).run().catch(() => null);
    const teamId = res && res.meta ? res.meta.last_row_id : null;
    if (!teamId) return sjson({ error: 'join-failed' }, 500);
    return sjson({ teamId, teamToken: await signToken(env, { code, role: 'team', teamId }) });
  }

  // POST /<code>/bot-team (fac-tákn, aðeins í lobby) — æfingalið leikstjóra: stofnar EITT lið merkt bot (id geymt í config.bots),
  // svo leikstjóri geti prófað hringrásina ein/n. Þjónninn læsir hlutlausum ákvörðunum sjálfkrafa (lockBots). Idempotent: til → sama teamId.
  // Skilar ENGU liðs-tákni (bot-ið á enga lotu; uppgjörið gefur því óbreytt Ísland).
  if (action === 'bot-team' && method === 'POST') {
    const you = await verifyToken(env, bearer(request));
    if (!you || you.role !== 'fac' || you.code !== code) return sjson({ error: 'auth' }, 401);
    if (game.phase !== 'lobby') return sjson({ error: 'started' }, 409);
    let cobj = {}; try { cobj = JSON.parse(game.config || '{}'); } catch (e) {}
    const existing = (cfg.bots || [])[0];
    if (existing) return sjson({ teamId: existing, bot: true, existing: true });
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || '').trim().slice(0, 40) || 'Æfingalið (sjálfvirkt)';
    const res = await env.TENGSL.prepare('INSERT INTO leikur_teams (game_code, name, joined) VALUES (?,?,?)').bind(code, name, now()).run().catch(() => null);
    const teamId = res && res.meta ? res.meta.last_row_id : null;
    if (!teamId) return sjson({ error: 'join-failed' }, 500);
    cobj.bots = [teamId];
    await env.TENGSL.prepare('UPDATE leikur_games SET config=? WHERE code=?').bind(JSON.stringify(cobj), code).run().catch(() => null);
    return sjson({ teamId, bot: true });
  }

  // POST /<code>/erase (fac-tákn) — „eyða leik núna": leikstjóri (eða DSR-afgreiðsla f.h. þátttakanda) eyðir EINUM leik
  // + öllu tengdu (lið/ákvarðanir/uppgjör) strax, án þess að bíða vikulegu grisjunarinnar. Aðeins lobby eða ended;
  // leikur í gangi (decide/resolved) → 409 running. Annað kall á sama kóða → 404 (leikurinn er horfinn) = idempotent.
  if (action === 'erase' && method === 'POST') {
    const you = await verifyToken(env, bearer(request));
    if (!you || you.role !== 'fac' || you.code !== code) return sjson({ error: 'auth' }, 401);
    if (game.phase !== 'lobby' && game.phase !== 'ended') return sjson({ error: 'running', phase: game.phase }, 409);
    const erased = await leikurEraseGame(env, code);
    return sjson({ ok: true, code, erased });
  }

  // GET /<code>/state
  if (action === 'state' && method === 'GET') {
    const you = await verifyToken(env, bearer(request));
    const teamsRaw = (await env.TENGSL.prepare('SELECT id, name FROM leikur_teams WHERE game_code=? ORDER BY id').bind(code).all().catch(() => ({ results: [] }))).results || [];
    const resultsRaw = (await env.TENGSL.prepare('SELECT round, team_id, kpis, round_score, cumulative FROM leikur_results WHERE game_code=?').bind(code).all().catch(() => ({ results: [] }))).results || [];
    // uppsafnað per lið (nýjasta cumulative)
    const cum = {}; for (const r of resultsRaw) cum[r.team_id] = Math.max(cum[r.team_id] ?? -1, r.cumulative);
    const ev = cfg.scenario.events[(game.current_round || 1) - 1] || null;
    const botSet = new Set(cfg.bots || []);
    const teams = teamsRaw.map((t) => ({ id: t.id, name: t.name, cumulative: cum[t.id] ?? 0, ...(botSet.has(t.id) ? { bot: true } : {}) }));
    const roundResults = resultsRaw.filter((r) => r.round === game.current_round).map((r) => ({ teamId: r.team_id, roundScore: r.round_score, cumulative: r.cumulative, detail: JSON.parse(r.kpis || '{}') }));
    // Umboð per áhorfanda: lið sér SITT hlutverks-umboð; leynd á hlutverkum hinna.
    let outMandate = scaleMandate(mandateAt(cfg, game.current_round), difficultyOf(cfg.difficulty).band), youRole = null;
    if (cfg.roles && cfg.roleMap && you && you.role === 'team' && you.code === code) {
      const rl = roleById(cfg.roleMap[you.teamId]);
      if (rl) { outMandate = mandateForRole(cfg.mandate, rl); youRole = { id: rl.id, label: rl.label, blurb: rl.blurb }; }
    }
    const out = { phase: game.phase, round: game.current_round, code, teams, mandate: outMandate, decisions: DECISIONS, event: game.phase === 'lobby' ? null : ev, results: game.phase === 'resolved' ? roundResults : null, you: you && you.code === code ? { role: you.role, teamId: you.teamId } : null };
    if (youRole) out.role = youRole;
    if (cfg.roles && cfg.roleMap && you && you.role === 'fac' && you.code === code) out.roleMap = revealRoles(cfg.roleMap, ROLES);
    if (cfg.roles && cfg.roleMap && game.phase === 'ended') out.rolesReveal = revealRoles(cfg.roleMap, ROLES);
    // Læsa-staða (A) + studio-gögn (C): eigin læsing liðs, roster f. fac, eigin saga+sviðsmynd-hingað-til f. studio-forskoðun.
    out.mode = cfg.mode;
    // SVIÐSMYND leiksins — AÐEINS lýsigögn (svidsmyndMeta): auðkenni, heiti, undirtitill, upphafsár og
    // eðlis-flöggin tvö. Efnið sjálft (events/dials/reality) fer ALDREI hingað; vafrinn flettir því upp
    // í svidsmyndir.mjs eftir out.svidsmynd.id (atburðir lotanna koma áfram um event/scenarioSoFar).
    out.svidsmynd = svidsmyndMeta(cfg.svidsmynd);
    out.rounds = cfg.rounds; // fjöldi kjörtímabila (úr sviðsmynd/sérsniðnum leik) — tímalínu-borði + „x/N" í haus
    out.difficulty = cfg.difficulty; // Fasi E: erfiðleikastig (easy/medium/hard)
    out.thokaOn = cfg.thoka; // Gagnatöf: er leikurinn í þoku? (allir áhorfendur — fac-stillingaspjald/liðs-merki; síunin sjálf er neðst: lið+watch í decide, fac aldrei)
    out.radherrarOn = cfg.radherrar; // Ráðherraskipting innan liðs: er rofinn kveiktur? (allir áhorfendur — sæta-blokkin sjálf (out.radherrar / lockRoster[].radherrar) er neðar, aðeins lið+fac)
    out.sattOn = cfg.satt; // Þjóðarsáttin: er rofinn kveiktur? (allir áhorfendur, öll fasa — sjálf sáttar-blokkin (out.satt) er neðar og aðeins utan lobby)
    out.leverCap = difficultyOf(cfg.difficulty).leverCap || null; // Pólitískt vald: hámark virkra sleða (Erfitt)
    // Fasi „skemmtun 3": óvænt atvik þessarar umferðar (sama f. öll lið, determinískt).
    // F1-V2: áhrifa-tölur (effect á atviki + klemmu-kostum) SENDAR MEÐ — meðvituð stefnubreyting frá „engar tölur", endurgjöfin 31.7 bað um þær.
    if (cfg.surprise && game.phase !== 'lobby') {
      const se = rollSurprise(code, game.current_round);
      if (se) out.surprise = { id: se.id, icon: se.icon, title: se.title, text: se.text, effect: se.effect || null,
        dilemma: se.dilemma ? { q: se.dilemma.q, options: (se.dilemma.options || []).map((o) => ({ key: o.key, label: o.label, effect: o.effect || null })) } : null };
    }
    // #3 Umferðar-klukka: sekúndur eftir (aðeins í decide). Bara sjónrænt — engin þvingun þjóns-megin.
    if (game.phase === 'decide' && cfg.deadline) { const nowS = now(); out.secondsLeft = Math.max(0, Math.min(cfg.timerSec || 3600, cfg.deadline - nowS)); out.deadlineTs = nowS + out.secondsLeft; } // deadline=epoch-sek (algilt→stöðug klukka); klemma f. eldri leiki með gölluð ms-tímamörk
    // Uppsafnað stig per lið per umferð (áhorfenda-sýn / þróunar-graf). Opinbert (eins og stigatafla).
    out.trajectory = teams.map((t) => ({ teamId: t.id, name: t.name, points: resultsRaw.filter((r) => r.team_id === t.id).sort((a, b) => a.round - b.round).map((r) => ({ round: r.round, value: r.cumulative })) }));
    // F1-V4: uppsafnaðar KPI-slóðir (þjappað: aðeins 5 KPI) + ákvarðana-mörk fyrir gröf — öll lið, opinbert
    // eins og stigatafla; EKKI í lobby. Mörk = lotan þar sem stór ákvörðun BREYTTIST (diff á geymdum policies
    // milli lota); ESB-stigin umsokn/ursogn (úr geymdum policyStages) fá eigin label.
    if (game.phase !== 'lobby' && resultsRaw.length) {
      const byTeamRes = {};
      for (const r of resultsRaw) { let d = {}; try { d = JSON.parse(r.kpis || '{}'); } catch (e) {} (byTeamRes[r.team_id] || (byTeamRes[r.team_id] = [])).push({ round: r.round, d }); }
      out.kpiHistory = []; out.decisionMarks = [];
      for (const t of teamsRaw) {
        const rows = (byTeamRes[t.id] || []).sort((a, b) => a.round - b.round);
        // VERK 2: atvinnuleysi bætt við (áður aðeins 5 uppsafnað-KPI) svo newsHeadlines á watch-ticker
        // fái allt sem hún les (verdbolga/hagvoxtur/atvinnuleysi/skuldir) — áfram þjappað undirmengi.
        out.kpiHistory.push({ teamId: t.id, name: t.name, rounds: rows.map((r) => { const k = r.d.kpis || {}; return { round: r.round, verdbolga: k.verdbolga ?? null, hagvoxtur: k.hagvoxtur ?? null, kaupmattur: k.kaupmattur ?? null, skuldir: k.skuldir ?? null, losun: k.losun ?? null, atvinnuleysi: k.atvinnuleysi ?? null }; }) });
        let prevPol = {};
        for (const r of rows) {
          const pol = r.d.policies || {}, rStages = r.d.policyStages || {};
          for (const id of Object.keys(pol)) {
            const v = pol[id];
            if (v === prevPol[id]) continue;                                       // óbreytt frá síðustu lotu
            if (prevPol[id] === undefined && (v == null || v === false)) continue; // aldrei virkjað → ekkert mark
            const p = POLICIES.find((x) => x.id === id) || {};
            const stage = rStages[id] || null;
            let label = p.label || id;
            if (id === 'esb' && stage === 'umsokn') label = 'ESB: umsókn';
            else if (id === 'esb' && stage === 'ursogn') label = 'ESB: úrsögn';
            else if (typeof v === 'string') { const o = (p.options || []).find((x) => x.key === v); if (o) label += ': ' + o.label; } // choice sýnir valið
            else if (v === false) label += ' — afnumið';                            // toggle slökkt = líka ákvörðun
            const mark = { teamId: t.id, round: r.round, id, icon: p.icon || '🏛️', label };
            if (stage) mark.stage = stage;
            out.decisionMarks.push(mark);
          }
          prevPol = pol;
        }
      }
      // F3-V3: Íslandskortið — opinbert eins og stigatafla/kpiHistory (kortið birtist á skjávarpa).
      // kort: nýjasta UPPGJÖR per lið (kpis-undirmengi kortsins + policyStates) → results-/watch-/leikslok-
      // sýnir teikna alltaf SETTLAÐA stöðu; drög lotu í gangi sjást aldrei á korti.
      out.kort = [];
      for (const t of teamsRaw) {
        const rows = byTeamRes[t.id] || []; if (!rows.length) continue;
        const last = rows.reduce((a, b) => (b.round > a.round ? b : a));
        const k = last.d.kpis || {};
        out.kort.push({ teamId: t.id, round: last.round, kpis: { byggdajofnudur: k.byggdajofnudur ?? null, fiskistofn: k.fiskistofn ?? null, losun: k.losun ?? null }, policies: last.d.policies || {} });
      }
      // eventChoices: klemmu-val per lið úr LEYSTUM lotum (dilemma úr decisions-sögu × rollSurprise per
      // lotu — atviks-id fæst aðeins hér, determinískt af (code, round)). GALLI E: lota telur AÐEINS ef
      // uppgjör er til í resultsRaw (leikstjóri getur 'stop'-að í miðjum decide → phase=ended ÁN resolve,
      // og óuppgert val má aldrei sjást á korti). 'ja' límist: „valdi liðið ja EINHVERN TÍMA" (gagnaver-táknið).
      if (cfg.surprise) {
        const decAll = ((await env.TENGSL.prepare('SELECT round, team_id, decisions FROM leikur_decisions WHERE game_code=?').bind(code).all().catch(() => ({ results: [] }))).results) || [];
        const dilByTR = {};
        for (const d of decAll) { try { const dd = JSON.parse(d.decisions || '{}'); if (dd.dilemma != null) (dilByTR[d.team_id] || (dilByTR[d.team_id] = {}))[d.round] = dd.dilemma; } catch (e) {} }
        const resolvedRounds = new Set(resultsRaw.map((r) => r.round));
        out.eventChoices = {};
        for (const t of teamsRaw) {
          const ch = {};
          for (let rr = 1; rr <= game.current_round; rr++) {
            if (!resolvedRounds.has(rr)) continue;   // uppgjör ekki til → valið var aldrei beitt
            const sev = rollSurprise(code, rr); if (!sev || !sev.dilemma) continue;
            const c = (dilByTR[t.id] || {})[rr];
            if (c != null && ch[sev.id] !== 'ja') ch[sev.id] = c;
          }
          out.eventChoices[t.id] = ch;
        }
      }
      // VERK 1c: pólitíski ásinn í leikslok (studio) — ferill per lið úr politikFerill (politik.mjs).
      // Levers úr ákvörðunum liðsins, policy-staða úr GEYMDU uppgjöri lotunnar (d.policies = uppsafnað
      // polStates við resolve — ratchet-inn helst, öfugt við hráar per-lotu decisions.policies).
      // Aðeins LEYSTAR lotur (byTeamRes — 'stop' í miðri decide telur ekki, sbr. GALLA E á korti).
      // Opinbert eins og stigatafla/rolesReveal: leikslok er afhjúpunar-stundin (debrief).
      if (game.phase === 'ended' && cfg.mode === 'studio') {
        const decP = ((await env.TENGSL.prepare('SELECT round, team_id, decisions FROM leikur_decisions WHERE game_code=?').bind(code).all().catch(() => ({ results: [] }))).results) || [];
        const levByTR = {};
        for (const d of decP) { try { const dd = JSON.parse(d.decisions || '{}'); (levByTR[d.team_id] || (levByTR[d.team_id] = {}))[d.round] = dd.levers || {}; } catch (e) {} }
        out.politikFerill = teamsRaw.map((t) => {
          const items = (byTeamRes[t.id] || []).slice().sort((a, b) => a.round - b.round)
            .map((r) => ({ round: r.round, levers: (levByTR[t.id] || {})[r.round] || {}, policies: r.d.policies || {} }));
          return { teamId: t.id, name: t.name, ferill: politikFerill(items) };
        }).filter((x) => x.ferill.length);
      }
    }
    // ÞJÓÐARSÁTTIN — AFHJÚPUN per sáttar-lotu úr GEYMDUM uppgjörum (leikur_results detail.sattUtkoma per lið, vistað við resolve):
    // out.sattUtkoma = [{ lota, flokkur, k, n, texti, valin:[{teamId,name,val,svikari,effect}] }] raðað eftir lotu — ÖLLUM
    // áhorfendum (lið/watch/fac) utan lobby: results/ended = afhjúpunin („hver valdi hvað"); decide N+1 sýnir fyrri sáttar-lotur
    // (eins og kpiHistory) — Í ÞOKU síar thokaSia lotu N-1 burt (aðeins lotur ≤ N-2 sjást). flokkur/k/n/effect úr geymslu
    // (ekki endurreiknað → standa þótt SATT_FYLKI breytist); texti (kennslusetningin) endurreiknaður úr geymdum valum (hreint fall).
    if (cfg.satt && game.phase !== 'lobby' && resultsRaw.length) {
      const nmS = Object.fromEntries(teamsRaw.map((t) => [t.id, t.name])), byR = {};
      for (const r of resultsRaw) { let su = null; try { su = JSON.parse(r.kpis || '{}').sattUtkoma || null; } catch (e) {} if (!su) continue; (byR[r.round] || (byR[r.round] = [])).push({ teamId: r.team_id, name: nmS[r.team_id] || ('Lið ' + r.team_id), val: su.val === 'satt' ? 'satt' : 'saekja', svikari: su.val !== 'satt', effect: su.effect || {}, flokkur: su.flokkur, k: su.k, n: su.n }); }
      const lot = Object.keys(byR).map(Number).sort((a, b) => a - b);
      if (lot.length) out.sattUtkoma = lot.map((rd) => { const rows = byR[rd].sort((a, b) => a.teamId - b.teamId), f = rows[0];
        return { lota: rd, flokkur: f.flokkur, k: f.k, n: f.n, texti: sattUtkoma(Object.fromEntries(rows.map((x) => [x.teamId, x.val]))).texti, valin: rows.map(({ teamId, name, val, svikari, effect }) => ({ teamId, name, val, svikari, effect })) }; });
    }
    // Fasi D: lokaumferðar perKpi liðsins → leikslok-samantekt „sterkasta/veikasta svið".
    if (you && you.role === 'team' && you.code === code) { const mr = resultsRaw.filter((r) => r.team_id === you.teamId).sort((a, b) => b.round - a.round); if (mr.length) {
      try { const d = JSON.parse(mr[0].kpis || '{}'); out.finalPerKpi = d.perKpi || []; out.policySummary = describePolicies(d.policies || {}); } catch (e) {}
      let asum = 0, an = 0; for (const r of mr) { try { const a = (JSON.parse(r.kpis || '{}').stability || {}).approval; if (typeof a === 'number') { asum += a; an++; } } catch (e) {} }
      if (an) out.avgApproval = Math.round(asum / an); // heildar-fylgi = meðaltal yfir kjörtímabilin
      // Verðlaunapeningar/titlar úr allri sögu liðsins (leikslok).
      const mrounds = mr.map((rr) => { let d = {}; try { d = JSON.parse(rr.kpis || '{}'); } catch (e) {} return { round: rr.round, kpis: d.kpis || {}, roundScore: rr.round_score, stability: d.stability, policies: d.policies, crisis: d.crisis }; });
      out.medals = awardMedals(mrounds);
    } }
    if (game.phase !== 'lobby') {
      const lockRows = ((await env.TENGSL.prepare('SELECT team_id, locked, decisions FROM leikur_decisions WHERE game_code=? AND round=?').bind(code, game.current_round).all().catch(() => ({ results: [] }))).results) || [];
      const lockedOf = {}; for (const lr of lockRows) lockedOf[lr.team_id] = !!lr.locked;
      if (out.you && out.you.role === 'team') out.you.locked = !!lockedOf[out.you.teamId];
      if (you && you.role === 'fac' && you.code === code) out.lockRoster = teamsRaw.map((t) => ({ teamId: t.id, name: t.name, locked: !!lockedOf[t.id], ...(botSet.has(t.id) ? { bot: true } : {}) }));
      // ── ÞJÓÐARSÁTTIN (config.satt, sjá satt.mjs) — sáttar-blokk /state utan lobby ──────────────────────────────────
      // out.satt = { on, lota (er ÞESSI lota sáttar-lota?), lotur (sáttar-loturnar), karphus:{open,until,secondsLeft} }
      //  + LIÐ: val = eigið val þessarar lotu ('satt'|'saekja'|null = ekki tekið afstöðu → telst saekja við uppgjör; client
      //    sýnir SATT_TEXTI.ekkiValid áður en liðið læsir)  + FAC: valin = [{teamId,name,val,locked}] í RAUNTÍMA (leikstjóri
      //    sér valin — hann stýrir Karphúsinu)  + WATCH (tákn-laust): HVORKI val né valin (blint á skjávarpa — „lið velja").
      // Æfingalið (bots) eru UTAN sáttar-pottsins (hlutlaus, taka aldrei afstöðu; 1 raun-lið + bot = n=1 „einn") → ekki í valin.
      // Karphús-hlé: cfg.karphus={round,until} (config, ekki schema) — opið aðeins í decide ÞESSARAR lotu meðan until > nú.
      if (cfg.satt) {
        const nowS = now(), kh = cfg.karphus;
        const khOpen = !!(kh && game.phase === 'decide' && kh.round === game.current_round && kh.until > nowS);
        const sattValOf = (tid) => { const lr = lockRows.find((x) => x.team_id === tid); if (!lr) return null; try { const v = JSON.parse(lr.decisions || '{}').satt; return (v === 'satt' || v === 'saekja') ? v : null; } catch (e) { return null; } };
        const lotur = []; for (let rr = 1; rr <= cfg.rounds; rr++) if (sattLota(rr, cfg)) lotur.push(rr);
        const sb = { on: true, lota: sattLota(game.current_round, cfg), lotur, karphus: { open: khOpen, until: khOpen ? kh.until : null, secondsLeft: khOpen ? kh.until - nowS : 0 } };
        if (you && you.role === 'team' && you.code === code) sb.val = sb.lota ? sattValOf(you.teamId) : null;
        if (you && you.role === 'fac' && you.code === code) sb.valin = teamsRaw.filter((t) => !botSet.has(t.id)).map((t) => ({ teamId: t.id, name: t.name, val: sb.lota ? sattValOf(t.id) : null, locked: !!lockedOf[t.id] }));
        out.satt = sb;
      }
      if (cfg.mode === 'studio' && you && you.role === 'team' && you.code === code) {
        const myRows = ((await env.TENGSL.prepare('SELECT round, decisions FROM leikur_decisions WHERE game_code=? AND team_id=? ORDER BY round').bind(code, you.teamId).all().catch(() => ({ results: [] }))).results) || [];
        const byR = {}; for (const rr of myRows) { try { byR[rr.round] = JSON.parse(rr.decisions || '{}'); } catch (e) {} }
        out.history = []; for (let rr = 1; rr < game.current_round; rr++) out.history.push(byR[rr] || {});
        out.scenarioSoFar = (cfg.scenario.events || []).slice(0, game.current_round);
        // Deilanleg liðs-drög núverandi umferðar (einangruð per team_id) → félagar samstilla sleða.
        out.draft = (byR[game.current_round] || {}).levers || {};
        // Fasi E: stefnu-rofar — núverandi staða (úr fyrri ákvörðunum), drög þessarar umferðar, og hvað er í boði núna.
        const { states: polStates, since: polSince } = policyStatesMeta(out.history);
        out.policies = { states: polStates, draft: (byR[game.current_round] || {}).policies || {},
          available: POLICIES.filter((p) => policyAvailable(p, game.current_round, polStates)).map((p) => ({ id: p.id, icon: p.icon, label: p.label, kind: p.kind, desc: p.desc, onLabel: p.onLabel, offLabel: p.offLabel, options: p.options, pop: POLICY_POP[p.id] || null })) };
        out.dilemmaDraft = (byR[game.current_round] || {}).dilemma || null; // Fasi „skemmtun 3": deilanlegt klemmu-val liðs
        // F1-V2: deltas úr SÍÐUSTU geymdu lotu-niðurstöðu liðsins (knýja badge-tooltips + arfleifðar-tölur; engin fyrri lota/eldri leikir → null).
        let lastDeltas = null, lastStages = null;
        const lastRes = resultsRaw.filter((r) => r.team_id === you.teamId).sort((a, b) => b.round - a.round)[0];
        if (lastRes) { try { const ld = JSON.parse(lastRes.kpis || '{}'); lastDeltas = ld.policyDeltas || null; lastStages = ld.policyStages || null; } catch (e) {} }
        // F1-V2: stefnu-badges — AÐEINS staðfestar ákvarðanir (úr policyStates-sögu); drög ÞESSARAR decide-lotu birtast ekki fyrr en næst.
        out.policyBadges = [];
        for (const p of POLICIES) {
          const v = polStates[p.id]; if (v == null || v === false) continue;
          const b = { id: p.id, icon: p.icon, label: p.label, stage: policyStage(p.id, polStates, polSince, game.current_round), sinceRound: polSince[p.id] ?? null, deltas: (lastDeltas && lastDeltas[p.id]) || null };
          if (p.kind === 'choice') { const o = (p.options || []).find((x) => x.key === v); b.choice = o ? o.label : String(v); }
          out.policyBadges.push(b);
        }
        // GALLI H: úrsagnarhöggið var beitt í uppgjöri SÍÐUSTU lotu (geymt stage 'ursogn') en esb=false
        // slapp gegnum badge-lykkjuna → gera það sýnilegt lotuna á eftir („úrsögn í ferli" + deltas höggsins).
        if (lastStages && lastStages.esb === 'ursogn' && polStates.esb === false) {
          const pe = POLICIES.find((x) => x.id === 'esb');
          out.policyBadges.push({ id: 'esb', icon: pe.icon, label: pe.label, stage: 'ursogn', sinceRound: polSince.esb ?? null, deltas: (lastDeltas && lastDeltas.esb) || null });
        }
        // Arfleifð: hvernig standandi stórar ákvarðanir + óvænt atvik SÍÐUSTU lotu lita þessa lotu (birt í byrjun lotu ≥2).
        if (game.current_round >= 2) {
          const prevEvent = cfg.surprise ? rollSurprise(code, game.current_round - 1) : null;
          let co = carryover({ policyStates: polStates, prevEvent, prevChoiceKey: (byR[game.current_round - 1] || {}).dilemma, deltas: lastDeltas });
          // GALLI H: carryover sleppir esb þegar states.esb===false — bæta röð um úrsögnina sjálfa.
          if (lastStages && lastStages.esb === 'ursogn' && polStates.esb === false) {
            const pe = POLICIES.find((x) => x.id === 'esb');
            const row = { id: 'esb', icon: pe.icon, label: pe.label, text: 'Úrsögnin úr ESB-ferlinu kostaði skammtíma-högg í síðustu lotu (hagvöxtur niður, verðbólga upp) — áhrifin fjara út þetta kjörtímabil.' };
            if (lastDeltas && lastDeltas.esb) row.deltas = lastDeltas.esb;
            if (co) co.policies.push(row); else co = { policies: [row], event: null };
          }
          if (co) out.carryover = co;
        }
        // Fasi „fylgi" B2: stjórnarkreppa — féll stjórnin síðasta kjörtímabil? (birt sem borði + dýpri byrjun þessa lotu).
        const prevRes = resultsRaw.find((r) => r.team_id === you.teamId && r.round === game.current_round - 1);
        if (prevRes) { try { out.stjornarkreppa = ((JSON.parse(prevRes.kpis).stability || {}).level === 'revolt'); } catch (e) {} }
      }
    }
    // ── RÁÐHERRASKIPTING (config.radherrar, radherrar.mjs): sæta-map per lið úr decisions-röð ÞESSARAR lotu (lobby = lota 0 —
    // sæti má velja fyrir start; carryRadherrar ber þau í lotu 1). LIÐ: out.radherrar = { on, stada (picker-listi í fastri röð,
    // {taken} — ALDREI handle, sjá staðaAnHandles), mitt (sæti handle-s úr ?h=<handle> — client sendir; vantar/ógilt → null),
    // pmClaimed, lockFallback (enginn forsætisráðherra → hver sem er læsir) }. FAC: {raduneyti:true}-map + lockFallback á hvert
    // raun-lið í lockRoster (lockFallback=true → „enginn forsætisráðherra — hver sem er læsir"). WATCH (tákn-laust): ekkert.
    // Læsingin sjálf (you.locked / lockRoster[].locked) er ÓBREYTT = röð locked=1. Í þoku lifir blokkin síun (thokaSia = grunnt afrit).
    if (cfg.radherrar && you && you.code === code && (you.role === 'team' || you.role === 'fac')) {
      const rhRows = ((await env.TENGSL.prepare('SELECT team_id, decisions FROM leikur_decisions WHERE game_code=? AND round=?').bind(code, game.current_round).all().catch(() => ({ results: [] }))).results) || [];
      const mapOf = (tid) => radherrarMapOf(rhRows.find((x) => x.team_id === tid));
      if (you.role === 'team') {
        const map = mapOf(you.teamId), pmClaimed = !!map[PM], h = url.searchParams.get('h');
        out.radherrar = { on: true, stada: staðaAnHandles(map), mitt: validHandle(h) ? raduneytiOf(map, h) : null, pmClaimed, lockFallback: !pmClaimed };
      } else if (Array.isArray(out.lockRoster)) {
        for (const r of out.lockRoster) { if (r.bot) continue; const map = mapOf(r.teamId); r.radherrar = mapAnHandles(map); r.lockFallback = !map[PM]; }
      }
    }
    // Leikstjóra-greining (aðeins fac-tákn): þver-liða skorkort/ákvarðanir/ferlar úr allri sögu.
    if (you && you.role === 'fac' && you.code === code) {
      const decRaw = (await env.TENGSL.prepare('SELECT round, team_id, decisions FROM leikur_decisions WHERE game_code=?').bind(code).all().catch(() => ({ results: [] }))).results || [];
      const history = resultsRaw.map((r) => { let d = {}; try { d = JSON.parse(r.kpis || '{}'); } catch (e) {} return { round: r.round, teamId: r.team_id, roundScore: r.round_score, cumulative: r.cumulative, perKpi: d.perKpi || [] }; });
      const decisions = decRaw.map((r) => { let dd = {}; try { dd = JSON.parse(r.decisions || '{}'); } catch (e) {} return { round: r.round, teamId: r.team_id, decisions: dd }; });
      out.analytics = history.length ? buildAnalytics({ history, decisions, teams: teamsRaw.map((t) => ({ id: t.id, name: t.name })), mandate: mandateAt(cfg, game.current_round), decisionsConfig: DECISIONS, scenario: cfg.scenario, currentRound: game.current_round, mode: cfg.mode, leverLabels: LEVER_LABELS, leverBase: LEVER_BASE }) : null;
      if (out.analytics && cfg.roles && cfg.roleMap) {
        const lbl = Object.fromEntries(revealRoles(cfg.roleMap, ROLES).map((r) => [r.teamId, r.label]));
        out.analytics.scorecard.forEach((row) => { row.role = lbl[row.teamId] || null; });
      }
      // Stefnu-ákvarðanir hvers liðs (nýjasta staða) → leikstjóra-samantekt + umræðupunktar.
      if (out.analytics) {
        const nm = Object.fromEntries(teamsRaw.map((t) => [t.id, t.name]));
        const latest = {}, appr = {}; for (const r of resultsRaw) { if (!latest[r.team_id] || r.round > latest[r.team_id].round) latest[r.team_id] = r; try { const a = (JSON.parse(r.kpis || '{}').stability || {}).approval; if (typeof a === 'number') (appr[r.team_id] || (appr[r.team_id] = [])).push(a); } catch (e) {} }
        out.analytics.policiesByTeam = Object.values(latest).map((r) => { let pol = {}; try { pol = JSON.parse(r.kpis || '{}').policies || {}; } catch (e) {} return { teamId: r.team_id, name: nm[r.team_id] || ('Lið ' + r.team_id), policies: describePolicies(pol) }; }).filter((x) => x.policies.length);
        out.analytics.scorecard.forEach((row) => { const arr = appr[row.teamId]; row.avgApproval = (arr && arr.length) ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null; }); // heildar-fylgi per lið
        // Frammistöðu-yfirlit per lið (leikslok-umræða): sterk/veik svið + fylgi + föll → „gerðu vel / mátti bæta".
        const byTeam = {}; for (const r of resultsRaw) { let d = {}; try { d = JSON.parse(r.kpis || '{}'); } catch (e) {} (byTeam[r.team_id] || (byTeam[r.team_id] = [])).push({ round: r.round, perKpi: d.perKpi || [], approval: (d.stability || {}).approval, fell: (d.stability || {}).level === 'revolt' }); }
        out.analytics.teamReview = teamReview(teamsRaw.map((t) => ({ teamId: t.id, name: nm[t.id] || ('Lið ' + t.id), rounds: (byTeam[t.id] || []).sort((a, b) => a.round - b.round) })));
        // Ákvarðanaferill (studio): per lið, per kjörtímabil — breyttir sleðar + klemmu-val, með atburða-heiti.
        if (cfg.mode === 'studio') {
          const decByTR = {}; for (const d of decRaw) { let dd = {}; try { dd = JSON.parse(d.decisions || '{}'); } catch (e) {} (decByTR[d.team_id] || (decByTR[d.team_id] = {}))[d.round] = dd; }
          out.analytics.decisionArc = teamsRaw.map((t) => {
            const rows = [];
            for (let rr = 1; rr <= game.current_round; rr++) { const dd = (decByTR[t.id] || {})[rr]; if (!dd) continue;
              const lv = dd.levers || {}; const changed = Object.keys(lv).filter((k) => LEVER_BASE[k] != null && +lv[k] !== LEVER_BASE[k]).map((k) => LEVER_LABELS[k] || k);
              const parts = []; if (changed.length) parts.push(changed.slice(0, 5).join(', ') + (changed.length > 5 ? ' +' + (changed.length - 5) : ''));
              if (dd.dilemma) parts.push('🎲 ' + dd.dilemma);
              rows.push({ round: rr, event: (cfg.scenario.events[rr - 1] || {}).title || ('Kjörtímabil ' + rr), summary: parts.join(' · ') || 'engin breyting' }); }
            return { teamId: t.id, name: nm[t.id] || ('Lið ' + t.id), rows };
          }).filter((x) => x.rows.length);
        }
        // Fasi „skemmtun 3": klemmu-viðbrögð liða yfir kjörtímabilin → leikstjóra-samantekt í leikslok.
        if (cfg.surprise) {
          const dilByTR = {}; for (const d of decRaw) { let dd = {}; try { dd = JSON.parse(d.decisions || '{}'); } catch (e) {} (dilByTR[d.team_id] || (dilByTR[d.team_id] = {}))[d.round] = dd.dilemma; }
          out.analytics.dilemmasByTeam = teamsRaw.map((t) => {
            const items = [];
            for (let rr = 2; rr <= game.current_round; rr++) { const ev = rollSurprise(code, rr); if (!ev || !ev.dilemma) continue;
              items.push({ round: rr, icon: ev.icon, title: ev.title, choice: dilemmaChoiceLabel(ev, (dilByTR[t.id] || {})[rr]) }); }
            return { teamId: t.id, name: nm[t.id] || ('Lið ' + t.id), items };
          }).filter((x) => x.items.length);
        }
      }
    }
    // GAGNATÖF („hagstjórn í þoku", config.thoka): í decide-fasa fær ALLT NEMA FAC-TÁKN SÍAÐ svar — harðar KPI-tölur lotu N-1
    // fara ALDREI út (þjóns-megin sía, sjá thokaSia). LIÐ: eigin sía (teamId). WATCH (ekkert tákn / tákn annars leiks):
    // sama sía með teamId:null — lokar rýni-gatinu „lið opnar watch-sýnina í öðrum flipa og sér N-1 tölurnar".
    // Fac (leikstjóri) + results/ended-fasi allra: ÓSNERT.
    const thokaTeam = !!(you && you.role === 'team' && you.code === code), thokaFac = !!(you && you.role === 'fac' && you.code === code);
    if (cfg.thoka && game.phase === 'decide' && !thokaFac) {
      const N = game.current_round;
      const rows = resultsRaw.map((r) => { let d = {}; try { d = JSON.parse(r.kpis || '{}'); } catch (e) {} return { round: r.round, teamId: r.team_id, d, roundScore: r.round_score, cumulative: r.cumulative }; });
      // Markmiðin sem tölur lotu N-1 voru dæmdar eftir (sama skölun/hlutverk og í uppgjöri) → vs_markmid í áttum (aðeins lið; watch fær engar áttir).
      let prevMandate = (thokaTeam && N >= 2) ? scaleMandate(mandateAt(cfg, N - 1), difficultyOf(cfg.difficulty).band) : null;
      if (prevMandate && cfg.roles && cfg.roleMap) { const rl = roleById(cfg.roleMap[you.teamId]); if (rl) prevMandate = mandateForRole(prevMandate, rl); }
      const arLotu = (r) => { const y = (cfg.scenario.events[r - 1] || {}).year; return (typeof y === 'number') ? y : cfg.svidsmynd.yearStart + (r - 1) * 4; };
      return sjson(thokaSia(out, { teamId: thokaTeam ? you.teamId : null, round: N, rows, goalSpecs: prevMandate ? prevMandate.kpis : [], arLotu }));
    }
    return sjson(out);
  }

  // POST /<code>/decisions  (team-token)
  if (action === 'decisions' && method === 'POST') {
    const you = await verifyToken(env, bearer(request));
    if (!you || you.role !== 'team' || you.code !== code) return sjson({ error: 'auth' }, 401);
    if (game.phase !== 'decide') return sjson({ error: 'phase' }, 409);
    const b = await request.json().catch(() => ({}));
    if (+b.round !== game.current_round) return sjson({ error: 'round' }, 409);
    const dObj = b.decisions || {};
    // ÞJÓÐARSÁTTIN: decisions.satt = 'satt'|'saekja' (vistað NÁKVÆMLEGA eins og dilemma, í decisions-JSON). VÖRN: aðeins tekið
    // við í sáttar-lotu OG aðeins þessi tvö gildi — annars fjarlægt (utan sáttar-lotu hunsað; rusl hunsað → telst ekki valið).
    const sattVorn = (d) => { if (d && typeof d === 'object' && !Array.isArray(d) && 'satt' in d && !(sattLota(game.current_round, cfg) && (d.satt === 'satt' || d.satt === 'saekja'))) delete d.satt; };
    if (cfg.radherrar) {
      // RÁÐHERRASKIPTING (radherrar.mjs — þjóns-samningurinn efst þar): MERGE per sleða inn í geymd drög lotunnar í stað þess að
      // skipta öllu JSON-inu út (ráðherrar klobba ekki hver annan). Sætið er leitt af GEYMDA map-inu + b.handle — aldrei af
      // body-inu (ekkert spoof). Vantar/ógilt handle = ekkert sæti → allt hafnað nema fallback-læsing ef enginn forsætisráðherra.
      // decisions.radherrar={key:handle} í sama POST = claim-beiðnir (first-wins; /saeti er léttari leið fyrir picker-UI).
      // Sáttar-/klemmu-/stefnu-svið eru PM-only í merge; sáttar-vörnin keyrir EFTIR merge á merged-hlutinn (það sem fer í geymslu).
      // Lestur→merge→skrif er ATÓMÍSKT um casRitun (CAS á lesnu bætin, endurlestur ef félagi skrifaði á milli) — sjá
      // KAPPHLAUPS-VÖRN efst. Allt hér inni er fall af `row` EINGÖNGU svo endurtekning gefi sama (ferskara) svar.
      const incoming = { ...((dObj && typeof dObj === 'object' && !Array.isArray(dObj)) ? dObj : {}), locked: !!b.locked };
      const handle = validHandle(b.handle) ? b.handle : null;
      return await casRitun(env, code, game.current_round, you.teamId, (row) => {
        const prev = row ? { ...parseDec(row), locked: !!row.locked } : null;
        // LÆST RÖÐ TEKUR ENGIN DRÖG (þjóns-vörn — client-vörnin ein er bypassanleg í devtools): sé röðin læst og sendandinn EKKI
        // forsætisráðherra skv. GEYMDA map-inu er EKKERT tekið úr incoming (sleðar/svið/claim-beiðnir) — annars læddust sleðar
        // ráðherra inn í læstu röðina (locked helst 1 en gildin breytast) og uppgjörið notaði gildi sem PM samþykkti aldrei.
        // Undantekning: lockFallback (enginn PM claim-aður) + locked:false SKÝRT í sama POST = meðvituð aflæsing (hver sem er má
        // aflæsa þar, eins og fyrr) → venjulegt merge; locked VANTAR eða true = EKKI aflæsing. PM fer alltaf í merge (aflæsir með
        // locked:false og breytir). Svar 200 {ok, locked:true, hafnad:['locked']} — EKKI 409: client pollar og kapphlaup
        // PM-læsing ↔ drög ráðherra er eðlilegt, ekki villa. Claims á læsta röð fara um /saeti (snertir ekki sleða).
        if (prev && prev.locked) {
          const map0 = normMap(prev.radherrar), unlockOk = (b.locked === false && !map0[PM]);
          if (raduneytiOf(map0, handle) !== PM && !unlockOk) return { skrifa: false, svar: sjson({ ok: true, hafnad: ['locked'], raduneyti: raduneytiOf(map0, handle), locked: true }) };
        }
        const merged = mergeDecisions(prev, incoming, { handle, baseline: BASELINE, config: cfg });
        sattVorn(merged);
        const g = tilGeymslu(merged);
        return { skrifa: true, decisions: g.decisions, locked: g.locked, svar: sjson({ ok: true, hafnad: g.hafnad, raduneyti: raduneytiOf(g.decisions.radherrar, handle), locked: !!g.locked }) };
      });
    }
    // Án radherrar: ÓBREYTT leið — sama SQL, sama JSON (afturför-vörn; sjá „config af → byte-eins" í server.test.mjs).
    sattVorn(dObj);
    await env.TENGSL.prepare('INSERT OR REPLACE INTO leikur_decisions (game_code, round, team_id, decisions, locked, submitted_at) VALUES (?,?,?,?,?,?)')
      .bind(code, game.current_round, you.teamId, JSON.stringify(dObj), b.locked ? 1 : 0, now()).run().catch(() => null);
    return sjson({ ok: true });
  }

  // POST /<code>/saeti (liðs-tákn) — RÁÐHERRASKIPTING: velja/sleppa sæti ÁN þess að snerta sleða (léttara fyrir picker-UI en
  // claim-beiðni í /decisions). Body { handle, key|null }: key = ráðuneytis-lykill → claimRaduneyti (first-wins; sama handle á
  // aðeins EITT sæti → fyrra sleppt sjálfkrafa), key null → sleppa núverandi sæti handle-s (ekkert sæti = hljóðlátt ok 'laust').
  // Leyft í lobby (lota 0 — carryRadherrar ber sætin í lotu 1 við start), decide og resolved (sætin lifa leikinn); ended → 409.
  // Aðrar ákvarðanir + læsing raðarinnar eru ÓSNERTAR. Skilar { ok, reason, mitt, pmClaimed, stada } = allt sem picker-inn þarf.
  if (action === 'saeti' && method === 'POST') {
    const you = await verifyToken(env, bearer(request));
    if (!you || you.role !== 'team' || you.code !== code) return sjson({ error: 'auth' }, 401);
    if (!cfg.radherrar) return sjson({ error: 'radherrar' }, 409);
    if (game.phase === 'ended') return sjson({ error: 'phase' }, 409);
    const b = await request.json().catch(() => ({}));
    if (!validHandle(b.handle)) return sjson({ error: 'handle' }, 400);
    // Sama kapphlaups-vörn og /decisions: sæta-val skrifar ALLA decisions-röðina, svo blint skrif þurrkaði út sleða sem félagi
    // vistaði á milli lestrar og skrifar. casRitun endurles og endurreiknar claim-ið á fersku map-i (first-wins helst réttur).
    return await casRitun(env, code, game.current_round, you.teamId, (row) => {
      const d = parseDec(row), map0 = normMap(d.radherrar);
      let r;
      if (b.key == null) { const k = raduneytiOf(map0, b.handle); r = k ? releaseRaduneyti(map0, k, b.handle) : { map: map0, ok: true, reason: 'laust' }; }
      else r = claimRaduneyti(map0, b.key, b.handle);
      const map = normMap(r.map);
      const svar = sjson({ ok: r.ok, reason: r.reason, mitt: raduneytiOf(map, b.handle), pmClaimed: !!map[PM], stada: staðaAnHandles(map) });
      if (!r.ok || JSON.stringify(map) === JSON.stringify(map0)) return { skrifa: false, svar };
      return { skrifa: true, decisions: { ...d, radherrar: map }, locked: row && row.locked, svar };
    });
  }

  // POST /<code>/control  (fac-token)
  if (action === 'control' && method === 'POST') {
    const you = await verifyToken(env, bearer(request));
    if (!you || you.role !== 'fac' || you.code !== code) return sjson({ error: 'auth' }, 401);
    const b = await request.json().catch(() => ({}));
    const act = b.action;
    if (act === 'start') {
      let cobj = {}; try { cobj = JSON.parse(game.config || '{}'); } catch (e) {}
      if (cfg.roles && !cfg.roleMap) {
        const teamRows = ((await env.TENGSL.prepare('SELECT id FROM leikur_teams WHERE game_code=? ORDER BY id').bind(code).all().catch(() => ({ results: [] }))).results) || [];
        cobj.roleMap = assignRoles(teamRows.map((t) => t.id), ROLES);
      }
      if (cfg.timerSec) cobj.deadline = now() + cfg.timerSec; // #3 umferðar-klukka
      // RÁÐHERRASKIPTING: sæti valin í lobby (lota 0) → drög lotu 1. FYRIR fasa-UPDATE-ið af ásettu ráði: lesum game.current_round
      // aðeins ÁÐUR en röðin breytist (D1 skilar snapshot, mock skilar tilvísun — sama niðurstaða báðum megin).
      if (cfg.radherrar) await carryRadherrar(env, code, game.current_round || 0, 1, await nonBotTeamIds(env, code, cfg));
      await env.TENGSL.prepare('UPDATE leikur_games SET config=?, phase=?, current_round=? WHERE code=?').bind(JSON.stringify(cobj), 'decide', 1, code).run().catch(() => null);
      await lockBots(env, code, 1, cfg.bots);   // æfingalið: hlutlausar ákvarðanir læstar strax
      return sjson({ ok: true, phase: 'decide', round: 1 });
    }
    if (act === 'stop') { await env.TENGSL.prepare('UPDATE leikur_games SET phase=? WHERE code=?').bind('ended', code).run().catch(() => null); return sjson({ ok: true, phase: 'ended' }); }
    if (act === 'next') {
      const nr = (game.current_round || 0) + 1;
      if (nr > cfg.rounds) { await env.TENGSL.prepare('UPDATE leikur_games SET phase=? WHERE code=?').bind('ended', code).run().catch(() => null); return sjson({ ok: true, phase: 'ended' }); }
      if (cfg.radherrar) await carryRadherrar(env, code, nr - 1, nr, await nonBotTeamIds(env, code, cfg)); // ráðherrasætin lifa leikinn: map lotu N → drög lotu N+1 (FYRIR fasa-UPDATE, sjá start)
      if (cfg.timerSec) { // #3 endursetja klukku fyrir nýtt kjörtímabil
        let cobj = {}; try { cobj = JSON.parse(game.config || '{}'); } catch (e) {}
        cobj.deadline = now() + cfg.timerSec;
        await env.TENGSL.prepare('UPDATE leikur_games SET config=?, phase=?, current_round=? WHERE code=?').bind(JSON.stringify(cobj), 'decide', nr, code).run().catch(() => null);
      } else {
        await env.TENGSL.prepare('UPDATE leikur_games SET phase=?, current_round=? WHERE code=?').bind('decide', nr, code).run().catch(() => null);
      }
      await lockBots(env, code, nr, cfg.bots);   // æfingalið: hlutlausar ákvarðanir læstar strax
      return sjson({ ok: true, phase: 'decide', round: nr });
    }
    // ÞJÓÐARSÁTTIN — Karphús-hlé (fac): {action:'karphus', open:true, minutes?} opnar (sjálfgefið 3 mín, klemmt 1–30) AÐEINS í decide
    // sáttar-lotu (annars 409 satt-lota); {open:false} lokar alltaf. Vistað í config.karphus={round,until} (epoch-sek; ekki schema) —
    // /state birtir out.satt.karphus={open,until,secondsLeft} ÖLLUM (borðinn „Karphúsið er opið — talið saman" á öllum skjám).
    // Hléið er TÍMI + leyfi (engin skilaboð) — hópurinn talar í herberginu; leikstjóri lokar og liðin læsa svo valinu.
    if (act === 'karphus') {
      let cobj = {}; try { cobj = JSON.parse(game.config || '{}'); } catch (e) {}
      const open = !(b.open === false || b.open === 'false' || b.open === 0);
      if (!open) { delete cobj.karphus; await env.TENGSL.prepare('UPDATE leikur_games SET config=? WHERE code=?').bind(JSON.stringify(cobj), code).run().catch(() => null); return sjson({ ok: true, karphus: { open: false, until: null, secondsLeft: 0 } }); }
      if (!cfg.satt || game.phase !== 'decide' || !sattLota(game.current_round, cfg)) return sjson({ error: 'satt-lota', phase: game.phase, round: game.current_round }, 409);
      const mins = Math.max(1, Math.min(30, (+b.minutes > 0) ? +b.minutes : 3));
      const until = now() + Math.round(mins * 60);
      cobj.karphus = { round: game.current_round, until };
      await env.TENGSL.prepare('UPDATE leikur_games SET config=? WHERE code=?').bind(JSON.stringify(cobj), code).run().catch(() => null);
      return sjson({ ok: true, karphus: { open: true, until, secondsLeft: until - now() } });
    }
    if (act === 'resolve') {
      // idempotent: sleppa ef þegar leyst fyrir þessa umferð
      const done = await env.TENGSL.prepare('SELECT team_id FROM leikur_results WHERE game_code=? AND round=? LIMIT 1').bind(code, game.current_round).first().catch(() => null);
      if (done || game.phase === 'resolved') return sjson({ ok: true, phase: 'resolved' });
      await lockBots(env, code, game.current_round, cfg.bots);   // öryggisnet: bot-lið án læstrar raðar → óbreytt drög + locked
      const teams = ((await env.TENGSL.prepare('SELECT id FROM leikur_teams WHERE game_code=? ORDER BY id').bind(code).all().catch(() => ({ results: [] }))).results) || [];
      // ÞJÓÐARSÁTTIN (satt.mjs): í sáttar-lotu ræðst útkoman af því hvað ÖLL lið völdu → reiknað EINU SINNI fyrir lykkjuna úr
      // decisions.satt allra liða þessarar lotu (ekkert val / engin röð / rusl = null → 'saekja': sá sem ekki skrifar undir er utan
      // sáttar). Æfingalið (bots) eru UTAN pottsins (hlutlaus — 1 raun-lið + bot = n=1 „einn"). perTeam-áhrifin beitast í lykkjunni.
      let sattRes = null;
      if (sattLota(game.current_round, cfg)) {
        const botS = new Set(cfg.bots || []);
        const sRows = ((await env.TENGSL.prepare('SELECT team_id, decisions FROM leikur_decisions WHERE game_code=? AND round=?').bind(code, game.current_round).all().catch(() => ({ results: [] }))).results) || [];
        const valin = {};
        for (const tm of teams) { if (botS.has(tm.id)) continue; let v = null; const sr = sRows.find((x) => x.team_id === tm.id); if (sr) { try { v = JSON.parse(sr.decisions || '{}').satt; } catch (e) {} } valin[tm.id] = (v === 'satt' || v === 'saekja') ? v : null; }
        if (Object.keys(valin).length) sattRes = sattUtkoma(valin);
      }
      for (const tm of teams) {
        // öll ákvörðunasaga liðs, umferð 1..current
        const rows = ((await env.TENGSL.prepare('SELECT round, decisions FROM leikur_decisions WHERE game_code=? AND team_id=? ORDER BY round').bind(code, tm.id).all().catch(() => ({ results: [] }))).results) || [];
        const byRound = {}; for (const r of rows) byRound[r.round] = JSON.parse(r.decisions || '{}');
        const history = []; for (let rr = 1; rr <= game.current_round; rr++) history.push(byRound[rr] || {}); // ósend = tómt (óbreytt/engin)
        const diff = difficultyOf(cfg.difficulty);
        const { kpis, quarters } = resolveTeam({ baseline: BASELINE, links: LINKS, history, scenario: cfg.scenario, mode: cfg.mode, shockScale: diff.shock, leverCap: diff.leverCap });
        // Fasi E: stefnu-rofar (höft/Icesave/verðtrygging/ESB/bankar) beittir á kpis eftir sögu ákvarðana.
        const qL = quarters - 1, bl2 = {}; for (const bk of ['gengi', 'gengi_endo', 'verdbolga', 'hagvoxtur']) bl2[bk] = BASELINE.outcomes[bk] ? BASELINE.outcomes[bk].path[qL] : null;
        const { states: polStates, since: polSince } = policyStatesMeta(history);
        // F1-V2: stig hverrar ákvörðunar í ÞESSARI lotu (ESB-lífsferill: umsokn→adild, ursogn lotuna sem slökkt er).
        const stages = {}; for (const pid in polStates) { const sg = policyStage(pid, polStates, polSince, game.current_round); if (sg) stages[pid] = sg; }
        // Fasi „fylgi" B2: féll stjórnin síðasta kjörtímabil? → stjórnarkreppa berst yfir (hagvaxtar-drag + lægra byrjunar-fylgi).
        const prev = await env.TENGSL.prepare('SELECT cumulative, kpis FROM leikur_results WHERE game_code=? AND team_id=? AND round=?').bind(code, tm.id, game.current_round - 1).first().catch(() => null);
        let prevFell = false; if (prev && prev.kpis) { try { prevFell = ((JSON.parse(prev.kpis).stability || {}).level === 'revolt'); } catch (e) {} }
        let kpis2 = applyPolicies(kpis, polStates, bl2, stages);
        // F1-V2: framlag hverrar virkrar ákvörðunar á lotuna (diff-aðferð) — vistað → badges/arfleifðar-tölur/graf-pinnar.
        const polDeltas = policyDeltas(kpis, polStates, bl2, stages);
        // Stjórnarkreppa eftir fall: stjórnarmyndun/lömun → dýpra vaxtar-drag + atvinnuleysi↑ + skuldir↑ (glatað traust/tekjur).
        if (prevFell) {
          if (kpis2.hagvoxtur != null) kpis2.hagvoxtur -= 0.6;
          if (kpis2.atvinnuleysi != null) kpis2.atvinnuleysi += 0.4;
          if (kpis2.skuldir != null) kpis2.skuldir += 3;
        }
        // Fasi „skemmtun 3": óvænt atvik (valfrjálst) + liðs-val í klemmu → áhrif á KPI + bein fylgis-breyting.
        const surprise = cfg.surprise ? rollSurprise(code, game.current_round) : null;
        let surprisePop = 0;
        if (surprise) { const sr = applySurprise(kpis2, surprise, (history[game.current_round - 1] || {}).dilemma); kpis2 = sr.kpis; surprisePop = sr.pop; }
        // ÞJÓÐARSÁTTIN: sáttar-áhrif liðsins (leik-lag, ALDREI engine) — EFTIR policies+surprise, FYRIR stöðugleika/stigagjöf;
        // pop bætist við fylgis-leiðréttinguna á sama stað og surprisePop. Stigagjöf ÓBREYTT (áhrifin fara gegnum KPI + fylgi).
        const sattPt = (sattRes && sattRes.perTeam[tm.id]) || null; let sattPop = 0;
        if (sattPt) { const sr = applySatt(kpis2, sattPt.effect); kpis2 = sr.kpis; sattPop = sr.pop; }
        // Fasi E erfiðleikastig: þrengd markmiða-banda + refsingar-skali (kreppa+uppreisn).
        const penFactor = (f) => 1 - (1 - f) * diff.penalty;
        const raw = mandateAt(cfg, game.current_round);
        const roundMandate = { ...scaleMandate(raw, diff.band), crisisFactor: penFactor(raw.crisisFactor) };
        const tMandate = (cfg.roles && cfg.roleMap) ? mandateForRole(roundMandate, roleById(cfg.roleMap[tm.id])) : roundMandate;
        const sc = scoreRound(kpis2, tMandate);
        // Fasi B/fylgi: stjórnar-stöðugleiki — fylgi (þjóðhags-útkoma + BEIN pólitísk vigt ákvarðana + stjórnarkreppa) margfaldar stigin.
        const stab = govtStability(kpis2, policyApproval(polStates) + surprisePop + sattPop + (prevFell ? -8 : 0));
        const roundScore = Math.round(sc.composite * penFactor(stab.factor) * 10) / 10;
        const cumulative = ((prev && prev.cumulative) || 0) + roundScore;
        await env.TENGSL.prepare('INSERT OR REPLACE INTO leikur_results (game_code, round, team_id, kpis, round_score, cumulative) VALUES (?,?,?,?,?,?)')
          .bind(code, game.current_round, tm.id, JSON.stringify({ kpis: kpis2, perKpi: sc.perKpi, crisis: sc.crisis, stability: stab, policies: polStates, stjornarkreppa: prevFell, policyDeltas: polDeltas, policyStages: stages,
            ...(sattPt ? { sattUtkoma: { val: sattPt.val, flokkur: sattRes.flokkur, effect: sattPt.effect, k: sattRes.k, n: sattRes.n } } : {}) }), roundScore, cumulative).run().catch(() => null);   // Þjóðarsáttin: afhjúpunar-gögn per lið (sjá out.sattUtkoma í /state)
      }
      await env.TENGSL.prepare('UPDATE leikur_games SET phase=? WHERE code=?').bind('resolved', code).run().catch(() => null);
      return sjson({ ok: true, phase: 'resolved' });
    }
    return sjson({ error: 'bad-action' }, 400);
  }
  return sjson({ error: 'bad-request' }, 400);
}

// ── Varðveislutakmörkun (gagnalágmörkun, 5. gr. 1. mgr. e-liður GDPR) ──────────────────────────────────────────
// Leikur-gögnin (leikur_games/teams/decisions/results) bera engin notanda-auðkenni (ekkert uid/netfang/nafn) —
// EINA persónugagna-leiðin er frjálst liðsheiti (sjá /join). Þar til þessar reglur komu lifðu leikir að eilífu í D1.
// Tvö tól: (1) leikurPruneOld — vikuleg sjálfvirk grisjun (cron), (2) leikurEraseGame — eyðing eins leiks á beiðni.
// Eyðingarröð per leik (börn fyrst → foreldri síðast, engir FK í D1): results → decisions → teams → games, eitt
// D1-batch (færsla) per leik svo leikur standi aldrei eftir hálf-eyddur ef keyrslan rofnar.
const _changes = (r) => (r && r.meta && typeof r.meta.changes === 'number') ? r.meta.changes : 0;

/** Eyðir EINUM leik (kóða) + öllum tengdum röðum. Skilar {games, teams, decisions, results} = eyddar raðir.
 *  Idempotent: óþekktur kóði → allt 0. Engin fasa-athugun hér — hún er í /erase-endapunktinum (sjá leikurHandler). */
export async function leikurEraseGame(env, code) {
  const c = String(code || '').toUpperCase();
  const out = { games: 0, teams: 0, decisions: 0, results: 0 };
  if (!env || !env.TENGSL || !c) return out;
  const stmts = [
    env.TENGSL.prepare('DELETE FROM leikur_results WHERE game_code=?').bind(c),
    env.TENGSL.prepare('DELETE FROM leikur_decisions WHERE game_code=?').bind(c),
    env.TENGSL.prepare('DELETE FROM leikur_teams WHERE game_code=?').bind(c),
    env.TENGSL.prepare('DELETE FROM leikur_games WHERE code=?').bind(c),
  ];
  let res = null;
  if (typeof env.TENGSL.batch === 'function') res = await env.TENGSL.batch(stmts).catch(() => null);
  if (!res) { res = []; for (const s of stmts) res.push(await s.run().catch(() => null)); } // varaleið án batch (sömu röð)
  out.results = _changes(res[0]); out.decisions = _changes(res[1]); out.teams = _changes(res[2]); out.games = _changes(res[3]);
  return out;
}

/** Vikuleg grisjun: eyðir (a) LOKNUM leikjum (phase='ended') eldri en `days` daga og (b) YFIRGEFNUM leikjum — ekki-ended
 *  (lobby/decide/resolved) en stofnaðir fyrir meira en 2×`days` dögum. Leikur í gangi yngri en 2×days er ALDREI snertur.
 *  `now` = epoch-SEKÚNDUR (sama eining og leikur_games.created); sjálfgefið núna. Keyrir í lotum (≤50 leikir per SELECT)
 *  þar til ekkert finnst; hættir ef lota eyðir engu (ver gegn eilífri lykkju ef D1 hafnar DELETE). Idempotent.
 *  Skilar {games, teams, decisions, results} = samanlagður fjöldi eyddra raða. */
export async function leikurPruneOld(env, { days = 90, now: nowSec } = {}) {
  const out = { games: 0, teams: 0, decisions: 0, results: 0 };
  if (!env || !env.TENGSL) return out;
  const d = Math.max(1, +days || 90);
  const t = (nowSec != null && isFinite(+nowSec)) ? Math.floor(+nowSec) : now();
  const cutEnded = t - d * 86400, cutAbandoned = t - 2 * d * 86400;
  const BATCH = 50;
  for (let guard = 0; guard < 200; guard++) { // ≤10.000 leikir per keyrslu
    const rows = ((await env.TENGSL.prepare("SELECT code FROM leikur_games WHERE (phase='ended' AND created < ?) OR (phase!='ended' AND created < ?) ORDER BY created LIMIT ?")
      .bind(cutEnded, cutAbandoned, BATCH).all().catch(() => ({ results: [] }))).results) || [];
    if (!rows.length) break;
    let gamesThisBatch = 0;
    for (const r of rows) {
      const e = await leikurEraseGame(env, r.code);
      out.games += e.games; out.teams += e.teams; out.decisions += e.decisions; out.results += e.results;
      gamesThisBatch += e.games;
    }
    if (!gamesThisBatch) break; // ekkert eyddist (D1-villa) → ekki snúast í hring
    if (rows.length < BATCH) break;
  }
  return out;
}
