// Hugmyndirnar sex um Sigrúnu sem starfsmann, prófaðar gegn RAUNVERULEGRI SQLite með migration-
// skemanu (0006 + 0015). Sama ástæða og í sigrun_vinna.test.mjs: villurnar sem skipta máli hér eru
// merkingarlegar — json_extract á BROTNU JSON fellir alla fyrirspurnina, CASE sem á að stytta
// undirfyrirspurn, NOT EXISTS á fyrsta svari — og gervi-D1 sem ber saman SQL-strengi sér þær aldrei.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* ekki til — prófum sleppt */ }
const t = DatabaseSync ? test : test.skip;

const { sigrunThekking, sigrunLaerdomur, sigrunStillUppfaera, sigrunKbLeita, sigrunGreinDrog, sigrunGreinVista, sigrunGreinHafna, sigrunGreinEyda, sigrunVikupostur, endurreynaNu } = await import('./sigrun_vinna.mjs');
const { ticketsOverview, processNewTicket, adminTicketHandler } = await import('./hjalp_agent.mjs');
const { isoVika, sidastaFullaVika } = await import('../lib/stjorn/vika.mjs');

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
const D = 86400, H = 3600;
const NU = () => Math.floor(Date.now() / 1000);
const V38 = isoVika(Math.floor(Date.parse('2026-09-16T12:00:00Z') / 1000));

function nyrGrunnur() {
  const db = new DatabaseSync(':memory:');
  db.exec(mig('0006_stjorn_sync.sql'));
  db.exec(mig('0015_tickets.sql'));
  const env = { TENGSL: d1(db) };
  const midi = (o) => {
    const d = { id: o.id, created: o.created, updated: o.updated ?? o.created, netfang: o.netfang ?? 'a@b.is', efni: o.efni ?? 'efni',
      lysing: o.lysing ?? 'lýsing', stada: o.stada ?? 'nytt', tegund: o.tegund ?? null,
      ...(o.uppruni ? { uppruni: o.uppruni } : {}), ...(o.ai_greining !== undefined ? { ai_greining: o.ai_greining } : {}) };
    const k = Object.keys(d);
    db.prepare('INSERT INTO tickets (' + k.join(',') + ') VALUES (' + k.map(() => '?').join(',') + ')').run(...k.map((x) => d[x]));
  };
  const skilabod = (o) => db.prepare('INSERT INTO ticket_msgs (ticket_id, ts, dir, sent_by, efni, texti) VALUES (?,?,?,?,?,?)')
    .run(o.ticket_id, o.ts, o.dir, o.sent_by ?? (o.dir === 'in' ? 'notandi' : 'agent'), o.efni ?? null, o.texti ?? '');
  const sync = (k, v, updated = NU()) => db.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?)').run(k, typeof v === 'string' ? v : JSON.stringify(v), updated);
  const lesa = (k) => { const r = db.prepare('SELECT v FROM stjorn_sync WHERE k=?').get(k); return r ? JSON.parse(r.v) : undefined; };
  return { db, env, midi, skilabod, sync, lesa };
}

