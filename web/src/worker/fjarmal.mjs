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
import { samstemma, erGjof } from '../lib/fjarmal.mjs';

const _fjNow = () => Math.floor(Date.now() / 1000);
const _FJ_FYRNING = 900;   // 15 mín — áskriftir hreyfast í dögum, ekki sekúndum
const _FJ_API = 'https://askell.is/api/v2';
const _FJ_UPPRUNI = 'https://askell.is/';   // ⚠ API-lykillinn fer ALDREI á annan hýsil, hvað sem svarbolurinn segir
const _FJ_SIDUTHAK = 20;
// ⚠ Hvítalistinn er FYRRA lagið. Bættu ALDREI við aðgerð sem snertir peninga.
const _FJ_ADGERDIR = ['saekja', 'hrafn'];

/** Tóm mynd = ÖLL skil `samstemma` (Verk 1), ekki hluti þeirra. Vanti `mrrAskellOvisst`,
 *  `verdUppsprettur`, `tvirukkun` eða `verdrekMaelt` hér verður varabrautin að þögulli afturför:
 *  talan berst áfram án þess sem gerir hana rekjanlega.
 *  ⚠ `mrrAskellOvisst: true` — án mælingar vitum við sannanlega ekki neitt.
 *  ⚠ `verdrekMaelt: false` — reiknaður HÉR í worker-num (ekki í samstemma, sjá athugasemdina við
 *    `gogn.verdrekMaelt =` að neðan), en sama regla gildir: sjálfgildið á þessari (fram)braut er að
 *    EKKERT mældist, sama hvað gömul geymd mynd kann annars að segja um sjálfa sig.
 *  ⚠ Verk 4 bætir `rennurUt` við svarið — sá reitur VERÐUR að fara hér inn líka, annars hendir
 *    varabrautin honum í hljóði. */
