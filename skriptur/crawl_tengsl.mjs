#!/usr/bin/env node
// crawl_tengsl.mjs — næturlegur snjóbolta-crawler. Les batch úr crawl_queue,
// kallar RSK-API (stjórn, með persónu-kt) + frítt eigenda-skrap, keyrir nafnaleitar-
// sweep (landsdekkandi upptalning), skrifar EITT night.sql og beitir því á D1 um
// wrangler. Metrað API-þak = TENGSL_BUDGET; frí nafnaleit = SWEEP_BUDGET.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { parseLegalEntity, parseEigendur, personKey } from './lib/rsk_parse.mjs';
import { buildNightSql, buildSeenLastSql } from './lib/tengsl_sql.mjs';
import { extractKts, nextPrefixes } from './lib/sweep.mjs';

const DRY = process.argv.includes('--dry-run');
const bi = process.argv.indexOf('--budget');
const BUDGET = bi >= 0 ? parseInt(process.argv[bi + 1], 10) : parseInt(process.env.TENGSL_BUDGET || '1500', 10);
const SWEEP_BUDGET = parseInt(process.env.SWEEP_BUDGET || '30', 10);   // frí nafnaleit-köll á nótt (www.skatturinn.is throttlar við ~30/keyrslu)
// Bið milli API-kalla. Mælt hraðatakmark api.skattur.cloud ≈60–70 köll/mín → 1000ms ≈ 60/mín.
const API_DELAY = parseInt(process.env.API_DELAY_MS || '1000', 10);
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT_MS || '12000', 10);   // hangandi tengingar → hætta
// PROXY_BASE (t.d. https://karp.is): beinir www.skatturinn.is-skrapinu gegnum RSK-proxy í workernum
// (Cloudflare-egress EKKI throttlað) → landsdekkun á vikum í stað mánaða. Tómt = beint skrap (GH-IP).
const PROXY_BASE = (process.env.PROXY_BASE || '').replace(/\/$/, '');
// Vegg-klukku-þak: hættum að krafla í tæka tíð svo night.sql sé ALLTAF skrifað (workflow-þak = 60 mín).
const DEADLINE_MS = parseInt(process.env.DEADLINE_MIN || '40', 10) * 60000;
const t0 = Date.now();
const outOfTime = () => (Date.now() - t0) > DEADLINE_MS;
const RSK_KEY = process.env.RSK_KEY;
const today = new Date().toISOString().slice(0, 10);
const API = 'https://api.skattur.cloud/legalentities/v2.1/';
const RSK_ROT = 'https://www.skatturinn.is';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!RSK_KEY) { console.error('RSK_KEY vantar — hætti (crawl sefur þar til secret kemur).'); process.exit(0); }

// www.skatturinn.is (frítt skrap) er hraðatakmarkað (throttlar við magn — sannreynt 13.7). Því
// höldum við utan um samfelldar bilanir og HÆTTUM skrapi þegar þjónninn fer að hafna okkur, í stað
// þess að hamra hann. API-hlutinn (api.skattur.cloud) er ósnortinn (mælt/greitt, þolir magn).
const SCRAPE_MAXFAIL = 5;
let scrapeFails = 0, scrapeStop = false;
const noteScrape = (okHtml) => { if (okHtml === null) { if (++scrapeFails >= SCRAPE_MAXFAIL) { scrapeStop = true; console.error(`⚠ ${SCRAPE_MAXFAIL} samfelldar www.skatturinn.is-bilanir (throttla) — hætti skrapi þessa nótt (API heldur áfram).`); } } else scrapeFails = 0; };

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: 'web', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
}
function d1Query(sql) {
  const out = wrangler(['d1', 'execute', 'tengsl', '--remote', '--json', '--command', sql]);
  try { const j = JSON.parse(out); return (j[0] && j[0].results) || j.results || []; }
  catch (e) { console.error('D1-fyrirspurn brást:', e.message); return []; }
}
// Biðröð: pending fyrst (forgangur), svo done-félög eldri en 90 daga (endurnýjun). Aldrei 'error'/'notfound'.
function queueBatch(n) {
  return d1Query(
    "SELECT kt FROM crawl_queue WHERE status='pending' OR (status='done' AND (crawled_at IS NULL OR crawled_at <= date('now','-90 days')))"
    + " ORDER BY (status='pending') DESC, priority, added_at LIMIT " + n
  ).map((r) => r.kt);
}
function sweepBatch(n) {
  return d1Query("SELECT prefix FROM sweep_state WHERE done=0 ORDER BY length(prefix), prefix LIMIT " + n).map((r) => r.prefix);
}

