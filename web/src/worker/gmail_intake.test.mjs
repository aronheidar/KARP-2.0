import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmailIntake, gmailIntakeCron, adminGmailHandler } from './gmail_intake.mjs';
import { _hmac } from './felag.mjs';

// ── Fölsuð D1: tickets + ticket_msgs + stjorn_sync + users ────────────────────────────────────────────────────────
function fakeDb(state) {
  const calls = [];
  const exec = (sql, args) => {
    calls.push({ sql, args });
    if (/^SELECT id FROM tickets WHERE gmail_msgid=\?$/.test(sql)) return Object.values(state.tickets).find((t) => t.gmail_msgid === args[0]) || null;
    if (/^SELECT id FROM ticket_msgs WHERE gmail_msgid=\?$/.test(sql)) return state.msgs.find((m) => m.gmail_msgid === args[0]) || null;
    if (/^SELECT \* FROM tickets WHERE id=\?$/.test(sql)) return state.tickets[args[0]] ? Object.assign({}, state.tickets[args[0]]) : null;
    if (/^INSERT INTO tickets /.test(sql)) {
      const id = state.naesta++;
      state.tickets[id] = { id, created: args[0], updated: args[1], uppruni: args[2], nafn: args[3], netfang: args[4], user_id: args[5], flokkur: args[6], efni: args[7], lysing: args[8], stada: args[9], gmail_thread: args[10], gmail_msgid: args[11], notur: null, cto_pr: null };
      return { meta: { last_row_id: id } };
    }
    if (/^INSERT INTO ticket_msgs /.test(sql)) { state.msgs.push({ ticket_id: args[0], ts: args[1], dir: args[2], sent_by: args[3], fra: args[4], til: args[5], efni: args[6], texti: args[7], gmail_msgid: args[8] }); return { meta: {} }; }
    if (/^UPDATE tickets SET updated=\? WHERE id=\?$/.test(sql)) return { meta: {} };
    if (/^UPDATE tickets SET /.test(sql)) {
      const keys = sql.slice('UPDATE tickets SET '.length, sql.indexOf(', updated=?')).split(', ').map((k) => k.split('=')[0]);
      const t = state.tickets[args[args.length - 1]];
      if (t) keys.forEach((k, i) => { t[k] = args[i]; });
      return { meta: {} };
    }
    if (/SELECT v FROM stjorn_sync WHERE k='hjalp_agent_off'/.test(sql)) return state.sync.hjalp_agent_off != null ? { v: state.sync.hjalp_agent_off } : null;
    if (/SELECT v FROM stjorn_sync WHERE k='email_templates'/.test(sql)) return null;   // engin yfirskrift → innbyggt sniðmát
    if (/SELECT v, updated FROM stjorn_sync WHERE k='gmail_intake'/.test(sql)) return state.sync.gmail_intake || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('gmail_intake'/.test(sql)) { state.sync.gmail_intake = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
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
function mkState(over = {}) { return Object.assign({ tickets: {}, msgs: [], sync: {}, users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } }, naesta: 1 }, over); }
function mkEnv(state, over = {}) {
  return Object.assign({
    TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó',
    GMAIL_CLIENT_ID: 'c', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', GMAIL_FROM: 'Karp <hjalp@karp.is>',
  }, over);   // ⚠ ENGINN ANTHROPIC_API_KEY: greinaTicket fer á lykilorða-fallbakkið → engin AI-köll í prófum
}

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
/** Gmail-póstur eins og API skilar honum. */
function postur(id, { fra, efni, texti = 'Halló, þetta virkar ekki hjá mér og ég kemst ekki inn.', thread = 'th-' + id, auka = [] }) {
  return { id, threadId: thread, snippet: texti.slice(0, 80), payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: fra }, { name: 'Subject', value: efni }, ...auka], body: { data: b64u(texti) } } };
}
/** Stubbar fetch: Google-token, Gmail-listi, Gmail-póstur, Gmail-sending. Skilar log yfir köll. */
function stubFetch(t, { listi = [], postar = {}, listiStatus = 200, listiVilla = '' } = {}) {
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    log.push({ url, body: opts && opts.body });
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    if (String(url).includes('/users/me/messages/send')) return { ok: true, status: 200, json: async () => ({ id: 'sent-1' }) };
    const m = /\/users\/me\/messages\/([^?]+)\?/.exec(String(url));
    if (m) { const p = postar[m[1]]; return { ok: !!p, status: p ? 200 : 404, json: async () => (p || { error: { message: 'not found' } }) }; }
    if (String(url).includes('/users/me/messages?')) {
      if (listiStatus !== 200) return { ok: false, status: listiStatus, json: async () => ({ error: { message: listiVilla } }) };
      return { ok: true, status: 200, json: async () => ({ messages: listi.map((id) => ({ id })) }) };
    }
    throw new Error('óvænt fetch: ' + url);
  };
  t.after(() => { globalThis.fetch = orig; });
  return log;
}
const sendingar = (log) => log.filter((c) => String(c.url).includes('/messages/send')).length;

