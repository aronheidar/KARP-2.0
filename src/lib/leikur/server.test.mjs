import { signToken, verifyToken, leikurHandler, leikurPruneOld, leikurEraseGame } from './server.mjs';
// Prófin keyra öll sem kerfisstjóri+leikstjóri (má stofna+ganga inn) — gátt á create/join er leidd í worker-dispatch
// (leikstjoriOf í auth.mjs setur leikstjori/leikstjoriSource/leikstjoriUntil); create krefst leikstjori, join nemandi|isAdmin|leikstjori.
const GU = { uid: 1, isAdmin: true, nemandi: true, leikstjori: true, leikstjoriSource: 'admin', leikstjoriUntil: null };
const LH = (r, e, c, g) => leikurHandler(r, e, c, g || GU);
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// Mock D1: einföld minnistafla sem styður prepare/bind/run/first/all fyrir SQL-in sem server.mjs notar.
function mockD1() {
  const t = { leikur_games: [], leikur_teams: [], leikur_decisions: [], leikur_results: [] };
  let auto = 1;
  const run = (sql, args) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE INDEX')) return { meta: {} };
    if (s.startsWith('INSERT INTO leikur_games')) { t.leikur_games.push({ code: args[0], config: args[1], phase: args[2], current_round: args[3], created: args[4] }); return { meta: {} }; }
    if (s.startsWith('INSERT INTO leikur_teams')) { const id = auto++; t.leikur_teams.push({ id, game_code: args[0], name: args[1], joined: args[2] }); return { meta: { last_row_id: id } }; }
    if (s.startsWith('UPDATE leikur_games SET config=? WHERE')) { const g = t.leikur_games.find((x) => x.code === args[1]); if (g) g.config = args[0]; return { meta: {} }; }   // bot-team: config eitt sér
    if (s.startsWith('UPDATE leikur_games SET config')) { const g = t.leikur_games.find((x) => x.code === args[3]); if (g) { g.config = args[0]; g.phase = args[1]; g.current_round = args[2]; } return { meta: {} }; }
    if (s.startsWith('UPDATE leikur_games SET phase')) { const g = t.leikur_games.find((x) => x.code === args[args.length - 1]); if (g) { g.phase = args[0]; if (args.length === 3) g.current_round = args[1]; } return { meta: {} }; }
    if (s.startsWith('INSERT INTO leikur_decisions') || s.startsWith('INSERT OR REPLACE INTO leikur_decisions')) {
      const key = args[0] + '|' + args[1] + '|' + args[2]; const i = t.leikur_decisions.findIndex((x) => x.game_code + '|' + x.round + '|' + x.team_id === key);
      const row = { game_code: args[0], round: args[1], team_id: args[2], decisions: args[3], locked: args[4], submitted_at: args[5] };
      if (i >= 0) t.leikur_decisions[i] = row; else t.leikur_decisions.push(row); return { meta: {} }; }
    if (s.startsWith('INSERT INTO leikur_results') || s.startsWith('INSERT OR REPLACE INTO leikur_results')) {
      const key = args[0] + '|' + args[1] + '|' + args[2]; const i = t.leikur_results.findIndex((x) => x.game_code + '|' + x.round + '|' + x.team_id === key);
      const row = { game_code: args[0], round: args[1], team_id: args[2], kpis: args[3], round_score: args[4], cumulative: args[5] };
      if (i >= 0) t.leikur_results[i] = row; else t.leikur_results.push(row); return { meta: {} }; }
    if (s.startsWith('DELETE FROM leikur_')) { // varðveislutakmörkun (leikurEraseGame/leikurPruneOld): skilar meta.changes eins og D1
      const tb = s.match(/^DELETE FROM (leikur_\w+)/)[1], col = tb === 'leikur_games' ? 'code' : 'game_code';
      const before = t[tb].length; t[tb] = t[tb].filter((x) => x[col] !== args[0]); return { meta: { changes: before - t[tb].length } }; }
    return { meta: {} };
  };
  const first = (sql, args) => { const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT') && s.includes('FROM leikur_games')) return t.leikur_games.find((x) => x.code === args[0]) || null;
    if (s.includes('FROM leikur_results') && s.includes('team_id=?') && s.includes('round=?')) { const r = t.leikur_results.find((x) => x.game_code === args[0] && x.team_id === args[1] && x.round === args[2]); return r || null; }
    if (s.includes('FROM leikur_results') && s.includes('round=?')) return t.leikur_results.find((x) => x.game_code === args[0] && x.round === args[1]) || null;
    if (s.includes('FROM leikur_decisions') && s.includes('round=?') && s.includes('team_id=?')) return t.leikur_decisions.find((x) => x.game_code === args[0] && x.round === args[1] && x.team_id === args[2]) || null;   // lockBots
    return null; };
  const all = (sql, args) => { const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('FROM leikur_games')) { // leikurPruneOld: (ended AND created<?) OR (!ended AND created<?) ORDER BY created LIMIT ?
      let rows = t.leikur_games.filter((g) => (g.phase === 'ended' && g.created < args[0]) || (g.phase !== 'ended' && g.created < args[1])).slice().sort((a, b) => a.created - b.created);
      if (/LIMIT \?/.test(s)) rows = rows.slice(0, args[2]);
      return { results: rows.map((g) => ({ code: g.code })) }; }
    if (s.includes('FROM leikur_teams')) return { results: t.leikur_teams.filter((x) => x.game_code === args[0]) };
    if (s.includes('FROM leikur_results')) return { results: t.leikur_results.filter((x) => x.game_code === args[0]) };
    if (s.includes('FROM leikur_decisions')) {
      let rows = t.leikur_decisions.filter((x) => x.game_code === args[0]);
      if (/AND round=\?/.test(s)) rows = rows.filter((x) => x.round === args[1]);
      else if (/AND team_id=\?/.test(s)) rows = rows.filter((x) => x.team_id === args[1]);
      return { results: rows.slice().sort((a, b) => a.round - b.round) };
    }
    return { results: [] }; };
  const prep = (sql) => ({ bind: (...args) => ({ run: async () => run(sql, args), first: async () => first(sql, args), all: async () => all(sql, args) }), run: async () => run(sql, []), first: async () => first(sql, []), all: async () => all(sql, []) });
  // D1 batch: keyrir undirbúnar setningar í röð (færsla) og skilar fylki af niðurstöðum — leikurEraseGame notar þetta.
  const batch = async (stmts) => { const r = []; for (const st of stmts) r.push(await st.run()); return r; };
  return { prepare: prep, batch, _t: t };
}
const env = { SESSION_SECRET: 'test-secret-xyz', TENGSL: mockD1() };
const req = (path, body) => new Request('https://karp.is' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
const J = async (res) => JSON.parse(await res.text());

(async () => {
  // tákn roundtrip
  const tk = await signToken(env, { code: 'ABCDE', role: 'fac' });
  ok('token verify roundtrip', (await verifyToken(env, tk)).role === 'fac');
  ok('token tampered → null', (await verifyToken(env, tk.slice(0, -2) + 'xx')) === null);

  // create
  const cr = await J(await LH(req('/api/leikur/create', {}), env));
  ok('create skilar code+facToken', cr.code && cr.facToken);
  const code = cr.code;
  // join
  const jn = await J(await LH(req('/api/leikur/' + code + '/join', { name: 'Lið A' }), env));
  ok('join skilar teamToken+teamId', jn.teamToken && jn.teamId);
  // state (fac)
  const st = await J(await LH(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + cr.facToken } }), env));
  ok('state phase lobby', st.phase === 'lobby');
  ok('state sér 1 lið', st.teams.length === 1 && st.teams[0].name === 'Lið A');
  ok('state hefur mandate + decisions', Array.isArray(st.mandate.kpis) && Array.isArray(st.decisions));
  // ógildur kóði
  ok('óþekktur kóði → 404', (await LH(new Request('https://karp.is/api/leikur/ZZZZZ/state'), env)).status === 404);

  // Task 5: round loop
  const jn2 = await J(await LH(req('/api/leikur/' + code + '/join', { name: 'Lið B' }), env));
  const fac = { headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cr.facToken } };
  const ctrl = (a) => LH(new Request('https://karp.is/api/leikur/' + code + '/control', { method: 'POST', headers: fac.headers, body: JSON.stringify({ action: a }) }), env);
  ok('start → phase decide, round 1', (await J(await ctrl('start'))).phase === 'decide');
  const dec = (tok, obj) => LH(new Request('https://karp.is/api/leikur/' + code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(obj) }), env);
  await dec(jn.teamToken, { round: 1, locked: true, decisions: { peningastefna: 'slaka2', utgjold: 'orvun2', skattar: 'obreytt', fjarfesting: 'innvidir', vidbragd: 'ekkert' } });
  await dec(jn2.teamToken, { round: 1, locked: true, decisions: { peningastefna: 'herda2', utgjold: 'adhald2', skattar: 'haekka2', fjarfesting: 'engin', vidbragd: 'vardsjodur' } });
  ok('resolve → phase resolved', (await J(await ctrl('resolve'))).phase === 'resolved');
  const st2 = await J(await LH(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + cr.facToken } }), env));
  ok('bæði lið hafa cumulative eftir umferð', st2.teams.every((t) => typeof t.cumulative === 'number'));
  ok('liðin fá ÓLÍK stig (ólíkar ákvarðanir)', st2.teams[0].cumulative !== st2.teams[1].cumulative);
  ok('fac /state hefur analytics', st2.analytics && Array.isArray(st2.analytics.scorecard) && Array.isArray(st2.analytics.trajectories.cumulative));
  ok('analytics scorecard raðað (hæsta fyrst)', st2.analytics.scorecard.length >= 2 && st2.analytics.scorecard[0].cumulative >= st2.analytics.scorecard[1].cumulative);
  const teamSt = await J(await LH(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + jn.teamToken } }), env));
  ok('team /state hefur EKKI analytics', !teamSt.analytics);

  // Task S4: custom game create
  const MANDATE = (await import('./game-config.mjs')).MANDATE;
  const custom = { rounds: 2, mandate: JSON.parse(JSON.stringify(MANDATE)),
    scenario: { id: 'custom', events: [
      { round: 1, title: 'Sérsniðið upphaf', text: '', shocks: {}, responses: [{ key: 'a', label: 'Ekkert', effect: {} }] },
      { round: 2, title: 'Sérsniðin kreppa', text: '', shocks: { olia: 40 }, responses: [{ key: 'a', label: 'Bregðast við', effect: { lever: { utgjold: 6 } } }] } ] } };
  const cc = await J(await LH(req('/api/leikur/create', custom), env));
  ok('custom create → code', !!cc.code);
  await LH(req('/api/leikur/' + cc.code + '/join', { name: 'C' }), env);
  await LH(new Request('https://karp.is/api/leikur/' + cc.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cc.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  const cst = await J(await LH(new Request('https://karp.is/api/leikur/' + cc.code + '/state', { headers: { authorization: 'Bearer ' + cc.facToken } }), env));
  ok('custom event birtist í state', cst.event && cst.event.title === 'Sérsniðið upphaf');
  const bad = await LH(req('/api/leikur/create', { rounds: 2, mandate: custom.mandate, scenario: { id: 'x', events: [{ round: 1, title: 'T', shocks: { ekki_til: 5 }, responses: [{ key: 'a', label: 'A', effect: {} }] }] } }), env);
  ok('ógilt custom → 400', bad.status === 400);
  // idempotency: resolve aftur má ekki tvítelja
  const before = st2.teams.map((t) => t.cumulative).join(',');
  await ctrl('resolve');
  const st3 = await J(await LH(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + cr.facToken } }), env));
  ok('resolve idempotent', st3.teams.map((t) => t.cumulative).join(',') === before);

  // Task S5: leynileg hlutverk (roles) — 1-umferðar custom roles-leik svo hægt sé að ná ended
  const rolesBody = { roles: true, rounds: 1, mandate: JSON.parse(JSON.stringify(MANDATE)),
    scenario: { id: 'r', events: [ { round: 1, title: 'T', text: '', shocks: {}, responses: [{ key: 'a', label: 'A', effect: {} }] } ] } };
  const rc = await J(await LH(req('/api/leikur/create', rolesBody), env));
  ok('roles create → code', !!rc.code);
  const rj1 = await J(await LH(req('/api/leikur/' + rc.code + '/join', { name: 'A' }), env));
  const rj2 = await J(await LH(req('/api/leikur/' + rc.code + '/join', { name: 'B' }), env));
  const rFacHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + rc.facToken };
  const rState = (tok) => LH(new Request('https://karp.is/api/leikur/' + rc.code + '/state', { headers: { authorization: 'Bearer ' + tok } }), env);
  await LH(new Request('https://karp.is/api/leikur/' + rc.code + '/control', { method: 'POST', headers: rFacHdr, body: JSON.stringify({ action: 'start' }) }), env);
  const rFacState = await J(await rState(rc.facToken));
  ok('fac /state hefur roleMap (2 lið)', Array.isArray(rFacState.roleMap) && rFacState.roleMap.length === 2);
  const rTeamState = await J(await rState(rj1.teamToken));
  ok('lið /state hefur role', !!(rTeamState.role && rTeamState.role.label));
  ok('lið /state hefur EKKI roleMap (leynd)', !rTeamState.roleMap);
  ok('lið /state umboð með weight-svið', rTeamState.mandate.kpis.some((k) => k.weight != null));
  const rDec = (tok) => LH(new Request('https://karp.is/api/leikur/' + rc.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: 1, locked: true, decisions: { peningastefna: 'obreytt', utgjold: 'obreytt', skattar: 'obreytt', fjarfesting: 'engin', vidbragd: 'a' } }) }), env);
  await rDec(rj1.teamToken); await rDec(rj2.teamToken);
  const rCtrl = (a) => LH(new Request('https://karp.is/api/leikur/' + rc.code + '/control', { method: 'POST', headers: rFacHdr, body: JSON.stringify({ action: a }) }), env);
  await rCtrl('resolve');
  ok('roles: bæði lið skoruð', (await J(await rState(rc.facToken))).teams.every((t) => typeof t.cumulative === 'number'));
  const rEnd = await J(await rCtrl('next'));
  ok('next umfram rounds → ended', rEnd.phase === 'ended');
  const rReveal = await J(await rState(rj1.teamToken));
  ok('lið /state við ended hefur rolesReveal (2)', Array.isArray(rReveal.rolesReveal) && rReveal.rolesReveal.length === 2);
  ok('rolesReveal hefur label+blurb', !!(rReveal.rolesReveal[0].label) && typeof rReveal.rolesReveal[0].blurb === 'string');
  // klassískur leikur (roles off) → engin ný svið
  const cg = await J(await LH(req('/api/leikur/create', {}), env));
  const cgj = await J(await LH(req('/api/leikur/' + cg.code + '/join', { name: 'X' }), env));
  await LH(new Request('https://karp.is/api/leikur/' + cg.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cg.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  ok('klassískur: fac /state EKKI roleMap', !(await J(await LH(new Request('https://karp.is/api/leikur/' + cg.code + '/state', { headers: { authorization: 'Bearer ' + cg.facToken } }), env))).roleMap);
  ok('klassískur: lið /state EKKI role', !(await J(await LH(new Request('https://karp.is/api/leikur/' + cg.code + '/state', { headers: { authorization: 'Bearer ' + cgj.teamToken } }), env))).role);

  // Task Stjórnstöð: studio-hamur + læsa-staða (A) + stop (B)
  const stG = (code, tok) => LH(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + tok } }), env);
  const sc = await J(await LH(req('/api/leikur/create', { mode: 'studio' }), env));
  ok('studio create → code', !!sc.code);
  const sj1 = await J(await LH(req('/api/leikur/' + sc.code + '/join', { name: 'S-Alfa' }), env));
  const sj2 = await J(await LH(req('/api/leikur/' + sc.code + '/join', { name: 'S-Beta' }), env));
  const sFacHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + sc.facToken };
  const sCtrl = (a) => LH(new Request('https://karp.is/api/leikur/' + sc.code + '/control', { method: 'POST', headers: sFacHdr, body: JSON.stringify({ action: a }) }), env);
  await sCtrl('start');
  const sSt1 = await J(await stG(sc.code, sj1.teamToken));
  ok('studio: team /state mode=studio', sSt1.mode === 'studio');
  ok('studio: history tómt í umferð 1', Array.isArray(sSt1.history) && sSt1.history.length === 0);
  ok('studio: scenarioSoFar 1 atburður', Array.isArray(sSt1.scenarioSoFar) && sSt1.scenarioSoFar.length === 1);
  ok('studio: you.locked false fyrir læsingu', sSt1.you && sSt1.you.locked === false);
  // Deilanleg liðs-drög (locked:false) — samstilling + einangrun
  const sDraft = (tok, lev) => LH(new Request('https://karp.is/api/leikur/' + sc.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: 1, locked: false, decisions: { levers: lev } }) }), env);
  await sDraft(sj1.teamToken, { vextir: 9 });
  const sDraftA = await J(await stG(sc.code, sj1.teamToken));
  ok('studio: A /state.draft sýnir A-drög', sDraftA.draft && sDraftA.draft.vextir === 9);
  ok('studio: draft locked:false → you.locked ennþá false', sDraftA.you && sDraftA.you.locked === false);
  const sDraftB = await J(await stG(sc.code, sj2.teamToken));
  ok('studio: B /state.draft TÓMT (einangrun milli liða)', sDraftB.draft && Object.keys(sDraftB.draft).length === 0);
  const sDec = (tok, lev) => LH(new Request('https://karp.is/api/leikur/' + sc.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: 1, locked: true, decisions: { levers: lev } }) }), env);
  await sDec(sj1.teamToken, { vextir: 9.5 });
  await sDec(sj2.teamToken, { vextir: 5 });
  const sSt1b = await J(await stG(sc.code, sj1.teamToken));
  ok('studio: you.locked true eftir læsingu', sSt1b.you && sSt1b.you.locked === true);
  const sFacSt = await J(await stG(sc.code, sc.facToken));
  ok('studio: fac lockRoster 2 lið bæði læst', Array.isArray(sFacSt.lockRoster) && sFacSt.lockRoster.length === 2 && sFacSt.lockRoster.every((r) => r.locked));
  await sCtrl('resolve');
  const sResSt = await J(await stG(sc.code, sc.facToken));
  ok('studio: bæði lið skoruð', sResSt.teams.every((t) => typeof t.cumulative === 'number'));
  ok('studio: /state trajectory per lið (áhorfenda-graf)', Array.isArray(sResSt.trajectory) && sResSt.trajectory.length === 2 && sResSt.trajectory.every((s) => Array.isArray(s.points)) && sResSt.trajectory.some((s) => s.points.length >= 1));
  ok('studio: analytics decisionsTable studio-samantekt', sResSt.analytics && sResSt.analytics.decisionsTable.every((r) => r.studio && typeof r.summary === 'string'));
  await sCtrl('next');
  const sSt2 = await J(await stG(sc.code, sj1.teamToken));
  ok('studio: umferð 2 history 1 (eigin læst umferð 1)', Array.isArray(sSt2.history) && sSt2.history.length === 1 && sSt2.history[0].levers && sSt2.history[0].levers.vextir === 9.5);
  ok('studio: control stop → ended', (await J(await sCtrl('stop'))).phase === 'ended');
  // classic óbreytt: mode classic, engin studio-svið
  const cgS = await J(await LH(req('/api/leikur/create', {}), env));
  const cgSj = await J(await LH(req('/api/leikur/' + cgS.code + '/join', { name: 'Z' }), env));
  await LH(new Request('https://karp.is/api/leikur/' + cgS.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cgS.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  const cgSt = await J(await stG(cgS.code, cgSj.teamToken));
  ok('classic: mode=classic + engin history/scenarioSoFar', cgSt.mode === 'classic' && cgSt.history === undefined && cgSt.scenarioSoFar === undefined);

  // #3 Umferðar-klukka: timerSec → secondsLeft í decide; engin klukka → undefined
  const tg = await J(await LH(req('/api/leikur/create', { timerSec: 120 }), env));
  const tFacHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + tg.facToken };
  await LH(req('/api/leikur/' + tg.code + '/join', { name: 'T' }), env);
  await LH(new Request('https://karp.is/api/leikur/' + tg.code + '/control', { method: 'POST', headers: tFacHdr, body: JSON.stringify({ action: 'start' }) }), env);
  const tSt = await J(await LH(new Request('https://karp.is/api/leikur/' + tg.code + '/state', { headers: { authorization: 'Bearer ' + tg.facToken } }), env));
  ok('klukka: secondsLeft sett í decide (~120)', typeof tSt.secondsLeft === 'number' && tSt.secondsLeft > 100 && tSt.secondsLeft <= 120);
  // Vörn gegn einingavillu: deadlineTs = epoch-SEKÚNDUR (algild), ~120s frá núna (EKKI 120000).
  ok('klukka: deadlineTs epoch-sek, ~120s eftir (ekki ms-eining)', typeof tSt.deadlineTs === 'number' && tSt.deadlineTs > 1e9 && (tSt.deadlineTs - Math.floor(Date.now() / 1000)) > 100 && (tSt.deadlineTs - Math.floor(Date.now() / 1000)) <= 121);
  ok('engin klukka: secondsLeft undefined', cgSt.secondsLeft === undefined);
  // Klukka klippt í [30,3600]
  const tg2 = await J(await LH(req('/api/leikur/create', { timerSec: 5 }), env));
  await LH(req('/api/leikur/' + tg2.code + '/join', { name: 'T' }), env);
  await LH(new Request('https://karp.is/api/leikur/' + tg2.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tg2.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  const tSt2 = await J(await LH(new Request('https://karp.is/api/leikur/' + tg2.code + '/state', { headers: { authorization: 'Bearer ' + tg2.facToken } }), env));
  ok('klukka: 5s klippt upp í ≥30', tSt2.secondsLeft >= 29);

  // Fasi „skemmtun 3": óvænt atvik + klemmu-val. Búum til studio-leik með surprise þar til kóði fær atvik í umferð 2.
  const { rollSurprise } = await import('./surprise.mjs');
  let xg = null, xEv = null;
  for (let i = 0; i < 40 && !xEv; i++) { const g = await J(await LH(req('/api/leikur/create', { mode: 'studio', surprise: true }), env)); const e = rollSurprise(g.code, 2); if (e && e.dilemma) { xg = g; xEv = e; } }
  ok('fann surprise-leik með klemmu í umferð 2', !!xEv);
  if (xEv) {
    const xHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + xg.facToken };
    const xj1 = await J(await LH(req('/api/leikur/' + xg.code + '/join', { name: 'X-Alfa' }), env));
    const xj2 = await J(await LH(req('/api/leikur/' + xg.code + '/join', { name: 'X-Beta' }), env));
    const xCtrl = (a) => LH(new Request('https://karp.is/api/leikur/' + xg.code + '/control', { method: 'POST', headers: xHdr, body: JSON.stringify({ action: a }) }), env);
    const xStG = (tok) => LH(new Request('https://karp.is/api/leikur/' + xg.code + '/state', { headers: { authorization: 'Bearer ' + tok } }), env);
    const xDec = (tok, dec) => LH(new Request('https://karp.is/api/leikur/' + xg.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: (dec.round || 1), locked: true, decisions: dec }) }), env);
    // Umferð 1: engin surprise (round<2 skilar null)
    await xCtrl('start');
    const x1 = await J(await xStG(xj1.teamToken));
    ok('surprise: engin atvik í umferð 1', x1.surprise === undefined);
    ok('badges: tómt fylki í lotu 1 (engin staðfest ákvörðun)', Array.isArray(x1.policyBadges) && x1.policyBadges.length === 0);
    await xDec(xj1.teamToken, { round: 1, levers: { vextir: 8 }, policies: { verdtrygging: true } }); await xDec(xj2.teamToken, { round: 1, levers: { vextir: 6 } });
    await xCtrl('resolve'); await xCtrl('next');
    // Umferð 2: atvik birtist í /state með klemmu; F1-V2: áhrifa-tölur (effect) SENDAR MEÐ — meðvituð stefnubreyting
    const x2 = await J(await xStG(xj1.teamToken));
    ok('surprise: atvik birtist í umferð 2', x2.surprise && x2.surprise.id === xEv.id && x2.surprise.title === xEv.title);
    ok('surprise: effect atviksins fylgir payload (F1-V2)', JSON.stringify(x2.surprise.effect) === JSON.stringify(xEv.effect));
    ok('surprise: klemmu-kostir bera effect-tölur (F1-V2)', x2.surprise.dilemma && Array.isArray(x2.surprise.dilemma.options) && x2.surprise.dilemma.options.every((o) => o.effect && typeof o.effect === 'object') && JSON.stringify(x2.surprise.dilemma.options[0].effect) === JSON.stringify(xEv.dilemma.options[0].effect));
    ok('badges: staðfest verðtrygging með stage+sinceRound+deltas úr lotu 1', (() => { const b = (x2.policyBadges || []).find((x) => x.id === 'verdtrygging'); return b && b.stage === 'virk' && b.sinceRound === 1 && b.deltas && b.deltas.kaupmattur >= 0.3; })());
    // Lið velja SITT hvorn klemmu-kost → ólík fylgis-/KPI-áhrif → ólík stig. Lið A sækir líka um ESB (F1-V2 lífsferill;
    // gluggasía from:4 er client-hlið — server les söguna beint, dugar til að prófa umsokn→adild).
    const opts = xEv.dilemma.options;
    await xDec(xj1.teamToken, { round: 2, levers: { vextir: 8 }, dilemma: opts[0].key, policies: { esb: true } });
    await xDec(xj2.teamToken, { round: 2, levers: { vextir: 8 }, dilemma: (opts[1] || opts[0]).key });
    // klemmu-drög samstillast innan liðs (out.dilemmaDraft)
    const xd = await J(await xStG(xj1.teamToken));
    ok('surprise: klemmu-drög liðs samstillt (dilemmaDraft)', xd.dilemmaDraft === opts[0].key);
    ok('badges: drög ÞESSARAR decide-lotu (esb) birtast EKKI — aðeins staðfestar', xd.policyBadges.some((b) => b.id === 'verdtrygging') && !xd.policyBadges.some((b) => b.id === 'esb'));
    await xCtrl('resolve');
    const xRes = await J(await xStG(xg.facToken));
    ok('surprise: bæði lið skoruð eftir atvik+klemmu', xRes.teams.every((t) => typeof t.cumulative === 'number'));
    // F1-V2: resolve vistar policyDeltas + policyStages í results-detail; esb tekin í lotu 2 → stage umsokn (vægt drag eitt)
    const xr1 = (xRes.results || []).find((r) => r.teamId === xj1.teamId);
    ok('resolve vistar policyDeltas (verðtrygging með tölur)', xr1 && xr1.detail.policyDeltas && xr1.detail.policyDeltas.verdtrygging && typeof xr1.detail.policyDeltas.verdtrygging.kaupmattur === 'number');
    ok('resolve vistar policyStages: esb=umsokn í töku-lotu, verðtrygging=virk', xr1.detail.policyStages && xr1.detail.policyStages.esb === 'umsokn' && xr1.detail.policyStages.verdtrygging === 'virk');
    ok('umsokn-lota: esb-delta AÐEINS vægt drag {hagvoxtur:-0.1}', JSON.stringify(xr1.detail.policyDeltas.esb) === JSON.stringify({ hagvoxtur: -0.1 }));
    // Leikstjóra-samantekt: klemmu-viðbrögð beggja liða
    const dbt = xRes.analytics && xRes.analytics.dilemmasByTeam;
    ok('surprise: leikstjóra-samantekt með klemmu-viðbrögð beggja liða', Array.isArray(dbt) && dbt.length === 2 && dbt.every((t) => t.items.some((it) => it.round === 2 && it.title === xEv.title)));
    ok('surprise: samantekt sýnir rétt val liðs A', dbt && dbt.some((t) => t.items.find((it) => it.round === 2).choice === opts[0].label));
    // F3-V3: kort + eventChoices — opinbert (án tákns) strax eftir uppgjör lotu 2
    const xPub = await J(await LH(new Request('https://karp.is/api/leikur/' + xg.code + '/state'), env));
    ok('kort: opinbert án tákns, 2 lið, nýjasta uppgjör (lota 2)', Array.isArray(xPub.kort) && xPub.kort.length === 2 && xPub.kort.every((k) => k.round === 2));
    ok('kort: ber kpis-undirmengið (byggd/fiskur/losun tölur) + policies', xPub.kort.every((k) => typeof k.kpis.byggdajofnudur === 'number' && typeof k.kpis.fiskistofn === 'number' && typeof k.kpis.losun === 'number' && k.policies && typeof k.policies === 'object'));
    ok('kort: verðtrygging liðs A í policies (kortThrep-inntak)', (() => { const k = xPub.kort.find((x) => x.teamId === xj1.teamId); return k && k.policies.verdtrygging === true; })());
    ok('eventChoices: val beggja liða úr leystu lotunni 2', xPub.eventChoices && xPub.eventChoices[xj1.teamId] && xPub.eventChoices[xj1.teamId][xEv.id] === opts[0].key && xPub.eventChoices[xj2.teamId][xEv.id] === (opts[1] || opts[0]).key);
    // Arfleifð: í umferð 3 sér liðið hvernig fyrri ákvarðanir (verðtrygging) + atvik umferðar 2 lita lotuna
    await xCtrl('next');
    const x3 = await J(await xStG(xj1.teamToken));
    // F3-V3: í decide-fasa lotu 3 sýnir kortið áfram SÍÐASTA uppgjör (lotu 2) — lotan í gangi telur ekki
    ok('kort: decide-fasi sýnir síðasta uppgjör (round=2)', Array.isArray(x3.kort) && x3.kort.length === 2 && x3.kort.every((k) => k.round === 2));
    ok('eventChoices: decide-fasi telur EKKI lotuna í gangi (val lotu 2 stendur)', x3.eventChoices && x3.eventChoices[xj1.teamId][xEv.id] === opts[0].key);
    ok('arfleifð: carryover sent í umferð 3', !!x3.carryover);
    ok('arfleifð: standandi ákvörðun (verðtrygging) með', x3.carryover.policies.some((p) => p.id === 'verdtrygging' && p.text.length > 10));
    ok('arfleifð: fyrra atvik (umferð 2) tilgreint með texta', x3.carryover.event && x3.carryover.event.id === xEv.id && x3.carryover.event.text.length > 10);
    // F1-V2: badge-lífsferill + arfleifðar-tölur í lotu 3
    ok('badges: esb stage=adild lotuna EFTIR umsókn, sinceRound=2', (() => { const b = x3.policyBadges.find((x) => x.id === 'esb'); return b && b.stage === 'adild' && b.sinceRound === 2; })());
    ok('badges: deltas úr síðustu geymdu lotu (esb: umsóknar-dragið −0.1)', (() => { const b = x3.policyBadges.find((x) => x.id === 'esb'); return b && b.deltas && b.deltas.hagvoxtur === -0.1; })());
    ok('arfleifð ber deltas á policy-röð (F1-V2)', (() => { const p = x3.carryover.policies.find((x) => x.id === 'verdtrygging'); return p && p.deltas && typeof p.deltas.kaupmattur === 'number'; })());
    // Lota 3 leyst → esb nú á adild-stigi í geymslu með FULL áhrif (skuldir −2)
    await xDec(xj1.teamToken, { round: 3, levers: { vextir: 8 } }); await xDec(xj2.teamToken, { round: 3, levers: { vextir: 8 } });
    await xCtrl('resolve');
    const xRes3 = await J(await xStG(xg.facToken));
    const xr3 = (xRes3.results || []).find((r) => r.teamId === xj1.teamId);
    ok('adild-lota: policyStages esb=adild og delta ber skuldir −2', xr3 && xr3.detail.policyStages.esb === 'adild' && xr3.detail.policyDeltas.esb && xr3.detail.policyDeltas.esb.skuldir === -2);
    // F3-V3: kort fylgir nýjasta uppgjöri (lota 3) og esb-staða liðs A komin í kort-policies
    ok('kort: uppfærist í lotu 3 eftir resolve', Array.isArray(xRes3.kort) && xRes3.kort.every((k) => k.round === 3) && (() => { const k = xRes3.kort.find((x) => x.teamId === xj1.teamId); return k && !!k.policies.esb; })());
    // GALLI H: raunveruleg úrsögn — lið A dregur umsóknina til baka í lotu 4 → uppgjör vistar stage 'ursogn'
    // + deltas höggsins, og lotan á eftir sýnir badge „úrsögn í ferli" + arfleifðar-röð (var ósýnilegt alls staðar).
    await xCtrl('next');
    await xDec(xj1.teamToken, { round: 4, levers: { vextir: 8 }, policies: { esb: false } });
    await xDec(xj2.teamToken, { round: 4, levers: { vextir: 8 } });
    await xCtrl('resolve');
    const xRes4 = await J(await xStG(xg.facToken));
    const xr4 = (xRes4.results || []).find((r) => r.teamId === xj1.teamId);
    ok('H: ursogn-lota vistar policyStages.esb=ursogn', xr4 && xr4.detail.policyStages.esb === 'ursogn');
    ok('H: ursogn-lota vistar deltas höggsins {hagvoxtur:-0.4, verdbolga:0.3}', xr4 && xr4.detail.policyDeltas.esb && xr4.detail.policyDeltas.esb.hagvoxtur === -0.4 && xr4.detail.policyDeltas.esb.verdbolga === 0.3);
    await xCtrl('next');
    const x5 = await J(await xStG(xj1.teamToken));
    ok('H: badge stage=ursogn m. deltas lotuna EFTIR úrsögnina', (() => { const b = (x5.policyBadges || []).find((x) => x.id === 'esb'); return b && b.stage === 'ursogn' && b.deltas && b.deltas.hagvoxtur === -0.4; })());
    ok('H: carryover fær röð um úrsögnina m. texta+deltas', (() => { const p = x5.carryover && x5.carryover.policies.find((x) => x.id === 'esb'); return p && p.text.length > 10 && p.deltas && p.deltas.verdbolga === 0.3; })());
    // ... og lotu SÍÐAR er úrsagnar-badge horfinn (höggið er einskiptis)
    await xDec(xj1.teamToken, { round: 5, levers: { vextir: 8 } }); await xDec(xj2.teamToken, { round: 5, levers: { vextir: 8 } });
    await xCtrl('resolve'); await xCtrl('next');
    const x6 = await J(await xStG(xj1.teamToken));
    ok('H: enginn esb-badge tveimur lotum eftir úrsögn', !(x6.policyBadges || []).some((b) => b.id === 'esb'));
    // classic/án surprise → aldrei out.surprise
    ok('án surprise-flaggs: engin surprise í state', cgSt.surprise === undefined);
  }

  // GALLI E: leikstjóri stöðvar leik í MIÐRI decide-lotu ('stop' setur phase=ended ÁN resolve) →
  // klemmu-val óuppgerðu lotunnar má EKKI teljast í eventChoices (kortið sýndi annars tákn fyrir val sem aldrei var beitt).
  let eg = null, eEv = null;
  for (let i = 0; i < 60 && !eEv; i++) { const g = await J(await LH(req('/api/leikur/create', { mode: 'studio', surprise: true }), env)); const e = rollSurprise(g.code, 2); if (e && e.dilemma) { eg = g; eEv = e; } }
  ok('E: fann surprise-leik með klemmu í umferð 2', !!eEv);
  if (eEv) {
    const eHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + eg.facToken };
    const ej = await J(await LH(req('/api/leikur/' + eg.code + '/join', { name: 'E-lið' }), env));
    const eCtrl = (a) => LH(new Request('https://karp.is/api/leikur/' + eg.code + '/control', { method: 'POST', headers: eHdr, body: JSON.stringify({ action: a }) }), env);
    const eDec = (round, dec) => LH(new Request('https://karp.is/api/leikur/' + eg.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ej.teamToken }, body: JSON.stringify({ round, locked: true, decisions: dec }) }), env);
    await eCtrl('start');
    await eDec(1, { levers: { vextir: 8 } });
    await eCtrl('resolve'); await eCtrl('next');
    await eDec(2, { levers: { vextir: 8 }, dilemma: eEv.dilemma.options[0].key });   // val skráð í lotu 2 — EN lotan verður aldrei leyst
    await eCtrl('stop');   // ended án resolve
    const eSt = await J(await LH(new Request('https://karp.is/api/leikur/' + eg.code + '/state'), env));
    ok('E: phase ended eftir stop í miðri lotu', eSt.phase === 'ended');
    ok('E: eventChoices telur EKKI val úr óuppgerðri stöðvunar-lotu', eSt.eventChoices && eSt.eventChoices[ej.teamId] && eSt.eventChoices[ej.teamId][eEv.id] === undefined);
    ok('E: kort stendur á síðasta UPPGJÖRI (lota 1)', Array.isArray(eSt.kort) && eSt.kort.every((k) => k.round === 1));
  }

  // F1-V4: kpiHistory + decisionMarks — 2 lotur, esb tekin í lotu 1 → mark „ESB: umsókn" í réttri lotu.
  const ug = await J(await LH(req('/api/leikur/create', { mode: 'studio' }), env));
  const uj1 = await J(await LH(req('/api/leikur/' + ug.code + '/join', { name: 'U-Alfa' }), env));
  const uj2 = await J(await LH(req('/api/leikur/' + ug.code + '/join', { name: 'U-Beta' }), env));
  const uHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + ug.facToken };
  const uCtrl = (a) => LH(new Request('https://karp.is/api/leikur/' + ug.code + '/control', { method: 'POST', headers: uHdr, body: JSON.stringify({ action: a }) }), env);
  const uStG = (tok) => LH(new Request('https://karp.is/api/leikur/' + ug.code + '/state', { headers: { authorization: 'Bearer ' + tok } }), env);
  const uDec = (tok, round, dec) => LH(new Request('https://karp.is/api/leikur/' + ug.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round, locked: true, decisions: dec }) }), env);
  ok('kpiHistory: EKKI sent í lobby', (await J(await uStG(ug.facToken))).kpiHistory === undefined);
  await uCtrl('start');
  // lota 1: lið A tekur esb (server les söguna beint — gluggasían from:4 er client-hlið, sbr. surprise-prófið)
  await uDec(uj1.teamToken, 1, { levers: { vextir: 8 }, policies: { esb: true } });
  await uDec(uj2.teamToken, 1, { levers: { vextir: 6 } });
  await uCtrl('resolve'); await uCtrl('next');
  await uDec(uj1.teamToken, 2, { levers: { vextir: 8 } });
  await uDec(uj2.teamToken, 2, { levers: { vextir: 6 } });
  await uCtrl('resolve');
  const uSt = await J(await uStG(ug.facToken));
  ok('kpiHistory: 2 lið × 2 lotur eftir 2 leystar', Array.isArray(uSt.kpiHistory) && uSt.kpiHistory.length === 2 && uSt.kpiHistory.every((t) => t.rounds.length === 2 && t.name));
  ok('kpiHistory: hver lota ber AÐEINS KPI-in 6 (þjappað; atvinnuleysi f. ticker-fyrirsagnir)', uSt.kpiHistory.every((t) => t.rounds.every((r) => ['verdbolga', 'hagvoxtur', 'kaupmattur', 'skuldir', 'losun', 'atvinnuleysi'].every((k) => typeof r[k] === 'number') && Object.keys(r).length === 7)));
  const uMarksA = (uSt.decisionMarks || []).filter((m) => m.teamId === uj1.teamId);
  ok('decisionMarks: esb-markið í lotu 1 með „ESB: umsókn"+stage', uMarksA.length === 1 && uMarksA[0].id === 'esb' && uMarksA[0].round === 1 && uMarksA[0].label === 'ESB: umsókn' && uMarksA[0].stage === 'umsokn' && uMarksA[0].icon === '🇪🇺');
  ok('decisionMarks: EKKERT tvítekið mark í lotu 2 (adild=óbreytt val) og B markalaust', !uMarksA.some((m) => m.round === 2) && !(uSt.decisionMarks || []).some((m) => m.teamId === uj2.teamId));
  const uTeamSt = await J(await uStG(uj1.teamToken));
  ok('kpiHistory: lið sér líka öll lið (opinbert eins og stigatafla)', Array.isArray(uTeamSt.kpiHistory) && uTeamSt.kpiHistory.length === 2 && Array.isArray(uTeamSt.decisionMarks));
  // F3-V3: kort sent líka ÁN surprise-flaggs; eventChoices AÐEINS með surprise (engin atvik → ekkert svið)
  ok('kort: sent í leik án surprise (2 lið, lota 2)', Array.isArray(uTeamSt.kort) && uTeamSt.kort.length === 2 && uTeamSt.kort.every((k) => k.round === 2));
  ok('eventChoices: EKKI sent án surprise-flaggs', uTeamSt.eventChoices === undefined);
  const lg = await J(await LH(req('/api/leikur/create', {}), env));
  const lgSt = await J(await LH(new Request('https://karp.is/api/leikur/' + lg.code + '/state', { headers: { authorization: 'Bearer ' + lg.facToken } }), env));
  ok('kort/eventChoices: EKKI sent í lobby', lgSt.kort === undefined && lgSt.eventChoices === undefined);

  // VERK 1c: politikFerill í leikslok (studio) — reiknað þjóns-megin úr ákvörðunum + geymdri policy-stöðu.
  // Opinbert (án tákns) eins og stigatafla, AÐEINS í ended-fasa og AÐEINS í studio-ham.
  const pgame = await J(await LH(req('/api/leikur/create', { mode: 'studio' }), env));
  const pj1 = await J(await LH(req('/api/leikur/' + pgame.code + '/join', { name: 'P-Vinstri' }), env));
  const pj2 = await J(await LH(req('/api/leikur/' + pgame.code + '/join', { name: 'P-Hægri' }), env));
  const pHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + pgame.facToken };
  const pCtrl = (a) => LH(new Request('https://karp.is/api/leikur/' + pgame.code + '/control', { method: 'POST', headers: pHdr, body: JSON.stringify({ action: a }) }), env);
  const pDec = (tok, lev) => LH(new Request('https://karp.is/api/leikur/' + pgame.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: 1, locked: true, decisions: { levers: lev } }) }), env);
  await pCtrl('start');
  await pDec(pj1.teamToken, { skattar: 15, fjarmagnstekjuskattur: 15 });    // skýr vinstri-blanda (vigtir −2/−3 fullnýttar)
  await pDec(pj2.teamToken, { skattar: -15, fjarmagnstekjuskattur: -10 });  // skýr hægri-blanda (skattalækkanir í botn)
  const pMid = await J(await LH(new Request('https://karp.is/api/leikur/' + pgame.code + '/state', { headers: { authorization: 'Bearer ' + pgame.facToken } }), env));
  ok('politikFerill: EKKI sent fyrir leikslok', pMid.politikFerill === undefined);
  await pCtrl('resolve'); await pCtrl('stop');
  const pEnd = await J(await LH(new Request('https://karp.is/api/leikur/' + pgame.code + '/state'), env));   // án tákns — opinbert í leikslok
  ok('politikFerill: sent í leikslok, 2 lið með nafn+ferill (1 leyst lota)', Array.isArray(pEnd.politikFerill) && pEnd.politikFerill.length === 2 && pEnd.politikFerill.every((t) => t.name && Array.isArray(t.ferill) && t.ferill.length === 1));
  const pfA = (pEnd.politikFerill || []).find((t) => t.teamId === pj1.teamId), pfB = (pEnd.politikFerill || []).find((t) => t.teamId === pj2.teamId);
  ok('politikFerill: skattahækkanir → vinstri (stig ≤ −25, round 1)', !!pfA && pfA.ferill[0].round === 1 && pfA.ferill[0].flokkur === 'vinstri' && pfA.ferill[0].stig <= -25);
  ok('politikFerill: skattalækkanir → hægri (stig ≥ 25)', !!pfB && pfB.ferill[0].flokkur === 'haegri' && pfB.ferill[0].stig >= 25);
  ok('politikFerill: EKKI í klassískum ended-leik', (await J(await rState(rc.facToken))).politikFerill === undefined);

  // ── Leikstjóra-entitlement (Verk A): create krefst leikstjori (ekki lengur isAdmin), join leyfir leikstjóra, GET /me ──
  const UNTIL = Math.floor(Date.now() / 1000) + 30 * 86400;
  const svcUser = { uid: 42, isAdmin: false, nemandi: false, leikstjori: true, leikstjoriSource: 'service', leikstjoriUntil: UNTIL };   // keypt 'leikur'-áskrift
  const plainUser = { uid: 43, isAdmin: false, nemandi: false, leikstjori: false, leikstjoriSource: null, leikstjoriUntil: null };
  const nemUser = { uid: 44, isAdmin: false, nemandi: true, leikstjori: false, leikstjoriSource: null, leikstjoriUntil: null };
  const anon = { uid: 0, isAdmin: false, nemandi: false, leikstjori: false };
  const eCreate = await LH(req('/api/leikur/create', {}), env, null, svcUser);
  const eCr = await J(eCreate);
  ok('entitlement: create m/ leikstjori:true (ekki admin) → 200 + code+facToken', eCreate.status === 200 && !!eCr.code && !!eCr.facToken);
  const eDeny = await LH(req('/api/leikur/create', {}), env, null, plainUser);
  ok('entitlement: create m/ leikstjori:false → 403 leikstjori', eDeny.status === 403 && (await J(eDeny)).error === 'leikstjori');
  const eDenyNem = await LH(req('/api/leikur/create', {}), env, null, nemUser);
  ok('entitlement: nemandi án leikstjóra-leyfis má EKKI stofna (403 leikstjori)', eDenyNem.status === 403 && (await J(eDenyNem)).error === 'leikstjori');
  const eDenyAdminless = await LH(req('/api/leikur/create', {}), env, null, { uid: 1, isAdmin: true, nemandi: true, leikstjori: false });
  ok('entitlement: gáttin les leikstjori-sviðið (isAdmin án leikstjori → 403)', eDenyAdminless.status === 403);
  const eJoin = await LH(req('/api/leikur/' + eCr.code + '/join', { name: 'Leikstjóra-lið' }), env, null, svcUser);
  ok('entitlement: leikstjóri (ekki admin/nemandi) má join-a eigin leik', eJoin.status === 200 && !!(await J(eJoin)).teamToken);
  const eJoinNem = await LH(req('/api/leikur/' + eCr.code + '/join', { name: 'Nemandi' }), env, null, nemUser);
  ok('entitlement: nemandi má join-a leik leikstjóra', eJoinNem.status === 200 && !!(await J(eJoinNem)).teamId);
  const eJoinPlain = await LH(req('/api/leikur/' + eCr.code + '/join', { name: 'X' }), env, null, plainUser);
  ok('entitlement: venjulegur notandi má EKKI join-a (403 nemandi)', eJoinPlain.status === 403 && (await J(eJoinPlain)).error === 'nemandi');
  const eJoinAnon = await LH(req('/api/leikur/' + eCr.code + '/join', { name: 'X' }), env, null, anon);
  ok('entitlement: óinnskráður má EKKI join-a (403)', eJoinAnon.status === 403);
  const meReq = () => new Request('https://karp.is/api/leikur/me');
  const meSvc = await J(await LH(meReq(), env, null, svcUser));
  ok('/me (service-leikstjóri): leikstjori:true, source service, until=ISO úr sub_service', meSvc.leikstjori === true && meSvc.source === 'service' && meSvc.until === new Date(UNTIL * 1000).toISOString() && meSvc.isAdmin === false && meSvc.nemandi === false && meSvc.loggedIn === true);
  const meAdm = await J(await LH(meReq(), env, null, GU));
  ok('/me (kerfisstjóri): leikstjori:true, source admin, until null, isAdmin+nemandi', meAdm.leikstjori === true && meAdm.source === 'admin' && meAdm.until === null && meAdm.isAdmin === true && meAdm.nemandi === true);
  const meFree = await J(await LH(meReq(), env, null, { uid: 7, isAdmin: false, nemandi: false, leikstjori: true, leikstjoriSource: 'free', leikstjoriUntil: null }));
  ok('/me (frí-aðgangur): source free', meFree.leikstjori === true && meFree.source === 'free' && meFree.until === null);
  const mePlain = await J(await LH(meReq(), env, null, plainUser));
  ok('/me (innskráður án leyfis): leikstjori:false, source null, until null, loggedIn true', mePlain.leikstjori === false && mePlain.source === null && mePlain.until === null && mePlain.loggedIn === true);
  const meNem = await J(await LH(meReq(), env, null, nemUser));
  ok('/me (nemandi): leikstjori:false en nemandi:true', meNem.leikstjori === false && meNem.nemandi === true);
  const meAnonRes = await LH(meReq(), env, null, anon);
  const meAnon = await J(meAnonRes);
  ok('/me (uid=0): 200 + leikstjori:false, allt null/false', meAnonRes.status === 200 && meAnon.leikstjori === false && meAnon.isAdmin === false && meAnon.nemandi === false && meAnon.until === null && meAnon.source === null && meAnon.loggedIn === false);
  ok('/me (sjálfgefinn gameUser): leikstjori:false', (await J(await leikurHandler(meReq(), env, null))).leikstjori === false);
  ok('/me er GET-aðeins: POST /me → EKKI me-svar (fellur á not-found)', (await LH(new Request('https://karp.is/api/leikur/me', { method: 'POST' }), env, null, svcUser)).status === 404);

  // ── Æfingalið (bot-team, server-hluti verks B): fac-tákn-gætt, aðeins lobby, idempotent, þjónninn læsir {} sjálfkrafa ──
  {
    const bc = await J(await LH(req('/api/leikur/create', {}), env, null, svcUser));
    const bfac = { 'content-type': 'application/json', authorization: 'Bearer ' + bc.facToken };
    const bpost = (path, body, hdr) => LH(new Request('https://karp.is/api/leikur/' + bc.code + path, { method: 'POST', headers: hdr || bfac, body: JSON.stringify(body || {}) }), env, null, plainUser);
    const bstate = async (tok) => J(await LH(new Request('https://karp.is/api/leikur/' + bc.code + '/state', { headers: { authorization: 'Bearer ' + tok } }), env, null, plainUser));
    const noTok = await bpost('/bot-team', { name: 'X' }, { 'content-type': 'application/json' });
    ok('bot-team: án fac-tákns → 401 auth', noTok.status === 401 && (await J(noTok)).error === 'auth');
    const tmTok = (await J(await LH(req('/api/leikur/' + bc.code + '/join', { name: 'Raun-lið' }), env, null, nemUser))).teamToken;
    const teamTry = await bpost('/bot-team', {}, { 'content-type': 'application/json', authorization: 'Bearer ' + tmTok });
    ok('bot-team: liðs-tákn dugar EKKI (401)', teamTry.status === 401);
    const otherFac = await signToken(env, { code: 'ZZZZZ', role: 'fac' });
    ok('bot-team: fac-tákn ANNARS leiks → 401', (await bpost('/bot-team', {}, { 'content-type': 'application/json', authorization: 'Bearer ' + otherFac })).status === 401);
    const b1r = await bpost('/bot-team', { name: 'Æfingalið (sjálfvirkt)' });
    const b1 = await J(b1r);
    ok('bot-team: fac-tákn → 200 + teamId + bot:true, EKKERT teamToken', b1r.status === 200 && b1.teamId > 0 && b1.bot === true && b1.teamToken === undefined);
    const b2 = await J(await bpost('/bot-team', { name: 'Annað' }));
    ok('bot-team: idempotent — annað kall skilar sama teamId (existing)', b2.teamId === b1.teamId && b2.existing === true);
    const stL = await bstate(bc.facToken);
    ok('state: bot-lið merkt bot:true, raun-lið ekki', stL.teams.length === 2 && stL.teams.find((t) => t.id === b1.teamId).bot === true && stL.teams.find((t) => t.id !== b1.teamId).bot === undefined);
    ok('start → phase decide', (await J(await bpost('/control', { action: 'start' }))).phase === 'decide');
    const stD = await bstate(bc.facToken);
    const rosterBot = stD.lockRoster.find((r) => r.teamId === b1.teamId), rosterReal = stD.lockRoster.find((r) => r.teamId !== b1.teamId);
    ok('lockRoster: bot ✅ locked + bot:true, raun-lið ⏳', rosterBot && rosterBot.locked === true && rosterBot.bot === true && rosterReal && rosterReal.locked === false);
    const botRow = env.TENGSL._t.leikur_decisions.find((d) => d.game_code === bc.code && d.round === 1 && d.team_id === b1.teamId);
    ok('bot-ákvörðun í D1 = {} + locked=1 (óbreytt drög)', botRow && botRow.decisions === '{}' && botRow.locked === 1);
    ok('bot-team eftir start → 409 started', (await bpost('/bot-team', {})).status === 409);
    ok('resolve með bot-lið → resolved', (await J(await bpost('/control', { action: 'resolve' }))).phase === 'resolved');
    const stR = await bstate(bc.facToken);
    ok('bot-lið fær niðurstöðu (óbreytt Ísland) + raun-lið líka', stR.results && stR.results.length === 2 && stR.results.some((r) => r.teamId === b1.teamId));
    ok('next → lota 2', (await J(await bpost('/control', { action: 'next' }))).round === 2);
    const r2 = env.TENGSL._t.leikur_decisions.find((d) => d.game_code === bc.code && d.round === 2 && d.team_id === b1.teamId);
    ok('lota 2: bot læst strax við next', r2 && r2.locked === 1 && r2.decisions === '{}');
    // handvirk ÓLÆST drög bot-liðs í lotu 3 (áður en next keyrir lockBots) → haldast en læsast
    env.TENGSL._t.leikur_decisions.push({ game_code: bc.code, round: 3, team_id: b1.teamId, decisions: '{"levers":{"styrivextir":1}}', locked: 0, submitted_at: 1 });
    await bpost('/control', { action: 'resolve' });
    await bpost('/control', { action: 'next' });
    const r3 = env.TENGSL._t.leikur_decisions.find((d) => d.game_code === bc.code && d.round === 3 && d.team_id === b1.teamId);
    ok('lockBots varðveitir fyrirliggjandi drög bot-liðs en læsir þau', r3 && r3.locked === 1 && r3.decisions === '{"levers":{"styrivextir":1}}');
    const plainSt = await J(await LH(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + cr.facToken } }), env));
    ok('bakvirkni: eldri leikur án config.bots → engin bot-merki á liðum', plainSt.teams.every((t) => t.bot === undefined));
  }

  // ── VERK A: varðveislutakmörkun — leikurPruneOld (vikul. grisjun) + leikurEraseGame / POST /<code>/erase ──
  {
    const DAY = 86400, T = 1_800_000_000; // fast „núna" (epoch-sek) svo prófið sé óháð klukku
    const penv = { SESSION_SECRET: 'test-secret-xyz', TENGSL: mockD1() };
    const tt = penv.TENGSL._t;
    // Beinar raðir (án handler) — 6 leikir með ólíka fasa/aldur, hver með 2 lið, 2 ákvarðanir, 1 uppgjör.
    const seed = (code, phase, ageDays) => {
      tt.leikur_games.push({ code, config: '{}', phase, current_round: phase === 'lobby' ? 0 : 1, created: T - ageDays * DAY });
      const t1 = tt.leikur_teams.length + 1; tt.leikur_teams.push({ id: t1, game_code: code, name: 'Jón og Gunna', joined: 1 }, { id: t1 + 1, game_code: code, name: 'Lið 2', joined: 1 });
      tt.leikur_decisions.push({ game_code: code, round: 1, team_id: t1, decisions: '{}', locked: 1, submitted_at: 1 }, { game_code: code, round: 1, team_id: t1 + 1, decisions: '{}', locked: 1, submitted_at: 1 });
      tt.leikur_results.push({ game_code: code, round: 1, team_id: t1, kpis: '{}', round_score: 1, cumulative: 1 });
    };
    seed('OLDEN', 'ended', 91);     // lokið, >90 d  → eytt
    seed('NEWEN', 'ended', 10);     // lokið, <90 d  → haldið
    seed('OLDRN', 'decide', 181);   // í gangi, >180 d (yfirgefinn) → eytt
    seed('MIDRN', 'decide', 100);   // í gangi, 90<d<180 → HALDIÐ (aldrei snert yngri en 2×days)
    seed('OLDLB', 'lobby', 181);    // aldrei byrjaður, >180 d → eytt
    seed('MIDRS', 'resolved', 179); // í gangi, <180 d → haldið
    const rowsOf = (code) => ({ g: tt.leikur_games.filter((x) => x.code === code).length, t: tt.leikur_teams.filter((x) => x.game_code === code).length, d: tt.leikur_decisions.filter((x) => x.game_code === code).length, r: tt.leikur_results.filter((x) => x.game_code === code).length });
    const p1 = await leikurPruneOld(penv, { days: 90, now: T });
    ok('prune: talning {games:3, teams:6, decisions:6, results:3}', p1.games === 3 && p1.teams === 6 && p1.decisions === 6 && p1.results === 3);
    ok('prune: ended+gamall (91 d) → eytt (allar 4 töflur)', JSON.stringify(rowsOf('OLDEN')) === JSON.stringify({ g: 0, t: 0, d: 0, r: 0 }));
    ok('prune: ended+nýr (10 d) → haldið', JSON.stringify(rowsOf('NEWEN')) === JSON.stringify({ g: 1, t: 2, d: 2, r: 1 }));
    ok('prune: í gangi + >2×days (181 d) → eytt (yfirgefinn)', JSON.stringify(rowsOf('OLDRN')) === JSON.stringify({ g: 0, t: 0, d: 0, r: 0 }));
    ok('prune: í gangi + <2×days (100 d) → haldið', JSON.stringify(rowsOf('MIDRN')) === JSON.stringify({ g: 1, t: 2, d: 2, r: 1 }));
    ok('prune: lobby aldrei byrjaður + >2×days → eytt', rowsOf('OLDLB').g === 0 && rowsOf('OLDLB').t === 0);
    ok('prune: resolved 179 d → haldið (mörkin eru ströng <)', rowsOf('MIDRS').g === 1 && rowsOf('MIDRS').t === 2);
    ok('prune: engar munaðarlausar raðir eftir (teams/decisions/results vísa allar á lifandi leik)', [...tt.leikur_teams, ...tt.leikur_decisions, ...tt.leikur_results].every((x) => tt.leikur_games.some((g) => g.code === x.game_code)));
    const p2 = await leikurPruneOld(penv, { days: 90, now: T });
    ok('prune: idempotent — önnur keyrsla eyðir engu', p2.games === 0 && p2.teams === 0 && p2.decisions === 0 && p2.results === 0 && tt.leikur_games.length === 3);
    // days-stikinn virkar: days=5 → NEWEN (10 d, ended) fellur líka; MIDRN (100 d, í gangi) > 2×5 → fellur; MIDRS (179) líka
    const p3 = await leikurPruneOld(penv, { days: 5, now: T });
    ok('prune: days=5 → ended 10 d + yfirgefnir >10 d eyðast', p3.games === 3 && tt.leikur_games.length === 0);
    // sjálfgefið now (klukkan) + days=90: nýr leikur (created=núna) helst; án TENGSL → 0
    tt.leikur_games.push({ code: 'FRESH', config: '{}', phase: 'ended', current_round: 1, created: Math.floor(Date.now() / 1000) });
    const p4 = await leikurPruneOld(penv);
    ok('prune: sjálfgefið now+days=90 → nýlokinn leikur helst', p4.games === 0 && tt.leikur_games.length === 1);
    ok('prune: án D1 → allt 0 (engin villa)', JSON.stringify(await leikurPruneOld({})) === JSON.stringify({ games: 0, teams: 0, decisions: 0, results: 0 }));
    // >BATCH (50) leikir í einni keyrslu → lotast þar til allt er farið (FRESH fjarlægður fyrst: T er fast framtíðar-„núna")
    tt.leikur_games.length = 0;
    for (let i = 0; i < 120; i++) tt.leikur_games.push({ code: 'B' + String(i).padStart(4, '0'), config: '{}', phase: 'ended', current_round: 1, created: T - 200 * DAY });
    const p5 = await leikurPruneOld(penv, { days: 90, now: T });
    ok('prune: 120 gamlir leikir → allir eyddir í lotum (>50)', p5.games === 120 && tt.leikur_games.length === 0);
    // varaleið án batch (D1-mock án batch-falls) gefur sömu niðurstöðu
    const nb = { SESSION_SECRET: 'x', TENGSL: { prepare: penv.TENGSL.prepare, _t: tt } };
    tt.leikur_games.push({ code: 'NOBAT', config: '{}', phase: 'ended', current_round: 1, created: T - 200 * DAY });
    tt.leikur_teams.push({ id: 999, game_code: 'NOBAT', name: 'X', joined: 1 });
    const eNb = await leikurEraseGame(nb, 'NOBAT');
    ok('erase: varaleið án batch → sama talning', eNb.games === 1 && eNb.teams === 1 && !tt.leikur_games.some((g) => g.code === 'NOBAT'));
    ok('erase: óþekktur kóði → allt 0 (idempotent)', JSON.stringify(await leikurEraseGame(penv, 'NOPE1')) === JSON.stringify({ games: 0, teams: 0, decisions: 0, results: 0 }));

    // ── POST /<code>/erase um handler: fac-gátt + fasa-gátt ──
    const eenv = { SESSION_SECRET: 'test-secret-xyz', TENGSL: mockD1() };
    const et = eenv.TENGSL._t;
    const mk = async () => { const c = await J(await LH(req('/api/leikur/create', {}), eenv)); const j = await J(await LH(req('/api/leikur/' + c.code + '/join', { name: 'Lið Jóns' }), eenv)); return { ...c, teamToken: j.teamToken }; };
    const epost = (code, hdrTok, body) => LH(new Request('https://karp.is/api/leikur/' + code + '/erase', { method: 'POST', headers: hdrTok ? { authorization: 'Bearer ' + hdrTok } : {}, body: JSON.stringify(body || {}) }), eenv);
    const ectrl = (g, a) => LH(new Request('https://karp.is/api/leikur/' + g.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + g.facToken }, body: JSON.stringify({ action: a }) }), eenv);
    const g1 = await mk();
    ok('erase: án tákns → 401 auth', (await epost(g1.code, null)).status === 401);
    ok('erase: liðs-tákn → 401', (await epost(g1.code, g1.teamToken)).status === 401);
    ok('erase: fac-tákn ANNARS leiks → 401', (await epost(g1.code, await signToken(eenv, { code: 'ZZZZZ', role: 'fac' }))).status === 401);
    const r1 = await epost(g1.code, g1.facToken);
    const r1b = await J(r1);
    ok('erase: lobby + fac → 200 + talning', r1.status === 200 && r1b.ok === true && r1b.erased.games === 1 && r1b.erased.teams === 1);
    ok('erase: leikurinn horfinn úr D1 (games+teams)', !et.leikur_games.some((g) => g.code === g1.code) && !et.leikur_teams.some((x) => x.game_code === g1.code));
    ok('erase: /state eftir eyðingu → 404', (await LH(new Request('https://karp.is/api/leikur/' + g1.code + '/state'), eenv)).status === 404);
    ok('erase: annað erase-kall á sama kóða → 404 (idempotent)', (await epost(g1.code, g1.facToken)).status === 404);
    // leikur í gangi (decide) → 409; resolved → 409; ended → 200 og ÖLL tengd gögn (ákvarðanir+uppgjör) fara
    const g2 = await mk();
    await ectrl(g2, 'start');
    const r2 = await epost(g2.code, g2.facToken);
    ok('erase: í gangi (decide) → 409 running', r2.status === 409 && (await J(r2)).error === 'running');
    await LH(new Request('https://karp.is/api/leikur/' + g2.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + g2.teamToken }, body: JSON.stringify({ round: 1, locked: true, decisions: { levers: { vextir: 9 } } }) }), eenv);
    await ectrl(g2, 'resolve');
    ok('erase: resolved → 409 running', (await epost(g2.code, g2.facToken)).status === 409);
    ok('erase: 409 snerti ekkert (leikur+lið+ákvörðun+uppgjör enn til)', et.leikur_games.some((g) => g.code === g2.code) && et.leikur_decisions.some((d) => d.game_code === g2.code) && et.leikur_results.some((d) => d.game_code === g2.code));
    const g3 = await mk(); // annar leikur í lobby — má EKKI hverfa þegar g2 er eytt
    await ectrl(g2, 'stop');
    const r3 = await epost(g2.code, g2.facToken);
    const r3b = await J(r3);
    ok('erase: ended → 200, talning {games:1,teams:1,decisions:1,results:1}', r3.status === 200 && r3b.erased.games === 1 && r3b.erased.teams === 1 && r3b.erased.decisions === 1 && r3b.erased.results === 1);
    ok('erase: ákvarðanir+uppgjör g2 horfin, g3 ósnertur', !et.leikur_decisions.some((d) => d.game_code === g2.code) && !et.leikur_results.some((d) => d.game_code === g2.code) && et.leikur_games.some((g) => g.code === g3.code) && et.leikur_teams.some((x) => x.game_code === g3.code));
    ok('erase: GET /<code>/erase → ekki meðhöndlað (400 bad-request)', (await LH(new Request('https://karp.is/api/leikur/' + g3.code + '/erase', { headers: { authorization: 'Bearer ' + g3.facToken } }), eenv)).status === 400);
  }

  // ── GAGNATÖF „hagstjórn í þoku" (config.thoka): þjóns-megin síun á /state LIÐS í decide — thokaAttir/thokaSia + handler ──
  {
    const { thokaAttir, thokaSia } = await import('./server.mjs');
    const { GOAL_SPECS } = await import('./game-config.mjs');
    // thokaAttir (hreint): áttir m. þröskuldum (%: 0,15 · vísitala: 1) + vs_markmid (target/max/min, innan = innan bands)
    const at = thokaAttir(
      { verdbolga: 4.0, hagvoxtur: 1.9, atvinnuleysi: 3.0, losun: 104.5, fiskistofn: 99.0, kaupmattur: 2.0, skuldir: 41 },
      { verdbolga: 3.0, hagvoxtur: 2.0, atvinnuleysi: 5.0, losun: 104.0, fiskistofn: 101.0, kaupmattur: 2.1 },
      [GOAL_SPECS.verdbolga, GOAL_SPECS.atvinnuleysi, GOAL_SPECS.hagvoxtur, GOAL_SPECS.fiskistofn, GOAL_SPECS.losun]);
    ok('thokaAttir: %-stærð Δ+1,0 → upp; Δ−0,1 (<0,15) → stodugt; Δ−2 → nidur', at.verdbolga.att === 'upp' && at.hagvoxtur.att === 'stodugt' && at.atvinnuleysi.att === 'nidur');
    ok('thokaAttir: vísitala Δ+0,5 (<1) → stodugt; Δ−2 → nidur', at.losun.att === 'stodugt' && at.fiskistofn.att === 'nidur');
    ok('thokaAttir: vs_markmid target yfir (4,0 vs 2,5±0,8) · max innan (3,0 ≤ 4,0+0,6) · min innan (1,9 ≥ 2,2−0,6) · min undir (99 < 101−1)', at.verdbolga.vs_markmid === 'yfir' && at.atvinnuleysi.vs_markmid === 'innan' && at.hagvoxtur.vs_markmid === 'innan' && at.fiskistofn.vs_markmid === 'undir');
    ok('thokaAttir: max yfir (losun 104,5 > 94+2) · KPI utan goalSpecs → vs_markmid null · KPI án N-2 → att null', at.losun.vs_markmid === 'yfir' && at.kaupmattur.vs_markmid === null && at.skuldir.att === null && at.skuldir.vs_markmid === null);
    ok('thokaAttir: ENGAR tölur í svarinu (aðeins att/vs_markmid-strengir)', Object.values(at).every((x) => Object.keys(x).length === 2 && ['upp', 'nidur', 'stodugt', null].includes(x.att) && ['yfir', 'undir', 'innan', null].includes(x.vs_markmid)));
    ok('thokaAttir: goalSpecs sem kort + opts.visitolur yfirtekur þröskuld', (() => { const r = thokaAttir({ verdbolga: 2.6 }, { verdbolga: 2.0 }, { verdbolga: GOAL_SPECS.verdbolga }, { visitolur: new Set(['verdbolga']) }); return r.verdbolga.att === 'stodugt' && r.verdbolga.vs_markmid === 'innan'; })());
    ok('thokaAttir: prevKpis vantar → null; prevPrev null → allar áttir null', thokaAttir(null, {}, []) === null && thokaAttir({ verdbolga: 3 }, null, []).verdbolga.att === null);
    // thokaSia (hreint): síað AFRIT — inntak ósnert, annarra liða kpiHistory aðeins stig, N-2 klipping, áhrif falin
    const sOut = { phase: 'decide', round: 3, kpiHistory: [{ teamId: 1, name: 'A', rounds: [{ round: 1, verdbolga: 1.11 }, { round: 2, verdbolga: 2.22 }] }, { teamId: 2, name: 'B', rounds: [{ round: 1, verdbolga: 3.33 }, { round: 2, verdbolga: 4.44 }] }],
      kort: [{ teamId: 1, round: 2, kpis: { losun: 102.5, fiskistofn: 99.5, byggdajofnudur: 98.5 }, policies: { esb: true } }, { teamId: 2, round: 2, kpis: { losun: 103.5, fiskistofn: 99.5, byggdajofnudur: 98.5 }, policies: {} }],
      policyBadges: [{ id: 'verdtrygging', deltas: { kaupmattur: 0.77 } }], carryover: { policies: [{ id: 'verdtrygging', text: 't', deltas: { kaupmattur: 0.77 } }], event: null },
      surprise: { id: 'e', title: 'T', effect: { verdbolga: 0.9 }, dilemma: { q: 'Q', options: [{ key: 'a', label: 'A', effect: { skuldir: 1 } }] } }, finalPerKpi: [{ key: 'verdbolga', value: 2.22 }], medals: [{ icon: 'x' }] };
    const sRows = [
      { round: 1, teamId: 1, d: { kpis: { verdbolga: 1.11, losun: 101.5, fiskistofn: 100.5, byggdajofnudur: 99.5 }, perKpi: [{ key: 'verdbolga', value: 1.11 }], policyDeltas: { verdtrygging: { kaupmattur: 0.55 } }, stability: { approval: 61, level: 'stable' }, policies: { verdtrygging: true } }, roundScore: 80, cumulative: 80 },
      { round: 2, teamId: 1, d: { kpis: { verdbolga: 2.22, losun: 102.5 }, perKpi: [{ key: 'verdbolga', value: 2.22 }], policyDeltas: { verdtrygging: { kaupmattur: 0.77 } }, stability: { approval: 25, level: 'revolt' } }, roundScore: 50, cumulative: 130 },
      { round: 1, teamId: 2, d: { kpis: { verdbolga: 3.33, losun: 103 } }, roundScore: 70, cumulative: 70 },
      { round: 2, teamId: 2, d: { kpis: { verdbolga: 4.44 } }, roundScore: 60, cumulative: 130 }];
    const sBefore = JSON.stringify(sOut);
    const sS = thokaSia(sOut, { teamId: 1, round: 3, rows: sRows, goalSpecs: [GOAL_SPECS.verdbolga] });
    ok('thokaSia: inntakið ÓSNERT (hreint afrit)', JSON.stringify(sOut) === sBefore);
    ok('thokaSia: eigið kpiHistory klippt við N-2 m. tof+birtLota; annað lið AÐEINS round/score/cumulative', (() => { const a = sS.kpiHistory.find((t) => t.teamId === 1), b = sS.kpiHistory.find((t) => t.teamId === 2); return a.tof === true && a.birtLota === 1 && a.rounds.length === 1 && a.rounds[0].verdbolga === 1.11 && b.adeinsStig === true && b.rounds.length === 2 && b.rounds[1].score === 60 && b.rounds[1].cumulative === 130 && b.rounds.every((r) => r.verdbolga === undefined); })());
    ok('thokaSia: kort → uppgjör N-2 beggja liða (tof), N-1 tölur horfnar', sS.kort.length === 2 && sS.kort.every((k) => k.round === 1 && k.tof === true) && sS.kort.find((k) => k.teamId === 1).kpis.losun === 101.5 && sS.kort.find((k) => k.teamId === 2).kpis.losun === 103 && sS.kort.find((k) => k.teamId === 2).kpis.fiskistofn === null);
    ok('thokaSia: badge-deltas = N-2 (0,55) m. deltaLota 1; carryover deltas null + thoka:true', sS.policyBadges[0].deltas.kaupmattur === 0.55 && sS.policyBadges[0].deltaLota === 1 && sS.policyBadges[0].tof === true && sS.carryover.thoka === true && sS.carryover.policies[0].deltas === null && sS.carryover.policies[0].text === 't');
    ok('thokaSia: surprise effect + kosta-effect FALIN (null), atvikið sjálft sést', sS.surprise.effect === null && sS.surprise.thoka === true && sS.surprise.title === 'T' && sS.surprise.dilemma.options[0].effect === null && sS.surprise.dilemma.options[0].label === 'A');
    ok('thokaSia: finalPerKpi → N-2 perKpi; medals reiknuð (fylki)', sS.finalPerKpi.length === 1 && sS.finalPerKpi[0].value === 1.11 && Array.isArray(sS.medals));
    ok('thokaSia: thoka-blokk — birtLota 1, birtAr 2000, attir upp (1,11→2,22), vs_markmid innan (2,22 vs 2,5±0,8), fyrirsagnir, stodugleiki (fell), stig lotu 2', sS.thoka.on === true && sS.thoka.birtLota === 1 && sS.thoka.birtAr === 2000 && sS.thoka.attir.verdbolga.att === 'upp' && sS.thoka.attir.verdbolga.vs_markmid === 'innan' && Array.isArray(sS.thoka.fyrirsagnir) && sS.thoka.stodugleiki.approval === 25 && sS.thoka.stodugleiki.fell === true && sS.thoka.stig.lota === 2 && sS.thoka.stig.roundScore === 50);
    ok('thokaSia: N-1 tölurnar (2,22 / 4,44 / 0,77 / 0,9) hvergi í síaða svarinu', !/2\.22|4\.44|0\.77|0\.9\b/.test(JSON.stringify(sS)));
    const sS2 = thokaSia({ phase: 'decide', round: 2, kpiHistory: [{ teamId: 1, name: 'A', rounds: [{ round: 1, verdbolga: 1.11 }] }], kort: [{ teamId: 1, round: 1, kpis: {}, policies: {} }], finalPerKpi: [{ value: 1.11 }], medals: [] }, { teamId: 1, round: 2, rows: sRows.filter((r) => r.round === 1), goalSpecs: [] });
    ok('thokaSia lota 2 (ekkert N-2): kpiHistory tómt+tof, kort tómt, attir/birtLota null, finalPerKpi [], en fyrirsagnir+stodugleiki+stig úr lotu 1', sS2.kpiHistory[0].rounds.length === 0 && sS2.kpiHistory[0].tof === true && sS2.kort.length === 0 && sS2.thoka.attir === null && sS2.thoka.birtLota === null && sS2.finalPerKpi.length === 0 && Array.isArray(sS2.thoka.fyrirsagnir) && sS2.thoka.stodugleiki.approval === 61 && sS2.thoka.stig.lota === 1 && !/1\.11/.test(JSON.stringify(sS2)));
    // WATCH (teamId:null): ekkert „eigið lið" → ÖLL lið adeinsStig, kort N-2 allra, surprise-áhrif falin, thoka-blokk aðeins {on,birtLota,birtAr}
    const wOut = { phase: 'decide', round: 3, kpiHistory: sOut.kpiHistory, kort: sOut.kort, surprise: sOut.surprise, trajectory: [{ teamId: 1, points: [{ round: 1, value: 80 }, { round: 2, value: 130 }] }], decisionMarks: [{ teamId: 1, round: 2, id: 'esb', label: 'ESB' }] };
    const wBefore = JSON.stringify(wOut);
    const sW = thokaSia(wOut, { teamId: null, round: 3, rows: sRows, goalSpecs: [GOAL_SPECS.verdbolga] });
    ok('thokaSia watch (teamId null): inntak ósnert; ÖLL lið adeinsStig {round,score,cumulative}, ekkert tof/birtLota-lið', JSON.stringify(wOut) === wBefore && sW.kpiHistory.length === 2 && sW.kpiHistory.every((t) => t.adeinsStig === true && t.tof === undefined && t.rounds.length === 2 && t.rounds.every((r) => r.verdbolga === undefined && typeof r.score === 'number' && typeof r.cumulative === 'number')));
    ok('thokaSia watch: kort → N-2 beggja (tof), surprise effect+kosta-effect null, trajectory/decisionMarks ÓSNERT', sW.kort.length === 2 && sW.kort.every((k) => k.round === 1 && k.tof === true) && sW.kort.find((k) => k.teamId === 1).kpis.losun === 101.5 && sW.surprise.effect === null && sW.surprise.dilemma.options[0].effect === null && JSON.stringify(sW.trajectory) === JSON.stringify(wOut.trajectory) && JSON.stringify(sW.decisionMarks) === JSON.stringify(wOut.decisionMarks));
    ok('thokaSia watch: thoka = {on, birtLota 1, birtAr 2000} + attir/fyrirsagnir/stodugleiki/stig null; finalPerKpi/medals EKKI bætt við; N-1 tölur hvergi', sW.thoka.on === true && sW.thoka.birtLota === 1 && sW.thoka.birtAr === 2000 && sW.thoka.attir === null && sW.thoka.fyrirsagnir === null && sW.thoka.stodugleiki === null && sW.thoka.stig === null && sW.finalPerKpi === undefined && sW.medals === undefined && !/2\.22|4\.44|0\.9\b|1\.11/.test(JSON.stringify(sW)));
    const sW2 = thokaSia({ phase: 'decide', round: 2, kpiHistory: [{ teamId: 1, name: 'A', rounds: [{ round: 1, verdbolga: 1.11 }] }], kort: [{ teamId: 1, round: 1, kpis: {}, policies: {} }] }, { round: 2, rows: sRows.filter((r) => r.round === 1) });
    ok('thokaSia watch lota 2 (teamId sleppt = null, ekkert N-2): adeinsStig × 1, kort [], birtLota null, engin hrun', sW2.kpiHistory[0].adeinsStig === true && sW2.kpiHistory[0].rounds.length === 1 && sW2.kort.length === 0 && sW2.thoka.birtLota === null && sW2.thoka.stig === null && !/1\.11/.test(JSON.stringify(sW2)));

    // Handler: þoku-leikur (studio+surprise+thoka) — finna kóða með klemmu í lotu 2 (eins og surprise-prófið)
    let tg = null, tEv = null;
    for (let i = 0; i < 60 && !tEv; i++) { const g = await J(await LH(req('/api/leikur/create', { mode: 'studio', surprise: true, thoka: true }), env)); const e = rollSurprise(g.code, 2); if (e && e.dilemma) { tg = g; tEv = e; } }
    ok('þoka: fann þoku-leik með klemmu í lotu 2', !!tEv);
    // create-validering: aðeins skýrt já kveikir
    const tOff1 = await J(await LH(req('/api/leikur/create', { thoka: 'nei' }), env)), tOff2 = await J(await LH(req('/api/leikur/create', {}), env));
    ok('þoka: create thoka:"nei"/sleppt → thokaOn false í lobby-state', (await J(await stG(tOff1.code, tOff1.facToken))).thokaOn === false && (await J(await stG(tOff2.code, tOff2.facToken))).thokaOn === false);
    if (tEv) {
      const tHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + tg.facToken };
      const tj1 = await J(await LH(req('/api/leikur/' + tg.code + '/join', { name: 'Þ-Alfa' }), env));
      const tj2 = await J(await LH(req('/api/leikur/' + tg.code + '/join', { name: 'Þ-Beta' }), env));
      const tCtrl = (a) => LH(new Request('https://karp.is/api/leikur/' + tg.code + '/control', { method: 'POST', headers: tHdr, body: JSON.stringify({ action: a }) }), env);
      const tSt = async (tok) => J(await LH(new Request('https://karp.is/api/leikur/' + tg.code + '/state', { headers: tok ? { authorization: 'Bearer ' + tok } : {} }), env));
      const tDec = (tok, round, dec) => LH(new Request('https://karp.is/api/leikur/' + tg.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round, locked: true, decisions: dec }) }), env);
      // Djúp leit: þekkjanlegar KPI-tölur (ekki heiltölur, ≥5 tákn) úr uppgjöri → mega EKKI finnast sem tölu-tókn í JSON-strengnum
      const kpiNums = (kpis) => Object.values(kpis || {}).filter((v) => typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) && String(Math.abs(v)).replace('.', '').length >= 5);
      const leaks = (obj, nums, excl = new Set()) => { const js = JSON.stringify(obj); return nums.filter((v) => !excl.has(v) && new RegExp('(^|[^0-9.\\-])' + String(v).replace(/[.+-]/g, (m) => '\\' + m) + '(?=$|[^0-9])').test(js)); };
      ok('þoka: lobby fac-state thokaOn true, engin thoka-blokk', (await tSt(tg.facToken)).thokaOn === true && (await tSt(tg.facToken)).thoka === undefined);
      await tCtrl('start');
      const t1 = await tSt(tj1.teamToken);
      ok('þoka lota 1 decide: thoka-blokk án hagtalna (birtLota/attir/fyrirsagnir/stodugleiki/stig null), kpiHistory ekki til', t1.thokaOn === true && t1.thoka && t1.thoka.on === true && t1.thoka.birtLota === null && t1.thoka.attir === null && t1.thoka.fyrirsagnir === null && t1.thoka.stodugleiki === null && t1.thoka.stig === null && t1.kpiHistory === undefined);
      await tDec(tj1.teamToken, 1, { levers: { vextir: 9 }, policies: { verdtrygging: true } });
      await tDec(tj2.teamToken, 1, { levers: { vextir: 5 } });
      await tCtrl('resolve');
      const tRes1 = await tSt(tg.facToken);
      const r1A = (tRes1.results || []).find((r) => r.teamId === tj1.teamId), r1B = (tRes1.results || []).find((r) => r.teamId === tj2.teamId);
      const n1 = [...kpiNums(r1A.detail.kpis), ...kpiNums(r1B.detail.kpis)];
      ok('þoka: uppgjör lotu 1 (fac) hefur hörðu tölurnar (≥20 þekkjanlegar)', n1.length >= 20);
      const t1r = await tSt(tj1.teamToken);
      ok('þoka results-fasi lotu 1 (lið): ÓSÍAÐ — results m. kpis, kpiHistory full, engin thoka-blokk', t1r.phase === 'resolved' && t1r.results && t1r.results.length === 2 && typeof t1r.results[0].detail.kpis.verdbolga === 'number' && t1r.kpiHistory.every((t) => t.rounds.length === 1 && typeof t.rounds[0].verdbolga === 'number') && t1r.thoka === undefined && leaks(t1r, n1).length === n1.length);
      await tCtrl('next');
      const t2 = await tSt(tj1.teamToken);
      ok('þoka lota 2 decide: ENGIN KPI-tala lotu 1 í liðs-state (djúp leit)', leaks(t2, n1).length === 0);
      ok('þoka lota 2: eigið kpiHistory tómt+tof (ekkert N-2), hitt liðið adeinsStig {round,score,cumulative}', (() => { const a = t2.kpiHistory.find((t) => t.teamId === tj1.teamId), b = t2.kpiHistory.find((t) => t.teamId === tj2.teamId); return a && a.tof === true && a.birtLota === null && a.rounds.length === 0 && b && b.adeinsStig === true && b.rounds.length === 1 && b.rounds[0].round === 1 && typeof b.rounds[0].score === 'number' && typeof b.rounds[0].cumulative === 'number' && b.rounds[0].verdbolga === undefined; })());
      ok('þoka lota 2: kort tómt (ekkert birt uppgjör), finalPerKpi [], medals []', Array.isArray(t2.kort) && t2.kort.length === 0 && Array.isArray(t2.finalPerKpi) && t2.finalPerKpi.length === 0 && Array.isArray(t2.medals) && t2.medals.length === 0);
      ok('þoka lota 2: badge verðtrygging sést EN deltas null (tof)', (() => { const b = (t2.policyBadges || []).find((x) => x.id === 'verdtrygging'); return b && b.deltas === null && b.tof === true && b.deltaLota === null; })());
      ok('þoka lota 2: atvik sést, effect + kosta-effect FALIN', t2.surprise && t2.surprise.id === tEv.id && t2.surprise.title === tEv.title && t2.surprise.effect === null && t2.surprise.thoka === true && t2.surprise.dilemma.options.length === tEv.dilemma.options.length && t2.surprise.dilemma.options.every((o) => o.effect === null && o.label));
      ok('þoka lota 2: thoka-blokk — birtLota/attir null, fyrirsagnir lotu 1, fylgi, stig lotu 1', t2.thoka.birtLota === null && t2.thoka.attir === null && Array.isArray(t2.thoka.fyrirsagnir) && t2.thoka.fyrirsagnir.length >= 1 && t2.thoka.stodugleiki && typeof t2.thoka.stodugleiki.approval === 'number' && typeof t2.thoka.stodugleiki.fell === 'boolean' && t2.thoka.stig.lota === 1 && typeof t2.thoka.stig.roundScore === 'number');
      ok('þoka lota 2: stigatafla+trajectory+avgApproval HALDAST', t2.teams.every((t) => typeof t.cumulative === 'number') && t2.trajectory.every((t) => t.points.length === 1) && typeof t2.avgApproval === 'number');
      const t2fac = await tSt(tg.facToken);
      ok('þoka lota 2: fac-state ÓSÍAÐ (kpiHistory m. tölum lotu 1, kort lotu 1, engin thoka-blokk)', t2fac.thoka === undefined && t2fac.kpiHistory.every((t) => typeof t.rounds[0].verdbolga === 'number') && t2fac.kort.every((k) => k.round === 1) && t2fac.kpiHistory.find((t) => t.teamId === tj1.teamId).rounds[0].verdbolga === r1A.detail.kpis.verdbolga && leaks(t2fac, n1).length >= 6);
      // Lota 2: lið velja sitt hvorn klemmu-kost; A sækir um ESB
      const tOpts = tEv.dilemma.options;
      await tDec(tj1.teamToken, 2, { levers: { vextir: 9 }, dilemma: tOpts[0].key, policies: { esb: true } });
      await tDec(tj2.teamToken, 2, { levers: { vextir: 5 }, dilemma: (tOpts[1] || tOpts[0]).key });
      await tCtrl('resolve');
      const tRes2 = await tSt(tg.facToken);
      const r2A = (tRes2.results || []).find((r) => r.teamId === tj1.teamId), r2B = (tRes2.results || []).find((r) => r.teamId === tj2.teamId);
      const n2 = [...kpiNums(r2A.detail.kpis), ...kpiNums(r2B.detail.kpis)], ex1 = new Set(n1);
      ok('þoka: uppgjör lotu 2 hefur þekkjanlegar tölur ólíkar lotu 1', n2.filter((v) => !ex1.has(v)).length >= 20);
      const t2r = await tSt(tj1.teamToken);
      ok('þoka results-fasi lotu 2 (lið): ÓSÍAÐ — kpis lotu 2 í results, surprise.effect sýnilegt, kpiHistory 2 lotur m. tölum', t2r.phase === 'resolved' && leaks(t2r, n2, ex1).length === n2.filter((v) => !ex1.has(v)).length && t2r.surprise && JSON.stringify(t2r.surprise.effect) === JSON.stringify(tEv.effect) && t2r.kpiHistory.every((t) => t.rounds.length === 2 && typeof t.rounds[1].verdbolga === 'number') && t2r.thoka === undefined);
      await tCtrl('next');
      const t3 = await tSt(tj1.teamToken);
      ok('þoka lota 3 decide: ENGIN KPI-tala lotu 2 neins staðar í liðs-state (djúp leit í JSON)', leaks(t3, n2, ex1).length === 0);
      ok('þoka lota 3: eigið kpiHistory = lota 1 m. tof:true/birtLota 1 (tölur lotu 1 birtast), hitt liðið aðeins stig 2 lota', (() => { const a = t3.kpiHistory.find((t) => t.teamId === tj1.teamId), b = t3.kpiHistory.find((t) => t.teamId === tj2.teamId); return a && a.tof === true && a.birtLota === 1 && a.rounds.length === 1 && a.rounds[0].round === 1 && a.rounds[0].verdbolga === r1A.detail.kpis.verdbolga && a.rounds[0].losun === r1A.detail.kpis.losun && b && b.adeinsStig === true && b.rounds.length === 2 && b.rounds.every((r) => typeof r.score === 'number' && r.verdbolga === undefined && r.losun === undefined); })());
      ok('þoka lota 3: kort beggja liða = uppgjör lotu 1 (tof), losun lotu 1', t3.kort.length === 2 && t3.kort.every((k) => k.round === 1 && k.tof === true) && t3.kort.find((k) => k.teamId === tj1.teamId).kpis.losun === r1A.detail.kpis.losun && t3.kort.find((k) => k.teamId === tj2.teamId).kpis.losun === r1B.detail.kpis.losun);
      ok('þoka lota 3: badge-deltas = lotu 1 (N-2) m. deltaLota 1 — EKKI lotu 2', (() => { const b = (t3.policyBadges || []).find((x) => x.id === 'verdtrygging'); return b && b.tof === true && b.deltaLota === 1 && JSON.stringify(b.deltas) === JSON.stringify(r1A.detail.policyDeltas.verdtrygging) && JSON.stringify(b.deltas) !== JSON.stringify(r2A.detail.policyDeltas.verdtrygging); })());
      ok('þoka lota 3: esb-badge (tekin lotu 2) sést m. stage en deltas null (engin lotu-1-delta)', (() => { const b = (t3.policyBadges || []).find((x) => x.id === 'esb'); return b && b.stage === 'adild' && b.deltas === null; })());
      ok('þoka lota 3: carryover thoka:true, allar deltas null, fyrra atvik tilgreint', t3.carryover && t3.carryover.thoka === true && t3.carryover.policies.length >= 1 && t3.carryover.policies.every((p) => p.deltas === null && typeof p.text === 'string') && t3.carryover.event && t3.carryover.event.id === tEv.id);
      const attV = t3.thoka.attir;
      const expAtt = (k, thr) => { const d = r2A.detail.kpis[k] - r1A.detail.kpis[k]; return Math.abs(d) < thr ? 'stodugt' : d > 0 ? 'upp' : 'nidur'; };
      ok('þoka lota 3: attir rétt reiknaðar lotu 1→2 (verðbólga/hagvöxtur/atvinnuleysi %: 0,15 · losun vísitala: 1)', attV && attV.verdbolga.att === expAtt('verdbolga', 0.15) && attV.hagvoxtur.att === expAtt('hagvoxtur', 0.15) && attV.atvinnuleysi.att === expAtt('atvinnuleysi', 0.15) && attV.losun.att === expAtt('losun', 1) && attV.skuldir.att === expAtt('skuldir', 0.15));
      ok('þoka lota 3: vs_markmid f. kjarna-KPI (verðbólga 2,5±0,8 · lotu-2 markmið) rétt og null f. KPI utan umboðs', (() => { const v = r2A.detail.kpis.verdbolga, e = Math.abs(v - 2.5) <= 0.8 ? 'innan' : v > 2.5 ? 'yfir' : 'undir'; return attV.verdbolga.vs_markmid === e && attV.fiskistofn.vs_markmid != null && attV.husnaedi && attV.husnaedi.vs_markmid === null; })());
      ok('þoka lota 3: thoka-blokk — birtLota 1, birtAr 2000, fyrirsagnir+fylgi+stig lotu 2', t3.thoka.on === true && t3.thoka.birtLota === 1 && t3.thoka.birtAr === 2000 && Array.isArray(t3.thoka.fyrirsagnir) && t3.thoka.fyrirsagnir.length >= 1 && t3.thoka.stig.lota === 2 && t3.thoka.stig.cumulative === r2A.cumulative && t3.thoka.stodugleiki && t3.thoka.stodugleiki.approval === r2A.detail.stability.approval);
      ok('þoka lota 3: finalPerKpi = perKpi lotu 1 (ekki lotu 2)', JSON.stringify(t3.finalPerKpi) === JSON.stringify(r1A.detail.perKpi) && Array.isArray(t3.medals));
      ok('þoka lota 3: ákvarðana-svið haldast (policies/history/draft/decisionMarks/eventChoices)', t3.history.length === 2 && t3.policies && t3.policies.states.verdtrygging === true && Array.isArray(t3.decisionMarks) && t3.eventChoices && t3.eventChoices[tj1.teamId][tEv.id] === tOpts[0].key);
      if (rollSurprise(tg.code, 3)) ok('þoka lota 3: atvik lotu 3 m. effect falið', t3.surprise && t3.surprise.effect === null && t3.surprise.thoka === true);
      const t3fac = await tSt(tg.facToken), t3watch = await tSt(null), t3B = await tSt(tj2.teamToken);
      ok('þoka lota 3: fac-state ÓSÍAÐ — kpiHistory m. tölum lotu 2, kort lotu 2, engin thoka-blokk, thokaOn true', t3fac.thoka === undefined && t3fac.thokaOn === true && t3fac.kpiHistory.every((t) => t.rounds.length === 2 && typeof t.rounds[1].verdbolga === 'number') && t3fac.kort.every((k) => k.round === 2) && t3fac.kpiHistory.find((t) => t.teamId === tj1.teamId).rounds[1].verdbolga === r2A.detail.kpis.verdbolga && leaks(t3fac, n2, ex1).length >= 6 && t3fac.analytics);
      // WATCH (ekkert tákn) í decide þoku-leiks: SÍAÐ eins og lið með teamId:null (rýni-gat LOKAÐ — lið gat áður opnað
      // watch-sýnina í öðrum flipa og séð N-1 tölurnar). ÖLL lið adeinsStig, kort N-2, atvik án áhrifa, thoka-blokk án per-liðs gagna.
      ok('þoka lota 3: watch (ekkert tákn) SÍAÐ — ENGIN KPI-tala lotu 2 (djúp leit), thokaOn true', leaks(t3watch, n2, ex1).length === 0 && t3watch.thokaOn === true);
      ok('þoka lota 3: watch kpiHistory = ÖLL lið adeinsStig {round,score,cumulative} × 2 lotur, engin KPI-svið', t3watch.kpiHistory.length === 2 && t3watch.kpiHistory.every((t) => t.adeinsStig === true && t.rounds.length === 2 && t.rounds.every((r) => typeof r.score === 'number' && typeof r.cumulative === 'number' && r.verdbolga === undefined && r.losun === undefined)));
      ok('þoka lota 3: watch kort beggja liða = uppgjör lotu 1 (tof), losun lotu 1 — EKKI lotu 2', t3watch.kort.length === 2 && t3watch.kort.every((k) => k.round === 1 && k.tof === true) && t3watch.kort.find((k) => k.teamId === tj1.teamId).kpis.losun === r1A.detail.kpis.losun && t3watch.kort.find((k) => k.teamId === tj2.teamId).kpis.losun === r1B.detail.kpis.losun);
      ok('þoka lota 3: watch thoka-blokk = {on, birtLota 1, birtAr 2000} + attir/fyrirsagnir/stodugleiki/stig null (ekkert per-lið á skjávarpa)', t3watch.thoka && t3watch.thoka.on === true && t3watch.thoka.birtLota === 1 && t3watch.thoka.birtAr === 2000 && t3watch.thoka.attir === null && t3watch.thoka.fyrirsagnir === null && t3watch.thoka.stodugleiki === null && t3watch.thoka.stig === null);
      ok('þoka lota 3: watch stigatafla/trajectory/decisionMarks/eventChoices ÓSNERT (= fac)', JSON.stringify(t3watch.teams) === JSON.stringify(t3fac.teams) && JSON.stringify(t3watch.trajectory) === JSON.stringify(t3fac.trajectory) && JSON.stringify(t3watch.decisionMarks) === JSON.stringify(t3fac.decisionMarks) && JSON.stringify(t3watch.eventChoices) === JSON.stringify(t3fac.eventChoices) && t3watch.you === null && t3watch.analytics === undefined);
      if (rollSurprise(tg.code, 3)) ok('þoka lota 3: watch sér atvik lotu 3 EN effect+kosta-effect falin (eins og lið)', t3watch.surprise && t3watch.surprise.effect === null && t3watch.surprise.thoka === true && (t3watch.surprise.dilemma == null || t3watch.surprise.dilemma.options.every((o) => o.effect === null)));
      ok('þoka lota 3: hitt liðið (B) fær SINA síun — engin tala lotu 2, eigið kpiHistory lotu 1, A aðeins stig', leaks(t3B, n2, ex1).length === 0 && t3B.kpiHistory.find((t) => t.teamId === tj2.teamId).rounds[0].verdbolga === r1B.detail.kpis.verdbolga && t3B.kpiHistory.find((t) => t.teamId === tj1.teamId).adeinsStig === true);
      await tDec(tj1.teamToken, 3, { levers: { vextir: 9 } }); await tDec(tj2.teamToken, 3, { levers: { vextir: 5 } });
      await tCtrl('resolve');
      const t3r = await tSt(tj1.teamToken), t3rw = await tSt(null);
      ok('þoka results-fasi lotu 3 (watch): ÓSÍAÐ — kpiHistory 3 lotur m. tölum, kort lotu 3, results m. kpis, engin thoka-blokk', t3rw.phase === 'resolved' && t3rw.thoka === undefined && t3rw.kpiHistory.every((t) => !t.adeinsStig && t.rounds.length === 3 && typeof t.rounds[2].verdbolga === 'number') && t3rw.kort.every((k) => k.round === 3 && !k.tof) && t3rw.results.length === 2 && typeof t3rw.results[0].detail.kpis.verdbolga === 'number' && leaks(t3rw, n2, ex1).length >= 6);
      ok('þoka results-fasi lotu 3 (lið): ÓSÍAÐ — kpis lotu 2+3 sýnileg, kpiHistory 3 lotur, engin thoka-blokk', t3r.phase === 'resolved' && leaks(t3r, n2, ex1).length >= 6 && t3r.kpiHistory.find((t) => t.teamId === tj1.teamId).rounds[1].verdbolga === r2A.detail.kpis.verdbolga && t3r.results.length === 2 && typeof t3r.results[0].detail.kpis.verdbolga === 'number' && t3r.kpiHistory.every((t) => t.rounds.length === 3 && typeof t.rounds[2].verdbolga === 'number') && t3r.thoka === undefined && t3r.thokaOn === true);
      ok('þoka: stigagjöf ÓBREYTT af síun — cumulative liðanna það sama úr liðs-/fac-sýn', t3r.teams.map((t) => t.cumulative).join(',') === (await tSt(tg.facToken)).teams.map((t) => t.cumulative).join(','));
      await tCtrl('stop');
      const tEnd = await tSt(tj1.teamToken);
      ok('þoka ended (lið): ÓSÍAÐ — kpiHistory 3 lotur m. tölum, medals/finalPerKpi úr lotu 3, engin thoka-blokk', tEnd.phase === 'ended' && tEnd.thoka === undefined && tEnd.kpiHistory.every((t) => t.rounds.length === 3) && JSON.stringify(tEnd.finalPerKpi) !== JSON.stringify(r1A.detail.perKpi));
    }
    // ── ANDSTÆÐINGS-RÝNI (leka-leit): lið í þoku reynir að sjá hörðu tölurnar N-1 — leitað að ÖLLUM talnagildum úr FULLU
    // uppgjöri N-1 (kpis + perKpi.value + policyDeltas + crisis …, BEGGJA liða) í JSON.stringify(liðs-state) í decide N.
    // Leyft: roundScore/cumulative (stig), stability.approval (fylgi), gildi sem líka eru í uppgjöri N-2 (birt), og
    // tölu-tókn úr FÖSTUM strúktúrum (mandate/decisions/event/scenario/policies/draft/history — engin KPI þar).
    // Aðeins ÓHEIL gildi (þekkjanleg; heiltölur eins og perKpi.score 100 eru ekki auðkennandi). Keyrt á studio-,
    // classic- og roles-þoku-leik, báðum liðum, lotu 2 (N-1=1), 3 (N-1=2) og 4; þoku-laus tvíburi (eigið env →
    // sömu team-id) ber saman fac-/watch-/results-state: IDENTICAL utan code/thokaOn.
    {
      const allNums = (o, acc = []) => { if (typeof o === 'number') acc.push(o); else if (Array.isArray(o)) o.forEach((x) => allNums(x, acc)); else if (o && typeof o === 'object') for (const k in o) allNums(o[k], acc); return acc; };
      const numTok = (js) => { const s = new Set(); for (const m of js.matchAll(/(?<![\w.\-])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?![\w.])/g)) s.add(m[0]); return s; };
      const staticJs = (st) => JSON.stringify({ m: st.mandate, d: st.decisions, e: st.event, s: st.scenarioSoFar, p: st.policies, dr: st.draft, h: st.history, r: st.round, sl: st.secondsLeft, dl: st.deadlineTs });
      // hvað lekur: óheil gildi úr uppgjörum N-1 (fylki af {teamId, roundScore, cumulative, detail}) sem finnast í st
      const lekar = (st, prevRows, prevPrevRows) => {
        const allow = new Set(); for (const r of prevRows) { allow.add(r.roundScore); allow.add(r.cumulative); allow.add(((r.detail || {}).stability || {}).approval); }
        for (const r of (prevPrevRows || [])) for (const v of allNums(r.detail)) allow.add(v);
        const stat = numTok(staticJs(st)), js = JSON.stringify(st), tk = numTok(js);
        const out = [];
        for (const r of prevRows) for (const v of allNums(r.detail)) { if (Number.isInteger(v) || allow.has(v) || stat.has(String(v))) continue; if (tk.has(String(v))) out.push(v); }
        return [...new Set(out)];
      };
      const mkEnv = () => ({ SESSION_SECRET: 'test-secret-xyz', TENGSL: mockD1() });
      // Spilar leik til og með decide lotu 4 í EIGIN env; skilar öllum sýnum (lið A/B, fac, watch) per fasi + hráum uppgjörum.
      const playFog = async (cfgBody, decs, E) => {
        const H = (r) => LH(r, E);
        const g = await J(await H(req('/api/leikur/create', cfgBody)));
        const a = await J(await H(req('/api/leikur/' + g.code + '/join', { name: 'Þ-A' }))), b = await J(await H(req('/api/leikur/' + g.code + '/join', { name: 'Þ-B' })));
        const ctl = (act) => H(new Request('https://karp.is/api/leikur/' + g.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + g.facToken }, body: JSON.stringify({ action: act }) }));
        const st = async (tok) => J(await H(new Request('https://karp.is/api/leikur/' + g.code + '/state', { headers: tok ? { authorization: 'Bearer ' + tok } : {} })));
        const dc = (tok, round, d) => H(new Request('https://karp.is/api/leikur/' + g.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round, locked: true, decisions: d }) }));
        const snap = async () => ({ A: await st(a.teamToken), B: await st(b.teamToken), fac: await st(g.facToken), watch: await st(null) });
        const S = { g, a, b, rows: {} };
        await ctl('start'); S.d1 = await snap();
        for (let r = 1; r <= 3; r++) {
          if (r > 1) { await ctl('next'); S['d' + r] = await snap(); }
          await dc(a.teamToken, r, decs.A[r - 1]); await dc(b.teamToken, r, decs.B[r - 1]);
          await ctl('resolve'); S['r' + r] = await snap();
          S.rows[r] = S['r' + r].fac.results;   // [{teamId, roundScore, cumulative, detail}] — hráu uppgjörin (fac sér allt)
        }
        await ctl('next'); S.d4 = await snap();
        return S;
      };
      const DECS = { A: [{ levers: { vextir: 9, utgjold: 3 }, policies: { verdtrygging: true } }, { levers: { vextir: 8 }, policies: { esb: true } }, { levers: { vextir: 7, skattar: 2 } }],
        B: [{ levers: { vextir: 5 } }, { levers: { vextir: 4, utgjold: -2 } }, { levers: { vextir: 6 } }] };
      // 1) studio-þoku-leikur (án surprise → determinískur óháð kóða) + þoku-laus tvíburi í eigin env
      const F = await playFog({ mode: 'studio', thoka: true }, DECS, mkEnv()), U = await playFog({ mode: 'studio' }, DECS, mkEnv());
      ok('leki: uppgjör lotu 1/2/3 hafa ≥40 óheil þekkjanleg gildi hvort (kpis+perKpi.value+deltas)', [1, 2, 3].every((r) => F.rows[r].flatMap((x) => allNums(x.detail)).filter((v) => !Number.isInteger(v)).length >= 40));
      ok('leki: þoku-lið A+B í decide lotu 2 — EKKERT óheilt gildi úr uppgjöri lotu 1 (kpis/perKpi/deltas/crisis) í liðs-state', lekar(F.d2.A, F.rows[1], []).length === 0 && lekar(F.d2.B, F.rows[1], []).length === 0);
      const l3A = lekar(F.d3.A, F.rows[2], F.rows[1]), l3B = lekar(F.d3.B, F.rows[2], F.rows[1]);
      ok('leki: þoku-lið A+B í decide lotu 3 — EKKERT óheilt gildi úr uppgjöri lotu 2 (engin N-1-tala í neinu sviði)' + (l3A.length || l3B.length ? ' LEKI: ' + JSON.stringify({ A: l3A, B: l3B }) : ''), l3A.length === 0 && l3B.length === 0);
      ok('leki: þoku-lið A+B í decide lotu 4 — EKKERT gildi úr uppgjöri lotu 3', lekar(F.d4.A, F.rows[3], F.rows[2]).length === 0 && lekar(F.d4.B, F.rows[3], F.rows[2]).length === 0);
      ok('leki: leitin BÍTUR — sama leit á ÓSÍAÐA fac-state lotu 3 finnur ≥10 gildi lotu 2 (kpiHistory 6×2 + kort); þoku-laus watch-tvíburi líka', lekar(F.d3.fac, F.rows[2], F.rows[1]).length >= 10 && lekar(U.d3.watch, F.rows[2], F.rows[1]).length >= 10);
      // WATCH-GAT LOKAÐ: tákn-laust /state (skjávarpa-sýn) í decide þoku-leiks er SÍAÐ eins og lið (teamId:null) — lið sem
      // þekkir leikkóðann getur ekki lengur opnað watch í öðrum flipa og lesið N-1 tölurnar. Sama leka-leit og á liðin.
      const w2 = lekar(F.d2.watch, F.rows[1], []), w3 = lekar(F.d3.watch, F.rows[2], F.rows[1]), w4 = lekar(F.d4.watch, F.rows[3], F.rows[2]);
      ok('leki: WATCH í decide lotu 2/3/4 þoku-leiks — EKKERT óheilt gildi úr uppgjöri N-1 (kpiHistory/kort/surprise …)' + (w2.length || w3.length || w4.length ? ' LEKI: ' + JSON.stringify({ w2, w3, w4 }) : ''), w2.length === 0 && w3.length === 0 && w4.length === 0);
      ok('leki: WATCH decide lotu 3 — ÖLL lið adeinsStig (engin KPI-svið), kort = lota 1 (tof), thoka {on,birtLota 1} án attir/fyrirsagna/stig, thokaOn true', F.d3.watch.kpiHistory.length === 2 && F.d3.watch.kpiHistory.every((t) => t.adeinsStig === true && t.rounds.length === 2 && t.rounds.every((r) => r.verdbolga === undefined && typeof r.score === 'number')) && F.d3.watch.kort.length === 2 && F.d3.watch.kort.every((k) => k.round === 1 && k.tof === true) && F.d3.watch.thoka.on === true && F.d3.watch.thoka.birtLota === 1 && F.d3.watch.thoka.attir === null && F.d3.watch.thoka.fyrirsagnir === null && F.d3.watch.thoka.stig === null && F.d3.watch.thoka.stodugleiki === null && F.d3.watch.thokaOn === true);
      ok('leki: WATCH decide lotu 2 (ekkert N-2) — engin hrun: kpiHistory adeinsStig × 1 lota, kort [], thoka birtLota null', F.d2.watch.kpiHistory.every((t) => t.adeinsStig === true && t.rounds.length === 1) && Array.isArray(F.d2.watch.kort) && F.d2.watch.kort.length === 0 && F.d2.watch.thoka.birtLota === null);
      // Svið-fyrir-svið: ekkert hlut-tré í liðs-/watch-state decide lotu 3 ber uppgjörs-gögn lotu 2 (round:2 með kpis/perKpi/verdbolga/policyDeltas)
      const r2hasKpi = (o) => { let hit = false; const walk = (x) => { if (hit || !x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); if (x.round === 2 && (x.kpis || x.perKpi || x.verdbolga != null || x.policyDeltas)) hit = true; for (const k in x) walk(x[k]); }; walk(o); return hit; };
      ok('leki: ekkert hlut-tré með round:2 + kpis/perKpi/verdbolga/policyDeltas í liðs-/watch-state decide lotu 3 (kpiHistory/kort/finalPerKpi/badges/carryover/medals) — en finnst hjá fac', !r2hasKpi(F.d3.A) && !r2hasKpi(F.d3.B) && !r2hasKpi(F.d3.watch) && r2hasKpi(F.d3.fac));
      // 2) Afhjúpun: results-fasi lotu 2 sýnir lotu-2 tölurnar (ÓSÍAÐ, identical við þoku-lausan tvíbura) — og þær hverfa aftur í decide lotu 3
      const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.code; delete c.thokaOn; return JSON.stringify(c); };
      ok('afhjúpun: results-fasi lotu 2 (lið A) = ÓSÍAÐ og IDENTICAL við þoku-lausan tvíbura (utan code/thokaOn); öll lotu-2 gildi sýnileg', strip(F.r2.A) === strip(U.r2.A) && lekar(F.r2.A, F.rows[2], F.rows[1]).length >= 30 && F.r2.A.results.length === 2);
      ok('afhjúpun: sömu tölur HORFNAR í decide lotu 3 (lið A) — en sjást ENN hjá tvíburanum (≥10)', lekar(F.d3.A, F.rows[2], F.rows[1]).length === 0 && lekar(U.d3.A, F.rows[2], F.rows[1]).length >= 10);
      ok('afhjúpun: tvíburarnir fengu SÖMU uppgjör (stigagjöf+kpis óháð þoku)', JSON.stringify(F.rows) === JSON.stringify(U.rows));
      // 3) fac: ÓSNERT — identical við þoku-lausan tvíbura í öllum fösum (decide 1–4, results 1–3). watch: identical í
      //    results-fösum + decide 1 (aðeins + thoka-blokk) — SÍAÐ í decide 2–4 (sjá WATCH-GAT LOKAÐ að ofan).
      const phases = ['d1', 'd2', 'd3', 'd4', 'r1', 'r2', 'r3'];
      ok('fac-state þoku-leiks IDENTICAL við þoku-lausan (utan code/thokaOn) í öllum 7 fösum', phases.every((p) => strip(F[p].fac) === strip(U[p].fac)) && F.d3.fac.thokaOn === true && U.d3.fac.thokaOn === false);
      const minusThoka = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.thoka; return strip(c); };
      ok('watch-state (ekkert tákn) þoku-leiks IDENTICAL við þoku-lausan í results-fösum + decide 1 (aðeins + thoka-blokk); SÍAÐ (ólíkt) í decide 2–4', ['r1', 'r2', 'r3'].every((p) => strip(F[p].watch) === strip(U[p].watch)) && minusThoka(F.d1.watch) === strip(U.d1.watch) && F.d1.watch.thoka && F.d1.watch.thoka.on === true && ['d2', 'd3', 'd4'].every((p) => strip(F[p].watch) !== strip(U[p].watch) && F[p].watch.thoka && F[p].watch.thoka.on === true) && ['r1', 'r2', 'r3'].every((p) => F[p].watch.thoka === undefined));
      ok('liðs-state í results-fösum + decide 1 IDENTICAL við tvíbura (decide 1 aðeins + thoka-blokk)', ['r1', 'r2', 'r3'].every((p) => strip(F[p].A) === strip(U[p].A)) && minusThoka(F.d1.A) === strip(U.d1.A));
      // 4) lota 1–2: engin hrun / null-brúnir (thoka-blokk með null-sviðum, kpiHistory/kort tóm en fylki)
      ok('lota 1–2 þoku: engin hrun — d1 thoka null-svið, d2 kpiHistory eigið tómt/tof + kort [] + finalPerKpi [] + medals []', F.d1.A.thoka && F.d1.A.thoka.birtLota === null && F.d2.A.thoka.birtLota === null && F.d2.A.kpiHistory.find((t) => t.teamId === F.a.teamId).rounds.length === 0 && F.d2.A.kort.length === 0 && Array.isArray(F.d2.A.finalPerKpi) && F.d2.A.finalPerKpi.length === 0 && Array.isArray(F.d2.A.medals) && F.d2.A.medals.length === 0);
      ok('decide lotu 3 þoku: stig/trajectory/teams IDENTICAL við tvíbura (keppnin óskert)', JSON.stringify(F.d3.A.teams) === JSON.stringify(U.d3.A.teams) && JSON.stringify(F.d3.A.trajectory) === JSON.stringify(U.d3.A.trajectory) && F.d3.A.thoka.stig.cumulative === U.d3.A.teams.find((t) => t.id === F.a.teamId).cumulative);
      // 5) classic-þoka (engin studio-svið) + roles-þoka (hlutverks-umboð → vs_markmid): engin hrun, enginn leki
      const C = await playFog({ thoka: true }, DECS, mkEnv());
      ok('classic-þoka: enginn leki lotu 2/3/4 (lið + watch) + thoka-blokk (attir lotu 3) + engin studio-svið', lekar(C.d3.A, C.rows[2], C.rows[1]).length === 0 && lekar(C.d2.B, C.rows[1], []).length === 0 && lekar(C.d4.A, C.rows[3], C.rows[2]).length === 0 && lekar(C.d3.watch, C.rows[2], C.rows[1]).length === 0 && lekar(C.d4.watch, C.rows[3], C.rows[2]).length === 0 && C.d3.watch.kpiHistory.every((t) => t.adeinsStig === true) && C.d3.A.thoka.attir && C.d3.A.thoka.attir.verdbolga && C.d3.A.policyBadges === undefined && C.d3.A.carryover === undefined);
      const R = await playFog({ mode: 'studio', roles: true, thoka: true }, DECS, mkEnv());
      ok('roles-þoka: enginn leki (lið + watch) + attir m. vs_markmid (hlutverks-umboð lotu 2); lið sér sitt role, ekki roleMap; fac sér roleMap', lekar(R.d3.A, R.rows[2], R.rows[1]).length === 0 && lekar(R.d3.B, R.rows[2], R.rows[1]).length === 0 && lekar(R.d3.watch, R.rows[2], R.rows[1]).length === 0 && R.d3.watch.roleMap === undefined && R.d3.A.role && R.d3.A.roleMap === undefined && R.d3.A.thoka.attir && Object.values(R.d3.A.thoka.attir).some((x) => x.vs_markmid != null) && Array.isArray(R.d3.fac.roleMap) && R.d3.fac.roleMap.find((x) => x.teamId === R.a.teamId).roleId === R.d3.A.role.id);
    }
    // Engin afturför: leikir ÁN thoka fá thokaOn:false og enga thoka-blokk, kpiHistory/kort/badges/surprise óbreytt
    ok('þoka off: studio-leikur án thoka → thokaOn false, engin thoka-blokk, kpiHistory m. tölum', uTeamSt.thokaOn === false && uTeamSt.thoka === undefined && uTeamSt.kpiHistory.every((t) => t.rounds.every((r) => typeof r.verdbolga === 'number')));
    ok('þoka off: classic decide-lið → thokaOn false, engin thoka-blokk', cgSt.thokaOn === false && cgSt.thoka === undefined);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
