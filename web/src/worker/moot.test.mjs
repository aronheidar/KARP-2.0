import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haldaMoot, adminMootHandler, mootPrompt, parseMoot, mootRateOk, mootKostnadur } from './moot.mjs';
import { _hmac } from './felag.mjs';
import { MOOT_ADGERDIR, PERSONA_IDS } from '../lib/personur.mjs';

// ── Fölsuð D1 (env.TENGSL) með lifandi ticket_msgs svo halda → GET → atkvaedi keyri á sömu gögnum ──────────────
function fakeDb(state) {
  const calls = [];
  const exec = (sql, args) => {
    calls.push({ sql, args });
    if (/^INSERT INTO ticket_msgs/.test(sql)) {
      const [ticket_id, ts, dir, sent_by, fra, til, efni, texti, gmail_msgid, meta] = args;
      if (state.failNid && dir === 'moot' && sent_by === 'moot') throw new Error('D1_ERROR: 7403 (hermt lestrarþak)');
      state.msgs.push({ id: state.msgs.length + 1, ticket_id, ts, dir, sent_by, fra, til, efni, texti, gmail_msgid, meta });
      return { meta: {} };
    }
    if (/^UPDATE tickets SET updated=\? WHERE id=\?$/.test(sql)) { state.updated.push(args[1]); return { meta: {} }; }
    if (/^UPDATE tickets SET /.test(sql)) throw new Error('Moot má ALDREI breyta tickets nema updated: ' + sql);
    // Lás-lykill (bundinn k): INSERT … ON CONFLICT DO UPDATE … WHERE CAST(v AS INTEGER) < ? → SQLite changes()=0 ef WHERE fellur
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \(\?, \?, \?\) ON CONFLICT\(k\) DO UPDATE .* WHERE CAST\(stjorn_sync\.v AS INTEGER\) < \?$/.test(sql)) {
      const [k, v, , floor] = args;
      if (state.sync[k] != null && Number(state.sync[k]) >= floor) return { meta: { changes: 0 } };
      state.sync[k] = v; return { meta: { changes: 1 } };
    }
    if (/^INSERT INTO stjorn_sync/.test(sql)) { state.sync[sql.match(/VALUES \('(\w+)'/)[1]] = args[0]; return { meta: { changes: 1 } }; }
    if (/SELECT v FROM stjorn_sync WHERE k='(\w+)'/.test(sql)) { const k = sql.match(/k='(\w+)'/)[1]; return state.sync[k] != null ? { v: state.sync[k] } : null; }
    if (/SELECT MAX\(ts\) ts FROM ticket_msgs/.test(sql)) {
      const r = state.msgs.filter((m) => m.ticket_id === args[0] && m.dir === 'moot' && ['moot', 'moot_fall'].includes(m.sent_by));
      return { ts: r.length ? Math.max(...r.map((m) => m.ts)) : null };
    }
    if (/FROM ticket_msgs WHERE ticket_id=\? AND dir IN \('in','out'\)/.test(sql)) {
      return { results: state.msgs.filter((m) => m.ticket_id === args[0] && ['in', 'out'].includes(m.dir)).sort((a, b) => (b.ts - a.ts) || (b.id - a.id)).slice(0, 6) };
    }
    if (/FROM ticket_msgs WHERE ticket_id=\? AND dir='moot' ORDER BY ts, id/.test(sql)) {
      return { results: state.msgs.filter((m) => m.ticket_id === args[0] && m.dir === 'moot').sort((a, b) => (a.ts - b.ts) || (a.id - b.id)) };
    }
    if (/FROM tickets WHERE id=\?/.test(sql)) return state.tickets[args[0]] || null;
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

const TICKET = { id: 7, created: 1757700000, updated: 1757700000, uppruni: 'form', nafn: 'Anna Björk', netfang: 'anna@example.is', user_id: 55, flokkur: 'Villa í gögnum', tegund: 'villa', forgangur: 1,
  efni: 'Röng tala á verðmati', lysing: 'Verðmatið á Leirdal 36 sýnir ranga tölu. Þetta er endurtakanlegt.', stada: 'stadfest', ai_greining: JSON.stringify({ tegund: 'villa', forgangur: 1, samantekt: 'Notandi sér ranga tölu.' }), notur: null, cto_pr: null };

function mkState(extra = {}) {
  return Object.assign({ tickets: { 7: Object.assign({}, TICKET) }, msgs: [{ id: 1, ticket_id: 7, ts: 1757700000, dir: 'in', sent_by: 'notandi', texti: TICKET.lysing, meta: null }], sync: {}, users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } }, updated: [] }, extra);
}
function mkEnv(state, over = {}) { return Object.assign({ TENGSL: fakeDb(state), ANTHROPIC_API_KEY: 'sk-test', ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó' }, over); }

const SVAR_OK = {
  innlegg: [
    { persona: 'sigrun', texti: 'Notandinn treystir ekki tölunni og þarf skýrt svar um hvaðan hún kemur.' },
    { persona: 'hrafn', texti: 'Tilgáta: matssvæðið vísar á gamla töflu. Endurtakanlegt — þetta er kóðabreyting.' },
    { persona: 'unnur', texti: 'Ósammála Hrafni: heimildin er kaupskrá HMS og hún er fersk. Notandinn les svæðismeðaltal sem stakt mat.' },
  ],
  nidurstada: { tillaga: 'Ágreiningur milli Hrafns og Unnar um rót. Tillaga: Hrafn fær brief og skoðar hvort svæðismeðaltal birtist sem stakt mat.', adgerd: 'cto', svar: '', cto_brief: 'Hvar: /fasteignaverd/ · Hvað gerist: svæðismeðaltal birtist í reit fyrir stakt verðmat · Ætti: stakt mat · Skref: opna Leirdal 36.', atkvaedi: { sigrun: 'med', hrafn: 'med', unnur: 'hja' }, ahaetta: 'lag', naesta_skref: 'Hrafn staðfestir tilgátuna í kóða.', injection: false },
};
const apiSvar = (obj, over = {}) => Object.assign({ id: 'msg_1', model: 'claude-sonnet-5', stop_reason: 'end_turn', content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], usage: { input_tokens: 4000, output_tokens: 900 } }, over);

/** Stubbar globalThis.fetch með röð svara; skilar log yfir köll. `t` = node:test context → endurheimt sjálfkrafa. */
function stubFetch(t, responses) {
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    log.push({ url, headers: opts.headers, body, timeout: !!opts.signal });
    const r = responses[Math.min(log.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return { ok: r.status === 200, status: r.status, json: async () => r.json };
  };
  t.after(() => { globalThis.fetch = orig; });
  return log;
}

async function cookieFor(env, uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return 'karp_session=' + encodeURIComponent(uid + '.' + exp + '.' + await _hmac(env, uid + '.' + exp));
}
// content-type: application/json fylgir bodý-beiðnum eins og fetch() á /stjorn/ sendir — CSRF-gátin krefst þess af kökulotu-leiðinni
const req = (method, url, { body, headers } = {}) => new Request('https://karp.is' + url, { method, headers: Object.assign(body ? { 'content-type': 'application/json' } : {}, headers || {}), body: body ? JSON.stringify(body) : undefined });
const js = async (res) => res.json();

// ── haldaMoot ────────────────────────────────────────────────────────────────────────────────────────────────────
test('haldaMoot: lykill vantar → error lykill og ENGIN röð skrifuð, ekkert fetch', async (t) => {
  const state = mkState(); const env = mkEnv(state, { ANTHROPIC_API_KEY: '' });
  const log = stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const r = await haldaMoot(env, state.tickets[7]);
  assert.deepEqual(r, { ok: false, error: 'lykill' });
  assert.equal(state.msgs.length, 1, 'engin ný röð');
  assert.equal(log.length, 0);
  assert.equal(state.sync.moot_dagur, undefined, 'dagteljari ósnortinn');
});

test('haldaMoot: happy path — EITT Sonnet-kall með réttu formi, innlegg í röð + niðurstöðuröð, dagteljari, staða ÓBREYTT', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const log = stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const r = await haldaMoot(env, state.tickets[7]);
  assert.equal(r.ok, true, JSON.stringify(r));
  // kallið
  assert.equal(log.length, 1, 'eitt kall');
  assert.equal(log[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(log[0].headers['x-api-key'], 'sk-test'); assert.equal(log[0].headers['anthropic-version'], '2023-06-01');
  const b = log[0].body;
  assert.equal(b.model, 'claude-sonnet-5'); assert.equal(b.max_tokens, 3500); assert.deepEqual(b.thinking, { type: 'disabled' });
  assert.ok(!('temperature' in b) && !('top_p' in b) && !('top_k' in b) && !('output_config' in b), 'engin sampling-gildi (Sonnet 5 → 400)');
  assert.equal(b.messages.length, 1); assert.equal(b.messages[0].role, 'user');
  assert.equal(b.system, mootPrompt(['sigrun', 'hrafn', 'unnur', 'kari']));
  assert.ok(b.messages[0].content.includes('<erindi>') && b.messages[0].content.includes('Leirdal 36'));
  assert.ok(!b.messages[0].content.includes('anna@example.is') && !b.messages[0].content.includes('Björk'), 'PII fer ekki');
  assert.ok(log[0].timeout, 'AbortSignal sett');
  // svarið
  assert.deepEqual(r.fundarmenn, ['sigrun', 'hrafn', 'unnur', 'kari']);
  assert.equal(r.innlegg.length, 3); assert.equal(r.nidurstada.adgerd, 'cto'); assert.equal(r.model, 'claude-sonnet-5');
  assert.deepEqual(r.usage, { in: 4000, out: 900 }); assert.equal(r.usd, mootKostnadur({ in: 4000, out: 900 }, 'claude-sonnet-5')); assert.equal(r.usd, 0.017);
  assert.equal(r.atkvaedi_arons, null); assert.equal(r.bid.ok, false);
  assert.ok(r.ts >= r.moot, 'ts = það sem skrifaðist (eftir kallið), ekki mtNow');
  assert.equal(r.bid.naest, r.ts + 3600, 'naest samkvæmt þjóninum (MAX(ts) raðanna)');
  assert.equal(r.stada_tha, 'stadfest'); assert.equal(r.fyrri, 1, 'fyrsti fundur um málið');
  assert.equal(state.sync.moot_lock_7, String(r.moot), 'lásinn tekinn (ts fundarins)');
  // raðirnar
  const moot = state.msgs.filter((m) => m.dir === 'moot');
  assert.deepEqual(moot.map((m) => m.sent_by), ['sigrun', 'hrafn', 'unnur', 'moot'], 'innlegg í ræðuröð, niðurstaða SÍÐAST');
  assert.deepEqual(moot.slice(0, 3).map((m) => JSON.parse(m.meta)), [{ moot: r.moot, rod: 0 }, { moot: r.moot, rod: 1 }, { moot: r.moot, rod: 2 }]);
  assert.equal(moot[0].efni, 'Moot ' + r.moot);
  const nid = moot[3]; const meta = JSON.parse(nid.meta);
  assert.equal(nid.efni, 'Niðurstaða Moot'); assert.equal(nid.texti, SVAR_OK.nidurstada.tillaga);
  assert.equal(meta.moot, r.moot); assert.deepEqual(meta.fundarmenn, r.fundarmenn); assert.equal(meta.nidurstada.adgerd, 'cto'); assert.equal(meta.stada_tha, 'stadfest'); assert.equal(meta.usd, 0.017); assert.equal(meta.model, 'claude-sonnet-5');
  assert.ok(nid.meta.length < 8000, 'meta innan 8000-þaks logMsg: ' + nid.meta.length);
  // dagteljari
  const dag = JSON.parse(state.sync.moot_dagur);
  assert.equal(dag.d, new Date().toISOString().slice(0, 10)); assert.equal(dag.n, 1); assert.equal(dag.usd, 0.017);
  // ticket ósnortið nema updated
  assert.equal(state.tickets[7].stada, 'stadfest');
  assert.ok(state.updated.length >= 4, 'aðeins updated hnikast (um logMsg)');
  assert.ok(!env.TENGSL.calls.some((c) => /UPDATE tickets SET (stada|ai_greining|tegund)/.test(c.sql)), 'engin stöðubreyting');
});

test('haldaMoot: klst-þak — nýleg niðurstaða → bid með naest; mistök (moot_fall) telja líka', async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const state = mkState(); state.msgs.push({ id: 2, ticket_id: 7, ts: now - 600, dir: 'moot', sent_by: 'moot_fall', texti: 'Moot féll: parse', meta: JSON.stringify({ moot: now - 600, error: 'parse' }) });
  const env = mkEnv(state); const log = stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const r = await haldaMoot(env, state.tickets[7]);
  assert.equal(r.ok, false); assert.equal(r.error, 'bid'); assert.equal(r.naest, now - 600 + 3600); assert.equal(r.sidast, now - 600);
  assert.equal(log.length, 0, 'ekkert kall');
  assert.equal(mootRateOk(now - 600, now, 3600), false);
  // MOOT_BIL_SEK stillanlegt
  const r2 = await haldaMoot(mkEnv(state, { MOOT_BIL_SEK: '300' }), state.tickets[7]);
  assert.equal(r2.ok, true, 'með 5 mín bili má halda aftur: ' + JSON.stringify(r2));
});

test('haldaMoot: dagþak — n ≥ MOOT_DAG_MAX → dagthak án kalls; nýr dagur núllstillir', async (t) => {
  const today = new Date().toISOString().slice(0, 10);
  const state = mkState({ sync: { moot_dagur: JSON.stringify({ d: today, n: 25, usd: 1.1 }) } });
  const log = stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const r = await haldaMoot(mkEnv(state), state.tickets[7]);
  assert.equal(r.error, 'dagthak'); assert.equal(r.n, 25); assert.equal(r.max, 25); assert.equal(log.length, 0);
  const r2 = await haldaMoot(mkEnv(state, { MOOT_DAG_MAX: '30' }), state.tickets[7]);
  assert.equal(r2.ok, true, 'hærra þak úr env');
  assert.equal(JSON.parse(state.sync.moot_dagur).n, 26);
  // gamall dagur → núllstillt
  const state3 = mkState({ sync: { moot_dagur: JSON.stringify({ d: '2020-01-01', n: 999, usd: 50 }) } });
  const r3 = await haldaMoot(mkEnv(state3), state3.tickets[7]);
  assert.equal(r3.ok, true); assert.deepEqual(JSON.parse(state3.sync.moot_dagur), { d: today, n: 1, usd: 0.017 });
});

test('haldaMoot: 529 á Sonnet → EINN endurtekningur á Haiku ÁN thinking-lykils; kostnaður á Haiku-verði', async (t) => {
  const state = mkState();
  const log = stubFetch(t, [{ status: 529, json: { error: 'overloaded' } }, { status: 200, json: apiSvar(SVAR_OK, { model: 'claude-haiku-4-5-20251001' }) }]);
  const r = await haldaMoot(mkEnv(state), state.tickets[7]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(log.length, 2);
  assert.equal(log[1].body.model, 'claude-haiku-4-5-20251001'); assert.ok(!('thinking' in log[1].body), 'Haiku 4.5 tekur ekki thinking:disabled');
  assert.equal(log[1].body.system, log[0].body.system, 'sama prompt');
  assert.equal(r.model, 'claude-haiku-4-5-20251001'); assert.equal(r.usd, 0.0085);
});

test('haldaMoot: 400 á Sonnet → ekkert fall, moot_fall-röð "ai 400", dagteljari n+1 (mistök telja)', async (t) => {
  const state = mkState();
  const log = stubFetch(t, [{ status: 400, json: { error: 'bad' } }]);
  const r = await haldaMoot(mkEnv(state), state.tickets[7]);
  assert.deepEqual([r.ok, r.error], [false, 'ai 400']); assert.ok(r.moot > 0);
  assert.equal(log.length, 1, 'ekki endurtekið á 400');
  const fall = state.msgs.filter((m) => m.sent_by === 'moot_fall');
  assert.equal(fall.length, 1); assert.equal(fall[0].texti, 'Moot féll: ai 400'); assert.equal(fall[0].efni, 'Moot féll');
  const meta = JSON.parse(fall[0].meta); assert.equal(meta.moot, r.moot); assert.equal(meta.error, 'ai 400'); assert.equal(meta.model, 'claude-sonnet-5');
  assert.equal(JSON.parse(state.sync.moot_dagur).n, 1);
  assert.equal(state.msgs.filter((m) => PERSONA_IDS.includes(m.sent_by)).length, 0, 'engin fölsuð samræða');
});

test('haldaMoot: fall bregst líka (503 → 503) → "ai 503" á fall-módelinu', async (t) => {
  const state = mkState();
  stubFetch(t, [{ status: 503, json: {} }, { status: 503, json: {} }]);
  const r = await haldaMoot(mkEnv(state), state.tickets[7]);
  assert.equal(r.error, 'ai 503');
  assert.equal(JSON.parse(state.msgs.find((m) => m.sent_by === 'moot_fall').meta).model, 'claude-haiku-4-5-20251001');
});

test('haldaMoot: fetch kastar (timeout/net) → timi + moot_fall-röð', async (t) => {
  const state = mkState();
  stubFetch(t, [new Error('The operation was aborted due to timeout')]);
  const r = await haldaMoot(mkEnv(state), state.tickets[7]);
  assert.equal(r.error, 'timi');
  assert.equal(state.msgs.filter((m) => m.sent_by === 'moot_fall').length, 1);
});

test('haldaMoot: óþáttanlegt svar → parse m/ ástæðu; stop_reason max_tokens → max_tokens; raw ≤2000 geymt; usage/kostnaður skráð', async (t) => {
  const state = mkState();
  stubFetch(t, [{ status: 200, json: apiSvar('Ráðið kom sér ekki saman um JSON. ' + 'x'.repeat(3000)) }]);
  const r = await haldaMoot(mkEnv(state), state.tickets[7]);
  assert.equal(r.error, 'parse'); assert.equal(r.astaeda, 'ekkert_json', 'ástæða gátunar skilað (fyrsta live-fall var ógreinanlegt án hennar)');
  const meta = JSON.parse(state.msgs.find((m) => m.sent_by === 'moot_fall').meta);
  assert.equal(meta.raw.length, 2000); assert.equal(meta.astaeda, 'ekkert_json'); assert.deepEqual(meta.fundarmenn, r.fundarmenn || meta.fundarmenn); assert.equal(meta.stop, 'end_turn'); assert.deepEqual(meta.usage, { in: 4000, out: 900 });
  assert.equal(JSON.parse(state.sync.moot_dagur).usd, 0.017, 'kostnaður talinn þótt fundargerð brenglaðist');

  const state2 = mkState();
  stubFetch(t, [{ status: 200, json: apiSvar(JSON.stringify(SVAR_OK).slice(0, 300), { stop_reason: 'max_tokens' }) }]);
  const r2 = await haldaMoot(mkEnv(state2), state2.tickets[7]);
  assert.equal(r2.error, 'max_tokens');
});

test('haldaMoot: fundarmenn úr tegund+texta; ai_greining skemmd → þolað; þráður ≤6 síðustu in/out í tímaröð', async (t) => {
  const state = mkState();
  state.tickets[7] = Object.assign({}, TICKET, { tegund: null, ai_greining: '{skemmt', lysing: 'Vil endurgreiðslu, var rukkaður tvisvar' , efni: 'Reikningur' });
  for (let i = 0; i < 9; i++) state.msgs.push({ id: 10 + i, ticket_id: 7, ts: 1757700000 + i * 10, dir: i % 2 ? 'out' : 'in', sent_by: i % 2 ? 'agent' : 'notandi', texti: 'skeyti ' + i, meta: null });
  const log = stubFetch(t, [{ status: 200, json: apiSvar(Object.assign({}, SVAR_OK, { innlegg: [{ persona: 'sigrun', texti: 'Notandinn vill endurgreiðslu og skýrt svar um ferlið.' }] })) }]);
  const r = await haldaMoot(mkEnv(state), state.tickets[7]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.fundarmenn, ['sigrun', 'egill', 'elin', 'kari'], 'tegund vantar+greining skemmd → annad → Egill + Elín (endurgreiðslu-orð)');
  const u = log[0].body.messages[0].content;
  const thr = u.slice(u.indexOf('<thradur>'), u.indexOf('</thradur>'));
  assert.ok(thr.includes('skeyti 3') && thr.includes('skeyti 8') && !thr.includes('skeyti 2'), 'síðustu 6: ' + thr);
  assert.ok(thr.indexOf('skeyti 3') < thr.indexOf('skeyti 8'), 'tímaröð (elst fyrst)');
});

test('haldaMoot: SAMHLIÐA — tvö samtímis köll um sama ticket → EITT fetch, eitt ok + eitt bid (lásinn tekinn fyrir kallið), dagteljari 1', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const log = stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const [a, b] = await Promise.all([haldaMoot(env, state.tickets[7]), haldaMoot(env, state.tickets[7])]);
  const oks = [a, b].filter((r) => r.ok), bids = [a, b].filter((r) => r.error === 'bid');
  assert.equal(oks.length, 1, JSON.stringify([a, b])); assert.equal(bids.length, 1); assert.ok(bids[0].naest > 0);
  assert.equal(log.length, 1, 'aðeins eitt gjaldfært kall');
  assert.equal(JSON.parse(state.sync.moot_dagur).n, 1, 'dagteljari telur eitt');
  assert.equal(state.msgs.filter((m) => m.sent_by === 'moot').length, 1, 'ein niðurstöðuröð');
  // lás eldri en bilið → má halda aftur (þegar MAX(ts)-þakið leyfir)
  const state2 = mkState({ sync: { moot_lock_7: String(Math.floor(Date.now() / 1000) - 4000) } });
  stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  assert.equal((await haldaMoot(mkEnv(state2), state2.tickets[7])).ok, true, 'gamall lás hindrar ekki');
  // D1 skilar engu meta (bilun) → leyft, þakið MAX(ts) stendur
  const state3 = mkState(); const env3 = mkEnv(state3);
  const origPrepare = env3.TENGSL.prepare.bind(env3.TENGSL);
  env3.TENGSL.prepare = (sql) => (/moot_lock|CAST\(stjorn_sync/.test(sql) ? { bind() { return this; }, async run() { return { meta: {} }; } } : origPrepare(sql));
  stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  assert.equal((await haldaMoot(env3, state3.tickets[7])).ok, true);
});

test('haldaMoot: dagteljarinn er TEKINN FRÁ fyrir kallið — n+1 skrifað áður en fetch fer, kostnaður bætist við eftir', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  let nVidKall = null;
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { nVidKall = JSON.parse(state.sync.moot_dagur).n; return { ok: true, status: 200, json: async () => apiSvar(SVAR_OK) }; };
  t.after(() => { globalThis.fetch = orig; });
  const r = await haldaMoot(env, state.tickets[7]);
  assert.equal(r.ok, true); assert.equal(nVidKall, 1, 'n=1 stóð í grunni MEÐAN kallið var í gangi');
  assert.deepEqual(JSON.parse(state.sync.moot_dagur), { d: new Date().toISOString().slice(0, 10), n: 1, usd: 0.017 }, 'ekki tvítalið');
});

test('haldaMoot: niðurstöðuröð skrifast ekki (D1 gleypt í logMsg) → error vistun, ekki ok; GET sýnir engan fund; dagteljari telur samt', async (t) => {
  const state = mkState({ failNid: true }); const env = mkEnv(state);
  stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const r = await haldaMoot(env, state.tickets[7]);
  assert.equal(r.ok, false); assert.equal(r.error, 'vistun'); assert.ok(r.moot > 0); assert.equal(r.usd, 0.017);
  assert.equal(state.msgs.filter((m) => m.sent_by === 'moot').length, 0);
  const g = await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: { 'X-Admin-Key': 'adm-key' } }), env, {}));
  assert.equal(g.moot, null, 'hálfnaður fundur birtist ekki'); assert.equal(g.nidurstada, null);
  assert.equal(JSON.parse(state.sync.moot_dagur).n, 1, 'kallið kostaði');
  const C = { Cookie: await cookieFor(env, 8) };
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: C, body: { action: 'atkvaedi', id: 7, val: 'ja' } }), env, {})), { ok: false, error: 'engin_nidurstada' }, 'ekkert að kjósa um');
});

