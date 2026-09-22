// Lykill CTO-keyrslunnar: ein beiðni, tvær klukkustundir, og ekkert annað. Prófað á raunverulegri SQLite
// með migration-skemanu, eins og sigrun_*-prófin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* ekki til — prófum sleppt */ }
const t = DatabaseSync ? test : test.skip;

const { ctoLykill, ctoLykillGildur, ctoHandler, ctoDrogTaka } = await import('./cto_lykill.mjs');
const { adminTicketHandler } = await import('./hjalp_agent.mjs');

const mig = (n) => readFileSync(fileURLToPath(new URL('../../migrations/' + n, import.meta.url)), 'utf8');
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { prepare: (sql) => stmt(sql) };
}
const NU = Math.floor(Date.now() / 1000);
function grunnur() {
  const db = new DatabaseSync(':memory:');
  db.exec(mig('0006_stjorn_sync.sql'));
  db.exec(mig('0015_tickets.sql'));
  db.prepare("INSERT INTO tickets (id, created, updated, netfang, efni, lysing, stada, tegund, flokkur, ai_greining) VALUES (7, ?, ?, 'jon@x.is', 'Kortið', 'Kortið hleðst ekki á síma', 'nytt', 'villa', 'Villa', ?)")
    .run(NU, NU, JSON.stringify({ cto_brief: 'Kortið á /fasteignaverd/ hrynur á iOS', samantekt: 's' }));
  db.prepare("INSERT INTO tickets (id, created, updated, netfang, efni, lysing, stada) VALUES (8, ?, ?, 'anna@x.is', 'Annað', 'Allt annað mál', 'nytt')").run(NU, NU);
  return { db, env: { TENGSL: d1(db), SESSION_SECRET: 'leyndo-profun', ADMIN_API_KEY: 'adm' } };
}
const beidni = (env, id, lykill, moot) => ctoHandler(new Request('https://karp.is/api/cto/beidni?id=' + id, { headers: lykill ? { 'X-CTO-Lykill': lykill } : {} }), env, moot).then((r) => r.json());
const drog = (env, body, lykill) => ctoHandler(new Request('https://karp.is/api/cto/drog', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, lykill ? { 'X-CTO-Lykill': lykill } : {}), body: JSON.stringify(body) }), env).then((r) => r.json());

t('ctoLykillGildur: gildir fyrir SÍNA beiðni í 2 klst — ekki aðra, ekki útrunninn, ekki falsaður', async () => {
  const { env } = grunnur();
  const L = await ctoLykill(env, 7, NU);
  assert.equal(await ctoLykillGildur(env, 7, L, NU + 60), true);
  assert.equal(await ctoLykillGildur(env, 8, L, NU + 60), false, 'annað númer');
  assert.equal(await ctoLykillGildur(env, 7, L, NU + 2 * 3600 + 5), false, 'útrunninn');
  const [exp, sig] = L.split('.');
  assert.equal(await ctoLykillGildur(env, 7, (Number(exp) + 3600) + '.' + sig, NU), false, 'lengdur gildistími brýtur undirskriftina');
  assert.equal(await ctoLykillGildur(env, 7, exp + '.' + sig.slice(0, -2) + 'AA', NU), false);
  assert.equal(await ctoLykillGildur(env, 7, 'rusl', NU), false);
  assert.equal(await ctoLykillGildur(Object.assign({}, env, { SESSION_SECRET: 'annað' }), 7, L, NU), false, 'annar lykill þjónsins');
});

t('/api/cto/beidni: aðeins það sem promptið þarf, og ekkert án gilds lykils', async () => {
  const { env } = grunnur();
  const L = await ctoLykill(env, 7);
  const r = await beidni(env, 7, L, async (_env, id) => (id === 7 ? 'Lagaðu kortið, Aron samþykkti' : ''));
  assert.deepEqual(r, { ok: true, beidni: { id: 7, flokkur: 'Villa', tegund: 'villa', lysing: 'Kortið hleðst ekki á síma', cto_brief: 'Kortið á /fasteignaverd/ hrynur á iOS', moot: 'Lagaðu kortið, Aron samþykkti' } });
  assert.ok(!JSON.stringify(r).includes('jon@x.is'), 'netfang notandans fer ekki út');
  assert.deepEqual(await beidni(env, 8, L), { ok: false, error: 'lykill' }, 'lykill #7 opnar ekki #8');
  assert.deepEqual(await beidni(env, 7, ''), { ok: false, error: 'lykill' });
  assert.deepEqual(await beidni(env, 7, 'adm'), { ok: false, error: 'lykill' }, 'admin-lykillinn er ekki CTO-lykill');
});

t('/api/cto/drog + cto_result: drögin skeytast við samantektina og eyðast svo', async () => {
  const { db, env } = grunnur();
  const L = await ctoLykill(env, 7);
  assert.deepEqual(await drog(env, { id: 8, svar: 'x' }, L), { ok: false, error: 'lykill' }, 'lykill #7 skrifar ekki drög á #8');
  assert.deepEqual(await drog(env, { id: 7, svar: 'Sæl/Sæll {nafn}, kortið er lagað.', hali: 'lok' }, L), { ok: true });
  const orig = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    const res = await adminTicketHandler(new Request('https://karp.is/api/admin/ticket', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Admin-Key': 'adm' },
      body: JSON.stringify({ action: 'cto_result', id: 7, pr: 'https://github.com/aronheidar/KARP-2.0/pull/12', branch: 'cto/ticket-7', samantekt: '## Hvað var að\nKortið.' }) }), env, { waitUntil: () => {} });
    assert.deepEqual(await res.json(), { ok: true });
  } finally { globalThis.fetch = orig; }
  const t7 = db.prepare('SELECT stada, cto_samantekt FROM tickets WHERE id=7').get();
  assert.equal(t7.stada, 'tillaga');
  assert.equal(t7.cto_samantekt, '## Hvað var að\nKortið.\n\n## Tillaga að svari\nSæl/Sæll {nafn}, kortið er lagað.');
  assert.equal(await ctoDrogTaka(env, 7), null, 'drögin eru farin: þau áttu við þessa einu keyrslu');
});

t('adminTicketHandler cto: farmurinn ber lykil sem gildir fyrir beiðnina', async () => {
  const { env } = grunnur();
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o) => { log.push({ url: String(url), body: o && o.body }); return { ok: true, status: 204, json: async () => ({}) }; };
  try {
    const res = await adminTicketHandler(new Request('https://karp.is/api/admin/ticket', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Admin-Key': 'adm' }, body: JSON.stringify({ action: 'cto', id: 7 }) }),
      Object.assign({ GITHUB_DISPATCH_TOKEN: 'ghp' }, env), { waitUntil: () => {} });
    assert.equal((await res.json()).ok, true);
  } finally { globalThis.fetch = orig; }
  const farmur = JSON.parse(log.find((c) => c.url.endsWith('/dispatches')).body).client_payload;
  assert.equal(farmur.ticket, 7);
  assert.equal(await ctoLykillGildur(env, 7, farmur.lykill), true);
});
