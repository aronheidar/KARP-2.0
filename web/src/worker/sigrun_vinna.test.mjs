// Prófað gegn RAUNVERULEGRI SQLite með raunverulegu migration-skemanu (0006 + 0015), ekki gervi-D1
// sem ber saman SQL-strengi. Villurnar sem skipta máli hér eru merkingarlegar — `NULL <> 'stjorn'`
// er NULL en ekki satt, HAVING á samanteknum dálki, LIKE á íslenskum stöfum — og strengjasamanburður
// sér þær aldrei. node:sqlite er í Node 22+; vanti það er prófinu sleppt frekar en að það falli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* ekki til — prófum sleppt */ }
const t = DatabaseSync ? test : test.skip;

const { skraAtburd, opnirMidar, sigrunVika, sigrunTillaga, sigrunSpjall, lokaMargt } = await import('./sigrun_vinna.mjs');
const { setTicket } = await import('./hjalp_agent.mjs');
const { isoVika } = await import('../lib/stjorn/vika.mjs');

const mig = (n) => readFileSync(fileURLToPath(new URL('../../migrations/' + n, import.meta.url)), 'utf8');

/** D1-hlutmengið sem einingin notar, ofan á node:sqlite. */
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { prepare: (sql) => stmt(sql) };
}

const V38 = isoVika(Math.floor(Date.parse('2026-09-16T12:00:00Z') / 1000));   // 14.–20. sept 2026, liðin
const D = 86400, H = 3600;

function nyrGrunnur() {
  const db = new DatabaseSync(':memory:');
  db.exec(mig('0006_stjorn_sync.sql'));
  db.exec(mig('0015_tickets.sql'));
  const env = { TENGSL: d1(db) };
  // uppruni er NOT NULL DEFAULT 'form' í skemanu — sé hann ekki gefinn gildir sjálfgildið, eins og í raun
  const midi = (o) => {
    const d = { id: o.id, created: o.created, updated: o.updated ?? o.created, netfang: 'a@b.is', efni: o.efni ?? 'efni',
      lysing: 'lýsing', stada: o.stada ?? 'nytt', tegund: o.tegund ?? null, ...(o.uppruni ? { uppruni: o.uppruni } : {}) };
    const k = Object.keys(d);
    db.prepare('INSERT INTO tickets (' + k.join(',') + ') VALUES (' + k.map(() => '?').join(',') + ')').run(...k.map((x) => d[x]));
  };
  // sent_by er NOT NULL — innkomin skilaboð bera 'notandi'. efni MÁ vera NULL, og það er prófað.
  const skilabod = (o) => db.prepare('INSERT INTO ticket_msgs (ticket_id, ts, dir, sent_by, efni, texti) VALUES (?,?,?,?,?,?)')
    .run(o.ticket_id, o.ts, o.dir, o.sent_by ?? (o.dir === 'in' ? 'notandi' : 'agent'), o.efni ?? null, o.texti ?? '');
  return { db, env, midi, skilabod };
}

t('sigrunVika: telur rétt, og IFNULL heldur svörum sem bera ekkert efni (efni MÁ vera NULL)', async () => {
  const { env, midi, skilabod } = nyrGrunnur();
  const f = V38.fra;
  midi({ id: 1, created: f + H, tegund: 'adgangur' });                         // sjálfgefinn uppruni 'form'
  midi({ id: 2, created: f + 2 * H, uppruni: 'form', tegund: 'adgangur' });
  midi({ id: 3, created: f + 3 * H, uppruni: 'gmail', tegund: 'villa' });
  midi({ id: 4, created: f + 4 * H, uppruni: 'stjorn' });                      // Aron samdi sjálfur — ekki beiðni
  midi({ id: 5, created: f - 3 * D, uppruni: 'form' });                        // vikan á undan
  // staðfesting er EKKI svar; svar hennar og svar Arons eru það
  skilabod({ ticket_id: 1, ts: f + H + 60, dir: 'out', sent_by: 'agent', efni: '[Karp #1] Móttekið: efni' });
  skilabod({ ticket_id: 1, ts: f + 3 * H, dir: 'out', sent_by: 'agent', efni: '[Karp #1] efni' });              // 2 klst. svartími
  skilabod({ ticket_id: 2, ts: f + 6 * H, dir: 'out', sent_by: 'aron', efni: '[Karp #2] efni' });               // 4 klst.
  skilabod({ ticket_id: 3, ts: f + 9 * H, dir: 'out', sent_by: 'agent', efni: null });                          // NULL efni — VERÐUR að teljast svar, 6 klst.
  skilabod({ ticket_id: 4, ts: f + 4 * H, dir: 'out', sent_by: 'aron', efni: '[Karp #4] x' });                  // samið sjálfur — telst ekki
  const r = await sigrunVika(env, V38.fra, V38.til);
  assert.equal(r.ok, true);
  assert.equal(r.tolur.barust, 3, 'miðar 1–3; 4 er saminn af Aroni og 5 í fyrri viku');
  assert.equal(r.tolur.svaradHenni, 2, 'miðar 1 og 3 — staðfestingin á 1 telst ekki sérstaklega');
  assert.equal(r.tolur.svaradAroni, 1, 'miði 2 — samið efni á 4 telst ekki');
  assert.equal(r.tolur.svartimiKlst, 4, 'miðgildi 2, 4, 6 klst.');
  assert.deepEqual(r.tolur.algengastFlokkur, { heiti: 'aðgang', hlutfall: 2 / 3 });
});

