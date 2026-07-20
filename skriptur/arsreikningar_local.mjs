#!/usr/bin/env node
// arsreikningar_local.mjs — LOCAL ársreikninga-trickle (vél Arons, íbúða-IP). Sækir ársreikninga
// fyrir stærstu félög í markgreinum sem vantar `fjarhagur`, þáttar veltu/hagnað/eignir og skrifar
// í D1 `fjarhagur` (röðun) gegnum D1 REST API — EKKI wrangler CLI (hann hrynur undir Task Scheduler).
// Fullur ársreikningur fer í gogn/arsreikningar/<kt>.json. INKREMENTAL skrif → hrun tapar ekki lotunni.
// KEYRSLA: node skriptur/arsreikningar_local.mjs   (þarf CF-token í web/.dev.vars — sjá lib/d1_rest.mjs)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arsreikningurSummary } from './lib/fjarhagur.mjs';
import { sqlLit as L } from './lib/tengsl_sql.mjs';
import { GREINAR } from '../web/src/lib/greinar.mjs';
import { makeD1 } from './lib/d1_rest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const AR_N = parseInt(process.env.AR_N || '8', 10);
const DELAY = parseInt(process.env.SCRAPE_DELAY_MS || '8000', 10);
const MAXFAIL = 4;
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d1 = makeD1(WEB);

// öll 2-stafa ÍSAT-forskeyti markgreina (island = allt → tökum bara þau sem eru í greinunum)
const prefixes = [...new Set(GREINAR.flatMap((g) => g.isat || []))];
const inClause = prefixes.map((p) => "'" + p + "'").join(',');

// félög í markgreinum sem vantar fjarhagur, stærst (hlutafe) fyrst
const rows = await d1.query(`SELECT f.kt FROM felog f LEFT JOIN fjarhagur fj ON fj.kt=f.kt WHERE fj.kt IS NULL AND f.afskrad=0 AND substr(f.isat_primary,1,2) IN (${inClause}) ORDER BY f.hlutafe DESC NULLS LAST LIMIT ${AR_N}`);
console.log(`Ársreikningar: ${rows.length} félög (markgreinar, vantar fjarhagur)`);

let ok = 0, wrote = 0, fails = 0;
for (const { kt } of rows) {
  if (fails >= MAXFAIL) { console.log(`${MAXFAIL} bilanir — hætti`); break; }
  await sleep(DELAY);
  try {
    execSync(`node skriptur/build_arsreikningar.mjs ${kt}`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { fails++; process.stdout.write('·'); continue; }
  const jf = path.join(WEB, 'public/gogn/arsreikningar', kt + '.json');
  if (!fs.existsSync(jf)) { fails++; process.stdout.write('·'); continue; }
  let s;
  try { s = arsreikningurSummary(JSON.parse(fs.readFileSync(jf, 'utf8'))); }
  catch (e) { fails++; process.stdout.write('·'); continue; }   // spillt/hálf-skrifað JSON → sleppa (ekki hrynja)
  fails = 0; ok++;
  // INKREMENTAL skrif STRAX — hrun í næsta félagi tapar ekki þessu (öfugt við gamla lotu-skrifið).
  const sql = s
    ? `INSERT INTO fjarhagur (kt,ar,sala,hagnadur,eignir,eigid_fe,sott) VALUES (${L(kt)},${L(s.ar)},${L(s.sala)},${L(s.hagnadur)},${L(s.eignir)},${L(s.eigid_fe)},${L(today)}) ON CONFLICT(kt) DO UPDATE SET ar=excluded.ar,sala=excluded.sala,hagnadur=excluded.hagnadur,eignir=excluded.eignir,eigid_fe=excluded.eigid_fe,sott=excluded.sott;`
    : `INSERT OR IGNORE INTO fjarhagur (kt,ar,sott) VALUES (${L(kt)},NULL,${L(today)});`;   // merkja reynt (engin ISK-velta)
  try { await d1.query(sql); wrote++; process.stdout.write('+'); }
  catch (e) { process.stdout.write('!'); }   // D1-skrif brást → halda áfram (reynt aftur í næstu keyrslu)
}
console.log(`\nÞáttað: ${ok} ársreikningar · ${wrote} fjarhagur-raðir skrifaðar`);
try { fs.appendFileSync(path.join(os.tmpdir(), 'karp-arsreikn.log'), `${new Date().toISOString()}  ok=${ok} radir=${wrote}\n`); } catch (e) {}
