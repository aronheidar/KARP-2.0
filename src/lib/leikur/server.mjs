// Worker-jaðar RÁS-Leiksins: HTTP + HMAC-tákn + D1 + kallar hreinu módúlana.
// Bundlast inn í web/worker.js. crypto.subtle + env.SESSION_SECRET (sama og lotu-kaka worker).
import { DECISIONS, MANDATE, SCENARIO, ROUNDS, mandateFor, difficultyOf, scaleMandate } from './game-config.mjs';
import { resolveTeam, buildInputs } from './resolve.mjs';
import { scoreRound } from './scoring.mjs';
import { buildChain, activeInputsFromInputs } from './chain.mjs';
import { buildAnalytics, teamReview } from './analytics.mjs';
import { validateGameConfig } from './game-validate.mjs';
import { ROLES, mandateForRole, assignRoles, roleById, revealRoles } from './roles.mjs';
import { govtStability } from './flavor.mjs';
import { POLICIES, policyAvailable, policyStates, applyPolicies, policyApproval, POLICY_POP, describePolicies } from './policies.mjs';
import { awardMedals } from './medals.mjs';
import { rollSurprise, applySurprise, dilemmaChoiceLabel } from './surprise.mjs';
import { carryover } from './aftermath.mjs';
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
function gameCfg(game) { let c = {}; try { c = JSON.parse(game.config || '{}'); } catch (e) {} const customMandate = (c.mandate && Array.isArray(c.mandate.kpis)); return { scenario: (c.scenario && Array.isArray(c.scenario.events)) ? c.scenario : SCENARIO, mandate: customMandate ? c.mandate : MANDATE, perRound: !customMandate, rounds: c.rounds || ROUNDS, roles: !!c.roles, roleMap: c.roleMap || null, mode: c.mode === 'studio' ? 'studio' : 'classic', timerSec: (c.timerSec > 0 ? c.timerSec : null), deadline: (c.deadline || null), difficulty: c.difficulty || 'medium', surprise: !!c.surprise }; }
// Fasi A: markmið per kjörtímabil f. sjálfgefna leiki; sérsniðnir leikir halda föstu mandate úr config.
function mandateAt(cfg, round) { return cfg.perRound ? mandateFor(round) : cfg.mandate; }
const LEVER_LABELS = Object.fromEntries(Object.entries(BASELINE.levers).map(([k, v]) => [k, v.label]));
const LEVER_BASE = Object.fromEntries(Object.entries(BASELINE.levers).map(([k, v]) => [k, v.base]));