t('sigrunVika: reiknuð EINU SINNI og síðan geymd — boot() á ekki að lesa D1 aftur', async () => {
  const { env, midi } = nyrGrunnur();
  midi({ id: 1, created: V38.fra + H });
  const a = await sigrunVika(env, V38.fra, V38.til);
  midi({ id: 2, created: V38.fra + 2 * H });                                     // síðbúin gögn
  const b = await sigrunVika(env, V38.fra, V38.til);
  assert.equal(a.geymt, false);
  assert.equal(b.geymt, true);
  assert.equal(b.tolur.barust, 1, 'geymda talan stendur');
});

t('sigrunVika: neitar ólokinni viku og tölum sem eru ekki vikumörk', async () => {
  const { env } = nyrGrunnur();
  const framtid = isoVika(Math.floor(Date.parse('2031-03-05T12:00:00Z') / 1000));
  assert.equal((await sigrunVika(env, framtid.fra, framtid.til)).error, 'vika');
  assert.equal((await sigrunVika(env, V38.fra + 5, V38.til)).error, 'vika');
  assert.equal((await sigrunVika(env, 'x', 'y')).error, 'vika');
});

t('sigrunVika: lokanir nákvæmar úr atburðaskrá ef hún náði yfir vikuna, annars áætlaðar', async () => {
  // A: skráning hófst ÁÐUR en vikan byrjaði → nákvæmt
  const a = nyrGrunnur();
  a.db.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('atb_byrjun', 'x', ?)").run(V38.fra - D);
  for (const [k, ts] of [['atb:lokad:1', V38.fra + H], ['atb:lokad:2', V38.fra + 2 * H], ['atb:hafnad:3', V38.fra + 3 * H], ['atb:cto:4', V38.fra + 4 * H], ['atb:lokad:9', V38.til + H]])
    a.db.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?)').run(k, k.split(':')[1], ts);
  const ra = await sigrunVika(a.env, V38.fra, V38.til);
  assert.deepEqual([ra.tolur.lokad, ra.tolur.hafnad, ra.tolur.tilHrafns, ra.tolur.aaetlad], [2, 1, 1, false]);
  // B: engin skráning → áætlað út frá updated á miðum sem standa í stöðunni nú
  const b = nyrGrunnur();
  b.midi({ id: 1, created: V38.fra - 9 * D, updated: V38.fra + H, stada: 'lokad' });
  b.midi({ id: 2, created: V38.fra - 9 * D, updated: V38.fra + H, stada: 'tillaga' });
  b.midi({ id: 3, created: V38.fra - 9 * D, updated: V38.fra - H, stada: 'lokad' });   // lokað fyrir vikuna
  const rb = await sigrunVika(b.env, V38.fra, V38.til);
  assert.deepEqual([rb.tolur.lokad, rb.tolur.tilHrafns, rb.tolur.aaetlad], [1, 1, true]);
});

