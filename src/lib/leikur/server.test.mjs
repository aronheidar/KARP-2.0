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
    if (s.includes('FROM leikur_decisions')) return { results: t.leikur_decisions.filter((x) => x.game_code === args[0] && (args[1] === undefined || x.team_id === args[1])).sort((a, b) => a.round - b.round) };
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

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
