// fjarmal.mjs (worker) — vél fjármálastjórans Elínar: Áskels-samningar × D1-heimildir.
//
// ⚠⚠ ELÍN HREYFIR ALDREI PENINGA. Engar greiðslur, endurgreiðslur, millifærslur eða uppsagnir.
//    TVÖ ÓHÁÐ LÖG standa milli notanda og keyrslu: hvítalistinn `_FJ_ADGERDIR` og skýr
//    `action === 'hrafn'`-gátun á síðustu greininni. Hvorugt má vera eina línan sem ver hitt —
//    fall-through í síðustu grein gerði hvítalistann að einu girðingunni, og þá dugði ein eydd lína.
// ⚠ Öll top-level nöfn bera forskeytið _fj — ci_worker_bindings.mjs fellir CI ef nöfn rekast á.
import { _ajson } from './felag.mjs';
import { adminCsrfVilla, _ghDispatch } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';
import { samstemma } from '../lib/fjarmal.mjs';

const _fjNow = () => Math.floor(Date.now() / 1000);
const _FJ_FYRNING = 900;   // 15 mín — áskriftir hreyfast í dögum, ekki sekúndum
const _FJ_API = 'https://askell.is/api/v2';
const _FJ_UPPRUNI = 'https://askell.is/';   // ⚠ API-lykillinn fer ALDREI á annan hýsil, hvað sem svarbolurinn segir
const _FJ_SIDUTHAK = 20;
// ⚠ Hvítalistinn er FYRRA lagið. Bættu ALDREI við aðgerð sem snertir peninga.
const _FJ_ADGERDIR = ['saekja', 'hrafn'];

/** Tóm mynd = ÖLL skil `samstemma` (Verk 1), ekki hluti þeirra. Vanti `mrrAskellOvisst`,
 *  `verdUppsprettur` eða `tvirukkun` hér verður varabrautin að þögulli afturför í Verk 1: talan
 *  berst áfram án þess sem gerir hana rekjanlega.
 *  ⚠ `mrrAskellOvisst: true` — án mælingar vitum við sannanlega ekki neitt.
 *  ⚠ Verk 4 bætir `rennurUt` við svarið — sá reitur VERÐUR að fara hér inn líka, annars hendir
 *    varabrautin honum í hljóði. */
const _fjTomt = () => ({
  misraemi: [], fripofanir: [], tvirukkun: [], mrrAskell: 0, mrrD1: 0, verdrek: [],
  verdUppsprettur: { lidur: 0, verdskra: 0, ekkert: 0 }, mrrAskellOvisst: true,
});

/** Geymda myndin er GÖGN, aldrei merking: `villa` er reiknuð per svar og geymd hvergi. Væri
 *  hlutabilun fryst inn í hana litaði hún svarið í allt að 15 mín eftir að D1 væri komið aftur.
 *  ⚠ `delete` ver gegn röðum sem voru skrifaðar áður en þessi regla gilti. */
const _fjMynd = (geymt) => {
  const m = Object.assign(_fjTomt(), (geymt && geymt.gogn) || {});
  delete m.villa;
  return m;
};

async function _fjGeymt(env) {
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='fjarmal'").first().catch(() => null);
  if (!r) return null;
  try { return { gogn: JSON.parse(r.v), uppfaert: Number(r.updated) }; } catch (e) { return null; }
}

async function _fjRofi(env) {
  const r = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind('rofi_elin').first().catch(() => null);
  return !!(r && String(r.v) === '1');
}

// ⚠ `readSession` tekur (env, request) og skilar TÖLU (0 = engin lota), aldrei hlut með `.uid`.
//   Sama form og systurfallið `_blAdminUid` í ./bilanir.mjs.
async function _fjAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

