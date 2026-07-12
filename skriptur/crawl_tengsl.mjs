#!/usr/bin/env node
// crawl_tengsl.mjs — næturlegur snjóbolta-crawler. Les batch úr crawl_queue,
// kallar RSK-API (stjórn, með persónu-kt) + frítt eigenda-skrap, skrifar EITT
// night.sql og beitir því á D1 um wrangler. Kvóta-þak = TENGSL_BUDGET.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { parseLegalEntity, parseEigendur, personKey } from './lib/rsk_parse.mjs';
import { buildNightSql, buildSeenLastSql } from './lib/tengsl_sql.mjs';

const DRY = process.argv.includes('--dry-run');
const bi = process.argv.indexOf('--budget');
const BUDGET = bi >= 0 ? parseInt(process.argv[bi + 1], 10) : parseInt(process.env.TENGSL_BUDGET || '1500', 10);
const RSK_KEY = process.env.RSK_KEY;
const today = new Date().toISOString().slice(0, 10);
const API = 'https://api.skattur.cloud/legalentities/v2.1/';
const RSK_ROT = 'https://www.skatturinn.is';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!RSK_KEY) { console.error('RSK_KEY vantar — hætti (crawl sefur þar til secret kemur).'); process.exit(0); }

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: 'web', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
}
function queueBatch(n) {
  const out = wrangler(['d1', 'execute', 'tengsl', '--remote', '--json', '--command',
    `SELECT kt FROM crawl_queue WHERE status='pending' ORDER BY priority, added_at LIMIT ${n}`]);
  try { const j = JSON.parse(out); const rows = (j[0] && j[0].results) || j.results || []; return rows.map((r) => r.kt); }
  catch (e) { console.error('Gat ekki lesið biðröð:', e.message); return []; }
}

async function fetchApi(kt) {
  const r = await fetch(API + kt + '?language=is', { headers: { 'Ocp-Apim-Subscription-Key': RSK_KEY, 'Accept': 'application/json' } });
  if (r.status === 401 || r.status === 403) { throw new Error('AUTH ' + r.status); }   // rangur lykill → stöðva nótt
  if (r.status === 404) return { notfound: true };
  if (!r.ok) return { error: r.status };
  return { json: await r.json().catch(() => null) };
}
async function fetchEigendur(kt) {
  try {
    const r = await fetch(RSK_ROT + '/fyrirtaekjaskra/leit/kennitala/' + kt, { headers: { 'User-Agent': 'karp.is tengslagrunnur (aronheidars@gmail.com)' } });
    if (!r.ok) return [];
    return parseEigendur(await r.text());
  } catch (e) { return []; }
}

const acc = { felog: [], folk: [], hlutverk: [], eign: [], queueDone: [], queueAdd: [] };
const seenLastSql = [];
let used = 0, ok = 0, notfound = 0, errs = 0, discovered = 0;

const batch = queueBatch(BUDGET);
console.error(`Batch: ${batch.length} kt (budget ${BUDGET}).`);

for (const kt of batch) {
  if (used >= BUDGET) break;
  used++;
  let api;
  try { api = await fetchApi(kt); }
  catch (e) { console.error('STÖÐVA nótt:', e.message); break; }   // AUTH → hætta strax
  acc.queueDone.push(kt);
  if (api.notfound) { notfound++; continue; }
  if (api.error || !api.json) { errs++; continue; }
  const rec = parseLegalEntity(kt, api.json);
  if (!rec) { errs++; continue; }
  ok++;
  acc.felog.push(rec.felag);
  acc.folk.push(...rec.folk);
  acc.hlutverk.push(...rec.hlutverk);
  for (const dk of rec.discovered) { acc.queueAdd.push({ kt: dk, from: kt, priority: 2 }); discovered++; }
  // frítt eigenda-skrap (kurteist)
  await sleep(1500);
  const eig = await fetchEigendur(kt);
  const eignRows = [];
  for (const e of eig) {
    const key = personKey({ nafn: e.nafn, faeding: e.faeding });
    acc.folk.push({ person_key: key, kt: null, nafn: e.nafn, faeding: e.faeding });
    const row = { felag_kt: kt, eigandi_key: key, eigandi_tegund: 'einst', hlutur: e.hlutur, tegund: 'raunverulegur', heimild: 'RSK raunverulegir eigendur' };
    acc.eign.push(row); eignRows.push(row);
  }
  // seen_last: loka hlutverkum/eignum sem hurfu úr þessu félagi
  const keptH = rec.hlutverk.map((h) => h.person_key + '|' + h.hlutverk);
  const keptE = eignRows.map((r) => r.eigandi_key + '|' + r.tegund);
  seenLastSql.push(buildSeenLastSql(kt, keptH, keptE, today));
}

const sql = [buildNightSql({ today, ...acc }), ...seenLastSql].join('\n') + '\n';
fs.writeFileSync('web/night.sql', sql);
console.error(`Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur · ${discovered} uppgötvuð · ${used} köll notuð.`);
console.error(`Rita ${(sql.length / 1024).toFixed(0)} KiB í web/night.sql.`);

if (DRY) { console.error('--dry-run: beiti EKKI á D1.'); process.exit(0); }
if (used === 0) { console.error('Ekkert að skrifa.'); process.exit(0); }
wrangler(['d1', 'execute', 'tengsl', '--remote', '--file', 'night.sql']);
fs.unlinkSync('web/night.sql');
console.error('✓ Beitt á D1.');

// GH-summary
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Tengslagrunnur — nótt ${today}\n\n- Köll notuð: **${used}** / ${BUDGET}\n- Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur\n- Uppgötvuð ný félög: ${discovered}\n`);
}