// fetchApi: sjálf-grípur net-villur → { retry } (EKKI banvænt). AÐEINS 401/403 kasta (banvænt).
// Gegnum PROXY_BASE (worker) ef sett — Azure fór að 403-a GH-runner-IP eftir 429-þungu næturnar;
// worker-egress er hreint. Lykill fer þá EKKI beint í Azure héðan (worker bætir honum server-hlið).
async function fetchApi(kt) {
  let r;
  const url = PROXY_BASE ? (PROXY_BASE + '/api/rskproxy?api=' + kt) : (API + kt + '?language=is');
  const headers = PROXY_BASE ? { 'X-Karp-Proxy': RSK_KEY, 'Accept': 'application/json' } : { 'Ocp-Apim-Subscription-Key': RSK_KEY, 'Accept': 'application/json' };
  try { r = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) }); }
  catch (e) { return { retry: 'network' }; }   // DNS/tenging/tímarof → reyna aftur síðar
  if (r.status === 401 || r.status === 403) throw new Error('AUTH ' + r.status);   // rangur lykill → stöðva nótt
  if (r.status === 404) return { notfound: true };
  if (r.status === 429 || r.status >= 500) return { retry: r.status };            // tímabundið → reyna aftur
  if (!r.ok) return { error: r.status };                                          // annað 4xx → gefast upp
  const json = await r.json().catch(() => null);
  return json ? { json } : { retry: 'badjson' };
}
// path = /fyrirtaekjaskra/... Beint á www.skatturinn.is EÐA gegnum RSK-proxy (PROXY_BASE) ef sett.
// ⚠ TIMEOUT SKYLDA: www.skatturinn.is throttlar m.a. með því að STÖÐVA tengingar — án tímamarka
// hangir crawlið (mælt 15.7: 14s/félag) og 60-mín workflow-þakið drepur keyrsluna ÁÐUR en night.sql er skrifað.
async function fetchText(path) {
  const url = PROXY_BASE ? (PROXY_BASE + '/api/rskproxy?p=' + encodeURIComponent(path)) : (RSK_ROT + path);
  const headers = { 'User-Agent': 'karp.is tengslagrunnur (aronheidars@gmail.com)' };
  if (PROXY_BASE) headers['X-Karp-Proxy'] = RSK_KEY;   // gátt proxy-sins (=RSK_KEY, ekkert nýtt secret)
  try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) }); return r.ok ? await r.text() : null; }
  catch (e) { return null; }
}

const acc = { felog: [], folk: [], hlutverk: [], eign: [], queueMark: [], queueRetry: [], queueAdd: [], sweepMark: [], sweepAdd: [] };
const seenLastSql = [];
let used = 0, ok = 0, notfound = 0, errs = 0, discovered = 0;
const errBy = {};   // sundurliðun villna eftir HTTP-stöðu (t.d. {"retry:429": n}) — sést í nætur-samantekt

// ── 1) Nafnaleitar-sweep FYRST (ferskur runner) ───────────────────────────────
// www.skatturinn.is (frítt skrap) throttlar við ~30 köll/keyrslu og skilar þá HTTP 200 með
// TÓMRI niðurstöðusíðu (ekki 429). Sweepið keyrir því á undan félaga-lykkjunni til að fá ferskt
// aðgengi; 0 treff = throttla (eins stafs forskeyti eiga ALLTAF treff) → EKKI merkt done, reynt aftur.
const prefixes = sweepBatch(SWEEP_BUDGET);
console.error(`Sweep-batch: ${prefixes.length} forskeyti (budget ${SWEEP_BUDGET}).`);
let sweepFound = 0;
for (const pfx of prefixes) {
  if (scrapeStop || outOfTime()) break;
  await sleep(1500);   // kurteist við skatturinn.is
  const html = await fetchText('/fyrirtaekjaskra/leit?nafn=' + encodeURIComponent(pfx));
  const kts = html ? extractKts(html) : [];
  if (!kts.length) { noteScrape(null); continue; }   // net-fall EÐA 200-tómt (throttla) → EKKI done; retry + back-off
  noteScrape('ok');
  for (const k of kts) { acc.queueAdd.push({ kt: k, from: 'sweep:' + pfx, priority: 3 }); sweepFound++; }
  const { children } = nextPrefixes(pfx, kts.length, 100);   // mettað (≥100) → dýpka
  for (const c of children) acc.sweepAdd.push(c);
  acc.sweepMark.push({ prefix: pfx, hit_count: kts.length });   // aðeins við VELHEPPNAÐA sókn
}

