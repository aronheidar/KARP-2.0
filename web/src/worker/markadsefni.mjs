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
// ⚠ Tillögur mega vera nokkurra klukkustunda gamlar: mælikvarðinn er vikutaktur, ekki mínútutaktur.
//    Löng geymsla er vörnin gegn D1-álaginu — EKKI þak á fyrirspurnina, sem skerðir grunnlínuna (sjá neðar).
const _ME_TILLOGUR_FYRNING = 6 * 3600;
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
 *  ⚠⚠ `postiz_id` geymir FÆRSLU-AUÐKENNI, ekki `group`. Mæling á reikningnum 16.9 felldi þá forsendu að
 *     sama verk á tveimur rásum deili `group`: `group === id` í öllum 41 færslum og 18 pör deildu texta og
 *     tíma en báru sitt hvort `group`. `group` auðkennir því birtingu en ekki verk. Þar á ofan skilar
 *     `posts:create` engu `group`, svo framleiðslukeyrslan á enga leið til að vísa í það — færslu-
 *     auðkennin eru einu auðkennin sem BÁÐAR hliðar þekkja. Parað er á þeim, og ný lína geymir það fyrsta.
 *  ⚠ Lína telst fundin ef EITTHVERT auðkenni verksins er þegar skráð: keyrslan skráir eitt auðkenni en
 *     lestrarhliðin skilar þeim öllum. Væri parað á eitt fast auðkenni réði röðin í svari Postiz því
 *     hvort verkið tvískráðist.
 *  ⚠ Færslur í sama verki geta borið ÓLÍKT `state` (LinkedIn farið út, Facebook ekki). `v.birt` er rétti
 *     mælikvarðinn — hopaFaerslur setur hann `true` um leið og EIN rás er PUBLISHED. Notum ÞVÍ `v.birt`,
 *     aldrei `v.state`, og uppfærum `birt` í töflunni um leið og gamla línan var óbirt en nýja er birt. */
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
    const audkenni = (Array.isArray(v.ids) && v.ids.length) ? v.ids : (v.group ? [v.group] : []);
    if (!audkenni.length) { sleppt.push({ texti: v.texti, astaeda: 'engin_audkenni' }); continue; }
    const fyrra = audkenni.map((a) => medPostizId.get(a)).find(Boolean);
    if (fyrra) {
      if (v.birt && !fyrra.birt) {
        const skrifadi = await env.TENGSL.prepare('UPDATE markadsefni SET birt=? WHERE id=?').bind(v.ts || nu, fyrra.id).run().then(() => true).catch(() => false);
        if (skrifadi) uppfaerd++; else sleppt.push({ texti: v.texti, astaeda: 'vistun_brast' });
      }
      continue;
    }
    const skrifadi = await env.TENGSL.prepare(
      'INSERT INTO markadsefni (created, titill, tegund, efnistok, tala, heimild, lota, postiz_id, rasir, birt, skra) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(nu, v.texti, 'myndband', null, null, null, null, audkenni[0], JSON.stringify(v.rasir || []), v.birt ? (v.ts || nu) : null, null).run().then(() => true).catch(() => false);
    if (skrifadi) ny++; else sleppt.push({ texti: v.texti, astaeda: 'vistun_brast' });
  }
  const skil = { ok: true, ny, uppfaerd, sleppt };
  if (p.villa) skil.villa = p.villa;   // sagt frá stöðnuðum grunni — samstillt var á móti síðustu þekktu mynd
  return skil;
}

/** Geymdu tillögurnar úr `stjorn_sync` (eða null ef aldrei reiknaðar / ólæsilegt JSON). */
async function _meTillogurGeymt(env) {
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='markads_tillogur'").first().catch(() => null);
  if (!r) return null;
  try { return { gogn: JSON.parse(r.v), uppfaert: Number(r.updated) }; } catch (e) { return null; }
}

/** Geymir tillögur í `stjorn_sync` — sameiginlegt fyrir fullu leiðina og þöggunar-leiðina hér fyrir neðan
 *  (grunnlína sem ekki nær yfir tímabilið), svo báðar skrifi nákvæmlega eins. */
