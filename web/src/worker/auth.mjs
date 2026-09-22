// auth.mjs — klofið úr worker.js 30.7.2026 (úttekt C10). Föllin eru ÓBREYTT;
// aðeins flutt milli skráa + import/export bætt við. Sjá docs/uttekt/2026-07-30-worker-klofningur-aaetlun.md

import { _ajson, _b64u, _emailTpl, _fromB64, _hmac, _te, _tokenHex, sendGmail } from './felag.mjs';
import { accountId, tierFields } from '../lib/account.mjs';
import { renderEmail } from '../lib/emails.mjs';
import { BOD_GILDI_SEK, anLykilords, bodHlekkur, fornafn, samningurNotanda } from '../lib/samningar.mjs';

export const _freeAll = (u) => !!(u && (u.is_admin === 1 || u.free_access === 1));

async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 100000;
  const key = await crypto.subtle.importKey('raw', _te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${iter}$${_b64u(salt)}$${_b64u(bits)}`;
}

async function verifyPassword(pw, stored) {
  try {
    const [alg, iterS, saltS, hashS] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const key = await crypto.subtle.importKey('raw', _te.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: _fromB64(saltS), iterations: +iterS, hash: 'SHA-256' }, key, 256);
    return _b64u(bits) === hashS;
  } catch (e) { return false; }
}

async function makeSession(env, uid) {
  const body = uid + '.' + (Math.floor(Date.now() / 1000) + 60 * 86400);   // 60 daga gildi
  return body + '.' + await _hmac(env, body);
}

export async function readSession(env, request) {
  try {
    const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)karp_session=([^;]+)/);
    if (!m) return 0;
    const [uid, exp, sig] = decodeURIComponent(m[1]).split('.');
    if (!uid || !exp || !sig || +exp < Math.floor(Date.now() / 1000)) return 0;
    if (await _hmac(env, uid + '.' + exp) !== sig) return 0;
    return +uid;
  } catch (e) { return 0; }   // t.d. SESSION_SECRET vantar → engin lota (fail-closed)
}

const _sessCookie = (val, maxAge) => `karp_session=${encodeURIComponent(val)}; Domain=.karp.is; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ⚠⚠ Sjálfvirk innskráning úr staðfestingarhlekk AÐEINS í vafranum sem nýskráði sig (22.9). Hlekkurinn skráði
//    áður HVAÐA vafra sem er inn sem eiganda tókans: sendi einhver þér sinn eigin staðfestingarhlekk varstu
//    innskráð á reikning hans án þess að taka eftir því (innskráningar-CSRF). Nýskráningin setur nú undirritaða
//    `__Host-`-köku sem bindur vafrann við notandanúmerið. `__Host-` krefst Secure, Path=/ og ENGRAR Domain, svo
//    wp.karp.is getur hvorki sett hana né skrifað yfir hana. Forskeytið `nyskra:` aðgreinir undirskriftina frá
//    lotukökunni (`uid.exp`) og CTO-lyklinum (`cto-lykill:`), sem nota sama SESSION_SECRET.
//    Lax (ekki Strict): hlekkur úr vefpósti er leiðsögn af öðrum vef, og Strict sendi kökuna þá ekki.
const NYSKRA_GILDI_SEK = 7 * 86400;   // nær líka yfir endursendan hlekk vikuna eftir nýskráningu
const _nyskraSkilabod = (uid, exp) => 'nyskra:' + Number(uid) + ':' + Number(exp);
const _nyskraCookie = (val, maxAge) => `__Host-karp_nyskra=${encodeURIComponent(val)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
async function _nyskraKaka(env, uid, now) {
  const exp = Number(now) + NYSKRA_GILDI_SEK;
  return _nyskraCookie(Number(uid) + '.' + exp + '.' + await _hmac(env, _nyskraSkilabod(uid, exp)), NYSKRA_GILDI_SEK);
}
/** Notandanúmerið sem þessi vafri nýskráði, eða 0. Aldrei kast. */
export async function nyskraUid(env, request, now = Math.floor(Date.now() / 1000)) {
  try {
    const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)__Host-karp_nyskra=([^;]+)/);
    if (!m) return 0;
    const [uid, exp, sig] = decodeURIComponent(m[1]).split('.');
    if (!/^\d{1,12}$/.test(uid || '') || !/^\d{9,11}$/.test(exp || '') || !sig || +exp < now) return 0;
    if (await _hmac(env, _nyskraSkilabod(uid, exp)) !== sig) return 0;
    return +uid;
  } catch (e) { return 0; }
}

export function userPayload(u, owner, now) {
  // paywall: KVEIKT 1.8.2026 að beiðni Arons. Gætir NÁKVÆMLEGA þriggja áskriftarvara —
  // /frettir/ (Fjölmiðlavakt, þrep 2 eða svc 'frettir'), /utbod/ ('utbod') og /kvotavaktin/ ('kvoti').
  // Allt annað (990-skýrslur, KYC, Lobbývakt) hefur sína eigin gátun og er óháð þessu flaggi.
  // Kerfisstjórar og free_access-notendur sleppa við gáttina um `tierLevel` (isAdmin||freeAccess).
  const base = { loginUrl: 'https://karp.is/innskra/', registerUrl: 'https://karp.is/nyskraning/', paywall: true };
  if (!u) return { loggedIn: false, ...base };
  now = now || Math.floor(Date.now() / 1000);
  const tf = tierFields(u, owner || u, now);   // tier = eigin virkt þrep; effectiveTier = hærra af eigin/account
  const plus = _freeAll(u) || !!tf.effectiveTier;
  return {
    loggedIn: true, id: u.id, email: u.email, name: u.name || u.username || u.email,
    isAdmin: u.is_admin === 1, freeAccess: u.free_access === 1, nemandi: u.nemandi === 1, plus,   // (F4 gerir nákvæmt: þrep + þjónustur + kvóti)
    tier: tf.tier, effectiveTier: tf.effectiveTier,
    emailVerified: u.email_verified === 1, kt: u.kt || null, ...base,
  };
}

export const REPORT_QUOTA = { grunnur: 4, fyrirtaeki: 10, fyrirtaeki_plus: 20 };   // stakar skýrslur/mán per þrep
export async function authMeHandler(request, env) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return _ajson(userPayload(null));
  // ⚠ Sama gildra: D1-bilun mátti ekki verða að „útskráður“. Lotan (undirrituð kaka) er í fullu gildi
  // þótt uppflettingin falli, svo `dbError` segir framendanum að sýna bilun í stað „Skrá inn“.
  let u;
  try {
    u = await env.TENGSL.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
  } catch (e) {
    return _ajson({ ...userPayload(null), dbError: true });
  }
  if (!u) return _ajson(userPayload(null));
  const now = Math.floor(Date.now() / 1000);
  // afskráning: hreinsa tengingu ef ekki lengur á team-lista virks eiganda
  if (u.parent_account_id) {
    const ot = await _prefGet(env, u.parent_account_id, 'team', []);
    const ow = await env.TENGSL.prepare('SELECT is_admin,tier,tier_until,free_access FROM users WHERE id=?').bind(u.parent_account_id).first().catch(() => null);
    const oActive = ow && (_freeAll(ow) || (ow.tier && ow.tier_until > now));
    if (!Array.isArray(ot) || ot.indexOf((u.email || '').toLowerCase()) < 0 || !oActive) {
      await env.TENGSL.prepare('UPDATE users SET parent_account_id=NULL WHERE id=?').bind(u.id).run().catch(() => {});
      u.parent_account_id = null;
    }
  }
  const acct = accountId(u);   // account-eigandi (parent_account_id || id) fyrir deild réttindi/gögn
  const owner = await accountOwner(env, u);
  const p = userPayload(u, owner, now);
  // F4: réttindi úr D1 — virkar þjónustu-áskriftir + keyptar skýrslur + skýrslu-kvóti mánaðarins. Account-resolved (acct/owner).
  const subsR = await env.TENGSL.prepare('SELECT service, used, used_month FROM sub_service WHERE user_id=? AND until>?').bind(acct, now).all().catch(() => ({ results: [] }));
  const repsR = await env.TENGSL.prepare('SELECT report_key FROM reports_granted WHERE user_id=?').bind(acct).all().catch(() => ({ results: [] }));
  p.subs = (subsR.results || []).map((r) => r.service);
  p.reports = (repsR.results || []).map((r) => r.report_key);
  const ym = new Date(now * 1000).toISOString().slice(0, 7);
  const used = (owner.reports_month === ym) ? (owner.reports_used || 0) : 0;   // kvóta-teljari á account-eigandanum
  const quota = _freeAll(u) ? 9999 : (p.effectiveTier ? (REPORT_QUOTA[p.effectiveTier] || 0) : 0);   // þak skv. account-þrepi
  p.reportsRemaining = Math.max(0, quota - used);
  // Samningsaðgangur (lib/samningar.mjs): þjónustur samningsins bætast í subs svo hasSub() opni þær.
  // ⚠ Þær eru EKKI í sub_service — þar teldust þær á listaverði í MRR stjórnborðsins og í samstemmingu
  //   við Áskel, en samningurinn er greiddur með föstu gjaldi utan Áskels.
  // `samningur.thjonustur` = þjónustur sem koma EINGÖNGU úr samningnum. Borgi starfsmaður sjálfur fyrir sömu
  // þjónustu birtist hún sem venjuleg áskrift á Mitt svæði, svo henni megi segja upp (annars rukkar Áskell áfram).
  const sam = samningurNotanda(u, now);
  const eigin = p.subs.slice();
  p.samningur = sam ? { id: sam.id, nafn: sam.nafn, thjonustur: sam.thjonustur.filter((s) => eigin.indexOf(s) < 0) } : null;
  if (sam) for (const s of sam.thjonustur) if (p.subs.indexOf(s) < 0) p.subs.push(s);
  p.plus = p.plus || p.subs.length > 0;   // Karp+ ef þrep EÐA einhver virk þjónustu-áskrift
  p.membership = u.parent_account_id ? { owner: owner.email } : null;   // UI-borði fyrir meðlimi
  p.pendingInvite = u.parent_account_id ? null : await _pendingInvite(env, u, now);
  // F6: fylgja-listi úr user_prefs (KARP_USER.follows notað víða; followsCount á Mitt svæði). Account-scoped.
  p.follows = await _prefGet(env, acct, 'follows', []);
  p.followsCount = p.follows.length;
  // #22: mánaðar-kvóti þjónustu-áskrifta svo UI geti sýnt „N eftir í mánuðinum". -1 = ótakmarkað: Fasteignavaktin
  // frá 22.9.2026 (ákvörðun Arons, verð óbreytt 3.900 kr). `used` telur þar áfram til yfirlits.
  const _svcQ = { fasteign: -1, thingskyrslur: 20 };
  p.svcQuota = {};
  for (const r of (subsR.results || [])) { if (_svcQ[r.service]) { const su = (r.used_month === ym) ? (r.used || 0) : 0; const q = _svcQ[r.service]; p.svcQuota[r.service] = { used: su, quota: q, remaining: q < 0 ? -1 : Math.max(0, q - su) }; } }
  return _ajson(p);
}

export async function authRegisterHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const b = (await request.json().catch(() => null)) || {};
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  const username = String(b.username || '').trim().slice(0, 60) || null;
  const pw = String(b.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return _ajson({ ok: false, error: 'email' });
  if (pw.length < 8) return _ajson({ ok: false, error: 'weakpass' });
  if (!b.terms) return _ajson({ ok: false, error: 'terms' });
  const dup = await env.TENGSL.prepare('SELECT id FROM users WHERE email=? OR (username IS NOT NULL AND username=?)').bind(email, username).first().catch(() => null);
  if (dup) return _ajson({ ok: false, error: 'exists' });
  const now = Math.floor(Date.now() / 1000);
  const res = await env.TENGSL.prepare('INSERT INTO users (email, username, pass_hash, name, email_verified, terms_accepted, created) VALUES (?,?,?,?,0,?,?)')
    .bind(email, username, await hashPassword(pw), b.name || null, b.terms ? now : null, now).run();
  // F5: staðfesting netfangs — sendum staðfestingar-póst; login-hlið hafnar 'unverified' þar til smellt er á hlekkinn.
  await _sendVerifyEmail(env, res.meta.last_row_id, email, now).catch(() => {});
  // Þessi vafri fær að skrá sig sjálfkrafa inn þegar smellt er á hlekkinn (sjá _nyskraKaka); aðrir fara á /innskra/.
  // Bregðist undirritunin er reikningurinn samt til og pósturinn farinn, svo nýskráningin má ekki falla á því.
  const kaka = await _nyskraKaka(env, res.meta.last_row_id, now).catch(() => null);
  return _ajson({ ok: true, verify: true, email }, kaka ? { 'set-cookie': kaka } : {});
}

export async function authLoginHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const b = (await request.json().catch(() => null)) || {};
  const login = String(b.login || b.email || '').trim().toLowerCase().slice(0, 120);
  const pw = String(b.password || '');
  if (!login || !pw) return _ajson({ ok: false, error: 'input' });
  // ⚠ Gagnagrunns-bilun MÁ EKKI líta út eins og röng skilríki. 1.9.2026 sprakk D1-lestrarþakið og
  // `.catch(() => null)` breytti kvótavillunni í „rangt lykilorð“ — stjórnandi læstist úti og orsökin
  // var ógreinanleg að utan. Sér kóði 'db' aðskilur bilun frá röngum skilríkjum. Sjá [[karp-d1-lestrarthak]].
  let u;
  try {
    u = await env.TENGSL.prepare('SELECT * FROM users WHERE email=? OR username=?').bind(login, login).first();
  } catch (e) {
    return _ajson({ ok: false, error: 'db' });
  }
  if (!u || !(await verifyPassword(pw, u.pass_hash))) return _ajson({ ok: false, error: 'invalid' });   // sama villa (engin upptalning)
  if (u.email_verified !== 1) return _ajson({ ok: false, error: 'unverified' });
  return _ajson({ ok: true, id: u.id }, { 'set-cookie': _sessCookie(await makeSession(env, u.id), 60 * 86400) });
}

export const authLogoutHandler = () => _ajson({ ok: true }, { 'set-cookie': _sessCookie('', 0) });

// 'leikur' = leikstjóra-leyfi — RÁS-leikurinn; Áskell service-vara (sama sub_service-mynstur og kvoti). Sjá leikstjoriOf().
export const _svcOk = (s) => ['utbod', 'frettir', 'fasteign', 'thingskyrslur', 'kvoti', 'leikur'].indexOf(s) >= 0;

const _tierOk = (t) => ['grunnur', 'fyrirtaeki', 'fyrirtaeki_plus'].indexOf(t) >= 0;

async function _uidByKt(env, kt) {   // kt → RAUN-notandi (fyrsta/nýjasta samsvörun kt); 0 ef enginn. Buyer-scoped (fix): tier/sub_service má EKKI accountId-visa (sjá grantSubD1).
  if (!env.TENGSL || !kt || kt.length !== 10) return 0;
  const r = await env.TENGSL.prepare('SELECT id FROM users WHERE kt=? ORDER BY id DESC LIMIT 1').bind(kt).first().catch(() => null);
  return r ? r.id : 0;
}

export async function _acctOfUid(env, rawUid) {
  const n = +rawUid;
  if (!env.TENGSL || !n) return n || 0;
  const r = await env.TENGSL.prepare('SELECT parent_account_id FROM users WHERE id=?').bind(n).first().catch(() => null);
  return accountId({ id: n, parent_account_id: r && r.parent_account_id });
}

async function _refSeen(env, ref) {
  if (!ref) return false;
  return !!(await env.TENGSL.prepare('SELECT ref FROM granted_refs WHERE ref=?').bind(ref).first().catch(() => null));
}

export async function grantSubD1(env, o) {
  if (!env.TENGSL) return;
  if (await _refSeen(env, o.ref)) return;
  const uid = await _uidByKt(env, o.kt);
  if (!uid) return;   // enginn notandi með þessa kt enn (kt sett í checkout → webhook finnur svo)
  const now = Math.floor(Date.now() / 1000);
  if (o.service && _svcOk(o.service)) {
    await env.TENGSL.prepare('INSERT INTO sub_service (user_id, service, until, askell_id, trial_used) VALUES (?,?,?,?,1) ON CONFLICT(user_id, service) DO UPDATE SET until=excluded.until, askell_id=excluded.askell_id, trial_used=1')
      .bind(uid, o.service, o.until, o.askellId || null).run().catch(() => {});
  } else if (o.tier && _tierOk(o.tier)) {
    await env.TENGSL.prepare('UPDATE users SET tier=?, tier_until=?, tier_askell=?, tier_trial_used=1, updated=? WHERE id=?')
      .bind(o.tier, o.until, o.askellId || null, now, uid).run().catch(() => {});
  }
  if (o.ref) await env.TENGSL.prepare('INSERT OR IGNORE INTO granted_refs (ref, created) VALUES (?,?)').bind(o.ref, now).run().catch(() => {});
}

export async function grantReportD1(env, kt, key) {
  const uid = await _uidByKt(env, kt);
  if (!uid) return;
  const gid = await _acctOfUid(env, uid);   // additive skýrslu-grant MÁ deilast með account-inu (öfugt við tier/sub_service)
  await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id, report_key, granted) VALUES (?,?,?)')
    .bind(gid, key, Math.floor(Date.now() / 1000)).run().catch(() => {});
}

export async function trialUsedD1(env, uid, kind, slug) {
  if (!env.TENGSL || !uid) return false;
  if (kind === 'tier') {
    const r = await env.TENGSL.prepare('SELECT tier_trial_used FROM users WHERE id=?').bind(uid).first().catch(() => null);
    return !!(r && r.tier_trial_used);
  }
  const r = await env.TENGSL.prepare('SELECT trial_used FROM sub_service WHERE user_id=? AND service=?').bind(uid, slug).first().catch(() => null);
  return !!(r && r.trial_used);
}

export async function authSaveKtHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const uid = await readSession(env, request);
  if (!uid) return _ajson({ ok: false, error: 'login' });
  const b = (await request.json().catch(() => null)) || {};
  const kt = String(b.kt || '').replace(/\D/g, '');
  if (kt.length !== 10) return _ajson({ ok: false, error: 'input' });
  await env.TENGSL.prepare('UPDATE users SET kt=?, updated=? WHERE id=?').bind(kt, Math.floor(Date.now() / 1000), uid).run().catch(() => {});
  return _ajson({ ok: true });
}

export async function authForgotHandler(request, env, ctx) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: true });
  const b = (await request.json().catch(() => null)) || {};
  const login = String(b.login || b.email || '').trim().toLowerCase().slice(0, 120);
  if (!login) return _ajson({ ok: true });
  // SELECT * (ekki dálkalisti): samningur-dálkurinn (migration 0018) má vanta án þess að ÖLL endurstilling falli.
  const u = await env.TENGSL.prepare('SELECT * FROM users WHERE email=? OR username=?').bind(login, login).first().catch(() => null);
  if (u) {
    const now = Math.floor(Date.now() / 1000);
    const token = _tokenHex();
    // BOÐ: aðgangur sem var stofnaður fyrir starfsmann samningsaðila og hefur ALDREI fengið lykilorð fær
    // boðspóst (eigin texti, hlekkur í viku) í stað „gleymt lykilorð". Sama tókn-tegund og sama
    // /api/auth/reset — lykilorðið velur starfsmaðurinn sjálfur, það fer aldrei um neitt annað.
    const sam = anLykilords(u.pass_hash) ? samningurNotanda(u, now) : null;
    const vistad = await env.TENGSL.prepare('INSERT INTO auth_tokens (token, user_id, kind, expires) VALUES (?,?,?,?)').bind(token, u.id, 'reset', now + (sam ? BOD_GILDI_SEK : 3600)).run().then(() => true, () => false);
    if (sam) {
      // Útkoman í loggann (wrangler tail) svo sending sé staðfestanleg. ⚠ Hvorki tókn, netfang né notandanúmer.
      // Vistaðist tóknið ekki fer enginn póstur: boð með dauðum hlekk er verra en ekkert boð.
      if (!vistad) { console.log('bod villa gagnagrunnur'); return _ajson({ ok: true }); }
      const t = await _emailTpl(env, 'bod');
      const vars = { hlekkur: bodHlekkur(token), nafn: fornafn(u.name) || 'þarna', stofa: sam.stutt };
      ctx.waitUntil(sendGmail(env, { to: u.email, subject: renderEmail(t.subject, vars), html: renderEmail(t.html, vars), replyTo: sam.tengilidur || undefined })
        .then((r) => console.log(r && r.ok ? 'bod sent' : 'bod villa ' + ((r && (r.error || (r.unconfigured && 'unconfigured'))) || '?'))));
    } else {
      const link = 'https://karp.is/endurstilla/?token=' + token;
      const t = await _emailTpl(env, 'reset');
      ctx.waitUntil(sendGmail(env, { to: u.email, subject: renderEmail(t.subject, { hlekkur: link }), html: renderEmail(t.html, { hlekkur: link }) }));
    }
  }
  return _ajson({ ok: true });
}

export async function authResetHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const b = (await request.json().catch(() => null)) || {};
  const token = String(b.token || '').trim().slice(0, 80);
  const pw = String(b.password || '');
  if (!token) return _ajson({ ok: false, error: 'badtoken' });
  if (pw.length < 8) return _ajson({ ok: false, error: 'weakpass' });
  const now = Math.floor(Date.now() / 1000);
  const t = await env.TENGSL.prepare("SELECT token, user_id FROM auth_tokens WHERE token=? AND kind='reset' AND expires>?").bind(token, now).first().catch(() => null);
  if (!t) return _ajson({ ok: false, error: 'badtoken' });
  await env.TENGSL.prepare('UPDATE users SET pass_hash=?, email_verified=1, updated=? WHERE id=?').bind(await hashPassword(pw), now, t.user_id).run().catch(() => {});
  // ⚠ ÖLL endurstillingartókn notandans, ekki aðeins þetta. Boðið býr til vikutókn við hverja beiðni, og eldri
  //   hlekkur (t.d. í áframsendum pósti) gæti annars yfirskrifað nýja lykilorðið í heila viku (rýni 22.9.2026).
  await env.TENGSL.prepare("DELETE FROM auth_tokens WHERE user_id=? AND kind='reset'").bind(t.user_id).run().catch(() => {});
  return _ajson({ ok: true, id: t.user_id }, { 'set-cookie': _sessCookie(await makeSession(env, t.user_id), 60 * 86400) });
}

export async function _sendVerifyEmail(env, userId, email, now) {
  const token = _tokenHex();
  await env.TENGSL.prepare("DELETE FROM auth_tokens WHERE user_id=? AND kind='verify'").bind(userId).run().catch(() => {});
  await env.TENGSL.prepare('INSERT INTO auth_tokens (token, user_id, kind, expires) VALUES (?,?,?,?)').bind(token, userId, 'verify', now + 86400).run().catch(() => {});
  const link = 'https://karp.is/api/auth/verify?token=' + token;
  const t = await _emailTpl(env, 'verify');   // sniðmát stjórnanda (eða sjálfgefið); {{hlekkur}} er skyldu-varin
  return sendGmail(env, { to: email, subject: renderEmail(t.subject, { hlekkur: link }), html: renderEmail(t.html, { hlekkur: link }) });
}

export async function authVerifyHandler(request, env) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim().slice(0, 80);
  if (!token || !env.TENGSL) return new Response(null, { status: 302, headers: { location: '/innskra/?verify=badtoken' } });
  const now = Math.floor(Date.now() / 1000);
  const t = await env.TENGSL.prepare("SELECT token, user_id FROM auth_tokens WHERE token=? AND kind='verify' AND expires>?").bind(token, now).first().catch(() => null);
  if (!t) return new Response(null, { status: 302, headers: { location: '/innskra/?verify=expired' } });
  await env.TENGSL.prepare('UPDATE users SET email_verified=1, updated=? WHERE id=?').bind(now, t.user_id).run().catch(() => {});
  // Tókanum er EKKI eytt við notkun (22.9): póstskannar (t.d. Outlook Safe Links) opna hlekkinn á undan
  // viðtakandanum, og smellur hans sýndi þá „útrunninn" þótt netfangið væri staðfest. Endurnotkun er skaðlaus:
  // tókinn staðfestir aðeins (sama aðgerð aftur) og skráir aðeins inn vafrann sem nýskráði sig. Hann rennur út
  // eftir sólarhring, og nýr staðfestingarpóstur eyðir eldri tókum (_sendVerifyEmail).
  // Lota AÐEINS í vafranum sem nýskráði sig (sjá _nyskraKaka). Sá sem er þegar innskráður sem sami notandi
  // heldur sinni lotu. Allir aðrir fá staðfestinguna en skrá sig inn sjálfir, og lota sem fyrir er helst óbreytt.
  const uid = Number(t.user_id);
  if (await nyskraUid(env, request, now) === uid) {
    const h = new Headers({ location: '/mitt-svaedi/?verified=1' });
    h.append('set-cookie', _sessCookie(await makeSession(env, uid), 60 * 86400));
    h.append('set-cookie', _nyskraCookie('', 0));
    return new Response(null, { status: 302, headers: h });
  }
  if (await readSession(env, request) === uid) return new Response(null, { status: 302, headers: { location: '/mitt-svaedi/?verified=1' } });
  return new Response(null, { status: 302, headers: { location: '/innskra/?verify=ok' } });
}

export async function authResendVerifyHandler(request, env, ctx) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: true });
  const b = (await request.json().catch(() => null)) || {};
  const login = String(b.login || b.email || '').trim().toLowerCase().slice(0, 120);
  if (!login) return _ajson({ ok: true });
  const u = await env.TENGSL.prepare('SELECT id, email, email_verified FROM users WHERE email=? OR username=?').bind(login, login).first().catch(() => null);
  if (u && u.email_verified !== 1) { ctx.waitUntil(_sendVerifyEmail(env, u.id, u.email, Math.floor(Date.now() / 1000))); }
  return _ajson({ ok: true });
}

export const _U_BLOBS = ['leitvakt', 'fastvakt', 'firmavakt', 'utbodvakt', 'verkprofil', 'digest', 'vaktir'];

export const _monthStr = (now) => new Date(now * 1000).toISOString().slice(0, 7);

export const _nextMonth = (now) => { const d = new Date(now * 1000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000); };

const _uTier = (u, now) => (u.tier && u.tier_until && u.tier_until > now) ? u.tier : null;

export const _ktwatchCap = (u, now) => _freeAll(u) ? -1 : ({ fyrirtaeki: 25, fyrirtaeki_plus: 100 }[_uTier(u, now)] || 0);

export const _seatsCap = (u, now) => _freeAll(u) ? -1 : ({ fyrirtaeki: 5, fyrirtaeki_plus: 10 }[_uTier(u, now)] || 1);

export async function _prefGet(env, uid, k, dflt) {
  if (!uid) return dflt;
  const r = await env.TENGSL.prepare('SELECT v FROM user_prefs WHERE user_id=? AND k=?').bind(uid, k).first().catch(() => null);
  if (!r) return dflt;
  try { return JSON.parse(r.v); } catch (e) { return dflt; }
}

export async function accountOwner(env, u) {
  if (!u || !u.parent_account_id) return u;   // eigandi/sjálfstæður → sjálfur sig
  return (await env.TENGSL.prepare('SELECT * FROM users WHERE id=?').bind(u.parent_account_id).first().catch(() => null)) || u;
}

// Leikstjóra-leyfi (RÁS-leikurinn, /api/leikur/create): kerfisstjóri eða frí-aðgangur (_freeAll) EÐA virk
// 'leikur'-þjónustu-áskrift á ACCOUNT-EIGANDANUM (sæta-sameign: meðlimir erfa leyfi eigandans — sama
// SELECT og kvótavaktin/þingskýrslur/fasteign nota). Skilar { leikstjori, source:'admin'|'free'|'service'|null,
// until: epoch-sek úr sub_service eða null }. `u` þarf id, is_admin, free_access, parent_account_id.
export async function leikstjoriOf(env, u, now) {
  const nei = { leikstjori: false, source: null, until: null };
  if (!u) return nei;
  if (u.is_admin === 1) return { leikstjori: true, source: 'admin', until: null };
  if (u.free_access === 1) return { leikstjori: true, source: 'free', until: null };
  if (!env || !env.TENGSL) return nei;
  now = now || Math.floor(Date.now() / 1000);
  const owner = await accountOwner(env, u);
  const s = await env.TENGSL.prepare('SELECT * FROM sub_service WHERE user_id=? AND service=? AND until>?').bind(owner.id, 'leikur', now).first().catch(() => null);
  return s ? { leikstjori: true, source: 'service', until: s.until || null } : nei;
}

export async function _inviteEligible(env, u, ownerId, now) {
  const owner = await env.TENGSL.prepare('SELECT id,email,name,is_admin,tier,tier_until,free_access FROM users WHERE id=?').bind(ownerId).first().catch(() => null);
  if (!owner || owner.id === u.id) return null;
  const ownerActive = _freeAll(owner) || (owner.tier && owner.tier_until > now);
  if (!ownerActive) return null;
  const team = await _prefGet(env, owner.id, 'team', []);
  if (!Array.isArray(team) || team.indexOf((u.email || '').toLowerCase()) < 0) return null;
  const cap = _seatsCap(owner, now);
  const n = (await env.TENGSL.prepare('SELECT COUNT(*) AS n FROM users WHERE parent_account_id=?').bind(owner.id).first().catch(() => ({ n: 0 }))).n || 0;
  if (cap >= 0 && n >= cap) return null;
  return owner;
}

async function _pendingInvite(env, u, now) {
  if (!u || u.parent_account_id) return null;
  const declined = await _prefGet(env, u.id, 'invite_declined', []);
  const rows = (await env.TENGSL.prepare("SELECT user_id FROM user_prefs WHERE k='team'").all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) {
    if (declined.indexOf(r.user_id) >= 0) continue;
    const owner = await _inviteEligible(env, u, r.user_id, now);
    if (owner) return { owner_id: owner.id, owner: owner.name || owner.email };
  }
  return null;
}

export async function _prefSet(env, uid, k, obj) {
  await env.TENGSL.prepare('INSERT INTO user_prefs (user_id,k,v,updated) VALUES (?,?,?,?) ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, updated=excluded.updated')
    .bind(uid, k, JSON.stringify(obj), Math.floor(Date.now() / 1000)).run().catch(() => {});
}

export async function karpUserId(request, env) {
  return await readSession(env, request);
}
