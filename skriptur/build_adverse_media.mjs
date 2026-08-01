#!/usr/bin/env node
// =============================================================================
//  build_adverse_media.mjs — FATF-flokkað adverse media fyrir vöktuð KYC-félög (10. merkið)
// -----------------------------------------------------------------------------
//  MATCH-FYRST, FLOKKA-SVO (rýni 2026-08-01): aðeins fréttir sem nefna VAKTAÐ félag fara
//  í LLM-flokkun — tugir á dag, ekki 50k safnið. Þrjú varnarlög gegn röngum aðila:
//    SQL-LIKE (kandídatar) → adverseMatch (ströng nafna-samsvörun) → flokkarinn sjálfur
//    (svarar 0 sé félagið ekki gerandinn; þolandi brots = 0).
//
//  Niðurstöður skrifast í FROSNU töfluna kyc_adverse (grisjast ALDREI þótt news-taflan
//  haldi aðeins 400 dögum) — EDD-sagan má ekki hverfa með fréttunum. Sama keyrsla frystir
//  kyc_tonn (mánaðarlegur fjöldi+meðaltónn per vaktað félag) fyrir CDD-greinargerðir síðar.
//
//  Worker LES aðeins þessar töflur (kycScreenKt → fatf-merkið); ekkert LLM keyrir í worker.
//  ⚠ PERSÓNUVERND: flokkun EINGÖNGU á kt LÖGAÐILA (nafn félags úr kyc_watch), birt aðeins
//  í gáttaðri KYC-möppu. Aldrei einstaklingar, aldrei opinber birting.
//
//  KEYRSLA (nætur-CI eftir build_sentiment_ai):
//    ANTHROPIC_API_KEY=... CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
//      node skriptur/build_adverse_media.mjs [--limit N] [--dry]
// =============================================================================
import { adverseMatch, advPrompt, parseAdv, advSeverity, ADV_SYSTEM } from '../web/src/lib/adverse-media.mjs';

const AKEY = process.env.ANTHROPIC_API_KEY || '';
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const DB_ID = process.env.CLOUDFLARE_D1_ID || '6b1672e6-13da-4d14-b45a-0d83a15ccef4';
// Sonnet, ekki Haiku: falskt „peningaþvætti"-merki í compliance-möppu er lagalega viðkvæmt
// og magnið (tugir frétta/dag) gerir sterkara módelið nær ókeypis (rýni 2026-08-01).
const MODEL = process.env.KARP_ADV_MODEL || 'claude-sonnet-5';
const CHUNK = +(process.env.ADV_CHUNK || 10);
const argv = process.argv.slice(2);
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? +argv[i + 1] || 0 : 0; })();
const DRY = argv.includes('--dry');

if (!AKEY) { console.error('✗ ANTHROPIC_API_KEY vantar — sleppi.'); process.exit(0); }
if (!CF_TOKEN || !CF_ACCT) { console.error('✗ CLOUDFLARE_API_TOKEN/ACCOUNT_ID vantar — sleppi.'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function q(sql, params = []) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCT + '/d1/database/' + DB_ID + '/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + CF_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json().catch(() => null);
  if (!j || !j.success) throw new Error('D1: ' + JSON.stringify(j && j.errors).slice(0, 200));
  return (j.result && j.result[0] && j.result[0].results) || [];
}

async function classifyChunk(nafn, rows) {
  const user = advPrompt(nafn, rows);
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 400, system: ADV_SYSTEM, messages: [{ role: 'user', content: user }] }),
      });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; }
      const j = await r.json();
      const parsed = parseAdv((j && j.content && j.content[0] && j.content[0].text) || '', rows.length);
      if (parsed) return parsed;
      await sleep(800 * (a + 1));   // brenglað svar → aftur; ALDREI giska á dreifingu
    } catch (e) { await sleep(1500 * (a + 1)); }
  }
  return null;   // lotu sleppt — næsta keyrsla reynir aftur (url ekki komið í kyc_adverse)
}

