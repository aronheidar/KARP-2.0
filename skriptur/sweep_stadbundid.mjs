// sweep_stadbundid.mjs — nafnaleitar-sweep KEYRÐUR Á VÉL ARONS.
//
// ⚠ HVERS VEGNA STAÐBUNDIÐ (greining 13.9.2026): www.skatturinn.is ber fram TÓMA
// niðurstöðusíðu (HTTP 200, engar kennitölur) fyrir gagnaversvistföng — bæði
// GitHub-Actions-runnera og Cloudflare-worker-egress. Staðfest í keyrslu 34768142270:
// {"proxy:200-ognothaeft":3,"beint:200-ognothaeft":5}. Sama slóð úr íslenskri tengingu
// skilar 100 kt á forskeyti. User-Agent skiptir engu (fjögur afbrigði prófuð).
// Nætur-crawlið í CI getur því ekki uppgötvað félög; þessi skripta gerir það héðan.
//
// Skilar kt + NAFNI + póstfangi (ein sókn, þrír reitir — sjá lib/rsk_leit_parse.mjs).
// Nafnið er það sem /fyrirtaeki/skra/ og sitemap-fyrirtaeki.xml þurfa; build_felagaskra.mjs
// les afraksturinn sem uppsprettu, svo SEO-þekjan vex beint af hverri keyrslu.
//
// ENGIN skilríki þarf: hvorki RSK_KEY né Cloudflare-token. Aðeins nettenging.
//
// Notkun:
//   node skriptur/sweep_stadbundid.mjs                  # 30 mín, 3s milli sókna
//   node skriptur/sweep_stadbundid.mjs --minutes 120    # lengri lota
//   node skriptur/sweep_stadbundid.mjs --delay 5000     # hægar (kurteisara)
//   node skriptur/sweep_stadbundid.mjs --status         # staða, engin sókn
//
// Keyrslan er ENDURTAKANLEG: staðan geymist í gogn/sweep_felog.json, svo hver lota
// heldur áfram þar sem sú síðasta hætti. Óhætt að stöðva með Ctrl+C — skrifað er jafnóðum.

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SWEEP_ALPHABET, nextPrefixes } from './lib/sweep.mjs';
import { parseLeit, flokkaLeit } from './lib/rsk_leit_parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKRA = join(ROOT, 'gogn', 'sweep_felog.json');
const ROT = 'https://www.skatturinn.is';
const CAP = 100;                     // þak leitarinnar; mettað forskeyti þarf að dýpka