// ── 2) Félaga-crawl (metrað API + eigenda-skrap) ──────────────────────────────
const batch = queueBatch(BUDGET);
console.error(`Félaga-batch: ${batch.length} kt (budget ${BUDGET}).`);
for (const kt of batch) {
  if (used >= BUDGET) break;
  if (outOfTime()) { console.error(`⏱ Vegg-klukku-þak (${DEADLINE_MS / 60000} mín) — hætti kraflinu og skrifa það sem er komið.`); break; }
  used++;
  // ⚠⚠ HRAÐATAKMARK mælda APIsins ≈60–70 köll/mín (mælt 14.–15.7: 138 ok/126s, 240 ok/201s).
  // Þessi bið VERÐUR að vera ÓHÁÐ eigenda-skrapinu — áður lá hún inni í `if (!scrapeStop)` og
  // datt út þegar sweepið kveikti á scrapeStop → lykkjan hamraði APIð (6–11/s) → 85% 429-villur.
  await sleep(API_DELAY);
  let api;
  try { api = await fetchApi(kt); }
  catch (e) { console.error('STÖÐVA nótt (AUTH):', e.message); break; }   // AUTH → hætta strax (biðröð ósnert)
  if (api.retry) { acc.queueRetry.push(kt); errs++; errBy['retry:' + api.retry] = (errBy['retry:' + api.retry] || 0) + 1; continue; }   // tímabundið → attempts++ (helst pending)
  if (api.notfound) { acc.queueMark.push({ kt, status: 'notfound' }); notfound++; continue; }
  if (api.error) { acc.queueMark.push({ kt, status: 'error' }); errs++; errBy['error:' + api.error] = (errBy['error:' + api.error] || 0) + 1; continue; }
  const rec = parseLegalEntity(kt, api.json);
  if (!rec) { acc.queueMark.push({ kt, status: 'error' }); errs++; errBy.parse = (errBy.parse || 0) + 1; continue; }
  ok++;
  acc.queueMark.push({ kt, status: 'done' });
  acc.felog.push(rec.felag);
  acc.folk.push(...rec.folk);
  acc.hlutverk.push(...rec.hlutverk);
  for (const dk of rec.discovered) { acc.queueAdd.push({ kt: dk, from: kt, priority: 2 }); discovered++; }
  // frítt eigenda-skrap (kurteist; sleppt ef þjónninn er farinn að throttla)
  let html = null;
  if (!scrapeStop) { await sleep(1500); html = await fetchText('/fyrirtaekjaskra/leit/kennitala/' + kt); noteScrape(html); }
  const eignRows = [];
  for (const e of (html ? parseEigendur(html) : [])) {
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

// ── 3) Skrifa + beita ─────────────────────────────────────────────────────────
const body = [buildNightSql({ today, ...acc }), ...seenLastSql].join('\n').trim();
console.error(`Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur · ${discovered} uppgötvuð · ${sweepFound} úr sweep · ${used} API-köll.`);
if (errs) console.error(`Villu-sundurliðun: ${JSON.stringify(errBy)}`);

if (!body) { console.error('Ekkert SQL að skrifa (tóm nótt).'); process.exit(0); }
fs.writeFileSync('web/night.sql', body + '\n');
console.error(`Rita ${(body.length / 1024).toFixed(0)} KiB í web/night.sql.`);

if (DRY) { console.error('--dry-run: beiti EKKI á D1.'); process.exit(0); }
wrangler(['d1', 'execute', 'tengsl', '--remote', '--file', 'night.sql']);
fs.unlinkSync('web/night.sql');
console.error('✓ Beitt á D1.');

// GH-summary
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Tengslagrunnur — nótt ${today}\n\n- API-köll: **${used}** / ${BUDGET}\n- Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur\n- Uppgötvuð ný félög: ${discovered} (crawl) + ${sweepFound} (sweep)\n- Sweep-forskeyti: ${prefixes.length}\n`);
}