// ── Heimildir og bilanir ─────────────────────────────────────────────────────────────────────────────────────────
test('403 frá Gmail = tokeninn hefur aðeins send-heimild → error:scope með skilaboðum Google, EKKERT skráð', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { listiStatus: 403, listiVilla: 'Request had insufficient authentication scopes.' });
  const r = await gmailIntake(env, {});
  assert.equal(r.ok, false); assert.equal(r.error, 'scope'); assert.equal(r.status, 403);
  assert.match(r.skilabod, /insufficient authentication scopes/);
  assert.match(r.leit, /to:hjalp@karp\.is/);
  assert.deepEqual(state.tickets, {});
});

test('Gmail-leyndarmál vantar → error:token; önnur villa en 403 → error:gmail', async (t) => {
  const state = mkState();
  assert.deepEqual(await gmailIntake(mkEnv(state, { GMAIL_REFRESH_TOKEN: '' }), {}), { ok: false, error: 'token' });
  stubFetch(t, { listiStatus: 500, listiVilla: 'backend error' });
  const r = await gmailIntake(mkEnv(state), {});
  assert.equal(r.error, 'gmail'); assert.equal(r.status, 500);
});

// ── Nýtt erindi ──────────────────────────────────────────────────────────────────────────────────────────────────
test('nýr póstur → ticket (uppruni gmail, msgid+thread geymd), staðfesting + innri tilkynning send, staða stadfest', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const log = stubFetch(t, { listi: ['m1'], postar: { m1: postur('m1', { fra: 'Anna Björk <anna@example.is>', efni: 'Kemst ekki inn á Kvótavaktina' }) } });
  const r = await gmailIntake(env, {});
  assert.equal(r.ok, true); assert.equal(r.ny, 1); assert.equal(r.svor, 0);
  assert.deepEqual(r.mal, [{ id: 'm1', hvad: 'nytt', ticket: 1, stemmdi_ekki: undefined }]);
  const tk = state.tickets[1];
  assert.equal(tk.uppruni, 'gmail'); assert.equal(tk.netfang, 'anna@example.is'); assert.equal(tk.nafn, 'Anna Björk');
  assert.equal(tk.efni, 'Kemst ekki inn á Kvótavaktina'); assert.equal(tk.gmail_msgid, 'm1'); assert.equal(tk.gmail_thread, 'th-m1');
  assert.equal(tk.stada, 'stadfest', 'engin KB-sjálfvirkni á fallbakks-greiningu → bíður Arons');
  assert.equal(state.msgs[0].dir, 'in'); assert.equal(state.msgs[0].gmail_msgid, 'm1');
  assert.equal(sendingar(log), 2, 'staðfesting á notanda + innri tilkynning á hjalp@');
});

test('neyðarrofinn: engin staðfesting á notanda en ticketið skráist samt (ekkert erindi týnist)', async (t) => {
  const state = mkState({ sync: { hjalp_agent_off: '1' } }); const env = mkEnv(state);
  const log = stubFetch(t, { listi: ['m1'], postar: { m1: postur('m1', { fra: 'anna@example.is', efni: 'Villa' }) } });
  assert.equal((await gmailIntake(env, {})).ny, 1);
  assert.equal(state.tickets[1].stada, 'nytt');
  assert.equal(sendingar(log), 1, 'aðeins innri tilkynning');
});

// ── Lykkjuvarnir og sía ──────────────────────────────────────────────────────────────────────────────────────────
test('LYKKJUVÖRN: póstur frá okkur sjálfum (hjalp@/noreply@/GMAIL_FROM) er aldrei lesinn inn', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { listi: ['a', 'b'], postar: {
    a: postur('a', { fra: 'Karp <hjalp@karp.is>', efni: '[Karp #1] Móttekið' }),
    b: postur('b', { fra: 'Karp <noreply@karp.is>', efni: 'Karp hjálp: ný beiðni' }),
  } });
  const r = await gmailIntake(env, {});
  assert.deepEqual(r.mal.map((x) => x.hvad), ['eigin_postur', 'eigin_postur']);
  assert.equal(r.ny, 0); assert.deepEqual(state.tickets, {});
});

