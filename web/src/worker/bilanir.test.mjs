import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminBilanirHandler, fallnarVaktir, saekjaBilanir } from './bilanir.mjs';

const NU = () => Math.floor(Date.now() / 1000);
function fakeDb(state) {
  const exec = (sql, args) => {
    if (/SELECT v, updated FROM stjorn_sync WHERE k='bilanir'/.test(sql)) return state.bilanir || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('bilanir'/.test(sql)) { state.bilanir = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return exec(sql, a); }, async all() { return exec(sql, a); }, async run() { return exec(sql, a); } }; return st; } };
}
const mkEnv = (state, over = {}) => Object.assign({ TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', GITHUB_DISPATCH_TOKEN: 'ghp_x' }, over);
const mkState = () => ({ users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } } });

/** Stubbar GitHub-svör eftir slóðarbroti. */
function stubGh(t, svor) {
  const orig = globalThis.fetch; const log = [];
  globalThis.fetch = async (url) => {
    log.push(String(url));
    for (const [brot, gogn] of Object.entries(svor)) {
      if (String(url).includes(brot)) return { ok: gogn.status !== 500, status: gogn.status || 200, json: async () => gogn.d };
    }
    throw new Error('óvænt fetch: ' + url);
  };
  t.after(() => { globalThis.fetch = orig; });
  return log;
}
const GH_ALLT_GOTT = {
  'workflows/ci.yml/runs': { d: { workflow_runs: [{ conclusion: 'success', head_sha: 'abc', created_at: '2026-09-14T10:00:00Z', html_url: 'u' }] } },
  'workflows/cto.yml/runs': { d: { workflow_runs: [] } },
  'commits/main/check-runs': { d: { check_runs: [{ name: 'Workers Builds: karp21', conclusion: 'success', completed_at: '2026-09-14T10:05:00Z', details_url: 'u' }] } },
  'pulls?state=open': { d: [] },
  // 17.9.2026: fimmta uppsprettan — föllnu GAGNAKEYRSLURNAR. Hrafn vaktaði áður aðeins ci/cto, svo
  // rautt næturcrawl hefði hvergi sést (sama gat og lét numbeo liggja dautt í þrjár vikur).
  'actions/runs?status=failure': { d: { workflow_runs: [] } },
};

test('allt í lagi → tómur bilanalisti', async (t) => {
  stubGh(t, GH_ALLT_GOTT);
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.bilanir, []);
});

test('rautt main er HÁ bilun; fallin bygging og gamall PR eru vægari', async (t) => {
  const gamall = new Date(Date.now() - 30 * 86400000).toISOString();
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, {
    'workflows/ci.yml/runs': { d: { workflow_runs: [{ conclusion: 'failure', head_sha: 'abc', created_at: '2026-09-14T10:00:00Z', html_url: 'ci-url' }] } },
    'commits/main/check-runs': { d: { check_runs: [{ name: 'Workers Builds: karp2', conclusion: 'failure', completed_at: '2026-09-14T10:05:00Z', details_url: 'b-url' }] } },
    'pulls?state=open': { d: [{ number: 3, title: 'Gamall PR', created_at: gamall, html_url: 'pr-url', head: { ref: 'x' } }] },
  }));
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  const eftir = (u) => r.bilanir.find((b) => b.uppspretta === u);
  assert.equal(eftir('CI').alvarleiki, 'hatt');
  assert.equal(eftir('Bygging').alvarleiki, 'midlungs');
  assert.equal(eftir('PR').alvarleiki, 'midlungs');
  assert.match(eftir('PR').lysing, /#3/);
});

test('nýlegur opinn PR er EKKI bilun (sjö daga viðmið)', async (t) => {
  const nyr = new Date(Date.now() - 2 * 86400000).toISOString();
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, { 'pulls?state=open': { d: [{ number: 9, title: 'Nýr', created_at: nyr, html_url: 'u', head: { ref: 'y' } }] } }));
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  assert.deepEqual(r.bilanir, []);
});

