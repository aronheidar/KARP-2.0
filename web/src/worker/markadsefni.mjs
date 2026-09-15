// markadsefni.mjs (worker) — vél markaðsfulltrúans Bjarka: Postiz-dagatalið, efnissafnið í D1 og
// fjölmiðlatillögurnar.
//
// ⚠ Bjarki BIRTIR ALDREI. Hann skrifar drög; birting er smellur Arons. Sama regla og gildir um póst.
// ⚠ Postiz-reikningurinn ber fleiri rásir en Karp — síunin er í ../lib/markadsefni.mjs og verður að
//   gilda um ALLT sem héðan kemur.
import { _ajson } from './felag.mjs';
import { adminCsrfVilla, _ghDispatch } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';
import { dagatal, hopaFaerslur } from '../lib/markadsefni.mjs';
import { heitMalefni, tillogur } from '../lib/markadsefni_tillogur.mjs';
import MALEFNI from '../data/malefni.json' with { type: 'json' };

const _meNow = () => Math.floor(Date.now() / 1000);
const _ME_FYRNING = 600;
const _ME_API = 'https://api.postiz.com/public/v1';

/** Geymda Postiz-niðurstaðan úr `stjorn_sync` (eða null ef aldrei sótt / ólæsilegt JSON). */
async function _meGeymt(env) {
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='postiz'").first().catch(() => null);
  if (!r) return null;
  try { return { gogn: JSON.parse(r.v), uppfaert: Number(r.updated) }; } catch (e) { return null; }
}

