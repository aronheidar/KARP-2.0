import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminTicketHandler, sendSvar, ticketsOverview } from './hjalp_agent.mjs';
import { _hmac } from './felag.mjs';

// ── Fölsuð D1: tickets + ticket_msgs + users + stjorn_sync — nóg fyrir svara/samthykkja/nota/stada ─────────────────
function fakeDb(state) {
  const calls = [];
  const exec = (sql, args) => {
    calls.push({ sql, args });
    if (/^SELECT \* FROM tickets WHERE id=\?$/.test(sql)) return state.tickets[args[0]] ? Object.assign({}, state.tickets[args[0]]) : null;
    if (/^UPDATE tickets SET updated=\? WHERE id=\?$/.test(sql)) return { meta: {} };
    if (/^UPDATE tickets SET /.test(sql)) {
      const keys = sql.slice('UPDATE tickets SET '.length, sql.indexOf(', updated=?')).split(', ').map((k) => k.split('=')[0]);
      const t = state.tickets[args[args.length - 1]];
      keys.forEach((k, i) => { t[k] = args[i]; });
      return { meta: {} };
    }
    if (/^INSERT INTO ticket_msgs/.test(sql)) { state.msgs.push({ dir: args[2], sent_by: args[3], til: args[5], efni: args[6], texti: args[7] }); return { meta: {} }; }
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    if (/SELECT v FROM stjorn_sync WHERE k='(\w+)'/.test(sql)) { const k = sql.match(/k='(\w+)'/)[1]; return state.sync[k] != null ? { v: state.sync[k] } : null; }
    if (/^SELECT v FROM stjorn_sync WHERE k=\?$/.test(sql)) { const k = args[0]; return state.sync[k] != null ? { v: state.sync[k] } : null; }
    if (/^INSERT INTO stjorn_sync \(k, v, updated\)/.test(sql)) { state.sync[args[0]] = args[1]; return { meta: {} }; }
    if (/^SELECT k, v FROM stjorn_sync WHERE k IN \('hjalp_agent_off','rofi_hrafn'\)$/.test(sql)) {
      return { results: ['hjalp_agent_off', 'rofi_hrafn'].filter((k) => state.sync[k] != null).map((k) => ({ k, v: state.sync[k] })) };
    }
    // ── ticketsOverview ──────────────────────────────────────────────────────────────────────────────────────────
    if (/^SELECT id, created, updated, uppruni, nafn, netfang, flokkur, tegund, forgangur, efni, lysing, stada, ack_sent, svar_sent, cto_pr FROM tickets ORDER BY created DESC LIMIT 60$/.test(sql)) return { results: Object.values(state.tickets) };
    if (/^SELECT m\.ticket_id, MAX\(CASE WHEN m\.sent_by='moot' THEN m\.ts END\) t_moot, MAX\(CASE WHEN m\.sent_by='aron' THEN m\.ts END\) t_atkv FROM ticket_msgs m JOIN tickets t ON t\.id=m\.ticket_id WHERE m\.dir='moot' AND t\.stada IN \([?,]+\) GROUP BY m\.ticket_id$/.test(sql)) return { results: [] };
    if (/^SELECT m\.ticket_id, m\.ts, m\.meta, t\.svar_sent FROM ticket_msgs m JOIN tickets t ON t\.id=m\.ticket_id WHERE m\.dir='moot' AND m\.sent_by='aron' AND t\.stada IN \([?,]+\) ORDER BY m\.ts DESC, m\.id DESC$/.test(sql)) return { results: [] };
    if (/^SELECT COUNT\(\*\) n FROM tickets t WHERE t\.svar_sent IS NOT NULL AND NOT EXISTS/.test(sql)) {
      const aronSvaradi = new Set(state.msgs.filter((m) => m.dir === 'out' && m.sent_by === 'aron').map((m) => m.ticket_id));
      return { n: Object.values(state.tickets).filter((t) => t.svar_sent && !aronSvaradi.has(t.id)).length };
    }
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return {
    calls,
    prepare(sql) {
      let args = [];
      const st = { bind(...a) { args = a; return st; }, async first() { return exec(sql, args); }, async all() { return exec(sql, args); }, async run() { return exec(sql, args); } };
      return st;
    },
  };
}
const TICKET = { id: 1, created: 1789311176, updated: 1789311176, uppruni: 'form', nafn: 'Aron (prufa)', netfang: 'aron@karp.is', flokkur: 'Villa', tegund: 'villa', forgangur: 1, efni: 'Leirdalur 36 á síma', lysing: 'Spjaldið fer út af skjánum.', stada: 'tillaga', notur: null, cto_pr: 'https://github.com/aronheidar/KARP-2.0/pull/10', cto_branch: 'cto/ticket-1' };
function mkState(over = {}) { return { tickets: { 1: Object.assign({}, TICKET, over) }, msgs: [], users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } }, sync: {} }; }
function mkEnv(state, over = {}) {
  return Object.assign({ TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', GITHUB_DISPATCH_TOKEN: 'ghp_test', GMAIL_CLIENT_ID: 'c', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r' }, over);
}
/** fetch-stubbur sem þekkir Gmail-token, Gmail-send og GitHub-dispatch á slóð; skilar log. */
function stubFetch(t, { dispatchStatus = 204 } = {}) {
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    log.push({ url, body: opts && opts.body });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    if (url.startsWith('https://gmail.googleapis.com/')) return { ok: true, status: 200, json: async () => ({ id: 'm1' }) };
    if (url === 'https://api.github.com/repos/aronheidar/KARP-2.0/dispatches') return { ok: dispatchStatus === 204, status: dispatchStatus, json: async () => ({}) };
    throw new Error('óvænt fetch: ' + url);
  };
  t.after(() => { globalThis.fetch = orig; });
  return log;
}
async function cookieFor(env, uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return 'karp_session=' + encodeURIComponent(uid + '.' + exp + '.' + await _hmac(env, uid + '.' + exp));
}
const req = (body, headers) => new Request('https://karp.is/api/admin/ticket', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(body) });
const js = (res) => res.json();
const dispatches = (log) => log.filter((c) => c.url.endsWith('/dispatches')).map((c) => JSON.parse(c.body));