(async () => {
  const t0 = Date.now();
  const watches = await q("SELECT DISTINCT kt, nafn FROM kyc_watch WHERE status='active' AND nafn IS NOT NULL AND length(nafn) >= 4");
  console.log('Vöktuð félög með nafni: ' + watches.length + (DRY ? ' · ÞURR-keyrsla' : ''));
  let cand = 0, flokkud = 0, ny = 0, sleppt = 0;
  for (const w of watches) {
    const kt = String(w.kt).replace(/\D/g, '');
    const nafn = String(w.nafn).trim();
    if (!kt || nafn.length < 4) continue;
    // Kandídatar: sama LIKE-mynstur og newsSearch (lág- og hástafamynd) — JS-samsvörunin sker svo.
    const vars = [...new Set(['%' + nafn.toLowerCase() + '%', '%' + nafn + '%'])];
    const rows = await q(
      'SELECT url,title,source,ts,body,sent_ai FROM news WHERE (' + vars.map(() => 'body LIKE ?').join(' OR ') + ') ORDER BY ts DESC LIMIT 400',
      vars).catch(() => []);
    const matched = rows.filter((r) => adverseMatch(nafn, (r.title || '') + ' ' + (r.body || '')));
    if (!matched.length) continue;

    // kyc_tonn: frysta mánaðarlega tón-tímaröð (uppfærir aðeins mánuði sem enn sjást í news-glugganum
    // — eldri frosnir mánuðir standa óhreyfðir, það er tilgangurinn).
    if (!DRY) {
      const man = new Map();
      for (const r of matched) {
        const m = new Date(r.ts * 1000).toISOString().slice(0, 7);
        const b = man.get(m) || { n: 0, sum: 0, sn: 0 };
        b.n++; if (r.sent_ai != null) { b.sum += r.sent_ai; b.sn++; }
        man.set(m, b);
      }
      for (const [m, b] of man) {
        await q('INSERT INTO kyc_tonn (kt,man,n,tonn) VALUES (?,?,?,?) ON CONFLICT(kt,man) DO UPDATE SET n=excluded.n, tonn=excluded.tonn',
          [kt, m, b.n, b.sn ? +(b.sum / b.sn).toFixed(3) : null]).catch(() => {});
      }
    }

    // Aðeins ó-metnar fréttir fara í LLM. kyc_adverse_sed er „séð"-skráin — líka fyrir hreinar
    // fréttir (0), annars endur-flokkaðist allur LIKE-gluggi stórra félaga á hverri nóttu.
    const til = new Set((await q('SELECT url FROM kyc_adverse_sed WHERE kt=?', [kt]).catch(() => [])).map((r) => r.url));
    let oflokkud = matched.filter((r) => r.url && !til.has(r.url));
    if (LIMIT && cand + oflokkud.length > LIMIT) oflokkud = oflokkud.slice(0, Math.max(0, LIMIT - cand));
    cand += oflokkud.length;
    for (let i = 0; i < oflokkud.length; i += CHUNK) {
      const lota = oflokkud.slice(i, i + CHUNK);
      if (DRY) { console.log('  [þurr] ' + nafn + ': ' + lota.length + ' í flokkun'); continue; }
      const res = await classifyChunk(nafn, lota);
      if (!res) { sleppt += lota.length; continue; }
      flokkud += lota.length;
      const now = Math.floor(Date.now() / 1000);
      for (let k = 0; k < lota.length; k++) {
        // Séð-skráin fær HVERJA metna frétt (líka 0) — aðeins tókst-að-meta lendir hér,
        // svo lota sem féll á brengluðu svari verður tekin aftur í næstu keyrslu.
        await q('INSERT INTO kyc_adverse_sed (kt,url,at) VALUES (?,?,?) ON CONFLICT(kt,url) DO NOTHING', [kt, lota[k].url, now]).catch(() => {});
        if (!res[k]) continue;   // 0 = ekkert adverse → aðeins séð-skráning
        await q('INSERT INTO kyc_adverse (kt,url,title,source,dags,flokkur,stada,alvarleiki,model,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(kt,url) DO NOTHING',
          [kt, lota[k].url, String(lota[k].title || '').slice(0, 300), lota[k].source || '', new Date(lota[k].ts * 1000).toISOString().slice(0, 10), res[k].flokkur, res[k].stada, advSeverity(res[k].flokkur), MODEL, now]).catch(() => { sleppt++; });
        ny++;
      }
    }
    if (LIMIT && cand >= LIMIT) break;
  }
  console.log('✔ kandídatar í flokkun: ' + cand + ' · flokkaðar: ' + flokkud + ' · adverse-færslur nýjar: ' + ny + ' · sleppt (villur): ' + sleppt + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
})().catch((e) => { console.error('✗ ' + (e && e.message)); process.exit(1); });
