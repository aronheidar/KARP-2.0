#!/usr/bin/env node
// =============================================================================
//  build_sentiment_ai.mjs — AI-tónmat á ÖLLU fréttasafninu (Claude Haiku → D1 news.sent_ai)
// -----------------------------------------------------------------------------
//  ARFTAKI build_archive_sentiment.js, sem talaði við GAMLA WordPress-bakendann
//  (/wp-json/karp/v1/newsunscored + /newsscore) og varð ÓVIRK við CF-flutninginn.
//  ⚠ Gamla skriptan skrifaði 0 fyrir hverja frétt sem ekki tókst að skora
//    (cache-fallback) → 46.874 af 58.298 sitja á 0. Þessi skrifar AÐEINS raun-mat
//    og skilur mistök eftir sem NULL svo næsta keyrsla taki þau.
//
//  EIGINLEIKAR
//   • ENDURRÆSANLEG: velur alltaf `WHERE sent_ai IS NULL` → má stöðva/endurræsa
//   • Idempotent: engin frétt skoruð tvisvar; engin gögn yfirskrifuð
//   • Örugg þáttun: rangur fjöldi í svari → lotu HAFNAÐ (tónn lendir aldrei á rangri frétt)
//   • --limit til að prófa á litlu úrtaki áður en allt safnið er keyrt
//
//  KEYRSLA
//    ANTHROPIC_API_KEY=... CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
//      node skriptur/build_sentiment_ai.mjs --limit 200
//    (án --limit fer hún í gegnum allt safnið)
// =============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptLine, parseScores, updateStmt } from '../web/src/lib/sentiment-ai.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AKEY = process.env.ANTHROPIC_API_KEY || '';
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const DB = process.env.CLOUDFLARE_D1_DB || 'tengsl';
const MODEL = process.env.KARP_SENTIMENT_MODEL || 'claude-haiku-4-5-20251001';
const CHUNK = +(process.env.SENT_CHUNK || 25);     // fréttir per líkans-kall
const CONC = +(process.env.SENT_CONC || 4);        // samhliða köll
const PAGE = +(process.env.SENT_PAGE || 500);      // fréttir sóttar í einu úr D1
const argv = process.argv.slice(2);
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? +argv[i + 1] || 0 : 0; })();
const DRY = argv.includes('--dry');

if (!AKEY) { console.error('✗ ANTHROPIC_API_KEY vantar — sleppi (ekkert skorað).'); process.exit(0); }
if (!CF_TOKEN || !CF_ACCT) { console.error('✗ CLOUDFLARE_API_TOKEN/ACCOUNT_ID vantar — sleppi.'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── D1 REST ────────────────────────────────────────────────────────────────
let DBID = null;
async function cf(pathq, init) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCT + pathq, {
    ...init, headers: { Authorization: 'Bearer ' + CF_TOKEN, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const j = await r.json().catch(() => null);
  if (!j || !j.success) throw new Error('D1 ' + pathq + ' → ' + r.status + ' ' + JSON.stringify(j && j.errors).slice(0, 200));
  return j.result;
}
async function dbId() {
  if (DBID) return DBID;
  const list = await cf('/d1/database');
  const hit = (list || []).find((d) => d.name === DB);
  if (!hit) throw new Error('D1-gagnagrunnur „' + DB + '" fannst ekki');
  DBID = hit.uuid;
  return DBID;
}
async function q(sql, params = []) {
  const id = await dbId();
  const res = await cf('/d1/database/' + id + '/query', { method: 'POST', body: JSON.stringify({ sql, params }) });
  return (res && res[0] && res[0].results) || [];
}

// ── Claude ─────────────────────────────────────────────────────────────────
const SYSTEM = 'Þú metur heildartón íslenskra frétta fyrir hlutlausa fjölmiðlavöktun. '
  + 'Gefðu hverri frétt: 1 ef JÁKVÆÐ (vöxtur, hagnaður, árangur, verðlaun, samningar, opnun, framfarir, sigrar, viðurkenning), '
  + '-1 ef NEIKVÆÐ (tap, gagnrýni, rannsókn, uppsagnir, slys, glæpur, sektir, deilur, hörmungar, andlát, veikindi, áföll), '
  + '0 ef HLUTLAUS (fréttnæm án skýrrar afstöðu: veður, dagskrá, tilkynningar, hlutlaus umfjöllun). '
  + 'Mettu tóninn FYRIR AÐILANN sem fréttin fjallar um, ekki þinn eigin smekk. '
  + 'Svaraðu AÐEINS með JSON-fylki af tölum (-1, 0 eða 1), einni fyrir hverja frétt í sömu röð, jafn mörgum og fréttirnar. Ekkert annað.';

async function scoreChunk(rows) {
  const user = 'Fréttir:\n' + rows.map(promptLine).join('\n');
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 900, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
      });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; }
      const j = await r.json();
      const txt = (j && j.content && j.content[0] && j.content[0].text) || '';
      const scores = parseScores(txt, rows.length);
      if (scores) return scores;
      await sleep(800 * (a + 1));   // ónothæft svar → reyna aftur
    } catch (e) { await sleep(1500 * (a + 1)); }
  }
  return null;   // gefumst upp á lotunni → helst NULL, næsta keyrsla tekur hana
}

