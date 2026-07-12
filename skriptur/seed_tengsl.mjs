#!/usr/bin/env node
// seed_tengsl.mjs — sáir crawl_queue úr Karp-snertum félögum + Lögbirtingu, og
// bootstrap-ar sweep_state (eins stafs forskeyti). Skrifar SQL á stdout eða --out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqlLit as L } from './lib/tengsl_sql.mjs';
import { SWEEP_ALPHABET } from './lib/sweep.mjs';
import { rskErFyrirtaeki } from './lib/rsk_parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOGN = path.join(ROOT, 'web/public/gogn');
const today = new Date().toISOString().slice(0, 10);
const outArg = process.argv.indexOf('--out');
const kts = new Set();
const addKt = (k) => { const s = String(k || '').replace(/\D/g, ''); if (s.length === 10 && rskErFyrirtaeki(s)) kts.add(s); };

// 1) eigendur/*.json net-hnútar
try { for (const f of fs.readdirSync(path.join(GOGN, 'eigendur')).filter((f) => /^\d/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(GOGN, 'eigendur', f), 'utf8'));
  addKt(j.kt); for (const n of ((j.net && j.net.nodes) || [])) addKt(n.kt);
} } catch (e) {}
// 2) stjorn/*.json
try { for (const f of fs.readdirSync(path.join(GOGN, 'stjorn')).filter((f) => /^\d/.test(f))) addKt(f.replace(/\D/g, '')); } catch (e) {}
// 3) eigendur_reverse.json (byOwner → a[].kt)
try { const rev = JSON.parse(fs.readFileSync(path.join(GOGN, 'eigendur_reverse.json'), 'utf8'));
  for (const k in (rev.byOwner || {})) { addKt(k); for (const c of ((rev.byOwner[k].a) || [])) addKt(c.kt); }
} catch (e) {}
// 4) logbirting.json byKt
try { const lb = JSON.parse(fs.readFileSync(path.join(GOGN, 'logbirting.json'), 'utf8')); for (const k in (lb.byKt || {})) addKt(k); } catch (e) {}

const lines = [];
for (const k of kts) lines.push(`INSERT OR IGNORE INTO crawl_queue (kt,priority,discovered_from,added_at,status) VALUES (${L(k)},1,'seed',${L(today)},'pending');`);
// sweep bootstrap: eins stafs forskeyti (priority-3 upptalning)
for (const c of SWEEP_ALPHABET) if (c !== ' ') lines.push(`INSERT OR IGNORE INTO sweep_state (prefix,done,updated_at) VALUES (${L(c)},0,${L(today)});`);

const sql = lines.join('\n') + '\n';
if (outArg >= 0 && process.argv[outArg + 1]) { fs.writeFileSync(process.argv[outArg + 1], sql); console.error(`Sáði ${kts.size} félögum + ${SWEEP_ALPHABET.length - 1} sweep-forskeytum → ${process.argv[outArg + 1]}`); }
else process.stdout.write(sql);