const arg = (n, sjalfg) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : sjalfg; };
const MINUTES = parseFloat(arg('minutes', '30'));
// ⚠ 15s = 4 sóknir/mín. Sannreynt tvisvar: crawl_tengsl.mjs (19.7, 6/6 við 15s) og hér
// 13.9 — 2,5s bursti skilaði 16 sóknum áður en RSK fór að bera fram tóma síðu, og
// glugginn opnaðist ekki aftur innan 5 mín. Hægara er því MARGFALT fljótara á endanum.
const DELAY = parseInt(arg('delay', '15000'), 10);
const TIMEOUT = parseInt(arg('timeout', '20000'), 10);
const STATUS_ONLY = process.argv.includes('--status');
// RSK ber fram tóma síðu þegar það þrengir að; eins stafs forskeyti eiga ALLTAF treff.
// Þá er BAKKAÐ (tvöföldun) og sama forskeyti reynt aftur — kvótinn losnar eftir bið.
// Mælt 13.9: þrengingar-glugginn er lengri en 5 mín, svo byrjunarbiðin má ekki vera stutt.
const MAXFAIL = parseInt(arg('maxfail', '6'), 10);
const BACKOFF_BYRJUN = parseInt(arg('backoff', '120000'), 10);
const BACKOFF_THAK = parseInt(arg('backoff-max', '900000'), 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Staða ─────────────────────────────────────────────────────────────────────
const tomStada = () => ({
  generated: null,
  forskeyti: Object.fromEntries(SWEEP_ALPHABET.filter((c) => c.trim()).map((c) => [c, { done: 0 }])),
  felog: {},
});
let S;
try { S = existsSync(SKRA) ? JSON.parse(readFileSync(SKRA, 'utf8')) : tomStada(); }
catch (e) { console.error('⚠ gogn/sweep_felog.json ólæsileg — byrja upp á nýtt.'); S = tomStada(); }
S.forskeyti ||= tomStada().forskeyti;
S.felog ||= {};

// Atómísk skrif: Ctrl+C á miðri ritun má ekki skilja eftir hálfa JSON-skrá.
const vista = () => {
  S.generated = new Date().toISOString();
  S.alls = Object.keys(S.felog).length;
  const tmp = SKRA + '.tmp';
  writeFileSync(tmp, JSON.stringify(S));
  renameSync(tmp, SKRA);
};

const bidaSkra = () => Object.keys(S.forskeyti).filter((p) => !S.forskeyti[p].done).sort((a, b) => a.length - b.length || a.localeCompare(b));

if (STATUS_ONLY) {
  const bid = bidaSkra();
  const buin = Object.keys(S.forskeyti).length - bid.length;
  console.log(`Félög í safni : ${Object.keys(S.felog).length}`);
  console.log(`Forskeyti     : ${buin} búin · ${bid.length} bíða (alls ${Object.keys(S.forskeyti).length})`);
  console.log(`Síðast uppfært: ${S.generated || '—'}`);
  if (bid.length) console.log(`Næst í röð     : ${bid.slice(0, 12).join(' ')}`);
  process.exit(0);
}

// ── Sókn ──────────────────────────────────────────────────────────────────────
async function saekja(pfx) {
  try {
    const r = await fetch(ROT + '/fyrirtaekjaskra/leit?nafn=' + encodeURIComponent(pfx), {
      headers: { 'User-Agent': 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return { villa: 'http-' + r.status };
    const html = await r.text();
    return { flokkur: flokkaLeit(html), radir: parseLeit(html) };
  } catch (e) {
    return { villa: e && e.name === 'TimeoutError' ? 'timeout' : 'net' };
  }
}

const t0 = Date.now();
const utrunnid = () => (Date.now() - t0) > MINUTES * 60000;

let sott = 0, nyFelog = 0, dypkud = 0, fails = 0;
const villur = {};
let hattiVegna = 'kláraði öll forskeyti';

console.error(`Sweep hefst: ${Object.keys(S.felog).length} félög í safni, ${bidaSkra().length} forskeyti bíða. Þak ${MINUTES} mín, ${DELAY}ms milli sókna.`);

while (true) {
  if (utrunnid()) { hattiVegna = `tímaþak (${MINUTES} mín)`; break; }
  const bid = bidaSkra();
  if (!bid.length) break;
  const pfx = bid[0];

  if (sott) await sleep(DELAY);
  const { radir, villa, flokkur } = await saekja(pfx);
  sott++;

  // Forskeyti sem á RAUNVERULEGA engin félög (síðan segir „skilaði engri niðurstöðu“)
  // er klárað — ekki bilun. ⚠ Að rugla þessu saman við þrengingu stöðvaði sweepið 13.9:
  // „ð“ á aðeins 2 skráningar og hvoruga lögaðila, svo skriptan beið eftir glugga sem
  // var aldrei lokaður. Sama fyrir mettuð forskeyti sem dýpka niður í tómar greinar.
  if (!villa && flokkur === 'tomt') {
    S.forskeyti[pfx] = { done: 1, hits: 0 };
    fails = 0;
    vista();
    continue;
  }

  // Hvorugt orðalagið á síðunni (eða net-/HTTP-villa) = ÞRENGING eða bilun.
  // (Mælt 13.9: ~16 sóknir á 2,5s fresti duga áður en RSK byrjar að bera fram tóma síðu.)
  // Rétt svar er að BAKKA og reyna SAMA forskeyti aftur — ekki gefast upp.
  if (villa || flokkur !== 'nidurstodur') {
    const k = villa || flokkur;
    villur[k] = (villur[k] || 0) + 1;
    fails++;
    if (fails >= MAXFAIL) { hattiVegna = `${MAXFAIL} samfelldar bilanir þrátt fyrir bið (${JSON.stringify(villur)}) — RSK lokað um sinn; reyndu aftur síðar`; break; }
    const bid = Math.min(BACKOFF_BYRJUN * 2 ** (fails - 1), BACKOFF_THAK);
    if (utrunnid()) { hattiVegna = `tímaþak (${MINUTES} mín)`; break; }
    console.error(`  ⏳ óbrugðið svar á "${pfx}" [${k}] (${fails}/${MAXFAIL}) — bakka í ${Math.round(bid / 1000)}s og reyni sama forskeyti aftur.`);
    await sleep(bid);
    continue;
  }
  fails = 0;

  for (const f of radir) {
    if (!S.felog[f.kt]) nyFelog++;
    S.felog[f.kt] = { nafn: f.nafn, postfang: f.postfang, ...(f.merki ? { merki: f.merki } : {}) };
  }
  S.forskeyti[pfx] = { done: 1, hits: radir.length };

  // Mettað forskeyti (≥100) → leitin faldi restina; dýpka með næsta staf.
  const { children } = nextPrefixes(pfx, radir.length, CAP);
  for (const c of children) if (!S.forskeyti[c]) { S.forskeyti[c] = { done: 0 }; dypkud++; }

  vista();
  if (sott % 10 === 0) console.error(`  … ${sott} sóknir · ${Object.keys(S.felog).length} félög · ${bidaSkra().length} forskeyti eftir`);
}

vista();
const bid = bidaSkra().length;
console.error(`\nHætti: ${hattiVegna}.`);
console.error(`Sóknir: ${sott} · ný félög: ${nyFelog} · safn alls: ${Object.keys(S.felog).length} · ný forskeyti: ${dypkud} · bíða: ${bid}`);
if (Object.keys(villur).length) console.error(`Villu-sundurliðun: ${JSON.stringify(villur)}`);
console.error(`\nSkrifað í gogn/sweep_felog.json. Næsta skref:  node skriptur/build_felagaskra.mjs`);