/** Áskell síðuflettir. Fernt sem má ALDREI vera þögult:
 *  ⚠⚠ `next` kemur úr SVARBOL. Hún er elt AÐEINS inn á `_FJ_UPPRUNI` — annars fengi sá hýsill sem
 *     svarið nefnir `Authorization: Api-Key <ASKELL_PRIVATE_KEY>` afhentan. Þetta er eini staðurinn
 *     í safninu sem eltir slóð úr svarbol, svo reglan stendur hér en ekki í sameiginlegri einingu.
 *  ⚠ `next` sem vísar á sjálfa sig sótti sömu síðu 20× og LAGÐI SAMAN (mælt: mrrAskell 198.000 þar
 *     sem rétt gildi var 9.900, með ok:true og enga villu). Séðar slóðir stöðva lykkjuna.
 *  ⚠ Varðþak slegið = listinn er EKKI tæmandi. Það verður að vera villa, ekki hálfur listi sem
 *     lítur heill út.
 *  ⚠ Svar sem er ekki fylki er VILLA, ekki tómur listi — annars sýnist „engin misræmi" þegar
 *     ekkert var mælt. */
async function _fjSaekjaAllt(env, slod) {
  const H = { Authorization: 'Api-Key ' + env.ASKELL_PRIVATE_KEY, Accept: 'application/json' };
  const ut = [];
  const sedar = new Set();
  let u = _FJ_API + slod;
  while (u) {
    if (sedar.size >= _FJ_SIDUTHAK) throw new Error('askell: síðuþak (' + _FJ_SIDUTHAK + ') slegið — listinn væri ekki tæmandi');
    if (sedar.has(u)) throw new Error('askell: next vísar á síðu sem þegar var sótt');
    sedar.add(u);
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error('askell ' + r.status);
    const d = await r.json();
    const hluti = Array.isArray(d) ? d : (d && Array.isArray(d.results) ? d.results : null);
    if (hluti == null) throw new Error('askell: svar er ekki fylki');
    ut.push(...hluti);
    const naest = (d && !Array.isArray(d) && d.next) ? String(d.next) : '';
    if (naest && !naest.startsWith(_FJ_UPPRUNI)) throw new Error('askell: next vísar út fyrir ' + _FJ_UPPRUNI);
    u = naest || null;
  }
  return ut;
}

export async function saekjaFjarmal(env, { thvinga = false } = {}) {
  if (!env.ASKELL_PRIVATE_KEY) return { ok: false, error: 'unconfigured' };
  const geymt = await _fjGeymt(env);
  // ⚠ Rofinn stöðvar SÓKNINA, ekki bara dispatch — slökkt á Elínu má ekki þýða áframhaldandi lifandi
  //   Áskels-köll, líka ekki með ?thvinga=1. Lesturinn stöðvast ekki; hann verður bara sannanlega
  //   gamall OG segir frá því, svo spjaldið sýni ekki gamla tölu eins og hún væri ný.
  if (await _fjRofi(env)) return Object.assign({ ok: true, sott: geymt ? geymt.uppfaert : 0 }, _fjMynd(geymt), { villa: 'rofi' });
  if (!thvinga && geymt && geymt.uppfaert > _fjNow() - _FJ_FYRNING) return Object.assign({ ok: true, sott: geymt.uppfaert }, _fjMynd(geymt));
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
    // ⚠ AÐEINS gögnin eru geymd — sjá _fjMynd.
    await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('fjarmal', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
      .bind(JSON.stringify(gogn), nu).run().catch(() => {});
    // ⚠ Biluð verðskrá var ÞÖGUL: `verdrek: []` og engin villa sagði „ekkert verðrek" þegar verðrek
    //   var aldrei mælt. Forgangur: D1-gatið er nefnt fyrst þegar bæði brugðust — það snertir bæði
    //   `mrrD1` og `misraemi`, verðskráin aðeins `verdrek`. EINN kóði fer út; Verk 3 les einn streng.
    const villa = (subsR.status !== 'fulfilled' || usrR.status !== 'fulfilled') ? 'd1_hluti'
      : (verdR.status !== 'fulfilled' ? 'verdskra_hluti' : null);
    const svar = Object.assign({ ok: true, sott: nu }, gogn);
    if (villa) svar.villa = villa;
    return svar;
  } catch (e) {
    // Stöðnuð mynd er betri en engin — EN hún er ALLTAF merkt, svo spjaldið segi `óvíst` en ekki tölu.
    // ⚠ `villa` kemur EFTIR dreifinguna: geymda myndin vann áður og skilaði t.d. `d1_hluti` þegar
    //   Áskell var alls ekki náanlegur — spjaldið sagði þá „náði í Áskel" um svar sem náði engu.
    return Object.assign({ ok: true, sott: geymt ? geymt.uppfaert : 0 }, _fjMynd(geymt), { villa: 'askell' });
  }
}

