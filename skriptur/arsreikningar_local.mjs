#!/usr/bin/env node
// arsreikningar_local.mjs — LOCAL ársreikninga-trickle (vél Arons, íbúða-IP). Sækir ársreikninga
// fyrir stærstu félög í markgreinum sem vantar `fjarhagur`, þáttar veltu/hagnað/eignir og skrifar
// í D1 `fjarhagur` (röðun) gegnum wrangler. Fullur ársreikningur fer í gogn/arsreikningar/<kt>.json.
// KEYRSLA (PowerShell, svo fetch/puppeteer fari um raun-IP): node skriptur/arsreikningar_local.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arsreikningurSummary } from './lib/fjarhagur.mjs';
import { sqlLit as L } from './lib/tengsl_sql.mjs';
import { GREINAR } from '../web/src/lib/greinar.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const AR_N = parseInt(process.env.AR_N || '8', 10);
const DELAY = parseInt(process.env.SCRAPE_DELAY_MS || '8000', 10);
const MAXFAIL = 4;
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// öll 2-stafa ÍSAT-forskeyti markgreina (island = allt → tökum bara þau sem eru í greinunum)
const prefixes = [...new Set(GREINAR.flatMap((g) => g.isat || []))];
const inClause = prefixes.map((p) => "'" + p + "'").join(',');

function d1read(sql) {
  const out = execSync(`npx wrangler d1 execute tengsl --remote --json --command "${sql}"`, { cwd: WEB, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = out.match(/\[[\s\S]*\]/);
  return m ? (JSON.parse(m[0])[0].results || []) : [];
}

// félög í markgreinum sem vantar fjarhagur, stærst (hlutafe) fyrst
const rows = d1read(`SELECT f.kt FROM felog f LEFT JOIN fjarhagur fj ON fj.kt=f.kt WHERE fj.kt IS NULL AND f.afskrad=0 AND substr(f.isat_primary,1,2) IN (${inClause}) ORDER BY f.hlutafe DESC NULLS LAST LIMIT ${AR_N}`);
console.log(`Ársreikningar: ${rows.length} félög (markgreinar, vantar fjarhagur)`);

const upserts = [];
let ok = 0, fails = 0;
for (const { kt } of rows) {
  if (fails >= MAXFAIL) { console.log(`${MAXFAIL} bilanir — hætti`); break; }
  await sleep(DELAY);
  try {
    execSync(`node skriptur/build_arsreikningar.mjs ${kt}`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { fails++; process.stdout.write('·'); continue; }
  const jf = path.join(WEB, 'public/gogn/arsreikningar', kt + '.json');
  if (!fs.existsSync(jf)) { fails++; process.stdout.write('·'); continue; }
  const s = arsreikningurSummary(JSON.parse(fs.readFileSync(jf, 'utf8')));
  fails = 0; ok++;
  if (s) upserts.push(`INSERT INTO fjarhagur (kt,ar,sala,hagnadur,eignir,eigid_fe,sott) VALUES (${L(kt)},${L(s.ar)},${L(s.sala)},${L(s.hagnadur)},${L(s.eignir)},${L(s.eigid_fe)},${L(today)}) ON CONFLICT(kt) DO UPDATE SET ar=excluded.ar,sala=excluded.sala,hagnadur=excluded.hagnadur,eignir=excluded.eignir,eigid_fe=excluded.eigid_fe,sott=excluded.sott;`);
  else upserts.push(`INSERT OR IGNORE INTO fjarhagur (kt,ar,sott) VALUES (${L(kt)},NULL,${L(today)});`);   // merkja reynt (engin ISK-velta)
  process.stdout.write('+');
}
console.log(`\nÞáttað: ${ok} ársreikningar · ${upserts.length} fjarhagur-raðir`);

if (upserts.length) {
  const sqlFile = path.join(WEB, 'ar_local.sql');
  fs.writeFileSync(sqlFile, upserts.join('\n') + '\n');
  execSync('npx wrangler d1 execute tengsl --remote --file ar_local.sql', { cwd: WEB, encoding: 'utf8', stdio: 'inherit', maxBuffer: 64 * 1024 * 1024 });
  fs.unlinkSync(sqlFile);
  console.log('✓ Beitt á D1.');
}
try { fs.appendFileSync(path.join(os.tmpdir(), 'karp-arsreikn.log'), `${new Date().toISOString()}  ok=${ok} radir=${upserts.length}\n`); } catch (e) {}
