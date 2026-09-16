// fjarmal.mjs (worker) — vél fjármálastjórans Elínar: Áskels-samningar × D1-heimildir.
//
// ⚠⚠ ELÍN HREYFIR ALDREI PENINGA. Engar greiðslur, endurgreiðslur, millifærslur eða uppsagnir.
//    POST-leiðin hefur hvítalista og hafnar öllu öðru; próf fellur ef hann víkkar.
// ⚠ Öll top-level nöfn bera forskeytið _fj — ci_worker_bindings.mjs fellir CI ef nöfn rekast á.
import { _ajson } from './felag.mjs';
import { adminCsrfVilla, _ghDispatch } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';
import { samstemma } from '../lib/fjarmal.mjs';

const _fjNow = () => Math.floor(Date.now() / 1000);
const _FJ_FYRNING = 900;   // 15 mín — áskriftir hreyfast í dögum, ekki sekúndum
const _FJ_API = 'https://askell.is/api/v2';
// ⚠ Hvítalistinn ER girðingin. Bættu ALDREI við aðgerð sem snertir peninga.
const _FJ_ADGERDIR = ['saekja', 'hrafn'];

async function _fjGeymt(env) {
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='fjarmal'").first().catch(() => null);
  if (!r) return null;
  try { return { gogn: JSON.parse(r.v), uppfaert: Number(r.updated) }; } catch (e) { return null; }
}

async function _fjRofi(env) {
  const r = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind('rofi_elin').first().catch(() => null);
  return !!(r && String(r.v) === '1');
}

// ⚠ FRÁVIK FRÁ UPPHAFLEGA DRÖGUNUM Í VERK-2-BRIEF.MD: þar stóð `readSession(request, env)` og
//   `if (!s || !s.uid) return 0`. Hvort tveggja er rangt við raunverulegu `readSession` í ./auth.mjs
//   — hún tekur (env, request) og skilar TÖLU (0 = engin lota), ALDREI hlut með `.uid`. Öll níu
//   önnur köll í þessu safni (m.a. `_blAdminUid` í `./bilanir.mjs`, sem er byggingarlega systurskrá
//   þessarar — sömu þrjú innflutt föll, sama form) nota (env, request) + tölu-skilagildið. Væri þetta
//   ranga formið notað fengi HVER innskráður stjórnandi sem opnar /stjorn/ um kökulotu (ekki
//   X-Admin-Key) `admin`/`lota` á hverju kalli, að eilífu, í hljóði — ekkert af átta prófunum í
//   briefinu hefði fundið það, því þau nota öll eingöngu X-Admin-Key. Sjá 9.–10. próf hér að neðan
//   sem ég bætti við til að negla þetta niður, og skýrsluna (verk-2-report.md) fyrir rökstuðning.
async function _fjAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

/** Áskell síðuflettir. ⚠ Svar sem er ekki fylki er VILLA, ekki tómur listi — annars sýnist
 *  „engin misræmi" þegar ekkert var mælt. */
async function _fjSaekjaAllt(env, slod) {
  const H = { Authorization: 'Api-Key ' + env.ASKELL_PRIVATE_KEY, Accept: 'application/json' };
  const ut = [];
  let u = _FJ_API + slod, vordur = 0;
  while (u && vordur++ < 20) {
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error('askell ' + r.status);
    const d = await r.json();
    const hluti = Array.isArray(d) ? d : (d && Array.isArray(d.results) ? d.results : null);
    if (hluti == null) throw new Error('askell: svar er ekki fylki');
    ut.push(...hluti);
    u = (d && !Array.isArray(d) && d.next) ? d.next : null;
  }
  return ut;
}