test('niðurstaðan er geymd og endurnotuð innan 10 mínútna — GitHub er ekki hamrað', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const log = stubGh(t, GH_ALLT_GOTT);
  await saekjaBilanir(env, { thvinga: true });
  const n = log.length;
  const aftur = await saekjaBilanir(env, {});
  assert.equal(log.length, n, 'engin ný GitHub-köll');
  assert.equal(aftur.ok, true);
});

test('GitHub niðri → síðasti þekkti listi heldur sér og villan er merkt', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubGh(t, GH_ALLT_GOTT);
  await saekjaBilanir(env, { thvinga: true });
  globalThis.fetch = async () => { throw new Error('net'); };
  const r = await saekjaBilanir(env, { thvinga: true });
  assert.equal(r.villa, 'github');
  assert.ok(Array.isArray(r.bilanir), 'listinn hverfur ekki þótt GitHub svari ekki');
});

test('án GITHUB_DISPATCH_TOKEN er svarið ostillt en ekki villa', async () => {
  const r = await saekjaBilanir(mkEnv(mkState(), { GITHUB_DISPATCH_TOKEN: '' }), { thvinga: true });
  assert.deepEqual(r, { ok: false, error: 'unconfigured' });
});

test('endapunktur: GET má með lykli, POST verk KREFST lotu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubGh(t, GH_ALLT_GOTT);
  const req = (m, h, b) => new Request('https://karp.is/api/admin/bilanir', { method: m, headers: Object.assign(b ? { 'content-type': 'application/json' } : {}, h), body: b ? JSON.stringify(b) : undefined });
  const js = (r) => r.json();
  assert.deepEqual(await js(await adminBilanirHandler(req('GET', {}), env, {})), { ok: false, error: 'admin' });
  const K = { 'X-Admin-Key': 'adm-key' };
  assert.equal((await js(await adminBilanirHandler(req('GET', K), env, {}))).ok, true);
  assert.deepEqual(await js(await adminBilanirHandler(req('POST', K, { verk: 'laga karp2' }), env, {})), { ok: false, error: 'lota' });
});

test('fallin CTO-keyrsla ratar á listann með vægasta alvarleikanum', async (t) => {
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, {
    'workflows/cto.yml/runs': { d: { workflow_runs: [{ conclusion: 'failure', created_at: '2026-09-14T09:00:00Z', html_url: 'cto-url' }] } },
  }));
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  const b = r.bilanir.find((x) => x.uppspretta === 'CTO');
  assert.ok(b, 'CTO-bilun fannst');
  assert.equal(b.alvarleiki, 'lagt');
  assert.equal(b.slod, 'cto-url');
});

test('ein uppspretta niðri þurrkar ekki út hinar — listinn er hlutbyggður og merktur', async (t) => {
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, {
    'workflows/ci.yml/runs': { d: { workflow_runs: [{ conclusion: 'failure', head_sha: 'abc', created_at: '2026-09-14T10:00:00Z', html_url: 'ci-url' }] } },
    'pulls?state=open': { status: 500, d: { message: 'boom' } },
  }));
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  assert.equal(r.ok, true);
  assert.ok(r.bilanir.some((b) => b.uppspretta === 'CI'), 'rautt main sést þrátt fyrir að PR-uppsprettan félli');
  assert.equal(r.villa, 'hluti');
  assert.deepEqual(r.vantar, ['PR']);
});

test('allar uppsprettur niðri → síðasti þekkti listi stendur og villan er merkt', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, {
    'workflows/ci.yml/runs': { d: { workflow_runs: [{ conclusion: 'failure', head_sha: 'abc', created_at: '2026-09-14T10:00:00Z', html_url: 'ci-url' }] } },
  }));
  await saekjaBilanir(env, { thvinga: true });
  globalThis.fetch = async () => { throw new Error('net'); };
  const r = await saekjaBilanir(env, { thvinga: true });
  assert.equal(r.villa, 'github');
  assert.ok(r.bilanir.some((b) => b.uppspretta === 'CI'), 'gamli listinn hvarf ekki');
});