export async function leikurHandler(request, env, ctx, gameUser = { uid: 0, isAdmin: false, nemandi: false }) {
  if (!env.TENGSL) return sjson({ error: 'no-d1' }, 503);
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/leikur\/?/, '').split('/').filter(Boolean); // [] | ['create'] | ['<code>','join'|'state'|'decisions'|'control']
  const method = request.method;

  // POST /create — aðeins kerfisstjóri (leikstjóri) má stofna leik.
  if (parts[0] === 'create' && method === 'POST') {
    if (!gameUser.isAdmin) return sjson({ error: 'kerfisstjori' }, 403);
    await ensureTables(env);
    const cb = await request.json().catch(() => ({}));
    let config = { rounds: ROUNDS, scenarioId: SCENARIO.id };
    if (cb && cb.scenario && cb.mandate) {
      const v = validateGameConfig({ scenario: cb.scenario, mandate: cb.mandate, rounds: cb.rounds }, BASELINE);
      if (!v.ok) return sjson({ error: 'invalid', errors: v.errors }, 400);
      config = { custom: true, rounds: +cb.rounds, scenario: cb.scenario, mandate: cb.mandate };
    }
    if (cb && cb.roles) config.roles = true;
    if (cb && cb.mode === 'studio') config.mode = 'studio';
    if (cb && +cb.timerSec > 0) config.timerSec = Math.max(30, Math.min(3600, Math.round(+cb.timerSec))); // #3 valfrjáls umferðar-klukka (sek)
    if (cb && ['easy', 'hard'].includes(cb.difficulty)) config.difficulty = cb.difficulty; // Fasi E: erfiðleikastig (medium=sjálfgefið)
    if (cb && cb.surprise) config.surprise = true; // Fasi „skemmtun 3": óvænt atvik + klemmu-spjöld (valfrjálst)
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

  // POST /<code>/join (aðeins í lobby) — nemandi eða kerfisstjóri, innskráð/ur.
  if (action === 'join' && method === 'POST') {
    if (!(gameUser.isAdmin || gameUser.nemandi)) return sjson({ error: 'nemandi' }, 403);
    if (game.phase !== 'lobby') return sjson({ error: 'started' }, 409);
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || '').trim().slice(0, 40) || 'Lið';
    const res = await env.TENGSL.prepare('INSERT INTO leikur_teams (game_code, name, joined) VALUES (?,?,?)').bind(code, name, now()).run().catch(() => null);
    const teamId = res && res.meta ? res.meta.last_row_id : null;
    if (!teamId) return sjson({ error: 'join-failed' }, 500);
    return sjson({ teamId, teamToken: await signToken(env, { code, role: 'team', teamId }) });
  }

  // GET /<code>/state
  if (action === 'state' && method === 'GET') {
    const you = await verifyToken(env, bearer(request));
    const teamsRaw = (await env.TENGSL.prepare('SELECT id, name FROM leikur_teams WHERE game_code=? ORDER BY id').bind(code).all().catch(() => ({ results: [] }))).results || [];
    const resultsRaw = (await env.TENGSL.prepare('SELECT round, team_id, kpis, round_score, cumulative FROM leikur_results WHERE game_code=?').bind(code).all().catch(() => ({ results: [] }))).results || [];
    // uppsafnað per lið (nýjasta cumulative)
    const cum = {}; for (const r of resultsRaw) cum[r.team_id] = Math.max(cum[r.team_id] ?? -1, r.cumulative);
    const ev = cfg.scenario.events[(game.current_round || 1) - 1] || null;
    const teams = teamsRaw.map((t) => ({ id: t.id, name: t.name, cumulative: cum[t.id] ?? 0 }));
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
    out.difficulty = cfg.difficulty; // Fasi E: erfiðleikastig (easy/medium/hard)
    out.leverCap = difficultyOf(cfg.difficulty).leverCap || null; // Pólitískt vald: hámark virkra sleða (Erfitt)
    // Fasi „skemmtun 3": óvænt atvik þessarar umferðar (sama f. öll lið, determinískt). Áhrifa-tölur EKKI sendar (upplifun, ekki uppskrift).
    if (cfg.surprise && game.phase !== 'lobby') {
      const se = rollSurprise(code, game.current_round);
      if (se) out.surprise = { id: se.id, icon: se.icon, title: se.title, text: se.text,
        dilemma: se.dilemma ? { q: se.dilemma.q, options: (se.dilemma.options || []).map((o) => ({ key: o.key, label: o.label })) } : null };
    }
    // #3 Umferðar-klukka: sekúndur eftir (aðeins í decide). Bara sjónrænt — engin þvingun þjóns-megin.
    if (game.phase === 'decide' && cfg.deadline) { out.secondsLeft = Math.max(0, cfg.deadline - now()); out.deadlineTs = cfg.deadline; } // deadline = epoch-sekúndur (algild → stöðug klukka óháð poll/reload)
    // Uppsafnað stig per lið per umferð (áhorfenda-sýn / þróunar-graf). Opinbert (eins og stigatafla).
    out.trajectory = teams.map((t) => ({ teamId: t.id, name: t.name, points: resultsRaw.filter((r) => r.team_id === t.id).sort((a, b) => a.round - b.round).map((r) => ({ round: r.round, value: r.cumulative })) }));
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
      const lockRows = ((await env.TENGSL.prepare('SELECT team_id, locked FROM leikur_decisions WHERE game_code=? AND round=?').bind(code, game.current_round).all().catch(() => ({ results: [] }))).results) || [];
      const lockedOf = {}; for (const lr of lockRows) lockedOf[lr.team_id] = !!lr.locked;
      if (out.you && out.you.role === 'team') out.you.locked = !!lockedOf[out.you.teamId];
      if (you && you.role === 'fac' && you.code === code) out.lockRoster = teamsRaw.map((t) => ({ teamId: t.id, name: t.name, locked: !!lockedOf[t.id] }));
      if (cfg.mode === 'studio' && you && you.role === 'team' && you.code === code) {
        const myRows = ((await env.TENGSL.prepare('SELECT round, decisions FROM leikur_decisions WHERE game_code=? AND team_id=? ORDER BY round').bind(code, you.teamId).all().catch(() => ({ results: [] }))).results) || [];
        const byR = {}; for (const rr of myRows) { try { byR[rr.round] = JSON.parse(rr.decisions || '{}'); } catch (e) {} }
        out.history = []; for (let rr = 1; rr < game.current_round; rr++) out.history.push(byR[rr] || {});
        out.scenarioSoFar = (cfg.scenario.events || []).slice(0, game.current_round);
        // Deilanleg liðs-drög núverandi umferðar (einangruð per team_id) → félagar samstilla sleða.
        out.draft = (byR[game.current_round] || {}).levers || {};
        // Fasi E: stefnu-rofar — núverandi staða (úr fyrri ákvörðunum), drög þessarar umferðar, og hvað er í boði núna.
        const polStates = policyStates(out.history);
        out.policies = { states: polStates, draft: (byR[game.current_round] || {}).policies || {},
          available: POLICIES.filter((p) => policyAvailable(p, game.current_round, polStates)).map((p) => ({ id: p.id, icon: p.icon, label: p.label, kind: p.kind, desc: p.desc, onLabel: p.onLabel, offLabel: p.offLabel, options: p.options, pop: POLICY_POP[p.id] || null })) };
        out.dilemmaDraft = (byR[game.current_round] || {}).dilemma || null; // Fasi „skemmtun 3": deilanlegt klemmu-val liðs
        // Arfleifð: hvernig standandi stórar ákvarðanir + óvænt atvik SÍÐUSTU lotu lita þessa lotu (birt í byrjun lotu ≥2).
        if (game.current_round >= 2) {
          const prevEvent = cfg.surprise ? rollSurprise(code, game.current_round - 1) : null;
          const co = carryover({ policyStates: polStates, prevEvent, prevChoiceKey: (byR[game.current_round - 1] || {}).dilemma });
          if (co) out.carryover = co;
        }
        // Fasi „fylgi" B2: stjórnarkreppa — féll stjórnin síðasta kjörtímabil? (birt sem borði + dýpri byrjun þessa lotu).
        const prevRes = resultsRaw.find((r) => r.team_id === you.teamId && r.round === game.current_round - 1);
        if (prevRes) { try { out.stjornarkreppa = ((JSON.parse(prevRes.kpis).stability || {}).level === 'revolt'); } catch (e) {} }
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
    return sjson(out);
  }

  // POST /<code>/decisions  (team-token)
  if (action === 'decisions' && method === 'POST') {
    const you = await verifyToken(env, bearer(request));
    if (!you || you.role !== 'team' || you.code !== code) return sjson({ error: 'auth' }, 401);
    if (game.phase !== 'decide') return sjson({ error: 'phase' }, 409);
    const b = await request.json().catch(() => ({}));
    if (+b.round !== game.current_round) return sjson({ error: 'round' }, 409);
    await env.TENGSL.prepare('INSERT OR REPLACE INTO leikur_decisions (game_code, round, team_id, decisions, locked, submitted_at) VALUES (?,?,?,?,?,?)')
      .bind(code, game.current_round, you.teamId, JSON.stringify(b.decisions || {}), b.locked ? 1 : 0, now()).run().catch(() => null);
    return sjson({ ok: true });
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
      await env.TENGSL.prepare('UPDATE leikur_games SET config=?, phase=?, current_round=? WHERE code=?').bind(JSON.stringify(cobj), 'decide', 1, code).run().catch(() => null);
      return sjson({ ok: true, phase: 'decide', round: 1 });
    }
    if (act === 'stop') { await env.TENGSL.prepare('UPDATE leikur_games SET phase=? WHERE code=?').bind('ended', code).run().catch(() => null); return sjson({ ok: true, phase: 'ended' }); }
    if (act === 'next') {
      const nr = (game.current_round || 0) + 1;
      if (nr > cfg.rounds) { await env.TENGSL.prepare('UPDATE leikur_games SET phase=? WHERE code=?').bind('ended', code).run().catch(() => null); return sjson({ ok: true, phase: 'ended' }); }
      if (cfg.timerSec) { // #3 endursetja klukku fyrir nýtt kjörtímabil
        let cobj = {}; try { cobj = JSON.parse(game.config || '{}'); } catch (e) {}
        cobj.deadline = now() + cfg.timerSec;
        await env.TENGSL.prepare('UPDATE leikur_games SET config=?, phase=?, current_round=? WHERE code=?').bind(JSON.stringify(cobj), 'decide', nr, code).run().catch(() => null);
      } else {
        await env.TENGSL.prepare('UPDATE leikur_games SET phase=?, current_round=? WHERE code=?').bind('decide', nr, code).run().catch(() => null);
      }
      return sjson({ ok: true, phase: 'decide', round: nr });
    }
    if (act === 'resolve') {
      // idempotent: sleppa ef þegar leyst fyrir þessa umferð
      const done = await env.TENGSL.prepare('SELECT team_id FROM leikur_results WHERE game_code=? AND round=? LIMIT 1').bind(code, game.current_round).first().catch(() => null);
      if (done || game.phase === 'resolved') return sjson({ ok: true, phase: 'resolved' });
      const teams = ((await env.TENGSL.prepare('SELECT id FROM leikur_teams WHERE game_code=? ORDER BY id').bind(code).all().catch(() => ({ results: [] }))).results) || [];
      for (const tm of teams) {
        // öll ákvörðunasaga liðs, umferð 1..current
        const rows = ((await env.TENGSL.prepare('SELECT round, decisions FROM leikur_decisions WHERE game_code=? AND team_id=? ORDER BY round').bind(code, tm.id).all().catch(() => ({ results: [] }))).results) || [];
        const byRound = {}; for (const r of rows) byRound[r.round] = JSON.parse(r.decisions || '{}');
        const history = []; for (let rr = 1; rr <= game.current_round; rr++) history.push(byRound[rr] || {}); // ósend = tómt (óbreytt/engin)
        const diff = difficultyOf(cfg.difficulty);
        const { kpis, quarters } = resolveTeam({ baseline: BASELINE, links: LINKS, history, scenario: cfg.scenario, mode: cfg.mode, shockScale: diff.shock, leverCap: diff.leverCap });
        // Fasi E: stefnu-rofar (höft/Icesave/verðtrygging/ESB/bankar) beittir á kpis eftir sögu ákvarðana.
        const qL = quarters - 1, bl2 = {}; for (const bk of ['gengi', 'gengi_endo', 'verdbolga', 'hagvoxtur']) bl2[bk] = BASELINE.outcomes[bk] ? BASELINE.outcomes[bk].path[qL] : null;
        const polStates = policyStates(history);
        // Fasi „fylgi" B2: féll stjórnin síðasta kjörtímabil? → stjórnarkreppa berst yfir (hagvaxtar-drag + lægra byrjunar-fylgi).
        const prev = await env.TENGSL.prepare('SELECT cumulative, kpis FROM leikur_results WHERE game_code=? AND team_id=? AND round=?').bind(code, tm.id, game.current_round - 1).first().catch(() => null);
        let prevFell = false; if (prev && prev.kpis) { try { prevFell = ((JSON.parse(prev.kpis).stability || {}).level === 'revolt'); } catch (e) {} }
        let kpis2 = applyPolicies(kpis, polStates, bl2);
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
        // Fasi E erfiðleikastig: þrengd markmiða-banda + refsingar-skali (kreppa+uppreisn).
        const penFactor = (f) => 1 - (1 - f) * diff.penalty;
        const raw = mandateAt(cfg, game.current_round);
        const roundMandate = { ...scaleMandate(raw, diff.band), crisisFactor: penFactor(raw.crisisFactor) };
        const tMandate = (cfg.roles && cfg.roleMap) ? mandateForRole(roundMandate, roleById(cfg.roleMap[tm.id])) : roundMandate;
        const sc = scoreRound(kpis2, tMandate);
        // Fasi B/fylgi: stjórnar-stöðugleiki — fylgi (þjóðhags-útkoma + BEIN pólitísk vigt ákvarðana + stjórnarkreppa) margfaldar stigin.
        const stab = govtStability(kpis2, policyApproval(polStates) + surprisePop + (prevFell ? -8 : 0));
        const roundScore = Math.round(sc.composite * penFactor(stab.factor) * 10) / 10;
        const inp = buildInputs(history, { baseline: BASELINE, scenario: cfg.scenario, mode: cfg.mode, shockScale: diff.shock, leverCap: diff.leverCap });
        const chain = buildChain({ baseline: BASELINE, links: LINKS, activeInputs: activeInputsFromInputs(inp, BASELINE), kpiKeys: roundMandate.kpis.map((k) => k.key) });
        const cumulative = ((prev && prev.cumulative) || 0) + roundScore;
        await env.TENGSL.prepare('INSERT OR REPLACE INTO leikur_results (game_code, round, team_id, kpis, round_score, cumulative) VALUES (?,?,?,?,?,?)')
          .bind(code, game.current_round, tm.id, JSON.stringify({ kpis: kpis2, perKpi: sc.perKpi, crisis: sc.crisis, chain, stability: stab, policies: polStates, stjornarkreppa: prevFell }), roundScore, cumulative).run().catch(() => null);
      }
      await env.TENGSL.prepare('UPDATE leikur_games SET phase=? WHERE code=?').bind('resolved', code).run().catch(() => null);
      return sjson({ ok: true, phase: 'resolved' });
    }
    return sjson({ error: 'bad-action' }, 400);
  }
  return sjson({ error: 'bad-request' }, 400);
}