// ── sendSvar: stöðuvélin tapar ekki samþykki/CTO-stöðu við svar ─────────────────────────────────────────────────
test('sendSvar: úr stadfest → svarad; úr tillaga/samthykkt/cto/lokad heldur stöðunni en skráir svar_sent (gallinn á #1 13.9)', async (t) => {
  stubFetch(t);
  for (const [fra, til] of [['nytt', 'svarad'], ['stadfest', 'svarad'], ['svarad', 'svarad'], ['cto', 'cto'], ['tillaga', 'tillaga'], ['samthykkt', 'samthykkt'], ['lagad', 'lagad'], ['lokad', 'lokad'], ['hafnad', 'hafnad']]) {
    const state = mkState({ stada: fra }); const env = mkEnv(state);
    const r = await sendSvar(env, state.tickets[1], 'Sæll Aron,\n\ntakk.\n\nBestu kveðjur,', 'aron');
    assert.equal(r.ok, true, fra);
    assert.equal(state.tickets[1].stada, til, fra + ' → ' + til);
    assert.ok(state.tickets[1].svar_sent > 0, 'svar_sent skráð úr ' + fra);
    assert.equal(state.msgs.length, 1); assert.equal(state.msgs[0].dir, 'out'); assert.equal(state.msgs[0].sent_by, 'aron');
  }
});

// ── samthykkja ───────────────────────────────────────────────────────────────────────────────────────────────────
test('samthykkja: X-Admin-Key HAFNAÐ (lota) — engin staða breytt, enginn dispatch', async (t) => {
  const state = mkState(); const env = mkEnv(state); const log = stubFetch(t);
  assert.deepEqual(await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, { 'X-Admin-Key': 'adm-key' }), env, {})), { ok: false, error: 'lota' });
  assert.equal(state.tickets[1].stada, 'tillaga'); assert.deepEqual(dispatches(log), []);
});

test('samthykkja með admin-lotu: staða samthykkt + samthykkt_by/at, dispatch cto_merge {ticket, pr}, nóta skráð', async (t) => {
  const state = mkState(); const env = mkEnv(state); const log = stubFetch(t);
  const C = { Cookie: await cookieFor(env, 8) };
  const r = await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, C), env, {}));
  assert.deepEqual(r, { ok: true, merge: { ok: true, status: 204 } });
  const tk = state.tickets[1];
  assert.equal(tk.stada, 'samthykkt'); assert.equal(tk.samthykkt_by, 8); assert.ok(tk.samthykkt_at > 1700000000);
  assert.deepEqual(dispatches(log), [{ event_type: 'cto_merge', client_payload: { ticket: 1, pr: 'https://github.com/aronheidar/KARP-2.0/pull/10' } }]);
  assert.match(tk.notur, /Samþykkt — merge\+deploy ræst \(cto_merge\)/);
  assert.equal(state.msgs.length, 0, 'enginn póstur — lokapósturinn kemur úr cto_merge.yml eftir deploy');
});

test('samthykkja: dispatch bregst (GitHub 401) → staðan verður SAMT samthykkt, merge.ok=false og nótan segir „handvirkt"', async (t) => {
  const state = mkState(); const env = mkEnv(state); stubFetch(t, { dispatchStatus: 401 });
  const r = await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, { Cookie: await cookieFor(env, 8) }), env, {}));
  assert.deepEqual(r, { ok: true, merge: { ok: false, status: 401 } });
  assert.equal(state.tickets[1].stada, 'samthykkt'); assert.match(state.tickets[1].notur, /EKKI af stað \(401\).*handvirkt/);
});