t('opnirMidar + sigrunTillaga: raunverulegt SQL velur rétta miða til að loka', async () => {
  const { env, midi, skilabod } = nyrGrunnur();
  const nu = Math.floor(Date.now() / 1000);
  midi({ id: 10, created: nu - 20 * D, stada: 'svarad', efni: 'Gamalt svar' });
  skilabod({ ticket_id: 10, ts: nu - 20 * D, dir: 'in', texti: 'Hjálp' });
  skilabod({ ticket_id: 10, ts: nu - 12 * D, dir: 'out', sent_by: 'aron', efni: '[Karp #10] x' });
  midi({ id: 11, created: nu - 3 * D, stada: 'stadfest', efni: 'Þakkir' });
  skilabod({ ticket_id: 11, ts: nu - 3 * D, dir: 'in', texti: 'Hjálp' });
  skilabod({ ticket_id: 11, ts: nu - 2 * D, dir: 'out', sent_by: 'aron', efni: 'x' });
  skilabod({ ticket_id: 11, ts: nu - D, dir: 'in', texti: 'Takk kærlega, þetta virkar!' });
  skilabod({ ticket_id: 11, ts: nu - D + 60, dir: 'moot', sent_by: 'sigrun', texti: 'ráðið' });   // moot telst EKKI síðustu skilaboð
  midi({ id: 12, created: nu - 3 * D, stada: 'cto', efni: 'Hrafn að vinna' });
  skilabod({ ticket_id: 12, ts: nu - 20 * D, dir: 'out', sent_by: 'aron', efni: 'x' });
  midi({ id: 13, created: nu - 30 * D, stada: 'lokad', efni: 'Þegar lokað' });
  const opnir = await opnirMidar(env);
  assert.deepEqual(opnir.map((m) => m.id).sort(), [10, 11, 12], 'lokaður miði er ekki opinn');
  assert.equal(opnir.find((m) => m.id === 11).sidastaAtt, 'in', 'moot-lína á eftir telst ekki');
  const r = await sigrunTillaga(env);
  assert.deepEqual(r.tillaga.midar.map((m) => m.id), [10, 11]);
  assert.equal(r.svar, 'Ég fann 2 beiðnir sem má loka. Taktu hakið af þeim sem þú vilt halda opnum.');
});

t('lokaMargt: aðeins miðar sem ENN uppfylla regluna, les aftur, skráir nótu og atburð', async () => {
  const { db, env, midi, skilabod } = nyrGrunnur();
  const nu = Math.floor(Date.now() / 1000);
  midi({ id: 20, created: nu - 20 * D, stada: 'svarad' });
  skilabod({ ticket_id: 20, ts: nu - 9 * D, dir: 'out', sent_by: 'aron', efni: '[Karp #20] x' });   // raunverulegur kandídat
  midi({ id: 21, created: nu - D, stada: 'cto' });
  midi({ id: 22, created: nu - D, stada: 'lokad' });
  const r = await lokaMargt(env, { ids: [20, 21, 22, 999, 'x'] }, setTicket);
  assert.deepEqual(r.lokad, [20]);
  assert.deepEqual(r.sleppt, [21, 22, 999]);
  const t20 = db.prepare('SELECT stada, notur FROM tickets WHERE id=20').get();
  assert.equal(t20.stada, 'lokad');
  assert.match(t20.notur, /Lokað að tillögu Sigrúnar$/);
  assert.ok(db.prepare("SELECT 1 AS x FROM stjorn_sync WHERE k='atb:lokad:20'").get(), 'atburður skráður');
  assert.equal(db.prepare('SELECT stada FROM tickets WHERE id=21').get().stada, 'cto', 'Hrafn heldur sínum');
  assert.equal((await lokaMargt(env, { ids: [] }, setTicket)).error, 'ids');
});

t('skraAtburd: uppfærir í stað þess að tvítaka, og byrjunin festist við fyrstu skráningu', async () => {
  const { db, env } = nyrGrunnur();
  await skraAtburd(env, 'lokad', 5);
  const fyrst = db.prepare("SELECT updated FROM stjorn_sync WHERE k='atb_byrjun'").get().updated;
  await skraAtburd(env, 'lokad', 5);
  await skraAtburd(env, 'eyda', 5);                                              // óþekkt tegund — hunsuð
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stjorn_sync WHERE k LIKE 'atb:%'").get().n, 1);
  assert.equal(db.prepare("SELECT updated FROM stjorn_sync WHERE k='atb_byrjun'").get().updated, fyrst);
  await skraAtburd({ TENGSL: { prepare: () => { throw new Error('D1 niðri'); } } }, 'lokad', 1);   // kastar aldrei
});