// ── Aðal ───────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  const [{ c: eftir }] = await q('SELECT COUNT(*) AS c FROM news WHERE sent_ai IS NULL');
  console.log(`Óskoraðar fréttir: ${eftir}${LIMIT ? ' · þak þessarar keyrslu: ' + LIMIT : ''}${DRY ? ' · ÞURR-keyrsla' : ''}`);
  let gert = 0, hafnad = 0, apiCalls = 0;

  while (true) {
    if (LIMIT && gert >= LIMIT) break;
    const take = LIMIT ? Math.min(PAGE, LIMIT - gert) : PAGE;
    const rows = await q('SELECT url, title, body FROM news WHERE sent_ai IS NULL ORDER BY ts DESC LIMIT ?', [take]);
    if (!rows.length) break;

    // skipta í lotur og keyra CONC samhliða
    const chunks = [];
    for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
    for (let i = 0; i < chunks.length; i += CONC) {
      const group = chunks.slice(i, i + CONC);
      const res = await Promise.all(group.map((c) => { apiCalls++; return scoreChunk(c); }));
      for (let k = 0; k < group.length; k++) {
        const c = group[k], s = res[k];
        if (!s) { hafnad += c.length; continue; }             // helst NULL → næsta keyrsla
        const u = updateStmt(c, s);
        if (!u) { hafnad += c.length; continue; }
        if (!DRY) await q(u.sql, u.binds);
        gert += c.length;
      }
      const p = Math.round((gert / (LIMIT || eftir)) * 100);
      process.stdout.write(`\r  skorað ${gert}${hafnad ? ' · hafnað ' + hafnad : ''} (${p}%) · ${apiCalls} köll`);
    }
    if (DRY) break;   // þurr-keyrsla: ein umferð dugar
  }
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n✔ Lokið: ${gert} skoraðar${hafnad ? ', ' + hafnad + ' óafgreiddar (haldast NULL → næsta keyrsla)' : ''} · ${apiCalls} API-köll · ${mins} mín`);
  if (!DRY) {
    const [d] = await q("SELECT SUM(CASE WHEN sent_ai>0 THEN 1 ELSE 0 END) AS jak, SUM(CASE WHEN sent_ai=0 THEN 1 ELSE 0 END) AS hlut, SUM(CASE WHEN sent_ai<0 THEN 1 ELSE 0 END) AS neik, SUM(CASE WHEN sent_ai IS NULL THEN 1 ELSE 0 END) AS eftir FROM news");
    console.log(`  Staða safnsins → jákvæðar ${d.jak} · hlutlausar ${d.hlut} · neikvæðar ${d.neik} · eftir ${d.eftir}`);
  }
})().catch((e) => { console.error('\nERR', e.message); process.exit(1); });