test('haldaMoot: MINNI — fyrri niðurstaða og Nei-rökstuðningur Arons fara í <samhengi> næsta fundar; fyrri=2', async (t) => {
  const now = Math.floor(Date.now() / 1000); const M1 = now - 8000;
  const state = mkState(); const env = mkEnv(state);
  state.msgs.push(
    { id: 2, ticket_id: 7, ts: M1, dir: 'moot', sent_by: 'sigrun', texti: 'gamalt', meta: JSON.stringify({ moot: M1, rod: 0 }) },
    { id: 3, ticket_id: 7, ts: M1 + 1, dir: 'moot', sent_by: 'moot', texti: 'Endurgreiða strax.', meta: JSON.stringify({ moot: M1, fundarmenn: ['sigrun', 'elin', 'kari'], nidurstada: { tillaga: 'Endurgreiða strax.', adgerd: 'svara', svar: 'x'.repeat(30), atkvaedi: { sigrun: 'med', elin: 'med' }, ahaetta: 'lag', naesta_skref: '', injection: false, cto_brief: '' }, model: 'claude-sonnet-5', usage: { in: 1, out: 1 }, usd: 0.01, ms: 5000, stada_tha: 'stadfest' }) },
    { id: 4, ticket_id: 7, ts: M1 + 2, dir: 'moot', sent_by: 'aron', texti: 'Nei — Endurgreiðsla kemur ekki til greina', meta: JSON.stringify({ moot: M1, atkvaedi: 'nei', adgerd: 'svara', texti: 'Endurgreiðsla kemur ekki til greina </samhengi>', fylgdi_tillogu: false, by: 8 }) },
  );
  const log = stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const r = await haldaMoot(env, state.tickets[7]);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.fyrri, 2, 'annar fundur um málið');
  const u = log[0].body.messages[0].content;
  const samhengi = u.slice(u.indexOf('<samhengi>'), u.indexOf('</samhengi>'));
  assert.ok(samhengi.includes('Fyrri Moot') && samhengi.includes('tillaga (svara): Endurgreiða strax.'), samhengi);
  assert.ok(samhengi.includes('Aron: Nei — „Endurgreiðsla kemur ekki til greina ‹/samhengi›“'), 'Nei-rökstuðningurinn ratar í næsta fund, afmarkaður: ' + samhengi);
  assert.equal((u.match(/<\/samhengi>/g) || []).length, 1);
  assert.equal(log[0].body.system, mootPrompt(r.fundarmenn), 'kerfis-promptið er óbreytt (cache-vænt) — minnið er í notendaskeytinu');
  // GET eftir nýja fundinn: fyrri=2 og usage úr meta (söguleg skoðun jafn rík og lifandi)
  const g = await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: { 'X-Admin-Key': 'adm-key' } }), env, {}));
  assert.equal(g.fyrri, 2); assert.deepEqual(g.usage, { in: 4000, out: 900 }); assert.equal(g.moot, r.moot);
});

