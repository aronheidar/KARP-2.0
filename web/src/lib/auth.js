// auth.js — client-side auth fyrir Astro-appið (karp.is). #2 Á5.
// ---------------------------------------------------------------------------
// Leysir af wp_head-sprautun mælaborðsins: sækir innskráningarstöðu frá WordPress
// GET /me (kross-undirléns með credentials), setur window.KARP_USER (SAMA lögun og
// á karp.is), og býður karpGet/karpPost með X-WP-Nonce.
//
// FORSENDA (þín infra, sjá Deploy-runbook): (1) deploya karp-user.php (GET /me + CORS),
// (2) define('COOKIE_DOMAIN','.karp.is') í wp-config, (3) karp.is undirlén.
// Þar til þetta er komið → /me skilar 404/engri lotu → allt sýnir „útskráð" (brotnar ekki).

// ATH: karp.is (apex, EKKI www) — WP-canonical hýsillinn þar sem innskráningar-kakan lifir.
// Að sækja www hér skilar „útskráð" því kakan (host-only karp.is) berst ekki til www.
import { tierLevelOf, limitsFor, THREP } from '../data/lausnir.js';
const TIER_NAME = { 1: 'Grunnur', 2: 'Fyrirtæki', 3: 'Fyrirtæki+' };

// WP→Cloudflare (F6): períferu notenda-gögn (vaktir/kvóti/samfélag) flutt í karp21-worker + D1
// undir /api/u/*. Sama-uppruna → lotu-kaka berst sjálfkrafa. (Áður: wp.karp.is/wp-json/karp/v1.)
export const KARP_API = '/api/u';

// Undirbýr ALLAR 3 skýrslu-gagnaheimildir í bakgrunni (ársreikningar + eigendur + stjórn) svo
// notandi bíði ekki 3× ef hann skoðar fyrirtækjaskýrslu + endanlega eigendur + áreiðanleika.
// Sækir aðeins það sem VANTAR (404 → dispatch bygging); 24h-cache + endanleg {engin}-ástönd halda.
export function karpWarmReports(kt) {
  const id = String(kt == null ? '' : kt).replace(/\D/g, '');
  if (id.length !== 10) return;
  const warm = (dataPath, reqType) => {
    fetch(dataPath + id + '.json', { cache: 'no-store' })
      .then((r) => { if (r.status === 404) fetch('/api/' + reqType + '/request?kt=' + id, { method: 'POST', credentials: 'include' }).catch(() => {}); })
      .catch(() => {});
  };
  warm('/gogn/arsreikningar/', 'arsreikningur');
  warm('/gogn/eigendur/', 'eigendur');
  warm('/gogn/stjorn/', 'stjorn');
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function setUser(u) { window.KARP_USER = u; return u; }

// Sækir KARP_USER. Fellur mjúkt á { loggedIn:false } ef bakendi/lota vantar.
// Memóað (_userPromise): margar eyjur á sömu síðu deila EINU /me-kalli.
let _userPromise = null;
export function loadUser() {
  if (_userPromise) return _userPromise;
  _userPromise = (async () => {
    try {
      // WP→Cloudflare (F3): /me kemur nú frá karp21-worker (D1), ekki wp.karp.is. Sama-uppruna,
      // svo lotu-kakan (karp_session á .karp.is) berst; sama KARP_USER-lögun og WP skilaði.
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (!r.ok) return setUser({ loggedIn: false, _status: r.status });
      const u = await r.json();
      return setUser(u && typeof u.loggedIn === 'boolean' ? u : { loggedIn: false });
    } catch (e) {
      return setUser({ loggedIn: false, _error: String(e) });
    }
  })();
  return _userPromise;
}

// ── WP→Cloudflare (F3): innskráning/nýskráning/útskráning gegnum karp21-worker (D1) ──
// Sama-uppruna fetch (karp.is/api/auth/*) → lotu-kaka sett/hreinsuð af svarinu. Skila { ok, error }.
export async function karpLogin(login, password) {
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ login, password }) });
    return await r.json().catch(() => ({ ok: false, error: 'net' }));
  } catch (e) { return { ok: false, error: 'net' }; }
}
export async function karpRegister(data) {
  try {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) });
    return await r.json().catch(() => ({ ok: false, error: 'net' }));
  } catch (e) { return { ok: false, error: 'net' }; }
}
export async function karpLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (e) {}
  location.href = 'https://karp.is/';
}
// F5: gleymt-lykilorð. forgot skilar alltaf { ok:true } (engin upptalning); reset setur nýtt lykilorð + skráir inn.
export async function karpForgot(login) {
  try {
    const r = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ login }) });
    return await r.json().catch(() => ({ ok: true }));
  } catch (e) { return { ok: true }; }
}
export async function karpReset(token, password) {
  try {
    const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ token, password }) });
    return await r.json().catch(() => ({ ok: false, error: 'net' }));
  } catch (e) { return { ok: false, error: 'net' }; }
}
// Fersk /me-uppfletting (án cache) — fyrir eftir-checkout poll sem bíður réttinda úr D1 (worker /me).
export async function freshMe() {
  try { return await (await fetch('/api/auth/me', { credentials: 'include' })).json(); } catch (e) { return null; }
}

function authHeaders(extra) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  const n = window.KARP_USER && window.KARP_USER.nonce;
  if (n) h['X-WP-Nonce'] = n; // WP REST cookie-auth CSRF
  return h;
}