async function _meGeymaTillogur(env, gogn, nu) {
  await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('markads_tillogur', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
    .bind(JSON.stringify(gogn), nu).run().catch(() => {});
}

/** Heit málefni (síðustu 90 daga) parað við það sem KARP á tölu um, að frádregnu því sem þegar er birt.
 *  ⚠ Niðurstaðan er geymd í `stjorn_sync` með sér-fyrningu (_ME_TILLOGUR_FYRNING, 6 klst — tillögur mega
 *  vera gamlar, vikutaktur en ekki mínútutaktur), annars keyrir fréttafyrirspurnin við HVERJA hleðslu
 *  /stjorn/. D1-lestrarþakið hefur ÁÐUR læst Aroni úti af karp.is (authLogin gerir DB-bilun að „rangt
 *  lykilorð“).
 *  ⚠⚠ ÞAKIÐ MÁ ALDREI SKERÐA GLUGGANN — mælt í framleiðslu: 22.107 fréttir liggja í 90 daga glugganum, en
 *  gamla `LIMIT 4000` náði aðeins 15 daga aftur, svo grunnlínan „venjuleg vika" reiknaðist úr fimmtungi
 *  tímabilsins og hlutföllin urðu röng (allt önnur málefni röðuðust efst — sama fyrirspurn skilaði
 *  „Fjárlög 3,7×" með fullum glugga en „Vinnumarkaður 6× · Fiskeldi 5,2×" með þjappaða glugganum).
 *  Geymslan hér að ofan er rétta vörnin gegn D1-álaginu — sjá THAK (öryggisventill, ekki mælikvarði) og
 *  grunnlínu-gátunina hér fyrir neðan sem þegir frekar en að birta hlutfall sem er ekki mælt. */
async function _meTillogur(env, nu) {
  const geymt = await _meTillogurGeymt(env);
  if (geymt && geymt.uppfaert > nu - _ME_TILLOGUR_FYRNING) return geymt.gogn;

  const fra = nu - 90 * 86400;
  // ⚠⚠ ÞAKIÐ MÁ ALDREI SKERÐA GLUGGANN. `LIMIT 4000` náði aðeins 15 daga aftur (22.107 fréttir liggja í
  //    90 daga glugganum), svo grunnlínan „venjuleg vika" var reiknuð úr fimmtungi af tímabilinu og
  //    hlutföllin urðu röng — allt önnur málefni röðuðust efst. 30.000 er ÖRYGGISVENTILL gegn
  //    stjórnlausum lestri, ekki mælikvarði; nái hann þaki er niðurstaðan ónothæf (sjá gátun neðar).
  const THAK = 30000;
  const frettirR = await env.TENGSL.prepare('SELECT title, body, ts FROM news WHERE ts >= ? ORDER BY ts DESC LIMIT ?').bind(fra, THAK).all().catch(() => ({ results: [] }));
  const frettir = frettirR.results || [];

  // Grunnlínan verður að ná yfir raunverulegt tímabil. Nái gögnin aðeins fáa daga aftur — af því þakið
  // small eða safnið er nýtt — er ekkert „venjulegt" til að bera saman við. Þá þegjum við frekar en að
  // birta hlutfall sem lítur út fyrir að vera mælt.
  const elsta = frettir.length ? Math.min(...frettir.map((f) => Number(f.ts) || 0)) : 0;
  const grunnlinuDagar = elsta ? Math.floor((nu - elsta) / 86400) : 0;
  if (frettir.length >= THAK || grunnlinuDagar < 60) {
    const tomt = [];
    await _meGeymaTillogur(env, tomt, nu);
    return tomt;
  }

  const heitt = heitMalefni(frettir, MALEFNI, { nu });
  const safnR = await env.TENGSL.prepare('SELECT efnistok, birt FROM markadsefni WHERE birt IS NOT NULL').all().catch(() => ({ results: [] }));
  const gogn = tillogur(heitt, safnR.results || [], nu);
  await _meGeymaTillogur(env, gogn, nu);
  return gogn;
}

/** /api/admin/markadsefni — GET dagatal+safn+tillögur · POST samstilla/merkja/framleida/skra.
 *  Auth: GET má með X-Admin-Key. POST 'skra' má EINNIG með lykli (GH Action-keyrslan sem framleiðir
 *  myndbandið hefur enga lotu) — hún skrifar bara drög-línu, aldrei í Postiz. Öll ÖNNUR POST-aðgerð
 *  (samstilla/merkja/framleida) KREFST lotu: þær skrifa í Postiz eða ræsa framleiðslu í
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
  const action = String(b.action || '');

  // ⚠ 'skra' er EINA POST-aðgerðin sem X-Admin-Key (engin lota) má nota — GH Action-keyrslan sem
  //   framleiðir myndbandið hefur enga lotu Arons. Hún skrifar ALDREI í Postiz og ræsir ekkert, aðeins
  //   skráir eina drög-línu (birt=NULL — drög eru ekki birt) eftir að keyrslan sjálf (föst skref, ekki
  //   Claude) hefur þegar hlaðið myndbandinu upp sem drögum. 'samstilla'/'merkja'/'framleida' krefjast
  //   áfram lotu — sjá lota-vörnina rétt fyrir neðan, ÓBREYTT.
  if (action === 'skra') {
    const titill = String(b.titill || '').trim().slice(0, 300);
    if (!titill) return _ajson({ ok: false, error: 'titill' });
    const tegund = b.tegund != null ? String(b.tegund).slice(0, 40) : 'myndband';
    // ⚠ Ógilt efnistak verður NULL, ekki villa: þá birtist verkið sem „óflokkað" og fæst leiðrétt.
    //    Væri það vistað óbreytt myndi það hvorki síast úr tillögum né teljast óflokkað — og rotna þegjandi.
    const efnistokSkra = MALEFNI.some((m) => m.n === b.efnistok) ? b.efnistok : null;
    const tala = b.tala != null ? String(b.tala).slice(0, 200) : null;
    const heimild = b.heimild != null ? String(b.heimild).slice(0, 300) : null;
    const lota = b.lota != null ? (parseInt(b.lota, 10) || null) : null;
    const postiz_id = b.postiz_id != null ? String(b.postiz_id).slice(0, 200) : null;
    const skra = b.skra != null ? String(b.skra).slice(0, 300) : null;
    const r = await env.TENGSL.prepare(
      'INSERT INTO markadsefni (created, titill, tegund, efnistok, tala, heimild, lota, postiz_id, rasir, birt, skra) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(_meNow(), titill, tegund, efnistokSkra, tala, heimild, lota, postiz_id, JSON.stringify([]), null, skra).run().catch(() => null);
    if (!r) return _ajson({ ok: false, error: 'vistun' });
    return _ajson({ ok: true, id: r.meta && r.meta.last_row_id });
  }

  if (!uid) return _ajson({ ok: false, error: 'lota' });   // X-Admin-Key má lesa en ekki skrifa í Postiz né ræsa framleiðslu
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