export async function saekjaFjarmal(env, { thvinga = false } = {}) {
  if (!env.ASKELL_PRIVATE_KEY) return { ok: false, error: 'unconfigured' };
  const geymt = await _fjGeymt(env);
  if (!thvinga && geymt && geymt.uppfaert > _fjNow() - _FJ_FYRNING) return Object.assign({ ok: true, sott: geymt.uppfaert }, geymt.gogn);
  try {
    const nu = _fjNow();
    // ⚠ Prufunotendur VERÐA að falla út, annars eru tölurnar tvær ósamanburðarhæfar og misræmið sem
    //   þær áttu að finna verður að þeim sjálfum. `stjornbord.mjs:40-51` les sama lista úr stjorn_sync.
    const _tRow = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='test_ids'").first().catch(() => null);
    let _tArr = []; try { _tArr = JSON.parse((_tRow && _tRow.v) || '[]'); if (!Array.isArray(_tArr)) _tArr = []; } catch (e) { _tArr = []; }
    const prufur = new Set(_tArr.map(Number).filter(Boolean));
    const [samningarR, verdR, subsR, usrR] = await Promise.allSettled([
      _fjSaekjaAllt(env, '/subscription-contracts/?page_size=100'),
      _fjSaekjaAllt(env, '/catalog/prices/?active=all'),
      env.TENGSL.prepare('SELECT s.user_id AS uid, u.kt AS kt, s.service AS vara, s.until AS until, s.askell_id AS askell_id, u.free_access AS free_access, u.is_admin AS is_admin, u.nemandi AS nemandi FROM sub_service s JOIN users u ON u.id = s.user_id WHERE s.until > ?').bind(nu).all(),
      env.TENGSL.prepare('SELECT id AS uid, kt, tier AS vara, tier_until AS until, tier_askell AS askell_id, free_access, is_admin, nemandi FROM users WHERE tier IS NOT NULL AND tier_until > ?').bind(nu).all(),
    ]);
    if (samningarR.status !== 'fulfilled') throw samningarR.reason || new Error('askell');
    const verdskra = {};
    if (verdR.status === 'fulfilled') {
      for (const p of verdR.value) {
        const ref = String((p && (p.reference || p.product_reference)) || '');
        const v = Number(p && (p.amount != null ? p.amount : p.price));
        if (ref && Number.isFinite(v)) verdskra[ref] = v;
      }
    }
    const heimildir = [
      ...((subsR.status === 'fulfilled' && subsR.value.results) || []).map((x) => Object.assign({}, x, { tegund: 'svc' })),
      ...((usrR.status === 'fulfilled' && usrR.value.results) || []).map((x) => Object.assign({}, x, { tegund: 'tier' })),
    ].filter((h) => !prufur.has(Number(h.uid)));
    const gogn = samstemma({ samningar: samningarR.value, heimildir, verdskra, now: nu });
    if (subsR.status !== 'fulfilled' || usrR.status !== 'fulfilled') gogn.villa = 'd1_hluti';
    await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('fjarmal', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
      .bind(JSON.stringify(gogn), nu).run().catch(() => {});
    return Object.assign({ ok: true, sott: nu }, gogn);
  } catch (e) {
    // Stöðnuð mynd er betri en engin — EN hún er ALLTAF merkt, svo spjaldið segi `óvíst` en ekki tölu.
    return Object.assign({ ok: true, villa: 'askell', sott: geymt ? geymt.uppfaert : 0 },
      (geymt && geymt.gogn) || { misraemi: [], fripofanir: [], mrrAskell: 0, mrrD1: 0, verdrek: [] });
  }
}

/** Auth: GET má með X-Admin-Key EÐA lotu. POST KREFST LOTU — báðar aðgerðirnar ákveða eitthvað
 *  (sækja ferskt kostar Áskels-köll; rétta Hrafni ræsir keyrslu). Lykill má lesa, ekki ákveða. */
export async function adminFjarmalHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _fjAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });

  if (request.method === 'GET') {
    const thvinga = new URL(request.url).searchParams.get('thvinga') === '1';
    const fjarmal = await saekjaFjarmal(env, { thvinga });
    return _ajson({ ok: true, fjarmal, rofi: await _fjRofi(env) });
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }
  const b = (await request.json().catch(() => null)) || {};
  const action = String(b.action || '');
  if (!_FJ_ADGERDIR.includes(action)) return _ajson({ ok: false, error: 'adgerd' });
  if (!uid) return _ajson({ ok: false, error: 'lota' });
  if (await _fjRofi(env)) return _ajson({ ok: false, error: 'rofi' });

  if (action === 'saekja') return _ajson(await saekjaFjarmal(env, { thvinga: true }));
  // 'hrafn': AI-saminn texti sem BÍÐUR Arons — hann ýtir, keyrslan fer þá af stað.
  const verk = String(b.verk || '').slice(0, 2000);
  if (verk.length < 10) return _ajson({ ok: false, error: 'verk' });
  const sent = await _ghDispatch(env, 'cto', { verk });
  return _ajson(sent && sent.ok ? { ok: true } : { ok: false, error: 'dispatch' });
}
