#!/usr/bin/env node
// =============================================================================
//  scrape_local.mjs — LOCAL gentle scraper (keyrt af vél Arons, íbúða-IP sem er
//  EKKI throttlað af www.skatturinn.is — öfugt við GH-runner/Cloudflare-egress).
//  Gerir AÐEINS www.skatturinn.is-skrapið sem gagnaver ná ekki:
//    • nafnaleitar-sweep (upptalning → ný félög í crawl_queue f. GH-nótt að krafla)
//    • raunverulega eigendur (eign-leggir sem GH throttlast á)
//  API-stjórn-crawlið er ÁFRAM í GH-nótt (Azure throttlar ekki þar).
//  Les/skrifar D1 gegnum wrangler (innskráð staðbundið, OAuth Arons).
//
//  KEYRSLA (í PowerShell, svo fetch fari um raun-IP en ekki sandkassa):
//     node skriptur/scrape_local.mjs
//  Umhverfisbreytur: SCRAPE_DELAY_MS (7000), SWEEP_N (60), EIG_N (120)
//  Má keyra handvirkt eða úr Windows Task Scheduler (t.d. daglega).
// =============================================================================
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEigendur, personKey } from './lib/rsk_parse.mjs';
import { extractKts, nextPrefixes } from './lib/sweep.mjs';
import { buildNightSql } from './lib/tengsl_sql.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const RSK = 'https://www.skatturinn.is';
const UA = 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)';
// ⚠ www.skatturinn.is takmarkar ÖLL IP hart (~10 köll/glugga, líka íbúða-IP — sannreynt 20.7).
// Því LÍTIL lota per keyrslu + löng bið; keyra OFT (Task Scheduler) frekar en stórar lotur.
const DELAY = parseInt(process.env.SCRAPE_DELAY_MS || '10000', 10);
const SWEEP_N = parseInt(process.env.SWEEP_N || '4', 10);
const EIG_N = parseInt(process.env.EIG_N || '6', 10);
const MAXFAIL = parseInt(process.env.MAXFAIL || '4', 10);
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// D1 SELECT (einfalt SQL, engin tvöföld gæsalöpp → óhætt inline). Skilar results-fylki.
function d1read(sql) {
  const out = execSync(`npx wrangler d1 execute tengsl --remote --json --command "${sql}"`, { cwd: WEB, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = out.match(/\[[\s\S]*\]/);
  return m ? (JSON.parse(m[0])[0].results || []) : [];
}
async function get(pathq) {
  try { const r = await fetch(RSK + pathq, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.text() : null; }
  catch (e) { return null; }
}
const sq = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";

const acc = { queueAdd: [], eign: [], folk: [], sweepMark: [], sweepAdd: [] };
const extraSql = [];
let sweepFound = 0, eigDone = 0, fails = 0;

// ── 1) SWEEP (upptalning) ──
const prefixes = d1read(`SELECT prefix FROM sweep_state WHERE done=0 ORDER BY length(prefix), prefix LIMIT ${SWEEP_N}`).map((r) => r.prefix);
console.log(`Sweep: ${prefixes.length} forskeyti (delay ${DELAY}ms)`);
for (const pfx of prefixes) {
  if (fails >= MAXFAIL) { console.log(`${MAXFAIL} samfelldar bilanir — hætti sweep`); break; }
  await sleep(DELAY);
  const html = await get('/fyrirtaekjaskra/leit?nafn=' + encodeURIComponent(pfx));
  const kts = html ? extractKts(html) : [];
  if (!kts.length) { fails++; process.stdout.write('·'); continue; }
  fails = 0;
  for (const k of kts) { acc.queueAdd.push({ kt: k, from: 'sweep:' + pfx, priority: 3 }); sweepFound++; }
  const { children } = nextPrefixes(pfx, kts.length, 100);
  for (const c of children) acc.sweepAdd.push(c);
  acc.sweepMark.push({ prefix: pfx, hit_count: kts.length });
  process.stdout.write('+');
}
console.log('');

// ── 2) EIGENDUR (félög sem enn vantar eigendur, virk) ──
const needEig = d1read(`SELECT kt FROM felog WHERE last_eigendur IS NULL AND afskrad=0 LIMIT ${EIG_N}`).map((r) => r.kt);
console.log(`Eigendur: ${needEig.length} félög`);
for (const kt of needEig) {
  if (fails >= MAXFAIL) { console.log(`${MAXFAIL} samfelldar bilanir — hætti eigendum`); break; }
  await sleep(DELAY);
  const html = await get('/fyrirtaekjaskra/leit/kennitala/' + kt);
  if (html === null) { fails++; process.stdout.write('·'); continue; }
  fails = 0; eigDone++;
  extraSql.push(`UPDATE felog SET last_eigendur=${sq(today)} WHERE kt=${sq(kt)};`);   // merkja skrapað (líka ef tómt)
  for (const e of parseEigendur(html)) {
    const key = personKey({ nafn: e.nafn, faeding: e.faeding });
    acc.folk.push({ person_key: key, kt: null, nafn: e.nafn, faeding: e.faeding });
    acc.eign.push({ felag_kt: kt, eigandi_key: key, eigandi_tegund: 'einst', hlutur: e.hlutur, tegund: 'raunverulegur', heimild: 'RSK raunverulegir eigendur' });
  }
  process.stdout.write('+');
}
console.log('');

// ── 3) Skrifa í D1 ──
const body = [buildNightSql({ today, ...acc }), ...extraSql].join('\n').trim();
const summary = `Fann: ${sweepFound} úr sweep · ${eigDone} eigenda-skröp · ${acc.eign.length} eign-leggir`;
console.log(summary);
// Logg fyrir bakgrunns-keyrslu (Task Scheduler sér ekki console) — ein lína per keyrslu í temp.
try { fs.appendFileSync(path.join(os.tmpdir(), 'karp-scrape.log'), `${new Date().toISOString()}  ${summary}\n`); } catch (e) {}
if (!body) { console.log('Ekkert að skrifa.'); process.exit(0); }
const sqlFile = path.join(WEB, 'local_scrape.sql');
fs.writeFileSync(sqlFile, body + '\n');
execSync('npx wrangler d1 execute tengsl --remote --file local_scrape.sql', { cwd: WEB, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: 'inherit' });
fs.unlinkSync(sqlFile);
console.log('✓ Beitt á D1.');