test('sjálfvirk svör, ógilt netfang og tómur texti eru sleppt', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { listi: ['a', 'b', 'c'], postar: {
    a: postur('a', { fra: 'Anna <anna@x.is>', efni: 'Fjarverandi', auka: [{ name: 'Auto-Submitted', value: 'auto-replied' }] }),
    b: postur('b', { fra: 'ekkert-netfang', efni: 'Hmm' }),
    c: postur('c', { fra: 'Anna <anna@x.is>', efni: 'Tómur', texti: '' }),
  } });
  const r = await gmailIntake(env, {});
  // ⚠ Röðin er ÖFUG við Gmail-listann: hann skilar nýjustu efst en erindin eiga að raðast í tímaröð í D1.
  assert.deepEqual(r.mal.map((x) => x.id), ['c', 'b', 'a'], 'elsti póstur unninn fyrst');
  assert.deepEqual(r.mal.map((x) => x.hvad), ['tomur', 'ekkert_netfang', 'sjalfvirkur']);
  assert.deepEqual(state.tickets, {});
});

test('sami Gmail-póstur aldrei tvílesinn — hvorki úr tickets né ticket_msgs', async (t) => {
  const state = mkState({ tickets: { 1: { id: 1, netfang: 'anna@x.is', stada: 'svarad', gmail_msgid: 'm1', efni: 'fyrra' } }, msgs: [{ ticket_id: 1, gmail_msgid: 'm2' }], naesta: 2 });
  const env = mkEnv(state);
  stubFetch(t, { listi: ['m1', 'm2'], postar: {} });
  const r = await gmailIntake(env, {});
  assert.deepEqual(r.mal.map((x) => x.hvad), ['thekkt', 'thekkt']);
  assert.equal(r.ny, 0);
});

// ── Svör við fyrirliggjandi máli ─────────────────────────────────────────────────────────────────────────────────
test('„[Karp #7]" frá SAMA netfangi → ný lína í þræðinum, lokað mál vaknar (stadfest), ekkert svar sent til baka', async (t) => {
  const state = mkState({ tickets: { 7: { id: 7, netfang: 'anna@example.is', stada: 'lokad', efni: 'Villa í verðmati', nafn: 'Anna' } }, naesta: 8 });
  const env = mkEnv(state);
  const log = stubFetch(t, { listi: ['m9'], postar: { m9: postur('m9', { fra: 'Anna <anna@example.is>', efni: 'Re: [Karp #7] Villa í verðmati', texti: 'Takk, en þetta er enn í ólagi.\n\n> fyrra svar frá Sigrúnu' }) } });
  const r = await gmailIntake(env, {});
  assert.equal(r.svor, 1); assert.equal(r.ny, 0);
  assert.deepEqual(r.mal, [{ id: 'm9', hvad: 'svar', ticket: 7 }]);
  assert.equal(state.tickets[7].stada, 'stadfest', 'lokað mál opnast aftur við nýtt erindi');
  assert.deepEqual(state.msgs.map((m) => [m.ticket_id, m.dir, m.sent_by, m.texti, m.gmail_msgid]), [[7, 'in', 'notandi', 'Takk, en þetta er enn í ólagi.', 'm9']]);
  assert.equal(sendingar(log), 1, 'aðeins innri tilkynning á Aron — kerfið svarar ALDREI sjálfkrafa í þræði');
});

test('„[Karp #7]" frá ÖÐRU netfangi lendir EKKI í þræði annars notanda — verður nýtt erindi', async (t) => {
  const state = mkState({ tickets: { 7: { id: 7, netfang: 'anna@example.is', stada: 'svarad', efni: 'Villa' } }, naesta: 8 });
  const env = mkEnv(state);
  stubFetch(t, { listi: ['m9'], postar: { m9: postur('m9', { fra: 'Ókunnur <onnur@annad.is>', efni: '[Karp #7] Gefðu mér aðgang' }) } });
  const r = await gmailIntake(env, {});
  assert.deepEqual(r.mal, [{ id: 'm9', hvad: 'nytt', ticket: 8, stemmdi_ekki: 7 }]);
  assert.equal(state.tickets[7].stada, 'svarad', 'mál Önnu ósnert');
  assert.equal(state.tickets[8].netfang, 'onnur@annad.is');
});