test('samthykkja: án GITHUB_DISPATCH_TOKEN → merge.error unconfigured; enginn/ógildur cto_pr → engin_pr; lokað ticket → stada; ekki-admin → admin', async (t) => {
  stubFetch(t);
  { const state = mkState(); const env = mkEnv(state, { GITHUB_DISPATCH_TOKEN: '' });
    assert.deepEqual(await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, { Cookie: await cookieFor(env, 8) }), env, {})), { ok: true, merge: { ok: false, error: 'unconfigured' } });
    assert.equal(state.tickets[1].stada, 'samthykkt'); }
  for (const pr of [null, '', 'https://github.com/evil/repo/pull/3', 'https://github.com/aronheidar/KARP-2.0/compare/main...cto/ticket-1']) {
    const state = mkState({ cto_pr: pr }); const env = mkEnv(state);
    assert.deepEqual(await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, { Cookie: await cookieFor(env, 8) }), env, {})), { ok: false, error: 'engin_pr' }, String(pr));
    assert.equal(state.tickets[1].stada, 'tillaga');
  }
  { const state = mkState({ stada: 'lokad' }); const env = mkEnv(state);
    assert.deepEqual(await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, { Cookie: await cookieFor(env, 8) }), env, {})), { ok: false, error: 'stada' }); }
  { const state = mkState(); const env = mkEnv(state);
    assert.deepEqual(await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, { Cookie: await cookieFor(env, 9) }), env, {})), { ok: false, error: 'admin' }); }
});

test('samthykkja: CSRF-gátin gildir um kökulotu-leiðina (Origin annars staðar frá → origin)', async (t) => {
  const state = mkState(); const env = mkEnv(state); stubFetch(t);
  assert.deepEqual(await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, { Cookie: await cookieFor(env, 8), Origin: 'https://evil.example' }), env, {})), { ok: false, error: 'origin' });
  assert.equal(state.tickets[1].stada, 'tillaga');
});

test('cto: dispatch ber event_type cto {ticket} (óbreytt eftir _ghDispatch-samruna) og staða → cto', async (t) => {
  const state = mkState({ stada: 'stadfest' }); const env = mkEnv(state); const log = stubFetch(t);
  assert.deepEqual(await js(await adminTicketHandler(req({ action: 'cto', id: 1 }, { 'X-Admin-Key': 'adm-key' }), env, {})), { ok: true, status: 204 });
  assert.deepEqual(dispatches(log), [{ event_type: 'cto', client_payload: { ticket: 1 } }]);
  assert.equal(state.tickets[1].stada, 'cto');
});

// ── rofi per starfsmann ──────────────────────────────────────────────────────────────────────────────────────────
test('rofi: sjálfgefið er Sigrún (gamla hegðunin) en starfsmadur velur lykilinn', async (t) => {
  const state = mkState(); const env = mkEnv(state); stubFetch(t);
  await js(await adminTicketHandler(req({ action: 'rofi', off: true }, { 'X-Admin-Key': 'adm-key' }), env, {}));
  assert.equal(state.sync.hjalp_agent_off, '1', 'án starfsmanns fer rofinn á Sigrúnu — ekkert brotnar hjá þeim sem kalla eins og áður');
  await js(await adminTicketHandler(req({ action: 'rofi', starfsmadur: 'hrafn', off: true }, { 'X-Admin-Key': 'adm-key' }), env, {}));
  assert.equal(state.sync.rofi_hrafn, '1');
  assert.deepEqual(await js(await adminTicketHandler(req({ action: 'rofi', starfsmadur: 'kari', off: true }, { 'X-Admin-Key': 'adm-key' }), env, {})), { ok: false, error: 'starfsmadur' });
});

test('slökkt á Hrafni stöðvar CTO-ræsingu — engin dispatch fer út', async (t) => {
  const state = mkState({ stada: 'stadfest' }); state.sync.rofi_hrafn = '1';
  const env = mkEnv(state); const log = stubFetch(t);
  assert.deepEqual(await js(await adminTicketHandler(req({ action: 'cto', id: 1 }, { 'X-Admin-Key': 'adm-key' }), env, {})), { ok: false, error: 'rofi' });
  assert.deepEqual(dispatches(log), []);
  assert.equal(state.tickets[1].stada, 'stadfest', 'staðan hreyfist ekki');
});