/** fetch-stubbur: Claude (með föstu svari eða falli), Gmail-token og Gmail-send. Skilar log. */
function stubFetch(tc, { claude = null, gmailOk = true } = {}) {
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    const body = o && o.body;
    log.push({ url: String(url), body });
    if (String(url).startsWith('https://api.anthropic.com/')) {
      const j = JSON.parse(body);
      const text = typeof claude === 'function' ? claude(j) : claude;
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: String(text) }] }) };
    }
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    if (String(url).startsWith('https://gmail.googleapis.com/')) return { ok: gmailOk, status: gmailOk ? 200 : 500, json: async () => ({}) };
    throw new Error('óvænt fetch: ' + url);
  };
  tc.after(() => { globalThis.fetch = orig; });
  return log;
}
const GMAIL = { GMAIL_CLIENT_ID: 'c', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r' };
const pakka = (raw) => { const m = JSON.parse(raw).raw; return Buffer.from(m.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); };
const sendPostar = (log) => log.filter((c) => c.url.includes('gmail.googleapis.com')).map((c) => pakka(c.body));

// ── 2. HÚN BIÐUR UM HJÁLP ───────────────────────────────────────────────────────────────────────

t('ticketsOverview: ástæðurnar reiknast úr lýsingu OG nýjustu skilaboðum, og brotið JSON fellir ekki listann', async () => {
  const { env, midi, skilabod, sync } = nyrGrunnur();
  const nu = NU();
  midi({ id: 1, created: nu - 3 * H, stada: 'stadfest', lysing: 'Ég vil fá endurgreitt' });
  // klippt á 6000 stafi við vistun: BROTIÐ JSON. json_extract án json_valid felldi alla fyrirspurnina.
  midi({ id: 2, created: nu - 2 * H, stada: 'nytt', lysing: 'Hvernig virkar þetta?', ai_greining: '{"tegund":"spurning","svar":"Sæl' });
  midi({ id: 3, created: nu - H, stada: 'nytt', ai_greining: JSON.stringify({ model: 'fallback:ai 529' }) });
  midi({ id: 4, created: nu - H, stada: 'svarad', lysing: 'endurgreiðsla' });                       // svarað: ekki hennar að biðja um
  midi({ id: 5, created: nu - 5 * H, stada: 'stadfest', lysing: 'Kemst ekki inn' });
  skilabod({ ticket_id: 5, ts: nu - 5 * H, dir: 'in', texti: 'Kemst ekki inn' });
  skilabod({ ticket_id: 5, ts: nu - H, dir: 'in', texti: 'Ef þetta lagast ekki vil ég endurgreiðslu' });   // framhaldið skiptir máli
  sync('kb:ruslpostur', { um: 'ruslpóstur / netfang', svar: 'Staðfestingarpósturinn kemur frá noreply@karp.is og getur lent í ruslpósti.', vistad: 5 });
  sync('kb:stadfesting', { um: 'yfirskrift', svar: 'Grein með sama id og grein í kóðanum má aldrei birtast né skrifa yfir hana.' });
  sync('sigrun_kb_tillogur', { ts: 1, hopar: [{ efni: 'Afsláttur', ids: [7, 8, 9] }] });
  const r = await ticketsOverview(env);
  const h = Object.fromEntries(r.list.map((x) => [x.id, x.hjalp ? x.hjalp.astaeda : null]));
  assert.deepEqual(h, { 1: 'peningar', 2: null, 3: 'ovisst', 4: null, 5: 'peningar' });
  for (const x of r.list) for (const k of ['lysing', 'sidastaInn', 'g_model', 'g_kb', 'g_vissa']) assert.ok(!(k in x), k + ' á ekki erindi í svarið');
  assert.deepEqual(r.kb_greinar.map((k) => k.id), ['ruslpostur'], 'stadfesting stendur í kóðanum og vistuð grein skrifar ekki yfir hana');
  assert.deepEqual(r.kb_tillogur, [{ efni: 'Afsláttur', ids: [7, 8, 9] }]);
});

t('ticketsOverview: þriðja samband sama notanda um sama mál fer efst', async () => {
  const { env, midi } = nyrGrunnur();
  const nu = NU();
  midi({ id: 1, created: nu - 20 * D, stada: 'lokad', netfang: 'jon@x.is', tegund: 'adgangur' });
  midi({ id: 2, created: nu - 6 * D, stada: 'svarad', netfang: 'Jon@X.is', tegund: 'adgangur' });
  midi({ id: 3, created: nu - H, stada: 'stadfest', netfang: 'jon@x.is', tegund: 'adgangur' });
  const r = await ticketsOverview(env);
  assert.deepEqual(r.list.find((x) => x.id === 3).hjalp, { astaeda: 'endurtekid', texti: 'í þriðja sinn á 30 dögum' });
});

// ── 5. HÚN LÆRIR AF ÞÉR ─────────────────────────────────────────────────────────────────────────

const DROG = 'Sæl/Sæll Jón,\n\nTakk fyrir að hafa samband. Aðgangurinn þinn hefur verið endurstilltur.\n\nBestu kveðjur,';
const STYTT = 'Sæll Jón,\n\nAðgangurinn þinn hefur verið endurstilltur.\n\nKveðja';
const greining = (svar, model = 'claude-haiku') => JSON.stringify({ tegund: 'adgangur', svar, model });

t('sigrunLaerdomur: fyrsta svar Arons á hverja beiðni — og hvorki Moot, samið efni né svar utan vikunnar', async () => {
  const { env, midi, skilabod } = nyrGrunnur();
  const f = V38.fra;
  midi({ id: 1, created: f + H, ai_greining: greining(DROG) });
  skilabod({ ticket_id: 1, ts: f + 2 * H, dir: 'out', sent_by: 'aron', texti: STYTT });          // fyrsta svarið: telst
  skilabod({ ticket_id: 1, ts: f + 3 * H, dir: 'out', sent_by: 'aron', texti: 'Framhald' });     // seinna svar: telst ekki
  midi({ id: 2, created: f + H, ai_greining: greining(DROG) });
  skilabod({ ticket_id: 2, ts: f + H + 60, dir: 'moot', sent_by: 'aron', texti: 'Já' });          // ráðið skrifaði drögin
  skilabod({ ticket_id: 2, ts: f + 2 * H, dir: 'out', sent_by: 'aron', texti: 'Allt annað' });
  midi({ id: 3, created: f + H, uppruni: 'stjorn', ai_greining: greining(DROG, 'stjorn') });
  skilabod({ ticket_id: 3, ts: f + 2 * H, dir: 'out', sent_by: 'aron', texti: 'Samið' });
  midi({ id: 4, created: f - 9 * D, ai_greining: greining(DROG) });
  skilabod({ ticket_id: 4, ts: f - 8 * D, dir: 'out', sent_by: 'aron', texti: STYTT });          // fyrir vikuna
  skilabod({ ticket_id: 4, ts: f + 2 * H, dir: 'out', sent_by: 'aron', texti: STYTT });          // ekki FYRSTA svarið
  const a = await sigrunLaerdomur(env, V38.fra, V38.til);
  assert.equal(a.ok, true);
  assert.equal(a.laerdomur.fjoldi, 1);
  assert.equal(a.laerdomur.breytt, 1);
  const b = await sigrunLaerdomur(env, V38.fra, V38.til);
  assert.equal(b.geymt, true, 'reiknað einu sinni og síðan geymt');
  assert.equal((await sigrunLaerdomur(env, V38.fra + 5, V38.til)).error, 'vika');
});

t('sigrunStillUppfaera: sama setning út í þremur svörum → þjónninn tekur hana úr næstu drögum, líkanið sér hana aldrei', async (tc) => {
  const { env, midi, skilabod, lesa, db } = nyrGrunnur();
  const nu = NU();
  for (const id of [1, 2, 3]) {
    midi({ id, created: nu - (id + 1) * D, ai_greining: greining(DROG) });
    skilabod({ ticket_id: id, ts: nu - id * D, dir: 'out', sent_by: 'aron', texti: STYTT });
  }
  const still = await sigrunStillUppfaera(env);
  assert.deepEqual(still.sleppa, ['Takk fyrir að hafa samband']);
  assert.deepEqual(lesa('sigrun_still'), still);
  // Næsta greining: líkanið skrifar setninguna aftur, og hún fer úr drögunum áður en þau eru vistuð.
  // ⚠ Rýnin 22.9: setningin var áður sett í kerfis-promptið, þar sem texti notanda gat staðið í 30 daga.
  let kerfi = '';
  stubFetch(tc, { claude: (j) => { kerfi = j.system; return JSON.stringify({ tegund: 'spurning', forgangur: 2, samantekt: 'x', kb: null, svar: DROG }); } });
  midi({ id: 9, created: nu, lysing: 'Ný spurning' });
  await processNewTicket(Object.assign({ ANTHROPIC_API_KEY: 'k' }, GMAIL, env), { id: 9, netfang: 'a@b.is', lysing: 'Ný spurning', efni: 'Spurning' });
  assert.ok(!kerfi.includes('Takk fyrir að hafa samband'), 'setningin kemst ekki í promptið');
  const drog = JSON.parse(db.prepare('SELECT ai_greining FROM tickets WHERE id=9').get().ai_greining).svar;
  assert.ok(!drog.includes('Takk fyrir að hafa samband') && drog.includes('Aðgangurinn þinn hefur verið endurstilltur.'), drog);
});

// ── 6. HÚN LEGGUR TIL HJÁLPARGREINAR ────────────────────────────────────────────────────────────

function spurningar(midi, skilabod, nu, n = 4) {
  for (let id = 1; id <= n; id++) {
    midi({ id, created: nu - id * D, tegund: 'adgangur', efni: 'Staðfestingarpóstur kom ekki #' + id, ai_greining: JSON.stringify({ samantekt: 'Staðfestingarpóstur barst ekki', kb: null }) });
    skilabod({ ticket_id: id, ts: nu - id * D + H, dir: 'out', sent_by: 'aron', texti: 'Sæll Jón,\n\nPósturinn kemur frá noreply@karp.is og lendir stundum í ruslpósti.\n\nKveðja,\nAron' });
  }
}

t('sigrunKbLeita: líkanið flokkar, en aðeins númer af listanum komast í gegn — og ekkert kall ef of fátt', async (tc) => {
  const { env, midi, skilabod, lesa } = nyrGrunnur();
  const nu = NU();
  const tomur = stubFetch(tc, { claude: '{"hopar":[]}' });
  midi({ id: 50, created: nu - D, tegund: 'adgangur', ai_greining: '{}' });
  assert.deepEqual((await sigrunKbLeita(Object.assign({ ANTHROPIC_API_KEY: 'k' }, env))).hopar, []);
  assert.equal(tomur.filter((c) => c.url.includes('anthropic')).length, 0, 'ein beiðni: ekkert Claude-kall');
  spurningar(midi, skilabod, nu);
  const log = stubFetch(tc, { claude: '{"hopar":[{"efni":"Staðfestingarpóstur","ids":[1,2,3,999]}]}' });
  const r = await sigrunKbLeita(Object.assign({ ANTHROPIC_API_KEY: 'k' }, env));
  assert.deepEqual(r.hopar, [{ efni: 'Staðfestingarpóstur', ids: [1, 2, 3] }], '999 er ekki til');
  assert.deepEqual(lesa('sigrun_kb_tillogur').hopar, r.hopar);
  assert.ok(log.some((c) => c.url.includes('anthropic') && c.body.includes('#4 · Staðfestingarpóstur barst ekki')));
  // rýnin 22.9: ólæsilegt svar þurrkar ekki út tillögurnar sem fyrir eru og segir ekki „engin"
  stubFetch(tc, { claude: 'Því miður get ég ekki hjálpað með þetta.' });
  assert.deepEqual(await sigrunKbLeita(Object.assign({ ANTHROPIC_API_KEY: 'k' }, env)), { ok: false, error: 'ai' });
  assert.deepEqual(lesa('sigrun_kb_tillogur').hopar, r.hopar, 'fyrri tillögur standa');
});

t('sigrunGreinDrog → Vista: drögin byggja á svörum Arons, og vistuð grein fer í svarreitinn í næstu greiningu', async (tc) => {
  const { env, midi, skilabod, sync, lesa, db } = nyrGrunnur();
  const nu = NU();
  spurningar(midi, skilabod, nu);
  sync('sigrun_kb_tillogur', { ts: nu, hopar: [{ efni: 'Staðfestingarpóstur', ids: [1, 2, 3] }] });
  const E = Object.assign({ ANTHROPIC_API_KEY: 'k' }, GMAIL, env);
  assert.equal((await sigrunGreinDrog(E, { ids: [1, 2, 4] })).error, 'tillaga', 'aðeins númer úr tillögu');
  const log = stubFetch(tc, { claude: '{"um":"staðfestingarpóstur / netfang / ruslpóstur","svar":"Staðfestingarpósturinn kemur frá noreply@karp.is. Kíktu í ruslpóstinn ef hann sést ekki."}' });
  const d = await sigrunGreinDrog(E, { ids: [1, 2, 3] });
  assert.equal(d.ok, true);
  const sent = log.find((c) => c.url.includes('anthropic')).body;
  assert.ok(sent.includes('lendir stundum í ruslpósti') && !sent.includes('Jón'), 'svar Arons fer með, ávarpið ekki');
  // Aron vistar (og breytti textanum aðeins); vafrinn sendir <script> sem hreinsast hér
  const v = await sigrunGreinVista(E, { ids: [1, 2, 3], um: d.grein.um, svar: d.grein.svar + ' <script>x</script>' });
  assert.deepEqual(v, { ok: true, id: 'stadfestingarpostur' });
  assert.ok(!lesa('kb:stadfestingarpostur').svar.includes('<script>'));
  assert.deepEqual(lesa('sigrun_kb_lokid'), [1, 2, 3]);
  assert.deepEqual(lesa('sigrun_kb_tillogur').hopar, [], 'tillagan hverfur');
  assert.deepEqual((await sigrunThekking(env)).auka.map((k) => k.id), ['stadfestingarpostur']);
  // Ný beiðni: greiningin sér greinina, texta hennar með, og velur hana með vissu → hún fer í SVARREITINN.
  // ⚠ Rýnin 22.9: hún sendist ekki sjálf. Leitarorðin samdi líkan og þau ein duga ekki til að senda svar.
  let kerfi = '';
  const log2 = stubFetch(tc, { claude: (j) => { kerfi = j.system; return '{"tegund":"adgangur","forgangur":2,"samantekt":"x","svar":"Sæl/Sæll Gunna,\\n\\nannað","kb":{"id":"stadfestingarpostur","vissa":0.95}}'; } });
  midi({ id: 20, created: nu, lysing: 'Staðfestingarpósturinn kom ekki' });
  const p = await processNewTicket(E, { id: 20, netfang: 'b@c.is', nafn: 'Gunna Jónsdóttir', lysing: 'Staðfestingarpósturinn kom ekki', efni: 'Póstur' });
  assert.ok(kerfi.includes('- stadfestingarpostur: staðfestingarpóstur / netfang / ruslpóstur (texti greinarinnar: „Staðfestingarpósturinn kemur frá noreply@karp.is.'), kerfi);
  assert.equal(p.auto, null, 'ekkert sjálfvirkt svar');
  const t20 = db.prepare('SELECT stada, ai_greining FROM tickets WHERE id=20').get();
  assert.equal(t20.stada, 'stadfest', 'bíður Arons');
  assert.ok(JSON.parse(t20.ai_greining).svar.startsWith('Sæl/Sæll Gunna,\n\nStaðfestingarpósturinn kemur frá noreply@karp.is.'), 'greinin er drögin');
  // (innri tilkynningin á hjalp@ ber „Reply-To: b@c.is" — aðeins To-línan sjálf telst)
  assert.equal(sendPostar(log2).filter((m) => /^To: b@c\.is\r?$/m.test(m)).length, 1, 'aðeins staðfestingin fór til notandans');
});

t('sigrunGreinHafna og sigrunGreinEyda: afgreitt kemur ekki aftur, og aðeins vistaðar greinar má fjarlægja', async () => {
  const { env, sync, lesa, db } = nyrGrunnur();
  sync('sigrun_kb_tillogur', { ts: 1, hopar: [{ efni: 'A', ids: [1, 2, 3] }, { efni: 'B', ids: [4, 5, 6] }] });
  assert.deepEqual(await sigrunGreinHafna(env, { ids: [4, 5, 6] }), { ok: true });
  assert.deepEqual(lesa('sigrun_kb_tillogur').hopar, [{ efni: 'A', ids: [1, 2, 3] }]);
  assert.deepEqual((await sigrunThekking(env)).tillogur, [{ efni: 'A', ids: [1, 2, 3] }]);
  assert.equal((await sigrunGreinHafna(env, { ids: [9, 10, 11] })).error, 'tillaga');
  sync('kb:vista', { um: 'x y z', svar: 'nógu langur texti til að standast lágmarkið hér og vel það' });
  assert.deepEqual(await sigrunGreinEyda(env, { kb: 'vista' }), { ok: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stjorn_sync WHERE k LIKE 'kb:%'").get().n, 0);
  assert.equal((await sigrunGreinEyda(env, { kb: "x' OR 1=1 --" })).error, 'id');
});

// ── 3. VIKUPÓSTUR Á MÁNUDEGI ────────────────────────────────────────────────────────────────────

t('sigrunVikupostur: einu sinni á viku, rofinn stöðvar hann, og misheppnuð sending tekur kröfuna aftur', async (tc) => {
  const { env, midi, sync, db } = nyrGrunnur();
  const v = sidastaFullaVika(NU());
  midi({ id: 1, created: v.fra + H, stada: 'stadfest', lysing: 'Ég vil endurgreiðslu' });
  const E = Object.assign({}, GMAIL, env);
  const lykill = 'sigrun_vikupostur:' + v.ar + '-' + v.vika;
  // misheppnuð sending: krafan fer, svo hnappurinn eða næsta keyrsla geti reynt aftur
  stubFetch(tc, { gmailOk: false });
  assert.deepEqual(await sigrunVikupostur(E, ticketsOverview), { ok: false, error: 'send' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stjorn_sync WHERE k=?').get(lykill).n, 0);
  const log = stubFetch(tc);
  const a = await sigrunVikupostur(E, ticketsOverview);
  assert.equal(a.sent, true);
  const postur = sendPostar(log);
  assert.equal(postur.length, 1);
  assert.ok(postur[0].includes('To: hjalp@karp.is'));
  const b = await sigrunVikupostur(E, ticketsOverview);
  assert.deepEqual(b, { ok: true, sent: false, adur: true });
  assert.equal(sendPostar(log).length, 1, 'enginn annar sjálfvirkur póstur sömu viku');
  assert.match(db.prepare('SELECT v FROM stjorn_sync WHERE k=?').get(lykill).v, /^sent:/, 'tókst: krafan verður sent:');
  // Hnappurinn á sinn lykil: Aron biður um póstinn og fær hann, en ekki tvisvar á fimm mínútum
  assert.equal((await sigrunVikupostur(E, ticketsOverview, { thvinga: true })).sent, true);
  assert.equal((await sigrunVikupostur(E, ticketsOverview, { thvinga: true })).error, 'nylega');
  assert.equal(sendPostar(log).length, 2);
  const { env: env2, sync: sync2 } = nyrGrunnur();
  sync2('hjalp_agent_off', '1');
  assert.deepEqual(await sigrunVikupostur(Object.assign({}, GMAIL, env2), ticketsOverview), { ok: false, error: 'rofi' });
  void sync;
});

t('sigrunVikupostur: innihaldið er vikan, það sem hún þarf þig á og engir tvípunktar', async (tc) => {
  const { env, midi, skilabod } = nyrGrunnur();
  const v = sidastaFullaVika(NU());
  midi({ id: 1, created: v.fra + H, stada: 'stadfest', lysing: 'Ég vil endurgreiðslu' });
  midi({ id: 2, created: v.fra + 2 * H, stada: 'svarad' });
  skilabod({ ticket_id: 2, ts: v.fra + 3 * H, dir: 'out', sent_by: 'aron', efni: '[Karp #2] x', texti: 'Svar' });
  const log = stubFetch(tc);
  const r = await sigrunVikupostur(Object.assign({}, GMAIL, env), ticketsOverview);
  assert.equal(r.sent, true);
  const html = Buffer.from(sendPostar(log)[0].split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.match(html, /2 beiðnir bárust í vikunni\. Þú svaraðir 1\./);
  assert.match(html, /Ég þarf þig á einni beiðni, #1 \(nefnir endurgreiðslu\)\./);
  const meginmal = html.replace(/<[^>]+>/g, ' ').split('Spjaldið mitt')[0];
  assert.ok(!/[:–—]/.test(meginmal), meginmal);
});

t('sigrunVikupostur: rýnin 22.9 — ólesið yfirlit sendir ekki „Engin er opin núna", og tekur kröfuna aftur', async (tc) => {
  const { env, midi, db } = nyrGrunnur();
  const v = sidastaFullaVika(NU());
  midi({ id: 1, created: v.fra + H, stada: 'stadfest', lysing: 'Ég vil endurgreiðslu' });
  const log = stubFetch(tc);
  const brotid = async () => ({ list: [], open: 0, villa: 'd1' });   // svona skilar ticketsOverview nú D1-bilun
  assert.deepEqual(await sigrunVikupostur(Object.assign({}, GMAIL, env), brotid), { ok: false, error: 'd1' });
  assert.equal(sendPostar(log).length, 0, 'enginn póstur með röngum tölum');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stjorn_sync WHERE k LIKE 'sigrun_vikupostur:%'").get().n, 0, 'krafan tekin aftur, næsta tilraun má senda');
  // og ticketsOverview segir sjálft frá bilun í stað þess að skila tómum lista sem staðreynd
  const bilad = { TENGSL: { prepare: (sql) => /FROM tickets t ORDER BY t\.created DESC LIMIT 60/.test(sql)
    ? { bind: () => ({ all: async () => { throw new Error('D1 7500'); } }), all: async () => { throw new Error('D1 7500'); } } : env.TENGSL.prepare(sql) } };
  assert.equal((await ticketsOverview(bilad)).villa, 'd1');
});

t('sigrunVikupostur: rýnin 22.9 — tveir smellir á sama tíma senda EINN póst', async (tc) => {
  const { env, midi } = nyrGrunnur();
  const v = sidastaFullaVika(NU());
  midi({ id: 1, created: v.fra + H, stada: 'nytt' });
  const log = stubFetch(tc);
  const E = Object.assign({}, GMAIL, env);
  const [a, b] = await Promise.all([sigrunVikupostur(E, ticketsOverview, { thvinga: true }), sigrunVikupostur(E, ticketsOverview, { thvinga: true })]);
  assert.equal(sendPostar(log).length, 1, JSON.stringify([a, b]));
  assert.deepEqual([a.sent, b.error].sort(), [true, 'nylega'].sort());
});

t('sigrunVikupostur: rýnin 22.9 — misheppnaður smellur snertir ekki vikukröfuna, og föst krafa losnar', async (tc) => {
  const { env, midi, sync, db } = nyrGrunnur();
  const nu = NU();
  const v = sidastaFullaVika(nu);
  midi({ id: 1, created: v.fra + H, stada: 'nytt' });
  const E = Object.assign({}, GMAIL, env);
  const lykill = 'sigrun_vikupostur:' + v.ar + '-' + v.vika;
  const vikan = () => (db.prepare('SELECT v FROM stjorn_sync WHERE k=?').get(lykill) || {}).v;
  // 08:10 sendi; síðdegis mistekst smellur — vikan stendur send, svo 12:00-endurtilraunin sendir ekki aftur
  sync(lykill, 'sent:' + (nu - 5 * H), nu - 5 * H);
  stubFetch(tc, { gmailOk: false });
  assert.equal((await sigrunVikupostur(E, ticketsOverview, { thvinga: true })).error, 'send');
  assert.match(vikan(), /^sent:/);
  let log = stubFetch(tc);
  assert.deepEqual(await sigrunVikupostur(E, ticketsOverview, { endurreyna: true }), { ok: true, sent: false, adur: true });
  assert.equal(sendPostar(log).length, 0);
  // Keyrsla sem dó eftir kröfuna: cron-ið sér hana sem senda, endurtilraunin tekur hana eftir hálftíma
  db.prepare('UPDATE stjorn_sync SET v=?, updated=? WHERE k=?').run('sendi:gamalt', nu - 3600, lykill);
  assert.deepEqual(await sigrunVikupostur(E, ticketsOverview), { ok: true, sent: false, adur: true });
  log = stubFetch(tc);
  assert.equal((await sigrunVikupostur(E, ticketsOverview, { endurreyna: true })).sent, true);
  assert.equal(sendPostar(log).length, 1);
  assert.match(vikan(), /^sent:/);
  // fersk krafa annarrar keyrslu er aldrei tekin
  db.prepare('UPDATE stjorn_sync SET v=?, updated=? WHERE k=?').run('sendi:annar', nu - 60, lykill);
  assert.equal((await sigrunVikupostur(E, ticketsOverview, { endurreyna: true })).adur, true);
  // tókst smellur merkir vikuna senda, svo sjálfvirki pósturinn fari ekki á eftir
  const { env: env2, midi: midi2, db: db2 } = nyrGrunnur();
  midi2({ id: 1, created: v.fra + H, stada: 'nytt' });
  stubFetch(tc);
  assert.equal((await sigrunVikupostur(Object.assign({}, GMAIL, env2), ticketsOverview, { thvinga: true })).sent, true);
  assert.match(db2.prepare('SELECT v FROM stjorn_sync WHERE k=?').get(lykill).v, /^sent:/);
});

t('greinaTicket: það sem þjónninn tók úr drögunum er skráð, og drög úr vistaðri grein kenna ekkert', async (tc) => {
  const { env, midi, skilabod, sync, db } = nyrGrunnur();
  const nu = NU();
  sync('sigrun_still', { sleppa: ['Takk fyrir að hafa samband'] });
  stubFetch(tc, { claude: JSON.stringify({ tegund: 'spurning', forgangur: 2, samantekt: 'x', kb: null, svar: DROG }) });
  midi({ id: 5, created: nu, lysing: 'Spurning' });
  await processNewTicket(Object.assign({ ANTHROPIC_API_KEY: 'k' }, GMAIL, env), { id: 5, netfang: 'a@b.is', lysing: 'Spurning', efni: 'S' });
  const g = JSON.parse(db.prepare('SELECT ai_greining FROM tickets WHERE id=5').get().ai_greining);
  assert.deepEqual(g.fjarlaegt, ['Takk fyrir að hafa samband.']);
  assert.ok(!g.svar.includes('Takk fyrir að hafa samband'));
  // Þrjú slík svör send óbreytt: stíllinn heldur setningunni úti í stað þess að þurrkast út
  for (const id of [6, 7]) midi({ id, created: nu - id * H, ai_greining: JSON.stringify(Object.assign({}, g)) });
  for (const id of [5, 6, 7]) skilabod({ ticket_id: id, ts: nu - H + id, dir: 'out', sent_by: 'aron', texti: g.svar });
  const still = await sigrunStillUppfaera(env);
  assert.deepEqual(still.sleppa, ['Takk fyrir að hafa samband']);
});

t('endurreynaNu: aðeins mánudag eftir kl. 09 — aldrei um miðja nótt vikuna sem aldrei var send', () => {
  const ts = (iso) => Math.floor(Date.parse(iso) / 1000);
  assert.equal(endurreynaNu(ts('2026-09-28T09:00:00Z')), true);
  assert.equal(endurreynaNu(ts('2026-09-28T21:00:00Z')), true);
  assert.equal(endurreynaNu(ts('2026-09-28T06:00:00Z')), false, 'á undan aðalkeyrslunni');
  assert.equal(endurreynaNu(ts('2026-09-22T00:00:00Z')), false, 'þriðjudagur: daginn sem þetta fór í loftið');
});

// ── Aðgangur ─────────────────────────────────────────────────────────────────────────────────────

t('nýju aðgerðirnar hafna X-Admin-Key: grein sem fer í promptið og svarreitinn má aldrei skrifast úr CTO-keyrslu', async () => {
  const { env } = nyrGrunnur();
  const E = Object.assign({ ADMIN_API_KEY: 'adm' }, env);
  for (const action of ['sigrun_vikupostur', 'sigrun_kb_leita', 'sigrun_grein_drog', 'sigrun_grein_vista', 'sigrun_grein_hafna', 'sigrun_grein_eyda']) {
    const res = await adminTicketHandler(new Request('https://karp.is/api/admin/ticket', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Admin-Key': 'adm' },
      body: JSON.stringify({ action, um: 'x y z', svar: 'a'.repeat(60), ids: [1, 2, 3], kb: 'x' }) }), E, {});
    assert.deepEqual(await res.json(), { ok: false, error: 'lota' }, action);
  }
});
