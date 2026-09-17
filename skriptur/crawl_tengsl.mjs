#!/usr/bin/env node
// crawl_tengsl.mjs — næturlegur snjóbolta-crawler. Les batch úr crawl_queue,
// kallar RSK-API (stjórn, með persónu-kt) + frítt eigenda-skrap, keyrir nafnaleitar-
// sweep (landsdekkandi upptalning), skrifar EITT night.sql og beitir því á D1 um
// REST API (lib/d1_rest.mjs). Metrað API-þak = TENGSL_BUDGET; frí nafnaleit = SWEEP_BUDGET.
// ⚠ EKKI `wrangler d1 execute tengsl`: nafna-uppflettingin krefst list-heimildar sem CI-tokenið
//   hefur ekki (féll þögult í CI) — database_id úr web/wrangler.toml er notað beint í d1_rest.mjs.
import fs from 'node:fs';
import { parseLegalEntity, parseEigendur, personKey } from './lib/rsk_parse.mjs';
import { buildNightSql, buildSeenLastSql } from './lib/tengsl_sql.mjs';
import { extractKts, nextPrefixes } from './lib/sweep.mjs';
import { makeD1 } from './lib/d1_rest.mjs';
import { buildScrapeFetcher } from './lib/rsk_fetch.mjs';
import { metaNott } from './lib/nott_heilsa.mjs';   // þögul nótt (allt féll) á móti rólegri nótt (ekkert á dagskrá)
import { buildApiFetcher, stoppLina } from './lib/rsk_api.mjs';

const DRY = process.argv.includes('--dry-run');
const bi = process.argv.indexOf('--budget');
const BUDGET = bi >= 0 ? parseInt(process.argv[bi + 1], 10) : parseInt(process.env.TENGSL_BUDGET || '1500', 10);
const SWEEP_BUDGET = parseInt(process.env.SWEEP_BUDGET || '40', 10);      // nafnaleitar-forskeyti á nótt
const EIGENDUR_BUDGET = parseInt(process.env.EIGENDUR_BUDGET || '25', 10); // eigenda-skröp á nótt (hægt)
// Bið milli API-kalla. Mælt hraðatakmark api.skattur.cloud ≈60–70 köll/mín → 1000ms ≈ 60/mín.
const API_DELAY = parseInt(process.env.API_DELAY_MS || '1000', 10);
// ⚠ SCRAPE_DELAY: www.skatturinn.is er HRAÐATAKMARKAÐ (ekki bannað) — sannreynt 19.7: 1,5s bursti
// throttlar (0 treff), en 15s milli (4/mín) virkar 6/6. Höldum okkur því GÓÐUM MEGIN við throttluna
// og stækkum netið hægt+örugglega í stað þess að fá blokk. Aðeins www.skatturinn.is; API er 1s.
const SCRAPE_DELAY = parseInt(process.env.SCRAPE_DELAY_MS || '15000', 10);
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!RSK_KEY) { console.error('RSK_KEY vantar — hætti (crawl sefur þar til secret kemur).'); process.exit(0); }
// Sömu env-nöfn og build_sentiment_ai.mjs / tengslagrunnur.yml. Vantar → SKÝR villa + exit≠0 (ekki þegja).
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error('✗ CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID vantar — enginn D1-aðgangur. Hætti.');
  process.exit(1);
}
const d1 = makeD1('web');

// www.skatturinn.is (frítt skrap) er hraðatakmarkað (throttlar við magn — sannreynt 13.7). Því
// höldum við utan um samfelldar bilanir og HÆTTUM skrapi þegar þjónninn fer að hafna okkur, í stað
// þess að hamra hann. API-hlutinn (api.skattur.cloud) er ósnortinn (mælt/greitt, þolir magn).
const SCRAPE_MAXFAIL = 5;
let scrapeFails = 0, scrapeStop = false;
const noteScrape = (okHtml) => { if (okHtml === null) { if (++scrapeFails >= SCRAPE_MAXFAIL) { scrapeStop = true; console.error(`⚠ ${SCRAPE_MAXFAIL} samfelldar www.skatturinn.is-bilanir (throttla) — hætti skrapi þessa nótt (API heldur áfram).`); } } else scrapeFails = 0; };

