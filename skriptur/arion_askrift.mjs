#!/usr/bin/env node
// =============================================================================
//  arion_askrift.mjs  —  Endurtekin Karp+ áskrift gegnum Arion Claims API (kröfur).
// -----------------------------------------------------------------------------
//  Keyrt á áætlun (GH Action, daglega). Þrjú skref:
//    1) Sækja OAuth2-token hjá Arion (Búnaðarskilríki + API-lykill).
//    2) Sækja gjaldfallna áskrifendur frá karp-user.php (/subs/due) → búa til KRÖFU
//       (POST /claims) fyrir hvern → krafan birtist í heimabanka þeirra (kröfupottur RB).
//    3) Poll-a greiddar kröfur (GET /claims?claimStatus=Paid) → framlengja aðgang
//       (karp-user.php /sub/grant → karp_sub_<svc>_until += mánuður).
//
//  ⚠ ÓVIRKT þar til Aron útvegar Arion-skilríki (sjá ARSKRIFT.md / checklist):
//     ARION_API_KEY, ARION_CERT_PFX_B64, ARION_CERT_PASS, ARION_OAUTH_USER,
//     ARION_OAUTH_PASS, ARION_TEMPLATE_CODE, ARION_CLAIMANT_KT + KARP_GRANT_SECRET.
//     Sandbox: ARION_ENV=sandbox + ARION_SANDBOX_TOKEN (ekkert cert).
//  ⚠ mTLS (Búnaðarskilríki) → keyrir í Node (undici Agent m/ pfx), EKKI í Cloudflare-worker.
//  ⚠ ÖLL Arion-köll þarf að SANNPRÓFA í sandbox — nákvæmt OAuth-grant + kröfusniðmát
//     ræðst af uppsetningu Arons hjá Arion (kröfuhirðingar-samningur + template).
// =============================================================================
import { Agent, fetch as uFetch } from 'undici';
import { randomUUID } from 'node:crypto';

const ENV = process.env.ARION_ENV || 'sandbox';
const BASE = 'https://apigw.arionbanki.is';
const API_KEY = process.env.ARION_API_KEY || '';
const AMOUNT = Math.round(+(process.env.SUB_AMOUNT || 3490));        // 3.490 kr/mán per þjónustu
const TEMPLATE = process.env.ARION_TEMPLATE_CODE || '';             // kröfusniðmát (uppsett hjá Arion)
const CLAIMANT = (process.env.ARION_CLAIMANT_KT || '').replace(/\D/g, '');
const KARP_API = process.env.KARP_API || 'https://wp.karp.is/wp-json/karp/v1';
const GRANT_SECRET = process.env.KARP_GRANT_SECRET || '';
const configured = API_KEY && TEMPLATE && CLAIMANT && GRANT_SECRET && (ENV === 'sandbox' ? process.env.ARION_SANDBOX_TOKEN : (process.env.ARION_CERT_PFX_B64 && process.env.ARION_OAUTH_USER));
if (!configured) { console.log('Arion-áskrift ÓVIRK — skilríki vantar (ARION_* / KARP_GRANT_SECRET). Hætti hljóðlega.'); process.exit(0); }

// mTLS-umboð (Búnaðarskilríki) — aðeins í production; sandbox notar token beint.
const dispatcher = ENV === 'sandbox' ? undefined
  : new Agent({ connect: { pfx: Buffer.from(process.env.ARION_CERT_PFX_B64, 'base64'), passphrase: process.env.ARION_CERT_PASS || '' } });

// ---- OAuth2-token -----------------------------------------------------------
async function getToken() {
  if (ENV === 'sandbox') return process.env.ARION_SANDBOX_TOKEN;   // portal-token beint í sandbox
  // ⚠ SANNPRÓFA grant-tegund í sandbox: skjöl segja "user's credentials (username+password)".
  const body = new URLSearchParams({ grant_type: 'password', username: process.env.ARION_OAUTH_USER, password: process.env.ARION_OAUTH_PASS, scope: 'openid profile b2b claimscollection' });
  const r = await uFetch(`${BASE}/oauth/v2/oauth-token`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Ocp-Apim-Subscription-Key': API_KEY }, body });
  if (!r.ok) throw new Error('OAuth-token brást: ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return (await r.json()).access_token;
}
// ---- Arion API-kall ---------------------------------------------------------
async function api(token, method, path, body) {
  const r = await uFetch(`${BASE}/claims/api/v1${path}`, {
    method, dispatcher,
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': API_KEY, 'Authorization': `Bearer ${token}`, 'X-Request-ID': randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, data: txt ? JSON.parse(txt) : null };
}
// ---- karp-user.php hjálp ----------------------------------------------------
const karp = (path, body) => fetch(`${KARP_API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Karp-Secret': GRANT_SECRET }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json()).catch(() => null);

const isoDate = (d) => d.toISOString().slice(0, 10);

async function run() {
  const token = await getToken();
  // 1) gjaldfallnir áskrifendur (kt, service, userid, næsti gjalddagi) — secret-varið
  const due = await karp('/subs/due?ts=' + Math.floor(Date.now() / 1000));   // ts: Date bannað í worker, leyft í Node
  const list = (due && due.subs) || [];
  console.log(`Gjaldfallnir áskrifendur: ${list.length}`);
  const dueDate = isoDate(new Date(Date.now() + 10 * 864e5));   // gjalddagi eftir 10 daga
  let created = 0;
  for (const s of list) {
    const kt = String(s.kt || '').replace(/\D/g, '');
    if (kt.length !== 10) continue;
    const claim = {
      templateCode: TEMPLATE,
      payorId: kt,
      amount: AMOUNT,
      dueDate,
      currency: 'ISK',
      customerNumber: (s.service + '-' + kt).slice(0, 16),          // fastur lykill payanda → leyfir boðgreiðslu
      reference: 'KARP' + String(s.service || '').slice(0, 3).toUpperCase(),
      additionalInformation: 'Karp+ áskrift — ' + (s.service === 'utbod' ? 'Útboðsvaktin' : 'Fjölmiðlavöktun') + ' (karp.is)',
    };
    const res = await api(token, 'POST', '/claims', claim);
    if (res.ok) { created++; console.log(`  ✓ krafa búin til: ${kt} (${s.service})`); await karp('/sub/claimed', { kt, service: s.service }); }   // fresta next_due → engin tvöföld krafa
    else console.error(`  ✗ ${kt}: ${res.status} ${JSON.stringify(res.data).slice(0, 160)}`);
    await new Promise((x) => setTimeout(x, 400));
  }
  // 2) greiddar kröfur sl. 40 daga → framlengja aðgang
  const from = isoDate(new Date(Date.now() - 40 * 864e5));
  const paid = await api(token, 'GET', `/claims?dateFrom=${from}&dateTo=${isoDate(new Date())}&claimStatus=Paid&itemsPerPage=1000`);
  const claims = (paid.ok && Array.isArray(paid.data)) ? paid.data : (paid.data && paid.data.claims) || [];
  let granted = 0;
  for (const c of claims) {
    const kt = String(c.payorId || (c.claimKey && c.claimKey.payorId) || '').replace(/\D/g, '');
    const svc = String(c.reference || '').includes('UTB') ? 'utbod' : 'frettir';
    if (kt.length !== 10) continue;
    const g = await karp('/sub/grant', { kt, service: svc, months: 1, ref: c.claimId || '' });
    if (g && g.ok) granted++;
  }
  console.log(`Kröfur búnar til: ${created} · aðgangur framlengdur: ${granted}`);
}
run().catch((e) => { console.error('VILLA:', e.message); process.exit(1); });