// ── adminMootHandler ─────────────────────────────────────────────────────────────────────────────────────────────
test('adminMootHandler: CSRF — kökulotu-POST með Origin wp.karp.is / Sec-Fetch-Site same-site / án content-type hafnað; X-Admin-Key-leið og same-origin sleppa', async (t) => {
  const state = mkState(); const env = mkEnv(state); const C = { Cookie: await cookieFor(env, 8) };
  const log = stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: Object.assign({ Origin: 'https://wp.karp.is' }, C), body: { action: 'halda', id: 7 } }), env, {})), { ok: false, error: 'origin' });
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: Object.assign({ 'Sec-Fetch-Site': 'same-site' }, C), body: { action: 'halda', id: 7 } }), env, {})), { ok: false, error: 'origin' });
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: Object.assign({ Origin: 'https://evil.example' }, C), body: { action: 'atkvaedi', id: 7, val: 'ja' } }), env, {})), { ok: false, error: 'origin' });
  const textPlain = new Request('https://karp.is/api/admin/moot', { method: 'POST', headers: Object.assign({ 'content-type': 'text/plain' }, C), body: '{"action":"halda","id":7,"x":"="}' });
  assert.deepEqual(await js(await adminMootHandler(textPlain, env, {})), { ok: false, error: 'content_type' }, '<form enctype=text/plain>-bragðið');
  assert.equal(log.length, 0, 'ekkert gjaldfært kall'); assert.equal(state.msgs.length, 1, 'engin röð');
  // same-origin með lotu → sleppur (halda keyrir)
  const ok = await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: Object.assign({ Origin: 'https://karp.is', 'Sec-Fetch-Site': 'same-origin' }, C), body: { action: 'halda', id: 7 } }), env, {}));
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(log.length, 1);
  // X-Admin-Key-leið (skriptur/CI) er ekki kökuleið → CSRF-gátin á ekki við; lendir á 'lota' fyrir atkvæði
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: { 'X-Admin-Key': 'adm-key', Origin: 'https://wp.karp.is' }, body: { action: 'atkvaedi', id: 7, val: 'ja' } }), env, {})), { ok: false, error: 'lota' });
  // GET er ekki gátað (lesa)
  assert.equal((await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: Object.assign({ Origin: 'https://wp.karp.is' }, C) }), env, {}))).ok, true);
});