/** ⚠ GET og POST `saekja` skila NÁKVÆMLEGA sömu umgjörð: `{ ok, fjarmal, rofi }`. Verk 3 les
 *  `svar.fjarmal.error` — flatt svar á endurnýjunarhnappnum fæli villuna í hljóði (sama gildra og
 *  felldi `bjarkiGogn` einu lagi ofar). */
async function _fjUmgjord(env, thvinga) {
  const fjarmal = await saekjaFjarmal(env, { thvinga });
  return _ajson({ ok: true, fjarmal, rofi: await _fjRofi(env) });
}

/** Auth: GET má með X-Admin-Key EÐA lotu. POST KREFST LOTU — báðar aðgerðirnar ákveða eitthvað
 *  (sækja ferskt kostar Áskels-köll; rétta Hrafni ræsir keyrslu). Lykill má lesa, ekki ákveða. */
export async function adminFjarmalHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _fjAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });

  if (request.method === 'GET') {
    // ⚠⚠ `thvinga` má AÐEINS koma frá LOTU. Með lykli einum var `?thvinga=1` áður hunsandi geymsluna
    //    og gerði fulla lifandi Áskels-köll — mælt og endurtekið: sami kyrrstæði lykill sem opnar
    //    lesturinn gat þá þvingað eins mörg Áskels-köll og hann vildi, hvenær sem er, ótengt lotu.
    //    Það er ótakmarkaður kostnaðar-stjaki á bak við fastan lykil. Með lykli EINUM les
    //    endapunkturinn geymdu myndina eftir vanalegum fyrningarreglum — hún ER sótt ef hún er
    //    fyrnd, bara ALDREI þvinguð fersk að vild.
    const villThvinga = new URL(request.url).searchParams.get('thvinga') === '1';
    return _fjUmgjord(env, villThvinga && !byKey);
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }
  const b = (await request.json().catch(() => null)) || {};
  const action = String(b.action || '');
  // ⚠⚠ FYRRA LAGIÐ. Metið á UNDAN lotu-girðingunni svo hvítalistinn sé sjálfstæð girðing en ekki
  //    aukaverkun af röð auðkenningar — próf mælir `adgerd` (ekki `lota`) líka á lykil-leiðinni.
  if (!_FJ_ADGERDIR.includes(action)) return _ajson({ ok: false, error: 'adgerd' });
  if (!uid) return _ajson({ ok: false, error: 'lota' });
  if (await _fjRofi(env)) return _ajson({ ok: false, error: 'rofi' });

  if (action === 'saekja') return _fjUmgjord(env, true);
  // ⚠⚠ SEINNA LAGIÐ: skýr gátun, ekkert fall-through. Væri hvítalistinn fjarlægður er ÞETTA línan
  //    sem stendur milli innskráðs stjórnanda og raunverulegs repository_dispatch.
  if (action !== 'hrafn') return _ajson({ ok: false, error: 'adgerd' });
  // 'hrafn': AI-saminn texti sem BÍÐUR Arons — hann ýtir, keyrslan fer þá af stað.
  // ⚠ `.trim()` á UNDAN lengdarmælingu (sbr. `bilanir.mjs:128`) — tíu bil komust annars í gegn og
  //   sendu autt verkefni af stað.
  const verk = String(b.verk || '').trim().slice(0, 2000);
  if (verk.length < 10) return _ajson({ ok: false, error: 'verk' });
  const sent = await _ghDispatch(env, 'cto', { verk });
  return _ajson(sent && sent.ok ? { ok: true } : { ok: false, error: 'dispatch' });
}