t('sigrunSpjall: svarar, og aðeins lokunarhæf númer komast í tillöguna', async () => {
  const { env, midi, skilabod } = nyrGrunnur();
  const nu = Math.floor(Date.now() / 1000);
  midi({ id: 30, created: nu - 20 * D, stada: 'svarad', efni: 'Gamalt' });
  skilabod({ ticket_id: 30, ts: nu - 12 * D, dir: 'out', sent_by: 'aron', efni: 'x' });
  midi({ id: 31, created: nu - D, stada: 'stadfest', efni: 'Nýtt' });
  const upprunalegt = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"svar":"Þessa má loka.","loka":[30,31,777]}' }] }) }; };
  try {
    const r = await sigrunSpjall(Object.assign({ ANTHROPIC_API_KEY: 'k' }, env), { texti: 'lokaðu þeim sem eru búnir', saga: [] });
    assert.equal(r.ok, true);
    assert.equal(r.svar, 'Þessa má loka.');
    assert.deepEqual(r.tillaga.midar.map((m) => m.id), [30], '31 er opinn og ósvaraður, 777 er ekki til');
    assert.ok(sent.system.includes('LOKUNARHÆFAR'));
    assert.ok(sent.messages[sent.messages.length - 1].content.includes('#30'));
  } finally { globalThis.fetch = upprunalegt; }
  assert.equal((await sigrunSpjall(env, { texti: 'hæ' })).error, 'unconfigured');
  assert.equal((await sigrunSpjall(Object.assign({ ANTHROPIC_API_KEY: 'k' }, env), { texti: 'x' })).error, 'texti');
});

t('lokaMargt: rýnin 21.9 — notandi skrifaði aftur EFTIR tillöguna, og miðanum er EKKI lokað', async () => {
  const { db, env, midi, skilabod } = nyrGrunnur();
  const nu = Math.floor(Date.now() / 1000);
  midi({ id: 10, created: nu - 20 * D, stada: 'svarad' });
  skilabod({ ticket_id: 10, ts: nu - 12 * D, dir: 'out', sent_by: 'aron', efni: '[Karp #10] x' });
  const tillaga = await sigrunTillaga(env);
  assert.deepEqual(tillaga.tillaga.midar.map((m) => m.id), [10], 'lagður til: þögn í 12 daga');
  // póstinnlesturinn: nýtt skilaboð frá notanda, og miðinn færður í stadfest (gmail_intake.mjs:103)
  skilabod({ ticket_id: 10, ts: nu - 60, dir: 'in', texti: 'Þetta virkar ENN ekki' });
  db.prepare("UPDATE tickets SET stada='stadfest' WHERE id=10").run();
  const r = await lokaMargt(env, { ids: [10] }, setTicket);
  assert.deepEqual(r.lokad, []);
  assert.deepEqual(r.sleppt, [10]);
  assert.equal(db.prepare('SELECT stada FROM tickets WHERE id=10').get().stada, 'stadfest', 'nýi pósturinn situr ekki í lokuðum miða');
});

t('sigrunVika: rýnin 21.9 — bilun í D1 er ALDREI geymd sem tala', async () => {
  const { db, env, midi } = nyrGrunnur();
  midi({ id: 1, created: V38.fra + H });
  const brothaett = { TENGSL: { prepare: (sql) => {
    const st = env.TENGSL.prepare(sql);
    if (/^SELECT COUNT\(\*\) AS n FROM tickets t WHERE t\.created/.test(sql)) return { bind: () => ({ first: async () => { throw new Error('D1 7500'); } }) };
    return st;
  } } };
  const a = await sigrunVika(brothaett, V38.fra, V38.til);
  assert.deepEqual(a, { ok: false, error: 'd1' });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stjorn_sync WHERE k LIKE 'sigrun_vika:%'").get().n, 0, 'ekkert geymt');
  const b = await sigrunVika(env, V38.fra, V38.til);
  assert.equal(b.ok, true);
  assert.equal(b.geymt, false);
  assert.equal(b.tolur.barust, 1, 'heilbrigt kall reiknar rétta tölu — ekki geymda núllið');
});
