import { test } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { buildNightSql, buildSeenLastSql, sqlLit, MAX_ATTEMPTS } from './tengsl_sql.mjs';

const schema = fs.readFileSync(new URL('../../web/migrations/0001_tengsl.sql', import.meta.url), 'utf8');
const fresh = () => { const db = new DatabaseSync(':memory:'); db.exec(schema); return db; };

test('sqlLit escapes single quotes and nulls', () => {
  assert.equal(sqlLit(null), 'NULL');
  assert.equal(sqlLit("O'Brien"), "'O''Brien'");
  assert.equal(sqlLit(42), '42');
});

test('buildNightSql: inserts felag+hlutverk, idempotent on re-apply', () => {
  const db = fresh();
  // rótin er þegar í biðröð (seed); crawlið merkir hana done (ekki DELETE).
  db.exec("INSERT INTO crawl_queue (kt,priority,added_at,status) VALUES ('5920190799',1,'2026-07-12','pending');");
  const rec = {
    today: '2026-07-12',
    felog: [{ kt: '5920190799', nafn: 'Rót ehf.', form: 'Einkahlutafélag', stada: 'Virk', skraning: '2001-04-03', afskrad: 0, afskrad_dags: null, gjaldthrot: 0, gjaldthrot_dags: null, gjaldthol: 0, gjaldthol_dags: null, isat: '[]', hlutafe: 500000, mynt: 'ISK' }],
    folk: [{ person_key: '1201743509', kt: '1201743509', nafn: 'Anna Ansdóttir', faeding: null }],
    hlutverk: [{ felag_kt: '5920190799', person_key: '1201743509', hlutverk: 'Stjórnarformaður', tegund: 'Stjórn' }],
    eign: [], queueMark: [{ kt: '5920190799', status: 'done' }], queueAdd: [{ kt: '4808221610', from: '5920190799' }],
  };
  const sql = buildNightSql(rec);
  db.exec(sql); db.exec(sql); // apply twice → idempotent
  assert.equal(db.prepare('SELECT COUNT(*) n FROM felog').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM hlutverk').get().n, 1);
  assert.equal(db.prepare("SELECT seen_first FROM hlutverk").get().seen_first, '2026-07-12');
  assert.equal(db.prepare("SELECT status FROM crawl_queue WHERE kt='4808221610'").get().status, 'pending');
  // rótin er nú 'done' (ekki fjarlægð) → endur-uppgötvun endur-pending-ar hana EKKI
  assert.equal(db.prepare("SELECT status FROM crawl_queue WHERE kt='5920190799'").get().status, 'done');
});

test('buildNightSql: discovered kt of an already-done company stays done (no re-crawl loop)', () => {
  const db = fresh();
  db.exec("INSERT INTO crawl_queue (kt,priority,added_at,status,crawled_at) VALUES ('4808221610',1,'2026-01-01','done','2026-01-01');");
  // félag A uppgötvar B (sem er þegar done) → INSERT OR IGNORE má EKKI flytja B aftur í pending
  db.exec(buildNightSql({ today: '2026-07-12', queueAdd: [{ kt: '4808221610', from: '5920190799' }] }));
  assert.equal(db.prepare("SELECT status FROM crawl_queue WHERE kt='4808221610'").get().status, 'done');
});

test('buildNightSql: queueRetry bumps attempts, gives up after MAX_ATTEMPTS', () => {
  const db = fresh();
  db.exec(`INSERT INTO crawl_queue (kt,priority,added_at,status,attempts) VALUES ('5920190799',1,'2026-07-12','pending',${MAX_ATTEMPTS - 1});`);
  db.exec(buildNightSql({ today: '2026-07-12', queueRetry: ['5920190799'] }));
  const row = db.prepare("SELECT status,attempts FROM crawl_queue WHERE kt='5920190799'").get();
  assert.equal(row.attempts, MAX_ATTEMPTS);
  assert.equal(row.status, 'error'); // gafst upp
});

test('buildNightSql: sweep marks prefix done + adds deeper prefixes', () => {
  const db = fresh();
  db.exec("INSERT INTO sweep_state (prefix,done,updated_at) VALUES ('a',0,'2026-07-12');");
  db.exec(buildNightSql({ today: '2026-07-12', sweepMark: [{ prefix: 'a', hit_count: 100 }], sweepAdd: ['ab', 'ac'] }));
  assert.equal(db.prepare("SELECT done FROM sweep_state WHERE prefix='a'").get().done, 1);
  assert.equal(db.prepare("SELECT hit_count FROM sweep_state WHERE prefix='a'").get().hit_count, 100);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sweep_state WHERE prefix IN ('ab','ac')").get().n, 2);
});

test('buildSeenLastSql: closes vanished rows only', () => {
  const db = fresh();
  db.exec(buildNightSql({
    today: '2026-01-01', felog: [{ kt: '5920190799', nafn: 'Rót', form: null, stada: null, skraning: null, afskrad: 0, afskrad_dags: null, gjaldthrot: 0, gjaldthrot_dags: null, gjaldthol: 0, gjaldthol_dags: null, isat: '[]', hlutafe: null, mynt: null }],
    folk: [{ person_key: 'A', kt: null, nafn: 'A', faeding: null }, { person_key: 'B', kt: null, nafn: 'B', faeding: null }],
    hlutverk: [{ felag_kt: '5920190799', person_key: 'A', hlutverk: 'Stjórn', tegund: null }, { felag_kt: '5920190799', person_key: 'B', hlutverk: 'Stjórn', tegund: null }],
    eign: [], queueDone: [], queueAdd: [],
  }));
  // Re-crawl: only A remains → B must be closed
  db.exec(buildSeenLastSql('5920190799', ['A|Stjórn'], [], '2026-06-01'));
  assert.equal(db.prepare("SELECT seen_last FROM hlutverk WHERE person_key='A'").get().seen_last, null);
  assert.equal(db.prepare("SELECT seen_last FROM hlutverk WHERE person_key='B'").get().seen_last, '2026-06-01');
});
