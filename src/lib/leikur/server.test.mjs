import { signToken, verifyToken, leikurHandler } from './server.mjs';
// Prófin keyra öll sem kerfisstjóri (má stofna+ganga inn) — gátt á create/join er ný (sjá worker-dispatch).
const GU = { uid: 1, isAdmin: true, nemandi: true };
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
    // classic/án surprise → aldrei out.surprise
    ok('án surprise-flaggs: engin surprise í state', cgSt.surprise === undefined);
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
  ok('kpiHistory: hver lota ber AÐEINS KPI-in 5 (þjappað)', uSt.kpiHistory.every((t) => t.rounds.every((r) => ['verdbolga', 'hagvoxtur', 'kaupmattur', 'skuldir', 'losun'].every((k) => typeof r[k] === 'number') && Object.keys(r).length === 6)));
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

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