test('langur listi er klipptur á heilum færslum — geymt JSON þáttast alltaf', async (t) => {
  const state = mkState();
  const margir = Array.from({ length: 60 }, (_, i) => ({ number: i + 1, title: 'x'.repeat(400), created_at: new Date(Date.now() - 30 * 86400000).toISOString(), html_url: 'u' + i, head: { ref: 'b' + i } }));
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, { 'pulls?state=open': { d: margir } }));
  await saekjaBilanir(mkEnv(state), { thvinga: true });
  const geymt = state.bilanir.v;
  assert.ok(geymt.length <= 8000, 'geymt innan marka');
  const þattad = JSON.parse(geymt);   // kastar ef JSON var skorið í sundur
  assert.ok(Array.isArray(þattad.bilanir) && þattad.bilanir.length > 0);
  assert.ok(þattad.bilanir.every((b) => b.lysing.length <= 200));
});

// ── Föllnu gagnakeyrslurnar (17.9.2026) ─────────────────────────────────────
const NUS = Math.floor(Date.parse('2026-09-17T09:00:00Z') / 1000);
const keyrsla = (o) => Object.assign({ conclusion: 'failure', path: '.github/workflows/tengslagrunnur.yml', name: 'Tengslagrunnur', created_at: '2026-09-17T08:47:00Z', html_url: 'u' }, o);

test('fallin gagnakeyrsla ratar á listann', () => {
  const r = fallnarVaktir([keyrsla({})], NUS);
  assert.equal(r.length, 1);
  assert.equal(r[0].uppspretta, 'Vakt');
  assert.ok(r[0].lysing.includes('Tengslagrunnur'));
  assert.equal(r[0].alvarleiki, 'hatt');
});

test('ci og cto eru EKKI tvítilkynnt — þau eiga sín eigin stök', () => {
  const r = fallnarVaktir([
    keyrsla({ path: '.github/workflows/ci.yml', name: 'ci' }),
    keyrsla({ path: '.github/workflows/cto.yml', name: 'cto' }),
  ], NUS);
  assert.equal(r.length, 0);
});

test('aðeins NÝJASTA fallið per vinnuflæði — ekki eitt stak per keyrslu', () => {
  const r = fallnarVaktir([
    keyrsla({ created_at: '2026-09-17T08:47:00Z' }),
    keyrsla({ created_at: '2026-09-16T08:47:00Z' }),
    keyrsla({ created_at: '2026-09-15T08:47:00Z' }),
  ], NUS);
  assert.equal(r.length, 1);
});

test('gamalt fall er ekki frétt', () => {
  assert.equal(fallnarVaktir([keyrsla({ created_at: '2026-09-01T08:47:00Z' })], NUS).length, 0);
});

test('aðeins failure telst bilun', () => {
  for (const c of ['success', 'cancelled', 'skipped', null]) {
    assert.equal(fallnarVaktir([keyrsla({ conclusion: c })], NUS).length, 0, String(c) + ' má ekki teljast bilun');
  }
});

test('rusl fellir ekki listann', () => {
  for (const x of [null, undefined, 'x', 7, [null], [{}]]) assert.ok(Array.isArray(fallnarVaktir(x, NUS)));
});

test('fallin næturkeyrsla birtist í heildarlistanum', async (t) => {
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, {
    'actions/runs?status=failure': { d: { workflow_runs: [{ conclusion: 'failure', path: '.github/workflows/tengslagrunnur.yml', name: 'Tengslagrunnur (næturlegur crawl)', created_at: new Date().toISOString(), html_url: 'u' }] } },
  }));
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  assert.ok(r.bilanir.some((b) => b.uppspretta === 'Vakt' && /Tengslagrunnur/.test(b.lysing)), 'næturcrawlið á að sjást hjá Hrafni');
});