// D1-fyrirspurnir um d1.query (REST): endurreynir tímabundnar villur sjálf; endanleg villa KASTAR
// → nóttin fellur SÝNILEGA (sama og wrangler-spawn-villa gerði áður, en án list-heimildar-kröfunnar).
// Biðröð: pending fyrst (forgangur), svo done-félög eldri en 90 daga (endurnýjun). Aldrei 'error'/'notfound'.
async function queueBatch(n) {
  return (await d1.query(
    "SELECT kt FROM crawl_queue WHERE status='pending' OR (status='done' AND (crawled_at IS NULL OR crawled_at <= date('now','-90 days')))"
    + " ORDER BY (status='pending') DESC, priority, added_at LIMIT " + n
  )).map((r) => r.kt);
}
async function sweepBatch(n) {
  return (await d1.query("SELECT prefix FROM sweep_state WHERE done=0 ORDER BY length(prefix), prefix LIMIT " + n)).map((r) => r.prefix);
}

// fetchApi: sjálf-grípur net-villur → { retry } (EKKI banvænt). 401 OG kvóta-403 kasta (banvænt).
// Gegnum PROXY_BASE (worker) ef sett — Azure fór að 403-a GH-runner-IP eftir 429-þungu næturnar;
// worker-egress er hreint. Lykill fer þá EKKI beint í Azure héðan (worker bætir honum server-hlið).
// ⚠⚠ 17.9.2026: sóknin flutt í lib/rsk_api.mjs (prófuð). Áður stóð hér
//       if (r.status === 404 || r.status === 403) return { notfound: true };
//    sem felldi saman „lokað lögform" (eðlilegt, sleppa félaginu) og „mánaðarkvóti uppurinn"
//    (403 á ÖLL köll). Í seinna tilvikinu merkti skriðan hvert RAUNVERULEGT félag sem ekki-til
//    og taldi það afgreitt — biðröðin tekur aldrei upp 'notfound', svo þau hefðu aldrei verið
//    heimsótt aftur. Nóttin hefði verið græn og grunnurinn úreltur. Nú les hún SVARBOLINN
//    (web/src/lib/rsk-kvoti.mjs, sama regla og workerinn) og HÆTTIR eins og við 401.
const apiSaekja = buildApiFetcher({ proxyBase: PROXY_BASE, rskKey: RSK_KEY, timeout: FETCH_TIMEOUT });
const fetchApi = (kt) => apiSaekja.fetchApi(kt);
// path = /fyrirtaekjaskra/... Beint á www.skatturinn.is EÐA gegnum RSK-proxy (PROXY_BASE) ef sett.
// ⚠ TIMEOUT SKYLDA: www.skatturinn.is throttlar m.a. með því að STÖÐVA tengingar — án tímamarka
// hangir crawlið (mælt 15.7: 14s/félag) og 60-mín workflow-þakið drepur keyrsluna ÁÐUR en night.sql er skrifað.
// ⚠ 13.9.2026: sóknin flutt í lib/rsk_fetch.mjs (prófuð). Áður skilaði hún `null` fyrir allt —
// net-fall, 403 OG „200 með tómri niðurstöðusíðu" (svona throttlar RSK). Þegar proxy-leiðin
// hætti að skila kennitölum sáust því 12 nætur í röð með „0 uppgötvuð · 0 úr sweep" og samt
// `success`. Nú eru villur taldar eftir orsök og bein varaleið tekur við þegar proxy bregst.
const skrapari = buildScrapeFetcher({ proxyBase: PROXY_BASE, rskKey: RSK_KEY, timeout: FETCH_TIMEOUT });
const fetchText = (path, gilt) => skrapari.fetchText(path, gilt);

const acc = { felog: [], folk: [], hlutverk: [], eign: [], queueMark: [], queueRetry: [], queueAdd: [], sweepMark: [], sweepAdd: [] };
const seenLastSql = [];
let used = 0, ok = 0, notfound = 0, errs = 0, discovered = 0, eigDone = 0;
let stoppAstaeda = null;   // banvænt stopp (kvóti/401) — verður að RATA Í SAMANTEKTINA, ekki bara í loggann
const errBy = {};   // sundurliðun villna eftir HTTP-stöðu (t.d. {"retry:429": n}) — sést í nætur-samantekt