test('adminMootHandler: auth — engin lota/lykill → admin; rangur lykill → admin; ekki-admin notandi → admin', async () => {
  const state = mkState(); const env = mkEnv(state);
  assert.deepEqual(await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7'), env, {})), { ok: false, error: 'admin' });
  assert.deepEqual(await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: { 'X-Admin-Key': 'rangt' } }), env, {})), { ok: false, error: 'admin' });
  assert.deepEqual(await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: { Cookie: await cookieFor(env, 9) } }), env, {})), { ok: false, error: 'admin' });
});

test('adminMootHandler: GET með X-Admin-Key — enginn Moot → tómt með bid.ok true; id vantar/ekki til', async () => {
  const state = mkState(); const env = mkEnv(state); const H = { 'X-Admin-Key': 'adm-key' };
  const r = await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: H }), env, {}));
  assert.equal(r.ok, true); assert.equal(r.id, 7); assert.equal(r.moot, null); assert.equal(r.nidurstada, null); assert.deepEqual(r.innlegg, []); assert.equal(r.atkvaedi_arons, null);
  assert.deepEqual(r.bid, { ok: true, naest: null }); assert.deepEqual(r.adgerdir, MOOT_ADGERDIR); assert.equal(r.stada, 'stadfest'); assert.equal(r.fyrri, 0);
  assert.deepEqual(await js(await adminMootHandler(req('GET', '/api/admin/moot', { headers: H }), env, {})), { ok: false, error: 'id' });
  assert.deepEqual(await js(await adminMootHandler(req('GET', '/api/admin/moot?id=99', { headers: H }), env, {})), { ok: false, error: 'notfound' });
  assert.deepEqual(await js(await adminMootHandler(req('PUT', '/api/admin/moot', { headers: H }), env, {})), { ok: false, error: 'method' });
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: H, body: { action: 'halda' } }), env, {})), { ok: false, error: 'id' });
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: H, body: { action: 'halda', id: 99 } }), env, {})), { ok: false, error: 'notfound' });
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: H, body: { action: 'eyda_ollu', id: 7 } }), env, {})), { ok: false, error: 'action' });
});

