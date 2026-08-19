#!/usr/bin/env node
// =============================================================================
//  velja_forbyggingu.mjs — velur kennitölur fyrir NÆTUR-FORBYGGINGU ársreikninga
// -----------------------------------------------------------------------------
//  VANDINN (1.8.2026): fyrirtækjaskýrsla félags sem EKKI er á lager kostar notanda
//  ~80-100 s bið (GitHub-dispatch → CI → hauslaus vafri → þáttun). 990 félög á lager,
//  en 120 af 400 STÆRSTU vantaði. Forbygging á eftirspurnar-menginu færir biðina úr
//  mínútum í núll fyrir langflest raunveruleg uppflettingar.
//
//  EFTIRSPURNAR-MENGIÐ (forgangsröð, einkvæmt):
//    1. KYC-vöktuð félög (kyc_watch)           — borgandi Fyrirtæki+ áskrifendur
//    2. Fylgd/vöktuð félög (user_prefs follows/firmavakt)
//    3. Stærstu félög eftir sölu (felog ⋈ fjarhagur)  — það sem fólk flettir upp
//  …að frádregnum lager (web/public/gogn/arsreikningar/<kt>.json) og ÓLÖGAÐILUM.
//
//  ⚠ RSK-HRAÐATAKMÖRK: build_arsreikningar keyrir með töf milli félaga; þakið hér
//  (--max, sjálfgefið 60/nótt) heldur keyrslunni undir ~10 mín og langt innan kurteisi.
//  Næturvinnan ÉTUR SIG í gegnum listann á nokkrum nóttum og heldur svo við.
//
//  ÚTTAK: stdout = kennitölur með bili (fer beint í build_arsreikningar.mjs).
//  KEYRSLA: CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node skriptur/velja_forbyggingu.mjs [--max 60] [--top 400]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'web', 'public', 'gogn', 'arsreikningar');
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const DB_ID = process.env.CLOUDFLARE_D1_ID || '6b1672e6-13da-4d14-b45a-0d83a15ccef4';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? +argv[i + 1] || d : d; };
const MAX = arg('--max', 60);
const TOP = arg('--top', 400);

if (!CF_TOKEN || !CF_ACCT) { console.error('✗ CLOUDFLARE_API_TOKEN/ACCOUNT_ID vantar — sleppi.'); process.exit(0); }

async function q(sql, params = []) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCT + '/d1/database/' + DB_ID + '/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + CF_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json().catch(() => null);
  if (!j || !j.success) throw new Error('D1: ' + JSON.stringify(j && j.errors).slice(0, 200));
  return (j.result && j.result[0] && j.result[0].results) || [];
}

const erLogadili = (kt) => /^[4-7]\d{9}$/.test(kt);   // DPIA: aðeins lögaðilar (ársreikningar eru opinberir)
const kt10 = (v) => String(v || '').replace(/\D/g, '');

(async () => {
  const lager = new Set(fs.existsSync(OUTDIR) ? fs.readdirSync(OUTDIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 10)) : []);
  const rod = [];          // forgangsröðuð, einkvæm
  const sedd = new Set();
  const baeta = (kt, uppspretta) => { kt = kt10(kt); if (kt.length !== 10 || sedd.has(kt) || !erLogadili(kt)) return; sedd.add(kt); if (!lager.has(kt)) rod.push({ kt, uppspretta }); };

  // 1. KYC-vöktuð
  for (const r of await q("SELECT DISTINCT kt FROM kyc_watch WHERE status='active'").catch(() => [])) baeta(r.kt, 'kyc');
  // 2. Fylgd + firmavakt (JSON-blobb per notanda: fylki af kt eða af {kt})
  for (const k of ['follows', 'firmavakt']) {
    for (const r of await q('SELECT v FROM user_prefs WHERE k=?', [k]).catch(() => [])) {
      try {
        const v = JSON.parse(r.v);
        const list = Array.isArray(v) ? v : (Array.isArray(v?.kt) ? v.kt : (Array.isArray(v?.felog) ? v.felog : []));
        for (const x of list) baeta(typeof x === 'string' ? x : (x && (x.kt || x.key)), k);
      } catch (e) {}
    }
  }
  // 3. Stærstu eftir sölu
  const top = await q(`SELECT f.kt FROM felog f JOIN (SELECT kt, MAX(sala) s FROM fjarhagur WHERE sala IS NOT NULL GROUP BY kt) fj ON fj.kt=f.kt ORDER BY fj.s DESC LIMIT ?`, [TOP]).catch(() => []);
  for (const r of top) baeta(r.kt, 'staerd');

  const valin = rod.slice(0, MAX);
  const tal = {}; for (const x of rod) tal[x.uppspretta] = (tal[x.uppspretta] || 0) + 1;
  console.error(`forbygging: lager ${lager.size} · vantar ${rod.length} (${Object.entries(tal).map(([k, v]) => k + ' ' + v).join(', ')}) · keyri ${valin.length} í nótt`);
  process.stdout.write(valin.map((x) => x.kt).join(' '));
})().catch((e) => { console.error('✗ ' + (e && e.message)); process.exit(1); });
