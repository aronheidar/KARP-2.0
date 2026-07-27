import { signToken, verifyToken, leikurHandler } from './server.mjs';
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
    return { meta: {} };
  };
  const first = (sql, args) => { const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT') && s.includes('FROM leikur_games')) return t.leikur_games.find((x) => x.code === args[0]) || null;
    if (s.includes('FROM leikur_results') && s.includes('team_id=?') && s.includes('round=?')) { const r = t.leikur_results.find((x) => x.game_code === args[0] && x.team_id === args[1] && x.round === args[2]); return r || null; }
    if (s.includes('FROM leikur_results') && s.includes('round=?')) return t.leikur_results.find((x) => x.game_code === args[0] && x.round === args[1]) || null;
    return null; };
  const all = (sql, args) => { const s = sql.replace(/\s+/g, ' ').trim();
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
  return { prepare: prep, _t: t };
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
  const cr = await J(await leikurHandler(req('/api/leikur/create', {}), env));
  ok('create skilar code+facToken', cr.code && cr.facToken);
  const code = cr.code;
  // join
  const jn = await J(await leikurHandler(req('/api/leikur/' + code + '/join', { name: 'Lið A' }), env));
  ok('join skilar teamToken+teamId', jn.teamToken && jn.teamId);
  // state (fac)
  const st = await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + cr.facToken } }), env));
  ok('state phase lobby', st.phase === 'lobby');
  ok('state sér 1 lið', st.teams.length === 1 && st.teams[0].name === 'Lið A');
  ok('state hefur mandate + decisions', Array.isArray(st.mandate.kpis) && Array.isArray(st.decisions));
  // ógildur kóði
  ok('óþekktur kóði → 404', (await leikurHandler(new Request('https://karp.is/api/leikur/ZZZZZ/state'), env)).status === 404);

  // Task 5: round loop
  const jn2 = await J(await leikurHandler(req('/api/leikur/' + code + '/join', { name: 'Lið B' }), env));
  const fac = { headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cr.facToken } };
  const ctrl = (a) => leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/control', { method: 'POST', headers: fac.headers, body: JSON.stringify({ action: a }) }), env);
  ok('start → phase decide, round 1', (await J(await ctrl('start'))).phase === 'decide');
  const dec = (tok, obj) => leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(obj) }), env);
  await dec(jn.teamToken, { round: 1, locked: true, decisions: { peningastefna: 'slaka2', utgjold: 'orvun2', skattar: 'obreytt', fjarfesting: 'innvidir', vidbragd: 'ekkert' } });
  await dec(jn2.teamToken, { round: 1, locked: true, decisions: { peningastefna: 'herda2', utgjold: 'adhald2', skattar: 'haekka2', fjarfesting: 'engin', vidbragd: 'vardsjodur' } });
  ok('resolve → phase resolved', (await J(await ctrl('resolve'))).phase === 'resolved');
  const st2 = await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + cr.facToken } }), env));
  ok('bæði lið hafa cumulative eftir umferð', st2.teams.every((t) => typeof t.cumulative === 'number'));
  ok('liðin fá ÓLÍK stig (ólíkar ákvarðanir)', st2.teams[0].cumulative !== st2.teams[1].cumulative);
  ok('detail hefur chain (nodes+edges)', (st2.results || []).some((r) => r.detail && r.detail.chain && Array.isArray(r.detail.chain.nodes) && Array.isArray(r.detail.chain.edges)));
  ok('a.m.k. eitt lið með ekki-tóma keðju', (st2.results || []).some((r) => r.detail && r.detail.chain && r.detail.chain.edges.length > 0));
  ok('fac /state hefur analytics', st2.analytics && Array.isArray(st2.analytics.scorecard) && Array.isArray(st2.analytics.trajectories.cumulative));
  ok('analytics scorecard raðað (hæsta fyrst)', st2.analytics.scorecard.length >= 2 && st2.analytics.scorecard[0].cumulative >= st2.analytics.scorecard[1].cumulative);
  const teamSt = await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + jn.teamToken } }), env));
  ok('team /state hefur EKKI analytics', !teamSt.analytics);

  // Task S4: custom game create
  const MANDATE = (await import('./game-config.mjs')).MANDATE;
  const custom = { rounds: 2, mandate: JSON.parse(JSON.stringify(MANDATE)),
    scenario: { id: 'custom', events: [
      { round: 1, title: 'Sérsniðið upphaf', text: '', shocks: {}, responses: [{ key: 'a', label: 'Ekkert', effect: {} }] },
      { round: 2, title: 'Sérsniðin kreppa', text: '', shocks: { olia: 40 }, responses: [{ key: 'a', label: 'Bregðast við', effect: { lever: { utgjold: 6 } } }] } ] } };
  const cc = await J(await leikurHandler(req('/api/leikur/create', custom), env));
  ok('custom create → code', !!cc.code);
  await leikurHandler(req('/api/leikur/' + cc.code + '/join', { name: 'C' }), env);
  await leikurHandler(new Request('https://karp.is/api/leikur/' + cc.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cc.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  const cst = await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + cc.code + '/state', { headers: { authorization: 'Bearer ' + cc.facToken } }), env));
  ok('custom event birtist í state', cst.event && cst.event.title === 'Sérsniðið upphaf');
  const bad = await leikurHandler(req('/api/leikur/create', { rounds: 2, mandate: custom.mandate, scenario: { id: 'x', events: [{ round: 1, title: 'T', shocks: { ekki_til: 5 }, responses: [{ key: 'a', label: 'A', effect: {} }] }] } }), env);
  ok('ógilt custom → 400', bad.status === 400);
  // idempotency: resolve aftur má ekki tvítelja
  const before = st2.teams.map((t) => t.cumulative).join(',');
  await ctrl('resolve');
  const st3 = await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + cr.facToken } }), env));
  ok('resolve idempotent', st3.teams.map((t) => t.cumulative).join(',') === before);

  // Task S5: leynileg hlutverk (roles) — 1-umferðar custom roles-leik svo hægt sé að ná ended
  const rolesBody = { roles: true, rounds: 1, mandate: JSON.parse(JSON.stringify(MANDATE)),
    scenario: { id: 'r', events: [ { round: 1, title: 'T', text: '', shocks: {}, responses: [{ key: 'a', label: 'A', effect: {} }] } ] } };
  const rc = await J(await leikurHandler(req('/api/leikur/create', rolesBody), env));
  ok('roles create → code', !!rc.code);
  const rj1 = await J(await leikurHandler(req('/api/leikur/' + rc.code + '/join', { name: 'A' }), env));
  const rj2 = await J(await leikurHandler(req('/api/leikur/' + rc.code + '/join', { name: 'B' }), env));
  const rFacHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + rc.facToken };
  const rState = (tok) => leikurHandler(new Request('https://karp.is/api/leikur/' + rc.code + '/state', { headers: { authorization: 'Bearer ' + tok } }), env);
  await leikurHandler(new Request('https://karp.is/api/leikur/' + rc.code + '/control', { method: 'POST', headers: rFacHdr, body: JSON.stringify({ action: 'start' }) }), env);
  const rFacState = await J(await rState(rc.facToken));
  ok('fac /state hefur roleMap (2 lið)', Array.isArray(rFacState.roleMap) && rFacState.roleMap.length === 2);
  const rTeamState = await J(await rState(rj1.teamToken));
  ok('lið /state hefur role', !!(rTeamState.role && rTeamState.role.label));
  ok('lið /state hefur EKKI roleMap (leynd)', !rTeamState.roleMap);
  ok('lið /state umboð með weight-svið', rTeamState.mandate.kpis.some((k) => k.weight != null));
  const rDec = (tok) => leikurHandler(new Request('https://karp.is/api/leikur/' + rc.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: 1, locked: true, decisions: { peningastefna: 'obreytt', utgjold: 'obreytt', skattar: 'obreytt', fjarfesting: 'engin', vidbragd: 'a' } }) }), env);
  await rDec(rj1.teamToken); await rDec(rj2.teamToken);
  const rCtrl = (a) => leikurHandler(new Request('https://karp.is/api/leikur/' + rc.code + '/control', { method: 'POST', headers: rFacHdr, body: JSON.stringify({ action: a }) }), env);
  await rCtrl('resolve');
  ok('roles: bæði lið skoruð', (await J(await rState(rc.facToken))).teams.every((t) => typeof t.cumulative === 'number'));
  const rEnd = await J(await rCtrl('next'));
  ok('next umfram rounds → ended', rEnd.phase === 'ended');
  const rReveal = await J(await rState(rj1.teamToken));
  ok('lið /state við ended hefur rolesReveal (2)', Array.isArray(rReveal.rolesReveal) && rReveal.rolesReveal.length === 2);
  ok('rolesReveal hefur label+blurb', !!(rReveal.rolesReveal[0].label) && typeof rReveal.rolesReveal[0].blurb === 'string');
  // klassískur leikur (roles off) → engin ný svið
  const cg = await J(await leikurHandler(req('/api/leikur/create', {}), env));
  const cgj = await J(await leikurHandler(req('/api/leikur/' + cg.code + '/join', { name: 'X' }), env));
  await leikurHandler(new Request('https://karp.is/api/leikur/' + cg.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cg.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  ok('klassískur: fac /state EKKI roleMap', !(await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + cg.code + '/state', { headers: { authorization: 'Bearer ' + cg.facToken } }), env))).roleMap);
  ok('klassískur: lið /state EKKI role', !(await J(await leikurHandler(new Request('https://karp.is/api/leikur/' + cg.code + '/state', { headers: { authorization: 'Bearer ' + cgj.teamToken } }), env))).role);

  // Task Stjórnstöð: studio-hamur + læsa-staða (A) + stop (B)
  const stG = (code, tok) => leikurHandler(new Request('https://karp.is/api/leikur/' + code + '/state', { headers: { authorization: 'Bearer ' + tok } }), env);
  const sc = await J(await leikurHandler(req('/api/leikur/create', { mode: 'studio' }), env));
  ok('studio create → code', !!sc.code);
  const sj1 = await J(await leikurHandler(req('/api/leikur/' + sc.code + '/join', { name: 'S-Alfa' }), env));
  const sj2 = await J(await leikurHandler(req('/api/leikur/' + sc.code + '/join', { name: 'S-Beta' }), env));
  const sFacHdr = { 'content-type': 'application/json', authorization: 'Bearer ' + sc.facToken };
  const sCtrl = (a) => leikurHandler(new Request('https://karp.is/api/leikur/' + sc.code + '/control', { method: 'POST', headers: sFacHdr, body: JSON.stringify({ action: a }) }), env);
  await sCtrl('start');
  const sSt1 = await J(await stG(sc.code, sj1.teamToken));
  ok('studio: team /state mode=studio', sSt1.mode === 'studio');
  ok('studio: history tómt í umferð 1', Array.isArray(sSt1.history) && sSt1.history.length === 0);
  ok('studio: scenarioSoFar 1 atburður', Array.isArray(sSt1.scenarioSoFar) && sSt1.scenarioSoFar.length === 1);
  ok('studio: you.locked false fyrir læsingu', sSt1.you && sSt1.you.locked === false);
  // Deilanleg liðs-drög (locked:false) — samstilling + einangrun
  const sDraft = (tok, lev) => leikurHandler(new Request('https://karp.is/api/leikur/' + sc.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: 1, locked: false, decisions: { levers: lev } }) }), env);
  await sDraft(sj1.teamToken, { vextir: 9 });
  const sDraftA = await J(await stG(sc.code, sj1.teamToken));
  ok('studio: A /state.draft sýnir A-drög', sDraftA.draft && sDraftA.draft.vextir === 9);
  ok('studio: draft locked:false → you.locked ennþá false', sDraftA.you && sDraftA.you.locked === false);
  const sDraftB = await J(await stG(sc.code, sj2.teamToken));
  ok('studio: B /state.draft TÓMT (einangrun milli liða)', sDraftB.draft && Object.keys(sDraftB.draft).length === 0);
  const sDec = (tok, lev) => leikurHandler(new Request('https://karp.is/api/leikur/' + sc.code + '/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ round: 1, locked: true, decisions: { levers: lev } }) }), env);
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
  const cgS = await J(await leikurHandler(req('/api/leikur/create', {}), env));
  const cgSj = await J(await leikurHandler(req('/api/leikur/' + cgS.code + '/join', { name: 'Z' }), env));
  await leikurHandler(new Request('https://karp.is/api/leikur/' + cgS.code + '/control', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cgS.facToken }, body: JSON.stringify({ action: 'start' }) }), env);
  const cgSt = await J(await stG(cgS.code, cgSj.teamToken));
  ok('classic: mode=classic + engin history/scenarioSoFar', cgSt.mode === 'classic' && cgSt.history === undefined && cgSt.scenarioSoFar === undefined);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