// Auðkennd köll — credentials + nonce (eins og karpGet/knPost í mælaborðinu).
export async function karpGet(path) {
  try {
    const r = await fetch(KARP_API + path, { credentials: 'include', headers: authHeaders() });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}
export async function karpPost(path, body) {
  try {
    const r = await fetch(KARP_API + path, {
      method: 'POST', credentials: 'include', headers: authHeaders(), body: JSON.stringify(body || {}),
    });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

// Chip-stílar sprautaðir héðan (ekki úr .astro <style>) því chip-HTML er búið til á
// keyrslutíma → Astro-scoped CSS næði ekki til þess. Þannig virkar chip á HVAÐA síðu sem er.
const CHIP_CSS = '.chip a{text-decoration:none}'
  // LOTA 22: chip-inn helst innan rammans — avatar klemmdur, nafnið á EINNI línu m. ellipsis
  + '.chip{flex-wrap:nowrap!important;min-width:0}'
  + '.kc-in{color:#06121a;background:#f6b13b;padding:5px 12px;border-radius:8px;font-weight:700}'
  + '.kc-reg{color:#cdd6e6;padding:5px 8px}'
  + '.kc-prof{display:flex;align-items:center;gap:7px;color:#eaf1fb;min-width:0;flex:1}'
  + '.kc-av{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:none}'
  + '.kc-ini{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:#1f6feb;color:#fff;font-weight:700;font-size:13px;flex:none}'
  + '.kc-name{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}'
  + '.kc-out{color:#7e8ca6;padding:0 4px;text-decoration:none;flex:none;display:inline-flex;align-items:center}'
  + '.kc-out:hover{color:#f6b13b}';
function injectChipCss() {
  if (typeof document === 'undefined' || document.getElementById('karp-chip-css')) return;
  const s = document.createElement('style');
  s.id = 'karp-chip-css';
  s.textContent = CHIP_CSS;
  document.head.appendChild(s);
}

// Innskráningarslóð sem SKILAR notandanum á síðuna sem hann var á: UM-login
// endurspeglar ?redirect_to= í formið og karp-user.php leyfir karp.is-hýsla
// (allowed_redirect_hosts) svo wp_safe_redirect strípar ekki cross-host slóðina.
export function loginHref(returnTo) {
  const base = ((typeof window !== 'undefined' && window.KARP_USER && window.KARP_USER.loginUrl) || 'https://wp.karp.is/login/');
  const to = returnTo || (typeof location !== 'undefined' ? location.href : 'https://karp.is/');
  return base + (base.indexOf('?') > -1 ? '&' : '?') + 'redirect_to=' + encodeURIComponent(to);
}

// Innskráningar-chip fyrir appbarinn (útskráð: Skrá inn/Nýskrá — innskráð: nafn + útskrá).
export function renderChip(el, u) {
  injectChipCss();
  u = u || window.KARP_USER || { loggedIn: false };
  const site = 'https://wp.karp.is'; // innskráningarsíðurnar búa á WP (Leið A)
  if (u.loggedIn) {
    const av = u.avatar ? `<img class="kc-av" src="${esc(u.avatar)}" alt="" width="26" height="26">`
                        : `<span class="kc-av kc-ini">${esc((u.name || '?').charAt(0))}</span>`;
    el.innerHTML =
      `<a class="kc-prof" href="/mitt-svaedi/">${av}<span class="kc-name">${esc(u.name || '')}</span></a>`
      + `<a class="kc-out" href="#" onclick="event.preventDefault();window.karpAuth.karpLogout()" title="Skrá út" aria-label="Skrá út"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></a>`;
  } else {
    el.innerHTML =
      `<a class="kc-in" href="${esc(loginHref())}">Skrá inn</a>`
      + `<a class="kc-reg" href="${esc(u.registerUrl || site + '/nyskraning/')}">Nýskrá</a>`;
  }
}

// Þægindi: sækja notanda + teikna chip í einu.
export async function mountChip(el) {
  renderChip(el, { loggedIn: false }); // strax útskráð svo ekkert hopp
  renderChip(el, await loadUser());
}

// ── Karp+ aðgangur / entitlement (LOTA 94) ──────────────────────────────────
// KARP_USER-svið frá WordPress (karp-user.php): isAdmin (allt frítt), plus (áskrifandi/í
// fríprófun), paywall (bool: eru greiðsluveggir VIRKIR — SLÖKKT sjálfgefið svo ekkert brotni
// fyrir launch; kveikt af Aroni þegar billing er tilbúið), reports (fylki lykla keyptra skýrslna).
const _u = () => (typeof window !== 'undefined' && window.KARP_USER) || {};
export function isAdmin() { return _u().isAdmin === true; }
export function isPlus() { const u = _u(); return u.isAdmin === true || u.plus === true; }
// Er efni læst fyrir ÞENNAN notanda? AÐEINS ef greiðsluveggir eru virkir OG notandi er ekki áskrifandi/admin.
export function locked() { return _u().paywall === true && !isPlus(); }
// Hefur notandinn keypt (eða admin) þessa skýrslu? key = t.d. 'fasteign:<pn>' eða 'fyrirtaeki:<kt>'.
export function hasReport(key) { const u = _u(); return isAdmin() || (Array.isArray(u.reports) && u.reports.indexOf(key) !== -1); }

// Þrep-áskrift (Verk B): eitt þrep per notandi (u.tier ∈ grunnur|fyrirtaeki|fyrirtaeki_plus), stigveldi.
// hasTier(min) = notandi (eða admin) hefur a.m.k. þrep-stig `min` (1|2|3). lockedTier = veggur virkur OG ekki nógu hátt þrep.
// tierLevel notar VIRKT þrep (effectiveTier úr /me) svo teymis-meðlimir erfi þrep eiganda.
export function tierLevel(u) { u = u || _u(); return tierLevelOf(u.effectiveTier || u.tier, u.isAdmin === true); }
export function hasTier(min) { return tierLevel() >= min; }
export function lockedTier(min) { return _u().paywall === true && !hasTier(min); }

// Sér þjónustu-áskrift (t.d. 'utbod' = Útboðsvaktin 1.900 kr./mán.) — óháð þrepunum.
// karp-user.php skilar u.subs = ['utbod',…] þegar karp_sub_<svc>_until er í framtíð.
export function hasSub(svc) { const u = _u(); return isAdmin() || (Array.isArray(u.subs) && u.subs.indexOf(svc) !== -1); }

// ── Mörk, kvóti, teymi (LOTA: áskriftar-enforcement) ────────────────────────
// limits() = mörk virka þrepsins (reportsMonth/follows/ktWatch/seats/fjolmidlavakt). Server sendir
// u.limits í /me; föllum á client-töfluna ef vantar. reportsRemaining/-Used koma frá server.
export function limits() { const u = _u(); return u.limits || limitsFor(u.effectiveTier || u.tier, u.isAdmin === true); }
export function reportsRemaining() { const u = _u(); return typeof u.reportsRemaining === 'number' ? u.reportsRemaining : 0; }
export function followsCount() { return Number(_u().followsCount || 0); }
// Fasteignamata-kvóti (sér-áskrift 'fasteign'): fjöldi eftir í mánuðinum. -1 = ótakmarkað (admin), 0 = ekki áskrifandi.
export function fasteignRemaining() { const u = _u(); return typeof u.fasteignRemaining === 'number' ? u.fasteignRemaining : 0; }
export function fasteignResets() { const u = _u(); return Number(u.fasteignResets || 0); }
// Kvóti (20 áskrifandi / -1 admin / 0 ekki-áskrifandi) — undefined ef server hefur EKKI skilað (WP óuppfært).
// Notað til að fela teljarann þar til raun-gögn liggja fyrir (annars sýndi hann ranglega „0" í millibili).
export function fasteignQuotaKnown() { return typeof _u().fasteignQuota === 'number'; }
// Meta eign með kvóta: á/kvóti → granted (eyðir 1, endurmat sama heimilisfangs í mán frítt), annars needPay (990).
// Skilar { granted, remaining } | { owned } | { needPay, resets } | { nosub } | { error }. Uppfærir u.fasteignRemaining.
export async function metaValuation(key) {
  const r = await karpPost('/fasteign/meta', { key });
  if (!r) return { error: true };
  if (r.granted) { const u = _u(); if (typeof r.remaining === 'number') u.fasteignRemaining = r.remaining; return { granted: true, owned: !!r.owned, remaining: r.remaining }; }
  if (r.needPay) return { needPay: true, resets: r.resets || 0 };
  if (r.error === 'nosub') return { nosub: true };
  return { error: true };
}

// Opna skýrslu með kvóta: á/kvóti → grant (skýrsla opnast), annars needPay (990 kr). Server-hlið teljari.
// Skilar { owned } | { granted, remaining } | { needPay } | { error }.
export async function openReport(key, title) {
  const u = _u();
  if (isAdmin() || hasReport(key)) return { owned: true };
  if (!u.loggedIn) return { needLogin: true };
  const r = await karpPost('/reports/open', { key, title });
  if (!r) return { error: true };
  if (r.owned) return { owned: true };
  if (r.granted) { if (Array.isArray(u.reports)) u.reports.push(key); if (typeof r.remaining === 'number') u.reportsRemaining = r.remaining; return { granted: true, remaining: r.remaining }; }
  if (r.needPay) { u.reportsRemaining = 0; return { needPay: true }; }   // kvóti búinn → teljari sýni „fullnýttur" við endurmálun
  return { error: true };
}

// Þingmannaskýrslu-kvóti (sér-áskrift 'thingskyrslur' 3.900 kr/mán): 20 skýrslur/mán innifaldar.
// -1 = ótakmarkað (admin), 0 = ekki áskrifandi. Speglar fasteign-hjálparana.
export function thingRemaining() { const u = _u(); return typeof u.thingRemaining === 'number' ? u.thingRemaining : 0; }
export function thingQuotaKnown() { return typeof _u().thingQuota === 'number'; }
export function thingResets() { const u = _u(); return Number(u.thingResets || 0); }
// Opna þingmannaskýrslu með áskriftar-kvóta: á/kvóti → varanlegt grant (hasReport verður satt).
// Skilar { owned } | { granted, remaining } | { needPay, resets } | { nosub } | { needLogin } | { error }.
export async function openThingReport(key, title) {
  const u = _u();
  if (isAdmin() || hasReport(key)) return { owned: true };
  if (!u.loggedIn) return { needLogin: true };
  const r = await karpPost('/thing/open', { key, title });
  if (!r) return { error: true };
  if (r.owned) return { owned: true };
  if (r.granted) { if (Array.isArray(u.reports)) u.reports.push(key); if (typeof r.remaining === 'number') u.thingRemaining = r.remaining; return { granted: true, remaining: r.remaining }; }
  if (r.needPay) { u.thingRemaining = 0; return { needPay: true, resets: r.resets || 0 }; }
  if (r.error === 'nosub') return { nosub: true };
  return { error: true };
}

// ── Skýrslu-kvóti (þrep-áskrift): teljari + upsell við kauphnappana ──────────
// Speglar fasteign-teljarann (#fvm-quota/paintQuota): „N skýrslur eftir í mánuðinum" (gult ≤2/0)
// + „⬆ Uppfærðu í <næsta þrep>"-hlekkur fyrir grunnur/fyrirtæki. Falið þar til /me skilar raun-kvóta
// (reportsQuotaKnown) svo hann sýni ekki ranglega „0" meðan WP-entitlement er óuppfært.
export function reportsQuotaKnown() { return typeof _u().reportsRemaining === 'number'; }

// Næsta þrep fyrir ofan virkt þrep notandans (til upsell „fleiri skýrslur"). Skilar þrep-hlut úr THREP
// ({slug,heiti,verd,adgangar}) eða null (admin / efsta þrep Fyrirtæki+ / ekki-þrep-áskrifandi).
export function nextTierUp() {
  if (isAdmin()) return null;
  const lvl = tierLevel();                 // 1=grunnur, 2=fyrirtaeki, 3=fyrirtaeki_plus
  if (lvl < 1 || lvl >= 3) return null;    // aðeins grunnur/fyrirtæki fá upsell (Fyrirtæki+ er efst)
  return THREP[lvl] || null;               // THREP[1]=Fyrirtæki (næst á eftir Grunni), THREP[2]=Fyrirtæki+
}

const RQ_CSS = '.krq{font-size:12.5px;color:#8fa0b8;margin:9px 0 2px;display:flex;flex-wrap:wrap;align-items:center;gap:3px 10px;line-height:1.5}'
  + '.krq b{color:#cdd6e6;font-weight:700}'
  + '.krq-low b{color:#f6b13b}'
  + '.krq.krq-zero{color:#f6b13b}'
  + '.krq-up{color:#f6b13b;text-decoration:none;font-weight:600;white-space:nowrap}'
  + '.krq-up:hover{text-decoration:underline}';
function injectReportQuotaCss() { if (typeof document === 'undefined' || document.getElementById('karp-rquota-css')) return; const s = document.createElement('style'); s.id = 'karp-rquota-css'; s.textContent = RQ_CSS; document.head.appendChild(s); }

// HTML fyrir teljarann (+upsell). '' ef ekki á við (admin / ekki-áskrifandi / óþekktur kvóti → aðeins 990-leiðin sýnileg).
export function reportQuotaNoteHtml() {
  if (isAdmin() || !hasTier(1) || !reportsQuotaKnown()) return '';
  const rem = reportsRemaining();
  const cls = 'krq' + (rem === 0 ? ' krq-zero' : (rem <= 2 ? ' krq-low' : ''));
  const txt = rem === 0
    ? '⚠ Mánaðarkvóti skýrslna fullnýttur — næsta skýrsla á 990 kr'
    : '<b>' + rem + '</b> ' + (rem === 1 ? 'skýrsla' : 'skýrslur') + ' eftir í mánuðinum';
  const nt = nextTierUp();
  const up = nt ? ' <a class="krq-up" href="/karp-pro/#verd">⬆ Uppfærðu í ' + esc(nt.heiti) + ' fyrir fleiri skýrslur →</a>' : '';
  return '<div class="' + cls + '">' + txt + up + '</div>';
}

// Setur/uppfærir teljarann beint á eftir kauphnappa-röðinni (afterEl). Fjarlægir hann ef ekki á við — svo hann
// falli líka rétt út þegar /me skilar ekki kvóta (WP óuppfært) eða áskrift rennur út.
export function paintReportQuota(afterEl) {
  if (!afterEl || typeof document === 'undefined') return;
  injectReportQuotaCss();
  const sib = afterEl.nextElementSibling;
  if (sib && sib.classList && sib.classList.contains('krq')) sib.remove();
  const html = reportQuotaNoteHtml();
  if (html) afterEl.insertAdjacentHTML('afterend', html);
}

// Viðskiptamannavakt (kt-listi) + Teymi/seats — notað af Stillingum á Mitt svæði.
export async function ktWatchList() { return (await karpGet('/ktwatch')) || { kt: [], cap: 0 }; }
export async function ktWatchSet(kt, action) { return (await karpPost('/ktwatch', { kt, action })) || { ok: false }; }
export async function teamList() { return (await karpGet('/team')) || { members: [], cap: 0 }; }
export async function teamSet(email, action) { return (await karpPost('/team', { email, action })) || { ok: false }; }

// Stök skýrsla um ÁSKELL V1 (einskiptisgreiðsla, innfellt kortaform á síðunni). Skilar 'embedded',
// 'unconfigured' (→ kallandi fellur á Teya) eða 'error'. V2 embedded checkout selur EKKI staka
// einskiptisvöru (sannað 11.7) — því V1: kt-innsláttur → /sub/subscribe {service:'stak', kt} →
// POST /api/stak/checkout → kortaform Áskell í IFRAME (3DS innifalið) → pollum /api/stak/confirm
// (workerinn tengir kort + rukkar 990 + veitir skýrsluna á WP) → reload þegar skýrslan er komin.
export async function karpStakAskell({ key, ref, gateEl }) {
  if (!gateEl) return 'unconfigured';
  try {
    const probe = await (await fetch('/api/stak/checkout', { credentials: 'include' })).json();
    if (!probe || !probe.ok) return 'unconfigured';   // Áskell-lykill/færsluhirðir ekki til staðar → Teya
  } catch (e) { return 'unconfigured'; }
  injectGateCss();   // hnappurinn getur staðið utan gátta (kaupraðir/tækjastikur) þar sem gátt-CSS vantar
  const old = gateEl.querySelector('.stak-holf'); if (old) old.remove();   // endursmellur → ekki tvöfaldur gluggi
  const holf = document.createElement('div');
  holf.className = 'stak-holf';
  holf.style.flex = '1 1 100%';   // í flex-röð (kaupröð/tækjastika) fer glugginn í heila línu fyrir neðan
  gateEl.appendChild(holf);
  holf.innerHTML = '<div class="stak-body"><div class="pg-btns" style="margin-top:10px"><input type="text" class="sg-kt" id="stak-kt" placeholder="Kennitala" maxlength="11" inputmode="numeric" autocomplete="off" />'
    + '<button class="pg-main" id="stak-go" type="button">Greiða — opna kortaglugga →</button></div></div><div class="sg-err" id="stak-err" hidden></div>';
  const body = holf.querySelector('.stak-body');   // err-reiturinn lifir utan body → villur sjást líka eftir að iframe tekur við
  const err = holf.querySelector('#stak-err');
  const fail = (m) => { err.hidden = false; err.innerHTML = esc(m) + ' Eða ' + helpA() + '.'; };
  holf.querySelector('#stak-go').onclick = async () => {
    const kt = String(holf.querySelector('#stak-kt').value || '').replace(/\D/g, '');
    if (kt.length !== 10) return fail('Sláðu inn gilda kennitölu.');
    const u = _u();
    if (!u.loggedIn) { location.href = loginHref(); return; }   // skýrslan vistast á Mitt svæði → innskráning skilyrði
    const gb = holf.querySelector('#stak-go'); gb.disabled = true; gb.textContent = 'Opna greiðslu…'; err.hidden = true;
    try {
      await fetch('/api/auth/kt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ kt }) }).catch(() => {});   // F4: vistar kt í D1 → webhook grant-samsvörun
      const d = await (await fetch('/api/stak/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ key, kt, email: u.email || '', nafn: u.name || '' }) })).json();
      if (!d || !d.checkout_url || !d.token) throw new Error('nocheckout');
      body.innerHTML = '<iframe class="sg-frame" src="' + esc(d.checkout_url) + '" allow="payment"></iframe>'
        + '<div class="pg-note">Kortagreiðsla á öruggu formi Áskell. Athugið: staðfestingarbeiðnin í símanum (3D Secure) sýnir <b>0 kr</b> — hún staðfestir aðeins kortið; 990 kr gjaldið er tekið strax í kjölfarið og skýrslan opnast sjálfkrafa hér. Ekki loka síðunni fyrr en staðfesting birtist.</div>';
      // Pollum confirm: workerinn tengir kortið um leið og forminu er lokið, rukkar og VEITIR skýrsluna
      // server-hlið — svo /me-poll þar til hún birtist → reload (skýrslan opnast fyrst, aldrei gáttin).
      let busy = false, lokid = false;
      const hreinsa = () => { lokid = true; clearInterval(t); clearTimeout(tak); window.removeEventListener('message', hint); };
      const poll = async () => {
        if (busy || lokid) return; busy = true;
        let s = null;
        try { s = await (await fetch('/api/stak/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ token: d.token, key, kt }) })).json(); } catch (e) {}
        busy = false;
        if (lokid || !s) return;
        if (s.state === 'settled') {
          hreinsa();
          body.innerHTML = '<div class="pg-note">✅ Greiðsla móttekin — opna skýrsluna þína…</div>';
          let m = 0;
          const t2 = setInterval(async () => {
            const u2 = await freshMe().catch(() => null);
            const has = u2 && Array.isArray(u2.reports) && u2.reports.some((r) => (r && (r.key || r)) === key);
            if (has || ++m > 8) { clearInterval(t2); location.reload(); }   // grant er samstundis → örstutt bið
          }, 2500);
        } else if (s.state === 'failed' || s.error === 'mismatch' || s.error === 'login' || s.error === 'input' || s.error === 'unconfigured') {
          // aðeins ENDANLEGAR villur stöðva — tímabundnar (upstream/payment/net) polla áfram,
          // enda finnur workerinn þegar-stofnaða greiðslu aftur á reference (engin tvírukkun)
          hreinsa();
          body.innerHTML = '';
          fail(s.state === 'failed' ? 'Greiðslan tókst ekki — reyndu aftur eða notaðu annað kort.' : 'Villa kom upp í greiðslu — reyndu aftur.');
        }
      };
      const t = setInterval(poll, 3000);
      const hint = (e) => { if (e && e.origin === 'https://askell.is') poll(); };   // checkout tilkynnir foreldrasíðu → flýtileið
      window.addEventListener('message', hint);
      const tak = setTimeout(() => {   // þak 12 mín á kortainnslátt — aldrei þegja (greiðsla gæti hafa tekist)
        hreinsa();
        body.innerHTML = '<div class="pg-note">Tíminn rann út án staðfestingar. Ef þú kláraðir greiðsluna skaltu endurhlaða — skýrslan birtist þá á síðunni og á Mitt svæði.</div>'
          + '<div class="pg-btns" style="margin-top:8px"><button class="pg-main" type="button" onclick="location.reload()">Endurhlaða síðuna</button></div>';
      }, 12 * 60 * 1000);
    } catch (e) { gb.disabled = false; gb.textContent = 'Greiða — opna kortaglugga →'; fail('Ekki tókst að opna greiðslu — reyndu aftur.'); }
  };
  return 'embedded';
}
// Hefja greiðslu (Teya SecurePay, LOTA 97). Worker undirritar pöntun og skilar { action, fields };
// við byggjum falið form og POST-um → kaupandi fer á hýstu greiðslusíðu Teya. Skilar 'redirected'
// ef sent var af stað, annars villukóða ('unconfigured'|'free'|'error') svo kallandi geti fallið á prentleið.
export async function karpCheckout(body, gateEl) {
  // Áskell fyrst (greitt Á síðunni, engin redirect) þegar gátt-element fylgir og stak-rásin er sett upp;
  // annars/á meðan fellur allt sjálfkrafa á Teya SecurePay (hýst greiðslusíða).
  if (gateEl && body && body.key) {
    const emb = await karpStakAskell({ key: body.key, ref: body.ref, gateEl });
    if (emb === 'embedded') return 'embedded';
  }
  try {
    const r = await fetch('/api/pay/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => null);
    if (d && d.ok && d.action && d.fields) {
      const f = document.createElement('form');
      f.method = 'POST'; f.action = d.action; f.style.display = 'none';
      for (const k in d.fields) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = d.fields[k]; f.appendChild(i); }
      document.body.appendChild(f); f.submit();
      return 'redirected';
    }
    if (d && d.error === 'login') { location.href = loginHref(); return 'redirected'; }   // kaup krefjast innskráningar (vistast á Mitt svæði)
    return (d && d.error) ? d.error : 'error';
  } catch (e) { return 'error'; }
}

const GATE_CSS = '.plus-gate{max-width:520px;margin:24px auto;background:rgba(246,177,59,.06);border:1px solid rgba(246,177,59,.35);border-radius:16px;padding:24px 26px;text-align:center}'
  + '.pg-badge{display:inline-block;background:#f6b13b;color:#131a29;font-weight:800;font-size:12px;letter-spacing:.05em;padding:4px 12px;border-radius:999px}'
  + '.pg-h{font-size:21px;color:#eaf1fb;margin:12px 0 6px}.pg-b{color:#cdd6e6;font-size:14px;line-height:1.55;margin:0 0 16px}'
  + '.pg-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}'
  + '.pg-main{background:#f6b13b;color:#131a29;font-weight:800;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:11px;border:0;cursor:pointer}'
  + '.pg-sec{border:1px solid rgba(255,255,255,.2);color:#cdd6e6;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:11px}'
  + '.pg-note{color:#8fa0b8;font-size:12px;margin-top:12px}'
  + '.sg-kt{padding:11px 14px;border:1px solid rgba(255,255,255,.2);border-radius:11px;background:rgba(255,255,255,.05);color:#eaf1fb;font:inherit;font-size:14px;width:200px;text-align:center;letter-spacing:.06em}'
  + '.sg-kt:focus{outline:none;border-color:#f6b13b}'
  + '.sg-err{color:#ff8a8a;font-size:12.5px;margin-top:10px}'
  + '.sg-err a.pg-help,.pg-note a.pg-help{color:#f6b13b;text-decoration:none}'
  + '.sg-checkout{margin-top:14px;text-align:left;min-height:60px}'
  + '.sg-frame{width:100%;min-height:540px;border:0;border-radius:12px;background:#fff;margin-top:12px}';
function injectGateCss() { if (typeof document === 'undefined' || document.getElementById('karp-gate-css')) return; const s = document.createElement('style'); s.id = 'karp-gate-css'; s.textContent = GATE_CSS; document.head.appendChild(s); }

// „Fáðu aðstoð"-hlekkur á /hjalp/ (ticket-formið) — ?fra= forvelur flokk þar.
const helpA = (txt, fra) => '<a class="pg-help" href="/hjalp/?fra=' + (fra || 'greidsla') + '">' + (txt || 'fáðu aðstoð') + '</a>';
// Setur „fáðu aðstoð"-nótu undir hnapp/reit þegar greiðsluleið klikkar („reyndu aftur"-staðirnir).
// Notað hér og af karpCheckout-köllurunum (fyrirtaeki/fasteignavakt/ubo-report).
export function helpNote(el, fra) {
  if (!el || typeof document === 'undefined') return;
  injectGateCss();
  let n = el.nextElementSibling;
  if (!n || !n.classList || !n.classList.contains('sg-err')) { n = document.createElement('div'); n.className = 'sg-err'; el.after(n); }
  n.innerHTML = 'Gengur ekki? ' + helpA('Fáðu aðstoð', fra) + ' — við svörum á netfangið þitt.';
}

// Teiknar Karp+ gátt-teaser inn í el (t.d. í stað læsts efnis). Innskráð → „Prófa frítt í mánuð"
// (POST /plus/trial → reload); útskráð → innskráning (1 mánuður frír eftir á).
export function plusGate(el, opts) {
  if (!el) return; injectGateCss(); opts = opts || {};
  const u = _u();
  el.innerHTML = '<div class="plus-gate"><div class="pg-badge">⭐ Karp+</div>'
    + '<h2 class="pg-h">' + esc(opts.title || 'Þetta er hluti af Karp+') + '</h2>'
    + '<p class="pg-b">' + esc(opts.blurb || '') + '</p>'
    + '<div class="pg-btns">'
    + (u.loggedIn ? '<button class="pg-main" id="pg-trial" type="button">Prófa frítt í mánuð</button>' : '<a class="pg-main" href="' + esc(loginHref()) + '">Skráðu þig inn — 1 mánuður frír</a>')
    + '<a class="pg-sec" href="/karp-pro/">Sjá Karp+</a></div>'
    + '<div class="pg-note">Ókeypis fyrsta mánuðinn' + (opts.price ? ', svo ' + esc(opts.price) : '') + '. Hættu hvenær sem er. · ' + helpA('Þarftu aðstoð?') + '</div></div>';
  const t = el.querySelector('#pg-trial');
  if (t) t.onclick = async () => { t.disabled = true; t.textContent = 'Virkja…'; const r = await karpPost('/plus/trial', {}); if (r && r.ok) location.reload(); else { t.disabled = false; t.textContent = 'Náði ekki — reyndu aftur'; helpNote(t); } };
}

// Þrep-gátt (Verk B): teaser þegar efni krefst hærra þreps. Trektar á /karp-pro/ (þar sem VerdTafla sér um checkout).
export function tierGate(el, opts) {
  if (!el) return; injectGateCss(); opts = opts || {};
  const need = TIER_NAME[opts.minTier] || 'Karp+'; const u = _u();
  el.innerHTML = '<div class="plus-gate"><div class="pg-badge">⭐ ' + esc(need) + '-þrep</div>'
    + '<h2 class="pg-h">' + esc(opts.title || 'Hluti af Karp+') + '</h2>'
    + '<p class="pg-b">' + esc(opts.blurb || '') + '</p>'
    + '<div class="pg-btns"><a class="pg-main" href="/karp-pro/#verd">Sjá þrep & verð</a>'
    + (u.loggedIn ? '' : '<a class="pg-sec" href="' + esc(loginHref()) + '">Skrá inn</a>')
    + '</div><div class="pg-note">Innifalið í ' + esc(need) + '-þrepi Karp+. Fyrsti mánuður frír. · ' + helpA('Þarftu aðstoð?') + '</div></div>';
}

// Þjónustu-gátt: efni sem fæst annaðhvort með sér-áskrift (opts.service + opts.price kr./mán. um Áskell)
// EÐA er innifalið í Karp+ þrepi. Innskráð → embedded checkout beint í gáttinni; útskráð → innskráning.
export function subGate(el, opts) {
  if (!el) return; injectGateCss(); opts = opts || {};
  const u = _u();
  const verd = (opts.price || 0).toLocaleString('is-IS') + ' kr./mán.';
  const trial = opts.trialDays > 0;
  const cta = trial ? 'Prófa frítt í ' + opts.trialDays + ' daga' : 'Gerast áskrifandi — ' + verd;
  const badge = trial ? '🎁 ' + opts.trialDays + ' daga frítt' : '⭐ ' + (opts.title || 'Karp+');
  el.innerHTML = '<div class="plus-gate"><div class="pg-badge">' + esc(badge) + '</div>'
    + '<h2 class="pg-h">' + esc(opts.title || 'Hluti af Karp+') + '</h2>'
    + '<p class="pg-b">' + esc(opts.blurb || '') + '</p>'
    + '<div class="pg-btns">'
    + (u.loggedIn ? '<button class="pg-main" id="sg-sub" type="button">' + esc(cta) + '</button>' : '<a class="pg-main" href="' + esc(loginHref()) + '">Skrá inn til að ' + (trial ? 'prófa frítt' : 'gerast áskrifandi') + '</a>')
    + '</div>'
    + '<div class="pg-note">' + (trial ? '<b style="color:#6ee7b7">Fyrstu ' + opts.trialDays + ' dagana fría</b>, svo ' + esc(verd) : 'Áskrift á ' + esc(verd)) + '. Engin binding, segðu upp hvenær sem er. · ' + helpA('Þarftu aðstoð?') + '</div></div>';
  const b = el.querySelector('#sg-sub');
  if (b) b.onclick = () => karpAskellSubscribe(opts.service, el.querySelector('.plus-gate') || el);
}
// Áskell v2 embedded checkout (LOTA 110). Safnar kt (tengir Áskell-viðskiptavin við Karp-notanda um
// karp_kt) → worker /api/sub/checkout-session stofnar lotu → askell.js widget rendrar kort+3DS á karp.is.
// Aðgangur opnast við vefkrók (subscription_contract → /sub/grant), EKKI aðeins onSuccess (staðfest server-hlið).
let _askellP = null;
function loadAskellJs() {
  if (_askellP) return _askellP;
  _askellP = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Askell && window.Askell.mountCheckout) return resolve();
    const s = document.createElement('script'); s.src = 'https://cdn.askell.is/js/dist/askell.js'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('askell.js'));
    document.head.appendChild(s);
  });
  return _askellP;
}
// Sameiginlegt V1-áskriftar-iframe flæði (þrep + þjónustur). container = element þar sem kt-form + iframe birtast.
// kt → /sub/subscribe (vistar karp_kt) → /api/sub2/checkout (kort-iframe, sama og stök) → poll /api/sub2/confirm
// (worker tengir kort, stofnar+virkjar V2-samning, VEITIR aðgang STRAX server-megin) → poll /me → reload.
// Enginn Áskell-widget → ekkert „Upplýsingarnar þínar"-form, enginn „already exists"-galli, engin vefkróks-bið.
async function karpSubIframe(container, opts) {
  const slug = opts.slug, kind = opts.kind, u = _u();
  injectGateCss();
  container.innerHTML = '<div class="pg-btns" style="margin-top:10px"><input type="text" class="sg-kt" id="s2-kt" placeholder="Kennitala" maxlength="11" inputmode="numeric" autocomplete="off" />'
    + '<button class="pg-main" id="s2-go" type="button">Greiða — opna kortaglugga →</button></div><div class="s2-body"></div><div class="sg-err" id="s2-err" hidden></div>';
  const body = container.querySelector('.s2-body'), err = container.querySelector('#s2-err'), ktIn = container.querySelector('#s2-kt');
  if (ktIn) ktIn.focus();
  const fail = (m) => { err.hidden = false; err.innerHTML = esc(m) + ' Eða ' + helpA() + '.'; };
  const doneHas = (u2) => kind === 'tier' ? (u2 && (u2.tier === slug || u2.effectiveTier === slug)) : (u2 && Array.isArray(u2.subs) && u2.subs.indexOf(slug) >= 0);
  const btns = () => container.querySelector('.pg-btns');
  container.querySelector('#s2-go').onclick = async () => {
    const kt = String(ktIn.value || '').replace(/\D/g, '');
    if (kt.length !== 10) return fail('Sláðu inn gilda 10 stafa kennitölu.');
    const gb = container.querySelector('#s2-go'); gb.disabled = true; gb.textContent = 'Opna greiðslu…'; err.hidden = true;
    try {
      await fetch('/api/auth/kt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ kt }) }).catch(() => {});   // F4: vistar kt í D1 → webhook grant
      const d = await (await fetch('/api/sub2/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ slug, kt, email: u.email || '', nafn: u.name || '' }) })).json();
      if (!d || !d.checkout_url || !d.token) throw new Error(d && d.error === 'trial_used' ? 'Þú hefur þegar nýtt frípróf á þessari vöru. Hafðu samband við hjalp@karp.is til að gerast áskrifandi.' : (d && d.error === 'unconfigured' ? 'Áskrift ekki virkjuð enn — reyndu síðar.' : (d && d.error === 'noprice' ? 'Verð fannst ekki — hafðu samband.' : 'nocheckout')));
      btns().style.display = 'none';
      body.innerHTML = '<iframe class="sg-frame" src="' + esc(d.checkout_url) + '" allow="payment"></iframe>'
        + '<div class="pg-note">Kortagreiðsla á öruggu formi Áskell. 3D Secure staðfestir kortið (sýnir 0 kr) — ekkert er rukkað strax ef prufa fylgir. Ekki loka síðunni fyrr en staðfesting birtist.</div>';
      let busy = false, lokid = false;
      const hreinsa = () => { lokid = true; clearInterval(t); clearTimeout(tak); window.removeEventListener('message', hint); };
      const poll = async () => {
        if (busy || lokid) return; busy = true;
        let s = null;
        try { s = await (await fetch('/api/sub2/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ slug, kt, token: d.token }) })).json(); } catch (e) {}
        busy = false;
        if (lokid || !s) return;
        if (s.state === 'active') {
          hreinsa();
          body.innerHTML = '<div class="pg-note">✅ Áskrift virk — opna aðganginn þinn…</div>';
          let m = 0;
          const t2 = setInterval(async () => { const u2 = await freshMe().catch(() => null); if (doneHas(u2) || ++m > 8) { clearInterval(t2); location.reload(); } }, 2500);
        } else if (s.state === 'failed' || s.error === 'contract' || s.error === 'noprice' || s.error === 'login' || s.error === 'input' || s.error === 'unconfigured') {
          // endanlegar villur stöðva — tímabundnar (upstream/net) polla áfram (worker endurnýtir samninginn)
          hreinsa(); body.innerHTML = ''; btns().style.display = ''; gb.disabled = false; gb.textContent = 'Greiða — opna kortaglugga →';
          fail(s.state === 'failed' ? 'Greiðslan tókst ekki — reyndu aftur eða notaðu annað kort.' : 'Villa kom upp — reyndu aftur.');
        }
      };
      const t = setInterval(poll, 3000);
      const hint = (e) => { if (e && e.origin === 'https://askell.is') poll(); };
      window.addEventListener('message', hint);
      const tak = setTimeout(() => { hreinsa(); body.innerHTML = '<div class="pg-note">Tíminn rann út án staðfestingar. Ef þú kláraðir greiðsluna skaltu endurhlaða — áskriftin birtist þá.</div><div class="pg-btns" style="margin-top:8px"><button class="pg-main" type="button" onclick="location.reload()">Endurhlaða síðuna</button></div>'; }, 12 * 60 * 1000);
    } catch (e) {
      const gb2 = container.querySelector('#s2-go'); if (gb2) { gb2.disabled = false; gb2.textContent = 'Greiða — opna kortaglugga →'; }
      fail(e && typeof e.message === 'string' && e.message.length < 60 ? e.message : 'Ekki tókst að opna greiðslu — reyndu aftur.');
    }
  };
}
export async function karpAskellSubscribe(service, gateEl) {
  const u = _u();
  if (!u.loggedIn) { location.href = loginHref(); return; }
  const btns = gateEl.querySelector('.pg-btns'); if (!btns) return;
  const box = document.createElement('div'); btns.replaceWith(box);   // V1 iframe-flæði í stað widget
  await karpSubIframe(box, { slug: service, kind: 'service' });
}
// Hefja áskrift. ENDANLEGT: recurring checkout (kort geymt + Teya boðgreiðslur/RPG-tóki) — BÍÐUR Teya-svars
// + worker-mergs. BRÁÐABIRGÐA: fríprófun (án korts) svo flæðið sé prófanlegt fyrir launch.
export async function karpSubscribe(service, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Virkja…'; }
  const r = await karpPost('/sub/trial', { service });
  if (r && r.ok) { location.reload(); return true; }
  if (btn) { btn.disabled = false; btn.textContent = 'Náði ekki — reyndu aftur'; helpNote(btn); }
  return false;
}

// Þrep-áskrift (Verk B): V1 iframe-flæði fyrir valið þrep (sama og þjónustur — karpSubIframe).
export async function karpSubscribeTier({ slug, nafn, btn }) {
  const u = _u();
  if (!u.loggedIn) { location.href = loginHref(); return; }
  injectGateCss();
  const host = btn && btn.closest ? (btn.closest('th') || btn.parentElement) : null;
  const box = document.createElement('div'); box.className = 'sg-checkout'; box.style.marginTop = '10px';
  if (host) { host.appendChild(box); } else if (btn) { btn.after(box); }
  if (btn) btn.disabled = true;
  await karpSubIframe(box, { slug, kind: 'tier' });
}

// Aðgengilegt öðrum eyju-skriftum + til prófunar (mælaborðið afhjúpar svipað).
if (typeof window !== 'undefined') window.karpAuth = { loadUser, karpLogin, karpRegister, karpLogout, karpForgot, karpReset, karpGet, karpPost, renderChip, mountChip, isAdmin, isPlus, locked, hasReport, hasSub, karpCheckout, plusGate, hasTier, lockedTier, tierLevel, tierGate, subGate, karpSubscribe, karpAskellSubscribe, karpSubscribeTier, limits, reportsRemaining, reportsQuotaKnown, nextTierUp, reportQuotaNoteHtml, paintReportQuota, followsCount, openReport, fasteignRemaining, fasteignResets, metaValuation, ktWatchList, ktWatchSet, teamList, teamSet, helpNote };