test('mál í CTO-pípunni (cto/tillaga/samthykkt) opnast EKKI aftur við nýtt svar — staðan þar segir hvar málið stendur', async (t) => {
  for (const stada of ['cto', 'tillaga', 'samthykkt']) {
    const state = mkState({ tickets: { 7: { id: 7, netfang: 'a@x.is', stada, efni: 'Villa' } }, naesta: 8 });
    stubFetch(t, { listi: ['m' + stada], postar: { ['m' + stada]: postur('m' + stada, { fra: 'a@x.is', efni: '[Karp #7] meira' }) } });
    assert.equal((await gmailIntake(mkEnv(state), {})).svor, 1, stada);
    assert.equal(state.tickets[7].stada, stada, stada);
  }
});

// ── Þök ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test('þak á nýjum erindum per lotu: afgangurinn bíður næstu keyrslu (og er ekki merktur lesinn)', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { listi: ['m1', 'm2', 'm3'], postar: {
    m1: postur('m1', { fra: 'a@x.is', efni: 'eitt' }), m2: postur('m2', { fra: 'b@x.is', efni: 'tvö' }), m3: postur('m3', { fra: 'c@x.is', efni: 'þrjú' }),
  } });
  const r = await gmailIntake(env, { nyjarMax: 2 });
  assert.equal(r.ny, 2);
  assert.equal(r.mal.filter((x) => x.hvad === 'bidur_naestu_lotu').length, 1);
  assert.equal(Object.keys(state.tickets).length, 2);
});

// ── Umgjörð + endapunktur ────────────────────────────────────────────────────────────────────────────────────────
test('gmailIntakeCron geymir niðurstöðu í stjorn_sync og ver gegn tveimur keyrslum á sömu mínútu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { listi: ['m1'], postar: { m1: postur('m1', { fra: 'a@x.is', efni: 'eitt' }) } });
  const r1 = await gmailIntakeCron(env, {});
  assert.equal(r1.ny, 1);
  const skra = JSON.parse(state.sync.gmail_intake.v);
  assert.equal(skra.ok, true); assert.equal(skra.ny, 1); assert.equal(skra.error, null);
  const r2 = await gmailIntakeCron(env, {});
  assert.equal(r2.bid, true, 'seinni keyrslan innan 60 s bíður');
  assert.equal(r2.sidast.ny, 1);
  assert.equal(Object.keys(state.tickets).length, 1, 'ekkert tvískráð');
  assert.equal((await gmailIntakeCron(env, { thvinga: true })).bid, undefined, 'thvinga sneiðir hjá bið-vörninni');
});

test('/api/admin/gmail: án auðkenningar → admin · GET skilar síðustu keyrslu · POST með lykli sækir · CSRF á kökulotu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { listi: [], postar: {} });
  const req = (method, headers, body) => new Request('https://karp.is/api/admin/gmail', { method, headers: Object.assign(body ? { 'content-type': 'application/json' } : {}, headers), body: body ? JSON.stringify(body) : undefined });
  const js = (r) => r.json();
  assert.deepEqual(await js(await adminGmailHandler(req('GET', {}), env, {})), { ok: false, error: 'admin' });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const notAdmin = { Cookie: 'karp_session=' + encodeURIComponent('9.' + exp + '.' + await _hmac(env, '9.' + exp)) };
  assert.deepEqual(await js(await adminGmailHandler(req('GET', notAdmin), env, {})), { ok: false, error: 'admin' });
  const K = { 'X-Admin-Key': 'adm-key' };
  assert.deepEqual(await js(await adminGmailHandler(req('GET', K), env, {})), { ok: true, sidast: null, uppfaert: null });
  const p = await js(await adminGmailHandler(req('POST', K, { dagar: 3 }), env, {}));
  assert.equal(p.ok, true); assert.equal(p.ny, 0);
  const g = await js(await adminGmailHandler(req('GET', K), env, {}));
  assert.equal(g.sidast.ok, true); assert.ok(g.uppfaert > 0);
  const admin = { Cookie: 'karp_session=' + encodeURIComponent('8.' + exp + '.' + await _hmac(env, '8.' + exp)), Origin: 'https://evil.example' };
  assert.deepEqual(await js(await adminGmailHandler(req('POST', admin, {}), env, {})), { ok: false, error: 'origin' });
  assert.deepEqual(await js(await adminGmailHandler(req('PUT', K), env, {})), { ok: false, error: 'method' });
});