test('adminMootHandler: FULLT FLÆÐI — halda (byKey) → GET sýnir Moot → atkvaedi byKey HAFNAÐ (lota) → atkvaedi með admin-lotu skrifar aron-röð → kosid; tvísmellur → bid', async (t) => {
  const state = mkState(); const env = mkEnv(state); const H = { 'X-Admin-Key': 'adm-key' };
  stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  // halda
  const h = await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: H, body: { action: 'halda', id: 7 } }), env, {}));
  assert.equal(h.ok, true, JSON.stringify(h)); assert.equal(h.id, 7); assert.deepEqual(h.adgerdir, MOOT_ADGERDIR); assert.equal(h.innlegg.length, 3); assert.equal(h.nidurstada.adgerd, 'cto');
  // GET kyrrstætt
  const g = await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: H }), env, {}));
  assert.equal(g.moot, h.moot); assert.deepEqual(g.innlegg, h.innlegg); assert.deepEqual(g.nidurstada, h.nidurstada); assert.deepEqual(g.fundarmenn, h.fundarmenn);
  assert.equal(g.atkvaedi_arons, null); assert.equal(g.fall, null); assert.equal(g.fyrri, 1); assert.equal(g.bid.ok, false); assert.ok(g.bid.naest > h.moot); assert.equal(g.usd, 0.017); assert.equal(g.model, 'claude-sonnet-5'); assert.equal(g.stada_tha, 'stadfest');
  assert.deepEqual(g.usage, h.usage, 'usage í sögulegri skoðun'); assert.equal(g.bid.naest, h.bid.naest, 'halda og GET sammála um „Næst kl.“');
  // tvísmellur → bid
  const h2 = await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: H, body: { action: 'halda', id: 7 } }), env, {}));
  assert.equal(h2.error, 'bid'); assert.ok(h2.naest > 0);
  // atkvæði með lykli → lota
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: H, body: { action: 'atkvaedi', id: 7, val: 'ja' } }), env, {})), { ok: false, error: 'lota' });
  // atkvæði með admin-lotu
  const C = { Cookie: await cookieFor(env, 8) };
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: C, body: { action: 'atkvaedi', id: 7, val: 'kannski' } }), env, {})), { ok: false, error: 'val' });
  const a = await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: C, body: { action: 'atkvaedi', id: 7, val: 'ja' } }), env, {}));
  assert.deepEqual(a, { ok: true, moot: h.moot, val: 'ja', adgerd: 'cto', fylgdi_tillogu: true, breytt_stada: false });
  const aron = state.msgs.filter((m) => m.dir === 'moot' && m.sent_by === 'aron');
  assert.equal(aron.length, 1); assert.equal(aron[0].texti, 'Já — Senda á CTO (Hrafn)'); assert.equal(aron[0].efni, 'Atkvæði Moot');
  assert.deepEqual(JSON.parse(aron[0].meta), { moot: h.moot, atkvaedi: 'ja', adgerd: 'cto', texti: '', fylgdi_tillogu: true, by: 8, stada_tha: 'stadfest' });
  assert.equal(state.tickets[7].stada, 'stadfest', 'atkvæðið breytir EKKI stöðu — UI keyrir /api/admin/ticket');
  // GET sýnir atkvæðið
  const g2 = await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: C }), env, {}));
  assert.deepEqual(g2.atkvaedi_arons, { val: 'ja', adgerd: 'cto', texti: '', ts: aron[0].ts, fylgdi_tillogu: true });
  // aftur → kosid
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: C, body: { action: 'atkvaedi', id: 7, val: 'nei' } }), env, {})), { ok: false, error: 'kosid' });
});