/** Ein Postiz-uppflétting. Lykillinn fer í Authorization-hausinn (EKKI „Bearer “) og ALDREI í slóðina. */
async function _meGh(env, slod) {
  const r = await fetch(_ME_API + slod, { headers: { Authorization: env.POSTIZ_API_KEY }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('postiz ' + r.status);
  return r.json();
}

async function _meAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

/** Er slökkt á Bjarka (upplýsingar fyrir /stjorn/ — hnappar sem ræsa framleiðslu geta lesið þetta). */
async function _meRofiBjarki(env) {
  const r = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind('rofi_bjarki').first().catch(() => null);
  return !!(r && String(r.v) === '1');
}

/** Sækir Postiz-dagatalið (eða skilar geymdu innan fyrningar).
 *  ⚠ Postiz niðri má ALDREI skila tómu dagatali — það lítur út eins og „ekkert í röðinni“, sem er versta
 *  mögulega lygin fyrir mann sem er að meta hvort hann sé á eftir. Síðasta þekkta stendur, sjá catch. */
export async function saekjaPostiz(env, { thvinga = false } = {}) {
  if (!env.POSTIZ_API_KEY) return { ok: false, error: 'unconfigured' };
  const geymt = await _meGeymt(env);
  if (!thvinga && geymt && geymt.uppfaert > _meNow() - _ME_FYRNING) return Object.assign({ ok: true, sott: geymt.uppfaert }, geymt.gogn);

  try {
    const nu = _meNow();
    const fra = new Date((nu - 45 * 86400) * 1000).toISOString();
    const til = new Date((nu + 45 * 86400) * 1000).toISOString();
    const d = await _meGh(env, '/posts?startDate=' + encodeURIComponent(fra) + '&endDate=' + encodeURIComponent(til));
    // Klippt á 60 NÝJUSTU verkin — hopaFaerslur raðar elst fyrst, svo endinn á fylkinu er röðin fram í
    // tímann og nýjasta fortíðin. Það er það sem skiptir máli, aldrei það sem hvarf aftast ofan í söguna.
    const verk = hopaFaerslur(d.posts).slice(-60);
    const gogn = { verk };
    await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('postiz', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
      .bind(JSON.stringify(gogn), nu).run().catch(() => {});
    return { ok: true, sott: nu, verk };
  } catch (e) {
    // Síðasta þekkta dagatal stendur; stjórnborðið segir frá því að það sé ekki ferskt — aldrei þögult tómt.
    return Object.assign({ ok: true, villa: 'postiz', sott: geymt ? geymt.uppfaert : 0 }, (geymt && geymt.gogn) || { verk: [] });
  }
}

/** Postiz-verk → efnissafnið í D1. Skráir ný verk sem óflokkuð (`efnistok=NULL`) og uppfærir `birt` á
 *  þeim sem hafa birst síðan.
 *  ⚠ TVÆR gildrur sem yfirferð fann í hopaFaerslur (ÓHREYFÐ, utan þessa verks — sjá ../lib/markadsefni.mjs):
 *   1. Færslur í sama `group` geta borið ÓLÍKT `state` (LinkedIn farið út, Facebook ekki). `v.birt` er samt
 *      alltaf rétti mælikvarðinn — hopaFaerslur setur hann `true` um leið og EIN rás í hópnum er PUBLISHED,
 *      jafnvel þótt `v.state` sjálft aðeins endurspegli fyrstu færsluna sem sást. Notum ÞVÍ `v.birt`, aldrei
 *      `v.state`, og uppfærum `birt` í töflunni um leið og gamla línan var óbirt en nýja er birt.
 *   2. Vanti `group` á upprunalegu Postiz-færslunni fellur hópunin í hopaFaerslur á staka-færslu-id — sama
 *      verk gæti þá borið ólíkt `group` eftir því hvenær Postiz náði að tengja rásirnar saman, og engin
 *      leið er til að para slíka færslu örugglega við línu sem þegar er skráð. Fyrri tilraun bar saman
 *      fingrafar (titill+samstillingartími) við (titill+birtingartími) — TVÆR óskyldar klukkur sem stemma
 *      nánast aldrei, svo verkið tvískráðist í hvert sinn sem samstillt var. Þögul tvítalning er verri en
 *      sýnileg sleppa: færsla án `group` (þ.e. `hopaFaerslur` skilaði `group: null`) fer ÞVÍ ALDREI inn —
 *      hún lendir í `sleppt` með ástæðu `'ekkert_group'`, og pörun við þekktar línur byggir eingöngu á
 *      `postiz_id` (sem geymir `group`). */
export async function samstillaEfni(env) {
  const p = await saekjaPostiz(env, { thvinga: true });   // „samstilla“ er ÁKALL um ferska mynd, ekki 10 mín gamla
  const verk = Array.isArray(p.verk) ? p.verk : [];
  const nu = _meNow();
  const nuverandi = await env.TENGSL.prepare('SELECT id, postiz_id, efnistok, birt, titill, created FROM markadsefni').all().catch(() => ({ results: [] }));
  const rows = (nuverandi && nuverandi.results) || [];
  const medPostizId = new Map(rows.filter((x) => x && x.postiz_id).map((x) => [x.postiz_id, x]));

  let ny = 0, uppfaerd = 0;
  const sleppt = [];
  for (const v of verk) {
    // ⚠ Færsla án `group` er ekki nógu vel auðkennd til að para hana við línu í safninu. Fyrri tilraun
    //   bar saman samstillingartíma og birtingartíma — tvær óskyldar klukkur sem stemma aldrei — svo
    //   verkið tvískráðist í hvert sinn. Þögul tvítalning er verri en sýnileg sleppa.
    if (!v.group) { sleppt.push({ texti: v.texti, astaeda: 'ekkert_group' }); continue; }
    const fyrra = medPostizId.get(v.group);
    if (fyrra) {
      if (v.birt && !fyrra.birt) {
        const skrifadi = await env.TENGSL.prepare('UPDATE markadsefni SET birt=? WHERE id=?').bind(v.ts || nu, fyrra.id).run().then(() => true).catch(() => false);
        if (skrifadi) uppfaerd++; else sleppt.push({ texti: v.texti, astaeda: 'vistun_brast' });
      }
      continue;
    }
    const skrifadi = await env.TENGSL.prepare(
      'INSERT INTO markadsefni (created, titill, tegund, efnistok, tala, heimild, lota, postiz_id, rasir, birt, skra) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(nu, v.texti, 'myndband', null, null, null, null, v.group, JSON.stringify(v.rasir || []), v.birt ? (v.ts || nu) : null, null).run().then(() => true).catch(() => false);
    if (skrifadi) ny++; else sleppt.push({ texti: v.texti, astaeda: 'vistun_brast' });
  }
  const skil = { ok: true, ny, uppfaerd, sleppt };
  if (p.villa) skil.villa = p.villa;   // sagt frá stöðnuðum grunni — samstillt var á móti síðustu þekktu mynd
  return skil;
}

/** Heit málefni (síðustu 90 daga) parað við það sem KARP á tölu um, að frádregnu því sem þegar er birt. */
async function _meTillogur(env, nu) {
  const fra = nu - 90 * 86400;
  const frettirR = await env.TENGSL.prepare('SELECT title, body, ts FROM news WHERE ts >= ?').bind(fra).all().catch(() => ({ results: [] }));
  const heitt = heitMalefni(frettirR.results || [], MALEFNI, { nu });
  const safnR = await env.TENGSL.prepare('SELECT efnistok, birt FROM markadsefni WHERE birt IS NOT NULL').all().catch(() => ({ results: [] }));
  return tillogur(heitt, safnR.results || [], nu);
}

/** /api/admin/markadsefni — GET dagatal+safn+tillögur · POST samstilla/merkja/framleida.
 *  Auth: GET má með X-Admin-Key; POST KREFST lotu — það skrifar í Postiz og ræsir framleiðslu í
 *  framleiðsluumhverfi. Lykill má lesa en ekki ákveða slíkt (sama regla og `samthykkja`/Moot-atkvæði). */
export async function adminMarkadsefniHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _meAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });

  if (request.method === 'GET') {
    const thvinga = new URL(request.url).searchParams.get('thvinga') === '1';
    const postiz = await saekjaPostiz(env, { thvinga });
    const nu = _meNow();
    const verk = Array.isArray(postiz.verk) ? postiz.verk : [];
    const safn = await env.TENGSL.prepare(
      'SELECT id, created, titill, tegund, efnistok, tala, heimild, lota, postiz_id, rasir, birt, skra FROM markadsefni ORDER BY created DESC LIMIT 60',
    ).all().catch(() => ({ results: [] }));
    const rofi = await _meRofiBjarki(env);
    return _ajson({ ok: true, postiz, dagatal: dagatal(verk, nu), safn: safn.results || [], tillogur: await _meTillogur(env, nu), rofi });
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }   // kökulotu-leið: same-origin + JSON
  const b = (await request.json().catch(() => null)) || {};
  if (!uid) return _ajson({ ok: false, error: 'lota' });   // X-Admin-Key má lesa en ekki skrifa í Postiz né ræsa framleiðslu

  const action = String(b.action || '');
  if (action === 'samstilla') return _ajson(await samstillaEfni(env));
  if (action === 'merkja') {
    const efnistok = String(b.efnistok || '');
    if (!MALEFNI.some((m) => m && m.n === efnistok)) return _ajson({ ok: false, error: 'efnistok' });
    const id = parseInt(b.id, 10);
    if (!id) return _ajson({ ok: false, error: 'id' });
    const tala = b.tala != null ? String(b.tala).slice(0, 200) : null;
    const heimild = b.heimild != null ? String(b.heimild).slice(0, 300) : null;
    await env.TENGSL.prepare('UPDATE markadsefni SET efnistok=?, tala=?, heimild=? WHERE id=?').bind(efnistok, tala, heimild, id).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (action === 'framleida') {
    const verk = String(b.verk || '').trim().slice(0, 2000);
    if (verk.length < 10) return _ajson({ ok: false, error: 'verk' });
    const d = await _ghDispatch(env, 'markadsefni', { verk });
    return _ajson({ ok: d.ok, dispatch: d });
  }
  return _ajson({ ok: false, error: 'action' });
}