test('rofi Hrafns stöðvar sjálfstæða vinnu en ekki samþykki Arons sjálfs á tillögu sem liggur fyrir', async (t) => {
  const state = mkState({ stada: 'tillaga' }); state.sync.rofi_hrafn = '1';
  const env = mkEnv(state); const log = stubFetch(t);
  const C = { Cookie: await cookieFor(env, 8) };
  const r = await js(await adminTicketHandler(req({ action: 'samthykkja', id: 1 }, C), env, {}));
  assert.equal(r.ok, true, 'Aron má samþykkja þótt slökkt sé á Hrafni — hann les tillöguna sjálfur');
  assert.deepEqual(dispatches(log).map((d) => d.event_type), ['cto_merge']);
  assert.equal(state.tickets[1].stada, 'samthykkt');
});

// ── ticketsOverview: sjalfvirk ───────────────────────────────────────────────────────────────────────────────────
test('sjalfvirk telur mál sem agentinn kláraði — ekki þau sem fengu bara staðfestingu, og ekki þau sem Aron svaraði', async () => {
  const state = mkState();
  // A: aðeins sjálfvirk staðfesting — ekkert efnislegt svar fór út
  state.tickets[1] = Object.assign({}, state.tickets[1], { id: 1, stada: 'stadfest', ack_sent: 100, svar_sent: null });
  state.msgs.push({ ticket_id: 1, dir: 'out', sent_by: 'agent', texti: 'Móttekið' });
  // B: staðfesting OG orðrétt KB-svar frá agentinum → ÞETTA er „leyst án þín"
  state.tickets[2] = { id: 2, stada: 'svarad', created: 1, updated: 2, efni: 'B', netfang: 'b@x.is', ack_sent: 100, svar_sent: 200, cto_pr: null };
  state.msgs.push({ ticket_id: 2, dir: 'out', sent_by: 'agent', texti: 'Móttekið' }, { ticket_id: 2, dir: 'out', sent_by: 'agent', texti: 'KB-svar' });
  // C: staðfesting og svo svaraði Aron sjálfur → telst EKKI
  state.tickets[3] = { id: 3, stada: 'svarad', created: 1, updated: 2, efni: 'C', netfang: 'c@x.is', ack_sent: 100, svar_sent: 300, cto_pr: null };
  state.msgs.push({ ticket_id: 3, dir: 'out', sent_by: 'agent', texti: 'Móttekið' }, { ticket_id: 3, dir: 'out', sent_by: 'aron', texti: 'Svar Arons' });

  const r = await ticketsOverview(mkEnv(state));
  assert.equal(r.sjalfvirk, 1, 'aðeins mál B — staðfesting ein og sér er ekki lausn, og mál Arons telst ekki');
});

test('ticketsOverview skilar rofa-stöðum beggja starfsmanna úr stjorn_sync', async () => {
  const state = mkState();
  state.sync.rofi_hrafn = '1';
  state.sync.hjalp_agent_off = '0';
  const r = await ticketsOverview(mkEnv(state));
  assert.equal(r.rofar.rofi_hrafn, true, 'slökkt á Hrafni skilar sér');
  assert.equal(r.rofar.hjalp_agent_off, false, 'kveikt á Sigrúnu skilar sér');
});

// ── Sigrún sem starfsmaður ──────────────────────────────────────────────────────────────────────────────────
test('Sigrúnar-aðgerðir: X-Admin-Key HAFNAÐ (lota) — CTO-keyrslan ber lykilinn og les texta notenda', async (t) => {
  const state = mkState(); const env = mkEnv(state); const log = stubFetch(t);
  for (const action of ['sigrun_vika', 'sigrun_tillaga', 'sigrun_spjall', 'loka_margt']) {
    assert.deepEqual(await js(await adminTicketHandler(req({ action, ids: [1], texti: 'lokaðu öllu', fra: 0, til: 0 }, { 'X-Admin-Key': 'adm-key' }), env, {})),
      { ok: false, error: 'lota' }, action);
  }
  assert.equal(state.tickets[1].stada, 'tillaga', 'engu lokað');
  assert.equal(log.length, 0, 'enginn Claude-kall, engin sending');
});

test('stada: atburður skráist aðeins þegar staðan BREYTIST — endurlokun færir hann ekki í nýja viku', async (t) => {
  const state = mkState(); const env = mkEnv(state); stubFetch(t);
  const atb = () => env.TENGSL.calls.filter((c) => (c.args || []).some((x) => String(x).startsWith('atb:lokad:'))).length;
  await adminTicketHandler(req({ action: 'stada', id: 1, stada: 'lokad' }, { 'X-Admin-Key': 'adm-key' }), env, {});
  assert.equal(state.tickets[1].stada, 'lokad');
  assert.equal(atb(), 1, 'fyrsta lokun skráð');
  await adminTicketHandler(req({ action: 'stada', id: 1, stada: 'lokad' }, { 'X-Admin-Key': 'adm-key' }), env, {});
  assert.equal(atb(), 1, 'endurlokun skráir EKKI nýjan atburð');
});