const _fjTomt = () => ({
  misraemi: [], fripofanir: [], tvirukkun: [], mrrAskell: 0, mrrD1: 0, verdrek: [],
  verdUppsprettur: { lidur: 0, verdskra: 0, ekkert: 0, oaudkennt: 0 }, mrrAskellOvisst: true, verdrekMaelt: false, rennurUt: [],
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

/** Vöru-tilvísun verðs — ORÐRÉTT sami forgangur og `askellPriceId()` í ./greidslur.mjs:255-300 notar.
 *  ⚠⚠ Sú skrá segir berum orðum að staðfesta V2-sniðið (11.7) sé `product_reference` og að tilvísun
 *     VERÐSINS SJÁLFS (`reference`/`ref`/`sku`) sé NEÐSTA varaleiðin. Hér stóð öfug röð, svo verð með
 *     eigin tilvísun stal lyklinum af vörunni sem það tilheyrir: verðskráin varð lyklað á eitthvað
 *     sem `samstemma` flettir aldrei upp, `lidVerd` féll á `ekkert` og verðrekið hvarf.
 *  ⚠ `product` getur verið hlutur, auðkenni („12"), DRF-hlekkur („.../products/12/") EÐA tilvísunin
 *    sjálf. Aðeins síðasta formið er nothæfur lykill — hin tvö eru auðkenni og yrðu rusl-lyklar. */
const _fjVerdRef = (p) => {
  const o = (p && typeof p === 'object') ? p : {};
  const vara = (o.product && typeof o.product === 'object') ? o.product : null;
  const beint = String(o.product_reference || '');
  if (beint) return beint;
  if (vara) { const r = String(vara.reference || vara.ref || vara.sku || ''); if (r) return r; }
  if (typeof o.product === 'string' && o.product && !/^\d+$/.test(o.product) && !o.product.includes('/')) return o.product;
  return String(o.reference || o.ref || o.sku || '');
};

/** Áskels-verðlisti → `{ vara: upphæð }` fyrir `samstemma`. Þrennt sem systurkóðinn gerir og vantaði:
 *  ⚠ `active === false` er SÍAÐ ÚT. Slóðin biður um `?active=all`, svo aflögð verð berast með — og
 *    aflagt verð er fortíð, hvorki verðrek né gilt varaverð.
 *  ⚠ `billing_type`: mánaðarverð VINNUR yfir einskiptisverð. Stök skýrsla á sömu vöru gat annars
 *    yfirskrifað mánaðarverðið og framleitt draugaverðrek sem enginn gat rakið.
 *  ⚠⚠ Þögul yfirskrift er felld: tvö ÓLÍK verð í sama forgangi eru ÓVISSA, ekki kapphlaup um hver
 *     kom síðastur. Lykillinn er þá felldur svo `lidVerd` lendi á `ekkert` og spjaldið segi `óvíst` —
 *     útkoman má ALDREI ráðast af innlestrarröð Áskels. Sama upphæð tvisvar er engin óvissa. */
function _fjVerdskra(listi) {
  const rod = (p) => (String(p && p.billing_type || '') === 'recurring' ? 1 : 0);
  const bestu = new Map();
  for (const p of (Array.isArray(listi) ? listi : [])) {
    if (!p || typeof p !== 'object' || p.active === false) continue;
    const ref = _fjVerdRef(p);
    const v = Number(p.amount != null ? p.amount : p.price);
    if (!ref || !Number.isFinite(v)) continue;
    const r = rod(p);
    const fyrir = bestu.get(ref);
    if (!fyrir || r > fyrir.rod) bestu.set(ref, { verd: v, rod: r, tvirar: false });
    else if (r === fyrir.rod && v !== fyrir.verd) fyrir.tvirar = true;
  }
  const ut = {};
  for (const [ref, b] of bestu) if (!b.tvirar) ut[ref] = b.verd;
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
    const verdskra = verdR.status === 'fulfilled' ? _fjVerdskra(verdR.value) : {};
    const heimildir = [
      ...((subsR.status === 'fulfilled' && subsR.value.results) || []).map((x) => Object.assign({}, x, { tegund: 'svc' })),
      ...((usrR.status === 'fulfilled' && usrR.value.results) || []).map((x) => Object.assign({}, x, { tegund: 'tier' })),
    ].filter((h) => !prufur.has(Number(h.uid)));
    const gogn = samstemma({ samningar: samningarR.value, heimildir, verdskra, now: nu });
    // ⚠ Reiknað HÉR en ekki í samstemma(): þetta er ekki misræmi heldur dagatal, og samstemma á að
    //   halda sig við eitt hlutverk — að bera saman tvo lista.
    // ⚠ Allt innan 30 daga fer með; vikumörkin eru sía í bidur_thin. Væru þau sett hér sæi spjaldið
    //   aldrei mánuðinn og „endurnýjast"-flísin yrði alltaf sama talan og „bíður þín".
    // ⚠ Verk 4-yfirferð: gjafaaðgangur (free_access/is_admin/nemandi) er ALDREI misræmi — sama regla
    //   verður að gilda hér. `erGjof` er flutt inn frá ../lib/fjarmal.mjs (ekki afrituð) svo þessi
    //   skilgreining og samstemma() reki aldrei í sundur — sjá athugasemdina við hana þar.
    gogn.rennurUt = heimildir
      .filter((h) => !erGjof(h) && Number(h.until) > nu && Number(h.until) <= nu + 30 * 86400)
      .map((h) => ({ kt: String(h.kt || ''), vara: String(h.vara || ''), until: Number(h.until) }))
      .sort((a, b) => a.until - b.until)
      .slice(0, 40);
    // ⚠ Reiknað HÉR, ekki í samstemma(): samstemma fær `verdskra` sem einfaldan hlut og getur ekki
    //   greint bilaða/tóma verðskrá frá raunverulega tómri — sá greinarmunur býr AÐEINS í verdR.status.
    //   ⚠⚠ VERÐUR að fara í `gogn` (og þar með í það sem er GEYMT) ÁÐUR en INSERT-ið keyrir, ekki bætast
    //     við `svar` seinna: annars sýnir cache-slóðin (algengasta leiðin, sjá _FJ_FYRNING — engin ný
    //     Áskels-köll í allt að 15 mín) ranga `false` úr _fjTomt()-sjálfgildinu í hvert sinn, óháð því
    //     að verðskráin náðist fullkomlega þegar gagnanna var upphaflega aflað. Sama girðing og
    //     athugasemdin yfir `_fjTomt` varar við (og sama mynstur og Verk 4 mun nota fyrir `rennurUt`).
    gogn.verdrekMaelt = verdR.status === 'fulfilled';
    // ⚠ Biluð verðskrá var ÞÖGUL: `verdrek: []` og engin villa sagði „ekkert verðrek" þegar verðrek
    //   var aldrei mælt. Forgangur: D1-gatið er nefnt fyrst þegar bæði brugðust — það snertir bæði
    //   `mrrD1` og `misraemi`, verðskráin aðeins `verdrek`. EINN kóði fer út; Verk 3 las einn streng.
    // ⚠ `gogn.verdrekMaelt` (að ofan) er einmitt til þess að spjaldið þurfi EKKI að giska á þetta af
    //   `villa`: hann er sjálfstæður og ÓHÁÐUR forgangsröðuninni hér — segir nákvæmlega hvort
    //   VERÐSKRÁIN sjálf náðist, líka þegar `d1_hluti` (ekki `verdskra_hluti`) er kóðinn sem fer út.
    // ⚠⚠ REIKNAÐ Á UNDAN GEYMSLUNNI (heildaryfirferð): áður keyrði INSERT-ið fyrst og `villa` á eftir,
    //    svo mynd sem byggði á HÁLFUM samanburði fór möglunarlaust í stjorn_sync.
    const villa = (subsR.status !== 'fulfilled' || usrR.status !== 'fulfilled') ? 'd1_hluti'
      : (verdR.status !== 'fulfilled' ? 'verdskra_hluti' : null);
    // ⚠⚠ Hálfur samanburður er GEYMDUR HVERGI. Bregðist D1-lesturinn meðan Áskell svarar verður
    //    `heimildir` tómt og HVER EINASTI virki samningur að „borgar fyrir ekkert". Væri sú mynd geymd
    //    yrði hún borin fram í allt að 15 mín (_FJ_FYRNING) — og SÍÐAR bæri varabrautin hana fram undir
    //    `villa: 'askell'`, því `_fjMynd` strippar `villa`. Það les eins og „gömul en var einu sinni
    //    rétt". Hún var aldrei rétt. D1-lestrarbilanir eru þekkt, endurtekið ástand í þessu kerfi.
    //    ⚠ `verdskra_hluti` er ANNAÐ mál og geymist áfram: báðir heimildalistarnir náðust, svo
    //      samanburðurinn sjálfur ER heill — aðeins verðin vantar, og `verdrekMaelt: false` segir það.
    //    Eldri heil mynd stendur þá óhreyfð og `sott` segir satt um aldur hennar.
    if (villa !== 'd1_hluti') {
      // ⚠ AÐEINS gögnin eru geymd — sjá _fjMynd.
      await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('fjarmal', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
        .bind(JSON.stringify(gogn), nu).run().catch(() => {});
    }
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
