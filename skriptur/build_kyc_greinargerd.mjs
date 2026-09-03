#!/usr/bin/env node
// =============================================================================
//  build_kyc_greinargerd.mjs — eftirlitshæf áhættumats-greinargerð per vaktað félag
// -----------------------------------------------------------------------------
//  Skrifar rekjanleg DRÖG að CDD-greinargerð: fast sniðmát úr staðreyndum (kyc_snapshot,
//  kyc_adverse, kyc_tonn, kyc_event + ársreikninga-lagerinn) + EIN LLM-samantektar-málsgrein
//  sem talna-gátin (parseTulkun) ver gegn hallucination — tala sem ekki er í samhenginu fellir
//  túlkunina og kaflar 1–6 standa þá sjálfstætt. Sjá lib/kyc-greinargerd.mjs.
//
//  KOSTNAÐAR-GÁT: endurmyndun AÐEINS þegar greinargerdHash(samhengi) breytist frá síðustu
//  röð — óbreytt félag kostar núll tóken. Append-only tafla = audit-saga matsins.
//  ⚠ LÖGAÐILA-VÖRÐUR: einstaklings-kt fær ALDREI greinargerð (DPIA leið A).
//
//  KEYRSLA (nætur-CI á eftir build_adverse_media):
//    ANTHROPIC_API_KEY=... CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
//      node skriptur/build_kyc_greinargerd.mjs [--dry] [--kt <kt> ...]
//
//  --kt keyrir EITT félag strax í stað þess að bíða nætur-CI. Félagið þarf samt að eiga
//  kyc_snapshot-raðir (þ.e. hafa verið skimað) — skimunin sjálf gerist í worker-num, ekki hér.
//  Þetta er leiðin til að svara viðskiptavini samdægurs í stað þess að bíða til morguns.
// =============================================================================
import { readFileSync } from 'node:fs';
import { erLogadili, greinargerdSamhengi, greinargerdHash, parseTulkun, umsvifUrArsreikningi, GREINARGERD_SYSTEM } from '../web/src/lib/kyc-greinargerd.mjs';

const AKEY = process.env.ANTHROPIC_API_KEY || '';
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const DB_ID = process.env.CLOUDFLARE_D1_ID || '6b1672e6-13da-4d14-b45a-0d83a15ccef4';
const MODEL = process.env.KARP_GREIN_MODEL || 'claude-sonnet-5';
const DRY = process.argv.includes('--dry');
// --kt 5306122010 [--kt ...]  — afmarkar keyrsluna við tilteknar kennitölur (á eftirspurn).
const VALIN = process.argv.reduce((a, v, i) => (process.argv[i - 1] === '--kt' ? [...a, String(v).replace(/\D/g, '')] : a), []);

/**
 * Ársreikninga-lagerinn (web/public/gogn/arsreikningar/⟨kt⟩.json, ~1100 félög að forbyggð).
 * Fjarvera skrár er EÐLILEG — hún þýðir „ekki forbyggt", ekki „enginn rekstur". Greinargerðin
 * orðar þann mun sjálf; hér er aðeins skilað null og haldið áfram.
 */
function lesaArsreikning(kt) {
  try { return JSON.parse(readFileSync(new URL('../web/public/gogn/arsreikningar/' + kt + '.json', import.meta.url), 'utf8')); } catch (e) { return null; }
}

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

async function tulka(samhengi) {
  const user = 'SAMHENGI:\n' + JSON.stringify(samhengi, null, 1);
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: GREINARGERD_SYSTEM, messages: [{ role: 'user', content: user }] }),
      });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; }
      const j = await r.json();
      const ok = parseTulkun((j && j.content && j.content[0] && j.content[0].text) || '', samhengi);
      if (ok) return ok;
      await sleep(800 * (a + 1));   // felld af talna-gátinni → reyna aftur; annars án túlkunar
    } catch (e) { await sleep(1500 * (a + 1)); }
  }
  return null;   // kaflar 1–6 standa sjálfstætt — greinargerðin er samt gild
}

(async () => {
  const t0 = Date.now();
  // Á eftirspurn (--kt) er vaktar-skilyrðið sniðgengið viljandi: nafnið kemur þá úr `felog`,
  // svo hægt sé að vinna greinargerð fyrir félag sem enginn er byrjaður að vakta.
  const watches = VALIN.length
    ? await Promise.all(VALIN.map(async (kt) => ({ kt, nafn: (await q('SELECT nafn FROM felog WHERE kt=?', [kt]).catch(() => []))[0]?.nafn || kt })))
    : await q("SELECT DISTINCT kt, nafn FROM kyc_watch WHERE status='active'");
  let ny = 0, obreytt = 0, einstakl = 0, anArs = 0;
  for (const w of watches) {
    const kt = String(w.kt).replace(/\D/g, '');
    if (!erLogadili(kt)) { einstakl++; continue; }
    const snaps = await q('SELECT signal,state_json FROM kyc_snapshot WHERE kt=?', [kt]).catch(() => []);
    const states = {}; for (const s of snaps) { try { states[s.signal] = JSON.parse(s.state_json); } catch (e) {} }
    const adverse = await q('SELECT flokkur,stada,dags,title,source FROM kyc_adverse WHERE kt=? ORDER BY dags DESC LIMIT 50', [kt]).catch(() => []);
    const tonn = await q('SELECT man,n,tonn FROM kyc_tonn WHERE kt=? ORDER BY man', [kt]).catch(() => []);
    const now = Math.floor(Date.now() / 1000);
    const events = await q('SELECT id FROM kyc_event WHERE kt=? AND detected_at>=?', [kt, now - 90 * 86400]).catch(() => []);
    const umsvif = umsvifUrArsreikningi(lesaArsreikning(kt));
    if (!umsvif) anArs++;
    const samhengi = greinargerdSamhengi({ kt, nafn: w.nafn }, states, adverse, tonn, events, { umsvif });
    const h = greinargerdHash(samhengi);
    const sidasta = (await q('SELECT state_hash FROM kyc_greinargerd WHERE kt=? ORDER BY generated_at DESC LIMIT 1', [kt]).catch(() => []))[0];
    if (sidasta && sidasta.state_hash === h) { obreytt++; continue; }
    if (DRY) { console.log('  [þurr] ' + kt + ': breytt samhengi → myndi endurmynda'); ny++; continue; }
    const tulkun = await tulka(samhengi);
    await q('INSERT INTO kyc_greinargerd (kt,state_hash,samhengi_json,tulkun,model,generated_at) VALUES (?,?,?,?,?,?)',
      [kt, h, JSON.stringify(samhengi), tulkun, tulkun ? MODEL : null, now]).catch(() => {});
    ny++;
  }
  console.log('✔ greinargerðir: ' + ny + ' endurmyndaðar · ' + obreytt + ' óbreyttar (núll tóken) · '
    + einstakl + ' einstaklingar sleppt · ' + anArs + ' án ársreiknings í lager · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
})().catch((e) => { console.error('✗ ' + (e && e.message)); process.exit(1); });