// ── 1) Nafnaleitar-sweep FYRST (ferskur runner) ───────────────────────────────
// www.skatturinn.is (frítt skrap) throttlar við ~30 köll/keyrslu og skilar þá HTTP 200 með
// TÓMRI niðurstöðusíðu (ekki 429). Sweepið keyrir því á undan félaga-lykkjunni til að fá ferskt
// aðgengi; 0 treff = throttla (eins stafs forskeyti eiga ALLTAF treff) → EKKI merkt done, reynt aftur.
const prefixes = await sweepBatch(SWEEP_BUDGET);
console.error(`Sweep-batch: ${prefixes.length} forskeyti (budget ${SWEEP_BUDGET}).`);
let sweepFound = 0;
for (const pfx of prefixes) {
  if (scrapeStop || outOfTime()) break;
  await sleep(SCRAPE_DELAY);   // hægt — góðum megin við hraðatakmarkið
  // Gildisprófið er lykillinn: eins stafs forskeyti eiga ALLTAF treff, svo „200 með engum kt"
  // er throttla — ekki niðurstaða. Sóknin fellur þá sjálf á beina leið áður en hún gefst upp.
  const html = await fetchText('/fyrirtaekjaskra/leit?nafn=' + encodeURIComponent(pfx), (h) => extractKts(h).length > 0);
  const kts = html ? extractKts(html) : [];
  if (!kts.length) { noteScrape(null); continue; }   // net-fall EÐA 200-tómt (throttla) → EKKI done; retry + back-off
  noteScrape('ok');
  for (const k of kts) { acc.queueAdd.push({ kt: k, from: 'sweep:' + pfx, priority: 3 }); sweepFound++; }
  const { children } = nextPrefixes(pfx, kts.length, 100);   // mettað (≥100) → dýpka
  for (const c of children) acc.sweepAdd.push(c);
  acc.sweepMark.push({ prefix: pfx, hit_count: kts.length });   // aðeins við VELHEPPNAÐA sókn
}

// ── 2) Félaga-crawl (metrað API + eigenda-skrap) ──────────────────────────────
const batch = await queueBatch(BUDGET);
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
  // AUTH eða uppurinn kvóti → hætta strax (biðröð ÓSNERT, engin 'notfound'-mengun).
  // ⚠ Ástæðan er MUNUÐ og rituð í samantekt keyrslunnar — `break` einn og sér skildi eftir
  //   græna keyrslu og eina stderr-línu, og uppurinn kvóti er nú væntanlegt ástand.
  catch (e) { stoppAstaeda = e.message; console.error('STÖÐVA nótt:', e.message); break; }
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
  // frítt eigenda-skrap — HÆGT og með dags-þaki (EIGENDUR_BUDGET) svo www.skatturinn.is throttli ekki.
  let html = null;
  if (!scrapeStop && eigDone < EIGENDUR_BUDGET) { eigDone++; await sleep(SCRAPE_DELAY); html = await fetchText('/fyrirtaekjaskra/leit/kennitala/' + kt); noteScrape(html); }
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
// ⚠ Stopp-línan er rituð HÉR, á undan öllum útgönguleiðum (tóm nótt / --dry-run / villa í
//   D1-beitingu), svo hún geti ekki tapast eftir því hvernig keyrslan endar.
const stoppMd = stoppLina(stoppAstaeda, { unnid: used, budget: BUDGET });
if (stoppMd) {
  console.error(stoppMd);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Tengslagrunnur — nótt ${today}\n\n${stoppMd}\n\n`); } catch (e) {}
  }
}
const body = [buildNightSql({ today, ...acc }), ...seenLastSql].join('\n').trim();
console.error(`Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur · ${discovered} uppgötvuð · ${sweepFound} úr sweep · ${eigDone} eigenda-skröp · ${used} API-köll.`);
if (errs) console.error(`Villu-sundurliðun: ${JSON.stringify(errBy)}`);
// ⚠ Án þessarar línu var ekki hægt að greina hvers vegna skrapið skilaði núlli (sjá lib/rsk_fetch.mjs).
const skrapStats = skrapari.stats();
if (Object.keys(skrapStats.villur).length) {
  console.error(`Skrap-sundurliðun: ${JSON.stringify(skrapStats.villur)}${skrapStats.proxyDautt ? ' · RSK-proxy SLÖKKT þessa nótt (sótti beint)' : ''}`);
}

// ⚠⚠ ÞÖGUL NÓTT MÁ EKKI VERA GRÆN. 17.9.2026 skrifaði þessi skripta núll, slökkti á sér sjálf þegar
// báðir varnarrofar sprungu, prentaði sundurliðunina — og skilaði útgangskóða 0. Enginn hefði séð að
// grunnurinn hætti að stækka. Hún VISSI af biluninni og sagði engum. Sjá lib/nott_heilsa.mjs.
const heilsa = metaNott({ ok, errs, discovered, sweepFound, villur: skrapStats.villur, proxyDautt: skrapStats.proxyDautt, scrapeStop });
if (heilsa.thogul) {
  console.error('⛔ ' + heilsa.skilabod);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ⛔ Þögul nótt — ${heilsa.astaeda}

${heilsa.skilabod}
`);
  }
  process.exit(1);
}
if (!body) { console.error('Ekkert SQL að skrifa (róleg nótt — ekkert á dagskrá, engin bilunarmerki).'); process.exit(0); }
// N1 (topplistar): viðhalda felog.isat_primary fyrir NÝ félög (fyrsti ÍSAT-kóði úr isat-JSON) — annars
// birtast þau hvorki í topplistum né sækir ársreikninga-trickle þau (SELECT hans krefst isat_primary).
const isatPrimarySql = "UPDATE felog SET isat_primary = json_extract(isat, '$[0].id') WHERE isat IS NOT NULL AND isat <> '[]' AND isat_primary IS NULL;";
fs.writeFileSync('web/night.sql', body + '\n' + isatPrimarySql + '\n');
console.error(`Rita ${(body.length / 1024).toFixed(0)} KiB í web/night.sql.`);