test('adminMootHandler: atkvaedi nei með texta (klippt 500) · engin niðurstaða → engin_nidurstada · breytt_stada þegar staða hnikaðist eftir fund', async (t) => {
  const state = mkState(); const env = mkEnv(state); const C = { Cookie: await cookieFor(env, 8) };
  assert.deepEqual(await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: C, body: { action: 'atkvaedi', id: 7, val: 'nei' } }), env, {})), { ok: false, error: 'engin_nidurstada' });
  stubFetch(t, [{ status: 200, json: apiSvar(SVAR_OK) }]);
  const h = await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: C, body: { action: 'halda', id: 7 } }), env, {}));
  assert.equal(h.ok, true);
  state.tickets[7].stada = 'svarad';   // Aron svaraði handvirkt eftir fundinn
  const a = await js(await adminMootHandler(req('POST', '/api/admin/moot', { headers: C, body: { action: 'atkvaedi', id: 7, val: 'nei', texti: 'Ég svaraði sjálfur. ' + 'x'.repeat(600) } }), env, {}));
  assert.equal(a.ok, true); assert.equal(a.val, 'nei'); assert.equal(a.fylgdi_tillogu, false); assert.equal(a.breytt_stada, true);
  const aron = state.msgs.find((m) => m.sent_by === 'aron'); const meta = JSON.parse(aron.meta);
  assert.equal(meta.texti.length, 500); assert.equal(meta.stada_tha, 'svarad'); assert.equal(meta.fylgdi_tillogu, false);
  assert.ok(aron.texti.startsWith('Nei — Ég svaraði sjálfur.'));
});

