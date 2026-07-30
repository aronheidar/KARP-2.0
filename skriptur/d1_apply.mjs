// d1_apply.mjs — keyrir SQL (skrá eða skipun) gegn tengsl-D1 um REST með database_id BEINT.
// Til: CI-tokenið hefur ekki „list"-heimild svo nafna-byggt `wrangler d1 execute tengsl` fellur í CI
// (úttekt 30.7.2026, C8). Notar sama lib/d1_rest.mjs helper og crawl_tengsl/arsreikningar_local.
// Notkun: node skriptur/d1_apply.mjs --file web/migrations/0001_tengsl.sql
//         node skriptur/d1_apply.mjs --command "UPDATE sweep_state SET done=0"
// Env: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (eða web/.dev.vars). Fellur SKÝRT (exit 1) ef vantar.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeD1 } from './lib/d1_rest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '..', 'web');
const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const file = get('--file'), command = get('--command');
if (!file && !command) { console.error('Notkun: d1_apply.mjs --file <slóð.sql> | --command "<SQL>"'); process.exit(2); }
let sql = command;
if (file) { try { sql = readFileSync(file, 'utf8'); } catch (e) { console.error('✗ gat ekki lesið', file, '—', e.message); process.exit(1); } }
try {
  const d1 = makeD1(WEB);
  await d1.query(sql);
  console.log('✓ D1:', file || (command.length > 60 ? command.slice(0, 60) + '…' : command));
} catch (e) { console.error('✗ D1 brást:', e.message); process.exit(1); }