if (DRY) { console.error('--dry-run: beiti EKKI á D1.'); process.exit(0); }
// night-SQL → stakar setningar: buildNightSql/buildSeenLastSql skila einni setningu per línu (endar á ';').
// Lína sem endar EKKI á ';' væri línuskil inni í streng-literal → límd við næstu (öryggisnet, gerist vart).
function sqlStatements(text) {
  const out = [];
  let cur = '';
  for (const line of text.split('\n')) {
    cur = cur ? cur + '\n' + line : line;
    if (cur.trimEnd().endsWith(';')) { out.push(cur); cur = ''; }
  }
  if (cur.trim()) out.push(cur);
  return out;
}
// Beitt í bútum um REST /query (wrangler-`--file` notaði import-flæði fyrir stórar skrár — /query þolir
// ekki marga-MB body). Setningarnar eru idempotent upserts → öruggt að bútur sé endurreyndur (d1_rest
// endurreynir tímabundnar villur). Villa KASTAR → exit≠0 og web/night.sql stendur eftir til skoðunar.
const stmts = sqlStatements(body + '\n' + isatPrimarySql);
for (let i = 0; i < stmts.length; ) {
  const chunk = [];
  let size = 0;
  while (i < stmts.length && (chunk.length === 0 || (chunk.length < 500 && size + stmts[i].length <= 400 * 1024))) {
    size += stmts[i].length + 1; chunk.push(stmts[i++]);
  }
  await d1.query(chunk.join('\n'));
}
fs.unlinkSync('web/night.sql');
console.error(`✓ Beitt á D1 (${stmts.length} setningar).`);

// GH-summary
if (process.env.GITHUB_STEP_SUMMARY) {
  const skrapLina = Object.keys(skrapStats.villur).length
    ? `\n- Skrap-villur: \`${JSON.stringify(skrapStats.villur)}\`${skrapStats.proxyDautt ? ' — **RSK-proxy slökkt, sótt beint**' : ''}`
    : '';
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Tengslagrunnur — nótt ${today}\n\n- API-köll: **${used}** / ${BUDGET}\n- Þáttað: ${ok} ok · ${notfound} ekki-til · ${errs} villur\n- Uppgötvuð ný félög: ${discovered} (crawl) + ${sweepFound} (sweep)\n- Sweep-forskeyti: ${prefixes.length}${skrapLina}\n`);
}