test('_mootLesa (um GET): nýjasti Moot valinn, skemmd meta-röð sleppt, hálfnaður fundur (innlegg án niðurstöðu) birtist ekki en fall sýnist', async () => {
  const now = Math.floor(Date.now() / 1000);
  const state = mkState(); const env = mkEnv(state); const H = { 'X-Admin-Key': 'adm-key' };
  const M1 = now - 8000, M2 = now - 7000, M3 = now - 100;
  state.msgs.push(
    { id: 2, ticket_id: 7, ts: M1, dir: 'moot', sent_by: 'sigrun', texti: 'gamalt innlegg', meta: JSON.stringify({ moot: M1, rod: 0 }) },
    { id: 3, ticket_id: 7, ts: M1 + 1, dir: 'moot', sent_by: 'moot', texti: 'gömul tillaga', meta: JSON.stringify({ moot: M1, fundarmenn: ['sigrun', 'kari'], nidurstada: { tillaga: 'gömul tillaga', adgerd: 'svara', svar: 'x'.repeat(30), atkvaedi: { sigrun: 'med' }, ahaetta: 'lag', naesta_skref: '', injection: false, cto_brief: '' }, model: 'claude-sonnet-5', usd: 0.01, ms: 5000, stada_tha: 'stadfest' }) },
    { id: 4, ticket_id: 7, ts: M1 + 2, dir: 'moot', sent_by: 'aron', texti: 'Já — Senda svar Sigrúnar', meta: JSON.stringify({ moot: M1, atkvaedi: 'ja', adgerd: 'svara', texti: '', fylgdi_tillogu: true, by: 8 }) },
    { id: 5, ticket_id: 7, ts: M2, dir: 'moot', sent_by: 'hrafn', texti: 'skemmd', meta: '{skemmt json' },
    { id: 6, ticket_id: 7, ts: M3, dir: 'moot', sent_by: 'unnur', texti: 'seinna innlegg í röð 1', meta: JSON.stringify({ moot: M3, rod: 1 }) },
    { id: 7, ticket_id: 7, ts: M3, dir: 'moot', sent_by: 'sigrun', texti: 'seinna innlegg í röð 0', meta: JSON.stringify({ moot: M3, rod: 0 }) },
    { id: 8, ticket_id: 7, ts: M3 + 1, dir: 'moot', sent_by: 'moot_fall', texti: 'Moot féll: parse', meta: JSON.stringify({ moot: M3, error: 'parse', raw: '…' }) },
  );
  const g = await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: H }), env, {}));
  assert.equal(g.moot, M3, 'nýjasti fundur með moot/moot_fall-röð');
  assert.deepEqual(g.fall, { error: 'parse', ts: M3 + 1 });
  assert.equal(g.nidurstada, null); assert.equal(g.atkvaedi_arons, null, 'atkvæði gamla fundarins fylgir ekki nýja');
  assert.deepEqual(g.innlegg.map((i) => i.persona), ['sigrun', 'unnur'], 'raðað á meta.rod, ekki id');
  assert.equal(g.fyrri, 2, 'M1 og M3 (skemmda röðin telur ekki)');
  assert.equal(g.bid.ok, false, 'fall telur í klst-þak'); assert.equal(g.bid.naest, M3 + 1 + 3600);
  // hálfnaður fundur eingöngu (innlegg án niðurstöðu) → moot null en engin villa
  const state2 = mkState(); state2.msgs.push({ id: 2, ticket_id: 7, ts: now - 50, dir: 'moot', sent_by: 'sigrun', texti: 'hálfnað', meta: JSON.stringify({ moot: now - 50, rod: 0 }) });
  const g2 = await js(await adminMootHandler(req('GET', '/api/admin/moot?id=7', { headers: H }), mkEnv(state2), {}));
  assert.equal(g2.moot, null); assert.deepEqual(g2.innlegg, []); assert.equal(g2.bid.ok, true, 'hálfnaður fundur læsir ekki klst-þakinu');
});

test('parseMoot er sama fall sem worker flytur út (viðmót spec)', () => {
  assert.equal(typeof parseMoot, 'function');
  assert.equal(parseMoot('rusl', ['sigrun', 'kari']), null);
});
